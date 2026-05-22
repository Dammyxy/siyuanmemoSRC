import { QueueType } from './unified-data-source';
import type { QueueProjectionIdentityBroadcastPayload } from '../../packages/contracts/src/kernel-rpc';

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

export function mapQueueProjectionLiveIdentityToBroadcast(
  event: QueueProjectionLiveIdentityEvent,
  options: {
    sourceInstanceId: string;
    sourceSurfaceId?: string | null;
    sourceMode?: string | null;
  },
): QueueProjectionIdentityBroadcastPayload | null {
  const identity = normalizeQueueProjectionIdentity({
    queueId: event.queueId,
    queueType: event.queueType,
    policyId: event.policyId || undefined,
    generation: event.generation || undefined,
  });
  const sourceInstanceId = String(options.sourceInstanceId || '').trim();
  if (!identity || !sourceInstanceId) {
    return null;
  }
  if (event.reason !== 'materialized' && event.reason !== 'refreshed') {
    return null;
  }
  return {
    ...identity,
    reason: event.reason,
    source: event.source,
    sourceInstanceId,
    sourceSurfaceId: String(options.sourceSurfaceId || '').trim() || undefined,
    sourceMode: String(options.sourceMode || '').trim() || undefined,
    timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
    diagnosticEventId: String(event.diagnosticEventId || '').trim()
      || `queue-projection:${identity.queueType}:${identity.policyId}:${identity.generation}:${sourceInstanceId}`,
  };
}

export function mapQueueProjectionBroadcastToLiveIdentity(
  broadcast: QueueProjectionIdentityBroadcastPayload | null | undefined,
): QueueProjectionLiveIdentityEvent | null {
  const identity = normalizeQueueProjectionIdentity({
    queueId: broadcast?.queueId,
    queueType: broadcast?.queueType as QueueType,
    policyId: broadcast?.policyId,
    generation: broadcast?.generation,
  });
  if (!broadcast || !identity) {
    return null;
  }
  if (broadcast.reason !== 'materialized' && broadcast.reason !== 'refreshed') {
    return null;
  }
  return {
    type: 'queue-projection-live-identity',
    queueId: identity.queueId,
    queueType: identity.queueType,
    policyId: identity.policyId,
    generation: identity.generation,
    reason: broadcast.reason,
    source: broadcast.source,
    timestamp: Number.isFinite(Number(broadcast.timestamp)) ? Number(broadcast.timestamp) : Date.now(),
    diagnosticEventId: String(broadcast.diagnosticEventId || '').trim() || undefined,
  };
}

export function getQueueProjectionBroadcastDedupeKey(
  broadcast: Pick<QueueProjectionIdentityBroadcastPayload, 'queueId' | 'queueType' | 'policyId' | 'generation' | 'sourceInstanceId'>,
): string {
  return [
    String(broadcast.sourceInstanceId || '').trim(),
    String(broadcast.queueType || '').trim(),
    String(broadcast.queueId || '').trim(),
    String(broadcast.policyId || '').trim(),
    Math.floor(Number(broadcast.generation) || 0),
  ].join(':');
}

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

  const eventQueueId = String(event.queueId || event.queueType || '').trim();
  if (!eventQueueId) {
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

  const attached = normalizeQueueProjectionIdentity(attachedIdentity);
  if (!attached) {
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

  if (event.queueType !== attached.queueType || eventQueueId !== attached.queueId) {
    return { action: 'ignore', reason: 'queue-mismatch' };
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
