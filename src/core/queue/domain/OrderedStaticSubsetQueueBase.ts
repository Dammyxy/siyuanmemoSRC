import type { QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { BaseReviewQueue } from './BaseReviewQueue';
import { resolveCardId } from '../../../diagnostics/type-guards';

/**
 * Shared base for static subset-like queues that:
 * - keep explicit card order
 * - support add/remove by cardId or blockId
 * - filter by temporary blacklist
 */
export abstract class OrderedStaticSubsetQueueBase extends BaseReviewQueue {
  protected cardOrder: string[] = [];
  protected cardBlockMap = new Map<string, string>();

  private readonly blockIds: string[];
  private initialized = false;

  protected constructor(
    manager: UnifiedDataSourceManager,
    type: QueueType,
    blockIds: string[]
  ) {
    super(manager, type);
    this.blockIds = Array.from(new Set((blockIds || []).map((id) => String(id || '')).filter(Boolean)));
  }

  public isDynamic(): boolean {
    return false;
  }

  public async getCards(): Promise<FSRSCard[]> {
    await this.ensureInitialized();

    const cards: FSRSCard[] = [];
    const nextOrder: string[] = [];

    for (const cardId of this.cardOrder) {
      try {
        const card = await this.manager.getCard(cardId, { silent: true });
        this.cardBlockMap.set(card.id, card.blockId);

        const isBlacklisted = this.temporaryBlacklist.has(card.id) || this.temporaryBlacklist.has(card.blockId);
        if (isBlacklisted) {
          continue;
        }

        cards.push(card);
        nextOrder.push(card.id);
      } catch {
        // Card no longer exists.
      }
    }

    this.cardOrder = nextOrder;
    return this.postProcessCards(cards);
  }

  public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
    await this.ensureInitialized();

    const cardId = resolveCardId(card);
    if (this.cardOrder.includes(cardId)) {
      return;
    }

    this.cardOrder.push(cardId);
    this.temporaryBlacklist.delete(cardId);
    this.notifyObservers();
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialized();

    const targetCardId = await this.resolveCardIdOrBlockId(cardIdOrBlockId);
    if (!targetCardId) {
      this.temporaryBlacklist.add(cardIdOrBlockId);
      return;
    }

    const targetBlockId = this.cardBlockMap.get(targetCardId);
    this.cardOrder = this.cardOrder.filter((cardId) => cardId !== targetCardId);
    this.temporaryBlacklist.add(targetCardId);
    if (targetBlockId) {
      this.temporaryBlacklist.add(targetBlockId);
    }

    this.notifyObservers();
  }

  protected async moveCardToBack(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialized();

    const targetCardId = await this.resolveCardIdOrBlockId(cardIdOrBlockId);
    if (!targetCardId) {
      return;
    }

    const index = this.cardOrder.indexOf(targetCardId);
    if (index === -1) {
      return;
    }

    const [cardId] = this.cardOrder.splice(index, 1);
    this.cardOrder.push(cardId);
    this.notifyObservers();
  }

  protected postProcessCards(cards: FSRSCard[]): FSRSCard[] {
    return cards;
  }

  protected async resolveCardIdOrBlockId(cardIdOrBlockId: string): Promise<string | null> {
    if (this.cardOrder.includes(cardIdOrBlockId)) {
      return cardIdOrBlockId;
    }

    for (const cardId of this.cardOrder) {
      const cachedBlockId = this.cardBlockMap.get(cardId);
      if (cachedBlockId === cardIdOrBlockId) {
        return cardId;
      }

      try {
        const card = await this.manager.getCard(cardId, { silent: true });
        this.cardBlockMap.set(card.id, card.blockId);
        if (card.blockId === cardIdOrBlockId) {
          return card.id;
        }
      } catch {
        // Ignore cards that no longer exist.
      }
    }

    return null;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const cards = await this.manager.getCards({ blockIds: this.blockIds });
    const cardsByBlockId = new Map<string, FSRSCard[]>();
    for (const card of cards) {
      const list = cardsByBlockId.get(card.blockId) || [];
      list.push(card);
      cardsByBlockId.set(card.blockId, list);
    }

    const orderedIds: string[] = [];

    for (const blockId of this.blockIds) {
      const candidates = cardsByBlockId.get(blockId);
      if (!candidates || candidates.length === 0) {
        continue;
      }

      const card = candidates.shift()!;
      orderedIds.push(card.id);
      this.cardBlockMap.set(card.id, card.blockId);
    }

    for (const card of cards) {
      if (orderedIds.includes(card.id)) {
        continue;
      }
      orderedIds.push(card.id);
      this.cardBlockMap.set(card.id, card.blockId);
    }

    this.cardOrder = orderedIds;
  }
}
