import { describe, expect, it } from 'vitest';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewRenderCacheKey,
  buildReviewRenderWatchKey,
  isNeuralRoamNonFlashcard,
} from '../reviewRenderPolicy';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('reviewRenderPolicy', () => {
  it('forces Protyle policy condition when neural roam node is non-flashcard even if forceQuickRender=true', () => {
    const card = createCard({
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
        forceQuickRender: true,
      },
    });

    expect(isNeuralRoamNonFlashcard(card)).toBe(true);
  });

  it('keeps quick-render eligibility condition for neural roam flashcard nodes', () => {
    const card = createCard({
      meta: {
        neuralContext: {
          isFlashcard: true,
        },
      },
    });

    expect(isNeuralRoamNonFlashcard(card)).toBe(false);
  });

  it('buildReviewRenderCacheKey changes when cardId/typeMarker/neural isFlashcard changes', () => {
    const base = {
      blockId: 'block-1',
      cardId: 'card-1',
      cardType: 'item',
      typeMarker: 'forward',
      neuralIsFlashcard: true,
      forceProtyleRender: false,
      forceQuickRender: false,
    } as const;

    const keyA = buildReviewRenderCacheKey(base);
    const keyB = buildReviewRenderCacheKey({ ...base, cardId: 'card-2' });
    const keyC = buildReviewRenderCacheKey({ ...base, typeMarker: 'reverse' });
    const keyD = buildReviewRenderCacheKey({ ...base, neuralIsFlashcard: false });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });

  it('buildReviewRenderWatchKey changes when force flags or isFlashcard changes', () => {
    const base = {
      contentType: 'protyle',
      blockId: 'block-1',
      cardId: 'card-1',
      cardType: 'item',
      typeMarker: 'forward',
      neuralIsFlashcard: true,
      forceProtyleRender: false,
      forceQuickRender: false,
    } as const;

    const keyA = buildReviewRenderWatchKey(base);
    const keyB = buildReviewRenderWatchKey({ ...base, forceQuickRender: true });
    const keyC = buildReviewRenderWatchKey({ ...base, forceProtyleRender: true });
    const keyD = buildReviewRenderWatchKey({ ...base, neuralIsFlashcard: false });

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });
});

