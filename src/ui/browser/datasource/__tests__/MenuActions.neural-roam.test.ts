import { describe, expect, it, vi } from 'vitest';
import { addToQueue } from '../MenuActions';
import type { BrowserCard } from '../../types';

function createBrowserCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.8,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

describe('MenuActions.addToQueue neural-roam', () => {
  it('passes trusted concept payload when adding concept card to neural-roam queue', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
    };
    const selectedRows: BrowserCard[] = [
      createBrowserCard({
        id: 'card-1',
        blockId: 'block-1',
        cardType: 'concept',
      }),
    ];

    const result = await addToQueue(queue, selectedRows, 'neural-roam', 'manual');

    expect(result.added).toBe(1);
    expect(queue.addCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'block-1',
        blockId: 'block-1',
        type: 'concept',
        cardType: 'concept',
        cardTypeMarker: 'concept',
      }),
      'manual'
    );
  });

  it('rejects non-concept card before queue add for neural-roam', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
    };
    const selectedRows: BrowserCard[] = [
      createBrowserCard({
        id: 'card-2',
        blockId: 'block-2',
        cardType: 'item',
      }),
    ];

    const result = await addToQueue(queue, selectedRows, 'neural-roam', 'manual');

    expect(result.added).toBe(0);
    expect(queue.addCard).not.toHaveBeenCalled();
    expect(result.message).toBe('神经漫游队列只接受 Concept 卡片');
  });
});

