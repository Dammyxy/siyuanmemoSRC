import type { SchedulerStateSnapshot } from './schedulerStateSnapshot';

export type LearningCurveEvidenceStatus = 'ready' | 'insufficient-data' | 'low-quality-data';
export type LearningCurveDriftDirection = 'weaker-than-expected' | 'stronger-than-expected' | 'stable' | 'unknown';
export type LearningCurveSuggestionKind = 'review-sooner-advisory' | 'review-later-advisory';

export interface LearningCurveEvidenceHistoryRecord {
  reviewedAt?: number | Date | null;
  rating?: number | null;
  observedRecall?: boolean | null;
  expectedRetention?: number | null;
  elapsedDays?: number | null;
  scheduledDays?: number | null;
  stability?: number | null;
  difficulty?: number | null;
  commitPolicy?: string | null;
  queueMode?: string | null;
  source?: string | null;
}

export interface LearningCurveEvidenceOptions {
  now?: number | Date;
  minSamples?: number;
  observationWindowDays?: number;
  driftTolerance?: number;
}

export interface LearningCurveObservationWindow {
  from: number | null;
  to: number | null;
  days: number | null;
}

export interface LearningCurveEvidenceSuggestion {
  advisory: true;
  kind: LearningCurveSuggestionKind;
  confidence: number;
  reasons: string[];
}

export interface LearningCurveEvidenceResult {
  status: LearningCurveEvidenceStatus;
  advisory: true;
  snapshotKey: string;
  cardId: string;
  sampleSize: number;
  usableSampleSize: number;
  observationWindow: LearningCurveObservationWindow;
  observedRecallRate: number | null;
  expectedRetention: number | null;
  calibrationGap: number | null;
  confidence: number;
  driftDirection: LearningCurveDriftDirection;
  diagnostics: string[];
  suggestions: LearningCurveEvidenceSuggestion[];
}

export interface ReviewLogV2Like {
  rating?: number | null;
  reviewedAt?: number | Date | null;
  queueMode?: string | null;
  commitPolicy?: string | null;
  source?: string | null;
  before?: {
    elapsedDays?: number | null;
    scheduledDays?: number | null;
    stability?: number | null;
    difficulty?: number | null;
  } | null;
}

interface UsableEvidenceRecord {
  reviewedAt: number;
  observedRecall: boolean;
  expectedRetention: number;
}

const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_OBSERVATION_WINDOW_DAYS = 90;
const DEFAULT_DRIFT_TOLERANCE = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildLearningCurveEvidence(
  snapshot: SchedulerStateSnapshot,
  history: readonly LearningCurveEvidenceHistoryRecord[],
  options: LearningCurveEvidenceOptions = {},
): LearningCurveEvidenceResult {
  const now = normalizeTimestamp(options.now) ?? snapshot.generatedAt ?? Date.now();
  const minSamples = positiveInteger(options.minSamples) ?? DEFAULT_MIN_SAMPLES;
  const windowDays = positiveNumber(options.observationWindowDays) ?? DEFAULT_OBSERVATION_WINDOW_DAYS;
  const driftTolerance = positiveNumber(options.driftTolerance) ?? DEFAULT_DRIFT_TOLERANCE;
  const windowStart = now - windowDays * DAY_MS;
  const diagnostics = new Set<string>();
  const usable: UsableEvidenceRecord[] = [];

  for (const record of history) {
    const reviewedAt = normalizeTimestamp(record.reviewedAt);
    if (reviewedAt === null) {
      diagnostics.add('missing-review-timestamp');
      continue;
    }
    if (reviewedAt < windowStart || reviewedAt > now) {
      continue;
    }

    const observedRecall = resolveObservedRecall(record);
    if (observedRecall === null) {
      diagnostics.add('missing-observed-outcome');
      continue;
    }

    const expectedRetention = resolveExpectedRetention(record);
    if (expectedRetention === null) {
      diagnostics.add('missing-expected-retention');
      continue;
    }

    usable.push({
      reviewedAt,
      observedRecall,
      expectedRetention,
    });
  }

  const window = buildObservationWindow(usable);
  const base = {
    advisory: true as const,
    snapshotKey: snapshot.snapshotKey,
    cardId: snapshot.cardId,
    sampleSize: history.length,
    usableSampleSize: usable.length,
    observationWindow: window,
    observedRecallRate: null,
    expectedRetention: null,
    calibrationGap: null,
    confidence: 0,
    driftDirection: 'unknown' as const,
    diagnostics: [...diagnostics],
    suggestions: [],
  };

  if (usable.length === 0 && diagnostics.size > 0) {
    return {
      status: 'low-quality-data',
      ...base,
    };
  }

  if (usable.length < minSamples) {
    return {
      status: 'insufficient-data',
      ...base,
      diagnostics: unique([...base.diagnostics, 'insufficient-samples']),
    };
  }

  const observedRecallRate = average(usable.map((record) => record.observedRecall ? 1 : 0));
  const expectedRetention = average(usable.map((record) => record.expectedRetention));
  const calibrationGap = observedRecallRate - expectedRetention;
  const confidence = clamp01(Math.min(1, usable.length / Math.max(minSamples * 2, 1)) * qualityFactor(diagnostics.size, history.length));
  const driftDirection = resolveDriftDirection(calibrationGap, driftTolerance);
  const driftDiagnostics = resolveDriftDiagnostics(driftDirection);
  const allDiagnostics = unique([...base.diagnostics, ...driftDiagnostics]);
  const suggestions = buildSuggestions(driftDirection, confidence, allDiagnostics);

  return {
    status: 'ready',
    ...base,
    observedRecallRate,
    expectedRetention,
    calibrationGap,
    confidence,
    driftDirection,
    diagnostics: allDiagnostics,
    suggestions,
  };
}

