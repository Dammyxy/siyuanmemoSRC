import type { FSRSCard } from '@/types/card';
import type { ReviewQueueSessionSnapshot } from '@/types/review-tab';

export interface IncrementalRequeryIdentity {
  cardId: string | null;
  blockId: string | null;
}

export type IncrementalRequerySelectionMode =
  | 'first'
  | 'different-block'
  | 'same-block-different-card'
  | 'same-visible-card-fallback'
  | 'exhausted';

export interface IncrementalRequerySelection {
  index: number;
  mode: IncrementalRequerySelectionMode;
}

export interface IncrementalRequerySnapshotFields {
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  deferOnceCardId: string | null;
}

export class IncrementalRequeryAdvancePolicy {
  captureVisibleIdentity(card: FSRSCard | null): IncrementalRequeryIdentity {
    const cardId = String(card?.id || '').trim();
    const blockId = String(card?.blockId || '').trim();
    return {
      cardId: cardId || null,
      blockId: blockId || null,
    };
  }

  reset(): IncrementalRequeryIdentity {
    return {
      cardId: null,
      blockId: null,
    };
  }

  selectNext(cards: FSRSCard[], identity: IncrementalRequeryIdentity): IncrementalRequerySelection {
    if (cards.length === 0) {
      return { index: -1, mode: 'exhausted' };
    }

    const avoidCardId = String(identity.cardId || '').trim();
    const avoidBlockId = String(identity.blockId || '').trim();
    if (!avoidCardId && !avoidBlockId) {
      return { index: 0, mode: 'first' };
    }

    const differentBlockIndex = cards.findIndex((card) => (
      !matchesCard(card, avoidCardId)
      && !matchesBlock(card, avoidBlockId)
    ));
    if (differentBlockIndex >= 0) {
      return { index: differentBlockIndex, mode: 'different-block' };
    }

    const differentCardIndex = cards.findIndex((card) => !matchesCard(card, avoidCardId));
    if (differentCardIndex >= 0) {
      return { index: differentCardIndex, mode: 'same-block-different-card' };
    }

    return { index: 0, mode: 'same-visible-card-fallback' };
  }

  serialize(identity: IncrementalRequeryIdentity): IncrementalRequerySnapshotFields {
    const cardId = String(identity.cardId || '').trim() || null;
    const blockId = String(identity.blockId || '').trim() || null;
    return {
      avoidOnceCardId: cardId,
      avoidOnceBlockId: blockId,
      deferOnceCardId: cardId,
    };
  }

  restore(snapshot: Pick<ReviewQueueSessionSnapshot, 'avoidOnceCardId' | 'avoidOnceBlockId' | 'deferOnceCardId'> | null | undefined): IncrementalRequeryIdentity {
    if (!snapshot) {
      return this.reset();
    }
    const cardId = typeof snapshot.avoidOnceCardId === 'string'
      ? snapshot.avoidOnceCardId
      : typeof snapshot.deferOnceCardId === 'string'
        ? snapshot.deferOnceCardId
        : '';
    const blockId = typeof snapshot.avoidOnceBlockId === 'string'
      ? snapshot.avoidOnceBlockId
      : '';
    return {
      cardId: cardId.trim() || null,
      blockId: blockId.trim() || null,
    };
  }
}

function matchesCard(card: FSRSCard, avoidCardId: string): boolean {
  return Boolean(avoidCardId) && String(card.id || '').trim() === avoidCardId;
}

function matchesBlock(card: FSRSCard, avoidBlockId: string): boolean {
  return Boolean(avoidBlockId) && String(card.blockId || '').trim() === avoidBlockId;
}
