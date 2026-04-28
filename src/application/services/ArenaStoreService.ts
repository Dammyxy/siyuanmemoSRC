import type { IFileService } from '@/infrastructure/services/FileService';
import type { SqlArenaRepository } from '@/infrastructure/persistence/sqlite';
import {
  DEFAULT_ARENA_STORE_DATA,
  type ArenaCardAttributionRecord,
  type ArenaDomain,
  type ArenaMatchRecord,
  type ArenaScoreSnapshot,
  type ArenaStoreData,
  type SrsArenaContestantPrediction,
} from '@/types/arena';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ArenaStoreService');
const ARENA_STORE_FILE = 'arena/store.json';
const MAX_MATCH_RECORDS = 800;
const MAX_SCORE_SNAPSHOTS = 160;
const MAX_ATTRIBUTIONS = 2400;

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMatchRecord(value: unknown): ArenaMatchRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeString(value.id);
  const domain = value.domain === 'srs' ? 'srs' : value.domain === 'ai' ? 'ai' : null;
  const poolKey = normalizeString(value.poolKey);
  if (!id || !domain || !poolKey) {
    return null;
  }
  return {
    ...(value as ArenaMatchRecord),
    id,
    domain,
    poolKey,
    createdAt: Number(value.createdAt) || Date.now(),
  };
}

function normalizeScoreSnapshot(value: unknown): ArenaScoreSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeString(value.id);
  const domain = value.domain === 'srs' ? 'srs' : value.domain === 'ai' ? 'ai' : null;
  const poolKey = normalizeString(value.poolKey);
  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (!id || !domain || !poolKey) {
    return null;
  }
  return {
    id,
    domain,
    poolKey,
    createdAt: Number(value.createdAt) || Date.now(),
    entries: entries
      .filter(isRecord)
      .map((entry) => ({
        contestantId: normalizeString(entry.contestantId),
        title: normalizeString(entry.title),
        weight: Number(entry.weight) || 0,
        score: Number(entry.score) || 0,
        sampleCount: Math.max(0, Math.floor(Number(entry.sampleCount) || 0)),
        winCount: Math.max(0, Math.floor(Number(entry.winCount) || 0)),
        lossCount: Math.max(0, Math.floor(Number(entry.lossCount) || 0)),
        lastEventAt: Number(entry.lastEventAt) || null,
      }))
      .filter((entry) => entry.contestantId.length > 0),
  };
}

function normalizeAttribution(value: unknown): ArenaCardAttributionRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const cardId = normalizeString(value.cardId);
  const poolKey = normalizeString(value.poolKey);
  const sourcePackId = normalizeString(value.sourcePackId);
  const scenarioId = normalizeString(value.scenarioId);
  const targetKind = normalizeString(value.targetKind);
  const surface = normalizeString(value.surface);
  if (!cardId || !poolKey || !sourcePackId || !scenarioId || !targetKind || !surface) {
    return null;
  }
  return {
    ...(value as ArenaCardAttributionRecord),
    cardId,
    poolKey,
    surface: surface as ArenaCardAttributionRecord['surface'],
    scenarioId: scenarioId as ArenaCardAttributionRecord['scenarioId'],
    targetKind: targetKind as ArenaCardAttributionRecord['targetKind'],
    sourcePackId,
    sourcePackTitle: normalizeString(value.sourcePackTitle) || sourcePackId,
    exposureId: normalizeString(value.exposureId),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    reviewCount: Math.max(0, Math.floor(Number(value.reviewCount) || 0)),
    lastReviewAt: Number(value.lastReviewAt) || null,
    lastOutcome: value.lastOutcome === 'positive' || value.lastOutcome === 'negative' || value.lastOutcome === 'neutral'
      ? value.lastOutcome
      : null,
  };
}

