import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '../card';
import {
  buildBrowserCardFromPayload,
  buildBrowserRowProjection,
  buildMemoryItemSnapshot,
  buildQueueSnapshotRowFromPayload,
  buildSourceContentProjectionFromCard,
} from '../memory-content-payload-seam';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xy-card-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 2,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 172_800_000,
    elapsedDays: overrides.elapsedDays ?? 2,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 0,
    type: overrides.type ?? CardType.Descriptor,
    tags: overrides.tags ?? ['tag-a', 'tag-b'],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 604_800_000,
    updatedAt: overrides.updatedAt ?? now,
    riffCardId: overrides.riffCardId ?? 'riff-1',
    aFactor: overrides.aFactor ?? 2.5,
    meta: {
      content: '<p>Long source content</p>',
      rootId: 'doc-1',
      deckId: 'deck-1',
      note: 'note-1',
      blockType: 'paragraph',
      ...(overrides.meta || {}),
    },
    ...overrides,
  };
}

describe('memory content payload seam', () => {
  it('separates memory state from source content', () => {
    vi.setSystemTime(1_700_000_000_000);
    const card = buildCard();

    const memory = buildMemoryItemSnapshot(card, {
      firstReviewMode: 'created-or-last',
      queueIndex: 3,
    });
    const source = buildSourceContentProjectionFromCard(card);

    expect(memory).toMatchObject({
      id: 'riff-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      state: CardState.Review,
      due: 1_700_086_400_000,
      stability: 4,
      difficulty: 5,
      reps: 2,
      lapses: 1,
      elapsedDays: 2,
      scheduledDays: 7,
      interval: 7,
      firstReview: 1_699_395_200_000,
      priority: 0,
      suspended: false,
      cardType: CardType.Descriptor,
      aFactor: 2.5,
      queueIndex: 3,
    });
    expect(memory).not.toHaveProperty('fullContent');
    expect(source).toMatchObject({
      blockId: 'block-1',
      deckId: 'deck-1',
      rootId: 'doc-1',
      content: 'Long source content',
      fullContent: '<p>Long source content</p>',
      tags: ['tag-a', 'tag-b'],
      note: 'note-1',
      blockType: 'paragraph',
      existence: 'present',
    });
    vi.useRealTimers();
  });

  it('composes queue snapshot and browser rows without changing observable fields', () => {
    vi.setSystemTime(1_700_000_000_000);
    const card = buildCard();
    const memory = buildMemoryItemSnapshot(card, {
      firstReviewMode: 'created-or-last',
      queueIndex: 5,
    });
    const source = buildSourceContentProjectionFromCard(card);

    const queueRow = buildQueueSnapshotRowFromPayload(memory, source);
    const browserRow = buildBrowserRowProjection(memory, source);
    const browserCard = buildBrowserCardFromPayload(memory, source);

    expect(queueRow).toMatchObject({
      id: 'riff-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      content: 'Long source content',
      fullContent: '<p>Long source content</p>',
      queueIndex: 5,
      cardType: CardType.Descriptor,
      priority: 0,
      tags: ['tag-a', 'tag-b'],
      blockType: 'paragraph',
    });
    expect(browserRow).toMatchObject({
      id: 'riff-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      content: 'Long source content',
      fullContent: '<p>Long source content</p>',
      stateLabel: '复习',
      priority: 0,
      cardType: CardType.Descriptor,
      queueIndex: 5,
    });
    expect(browserCard.note).toBe('note-1');
    expect(browserCard.meta).toMatchObject({
      content: '<p>Long source content</p>',
      rootId: 'doc-1',
      deckId: 'deck-1',
    });
    vi.useRealTimers();
  });
});
