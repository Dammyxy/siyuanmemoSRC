import { describe, expect, it } from 'vitest';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import { compareQueueProjectionParity } from '../QueueProjectionParityDiagnostics';
import {
  buildDeferredQueueProjectionAffectedSet,
  buildFilterGroupProjectionRows,
  buildFinalDrillProjectionRows,
  buildLeechProjectionRows,
  buildNeuralRoamProjectionRows,
  buildStableNeuralProjectionRowId,
} from '../QueueProjectionBuilder';

const NOW = new Date('2026-05-08T09:00:00+08:00').getTime();
const DAY_MS = 86_400_000;

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: `xiuyuan-${id}`,
    blockId: `block-${id}`,
    due: NOW,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - DAY_MS,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - DAY_MS,
    updatedAt: NOW,
    meta: {
      content: `content-${id}`,
      rootId: 'doc-a',
      deckId: 'deck-a',
    },
    ...overrides,
  };
}

function strategySnapshot(cards: FSRSCard[], queueType: QueueType, version = 11): {
  rows: ReturnType<typeof buildQueueSnapshotRow>[];
  counters: QueueCounterSnapshot;
} {
  return {
    rows: cards.map((entry, index) => buildQueueSnapshotRow(entry, { queueIndex: index + 1 })),
    counters: {
      version,
      remaining: cards.length,
      due: cards.filter((entry) => Number(entry.due) <= NOW).length,
      total: cards.length,
      buckets: {
        all: cards.length,
        item: cards.filter((entry) => entry.type === CardType.Item).length,
        descriptor: cards.filter((entry) => entry.type === CardType.Descriptor).length,
        topic: cards.filter((entry) => entry.type === CardType.Topic).length,
        concept: cards.filter((entry) => entry.type === CardType.Concept).length,
      },
      source: 'reconciled',
    },
  };
}

