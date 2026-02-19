/**
 * PracticeQueueManager - 管理练习队列操作
 */

import { getCardBlockIds } from '@/core/siyuan/block';
import { pushMsg } from '@/core/siyuan/api';
import type { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';
import type { QueueItem } from '@/core/queue';

export type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export class PracticeQueueManager {
  constructor(
    private retrievalQueue: any,
    private blockMenuHandler: BlockMenuHandler,
    private i18n: Record<string, any>
  ) {}

  /**
   * 获取练习队列的块 ID 列表
   */
  private async getPracticeQueueBlockIds(filter: PracticeQueueFilter): Promise<string[]> {
    return getCardBlockIds({ type: filter.type, value: filter.value });
  }

  /**
   * 预览练习队列（返回卡片数量）
   */
  async previewPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    return blockIds.length;
  }

  /**
   * 添加卡片到练习队列
   */
  async addPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    if (blockIds.length === 0) return 0;
    
    // ✅ 新架构：使用 addCard 方法（逐个添加）
    if (this.retrievalQueue?.addCard) {
      let added = 0;
      for (const blockId of blockIds) {
        try {
          await this.retrievalQueue.addCard(blockId, 'manual');
          added++;
        } catch (err) {
          console.error(`[PracticeQueueManager] 添加卡片失败: ${blockId}`, err);
        }
      }
      return added;
    }
    
    // ✅ 旧架构：使用 addItems 方法（批量添加）
    if (this.retrievalQueue?.addItems) {
      const cards = await this.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
      return this.retrievalQueue.addItems(cards as QueueItem[]);
    }
    
    return 0;
  }

  /**
   * 清空练习队列
   */
  async clearPracticeQueue(): Promise<void> {
    const { clearPracticeQueue } = await import('@/application/helpers/QueueHelpers');
    await clearPracticeQueue({
      blockMenuHandler: this.blockMenuHandler,
      retrievalQueue: this.retrievalQueue,
    });
  }

  /**
   * 开始练习队列
   */
  async startPracticeQueue(onOpenDialog: (cards: any[], mode: 'queue' | 'block') => void): Promise<void> {
    // ✅ 新架构：使用 getAllCards 或 getSize
    let cards: any[] = [];
    let isEmpty = false;
    
    if (this.retrievalQueue?.getAllCards) {
      cards = await this.retrievalQueue.getAllCards();
      isEmpty = cards.length === 0;
    } else if (this.retrievalQueue?.getSize) {
      const size = await this.retrievalQueue.getSize();
      isEmpty = size === 0;
    } else if (this.retrievalQueue?.getAllItems) {
      // ✅ 旧架构：使用 getAllItems
      cards = this.retrievalQueue.getAllItems();
      isEmpty = cards.length === 0;
    }
    
    if (isEmpty) {
      await pushMsg(this.i18n?.practiceQueueEmpty || '练习队列为空');
      return;
    }
    
    onOpenDialog(cards, 'queue');
  }
}
