import { describe, expect, it } from 'vitest';

import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  buildSchedulerPreviewSnapshotKey,
  buildSchedulerStateSnapshot,
} from '../schedulerStateSnapshot';

const NOW = Date.UTC(2026, 4, 13, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: NOW + 5 * DAY_MS,
    stability: 12.5,
    difficulty: 4.25,
    reps: 8,
    lapses: 1,
    state: CardState.Review,
    lastReview: NOW - 7 * DAY_MS,
    elapsedDays: 7,
    scheduledDays: 12,
    learning_step: 0,
    priority: 30,
    type: CardType.Item,
    tags: ['source-only'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 30 * DAY_MS,
    updatedAt: NOW - DAY_MS,
    schedulerType: 'fsrs-v6',
    meta: { content: 'source text', rootId: 'doc-1' },
    ...overrides,
  };
}

describe('schedulerStateSnapshot', () => {
  it('builds a JSON-safe FSRS scheduler snapshot without source content ownership', () => {
    const snapshot = buildSchedulerStateSnapshot(createCard(), {
      now: NOW,
      source: 'test',
      reviewTime: NOW + DAY_MS,
    });

    expect(snapshot).toMatchObject({
      cardId: 'card-1',
      blockId: 'block-1',
      schedulerType: 'fsrs-v6',
      cardType: CardType.Item,
      state: CardState.Review,
      due: NOW + 5 * DAY_MS,
      lastReview: NOW - 7 * DAY_MS,
      stability: 12.5,
      difficulty: 4.25,
      reps: 8,
      lapses: 1,
      elapsedDays: 7,
      scheduledDays: 12,
      learningStep: 0,
      reviewTime: NOW + DAY_MS,
      memoryStateAsOf: null,
      source: 'test',
      diagnostics: {
        dirty: false,
        repairedRead: false,
        reasons: [],
      },
    });
    expect(snapshot.topic).toBeUndefined();
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain('source text');
    expect(JSON.stringify(snapshot)).not.toContain('source-only');
  });

  it('includes canonical topic scheduling state for A-Factor cards', () => {
    const snapshot = buildSchedulerStateSnapshot(createCard({
      id: 'topic-1',
      type: CardType.Topic,
      schedulerType: 'fsrs-v6',
      aFactor: 2.8,
      schedulerMeta: {
        topic: {
          afs: [2.1, 2.3, 2.8],
          of: 2.8,
          optimalInterval: 9,
        },
      },
    }), { now: NOW });

    expect(snapshot.schedulerType).toBe('a-factor-v2');
    expect(snapshot.topic).toEqual({
      aFactor: 2.8,
      of: 2.8,
      optimalInterval: 9,
      afs: [2.1, 2.3, 2.8],
    });
  });

  it('reports dirty scheduler state as read diagnostics without mutating the input card', () => {
    const dirty = createCard({
      stability: 0,
      difficulty: 99,
      scheduledDays: 0,
      elapsedDays: -1,
      meta: {
        nextDues: { 3: '1 d' },
        content: 'kept outside scheduler snapshot',
      },
    });

    const snapshot = buildSchedulerStateSnapshot(dirty, { now: NOW });

    expect(snapshot.diagnostics.dirty).toBe(true);
    expect(snapshot.diagnostics.repairedRead).toBe(true);
    expect(snapshot.diagnostics.reasons).toEqual(expect.arrayContaining([
      'stability',
      'difficulty',
      'scheduledDays',
      'elapsedDays',
      'meta.nextDues',
    ]));
    expect(snapshot.stability).toBeGreaterThan(0);
    expect(snapshot.difficulty).toBeLessThanOrEqual(10);
    expect(dirty.stability).toBe(0);
    expect(dirty.difficulty).toBe(99);
    expect(dirty.meta).toEqual({
      nextDues: { 3: '1 d' },
      content: 'kept outside scheduler snapshot',
    });
  });

  it('changes identity for scheduler-relevant state and preview timing context only', () => {
    const base = createCard();
    const baseKey = buildSchedulerPreviewSnapshotKey(base, {
      now: NOW,
      reviewTime: NOW + DAY_MS,
      memoryStateAsOf: NOW + 2 * DAY_MS,
    });

    const changedFields: Array<[string, Partial<FSRSCard>]> = [
      ['due', { due: base.due + DAY_MS }],
      ['state', { state: CardState.Relearning }],
      ['stability', { stability: base.stability + 1 }],
      ['difficulty', { difficulty: base.difficulty + 1 }],
      ['reps', { reps: base.reps + 1 }],
      ['lapses', { lapses: base.lapses + 1 }],
      ['scheduledDays', { scheduledDays: base.scheduledDays + 1 }],
      ['elapsedDays', { elapsedDays: base.elapsedDays + 1 }],
      ['learning_step', { learning_step: 2 }],
      ['schedulerType', { schedulerType: 'a-factor-v2' }],
    ];

    for (const [field, overrides] of changedFields) {
      expect(buildSchedulerPreviewSnapshotKey(createCard(overrides), {
        now: NOW,
        reviewTime: NOW + DAY_MS,
        memoryStateAsOf: NOW + 2 * DAY_MS,
      }), field).not.toBe(baseKey);
    }

    expect(buildSchedulerPreviewSnapshotKey(base, {
      now: NOW,
      reviewTime: NOW + 2 * DAY_MS,
      memoryStateAsOf: NOW + 2 * DAY_MS,
    })).not.toBe(baseKey);
    expect(buildSchedulerPreviewSnapshotKey(base, {
      now: NOW,
      reviewTime: NOW + DAY_MS,
      memoryStateAsOf: NOW + 3 * DAY_MS,
    })).not.toBe(baseKey);

    expect(buildSchedulerPreviewSnapshotKey(createCard({
      tags: ['changed'],
      meta: { content: 'changed source', rootId: 'doc-2' },
      priority: 99,
    }), {
      now: NOW,
      reviewTime: NOW + DAY_MS,
      memoryStateAsOf: NOW + 2 * DAY_MS,
    })).toBe(baseKey);
  });

  it('changes identity when topic scheduling metadata changes', () => {
    const topic = createCard({
      type: CardType.Topic,
      aFactor: 2.5,
      schedulerMeta: {
        topic: {
          afs: [2.5],
          of: 2.5,
          optimalInterval: 8,
        },
      },
    });
    const key = buildSchedulerPreviewSnapshotKey(topic, { now: NOW });

    expect(buildSchedulerPreviewSnapshotKey({
      ...topic,
      schedulerMeta: {
        topic: {
          afs: [2.5, 2.9],
          of: 2.9,
          optimalInterval: 10,
        },
      },
    }, { now: NOW })).not.toBe(key);
  });
});
