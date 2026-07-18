import { describe, expect, it } from 'vitest';
import {
  FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
  FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  type BackendForeignEpochRecoveryApplyResult,
  type BackendForeignEpochRecoveryAuthorityPlan,
  type BackendForeignEpochRecoveryStatusResult,
} from '../backend-rpc';

describe('foreign epoch recovery contracts', () => {
  it('keeps plan, operation, and receipt versions explicit', () => {
    expect(FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION).toBe(1);
    expect(FOREIGN_EPOCH_RECOVERY_PLAN_VERSION).toBe(1);
    expect(FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION).toBe(1);
  });

  it('uses staged terminal states that require restart after publication', () => {
    const apply = {
      version: 1,
      operationId: 'operation-redacted',
      stage: 'authority-publication',
      status: 'authority-published-restart-required',
      completedPhase: 'installation-authority-published',
      restartRequired: true,
      blockers: [],
    } satisfies BackendForeignEpochRecoveryApplyResult;
    const status = {
      version: 1,
      operationId: apply.operationId,
      stage: apply.stage,
      state: 'restart-required',
      latestPhase: apply.completedPhase,
      planHash: `sha256:${'a'.repeat(64)}`,
      receipts: [],
      blockers: [],
    } satisfies BackendForeignEpochRecoveryStatusResult;

    expect(apply.restartRequired).toBe(true);
    expect(status.state).toBe('restart-required');
  });

  it('requires an authority plan to carry a certified publication intent and no continuity intent', () => {
    const plan = {
      version: 1,
      operationId: 'operation-redacted',
      stage: 'authority-publication',
      planHash: `sha256:${'a'.repeat(64)}`,
      evidenceHash: `sha256:${'b'.repeat(64)}`,
      backupScopeHash: `sha256:${'c'.repeat(64)}`,
      createdAt: 1,
      blockers: [],
      authorityPublicationIntent: {
        version: 1,
        intentHash: `sha256:${'d'.repeat(64)}`,
        expectedAuthorityStateHash: `sha256:${'e'.repeat(64)}`,
        authority: {
          version: 1,
          revision: 1,
          identity: {
            version: 2,
            deviceId: 'device-redacted',
            identityEpoch: 'epoch-redacted',
            hostFingerprint: null,
            createdAt: 1,
            lastSeenAt: 1,
          },
          previousRevision: null,
          publishedAt: 1,
        },
        proof: {
          identity: {
            deviceIdHash: `sha256:${'f'.repeat(64)}`,
            identityEpoch: 'epoch-redacted',
          },
          provingEvidence: [],
          corroboratingEvidence: [],
          contradictingEvidence: [],
        },
      },
      continuityIntent: null,
    } satisfies BackendForeignEpochRecoveryAuthorityPlan;

    expect(plan.authorityPublicationIntent.authority.revision).toBe(1);
    expect(plan.continuityIntent).toBeNull();
  });
});
