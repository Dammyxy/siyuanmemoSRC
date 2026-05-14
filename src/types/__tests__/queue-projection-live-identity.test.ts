import { describe, expect, it } from 'vitest';
import { QueueType } from '../unified-data-source';
import {
  compareQueueProjectionLiveIdentity,
  getQueueProjectionBroadcastDedupeKey,
  mapQueueProjectionBroadcastToLiveIdentity,
  mapQueueProjectionLiveIdentityToBroadcast,
  type QueueProjectionLiveIdentityEvent,
} from '../queue-projection-live-identity';

const attached = {
  queueId: QueueType.RetrievalPractice,
  queueType: QueueType.RetrievalPractice,
  policyId: 'policy-a',
  generation: 2,
};

function event(overrides: Partial<QueueProjectionLiveIdentityEvent> = {}): QueueProjectionLiveIdentityEvent {
  return {
    type: 'queue-projection-live-identity',
    queueId: QueueType.RetrievalPractice,
    queueType: QueueType.RetrievalPractice,
    policyId: 'policy-a',
    generation: 3,
    reason: 'refreshed',
    source: 'runtime',
    timestamp: 1,
    ...overrides,
  };
}

describe('queue projection live identity comparison', () => {
  it('accepts a newer matching generation for reattach', () => {
    expect(compareQueueProjectionLiveIdentity(event(), attached)).toEqual({
      action: 'reattach',
      identity: {
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 3,
      },
    });
  });

  it('ignores equal and older generations', () => {
    expect(compareQueueProjectionLiveIdentity(event({ generation: 2 }), attached)).toEqual({
      action: 'ignore',
      reason: 'not-newer',
    });
    expect(compareQueueProjectionLiveIdentity(event({ generation: 1 }), attached)).toEqual({
      action: 'ignore',
      reason: 'not-newer',
    });
  });

  it('ignores queue and policy mismatches', () => {
    expect(compareQueueProjectionLiveIdentity(event({ queueType: QueueType.FilterGroup, queueId: QueueType.FilterGroup }), attached)).toEqual({
      action: 'ignore',
      reason: 'queue-mismatch',
    });
    expect(compareQueueProjectionLiveIdentity(event({ policyId: 'policy-b' }), attached)).toEqual({
      action: 'ignore',
      reason: 'policy-mismatch',
    });
  });

  it('ignores missing event or attached identity safely', () => {
    expect(compareQueueProjectionLiveIdentity(event({ policyId: null }), attached)).toEqual({
      action: 'ignore',
      reason: 'missing-event-identity',
    });
    expect(compareQueueProjectionLiveIdentity(event(), null)).toEqual({
      action: 'ignore',
      reason: 'missing-attached-identity',
    });
  });

  it('plans a recheck for invalidation without promising readable rows', () => {
    expect(compareQueueProjectionLiveIdentity(event({
      generation: null,
      policyId: null,
      reason: 'invalidated',
    }), attached)).toEqual({
      action: 'recheck',
      reason: 'identity-invalidated',
    });
  });

  it('maps ready live identities to content-free kernel broadcasts', () => {
    const broadcast = mapQueueProjectionLiveIdentityToBroadcast(event({
      queueId: QueueType.FilterGroup,
      queueType: QueueType.FilterGroup,
      policyId: 'policy-b',
      generation: 7,
      diagnosticEventId: 'event-b',
    }), {
      sourceInstanceId: 'writer-a',
      sourceSurfaceId: 'surface-a',
      sourceMode: 'writer',
    });

    expect(broadcast).toEqual({
      queueId: QueueType.FilterGroup,
      queueType: QueueType.FilterGroup,
      policyId: 'policy-b',
      generation: 7,
      reason: 'refreshed',
      source: 'runtime',
      sourceInstanceId: 'writer-a',
      sourceSurfaceId: 'surface-a',
      sourceMode: 'writer',
      timestamp: 1,
      diagnosticEventId: 'event-b',
    });
    expect(JSON.stringify(broadcast)).not.toContain('rows');
  });

  it('maps accepted kernel broadcasts back to local live identity events', () => {
    expect(mapQueueProjectionBroadcastToLiveIdentity({
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-c',
      generation: 8,
      reason: 'materialized',
      source: 'backend',
      sourceInstanceId: 'writer-a',
      timestamp: 11,
      diagnosticEventId: 'event-c',
    })).toEqual({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-c',
      generation: 8,
      reason: 'materialized',
      source: 'backend',
      timestamp: 11,
      diagnosticEventId: 'event-c',
    });
  });

  it('builds stable broadcast dedupe keys from source and identity only', () => {
    expect(getQueueProjectionBroadcastDedupeKey({
      queueId: QueueType.FilterGroup,
      queueType: QueueType.FilterGroup,
      policyId: 'policy-d',
      generation: 4.8,
      sourceInstanceId: 'writer-a',
    })).toBe('writer-a:filter-group:filter-group:policy-d:4');
  });
});
