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
    type QueueProjectionRolloutState,
} from '@/types/unified-data-source';
import type { QueueProjectionLiveIdentityListener } from '@/types/queue-projection-live-identity';
import type { QueueProjectionLiveIdentityEvent } from '@/types/queue-projection-live-identity';
import { normalizeNeuralRoamPriority } from '@/core/queue/neural/NeuralRoamCardFacts';
import type { FSRSCard } from '@/types/card';
import type { DrillLogV2 } from '@/types/review';
// ✅ DDD 架构：UnifiedDataSourceManager（应用层）直接创建队列，不依赖 QueueFactory（基础设施层）
import { RetrievalPracticeQueue } from '@/core/queue/domain/RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '@/core/queue/domain/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/domain/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { LeechReviewQueue } from '@/core/queue/domain/LeechReviewQueue';
import type { NeuralRoamRouteCatalog } from '@/core/queue/neural/routes';
import type { QueueInitialLoadAware, QueueSchedulerPort } from '@/core/queue/managers/UnifiedDataSourceManager';
import type { QueueReviewCommand, QueueReviewCommitResult } from '@/core/queue/managers/UnifiedDataSourceManager';
import type {
    AutoFailedCardSinkPort,
    LeechActionEffectsPort,
    NeuralRoamNodeType,
    QueuePersistencePort,
} from '@/core/queue/domain/ports';
import { createLogger } from '@/utils/logger';
import { incrementRuntimePerformanceCounter } from '@/utils/runtimePerformanceDiagnostics';
import type { HyperspaceSettings } from '@/types/settings';
import type {
    BackendNeuralRoamAdvanceRequest,
    BackendNeuralRoamAdvanceResult,
    BackendNeuralRoamCommandRequest,
    BackendNeuralRoamCommandResult,
    BackendNeuralRoamViewStateRequest,
    BackendNeuralRoamViewStateResult,
    BackendQueueProjectionRowsByIdsResult,
    BackendQueueProjectionReplaceResult,
    BackendQueueProjectionSnapshotRequest,
    BackendQueueProjectionSnapshotResult,
    QueueProjectionReadiness,
    QueueProjectionReadinessRequest,
} from '../../../packages/contracts/src/backend-rpc';
import { QueueProjectionRuntime } from '@/application/services/queue-projection/QueueProjectionRuntime';
import { QueueProjectionReadModule } from '@/application/services/queue-projection/QueueProjectionReadModule';
import type { BlockContentResult } from '@/application/queries/CardContentQueryService';

const logger = createLogger('UnifiedDataSourceManager');

