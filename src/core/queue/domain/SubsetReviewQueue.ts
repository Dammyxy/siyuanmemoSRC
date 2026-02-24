import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { QueueItem } from '@/core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { resolveCardId } from '@/diagnostics/type-guards';

export class SubsetReviewQueue extends BaseReviewQueue {
  public name = 'SubsetReviewQueue';
  private readonly blockIds: string[];
  private cardOrder: string[] = [];
  private cardBlockMap = new Map<string, string>();
  private initialized = false;

  constructor(manager: UnifiedDataSourceManager, blockIds: string[]) {
    super(manager, QueueType.FilterGroup);
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
        if (isBlacklisted) continue;

        cards.push(card);
        nextOrder.push(card.id);
      } catch {
        // Card no longer exists.
      }
    }

    this.cardOrder = nextOrder;
    return this.applyCustomOrder(cards);
  }

  public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
    await this.ensureInitialized();

    const cardId = resolveCardId(card);
    if (this.cardOrder.includes(cardId)) return;

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
    if (targetBlockId) this.temporaryBlacklist.add(targetBlockId);
    this.notifyObservers();
  }

  public async handleReview(cardId: string, rating: number): Promise<void> {
    try {
      await this.handleReviewWithScheduler(cardId, rating);
    } finally {
      await this.removeCard(cardId);
    }
  }

  public async skip(cardId: string): Promise<void> {
    await this.removeCard(cardId);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
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
      if (!candidates || candidates.length === 0) continue;

      const card = candidates.shift()!;
      orderedIds.push(card.id);
      this.cardBlockMap.set(card.id, card.blockId);
    }

    for (const card of cards) {
      if (orderedIds.includes(card.id)) continue;
      orderedIds.push(card.id);
      this.cardBlockMap.set(card.id, card.blockId);
    }

    this.cardOrder = orderedIds;
  }

  private async resolveCardIdOrBlockId(cardIdOrBlockId: string): Promise<string | null> {
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
}
