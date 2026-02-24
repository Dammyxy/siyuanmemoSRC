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
import { FSRSCard } from '@/types/card';
// ✅ DDD 架构：UnifiedDataSourceManager（应用层）直接创建队列，不依赖 QueueFactory（基础设施层）
import { RetrievalPracticeQueue } from '@/core/queue/domain/RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '@/core/queue/domain/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/domain/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { LeechReviewQueue } from '@/core/queue/domain/LeechReviewQueue';

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
    private queuePersistence: any | null;
    
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
    }
    
    /**
     * 设置队列持久化服务
     * 
     * 必须在使用队列之前调用此方法设置队列持久化服务。
     * 
     * @param queuePersistence 队列持久化服务实例
     */
    public setQueuePersistence(queuePersistence: any): void {
        this.queuePersistence = queuePersistence;
        console.log('[UnifiedDataSourceManager] ✅ QueuePersistence service set');
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
        // 记录失败的观察者
        const failures: Array<{ observer: IDataSourceObserver; error: Error }> = [];
        
        // 遍历所有观察者
        for (const observer of this.observers) {
            try {
                // 调用观察者的 onDataChanged 方法
                observer.onDataChanged(event);
            } catch (error) {
                // 捕获错误，记录失败信息
                const errorObj = error instanceof Error ? error : new Error(String(error));
                failures.push({ observer, error: errorObj });
                
                // 记录错误日志（不中断流程）
                console.error('观察者通知失败:', errorObj);
            }
        }
        
        // 如果有失败，记录警告日志
        if (failures.length > 0) {
            console.warn(`${failures.length} 个观察者通知失败，共 ${this.observers.size} 个观察者`);
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
                console.error(`[UnifiedDataSourceManager] Failed to get card ${cardId}:`, errorMessage);
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
            console.error('[UnifiedDataSourceManager] Failed to get cards:', errorMessage);
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
            
            // 2. 使受影响的队列缓存失效
            // 卡片更新可能影响所有动态队列（检索练习、渐进学习、过滤组）
            this.invalidateQueue(QueueType.RetrievalPractice);
            this.invalidateQueue(QueueType.IncrementalLearning);
            this.invalidateQueue(QueueType.FilterGroup);
            
            // 3. 通知所有观察者
            this.notifyObservers({
                type: 'card-updated',
                cardIds: [card.id],
                timestamp: Date.now(),
            });
            
            console.log(`[UnifiedDataSourceManager] Card updated: ${card.id}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[UnifiedDataSourceManager] Failed to update card ${card.id}:`, errorMessage);
            throw new Error(`更新卡片失败 (${card.id}): ${errorMessage}`);
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
            // 1. 通过当前路由器删除卡片
            const router = this.getRouter();
            await router.deleteCard(cardId);
            
            // 2. 使受影响的队列缓存失效
            // 卡片删除可能影响所有队列
            this.invalidateAllQueues();
            
            // 3. 通知所有观察者
            this.notifyObservers({
                type: 'card-deleted',
                cardIds: [cardId],
                timestamp: Date.now(),
            });
            
            console.log(`[UnifiedDataSourceManager] Card deleted: ${cardId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[UnifiedDataSourceManager] Failed to delete card ${cardId}:`, errorMessage);
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
        
        // 🆕 标记队列需要加载（延迟加载）
        // 使用 Promise 异步加载，但不阻塞返回
        // 队列的 getCards() 方法会在首次调用时等待加载完成
        if (typeof (queue as any).load === 'function') {
            // 创建一个加载 Promise 并存储
            const loadPromise = (queue as any).load().catch((error: Error) => {
                console.error(`[UnifiedDataSourceManager] Failed to load queue ${type}:`, error);
            });
            
            // 将加载 Promise 附加到队列对象上，供 getCards() 使用
            (queue as any)._loadPromise = loadPromise;
        }
        
        this.queueInstances.set(type, queue);
        
        console.log(`[UnifiedDataSourceManager] ✅ Queue created: ${type}`);
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
        switch (type) {
            case QueueType.RetrievalPractice:
                return new RetrievalPracticeQueue(this);
            
            case QueueType.IncrementalLearning:
                if (!this.queuePersistence) {
                    throw new QueueError('QueuePersistence not initialized. Call setQueuePersistence() first.');
                }
                return new IncrementalLearningQueue(this, this.queuePersistence);
            
            case QueueType.FilterGroup:
                if (!this.queuePersistence) {
                    throw new QueueError('QueuePersistence not initialized. Call setQueuePersistence() first.');
                }
                return new FilterGroupQueue(this, this.queuePersistence);
            
            case QueueType.FinalDrill:
                if (!this.queuePersistence) {
                    throw new QueueError('QueuePersistence not initialized. Call setQueuePersistence() first.');
                }
                return new FinalDrillQueue(this, this.queuePersistence);
            
            case QueueType.NeuralRoam:
                if (!this.queuePersistence) {
                    throw new QueueError('QueuePersistence not initialized. Call setQueuePersistence() first.');
                }
                return new NeuralRoamQueue(this, this.queuePersistence);
            
            case QueueType.Leech:
                return new LeechReviewQueue(this);
            
            default:
                throw new QueueError(`Unknown queue type: ${type}`);
        }
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
        console.log(`[UnifiedDataSourceManager] Queue cache invalidated: ${type}`);
    }
    
    /**
     * 使所有队列缓存失效
     * 
     * 清空所有队列缓存，用于模式切换等场景。
     */
    public invalidateAllQueues(): void {
        this.queueInstances.clear();
        console.log('[UnifiedDataSourceManager] All queue caches invalidated');
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
