import type { FSRSCard } from '@/types/card';
import { repairFsrsReviewState } from './fsrsReviewStateRepair';
import {
  getPreferredSchedulerForCardType,
  resolveStoredSchedulerType,
  type SchedulerType,
} from './schedulerPolicy';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SchedulingStateCleanMode = 'repair-external' | 'assert-internal';

export type SchedulingStateCleanSource =
  | 'card-mapper'
  | 'storage-load'
  | 'storage-save'
  | 'storage-update'
  | 'riff-import'
  | 'review-commit'
  | 'manual-reschedule'
  | 'scheduler-migration'
  | 'sql-repository'
  | 'queue-persistence'
  | (string & {});

export type SchedulingWriteSource =
  | 'review-commit'
  | 'manual-reschedule'
  | 'scheduler-migration'
  | 'riff-import';

export interface SchedulingStateCleanOptions {
  source: SchedulingStateCleanSource;
  mode: SchedulingStateCleanMode;
  now?: number | Date;
}

export interface SchedulingStateCleanResult<T extends FSRSCard> {
  card: T;
  changed: boolean;
  reasons: string[];
}

export interface SchedulingStateCleanlinessSummary {
  total: number;
  dirty: number;
  reasons: Record<string, number>;
}

const MIN_A_FACTOR = 1.2;
const MAX_A_FACTOR = 6.0;
const DEFAULT_A_FACTOR = 2.5;
const MAX_A_FACTOR_HISTORY = 30;
const PERSISTENT_META_SCHEDULING_KEYS = new Set([
  'nextDues',
  'stability',
  'difficulty',
  'aFactor',
  'a_factor',
  'scheduledDays',
  'scheduled_days',
]);

export function isAuthorizedSchedulingWriteSource(source: unknown): source is SchedulingWriteSource {
  return source === 'review-commit'
    || source === 'manual-reschedule'
    || source === 'scheduler-migration'
    || source === 'riff-import';
}

export function canonicalizeSchedulingState<T extends FSRSCard>(
  value: T,
  options: SchedulingStateCleanOptions,
): SchedulingStateCleanResult<T> {
  let card = { ...value } as FSRSCard & Record<string, unknown>;
  const reasons: string[] = [];

  if (Object.prototype.hasOwnProperty.call(card, 'nextDues')) {
    delete card.nextDues;
    reasons.push('nextDues');
  }

  const metaResult = cleanPersistentMeta(card.meta);
  if (metaResult.changed) {
    if (metaResult.meta && Object.keys(metaResult.meta).length > 0) {
      card.meta = metaResult.meta;
    } else {
      delete card.meta;
    }
    reasons.push(...metaResult.reasons);
  }

  const schedulerType = resolveCanonicalSchedulerType(card);
  if (card.schedulerType !== schedulerType) {
    card.schedulerType = schedulerType;
    reasons.push('schedulerType');
  }

  if (schedulerType === 'a-factor-v2') {
    card = canonicalizeTopicScheduling(card, reasons);
  } else {
    card = canonicalizeFsrsScheduling(card, reasons, options);
  }

  const uniqueReasons = Array.from(new Set(reasons));
  if (options.mode === 'assert-internal' && uniqueReasons.length > 0) {
    throw new Error(
      `Dirty scheduling state from ${options.source} on card ${String(value.id || '')}: ${uniqueReasons.join(', ')}`
    );
  }

  return {
    card: card as T,
    changed: uniqueReasons.length > 0,
    reasons: uniqueReasons,
  };
}

export function stripTransientSchedulingPreviewFields<T>(
  value: T,
): { value: T; changed: boolean } {
  const result = stripNextDues(value);
  return {
    value: result.value as T,
    changed: result.changed,
  };
}

export function summarizeSchedulingStateCleanliness(
  cards: Iterable<FSRSCard>,
  options: { now?: number | Date; source?: SchedulingStateCleanSource } = {},
): SchedulingStateCleanlinessSummary {
  const reasons: Record<string, number> = {};
  let total = 0;
  let dirty = 0;

  for (const card of cards) {
    total++;
    const result = canonicalizeSchedulingState(card, {
      source: options.source ?? 'diagnostic',
      mode: 'repair-external',
      now: options.now,
    });
    if (!result.changed) {
      continue;
    }
    dirty++;
    for (const reason of result.reasons) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }

  return { total, dirty, reasons };
}

