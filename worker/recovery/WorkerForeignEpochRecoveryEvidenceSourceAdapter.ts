import {
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  TRUTH_GENERATION_RECORD_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryPhaseReceipt,
  type StorageRecoveryState,
  type TruthGenerationRecord,
} from '../../packages/contracts/src/backend-rpc';
import type { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';
import type { WorkerVerifiedMutationFrontierRecord } from '../truth/WorkerVerifiedMutationFrontier';
import type { WorkerTruthPromotionState } from '../truth/WorkerTruthPromotionModule';
import type { WorkerForeignEpochRecoveryEvidenceSource } from './WorkerForeignEpochRecoveryEvidenceInventory';

export interface WorkerIdentityRecoveryEvidenceReaderResult {
  currentAuthority: unknown | null;
  previousAuthority: unknown | null;
  tempLocalIdentity: unknown | null;
  browserCacheObservations: unknown[];
}

export interface WorkerForeignEpochRecoveryEvidenceSourceAdapterOptions {
  database: Pick<
    WorkerSqliteDatabaseService,
    'readForeignEpochRecoveryJournalEvidence' | 'getStorageRecoveryState'
  >;
  truthFileStore: Pick<MessagePackTruthSegmentFileStore, 'readJSON' | 'listFiles'>;
  readIdentityEvidence(): Promise<WorkerIdentityRecoveryEvidenceReaderResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFrontier(value: unknown): value is WorkerVerifiedMutationFrontierRecord {
  return isRecord(value)
    && value.version === 1
    && typeof value.deviceId === 'string'
    && typeof value.activeIdentityEpoch === 'string'
    && (value.status === 'ready' || value.status === 'recovery-required');
}

function isPromotionState(value: unknown): value is WorkerTruthPromotionState {
  return isRecord(value)
    && value.version === 1
    && typeof value.deviceId === 'string'
    && typeof value.identityEpoch === 'string';
}

function isPhaseReceipt(value: unknown): value is BackendForeignEpochRecoveryPhaseReceipt {
  return isRecord(value)
    && value.version === FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION
    && typeof value.operationId === 'string'
    && typeof value.planHash === 'string'
    && typeof value.phase === 'string';
}

export class WorkerForeignEpochRecoveryEvidenceSourceAdapter implements WorkerForeignEpochRecoveryEvidenceSource {
  private identityEvidenceRun: Promise<WorkerIdentityRecoveryEvidenceReaderResult> | null = null;

  constructor(private readonly options: WorkerForeignEpochRecoveryEvidenceSourceAdapterOptions) {}

  async readCurrentAuthority(): Promise<unknown | null> {
    return structuredClone((await this.readIdentityEvidence()).currentAuthority);
  }

  async readPreviousAuthority(): Promise<unknown | null> {
    return structuredClone((await this.readIdentityEvidence()).previousAuthority);
  }

  async readTempLocalIdentity(): Promise<unknown | null> {
    return structuredClone((await this.readIdentityEvidence()).tempLocalIdentity);
  }

  async readBrowserCacheObservations(): Promise<unknown[]> {
    return structuredClone((await this.readIdentityEvidence()).browserCacheObservations);
  }

  readJournalEvidence() {
    return this.options.database.readForeignEpochRecoveryJournalEvidence();
  }

  readStorageRecoveryState(): Promise<StorageRecoveryState | null> {
    return Promise.resolve(this.options.database.getStorageRecoveryState());
  }

  async readFrontier(): Promise<WorkerVerifiedMutationFrontierRecord | null> {
    const records = await this.readJsonFiles(
      'truth/promotion/',
      (path) => path.endsWith('/frontier.v1.json'),
      isFrontier,
    );
    const foreignEpochRecords = records.filter(
      (record) => record.blockingCode === 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
    );
    const candidates = foreignEpochRecords.length > 0 ? foreignEpochRecords : records;
    if (candidates.length > 1) {
      throw new Error('RECOVERY_EVIDENCE_AMBIGUOUS: multiple verified mutation Frontiers');
    }
    return structuredClone(candidates[0] ?? null);
  }

  listPromotionStates(): Promise<WorkerTruthPromotionState[]> {
    return this.readJsonFiles(
      'truth/promotion/',
      (path) => path.endsWith('/state.v1.json'),
      isPromotionState,
    );
  }

  async listTruthGenerations(): Promise<TruthGenerationRecord[]> {
    const [paths, promotionStates] = await Promise.all([
      this.listPaths('truth/'),
      this.listPromotionStates(),
    ]);
    const manifests: Record<string, unknown>[] = [];
    for (const path of paths.filter((candidate) => candidate.endsWith('/manifest.v1.json')).sort()) {
      const value = await this.options.truthFileStore.readJSON<unknown>(path);
      if (isRecord(value) && typeof value.generationId === 'string' && typeof value.family === 'string') {
        manifests.push({ ...value, $path: path });
      }
    }
    const generations: TruthGenerationRecord[] = [];
    const orderedPromotions = promotionStates
      .filter((state) => state.coverage && String(state.coverage.truthGenerationId || '').trim())
      .sort((left, right) => (
        left.deviceId.localeCompare(right.deviceId)
        || left.identityEpoch.localeCompare(right.identityEpoch)
        || (left.coverage?.coveredJournalSequence ?? 0) - (right.coverage?.coveredJournalSequence ?? 0)
      ));
    for (const promotion of orderedPromotions) {
      const coverage = promotion.coverage!;
      const publicationManifests = manifests.filter(
        (manifest) => String(manifest.deviceId || '') === promotion.deviceId,
      );
      if (publicationManifests.length === 0) continue;
      const families = await Promise.all(publicationManifests.map(async (manifest) => ({
        family: String(manifest.family),
        manifestPath: String(manifest.$path),
        segmentPaths: Array.isArray(manifest.segments)
          ? manifest.segments.map((segment) => isRecord(segment) ? String(segment.path || '') : '').filter(Boolean)
          : [],
        checksum: await hashRecoveryContent(manifest),
      })));
      generations.push({
        version: TRUTH_GENERATION_RECORD_VERSION,
        generationId: coverage.truthGenerationId,
        previousGenerationId: null,
        deviceId: promotion.deviceId,
        identityEpoch: promotion.identityEpoch,
        status: 'published',
        families,
        createdAt: promotion.lastSuccessfulPromotionAt ?? coverage.updatedAt,
        verifiedAt: coverage.updatedAt,
        publishedAt: coverage.updatedAt,
      });
    }
    return generations.map((generation) => structuredClone(generation));
  }

  async listRecoveryReceipts(): Promise<BackendForeignEpochRecoveryPhaseReceipt[]> {
    const paths = (await this.listPaths('truth/recovery/foreign-epoch/'))
      .filter((path) => path.endsWith('/receipts.v1.json'));
    const receipts: BackendForeignEpochRecoveryPhaseReceipt[] = [];
    for (const path of paths.sort()) {
      const value = await this.options.truthFileStore.readJSON<unknown>(path);
      if (Array.isArray(value)) {
        receipts.push(...value.filter(isPhaseReceipt) as BackendForeignEpochRecoveryPhaseReceipt[]);
      }
    }
    return structuredClone(receipts);
  }

  private async readIdentityEvidence(): Promise<WorkerIdentityRecoveryEvidenceReaderResult> {
    if (!this.identityEvidenceRun) {
      const run = this.options.readIdentityEvidence();
      this.identityEvidenceRun = run;
      void run.finally(() => {
        if (this.identityEvidenceRun === run) this.identityEvidenceRun = null;
      });
    }
    return this.identityEvidenceRun;
  }

  private async listPaths(prefix: string): Promise<string[]> {
    if (!this.options.truthFileStore.listFiles) {
      throw new Error('BACKEND_UNAVAILABLE: recovery evidence requires truth file listing');
    }
    return Array.from(new Set(
      (await this.options.truthFileStore.listFiles(prefix)).map((path) => String(path).replace(/\\/g, '/')),
    ));
  }

  private async readJsonFiles<T>(
    prefix: string,
    include: (path: string) => boolean,
    guard: (value: unknown) => value is T,
  ): Promise<T[]> {
    const values: T[] = [];
    for (const path of (await this.listPaths(prefix)).filter(include).sort()) {
      const value = await this.options.truthFileStore.readJSON<unknown>(path);
      if (guard(value)) values.push(structuredClone(value));
    }
    return values;
  }
}
