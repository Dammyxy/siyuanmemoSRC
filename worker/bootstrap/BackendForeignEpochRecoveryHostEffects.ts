import type { BackendRecoveryContentHash } from '../../packages/contracts/src/backend-rpc';
import type {
  WorkerForeignEpochAuthorityPublisher,
  WorkerForeignEpochRecoveryRuntimeOptions,
} from '../recovery/WorkerForeignEpochRecoveryRuntime';
import type { BackendWorkerHostEffect } from './BackendWorkerProtocol';

export const BACKEND_FOREIGN_EPOCH_RECOVERY_APPLY_METHOD = 'recovery.foreignEpoch.apply' as const;

export type BackendWorkerHostEffectRequester = <TResult>(
  effect: BackendWorkerHostEffect,
) => Promise<TResult>;

export function bindBackendWorkerHostEffectRequestMethod(
  effect: BackendWorkerHostEffect,
  diagnosticRequestMethod: string | null,
): BackendWorkerHostEffect {
  return {
    ...effect,
    requestMethod: effect.requestMethod ?? diagnosticRequestMethod,
  };
}

export function createBackendForeignEpochRecoveryHostEffects(
  requestHostEffect: BackendWorkerHostEffectRequester,
): {
  recoveryAuthority: WorkerForeignEpochRecoveryRuntimeOptions['recoveryAuthority'];
  authorityPublisher: WorkerForeignEpochAuthorityPublisher;
} {
  return {
    recoveryAuthority: {
      acquire: (input) => requestHostEffect<void>({
        kind: 'recovery.ensureActiveWriter',
        requestMethod: BACKEND_FOREIGN_EPOCH_RECOVERY_APPLY_METHOD,
        operationId: input.operationId,
        planHash: input.planHash,
        stage: input.stage,
      }),
    },
    authorityPublisher: {
      publish: (input) => requestHostEffect<{ authorityHash: BackendRecoveryContentHash }>({
        kind: 'identity.publishCertifiedAuthority',
        requestMethod: BACKEND_FOREIGN_EPOCH_RECOVERY_APPLY_METHOD,
        operationId: input.operationId,
        planHash: input.planHash,
        intent: input.intent,
      }),
    },
  };
}
