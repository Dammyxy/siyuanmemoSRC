/**
 * Review View Controller
 * 复习界面控制器
 * 
 * 负责管理复习界面的状态和交互逻辑，包括：
 * - 加载下一张卡片
 * - 根据卡片类型和队列类型返回按钮配置
 * - 处理按钮点击事件
 * - 处理评分和操作（插入、跳过、锁定种子）
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { IReviewQueue, QueueType, ReviewButtonConfig } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import { NeuralRoamQueue } from '../queues/NeuralRoamQueue';

/**
 * ReviewViewController 类
 * 
 * 复习界面控制器，负责：
 * - 从队列加载卡片
 * - 根据卡片类型和队列类型生成按钮配置
 * - 处理用户交互（评分、插入、跳过、锁定种子）
 * - 管理复习会话状态
 * 
 * @see 需求 10.1, 10.2, 10.3, 10.4, 21.1, 21.2, 21.3
 */
export class ReviewViewController {
    // ========================================================================
    // 私有属性
    // ========================================================================
    
    /**
     * 统一数据源管理器
     * 
     * 用于访问数据和队列。
     */
    private manager: UnifiedDataSourceManager;
    
    /**
     * 当前卡片
     * 
     * 正在复习的卡片，如果没有卡片则为 null。
     */
    private currentCard: FSRSCard | null;
    
