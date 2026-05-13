import { describe, expect, it } from 'vitest';
import type { QueueProjectionReadiness, QueueProjectionReadinessCause } from '../backend-rpc';

describe('backend queue projection readiness contract', () => {
  it('represents ready, refreshing, and unavailable states as a discriminated union', () => {
    const ready = {
      status: 'ready',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      generation: 1,
    } satisfies QueueProjectionReadiness;
    const refreshing = {
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'materialization_in_progress',
      retryAfterMs: 150,
    } satisfies QueueProjectionReadiness;
    const unavailable = {
      status: 'unavailable',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'writer_unavailable',
      reason: 'writer unavailable',
      recoverable: true,
      retryAfterMs: 300,
    } satisfies QueueProjectionReadiness;

    expect([ready.status, refreshing.status, unavailable.status]).toEqual([
      'ready',
      'refreshing',
      'unavailable',
    ]);
  });

  it('uses machine-readable causes instead of UI copy strings', () => {
    const cause: QueueProjectionReadinessCause = 'contract_mismatch';
    expect(cause).toBe('contract_mismatch');
  });
});
