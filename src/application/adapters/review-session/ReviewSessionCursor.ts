import type { FSRSCard } from '@/types/card';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot } from '@/types/review-tab';
import { resolveCardFaceIndex, resolveCardFaceToken } from '@/core/card/cardSemanticLocator';
import type { ReviewSessionProjectionState } from '../ReviewSessionProjectionApplier';
import { IncrementalRequeryAdvancePolicy } from './IncrementalRequeryAdvancePolicy';

export interface ReviewSessionCursorNextResult {
  card: FSRSCard;
  index: number;
  total: number;
}

export interface ReviewSessionCursorRequeryNextResult extends ReviewSessionCursorNextResult {
  mode: string;
  avoidedCardId: string | null;
  avoidedBlockId: string | null;
}

export interface ReviewSessionCursorReviewResultLike {
  removedFromQueue?: boolean;
  updatedCard?: FSRSCard | null;
}

export interface ReviewSessionCursorProjectionPatch {
  cacheValid: boolean;
  cachedCards: FSRSCard[];
  currentIndex: number;
  forwardBuffer: FSRSCard[];
  lastCounterSnapshot: QueueCounterSnapshot | null;
}

export class ReviewSessionCursor {
  private cachedCards: FSRSCard[] = [];
  private currentIndex = 0;
  private cacheValid = false;
  private forwardBuffer: FSRSCard[] = [];
  private pendingRotateCardId: string | null = null;
  private avoidOnceCardId: string | null = null;
  private avoidOnceBlockId: string | null = null;
  private readonly sessionExcludedCardIds = new Set<string>();
  private readonly sessionExcludedLogicalKeys = new Set<string>();
  private lastCounterSnapshot: QueueCounterSnapshot | null = null;
  private readonly incrementalRequeryPolicy = new IncrementalRequeryAdvancePolicy();

  constructor(private readonly queueType: QueueType) {}

  get length(): number {
    return this.cachedCards.length;
  }

  get index(): number {
    return this.currentIndex;
  }

  get valid(): boolean {
    return this.cacheValid;
  }

  get pendingRotation(): string | null {
    return this.pendingRotateCardId;
  }

  get avoidCardId(): string | null {
    return this.avoidOnceCardId;
  }

  get avoidBlockId(): string | null {
    return this.avoidOnceBlockId;
  }

  get counterSnapshot(): QueueCounterSnapshot | null {
    return this.lastCounterSnapshot ? cloneCounterSnapshot(this.lastCounterSnapshot) : null;
  }

  set counterSnapshot(snapshot: QueueCounterSnapshot | null) {
    this.lastCounterSnapshot = snapshot ? cloneCounterSnapshot(snapshot) : null;
  }

  load(cards: FSRSCard[], options: { cacheValid?: boolean; resetIndex?: boolean } = {}): void {
    this.cachedCards = this.applySessionExclusions(cards);
    if (options.resetIndex !== false) {
      this.currentIndex = 0;
    } else if (this.currentIndex > this.cachedCards.length) {
      this.currentIndex = this.cachedCards.length;
    }
    this.cacheValid = options.cacheValid !== false;
  }

  cached(): FSRSCard[] {
    return this.cachedCards.map(cloneCard);
  }

  hasForward(): boolean {
    return this.forwardBuffer.length > 0;
  }

  shiftForward(): FSRSCard | null {
    return this.forwardBuffer.shift() ?? null;
  }

  clearForward(): void {
    this.forwardBuffer = [];
  }

  pushForward(card: FSRSCard): void {
    this.forwardBuffer.unshift(cloneCard(card));
  }

  nextCached(): ReviewSessionCursorNextResult | null {
    if (!this.cacheValid || this.currentIndex > this.cachedCards.length) {
      return null;
    }
    if (this.cachedCards.length === 0) {
      this.pendingRotateCardId = null;
      return null;
    }
    this.applyPendingRotationIfNeeded();
    if (this.currentIndex >= this.cachedCards.length) {
      this.pendingRotateCardId = null;
      return null;
    }
    const index = this.currentIndex;
    const card = this.cachedCards[this.currentIndex++];
    return card ? { card: cloneCard(card), index, total: this.cachedCards.length } : null;
  }

