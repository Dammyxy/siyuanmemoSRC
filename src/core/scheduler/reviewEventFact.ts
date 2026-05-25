import type {
  ReviewLogV2,
  ReviewLogV2CardSnapshot,
  ReviewLogV2CommitPolicy,
  ReviewLogV2QueueMode,
} from '@/types/review';
import type { Rating } from '@/types/card';

export type ReviewEventFactKind = 'formal' | 'non-formal';

export type ReviewEventFactExclusionReason =
  | 'preview-only'
  | 'drill-only'
  | 'drill'
  | 'custom-study'
  | 'non-formal-queue-mode'
  | 'non-write-schedule';

export type ReviewEventFactDataQualityStatus = 'complete' | 'partial' | 'low-quality';

export type ReviewEventFactDataQualityReason =
  | 'missing-event-id'
  | 'missing-card-id'
  | 'missing-attempt-id'
  | 'missing-reviewed-at'
  | 'missing-before-state'
  | 'missing-after-state';

export interface ReviewEventSchedulerStateFact {
  cardId: string;
  due: number | null;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  state: number | string;
  lastReview: number | null;
  elapsedDays: number | null;
  scheduledDays: number | null;
  learningStep: number | null;
  priority: number | null;
  cardType: number | string;
  schedulerType: string | null;
  aFactor: number | null;
}

export interface ReviewEventFactClassification {
  kind: ReviewEventFactKind;
  formal: boolean;
  exclusionReasons: ReviewEventFactExclusionReason[];
}

export interface ReviewEventFactDataQuality {
  status: ReviewEventFactDataQualityStatus;
  reasons: ReviewEventFactDataQualityReason[];
}

export interface ReviewEventFact {
  schemaVersion: 1;
  eventId: string;
  cardId: string;
  attemptId: string;
  rating: Rating | number | null;
  reviewedAt: number | null;
  commitIdempotencyKey: string | null;
  schedulerType: string | null;
  algorithm: string | null;
  queueType: string | null;
  queueMode: ReviewLogV2QueueMode | string | null;
  commitPolicy: ReviewLogV2CommitPolicy | string | null;
  source: string | null;
  classification: ReviewEventFactClassification;
  before: ReviewEventSchedulerStateFact | null;
  after: ReviewEventSchedulerStateFact | null;
  elapsedMs: number | null;
  dataQuality: ReviewEventFactDataQuality;
}

export interface ReviewEventFactDiagnosticSummary {
  schemaVersion: 1;
  eventId: string;
  cardId: string;
  attemptId: string;
  commitIdempotencyKey: string | null;
  schedulerType: string | null;
  algorithm: string | null;
  queueType: string | null;
  queueMode: ReviewLogV2QueueMode | string | null;
  commitPolicy: ReviewLogV2CommitPolicy | string | null;
  classification: ReviewEventFactClassification;
  dataQuality: ReviewEventFactDataQuality;
}

export type ReviewLogV2FactInput = Omit<Partial<ReviewLogV2>, 'before' | 'after'> & {
  before?: ReviewLogV2CardSnapshot | null;
  after?: ReviewLogV2CardSnapshot | null;
};

export function mapReviewLogV2ToReviewEventFact(log: ReviewLogV2FactInput): ReviewEventFact {
  const classification = classifyReviewLogV2Fact(log);
  const before = mapSchedulerState(log.before ?? null);
  const after = mapSchedulerState(log.after ?? null);
  const dataQuality = buildDataQuality(log, before, after);

  return {
    schemaVersion: 1,
    eventId: normalizeString(log.id),
    cardId: normalizeString(log.cardId),
    attemptId: normalizeString(log.attemptId),
    rating: normalizeRating(log.rating),
    reviewedAt: finiteNumberOrNull(log.reviewedAt),
    commitIdempotencyKey: normalizeNullableString(log.commitIdempotencyKey),
    schedulerType: normalizeNullableString(log.schedulerType),
    algorithm: normalizeNullableString(log.algorithm),
    queueType: normalizeNullableString(log.queueType),
    queueMode: normalizeNullableString(log.queueMode),
    commitPolicy: normalizeNullableString(log.commitPolicy),
    source: normalizeNullableString(log.source),
    classification,
    before,
    after,
    elapsedMs: finiteNumberOrNull(log.elapsedMs),
    dataQuality,
  };
}

