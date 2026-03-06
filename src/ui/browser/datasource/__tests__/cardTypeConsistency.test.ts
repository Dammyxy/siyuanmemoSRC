import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';
import {
  reconcileBrowserCardTypes,
  type CardTypeConsistencyDependencies,
} from '../cardTypeConsistency';

function buildBrowserCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'row-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'row-1',
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
    retrievability: overrides.retrievability ?? 0.9,
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

describe('cardTypeConsistency', () => {
  it('keeps explicit local row card type and skips detection for resolved rows', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-1', cardType: 'concept' })];
    const deps: CardTypeConsistencyDependencies = {
      detectTypes: vi.fn(async () => new Map()),
    };

    const result = await reconcileBrowserCardTypes(rows, { deps });

    expect(result.rows[0]?.cardType).toBe('concept');
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.detectedBlockIds).toEqual([]);
    expect(deps.detectTypes).not.toHaveBeenCalled();
  });

  it('detects missing card type and patches row type in result only', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-2', cardType: undefined })];
    const deps: CardTypeConsistencyDependencies = {
      detectTypes: vi.fn(async () => new Map<string, 'topic' | 'item'>([['block-2', 'topic']])),
    };

    const result = await reconcileBrowserCardTypes(rows, { deps });

    expect(result.rows[0]?.cardType).toBe('topic');
    expect(result.detectedBlockIds).toEqual(['block-2']);
    expect(result.conflictBlockIds).toEqual([]);
  });

  it('returns empty reconciliation for empty rows', async () => {
    const deps: CardTypeConsistencyDependencies = {
      detectTypes: vi.fn(async () => new Map()),
    };

    const result = await reconcileBrowserCardTypes([], { deps });

    expect(result.rows).toEqual([]);
    expect(result.detectedBlockIds).toEqual([]);
    expect(result.conflictBlockIds).toEqual([]);
    expect(deps.detectTypes).not.toHaveBeenCalled();
  });
});
