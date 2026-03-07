/**
 * SRS Browser Queue View
 * SRS 浏览器队列视图
 * 
 * 实现 IDataSourceObserver 接口，集成统一数据源架构。
 * 当队列数据变化时，自动刷新视图。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md - 需求 16
 * @see .kiro/specs/unified-data-source-architecture/design.md - SRS 浏览器队列视图集成
 */

import type { IUnifiedDataSourceManagerFacade, IDataSourceObserver, DataChangeEvent, QueueType, CardFilter } from '@/types/unified-data-source';
import type { GridApi } from 'ag-grid-community';
import { filterService } from './services/FilterService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SRSBrowserQueueView');

type FilterGroupQueueLike = {
    setFilter: (filter: CardFilter) => Promise<void>;
};

function hasSetFilter(queue: unknown): queue is FilterGroupQueueLike {
    const candidate = queue as Partial<FilterGroupQueueLike>;
    return typeof candidate?.setFilter === 'function';
}

/**
 * SRS 浏览器队列视图
 * 
 * 核心功能：
 * - 实现 IDataSourceObserver 接口，响应数据变化
 * - 切换到指定队列视图
 * - 从队列加载数据并显示在 AG-Grid 中
 * - 添加卡片到队列
 * - 获取可用队列类型
 * - 管理过滤条件（filter-group-queue-ui 功能）
 * 
 * 验证需求：16.1, 16.2, 16.3, 16.4, 16.5
 * @see filter-group-queue-ui 需求 6.2, 6.3, 8.2, 8.3
 */
export class SRSBrowserQueueView implements IDataSourceObserver {
    /**
     * 统一数据源管理器实例
     */
    private manager: IUnifiedDataSourceManagerFacade;
    
    /**
     * 当前队列类型
     */
    private currentQueueType: QueueType | null;
    
    /**
     * AG-Grid API 实例
     */
    private gridApi: GridApi | null;
    
    /**
     * 是否已注册为观察者
     */
    private isRegistered: boolean;
    
