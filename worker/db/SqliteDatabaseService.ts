import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SchedulerRouter } from '@/core/scheduler';
import { createReviewLogV2 } from '@/types/review';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type {
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  SourceExistenceRefreshCandidate,
  SourceExistenceRefreshRequest,
  SourceExistenceSummary,
  SourceExistenceUpdate,
} from '@/application/ports/BrowserDeckReadPort';
import type { SqlitePersistenceBridge } from './SqlitePersistenceBridge';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';

type SqlParams = SqlValue[] | ParamsObject;

type SqliteFileServiceAdapter = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
};

function createSqliteFileServiceAdapter(bridge: SqlitePersistenceBridge): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(fileName: string): Promise<T | null> => {
      if (!bridge.readJSON) {
        return null;
      }
      return bridge.readJSON<T>(fileName);
    },
    writeJSON: async (fileName: string, data: unknown): Promise<void> => {
      if (!bridge.writeJSON) {
        throw new Error(`JSON persistence is not available for ${fileName}`);
      }
      await bridge.writeJSON(fileName, data);
    },
    readBinary: (fileName: string) => bridge.readBinary(fileName),
    writeBinary: (fileName: string, bytes: Uint8Array) => bridge.writeBinary(fileName, bytes),
  };
}

export class WorkerSqliteDatabaseService {
  private readonly runtime: RuntimeSqliteDatabaseService;
  private repository: SqlUnifiedStorageRepository | null = null;
  private initialized = false;

  constructor(
    bridge: SqlitePersistenceBridge,
    private readonly dbFile = SQLITE_DB_FILE,
  ) {
    this.runtime = new RuntimeSqliteDatabaseService(createSqliteFileServiceAdapter(bridge), dbFile);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.runtime.init();
    this.repository = new SqlUnifiedStorageRepository(this.runtime);
    this.initialized = true;
  }

  async load(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    await this.init();
    return {
      ok: true,
      initialized: true,
      dbFile: this.dbFile,
    };
  }

  async persist(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    await this.init();
    await this.runtime.persist();
    return {
      ok: true,
      persisted: true,
      dbFile: this.dbFile,
    };
  }

  getStatus(): { initialized: boolean; dbFile: string } {
    return {
      initialized: this.initialized,
      dbFile: this.dbFile,
    };
  }

  async queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckCardPageResult | null> {
    await this.init();
    return this.repository!.queryDeckPage(query, page);
  }

  async queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[] | null> {
    await this.init();
    return this.repository!.queryDeckMatchedIds(query);
  }

