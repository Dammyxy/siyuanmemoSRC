import { describe, expect, it } from 'vitest';
import {
  buildTransactionFanoutPlan,
  shouldDispatchAutoCardFromFanoutPlan,
  shouldDispatchDocTreeFromFanoutPlan,
  shouldDispatchKernelTransactionIngestFromFanoutPlan,
  shouldDispatchNativeRiffFromFanoutPlan,
} from '../transaction-fanout-coordinator';
import type { Transaction } from '../transaction-types';

function tx(doOperations: Transaction['doOperations']): Transaction {
  return {
    doOperations,
    undoOperations: null,
  };
}

describe('transaction fan-out coordinator', () => {
  it('suppresses only provenance-matched AutoCard candidates and preserves delete cancellation', () => {
    const plan = buildTransactionFanoutPlan({
      now: 1_000,
      provenance: {
        capturedAt: 900,
        entries: [
          {
            blockId: 'excerpt-topic',
            expiresAt: 2_000,
            reason: 'progressive-excerpt-topic-card',
            source: 'progressive-excerpt',
            suppressAutoCard: true,
          },
        ],
      },
      transactions: [
        tx([
          {
            action: 'update',
            id: 'excerpt-topic',
            data: { new: { content: 'Prompt >> Answer' } },
          },
          {
            action: 'update',
            id: 'user-edit',
            data: { new: { content: 'User >> Answer' } },
          },
          {
            action: 'delete',
            id: 'pending-delete',
          },
        ]),
      ],
    });

    expect(plan.autoCard.candidateOperations.map((operation) => operation.blockId)).toEqual(['user-edit']);
    expect(plan.autoCard.suppressedOperations.map((operation) => operation.blockId)).toEqual(['excerpt-topic']);
    expect(plan.autoCard.cancelBlockIds).toEqual(['pending-delete']);
    expect(shouldDispatchAutoCardFromFanoutPlan(plan)).toBe(true);
    expect(shouldDispatchKernelTransactionIngestFromFanoutPlan(plan)).toBe(true);
  });

  it('ignores expired and sibling provenance records', () => {
    const plan = buildTransactionFanoutPlan({
      now: 3_000,
      provenance: {
        capturedAt: 900,
        entries: [
          {
            blockId: 'expired-topic',
            expiresAt: 2_000,
            reason: 'progressive-excerpt-topic-card',
            source: 'progressive-excerpt',
          },
          {
            blockId: 'same-doc-sibling',
            expiresAt: 5_000,
            reason: 'progressive-excerpt-topic-card',
            source: 'progressive-excerpt',
          },
        ],
      },
      transactions: [
        tx([
          {
            action: 'update',
            id: 'expired-topic',
            data: { new: { content: 'Prompt >> Answer' } },
          },
          {
            action: 'update',
            id: 'other-block-in-doc',
            data: { new: { content: 'Other >> Answer' } },
          },
        ]),
      ],
    });

    expect(plan.autoCard.suppressedOperations).toEqual([]);
    expect(plan.autoCard.candidateOperations.map((operation) => operation.blockId)).toEqual([
      'expired-topic',
      'other-block-in-doc',
    ]);
  });

  it('preserves Native Riff evidence without routing Native Riff work', () => {
    const plan = buildTransactionFanoutPlan({
      now: 1_000,
      provenance: {
        entries: [
          {
            blockId: 'excerpt-doc',
            expiresAt: 2_000,
            reason: 'progressive-excerpt-artifact',
            source: 'progressive-excerpt',
          },
        ],
      },
      transactions: [
        tx([
          {
            action: 'insert',
            id: 'excerpt-doc',
            parentID: 'source-doc',
            data: {
              new: {
                content: 'Excerpt >> Topic',
                type: 'd',
              },
            },
          },
          {
            action: 'addFlashcards',
            blockIDs: ['topic-card'],
          },
          {
            action: 'removeFlashcards',
            blockIDs: ['removed-card'],
          },
        ]),
      ],
    });

    expect(plan.autoCard.candidateOperations).toEqual([]);
    expect(plan.autoCard.suppressedOperations.map((operation) => operation.blockId)).toEqual(['excerpt-doc']);
    expect(plan.documentTree.touchedBlockIds).toEqual(['excerpt-doc', 'source-doc', 'topic-card', 'removed-card']);
    expect(plan.nativeRiff.upsertBlockIds).toEqual(['topic-card']);
    expect(plan.nativeRiff.removeBlockIds).toEqual(['removed-card']);
    expect(plan.nativeRiff.shouldDispatch).toBe(false);
    expect(plan.nativeRiff.reasons).toEqual([]);
    expect(shouldDispatchDocTreeFromFanoutPlan(plan)).toBe(true);
    expect(shouldDispatchNativeRiffFromFanoutPlan(plan)).toBe(false);
    expect(plan.reasons).not.toContain('native-riff-upsert');
    expect(plan.reasons).not.toContain('native-riff-remove');
  });
});
