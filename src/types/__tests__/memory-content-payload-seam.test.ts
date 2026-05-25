import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '../card';
import {
  buildBrowserCardFromPayload,
  buildBrowserRowProjection,
  buildMemoryItemSnapshot,
  buildQueueSnapshotRowFromPayload,
  buildSourceContentProjection,
  buildSourceContentProjectionFromCard,
  buildTemplateBackedBrowserRowFromCard,
  buildVirtualBrowserCardFromSource,
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

  it('uses the selected rendered face when card content projection is absent', () => {
    const card = buildCard({
      meta: {
        content: '',
        faceIndex: 1,
        faces: [
          {
            question: 'front 0',
            answer: 'back 0',
          },
          {
            question: 'front 1',
            answer: 'back 1',
          },
        ],
      },
    });

    const source = buildSourceContentProjectionFromCard(card);

    expect(source.fullContent).toBe('front 1\nback 1');
    expect(source.content).toBe('front 1 back 1');
    expect(source.existence).toBe('present');
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

  it('builds virtual browser rows with explicit non-card memory state', () => {
    vi.setSystemTime(1_700_000_000_000);
    const source = buildSourceContentProjection({
      blockId: 'block-virtual',
      rootId: 'doc-virtual',
      fullContent: 'Virtual source block',
      tags: ['source-only'],
      existence: 'missing',
      blockType: 'missing',
    });

    const row = buildVirtualBrowserCardFromSource({
      blockId: 'block-virtual',
      source,
      priority: 33,
      cardType: CardType.Concept,
    });

    expect(row).toMatchObject({
      id: 'block-virtual',
      fsrsCardId: 'block-virtual',
      blockId: 'block-virtual',
      rootId: 'doc-virtual',
      content: 'Virtual source block',
      fullContent: 'Virtual source block',
      state: CardState.New,
      dueFormatted: '-',
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      priority: 33,
      tags: ['source-only'],
      cardType: CardType.Concept,
      blockType: 'missing',
    });
    expect(row.meta).toMatchObject({
      content: 'Virtual source block',
      rootId: 'doc-virtual',
      blockType: 'missing',
    });
    vi.useRealTimers();
  });

  it('keeps template-backed row memory and source ownership separate', () => {
    vi.setSystemTime(1_700_000_000_000);
    const baseCard = buildCard({
      id: 'card-template',
      blockId: 'block-template',
      due: 1_700_432_000_000,
      stability: 9,
      difficulty: 3,
      reps: 8,
      tags: ['memory-tag'],
      priority: 0,
      meta: {
        content: '',
        deckId: '',
        rootId: '',
      },
    });

    const templateBacked = buildTemplateBackedBrowserRowFromCard({
      card: baseCard,
      template: {
        id: 'template-card',
        fsrsCardId: 'template-card',
        blockId: 'block-template',
        deckId: 'deck-template',
        rootId: 'doc-template',
        content: 'Template content',
        fullContent: '<p>Template content</p>',
        priority: 44,
        suspended: true,
        tags: ['template-tag'],
        cardType: CardType.Topic,
        aFactor: 2.7,
      },
      suspended: true,
      aFactor: 2.7,
      priority: 44,
      cardType: CardType.Topic,
    });
    const scheduleChanged = buildTemplateBackedBrowserRowFromCard({
      card: {
        ...baseCard,
        due: 1_700_864_000_000,
        stability: 11,
        reps: 9,
      },
      template: templateBacked,
      suspended: true,
      aFactor: 2.7,
      priority: 44,
      cardType: CardType.Topic,
    });

    expect(templateBacked).toMatchObject({
      id: 'card-template',
      fsrsCardId: 'card-template',
      blockId: 'block-template',
      deckId: 'deck-template',
      rootId: 'doc-template',
      content: 'Template content',
      fullContent: '<p>Template content</p>',
      due: new Date(1_700_432_000_000),
      stability: 9,
      difficulty: 3,
      reps: 8,
      priority: 44,
      suspended: true,
      tags: ['memory-tag'],
      cardType: CardType.Topic,
      aFactor: 2.7,
    });
    expect(scheduleChanged).toMatchObject({
      content: 'Template content',
      fullContent: '<p>Template content</p>',
      rootId: 'doc-template',
      deckId: 'deck-template',
      due: new Date(1_700_864_000_000),
      stability: 11,
      reps: 9,
    });
    vi.useRealTimers();
  });
});
