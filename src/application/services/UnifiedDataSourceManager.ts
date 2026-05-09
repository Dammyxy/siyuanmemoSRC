/**
 * Unified Data Source Manager
 * 统一数据源管理器
 * 
 * 中央协调器，负责数据路由、观察者管理和队列工厂。
 * 实现单例模式，确保整个应用程序生命周期中只有一个实例。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import {
    QueueType,
    IDataSourceObserver,
    DataChangeEvent,
    IDataRouter,
    IReviewQueue,
    CardFilter,
    QueueError,
    type BatchCardDeleteResult,
    type BatchCardMutationResult,
    type CardMutationOptions,
    type QueueAddSource,
    type QueueBulkAddInput,
    type QueueBulkMutationResult,
    type QueueProjectionSnapshot,
    type QueueProjectionRolloutDiagnostic,
    type QueueProjectionRolloutReason,
    type QueueProjectionRolloutState,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { DrillLogV2 } from '@/types/review';
import type { QueueSnapshotRow } from '@/types/queue-browser';
// ✅ DDD 架构：UnifiedDataSourceManager（应用层）直接创建队列，不依赖 QueueFactory（基础设施层）
import { RetrievalPracticeQueue } from '@/core/queue/domain/RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '@/core/queue/domain/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/domain/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { LeechReviewQueue } from '@/core/queue/domain/LeechReviewQueue';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import type { QueueInitialLoadAware, QueueSchedulerPort } from '@/core/queue/managers/UnifiedDataSourceManager';
import type { QueueReviewCommand, QueueReviewCommitResult } from '@/core/queue/managers/UnifiedDataSourceManager';
import type {
    AutoFailedCardSinkPort,
    LeechActionEffectsPort,
    NeuralRoamNodeType,
    QueuePersistencePort,
} from '@/core/queue/domain/ports';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { createDependencyUnavailableError } from '@/core/queue/dependencyErrors';
import { createLogger } from '@/utils/logger';
import type { HyperspaceSettings } from '@/types/settings';
import type {
    BackendQueueProjectionRowsByIdsResult,
    BackendQueueProjectionReplaceResult,
    BackendQueueProjectionSnapshotRequest,
    BackendQueueProjectionSnapshotResult,
} from '../../../packages/contracts/src/backend-rpc';
import { buildOrderedQueueProjectionRows } from '@/application/services/queue-projection/QueueProjectionBuilder';

const logger = createLogger('UnifiedDataSourceManager');

const QUEUE_PROJECTION_ROLLOUT_ORDER: QueueType[] = [
    QueueType.RetrievalPractice,
    QueueType.IncrementalLearning,
    QueueType.FilterGroup,
    QueueType.FinalDrill,
    QueueType.Leech,
    QueueType.NeuralRoam,
];

const QUEUE_PROJECTION_BACKED_TYPES = new Set<QueueType>([
    QueueType.RetrievalPractice,
    QueueType.IncrementalLearning,
    QueueType.FilterGroup,
    QueueType.FinalDrill,
    QueueType.Leech,
    QueueType.NeuralRoam,
]);

const DEFAULT_QUEUE_PROJECTION_ROLLOUT_STATES: Record<QueueType, QueueProjectionRolloutState> = {
    [QueueType.RetrievalPractice]: 'backend-projection',
    [QueueType.IncrementalLearning]: 'backend-projection',
    [QueueType.FilterGroup]: 'backend-projection',
    [QueueType.FinalDrill]: 'backend-projection',
    [QueueType.Leech]: 'backend-projection',
    [QueueType.NeuralRoam]: 'backend-projection',
};

const QUEUE_PROJECTION_PENDING_NEXT_STEPS: Partial<Record<QueueType, string>> = {
    [QueueType.FilterGroup]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
    [QueueType.FinalDrill]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
    [QueueType.Leech]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
    [QueueType.NeuralRoam]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
};

interface UnifiedManagerPluginContextLike {
    getScheduler?: () => unknown;
    getCardTypeDetectionService?: () => {
        detectCardType?: (blockId: string) => Promise<'item' | 'topic'>;
    } | null | undefined;
    getSettingsService?: () => {
        getSettings?: () => {
            fsrs?: { dayStartHour?: unknown };
            newCardsPerDay?: unknown;
            reviewsPerDay?: unknown;
            scheduler?: {
                srsV2?: {
                    filteredReviewDefault?: unknown;
                };
            };
            queues?: {
                dayStartHour?: unknown;
                addToOutstandingEveryNth?: unknown;
                outstandingEveryNth?: unknown;
                outstandingSpacing?: unknown;
                autoSort?: {
                    enabled?: unknown;
                };
                neuralRoam?: {
                    history?: {
                        maxEntries?: unknown;
                    };
                    hyperspace?: HyperspaceSettings;
                };
            };
            priorityRandomness?: unknown;
        };
    } | null | undefined;
    getReviewCommitUseCase?: () => {
        execute?: (command: QueueReviewCommand) => Promise<QueueReviewCommitResult>;
    } | null | undefined;
    getFrontendInstanceRuntime?: () => {
        getMode?: () => 'writer' | 'follower' | string;
        getInstanceId?: () => string;
    } | null | undefined;
    getFollowerCommandClient?: () => {
        submitAndWait?: <TResult>(request: {
            instanceId: string;
            method: string;
            params?: unknown;
        }) => Promise<TResult>;
    } | null | undefined;
    getSrsBackendClient?: () => {
        queueProjectionSnapshot?: (
            request: BackendQueueProjectionSnapshotRequest,
        ) => Promise<BackendQueueProjectionSnapshotResult>;
        queueProjectionRowsByIds?: (
            request: { queueType: string; ids: string[]; policyHash?: string | null; generation?: number | null },
        ) => Promise<BackendQueueProjectionRowsByIdsResult>;
        queueProjectionReplace?: (
            request: QueueProjectionReplaceRequestLike,
        ) => Promise<BackendQueueProjectionReplaceResult>;
        getQueueProjectionRolloutState?: (
            queueType: QueueType,
        ) => QueueProjectionRolloutState | string | null | undefined;
    } | null | undefined;
    getReviewLogService?: () => {
        addDrillLogV2?: (log: DrillLogV2) => Promise<void>;
    } | null | undefined;
    getUnifiedStorage?: () => {
        updateCard?: (
            card: FSRSCard,
            options?: { suppressAutosave?: boolean; preferIncomingScheduling?: boolean }
        ) => Promise<{ ok: boolean; error?: Error }> | { ok: boolean; error?: Error };
    } | null | undefined;
}

interface UnifiedManagerPluginLike {
    getContext?: () => UnifiedManagerPluginContextLike | null | undefined;
    schedulerRouter?: unknown;
}

interface QueueProjectionUnavailableDiagnostic {
    reason: QueueProjectionRolloutReason;
    unavailableReason: QueueProjectionRolloutReason | string;
    backendStatus: string | null;
    policyHash: string | null;
    generation: number | null;
    checkedAt: number;
}

interface QueueProjectionReplaceRequestLike {
    queueType: string;
    policyHash: string;
    generation?: number | null;
    reason?: string | null;
    rows: QueueProjectionRow[];
    metadata?: Record<string, unknown> | null;
}

interface MaterializedQueueProjectionEcho {
    policyHash: string;
    generation: number;
    snapshot: QueueProjectionSnapshot;
    cardsByRowId: Map<string, FSRSCard>;
    cachedAt: number;
}

/**
 * UnifiedDataSourceManager 类
 * 
 * 统一数据源管理器，负责：
 * - 数据路由（使用高级模式路由到本地存储）
 * - 观察者管理（注册、取消注册、通知观察者）
 * - 队列访问（通过队列工厂获取队列实例）
 * 
 * 使用单例模式确保全局唯一实例。
 * 
 * @see 需求 1.4 - 单例模式
 * @see 需求 14.1, 14.2, 14.3 - 观察者模式
 */
