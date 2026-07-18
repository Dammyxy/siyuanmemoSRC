import { describe, expect, it, vi } from 'vitest';
import type {
  BackendForeignEpochRecoveryAuthorityPublicationIntent,
  BackendRecoveryContentHash,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendWorkerHostEffect } from '../BackendWorkerProtocol';
import {
  bindBackendWorkerHostEffectRequestMethod,
  createBackendForeignEpochRecoveryHostEffects,
} from '../BackendForeignEpochRecoveryHostEffects';

const planHash = `sha256:${'a'.repeat(64)}` as BackendRecoveryContentHash;

describe('BackendForeignEpochRecoveryHostEffects', () => {
  it('keeps trusted apply attribution across asynchronous recovery host effects', async () => {
    const observed: BackendWorkerHostEffect[] = [];
    const requestHostEffect = vi.fn(async <T>(effect: BackendWorkerHostEffect): Promise<T> => {
      await Promise.resolve();
      observed.push(bindBackendWorkerHostEffectRequestMethod(effect, null));
      if (effect.kind === 'identity.publishCertifiedAuthority') {
        return { authorityHash: planHash } as T;
      }
      return undefined as T;
    });
    const ports = createBackendForeignEpochRecoveryHostEffects(requestHostEffect);

    await ports.recoveryAuthority.acquire({
      operationId: 'operation-a',
      planHash,
      stage: 'authority-publication',
    });
    await ports.authorityPublisher.publish({
      operationId: 'operation-a',
      planHash,
      intent: {} as BackendForeignEpochRecoveryAuthorityPublicationIntent,
    });

    expect(observed).toEqual([
      expect.objectContaining({
        kind: 'recovery.ensureActiveWriter',
        requestMethod: 'recovery.foreignEpoch.apply',
      }),
      expect.objectContaining({
        kind: 'identity.publishCertifiedAuthority',
        requestMethod: 'recovery.foreignEpoch.apply',
      }),
    ]);
  });

  it('does not let unrelated diagnostic timing replace trusted recovery attribution', () => {
    const effect = {
      kind: 'recovery.ensureActiveWriter',
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-a',
      planHash,
      stage: 'continuity',
    } as const;

    expect(bindBackendWorkerHostEffectRequestMethod(effect, 'review.feedback')).toMatchObject({
      requestMethod: 'recovery.foreignEpoch.apply',
    });
  });
});
