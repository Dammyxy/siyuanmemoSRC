import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { QueueItem } from '@/core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { resolveCardId } from '@/diagnostics/type-guards';

export class TemporaryDrillQueue extends BaseReviewQueue {
  public name = 'TemporaryDrillQueue';
  private readonly blockIds: string[];
  private cardOrder: string[] = [];
  private cardBlockMap = new Map<string, string>();
  private initialized = false;

  private readonly FLIP_LOWEST_PICK = 5;
  private readonly FLIP_LOWEST_INSERT = 3;
  private readonly FLIP_HIGHEST_INSERT = 6;

  constructor(manager: UnifiedDataSourceManager, blockIds: string[]) {
    super(manager, QueueType.FinalDrill);
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
    this.applyFlipElement(cards);
    this.cardOrder = cards.map((card) => card.id);
    return cards;
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
    if (rating === 4) {
      await this.removeCard(cardId);
      return;
    }

    await this.moveCardToBack(cardId);
  }

  public async skip(cardId: string): Promise<void> {
    await this.moveCardToBack(cardId);
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

  private async moveCardToBack(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialized();

    const targetCardId = await this.resolveCardIdOrBlockId(cardIdOrBlockId);
    if (!targetCardId) return;

    const index = this.cardOrder.indexOf(targetCardId);
    if (index === -1) return;

    const [cardId] = this.cardOrder.splice(index, 1);
    this.cardOrder.push(cardId);
    this.notifyObservers();
  }

  private applyFlipElement(cards: FSRSCard[]): void {
    const queueSize = cards.length;
    if (queueSize < this.FLIP_LOWEST_PICK) return;

    const pickStart = this.FLIP_LOWEST_PICK - 1;
    const pickEnd = queueSize - 1;
    const pickPos = pickStart + Math.floor(Math.random() * (pickEnd - pickStart + 1));

    const insertStart = this.FLIP_LOWEST_INSERT - 1;
    const insertEnd = Math.min(this.FLIP_HIGHEST_INSERT - 1, queueSize - 1);
    let insertPos = insertStart + Math.floor(Math.random() * (insertEnd - insertStart + 1));

    if (pickPos === insertPos) {
      insertPos = pickPos + 1;
      if (insertPos >= queueSize) return;
    }

    const card = cards[pickPos];
    cards.splice(pickPos, 1);

    const adjustedInsertPos = pickPos < insertPos ? insertPos - 1 : insertPos;
    cards.splice(adjustedInsertPos, 0, card);
  }
}
