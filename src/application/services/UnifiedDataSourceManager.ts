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
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { DrillLogV2 } from '@/types/review';
// ✅ DDD 架构：UnifiedDataSourceManager（应用层）直接创建队列，不依赖 QueueFactory（基础设施层）
import { RetrievalPracticeQueue } from '@/core/queue/domain/RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '@/core/queue/domain/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/domain/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { LeechReviewQueue } from '@/core/queue/domain/LeechReviewQueue';
import { SiyuanLeechActionEffectsAdapter } from '@/infrastructure/queue/SiyuanLeechActionEffectsAdapter';
import type { QueueInitialLoadAware, QueueSchedulerPort } from '@/core/queue/managers/UnifiedDataSourceManager';
import type { QueueReviewCommand, QueueReviewCommitResult } from '@/core/queue/managers/UnifiedDataSourceManager';
import type {
    AutoFailedCardSinkPort,
    NeuralRoamNodeType,
    QueuePersistencePort,
} from '@/core/queue/domain/ports';
import { createLogger } from '@/utils/logger';
import type { HyperspaceSettings } from '@/types/settings';

const logger = createLogger('UnifiedDataSourceManager');

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
     * 待分发的数据变更事件（同一 tick 合并）
     */
    private pendingObserverEvents: Map<string, DataChangeEvent>;
    private pendingObserverEventOrder: string[];
    private observerFlushScheduled: boolean;
    
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
        this.pendingObserverEvents = new Map<string, DataChangeEvent>();
        this.pendingObserverEventOrder = [];
        this.observerFlushScheduled = false;
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
        return typeof (candidate as { route?: unknown })?.route === 'function';
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

        return useCase.execute(command);
    }

    public async appendDrillLogV2(log: DrillLogV2): Promise<void> {
        const plugin = this.resolvePlugin();
        const reviewLogs = plugin?.getContext?.()?.getReviewLogService?.();
        if (!reviewLogs || typeof reviewLogs.addDrillLogV2 !== 'function') {
            throw new Error('ReviewLogService not available - plugin initialization failed');
        }

        await reviewLogs.addDrillLogV2(log);
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
    public async updateCard(card: FSRSCard): Promise<void> {
        try {
            // 1. 通过当前路由器更新卡片
            const router = this.getRouter();
            await router.updateCard(card);
            await this.onCardUpdatedFromScheduler(card);
            
            logger.debug(`Card updated: ${card.id}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to update card ${card.id}:`, errorMessage);
            throw new Error(`更新卡片失败 (${card.id}): ${errorMessage}`);
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
        const affectedQueueTypes = this.invalidateQueuesForCardMutation();

        const affectedIds = Array.from(new Set([card.id, card.blockId].filter(Boolean)));
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
                    cardTypeResolver: {
                        resolveCardType: async (blockId: string) => this.resolveNeuralRoamCardTypeFromLocalCard(blockId),
                    },
                    nodeTypeResolver: {
                        resolveNodeType: async (blockId: string) => this.resolveNeuralRoamNodeType(blockId),
                    },
                    getHistoryLimit: () => this.getNeuralRoamHistoryMaxEntries(),
                    getHyperspaceSettings: () => this.getNeuralRoamHyperspaceSettings(),
                });
            
            case QueueType.Leech:
                return new LeechReviewQueue(this, {
                    effects: new SiyuanLeechActionEffectsAdapter(),
                });
            
            default:
                throw new QueueError(`Unknown queue type: ${type}`);
        }
    }

    private async resolveNeuralRoamCardTypeFromLocalCard(blockId: string): Promise<'item' | 'topic'> {
        const nodeType = await this.resolveNeuralRoamNodeType(blockId);
        return nodeType === 'item' || nodeType === 'descriptor'
            ? 'item'
            : 'topic';
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
