import { QueueType } from './unified-data-source';

export type QueueProjectionLiveIdentityReason =
  | 'materialized'
  | 'refreshed'
  | 'invalidated'
  | 'echo-cleared';

export type QueueProjectionLiveIdentitySource =
  | 'backend'
  | 'writer-relay'
  | 'runtime';

export interface QueueProjectionIdentity {
  queueId: string;
  queueType: QueueType;
  policyId: string;
  generation: number;
}

export interface QueueProjectionLiveIdentityEvent {
  type: 'queue-projection-live-identity';
  queueId: string;
  queueType: QueueType;
  policyId: string | null;
  generation: number | null;
  reason: QueueProjectionLiveIdentityReason;
  source: QueueProjectionLiveIdentitySource;
  timestamp: number;
  diagnosticEventId?: string;
}

export type QueueProjectionLiveIdentityDecision =
  | { action: 'ignore'; reason: 'missing-event-identity' | 'missing-attached-identity' | 'queue-mismatch' | 'policy-mismatch' | 'not-newer' }
  | { action: 'recheck'; reason: 'identity-invalidated' }
  | { action: 'reattach'; identity: QueueProjectionIdentity };

export type QueueProjectionLiveIdentityListener = (event: QueueProjectionLiveIdentityEvent) => void;

export function normalizeQueueProjectionIdentity(
  input: Partial<QueueProjectionIdentity> | null | undefined,
): QueueProjectionIdentity | null {
  if (!input || !Object.values(QueueType).includes(input.queueType as QueueType)) {
    return null;
  }
  const queueId = String(input.queueId || input.queueType || '').trim();
  const policyId = String(input.policyId || '').trim();
  const generation = Number(input.generation);
  if (!queueId || !policyId || !Number.isFinite(generation) || generation <= 0) {
    return null;
  }
  return {
    queueId,
    queueType: input.queueType,
    policyId,
    generation: Math.floor(generation),
  };
}

export function compareQueueProjectionLiveIdentity(
  event: QueueProjectionLiveIdentityEvent | null | undefined,
  attachedIdentity: Partial<QueueProjectionIdentity> | null | undefined,
): QueueProjectionLiveIdentityDecision {
  if (!event || !Object.values(QueueType).includes(event.queueType as QueueType)) {
    return { action: 'ignore', reason: 'missing-event-identity' };
  }

  const attached = normalizeQueueProjectionIdentity(attachedIdentity);
  if (!attached) {
    return { action: 'ignore', reason: 'missing-attached-identity' };
  }

  const eventQueueId = String(event.queueId || event.queueType || '').trim();
  if (!eventQueueId || event.queueType !== attached.queueType || eventQueueId !== attached.queueId) {
    return { action: 'ignore', reason: 'queue-mismatch' };
  }

  if (event.reason === 'invalidated' || event.reason === 'echo-cleared') {
    return { action: 'recheck', reason: 'identity-invalidated' };
  }

  const eventPolicyId = String(event.policyId || '').trim();
  const eventGeneration = Number(event.generation);
  if (!eventPolicyId || !Number.isFinite(eventGeneration) || eventGeneration <= 0) {
    return { action: 'ignore', reason: 'missing-event-identity' };
  }

  if (eventPolicyId !== attached.policyId) {
    return { action: 'ignore', reason: 'policy-mismatch' };
  }

  if (Math.floor(eventGeneration) <= attached.generation) {
    return { action: 'ignore', reason: 'not-newer' };
  }

  return {
    action: 'reattach',
    identity: {
      queueId: eventQueueId,
      queueType: event.queueType,
      policyId: eventPolicyId,
      generation: Math.floor(eventGeneration),
    },
  };
}
