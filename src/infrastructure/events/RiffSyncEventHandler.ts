/**
 * RiffSyncEventHandler - Riff 同步事件处理器
 * 
 * @description
 * 监听领域事件并同步到 Riff 系统。
 * 
 * **设计原则**：
 * - 基础设施层：处理与外部系统（Riff）的集成
 * - 事件驱动：通过领域事件解耦领域层和基础设施层
 * - 单一职责：只负责 Riff 同步
 * 
 * **职责**：
 * - 监听 CardDeletedEvent（单个卡片删除）
 * - 监听 CardsDeletedEvent（批量卡片删除）
 * - 调用 Riff API 删除卡片
 * - 处理同步失败（重试、黑名单等）
 */

import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardDeletedEvent } from '@/core/xiuyuan/domain/events/CardDeletedEvent';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import type { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';

export class RiffSyncEventHandler {
  constructor(
    private readonly eventBus: EventBus,
    private readonly syncService: XiuyuanSyncService
  ) {
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   * 
   * @private
   */
  private setupEventHandlers(): void {
    console.log('[RiffSyncEventHandler] Setting up event handlers...');
    
    // 监听 CardDeletedEvent（单个卡片删除）
    this.eventBus.subscribe('CardDeleted', async (event: CardDeletedEvent) => {
      await this.handleCardDeleted(event);
    });
    
    // 监听 CardsDeletedEvent（批量卡片删除）
    this.eventBus.subscribe('CardsDeleted', async (event: CardsDeletedEvent) => {
      await this.handleCardsDeleted(event);
    });
    
    console.log('[RiffSyncEventHandler] Event handlers set up successfully');
    console.log('[RiffSyncEventHandler] Subscribed to: CardDeleted, CardsDeleted');
    console.log('[RiffSyncEventHandler] EventBus subscriber count (CardDeleted):', this.eventBus.getSubscriberCount('CardDeleted'));
    console.log('[RiffSyncEventHandler] EventBus subscriber count (CardsDeleted):', this.eventBus.getSubscriberCount('CardsDeleted'));
  }

  /**
   * 处理单个卡片删除事件
   * 
   * @private
   * @param event - 卡片删除事件
   */
  private async handleCardDeleted(event: CardDeletedEvent): Promise<void> {
    try {
      console.log(`[RiffSyncEventHandler] Handling CardDeleted event for card: ${event.cardId}`);
      
      // 调用同步服务删除 Riff 卡片
      await this.syncService.deleteSync(event.cardId);
      
      console.log(`[RiffSyncEventHandler] Successfully synced card deletion to Riff: ${event.cardId}`);
    } catch (error) {
      // 错误已经在 syncService.deleteSync() 中处理（重试、黑名单等）
      // 这里只记录日志
      console.error(`[RiffSyncEventHandler] Failed to sync card deletion to Riff:`, error);
    }
  }

  /**
   * 处理批量卡片删除事件
   * 
   * @private
   * @param event - 批量卡片删除事件
   */
  private async handleCardsDeleted(event: CardsDeletedEvent): Promise<void> {
    try {
      console.log(`[RiffSyncEventHandler] Handling CardsDeleted event for ${event.cardIds.length} cards`);
      
      // ✅ 使用批量删除 API，并发处理提升性能
      const successCount = await this.syncService.deleteSyncBatch(event.cardIds);
      const failCount = event.cardIds.length - successCount;
      
      console.log(`[RiffSyncEventHandler] Batch sync completed: ${successCount} success, ${failCount} failed`);
    } catch (error) {
      console.error(`[RiffSyncEventHandler] Failed to handle batch deletion:`, error);
    }
  }

  /**
   * 清理事件处理器
   */
  dispose(): void {
    // EventBus 目前没有 unsubscribe 方法
    // 如果需要，可以在 EventBus 中添加
    console.log('[RiffSyncEventHandler] Disposed');
  }
}
