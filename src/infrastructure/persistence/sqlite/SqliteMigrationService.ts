import type { StorageLoadReason, UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { ArenaStoreData } from '@/types/arena';
import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import { createLogger } from '@/utils/logger';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import type { SqlUnifiedStorageRepository } from './SqlUnifiedStorageRepository';
import type { SqlQueueStateRepository } from './SqlQueueStateRepository';
import type { SqlReviewLogRepository } from './SqlReviewLogRepository';
import type { SqlArenaRepository } from './SqlArenaRepository';

const logger = createLogger('SqliteMigrationService');
const INITIAL_MIGRATION_ID = 'initial-msgpack-json-import-v1';

type LegacyStoreLoader = (reason?: StorageLoadReason) => Promise<UnifiedCardStore>;

interface MonthlyReviewLogs {
  reviewLogs?: ReviewLog[];
  reviewLogsV2?: ReviewLogV2[];
  drillLogsV2?: DrillLogV2[];
  rescheduleLogs?: RescheduleLog[];
}

function hasStoreContent(store: UnifiedCardStore): boolean {
  return Object.keys(store.cards || {}).length > 0
    || Object.keys(store.cardDTOs || {}).length > 0
    || Object.keys(store.xiuyuans || {}).length > 0
    || Object.keys(store.deletedCardDTOs || {}).length > 0
    || Object.keys(store.deletedXiuyuans || {}).length > 0
    || (store.riffBlacklist || []).length > 0;
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
    if (this.database.hasMigration(INITIAL_MIGRATION_ID)) {
      return { migrated: false, usedSql: true };
    }

    const legacyStore = await this.legacyStoreLoader('startup-load');
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
    return { migrated: true, usedSql: true };
  }

  private async migrateQueueState(): Promise<void> {
    const queueState = await this.fileService.readMsgpack<Record<string, unknown>>('queues.msgpack');
    if (!queueState || Object.keys(queueState).length === 0) {
      return;
    }
    await this.database.write(() => {
      this.repositories.queue.replaceAll(queueState);
    }, { persist: false });
  }

  private async migrateArenaStore(): Promise<void> {
    const store = await this.fileService.readJSON<ArenaStoreData>('arena/store.json');
    if (!store) {
      return;
    }
    await this.database.write(() => {
      this.repositories.arena.importStore(store);
    }, { persist: false });
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
        }, { persist: false });
      }
    }
  }
}