export function classifyReviewLogV2Fact(log: ReviewLogV2FactInput): ReviewEventFactClassification {
  const reasons: ReviewEventFactExclusionReason[] = [];
  const commitPolicy = normalizeNullableString(log.commitPolicy);
  const queueMode = normalizeNullableString(log.queueMode);

  if (commitPolicy === 'preview-only') {
    reasons.push('preview-only');
  } else if (commitPolicy === 'drill-only') {
    reasons.push('drill-only');
  } else if (commitPolicy !== 'write-schedule') {
    reasons.push('non-write-schedule');
  }

  if (log.isDrill === true) {
    reasons.push('drill');
  }
  if (log.customStudy === true) {
    reasons.push('custom-study');
  }
  if (queueMode !== 'formal' && queueMode !== 'filtered-rescheduling') {
    reasons.push('non-formal-queue-mode');
  }

  const exclusionReasons = unique(reasons);
  return {
    kind: exclusionReasons.length === 0 ? 'formal' : 'non-formal',
    formal: exclusionReasons.length === 0,
    exclusionReasons,
  };
}

export function summarizeReviewEventFact(fact: ReviewEventFact): ReviewEventFactDiagnosticSummary {
  return {
    schemaVersion: fact.schemaVersion,
    eventId: fact.eventId,
    cardId: fact.cardId,
    attemptId: fact.attemptId,
    commitIdempotencyKey: fact.commitIdempotencyKey,
    schedulerType: fact.schedulerType,
    algorithm: fact.algorithm,
    queueType: fact.queueType,
    queueMode: fact.queueMode,
    commitPolicy: fact.commitPolicy,
    classification: fact.classification,
    dataQuality: fact.dataQuality,
  };
}

function buildDataQuality(
  log: ReviewLogV2FactInput,
  before: ReviewEventSchedulerStateFact | null,
  after: ReviewEventSchedulerStateFact | null,
): ReviewEventFactDataQuality {
  const reasons: ReviewEventFactDataQualityReason[] = [];
  if (!normalizeString(log.id)) {
    reasons.push('missing-event-id');
  }
  if (!normalizeString(log.cardId)) {
    reasons.push('missing-card-id');
  }
  if (!normalizeString(log.attemptId)) {
    reasons.push('missing-attempt-id');
  }
  if (finiteNumberOrNull(log.reviewedAt) === null) {
    reasons.push('missing-reviewed-at');
  }
  if (!before) {
    reasons.push('missing-before-state');
  }
  if (!after) {
    reasons.push('missing-after-state');
  }

  return {
    status: reasons.length === 0 ? 'complete' : (before ? 'partial' : 'low-quality'),
    reasons,
  };
}

function mapSchedulerState(snapshot: ReviewLogV2CardSnapshot | null): ReviewEventSchedulerStateFact | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const cardId = normalizeString(snapshot.id);
  if (!cardId) {
    return null;
  }
  return {
    cardId,
    due: finiteNumberOrNull(snapshot.due),
    stability: finiteNumberOrNull(snapshot.stability),
    difficulty: finiteNumberOrNull(snapshot.difficulty),
    reps: nonNegativeInteger(snapshot.reps),
    lapses: nonNegativeInteger(snapshot.lapses),
    state: snapshot.state,
    lastReview: finiteNumberOrNull(snapshot.lastReview),
    elapsedDays: finiteNumberOrNull(snapshot.elapsedDays),
    scheduledDays: finiteNumberOrNull(snapshot.scheduledDays),
    learningStep: finiteNumberOrNull(snapshot.learning_step),
    priority: finiteNumberOrNull(snapshot.priority),
    cardType: snapshot.type,
    schedulerType: normalizeNullableString(snapshot.schedulerType),
    aFactor: finiteNumberOrNull(snapshot.aFactor),
  };
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeRating(value: unknown): number | null {
  const rating = finiteNumberOrNull(value);
  return rating === null ? null : Math.max(1, Math.min(4, Math.floor(rating)));
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonNegativeInteger(value: unknown): number {
  const num = finiteNumberOrNull(value);
  return num !== null && num >= 0 ? Math.floor(num) : 0;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