interface UnifiedManagerPluginContextLike {
    getScheduler?: () => unknown;
    getCardTypeDetectionService?: () => {
        detectCardType?: (blockId: string) => Promise<'item' | 'topic'>;
    } | null | undefined;
    getCardContentQueryService?: () => {
        getBlockContentsWithType?: (blockIds: string[]) => Promise<Map<string, BlockContentResult>>;
    } | null | undefined;
    getSettingsService?: () => {
        getSettings?: () => {
            fsrs?: { dayStartHour?: unknown };
            newCardsPerDay?: unknown;
            reviewsPerDay?: unknown;
            scheduler?: {
                srsV2?: {
                    filteredReviewDefault?: unknown;
                    learnAhead?: {
                        windowMinutes?: unknown;
                        maxCards?: unknown;
                    };
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
    getReviewAttemptKernel?: () => {
        execute?: (command: QueueReviewCommand) => Promise<QueueReviewCommitResult>;
    } | null | undefined;
    getFrontendInstanceRuntime?: () => {
        getMode?: () => 'writer' | 'follower' | string;
        getInstanceId?: () => string;
        ensureWritable?: () => Promise<void>;
        publishQueueProjectionIdentityBroadcast?: (event: QueueProjectionLiveIdentityEvent) => Promise<void> | void;
        subscribeQueueProjectionIdentityBroadcasts?: (
            listener: QueueProjectionLiveIdentityListener,
        ) => () => void;
    } | null | undefined;
    getFollowerCommandClient?: () => {
        submitAndWait?: <TResult>(request: {
            instanceId: string;
            method: string;
            params?: unknown;
        }) => Promise<TResult>;
    } | null | undefined;
    getQueueProjectionRolloutState?: (
        queueType: QueueType,
    ) => QueueProjectionRolloutState | string | null | undefined;
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
        neuralRoamAdvance?: (
            request: BackendNeuralRoamAdvanceRequest,
        ) => Promise<BackendNeuralRoamAdvanceResult>;
        neuralRoamViewState?: (
            request: BackendNeuralRoamViewStateRequest,
        ) => Promise<BackendNeuralRoamViewStateResult>;
        neuralRoamCommand?: (
            request: BackendNeuralRoamCommandRequest,
        ) => Promise<BackendNeuralRoamCommandResult>;
    } | null | undefined;
    getReviewLogService?: () => {
        addDrillLogV2?: (log: DrillLogV2) => Promise<void>;
    } | null | undefined;
    getUnifiedStorage?: () => {
        updateCard?: (
            card: FSRSCard,
            options?: CardMutationOptions
        ) => Promise<{ ok: boolean; error?: Error }> | { ok: boolean; error?: Error };
    } | null | undefined;
}

interface UnifiedManagerPluginLike {
    getContext?: () => UnifiedManagerPluginContextLike | null | undefined;
    schedulerRouter?: unknown;
}

interface QueueProjectionReplaceRequestLike {
    queueType: string;
    policyHash: string;
    generation?: number | null;
    reason?: string | null;
    rows: unknown[];
    metadata?: Record<string, unknown> | null;
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
    private neuralRoamRouteCatalog: NeuralRoamRouteCatalog | null;

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
    private readonly queueProjectionRuntime: QueueProjectionRuntime;
    private readonly queueProjectionReadModule: QueueProjectionReadModule;
    private unsubscribeQueueProjectionIdentityBroadcasts: (() => void) | null;
    
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
        this.neuralRoamRouteCatalog = null;
        this.leechActionEffects = null;
        this.pendingObserverEvents = new Map<string, DataChangeEvent>();
        this.pendingObserverEventOrder = [];
        this.observerFlushScheduled = false;
        this.unsubscribeQueueProjectionIdentityBroadcasts = null;
        this.queueProjectionRuntime = new QueueProjectionRuntime({
            getBackendClient: () => this.resolvePluginContext()?.getSrsBackendClient?.(),
            getFollowerCommandClient: () => this.resolvePluginContext()?.getFollowerCommandClient?.(),
            getFrontendRuntime: () => this.resolvePluginContext()?.getFrontendInstanceRuntime?.(),
            getQueue: (queueType) => this.getQueue(queueType),
            getQueueProjectionRolloutState: (queueType) => (
                this.resolvePluginContext()?.getQueueProjectionRolloutState?.(queueType)
            ),
            publishQueueProjectionIdentityBroadcast: (event) => (
                this.resolvePluginContext()
                    ?.getFrontendInstanceRuntime?.()
                    ?.publishQueueProjectionIdentityBroadcast?.(event)
            ),
            logger,
        });
        this.queueProjectionReadModule = new QueueProjectionReadModule({
            runtime: this.queueProjectionRuntime,
        });
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

    public setNeuralRoamRouteCatalog(routeCatalog: NeuralRoamRouteCatalog | null): void {
        this.neuralRoamRouteCatalog = routeCatalog;
        this.invalidateQueue(QueueType.NeuralRoam);
        logger.info('NeuralRoam route catalog set', { enabled: routeCatalog !== null });
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
        this.refreshQueueProjectionIdentityBroadcastSubscription();
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
        if (!this.advancedRouter) {
            return null;
        }
        const router = this.advancedRouter as IDataRouter & { plugin?: unknown };
        if (!router.plugin || typeof router.plugin !== 'object') {
            return null;
        }
        return router.plugin as UnifiedManagerPluginLike;
    }

    private resolvePluginContext(): UnifiedManagerPluginContextLike | null {
        const plugin = this.resolvePlugin();
        try {
            return plugin?.getContext?.() ?? null;
        } catch (error) {
            if (error instanceof Error && error.message === 'ApplicationContext is not ready') {
                return null;
            }
            throw error;
        }
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
        const kernel = plugin?.getContext?.()?.getReviewAttemptKernel?.();
        if (!kernel || typeof kernel.execute !== 'function') {
            throw new Error('ReviewAttemptKernel not available - plugin initialization failed');
        }

        const result = await kernel.execute(command);
        if (result.committed && result.updatedCard) {
            await this.refreshLocalReadModelFromCommittedBackendReview(result.updatedCard);
            await this.onCardUpdatedFromScheduler(result.updatedCard);
        }
        if (result.committed) {
            const queueType = this.normalizeQueueType(command.context?.queueType);
            if (queueType) {
                this.queueProjectionRuntime.clearMaterializedProjectionEcho(queueType);
            }
        }
        return result;
    }

    private async refreshLocalReadModelFromCommittedBackendReview(card: FSRSCard): Promise<void> {
        const router = this.getRouter();
        if (typeof router.refreshCommittedBackendReviewCard !== 'function') {
            throw new Error('AdvancedDataRouter local review read-model refresh is unavailable');
        }
        await router.refreshCommittedBackendReviewCard(card);
    }

    public readonly neuralRoamAdvance = async (
        request: BackendNeuralRoamAdvanceRequest,
    ): Promise<BackendNeuralRoamAdvanceResult> => {
        const normalizedRequest: BackendNeuralRoamAdvanceRequest = {
            ...request,
            queueType: 'neural-roam',
        };
        const context = this.resolvePlugin()?.getContext?.();
        const runtime = context?.getFrontendInstanceRuntime?.();
        if (runtime?.getMode?.() === 'follower' && typeof runtime.ensureWritable === 'function') {
            try {
                await runtime.ensureWritable();
            } catch {
                // Keep explicit follower relay/unavailable handling below.
            }
        }

        if (runtime?.getMode?.() === 'follower') {
            const follower = context?.getFollowerCommandClient?.();
            const instanceId = String(runtime.getInstanceId?.() || '').trim();
            if (!follower || typeof follower.submitAndWait !== 'function' || !instanceId) {
                return this.buildUnavailableNeuralRoamAdvanceResult(
                    normalizedRequest,
                    'writer-unavailable',
                    'Writer relay unavailable for neural-roam.advance',
                );
            }
            try {
                return await follower.submitAndWait<BackendNeuralRoamAdvanceResult>({
                    instanceId,
                    method: 'neural-roam.advance',
                    params: normalizedRequest,
                });
            } catch (error) {
                return this.buildUnavailableNeuralRoamAdvanceResult(
                    normalizedRequest,
                    'writer-unavailable',
                    error instanceof Error ? error.message : String(error),
                );
            }
        }

        const backend = context?.getSrsBackendClient?.();
        if (!backend || typeof backend.neuralRoamAdvance !== 'function') {
            return this.buildUnavailableNeuralRoamAdvanceResult(
                normalizedRequest,
                'advance-contract-unavailable',
                'SrsBackendClient neural-roam.advance is unavailable',
            );
        }

        return backend.neuralRoamAdvance(normalizedRequest);
    };

    public readonly readNeuralRoamViewState = async (
        request: BackendNeuralRoamViewStateRequest = { queueType: 'neural-roam' },
    ): Promise<BackendNeuralRoamViewStateResult> => {
        const normalizedRequest: BackendNeuralRoamViewStateRequest = {
            ...request,
            queueType: 'neural-roam',
        };
        const context = this.resolvePluginContext();
        const runtime = context?.getFrontendInstanceRuntime?.();
        if (runtime?.getMode?.() === 'follower' && typeof runtime.ensureWritable === 'function') {
            try {
                await runtime.ensureWritable();
            } catch {
                // Keep explicit follower relay/unavailable handling below.
            }
        }

        if (runtime?.getMode?.() === 'follower') {
            const follower = context?.getFollowerCommandClient?.();
            const instanceId = String(runtime.getInstanceId?.() || '').trim();
            if (!follower || typeof follower.submitAndWait !== 'function' || !instanceId) {
                return {
                    queueType: 'neural-roam',
                    status: 'unavailable',
                    viewState: null,
                    unavailableReason: 'writer-unavailable',
                    message: 'Writer relay unavailable for neural-roam.viewState',
                };
            }
            try {
                return await follower.submitAndWait<BackendNeuralRoamViewStateResult>({
                    instanceId,
                    method: 'neural-roam.viewState',
                    params: normalizedRequest,
                });
            } catch (error) {
                return {
                    queueType: 'neural-roam',
                    status: 'unavailable',
                    viewState: null,
                    unavailableReason: 'writer-unavailable',
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        }

        const backend = context?.getSrsBackendClient?.();
        if (!backend || typeof backend.neuralRoamViewState !== 'function') {
            return {
                queueType: 'neural-roam',
                status: 'unavailable',
                viewState: null,
                unavailableReason: 'advance-contract-unavailable',
                message: 'SrsBackendClient neural-roam.viewState is unavailable',
            };
        }

        return backend.neuralRoamViewState(normalizedRequest);
    };

    public readonly neuralRoamCommand = async (
        request: BackendNeuralRoamCommandRequest,
    ): Promise<BackendNeuralRoamCommandResult> => {
        const normalizedRequest: BackendNeuralRoamCommandRequest = {
            ...request,
            queueType: 'neural-roam',
        };
        const context = this.resolvePluginContext();
        const runtime = context?.getFrontendInstanceRuntime?.();
        if (runtime?.getMode?.() === 'follower' && typeof runtime.ensureWritable === 'function') {
            try {
                await runtime.ensureWritable();
            } catch {
                // Keep explicit follower relay/unavailable handling below.
            }
        }
        if (runtime?.getMode?.() === 'follower') {
            const follower = context?.getFollowerCommandClient?.();
            const instanceId = String(runtime.getInstanceId?.() || '').trim();
            if (!follower || typeof follower.submitAndWait !== 'function' || !instanceId) {
                return {
                    queueType: 'neural-roam',
                    status: 'unavailable',
                    viewState: null,
                    queueState: null,
                    unavailableReason: 'writer-unavailable',
                    message: 'Writer relay unavailable for neural-roam.command',
                };
            }
            try {
                return await follower.submitAndWait<BackendNeuralRoamCommandResult>({
                    instanceId,
                    method: 'neural-roam.command',
                    params: normalizedRequest,
                });
            } catch (error) {
                return {
                    queueType: 'neural-roam',
                    status: 'unavailable',
                    viewState: null,
                    queueState: null,
                    unavailableReason: 'writer-unavailable',
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        }
        const backend = context?.getSrsBackendClient?.();
        if (!backend || typeof backend.neuralRoamCommand !== 'function') {
            return {
                queueType: 'neural-roam',
                status: 'unavailable',
                viewState: null,
                queueState: null,
                unavailableReason: 'advance-contract-unavailable',
                message: 'SrsBackendClient neural-roam.command is unavailable',
            };
        }
        return backend.neuralRoamCommand(normalizedRequest);
    };

    private buildUnavailableNeuralRoamAdvanceResult(
        request: BackendNeuralRoamAdvanceRequest,
        unavailableReason: BackendNeuralRoamAdvanceResult['unavailableReason'],
        message: string,
    ): BackendNeuralRoamAdvanceResult {
        return {
            queueType: 'neural-roam',
            sessionId: request.sessionId ?? null,
            status: unavailableReason === 'generation-mismatch'
                || unavailableReason === 'policy-mismatch'
                || unavailableReason === 'route-mismatch'
                ? 'mismatch'
                : 'unavailable',
            nextItem: null,
            counters: {
                routeId: request.routeId ?? null,
                remaining: 0,
                due: 0,
                total: 0,
                pendingAssociatedReview: 0,
                sourceNodes: 0,
            },
            sessionState: {
                sessionId: request.sessionId ?? null,
                routeId: request.routeId ?? null,
                engineMode: null,
                currentNodeId: null,
                currentEventId: null,
                pathLength: 0,
                historyCount: 0,
                exhausted: false,
                projectionGeneration: request.projectionGeneration ?? null,
                policyHash: request.policyHash ?? null,
            },
            queueState: null,
            viewState: null,
            routeId: request.routeId ?? null,
            projectionImpact: null,
            unavailableReason,
            message,
        };
    }

    public async readQueueProjectionSnapshot(
        queueType: QueueType,
        options: { forceRefresh?: boolean } = {},
    ): Promise<QueueProjectionSnapshot | null> {
        return this.queueProjectionReadModule.readSnapshot(queueType, options);
    }

    public async ensureQueueProjectionReady(
        request: QueueProjectionReadinessRequest,
    ): Promise<QueueProjectionReadiness> {
        return this.queueProjectionReadModule.ensureReady(request);
    }

    public subscribeQueueProjectionLiveIdentityEvents(
        listener: QueueProjectionLiveIdentityListener,
    ): () => void {
        return this.queueProjectionReadModule.subscribeLiveIdentityEvents(listener);
    }

    private refreshQueueProjectionIdentityBroadcastSubscription(): void {
        this.unsubscribeQueueProjectionIdentityBroadcasts?.();
        this.unsubscribeQueueProjectionIdentityBroadcasts = null;
        const runtime = this.resolvePluginContext()?.getFrontendInstanceRuntime?.();
        if (typeof runtime?.subscribeQueueProjectionIdentityBroadcasts !== 'function') {
            return;
        }
        this.unsubscribeQueueProjectionIdentityBroadcasts = runtime.subscribeQueueProjectionIdentityBroadcasts((event) => {
            this.queueProjectionRuntime.acceptRemoteLiveIdentityEvent(event);
        });
    }

    public async getQueueProjectionCardsBySnapshotIds(
        queueType: QueueType,
        ids: string[],
        options: { forceRefresh?: boolean } = {},
    ): Promise<FSRSCard[]> {
        return this.queueProjectionReadModule.getCardsBySnapshotIds(queueType, ids, options);
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
        options: {
            readinessRequest?: QueueProjectionReadinessRequest | null;
            reason?: string | null;
        } = {},
    ): Promise<BackendQueueProjectionReplaceResult | null> {
        return this.queueProjectionRuntime.materialize(queueType, queueOverride, options);
    }

    public getQueueProjectionRolloutDiagnostics(queueType?: QueueType): QueueProjectionRolloutDiagnostic[] {
        return this.queueProjectionReadModule.getRolloutDiagnostics(queueType);
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

    public getLearnAheadWindowMinutes(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.scheduler?.srsV2?.learnAhead?.windowMinutes);
            if (Number.isFinite(value)) {
                return Math.max(0, Math.floor(value));
            }
        } catch (error) {
            logger.warn('Failed to resolve scheduler.srsV2.learnAhead.windowMinutes from settings service:', error);
        }

        return 20;
    }

    public getLearnAheadMaxCards(): number {
        try {
            const plugin = this.resolvePlugin();
            const settingsService = plugin?.getContext?.()?.getSettingsService?.();
            const value = Number(settingsService?.getSettings?.()?.scheduler?.srsV2?.learnAhead?.maxCards);
            if (Number.isFinite(value)) {
                return Math.max(0, Math.floor(value));
            }
        } catch (error) {
            logger.warn('Failed to resolve scheduler.srsV2.learnAhead.maxCards from settings service:', error);
        }

        return 20;
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
        incrementRuntimePerformanceCounter('review-sync', 'observer-notifications', 1);

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

    public async getBlockContentsWithType(blockIds: string[]): Promise<Map<string, BlockContentResult>> {
        const contentService = this.resolvePluginContext()?.getCardContentQueryService?.();
        if (typeof contentService?.getBlockContentsWithType !== 'function') {
            throw new Error('[SiYuanMemo][UnifiedDataSourceManager] CardContentQueryService is required but not available');
        }
        return contentService.getBlockContentsWithType(blockIds);
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

        const affectedCardIds = this.normalizeEventIds(updatedCards.map((card) => card.id));
        const affectedBlockIds = this.normalizeEventIds(updatedCards.map((card) => card.blockId));
        const timestamp = Date.now();
        this.notifyObservers({
            type: 'card-updated',
            cardIds: affectedCardIds,
            blockIds: affectedBlockIds,
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
        await this.onCardsCreated([card]);
    }

    public async onCardsCreated(cards: FSRSCard[]): Promise<void> {
        const createdCards = this.normalizeCards(cards);
        if (createdCards.length === 0) {
            return;
        }

        const affectedQueueTypes = this.invalidateQueuesForCardMutation();
        const affectedCardIds = this.normalizeEventIds(createdCards.map((card) => card.id));
        const affectedBlockIds = this.normalizeEventIds(createdCards.map((card) => card.blockId));
        const timestamp = Date.now();
        this.notifyObservers({
            type: 'card-created',
            cardIds: affectedCardIds,
            blockIds: affectedBlockIds,
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
                    cardFacts: {
                        resolveNodeType: async (blockId: string) => this.resolveNeuralRoamNodeType(blockId),
                        resolvePriority: async (blockId: string) => this.resolveNeuralRoamNodePriority(blockId),
                    },
                    getHistoryLimit: () => this.getNeuralRoamHistoryMaxEntries(),
                    getHyperspaceSettings: () => this.getNeuralRoamHyperspaceSettings(),
                    routeCatalog: this.neuralRoamRouteCatalog ?? undefined,
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

    public async resolveNeuralRoamNodeType(blockId: string): Promise<NeuralRoamNodeType> {
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

    public async resolveNeuralRoamNodePriority(blockId: string): Promise<number | null> {
        const normalizedBlockId = String(blockId || '').trim();
        if (!normalizedBlockId) {
            return null;
        }

        try {
            const localCard = await this.findExactLocalCardByBlockId(normalizedBlockId);
            return normalizeNeuralRoamPriority(localCard?.priority);
        } catch (error) {
            logger.warn(`Failed to resolve neural roam node priority from local card ${normalizedBlockId}:`, error);
            throw new Error(`NEURAL_ROAM_QUERY_UNAVAILABLE: failed to resolve neural roam node priority for ${normalizedBlockId}: ${error instanceof Error ? error.message : String(error)}`);
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
        this.queueProjectionRuntime.clearMaterializedProjectionEcho(type);
        incrementRuntimePerformanceCounter('review-sync', 'queue-invalidation-calls', 1);
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
        this.queueProjectionRuntime.clearMaterializedProjectionEchoes();
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
