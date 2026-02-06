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
    OperationMode,
    QueueType,
    IDataSourceObserver,
    DataChangeEvent,
    IDataRouter,
    IReviewQueue,
    CardFilter,
} from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import { QueueFactory } from '../queues/QueueFactory';

/**
 * UnifiedDataSourceManager 类
 * 
 * 统一数据源管理器，负责：
 * - 模式管理（简单模式/高级模式）
 * - 数据路由（根据当前模式路由到不同数据源）
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
     * 当前操作模式
     * 
     * 默认为简单模式。
     * 
     * @see 需求 1.1, 1.2
     */
    private currentMode: OperationMode;
    
    /**
     * 已注册的观察者集合
     * 
     * 使用 Set 确保观察者唯一性。
     * 
     * @see 需求 14.1, 14.2
     */
    private observers: Set<IDataSourceObserver>;
    
    /**
     * 简单模式数据路由器
     * 
     * 将在后续任务中实现。
     * 
     * @see 需求 2.1, 2.5
     */
    private simpleRouter: IDataRouter | null;
    
    /**
     * 高级模式数据路由器
     * 
     * 将在后续任务中实现。
     * 
     * @see 需求 3.1, 3.5
     */
    private advancedRouter: IDataRouter | null;
    
    /**
     * 队列工厂
     * 
     * 负责创建和管理队列实例。
     * 
     * @see 需求 5.1, 15.3
     */
    private queueFactory: QueueFactory;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 私有构造函数
     * 
     * 防止外部直接实例化，强制使用 getInstance() 方法。
     * 初始化观察者集合和当前模式。
     * 
     * @see 需求 1.4
     */
    private constructor() {
        // 初始化当前模式为简单模式
        this.currentMode = OperationMode.Simple;
        
        // 初始化观察者集合
        this.observers = new Set<IDataSourceObserver>();
        
        // 初始化路由器（将在后续任务中实现）
        this.simpleRouter = null;
        this.advancedRouter = null;
        
        // 初始化队列工厂
        this.queueFactory = new QueueFactory(this);
    }
    
    /**
     * 初始化路由器
     * 
     * 设置简单模式和高级模式的数据路由器。
     * 此方法应该在使用 UnifiedDataSourceManager 之前调用。
     * 
     * @param simpleRouter 简单模式数据路由器
     * @param advancedRouter 高级模式数据路由器
     */
    public initializeRouters(simpleRouter: IDataRouter, advancedRouter: IDataRouter): void {
        this.simpleRouter = simpleRouter;
        this.advancedRouter = advancedRouter;
    }
    
    // ========================================================================
    // 模式管理
    // ========================================================================
    
    /**
     * 获取当前操作模式
     * 
     * @returns 当前操作模式（简单模式或高级模式）
     * @see 需求 1.1, 1.2
     */
    public getCurrentMode(): OperationMode {
        return this.currentMode;
    }
    
    /**
     * 获取当前路由器
     * 
     * 根据当前操作模式返回对应的数据路由器。
     * 
     * @returns 当前模式的数据路由器
     * @throws Error 如果路由器未初始化
     */
    private getCurrentRouter(): IDataRouter {
        const router = this.currentMode === OperationMode.Simple 
            ? this.simpleRouter 
            : this.advancedRouter;
        
        if (!router) {
            throw new Error(`路由器未初始化 (模式: ${this.currentMode})`);
        }
        
        return router;
    }
    
    /**
     * 切换操作模式
     * 
     * 切换操作模式并通知所有观察者。
     * 
     * 模式切换逻辑：
     * - 简单→高级：触发增量同步（从 Riff API 同步到本地存储）
     * - 高级→简单：切换数据源（从本地存储切换到 Riff API）
     * - 包含错误处理和回滚机制
     * 
     * 错误处理策略：
     * - 如果切换失败，回滚到原模式
     * - 保留用户数据
     * - 记录错误日志
     * - 抛出 ModeError 异常
     * 
     * @param newMode 新的操作模式
     * @throws ModeError 如果模式切换失败
     * @see 需求 4.1, 4.2, 4.3
     */
    public async switchMode(newMode: OperationMode): Promise<void> {
        // 如果模式相同，直接返回
        if (newMode === this.currentMode) {
            return;
        }
        
        // 保存原模式用于回滚
        const oldMode = this.currentMode;
        
        try {
            // 简单→高级：触发增量同步
            if (newMode === OperationMode.Advanced && oldMode === OperationMode.Simple) {
                await this.triggerIncrementalSync();
            }
            
            // 高级→简单：切换数据源（无需额外操作，只需更新模式）
            // 数据源切换会在下次数据访问时自动生效
            
            // 更新当前模式
            this.currentMode = newMode;
            
            // 通知所有观察者模式已切换
            this.notifyObservers({
                type: 'mode-switched',
                timestamp: Date.now(),
            });
            
            console.log(`[UnifiedDataSourceManager] Mode switched: ${oldMode} -> ${newMode}`);
        } catch (error) {
            // 回滚到原模式
            this.currentMode = oldMode;
            
            // 构造错误消息
            const errorMessage = error instanceof Error ? error.message : String(error);
            const modeError = new Error(`模式切换失败 (${oldMode} -> ${newMode}): ${errorMessage}`);
            modeError.name = 'ModeError';
            
            // 记录错误日志
            console.error('[UnifiedDataSourceManager] Mode switch failed:', modeError);
            
            // 抛出错误
            throw modeError;
        }
    }
    
    /**
     * 触发增量同步
     * 
     * 从 Riff API 同步数据到本地存储。
     * 这是一个增量同步过程，只同步变更的数据。
     * 
     * 同步策略：
     * 1. 从 Riff API 获取所有卡片
     * 2. 与本地存储比较，识别新增、更新和删除的卡片
     * 3. 应用变更到本地存储
     * 4. 记录同步元数据（时间戳、版本号等）
     * 
     * 注意：此方法需要 simpleRouter 和 advancedRouter 已初始化。
     * 如果路由器未初始化，将抛出错误。
     * 
     * @throws Error 如果同步失败
     * @see 需求 4.1
     */
    private async triggerIncrementalSync(): Promise<void> {
        // 检查路由器是否已初始化
        if (!this.simpleRouter || !this.advancedRouter) {
            throw new Error('路由器未初始化，无法执行增量同步');
        }
        
        try {
            console.log('[UnifiedDataSourceManager] Starting incremental sync from Riff to Local Storage...');
            
            // 从 Riff API 获取所有卡片
            const riffCards = await this.simpleRouter.getCards();
            
            console.log(`[UnifiedDataSourceManager] Fetched ${riffCards.length} cards from Riff API`);
            
            // 从本地存储获取所有卡片
            const localCards = await this.advancedRouter.getCards();
            
            console.log(`[UnifiedDataSourceManager] Found ${localCards.length} cards in Local Storage`);
            
            // 构建本地卡片 ID 集合
            const localCardIds = new Set(localCards.map(card => card.id));
            
            // 识别新增和更新的卡片
            let newCount = 0;
            let updateCount = 0;
            
            for (const riffCard of riffCards) {
                if (localCardIds.has(riffCard.id)) {
                    // 卡片已存在，检查是否需要更新
                    const localCard = localCards.find(c => c.id === riffCard.id);
                    
                    if (localCard && this.shouldUpdateCard(localCard, riffCard)) {
                        // 更新卡片
                        await this.advancedRouter.updateCard(riffCard);
                        updateCount++;
                    }
                } else {
                    // 新卡片，添加到本地存储
                    await this.advancedRouter.updateCard(riffCard);
                    newCount++;
                }
            }
            
            console.log(`[UnifiedDataSourceManager] Sync completed: ${newCount} new, ${updateCount} updated`);
            
            // 注意：我们不删除本地存储中存在但 Riff 中不存在的卡片
            // 因为用户可能在高级模式下创建了本地卡片
            // 这些卡片应该保留
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[UnifiedDataSourceManager] Incremental sync failed:', errorMessage);
            throw new Error(`增量同步失败: ${errorMessage}`);
        }
    }
    
    /**
     * 判断是否应该更新卡片
     * 
     * 比较本地卡片和远程卡片，判断是否需要更新。
     * 
     * 更新策略：
     * - 如果远程卡片的更新时间更新，则更新
     * - 如果更新时间相同，不更新（避免不必要的写入）
     * - 如果本地卡片的更新时间更新，不更新（保留本地修改）
     * 
     * @param localCard 本地卡片
     * @param remoteCard 远程卡片
     * @returns 是否应该更新
     */
    private shouldUpdateCard(localCard: FSRSCard, remoteCard: FSRSCard): boolean {
        // 比较更新时间
        // 如果远程卡片更新时间更新，则更新
        return remoteCard.updatedAt > localCard.updatedAt;
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
            const router = this.getCurrentRouter();
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
            const router = this.getCurrentRouter();
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
            const router = this.getCurrentRouter();
            await router.updateCard(card);
            
            // 2. 使受影响的队列缓存失效
            // 卡片更新可能影响所有动态队列（检索练习、渐进学习、过滤组）
            this.queueFactory.invalidateQueue(QueueType.RetrievalPractice);
            this.queueFactory.invalidateQueue(QueueType.IncrementalLearning);
            this.queueFactory.invalidateQueue(QueueType.FilterGroup);
            
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
            const router = this.getCurrentRouter();
            await router.deleteCard(cardId);
            
            // 2. 使受影响的队列缓存失效
            // 卡片删除可能影响所有队列
            this.queueFactory.invalidateAllQueues();
            
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
     * 获取队列实例
     * 
     * 通过队列工厂获取指定类型的队列实例。
     * 队列实例会被缓存，避免重复创建。
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @throws {QueueError} 如果队列类型未知或未实现
     * @see 需求 1.1, 2.1, 3.1
     */
    public getQueue(type: QueueType): IReviewQueue {
        return this.queueFactory.getQueue(type);
    }
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * 根据当前操作模式返回可用的队列类型列表。
     * - 简单模式：检索练习、最终训练（2 种）
     * - 高级模式：检索练习、最终训练、渐进学习、过滤组、神经漫游（5 种）
     * 
     * @returns 队列类型数组
     * @see 需求 2.1, 3.1
     */
    public getAvailableQueueTypes(): QueueType[] {
        const router = this.getCurrentRouter();
        return router.getAvailableQueueTypes();
    }
}
