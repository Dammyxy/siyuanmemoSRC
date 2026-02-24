/**
 * Review View Adapter
 * 复习界面适配器
 * 
 * 负责将 ReviewViewController 集成到 ReviewView.vue 组件中。
 * 实现 IDataSourceObserver 接口，响应数据变更事件。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 4, 5, 6
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - 复习界面集成
 */

import type { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import type { IDataSourceObserver, DataChangeEvent, QueueType, IReviewQueue } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import { ReviewViewController } from '../../application/controllers/ReviewViewController';

/**
 * 复习界面适配器
 * 
 * 核心功能：
 * - 管理 ReviewViewController 实例
 * - 实现 IDataSourceObserver 接口
 * - 处理数据变更通知
 * - 提供复习操作接口（next、grade、skip）
 * 
 * 验证需求：4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */
export class ReviewViewAdapter implements IDataSourceObserver {
    /**
     * 统一数据源管理器实例
     */
    private manager: UnifiedDataSourceManager;
    
    /**
     * 复习界面控制器实例
     */
    private controller: ReviewViewController | null = null;
    
    /**
     * 当前队列实例
     */
    private currentQueue: IReviewQueue | null = null;
    
    /**
     * 当前卡片 ID
     */
    private currentCardId: string | null = null;

    private readonly i18n?: Record<string, string>;
    
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
    constructor(manager: UnifiedDataSourceManager, i18n?: Record<string, string>) {
        this.manager = manager;
        this.i18n = i18n;
        
        console.log('[ReviewViewAdapter] Adapter created');
    }
    
    // ========================================================================
    // 公共方法
    // ========================================================================
    
    /**
     * 初始化控制器
     * 
     * 验证需求：4.1, 8.1, 12.1
     * 
     * @param queueType 队列类型
     * @throws Error 如果初始化失败
     */
    async initializeController(queueType: QueueType): Promise<void> {
        try {
            // 记录初始化开始（需求 12.1：记录数据源类型）
            console.log(`[ReviewViewAdapter] Initializing controller:`, {
                queueType,
                dataSourceMode: 'advanced',
                timestamp: new Date().toISOString()
            });
            
            // 获取队列实例
            this.currentQueue = this.manager.getQueue(queueType);
            
            // 创建控制器实例
            this.controller = new ReviewViewController(this.manager);
            
            // 注册为观察者
            if (!this.isRegistered) {
                this.manager.registerObserver(this);
                this.isRegistered = true;
                console.log('[ReviewViewAdapter] Registered as observer');
            }
            
            // 记录初始化成功（需求 12.1）
            console.log(`[ReviewViewAdapter] Controller initialized successfully:`, {
                queueType,
                dataSourceMode: 'advanced',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // 记录详细的错误日志（需求 8.1）
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            console.error('[ReviewViewAdapter] Failed to initialize controller:', {
                queueType,
                error: errorMessage,
                stack: errorStack,
                timestamp: new Date().toISOString()
            });
            
            // 重新抛出错误，让调用者处理（显示用户友好的错误消息）
            throw new Error(`初始化复习控制器失败 (${queueType}): ${errorMessage}`);
        }
    }
    
    /**
     * 获取下一张卡片
     * 
     * 从当前队列加载下一张卡片。
     * 
     * 验证需求：4.2, 5.1
     * 
     * @returns 下一张卡片，如果队列为空则返回 null
     */
    async next(): Promise<FSRSCard | null> {
        if (!this.controller || !this.currentQueue) {
            console.warn('[ReviewViewAdapter] Controller or queue not initialized');
            throw new Error('Controller not initialized, fallback to useReviewSession');
        }
        
        try {
            console.log('[ReviewViewAdapter] Getting next card');
            
            // 使用控制器加载下一张卡片
            await this.controller.loadNextCard(this.currentQueue);
            
            // 获取当前卡片
            const card = this.controller.getCurrentCard();
            
            // 更新当前卡片 ID
            this.currentCardId = card?.id || null;
            
            console.log(`[ReviewViewAdapter] Next card: ${this.currentCardId || 'none'}`);
            
            return card;
        } catch (error) {
            console.error('[ReviewViewAdapter] Failed to get next card:', error);
            throw error;
        }
    }
    
    /**
     * 处理评分
     * 
     * 对当前卡片进行评分，并自动加载下一张卡片。
     * 
     * 验证需求：4.2, 5.2, 8.3
     * 
     * @param rating 评分值（1-4）
     * @throws Error 如果评分失败
     */
    async grade(rating: number): Promise<void> {
        if (!this.controller || !this.currentQueue) {
            console.warn('[ReviewViewAdapter] Controller or queue not initialized');
            throw new Error('Controller not initialized, fallback to useReviewSession');
        }
        
        if (!this.currentCardId) {
            console.warn('[ReviewViewAdapter] No current card to grade');
            return;
        }
        
        try {
            console.log(`[ReviewViewAdapter] Grading card ${this.currentCardId} with rating ${rating}`);
            
            // 创建评分按钮配置
            const button = {
                type: 'rating' as const,
                label: String(rating),
                value: rating,
            };
            
            // 使用控制器处理评分
            await this.controller.handleButtonClick(button);
            
            // 更新当前卡片 ID（控制器已自动加载下一张卡片）
            const nextCard = this.controller.getCurrentCard();
            this.currentCardId = nextCard?.id || null;
            
            console.log(`[ReviewViewAdapter] Card graded, next card: ${this.currentCardId || 'none'}`);
        } catch (error) {
            // 记录详细的错误日志（需求 8.3）
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            console.error('[ReviewViewAdapter] Failed to grade card:', {
                cardId: this.currentCardId,
                rating,
                error: errorMessage,
                stack: errorStack,
                timestamp: new Date().toISOString()
            });
            
            // 重新抛出错误，让调用者处理
            // 调用者应该：
            // 1. 显示错误消息
            // 2. 允许用户重试
            // 3. 不改变当前状态（保持在当前卡片）
            throw new Error(`评分失败 (卡片 ${this.currentCardId}, 评分 ${rating}): ${errorMessage}`);
        }
    }
    
    /**
     * 处理跳过
     * 
     * 跳过当前卡片，不评分，直接加载下一张卡片。
     * 
     * 验证需求：4.3, 8.3
     * 
     * @throws Error 如果跳过失败
     */
    async skip(): Promise<void> {
        if (!this.controller || !this.currentQueue) {
            console.warn('[ReviewViewAdapter] Controller or queue not initialized');
            throw new Error('Controller not initialized, fallback to useReviewSession');
        }
        
        if (!this.currentCardId) {
            console.warn('[ReviewViewAdapter] No current card to skip');
            return;
        }
        
        try {
            console.log(`[ReviewViewAdapter] Skipping card ${this.currentCardId}`);
            
            // 创建跳过按钮配置
            const button = {
                type: 'action' as const,
                label: this.t('actionNext', 'Next'),
                action: 'next' as const,
            };
            
            // 使用控制器处理跳过
            await this.controller.handleButtonClick(button);
            
            // 更新当前卡片 ID（控制器已自动加载下一张卡片）
            const nextCard = this.controller.getCurrentCard();
            this.currentCardId = nextCard?.id || null;
            
            console.log(`[ReviewViewAdapter] Card skipped, next card: ${this.currentCardId || 'none'}`);
        } catch (error) {
            // 记录详细的错误日志（需求 8.3）
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            console.error('[ReviewViewAdapter] Failed to skip card:', {
                cardId: this.currentCardId,
                error: errorMessage,
                stack: errorStack,
                timestamp: new Date().toISOString()
            });
            
            // 重新抛出错误，让调用者处理
            throw new Error(`跳过失败 (卡片 ${this.currentCardId}): ${errorMessage}`);
        }
    }
    
    /**
     * 获取当前卡片
     * 
     * @returns 当前卡片，如果没有卡片则返回 null
     */
    getCurrentCard(): FSRSCard | null {
        if (!this.controller) {
            return null;
        }
        
        return this.controller.getCurrentCard();
    }
    
    /**
     * 获取当前队列
     * 
     * @returns 当前队列，如果没有队列则返回 null
     */
    getCurrentQueue(): IReviewQueue | null {
        return this.currentQueue;
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
     * 验证需求：4.4
     */
    destroy(): void {
        console.log('[ReviewViewAdapter] Destroying adapter');
        
        // 取消注册观察者
        if (this.isRegistered) {
            this.manager.unregisterObserver(this);
            this.isRegistered = false;
            console.log('[ReviewViewAdapter] Unregistered as observer');
        }
        
        // 清理引用
        this.controller = null;
        this.currentQueue = null;
        this.currentCardId = null;
        this.onDataChangeCallback = null;
    }
    
    // ========================================================================
    // IDataSourceObserver 接口实现
    // ========================================================================
    
    /**
     * 响应数据变化事件
     * 
     * 当数据变化时，自动刷新复习界面。
     * 
     * 验证需求：3.2, 12.3
     * 
     * @param event 数据变更事件
     */
    onDataChanged(event: DataChangeEvent): void {
        // 记录观察者通知（需求 12.3：记录事件类型、受影响的数据、通知时间）
        console.log('[ReviewViewAdapter] Data changed:', {
            eventType: event.type,
            queueType: event.queueType,
            cardIds: event.cardIds,
            cardCount: event.cardIds?.length || 0,
            currentCardId: this.currentCardId,
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
        }
        
        // 调用回调函数通知 Vue 组件
        if (this.onDataChangeCallback) {
            this.onDataChangeCallback(event);
        }
    }
    
    // ========================================================================
    // 私有方法 - 事件处理
    // ========================================================================

    private t(key: string, fallback: string): string {
        return this.i18n?.[key] || fallback;
    }
    
    /**
     * 处理卡片更新事件
     * 
     * 如果当前卡片被更新，刷新显示。
     * 
     * 验证需求：3.3, 6.2
     * 
     * @param cardIds 受影响的卡片 ID 列表
     */
    private handleCardUpdated(cardIds: string[]): void {
        console.log(`[ReviewViewAdapter] Handling card-updated event: ${cardIds.length} cards`);
        
        // 如果当前卡片被更新，触发刷新
        if (this.currentCardId && cardIds.includes(this.currentCardId)) {
            console.log(`[ReviewViewAdapter] Current card ${this.currentCardId} was updated`);
            // 触发 Vue 组件刷新
            // 实际的刷新逻辑由 Vue 组件通过回调函数处理
        }
    }
    
    /**
     * 处理卡片删除事件
     * 
     * 如果当前卡片被删除，跳到下一张。
     * 
     * 验证需求：3.3, 6.3
     * 
     * @param cardIds 受影响的卡片 ID 列表
     */
    private handleCardDeleted(cardIds: string[]): void {
        console.log(`[ReviewViewAdapter] Handling card-deleted event: ${cardIds.length} cards`);
        
        // 如果当前卡片被删除，自动跳到下一张
        if (this.currentCardId && cardIds.includes(this.currentCardId)) {
            console.log(`[ReviewViewAdapter] Current card ${this.currentCardId} was deleted, skipping to next`);
            void this.skip();
        }
    }
    
    /**
     * 处理队列变更事件
     * 
     * 验证需求：3.4
     * 
     * @param queueType 受影响的队列类型
     */
    private handleQueueChanged(queueType?: QueueType): void {
        console.log(`[ReviewViewAdapter] Handling queue-changed event: ${queueType || 'all'}`);
        
        // 如果是当前队列，刷新队列统计
        if (!queueType || queueType === this.currentQueue?.getType()) {
            // 触发 Vue 组件刷新
            // 实际的刷新逻辑由 Vue 组件通过回调函数处理
        }
    }
}
