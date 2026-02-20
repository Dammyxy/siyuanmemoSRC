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
 * - 监听 CardDeletedEvent
 * - 调用 Riff API 删除卡片
 * - 处理同步失败（重试、黑名单等）
 */

import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardDeletedEvent } from '@/core/xiuyuan/domain/events/CardDeletedEvent';
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
    
    // 监听 CardDeletedEvent
    this.eventBus.subscribe('CardDeleted', async (event: CardDeletedEvent) => {
      await this.handleCardDeleted(event);
    });
    
    console.log('[RiffSyncEventHandler] Event handlers set up successfully');
    console.log('[RiffSyncEventHandler] Subscribed to: CardDeleted');
    console.log('[RiffSyncEventHandler] EventBus subscriber count:', this.eventBus.getSubscriberCount('CardDeleted'));
  }

  /**
   * 处理卡片删除事件
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
   * 清理事件处理器
   */
  dispose(): void {
    // EventBus 目前没有 unsubscribe 方法
    // 如果需要，可以在 EventBus 中添加
    console.log('[RiffSyncEventHandler] Disposed');
  }
}