  nextRequery(): ReviewSessionCursorRequeryNextResult | null {
    if (!this.cacheValid || this.currentIndex > this.cachedCards.length) {
      return null;
    }
    if (this.cachedCards.length === 0) {
      this.pendingRotateCardId = null;
      this.clearAvoidOnce();
      return null;
    }
    const avoidedCardId = this.avoidOnceCardId;
    const avoidedBlockId = this.avoidOnceBlockId;
    const selection = this.incrementalRequeryPolicy.selectNext(this.cachedCards, {
      cardId: avoidedCardId,
      blockId: avoidedBlockId,
    });
    if (selection.index === -1) {
      this.clearAvoidOnce();
      return null;
    }
    const card = this.cachedCards[selection.index];
    this.currentIndex = Math.min(this.cachedCards.length, selection.index + 1);
    this.pendingRotateCardId = null;
    this.clearAvoidOnce();
    return card
      ? {
          card: cloneCard(card),
          index: selection.index,
          total: this.cachedCards.length,
          mode: selection.mode,
          avoidedCardId,
          avoidedBlockId,
        }
      : null;
  }

  invalidate(): void {
    this.cacheValid = false;
    this.lastCounterSnapshot = null;
  }

  markValid(): void {
    this.cacheValid = true;
  }

  resetIndex(): void {
    this.currentIndex = 0;
  }

  clearPendingRotation(): void {
    this.pendingRotateCardId = null;
  }

  setPendingRotation(cardId: string | null | undefined): void {
    this.pendingRotateCardId = normalizeCardId(cardId) || null;
  }

  setAvoidOnce(card: Pick<FSRSCard, 'id' | 'blockId'>): void {
    this.avoidOnceCardId = normalizeCardId(card.id) || null;
    this.avoidOnceBlockId = normalizeCardId(card.blockId) || null;
  }

  clearAvoidOnce(): void {
    this.avoidOnceCardId = null;
    this.avoidOnceBlockId = null;
  }

  shouldExitAtEnd(): boolean {
    return this.currentIndex >= this.cachedCards.length;
  }

  remainingFromCache(): number {
    return Math.max(0, this.cachedCards.length - this.currentIndex);
  }

  applyReviewResult(
    reviewedCard: FSRSCard,
    result: ReviewSessionCursorReviewResultLike,
    options: { forceRemove?: boolean } = {},
  ): boolean {
    if (!this.cacheValid) {
      return false;
    }
    const cachedIndex = options.forceRemove
      ? this.findCachedCardIndexByCardId(reviewedCard.id)
      : this.findCachedCardIndexByIdentity(reviewedCard.id, reviewedCard.blockId);
    if (cachedIndex === -1) {
      return false;
    }
    if (options.forceRemove || result.removedFromQueue) {
      this.cachedCards.splice(cachedIndex, 1);
      this.decrementIndexAfterRemoval(cachedIndex);
    } else if (result.updatedCard) {
      this.cachedCards[cachedIndex] = cloneCard(result.updatedCard);
    }
    this.clampIndex();
    return true;
  }

  applySkip(cardId: string): boolean {
    if (!this.cacheValid) {
      return false;
    }
    const cachedIndex = this.findCachedCardIndexByIdentity(cardId);
    if (cachedIndex === -1) {
      return false;
    }
    const [skippedCard] = this.cachedCards.splice(cachedIndex, 1);
    if (!skippedCard) {
      return false;
    }
    this.cachedCards.push(skippedCard);
    this.decrementIndexAfterRemoval(cachedIndex);
    return true;
  }

  applyRemoval(cardId: string): boolean {
    if (!this.cacheValid) {
      return false;
    }
    const cachedIndex = this.findCachedCardIndexByIdentity(cardId);
    if (cachedIndex === -1) {
      return false;
    }
    this.cachedCards.splice(cachedIndex, 1);
    this.decrementIndexAfterRemoval(cachedIndex);
    this.clampIndex();
    return true;
  }

  removeMatching(identities: Set<string>): number {
    if (identities.size === 0) {
      return 0;
    }
    let removed = 0;
    let removedBeforeCurrentIndex = 0;
    this.cachedCards = this.cachedCards.filter((card, index) => {
      const shouldRemove = matchesAnyCardIdentity(card, identities);
      if (shouldRemove) {
        removed += 1;
        if (index < this.currentIndex) {
          removedBeforeCurrentIndex += 1;
        }
      }
      return !shouldRemove;
    });
    if (removedBeforeCurrentIndex > 0) {
      this.currentIndex = Math.max(0, this.currentIndex - removedBeforeCurrentIndex);
    }
    this.clampIndex();

    const previousForwardLength = this.forwardBuffer.length;
    this.forwardBuffer = this.forwardBuffer.filter((card) => !matchesAnyCardIdentity(card, identities));
    removed += previousForwardLength - this.forwardBuffer.length;
    return removed;
  }

