import type { TruthDeviceIdentityCachePort, TruthDeviceIdentityInitializationFencePort } from '@/application/ports/TruthDeviceIdentityPort';
import type { TruthDeviceIdentityAuthorityPort } from '@/application/ports/TruthDeviceIdentityPort';
import {
  hashRecoveryContent,
  type BackendForeignEpochRecoveryAuthorityPublicationIntent,
  type BackendRecoveryContentHash,
} from '../../../packages/contracts/src/backend-rpc';

export interface ForeignEpochIdentityRecoveryEvidence {
  currentAuthority: unknown | null;
  previousAuthority: unknown | null;
  tempLocalIdentity: unknown | null;
  browserCacheObservations: unknown[];
}

export interface ForeignEpochAuthorityPublicationCoordinatorOptions {
  authority: TruthDeviceIdentityAuthorityPort;
  caches: TruthDeviceIdentityCachePort[];
  initializationFence: TruthDeviceIdentityInitializationFencePort;
  ensureActiveWriter(): Promise<void>;
}

export class ForeignEpochAuthorityPublicationCoordinator {
  constructor(private readonly options: ForeignEpochAuthorityPublicationCoordinatorOptions) {}

  async readEvidence(): Promise<ForeignEpochIdentityRecoveryEvidence> {
    const [currentAuthority, previousAuthority, cacheReads] = await Promise.all([
      this.options.authority.readAuthority(),
      this.options.authority.readPreviousAuthority(),
      Promise.all(this.options.caches.map(async (cache) => ({
        kind: cache.kind,
        ...await this.readCacheEvidence(cache),
      }))),
    ]);
    const tempLocalIdentity = cacheReads.find((entry) => entry.kind === 'temp-local')?.value ?? null;
    return {
      currentAuthority,
      previousAuthority,
      tempLocalIdentity,
      browserCacheObservations: cacheReads
        .filter((entry) => entry.kind === 'indexeddb' || entry.kind === 'local-storage')
        .map((entry) => entry.value)
        .filter((value) => value != null),
    };
  }

  private async readCacheEvidence(cache: TruthDeviceIdentityCachePort): Promise<{ value: unknown }> {
    try {
      return { value: await cache.readCache() };
    } catch (error) {
      return {
        value: {
          status: 'unavailable',
          cacheKind: cache.kind,
          errorHash: await hashRecoveryContent(error instanceof Error ? error.message : String(error)),
        },
      };
    }
  }

  async publishCertifiedIntent(input: {
    requestMethod: string | null | undefined;
    operationId: string;
    planHash: BackendRecoveryContentHash;
    intent: BackendForeignEpochRecoveryAuthorityPublicationIntent;
  }): Promise<{ authorityHash: BackendRecoveryContentHash }> {
    this.assertApplyOperation(input);
    const { intentHash, ...intentMaterial } = input.intent;
    if (await hashRecoveryContent(intentMaterial) !== intentHash) {
      throw new Error('RECOVERY_AUTHORITY_PUBLICATION_INVALID: intent hash mismatch');
    }
    await this.options.ensureActiveWriter();
    return this.options.initializationFence.runExclusive(async () => {
      const [currentAuthority, previousAuthority] = await Promise.all([
        this.options.authority.readAuthority(),
        this.options.authority.readPreviousAuthority(),
      ]);
      const currentStateHash = await hashRecoveryContent({ currentAuthority, previousAuthority });
      if (currentStateHash !== input.intent.expectedAuthorityStateHash) {
        throw new Error('RECOVERY_AUTHORITY_PUBLICATION_STALE: authority state changed after preview');
      }
      await this.options.authority.publishAuthority(input.intent.authority);
      const persisted = await this.options.authority.readAuthority();
      const [authorityHash, expectedHash] = await Promise.all([
        hashRecoveryContent(persisted),
        hashRecoveryContent(input.intent.authority),
      ]);
      if (authorityHash !== expectedHash) {
        throw new Error('RECOVERY_AUTHORITY_VERIFICATION_FAILED: exact authority read-back mismatch');
      }
      return { authorityHash };
    });
  }

  async ensureRecoveryActiveWriter(input: {
    requestMethod: string | null | undefined;
    operationId: string;
    planHash: BackendRecoveryContentHash;
    stage: 'authority-publication' | 'continuity';
  }): Promise<void> {
    this.assertApplyOperation(input);
    await this.options.ensureActiveWriter();
  }

  private assertApplyOperation(input: {
    requestMethod: string | null | undefined;
    operationId: string;
    planHash: BackendRecoveryContentHash;
  }): void {
    if (input.requestMethod !== 'recovery.foreignEpoch.apply') {
      throw new Error('RECOVERY_AUTHORITY_PUBLICATION_FORBIDDEN: certified intent is apply-only');
    }
    if (!String(input.operationId || '').trim() || !/^sha256:[a-f0-9]{64}$/.test(input.planHash)) {
      throw new Error('RECOVERY_AUTHORITY_PUBLICATION_INVALID: operation identity is invalid');
    }
  }
}
