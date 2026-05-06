import { describe, expect, it } from 'vitest';
import { runBackendParityChecks, summarizeBackendParity } from '@/application/backendMigration/parityHarness';
import { BACKEND_FEATURE_GATE_MATRIX, resolveBackendFeatureGates } from '@/application/backendMigration/featureGateMatrix';

describe('Backend migration parity harness', () => {
  it('passes parity checks for key migrated families with required diagnostics', () => {
    const results = runBackendParityChecks([
      {
        familyId: 'review.feedback',
        expectedOwner: 'backend-worker',
        diagnosticsPresent: ['cardId', 'queueType', 'committed'],
      },
      {
        familyId: 'autocard.decision',
        expectedOwner: 'writer-relay',
        diagnosticsPresent: ['candidateId', 'decisionEventId', 'unavailableClass'],
      },
      {
        familyId: 'kernel.transaction',
        expectedOwner: 'backend-worker',
        diagnosticsPresent: ['idempotencyKey', 'queueLength', 'acceptedTotal'],
      },
    ]);
    const summary = summarizeBackendParity(results);
    expect(summary).toEqual({
      passed: true,
      failedFamilies: [],
    });
  });

  it('resolves rollback gate matrix with environment overrides', () => {
    const gates = resolveBackendFeatureGates({
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'false',
    });
    expect(gates.VITE_SIYUANMEMO_ENABLE_PRIVATE_API).toBe(true);
    expect(gates.VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST).toBe(false);
    expect(BACKEND_FEATURE_GATE_MATRIX.length).toBeGreaterThan(0);
  });

  it('keeps every retained migration gate default-on for the release path', () => {
    const gates = resolveBackendFeatureGates({});

    expect(BACKEND_FEATURE_GATE_MATRIX.every((row) => row.defaultEnabled)).toBe(true);
    for (const row of BACKEND_FEATURE_GATE_MATRIX) {
      expect(gates[row.gate]).toBe(true);
    }
  });
});