describe('deferred queue projection builders', () => {
  it('projects FilterGroup rows with filter, transfer, blacklist, manual, and commit policy metadata', () => {
    const baseA = card('base-a', { priority: 30 });
    const baseB = card('base-b', { priority: 90 });
    const manual = card('manual', { due: NOW + 4 * DAY_MS });
    const projection = buildFilterGroupProjectionRows({
      filteredCards: [baseA, baseB],
      manualCards: [manual],
      temporaryBlacklistIds: ['base-a'],
      customOrder: ['manual', 'base-b'],
      filterHash: 'filter-hash-a',
      filterId: 'saved-filter-a',
      transferSessionId: 'transfer-a',
      commitPolicy: 'preview-only',
      now: NOW,
      policyHash: 'policy-filter',
      sourceGeneration: 11,
      updatedAt: NOW + 1,
    });
    const strategy = strategySnapshot([manual, baseB], QueueType.FilterGroup, 11);

    expect(compareQueueProjectionParity({
      queueType: QueueType.FilterGroup,
      generation: 11,
      strategy,
      projection,
    }).mismatch).toBe(false);
    expect(projection.rows[0]?.payload).toMatchObject({
      queueKind: 'filter-group',
      filterHash: 'filter-hash-a',
      filterId: 'saved-filter-a',
      transferSessionId: 'transfer-a',
      commitPolicy: 'preview-only',
      membershipSource: 'manual',
    });
  });

  it('projects FinalDrill rows with drill entry, source, expiry, log, and FlipElement order metadata', () => {
    const first = card('first');
    const second = card('second');
    const projection = buildFinalDrillProjectionRows({
      strategyCards: [second, first],
      entries: [
        { cardId: 'first', source: 'manual', timestamp: NOW - DAY_MS, drillLogId: 'log-first' },
        { cardId: 'second', source: 'auto-failed', timestamp: NOW - 2 * DAY_MS, drillLogId: 'log-second' },
      ],
      expiredCardIds: ['expired-card'],
      now: NOW,
      policyHash: 'policy-drill',
      sourceGeneration: 12,
      updatedAt: NOW + 2,
    });
    const strategy = strategySnapshot([second, first], QueueType.FinalDrill, 12);

    expect(compareQueueProjectionParity({
      queueType: QueueType.FinalDrill,
      generation: 12,
      strategy,
      projection,
    }).mismatch).toBe(false);
    expect(projection.rows.map((row) => row.payload)).toEqual([
      expect.objectContaining({
        queueKind: 'final-drill',
        drillEntryId: 'second',
        sourceType: 'auto-failed',
        drillLogId: 'log-second',
        expired: false,
        flipElementOrderKey: 1,
      }),
      expect.objectContaining({
        queueKind: 'final-drill',
        drillEntryId: 'first',
        sourceType: 'manual',
        drillLogId: 'log-first',
        expired: false,
        flipElementOrderKey: 2,
      }),
    ]);
  });

  it('projects Leech rows from lapse/manual membership and action-effect retention metadata', () => {
    const lapse = card('lapse', { lapses: 10, priority: 20 });
    const manual = card('manual-leech', { lapses: 1, due: NOW - 60_000, priority: 90 });
    const projection = buildLeechProjectionRows({
      cards: [manual, lapse],
      threshold: 8,
      manualCardIds: ['manual-leech'],
      temporaryBlacklistIds: [],
      action: 'suspend',
      tagName: 'leech',
      retention: 'formal-review-owned',
      now: NOW,
      policyHash: 'policy-leech',
      sourceGeneration: 13,
      updatedAt: NOW + 3,
    });
    const strategy = strategySnapshot([lapse, manual], QueueType.Leech, 13);

    expect(compareQueueProjectionParity({
      queueType: QueueType.Leech,
      generation: 13,
      strategy,
      projection,
    }).mismatch).toBe(false);
    expect(projection.rows.map((row) => row.payload)).toEqual([
      expect.objectContaining({
        queueKind: 'leech',
        membershipSource: 'lapse',
        actionState: 'suspend',
        retention: 'formal-review-owned',
      }),
      expect.objectContaining({
        queueKind: 'leech',
        membershipSource: 'manual',
        actionState: 'suspend',
        retention: 'formal-review-owned',
      }),
    ]);
  });

  it('projects NeuralRoam synthetic and associated-review rows with stable identity and cursor metadata', () => {
    const synthetic = card('synthetic-node', {
      blockId: 'node-a',
      type: CardType.Topic,
      meta: {
        neuralContext: {
          nodeRole: 'virtual',
          associationType: 'backlink',
          reason: 'source-neighbor',
          isFlashcard: false,
        },
      },
    });
    const associated = card('associated-card', {
      blockId: 'assoc-a',
      meta: {
        neuralContext: {
          nodeRole: 'associated-review',
          sourceVirtualNodeId: 'node-a',
          isFlashcard: true,
        },
      },
    });
    const projection = buildNeuralRoamProjectionRows({
      strategyCards: [synthetic, associated],
      engineMode: 'hyperspace',
      navigationState: {
        currentPathIndex: 2,
        currentNodeId: 'node-a',
        currentEventId: 'event-a',
        navigationMode: 'explore',
        engineMode: 'hyperspace',
        engineSessionId: 'engine-a',
        hasBookmark: true,
        pathLength: 4,
        sessionId: 'session-a',
      },
      sourceNodeIds: ['source-a'],
      seedNodeIds: ['seed-a'],
      anchorNodeIds: ['anchor-a'],
      historyCursor: { eventId: 'event-a', nodeId: 'node-a', pathIndex: 2 },
      now: NOW,
      policyHash: 'policy-neural',
      sourceGeneration: 14,
      updatedAt: NOW + 4,
    });
    const strategy = strategySnapshot([synthetic, associated], QueueType.NeuralRoam, 14);

    expect(projection.rows.map((row) => row.rowId)).toEqual([
      buildStableNeuralProjectionRowId({ nodeKind: 'synthetic', nodeId: 'node-a', engineMode: 'hyperspace' }),
      buildStableNeuralProjectionRowId({ nodeKind: 'associated-review', cardId: 'associated-card', engineMode: 'hyperspace' }),
    ]);
    expect(compareQueueProjectionParity({
      queueType: QueueType.NeuralRoam,
      generation: 14,
      strategy,
      projection,
    }).mismatch).toBe(false);
    expect(projection.rows[0]?.payload).toMatchObject({
      queueKind: 'neural-roam',
      nodeKind: 'synthetic',
      syntheticNodeId: 'node-a',
      engineMode: 'hyperspace',
      historyCursor: { eventId: 'event-a', nodeId: 'node-a', pathIndex: 2 },
    });
    expect(projection.rows[1]?.payload).toMatchObject({
      queueKind: 'neural-roam',
      nodeKind: 'associated-review',
      associatedReviewCardId: 'associated-card',
      sourceVirtualNodeId: 'node-a',
    });
  });

  it('plans deferred queue affected sets for ordinary feedback and refresh-only broad changes', () => {
    const affected = buildDeferredQueueProjectionAffectedSet({
      queueType: QueueType.NeuralRoam,
      reviewedCard: card('reviewed', { blockId: 'block-shared' }),
      sameBlockCards: [card('same-block', { blockId: 'block-shared' })],
      manualCards: [card('manual-entry')],
      finalDrillCards: [card('drill-entry')],
      leechCards: [card('leech-entry')],
      neuralSyntheticNodeIds: ['node-a'],
      neuralNeighborNodeIds: ['node-b'],
      historyCursorNodeId: 'node-c',
    });

    expect(affected.affectedCardIds).toEqual([
      'reviewed',
      'same-block',
      'manual-entry',
      'drill-entry',
      'leech-entry',
      'neural:synthetic:node-a',
      'neural:neighbor:node-b',
      'neural:history-cursor:node-c',
    ]);
    expect(affected.entries.find((entry) => entry.cardId === 'same-block')?.reasons).toEqual(['same-block']);
    expect(affected.refreshRequired).toBe(false);

    expect(buildDeferredQueueProjectionAffectedSet({
      queueType: QueueType.FilterGroup,
      broadInvalidationReason: 'filter-definition-changed',
    })).toMatchObject({
      refreshRequired: true,
      refreshReason: 'filter-definition-changed',
    });
  });
});