  async getDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.getDeckCardsByIds(ids);
  }

  async getCard(cardId: string): Promise<FSRSCard | undefined> {
    await this.init();
    return this.repository!.getCard(cardId);
  }

  async upsertCards(cards: FSRSCard[]): Promise<void> {
    await this.init();
    this.repository!.upsertCards(cards);
  }

  async countCards(query?: StructuredCardQuery): Promise<number> {
    await this.init();
    return this.repository!.countCards(query);
  }

  async getBrowserStats(now?: number): Promise<BrowserStats> {
    await this.init();
    return this.repository!.getBrowserStats(now);
  }

  async getSourceExistenceRefreshCandidates(
    request?: SourceExistenceRefreshRequest,
  ): Promise<SourceExistenceRefreshCandidate[]> {
    await this.init();
    return this.repository!.getSourceExistenceRefreshCandidates(request);
  }

  async updateSourceExistence(
    updates: SourceExistenceUpdate[],
    checkedAt?: number,
  ): Promise<void> {
    await this.init();
    await this.repository!.updateSourceExistence(updates, checkedAt);
  }

  async getSourceExistenceByBlockIds(
    blockIds: string[],
  ): Promise<Array<{ blockId: string; exists: boolean | null }>> {
    await this.init();
    const statusByBlockId = this.repository!.getSourceExistenceByBlockIds(blockIds);
    return Array.from(statusByBlockId.entries())
      .map(([blockId, exists]) => ({ blockId, exists }));
  }

  async getSourceExistenceSummary(staleBefore?: number): Promise<SourceExistenceSummary> {
    await this.init();
    return this.repository!.getSourceExistenceSummary(staleBefore);
  }

  async applySourceExistenceSweep(
    request: SourceExistenceRefreshRequest = {},
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean }> {
    await this.init();

    const candidates = this.repository!.getSourceExistenceRefreshCandidates(request);
    return this.applySourceExistenceSweepFromCandidates(candidates, existingBlockIds, checkedAt);
  }

  async applySourceExistenceSweepFromCandidates(
    candidates: SourceExistenceRefreshCandidate[],
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean }> {
    await this.init();

    if (candidates.length === 0) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false };
    }

    const existingSet = new Set(
      existingBlockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    );

    let changed = false;
    let changedToMissing = false;
    const updates: SourceExistenceUpdate[] = [];
    for (const candidate of candidates) {
      const exists = existingSet.has(candidate.blockId);
      if (candidate.sourceExists !== exists) {
        changed = true;
        if (!exists) {
          changedToMissing = true;
        }
      }
      updates.push({
        cardId: candidate.cardId,
        blockId: candidate.blockId,
        exists,
      });
    }

    await this.repository!.updateSourceExistence(updates, checkedAt);

    return {
      checked: candidates.length,
      updated: updates.length,
      changed,
      changedToMissing,
    };
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    await this.init();
    const queueType = String(request.queueType || 'retrieval-practice').trim() || 'retrieval-practice';
    const reviewedAt = Number(request.reviewedAt || Date.now());
    const rating = Math.max(1, Math.min(4, Math.floor(Number(request.rating) || 0))) as 1 | 2 | 3 | 4;
    const cardId = String(request.cardId || '').trim();
    if (!cardId) {
      throw new Error('review.feedback requires cardId');
    }
    if (queueType !== 'retrieval-practice') {
      throw new Error(`SrsBackendWorker review.feedback unavailable for queueType in current phase: ${queueType}`);
    }

    return this.runtime.runTransaction('review.feedback', async () => {
      const card = this.repository!.getCard(cardId);
      if (!card) {
        throw new Error(`review.feedback card not found: ${cardId}`);
      }

      const scheduler = new SchedulerRouter(
        {
          defaultScheduler: 'fsrs-v6',
          fsrsParams: DEFAULT_SETTINGS.fsrs,
        },
        {
          batchUpdateCardsWithoutEvents: async (cards) => {
            this.repository!.upsertCards(
              cards.map((c) => canonicalizeSchedulingState(c, {
                source: 'review-commit',
                mode: 'assert-internal',
              }).card),
            );
          },
          addReviewLogV2: async () => undefined,
        },
      );

      const decision = scheduler.answer(card, rating, {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        source: 'queue',
        sessionId: request.sessionId,
        reviewTime: reviewedAt,
      });
      const commitResult = await scheduler.commit(decision);
      if (commitResult.committed && commitResult.updatedCard) {
        const log = createReviewLogV2({
          attemptId: decision.attempt.id,
          cardId: decision.attempt.cardId,
          rating: decision.attempt.rating,
          reviewedAt: decision.attempt.reviewedAt,
          before: decision.before,
          after: commitResult.updatedCard,
          elapsedMs: decision.attempt.elapsedMs,
          queueType: decision.attempt.queueType,
          queueMode: decision.queueMode,
          source: decision.attempt.source,
          algorithm: decision.algorithm,
          schedulerType: decision.schedulerType,
          commitPolicy: decision.commitPolicy,
          isDrill: decision.attempt.isDrill,
          isFiltered: decision.attempt.isFiltered,
          customStudy: decision.attempt.customStudy,
        });
        const month = new Date(log.reviewedAt);
        this.runtime.run(
          `INSERT OR REPLACE INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.cardId,
            log.attemptId,
            log.rating,
            log.reviewedAt,
            month.getFullYear(),
            month.getMonth() + 1,
            'review-v2',
            JSON.stringify(log),
          ],
        );
      }

      return {
        cardId,
        committed: commitResult.committed,
        reviewedAt,
        queueType: 'retrieval-practice',
        updatedCard: commitResult.updatedCard ?? null,
      };
    });
  }

  async runTransaction<T>(
    label: string,
    writer: (db: Database) => T | Promise<T>,
  ): Promise<T> {
    await this.init();
    return this.runtime.runTransaction(label, writer);
  }

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    return this.runtime.getOne<T>(sql, params);
  }

  dispose(): void {
    this.runtime.dispose();
    this.repository = null;
    this.initialized = false;
  }
}
