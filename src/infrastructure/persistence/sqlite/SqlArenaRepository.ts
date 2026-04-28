import type {
  ArenaCardAttributionRecord,
  ArenaDomain,
  ArenaMatchRecord,
  ArenaScoreSnapshot,
  ArenaStoreData,
  SrsArenaContestantPrediction,
} from '@/types/arena';
import { DEFAULT_ARENA_STORE_DATA } from '@/types/arena';
import { createStableId, stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLimit(value: unknown, fallback = 50): number {
  return Math.max(1, Math.floor(Number(value) || fallback));
}

function rowToMatch(row: { payload_json: string }): ArenaMatchRecord | null {
  const parsed = parseJson<ArenaMatchRecord | null>(row.payload_json, null);
  return parsed?.id && parsed?.domain && parsed?.poolKey ? parsed : null;
}

export class SqlArenaRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  readStore(): ArenaStoreData {
    return {
      ...DEFAULT_ARENA_STORE_DATA,
      matches: this.listMatches({ limit: 800 }),
      scores: this.listScoreSnapshots(),
      attributions: this.listAttributions({ limit: 2400 }),
    };
  }

  listMatches(filters?: {
    domain?: ArenaDomain;
    poolKey?: string | null;
    limit?: number;
  }): ArenaMatchRecord[] {
    const domain = filters?.domain || null;
    const poolKey = filters?.poolKey || null;
    const limit = normalizeLimit(filters?.limit);
    const srsLimit = domain === 'ai' ? 0 : limit * 10;
    const srsRows = this.database.getAll<{ payload_json: string; created_at: number }>(
      `SELECT payload_json, reviewed_at AS created_at FROM arena_outcomes
       WHERE (? IS NULL OR domain = ?)
       ORDER BY reviewed_at DESC
       LIMIT ?`,
      [domain, domain, srsLimit],
    );
    const aiRows = this.database.getAll<{ payload_json: string; created_at: number }>(
      `SELECT payload_json, created_at FROM ai_arena_events
       WHERE (? IS NULL OR 'ai' = ?) AND (? IS NULL OR pool_key = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
      [domain, domain, poolKey, poolKey, limit],
    );
    return [...srsRows, ...aiRows]
      .map(rowToMatch)
      .filter((entry): entry is ArenaMatchRecord => Boolean(entry))
      .filter((entry) => !poolKey || entry.poolKey === poolKey)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map(clone);
  }

  appendMatch(record: ArenaMatchRecord): void {
    if (record.domain === 'ai') {
      this.database.run(
        `INSERT OR REPLACE INTO ai_arena_events
          (id, exposure_id, pool_key, pack_id, event_type, quality_label, score_delta, created_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.ai?.exposureId || null,
          record.poolKey,
          record.ai?.packId || null,
          record.ai?.eventType || 'exposure',
          record.ai?.qualityLabel || null,
          Number(record.ai?.scoreDelta) || 0,
          record.createdAt,
          stringifyJson(record),
        ],
      );
      return;
    }

    const outcomeId = record.id || createStableId('arena-srs-outcome', [record.srs?.cardId, record.createdAt]);
    this.database.run(
      `INSERT OR REPLACE INTO arena_outcomes
        (id, prediction_id, domain, attempt_id, card_id, contestant_id, actual_recall, rating, reviewed_at, final_due, accepted, cost_score, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outcomeId,
        null,
        'srs',
        record.id,
        record.srs?.cardId || null,
        record.srs?.leadingContestantId || null,
        record.srs?.pass ? 1 : 0,
        record.srs?.rating || null,
        record.createdAt,
        null,
        0,
        null,
        stringifyJson(record),
      ],
    );
  }

  listScoreSnapshots(filters?: {
    domain?: ArenaDomain;
    poolKey?: string | null;
  }): ArenaScoreSnapshot[] {
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM arena_score_snapshots
       WHERE (? IS NULL OR domain = ?) AND (? IS NULL OR pool_key = ?)
       ORDER BY created_at DESC`,
      [filters?.domain || null, filters?.domain || null, filters?.poolKey || null, filters?.poolKey || null],
    );
    return rows
      .map((row) => parseJson<ArenaScoreSnapshot | null>(row.payload_json, null))
      .filter((entry): entry is ArenaScoreSnapshot => Boolean(entry))
      .map(clone);
  }

  getLatestScoreSnapshot(domain: ArenaDomain, poolKey: string): ArenaScoreSnapshot | null {
    const row = this.database.getOne<{ payload_json: string }>(
      `SELECT payload_json FROM arena_score_snapshots
       WHERE domain = ? AND pool_key = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [domain, poolKey],
    );
    return row ? clone(parseJson<ArenaScoreSnapshot | null>(row.payload_json, null)) : null;
  }

  replaceScoreSnapshot(snapshot: ArenaScoreSnapshot): void {
    this.database.run(
      'DELETE FROM arena_score_snapshots WHERE domain = ? AND pool_key = ?',
      [snapshot.domain, snapshot.poolKey],
    );
    this.database.run(
      `INSERT INTO arena_score_snapshots
        (id, domain, pool_key, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      [snapshot.id, snapshot.domain, snapshot.poolKey, snapshot.createdAt, stringifyJson(snapshot)],
    );
  }

  getAttribution(cardId: string): ArenaCardAttributionRecord | null {
    const row = this.database.getOne<{ payload_json: string }>(
      'SELECT payload_json FROM ai_card_attributions WHERE card_id = ?',
      [cardId],
    );
    return row ? clone(parseJson<ArenaCardAttributionRecord | null>(row.payload_json, null)) : null;
  }

  upsertAttribution(record: ArenaCardAttributionRecord): void {
    this.database.run(
      `INSERT OR REPLACE INTO ai_card_attributions
        (card_id, pool_key, source_pack_id, exposure_id, created_at, updated_at, review_count, last_outcome, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.cardId,
        record.poolKey,
        record.sourcePackId,
        record.exposureId,
        record.createdAt,
        record.updatedAt,
        record.reviewCount,
        record.lastOutcome || null,
        stringifyJson(record),
      ],
    );
  }

  listAttributions(filters?: {
    sourcePackId?: string | null;
    poolKey?: string | null;
    limit?: number;
  }): ArenaCardAttributionRecord[] {
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM ai_card_attributions
       WHERE (? IS NULL OR source_pack_id = ?) AND (? IS NULL OR pool_key = ?)
       ORDER BY updated_at DESC
       LIMIT ?`,
      [
        filters?.sourcePackId || null,
        filters?.sourcePackId || null,
        filters?.poolKey || null,
        filters?.poolKey || null,
        normalizeLimit(filters?.limit, 120),
      ],
    );
    return rows
      .map((row) => parseJson<ArenaCardAttributionRecord | null>(row.payload_json, null))
      .filter((entry): entry is ArenaCardAttributionRecord => Boolean(entry))
      .map(clone);
  }

  recordSrsPredictions(input: {
    poolKey: string;
    attemptId: string;
    cardId: string;
    createdAt: number;
    predictions: SrsArenaContestantPrediction[];
  }): void {
    for (const prediction of input.predictions) {
      this.database.run(
        `INSERT OR REPLACE INTO arena_predictions
          (id, domain, attempt_id, card_id, pool_key, contestant_id, predicted_recall, interval_days, due, created_at, runtime_kind, parameter_hash, payload_json)
         VALUES (?, 'srs', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createStableId('arena-prediction', [input.attemptId, input.cardId, prediction.contestantId]),
          input.attemptId,
          input.cardId,
          input.poolKey,
          prediction.contestantId,
          prediction.predictedPassProbability,
          prediction.intervalDays,
          prediction.due,
          input.createdAt,
          String(prediction.attribution?.source || 'browser'),
          String(prediction.attribution?.parameterHash || 'settings.fsrs'),
          stringifyJson(prediction),
        ],
      );
    }
  }

  recordSrsOutcome(input: {
    poolKey: string;
    attemptId: string;
    cardId: string;
    contestantId: string;
    predictedRecall: number;
    actualRecall: boolean;
    rating: number;
    reviewedAt: number;
    payload: unknown;
  }): void {
    const predictionId = createStableId('arena-prediction', [input.attemptId, input.cardId, input.contestantId]);
    const outcomeId = createStableId('arena-outcome', [input.attemptId, input.cardId, input.contestantId]);
    this.database.run(
      `INSERT OR REPLACE INTO arena_outcomes
        (id, prediction_id, domain, attempt_id, card_id, contestant_id, actual_recall, rating, reviewed_at, final_due, accepted, cost_score, payload_json)
       VALUES (?, ?, 'srs', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outcomeId,
        predictionId,
        input.attemptId,
        input.cardId,
        input.contestantId,
        input.actualRecall ? 1 : 0,
        input.rating,
        input.reviewedAt,
        null,
        0,
        null,
        stringifyJson(input.payload),
      ],
    );
    this.updateMetricBin(input);
  }

  importStore(store: ArenaStoreData): void {
    for (const snapshot of store.scores || []) {
      this.replaceScoreSnapshot(snapshot);
    }
    for (const match of store.matches || []) {
      this.appendMatch(match);
    }
    for (const attribution of store.attributions || []) {
      this.upsertAttribution(attribution);
    }
  }

  async persist(): Promise<void> {
    await this.database.persist();
  }

  private updateMetricBin(input: {
    poolKey: string;
    contestantId: string;
    predictedRecall: number;
    actualRecall: boolean;
    reviewedAt: number;
  }): void {
    const clampedPrediction = Math.min(1, Math.max(0, Number(input.predictedRecall) || 0));
    const binIndex = Math.min(9, Math.floor(clampedPrediction * 10));
    const binKey = `${binIndex / 10}-${(binIndex + 1) / 10}`;
    const windowKey = 'all';
    const row = this.database.getOne<{
      sample_count: number;
      mean_prediction: number;
      actual_recall_rate: number;
    }>(
      `SELECT sample_count, mean_prediction, actual_recall_rate
       FROM arena_metric_bins
       WHERE algorithm_id = ? AND pool_key = ? AND bin_key = ? AND window_key = ?`,
      [input.contestantId, input.poolKey, binKey, windowKey],
    );
    const previousCount = Math.max(0, Number(row?.sample_count) || 0);
    const nextCount = previousCount + 1;
    const actual = input.actualRecall ? 1 : 0;
    const meanPrediction = ((Number(row?.mean_prediction) || 0) * previousCount + clampedPrediction) / nextCount;
    const actualRate = ((Number(row?.actual_recall_rate) || 0) * previousCount + actual) / nextCount;
    const betWinError = meanPrediction - actualRate;
    this.database.run(
      `INSERT OR REPLACE INTO arena_metric_bins
        (algorithm_id, pool_key, bin_key, window_key, sample_count, mean_prediction, actual_recall_rate, bet_win_error, rms_contribution, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.contestantId,
        input.poolKey,
        binKey,
        windowKey,
        nextCount,
        meanPrediction,
        actualRate,
        betWinError,
        betWinError * betWinError,
        input.reviewedAt,
      ],
    );
  }
}
