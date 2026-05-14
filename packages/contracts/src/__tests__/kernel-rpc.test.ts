import { describe, expect, it } from 'vitest';
import {
  KERNEL_AI_STREAM_EVENT_TYPES,
  KERNEL_FAST_PATH_CAPABILITY_KEYS,
  KERNEL_RELAY_METHODS,
  type KernelBroadcastEvent,
  type QueueProjectionIdentityBroadcastPayload,
} from '../kernel-rpc';

describe('kernel relay contract', () => {
  it('declares every backend mutation relay method used by ApplicationContext', () => {
    expect(KERNEL_RELAY_METHODS).toEqual(expect.arrayContaining([
      'review.feedback',
      'browser.sourceExistence.applySweepHost',
      'browser.sourceExistence.update',
      'browser.sourceExistence.applySweep',
      'kernel.transaction.ingest',
      'kernel.transaction.dequeue',
      'kernel.transaction.requeue',
      'autocard.decision.resolve',
      'autocard.execute',
      'private.command.execute',
    ]));
  });

  it('declares fast-path capability keys used by runtime diagnostics', () => {
    expect(KERNEL_FAST_PATH_CAPABILITY_KEYS).toEqual([
      'rpcWebSocketPush',
      'backendRealWorkerTransport',
      'kernelNetworkSse',
      'privateSse',
      'aiKernelStreaming',
    ]);
  });

  it('declares normalized AI stream event types without exposing raw SSE payloads', () => {
    expect(KERNEL_AI_STREAM_EVENT_TYPES).toEqual([
      'token',
      'progress',
      'error',
      'final',
      'canceled',
      'timeout',
      'close',
    ]);
  });

  it('declares queue projection identity broadcasts as identity-only kernel push events', () => {
    const payload: QueueProjectionIdentityBroadcastPayload = {
      queueId: 'filter-group',
      queueType: 'filter-group',
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed',
      source: 'runtime',
      sourceInstanceId: 'writer-a',
      timestamp: 10,
      diagnosticEventId: 'event-a',
    };
    const event: KernelBroadcastEvent = {
      method: 'memo.queueProjection.identityChanged',
      params: payload,
    };

    expect(event.params).toEqual(payload);
    expect(JSON.stringify(event)).not.toContain('rows');
  });
});
