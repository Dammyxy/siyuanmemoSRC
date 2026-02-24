import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { QueueItem } from '@/core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { resolveCardId } from '@/diagnostics/type-guards';
import { pushMsg, setBlockAttrs } from '@/core/siyuan/api';

type LeechAction = 'notify' | 'suspend' | 'tag';

interface LeechReviewQueueOptions {
  threshold?: number;
  action?: LeechAction;
  tagName?: string;
}

const ATTR_SUSPENDED = 'custom-fsrs-suspended';
const ATTR_LEECH_TAG = 'custom-fsrs-leech-tag';

export class LeechReviewQueue extends BaseReviewQueue {
  public name = 'LeechReviewQueue';
  private readonly threshold: number;
  private readonly action: LeechAction;
  private readonly tagName: string;
  private readonly manuallyAddedCards = new Set<string>();

  constructor(manager: UnifiedDataSourceManager, options: LeechReviewQueueOptions = {}) {
    super(manager, QueueType.Leech);
    this.threshold = Math.max(1, Math.floor(Number(options.threshold ?? 8)));
    this.action = options.action ?? 'notify';
    this.tagName = String(options.tagName || 'leech');
  }

  public isDynamic(): boolean {
    return true;
  }

  public async getCards(): Promise<FSRSCard[]> {
    const cards = await this.manager.getCards();
    const filtered = cards
      .filter((card) => {
        const isLeech = Number(card.lapses || 0) >= this.threshold;
        const isManuallyAdded = this.manuallyAddedCards.has(card.id);
        const isBlacklisted = this.temporaryBlacklist.has(card.id) || this.temporaryBlacklist.has(card.blockId);
        return (isLeech || isManuallyAdded) && !isBlacklisted;
      })
      .sort((a, b) => {
        const lapseDiff = Number(b.lapses || 0) - Number(a.lapses || 0);
        if (lapseDiff !== 0) return lapseDiff;
        const dueDiff = Number(a.due || 0) - Number(b.due || 0);
        if (dueDiff !== 0) return dueDiff;
        return Number(b.priority || 0) - Number(a.priority || 0);
      });

    return this.applyCustomOrder(filtered);
  }

  public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
    const cardId = resolveCardId(card);
    this.manuallyAddedCards.add(cardId);
    this.temporaryBlacklist.delete(cardId);
    this.notifyObservers();
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    this.manuallyAddedCards.delete(cardIdOrBlockId);
    this.temporaryBlacklist.add(cardIdOrBlockId);
    this.notifyObservers();
  }

  public async handleReview(cardId: string, rating: number): Promise<void> {
    await this.handleReviewWithScheduler(cardId, rating);

    try {
      const card = await this.manager.getCard(cardId, { silent: true });
      if (Number(card.lapses || 0) >= this.threshold) {
        await this.applyLeechAction(card);
      }
    } catch {
      // Card may have been deleted after review; no follow-up action is required.
    }
  }

  private async applyLeechAction(card: FSRSCard): Promise<void> {
    const blockId = String(card.blockId || '');
    const actionLabel = `Leech (lapses >= ${this.threshold})`;

    if (this.action === 'notify') {
      await pushMsg(actionLabel);
      return;
    }

    if (!blockId) {
      await pushMsg(actionLabel);
      return;
    }

    if (this.action === 'suspend') {
      await setBlockAttrs(blockId, { [ATTR_SUSPENDED]: 'true' } as any);
      await pushMsg(`${actionLabel}: suspended`);
      return;
    }

    await setBlockAttrs(blockId, { [ATTR_LEECH_TAG]: this.tagName } as any);
    await pushMsg(`${actionLabel}: tagged ${this.tagName}`);
  }
}