  rotateToTail(cardId: string): boolean {
    if (!this.cacheValid) {
      return false;
    }
    const normalizedCardId = normalizeCardId(cardId);
    if (!normalizedCardId || this.cachedCards.length <= 1) {
      return false;
    }
    const cachedIndex = this.findCachedCardIndexByCardId(normalizedCardId);
    if (cachedIndex === -1 || cachedIndex >= this.cachedCards.length - 1) {
      return false;
    }
    const [rotatedCard] = this.cachedCards.splice(cachedIndex, 1);
    if (!rotatedCard) {
      return false;
    }
    this.cachedCards.push(rotatedCard);
    this.decrementIndexAfterRemoval(cachedIndex);
    return true;
  }

  clampToLastWhenPastEnd(): void {
    if (this.currentIndex >= this.cachedCards.length && this.cachedCards.length > 0) {
      this.currentIndex = this.cachedCards.length - 1;
    }
  }

  projectionState(): ReviewSessionProjectionState {
    return {
      cacheValid: this.cacheValid,
      cachedCards: this.cachedCards.map(cloneCard),
      currentIndex: this.currentIndex,
      forwardBuffer: this.forwardBuffer.map(cloneCard),
      lastCounterSnapshot: this.lastCounterSnapshot ? cloneCounterSnapshot(this.lastCounterSnapshot) : null,
    };
  }

  applyProjectionPatch(state: ReviewSessionCursorProjectionPatch): void {
    this.cacheValid = state.cacheValid;
    this.cachedCards = state.cachedCards.map(cloneCard);
    this.currentIndex = Math.max(0, Math.min(Number(state.currentIndex) || 0, this.cachedCards.length));
    this.forwardBuffer = state.forwardBuffer.map(cloneCard);
    this.lastCounterSnapshot = state.lastCounterSnapshot ? cloneCounterSnapshot(state.lastCounterSnapshot) : null;
  }

  addSessionExcludedCardIdentity(card: FSRSCard): boolean {
    if (!this.supportsSessionCompletionExclusion()) {
      return false;
    }
    let changed = this.addSessionExcludedCardId(card.id);
    for (const logicalKey of this.buildSessionExclusionLogicalKeys(card)) {
      const previousSize = this.sessionExcludedLogicalKeys.size;
      this.sessionExcludedLogicalKeys.add(logicalKey);
      changed = changed || this.sessionExcludedLogicalKeys.size !== previousSize;
    }
    return changed;
  }

  addUnavailableItemSessionExclusion(card: FSRSCard): void {
    const normalizedCardId = normalizeCardId(card.id);
    if (normalizedCardId) {
      this.sessionExcludedCardIds.add(normalizedCardId);
    }
    for (const logicalKey of this.buildSessionExclusionLogicalKeys(card)) {
      this.sessionExcludedLogicalKeys.add(logicalKey);
    }
  }

  hasSessionExclusions(): boolean {
    return this.sessionExcludedCardIds.size > 0 || this.sessionExcludedLogicalKeys.size > 0;
  }

  restoreSessionExcludedCardIds(
    cardIds: Array<string | null | undefined>,
    logicalKeys: Array<string | null | undefined> = [],
  ): void {
    this.sessionExcludedCardIds.clear();
    this.sessionExcludedLogicalKeys.clear();
    if (!this.supportsSessionCompletionExclusion()) {
      return;
    }
    for (const cardId of cardIds) {
      const normalizedCardId = normalizeCardId(cardId);
      if (normalizedCardId) {
        this.sessionExcludedCardIds.add(normalizedCardId);
      }
    }
    for (const logicalKey of logicalKeys) {
      const normalizedLogicalKey = normalizeCardId(logicalKey);
      if (normalizedLogicalKey) {
        this.sessionExcludedLogicalKeys.add(normalizedLogicalKey);
      }
    }
  }

  clearSessionExcludedCardIds(): void {
    this.sessionExcludedCardIds.clear();
    this.sessionExcludedLogicalKeys.clear();
  }

  removeSessionExcludedCardIds(cardIds: Array<string | null | undefined>): number {
    let removed = 0;
    for (const cardId of cardIds) {
      const normalizedCardId = normalizeCardId(cardId);
      if (normalizedCardId && this.sessionExcludedCardIds.delete(normalizedCardId)) {
        removed += 1;
      }
    }
    return removed;
  }

  applySessionExclusions(cards: FSRSCard[]): FSRSCard[] {
    if (!this.hasSessionExclusions()) {
      return cards.map(cloneCard);
    }
    return cards
      .filter((card) => !this.isSessionExcludedCard(card))
      .map(cloneCard);
  }