export class UnifiedDataSourceManager {
    // ========================================================================
    // 单例模式
    // ========================================================================
    
    /**
     * 单例实例
     * 
     * @see 需求 1.4
     */
    private static instance: UnifiedDataSourceManager | null = null;
    
    /**
     * 获取单例实例
     * 
     * 如果实例不存在，则创建新实例。
     * 确保整个应用程序生命周期中只有一个 UnifiedDataSourceManager 实例。
     * 
     * @returns UnifiedDataSourceManager 单例实例
     * @see 需求 1.4
     */
    public static getInstance(): UnifiedDataSourceManager {
        if (!UnifiedDataSourceManager.instance) {
            UnifiedDataSourceManager.instance = new UnifiedDataSourceManager();
        }
        return UnifiedDataSourceManager.instance;
    }
    
    /**
     * 重置单例实例（仅用于测试）
     * 
     * 警告：此方法仅应在测试环境中使用，用于清理测试状态。
     * 在生产环境中调用此方法可能导致不可预测的行为。
     */
    public static resetInstance(): void {
        UnifiedDataSourceManager.instance = null;
    }
    
    // ========================================================================
    // 私有属性
    // ========================================================================
    
    /**
     * 已注册的观察者集合
     * 
     * 使用 Set 确保观察者唯一性。
     * 
     * @see 需求 14.1, 14.2
     */
    private observers: Set<IDataSourceObserver>;
    
    /**
     * 高级模式数据路由器
     * 
     * 只支持高级模式，使用本地存储管理卡片数据。
     * 
     * @see 需求 3.1, 3.5
     */
    private advancedRouter: IDataRouter | null;
    
    /**
     * 队列实例缓存
     * 
     * ✅ DDD 架构改进：UnifiedDataSourceManager（应用层）直接管理队列实例
     * 移除了 QueueFactory（基础设施层），避免分层违规
     * 
     * @see 需求 5.1, 15.3
     * @see .kiro/specs/bugfix/queue-initialization-ddd-refactoring.md
     */
    private queueInstances: Map<QueueType, IReviewQueue>;
    
    /**
     * 队列持久化服务
     * 
     * 用于队列数据的持久化（传递给队列构造函数）
     */
    private queuePersistence: QueuePersistencePort | null;

    /**
     * Leech 队列副作用端口
     *
     * 由组合根注入真实的思源通知/属性写入适配器。
     */
    private leechActionEffects: LeechActionEffectsPort | null;

    /**
     * 待分发的数据变更事件（同一 tick 合并）
     */
    private pendingObserverEvents: Map<string, DataChangeEvent>;
    private pendingObserverEventOrder: string[];
    private observerFlushScheduled: boolean;
    private queueProjectionUnavailableDiagnostics: Map<QueueType, QueueProjectionUnavailableDiagnostic>;
    private materializedProjectionEchoes: Map<QueueType, MaterializedQueueProjectionEcho>;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 私有构造函数
     * 
     * 防止外部直接实例化，强制使用 getInstance() 方法。
     * 初始化观察者集合。
     * 
     * @see 需求 1.4
     */
    private constructor() {
        // 初始化观察者集合
        this.observers = new Set<IDataSourceObserver>();
        
        // 初始化路由器（将通过 setAdvancedRouter 设置）
        this.advancedRouter = null;
        
        // 初始化队列实例缓存
        this.queueInstances = new Map<QueueType, IReviewQueue>();
        this.queuePersistence = null;
        this.leechActionEffects = null;
        this.pendingObserverEvents = new Map<string, DataChangeEvent>();
        this.pendingObserverEventOrder = [];
        this.observerFlushScheduled = false;
        this.queueProjectionUnavailableDiagnostics = new Map();
        this.materializedProjectionEchoes = new Map();
    }
    
    /**
     * 设置队列持久化服务
     * 
     * 必须在使用队列之前调用此方法设置队列持久化服务。
     * 
     * @param queuePersistence 队列持久化服务实例
     */
    public setQueuePersistence(queuePersistence: QueuePersistencePort): void {
        this.queuePersistence = queuePersistence;
        logger.info('QueuePersistence service set');
    }

    /**
     * 设置 Leech 队列副作用端口
     *
     * 必须在使用 Leech 队列之前由组合根注入。
     *
     * @param leechActionEffects Leech 队列副作用端口
     */
    public setLeechActionEffects(leechActionEffects: LeechActionEffectsPort): void {
        this.leechActionEffects = leechActionEffects;
        this.invalidateQueue(QueueType.Leech);
        logger.info('LeechActionEffects port set');
    }
    
    /**
     * 设置高级模式路由器
     * 
     * 设置高级模式的数据路由器。
     * 此方法应该在使用 UnifiedDataSourceManager 之前调用。
     * 
     * @param advancedRouter 高级模式数据路由器
     */
    public setAdvancedRouter(advancedRouter: IDataRouter): void {
        this.advancedRouter = advancedRouter;
    }
    
    // ========================================================================
    // 数据路由
    // ========================================================================
    
    /**
     * 获取路由器
     * 
     * 返回高级模式的数据路由器。
     * 
     * @returns 高级模式的数据路由器
     * @throws Error 如果路由器未初始化
     */
    public getRouter(): IDataRouter {
        if (!this.advancedRouter) {
            throw new Error('AdvancedDataRouter not initialized. Call setAdvancedRouter() first.');
        }
        
        return this.advancedRouter;
    }

    private resolvePlugin(): UnifiedManagerPluginLike | null {
        const router = this.getRouter() as IDataRouter & { plugin?: unknown };
        if (!router.plugin || typeof router.plugin !== 'object') {
            return null;
        }
        return router.plugin as UnifiedManagerPluginLike;
    }

    private isQueueSchedulerPort(candidate: unknown): candidate is QueueSchedulerPort {
        return (
            typeof (candidate as { answer?: unknown })?.answer === 'function'
            && typeof (candidate as { commit?: unknown })?.commit === 'function'
        );
    }

    public getSchedulerRouter(): QueueSchedulerPort {
        const plugin = this.resolvePlugin();
        const schedulerRouterCandidate =
            plugin?.getContext?.()?.getScheduler?.() ??
            plugin?.schedulerRouter;

        if (!this.isQueueSchedulerPort(schedulerRouterCandidate)) {
            throw new Error('SchedulerRouter not available - plugin initialization failed');
        }

        return schedulerRouterCandidate;
    }

    public async commitReview(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
        const plugin = this.resolvePlugin();
        const useCase = plugin?.getContext?.()?.getReviewCommitUseCase?.();
        if (!useCase || typeof useCase.execute !== 'function') {
            throw new Error('ReviewCommitUseCase not available - plugin initialization failed');
        }

        const result = await useCase.execute(command);
        if (result.committed && result.updatedCard) {
            await this.updateCard(result.updatedCard, {
                preferIncomingScheduling: true,
                schedulingWriteSource: 'review-commit',
                suppressAutosave: true,
            });
        }
        if (result.committed) {
            const queueType = this.normalizeQueueType(command.context?.queueType);
            if (queueType) {
                this.clearMaterializedProjectionEcho(queueType);
            }
        }
        return result;
    }