export function mapReviewLogV2ToLearningCurveHistory(
  logs: readonly ReviewLogV2Like[],
): LearningCurveEvidenceHistoryRecord[] {
  return logs.map((log) => {
    const elapsedDays = finiteNumberOrNull(log.before?.elapsedDays);
    const stability = finiteNumberOrNull(log.before?.stability);
    return {
      reviewedAt: log.reviewedAt ?? null,
      rating: log.rating ?? null,
      observedRecall: resolveObservedRecall({ rating: log.rating }),
      expectedRetention: deriveRetention(elapsedDays, stability),
      elapsedDays,
      scheduledDays: finiteNumberOrNull(log.before?.scheduledDays),
      stability,
      difficulty: finiteNumberOrNull(log.before?.difficulty),
      commitPolicy: log.commitPolicy ?? null,
      queueMode: log.queueMode ?? null,
      source: log.source ?? null,
    };
  });
}

function resolveObservedRecall(record: Pick<LearningCurveEvidenceHistoryRecord, 'observedRecall' | 'rating'>): boolean | null {
  if (typeof record.observedRecall === 'boolean') {
    return record.observedRecall;
  }
  const rating = finiteNumberOrNull(record.rating);
  if (rating === null) {
    return null;
  }
  return rating > 1;
}

function resolveExpectedRetention(record: LearningCurveEvidenceHistoryRecord): number | null {
  const explicit = finiteNumberOrNull(record.expectedRetention);
  if (explicit !== null && explicit >= 0 && explicit <= 1) {
    return explicit;
  }
  const recordRetention = deriveRetention(
    finiteNumberOrNull(record.elapsedDays),
    finiteNumberOrNull(record.stability),
  );
  if (recordRetention !== null) {
    return recordRetention;
  }
  return null;
}

function deriveRetention(elapsedDays: number | null, stability: number | null): number | null {
  if (elapsedDays === null || stability === null || stability <= 0 || elapsedDays < 0) {
    return null;
  }
  return clamp01(Math.exp(-elapsedDays / stability));
}

function resolveDriftDirection(
  calibrationGap: number,
  driftTolerance: number,
): LearningCurveDriftDirection {
  if (calibrationGap < -driftTolerance) {
    return 'weaker-than-expected';
  }
  if (calibrationGap > driftTolerance) {
    return 'stronger-than-expected';
  }
  return 'stable';
}

function resolveDriftDiagnostics(direction: LearningCurveDriftDirection): string[] {
  switch (direction) {
    case 'weaker-than-expected':
      return ['observed-recall-below-expected-retention'];
    case 'stronger-than-expected':
      return ['observed-recall-above-expected-retention'];
    case 'stable':
      return ['observed-recall-within-expected-range'];
    case 'unknown':
    default:
      return [];
  }
}

function buildSuggestions(
  direction: LearningCurveDriftDirection,
  confidence: number,
  diagnostics: string[],
): LearningCurveEvidenceSuggestion[] {
  if (direction === 'weaker-than-expected') {
    return [{
      advisory: true,
      kind: 'review-sooner-advisory',
      confidence,
      reasons: diagnostics.filter((reason) => reason === 'observed-recall-below-expected-retention'),
    }];
  }
  if (direction === 'stronger-than-expected') {
    return [{
      advisory: true,
      kind: 'review-later-advisory',
      confidence,
      reasons: diagnostics.filter((reason) => reason === 'observed-recall-above-expected-retention'),
    }];
  }
  return [];
}

function buildObservationWindow(records: readonly UsableEvidenceRecord[]): LearningCurveObservationWindow {
  if (records.length === 0) {
    return { from: null, to: null, days: null };
  }
  const timestamps = records.map((record) => record.reviewedAt);
  const from = Math.min(...timestamps);
  const to = Math.max(...timestamps);
  return {
    from,
    to,
    days: Math.max(0, Math.ceil((to - from) / DAY_MS)),
  };
}

function qualityFactor(diagnosticCount: number, sampleSize: number): number {
  if (sampleSize <= 0) {
    return 0;
  }
  return clamp01(1 - diagnosticCount / sampleSize);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeTimestamp(value: number | Date | null | undefined): number | null {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function positiveNumber(value: unknown): number | null {
  const num = finiteNumberOrNull(value);
  return num !== null && num > 0 ? num : null;
}

function positiveInteger(value: unknown): number | null {
  const num = positiveNumber(value);
  return num !== null ? Math.floor(num) : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
