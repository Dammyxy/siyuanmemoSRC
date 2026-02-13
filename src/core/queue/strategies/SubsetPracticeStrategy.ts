import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import { normalizeRiffCardId } from '../abstraction/QueueCardRef.ts';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy.ts';
import type { QueueItem } from '../types.ts';
import type { StorageManager } from '@/core/storage/manager';
import { getHiddenContentTypes } from '../utils/hiddenContentTypes.ts';
import { warnDeprecatedQueueUsage } from '../deprecation';

type SubsetQueueItem = {
  blockID: string;
  cardID?: string;
  deckID: string;
};

/**
 * @deprecated Old architecture queue. Use src/queues/ instead when possible.
 */
export class SubsetPracticeStrategy implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly queue: SubsetQueueItem[];
  private readonly resolveMap = new Map<string, Promise<string | null>>();
  private readonly storage?: StorageManager;  // 🆕 添加 storage 参数

  constructor(options: { blockIds: string[]; deckID?: string; storage?: StorageManager }) {
    warnDeprecatedQueueUsage(this.constructor.name);
    this.deckID = options.deckID || riff.BUILTIN_DECK_ID;
    this.storage = options.storage;  // 🆕 保存 storage
    const ids = Array.from(new Set((options.blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    this.queue = ids.map((blockID) => ({ blockID, deckID: this.deckID }));
    void this.prefetch(ids);
  }

  getUIConfig(_currentItem: QueueItem | null): { statsType: 'queue-size'; showRatingButtons: true; allowSkip: true; hiddenContentTypes: string[] } {
    return { 
      statsType: 'queue-size', 
      showRatingButtons: true, 
      allowSkip: true,
      hiddenContentTypes: getHiddenContentTypes(),
    };
  }

  async getStats(): Promise<{ size: number; label?: string }> {
    return { size: this.queue.length };
  }

  async next(): Promise<QueueItem | null> {
    const head = this.queue[0];
    if (!head) return null;
    
    console.log('[SubsetPracticeStrategy] next() called:', {
      blockID: head.blockID,
      cardID: head.cardID,
      hasStorage: !!this.storage,
    });
    
    // 🆕 确保 cardID 已解析（等待 prefetch 完成或主动解析）
    if (!head.cardID) {
      console.log('[SubsetPracticeStrategy] cardID not found, resolving...');
      const cardID = await this.resolveCardId(head.blockID);
      if (cardID) {
        head.cardID = cardID;
        console.log('[SubsetPracticeStrategy] Resolved cardID:', cardID);
      } else {
        console.warn('[SubsetPracticeStrategy] Failed to resolve cardID for blockID:', head.blockID);
      }
    }
    
    // 🆕 从 storage 加载完整的卡片数据（包括 meta）
    let meta: any = { subset: true };
    if (this.storage) {
      try {
        // 优先使用 cardID 查询
        if (head.cardID) {
          console.log('[SubsetPracticeStrategy] Querying storage with cardID:', head.cardID);
          const card = this.storage.getCard(head.cardID);
          console.log('[SubsetPracticeStrategy] Storage query result:', {
            found: !!card,
            hasMeta: !!card?.meta,
            meta: card?.meta,
          });
          
          if (card?.meta) {
            meta = { ...meta, ...card.meta };
            console.log('[SubsetPracticeStrategy] ✅ Loaded card meta from storage by cardID:', {
              cardID: head.cardID,
              blockID: head.blockID,
              meta: card.meta,
              answerBlockID: card.meta.answerBlockID,
            });
          }
        }
        
        // 如果没有 cardID 或没找到，尝试用 blockID 查询
        if (!meta.answerBlockID) {
          console.log('[SubsetPracticeStrategy] Trying to find card by blockID:', head.blockID);
          const allCards = this.storage.getAllCards();
          console.log('[SubsetPracticeStrategy] Total cards in storage:', allCards.length);
          
          // 🆕 打印前3张完整卡片对象用于调试
          console.log('[SubsetPracticeStrategy] First 3 complete cards:', allCards.slice(0, 3));
          
          // 🆕 尝试不同的字段名（可能是 blockId 而不是 blockID）
          const card = allCards.find(c => 
            c.blockID === head.blockID || 
            (c as any).blockId === head.blockID ||
            c.cardID === head.blockID
          );
          
          console.log('[SubsetPracticeStrategy] Found card by blockID:', {
            found: !!card,
            card: card,
          });
          
          if (card?.meta) {
            meta = { ...meta, ...card.meta };
            console.log('[SubsetPracticeStrategy] ✅ Loaded card meta from storage by blockID:', {
              cardID: card.cardID,
              blockID: card.blockID,
              meta: card.meta,
              answerBlockID: card.meta.answerBlockID,
            });
          }
        }
      } catch (err) {
        console.error('[SubsetPracticeStrategy] Failed to load card from storage:', err);
      }
    } else {
      console.warn('[SubsetPracticeStrategy] No storage available');
    }
    
    console.log('[SubsetPracticeStrategy] Final meta:', meta);
    
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

    const idx = this.queue.findIndex((it) => it.blockID === blockID);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }

    // ✅ 新架构：使用 StorageManager（如果可用）
    // 注意：这是废弃的队列策略，只做最小化修改
    if (!this.storage) {
      console.warn('[SubsetPracticeStrategy] No storage available, skipping feedback');
      return;
    }

    try {
      const card = this.storage.getCardByBlockId(blockID);
      if (!card) {
        console.warn('[SubsetPracticeStrategy] Card not found in storage:', blockID);
        return;
      }

      if (feedback.action === 'skip') {
        // 跳过：不做任何操作（旧的 skipReviewRiffCard 已废弃）
        return;
      }
      
      if (feedback.action === 'rate') {
        const rating = feedback.rating;
        if (!rating) return;
        
        // 使用 SchedulerRouter 进行复习（需要从外部传入）
        // 由于这是废弃的策略，这里只记录警告
        console.warn('[SubsetPracticeStrategy] @deprecated: Cannot review card without SchedulerRouter');
        return;
      }
    } catch (err) {
      console.error('[SubsetPracticeStrategy] onFeedback failed:', err);
    }
  }

  private async prefetch(blockIds: string[]): Promise<void> {
    // ✅ 新架构：从 StorageManager 预取卡片 ID
    if (blockIds.length === 0) return;
    if (!this.storage) {
      console.warn('[SubsetPracticeStrategy] No storage available for prefetch');
      return;
    }

    for (const blockID of blockIds) {
      const card = this.storage.getCardByBlockId(blockID);
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

    // ✅ 新架构：从 StorageManager 解析卡片 ID
    if (!this.storage) {
      console.warn('[SubsetPracticeStrategy] No storage available for resolveCardId');
      return null;
    }

    const card = this.storage.getCardByBlockId(blockID);
    if (card) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = card.id;
      return card.id;
    }

    return null;
  }
}