function canonicalizeFsrsScheduling(
  card: FSRSCard & Record<string, unknown>,
  reasons: string[],
  options: SchedulingStateCleanOptions,
): FSRSCard & Record<string, unknown> {
  if (card.aFactor !== undefined) {
    delete card.aFactor;
    reasons.push('aFactor');
  }
  if (card.schedulerMeta !== undefined) {
    delete card.schedulerMeta;
    reasons.push('schedulerMeta');
  }

  const repaired = repairFsrsReviewState(card, {
    schedulerType: 'fsrs-v6',
    now: options.now ?? deriveInternalCheckNow(card, options.mode),
  });
  if (!repaired.repaired) {
    return card;
  }

  reasons.push(...repaired.reasons);
  return repaired.card as FSRSCard & Record<string, unknown>;
}

function deriveInternalCheckNow(
  card: Pick<FSRSCard, 'lastReview' | 'elapsedDays'>,
  mode: SchedulingStateCleanMode,
): number | undefined {
  if (mode !== 'assert-internal') {
    return undefined;
  }

  const lastReview = readFiniteNumber(card.lastReview);
  const elapsedDays = readFiniteNumber(card.elapsedDays);
  if (lastReview === undefined || lastReview <= 0 || elapsedDays === undefined || elapsedDays < 0) {
    return undefined;
  }

  return lastReview + Math.floor(elapsedDays) * DAY_MS;
}

function canonicalizeTopicScheduling(
  card: FSRSCard & Record<string, unknown>,
  reasons: string[],
): FSRSCard & Record<string, unknown> {
  const currentMeta = isObjectRecord(card.schedulerMeta) ? card.schedulerMeta : undefined;
  const currentTopicMeta = isObjectRecord(currentMeta?.topic) ? currentMeta.topic : undefined;
  const aFactor = clampAFactor(
    readFiniteNumber(card.aFactor)
      ?? readFiniteNumber(currentTopicMeta?.of)
      ?? DEFAULT_A_FACTOR,
  );
  const topicMeta = {
    afs: normalizeAfs(currentTopicMeta?.afs, aFactor),
    of: aFactor,
    optimalInterval: normalizePositiveInteger(
      currentTopicMeta?.optimalInterval,
      normalizePositiveInteger(card.scheduledDays, 1),
    ),
  };
  const schedulerMeta = { topic: topicMeta };

  if (card.aFactor !== aFactor) {
    card.aFactor = aFactor;
    reasons.push('aFactor');
  }
  if (!areJsonEqual(card.schedulerMeta, schedulerMeta)) {
    card.schedulerMeta = schedulerMeta;
    reasons.push('schedulerMeta');
  }

  return card;
}

function resolveCanonicalSchedulerType(card: Pick<FSRSCard, 'type' | 'schedulerType'>): SchedulerType {
  const preferred = getPreferredSchedulerForCardType(card.type);
  if (preferred) {
    return preferred;
  }

  const legacy = resolveLegacySchedulerType(card.schedulerType);
  return legacy ?? 'fsrs-v6';
}

function resolveLegacySchedulerType(raw: unknown): SchedulerType | null {
  const stored = resolveStoredSchedulerType(raw);
  if (stored) {
    return stored;
  }

  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim();
  if (normalized === 'fsrs-v5' || normalized === 'riff') {
    return 'fsrs-v6';
  }

  return null;
}

function cleanPersistentMeta(meta: unknown): {
  meta?: Record<string, unknown>;
  changed: boolean;
  reasons: string[];
} {
  if (meta === undefined) {
    return { meta: undefined, changed: false, reasons: [] };
  }
  if (!isObjectRecord(meta)) {
    return { meta: undefined, changed: true, reasons: ['meta'] };
  }

  const next: Record<string, unknown> = { ...meta };
  const reasons: string[] = [];
  for (const key of PERSISTENT_META_SCHEDULING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
      reasons.push(`meta.${key}`);
    }
  }

  return {
    meta: next,
    changed: reasons.length > 0,
    reasons,
  };
}

function stripNextDues(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = stripNextDues(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: changed ? next : value, changed };
  }

  if (!isObjectRecord(value)) {
    return { value, changed: false };
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'nextDues') {
      changed = true;
      continue;
    }
    const result = stripNextDues(child);
    changed ||= result.changed;
    next[key] = result.value;
  }

  return { value: changed ? next : value, changed };
}

function normalizeAfs(value: unknown, fallback: number): number[] {
  const values = Array.isArray(value)
    ? value.map((item) => readFiniteNumber(item)).filter((item): item is number => item !== undefined)
    : [];
  const normalized = values
    .map(clampAFactor)
    .slice(-MAX_A_FACTOR_HISTORY);
  return normalized.length > 0 ? normalized : [fallback];
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const num = readFiniteNumber(value);
  if (num === undefined || num <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(num));
}

function clampAFactor(value: number): number {
  return Math.min(MAX_A_FACTOR, Math.max(MIN_A_FACTOR, value));
}

function readFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function areJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