    /**
     * 当前队列
     * 
     * 当前正在复习的队列。
     */
    private currentQueue: IReviewQueue | null;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 构造函数
     * 
     * 初始化复习界面控制器。
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        this.manager = manager;
        this.currentCard = null;
        this.currentQueue = null;
    }
    
    // ========================================================================
    // 公共方法
    // ========================================================================
    
    /**
     * 加载下一张卡片
     * 
     * 从指定队列加载下一张卡片并渲染。
     * 如果队列为空，显示空状态。
     * 
     * 对于神经漫游队列，使用 getNextCard() 方法获取下一张卡片（扩散激活）。
     * 对于其他队列，从 getCards() 返回的数组中获取第一张卡片。
     * 
     * @param queue 要加载卡片的队列
     * @see 需求 10.1
     */
    public async loadNextCard(queue: IReviewQueue): Promise<void> {
        this.currentQueue = queue;
        
        try {
            // 对于神经漫游队列，使用扩散激活获取下一张卡片
            if (queue.getType() === QueueType.NeuralRoam) {
                const neuralQueue = queue as NeuralRoamQueue;
                this.currentCard = await neuralQueue.getNextCard();
            } else {
                // 对于其他队列，获取队列中的第一张卡片
                const cards = await queue.getCards();
                this.currentCard = cards.length > 0 ? cards[0] : null;
            }
            
            // 渲染卡片或空状态
            if (this.currentCard) {
                this.renderCard();
            } else {
                this.showEmptyState();
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ReviewViewController] Failed to load next card:', errorMessage);
            throw new Error(`加载下一张卡片失败: ${errorMessage}`);
        }
    }
    
    /**
     * 获取当前卡片的按钮配置
     * 
     * 根据卡片类型和队列类型返回相应的按钮配置：
     * 
     * 1. 项目卡片（item）：
     *    - 普通队列：4 个评分按钮（1, 2, 3, 4）
     *    - 神经漫游队列：4 个评分按钮 + "锁定为种子"按钮
     * 
     * 2. 主题卡片（topic）：
     *    - 普通队列："插入"和"下一个"按钮
     *    - 神经漫游队列："插入"、"下一个"和"锁定为种子"按钮
     * 
     * 3. 普通块（仅神经漫游）：
     *    - "下一个"和"锁定为种子"按钮
     * 
     * @param card 要获取按钮配置的卡片
     * @returns 按钮配置数组
     * @see 需求 10.1, 10.2, 21.1, 21.2, 21.3
     */
    public getButtonsForCard(card: FSRSCard): ReviewButtonConfig[] {
        // 检查是否在神经漫游队列中
        const isNeuralRoam = this.currentQueue?.getType() === QueueType.NeuralRoam;
        
        if (card.cardType === 'item') {
            // 项目卡片：显示 4 个评分按钮
            const buttons: ReviewButtonConfig[] = [
                { type: 'rating', label: '1', value: 1 },
                { type: 'rating', label: '2', value: 2 },
                { type: 'rating', label: '3', value: 3 },
                { type: 'rating', label: '4', value: 4 },
            ];
            
            // 神经漫游模式：添加"锁定为种子"按钮
            if (isNeuralRoam) {
                buttons.push({ 
                    type: 'action', 
                    label: '锁定为种子', 
                    action: 'lock-seed' 
                });
            }
            
            return buttons;
        } else {
            // 主题卡片：显示插入和下一个按钮
            const buttons: ReviewButtonConfig[] = [
                { type: 'action', label: '插入', action: 'insert' },
                { type: 'action', label: '下一个', action: 'next' },
            ];
            
            // 神经漫游模式：添加"锁定为种子"按钮
            if (isNeuralRoam) {
                buttons.push({ 
                    type: 'action', 
                    label: '锁定为种子', 
                    action: 'lock-seed' 
                });
            }
            
            return buttons;
        }
    }
    
    /**
     * 处理按钮点击
     * 
     * 根据按钮类型调用相应的处理方法：
     * - rating 类型：调用 handleRating()
     * - action 类型：调用 handleAction()
     * 
     * 处理完成后，自动加载下一张卡片。
     * 
     * @param button 被点击的按钮配置
     * @see 需求 10.1
     */
    public async handleButtonClick(button: ReviewButtonConfig): Promise<void> {
        if (!this.currentCard || !this.currentQueue) {
            console.warn('[ReviewViewController] No current card or queue');
            return;
        }
        
        try {
            if (button.type === 'rating' && button.value !== undefined) {
                // 处理评分
                await this.handleRating(button.value);
            } else if (button.type === 'action' && button.action) {
                // 处理操作
                await this.handleAction(button.action);
            }
            
            // 加载下一张卡片
            await this.loadNextCard(this.currentQueue);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ReviewViewController] Failed to handle button click:', errorMessage);
            throw new Error(`处理按钮点击失败: ${errorMessage}`);
        }
    }
    
    /**
     * 获取当前卡片
     * 
     * @returns 当前卡片，如果没有卡片则返回 null
     */
    public getCurrentCard(): FSRSCard | null {
        return this.currentCard;
    }
    
    /**
     * 获取当前队列
     * 
     * @returns 当前队列，如果没有队列则返回 null
     */
    public getCurrentQueue(): IReviewQueue | null {
        return this.currentQueue;
    }
    
    // ========================================================================
    // 私有方法
    // ========================================================================
    
    /**
     * 渲染卡片
     * 
     * 渲染当前卡片和对应的按钮。
     * 此方法应该由 UI 层实现具体的渲染逻辑。
     * 
     * 在实际应用中，此方法会：
     * 1. 显示卡片内容
     * 2. 根据 getButtonsForCard() 返回的配置渲染按钮
     * 3. 绑定按钮点击事件到 handleButtonClick()
     */
    private renderCard(): void {
        if (!this.currentCard) return;
        
        // 获取按钮配置
        const buttons = this.getButtonsForCard(this.currentCard);
        
        // 调用 UI 层的渲染方法
        this.displayCardWithButtons(this.currentCard, buttons);
    }
    
    /**
     * 显示卡片和按钮
     * 
     * 此方法应该由 UI 层实现，用于实际渲染卡片和按钮。
     * 这里提供一个占位实现，实际使用时应该被覆盖。
     * 
     * @param card 要显示的卡片
     * @param buttons 按钮配置数组
     */
    private displayCardWithButtons(card: FSRSCard, buttons: ReviewButtonConfig[]): void {
        // 占位实现
        // 实际应用中，此方法会被 UI 层覆盖
        console.log('[SiyuanMemo] ReviewViewController: Display card:', card.id);
        console.log('[SiyuanMemo] ReviewViewController: Buttons:', buttons);
    }
    
    /**
     * 显示空状态
     * 
     * 当队列为空时显示空状态。
     * 此方法应该由 UI 层实现具体的显示逻辑。
     */
    private showEmptyState(): void {
        // 占位实现
        // 实际应用中，此方法会被 UI 层覆盖
        console.log('[SiyuanMemo] ReviewViewController: Queue is empty');
    }
    
    /**
     * 处理评分
     * 
     * 将评分传递给当前队列的 handleReview() 方法。
     * 队列会根据评分更新卡片的调度数据，并决定是否从队列中移除卡片。
     * 
     * 评分逻辑：
     * - 正式复习队列（检索练习、渐进学习、过滤组、神经漫游）：
     *   - 评分 3/4：更新到期日期，从队列移除
     *   - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
     * - 最终训练队列：
     *   - 评分 4：从队列移除
     *   - 评分 1/2/3：保留在队列中
     *   - 评分不计入调度算法
     * 
     * @param rating 评分值（1-4）
     * @see 需求 10.1, 7.1, 7.2, 8.1, 8.2, 8.3
     */
    private async handleRating(rating: number): Promise<void> {
        if (!this.currentCard || !this.currentQueue) {
            throw new Error('No current card or queue');
        }
        
        try {
            // 调用队列的 handleReview() 方法
            await this.currentQueue.handleReview(this.currentCard.id, rating);
            
            console.log(`[SiyuanMemo] ReviewViewController: Card ${this.currentCard.id} rated: ${rating}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ReviewViewController] Failed to handle rating:', errorMessage);
            throw new Error(`处理评分失败: ${errorMessage}`);
        }
    }
    
    /**
     * 处理操作
     * 
     * 处理非评分操作，包括：
     * - insert: 插入卡片到指定位置
     * - next: 跳过当前卡片
     * - lock-seed: 锁定当前块为种子（仅神经漫游）
     * 
     * 操作逻辑：
     * - insert: 提示用户输入位置，然后在该位置插入卡片
     * - next: 跳过卡片，不评分，不更新调度数据
     * - lock-seed: 将当前块添加到神经漫游的种子块集合
     * 
     * @param action 操作类型
     * @see 需求 10.1, 10.3, 10.4, 19.1, 19.2, 21.3
     */
    private async handleAction(action: 'insert' | 'next' | 'lock-seed'): Promise<void> {
        if (!this.currentCard || !this.currentQueue) {
            throw new Error('No current card or queue');
        }
        
        try {
            if (action === 'insert') {
                // 插入操作：提示用户输入位置
                const position = await this.promptForPosition();
                await this.insertCardAtPosition(this.currentCard.id, position);
                
                console.log(`[SiyuanMemo] ReviewViewController: Card ${this.currentCard.id} inserted at position ${position}`);
            } else if (action === 'next') {
                // 跳过操作：不做任何操作，直接加载下一张卡片
                console.log(`[SiyuanMemo] ReviewViewController: Card ${this.currentCard.id} skipped`);
            } else if (action === 'lock-seed') {
                // 锁定种子操作：仅神经漫游队列支持
                if (this.currentQueue.getType() === QueueType.NeuralRoam) {
                    const neuralQueue = this.currentQueue as NeuralRoamQueue;
                    await neuralQueue.lockCurrentAsSeed(this.currentCard.id);
                    
                    // 显示通知
                    this.showNotification('已锁定为种子块');
                    
                    console.log(`[SiyuanMemo] ReviewViewController: Card ${this.currentCard.id} locked as seed`);
                } else {
                    console.warn('[SiyuanMemo] ReviewViewController: Lock seed action is only available in Neural Roam queue');
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ReviewViewController] Failed to handle action:', errorMessage);
            throw new Error(`处理操作失败: ${errorMessage}`);
        }
    }
    
    /**
     * 提示用户输入位置
     * 
     * 显示对话框，让用户输入要插入卡片的位置。
     * 此方法应该由 UI 层实现具体的提示逻辑。
     * 
     * @returns 用户输入的位置（从 0 开始）
     */
    private async promptForPosition(): Promise<number> {
        // 占位实现
        // 实际应用中，此方法会被 UI 层覆盖
        // 这里返回 0 作为默认位置
        return 0;
    }
    
    /**
     * 在指定位置插入卡片
     * 
     * 将卡片插入到队列的指定位置。
     * 此方法应该由队列实现具体的插入逻辑。
     * 
     * 注意：当前的队列接口不支持指定位置插入，
     * 这个功能需要在后续任务中扩展队列接口。
     * 
     * @param cardId 要插入的卡片 ID
     * @param position 插入位置（从 0 开始）
     */
    private async insertCardAtPosition(cardId: string, position: number): Promise<void> {
        // 占位实现
        // 实际应用中，此方法需要调用队列的插入方法
        // 当前的队列接口不支持指定位置插入
        console.log(`[SiyuanMemo] ReviewViewController: Insert card ${cardId} at position ${position}`);
        
        // TODO: 扩展队列接口以支持指定位置插入
        // await this.currentQueue.insertCardAt(cardId, position);
    }
    
    /**
     * 显示通知
     * 
     * 显示一个简短的通知消息。
     * 此方法应该由 UI 层实现具体的显示逻辑。
     * 
     * @param message 通知消息
     */
    private showNotification(message: string): void {
        // 占位实现
        // 实际应用中，此方法会被 UI 层覆盖
        console.log(`[SiyuanMemo] ReviewViewController: Notification: ${message}`);
    }
}
