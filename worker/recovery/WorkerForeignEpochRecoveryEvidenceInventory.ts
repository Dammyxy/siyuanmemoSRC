import type {
  BackendForeignEpochRecoveryPhaseReceipt,
  BackendRecoveryContentHash,
  StorageRecoveryState,
  TruthGenerationRecord,
} from '../../packages/contracts/src/backend-rpc';
import type {
  WorkerVerifiedMutationFrontierJournalEvidence,
  WorkerVerifiedMutationFrontierRecord,
} from '../truth/WorkerVerifiedMutationFrontier';
import type { WorkerTruthPromotionState } from '../truth/WorkerTruthPromotionModule';
import { hashRecoveryContent } from './ForeignEpochJournalContinuityInvariant';

export interface WorkerForeignEpochRecoveryEvidenceSource {
  readCurrentAuthority(): Promise<unknown | null>;
  readPreviousAuthority(): Promise<unknown | null>;
  readTempLocalIdentity(): Promise<unknown | null>;
  readFrontier(): Promise<WorkerVerifiedMutationFrontierRecord | null>;
  readJournalEvidence(): Promise<WorkerVerifiedMutationFrontierJournalEvidence>;
  listPromotionStates(): Promise<WorkerTruthPromotionState[]>;
  listTruthGenerations(): Promise<TruthGenerationRecord[]>;
  readStorageRecoveryState(): Promise<StorageRecoveryState | null>;
  listRecoveryReceipts(): Promise<BackendForeignEpochRecoveryPhaseReceipt[]>;
  readBrowserCacheObservations?(): Promise<unknown[]>;
}

export interface WorkerForeignEpochRecoveryEvidenceInventoryRecord {
  capturedAt: number;
  currentAuthority: unknown | null;
  previousAuthority: unknown | null;
  tempLocalIdentity: unknown | null;
  browserCacheObservations: unknown[];
  frontier: WorkerVerifiedMutationFrontierRecord | null;
  journal: WorkerVerifiedMutationFrontierJournalEvidence;
  promotionStates: WorkerTruthPromotionState[];
  truthGenerations: TruthGenerationRecord[];
  storageRecoveryState: StorageRecoveryState | null;
  recoveryReceipts: BackendForeignEpochRecoveryPhaseReceipt[];
  evidenceHash: BackendRecoveryContentHash;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorkerForeignEpochRecoveryEvidenceInventory {
  constructor(
    private readonly source: WorkerForeignEpochRecoveryEvidenceSource,
    private readonly now: () => number = Date.now,
  ) {}

  async read(): Promise<WorkerForeignEpochRecoveryEvidenceInventoryRecord> {
    const [
      currentAuthority,
      previousAuthority,
      tempLocalIdentity,
      browserCacheObservations,
      frontier,
      journal,
      promotionStates,
      truthGenerations,
      storageRecoveryState,
      recoveryReceipts,
    ] = await Promise.all([
      this.source.readCurrentAuthority(),
      this.source.readPreviousAuthority(),
      this.source.readTempLocalIdentity(),
      this.source.readBrowserCacheObservations?.() ?? Promise.resolve([]),
      this.source.readFrontier(),
      this.source.readJournalEvidence(),
      this.source.listPromotionStates(),
      this.source.listTruthGenerations(),
      this.source.readStorageRecoveryState(),
      this.source.listRecoveryReceipts(),
    ]);
    const evidence = {
      currentAuthority: clone(currentAuthority),
      previousAuthority: clone(previousAuthority),
      tempLocalIdentity: clone(tempLocalIdentity),
      browserCacheObservations: clone(browserCacheObservations),
      frontier: clone(frontier),
      journal: clone(journal),
      promotionStates: clone(promotionStates),
      truthGenerations: clone(truthGenerations),
      storageRecoveryState: clone(storageRecoveryState),
      recoveryReceipts: clone(recoveryReceipts),
    };
    return {
      capturedAt: this.now(),
      ...evidence,
      evidenceHash: await hashRecoveryContent(evidence),
    };
  }
}
