import { ManualCardCollectionQueue } from './ManualCardCollectionQueue';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { QueueItem } from '@/core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { LeechActionEffectsPort } from './ports';
import { NOOP_LEECH_ACTION_EFFECTS, NOOP_QUEUE_PERSISTENCE } from './ports';
import { createLogger } from '@/utils/logger';

type LeechAction = 'notify' | 'suspend' | 'tag';

interface LeechReviewQueueOptions {
  threshold?: number;
  action?: LeechAction;
  tagName?: string;
  effects?: LeechActionEffectsPort;
}

const ATTR_SUSPENDED = 'custom-fsrs-suspended';
const ATTR_LEECH_TAG = 'custom-fsrs-leech-tag';
const logger = createLogger('LeechReviewQueue');
const NOOP_MANUAL_PERSIST = async (): Promise<void> => {
  return;
};

export class LeechReviewQueue extends ManualCardCollectionQueue {
  public name = 'LeechReviewQueue';
  private readonly threshold: number;
  private readonly action: LeechAction;
  private readonly tagName: string;
  private readonly effects: LeechActionEffectsPort;

  constructor(manager: UnifiedDataSourceManager, options: LeechReviewQueueOptions = {}) {
    super(manager, QueueType.Leech, {
      queuePersistence: NOOP_QUEUE_PERSISTENCE,
      storageKey: 'leechReviewQueue',
      persistenceContext: 'LeechReviewQueue',
    });
    this.threshold = Math.max(1, Math.floor(Number(options.threshold ?? 8)));
    this.action = options.action ?? 'notify';
    this.tagName = String(options.tagName || 'leech');
    this.effects = options.effects ?? NOOP_LEECH_ACTION_EFFECTS;
    if (!options.effects) {
      logger.warn('LeechActionEffectsPort not provided. Leech actions will run in no-op mode.');
    }
  }

  public isDynamic(): boolean {
    return true;
  }

  public async getCards(): Promise<FSRSCard[]> {
    await this.ensureInitialLoad();
    const cards = await this.manager.getCards();
    const filtered = cards
      .filter((card) => {
        const isLeech = Number(card.lapses || 0) >= this.threshold;
        const isManuallyAdded = this.manualCards.has(card.id);
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
    await this.addCardToCollection(card, {
      logger,
      persist: NOOP_MANUAL_PERSIST,
      notifyQueueChanged: false,
      notifyObservers: true,
    });
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.removeCardFromCollection(cardIdOrBlockId, {
      logger,
      persist: NOOP_MANUAL_PERSIST,
      notifyObservers: true,
    });
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
      await this.effects.notify(actionLabel);
      return;
    }

    if (!blockId) {
      await this.effects.notify(actionLabel);
      return;
    }

    if (this.action === 'suspend') {
      await this.effects.setBlockAttrs(blockId, { [ATTR_SUSPENDED]: 'true' });
      await this.effects.notify(`${actionLabel}: suspended`);
      return;
    }

    await this.effects.setBlockAttrs(blockId, { [ATTR_LEECH_TAG]: this.tagName });
    await this.effects.notify(`${actionLabel}: tagged ${this.tagName}`);
  }
}
