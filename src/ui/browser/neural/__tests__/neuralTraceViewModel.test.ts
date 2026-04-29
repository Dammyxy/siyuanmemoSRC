import { describe, expect, it } from 'vitest';
import type { NeuralActivationTrace } from '@/types/unified-data-source';
import {
  applyNeuralTraceSelectionState,
  buildNeuralActivationTraceViewModel,
  buildNeuralTraceConvergenceCacheKey,
  updateNeuralTraceStepConvergenceState,
  withNeuralTraceRepeatHitState,
} from '../neuralTraceViewModel';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function createTrace(): NeuralActivationTrace {
  return {
    targetEventId: 'event-target',
    targetNodeId: 'target-node',
    branchRootNodeId: 'source-node',
    isExact: true,
    degradedReason: null,
    steps: [
      {
        eventId: 'event-source',
        nodeId: 'source-node',
        nodePreview: 'Source',
        isVirtual: false,
        associationType: 'source',
        reason: 'source',
        activationKind: 'source-root',
        visitedAt: 10,
        focusId: 'source-node',
        engineMode: 'hyperspace',
        sourceRole: 'activation-source',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'source-node',
        traceQuality: 'exact',
        depth: 0,
        conductionScore: 1,
        isSyntheticRoot: false,
      },
      {
        eventId: 'event-target',
        nodeId: 'target-node',
        nodePreview: 'Target',
        isVirtual: true,
        associationType: 'concept-link',
        reason: 'link',
        activationKind: 'graph-edge',
        visitedAt: 20,
        focusId: 'source-node',
        engineMode: 'hyperspace',
        sourceRole: null,
        origin: 'direct-ref',
        sourceNodeId: 'source-node',
        sourceEventId: 'event-source',
        branchRootNodeId: 'source-node',
        traceQuality: 'exact',
        depth: 1,
        conductionScore: 0.8,
        isSyntheticRoot: false,
      },
    ],
  };
}

describe('neuralTraceViewModel', () => {
  it('builds target/root/direct trace projection through injected labels', () => {
    const viewModel = buildNeuralActivationTraceViewModel(createTrace(), {
      t,
      currentNodeId: 'target-node',
    });

    expect(viewModel).toMatchObject({
      engineMode: 'hyperspace',
      targetTitle: 'Target',
      branchRootTitle: 'Source',
      branchRootEventId: 'event-source',
      directActivatorTitle: 'Source',
      directActivatorEventId: 'event-source',
    });
    expect(viewModel.steps[0]).toMatchObject({
      isRoot: true,
      displayBadges: [{ key: 'root-role', label: 'traceBadgePrimarySource:主概念卡：激活源', tone: 'root' }],
    });
    expect(viewModel.steps[1].displayBadges.map((badge) => badge.key)).toEqual([
      'relation:concept-link',
      'origin:direct-ref',
      'virtual',
      'current',
    ]);
  });

  it('updates selection, repeat-hit, convergence state, and cache keys without mutating source trace', () => {
    const viewModel = buildNeuralActivationTraceViewModel(createTrace(), { t });
    const repeated = withNeuralTraceRepeatHitState(viewModel, (nodeId) => nodeId === 'target-node' ? 4 : 1);
    const selected = applyNeuralTraceSelectionState(repeated, { selectedTraceEventId: 'event-source' });
    const updated = updateNeuralTraceStepConvergenceState(selected, 'event-target', {
      convergenceStatus: 'ready',
      convergence: null,
    });

    expect(repeated.steps[1].repeatHitCount).toBe(4);
    expect(selected.steps.map((step) => step.isSelected)).toEqual([true, false]);
    expect(updated.steps[1]).toMatchObject({ convergenceStatus: 'ready', convergence: null });
    expect(viewModel.steps[1].repeatHitCount).toBeUndefined();
    expect(buildNeuralTraceConvergenceCacheKey('target', 'step')).toBe('target::step');
  });
});