    public async readQueueProjectionSnapshot(
        queueType: QueueType,
        options: { forceRefresh?: boolean } = {},
    ): Promise<QueueProjectionSnapshot | null> {
        if (!this.isProjectionBackedQueue(queueType)) {
            logger.info('Queue projection rollout diagnostic', {
                ...this.getQueueProjectionRolloutDiagnostics(queueType)[0],
                forceRefresh: options.forceRefresh === true,
            });
            return null;
        }

        const backend = this.resolvePlugin()?.getContext?.()?.getSrsBackendClient?.();
        if (!backend || typeof backend.queueProjectionSnapshot !== 'function') {
            logger.debug('Queue projection snapshot backend is unavailable', { queueType });
            this.recordQueueProjectionUnavailable(queueType, 'backend-unavailable', {
                unavailableReason: 'backend-unavailable',
            });
            return null;
        }

        try {
            let result = await backend.queueProjectionSnapshot({ queueType });
            let materializedEcho: MaterializedQueueProjectionEcho | null = null;
            if (
                result.status !== 'ready'
                || !this.isValidProjectionPolicyHash(result.policyHash)
                || !this.isValidProjectionGeneration(result.generation)
            ) {
                const materialized = await this.tryMaterializeQueueProjection(queueType, backend, {
                    currentPolicyHash: result.policyHash,
                    currentGeneration: result.generation,
                    reason: 'snapshot-refresh',
                });
                if (materialized) {
                    materializedEcho = this.getMaterializedProjectionEcho(
                        queueType,
                        materialized.policyHash,
                        materialized.generation,
                    );
                    if (materializedEcho && this.isCurrentInstanceFollower()) {
                        this.clearQueueProjectionUnavailable(queueType);
                        return this.cloneQueueProjectionSnapshot(materializedEcho.snapshot);
                    }
                    result = await backend.queueProjectionSnapshot({
                        queueType,
                        policyHash: materialized.policyHash,
                        generation: materialized.generation,
                    });
                }
            }

            if (
                result.status !== 'ready'
                || !this.isValidProjectionPolicyHash(result.policyHash)
                || !this.isValidProjectionGeneration(result.generation)
            ) {
                if (materializedEcho) {
                    this.clearQueueProjectionUnavailable(queueType);
                    return this.cloneQueueProjectionSnapshot(materializedEcho.snapshot);
                }
                logger.info('Queue projection snapshot is not ready', {
                    queueType,
                    status: result.status,
                    generation: result.generation,
                    forceRefresh: options.forceRefresh === true,
                });
                this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
                    unavailableReason: 'refresh-required',
                    backendStatus: typeof result.status === 'string' ? result.status : null,
                    policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
                    generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
                });
                return null;
            }

