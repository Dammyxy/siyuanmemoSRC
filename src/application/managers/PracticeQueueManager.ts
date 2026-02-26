/**
 * PracticeQueueManager - manages practice queue operations.
 */

import type { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';
import type { QueueItem } from '@/core/queue';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PracticeQueueManager');

export type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

interface RetrievalQueuePort {
  addCard?: (blockId: string, source: string) => Promise<void>;
  addItems?: (items: QueueItem[]) => number | Promise<number>;
  clear: () => Promise<void>;
  getAllCards?: () => Promise<QueueItem[]>;
  getSize?: () => Promise<number>;
}

export class PracticeQueueManager {
  private readonly siyuanApi: ManagerSiyuanPort;

  constructor(
    private retrievalQueue: RetrievalQueuePort,
    private blockMenuHandler: BlockMenuHandler,
    private i18n: Record<string, string>,
    ports?: { siyuanApi?: ManagerSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new ManagerSiyuanAdapter();
  }

  private async getPracticeQueueBlockIds(filter: PracticeQueueFilter): Promise<string[]> {
    return this.siyuanApi.getCardBlockIds({ type: filter.type, value: filter.value });
  }

  async previewPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    return blockIds.length;
  }

  async addPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    if (blockIds.length === 0) {
      return 0;
    }

    if (this.retrievalQueue.addCard) {
      let added = 0;
      for (const blockId of blockIds) {
        try {
          await this.retrievalQueue.addCard(blockId, 'manual');
          added++;
        } catch (error) {
          logger.error(`Failed to add card: ${blockId}`, error);
        }
      }
      return added;
    }

    if (this.retrievalQueue.addItems) {
      const cards = await this.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
      return await this.retrievalQueue.addItems(cards as unknown as QueueItem[]);
    }

    return 0;
  }

  async clearPracticeQueue(): Promise<void> {
    try {
      await this.retrievalQueue.clear();
      await this.siyuanApi.pushMsg('✅ 已清空练习队列');
    } catch (error) {
      logger.error('Failed to clear queue:', error);
      await this.siyuanApi.pushErrMsg('清空队列失败，请查看控制台');
    }
  }

  async startPracticeQueue(
    onOpenDialog: (cards: QueueItem[], mode: 'queue' | 'block') => void
  ): Promise<void> {
    let cards: QueueItem[] = [];
    let isEmpty = false;

    if (typeof this.retrievalQueue.getAllCards === 'function') {
      const queueCards = await this.retrievalQueue.getAllCards();
      cards = Array.isArray(queueCards) ? queueCards : [];
      isEmpty = cards.length === 0;
    } else if (typeof this.retrievalQueue.getSize === 'function') {
      const size = await this.retrievalQueue.getSize();
      isEmpty = size === 0;
    } else {
      logger.warn('Retrieval queue does not implement getAllCards/getSize');
      isEmpty = true;
    }

    if (isEmpty) {
      await this.siyuanApi.pushMsg(this.i18n.practiceQueueEmpty || '练习队列为空');
      return;
    }

    onOpenDialog(cards, 'queue');
  }
}
