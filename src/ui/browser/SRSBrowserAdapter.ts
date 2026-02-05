/**
 * SRS Browser Adapter
 * SRS 浏览器适配器
 * 
 * 负责将 UnifiedDataSourceManager 集成到 SRSBrowser.vue 组件中。
 * 实现 IDataSourceObserver 接口，响应数据变更事件。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 1, 2, 3
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - SRS 浏览器集成
 */

import type { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import type { IDataSourceObserver, DataChangeEvent, QueueType } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import type { BrowserCard } from './types';
import { CardState, calculateRetrievability, formatDate, truncateContent } from './types';

/**
 * fetchRows 方法的选项参数
 */
export interface FetchRowsOptions {
    /** 排序模型 */
    sortModel: any[];
    
    /** 筛选模型 */
    filterModel: any;
}

/**
 * fetchRows 方法的返回结果
 */
export interface FetchRowsResult {
    /** 卡片行数据 */
    rows: BrowserCard[];
}

/**
 * SRS 浏览器适配器
 * 
 * 核心功能：
 * - 管理 SRSBrowserQueueView 实例
 * - 实现 IDataSourceObserver 接口
 * - 处理数据变更通知
 * - 将 FSRSCard 转换为 BrowserCard
 * 
 * 验证需求：1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4
 */
export class SRSBrowserAdapter implements IDataSourceObserver {
    /**
     * 统一数据源管理器实例
     */
    private manager: UnifiedDataSourceManager;
    
    /**
     * 当前队列类型
     */
    private currentQueueType: QueueType | null = null;
    
    /**
     * 是否已注册为观察者
     */
    private isRegistered: boolean = false;
    
    /**
     * 数据变更回调函数
     * 
     * 当数据变更时，调用此回调通知 Vue 组件刷新
     */
    private onDataChangeCallback: ((event: DataChangeEvent) => void) | null = null;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        this.manager = manager;
        
        console.log('[SRSBrowserAdapter] Adapter created');
    }
    
    // ========================================================================
    // 公共方法
    // ========================================================================
    
    /**
     * 初始化队列视图
     * 
     * 验证需求：1.2, 2.1, 8.1, 12.1
     * 
     * @param queueType 队列类型
     * @throws Error 如果初始化失败
     */
    async initializeQueueView(queueType: QueueType): Promise<void> {
        try {
            // 记录初始化开始（需求 12.1：记录数据源类型）
            const currentMode = this.manager.getCurrentMode();
            console.log(`[SRSBrowserAdapter] Initializing queue view:`, {
                queueType,
                dataSourceMode: currentMode,
                timestamp: new Date().toISOString()
            });
            
            // 保存当前队列类型
            this.currentQueueType = queueType;
            
            // 注册为观察者
            if (!this.isRegistered) {
                this.manager.registerObserver(this);
                this.isRegistered = true;
                console.log('[SRSBrowserAdapter] Registered as observer');
            }
            
            // 记录初始化成功（需求 12.1）
            console.log(`[SRSBrowserAdapter] Queue view initialized successfully:`, {
                queueType,
                dataSourceMode: currentMode,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // 记录详细的错误日志（需求 8.1）
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            console.error('[SRSBrowserAdapter] Failed to initialize queue view:', {
                queueType,
                error: errorMessage,
                stack: errorStack,
                timestamp: new Date().toISOString()
            });
            
            // 重新抛出错误，让调用者处理（显示用户友好的错误消息）
            throw new Error(`初始化队列视图失败 (${queueType}): ${errorMessage}`);
        }
    }
    
    /**
     * 获取卡片数据
     * 
     * 从当前队列获取卡片数据，并转换为 BrowserCard 格式。
     * 
     * 验证需求：2.2, 2.3, 8.2, 12.2
     * 
     * @param options 获取选项（排序和筛选）
     * @returns 卡片行数据
     * @throws Error 如果数据加载失败
     */
    async fetchRows(_options: FetchRowsOptions): Promise<FetchRowsResult> {
        if (!this.currentQueueType) {
            console.warn('[SRSBrowserAdapter] No queue type selected');
            return { rows: [] };
        }
        
        // 记录加载开始时间（需求 12.2）
        const startTime = Date.now();
        
        try {
            console.log(`[SRSBrowserAdapter] Fetching rows for queue: ${this.currentQueueType}`);
            
            // 获取队列实例
            const queue = this.manager.getQueue(this.currentQueueType);
            
            // 获取队列中的所有卡片
            // 注意：使用 getAllCards() 而不是 getCards()
            // getAllCards() 会调用 dataSource.getAll()，包含过滤逻辑
            console.log(`[SRSBrowserAdapter] Calling getAllCards() on queue`);
            const cards = await queue.getAllCards();
            console.log(`[SRSBrowserAdapter] getAllCards() returned ${cards.length} cards`);
            
            // 转换为 BrowserCard 格式
            const browserCards = cards.map(card => this.convertToBrowserCard(card));
            
            // 记录加载完成（需求 12.2：记录加载时间、数据量、耗时）
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log(`[SRSBrowserAdapter] Fetched rows successfully:`, {
                queueType: this.currentQueueType,
                cardCount: browserCards.length,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });
            
            // TODO: 应用排序和筛选（如果需要）
            // 目前直接返回所有卡片，排序和筛选由 AG-Grid 处理
            
            return { rows: browserCards };
        } catch (error) {
            // 记录详细的错误日志（需求 8.2）
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.error('[SRSBrowserAdapter] Failed to fetch rows:', {
                queueType: this.currentQueueType,
                error: errorMessage,
                stack: errorStack,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });
            
            // 重新抛出错误，让调用者处理
            // 调用者应该：
            // 1. 保留现有数据（不清空表格）
            // 2. 显示错误消息
            // 3. 提供重试按钮
            throw new Error(`加载卡片数据失败 (${this.currentQueueType}): ${errorMessage}`);
        }
    }
    
    /**
     * 设置数据变更回调
     * 
     * 当数据变更时，调用此回调通知 Vue 组件刷新。
     * 
     * @param callback 回调函数
     */
    setOnDataChangeCallback(callback: (event: DataChangeEvent) => void): void {
        this.onDataChangeCallback = callback;
    }
    
    /**
     * 清理资源
     * 
     * 取消注册观察者，清理引用。
     * 
     * 验证需求：3.5
     */
    destroy(): void {
        console.log('[SRSBrowserAdapter] Destroying adapter');
        
        // 取消注册观察者
        if (this.isRegistered) {
            this.manager.unregisterObserver(this);
            this.isRegistered = false;
            console.log('[SRSBrowserAdapter] Unregistered as observer');
        }
        
        // 清理引用
        this.currentQueueType = null;
        this.onDataChangeCallback = null;
    }
    
    // ========================================================================
    // IDataSourceObserver 接口实现
    // ========================================================================
    
    /**
     * 响应数据变化事件
     * 
     * 当数据变化时，自动刷新队列视图。
     * 
     * 验证需求：3.2, 12.3
     * 
     * @param event 数据变更事件
     */
    onDataChanged(event: DataChangeEvent): void {
        // 记录观察者通知（需求 12.3：记录事件类型、受影响的数据、通知时间）
        console.log('[SRSBrowserAdapter] Data changed:', {
            eventType: event.type,
            queueType: event.queueType,
            cardIds: event.cardIds,
            cardCount: event.cardIds?.length || 0,
            timestamp: new Date(event.timestamp).toISOString()
        });
        
        // 根据事件类型处理
        switch (event.type) {
            case 'card-updated':
                this.handleCardUpdated(event.cardIds || []);
                break;
            case 'card-deleted':
                this.handleCardDeleted(event.cardIds || []);
                break;
            case 'queue-changed':
                this.handleQueueChanged(event.queueType);
                break;
            case 'mode-switched':
                this.handleModeSwitched();
                break;
        }
        
        // 调用回调函数通知 Vue 组件
        if (this.onDataChangeCallback) {
            this.onDataChangeCallback(event);
        }
    }
    
    // ========================================================================
    // 私有方法 - 事件处理
    // ========================================================================
    
    /**
     * 处理卡片更新事件
     * 
     * 验证需求：3.3
     * 
     * @param cardIds 受影响的卡片 ID 列表
     */
    private handleCardUpdated(cardIds: string[]): void {
        console.log(`[SRSBrowserAdapter] Handling card-updated event: ${cardIds.length} cards`);
        
        // 触发 Vue 组件刷新
        // 实际的刷新逻辑由 Vue 组件通过回调函数处理
    }
    
    /**
     * 处理卡片删除事件
     * 
     * 验证需求：3.3
     * 
     * @param cardIds 受影响的卡片 ID 列表
     */
    private handleCardDeleted(cardIds: string[]): void {
        console.log(`[SRSBrowserAdapter] Handling card-deleted event: ${cardIds.length} cards`);
        
        // 触发 Vue 组件刷新
        // 实际的刷新逻辑由 Vue 组件通过回调函数处理
    }
    
    /**
     * 处理队列变更事件
     * 
     * 验证需求：3.4
     * 
     * @param queueType 受影响的队列类型
     */
    private handleQueueChanged(queueType?: QueueType): void {
        console.log(`[SRSBrowserAdapter] Handling queue-changed event: ${queueType || 'all'}`);
        
        // 如果是当前队列，刷新队列统计
        if (!queueType || queueType === this.currentQueueType) {
            // 触发 Vue 组件刷新
            // 实际的刷新逻辑由 Vue 组件通过回调函数处理
        }
    }
    
    /**
     * 处理模式切换事件
     * 
     * 验证需求：1.3
     */
    private handleModeSwitched(): void {
        console.log('[SRSBrowserAdapter] Handling mode-switched event');
        
        // 刷新所有数据
        // 实际的刷新逻辑由 Vue 组件通过回调函数处理
    }
    
    // ========================================================================
    // 私有方法 - 数据转换
    // ========================================================================
    
    /**
     * 将 FSRSCard 转换为 BrowserCard
     * 
     * 注意：FSRSCard 是精简的核心数据结构，不包含 UI 展示需要的所有字段。
     * 某些字段（如 content、deckId、rootId）需要从思源 API 或 meta 字段获取。
     * 
     * @param card FSRS 卡片
     * @returns 浏览器卡片
     */
    private convertToBrowserCard(card: FSRSCard): BrowserCard {
        console.log('[SRSBrowserAdapter] ========== convertToBrowserCard ==========');
        console.log('[SRSBrowserAdapter] 输入 FSRSCard:', {
            id: card.id,
            riffCardId: card.riffCardId,
            blockId: card.blockId,
            type: card.type,
        });
        // 计算经过的天数
        const now = Date.now();
        const elapsedDays = card.lastReview 
            ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
            : 0;
        
        // 计算 Retrievability
        const retrievability = calculateRetrievability(card.stability, elapsedDays);
        
        // 转换卡片状态
        const state = this.convertCardState(card.state);
        
        // 将时间戳转换为 Date 对象用于格式化
        const dueDate = new Date(card.due);
        const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
        
        // 格式化日期
        const dueFormatted = formatDate(dueDate);
        const lastReviewFormatted = lastReviewDate ? formatDate(lastReviewDate) : '';
        const firstReviewFormatted = lastReviewDate ? formatDate(lastReviewDate) : ''; // TODO: 使用实际的 firstReview
        
        // 获取卡片内容（从 meta 或其他来源）
        // 注意：FSRSCard 不包含 content 字段，需要从 meta 或通过 blockId 查询思源 API
        const content = truncateContent((card.meta?.content as string) || '', 100);
        const fullContent = (card.meta?.content as string) || '';
        
        // 转换 CardType 枚举为字符串
        // FSRSCard.type 是 CardType 枚举，BrowserCard.cardType 是字符串字面量
        let cardType: 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
        if (typeof card.type === 'string') {
            cardType = card.type as any;
        }
        
        const result = {
            id: card.riffCardId || card.id,
            fsrsCardId: card.id,
            blockId: card.blockId,
            deckId: (card.meta?.deckId as string) || '',
            content,
            fullContent,
            rootId: (card.meta?.rootId as string) || '',
            
            // FSRS 状态
            state,
            stateLabel: this.getStateLabel(state),
            due: dueDate,
            dueFormatted,
            stability: card.stability,
            difficulty: card.difficulty,
            retrievability,
            reps: card.reps,
            lapses: card.lapses,
            elapsedDays,
            scheduledDays: card.scheduledDays,
            lastReview: lastReviewDate,
            lastReviewFormatted,
            
            // 新增字段
            interval: card.scheduledDays,
            firstReview: lastReviewDate, // TODO: 使用实际的 firstReview
            firstReviewFormatted,
            
            // 自定义属性
            priority: card.priority || 0,
            suspended: (card.meta?.suspended as boolean) || false,
            tags: card.tags,
            note: (card.meta?.note as string) || '',
            
            // Topic/Item 区分
            cardType,
            aFactor: card.aFactor,
        };
        
        console.log('[SRSBrowserAdapter] 输出 BrowserCard:', {
            id: result.id,
            fsrsCardId: result.fsrsCardId,
            blockId: result.blockId,
            cardType: result.cardType,
        });
        console.log('[SRSBrowserAdapter] ========== convertToBrowserCard 完成 ==========');
        
        return result;
    }
    
    /**
     * 转换卡片状态
     * 
     * @param state FSRS 卡片状态
     * @returns 浏览器卡片状态
     */
    private convertCardState(state: number): CardState {
        // FSRS 状态映射：
        // 0 = New
        // 1 = Learning
        // 2 = Review
        // 3 = Relearning
        switch (state) {
            case 0:
                return CardState.New;
            case 1:
                return CardState.Learning;
            case 2:
                return CardState.Review;
            case 3:
                return CardState.Relearning;
            default:
                return CardState.New;
        }
    }
    
    /**
     * 获取状态标签
     * 
     * @param state 卡片状态
     * @returns 状态标签
     */
    private getStateLabel(state: CardState): string {
        switch (state) {
            case CardState.New:
                return '新卡';
            case CardState.Learning:
                return '学习中';
            case CardState.Review:
                return '复习';
            case CardState.Relearning:
                return '重学';
            default:
                return '未知';
        }
    }
}