    /**
     * 当前应用的过滤条件
     * @see filter-group-queue-ui 需求 6.2, 8.2
     */
    private appliedFilter: CardFilter | null;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: IUnifiedDataSourceManagerFacade) {
        this.manager = manager;
        this.currentQueueType = null;
        this.gridApi = null;
        this.isRegistered = false;
        this.appliedFilter = null;
        
        // 注册为观察者
        this.registerObserver();
        
        // 加载保存的过滤条件（如果有）
        this.loadSavedFilter();
    }
    
    // ========================================================================
    // 公共方法
    // ========================================================================
    
    /**
     * 切换到指定队列视图
     * 
     * 验证需求：16.1
     * 
     * @param queueType 队列类型
     */
    async switchToQueueView(queueType: QueueType): Promise<void> {
        logger.info(`[SRSBrowserQueueView] Switching to queue view: ${queueType}`);
        
        this.currentQueueType = queueType;
        await this.loadQueueData();
    }
    
    /**
     * 从队列加载数据
     * 
     * 验证需求：16.1, 16.2
     */
    async loadQueueData(): Promise<void> {
        if (!this.currentQueueType) {
            logger.warn('[SRSBrowserQueueView] No queue type selected');
            return;
        }
        
        try {
            logger.info(`[SRSBrowserQueueView] Loading queue data for: ${this.currentQueueType}`);
            
            // 获取队列实例
            const queue = this.manager.getQueue(this.currentQueueType);
            
            // 获取队列中的所有卡片
            const cards = await queue.getCards();
            
            logger.info(`[SRSBrowserQueueView] Loaded ${cards.length} cards from queue`);
            
            // 更新 AG-Grid
            if (this.gridApi) {
                const gridApi = this.gridApi as GridApi & {
                    setGridOption?: (key: 'rowData', value: unknown[]) => void;
                };
                gridApi.setGridOption?.('rowData', cards);
                logger.info('[SRSBrowserQueueView] Grid updated with queue data');
            } else {
                logger.warn('[SRSBrowserQueueView] Grid API not initialized');
            }
        } catch (error) {
            logger.error('[SRSBrowserQueueView] Failed to load queue data:', error);
            throw error;
        }
    }
    
    /**
     * 响应数据变化事件
     * 
     * 当数据变化时，自动刷新队列视图。
     * 
     * 验证需求：16.3
     * 
     * @param event 数据变更事件
     */
    onDataChanged(event: DataChangeEvent): void {
        logger.info('Data changed:', event);
        
        // 如果当前有选中的队列，自动刷新
        if (this.currentQueueType) {
            // 使用 setTimeout 确保在下一个事件循环中执行，避免阻塞
            setTimeout(() => {
                this.loadQueueData().catch(error => {
                    logger.error('Failed to refresh queue data:', error);
                });
            }, 0);
        }
    }
    
    /**
     * 从浏览器添加卡片到队列
     * 
     * 验证需求：16.4
     * 
     * @param cardId 卡片 ID
     */
    async addCardToQueue(cardId: string): Promise<void> {
        if (!this.currentQueueType) {
            logger.warn('[SRSBrowserQueueView] No queue type selected');
            throw new Error('No queue type selected');
        }
        
        try {
            logger.info(`[SRSBrowserQueueView] Adding card ${cardId} to queue ${this.currentQueueType}`);
            
            // 获取队列实例
            const queue = this.manager.getQueue(this.currentQueueType);
            
            // 添加卡片到队列
            await queue.addCard(cardId);
            
            logger.info(`[SRSBrowserQueueView] Card ${cardId} added to queue`);
            
            // 数据会通过观察者模式自动刷新，无需手动调用 loadQueueData()
        } catch (error) {
            logger.error('[SRSBrowserQueueView] Failed to add card to queue:', error);
            throw error;
        }
    }
    
    /**
     * 获取可用队列类型
     * 
     * 根据当前模式返回可用的队列类型列表。
     * 
     * 验证需求：16.5
     * 
     * @returns 队列类型数组
     */
    getAvailableQueueTypes(): QueueType[] {
        const queueTypes = this.manager.getAvailableQueueTypes();
        logger.info('[SRSBrowserQueueView] Available queue types:', queueTypes);
        return queueTypes;
    }
    
    /**
     * 设置 AG-Grid API 实例
     * 
     * 在 AG-Grid 初始化后调用此方法。
     * 
     * @param gridApi AG-Grid API 实例
     */
    setGridApi(gridApi: GridApi): void {
        this.gridApi = gridApi;
        logger.info('[SRSBrowserQueueView] Grid API set');
    }
    
    /**
     * 获取当前队列类型
     * 
     * @returns 当前队列类型，如果未选择则返回 null
     */
    getCurrentQueueType(): QueueType | null {
        return this.currentQueueType;
    }
    
    /**
     * 获取当前应用的过滤条件
     * 
     * @see filter-group-queue-ui 需求 8.2
     * @returns 当前应用的过滤条件，如果未设置则返回 null
     */
    getAppliedFilter(): CardFilter | null {
        return this.appliedFilter;
    }
    
    /**
     * 应用过滤条件
     * 
     * 设置过滤条件并刷新队列显示。
     * 仅在 FilterGroup 队列类型时有效。
     * 
     * @see filter-group-queue-ui 需求 6.2, 6.3, 8.2, 8.3
     * @param filter 过滤条件
     */
    async applyFilter(filter: CardFilter): Promise<void> {
        // 仅在 FilterGroup 队列时应用过滤
        if (this.currentQueueType !== 'filter-group' as QueueType) {
            logger.warn('[SRSBrowserQueueView] Filter can only be applied to FilterGroup queue');
            return;
        }
        
        try {
            logger.info('[SRSBrowserQueueView] Applying filter:', filter);
            
            // 保存过滤条件
            this.appliedFilter = filter;
            
            // 获取队列实例
            const queue = this.manager.getQueue(this.currentQueueType);
            
            // 设置过滤条件（假设 FilterGroupQueue 有 setFilter 方法）
            if (hasSetFilter(queue)) {
                await queue.setFilter(filter);
            }
            
            // 刷新队列显示
            await this.loadQueueData();
            
            logger.info('[SRSBrowserQueueView] Filter applied successfully');
        } catch (error) {
            logger.error('[SRSBrowserQueueView] Failed to apply filter:', error);
            throw error;
        }
    }
    
    /**
     * 清除过滤条件
     * 
     * 清除当前应用的过滤条件并刷新队列显示。
     * 
     * @see filter-group-queue-ui 需求 7.3, 7.4
     */
    async clearFilter(): Promise<void> {
        // 仅在 FilterGroup 队列时清除过滤
        if (this.currentQueueType !== 'filter-group' as QueueType) {
            logger.warn('[SRSBrowserQueueView] Filter can only be cleared from FilterGroup queue');
            return;
        }
        
        try {
            logger.info('[SRSBrowserQueueView] Clearing filter');
            
            // 清除过滤条件
            this.appliedFilter = null;
            
            // 获取队列实例
            const queue = this.manager.getQueue(this.currentQueueType);
            
            // 清除过滤条件
            if (hasSetFilter(queue)) {
                await queue.setFilter({});
            }
            
            // 刷新队列显示
            await this.loadQueueData();
            
            logger.info('[SRSBrowserQueueView] Filter cleared successfully');
        } catch (error) {
            logger.error('[SRSBrowserQueueView] Failed to clear filter:', error);
            throw error;
        }
    }
    
    /**
     * 销毁视图
     * 
     * 取消注册观察者，清理资源。
     */
    destroy(): void {
        logger.info('[SRSBrowserQueueView] Destroying view');
        
        // 取消注册观察者
        this.unregisterObserver();
        
        // 清理引用
        this.gridApi = null;
        this.currentQueueType = null;
        this.appliedFilter = null;
    }
    
    // ========================================================================
    // 私有方法
    // ========================================================================
    
    /**
     * 加载保存的过滤条件
     * 
     * 从 localStorage 加载上次保存的过滤条件。
     * 
     * @see filter-group-queue-ui 需求 8.2, 8.3
     */
    private loadSavedFilter(): void {
        try {
            const savedFilter = filterService.loadFilter();
            if (savedFilter) {
                this.appliedFilter = savedFilter;
                logger.info('[SRSBrowserQueueView] Loaded saved filter:', savedFilter);
            }
        } catch (error) {
            logger.error('[SRSBrowserQueueView] Failed to load saved filter:', error);
            // 加载失败不影响正常使用
        }
    }
    
    /**
     * 注册为观察者
     */
    private registerObserver(): void {
        if (!this.isRegistered) {
            this.manager.registerObserver(this);
            this.isRegistered = true;
            logger.info('[SRSBrowserQueueView] Registered as observer');
        }
    }
    
    /**
     * 取消注册观察者
     */
    private unregisterObserver(): void {
        if (this.isRegistered) {
            this.manager.unregisterObserver(this);
            this.isRegistered = false;
            logger.info('[SRSBrowserQueueView] Unregistered as observer');
        }
    }
}

