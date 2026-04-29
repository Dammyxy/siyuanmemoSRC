import { getPreferredSchedulerForCardType } from '@/core/scheduler/schedulerPolicy';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import type { FSRSCard } from '@/types/card';

export const ACTIVE_ALGORITHM_IDS = ['fsrs-v6', 'a-factor-v2'] as const;
export type ActiveAlgorithmId = typeof ACTIVE_ALGORITHM_IDS[number];

export interface AlgorithmCardStateCommon {
  due: number;
  state: number;
  reps: number;
  lapses: number;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learning_step?: number;
}

export interface AlgorithmCardStateJson {
  schemaVersion: 1;
  schedulerType: ActiveAlgorithmId;
  common: AlgorithmCardStateCommon;
  fsrs?: {
    stability: number;
    difficulty: number;
  };
  topic?: {
    aFactor: number;
    schedulerMeta?: Pick<NonNullable<FSRSCard['schedulerMeta']>, 'topic'>;
  };
}

export interface AlgorithmCardStateRow {
  cardId: string;
  algorithmId: string;
  stateJson: string;
}

export interface DerivedAlgorithmCardState {
  card: FSRSCard;
  algorithmId: ActiveAlgorithmId;
  state: AlgorithmCardStateJson;
  reasons: string[];
}

export interface AppliedAlgorithmCardState {
  card: FSRSCard;
  usedStateRow: boolean;
  invalidStateRow: boolean;
  reasons: string[];
}

export interface AlgorithmCardStateRowDiagnostic {
  expectedAlgorithmId: ActiveAlgorithmId;
  missing: boolean;
  invalid: boolean;
  mismatch: boolean;
  reasons: string[];
}

const DEFAULT_A_FACTOR = 2.5;

export function isActiveAlgorithmId(value: unknown): value is ActiveAlgorithmId {
  return value === 'fsrs-v6' || value === 'a-factor-v2';
}

export function resolveActiveAlgorithmId(card: Pick<FSRSCard, 'type'>): ActiveAlgorithmId {
  const preferred = getPreferredSchedulerForCardType(card.type);
  return preferred === 'a-factor-v2' ? 'a-factor-v2' : 'fsrs-v6';
}

export function deriveAlgorithmCardState(card: FSRSCard): DerivedAlgorithmCardState {
  const reasons: string[] = [];
  let clean = canonicalizeSchedulingState(card, {
    source: 'sql-algorithm-state',
    mode: 'repair-external',
  }).card;
  const activeAlgorithmId = resolveActiveAlgorithmId(clean);

  if (clean.schedulerType !== activeAlgorithmId) {
    clean = canonicalizeSchedulingState({
      ...clean,
      schedulerType: activeAlgorithmId,
    }, {
      source: 'sql-algorithm-state',
      mode: 'repair-external',
    }).card;
    reasons.push('schedulerType');
  }

  const common: AlgorithmCardStateCommon = {
    due: numberOr(clean.due, 0),
    state: numberOr(clean.state, 0),
    reps: numberOr(clean.reps, 0),
    lapses: numberOr(clean.lapses, 0),
    lastReview: numberOr(clean.lastReview, 0),
    elapsedDays: numberOr(clean.elapsedDays, 0),
    scheduledDays: numberOr(clean.scheduledDays, 0),
  };
  if (isFiniteNumber(clean.learning_step)) {
    common.learning_step = clean.learning_step;
  }

  const state: AlgorithmCardStateJson = {
    schemaVersion: 1,
    schedulerType: activeAlgorithmId,
    common,
  };
  if (activeAlgorithmId === 'a-factor-v2') {
    const aFactor = numberOr(clean.aFactor, DEFAULT_A_FACTOR);
    state.topic = {
      aFactor,
      schedulerMeta: clean.schedulerMeta?.topic
        ? { topic: clean.schedulerMeta.topic }
        : undefined,
    };
  } else {
    state.fsrs = {
      stability: numberOr(clean.stability, 1),
      difficulty: numberOr(clean.difficulty, 5),
    };
  }

  return {
    card: clean,
    algorithmId: activeAlgorithmId,
    state,
    reasons,
  };
}

export function applyAlgorithmCardState(
  card: FSRSCard,
  row?: AlgorithmCardStateRow | null,
): AppliedAlgorithmCardState {
  const derived = deriveAlgorithmCardState(card);
  if (!row) {
    return {
      card: derived.card,
      usedStateRow: false,
      invalidStateRow: false,
      reasons: ['algorithmState.missing'],
    };
  }

  const parsed = parseAlgorithmCardState(row.stateJson, derived.algorithmId);
  if (!parsed.ok) {
    return {
      card: derived.card,
      usedStateRow: false,
      invalidStateRow: true,
      reasons: parsed.reasons,
    };
  }

  const overlaid = overlayState(card, parsed.state);
  const cleanResult = canonicalizeSchedulingState(overlaid, {
    source: 'sql-algorithm-state',
    mode: 'repair-external',
  });
  const normalizedFromRow = deriveAlgorithmCardState(cleanResult.card);
  const rowRepaired = !sameJson(normalizedFromRow.state, parsed.state);

  return {
    card: cleanResult.card,
    usedStateRow: true,
    invalidStateRow: rowRepaired,
    reasons: rowRepaired
      ? Array.from(new Set(['algorithmState.repaired', ...cleanResult.reasons, ...normalizedFromRow.reasons]))
      : [],
  };
}

