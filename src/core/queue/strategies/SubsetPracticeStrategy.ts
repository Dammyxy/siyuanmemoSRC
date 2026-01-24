import { riff } from '@/core/siyuan';

type SubsetQueueItem = {
  blockID: string;
  cardID?: string;
  deckID: string;
};

export class SubsetPracticeStrategy {
  private readonly deckID: string;
  private readonly queue: SubsetQueueItem[];
  private readonly resolveMap = new Map<string, Promise<string | null>>();

  constructor(options: { blockIds: string[]; deckID?: string }) {
    this.deckID = options.deckID || riff.BUILTIN_DECK_ID;
    const ids = Array.from(new Set((options.blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    this.queue = ids.map((blockID) => ({ blockID, deckID: this.deckID }));
    void this.prefetch(ids);
  }

  getUIConfig(_currentItem: any | null): { statsType: 'queue-size'; showRatingButtons: true; allowSkip: true } {
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<{ size: number; label?: string }> {
    return { size: this.queue.length };
  }

  async next(): Promise<any | null> {
    const head = this.queue[0];
    if (!head) return null;
    return {
      cardID: head.cardID || '',
      blockID: head.blockID,
      deckID: head.deckID,
      nextDues: { 1: '', 2: '', 3: '', 4: '' },
      meta: { subset: true },
    };
  }

  async onFeedback(
    currentItem: any | null,
    feedback: { action: 'rate' | 'skip' | 'custom'; rating?: 1 | 2 | 3 | 4; customActionId?: string; durationMs?: number },
  ): Promise<void> {
    const blockID = String(currentItem?.blockID || currentItem?.blockId || '');
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
          const cid = String(b?.riffCard?.id || '');
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
    const cid = String((blocks as any[])?.[0]?.riffCard?.id || '');
    if (cid) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = cid;
      return cid;
    }

    await riff.addRiffCards(this.deckID, [blockID]);
    const blocks2 = await riff.getRiffCardsByBlockIDs([blockID]);
    const cid2 = String((blocks2 as any[])?.[0]?.riffCard?.id || '');
    if (cid2) {
      const it = this.queue.find((x) => x.blockID === blockID);
      if (it) it.cardID = cid2;
      return cid2;
    }

    return null;
  }
}
