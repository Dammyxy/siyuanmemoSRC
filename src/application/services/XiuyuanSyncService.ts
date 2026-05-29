﻿﻿﻿﻿﻿/**
 * XiuyuanSyncService - Xiuyuan 同步服务（优化版）
 * 
 * 管理 Riff 系统的 Xiuyuan 卡片同步：
 * - 增量同步：快速获取新卡片（日常使用）
 * - 全量同步：检测双向删除 + 清理黑名单（定期维护）
 * - 删除同步：双向删除同步（插件删除 → Riff 删除，Riff 删除 → 本地删除）
 * 
 * 优化特性：
 * - 事件驱动架构（使用 EventBus）
 * - 自动重试机制（最多 3 次，指数退避）
 * - 详细的进度回调（7 个阶段）
 * - 简化职责（定时器由外部管理）
 */

import { initializeAFactor } from '@/core/card-builder';
import type {
    XiuyuanSyncRiffBlock as RiffBlock,
    XiuyuanSyncSiyuanPort
} from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { EventBus, EventHandler } from '@/core/shared/domain/events/EventBus';
import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
import type {
    HybridSyncConfig,
    HybridSyncEvents,
    IncrementalSyncOptions,
    SyncResult,
    SyncType,
    ProgressCallback,
    SyncProgress,
    SyncPhase,
    SyncChangeSet,
    XiuyuanOwnership,
} from './XiuyuanSyncService.types';
import type {
    BackendHotspotCallerIdentity,
    BackendXiuyuanSyncExecuteRequest,
    BackendXiuyuanSyncExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { RiffBlacklistService } from './RiffBlacklistService';
import { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import { createLogger } from '@/utils/logger';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { ClozeDetector } from '@/utils/cloze-detector';
import { hasFormulaClozeMarkerTargets } from '@/utils/formula-cloze-parser';
import { ClozeCardGenerator } from '@/core/xiuyuan/domain/services/ClozeCardGenerator';
import { normalizeBlockId } from '@/core/siyuan/riff/normalizers';
import {
    QuickCardPostCreationPlanner,
    type PostCreationPlan,
} from '@/core/card/post-creation/QuickCardPostCreationPlanner';
import type { RiffSyncState } from '@/core/storage/UnifiedStorageManager';
import {
    inferXiuyuanOwnership,
} from '@/core/storage/stability/logicalKeys';
import { XiuyuanNativeRiffRemoveRuntime } from './XiuyuanNativeRiffRemoveRuntime';
import { XiuyuanRiffBlacklistRuntime } from './XiuyuanRiffBlacklistRuntime';
import { XiuyuanRiffInputRuntime } from './XiuyuanRiffInputRuntime';
import { XiuyuanSyncApplyRuntime } from './XiuyuanSyncApplyRuntime';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

// ==================== Xiuyuan 同步服务 ====================
const logger = createLogger('XiuyuanSyncService');
type SyncCardType = 'topic' | 'item' | 'concept' | 'descriptor';
type SyncCardTypeMarker = 'concept' | 'descriptor';

type ResolvedSyncCardType = {
    cardType: SyncCardType | undefined;
    cardTypeMarker: SyncCardTypeMarker | undefined;
};

type QuickDetectReason = 'cloze-latex-numbered';
type QuickRenderHintMeta = {
    forceQuickRender?: boolean;
    quickDetectReason?: QuickDetectReason;
};
type PreparedRiffBlocks = {
    blocks: RiffBlock[];
    skippedCount: number;
};
type LocalOwnedSkipSummary = {
    count: number;
    sampleBlockIds: string[];
};
type RiffInputStage = 'legacy-card-type-migration' | 'incremental' | 'full';

type RiffSyncMetaSource = 'riff-sync';
type RiffClozeRenderMode = 'inline-formula-cloze';
type RiffRenderProfile =
    | 'quick-default'
    | 'quick-inline-formula'
    | 'concept-definition'
    | 'descriptor'
    | 'concept'
    | 'list-progressive'
    | 'list-summary'
    | 'cdf-multiline';

type RiffSyncStateStore = {
    getRiffSyncState: () => RiffSyncState;
    updateRiffSyncState: (patch: Partial<RiffSyncState>) => Promise<{ ok: true } | { ok: false; error: Error }>;
};

const INCREMENTAL_SYNC_OVERLAP_MS = 5_000;
const LOCAL_OWNED_SKIP_SAMPLE_LIMIT = 5;

class XiuyuanSyncBridgeEvent<TPayload extends object> extends DomainEvent {
    constructor(
        private readonly eventName: string,
        public readonly payload: TPayload
    ) {
        super('xiuyuan-sync');
    }

    getEventName(): string {
        return this.eventName;
    }

    override toJSON(): Record<string, unknown> {
        return this.payload as Record<string, unknown>;
    }
}

/**
 * Xiuyuan 同步服务（优化版）
 * 
 * 负责管理 Riff 系统的 Xiuyuan 卡片同步：
 * - 增量同步：快速获取新卡片
 * - 全量同步：检测双向删除 + 清理黑名单
 * - 删除同步：双向删除同步
 * 
 * 优化特性：
 * - 事件驱动：通过 EventBus 发布领域事件
 * - 自动重试：网络错误自动重试（最多 3 次，指数退避）
 * - 进度回调：详细的同步进度信息
 * - 简化职责：定时器由插件主类管理
 */
export class XiuyuanSyncService {
    private config: HybridSyncConfig;
    private riffBlacklistService: RiffBlacklistService;
    private cardTypeDetectionService: CardTypeDetectionService;
    private readonly siyuanApi: XiuyuanSyncSiyuanPort;
    private eventBus: EventBus;
    private xiuyuanRepository: IXiuyuanRepository;
    private deletionTracker: IDeletionTracker;
    public lastFullSyncTime: number = 0;
    private readonly syncStateStore?: RiffSyncStateStore;
    private volatileSyncState: RiffSyncState = {};
    private legacyCardTypeMigrationDone = false;
    private syncMutex: Promise<void> = Promise.resolve();
    private readonly inFlightSyncs: Map<SyncType, Promise<SyncResult>> = new Map();
    private readonly syncEventHandlers: Map<string, Map<(data: unknown) => void, EventHandler<DomainEvent>>> = new Map();
    private readonly postCreationPlanner = new QuickCardPostCreationPlanner();
    private readonly riffInputRuntime: XiuyuanRiffInputRuntime;
    private readonly riffBlacklistRuntime: XiuyuanRiffBlacklistRuntime<RiffBlock>;
    private readonly nativeRiffRemoveRuntime: XiuyuanNativeRiffRemoveRuntime<Xiuyuan>;
    private readonly syncApplyRuntime: XiuyuanSyncApplyRuntime;
    private readonly srsBackendClient?: Pick<SrsBackendClient, 'executeXiuyuanSync'>;
    
    // 默认重试配置
    private readonly DEFAULT_RETRY_CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2
    };
    
    constructor(
        config: HybridSyncConfig,
        eventBus: EventBus,
        xiuyuanRepository: IXiuyuanRepository,
        riffBlacklistService: RiffBlacklistService,
        cardTypeDetectionService: CardTypeDetectionService,
        deletionTracker: IDeletionTracker,
        siyuanApi: XiuyuanSyncSiyuanPort,
        srsBackendClient?: Pick<SrsBackendClient, 'executeXiuyuanSync'>
    ) {
        this.config = {
            ...config,
            retry: config.retry || this.DEFAULT_RETRY_CONFIG
        };
        this.siyuanApi = siyuanApi;
        this.riffBlacklistService = riffBlacklistService;
        this.cardTypeDetectionService = cardTypeDetectionService;
        this.eventBus = eventBus;
        this.xiuyuanRepository = xiuyuanRepository;
        this.deletionTracker = deletionTracker;
        this.syncStateStore = this.resolveSyncStateStore(config.storage);
        this.riffInputRuntime = new XiuyuanRiffInputRuntime({
            warn: (message, payload) => logger.warn(message, payload),
        });
        this.riffBlacklistRuntime = new XiuyuanRiffBlacklistRuntime<RiffBlock>({
            filterBlacklist: (cards) => this.riffBlacklistService.filterBlacklist(cards),
            getBlacklist: () => this.riffBlacklistService.getBlacklist(),
        });
        this.nativeRiffRemoveRuntime = new XiuyuanNativeRiffRemoveRuntime<Xiuyuan>({
            findByBlockId: (blockId) => this.xiuyuanRepository.findByBlockId(blockId),
            isManagedRiffXiuyuan: (xiuyuan) => this.isManagedRiffXiuyuan(xiuyuan),
            warn: (message, payload) => logger.warn(message, payload),
        });
        this.syncApplyRuntime = new XiuyuanSyncApplyRuntime({
            applySyncChangeSet: (changeSet) => this.xiuyuanRepository.applySyncChangeSet(changeSet),
        });
        this.srsBackendClient = srsBackendClient;
    }

    private resolveSyncStateStore(storage: unknown): RiffSyncStateStore | undefined {
        if (!storage || typeof storage !== 'object') {
            return undefined;
        }

        const candidate = storage as Partial<RiffSyncStateStore>;
        return typeof candidate.getRiffSyncState === 'function'
            && typeof candidate.updateRiffSyncState === 'function'
            ? candidate as RiffSyncStateStore
            : undefined;
    }

    private getPersistentSyncState(): RiffSyncState {
        return this.syncStateStore?.getRiffSyncState() ?? {};
    }

    private getEffectiveSyncState(): RiffSyncState {
        return this.chooseMostRecentRiffSyncState(this.getPersistentSyncState(), this.volatileSyncState);
    }

    private getIncrementalSinceFromCheckpoint(): number | undefined {
        const state = this.getEffectiveSyncState();
        const lastSuccessfulAt = state.lastSuccessfulIncrementalAt;
        if (!lastSuccessfulAt || !Number.isFinite(lastSuccessfulAt) || lastSuccessfulAt <= 0) {
            return undefined;
        }

        return Math.max(0, lastSuccessfulAt - INCREMENTAL_SYNC_OVERLAP_MS);
    }

    private isFullSyncDue(now: number = Date.now()): boolean {
        if (!this.config.fullSync.enabled) {
            return false;
        }

        const state = this.getEffectiveSyncState();
        const lastFullAt = state.lastSuccessfulFullAt ?? this.lastFullSyncTime;
        return !lastFullAt || now - lastFullAt >= this.config.fullSync.interval;
    }

    private chooseMostRecentRiffSyncState(
        localState: RiffSyncState,
        remoteState: RiffSyncState
    ): RiffSyncState {
        return {
            lastSuccessfulIncrementalCursor:
                (localState.lastSuccessfulIncrementalAt ?? 0) >= (remoteState.lastSuccessfulIncrementalAt ?? 0)
                    ? localState.lastSuccessfulIncrementalCursor
                    : remoteState.lastSuccessfulIncrementalCursor,
            lastSuccessfulIncrementalAt: Math.max(
                localState.lastSuccessfulIncrementalAt ?? 0,
                remoteState.lastSuccessfulIncrementalAt ?? 0
            ) || undefined,
            lastSuccessfulFullAt: Math.max(
                localState.lastSuccessfulFullAt ?? 0,
                remoteState.lastSuccessfulFullAt ?? 0
            ) || undefined,
        };
    }

    private rememberVolatileSyncState(patch?: Partial<RiffSyncState>): void {
        if (!patch) {
            return;
        }

        const nextState = this.chooseMostRecentRiffSyncState(this.volatileSyncState, {
            lastSuccessfulIncrementalCursor:
                typeof patch.lastSuccessfulIncrementalCursor === 'string'
                    ? patch.lastSuccessfulIncrementalCursor
                    : undefined,
            lastSuccessfulIncrementalAt:
                typeof patch.lastSuccessfulIncrementalAt === 'number' && Number.isFinite(patch.lastSuccessfulIncrementalAt)
                    ? patch.lastSuccessfulIncrementalAt
                    : undefined,
            lastSuccessfulFullAt:
                typeof patch.lastSuccessfulFullAt === 'number' && Number.isFinite(patch.lastSuccessfulFullAt)
                    ? patch.lastSuccessfulFullAt
                    : undefined,
        });

        this.volatileSyncState = nextState;
    }

    private shouldSkipIdleIncrementalPersist(
        changeSet: SyncChangeSet,
        options?: IncrementalSyncOptions
    ): boolean {
        if (options?.persistIdleCheckpoint !== false) {
            return false;
        }

        return changeSet.creates.length === 0
            && changeSet.metadataUpdates.length === 0
            && changeSet.deletes.length === 0
            && changeSet.blacklistCleanup.length === 0
            && changeSet.postDetectTargets.length === 0
            && changeSet.stats.skippedCount === 0;
    }

    private createLocalOwnedSkipSummary(): LocalOwnedSkipSummary {
        return {
            count: 0,
            sampleBlockIds: [],
        };
    }

    private recordLocalOwnedSkip(summary: LocalOwnedSkipSummary, stage: RiffInputStage, blockId: string): void {
        summary.count++;
        const shouldRecordSample = summary.sampleBlockIds.length < LOCAL_OWNED_SKIP_SAMPLE_LIMIT;
        if (shouldRecordSample) {
            summary.sampleBlockIds.push(blockId);
            logger.debug('[XiuyuanSyncService] Skipping Riff card because local-owned Xiuyuan already exists', {
                stage,
                blockId,
            });
        }
    }

    private logLocalOwnedSkipSummary(stage: RiffInputStage, summary: LocalOwnedSkipSummary): void {
        if (summary.count === 0) {
            return;
        }
        logger.info('[XiuyuanSyncService] Skipped Riff cards because local-owned Xiuyuan already exists', {
            stage,
            skippedCount: summary.count,
            sampleBlockIds: summary.sampleBlockIds,
        });
    }
    
    /**
     * 发布同步事件（通过 EventBus）
     * 
     * 将旧的事件系统桥接到新的 EventBus
     */
    private publishEvent<K extends keyof HybridSyncEvents>(
        eventName: K,
        eventData: HybridSyncEvents[K]
    ): void {
        const domainEventName = this.toDomainEventName(eventName);
        const domainEvent = new XiuyuanSyncBridgeEvent(domainEventName, eventData);
        this.eventBus.publish(domainEvent).catch(error => {
            logger.error(`Failed to publish event ${domainEventName}:`, error);
        });
    }
    
    /**
     * 订阅同步事件
     */
    on<K extends keyof HybridSyncEvents>(
        eventName: K,
        handler: (data: HybridSyncEvents[K]) => void
    ): void {
        const domainEventName = this.toDomainEventName(eventName);
        const registry = this.getOrCreateEventRegistry(domainEventName);
        const handlerKey = handler as (data: unknown) => void;
        if (registry.has(handlerKey)) {
            return;
        }

        const wrappedHandler: EventHandler<XiuyuanSyncBridgeEvent<HybridSyncEvents[K]>> = event => {
            handler(event.payload);
        };

        registry.set(handlerKey, wrappedHandler as EventHandler<DomainEvent>);
        this.eventBus.subscribe<XiuyuanSyncBridgeEvent<HybridSyncEvents[K]>>(domainEventName, wrappedHandler);
    }
    
    /**
     * 取消订阅同步事件
     */
    off<K extends keyof HybridSyncEvents>(
        eventName: K,
        handler: (data: HybridSyncEvents[K]) => void
    ): void {
        const domainEventName = this.toDomainEventName(eventName);
        const registry = this.syncEventHandlers.get(domainEventName);
        if (!registry) {
            return;
        }

        const handlerKey = handler as (data: unknown) => void;
        const wrappedHandler = registry.get(handlerKey);
        if (!wrappedHandler) {
            return;
        }

        this.eventBus.unsubscribe(domainEventName, wrappedHandler);
        registry.delete(handlerKey);

        if (registry.size === 0) {
            this.syncEventHandlers.delete(domainEventName);
        }
    }

    private toDomainEventName<K extends keyof HybridSyncEvents>(eventName: K): string {
        return `xiuyuan.sync.${eventName}`;
    }

    private getOrCreateEventRegistry(eventName: string): Map<(data: unknown) => void, EventHandler<DomainEvent>> {
        const existingRegistry = this.syncEventHandlers.get(eventName);
        if (existingRegistry) {
            return existingRegistry;
        }

        const newRegistry = new Map<(data: unknown) => void, EventHandler<DomainEvent>>();
        this.syncEventHandlers.set(eventName, newRegistry);
        return newRegistry;
    }

    private isManagedRiffXiuyuan(xiuyuan: Xiuyuan): boolean {
        return this.getXiuyuanOwnership(xiuyuan) === 'riff-managed';
    }

    private getXiuyuanOwnership(xiuyuan: Xiuyuan): XiuyuanOwnership {
        return inferXiuyuanOwnership({
            templateID: xiuyuan.getTemplateID().getValue(),
            meta: xiuyuan.getMeta(),
        });
    }

    private syncXiuyuanOwnershipMeta(xiuyuan: Xiuyuan, ownership: XiuyuanOwnership): boolean {
        const currentMeta = xiuyuan.getMeta();
        if (currentMeta.ownership === ownership) {
            return false;
        }

        const updateResult = xiuyuan.updateMeta({ ownership });
        if (!updateResult.ok) {
            logger.warn('Failed to normalize Xiuyuan ownership during sync planning', {
                xiuyuanId: xiuyuan.getId().getValue(),
                ownership,
            });
            return false;
        }
        return true;
    }

    private createEmptyChangeSet(syncType: SyncType): SyncChangeSet {
        return {
            syncType,
            creates: [],
            metadataUpdates: [],
            deletes: [],
            blacklistCleanup: [],
            postDetectTargets: [],
            stats: {
                addedCount: 0,
                updatedCount: 0,
                deletedCount: 0,
                skippedCount: 0,
                blacklistCleanedCount: 0,
            },
        };
    }
    
    /**
     * 启动同步服务
     * 
     * 执行初始增量同步
     */
    async start(): Promise<void> {
        logger.info('Starting sync service...');

        await this.migrateLegacyCardTypeAttrsOnce();
        
        if (this.isFullSyncDue()) {
            logger.info('Full reconcile is due on plugin start; scheduling full sync instead of incremental');
            this.startStartupSyncInBackground('full', () => this.fullSync());
        } else if (this.config.incrementalSync.enabled && this.config.incrementalSync.triggers.includes('plugin-start')) {
            this.startStartupSyncInBackground('incremental', () => this.incrementalSync(undefined, {
                source: 'startup',
                persistIdleCheckpoint: false,
            }));
        }
        
        logger.info('Sync service started');
    }

    private startStartupSyncInBackground(type: SyncType, operation: () => Promise<SyncResult>): void {
        void operation().catch((error) => {
            logger.error(`Startup ${type} sync failed; service remains started without local fallback:`, error);
        });
    }

    private extractXiuyuanBindingId(attrs: Record<string, string> | null | undefined): string {
        const raw = attrs?.['custom-xiuyuan-id'] || attrs?.['custom-fsrs-xiuyuan-id'];
        if (typeof raw !== 'string') {
            return '';
        }
        return raw.trim();
    }

    private async findExistingXiuyuanForBlock(blockId: string): Promise<Xiuyuan | null> {
        const normalizedBlockIdResult = BlockId.create(blockId);
        if (!normalizedBlockIdResult.ok) {
            const errorMsg = normalizedBlockIdResult.ok === false
                ? normalizedBlockIdResult.error.message
                : 'Invalid BlockId';
            throw new Error(`Failed to create BlockId for ${blockId}: ${errorMsg}`);
        }

        const existingByBlockResult = await this.xiuyuanRepository.findByBlockId(normalizedBlockIdResult.value);
        if (!existingByBlockResult.ok) {
            const errorMsg = 'error' in existingByBlockResult ? existingByBlockResult.error : 'Unknown error';
            throw new Error(`Failed to query Xiuyuan by block ${blockId}: ${errorMsg}`);
        }

        const existingByBlock = existingByBlockResult.value;
        const localOwnedExistingXiuyuan = existingByBlock.find((candidate) => !this.isManagedRiffXiuyuan(candidate));
        if (localOwnedExistingXiuyuan) {
            return localOwnedExistingXiuyuan;
        }
        const managedExistingXiuyuan = existingByBlock.find((candidate) => this.isManagedRiffXiuyuan(candidate));
        if (managedExistingXiuyuan) {
            return managedExistingXiuyuan;
        }

        const deterministicXiuyuanIdResult = XiuyuanId.create(`xy_${blockId}`);
        if (deterministicXiuyuanIdResult.ok) {
            const existingByDeterministicIdResult = await this.xiuyuanRepository.findById(deterministicXiuyuanIdResult.value);
            if (!existingByDeterministicIdResult.ok) {
                const errorMsg = 'error' in existingByDeterministicIdResult ? existingByDeterministicIdResult.error : 'Unknown error';
                throw new Error(`Failed to query deterministic Xiuyuan for block ${blockId}: ${errorMsg}`);
            }

            if (existingByDeterministicIdResult.value) {
                return existingByDeterministicIdResult.value;
            }
        }

        let attrs: Record<string, string> | null | undefined;
        try {
            attrs = await this.siyuanApi.getBlockAttrs(blockId);
        } catch (error) {
            logger.debug(`Failed to load legacy Xiuyuan binding attrs for block ${blockId}`, error);
            throw new Error(`XIUYUAN_BINDING_ATTRS_UNAVAILABLE: failed to load legacy Xiuyuan binding attrs for block ${blockId}: ${error instanceof Error ? error.message : String(error)}`);
        }

        const bindingId = this.extractXiuyuanBindingId(attrs);
        if (!bindingId) {
            return null;
        }

        const boundXiuyuanIdResult = XiuyuanId.create(bindingId);
        if (!boundXiuyuanIdResult.ok) {
            logger.warn(`Ignoring legacy invalid Xiuyuan binding on block ${blockId}: ${bindingId}`);
            return null;
        }

        const existingByBindingResult = await this.xiuyuanRepository.findById(boundXiuyuanIdResult.value);
        if (!existingByBindingResult.ok) {
            const errorMsg = 'error' in existingByBindingResult ? existingByBindingResult.error : 'Unknown error';
            throw new Error(`Failed to resolve legacy Xiuyuan binding for block ${blockId}: ${errorMsg}`);
        }

        if (existingByBindingResult.value) {
            logger.info(`Resolved existing Xiuyuan from legacy binding attr for block ${blockId}: ${bindingId}`);
            return existingByBindingResult.value;
        }

        logger.warn(`Ignoring stale legacy Xiuyuan binding on block ${blockId}: ${bindingId}`);
        return null;
    }
    
    /**
     * 停止同步服务
     */
    stop(): void {
        logger.info('Stopping sync service...');
        logger.info('Sync service stopped');
    }

    async runWithGlobalSyncLock<T>(operation: () => Promise<T>): Promise<T> {
        return this.withGlobalSyncLock(operation);
    }

    /**
     * 更新同步配置
     *
     * 符合 DDD 架构原则:
     * - 通过公开方法修改内部状态
     * - 保持封装性
     * - 提供清晰的配置更新接口
     *
     * @param config - 新的同步配置
     */
    updateConfig(config: Partial<HybridSyncConfig>): void {
        this.config = {
            ...this.config,
            ...config,
            retry: config.retry || this.config.retry
        };
        logger.info('Config updated:', this.config);
    }

    private isSupportedCardType(value: unknown): value is SyncCardType {
        return value === 'topic'
            || value === 'item'
            || value === 'concept'
            || value === 'descriptor';
    }

    private resolveCardTypeFromIAL(ial?: Record<string, string>): ResolvedSyncCardType {
        const rawCardType = ial?.[this.siyuanApi.ATTR_CARD_TYPE];

        if (!this.isSupportedCardType(rawCardType)) {
            return {
                cardType: undefined,
                cardTypeMarker: undefined,
            };
        }

        return {
            cardType: rawCardType,
            cardTypeMarker: rawCardType === 'concept' || rawCardType === 'descriptor'
                ? rawCardType
                : undefined,
        };
    }

    private async resolveCardTypeForRiffBlock(riffBlock: RiffBlock): Promise<ResolvedSyncCardType> {
        const resolvedType = this.resolveCardTypeFromIAL(riffBlock.ial);
        if (resolvedType.cardType) {
            return resolvedType;
        }

        // 现行块属性类型缺失时回退自动检测（只会返回 topic/item）
        const detectedCardType = await this.cardTypeDetectionService.detectCardType(riffBlock.id);
        return {
            cardType: detectedCardType,
            cardTypeMarker: undefined,
        };
    }

    private planPostCreation(
        riffBlock: RiffBlock,
        resolvedCardType: SyncCardType | undefined
    ): PostCreationPlan {
        return this.postCreationPlanner.plan({
            blockId: riffBlock.id,
            content: riffBlock.content,
            source: 'native-riff-sync',
            resolvedCardType,
        });
    }

    private resolveRiffClozeRenderMode(plan: PostCreationPlan): RiffClozeRenderMode | undefined {
        if (plan.renderMode === 'inline-formula-cloze') {
            return 'inline-formula-cloze';
        }
        return undefined;
    }

    private async migrateLegacyCardTypeAttrsOnce(): Promise<void> {
        if (this.legacyCardTypeMigrationDone) {
            return;
        }
        this.legacyCardTypeMigrationDone = true;

        try {
            const rawRiffCards = await this.siyuanApi.getRiffCards(this.config.deckId, {
                dueOnly: false,
                includeNew: true,
            });
            const preparedRiffCards = this.prepareRiffBlocks('legacy-card-type-migration', rawRiffCards);

            let migrated = 0;
            let skipped = preparedRiffCards.skippedCount;

            for (const riffCard of preparedRiffCards.blocks) {
                const attrs = riffCard.ial;
                const currentCardType = attrs?.[this.siyuanApi.ATTR_CARD_TYPE];
                const legacyCardType = attrs?.['custom-card-type'];

                if (this.isSupportedCardType(currentCardType)) {
                    skipped++;
                    continue;
                }
                if (!this.isSupportedCardType(legacyCardType)) {
                    continue;
                }

                try {
                    await this.siyuanApi.setBlockAttrs(riffCard.id, {
                        [this.siyuanApi.ATTR_CARD_TYPE]: legacyCardType,
                        'custom-card-type': '',
                    });
                    migrated++;
                } catch (error) {
                    logger.warn('[XiuyuanSyncService] Failed to migrate legacy card type attr:', {
                        blockId: riffCard.id,
                        legacyCardType,
                        error,
                    });
                }
            }

            if (migrated > 0 || skipped > 0) {
                logger.info('[XiuyuanSyncService] Legacy card type migration completed', {
                    migrated,
                    skipped,
                });
            }
        } catch (error) {
            logger.warn('[XiuyuanSyncService] Failed to scan legacy card type attrs on startup:', error);
        }
    }

    private prepareRiffBlocks(stage: RiffInputStage, riffBlocks: RiffBlock[]): PreparedRiffBlocks {
        return this.riffInputRuntime.prepareRiffBlocks(stage, riffBlocks);
    }

    private normalizeRiffQuestion(content: string | undefined): string {
        return this.riffInputRuntime.normalizeRiffQuestion(content);
    }

    private resolveRiffRenderProfile(plan: PostCreationPlan): RiffRenderProfile | undefined {
        if (plan.templateId === 'builtin-riff-sync') {
            return undefined;
        }

        if (plan.renderMode === 'inline-formula-cloze') {
            return 'quick-inline-formula';
        }

        if (plan.templateId === 'builtin-multi-cloze') {
            return undefined;
        }

        if (plan.templateId.startsWith('builtin-concept-definition')) {
            return 'concept-definition';
        }

        if (plan.templateId.startsWith('builtin-concept-descriptor')) {
            return 'descriptor';
        }

        if (plan.templateId === 'builtin-concept-simple') {
            return 'concept';
        }

        if (plan.templateId === 'builtin-list-concept-multiline' || plan.templateId === 'builtin-list-descriptor-multiline') {
            return 'cdf-multiline';
        }

        if (plan.templateId === 'builtin-list-item') {
            return 'list-progressive';
        }

        return 'quick-default';
    }

    private resolveRiffCreationMode(plan: PostCreationPlan): 'single' | 'multi-face' {
        return plan.mode === 'multi-cloze' ? 'multi-face' : 'single';
    }

    private syncPostCreationMeta(
        xiuyuan: Xiuyuan,
        riffBlockId: string,
        plan: PostCreationPlan
    ): boolean {
        const currentMeta = xiuyuan.getMeta();
        const expectedSource: RiffSyncMetaSource = 'riff-sync';
        const expectedRenderMode = this.resolveRiffClozeRenderMode(plan);
        const expectedRenderProfile = this.resolveRiffRenderProfile(plan);
        const expectedCreationRuleId = plan.hints?.ruleId;
        const expectedCreationMode = this.resolveRiffCreationMode(plan);
        const expectedRiffPrimaryCardId = riffBlockId;
        const currentSource = typeof currentMeta.source === 'string' ? currentMeta.source : undefined;
        const currentRenderMode = typeof currentMeta.clozeRenderMode === 'string'
            ? currentMeta.clozeRenderMode
            : undefined;
        const currentRenderProfile = typeof currentMeta.renderProfile === 'string'
            ? currentMeta.renderProfile
            : undefined;
        const currentCreationRuleId = typeof currentMeta.creationRuleId === 'string'
            ? currentMeta.creationRuleId
            : undefined;
        const currentCreationMode = typeof currentMeta.creationMode === 'string'
            ? currentMeta.creationMode
            : undefined;
        const currentRiffPrimaryCardId = typeof currentMeta.riffPrimaryCardId === 'string'
            ? currentMeta.riffPrimaryCardId
            : undefined;

        const metaPatch: Record<string, unknown> = {};
        let changed = false;

        if (currentSource !== expectedSource) {
            metaPatch.source = expectedSource;
            changed = true;
        }

        if (currentRenderMode !== expectedRenderMode) {
            metaPatch.clozeRenderMode = expectedRenderMode;
            changed = true;
        }

        if (currentRenderProfile !== expectedRenderProfile) {
            metaPatch.renderProfile = expectedRenderProfile;
            changed = true;
        }

        if (currentCreationRuleId !== expectedCreationRuleId) {
            metaPatch.creationRuleId = expectedCreationRuleId;
            changed = true;
        }

        if (currentCreationMode !== expectedCreationMode) {
            metaPatch.creationMode = expectedCreationMode;
            changed = true;
        }

        if (currentRiffPrimaryCardId !== expectedRiffPrimaryCardId) {
            metaPatch.riffPrimaryCardId = expectedRiffPrimaryCardId;
            changed = true;
        }

        if (!changed) {
            return false;
        }

        const updateResult = xiuyuan.updateMeta(metaPatch);
        if (!updateResult.ok) {
            logger.warn('Failed to sync post-creation meta for Xiuyuan:', {
                xiuyuanId: xiuyuan.getId().getValue(),
                plan,
                metaPatch,
            });
            return false;
        }

        return true;
    }

    private hasNumberedLatexCloze(content: string): boolean {
        return hasFormulaClozeMarkerTargets(content);
    }

    private buildQuickRenderHintMeta(
        content: string,
        cardType: SyncCardType | undefined,
        plan: PostCreationPlan
    ): QuickRenderHintMeta {
        const renderProfile = this.resolveRiffRenderProfile(plan);
        const canForceQuickRender = renderProfile === 'quick-default' || renderProfile === 'quick-inline-formula';

        if (canForceQuickRender && cardType === 'item' && this.hasNumberedLatexCloze(content)) {
            return {
                forceQuickRender: true,
                quickDetectReason: 'cloze-latex-numbered',
            };
        }

        return {};
    }

    private syncQuickRenderHintMeta(
        xiuyuan: Xiuyuan,
        riffBlock: RiffBlock,
        cardType: SyncCardType | undefined,
        plan: PostCreationPlan
    ): boolean {
        const currentMeta = xiuyuan.getMeta();
        const progressiveKind = currentMeta.progressive && typeof currentMeta.progressive === 'object'
            ? (currentMeta.progressive as Record<string, unknown>).kind
            : undefined;
        const hintMeta = progressiveKind === 'derived-item'
            ? {}
            : this.buildQuickRenderHintMeta(riffBlock.content, cardType, plan);
        const shouldForceQuickRender = hintMeta.forceQuickRender === true;
        const expectedReason = hintMeta.quickDetectReason;
        const currentForceQuickRender = currentMeta.forceQuickRender === true;
        const currentQuickDetectReason = typeof currentMeta.quickDetectReason === 'string'
            ? currentMeta.quickDetectReason
            : undefined;

        const metaPatch: Record<string, unknown> = {};
        let changed = false;

        if (shouldForceQuickRender) {
            if (!currentForceQuickRender) {
                metaPatch.forceQuickRender = true;
                changed = true;
            }
            if (currentQuickDetectReason !== expectedReason) {
                metaPatch.quickDetectReason = expectedReason;
                changed = true;
            }
        } else {
            const hadForceQuickRender = Object.prototype.hasOwnProperty.call(currentMeta, 'forceQuickRender');
            const hadQuickDetectReason = Object.prototype.hasOwnProperty.call(currentMeta, 'quickDetectReason');
            if (hadForceQuickRender || currentForceQuickRender) {
                metaPatch.forceQuickRender = undefined;
                changed = true;
            }
            if (hadQuickDetectReason || currentQuickDetectReason !== undefined) {
                metaPatch.quickDetectReason = undefined;
                changed = true;
            }
        }

        if (!changed) {
            return false;
        }

        const updateResult = xiuyuan.updateMeta(metaPatch);
        if (!updateResult.ok) {
            logger.warn('Failed to update quick render hint meta for Xiuyuan:', {
                xiuyuanId: xiuyuan.getId().getValue(),
                blockId: riffBlock.id,
                cardType,
                hintMeta,
            });
            return false;
        }

        logger.info('Updated quick render hint meta for Xiuyuan', {
            xiuyuanId: xiuyuan.getId().getValue(),
            blockId: riffBlock.id,
            cardType,
            forceQuickRender: shouldForceQuickRender,
            quickDetectReason: expectedReason,
        });
        return true;
    }

    private async planManagedXiuyuanMetadataUpdate(existingXiuyuan: Xiuyuan, riffCard: RiffBlock): Promise<boolean> {
        let needsUpdate = this.syncXiuyuanOwnershipMeta(existingXiuyuan, 'riff-managed');

        const resolvedType = await this.resolveCardTypeForRiffBlock(riffCard);
        const newCardTypeMarker = resolvedType.cardTypeMarker;
        const newCardType = resolvedType.cardType;
        const postCreationPlan = this.planPostCreation(riffCard, newCardType);

        if (newCardTypeMarker) {
            const currentCardTypeMarker = existingXiuyuan.getMeta().cardTypeMarker;
            if (currentCardTypeMarker !== newCardTypeMarker) {
                const updateResult = existingXiuyuan.updateCardTypeMarker(newCardTypeMarker);
                if (updateResult.ok) {
                    logger.info(`Updated cardTypeMarker: ${currentCardTypeMarker} -> ${newCardTypeMarker}`);
                    needsUpdate = true;
                }
            }
        }

        if (newCardType) {
            const currentCardType = existingXiuyuan.getMeta().cardType;
            if (currentCardType !== newCardType) {
                const updateResult = existingXiuyuan.updateCardType(newCardType);
                if (updateResult.ok) {
                    logger.info(`Updated cardType: ${currentCardType} -> ${newCardType}`);
                    needsUpdate = true;
                }
            }
        }

        if (this.syncQuickRenderHintMeta(existingXiuyuan, riffCard, newCardType, postCreationPlan)) {
            needsUpdate = true;
        }

        if (this.syncPostCreationMeta(existingXiuyuan, riffCard.id, postCreationPlan)) {
            needsUpdate = true;
        }

        return needsUpdate;
    }

    private beginSync(type: SyncType): number {
        const startTime = Date.now();
        logger.info(`Starting ${type} sync...`);
        this.publishEvent('syncStart', {
            type,
            timestamp: startTime
        });
        return startTime;
    }

    private completeSync(
        type: SyncType,
        startTime: number,
        result: SyncResult,
        summary: string
    ): SyncResult {
        this.publishEvent('syncSuccess', {
            type,
            result,
            timestamp: Date.now(),
            duration: Date.now() - startTime
        });
        logger.info(summary);
        return result;
    }

    private failSync(type: SyncType, error: unknown): never {
        logger.error(`${type} sync failed:`, error);
        throw error;
    }

    private async withGlobalSyncLock<T>(operation: () => Promise<T>): Promise<T> {
        const previousLock = this.syncMutex;
        let releaseLock: (() => void) | null = null;
        this.syncMutex = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        await previousLock;
        try {
            return await operation();
        } finally {
            if (releaseLock) {
                releaseLock();
            }
        }
    }

    private runSyncExclusive(type: SyncType, operation: () => Promise<SyncResult>): Promise<SyncResult> {
        const existing = this.inFlightSyncs.get(type);
        if (existing) {
            logger.info(`${type} sync already in flight, joining existing execution`);
            return existing;
        }

        const promise = this.withGlobalSyncLock(operation).finally(() => {
            this.inFlightSyncs.delete(type);
        });

        this.inFlightSyncs.set(type, promise);
        return promise;
    }

    private async buildIncrementalChangeSet(
        onProgress: ProgressCallback | undefined,
        startTime: number
    ): Promise<SyncChangeSet> {
        const changeSet = this.createEmptyChangeSet('incremental');

        this.reportProgress(onProgress, 'incremental', 'fetching', 1, 7, '正在获取 Riff 新卡片...');
        const since = this.getIncrementalSinceFromCheckpoint();
        const riffCards = await this.siyuanApi.getRiffNewCards(this.config.deckId, since);
        logger.info(`Fetched ${riffCards.length} new Riff cards`, { since });

        const preparedRiffCards = this.prepareRiffBlocks('incremental', riffCards);
        changeSet.stats.skippedCount += preparedRiffCards.skippedCount;

        this.reportProgress(onProgress, 'incremental', 'filtering', 2, 7, '正在过滤黑名单...');
        const blacklistResult = await this.riffBlacklistRuntime.filterCandidates({
            enabled: this.config.incrementalSync.useBlacklist,
            cards: preparedRiffCards.blocks,
        });
        const filteredCards = blacklistResult.cards;
        changeSet.stats.skippedCount += blacklistResult.skippedCount;

        this.reportProgress(onProgress, 'incremental', 'adding', 3, 7, '正在规划新增/更新...');
        const seenBlockIds = new Set<string>();
        const localOwnedSkips = this.createLocalOwnedSkipSummary();
        for (const riffCard of filteredCards) {
            if (seenBlockIds.has(riffCard.id)) {
                changeSet.stats.skippedCount++;
                continue;
            }
            seenBlockIds.add(riffCard.id);

            if (this.deletionTracker.isRecentlyDeleted(riffCard.id)) {
                logger.info(`Skipping recently deleted card: ${riffCard.id}`);
                changeSet.stats.skippedCount++;
                continue;
            }

            const existingXiuyuan = await this.findExistingXiuyuanForBlock(riffCard.id);

            if (existingXiuyuan && !this.isManagedRiffXiuyuan(existingXiuyuan)) {
                this.recordLocalOwnedSkip(localOwnedSkips, 'incremental', riffCard.id);
                changeSet.stats.skippedCount++;
                continue;
            }

            if (existingXiuyuan) {
                const needsUpdate = await this.planManagedXiuyuanMetadataUpdate(existingXiuyuan, riffCard);
                if (needsUpdate) {
                    changeSet.metadataUpdates.push({
                        blockId: riffCard.id,
                        xiuyuanEntity: existingXiuyuan,
                    });
                    changeSet.stats.updatedCount++;
                } else {
                    changeSet.stats.skippedCount++;
                }
                continue;
            }

            const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
            this.syncXiuyuanOwnershipMeta(xiuyuanEntity, 'riff-managed');
            changeSet.creates.push({
                blockId: riffCard.id,
                xiuyuanEntity,
            });
            changeSet.postDetectTargets.push(riffCard);
            changeSet.stats.addedCount++;
        }
        this.logLocalOwnedSkipSummary('incremental', localOwnedSkips);

        logger.info('Incremental reconcile only handles native riff upsert/metadata sync; native riff removals use direct delete routing and full sync remains the deletion fallback');
        changeSet.checkpointAdvance = {
            lastSuccessfulIncrementalAt: startTime,
            lastSuccessfulIncrementalCursor: `timestamp:${startTime}`,
        };

        return changeSet;
    }

    private async buildFullChangeSet(
        onProgress: ProgressCallback | undefined,
        startTime: number
    ): Promise<SyncChangeSet> {
        const changeSet = this.createEmptyChangeSet('full');

        this.reportProgress(onProgress, 'full', 'fetching', 1, 7, '正在获取所有 Riff 卡片...');
        const riffCards = await this.siyuanApi.getRiffCards(this.config.deckId, {
            dueOnly: false,
            includeNew: true,
        });
        logger.info(`Fetched ${riffCards.length} Riff cards for full sync`);

        const preparedRiffCards = this.prepareRiffBlocks('full', riffCards);
        changeSet.stats.skippedCount += preparedRiffCards.skippedCount;
        const hadMalformedRiffInput = preparedRiffCards.skippedCount > 0;

        this.reportProgress(onProgress, 'full', 'filtering', 2, 7, '正在比对本地修远...');
        const riffBlockIds = new Set(preparedRiffCards.blocks.map(card => card.id));
        const allXiuyuansResult = await this.xiuyuanRepository.findAll();
        if (!allXiuyuansResult.ok) {
            throw allXiuyuansResult.error;
        }

        this.reportProgress(onProgress, 'full', 'adding', 3, 7, '正在规划新增/更新...');
        const seenBlockIds = new Set<string>();
        const localOwnedSkips = this.createLocalOwnedSkipSummary();
        for (const riffCard of preparedRiffCards.blocks) {
            if (seenBlockIds.has(riffCard.id)) {
                changeSet.stats.skippedCount++;
                continue;
            }
            seenBlockIds.add(riffCard.id);

            if (this.deletionTracker.isRecentlyDeleted(riffCard.id)) {
                logger.info(`Skipping recently deleted card during full sync: ${riffCard.id}`);
                changeSet.stats.skippedCount++;
                continue;
            }

            const existingXiuyuan = await this.findExistingXiuyuanForBlock(riffCard.id);

            if (existingXiuyuan && !this.isManagedRiffXiuyuan(existingXiuyuan)) {
                this.recordLocalOwnedSkip(localOwnedSkips, 'full', riffCard.id);
                changeSet.stats.skippedCount++;
                continue;
            }

            if (existingXiuyuan) {
                const needsUpdate = await this.planManagedXiuyuanMetadataUpdate(existingXiuyuan, riffCard);
                if (needsUpdate) {
                    changeSet.metadataUpdates.push({
                        blockId: riffCard.id,
                        xiuyuanEntity: existingXiuyuan,
                    });
                    changeSet.stats.updatedCount++;
                } else {
                    changeSet.stats.skippedCount++;
                }
                continue;
            }

            const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
            this.syncXiuyuanOwnershipMeta(xiuyuanEntity, 'riff-managed');
            changeSet.creates.push({
                blockId: riffCard.id,
                xiuyuanEntity,
            });
            changeSet.postDetectTargets.push(riffCard);
            changeSet.stats.addedCount++;
        }
        this.logLocalOwnedSkipSummary('full', localOwnedSkips);

        this.reportProgress(onProgress, 'full', 'deleting', 4, 7, '正在规划删除同步...');
        if (hadMalformedRiffInput) {
            logger.warn('[XiuyuanSyncService] Full sync saw malformed Riff input; destructive delete and blacklist cleanup are disabled for this round');
        } else {
            for (const xiuyuan of allXiuyuansResult.value) {
                if (!this.isManagedRiffXiuyuan(xiuyuan)) {
                    continue;
                }

                const blockId = xiuyuan.getRepresentativeBlockId();
                if (!blockId || riffBlockIds.has(blockId)) {
                    continue;
                }

                changeSet.deletes.push({
                    blockId,
                    xiuyuanEntity: xiuyuan,
                });
            }
            changeSet.stats.deletedCount = changeSet.deletes.length;

            if (this.config.fullSync.cleanupBlacklist) {
                this.reportProgress(onProgress, 'full', 'cleanup', 5, 7, '正在规划黑名单清理...');
                changeSet.blacklistCleanup = await this.riffBlacklistRuntime.planCleanup(riffBlockIds);
                changeSet.stats.blacklistCleanedCount = changeSet.blacklistCleanup.length;
            }
        }

        changeSet.checkpointAdvance = {
            lastSuccessfulFullAt: startTime,
        };

        return changeSet;
    }

    private async buildNativeRiffRemoveChangeSet(blockIds: string[]): Promise<SyncChangeSet> {
        const changeSet = this.createEmptyChangeSet('delete');
        const removalPlan = await this.nativeRiffRemoveRuntime.planRemovals(blockIds);
        changeSet.deletes.push(...removalPlan.deletes);
        changeSet.stats.skippedCount += removalPlan.skippedCount;
        changeSet.stats.deletedCount = changeSet.deletes.length;
        return changeSet;
    }

    private async applyPlannedSync(
        changeSet: SyncChangeSet,
        onProgress: ProgressCallback | undefined
    ): Promise<SyncResult> {
        this.reportProgress(onProgress, changeSet.syncType, 'saving', 6, 7, '正在提交同步变更...');

        const appliedSummary = await this.syncApplyRuntime.apply({
            creates: changeSet.creates,
            metadataUpdates: changeSet.metadataUpdates,
            deletes: changeSet.deletes,
            blacklistCleanup: changeSet.blacklistCleanup,
            checkpointAdvance: changeSet.checkpointAdvance,
            stats: changeSet.stats,
        });

        let detectedCount = 0;
        if (this.config.incrementalSync.autoDetectCardType && changeSet.postDetectTargets.length > 0) {
            this.reportProgress(onProgress, changeSet.syncType, 'detecting', 7, 7, '正在检测卡片类型...');
            try {
                detectedCount = await this.detectCardTypesForNewCards(changeSet.postDetectTargets);
            } catch (error) {
                logger.warn('[XiuyuanSyncService] Post-commit card type detection failed; committed sync result is kept', error);
            }
        }

        if (changeSet.syncType === 'full') {
            this.lastFullSyncTime = changeSet.checkpointAdvance?.lastSuccessfulFullAt ?? Date.now();
        }

        this.rememberVolatileSyncState(changeSet.checkpointAdvance);

        return {
            success: true,
            addedCount: appliedSummary.createdCount,
            updatedCount: appliedSummary.updatedCount,
            deletedCount: appliedSummary.deletedCount,
            skippedCount: changeSet.stats.skippedCount,
            blacklistCleanedCount: changeSet.syncType === 'full'
                ? appliedSummary.blacklistCleanedCount
                : undefined,
            detectedCount,
        };
    }

    
    /**
     * 增量同步（公共方法）
     * 
     * 从 Riff 获取新卡片，使用黑名单过滤，只添加本地不存在的卡片
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async incrementalSync(onProgress?: ProgressCallback, options?: IncrementalSyncOptions): Promise<SyncResult> {
        if (this.srsBackendClient) {
            return this.runBackendSync('incremental', onProgress, options);
        }
        return this.runSyncExclusive('incremental', async () => {
            return this.withRetry('incremental', async () => {
                const startTime = this.beginSync('incremental');

                try {
                    const changeSet = await this.buildIncrementalChangeSet(onProgress, startTime);
                    if (this.shouldSkipIdleIncrementalPersist(changeSet, options)) {
                        this.rememberVolatileSyncState(changeSet.checkpointAdvance);
                        const result: SyncResult = {
                            success: true,
                            addedCount: 0,
                            updatedCount: 0,
                            deletedCount: 0,
                            skippedCount: changeSet.stats.skippedCount,
                            detectedCount: 0,
                        };

                        return this.completeSync(
                            'incremental',
                            startTime,
                            result,
                            `Incremental sync completed without persistence (${options?.source || 'unspecified'}): added 0, updated 0, deleted 0, skipped ${result.skippedCount}, detected 0`
                        );
                    }

                    const result = await this.applyPlannedSync(changeSet, onProgress);

                    return this.completeSync(
                        'incremental',
                        startTime,
                        result,
                        `Incremental sync completed: added ${result.addedCount}, updated ${result.updatedCount || 0}, deleted ${result.deletedCount}, skipped ${result.skippedCount}, detected ${result.detectedCount || 0}`
                    );
                } catch (error) {
                    return this.failSync('incremental', error);
                }
            });
        });
    }

    async handleNativeRiffUpsert(): Promise<SyncResult> {
        logger.info('[XiuyuanSyncService] Handling native riff add/update via incremental sync route');
        return this.incrementalSync(undefined, {
            source: 'native-riff-transaction',
            persistIdleCheckpoint: false,
        });
    }

    async handleNativeRiffRemove(blockIds: string[]): Promise<SyncResult> {
        return this.runSyncExclusive('delete', async () => {
            const startTime = this.beginSync('delete');

            try {
                const changeSet = await this.buildNativeRiffRemoveChangeSet(blockIds);
                if (changeSet.deletes.length === 0) {
                    const result: SyncResult = {
                        success: true,
                        addedCount: 0,
                        updatedCount: 0,
                        deletedCount: 0,
                        skippedCount: changeSet.stats.skippedCount,
                    };

                    return this.completeSync(
                        'delete',
                        startTime,
                        result,
                        `Native riff remove completed without local deletions: deleted 0, skipped ${result.skippedCount}`
                    );
                }

                const result = await this.applyPlannedSync(changeSet, undefined);
                return this.completeSync(
                    'delete',
                    startTime,
                    result,
                    `Native riff remove completed: deleted ${result.deletedCount}, skipped ${result.skippedCount}`
                );
            } catch (error) {
                return this.failSync('delete', error);
            }
        });
    }
    
    /**
     * 全量同步
     * 
     * 对比 Riff 和本地的所有卡片，执行新增/删除，清理黑名单
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async fullSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        if (this.srsBackendClient) {
            return this.runBackendSync('full', onProgress);
        }
        return this.runSyncExclusive('full', async () => {
            return this.withRetry('full', async () => {
                const startTime = this.beginSync('full');

                try {
                    const changeSet = await this.buildFullChangeSet(onProgress, startTime);
                    const result = await this.applyPlannedSync(changeSet, onProgress);

                    return this.completeSync(
                        'full',
                        startTime,
                        result,
                        `Full sync completed: added ${result.addedCount}, updated ${result.updatedCount || 0}, deleted ${result.deletedCount}, skipped ${result.skippedCount}, blacklistCleaned ${result.blacklistCleanedCount || 0}, detected ${result.detectedCount || 0}`
                    );
                } catch (error) {
                    return this.failSync('full', error);
                }
            });
        });
    }

    private async runBackendSync(
        type: 'incremental' | 'full',
        onProgress: ProgressCallback | undefined,
        options?: IncrementalSyncOptions,
    ): Promise<SyncResult> {
        return this.runSyncExclusive(type, async () => {
            return this.withRetry(type, async () => {
                const startTime = this.beginSync(type);
                try {
                    this.reportProgress(onProgress, type, 'fetching', 1, 4, '正在提交后端同步命令...');
                    const request = this.buildBackendSyncRequest(type, startTime, options);
                    const result = await this.srsBackendClient!.executeXiuyuanSync(request);
                    const mapped = this.mapBackendSyncResult(type, result, startTime, onProgress, options);
                    return this.completeSync(
                        type,
                        startTime,
                        mapped,
                        type === 'full'
                            ? `Full sync completed via backend command: added ${mapped.addedCount}, updated ${mapped.updatedCount || 0}, deleted ${mapped.deletedCount}, skipped ${mapped.skippedCount}, blacklistCleaned ${mapped.blacklistCleanedCount || 0}, detected ${mapped.detectedCount || 0}`
                            : `Incremental sync completed via backend command: added ${mapped.addedCount}, updated ${mapped.updatedCount || 0}, deleted ${mapped.deletedCount}, skipped ${mapped.skippedCount}, detected ${mapped.detectedCount || 0}`,
                    );
                } catch (error) {
                    return this.failSync(type, error);
                }
            });
        });
    }

    private buildBackendSyncRequest(
        type: 'incremental' | 'full',
        startTime: number,
        options?: IncrementalSyncOptions,
    ): BackendXiuyuanSyncExecuteRequest {
        const caller: BackendHotspotCallerIdentity = {
            instanceId: 'application-context',
            runtimeRole: 'worker',
            surface: 'background',
        };
        return {
            requestId: `xiuyuan-sync:${type}:${startTime}`,
            commandId: `xiuyuan-sync:${type}:${startTime}`,
            idempotencyKey: `xiuyuan-sync:${type}:${options?.source || 'manual'}:${startTime}`,
            mode: type === 'full' ? 'full' : 'incremental',
            dryRun: false,
            deckId: this.config.deckId,
            requestedAt: startTime,
            since: type === 'incremental' ? this.getIncrementalSinceFromCheckpoint() ?? null : null,
            scope: type === 'full'
                ? {
                    includeNew: true,
                    dueOnly: false,
                    notebook: null,
                    rootId: null,
                    blockIds: null,
                }
                : {
                    includeNew: true,
                    dueOnly: false,
                    notebook: null,
                    rootId: null,
                    blockIds: null,
                },
            caller,
            persistIdleCheckpoint: options?.persistIdleCheckpoint,
        };
    }

    private mapBackendSyncResult(
        type: 'incremental' | 'full',
        result: BackendXiuyuanSyncExecuteResult,
        startTime: number,
        onProgress: ProgressCallback | undefined,
        options?: IncrementalSyncOptions,
    ): SyncResult {
        if (result.status !== 'applied' || !result.applyImpact.applied) {
            const reason = 'unavailableClass' in result
                ? `${result.unavailableClass}: ${result.reason}`
                : 'backend sync did not apply changes';
            throw new Error(reason);
        }

        const progressState = result.progress?.state === 'succeeded' ? 'saving' : 'saving';
        this.reportProgress(onProgress, type, progressState, result.progress?.completedUnits ?? 4, result.progress?.totalUnits ?? 4, '正在提交同步变更...');
        const skippedCount = Math.max(
            0,
            (result.plan.skippedLocalOwnedCount || 0)
            + (result.plan.malformedNativeRiffCount || 0)
            + (result.plan.duplicateNativeRiffCount || 0),
        );
        if (type === 'full') {
            this.lastFullSyncTime = startTime;
        }
        this.rememberVolatileSyncState(type === 'full'
            ? { lastSuccessfulFullAt: startTime }
            : { lastSuccessfulIncrementalAt: startTime, lastSuccessfulIncrementalCursor: String(startTime) });
        const changedBlockIds = new Set(result.applyImpact.changed.blockIds || []);
        const updateCandidateBlockIds = Array.isArray(result.plan.candidateBlockIds?.update)
            ? result.plan.candidateBlockIds.update
            : null;
        const actualUpdatedCount = updateCandidateBlockIds
            ? updateCandidateBlockIds.filter(blockId => changedBlockIds.has(blockId)).length
            : result.plan.updateCount;
        return {
            success: true,
            addedCount: result.plan.createCount,
            updatedCount: actualUpdatedCount,
            deletedCount: result.plan.deleteCount,
            skippedCount,
            blacklistCleanedCount: type === 'full' ? 0 : undefined,
            detectedCount: 0,
        };
    }
    
    /**
     * 删除同步（单个卡片）
     *
     * 尝试从 Riff 删除卡片，失败时由调用方决定后续处理。
     */
        async deleteSync(blockID: string): Promise<boolean> {
            if (!this.config.deleteSync.enabled) {
                logger.info('Delete sync disabled');
                return true;
            }

            const normalizedBlockId = typeof blockID === 'string'
                ? blockID.trim()
                : normalizeBlockId(blockID);
            if (!normalizedBlockId) {
                logger.warn('Skip delete sync because blockId is invalid', { blockID });
                return false;
            }

            logger.info(`Syncing delete for block: ${normalizedBlockId}`);

            return this.deleteSyncSingle(normalizedBlockId);
        }

    /**
     * 批量删除同步
     *
     * 批量从 Riff 删除多张卡片，使用并发处理提升性能。
     * 失败的卡片会加入黑名单（如果启用）。
     *
     * @param blockIDs - 块 ID 列表
     * @returns 成功删除的数量
     */
    async deleteSyncBatch(blockIDs: string[]): Promise<number> {
        if (!this.config.deleteSync.enabled) {
            logger.info('Delete sync disabled');
            return 0;
        }

        const normalizedBlockIds = Array.from(new Set(
            blockIDs
                .map(blockId => (typeof blockId === 'string' ? blockId.trim() : normalizeBlockId(blockId)))
                .filter((blockId): blockId is string => typeof blockId === 'string' && blockId.length > 0)
        ));

        if (normalizedBlockIds.length === 0) {
            return 0;
        }

        logger.info(`Batch syncing delete for ${normalizedBlockIds.length} blocks`);

        // 使用 Promise.allSettled 并发处理，避免单个失败影响整体
        const results = await Promise.allSettled(
            normalizedBlockIds.map(blockID => this.deleteSyncSingle(blockID))
        );

        // 统计结果
        let successCount = 0;
        let failedCount = 0;
        const failedBlockIds: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                successCount++;
            } else {
                failedCount++;
                failedBlockIds.push(normalizedBlockIds[index]);
            }
        });

        logger.info(`Batch delete sync completed: ${successCount} success, ${failedCount} failed`);

        if (failedBlockIds.length > 0) {
            logger.warn('Failed block IDs:', failedBlockIds);
        }

        return successCount;
    }

    /**
     * 单个卡片删除同步（内部方法）
     *
     * 从 deleteSync 提取的核心逻辑，用于批量处理。
     *
     * @private
     * @param blockID - 块 ID
     * @returns 是否成功
     */
    private async deleteSyncSingle(blockID: string): Promise<boolean> {
        try {
            // 使用重试机制尝试从 Riff 删除
            await this.withRetry('delete', async () => {
                await this.siyuanApi.removeRiffCards(this.config.deckId, [blockID]);
            });

            logger.info(`Successfully removed block from Riff: ${blockID}`);
            return true;
        } catch (error) {
            logger.error(`Failed to remove block from Riff after retries: ${blockID}`, error);

            if (this.config.deleteSync.useBlacklistFallback) {
                try {
                    await this.riffBlacklistService.addToBlacklist(blockID);
                    logger.warn(`Added block to persistent riff blacklist after delete sync failure: ${blockID}`);
                } catch (blacklistError) {
                    logger.error(`Failed to persist blacklist fallback for block: ${blockID}`, blacklistError);
                }
            }

            return false;
        }
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 自动检测新卡片的类型（Topic/Item）
     * 
     * 适配自 browserService.batchDetectCardTypes()
     * 
     * @param cards 新添加的卡片列表
     * @returns 成功检测的卡片数量
     */
    private async detectCardTypesForNewCards(cards: RiffBlock[]): Promise<number> {
        if (cards.length === 0) {
            return 0;
        }
        
        logger.info(`Auto-detecting card types for ${cards.length} new cards...`);

        // 0. 过滤掉已经有 cardTypeMarker 的卡片（用户手动标记的）
        const cardsToDetect: RiffBlock[] = [];
        let skippedWithType = 0;
        
        for (const card of cards) {
            const attrs = await this.siyuanApi.getBlockAttrs(card.id);
            const resolvedType = this.resolveCardTypeFromIAL(attrs);
            
            if (resolvedType.cardType) {
                // 跳过已有现行显式类型的卡片（包括 topic/item/concept/descriptor）
                skippedWithType++;
                logger.info(`Skipping card with existing cardType: ${card.id} (${resolvedType.cardType})`);
                continue;
            }

            cardsToDetect.push(card);
        }
        
        if (skippedWithType > 0) {
            logger.info(`Skipped ${skippedWithType} cards with existing cardType`);
        }
        
        if (cardsToDetect.length === 0) {
            logger.info('No cards to detect (all have existing cardType)');
            return 0;
        }
        
        // 1. 批量检测类型
        const blockIds = cardsToDetect.map(c => c.id);
        const typeMap = await this.cardTypeDetectionService.batchDetectCardTypes(blockIds);
        
        // 2. 停止写回块属性：类型统一维护在本地卡数据
        // 仅统计可检测数量，避免继续产生 legacy block attrs。
        let updated = 0;
        let failed = 0;
        for (const card of cardsToDetect) {
            const cardType = typeMap.get(card.id);
            if (!cardType) {
                failed++;
                continue;
            }
            updated++;
        }
        
        logger.info(`Auto-detection completed (local-only): ${updated} detected, ${failed} failed, ${skippedWithType} skipped (total: ${cards.length})`);
        return updated;
    }
    
    /**
     * 转换 RiffBlock 为 Xiuyuan 领域实体
     * 
     * 从 Riff 数据和块属性中提取卡片信息，并创建对应的 Xiuyuan 聚合根。
     * 
     * **DDD 架构要求**：所有卡片必须属于 Xiuyuan 聚合根
     * - 为每个 Riff 卡片创建一个独立的 Xiuyuan
     * - 使用特殊模板 `builtin-riff-sync` 标记从 Riff 同步的卡片
     * - ✅ 创建完整的 Card 领域实体（包含 FSRS 数据）
     * 
     * **Xiuyuan ID 命名规则**：
     * - 格式：`xy_{blockId}`（统一格式）
     * - 目的：
     *   1. 幂等性：同一个块多次同步生成相同 ID，避免重复创建
     *   2. 可追溯性：通过块 ID 可以直接定位到思源块
     *   3. 统一性：与模板创建的 ID 格式一致，避免重复创建
     *   2. 可追溯性：通过前缀 "riff" 可以识别来源（区别于用户手动创建的 `xy_{timestamp}_{random}`）
     *   3. 防止冲突：与手动创建的 ID 格式不同，不会产生冲突
     * 
     * 卡片类型统一从 `custom-fsrs-card-type` 读取。
     * 如果缺失则自动检测 Topic/Item。
     * legacy `custom-card-type` 仅在启动时迁移，不参与现行读取。
     * 
     * 🆕 智能识别 Topic/Item（快速制卡）：
     * - 如果没有块属性标记，自动检测：
     *   1. 文档块 → topic
     *   2. 有挖空符号（==、::）→ item
     *   3. 标题块 → item
     *   4. 列表项有子级 → item
     *   5. 超级块有子级 → item
     *   6. 其他 → topic
     * 
     * @returns { xiuyuanEntity } - Xiuyuan 领域实体（包含 Card）
     */
    private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
        xiuyuanEntity: Xiuyuan;
    }> {
        const now = Date.now();
        const riffCard = riffBlock.riffCard;
        const xiuyuanIdStr = `xy_${riffBlock.id}`;

        const resolvedType = await this.resolveCardTypeForRiffBlock(riffBlock);
        const postCreationPlan = this.planPostCreation(riffBlock, resolvedType.cardType);
        const cardType = postCreationPlan.cardType;
        const cardTypeMarker = resolvedType.cardTypeMarker;
        const quickRenderHintMeta = this.buildQuickRenderHintMeta(riffBlock.content, cardType, postCreationPlan);

        const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
        if (!xiuyuanIdResult.ok) {
            const errorMsg = xiuyuanIdResult.ok === false ? xiuyuanIdResult.error.message : 'Invalid XiuyuanId';
            throw new Error(`Failed to create XiuyuanId: ${errorMsg}`);
        }

        const existingXiuyuanForPriority = await this.findExistingXiuyuanForBlock(riffBlock.id);
        const priorityValue = existingXiuyuanForPriority?.getPriority().getValue() ?? 50;
        const priorityResult = Priority.create(priorityValue);
        const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

        const blockIdResult = BlockId.create(riffBlock.id);
        if (!blockIdResult.ok) {
            const errorMsg = blockIdResult.ok === false ? blockIdResult.error.message : 'Invalid BlockId';
            throw new Error(`Failed to create BlockId: ${errorMsg}`);
        }

        if (postCreationPlan.mode === 'multi-cloze' && postCreationPlan.renderMode === 'inline-formula-cloze') {
            return this.createFormulaMultiClozeXiuyuanFromRiffBlock({
                riffBlock,
                xiuyuanId: xiuyuanIdResult.value,
                blockId: blockIdResult.value,
                priority,
                cardType,
                cardTypeMarker,
                quickRenderHintMeta,
                postCreationPlan,
            });
        }

        return this.createSingleRiffSyncXiuyuanFromRiffBlock({
            riffBlock,
            riffCard,
            now,
            priorityValue,
            priority,
            xiuyuanId: xiuyuanIdResult.value,
            blockId: blockIdResult.value,
            cardType,
            cardTypeMarker,
            quickRenderHintMeta,
            postCreationPlan,
        });
    }

    private async createFormulaMultiClozeXiuyuanFromRiffBlock(params: {
        riffBlock: RiffBlock;
        xiuyuanId: XiuyuanId;
        blockId: BlockId;
        priority: Priority;
        cardType: SyncCardType;
        cardTypeMarker: SyncCardTypeMarker | undefined;
        quickRenderHintMeta: QuickRenderHintMeta;
        postCreationPlan: PostCreationPlan;
    }): Promise<{ xiuyuanEntity: Xiuyuan }> {
        const {
            riffBlock,
            xiuyuanId,
            blockId,
            priority,
            cardType,
            cardTypeMarker,
            quickRenderHintMeta,
            postCreationPlan,
        } = params;

        const clozes = ClozeDetector.extractClozes(riffBlock.content);
        const facesResult = ClozeCardGenerator.generateFaces(
            riffBlock.content,
            clozes,
            riffBlock.id
        );
        if (!facesResult.ok || facesResult.value.length === 0) {
            const message = facesResult.ok === false
                ? facesResult.error.message
                : `No cloze faces generated for block ${riffBlock.id}`;
            throw new Error(`Failed to generate multi-cloze faces: ${message}`);
        }

        const templateIdResult = TemplateId.create(postCreationPlan.templateId);
        if (!templateIdResult.ok) {
            const errorMsg = templateIdResult.ok === false ? templateIdResult.error.message : 'Invalid TemplateId';
            throw new Error(`Failed to create TemplateId: ${errorMsg}`);
        }

        const clozeRenderMode = this.resolveRiffClozeRenderMode(postCreationPlan);
        const renderProfile = this.resolveRiffRenderProfile(postCreationPlan);
        const xiuyuanResult = Xiuyuan.create({
            id: xiuyuanId,
            blockIDs: [blockId],
            templateID: templateIdResult.value,
            faces: facesResult.value,
            priority,
            meta: {
                ownership: 'riff-managed',
                schedulerType: 'fsrs-v6',
                fieldMapping: { content: riffBlock.id },
                cardType,
                cardTypeMarker,
                source: 'riff-sync' as RiffSyncMetaSource,
                ...(clozeRenderMode ? { clozeRenderMode } : {}),
                ...(renderProfile ? { renderProfile } : {}),
                creationRuleId: postCreationPlan.hints?.ruleId,
                creationMode: this.resolveRiffCreationMode(postCreationPlan),
                riffPrimaryCardId: riffBlock.id,
                ...quickRenderHintMeta,
            },
        });
        if (!xiuyuanResult.ok) {
            const errorMsg = xiuyuanResult.ok === false ? xiuyuanResult.error.message : 'Invalid Xiuyuan';
            throw new Error(`Failed to create Xiuyuan: ${errorMsg}`);
        }

        const xiuyuanEntity = xiuyuanResult.value;
        for (let faceIndex = 0; faceIndex < facesResult.value.length; faceIndex += 1) {
            const createCardResult = xiuyuanEntity.createCard(faceIndex);
            if (!createCardResult.ok) {
                const errorMsg = createCardResult.ok === false ? createCardResult.error.message : 'Unknown card creation failure';
                throw new Error(`Failed to create multi-cloze card at face ${faceIndex}: ${errorMsg}`);
            }
        }

        return { xiuyuanEntity };
    }

    private async createSingleRiffSyncXiuyuanFromRiffBlock(params: {
        riffBlock: RiffBlock;
        riffCard: RiffBlock['riffCard'] | undefined;
        now: number;
        priorityValue: number;
        priority: Priority;
        xiuyuanId: XiuyuanId;
        blockId: BlockId;
        cardType: SyncCardType;
        cardTypeMarker: SyncCardTypeMarker | undefined;
        quickRenderHintMeta: QuickRenderHintMeta;
        postCreationPlan: PostCreationPlan;
    }): Promise<{ xiuyuanEntity: Xiuyuan }> {
        const {
            riffBlock,
            riffCard,
            now,
            priorityValue,
            priority,
            xiuyuanId,
            blockId,
            cardType,
            cardTypeMarker,
            quickRenderHintMeta,
            postCreationPlan,
        } = params;
        const question = this.normalizeRiffQuestion(riffBlock.content);
        if (!question) {
            throw new Error(`Malformed Riff block ${riffBlock.id}: Question cannot be empty`);
        }

        const cardFaceResult = CardFace.create({
            question,
            answer: '',
            questionBlockId: riffBlock.id,
            answerBlockId: riffBlock.id,
        });
        if (!cardFaceResult.ok) {
            const errorMsg = cardFaceResult.ok === false ? cardFaceResult.error.message : 'Invalid CardFace';
            throw new Error(`Failed to create CardFace: ${errorMsg}`);
        }

        const templateIdResult = TemplateId.create(postCreationPlan.templateId);
        if (!templateIdResult.ok) {
            const errorMsg = templateIdResult.ok === false ? templateIdResult.error.message : 'Invalid TemplateId';
            throw new Error(`Failed to create TemplateId: ${errorMsg}`);
        }

        const clozeRenderMode = this.resolveRiffClozeRenderMode(postCreationPlan);
        const renderProfile = this.resolveRiffRenderProfile(postCreationPlan);
        const xiuyuanResult = Xiuyuan.create({
            id: xiuyuanId,
            blockIDs: [blockId],
            templateID: templateIdResult.value,
            faces: [cardFaceResult.value],
            priority,
            meta: {
                ownership: 'riff-managed',
                schedulerType: 'fsrs-v6',
                cardType,
                cardTypeMarker,
                source: 'riff-sync' as RiffSyncMetaSource,
                ...(clozeRenderMode ? { clozeRenderMode } : {}),
                ...(renderProfile ? { renderProfile } : {}),
                creationRuleId: postCreationPlan.hints?.ruleId,
                creationMode: this.resolveRiffCreationMode(postCreationPlan),
                riffPrimaryCardId: riffBlock.id,
                ...quickRenderHintMeta,
                ...(cardType === 'topic' ? { aFactor: initializeAFactor(priorityValue) } : {}),
            },
        });
        if (!xiuyuanResult.ok) {
            const errorMsg = xiuyuanResult.ok === false ? xiuyuanResult.error.message : 'Invalid Xiuyuan';
            throw new Error(`Failed to create Xiuyuan: ${errorMsg}`);
        }

        const xiuyuanEntity = xiuyuanResult.value;
        const { CardId } = await import('@/core/xiuyuan/domain/CardId');
        const { ScheduleInfo } = await import('@/core/xiuyuan/domain/ScheduleInfo');
        const { Card } = await import('@/core/xiuyuan/domain/Card');

        const cardIdResult = CardId.create(riffBlock.id);
        if (!cardIdResult.ok) {
            const errorMsg = cardIdResult.ok === false ? cardIdResult.error.message : 'Invalid CardId';
            throw new Error(`Failed to create CardId: ${errorMsg}`);
        }

        const resolvedState = this.resolveCardState(riffCard?.state);
        const parsedDue = this.parseValidRiffDate(riffCard?.due, riffBlock.id) || now;
        const parsedLastReview = this.parseValidRiffDate(riffCard?.lastReview, riffBlock.id);
        const fsrsCardType = cardType === 'topic'
            ? CardType.Topic
            : cardType === 'concept'
                ? CardType.Concept
                : cardType === 'descriptor'
                    ? CardType.Descriptor
                    : CardType.Item;
        const schedulerType = cardType === 'topic' ? 'a-factor-v2' : 'fsrs-v6';
        const rawScheduleCard: FSRSCard = {
            id: riffBlock.id,
            xiuyuanID: xiuyuanId.getValue(),
            blockId: riffBlock.id,
            due: parsedDue,
            stability: riffCard?.stability ?? 0,
            difficulty: riffCard?.difficulty ?? 0,
            reps: riffCard?.reps ?? 0,
            lapses: riffCard?.lapses ?? 0,
            state: resolvedState,
            lastReview: parsedLastReview || (resolvedState === CardState.Review || resolvedState === CardState.Relearning ? 0 : now),
            elapsedDays: riffCard?.elapsedDays ?? 0,
            scheduledDays: riffCard?.scheduledDays ?? 0,
            learning_step: 0,
            priority: priorityValue,
            type: fsrsCardType,
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
            schedulerType,
        };
        const repairedScheduleCard = canonicalizeSchedulingState(rawScheduleCard, {
            source: 'riff-import',
            mode: 'repair-external',
            now,
        }).card;

        const scheduleInfoResult = ScheduleInfo.create({
            due: new Date(repairedScheduleCard.due),
            stability: repairedScheduleCard.stability,
            difficulty: repairedScheduleCard.difficulty,
            reps: repairedScheduleCard.reps,
            lapses: repairedScheduleCard.lapses,
            state: repairedScheduleCard.state,
            lastReview: new Date(repairedScheduleCard.lastReview || now),
            elapsedDays: repairedScheduleCard.elapsedDays,
            scheduledDays: repairedScheduleCard.scheduledDays,
            learning_step: repairedScheduleCard.learning_step ?? 0,
        });
        if (!scheduleInfoResult.ok) {
            const errorMsg = scheduleInfoResult.ok === false ? scheduleInfoResult.error.message : 'Invalid ScheduleInfo';
            throw new Error(`Failed to create ScheduleInfo: ${errorMsg}`);
        }

        const cardResult = Card.create({
            id: cardIdResult.value,
            xiuyuanId,
            faceIndex: 0,
            scheduleInfo: scheduleInfoResult.value,
            createdAt: new Date(now),
            updatedAt: new Date(now),
        });
        if (!cardResult.ok) {
            const errorMsg = cardResult.ok === false ? cardResult.error.message : 'Invalid Card';
            throw new Error(`Failed to create Card: ${errorMsg}`);
        }

        const addResult = xiuyuanEntity.addCard(cardResult.value);
        if (!addResult.ok) {
            const errorMsg = addResult.ok === false ? addResult.error.message : 'Failed to add card';
            throw new Error(`Failed to add Card to Xiuyuan: ${errorMsg}`);
        }

        return { xiuyuanEntity };
    }

    private parseValidRiffDate(dateStr: string | undefined, blockId: string): number {
        if (!dateStr) return 0;
        const timestamp = new Date(dateStr).getTime();
        const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
        const isValid = timestamp >= MIN_VALID_TIMESTAMP && !isNaN(timestamp);

        if (!isValid && dateStr !== '0001-01-01T00:00:00Z') {
            logger.warn(`Invalid date detected: "${dateStr}" (timestamp: ${timestamp}) for card ${blockId}`);
        }

        return isValid ? timestamp : 0;
    }

    private resolveCardState(rawState: unknown): CardState {
        if (
            rawState === CardState.New
            || rawState === CardState.Learning
            || rawState === CardState.Review
            || rawState === CardState.Relearning
            || rawState === CardState.Suspended
        ) {
            return rawState;
        }

        return CardState.New;
    }
    
    /**
     * 报告同步进度
     */
    private reportProgress(
        onProgress: ProgressCallback | undefined,
        type: SyncType,
        phase: SyncPhase,
        current: number,
        total: number,
        message?: string
    ): void {
        const progress: SyncProgress = {
            current,
            total,
            phase,
            message,
            percentage: Math.round((current / total) * 100)
        };
        
        // 调用回调函数
        if (onProgress) {
            onProgress(progress);
        }
        
        // 发布进度事件
        this.publishEvent('syncProgress', {
            type,
            progress,
            timestamp: Date.now()
        });
    }
    
    /**
     * 重试包装器
     * 
     * 自动重试失败的同步操作（最多 3 次，指数退避）
     */
    private async withRetry<T>(
        type: SyncType,
        operation: () => Promise<T>
    ): Promise<T> {
        const { maxRetries, retryDelay, backoffMultiplier } = this.config.retry!;
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                const willRetry = attempt < maxRetries && this.shouldRetry(error as Error);
                
                // 发布错误事件
                this.publishEvent('syncError', {
                    type,
                    error: lastError,
                    timestamp: Date.now(),
                    willRetry,
                    retryCount: attempt + 1
                });
                
                if (!willRetry) {
                    break;
                }
                
                // 指数退避
                const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
                logger.info(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        
        // 所有重试都失败
        throw lastError;
    }
    
    /**
     * 判断是否应该重试
     */
    private shouldRetry(error: Error): boolean {
        // 网络错误、超时错误应该重试
        const message = error.message.toLowerCase();
        return (
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('fetch') ||
            message.includes('econnrefused')
        );
    }
    
    /**
     * 延迟辅助方法
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

