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
     * 将在后续任务中实现。
     * 
     * @see 需求 5.1, 15.3
     */
    private queueFactory: any | null; // TODO: 替换为 QueueFactory 类型
    
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
        
        // 初始化队列工厂（将在后续任务中实现）
        this.queueFactory = null;
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
     * 切换操作模式
     * 
     * 切换操作模式并通知所有观察者。
     * 
     * 完整逻辑将在后续任务中实现：
     * - 简单→高级：触发增量同步
     * - 高级→简单：切换数据源
     * - 添加错误处理和回滚机制
     * 
     * @param newMode 新的操作模式
     * @see 需求 4.1, 4.2, 4.3
     */
    public async switchMode(newMode: OperationMode): Promise<void> {
        // TODO: 实现完整的模式切换逻辑（任务 4.1）
        // - 简单→高级：触发增量同步
        // - 高级→简单：切换数据源
        // - 添加错误处理和回滚机制
        
        // 更新当前模式
        this.currentMode = newMode;
        
        // 通知所有观察者模式已切换
        this.notifyObservers({
            type: 'mode-switched',
            timestamp: Date.now(),
        });
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
     * 将在后续任务中实现。
     * 
     * @param cardId 卡片 ID
     * @returns 卡片数据
     * @see 需求 11.1
     */
    public async getCard(cardId: string): Promise<FSRSCard> {
        // TODO: 实现数据访问方法（任务 11.1）
        throw new Error('Not implemented yet');
    }
    
    /**
     * 获取卡片列表
     * 
     * 将在后续任务中实现。
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @see 需求 11.1
     */
    public async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // TODO: 实现数据访问方法（任务 11.1）
        throw new Error('Not implemented yet');
    }
    
    /**
     * 更新卡片
     * 
     * 将在后续任务中实现。
     * 
     * @param card 要更新的卡片
     * @see 需求 11.1, 11.4
     */
    public async updateCard(card: FSRSCard): Promise<void> {
        // TODO: 实现数据访问方法（任务 11.1）
        // - 通过当前路由器更新卡片
        // - 使受影响的队列缓存失效
        // - 通知所有观察者
        throw new Error('Not implemented yet');
    }
    
    /**
     * 删除卡片
     * 
     * 将在后续任务中实现。
     * 
     * @param cardId 要删除的卡片 ID
     * @see 需求 11.1, 11.4
     */
    public async deleteCard(cardId: string): Promise<void> {
        // TODO: 实现数据访问方法（任务 11.1）
        // - 通过当前路由器删除卡片
        // - 使受影响的队列缓存失效
        // - 通知所有观察者
        throw new Error('Not implemented yet');
    }
    
    // ========================================================================
    // 队列访问
    // ========================================================================
    
    /**
     * 获取队列实例
     * 
     * 将在后续任务中实现。
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @see 需求 1.1, 2.1, 3.1
     */
    public getQueue(type: QueueType): IReviewQueue {
        // TODO: 实现队列访问方法（任务 6.3）
        throw new Error('Not implemented yet');
    }
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * 将在后续任务中实现。
     * 
     * @returns 队列类型数组
     * @see 需求 2.1, 3.1
     */
    public getAvailableQueueTypes(): QueueType[] {
        // TODO: 实现队列访问方法（任务 6.3）
        throw new Error('Not implemented yet');
    }
}
