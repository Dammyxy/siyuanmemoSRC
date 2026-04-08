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
import { XiuyuanSyncSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter';
import type { EventBus, EventHandler } from '@/core/shared/domain/events/EventBus';
import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
import type {
    HybridSyncConfig,
    HybridSyncEvents,
    SyncResult,
    SyncType,
    ProgressCallback,
    SyncProgress,
    SyncPhase
} from './XiuyuanSyncService.types';
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
import { createLogger } from '@/utils/logger';
import { CardState } from '@/types/card';
import { ClozeDetector } from '@/utils/cloze-detector';
import { ClozeCardGenerator } from '@/core/xiuyuan/domain/services/ClozeCardGenerator';
import { normalizeBlockId } from '@/core/siyuan/riff/normalizers';
import {
    QuickCardPostCreationPlanner,
    type PostCreationPlan,
} from '@/core/card/post-creation/QuickCardPostCreationPlanner';

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
    private lastSyncTime: number = 0;
    public lastFullSyncTime: number = 0;
    private legacyCardTypeMigrationDone = false;
    private syncMutex: Promise<void> = Promise.resolve();
    private readonly inFlightSyncs: Map<SyncType, Promise<SyncResult>> = new Map();
    private readonly syncEventHandlers: Map<string, Map<(data: unknown) => void, EventHandler<DomainEvent>>> = new Map();
    private readonly postCreationPlanner = new QuickCardPostCreationPlanner();
    
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
        siyuanApi: XiuyuanSyncSiyuanPort = new XiuyuanSyncSiyuanAdapter()
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
        const xiuyuanId = xiuyuan.getId().getValue();
        if (!xiuyuanId.startsWith('xy_') || xiuyuanId.startsWith('xy_migrated_')) {
            return false;
        }

        // 仅同步治理由 Riff 同步路径创建的 Xiuyuan，避免误删用户手动创建卡片。
        if (xiuyuan.getTemplateID().getValue() === 'builtin-riff-sync') {
            return true;
        }

        return xiuyuan.getMeta().source === 'riff-sync';
    }
    
    /**
     * 启动同步服务
     * 
     * 执行初始增量同步
     */
    async start(): Promise<void> {
        logger.info('Starting sync service...');

        await this.migrateLegacyCardTypeAttrsOnce();
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        logger.info('Sync service started');
    }

    private extractXiuyuanBindingId(attrs: Record<string, string> | null | undefined): string {
        const raw = attrs?.['custom-xiuyuan-id'] || attrs?.['custom-fsrs-xiuyuan-id'];
        if (typeof raw !== 'string') {
            return '';
        }
        return raw.trim();
    }

    private async clearStaleXiuyuanBindingAttrs(
        blockId: string,
        attrs: Record<string, string> | null | undefined
    ): Promise<void> {
        const keysToClear = [
            'custom-xiuyuan-id',
            'custom-fsrs-xiuyuan-id',
            'custom-xiuyuan-template',
            'custom-fsrs-template-id',
        ] as const;

        const nextAttrs: Record<string, string> = {};
        for (const key of keysToClear) {
            if (!attrs || key in attrs) {
                nextAttrs[key] = '';
            }
        }

        if (Object.keys(nextAttrs).length === 0) {
            return;
        }

        try {
            await this.siyuanApi.setBlockAttrs(blockId, nextAttrs);
            logger.info(`Cleared stale Xiuyuan binding attrs for block ${blockId}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('tree not found')) {
                logger.info(`Skip clearing stale Xiuyuan binding attrs for removed block ${blockId}`);
                return;
            }
            logger.warn(`Failed to clear stale Xiuyuan binding attrs for block ${blockId}:`, error);
        }
    }

    private async shouldSkipByXiuyuanBinding(
        blockId: string,
        attrs: Record<string, string> | null | undefined
    ): Promise<boolean> {
        const bindingId = this.extractXiuyuanBindingId(attrs);
        if (!bindingId) {
            return false;
        }

        const boundXiuyuanIdResult = XiuyuanId.create(bindingId);
        if (!boundXiuyuanIdResult.ok) {
            logger.warn(`Block ${blockId} has invalid Xiuyuan binding "${bindingId}", trying self-heal`);
            await this.clearStaleXiuyuanBindingAttrs(blockId, attrs);
            return false;
        }

        const existingByBindingResult = await this.xiuyuanRepository.findById(boundXiuyuanIdResult.value);
        if (!existingByBindingResult.ok) {
            const errorMsg = 'error' in existingByBindingResult ? existingByBindingResult.error : 'Unknown error';
            logger.error(`Failed to verify Xiuyuan binding for block ${blockId}:`, errorMsg);
            // Keep old conservative behavior when repository check itself fails.
            return true;
        }

        if (existingByBindingResult.value) {
            logger.info(`Block ${blockId} already has Xiuyuan: ${bindingId}, skipping`);
            return true;
        }

        logger.warn(`Block ${blockId} has stale Xiuyuan binding: ${bindingId}, clearing and re-syncing`);
        await this.clearStaleXiuyuanBindingAttrs(blockId, attrs);
        return false;
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
        const preparedBlocks: RiffBlock[] = [];
        let skippedCount = 0;

        for (const riffBlock of riffBlocks) {
            const normalizedId = String(normalizeBlockId(riffBlock) || '').trim();
            const blockIdResult = BlockId.create(normalizedId);
            if (!blockIdResult.ok) {
                skippedCount++;
                const errorMsg = blockIdResult.ok === false ? blockIdResult.error.message : 'Invalid BlockId';
                this.logMalformedRiffBlock(stage, riffBlock, errorMsg);
                continue;
            }

            if (!this.hasMeaningfulRiffQuestion(riffBlock.content)) {
                skippedCount++;
                this.logMalformedRiffBlock(stage, riffBlock, 'Question cannot be empty');
                continue;
            }

            if (normalizedId === riffBlock.id) {
                preparedBlocks.push(riffBlock);
                continue;
            }

            preparedBlocks.push({
                ...riffBlock,
                id: normalizedId,
            });
        }

        if (skippedCount > 0) {
            logger.warn('[XiuyuanSyncService] Skipped malformed Riff blocks', {
                stage,
                skippedCount,
            });
        }

        return {
            blocks: preparedBlocks,
            skippedCount,
        };
    }

    private hasMeaningfulRiffQuestion(content: string | undefined): boolean {
        return this.normalizeRiffQuestion(content).length > 0;
    }

    private normalizeRiffQuestion(content: string | undefined): string {
        if (typeof content !== 'string') {
            return '';
        }

        return content.replace(/\u200B/g, '').trim();
    }

    private logMalformedRiffBlock(stage: RiffInputStage, riffBlock: RiffBlock, reason: string): void {
        const rawRiffBlock = riffBlock as unknown as Record<string, unknown>;
        logger.warn('[XiuyuanSyncService] Skipping malformed Riff block', {
            stage,
            reason,
            id: this.readRiffField(rawRiffBlock, 'id'),
            blockID: this.readRiffField(rawRiffBlock, 'blockID'),
            blockId: this.readRiffField(rawRiffBlock, 'blockId'),
            riffCardID: this.readRiffField(rawRiffBlock, 'riffCardID'),
            riffCardId: this.readRiffField(rawRiffBlock, 'riffCardId'),
            path: this.readRiffField(rawRiffBlock, 'path'),
            contentLength: typeof rawRiffBlock.content === 'string' ? rawRiffBlock.content.length : undefined,
        });
    }

    private readRiffField(record: Record<string, unknown>, key: string): string | undefined {
        const value = record[key];
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return undefined;
    }

    private resolveRiffRenderProfile(plan: PostCreationPlan): RiffRenderProfile | undefined {
        if (plan.templateId === 'builtin-riff-sync') {
            return undefined;
        }

        if (plan.renderMode === 'inline-formula-cloze') {
            return 'quick-inline-formula';
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
        return /\\cloze\{c\d+\}\{/.test(String(content || ''));
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
        const hintMeta = this.buildQuickRenderHintMeta(riffBlock.content, cardType, plan);
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

    
    /**
     * 增量同步（公共方法）
     * 
     * 从 Riff 获取新卡片，使用黑名单过滤，只添加本地不存在的卡片
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async incrementalSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        return this.runSyncExclusive('incremental', async () => {
            return this.withRetry('incremental', async () => {
                const startTime = this.beginSync('incremental');
            
                try {
                    // 1. 获取新卡片（since lastSyncTime）
                    this.reportProgress(onProgress, 'incremental', 'fetching', 0, 1, '正在获取新卡片...');
                    const since = this.lastSyncTime > 0 ? this.lastSyncTime : undefined;
                    logger.info('Incremental sync fetch window:', {
                        since,
                        startTime,
                    });

                    const newCards = await this.siyuanApi.getRiffNewCards(this.config.deckId, since);
                    logger.info(`Fetched ${newCards.length} cards from Riff`);
                    const preparedNewCards = this.prepareRiffBlocks('incremental', newCards);
                    const malformedNewCards = preparedNewCards.skippedCount;

                // 2. 过滤黑名单
                this.reportProgress(onProgress, 'incremental', 'filtering', 1, 7, '正在过滤黑名单...');
                let filtered = preparedNewCards.blocks;
                let skippedCount = malformedNewCards;
                if (this.config.incrementalSync.useBlacklist) {
                    const beforeBlacklist = filtered.length;
                    filtered = await this.riffBlacklistService.filterBlacklist(filtered);
                    logger.info(`Filtered ${beforeBlacklist - filtered.length} blacklisted cards`);
                }
                
                logger.info(`Processing ${filtered.length} cards for incremental sync`);
                
                // 3. 只添加本地不存在的卡片，或更新已存在卡片的优先级
                this.reportProgress(onProgress, 'incremental', 'adding', 2, 7, '正在同步卡片...');
                let addedCount = 0;
                let updatedCount = 0;
                const addedCards: RiffBlock[] = [];
                
                for (const riffCard of filtered) {
                    // 🔧 防护 0：检查是否最近被删除（防止孤儿卡片）
                    if (this.deletionTracker.isRecentlyDeleted(riffCard.id)) {
                        logger.info(`Block ${riffCard.id} was recently deleted, skipping to prevent orphan cards`);
                        skippedCount++;
                        continue;
                    }
                    
                    // 🔧 防护 1：检查块属性，避免重复创建
                    try {
                        const attrs = await this.siyuanApi.getBlockAttrs(riffCard.id);
                        if (await this.shouldSkipByXiuyuanBinding(riffCard.id, attrs)) {
                            skippedCount++;
                            continue;
                        }
                    } catch (error) {
                        logger.warn(`Failed to check block attrs for ${riffCard.id}:`, error);
                        // 继续执行，不阻断流程
                    }
                    
                    // 🔧 防护 2：使用 Repository 查询（统一 ID 格式，去掉 riff_ 前缀）
                    const xiuyuanIdStr = `xy_${riffCard.id}`;
                    const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
                    
                    if (!xiuyuanIdResult.ok) {
                        logger.error(`Invalid Xiuyuan ID: ${xiuyuanIdStr}`);
                        skippedCount++;
                        continue;
                    }
                    
                    const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
                    
                    if (!existingXiuyuanResult.ok) {
                        const errorMsg = 'error' in existingXiuyuanResult ? existingXiuyuanResult.error : 'Unknown error';
                        logger.error('Failed to query Xiuyuan:', errorMsg);
                        skippedCount++;
                        continue;
                    }
                    
                    const existingXiuyuan = existingXiuyuanResult.value;
                    
                    logger.info(`Checking card ${riffCard.id}: existingXiuyuan=${!!existingXiuyuan}`);
                    
                    if (!existingXiuyuan) {
                        // ✅ 本地没有，通过 Repository 保存（完全符合 DDD）
                        logger.info('✅ Creating new Xiuyuan from Riff:', {
                            xiuyuanId: xiuyuanIdStr,
                            blockId: riffCard.id,
                            source: 'riff-sync'
                        });
                        const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
                        
                        logger.info(`Created Xiuyuan ${xiuyuanEntity.getId().getValue()} with ${xiuyuanEntity.getCards().length} cards`);
                        
                        // ✅ 通过 Repository 保存 Xiuyuan（会自动保存关联的 Card）
                        const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
                        if (!saveResult.ok) {
                            const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                            logger.error(`Failed to save Xiuyuan ${xiuyuanEntity.getId().getValue()}: ${errorMsg}`);
                            continue;
                        }
                        
                        logger.info(`Successfully saved Xiuyuan ${xiuyuanEntity.getId().getValue()}`);
                        
                        addedCards.push(riffCard);
                        addedCount++;
                    } else {
                        // ✅ 本地已存在 Xiuyuan，只同步块 IAL 中的卡片类型元数据
                        // 🔧 不同步任何调度字段（priority、aFactor 等），本地复习数据永远优先
                        logger.info(`Updating existing Xiuyuan ${xiuyuanIdStr}`);

                        let needsUpdate = false;

                        // 从块 IAL 属性读取卡片类型元数据（非调度数据，合法同步）
                        // 现行只认 custom-fsrs-card-type；legacy custom-card-type 仅在启动时迁移一次。
                        const resolvedType = await this.resolveCardTypeForRiffBlock(riffCard);
                        const newCardTypeMarker = resolvedType.cardTypeMarker;
                        const newCardType = resolvedType.cardType;
                        const postCreationPlan = this.planPostCreation(riffCard, newCardType);

                        // 更新卡片类型标记（concept/descriptor）
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

                        // 更新卡片类型（topic/item）
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

                        // 3. 保存更新
                        if (needsUpdate) {
                            const saveResult = await this.xiuyuanRepository.save(existingXiuyuan);
                            if (saveResult.ok) {
                                logger.info(`Successfully updated Xiuyuan ${xiuyuanIdStr}`);
                                updatedCount++;
                            } else {
                                const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                                logger.error(`Failed to save updated Xiuyuan: ${errorMsg}`);
                                skippedCount++;
                            }
                        } else {
                            logger.info(`No changes detected for Xiuyuan ${xiuyuanIdStr}`);
                            skippedCount++;
                        }
                    }
                }
                
                    // 4. 检测并删除本地有但 Riff 没有的 Xiuyuan
                    // 仅在全量窗口（since 为空）执行删除检测，避免增量窗口误删。
                    this.reportProgress(onProgress, 'incremental', 'deleting', 4, 7, '正在检测删除的卡片...');
                    let deletedCount = 0;
                    if (since === undefined) {
                        if (malformedNewCards > 0) {
                            logger.warn('Skip incremental delete detection: malformed Riff blocks made startup window incomplete', {
                                malformedCount: malformedNewCards,
                            });
                        } else {
                            const allXiuyuansResult = await this.xiuyuanRepository.findAll();
                            if (!allXiuyuansResult.ok) {
                                const errorMsg = 'error' in allXiuyuansResult ? allXiuyuansResult.error : 'Unknown error';
                                logger.error('Failed to get all Xiuyuans:', errorMsg);
                            } else {
                                const allXiuyuans = allXiuyuansResult.value;
                                const riffBlockIds = new Set(filtered.map(c => c.id));

                                const xiuyuansToDelete = allXiuyuans.filter(xiuyuan => {
                                    if (!this.isManagedRiffXiuyuan(xiuyuan)) {
                                        return false;
                                    }

                                    const blockIds = xiuyuan.getBlockIDs();
                                    if (blockIds.length === 0) {
                                        return false;
                                    }

                                    const blockId = blockIds[0].getValue();
                                    return !riffBlockIds.has(blockId);
                                });

                                if (xiuyuansToDelete.length > 0) {
                                    logger.info(`Deleting ${xiuyuansToDelete.length} Xiuyuans that no longer exist in Riff`);
                                    for (const xiuyuan of xiuyuansToDelete) {
                                        const deleteResult = await this.xiuyuanRepository.delete(xiuyuan);
                                        if (deleteResult.ok) {
                                            deletedCount++;
                                        } else {
                                            const errorMsg = 'error' in deleteResult ? deleteResult.error : 'Unknown error';
                                            logger.error(`Failed to delete Xiuyuan ${xiuyuan.getId().getValue()}:`, errorMsg);
                                        }
                                    }
                                    logger.info(`Deleted ${deletedCount} Xiuyuans via Repository`);
                                }
                            }
                        }
                    } else {
                        logger.info('Skip incremental delete detection: since-window result is partial and unsafe for delete decisions');
                    }
                
                // 5. 保存（Repository.delete() 已经自动保存，不需要额外调用）
                this.reportProgress(onProgress, 'incremental', 'saving', 5, 7, '正在保存数据...');
                // ✅ Repository 操作已经自动保存，移除 saveCards() 调用
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                    this.reportProgress(onProgress, 'incremental', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(addedCards);
                }
                
                // 7. 更新时间戳（使用本轮开始时间，避免同步期间新增卡片被跳过）
                this.lastSyncTime = startTime;
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount,  // 🆕 返回删除数量
                    skippedCount,
                    detectedCount
                };

                    return this.completeSync(
                        'incremental',
                        startTime,
                        result,
                        `Incremental sync completed: added ${addedCount}, updated ${updatedCount}, deleted ${deletedCount}, skipped ${skippedCount}, detected ${detectedCount || 0}`
                    );
                } catch (error) {
                    return this.failSync('incremental', error);
                }
            });
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
        return this.runSyncExclusive('full', async () => {
            return this.withRetry('full', async () => {
                const startTime = this.beginSync('full');
            
                try {
                // 1. 获取所有卡片（使用 blockId 而不是 cardId）
                this.reportProgress(onProgress, 'full', 'fetching', 0, 7, '正在获取所有卡片...');
                const rawRiffCards = await this.siyuanApi.getRiffCards(this.config.deckId, {
                    dueOnly: false,
                    includeNew: true
                });
                const preparedRiffCards = this.prepareRiffBlocks('full', rawRiffCards);
                const riffCards = preparedRiffCards.blocks;
                const malformedRiffCards = preparedRiffCards.skippedCount;
                // 🔧 修改：使用 Repository 查询所有 Xiuyuan
                const riffBlockIds = new Set(riffCards.map(c => c.id));
                
                // ✅ 使用 Repository 查询所有 Xiuyuan（符合 DDD 架构）
                const allXiuyuansResult = await this.xiuyuanRepository.findAll();
                if (!allXiuyuansResult.ok) {
                    const errorMsg = 'error' in allXiuyuansResult ? allXiuyuansResult.error : 'Unknown error';
                    logger.error('Failed to get all Xiuyuans:', errorMsg);
                    throw new Error(`Failed to get all Xiuyuans: ${errorMsg}`);
                }
                
                const allXiuyuans = allXiuyuansResult.value;
                logger.info(`Riff: ${riffBlockIds.size} blocks, Local: ${allXiuyuans.length} Xiuyuans`);
                
                // 2. 🔧 只添加新卡片（本地没有的），不更新已有卡片的复习数据
                this.reportProgress(onProgress, 'full', 'adding', 2, 7, '正在添加新卡片...');
                let addedCount = 0;
                let skippedCount = malformedRiffCards;
                const addedCards: RiffBlock[] = [];
                
                for (const riffCard of riffCards) {
                    // ✅ 使用 Repository 查询（符合 DDD 架构，统一 ID 格式）
                    const xiuyuanIdStr = `xy_${riffCard.id}`;
                    const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
                    
                    if (!xiuyuanIdResult.ok) {
                        logger.error(`Invalid Xiuyuan ID: ${xiuyuanIdStr}`);
                        continue;
                    }
                    
                    const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
                    
                    if (!existingXiuyuanResult.ok) {
                        const errorMsg = 'error' in existingXiuyuanResult ? existingXiuyuanResult.error : 'Unknown error';
                        logger.error('Failed to query Xiuyuan:', errorMsg);
                        continue;
                    }
                    
                    const existingXiuyuan = existingXiuyuanResult.value;
                    
                    if (existingXiuyuan) {
                        // ✅ 已存在，跳过（不覆盖本地复习数据）
                        logger.info(`Xiuyuan exists locally, skipping: ${riffCard.id}`);
                        skippedCount++;
                    } else {
                        // ✅ 不存在，通过 Repository 保存（完全符合 DDD）
                        const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
                        
                        // ✅ 通过 Repository 保存 Xiuyuan（会自动保存关联的 Card）
                        const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
                        if (saveResult.ok) {
                            addedCount++;
                            addedCards.push(riffCard);
                        } else {
                            const errorMsg = saveResult.ok === false ? saveResult.error.message : 'Unknown error';
                            logger.error(`Failed to save Xiuyuan ${xiuyuanEntity.getId().getValue()}: ${errorMsg}`);
                        }
                    }
                }
                
                logger.info(`Added ${addedCount} new Xiuyuans, skipped ${skippedCount} existing Xiuyuans`);
                
                // 3. 删除：本地有但 Riff 没有（通过 blockId 判断）
                this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');

                let deletedCount = 0;
                if (malformedRiffCards > 0) {
                    logger.warn('Skip full delete detection: malformed Riff blocks made full-sync snapshot incomplete', {
                        malformedCount: malformedRiffCards,
                    });
                } else {
                    // ✅ 使用 Repository 查询和删除（符合 DDD 架构）
                    const xiuyuansToDelete = allXiuyuans.filter(xiuyuan => {
                        if (!this.isManagedRiffXiuyuan(xiuyuan)) {
                            return false;
                        }

                        // 检查对应的块是否还在 Riff 中
                        const blockIds = xiuyuan.getBlockIDs();
                        if (blockIds.length === 0) {
                            return false;
                        }

                        const blockId = blockIds[0].getValue();
                        return !riffBlockIds.has(blockId);
                    });

                    if (xiuyuansToDelete.length > 0) {
                        logger.info(`Deleting ${xiuyuansToDelete.length} Xiuyuans that no longer exist in Riff`);

                        for (const xiuyuan of xiuyuansToDelete) {
                            const deleteResult = await this.xiuyuanRepository.delete(xiuyuan);
                            if (deleteResult.ok) {
                                deletedCount++;
                            } else {
                                const errorMsg = 'error' in deleteResult ? deleteResult.error : 'Unknown error';
                                logger.error(`Failed to delete Xiuyuan ${xiuyuan.getId().getValue()}:`, errorMsg);
                            }
                        }
                    }
                }
                
                logger.info(`Deleted ${deletedCount} Xiuyuans not in Riff`);
                
                // 4. 清理黑名单：黑名单中 Riff 已不存在的 blockId
                let blacklistCleanedCount = 0;
                if (this.config.fullSync.cleanupBlacklist) {
                    this.reportProgress(onProgress, 'full', 'cleanup', 4, 7, '正在清理黑名单...');
                    if (malformedRiffCards > 0) {
                        logger.warn('Skip blacklist cleanup: malformed Riff blocks made full-sync snapshot incomplete', {
                            malformedCount: malformedRiffCards,
                        });
                    } else {
                        blacklistCleanedCount = await this.riffBlacklistService.cleanupBlacklist(riffBlockIds);
                        logger.info(`Cleaned ${blacklistCleanedCount} IDs from blacklist`);
                    }
                }
                
                // 5. 保存
                this.reportProgress(onProgress, 'full', 'saving', 5, 7, '正在保存数据...');
                // ✅ Repository.save() 和 Repository.delete() 已经自动保存
                // 不需要额外调用 saveCards()
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                    this.reportProgress(onProgress, 'full', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(addedCards);
                }
                
                // 7. 更新时间戳
                this.lastFullSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount,
                    skippedCount, // 🔧 记录跳过的已有卡片数量
                    blacklistCleanedCount,
                    detectedCount
                };

                    return this.completeSync(
                        'full',
                        startTime,
                        result,
                        `Full sync completed: added ${addedCount}, deleted ${deletedCount}, skipped ${skippedCount}, blacklistCleaned ${blacklistCleanedCount}, detected ${detectedCount || 0}`
                    );
                } catch (error) {
                    return this.failSync('full', error);
                }
            });
        });
    }
    
    /**
     * 删除同步（单个卡片）
     *
     * 尝试从 Riff 删除卡片，失败时由调用方决定后续处理。
     */
        async deleteSync(cardID: string): Promise<boolean> {
            if (!this.config.deleteSync.enabled) {
                logger.info('Delete sync disabled');
                return true;
            }

            logger.info(`Syncing delete for card: ${cardID}`);

            return this.deleteSyncSingle(cardID);
        }

    /**
     * 批量删除同步
     *
     * 批量从 Riff 删除多张卡片，使用并发处理提升性能。
     * 失败的卡片会加入黑名单（如果启用）。
     *
     * @param cardIDs - 卡片 ID 列表
     * @returns 成功删除的数量
     */
    async deleteSyncBatch(cardIDs: string[]): Promise<number> {
        if (!this.config.deleteSync.enabled) {
            logger.info('Delete sync disabled');
            return 0;
        }

        if (cardIDs.length === 0) {
            return 0;
        }

        logger.info(`Batch syncing delete for ${cardIDs.length} cards`);

        // 使用 Promise.allSettled 并发处理，避免单个失败影响整体
        const results = await Promise.allSettled(
            cardIDs.map(cardID => this.deleteSyncSingle(cardID))
        );

        // 统计结果
        let successCount = 0;
        let failedCount = 0;
        const failedCardIds: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                successCount++;
            } else {
                failedCount++;
                failedCardIds.push(cardIDs[index]);
            }
        });

        logger.info(`Batch delete sync completed: ${successCount} success, ${failedCount} failed`);

        if (failedCardIds.length > 0) {
            logger.warn('Failed card IDs:', failedCardIds);
        }

        return successCount;
    }

    /**
     * 单个卡片删除同步（内部方法）
     *
     * 从 deleteSync 提取的核心逻辑，用于批量处理。
     *
     * @private
     * @param cardID - 卡片 ID
     * @returns 是否成功
     */
    private async deleteSyncSingle(cardID: string): Promise<boolean> {
        try {
            // 使用重试机制尝试从 Riff 删除
            await this.withRetry('delete', async () => {
                await this.siyuanApi.removeRiffCards(this.config.deckId, [cardID]);
            });

            logger.info(`Successfully removed card from Riff: ${cardID}`);
            return true;
        } catch (error) {
            logger.error(`Failed to remove card from Riff after retries: ${cardID}`, error);
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

        const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
        const priorityValue = existingXiuyuanResult.ok && existingXiuyuanResult.value
            ? existingXiuyuanResult.value.getPriority().getValue()
            : 50;
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

        const scheduleInfoResult = ScheduleInfo.create({
            due: new Date(this.parseValidRiffDate(riffCard?.due, riffBlock.id) || now),
            stability: riffCard?.stability || 0,
            difficulty: riffCard?.difficulty || 0,
            reps: riffCard?.reps || 0,
            lapses: riffCard?.lapses || 0,
            state: this.resolveCardState(riffCard?.state),
            lastReview: new Date(this.parseValidRiffDate(riffCard?.lastReview, riffBlock.id) || now),
            elapsedDays: riffCard?.elapsedDays || 0,
            scheduledDays: riffCard?.scheduledDays || 0,
            learning_step: 0,
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

