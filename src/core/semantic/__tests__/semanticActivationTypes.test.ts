import { describe, expect, it } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import {
  SEMANTIC_ACTIVATION_QUEUE_TYPE,
  isSemanticActivationRuntimeQueue,
  type SemanticActivationRuntimeQueue,
  type SemanticCommand,
  type SemanticEvent,
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

  it('names branch, cursor, later, suggestion, end, and fork events as first-class Semantic contracts', () => {
    const events: SemanticEvent[] = [
      { eventId: 'edge-1', sessionId: 's1', type: 'branch-edge-created', fromNodeId: 'a', toNodeId: 'b', occurredAt: 1 },
      { eventId: 'cursor-1', sessionId: 's1', type: 'active-cursor-moved', nodeId: 'b', occurredAt: 2 },
      { eventId: 'branch-archive-1', sessionId: 's1', type: 'branch-archived', occurredAt: 3 },
      { eventId: 'branch-restore-1', sessionId: 's1', type: 'branch-restored', occurredAt: 4 },
      { eventId: 'later-1', sessionId: 's1', type: 'later-added', nodeId: 'c', occurredAt: 5 },
      { eventId: 'later-2', sessionId: 's1', type: 'later-removed', nodeId: 'c', occurredAt: 6 },
      { eventId: 'irrelevant-1', sessionId: 's1', type: 'node-marked-irrelevant', nodeId: 'd', occurredAt: 7 },
      { eventId: 'suggestion-1', sessionId: 's1', type: 'suggestion-created', occurredAt: 8 },
      { eventId: 'suggestion-2', sessionId: 's1', type: 'suggestion-bound', nodeId: 'e', occurredAt: 9 },
      { eventId: 'fork-1', sessionId: 's2', type: 'session-forked', occurredAt: 10 },
      { eventId: 'end-1', sessionId: 's1', type: 'session-ended', occurredAt: 11 },
    ];

    expect(events.map((event) => event.type)).toContain('branch-edge-created');
    expect(events.map((event) => event.type)).toContain('session-forked');
  });

  it('names branch, cursor, later, suggestion, end, and fork commands as first-class Semantic contracts', () => {
    const commands: SemanticCommand[] = [
      { type: 'create-branch-edge', sessionId: 's1', fromNodeId: 'a', toNodeId: 'b', lens: 'free', idempotencyKey: 'k1' },
      { type: 'move-active-cursor', sessionId: 's1', nodeId: 'b', idempotencyKey: 'k2' },
      { type: 'archive-branch', sessionId: 's1', branchId: 'br1', idempotencyKey: 'k3' },
      { type: 'restore-branch', sessionId: 's1', branchId: 'br1', idempotencyKey: 'k4' },
      { type: 'add-later', sessionId: 's1', nodeId: 'c', reason: 'compare later', idempotencyKey: 'k5' },
      { type: 'remove-later', sessionId: 's1', nodeId: 'c', idempotencyKey: 'k6' },
      { type: 'mark-irrelevant', sessionId: 's1', nodeId: 'd', idempotencyKey: 'k7' },
      { type: 'create-suggestion', sessionId: 's1', suggestionId: 'sg1', source: 'ai', summary: 'try binding', idempotencyKey: 'k8' },
      { type: 'ignore-suggestion', sessionId: 's1', suggestionId: 'sg1', idempotencyKey: 'k9' },
      { type: 'bind-suggestion', sessionId: 's1', suggestionId: 'sg2', nodeId: 'e', idempotencyKey: 'k10' },
      { type: 'materialize-suggestion', sessionId: 's1', suggestionId: 'sg3', blockId: 'b1', cardId: null, idempotencyKey: 'k11' },
      { type: 'end-session', sessionId: 's1', idempotencyKey: 'k12' },
      { type: 'fork-session', sourceSessionId: 's1', sourceNodeId: 'b', rootFocusNodeId: 'b', idempotencyKey: 'k13' },
    ];

    expect(commands.map((command) => command.type)).toContain('fork-session');
    expect(commands.map((command) => command.type)).toContain('materialize-suggestion');
  });
});