function normalizeStoreData(value: unknown): ArenaStoreData {
  const source = isRecord(value) ? value : {};
  const matches = Array.isArray(source.matches) ? source.matches : [];
  const scores = Array.isArray(source.scores) ? source.scores : [];
  const attributions = Array.isArray(source.attributions) ? source.attributions : [];
  return {
    schemaVersion: 1,
    matches: matches
      .map(normalizeMatchRecord)
      .filter((entry): entry is ArenaMatchRecord => Boolean(entry))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_MATCH_RECORDS),
    scores: scores
      .map(normalizeScoreSnapshot)
      .filter((entry): entry is ArenaScoreSnapshot => Boolean(entry))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_SCORE_SNAPSHOTS),
    attributions: attributions
      .map(normalizeAttribution)
      .filter((entry): entry is ArenaCardAttributionRecord => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ATTRIBUTIONS),
  };
}

export interface SrsArenaOutcomeInput {
  poolKey: string;
  attemptId: string;
  cardId: string;
  contestantId: string;
  predictedRecall: number;
  actualRecall: boolean;
  rating: number;
  reviewedAt: number;
  payload: unknown;
}

export interface SrsArenaReviewBatchInput {
  predictions: {
    poolKey: string;
    attemptId: string;
    cardId: string;
    createdAt: number;
    predictions: SrsArenaContestantPrediction[];
  };
  scoreSnapshot: ArenaScoreSnapshot;
  outcomes: SrsArenaOutcomeInput[];
  match: ArenaMatchRecord;
}

export class ArenaStoreService {
  constructor(
    private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON'>,
    private readonly sqlRepository?: SqlArenaRepository | null,
  ) {}

  async readStore(): Promise<ArenaStoreData> {
    if (this.sqlRepository) {
      return this.sqlRepository.readStore();
    }

    return normalizeStoreData(
      await this.fileService.readJSON<ArenaStoreData>(ARENA_STORE_FILE),
    );
  }

  async listMatches(filters?: {
    domain?: ArenaDomain;
    poolKey?: string | null;
    limit?: number;
  }): Promise<ArenaMatchRecord[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.listMatches(filters);
    }

