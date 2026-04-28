import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import { createStableId, stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

type ReviewEventType = 'review' | 'review-v2';

function monthParts(timestamp: number): { year: number; month: number } {
  const date = new Date(Number(timestamp) || Date.now());
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

export class SqlReviewLogRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  addReviewLog(log: ReviewLog): void {
    this.upsertReviewEvent('review', log.id, log.cardId, null, log.rating, log.review, log);
  }

  addReviewLogV2(log: ReviewLogV2): void {
    this.upsertReviewEvent('review-v2', log.id, log.cardId, log.attemptId, log.rating, log.reviewedAt, log);
  }

  addDrillLogV2(log: DrillLogV2): void {
    const { year, month } = monthParts(log.reviewedAt);
    this.database.run(
      `INSERT OR REPLACE INTO drill_events
        (id, card_id, rating, reviewed_at, year, month, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [log.id, log.cardId, log.rating, log.reviewedAt, year, month, stringifyJson(log)],
    );
  }

  addRescheduleLog(log: RescheduleLog): void {
    const { year, month } = monthParts(log.ts);
    const id = createStableId('reschedule', [log.ts, log.action, log.source, log.targets?.join(',')]);
    this.database.run(
      `INSERT OR REPLACE INTO reschedule_events
        (id, action, source, occurred_at, year, month, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, log.action, log.source, log.ts, year, month, stringifyJson(log)],
    );
  }

  getReviewLogs(year: number, month: number): ReviewLog[] {
    return this.listReviewEvents<ReviewLog>('review', year, month);
  }

  getReviewLogsV2(year: number, month: number): ReviewLogV2[] {
    return this.listReviewEvents<ReviewLogV2>('review-v2', year, month);
  }

  getDrillLogsV2(year: number, month: number): DrillLogV2[] {
    const rows = this.database.getAll<{ payload_json: string }>(
      'SELECT payload_json FROM drill_events WHERE year = ? AND month = ? ORDER BY reviewed_at ASC',
      [year, month],
    );
    return rows.map((row) => parseJson<DrillLogV2>(row.payload_json, null as unknown as DrillLogV2)).filter(Boolean);
  }

  getAllReviewLogs(): ReviewLog[] {
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM review_events
       WHERE event_type = 'review'
       ORDER BY reviewed_at ASC`,
    );
    return rows.map((row) => parseJson<ReviewLog>(row.payload_json, null as unknown as ReviewLog)).filter(Boolean);
  }

  importMonthlyLogs(input: {
    reviewLogs?: ReviewLog[];
    reviewLogsV2?: ReviewLogV2[];
    drillLogsV2?: DrillLogV2[];
    rescheduleLogs?: RescheduleLog[];
  }): void {
    for (const log of input.reviewLogs || []) {
      this.addReviewLog(log);
    }
    for (const log of input.reviewLogsV2 || []) {
      this.addReviewLogV2(log);
    }
    for (const log of input.drillLogsV2 || []) {
      this.addDrillLogV2(log);
    }
    for (const log of input.rescheduleLogs || []) {
      this.addRescheduleLog(log);
    }
  }

  async persist(): Promise<void> {
    await this.database.persist();
  }

  private upsertReviewEvent(
    type: ReviewEventType,
    id: string,
    cardId: string,
    attemptId: string | null,
    rating: number,
    reviewedAt: number,
    payload: unknown,
  ): void {
    const { year, month } = monthParts(reviewedAt);
    this.database.run(
      `INSERT OR REPLACE INTO review_events
        (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cardId, attemptId, rating, reviewedAt, year, month, type, stringifyJson(payload)],
    );
  }

  private listReviewEvents<T>(type: ReviewEventType, year: number, month: number): T[] {
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM review_events
       WHERE event_type = ? AND year = ? AND month = ?
       ORDER BY reviewed_at ASC`,
      [type, year, month],
    );
    return rows.map((row) => parseJson<T>(row.payload_json, null as unknown as T)).filter(Boolean);
  }
}
