import type { StorageLoadReason, UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { ArenaStoreData } from '@/types/arena';
import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import { createLogger } from '@/utils/logger';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import type {
  AlgorithmCardStateBackfillSummary,
  SqlUnifiedStorageRepository,
} from './SqlUnifiedStorageRepository';
import type { SqlQueueStateRepository } from './SqlQueueStateRepository';
import type { SqlReviewLogRepository } from './SqlReviewLogRepository';
import type { SqlArenaRepository } from './SqlArenaRepository';
import { NATIVE_RIFF_IMPORT_EXCLUSION_KIND } from './SqlNativeRiffImportExclusionRepository';
import { parseJson, stringifyJson } from './json';

const logger = createLogger('SqliteMigrationService');
const INITIAL_MIGRATION_ID = 'initial-msgpack-json-import-v1';
const NATIVE_RIFF_PERSISTENCE_RETIREMENT_MIGRATION_ID = 'native-riff-persistence-retirement-v1';
const ALGORITHM_CARD_STATE_MIGRATION_ID = 'algorithm-card-state-production-v1';
const ALGORITHM_CARD_STATE_UNRESOLVED_REPAIR_ID = 'algorithm-card-state-production-repair-unresolved-v1';

type LegacyUnifiedCardStore = UnifiedCardStore & {
  riffBlacklist?: unknown;
};

type LegacyStoreLoader = (reason?: StorageLoadReason) => Promise<LegacyUnifiedCardStore>;

interface MonthlyReviewLogs {
  reviewLogs?: ReviewLog[];
  reviewLogsV2?: ReviewLogV2[];
  drillLogsV2?: DrillLogV2[];
  rescheduleLogs?: RescheduleLog[];
}

function hasStoreContent(store: LegacyUnifiedCardStore): boolean {
  return Object.keys(store.cards || {}).length > 0
    || Object.keys(store.cardDTOs || {}).length > 0
    || Object.keys(store.xiuyuans || {}).length > 0
    || Object.keys(store.deletedCardDTOs || {}).length > 0
    || Object.keys(store.deletedXiuyuans || {}).length > 0
    || (Array.isArray(store.riffBlacklist) && store.riffBlacklist.length > 0);
}

export class SqliteMigrationService {
  constructor(
    private readonly database: SqliteDatabaseService,
    private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON' | 'readMsgpack'>,
    private readonly repositories: {
      unified: SqlUnifiedStorageRepository;
      queue: SqlQueueStateRepository;
      reviewLogs: SqlReviewLogRepository;
      arena: SqlArenaRepository;
    },
    private readonly legacyStoreLoader: LegacyStoreLoader,
  ) {}

  async migrateIfNeeded(now = Date.now()): Promise<{ migrated: boolean; usedSql: boolean }> {
    let migrated = false;
    let importedLegacyBlacklist: unknown = null;
    if (!this.database.hasMigration(INITIAL_MIGRATION_ID)) {
      const legacyStore = await this.legacyStoreLoader('startup-load');
      importedLegacyBlacklist = legacyStore.riffBlacklist;
      if (hasStoreContent(legacyStore)) {
        await this.fileService.writeJSON(`migration-backups/unified-cards-${now}.json`, legacyStore);
      }
      await this.database.runTransaction('sqlite.initial-migration', async () => {
        await this.repositories.unified.saveStore(legacyStore);
        await this.migrateQueueState();
        await this.migrateArenaStore();
        await this.migrateReviewLogs(now);
        this.database.markMigration(INITIAL_MIGRATION_ID, now);
      });
      logger.info('SQLite migration finished', {
        cards: Object.keys(legacyStore.cards || {}).length,
        xiuyuans: Object.keys(legacyStore.xiuyuans || {}).length,
      });
      migrated = true;
    }

    const nativeRiffRetirement = await this.migrateNativeRiffPersistenceIfNeeded(
      now,
      importedLegacyBlacklist,
    );
    migrated ||= nativeRiffRetirement.migrated;

    const stateMigration = await this.migrateAlgorithmCardStateIfNeeded(now);
    migrated ||= stateMigration.migrated;
    return { migrated, usedSql: true };
  }

  private async migrateNativeRiffPersistenceIfNeeded(
    now: number,
    importedLegacyBlacklist: unknown,
  ): Promise<{ migrated: boolean }> {
    if (this.database.hasMigration(NATIVE_RIFF_PERSISTENCE_RETIREMENT_MIGRATION_ID)) {
      return { migrated: false };
    }

    await this.database.runTransaction('sqlite.native-riff-persistence-retirement', () => {
      const legacyBlockIds = new Set(normalizeLegacyRiffBlacklist(importedLegacyBlacklist));
      if (this.hasLegacyRiffSyncTable()) {
        const row = this.database.getOne<{ value_json: string }>(
          'SELECT value_json FROM riff_sync WHERE key = ?',
          ['blacklist'],
        );
        for (const blockId of normalizeLegacyRiffBlacklist(
          parseJson<unknown>(row?.value_json, []),
        )) {
          legacyBlockIds.add(blockId);
        }
      }

      for (const blockId of Array.from(legacyBlockIds).sort()) {
        const exclusion = {
          version: 1,
          blockId,
          excludedAt: now,
          source: 'legacy-blacklist',
          reason: 'migrated-riff-blacklist',
        } as const;
        this.database.run(
          `INSERT OR IGNORE INTO tombstones (
            kind,
            id,
            deleted_at,
            deleted_by,
            payload_json
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            NATIVE_RIFF_IMPORT_EXCLUSION_KIND,
            blockId,
            now,
            exclusion.source,
            stringifyJson(exclusion),
          ],
        );
      }

      this.database.run('DROP TABLE IF EXISTS riff_sync');
      this.database.markMigration(NATIVE_RIFF_PERSISTENCE_RETIREMENT_MIGRATION_ID, now);
    });

    return { migrated: true };
  }

  private hasLegacyRiffSyncTable(): boolean {
    return Boolean(this.database.getOne<{ present: number }>(
      `SELECT 1 AS present
       FROM sqlite_master
       WHERE type = 'table' AND name = 'riff_sync'`,
    ));
  }

  private async migrateAlgorithmCardStateIfNeeded(now: number): Promise<{ migrated: boolean }> {
    if (this.database.hasMigration(ALGORITHM_CARD_STATE_MIGRATION_ID)) {
      const diagnostic = this.repositories.unified.getAlgorithmCardStateDiagnostic();
      if (diagnostic.dirty > 0 || diagnostic.orphanStateRows > 0) {
        if (this.database.hasMigration(ALGORITHM_CARD_STATE_UNRESOLVED_REPAIR_ID)) {
          logger.warn('SQLite algorithm card state repair skipped after unresolved prior attempt', diagnostic);
          return { migrated: false };
        }

        await this.writeAlgorithmCardStateBackup(`migration-backups/algorithm-card-state-repair-${now}.json`, now);
        let summary: AlgorithmCardStateBackfillSummary | null = null;
        await this.database.runTransaction('sqlite.algorithm-card-state-production-repair', () => {
          const repairSummary = this.repositories.unified.backfillAlgorithmCardStates(now);
          summary = repairSummary;
          if (repairSummary.afterDirty > 0 || repairSummary.orphanStateRows > 0) {
            this.database.markMigration(ALGORITHM_CARD_STATE_UNRESOLVED_REPAIR_ID, now);
          }
        });
        if (!summary) {
          throw new Error('Algorithm card state repair did not produce a summary');
        }
        if (summary.afterDirty > 0 || summary.orphanStateRows > 0) {
          logger.warn('SQLite algorithm card state repair finished with dirty rows', summary);
        } else {
          logger.info('SQLite algorithm card state repair finished', summary);
        }
        return { migrated: true };
      }
      return { migrated: false };
    }

    await this.writeAlgorithmCardStateBackup(`migration-backups/algorithm-card-state-${now}.json`, now);

    let summary: AlgorithmCardStateBackfillSummary | null = null;
    await this.database.runTransaction('sqlite.algorithm-card-state-production-v1', () => {
      summary = this.repositories.unified.backfillAlgorithmCardStates(now);
      this.database.markMigration(ALGORITHM_CARD_STATE_MIGRATION_ID, now);
    });

    if (!summary) {
      throw new Error('Algorithm card state migration did not produce a summary');
    }
    if (summary.afterDirty > 0 || summary.orphanStateRows > 0) {
      logger.warn('SQLite algorithm card state migration finished with dirty rows', summary);
    } else {
      logger.info('SQLite algorithm card state migration finished', summary);
    }
    return { migrated: true };
  }

  private async writeAlgorithmCardStateBackup(fileName: string, now: number): Promise<void> {
    const backup = this.repositories.unified.createAlgorithmCardStateMigrationBackup();
    if (backup.cards.length === 0 && backup.algorithmCardStates.length === 0) {
      return;
    }
    await this.fileService.writeJSON(fileName, {
      capturedAt: now,
      ...backup,
    });
  }

  private async migrateQueueState(): Promise<void> {
    const queueState = await this.fileService.readMsgpack<Record<string, unknown>>('queues.msgpack');
    if (!queueState || Object.keys(queueState).length === 0) {
      return;
    }
    await this.database.write(() => {
      this.repositories.queue.replaceAll(queueState);
    }, { persist: false, label: 'sqlite.migrate-queue-state' });
  }

  private async migrateArenaStore(): Promise<void> {
    const store = await this.fileService.readJSON<ArenaStoreData>('arena/store.json');
    if (!store) {
      return;
    }
    await this.database.write(() => {
      this.repositories.arena.importStore(store);
    }, { persist: false, label: 'sqlite.migrate-arena-store' });
  }

  private async migrateReviewLogs(now: number): Promise<void> {
    const currentYear = new Date(now).getFullYear();
    for (let year = currentYear - 10; year <= currentYear + 1; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const monthString = month.toString().padStart(2, '0');
        const data = await this.fileService.readJSON<MonthlyReviewLogs>(`review-logs/${year}-${monthString}.json`);
        if (!data) {
          continue;
        }
        await this.database.write(() => {
          this.repositories.reviewLogs.importMonthlyLogs(data);
        }, { persist: false, label: 'sqlite.migrate-review-logs' });
      }
    }
  }
}

function normalizeLegacyRiffBlacklist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}
