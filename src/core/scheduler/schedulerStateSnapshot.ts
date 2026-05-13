import { type FSRSCard } from '@/types/card';
import { resolveEffectiveSchedulerTypeForCard, type SchedulerType } from './schedulerPolicy';
import {
  canonicalizeSchedulingState,
  type SchedulingStateCleanSource,
} from './schedulingStateCleanliness';

export interface SchedulerStateSnapshotOptions {
  now?: number | Date;
  source?: SchedulingStateCleanSource;
  reviewTime?: number | Date | null;
  memoryStateAsOf?: number | Date | null;
}

export interface SchedulerTopicStateSnapshot {
  aFactor: number | null;
  of: number | null;
  optimalInterval: number | null;
  afs: number[];
}

export interface SchedulerStateSnapshotDiagnostics {
  dirty: boolean;
  repairedRead: boolean;
  reasons: string[];
}

export interface SchedulerStateSnapshot {
  snapshotKey: string;
  cardId: string;
  blockId: string;
  schedulerType: SchedulerType;
  storedSchedulerType: string | null;
  cardType: FSRSCard['type'];
  state: FSRSCard['state'];
  due: number | null;
  lastReview: number | null;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  elapsedDays: number | null;
  scheduledDays: number | null;
  learningStep: number | null;
  reviewTime: number | null;
  memoryStateAsOf: number | null;
  generatedAt: number | null;
  source: SchedulingStateCleanSource;
  topic?: SchedulerTopicStateSnapshot;
  diagnostics: SchedulerStateSnapshotDiagnostics;
  rawSchedulingStateKey: string;
}

export function buildSchedulerStateSnapshot(
  card: FSRSCard,
  options: SchedulerStateSnapshotOptions = {},
): SchedulerStateSnapshot {
  const now = normalizeTimestamp(options.now);
  const cleanResult = canonicalizeSchedulingState(card, {
    source: options.source ?? 'diagnostic',
    mode: 'repair-external',
    now: now ?? undefined,
  });
  const cleanCard = cleanResult.card;
  const schedulerType = resolveEffectiveSchedulerTypeForCard(cleanCard);
  const snapshotBase = {
    cardId: String(cleanCard.id || ''),
    blockId: String(cleanCard.blockId || ''),
    schedulerType,
    storedSchedulerType: typeof card.schedulerType === 'string' ? card.schedulerType : null,
    cardType: cleanCard.type,
    state: cleanCard.state,
    due: finiteNumberOrNull(cleanCard.due),
    lastReview: finiteNumberOrNull(cleanCard.lastReview),
    stability: finiteNumberOrNull(cleanCard.stability),
    difficulty: finiteNumberOrNull(cleanCard.difficulty),
    reps: nonNegativeInteger(cleanCard.reps),
    lapses: nonNegativeInteger(cleanCard.lapses),
    elapsedDays: finiteNumberOrNull(cleanCard.elapsedDays),
    scheduledDays: finiteNumberOrNull(cleanCard.scheduledDays),
    learningStep: finiteNumberOrNull(cleanCard.learning_step),
    reviewTime: normalizeTimestamp(options.reviewTime),
    memoryStateAsOf: normalizeTimestamp(options.memoryStateAsOf),
    generatedAt: now,
    source: options.source ?? 'diagnostic',
    ...(schedulerType === 'a-factor-v2' ? { topic: buildTopicSnapshot(cleanCard) } : {}),
    diagnostics: {
      dirty: cleanResult.changed,
      repairedRead: cleanResult.changed,
      reasons: [...cleanResult.reasons],
    },
    rawSchedulingStateKey: buildRawSchedulingStateKey(card),
  } satisfies Omit<SchedulerStateSnapshot, 'snapshotKey'>;

  return {
    ...snapshotBase,
    snapshotKey: buildSnapshotKey(snapshotBase),
  };
}

export function buildSchedulerPreviewSnapshotKey(
  card: FSRSCard,
  options: SchedulerStateSnapshotOptions = {},
): string {
  return buildSchedulerStateSnapshot(card, options).snapshotKey;
}

function buildTopicSnapshot(card: FSRSCard): SchedulerTopicStateSnapshot {
  const topic = isRecord(card.schedulerMeta?.topic) ? card.schedulerMeta.topic : {};
  return {
    aFactor: finiteNumberOrNull(card.aFactor),
    of: finiteNumberOrNull(topic.of),
    optimalInterval: finiteNumberOrNull(topic.optimalInterval),
    afs: Array.isArray(topic.afs)
      ? topic.afs.map(finiteNumberOrNull).filter((value): value is number => value !== null)
      : [],
  };
}

function buildSnapshotKey(snapshot: Omit<SchedulerStateSnapshot, 'snapshotKey'>): string {
  return canonicalJson({
    cardId: snapshot.cardId,
    schedulerType: snapshot.schedulerType,
    storedSchedulerType: snapshot.storedSchedulerType,
    cardType: snapshot.cardType,
    state: snapshot.state,
    due: snapshot.due,
    lastReview: snapshot.lastReview,
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    reps: snapshot.reps,
    lapses: snapshot.lapses,
    elapsedDays: snapshot.elapsedDays,
    scheduledDays: snapshot.scheduledDays,
    learningStep: snapshot.learningStep,
    reviewTime: snapshot.reviewTime,
    memoryStateAsOf: snapshot.memoryStateAsOf,
    topic: snapshot.topic,
    rawSchedulingStateKey: snapshot.rawSchedulingStateKey,
  });
}

function buildRawSchedulingStateKey(card: FSRSCard): string {
  return canonicalJson({
    schedulerType: card.schedulerType ?? null,
    type: card.type,
    state: card.state,
    due: finiteNumberOrNull(card.due),
    lastReview: finiteNumberOrNull(card.lastReview),
    stability: finiteNumberOrNull(card.stability),
    difficulty: finiteNumberOrNull(card.difficulty),
    scheduledDays: finiteNumberOrNull(card.scheduledDays),
    elapsedDays: finiteNumberOrNull(card.elapsedDays),
    reps: finiteNumberOrNull(card.reps),
    lapses: finiteNumberOrNull(card.lapses),
    learningStep: finiteNumberOrNull(card.learning_step),
    aFactor: finiteNumberOrNull(card.aFactor),
    topic: isRecord(card.schedulerMeta?.topic) ? card.schedulerMeta.topic : null,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeTimestamp(value: number | Date | null | undefined): number | null {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonNegativeInteger(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