  appendCardsToTail(cards: FSRSCard[]): number {
    if (!Array.isArray(cards) || cards.length === 0) {
      return 0;
    }
    const existingCardIds = new Set(this.cachedCards.map((card) => normalizeCardId(card.id)).filter(Boolean));
    const appendedCards = cards
      .filter((card) => {
        const cardId = normalizeCardId(card.id);
        return cardId.length > 0 && !existingCardIds.has(cardId);
      })
      .map((card) => {
        existingCardIds.add(normalizeCardId(card.id));
        return cloneCard(card);
      });
    if (appendedCards.length === 0) {
      return 0;
    }
    this.cachedCards.push(...appendedCards);
    this.lastCounterSnapshot = null;
    return appendedCards.length;
  }

  suppressReviewedCardForCurrentSession(card: FSRSCard): { changed: boolean; removedCachedCards: number } {
    const changed = this.addSessionExcludedCardIdentity(card);
    if (!changed) {
      return { changed: false, removedCachedCards: 0 };
    }
    const beforeLength = this.cachedCards.length;
    this.cachedCards = this.applySessionExclusions(this.cachedCards);
    this.clampIndex();
    this.lastCounterSnapshot = null;
    return {
      changed: true,
      removedCachedCards: beforeLength - this.cachedCards.length,
    };
  }

  serialize(queueType: QueueType, currentItem: FSRSCard | null): ReviewQueueSessionSnapshot {
    const requerySnapshot = this.incrementalRequeryPolicy.serialize({
      cardId: this.avoidOnceCardId,
      blockId: this.avoidOnceBlockId,
    });
    return {
      version: 1,
      queueType,
      cacheValid: this.cacheValid,
      currentIndex: Math.max(0, this.currentIndex),
      cachedCards: this.cachedCards.map(cloneCard),
      currentItem: currentItem ? cloneCard(currentItem) : null,
      forwardBuffer: this.forwardBuffer.map(cloneCard),
      pendingRotateCardId: this.pendingRotateCardId,
      deferOnceCardId: requerySnapshot.deferOnceCardId,
      avoidOnceCardId: requerySnapshot.avoidOnceCardId,
      avoidOnceBlockId: requerySnapshot.avoidOnceBlockId,
      sessionExcludedCardIds: Array.from(this.sessionExcludedCardIds),
      sessionExcludedLogicalKeys: Array.from(this.sessionExcludedLogicalKeys),
      lastCounterSnapshot: this.lastCounterSnapshot ? cloneCounterSnapshot(this.lastCounterSnapshot) : null,
    };
  }

  restore(snapshot: ReviewQueueSessionSnapshot): { currentItem: FSRSCard | null } {
    this.restoreSessionExcludedCardIds(
      Array.isArray(snapshot.sessionExcludedCardIds) ? snapshot.sessionExcludedCardIds : [],
      Array.isArray(snapshot.sessionExcludedLogicalKeys) ? snapshot.sessionExcludedLogicalKeys : [],
    );
    this.cachedCards = Array.isArray(snapshot.cachedCards)
      ? this.applySessionExclusions(snapshot.cachedCards)
      : [];
    this.forwardBuffer = Array.isArray(snapshot.forwardBuffer)
      ? this.applySessionExclusions(snapshot.forwardBuffer)
      : [];
    this.pendingRotateCardId = typeof snapshot.pendingRotateCardId === 'string'
      ? snapshot.pendingRotateCardId
      : null;
    const requeryIdentity = this.incrementalRequeryPolicy.restore(snapshot);
    this.avoidOnceCardId = requeryIdentity.cardId;
    this.avoidOnceBlockId = requeryIdentity.blockId;
    this.lastCounterSnapshot = snapshot.lastCounterSnapshot ? cloneCounterSnapshot(snapshot.lastCounterSnapshot) : null;
    this.currentIndex = Math.max(0, Math.min(Number(snapshot.currentIndex) || 0, this.cachedCards.length));
    this.cacheValid = snapshot.cacheValid === true;
    return {
      currentItem: snapshot.currentItem ? cloneCard(snapshot.currentItem) : null,
    };
  }

  reset(): void {
    this.cachedCards = [];
    this.currentIndex = 0;
    this.cacheValid = false;
    this.forwardBuffer = [];
    this.pendingRotateCardId = null;
    this.clearSessionExcludedCardIds();
    this.clearAvoidOnce();
    this.lastCounterSnapshot = null;
  }