export function diagnoseAlgorithmCardStateRow(
  card: FSRSCard,
  row?: AlgorithmCardStateRow | null,
): AlgorithmCardStateRowDiagnostic {
  const derived = deriveAlgorithmCardState(card);
  if (!row) {
    return {
      expectedAlgorithmId: derived.algorithmId,
      missing: true,
      invalid: false,
      mismatch: false,
      reasons: ['algorithmState.missing'],
    };
  }

  const parsed = parseAlgorithmCardState(row.stateJson, derived.algorithmId);
  if (!parsed.ok) {
    return {
      expectedAlgorithmId: derived.algorithmId,
      missing: false,
      invalid: true,
      mismatch: false,
      reasons: parsed.reasons,
    };
  }

  const applied = applyAlgorithmCardState(card, row);
  const rowState = deriveAlgorithmCardState(applied.card);
  return {
    expectedAlgorithmId: derived.algorithmId,
    missing: false,
    invalid: applied.invalidStateRow,
    mismatch: !sameJson(derived.state, rowState.state),
    reasons: applied.reasons,
  };
}

export function stringifyAlgorithmCardState(state: AlgorithmCardStateJson): string {
  return JSON.stringify(state);
}

function parseAlgorithmCardState(
  stateJson: string,
  expectedAlgorithmId: ActiveAlgorithmId,
): { ok: true; state: AlgorithmCardStateJson } | { ok: false; reasons: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(stateJson);
  } catch {
    return { ok: false, reasons: ['algorithmState.invalidJson'] };
  }

  if (!isObjectRecord(value)) {
    return { ok: false, reasons: ['algorithmState.invalidShape'] };
  }
  if (value.schemaVersion !== 1) {
    return { ok: false, reasons: ['algorithmState.schemaVersion'] };
  }
  if (!isActiveAlgorithmId(value.schedulerType)) {
    return { ok: false, reasons: ['algorithmState.schedulerType'] };
  }
  if (value.schedulerType !== expectedAlgorithmId) {
    return { ok: false, reasons: ['algorithmState.algorithmMismatch'] };
  }
  if (!isObjectRecord(value.common)) {
    return { ok: false, reasons: ['algorithmState.common'] };
  }
  const common = readCommon(value.common);
  if (!common) {
    return { ok: false, reasons: ['algorithmState.common'] };
  }

  if (value.schedulerType === 'fsrs-v6') {
    if (!isObjectRecord(value.fsrs)) {
      return { ok: false, reasons: ['algorithmState.fsrs'] };
    }
    const stability = numberOrInvalid(value.fsrs.stability);
    const difficulty = numberOrInvalid(value.fsrs.difficulty);
    if (stability === null || stability <= 0) {
      return { ok: false, reasons: ['algorithmState.stability'] };
    }
    if (difficulty === null || difficulty < 1 || difficulty > 10) {
      return { ok: false, reasons: ['algorithmState.difficulty'] };
    }
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        schedulerType: 'fsrs-v6',
        common,
        fsrs: { stability, difficulty },
      },
    };
  }

  if (!isObjectRecord(value.topic)) {
    return { ok: false, reasons: ['algorithmState.topic'] };
  }
  const aFactor = numberOrInvalid(value.topic.aFactor);
  if (aFactor === null || aFactor < 1.2 || aFactor > 6) {
    return { ok: false, reasons: ['algorithmState.aFactor'] };
  }

  const schedulerMeta = isObjectRecord(value.topic.schedulerMeta)
    && isObjectRecord(value.topic.schedulerMeta.topic)
    ? { topic: value.topic.schedulerMeta.topic as NonNullable<FSRSCard['schedulerMeta']>['topic'] }
    : undefined;
  return {
    ok: true,
    state: {
      schemaVersion: 1,
      schedulerType: 'a-factor-v2',
      common,
      topic: {
        aFactor,
        schedulerMeta,
      },
    },
  };
}

function overlayState(card: FSRSCard, state: AlgorithmCardStateJson): FSRSCard {
  const common = state.common;
  const next: FSRSCard = {
    ...card,
    schedulerType: state.schedulerType,
    due: common.due,
    state: common.state as FSRSCard['state'],
    reps: common.reps,
    lapses: common.lapses,
    lastReview: common.lastReview,
    elapsedDays: common.elapsedDays,
    scheduledDays: common.scheduledDays,
    learning_step: common.learning_step,
  };

  if (state.schedulerType === 'a-factor-v2') {
    next.aFactor = state.topic?.aFactor ?? DEFAULT_A_FACTOR;
    next.schedulerMeta = state.topic?.schedulerMeta;
  } else {
    next.stability = state.fsrs?.stability ?? next.stability;
    next.difficulty = state.fsrs?.difficulty ?? next.difficulty;
    delete next.aFactor;
    delete next.schedulerMeta;
  }

  return next;
}

function readCommon(value: Record<string, unknown>): AlgorithmCardStateCommon | null {
  const due = numberOrInvalid(value.due);
  const state = numberOrInvalid(value.state);
  const reps = numberOrInvalid(value.reps);
  const lapses = numberOrInvalid(value.lapses);
  const lastReview = numberOrInvalid(value.lastReview);
  const elapsedDays = numberOrInvalid(value.elapsedDays);
  const scheduledDays = numberOrInvalid(value.scheduledDays);
  if (
    due === null
    || state === null
    || reps === null
    || lapses === null
    || lastReview === null
    || elapsedDays === null
    || scheduledDays === null
  ) {
    return null;
  }
  const common: AlgorithmCardStateCommon = {
    due,
    state,
    reps,
    lapses,
    lastReview,
    elapsedDays,
    scheduledDays,
  };
  const learningStep = numberOrInvalid(value.learning_step);
  if (learningStep !== null) {
    common.learning_step = learningStep;
  }
  return common;
}

function numberOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function numberOrInvalid(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
