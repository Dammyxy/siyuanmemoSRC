import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import { normalizeRiffCardId } from '../abstraction/QueueCardRef.ts';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy.ts';
import type { QueueItem } from '../types.ts';
import type { StorageManager } from '@/core/storage/manager';

type SubsetQueueItem = {
  blockID: string;
  cardID?: string;
  deckID: string;
};

export class SubsetPracticeStrategy implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly queue: SubsetQueueItem[];
  private readonly resolveMap = new Map<string, Promise<string | null>>();
  private readonly storage?: StorageManager;  // 🆕 添加 storage 参数

  constructor(options: { blockIds: string[]; deckID?: string; storage?: StorageManager }) {
    this.deckID = options.deckID || riff.BUILTIN_DECK_ID;
    this.storage = options.storage;  // 🆕 保存 storage
    const ids = Array.from(new Set((options.blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    this.queue = ids.map((blockID) => ({ blockID, deckID: this.deckID }));
    void this.prefetch(ids);
  }

  getUIConfig(_currentItem: QueueItem | null): { statsType: 'queue-size'; showRatingButtons: true; allowSkip: true } {
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
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

    try {
      const cardID = await this.resolveCardId(blockID);
      if (!cardID) return;

      if (feedback.action === 'skip') {
        await riff.skipReviewRiffCard(this.deckID, cardID);
        return;
      }
      if (feedback.action === 'rate') {
        const rating = feedback.rating;
        if (!rating) return;
        await riff.reviewRiffCard(this.deckID, cardID, rating);
        return;
      }
    } catch (err) {
      console.error('[SubsetPracticeStrategy] onFeedback failed:', err);
    }
  }

  private async prefetch(blockIds: string[]): Promise<void> {
    if (blockIds.length === 0) return;
    for (let i = 0; i < blockIds.length; i += 200) {
      const batch = blockIds.slice(i, i + 200);
      try {
        const blocks = await riff.getRiffCardsByBlockIDs(batch);
        const idMap = new Map<string, string>();
        for (const b of blocks as any[]) {
          const bid = String(b?.id || '');
          const cid = normalizeRiffCardId(b);
          if (bid && cid) idMap.set(bid, cid);
        }
        for (const it of this.queue) {
          const cid = idMap.get(it.blockID);
          if (cid && !it.cardID) it.cardID = cid;
        }
      } catch {}
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

    const blocks = await riff.getRiffCardsByBlockIDs([blockID]);
    const cid = normalizeRiffCardId((blocks as any[])?.[0]);
    if (cid) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = cid;
      return cid;
    }

    await riff.addRiffCards(this.deckID, [blockID]);
    const blocks2 = await riff.getRiffCardsByBlockIDs([blockID]);
    const cid2 = normalizeRiffCardId((blocks2 as any[])?.[0]);
    if (cid2) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = cid2;
      return cid2;
    }

    return null;
  }
}