            this.clearQueueProjectionUnavailable(queueType);
            return this.toQueueProjectionSnapshot(queueType, result);
        } catch (error) {
            logger.warn('Failed to read queue projection snapshot', {
                queueType,
                error: error instanceof Error ? error.message : String(error),
            });
            this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
                unavailableReason: error instanceof Error ? error.message : String(error),
            });
            throw createDependencyUnavailableError(
                'QUEUE_PROJECTION_UNAVAILABLE',
                `failed to read queue projection snapshot for ${queueType}`,
                error,
            );
        }
    }

    public async getQueueProjectionCardsBySnapshotIds(
        queueType: QueueType,
        ids: string[],
        options: { forceRefresh?: boolean } = {},
    ): Promise<FSRSCard[]> {
        if (!this.isProjectionBackedQueue(queueType)) {
            logger.debug('Queue projection row hydration not enabled for queue type', { queueType });
            return [];
        }

        const orderedIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
        if (orderedIds.length === 0) {
            return [];
        }

        const echoedCards = this.getMaterializedProjectionEchoCards(queueType, orderedIds);
        if (echoedCards) {
            this.clearQueueProjectionUnavailable(queueType);
            return echoedCards;
        }

        const backend = this.resolvePlugin()?.getContext?.()?.getSrsBackendClient?.();
        if (!backend || typeof backend.queueProjectionRowsByIds !== 'function') {
            logger.debug('Queue projection row hydration backend is unavailable', { queueType });
            this.recordQueueProjectionUnavailable(queueType, 'backend-unavailable', {
                unavailableReason: 'backend-unavailable',
            });
            return [];
        }

        try {
            const result = await backend.queueProjectionRowsByIds({ queueType, ids: orderedIds });
            if (result.status !== 'ready') {
                logger.info('Queue projection row hydration is not ready', {
                    queueType,
                    status: result.status,
                    generation: result.generation,
                    forceRefresh: options.forceRefresh === true,
                });
                this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
                    unavailableReason: 'refresh-required',
                    backendStatus: typeof result.status === 'string' ? result.status : null,
                    policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
                    generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
                });
                return [];
            }

            this.clearQueueProjectionUnavailable(queueType);
            return (result.cards || [])
                .filter((card): card is FSRSCard => (
                    Boolean(card)
                    && typeof card === 'object'
                    && typeof (card as FSRSCard).id === 'string'
                    && typeof (card as FSRSCard).blockId === 'string'
                ))
                .map((card) => ({ ...card }));
        } catch (error) {
            logger.warn('Failed to hydrate queue projection rows', {
                queueType,
                count: orderedIds.length,
                error: error instanceof Error ? error.message : String(error),
            });
            this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
                unavailableReason: error instanceof Error ? error.message : String(error),
            });
            throw createDependencyUnavailableError(
                'QUEUE_PROJECTION_UNAVAILABLE',
                `failed to hydrate queue projection rows for ${queueType}`,
                error,
            );
        }
    }

    public async appendDrillLogV2(log: DrillLogV2): Promise<void> {
        const plugin = this.resolvePlugin();
        const reviewLogs = plugin?.getContext?.()?.getReviewLogService?.();
        if (!reviewLogs || typeof reviewLogs.addDrillLogV2 !== 'function') {
            throw new Error('ReviewLogService not available - plugin initialization failed');
        }

        await reviewLogs.addDrillLogV2(log);
    }

    public async materializeQueueProjection(
        queueType: QueueType,
        queueOverride?: Pick<IReviewQueue, 'getCards'> | null,
    ): Promise<BackendQueueProjectionReplaceResult | null> {
        const backend = this.resolvePlugin()?.getContext?.()?.getSrsBackendClient?.();
        return this.tryMaterializeQueueProjection(queueType, backend, {
            queueOverride,
            reason: 'explicit-repair',
        });
    }

    private async tryMaterializeQueueProjection(
        queueType: QueueType,
        backend: UnifiedManagerPluginContextLike['getSrsBackendClient'] extends () => infer T ? T : never,
        options: {
            currentPolicyHash?: unknown;
            currentGeneration?: unknown;
            reason?: string;
            queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
        } = {},
    ): Promise<BackendQueueProjectionReplaceResult | null> {
        if (!this.isProjectionBackedQueue(queueType)) {
            return null;
        }
        if (!backend || typeof backend.queueProjectionReplace !== 'function') {
            logger.debug('Queue projection replace backend is unavailable', { queueType });
            return null;
        }

        const queue = options.queueOverride ?? this.getQueue(queueType);
        if (!queue || typeof queue.getCards !== 'function') {
            throw new Error(`QUEUE_PROJECTION_UNAVAILABLE: queue strategy unavailable for ${queueType}`);
        }

        const now = Date.now();
        const currentGeneration = this.isValidProjectionGeneration(options.currentGeneration)
            ? Number(options.currentGeneration)
            : 0;
        const generation = Math.max(1, currentGeneration + 1);
        const policyHash = this.isValidProjectionPolicyHash(options.currentPolicyHash)
            ? String(options.currentPolicyHash)
            : this.buildMaterializedProjectionPolicyHash(queueType);
        const cards = await queue.getCards();
        const projection = buildOrderedQueueProjectionRows({
            queueType,
            cards,
            now,
            policyHash,
            sourceGeneration: generation,
            updatedAt: now,
            membershipReason: this.resolveMaterializedProjectionMembershipReason(queueType),
        });

        const replaceRequest: QueueProjectionReplaceRequestLike = {
            queueType,
            policyHash,
            generation,
            reason: options.reason ?? 'snapshot-refresh',
            rows: projection.rows,
            metadata: {
                source: 'queue-strategy-materialization',
                cardCount: projection.rows.length,
            },
        };
        const result = await this.submitQueueProjectionReplace(backend, replaceRequest);
        this.cacheMaterializedProjectionEcho(queueType, result, cards, projection.rows);
        return result;
    }

    private async submitQueueProjectionReplace(
        backend: UnifiedManagerPluginContextLike['getSrsBackendClient'] extends () => infer T ? T : never,
        request: QueueProjectionReplaceRequestLike,
    ): Promise<BackendQueueProjectionReplaceResult> {
        const context = this.resolvePlugin()?.getContext?.();
        const runtime = context?.getFrontendInstanceRuntime?.();
        if (runtime?.getMode?.() === 'follower') {
            const follower = context?.getFollowerCommandClient?.();
            const instanceId = String(runtime.getInstanceId?.() || '').trim();
            if (!follower || typeof follower.submitAndWait !== 'function' || !instanceId) {
                throw new Error('BACKEND_UNAVAILABLE: writer relay unavailable for queue projection replace');
            }
            return follower.submitAndWait<BackendQueueProjectionReplaceResult>({
                instanceId,
                method: 'queue.projection.replace',
                params: request,
            });
        }

        if (!backend || typeof backend.queueProjectionReplace !== 'function') {
            throw new Error('BACKEND_UNAVAILABLE: queue projection replace backend is unavailable');
        }
        return backend.queueProjectionReplace(request);
    }

    private isCurrentInstanceFollower(): boolean {
        const runtime = this.resolvePlugin()?.getContext?.()?.getFrontendInstanceRuntime?.();
        return runtime?.getMode?.() === 'follower';
    }

    private cacheMaterializedProjectionEcho(
        queueType: QueueType,
        result: BackendQueueProjectionReplaceResult,
        cards: FSRSCard[],
        projectionRows: QueueProjectionRow[],
    ): void {
        if (
            result.status !== 'ready'
            || !this.isValidProjectionPolicyHash(result.policyHash)
            || !this.isValidProjectionGeneration(result.generation)
        ) {
            this.materializedProjectionEchoes.delete(queueType);
            return;
        }

        const cardById = new Map(cards.map((card) => [String(card.id || ''), card]));
        const snapshotRows: QueueSnapshotRow[] = [];
        const cardsByRowId = new Map<string, FSRSCard>();

        projectionRows.forEach((projectionRow, index) => {
            const card = cardById.get(String(projectionRow.cardId || '')) ?? cards[index];
            if (!card || typeof card.id !== 'string') {
                return;
            }
            const queueIndexHint = Number(projectionRow.queueIndexHint);
            const queueIndex = Number.isFinite(queueIndexHint) && queueIndexHint > 0
                ? Math.floor(queueIndexHint)
                : index + 1;
            const baseRow = buildQueueSnapshotRow(card, { queueIndex });
            const row: QueueSnapshotRow = {
                ...baseRow,
                id: String(projectionRow.rowId || baseRow.id),
                fsrsCardId: String(projectionRow.cardId || baseRow.fsrsCardId),
                blockId: String(projectionRow.blockId || baseRow.blockId || ''),
                deckId: String(projectionRow.deckId || baseRow.deckId || ''),
                queueIndex,
                tags: Array.isArray(baseRow.tags) ? [...baseRow.tags] : [],
            };
            snapshotRows.push(row);
            const clonedCard = this.cloneFsrsCard(card);
            cardsByRowId.set(row.id, clonedCard);
            cardsByRowId.set(row.fsrsCardId, clonedCard);
        });

        this.materializedProjectionEchoes.set(queueType, {
            policyHash: result.policyHash,
            generation: Number(result.generation),
            snapshot: {
                queueType,
                policyHash: result.policyHash,
                generation: Number(result.generation),
                rows: snapshotRows,
                counters: this.toQueueCounterSnapshot(result.counters, result.generation),
            },
            cardsByRowId,
            cachedAt: Date.now(),
        });
    }

    private getMaterializedProjectionEcho(
        queueType: QueueType,
        policyHash?: string | null,
        generation?: number | null,
    ): MaterializedQueueProjectionEcho | null {
        const echo = this.materializedProjectionEchoes.get(queueType) ?? null;
        if (!echo) {
            return null;
        }
        if (policyHash && echo.policyHash !== policyHash) {
            return null;
        }
        if (this.isValidProjectionGeneration(generation) && echo.generation !== Number(generation)) {
            return null;
        }
        return echo;
    }

    private getMaterializedProjectionEchoCards(queueType: QueueType, orderedIds: string[]): FSRSCard[] | null {
        const echo = this.getMaterializedProjectionEcho(queueType);
        if (!echo || orderedIds.length === 0) {
            return null;
        }
        const cards: FSRSCard[] = [];
        for (const id of orderedIds) {
            const card = echo.cardsByRowId.get(id);
            if (!card) {
                return null;
            }
            cards.push(this.cloneFsrsCard(card));
        }
        return cards;
    }

    private clearMaterializedProjectionEcho(queueType: QueueType): void {
        this.materializedProjectionEchoes.delete(queueType);
    }

    private clearMaterializedProjectionEchoes(): void {
        this.materializedProjectionEchoes.clear();
    }

    private buildMaterializedProjectionPolicyHash(queueType: QueueType): string {
        return `${queueType}:materialized:v1`;
    }

    private resolveMaterializedProjectionMembershipReason(queueType: QueueType): string {
        switch (queueType) {
            case QueueType.FilterGroup:
                return 'due';
            case QueueType.FinalDrill:
                return 'final-drill';
            case QueueType.Leech:
                return 'leech';
            case QueueType.NeuralRoam:
                return 'frontier-candidate';
            case QueueType.IncrementalLearning:
                return 'rotation';
            case QueueType.RetrievalPractice:
            default:
                return 'review-due';
        }
    }

    private toQueueProjectionSnapshot(
        queueType: QueueType,
        result: BackendQueueProjectionSnapshotResult,
    ): QueueProjectionSnapshot {
        return {
            queueType,
            policyHash: String(result.policyHash || ''),
            generation: Number(result.generation),
            rows: (result.rows || []).map((row) => ({
                ...row,
                tags: Array.isArray(row.tags) ? [...row.tags] : [],
            })),
            counters: this.toQueueCounterSnapshot(result.counters, result.generation),
        };
    }

    private toQueueCounterSnapshot(
        counters: BackendQueueProjectionSnapshotResult['counters'],
        generation: number | null | undefined,
    ): QueueProjectionSnapshot['counters'] {
        if (!counters) {
            return null;
        }
        return {
            version: Number(counters.version || counters.generation || generation || 0),
            remaining: Math.max(0, Math.floor(Number(counters.remaining || 0))),
            due: Math.max(0, Math.floor(Number(counters.due || 0))),
            total: Math.max(0, Math.floor(Number(counters.total || 0))),
            buckets: {
                all: Math.max(0, Math.floor(Number(counters.buckets?.all || 0))),
                item: Math.max(0, Math.floor(Number(counters.buckets?.item || 0))),
                descriptor: Math.max(0, Math.floor(Number(counters.buckets?.descriptor || 0))),
                topic: Math.max(0, Math.floor(Number(counters.buckets?.topic || 0))),
                concept: Math.max(0, Math.floor(Number(counters.buckets?.concept || 0))),
            },
            source: 'reconciled',
        };
    }

    private cloneQueueProjectionSnapshot(snapshot: QueueProjectionSnapshot): QueueProjectionSnapshot {
        return {
            ...snapshot,
            rows: snapshot.rows.map((row) => ({
                ...row,
                tags: Array.isArray(row.tags) ? [...row.tags] : [],
            })),
            counters: snapshot.counters
                ? {
                    ...snapshot.counters,
                    buckets: { ...snapshot.counters.buckets },
                }
                : null,
        };
    }

    private cloneFsrsCard(card: FSRSCard): FSRSCard {
        return {
            ...card,
            tags: Array.isArray(card.tags) ? [...card.tags] : [],
            meta: card.meta && typeof card.meta === 'object' ? { ...card.meta } : card.meta,
        };
    }

    private isProjectionBackedQueue(queueType: QueueType): boolean {
        return this.getConfiguredQueueProjectionRolloutState(queueType) === 'backend-projection';
    }

    public getQueueProjectionRolloutDiagnostics(queueType?: QueueType): QueueProjectionRolloutDiagnostic[] {
        const queueTypes = queueType ? [queueType] : QUEUE_PROJECTION_ROLLOUT_ORDER;
        return queueTypes.map((entry) => this.buildQueueProjectionRolloutDiagnostic(entry));
    }

    private buildQueueProjectionRolloutDiagnostic(queueType: QueueType): QueueProjectionRolloutDiagnostic {
        const configuredState = this.getConfiguredQueueProjectionRolloutState(queueType);
        const projectionBacked = configuredState === 'backend-projection';
        const unavailable = projectionBacked
            ? this.queueProjectionUnavailableDiagnostics.get(queueType)
            : null;
        if (unavailable) {
            return {
                queueType,
                projectionBacked: true,
                state: 'projection-unavailable',
                readPath: 'backend-projection',
                reason: unavailable.reason,
                nextCoverageTask: null,
                unavailableReason: unavailable.unavailableReason,
                backendStatus: unavailable.backendStatus,
                policyHash: unavailable.policyHash,
                generation: unavailable.generation,
                checkedAt: unavailable.checkedAt,
            };
        }

        return {
            queueType,
            projectionBacked,
            state: configuredState,
            readPath: projectionBacked ? 'backend-projection' : 'existing-queue-strategy',
            reason: this.resolveQueueProjectionRolloutReason(configuredState),
            nextCoverageTask: projectionBacked
                ? null
                : QUEUE_PROJECTION_PENDING_NEXT_STEPS[queueType] ?? 'Add projection parity before switching this queue off strategy reads.',
        };
    }

    private getConfiguredQueueProjectionRolloutState(queueType: QueueType): QueueProjectionRolloutState {
        const pluginState = this.resolvePlugin()
            ?.getContext?.()
            ?.getQueueProjectionRolloutState?.(queueType);
        const normalizedPluginState = this.normalizeQueueProjectionRolloutState(pluginState);
        if (normalizedPluginState) {
            return normalizedPluginState;
        }
        if (QUEUE_PROJECTION_BACKED_TYPES.has(queueType)) {
            return 'backend-projection';
        }
        return DEFAULT_QUEUE_PROJECTION_ROLLOUT_STATES[queueType] ?? 'existing-queue-strategy';
    }

    private normalizeQueueProjectionRolloutState(value: unknown): QueueProjectionRolloutState | null {
        switch (value) {
            case 'existing-queue-strategy':
            case 'parity-checking':
            case 'backend-projection':
            case 'projection-unavailable':
                return value;
            default:
                return null;
        }
    }

    private resolveQueueProjectionRolloutReason(
        state: QueueProjectionRolloutState,
    ): QueueProjectionRolloutReason {
        if (state === 'backend-projection') {
            return 'rollout-enabled';
        }
        if (state === 'parity-checking') {
            return 'parity-checking';
        }
        if (state === 'projection-unavailable') {
            return 'projection-unavailable';
        }
        return 'projection-rollout-pending';
    }

    private recordQueueProjectionUnavailable(
        queueType: QueueType,
        reason: QueueProjectionRolloutReason,
        details: Partial<Omit<QueueProjectionUnavailableDiagnostic, 'reason' | 'checkedAt'>> = {},
    ): void {
        this.queueProjectionUnavailableDiagnostics.set(queueType, {
            reason,
            unavailableReason: details.unavailableReason ?? reason,
            backendStatus: details.backendStatus ?? null,
            policyHash: details.policyHash ?? null,
            generation: details.generation ?? null,
            checkedAt: Date.now(),
        });
    }

    private clearQueueProjectionUnavailable(queueType: QueueType): void {
        this.queueProjectionUnavailableDiagnostics.delete(queueType);
    }

    private isValidProjectionPolicyHash(policyHash: unknown): policyHash is string {
        return typeof policyHash === 'string' && policyHash.trim().length > 0;
    }

    private isValidProjectionGeneration(generation: unknown): boolean {
        return typeof generation === 'number'
            && Number.isFinite(generation)
            && generation > 0;
    }

    private normalizeQueueType(queueType: unknown): QueueType | null {
        if (typeof queueType !== 'string') {
            return null;
        }
        return this.getAllQueueTypes().includes(queueType as QueueType)
            ? queueType as QueueType
            : null;
    }

    public getDayStartHour(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const settings = settingsService?.getSettings?.() as {
                fsrs?: { dayStartHour?: unknown };
                queues?: { dayStartHour?: unknown };
            } | undefined;
            const hour = Number(settings?.fsrs?.dayStartHour ?? settings?.queues?.dayStartHour);
            if (Number.isFinite(hour)) {
                return hour;
            }
        } catch (error) {
            logger.warn('Failed to resolve dayStartHour from settings service:', error);
        }

        return 4;
    }

    public getPriorityRandomness(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.priorityRandomness);
            if (Number.isFinite(value)) {
                return Math.max(0, Math.min(1, value));
            }
        } catch (error) {
            logger.warn('Failed to resolve priorityRandomness from settings service:', error);
        }

        return 0.1;
    }

    public getNewCardsPerDay(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.newCardsPerDay);
            if (Number.isFinite(value)) {
                return Math.max(0, Math.floor(value));
            }
        } catch (error) {
            logger.warn('Failed to resolve newCardsPerDay from settings service:', error);
        }

        return 20;
    }

    public getReviewsPerDay(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.reviewsPerDay);
            if (Number.isFinite(value)) {
                return Math.max(0, Math.floor(value));
            }
        } catch (error) {
            logger.warn('Failed to resolve reviewsPerDay from settings service:', error);
        }

        return 0;
    }

    public getFilteredReviewDefault(): 'preview-only' | 'reschedule' {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = settingsService?.getSettings?.()?.scheduler?.srsV2?.filteredReviewDefault;
            if (value === 'reschedule') {
                return 'reschedule';
            }
        } catch (error) {
            logger.warn('Failed to resolve scheduler.srsV2.filteredReviewDefault from settings service:', error);
        }

        return 'preview-only';
    }

    public getAutoSortEnabled(): boolean {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const settings = settingsService?.getSettings?.() as {
                queues?: {
                    autoSort?: { enabled?: unknown };
                };
            } | undefined;
            const enabled = settings?.queues?.autoSort?.enabled;
            if (typeof enabled === 'boolean') {
                return enabled;
            }
        } catch (error) {
            logger.warn('Failed to resolve autoSort.enabled from settings service:', error);
        }

        return true;
    }

    public getAddToOutstandingEveryNth(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const settings = settingsService?.getSettings?.() as { queues?: Record<string, unknown> } | undefined;
            const queues = settings?.queues;
            const value = Number(
                queues?.addToOutstandingEveryNth
                ?? queues?.outstandingEveryNth
                ?? queues?.outstandingSpacing
            );
            if (Number.isFinite(value)) {
                return Math.max(1, Math.min(100, Math.floor(value)));
            }
        } catch (error) {
            logger.warn('Failed to resolve add-to-outstanding spacing from settings service:', error);
        }

        return 2;
    }

    public getNeuralRoamHyperspaceSettings(): HyperspaceSettings {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const hyperspace = settingsService?.getSettings?.()?.queues?.neuralRoam?.hyperspace;
            if (hyperspace) {
                return hyperspace;
            }
        } catch (error) {
            logger.warn('Failed to resolve neuralRoam.hyperspace settings from settings service:', error);
        }

        return {
            treeChannels: {
                blockTree: false,
                documentTree: false,
            },
            maxLayersPerRepetition: 2,
            maxTotalDepth: 8,
            conceptLinkGroupPriority: 0.01,
            elementLinkGroupPriority: 0.05,
            treeChildGroupPriority: 0.16,
            treeParentGroupPriority: 0.2,
            treeSiblingBaseGroupPriority: 0.26,
            siblingDistancePenalty: 0.75,
            articleRootParentConductionProbability: 0.35,
            activationCarryDecay: 0.72,
            raceRandomness: 0.12,
        };
    }

    public getNeuralRoamHistoryMaxEntries(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.queues?.neuralRoam?.history?.maxEntries);
            if (Number.isFinite(value)) {
                return Math.max(200, Math.min(5000, Math.floor(value)));
            }
        } catch (error) {
            logger.warn('Failed to resolve neuralRoam.history.maxEntries from settings service:', error);
        }

        return 3000;
    }

    private isLoadableQueue(queue: IReviewQueue): queue is IReviewQueue & { load: () => Promise<void> } {
        return typeof (queue as IReviewQueue & { load?: unknown }).load === 'function';
    }

    private isInitialLoadAwareQueue(queue: IReviewQueue): queue is IReviewQueue & QueueInitialLoadAware {
        return typeof (queue as IReviewQueue & { setInitialLoad?: unknown }).setInitialLoad === 'function';
    }
    
    // ========================================================================
    // 观察者管理
    // ========================================================================
    
    /**
     * 注册观察者
     * 
     * 将观察者添加到观察者集合中。
     * 当数据变化时，所有已注册的观察者都会收到通知。
     * 
     * @param observer 要注册的观察者
     * @see 需求 14.1
     */
    public registerObserver(observer: IDataSourceObserver): void {
        this.observers.add(observer);
    }
    
    /**
     * 取消注册观察者
     * 
     * 从观察者集合中移除观察者。
     * 移除后，该观察者将不再收到数据变化通知。
     * 
     * @param observer 要取消注册的观察者
     * @see 需求 14.2
     */
    public unregisterObserver(observer: IDataSourceObserver): void {
        this.observers.delete(observer);
    }

    private getObserverEventKey(event: DataChangeEvent): string {
        return `${event.type}:${event.queueType ?? '*'}`;
    }

    private mergeObserverEvent(previous: DataChangeEvent, next: DataChangeEvent): DataChangeEvent {
        const mergedCardIds = Array.from(
            new Set([...(previous.cardIds ?? []), ...(next.cardIds ?? [])])
        );
        const mergedBlockIds = Array.from(
            new Set([...(previous.blockIds ?? []), ...(next.blockIds ?? [])])
        );

        return {
            type: next.type,
            queueType: next.queueType ?? previous.queueType,
            cardIds: mergedCardIds.length > 0 ? mergedCardIds : undefined,
            blockIds: mergedBlockIds.length > 0 ? mergedBlockIds : undefined,
            requiresFullRefresh: previous.requiresFullRefresh === true || next.requiresFullRefresh === true ? true : undefined,
            timestamp: Math.max(previous.timestamp, next.timestamp),
        };
    }

    private flushObserverNotifications(): void {
        this.observerFlushScheduled = false;

        if (this.pendingObserverEvents.size === 0) {
            return;
        }

        const keys = this.pendingObserverEventOrder;
        const events = keys
            .map((key) => this.pendingObserverEvents.get(key))
            .filter((event): event is DataChangeEvent => Boolean(event));

        this.pendingObserverEvents.clear();
        this.pendingObserverEventOrder = [];

        const failures: Array<{ observer: IDataSourceObserver; error: Error }> = [];

        for (const event of events) {
            for (const observer of this.observers) {
                try {
                    observer.onDataChanged(event);
                } catch (error) {
                    const errorObj = error instanceof Error ? error : new Error(String(error));
                    failures.push({ observer, error: errorObj });
                    logger.error('Observer notification failed:', errorObj);
                }
            }
        }

        if (failures.length > 0) {
            logger.warn(`${failures.length} observer notifications failed; observers=${this.observers.size}`);
        }
    }
    
    /**
     * 通知所有观察者
     * 
     * 当数据变化时，通知所有已注册的观察者。
     * 包含错误处理，确保一个观察者的错误不会影响其他观察者。
     * 
     * 错误处理策略：
     * - 捕获每个观察者的错误，不中断通知流程
     * - 记录失败的观察者和错误信息
     * - 继续通知其他观察者
     * - 在所有通知完成后，如果有失败，记录警告日志
     * 
     * @param event 数据变更事件
     * @see 需求 14.3, 14.4
     */
    public notifyObservers(event: DataChangeEvent): void {
        const normalized: DataChangeEvent = {
            ...event,
            timestamp: event.timestamp || Date.now(),
        };

        const key = this.getObserverEventKey(normalized);
        const existing = this.pendingObserverEvents.get(key);
        if (existing) {
            this.pendingObserverEvents.set(key, this.mergeObserverEvent(existing, normalized));
        } else {
            this.pendingObserverEvents.set(key, normalized);
            this.pendingObserverEventOrder.push(key);
        }

        if (!this.observerFlushScheduled) {
            this.observerFlushScheduled = true;
            queueMicrotask(() => this.flushObserverNotifications());
        }
    }
    
    // ========================================================================
    // 数据访问
    // ========================================================================
    
    /**
     * 获取单个卡片
     * 
     * 通过当前路由器获取卡片数据。
     * 包含错误处理，确保数据访问的可靠性。
     * 
     * @param cardId 卡片 ID
     * @param options 可选参数
     * @param options.silent 是否静默模式（不记录错误日志）
     * @returns 卡片数据
     * @throws Error 如果卡片不存在或数据访问失败
     * @see 需求 11.1
     */
    public async getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard> {
        try {
            const router = this.getRouter();
            const card = await router.getCard(cardId);
            return card;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // 如果不是静默模式，记录错误日志
            if (!options?.silent) {
                logger.error(`Failed to get card ${cardId}:`, errorMessage);
            }
            
            throw new Error(`获取卡片失败 (${cardId}): ${errorMessage}`);
        }
    }
    
    /**
     * 获取卡片列表
     * 
     * 通过当前路由器获取卡片列表，支持可选的过滤条件。
     * 包含错误处理，确保数据访问的可靠性。
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @throws Error 如果数据访问失败
     * @see 需求 11.1
     */
    public async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        try {
            const router = this.getRouter();
            const cards = await router.getCards(filter);
            return cards;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to get cards:', errorMessage);
            throw new Error(`获取卡片列表失败: ${errorMessage}`);
        }
    }
    
    /**
     * 更新卡片
     * 
     * 通过当前路由器更新卡片，并执行以下操作：
     * 1. 更新卡片数据
     * 2. 使受影响的队列缓存失效
     * 3. 通知所有观察者
     * 
     * 错误处理策略：
     * - 如果更新失败，不通知观察者
     * - 记录错误日志
     * - 抛出错误给调用者
     * 
     * @param card 要更新的卡片
     * @throws Error 如果更新失败
     * @see 需求 11.1, 11.2, 11.4, 15.3
     */
    public async updateCard(card: FSRSCard, options: CardMutationOptions = {}): Promise<void> {
        try {
            // 1. 通过当前路由器更新卡片
            const router = this.getRouter();
            await router.updateCard(card, options);
            await this.onCardUpdatedFromScheduler(card);
            
            logger.debug(`Card updated: ${card.id}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to update card ${card.id}:`, errorMessage);
            throw new Error(`更新卡片失败 (${card.id}): ${errorMessage}`);
        }
    }

    public async batchUpdateCards(
        cards: FSRSCard[],
        options: CardMutationOptions = {},
    ): Promise<BatchCardMutationResult> {
        const cardsToUpdate = this.normalizeCards(cards);
        if (cardsToUpdate.length === 0) {
            return {
                attemptedCount: 0,
                updatedCount: 0,
                updatedCardIds: [],
                failedCardIds: [],
            };
        }

        try {
            const router = this.getRouter();
            if (typeof router.batchUpdateCards !== 'function') {
                throw new Error('Data router batchUpdateCards is unavailable');
            }

            const result = await router.batchUpdateCards(cardsToUpdate, options);
            const updatedIds = new Set(result.updatedCardIds);
            const updatedCards = cardsToUpdate.filter((card) => updatedIds.has(card.id));
            if (updatedCards.length > 0) {
                await this.onCardsUpdatedFromScheduler(updatedCards);
            }
            logger.debug(`Batch cards updated: ${result.updatedCount}/${result.attemptedCount}`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to batch update cards:', errorMessage);
            throw new Error(`批量更新卡片失败: ${errorMessage}`);
        }
    }

    public async restoreCardSnapshotForFailedFeedback(card: FSRSCard): Promise<void> {
        const plugin = this.resolvePlugin();
        const storage = plugin?.getContext?.()?.getUnifiedStorage?.();
        if (!storage || typeof storage.updateCard !== 'function') {
            throw new Error('UnifiedStorageManager not available for feedback rollback');
        }

        const result = await storage.updateCard(card, {
            preferIncomingScheduling: true,
            schedulingWriteSource: 'review-commit',
            suppressAutosave: true,
        });
        if (!result.ok) {
            throw result.error ?? new Error(`Failed to restore card snapshot: ${card.id}`);
        }
    }

    /**
     * 处理“卡片已经持久化完成”后的统一数据流：
     * - 失效受影响队列缓存
     * - 通知观察者刷新
     *
     * 供 SchedulerRouter 路径复用，避免重复写入存储。
     */
    public async onCardUpdatedFromScheduler(card: FSRSCard): Promise<void> {
        await this.onCardsUpdatedFromScheduler([card]);
    }

    public async onCardsUpdatedFromScheduler(cards: FSRSCard[]): Promise<void> {
        const updatedCards = this.normalizeCards(cards);
        if (updatedCards.length === 0) {
            return;
        }

        const affectedQueueTypes = this.invalidateQueuesForCardMutation();

        const affectedIds = Array.from(new Set(
            updatedCards.flatMap((card) => [card.id, card.blockId].filter(Boolean))
        ));
        const timestamp = Date.now();
        this.notifyObservers({
            type: 'card-updated',
            cardIds: affectedIds,
            timestamp,
        });

        for (const queueType of affectedQueueTypes) {
            this.notifyObservers({
                type: 'queue-changed',
                queueType,
                timestamp,
            });
        }
    }

    /**
     * 处理“卡片已创建并持久化完成”后的统一数据流。
     */
    public async onCardCreated(card: FSRSCard): Promise<void> {
        const affectedQueueTypes = this.invalidateQueuesForCardMutation();

        const affectedIds = Array.from(new Set([card.id, card.blockId].filter(Boolean)));
        const timestamp = Date.now();
        this.notifyObservers({
            type: 'card-created',
            cardIds: affectedIds,
            timestamp,
        });

        for (const queueType of affectedQueueTypes) {
            this.notifyObservers({
                type: 'queue-changed',
                queueType,
                timestamp,
            });
        }
    }

    /**
     * 处理“卡片已删除并持久化完成”后的统一数据流。
     */
    public async onCardsDeleted(cardIds: string[], blockIds: string[] = []): Promise<void> {
        const affectedCardIds = this.normalizeEventIds(cardIds);
        const affectedBlockIds = this.normalizeEventIds(blockIds);
        if (affectedCardIds.length === 0 && affectedBlockIds.length === 0) {
            return;
        }

        this.invalidateAllQueues();

        const timestamp = Date.now();
        this.notifyObservers({
            type: 'card-deleted',
            cardIds: affectedCardIds.length > 0 ? affectedCardIds : undefined,
            blockIds: affectedBlockIds.length > 0 ? affectedBlockIds : undefined,
            timestamp,
        });

        for (const queueType of this.getAllQueueTypes()) {
            this.notifyObservers({
                type: 'queue-changed',
                queueType,
                timestamp,
            });
        }
    }
    
    /**
     * 删除卡片
     * 
     * 通过当前路由器删除卡片，并执行以下操作：
     * 1. 删除卡片数据
     * 2. 使受影响的队列缓存失效
     * 3. 通知所有观察者
     * 
     * 错误处理策略：
     * - 如果删除失败，不通知观察者
     * - 记录错误日志
     * - 抛出错误给调用者
     * 
     * @param cardId 要删除的卡片 ID
     * @throws Error 如果删除失败
     * @see 需求 11.1, 11.2, 11.4, 15.3
     */
    public async deleteCard(cardId: string): Promise<void> {
        try {
            let deletedBlockId: string | undefined;
            try {
                const existingCard = await this.getCard(cardId, { silent: true });
                deletedBlockId = existingCard.blockId;
            } catch {
                // 忽略预读取失败，仍按 cardId 继续删除
            }

            // 1. 通过当前路由器删除卡片
            const router = this.getRouter();
            await router.deleteCard(cardId);
            await this.onCardsDeleted([cardId], deletedBlockId ? [deletedBlockId] : []);
            
            logger.debug(`Card deleted: ${cardId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to delete card ${cardId}:`, errorMessage);
            throw new Error(`删除卡片失败 (${cardId}): ${errorMessage}`);
        }
    }
    
    // ========================================================================
    // 队列访问
    // ========================================================================
    
    /**
     * 获取队列实例（懒加载）
     * 
     * ✅ DDD 架构改进：UnifiedDataSourceManager 直接创建队列
     * - 应用层服务负责队列访问和生命周期管理
     * - 队列实例会被缓存，避免重复创建
     * - 队列构造函数接收 manager（this）作为第一个参数
     * - 🆕 创建后自动调用 load() 加载持久化数据（同步等待）
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @throws {QueueError} 如果队列类型未知或 QueuePersistence 未初始化
     * @see 需求 1.1, 2.1, 3.1
     * @see .kiro/specs/bugfix/queue-initialization-ddd-refactoring.md
     */
    public getQueue(type: QueueType): IReviewQueue {
        // 检查缓存
        if (this.queueInstances.has(type)) {
            return this.queueInstances.get(type)!;
        }
        
        // 创建新队列实例
        const queue = this.createQueue(type);
        
        // 触发异步 load，并通过显式端口注入到队列基类做“首次访问门闩”。
        if (this.isLoadableQueue(queue) && this.isInitialLoadAwareQueue(queue)) {
            const loadPromise = queue.load().catch((error: Error) => {
                logger.error(`Failed to load queue ${type}:`, error);
            });
            queue.setInitialLoad(loadPromise);
        }
        
        this.queueInstances.set(type, queue);
        
        logger.info(`Queue created: ${type}`);
        return queue;
    }
    
    /**
     * 创建队列实例（私有工厂方法）
     * 
     * 根据队列类型创建相应的队列实例。
     * 所有队列都通过 DDD 队列实现创建：
     * 1. manager: UnifiedDataSourceManager（this）
     * 2. queuePersistence: QueuePersistenceService（可选，某些队列不需要）
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @throws {QueueError} 如果队列类型未知
     */
    private createQueue(type: QueueType): IReviewQueue {
        if (type !== QueueType.Leech && !this.queuePersistence) {
            throw new QueueError('QueuePersistence not initialized. Call setQueuePersistence() first.');
        }

        const autoFailedSink = this.createAutoFailedSink();

        switch (type) {
            case QueueType.RetrievalPractice:
                return new RetrievalPracticeQueue(this, this.queuePersistence!, { autoFailedSink });
            
            case QueueType.IncrementalLearning:
                return new IncrementalLearningQueue(this, this.queuePersistence!, { autoFailedSink });
            
            case QueueType.FilterGroup:
                return new FilterGroupQueue(this, this.queuePersistence!, {}, { autoFailedSink });
            
            case QueueType.FinalDrill:
                return new FinalDrillQueue(this, this.queuePersistence!);
            
            case QueueType.NeuralRoam:
                return new NeuralRoamQueue(this, this.queuePersistence!, {
                    nodeTypeResolver: {
                        resolveNodeType: async (blockId: string) => this.resolveNeuralRoamNodeType(blockId),
                    },
                    getHistoryLimit: () => this.getNeuralRoamHistoryMaxEntries(),
                    getHyperspaceSettings: () => this.getNeuralRoamHyperspaceSettings(),
                });
            
            case QueueType.Leech:
                if (!this.leechActionEffects) {
                    throw new QueueError('LeechActionEffectsPort not initialized. Call setLeechActionEffects() first.');
                }
                return new LeechReviewQueue(this, {
                    effects: this.leechActionEffects,
                });
            
            default:
                throw new QueueError(`Unknown queue type: ${type}`);
        }
    }

    public async batchDeleteCards(
        cardIds: string[],
        options: { blockIds?: string[] } = {}
    ): Promise<BatchCardDeleteResult> {
        const normalizedCardIds = this.normalizeEventIds(cardIds);
        if (normalizedCardIds.length === 0) {
            return {
                attemptedCount: 0,
                deletedCount: 0,
                deletedCardIds: [],
                failedCardIds: [],
            };
        }

        try {
            const router = this.getRouter();
            if (typeof router.batchDeleteCards !== 'function') {
                throw new Error('Data router batchDeleteCards is unavailable');
            }

            const result = await router.batchDeleteCards(normalizedCardIds);
            if (result.deletedCount > 0) {
                await this.onCardsDeleted(result.deletedCardIds, options.blockIds ?? []);
            }
            logger.debug(`Batch cards deleted: ${result.deletedCount}/${result.attemptedCount}`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to batch delete cards:', errorMessage);
            throw new Error(`批量删除卡片失败: ${errorMessage}`);
        }
    }

    public async batchAddToQueue(
        type: QueueType,
        cards: QueueBulkAddInput[],
        source: QueueAddSource = 'manual'
    ): Promise<QueueBulkMutationResult> {
        const queue = this.getQueue(type);
        if (typeof queue.addCards !== 'function') {
            throw new Error(`Queue ${type} batch add is unavailable`);
        }
        return queue.addCards(cards, source);
    }

    public async batchRemoveFromQueue(
        type: QueueType,
        cardIdsOrBlockIds: string[]
    ): Promise<QueueBulkMutationResult> {
        const queue = this.getQueue(type);
        if (typeof queue.removeCards !== 'function') {
            throw new Error(`Queue ${type} batch remove is unavailable`);
        }
        return queue.removeCards(cardIdsOrBlockIds);
    }

    private async resolveNeuralRoamNodeType(blockId: string): Promise<NeuralRoamNodeType> {
        const normalizedBlockId = String(blockId || '').trim();
        if (!normalizedBlockId) {
            return 'unknown';
        }

        try {
            const localCard = await this.findExactLocalCardByBlockId(normalizedBlockId);
            if (localCard) {
                return this.mapLocalCardToNeuralRoamNodeType(localCard);
            }

            const detected = await this.resolveDetectedNeuralRoamCardType(normalizedBlockId);
            if (detected === 'item') {
                return 'item';
            }

            return 'topic';
        } catch (error) {
            logger.warn(`Failed to resolve neural roam node type from local card ${normalizedBlockId}:`, error);
            return 'unknown';
        }
    }

    private async findExactLocalCardByBlockId(blockId: string): Promise<FSRSCard | null> {
        const cards = await this.getCards({
            blockIds: [blockId],
        });
        return cards.find((card) => card.blockId === blockId) ?? null;
    }

    private mapLocalCardToNeuralRoamNodeType(card: FSRSCard): NeuralRoamNodeType {
        const marker = typeof card.cardTypeMarker === 'string' ? card.cardTypeMarker : '';
        const metaMarker = typeof (card.meta as { cardTypeMarker?: unknown } | undefined)?.cardTypeMarker === 'string'
            ? String((card.meta as { cardTypeMarker?: string }).cardTypeMarker)
            : '';

        if (card.type === 'concept' || marker === 'concept' || metaMarker === 'concept') {
            return 'concept';
        }
        if (card.type === 'descriptor' || marker === 'descriptor' || metaMarker === 'descriptor') {
            return 'descriptor';
        }
        if (card.type === 'topic') {
            return 'topic';
        }
        return 'item';
    }

    private async resolveDetectedNeuralRoamCardType(blockId: string): Promise<'item' | 'topic'> {
        const plugin = this.resolvePlugin();
        const service = plugin?.getContext?.()?.getCardTypeDetectionService?.();
        if (!service || typeof service.detectCardType !== 'function') {
            return 'topic';
        }

        try {
            return await service.detectCardType(blockId);
        } catch (error) {
            logger.warn(`Failed to detect neural roam card type for ${blockId}:`, error);
            return 'topic';
        }
    }

    private createAutoFailedSink(): AutoFailedCardSinkPort {
        return {
            addAutoFailed: async (cardId: string): Promise<void> => {
                const finalDrillQueue = this.getQueue(QueueType.FinalDrill);
                await finalDrillQueue.addCard(cardId, 'auto-failed');
            },
        };
    }
    
    /**
     * 使队列缓存失效
     * 
     * 删除指定队列的缓存实例，下次访问时将重新创建。
     * 用于在卡片数据变化时刷新队列。
     * 
     * @param type 队列类型
     * @see 需求 15.3
     */
    public invalidateQueue(type: QueueType): void {
        this.queueInstances.delete(type);
        this.clearMaterializedProjectionEcho(type);
        logger.debug(`Queue cache invalidated: ${type}`);
    }

    private invalidateQueuesForCardMutation(): QueueType[] {
        // 卡片更新会影响动态队列的可见集与排序
        const affectedQueueTypes = [
            QueueType.RetrievalPractice,
            QueueType.IncrementalLearning,
            QueueType.FilterGroup,
        ];

        for (const queueType of affectedQueueTypes) {
            this.invalidateQueue(queueType);
        }

        return affectedQueueTypes;
    }
    
    /**
     * 使所有队列缓存失效
     * 
     * 清空所有队列缓存，用于模式切换等场景。
     */
    public invalidateAllQueues(): void {
        this.queueInstances.clear();
        this.clearMaterializedProjectionEchoes();
        logger.debug('All queue caches invalidated');
    }

    private getAllQueueTypes(): QueueType[] {
        return Object.values(QueueType);
    }

    private normalizeEventIds(ids: readonly string[] | undefined): string[] {
        return Array.from(new Set(
            (ids ?? [])
                .map((id) => String(id || '').trim())
                .filter((id) => id.length > 0)
        ));
    }

    private normalizeCards(cards: readonly FSRSCard[] | undefined): FSRSCard[] {
        const deduped = new Map<string, FSRSCard>();
        for (const card of cards ?? []) {
            const cardId = String(card?.id || '').trim();
            if (!cardId) {
                continue;
            }
            deduped.set(cardId, card);
        }
        return Array.from(deduped.values());
    }
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * 返回高级模式下可用的队列类型列表。
     * 高级模式支持：检索练习、最终训练、渐进学习、过滤组、神经漫游（5 种）
     * 
     * @returns 队列类型数组
     * @see 需求 2.1, 3.1
     */
    public getAvailableQueueTypes(): QueueType[] {
        const router = this.getRouter();
        return router.getAvailableQueueTypes();
    }
}
