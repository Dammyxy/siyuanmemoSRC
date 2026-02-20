import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy.ts';
import type { QueueItem } from '../types.ts';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';  // ✅ 使用 UnifiedStorageManager
import { getHiddenContentTypes } from '../utils/hiddenContentTypes.ts';
import { warnDeprecatedQueueUsage } from '../deprecation';
import { FinalDrillSequencer } from '../sequencers/FinalDrillSequencer';

type TemporaryDrillItem = {
  blockID: string;
  cardID?: string;
  deckID: string;
};

/**
 * TemporaryDrillStrategy - 临时练习队列策略
 * 
 * 特点：
 * - 评分 4（简单）：从队列移除
 * - 评分 1/2/3（困难/一般/良好）：保留在队列中
 * - 使用 FinalDrillSequencer 动态洗牌（SuperMemo FlipElement 算法）
 * - 不持久化到 localStorage
 * - 不影响间隔重复算法
 * 
 * 类似 FinalDrill，但是临时的、不持久化的版本。
 * 
 * @deprecated Old architecture queue. Use src/queues/ instead when possible.
 */
export class TemporaryDrillStrategy implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly queue: TemporaryDrillItem[];
  private readonly sequencer: FinalDrillSequencer<TemporaryDrillItem>;
  private readonly resolveMap = new Map<string, Promise<string | null>>();
  private readonly storage?: UnifiedStorageManager;  // ✅ 使用 UnifiedStorageManager

  constructor(options: { blockIds: string[]; deckID?: string; storage?: UnifiedStorageManager }) {  // ✅ 使用 UnifiedStorageManager
    warnDeprecatedQueueUsage(this.constructor.name);
    this.deckID = options.deckID || riff.BUILTIN_DECK_ID;
    this.storage = options.storage;
    const ids = Array.from(new Set((options.blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    this.queue = ids.map((blockID) => ({ blockID, deckID: this.deckID }));
    
    // 初始化 FinalDrillSequencer 用于动态洗牌
    this.sequencer = new FinalDrillSequencer<TemporaryDrillItem>(this.queue, {
      lowestPick: 5,
      lowestInsert: 3,
      highestInsert: 6,
    });
    
    void this.prefetch(ids);
    
    console.log(`[TemporaryDrillStrategy] Initialized with ${this.queue.length} cards, using FinalDrillSequencer`);
  }

  getUIConfig(_currentItem: QueueItem | null): { 
    statsType: 'queue-size'; 
    showRatingButtons: true; 
    allowSkip: true; 
    hiddenContentTypes: string[] 
  } {
    return { 
      statsType: 'queue-size', 
      showRatingButtons: true, 
      allowSkip: true,
      hiddenContentTypes: getHiddenContentTypes(),
    };
  }

  async getStats(): Promise<{ size: number; label?: string }> {
    return { size: this.sequencer.size() };
  }

  async next(): Promise<QueueItem | null> {
    // 使用 FinalDrillSequencer 获取下一张卡片（自动执行 FlipElement 洗牌）
    const head = await this.sequencer.next();
    if (!head) return null;
    
    console.log('[TemporaryDrillStrategy] next() called (with FlipElement shuffle):', {
      blockID: head.blockID,
      cardID: head.cardID,
      queueSize: this.sequencer.size(),
    });
    
    // 确保 cardID 已解析
    if (!head.cardID) {
      const cardID = await this.resolveCardId(head.blockID);
      if (cardID) {
        head.cardID = cardID;
      }
    }
    
    // 从 storage 加载完整的卡片数据（包括 meta）
    let meta: any = { temporaryDrill: true };
    if (this.storage) {
      try {
        // 优先使用 cardID 查询
        if (head.cardID) {
          const card = this.storage.getCard(head.cardID);
          if (card?.meta) {
            meta = { ...meta, ...card.meta };
          }
        }
        
        // 如果没有找到，尝试用 blockID 查询
        if (!meta.answerBlockID) {
          const cards = this.storage.getCardsByBlockId(head.blockID);  // ✅ 使用 getCardsByBlockId
          const card = cards[0];
          if (card?.meta) {
            meta = { ...meta, ...card.meta };
          }
        }
      } catch (err) {
        console.error('[TemporaryDrillStrategy] Failed to load card from storage:', err);
      }
    }
    
    return {
      cardID: head.cardID || '',
      blockID: head.blockID,
      deckID: head.deckID,
      priority: DEFAULT_PRIORITY,
      nextDues: { 1: '', 2: '', 3: '', 4: '' },
      meta,
    };
  }

  async onFeedback(
    currentItem: QueueItem | null,
    feedback: QueueFeedback,
  ): Promise<void> {
    const blockID = String((currentItem as any)?.blockID || (currentItem as any)?.blockId || '');
    if (!blockID) return;

    if (feedback.action === 'skip') {
      // 跳过：将卡片重新加入队列末尾
      const item = this.queue.find(it => it.blockID === blockID);
      if (item) {
        this.sequencer.insertAt([item], this.sequencer.size());
        console.log('[TemporaryDrillStrategy] Card skipped, added back to queue:', blockID);
      }
      return;
    }
    
    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;
      
      console.log('[TemporaryDrillStrategy] Card rated:', {
        blockID,
        rating,
        queueSizeBefore: this.sequencer.size(),
      });
      
      // 🎯 核心逻辑：评分 4 移除，1/2/3 重新加入队列
      if (rating === 4) {
        // 评分 4（简单）：不做任何操作（已经从队列移除了）
        console.log('[TemporaryDrillStrategy] ✅ Card rated 4 (Easy), removed from queue. Queue size:', this.sequencer.size());
      } else {
        // 评分 1/2/3（困难/一般/良好）：重新加入队列末尾
        const item = this.queue.find(it => it.blockID === blockID);
        if (item) {
          this.sequencer.insertAt([item], this.sequencer.size());
          console.log('[TemporaryDrillStrategy] ⏭️ Card rated 1/2/3, added back to queue. Queue size:', this.sequencer.size());
        }
      }
    }
  }

  private async prefetch(blockIds: string[]): Promise<void> {
    if (blockIds.length === 0) return;
    if (!this.storage) {
      console.warn('[TemporaryDrillStrategy] No storage available for prefetch');
      return;
    }

    for (const blockID of blockIds) {
      const card = this.storage.getCardsByBlockId(blockID)[0];  // ✅ 使用 getCardsByBlockId
      if (card) {
        const it = this.queue.find((x) => x.blockID === blockID);
        if (it && !it.cardID) {
          it.cardID = card.id;
        }
      }
    }
  }

  private resolveCardId(blockID: string): Promise<string | null> {
    const cached = this.resolveMap.get(blockID);
    if (cached) return cached;
    const p = this.resolveCardIdInner(blockID);
    this.resolveMap.set(blockID, p);
    return p;
  }

  private async resolveCardIdInner(blockID: string): Promise<string | null> {
    const existing = this.queue.find((it) => it.blockID === blockID)?.cardID;
    if (existing) return existing;

    if (!this.storage) {
      console.warn('[TemporaryDrillStrategy] No storage available for resolveCardId');
      return null;
    }

    const card = this.storage.getCardsByBlockId(blockID)[0];  // ✅ 使用 getCardsByBlockId
    if (card) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = card.id;
      return card.id;
    }

    return null;
  }
}