  private applyPendingRotationIfNeeded(): void {
    const pendingCardId = this.pendingRotateCardId;
    if (!pendingCardId) {
      return;
    }
    this.pendingRotateCardId = null;
    if (!this.cacheValid || this.currentIndex >= this.cachedCards.length) {
      return;
    }
    const currentCard = this.cachedCards[this.currentIndex];
    if (!currentCard || currentCard.id !== pendingCardId) {
      return;
    }
    if (this.currentIndex >= this.cachedCards.length - 1) {
      return;
    }
    const [rotatedCard] = this.cachedCards.splice(this.currentIndex, 1);
    if (rotatedCard) {
      this.cachedCards.push(rotatedCard);
    }
  }

  private addSessionExcludedCardId(cardId: string | null | undefined): boolean {
    if (!this.supportsSessionCompletionExclusion()) {
      return false;
    }
    const normalizedCardId = normalizeCardId(cardId);
    if (!normalizedCardId) {
      return false;
    }
    const previousSize = this.sessionExcludedCardIds.size;
    this.sessionExcludedCardIds.add(normalizedCardId);
    return this.sessionExcludedCardIds.size !== previousSize;
  }

  private isSessionExcludedCard(card: FSRSCard): boolean {
    if (this.sessionExcludedCardIds.has(normalizeCardId(card.id))) {
      return true;
    }
    return this.buildSessionExclusionMatchKeys(card)
      .some((logicalKey) => this.sessionExcludedLogicalKeys.has(logicalKey));
  }

  private buildSessionExclusionLogicalKeys(card: Pick<FSRSCard, 'blockId' | 'xiuyuanID' | 'faceKey' | 'meta'>): string[] {
    const faceToken = resolveCardFaceToken(card);
    const blockId = String(card.blockId || '').trim();
    const xiuyuanId = String(card.xiuyuanID || '').trim();
    const keys: string[] = [];
    if (blockId) {
      keys.push(`block:${blockId}::${faceToken}`);
    }
    if (xiuyuanId) {
      keys.push(`xiuyuan:${xiuyuanId}::${faceToken}`);
    }
    return keys;
  }

  private buildSessionExclusionMatchKeys(card: Pick<FSRSCard, 'blockId' | 'xiuyuanID' | 'faceKey' | 'meta'>): string[] {
    const currentKeys = this.buildSessionExclusionLogicalKeys(card);
    const legacyFaceToken = `face:${resolveCardFaceIndex(card)}`;
    const blockId = String(card.blockId || '').trim();
    const xiuyuanId = String(card.xiuyuanID || '').trim();
    const keys = new Set(currentKeys);
    if (blockId) {
      keys.add(`block:${blockId}::${legacyFaceToken}`);
    }
    if (xiuyuanId) {
      keys.add(`xiuyuan:${xiuyuanId}::${legacyFaceToken}`);
    }
    return Array.from(keys);
  }

  private supportsSessionCompletionExclusion(): boolean {
    return this.queueType === QueueType.FilterGroup
      || this.queueType === QueueType.RetrievalPractice
      || this.queueType === QueueType.IncrementalLearning;
  }

  private findCachedCardIndexByIdentity(cardId: string, blockId?: string): number {
    const normalizedCardId = normalizeCardId(cardId);
    if (normalizedCardId) {
      const exactIndex = this.cachedCards.findIndex((card) => card.id === normalizedCardId);
      if (exactIndex >= 0) {
        return exactIndex;
      }
    }
    const normalizedBlockId = normalizeCardId(blockId);
    if (normalizedBlockId) {
      return this.cachedCards.findIndex((card) => card.blockId === normalizedBlockId);
    }
    return -1;
  }

  private findCachedCardIndexByCardId(cardId: string): number {
    const normalizedCardId = normalizeCardId(cardId);
    if (!normalizedCardId) {
      return -1;
    }
    return this.cachedCards.findIndex((card) => normalizeCardId(card.id) === normalizedCardId);
  }

  private decrementIndexAfterRemoval(index: number): void {
    if (index < this.currentIndex) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
  }

  private clampIndex(): void {
    if (this.currentIndex > this.cachedCards.length) {
      this.currentIndex = this.cachedCards.length;
    }
  }
}

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as QueueCounterSnapshot;
}

function normalizeCardId(cardId: string | null | undefined): string {
  return String(cardId || '').trim();
}

function matchesAnyCardIdentity(card: Pick<FSRSCard, 'id' | 'blockId'>, identities: Set<string>): boolean {
  return identities.has(normalizeCardId(card.id)) || identities.has(normalizeCardId(card.blockId));
}