    const store = await this.readStore();
    const poolKey = normalizeString(filters?.poolKey) || null;
    const domain = filters?.domain;
    const limit = Math.max(1, Math.floor(Number(filters?.limit) || 50));
    return store.matches
      .filter((match) => (
        (!domain || match.domain === domain)
        && (!poolKey || match.poolKey === poolKey)
      ))
      .slice(0, limit)
      .map((entry) => clone(entry));
  }

  async appendMatch(record: ArenaMatchRecord): Promise<void> {
    const normalized = normalizeMatchRecord(record);
    if (!normalized) {
      logger.warn('Skipping invalid arena match record', { record });
      return;
    }
    if (this.sqlRepository) {
      this.sqlRepository.appendMatch(normalized);
      await this.sqlRepository.persist();
      return;
    }

    const store = await this.readStore();
    store.matches = [normalized, ...store.matches.filter((entry) => entry.id !== normalized.id)]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_MATCH_RECORDS);
    await this.writeStore(store);
  }

  async listScoreSnapshots(filters?: {
    domain?: ArenaDomain;
    poolKey?: string | null;
  }): Promise<ArenaScoreSnapshot[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.listScoreSnapshots(filters);
    }

    const store = await this.readStore();
    const poolKey = normalizeString(filters?.poolKey) || null;
    const domain = filters?.domain;
    return store.scores
      .filter((snapshot) => (
        (!domain || snapshot.domain === domain)
        && (!poolKey || snapshot.poolKey === poolKey)
      ))
      .map((entry) => clone(entry));
  }

  async getLatestScoreSnapshot(
    domain: ArenaDomain,
    poolKey: string,
  ): Promise<ArenaScoreSnapshot | null> {
    const normalizedPoolKey = normalizeString(poolKey);
    if (!normalizedPoolKey) {
      return null;
    }
    if (this.sqlRepository) {
      return this.sqlRepository.getLatestScoreSnapshot(domain, normalizedPoolKey);
    }

    const store = await this.readStore();
    return clone(
      store.scores.find((snapshot) => snapshot.domain === domain && snapshot.poolKey === normalizedPoolKey) || null,
    );
  }

  async replaceScoreSnapshot(snapshot: ArenaScoreSnapshot): Promise<void> {
    const normalized = normalizeScoreSnapshot(snapshot);
    if (!normalized) {
      logger.warn('Skipping invalid arena score snapshot', { snapshot });
      return;
    }
    if (this.sqlRepository) {
      this.sqlRepository.replaceScoreSnapshot(normalized);
      await this.sqlRepository.persist();
      return;
    }

    const store = await this.readStore();
    store.scores = [
      normalized,
      ...store.scores.filter((entry) => !(entry.domain === normalized.domain && entry.poolKey === normalized.poolKey)),
    ]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_SCORE_SNAPSHOTS);
    await this.writeStore(store);
  }

  async getAttribution(cardId: string): Promise<ArenaCardAttributionRecord | null> {
    const normalizedCardId = normalizeString(cardId);
    if (!normalizedCardId) {
      return null;
    }
    if (this.sqlRepository) {
      return this.sqlRepository.getAttribution(normalizedCardId);
    }

    const store = await this.readStore();
    return clone(
      store.attributions.find((entry) => entry.cardId === normalizedCardId) || null,
    );
  }

  async upsertAttribution(record: ArenaCardAttributionRecord): Promise<void> {
    const normalized = normalizeAttribution(record);
    if (!normalized) {
      logger.warn('Skipping invalid arena attribution record', { record });
      return;
    }
    if (this.sqlRepository) {
      this.sqlRepository.upsertAttribution(normalized);
      await this.sqlRepository.persist();
      return;
    }

    const store = await this.readStore();
    store.attributions = [
      normalized,
      ...store.attributions.filter((entry) => entry.cardId !== normalized.cardId),
    ]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ATTRIBUTIONS);
    await this.writeStore(store);
  }

  async listAttributions(filters?: {
    sourcePackId?: string | null;
    poolKey?: string | null;
    limit?: number;
  }): Promise<ArenaCardAttributionRecord[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.listAttributions(filters);
    }

    const store = await this.readStore();
    const sourcePackId = normalizeString(filters?.sourcePackId) || null;
    const poolKey = normalizeString(filters?.poolKey) || null;
    const limit = Math.max(1, Math.floor(Number(filters?.limit) || 120));
    return store.attributions
      .filter((entry) => (
        (!sourcePackId || entry.sourcePackId === sourcePackId)
        && (!poolKey || entry.poolKey === poolKey)
      ))
      .slice(0, limit)
      .map((entry) => clone(entry));
  }

  private async writeStore(store: ArenaStoreData): Promise<void> {
    await this.fileService.writeJSON(ARENA_STORE_FILE, {
      ...DEFAULT_ARENA_STORE_DATA,
      ...store,
    });
  }

  async recordSrsPredictions(input: {
    poolKey: string;
    attemptId: string;
    cardId: string;
    createdAt: number;
    predictions: SrsArenaContestantPrediction[];
  }): Promise<void> {
    if (!this.sqlRepository) {
      return;
    }
    this.sqlRepository.recordSrsPredictions(input);
    await this.sqlRepository.persist();
  }

  async recordSrsOutcome(input: {
    poolKey: string;
    attemptId: string;
    cardId: string;
    contestantId: string;
    predictedRecall: number;
    actualRecall: boolean;
    rating: number;
    reviewedAt: number;
    payload: unknown;
  }): Promise<void> {
    if (!this.sqlRepository) {
      return;
    }
    this.sqlRepository.recordSrsOutcome(input);
    await this.sqlRepository.persist();
  }

  async recordSrsReviewBatch(input: SrsArenaReviewBatchInput): Promise<void> {
    if (this.sqlRepository) {
      this.sqlRepository.recordSrsReviewBatch(input);
      await this.sqlRepository.persist();
      return;
    }

    await this.replaceScoreSnapshot(input.scoreSnapshot);
    await this.appendMatch(input.match);
  }
}
