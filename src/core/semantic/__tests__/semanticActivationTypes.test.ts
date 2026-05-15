import { describe, expect, it } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import {
  SEMANTIC_ACTIVATION_QUEUE_TYPE,
  isSemanticActivationRuntimeQueue,
  type SemanticActivationRuntimeQueue,
} from '../semanticActivationTypes';

describe('semantic activation runtime contract', () => {
  it('uses an independent runtime queue identity instead of NeuralRoam', () => {
    expect(SEMANTIC_ACTIVATION_QUEUE_TYPE).toBe('semantic-activation');
    expect(SEMANTIC_ACTIVATION_QUEUE_TYPE).not.toBe(QueueType.NeuralRoam);
  });

  it('does not accept Orbit/Hyperspace NeuralRoam queue state as Semantic runtime state', () => {
    const neuralRoamLike = {
      type: QueueType.NeuralRoam,
      getEngineMode: () => 'orbit',
      getSeedSnapshot: () => [],
      getSourceSnapshot: () => [],
      getAnchorSnapshot: () => [],
    };

    expect(isSemanticActivationRuntimeQueue(neuralRoamLike)).toBe(false);

    const semanticQueue = {
      semanticRuntimeKind: 'semantic-activation',
      queueType: SEMANTIC_ACTIVATION_QUEUE_TYPE,
      getSessionSnapshot: () => null,
      getCandidateColumns: () => ({
        assimilation: [],
        accommodation: [],
        free: [],
      }),
      dispatchSemanticCommand: async () => ({
        status: 'unavailable',
        unavailableReason: 'writer-unavailable',
        message: 'writer unavailable',
      }),
    } satisfies SemanticActivationRuntimeQueue;

    expect(isSemanticActivationRuntimeQueue(semanticQueue)).toBe(true);
  });
});
