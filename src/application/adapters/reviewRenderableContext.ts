import type { FSRSCard } from '@/types/card';
import type { SchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import { buildSchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import {
  buildProgressiveDisclosureState,
  type ProgressiveContentPayloadIdentity,
  type ProgressiveDisclosureState,
  type ProgressiveSourceAvailability,
  type ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import {
  buildReviewRenderableRenderPolicy,
  type ReviewRenderableRenderPolicy,
} from './reviewRenderableRenderPolicy';

export type ReviewRenderableTargetKind =
  | 'standard-card'
  | 'topic-derived-item'
  | 'progressive-excerpt'
  | 'source-location'
  | 'unknown';

export type ReviewRenderableAction =
  | 'answer'
  | 'edit'
  | 'advance'
  | 'defer'
  | 'convert'
  | 'skip'
  | 'back';

export interface ReviewRenderableContext {
  version: 1;
  targetKind: ReviewRenderableTargetKind;
  targetIdentity: {
    cardId: string;
    blockId: string;
    deckId: string;
  };
  schedulerSnapshot: SchedulerStateSnapshot | null;
  sourceLineage: ProgressiveSourceLineage | null;
  progressiveDisclosure: ProgressiveDisclosureState | null;
  renderPayload: {
    contentBlockId: string;
    answerBlockId: string;
    cardType: FSRSCard['type'] | null;
    meta: Record<string, unknown>;
  };
  renderPolicy: ReviewRenderableRenderPolicy;
  allowedActions: ReviewRenderableAction[];
  diagnostics: string[];
  unavailable: {
    reason?: string;
    source?: ProgressiveSourceAvailability['status'];
    writer?: 'unavailable' | 'available' | 'not-required';
    backend?: 'unavailable' | 'available' | 'not-required';
  };
  sourcePayloadIdentity?: ProgressiveContentPayloadIdentity | null;
}

export interface ReviewRenderableCommand {
  version: 1;
  commandId: string;
  action: ReviewRenderableAction;
  targetIdentity: ReviewRenderableContext['targetIdentity'];
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

export interface ReviewProgressiveRenderableMetadata {
  sourceLineage: ProgressiveSourceLineage | null;
  disclosureState: ProgressiveDisclosureState | null;
  payloadIdentity: ProgressiveContentPayloadIdentity | null;
  sourceAvailability: ProgressiveSourceAvailability | null;
}

export function buildReviewRenderableContext(input: {
  card: FSRSCard | null;
  queueType: string;
  showAnswer: boolean;
  contentBlockId: string;
  answerBlockId: string;
  diagnostics?: string[];
  progressive?: {
    sourceLineage?: ProgressiveSourceLineage | null;
    disclosureState?: ProgressiveDisclosureState | null;
    payloadIdentity?: ProgressiveContentPayloadIdentity | null;
    sourceAvailability?: ProgressiveSourceAvailability | null;
  } | null;
  schedulerSnapshot?: SchedulerStateSnapshot | null;
  renderPolicy?: ReviewRenderableRenderPolicy | null;
}): ReviewRenderableContext {
  const card = input.card;
  const progressive = input.progressive ?? null;
  const targetKind = progressive?.sourceLineage
    ? 'progressive-excerpt'
    : card?.meta?.source === 'topic-derived'
      ? 'topic-derived-item'
      : card
        ? 'standard-card'
        : 'unknown';

  const sourceLineage = progressive?.sourceLineage ?? null;
  const disclosure = progressive?.disclosureState ?? (sourceLineage ? buildProgressiveDisclosureState('created') : null);
  const sourceAvailability = progressive?.sourceAvailability ?? null;
  const diagnostics = [...(input.diagnostics ?? [])];
  if (sourceAvailability && sourceAvailability.status !== 'current') {
    diagnostics.push(`source-${sourceAvailability.status}`);
  }
  const renderPolicy = input.renderPolicy ?? buildReviewRenderableRenderPolicy(card, {
    contentBlockId: input.contentBlockId,
    answerBlockId: input.answerBlockId,
  });
  diagnostics.push(...renderPolicy.diagnostics);

  return {
    version: 1,
    targetKind,
    targetIdentity: {
      cardId: card?.id || '',
      blockId: card?.blockId || '',
      deckId: (card as (FSRSCard & { deckID?: string; deckId?: string }) | null)?.deckID
        ?? (card as (FSRSCard & { deckID?: string; deckId?: string }) | null)?.deckId
        ?? '',
    },
    schedulerSnapshot: input.schedulerSnapshot ?? (card ? buildSchedulerStateSnapshot(card) : null),
    sourceLineage,
    progressiveDisclosure: disclosure,
    renderPayload: {
      contentBlockId: input.contentBlockId,
      answerBlockId: input.answerBlockId,
      cardType: card?.type ?? null,
      meta: card?.meta ? { ...card.meta } : {},
    },
    renderPolicy,
    allowedActions: buildAllowedActions({
      showAnswer: input.showAnswer,
      targetKind,
      queueType: input.queueType,
      answerBlockId: input.answerBlockId,
    }),
    diagnostics,
    unavailable: {
      reason: sourceAvailability?.status && sourceAvailability.status !== 'current'
        ? `source-${sourceAvailability.status}`
        : undefined,
      source: sourceAvailability?.status ?? undefined,
      writer: 'not-required',
      backend: 'not-required',
    },
    sourcePayloadIdentity: progressive?.payloadIdentity ?? null,
  };
}

export function normalizeReviewProgressiveRenderMetadata(card: FSRSCard): ReviewProgressiveRenderableMetadata {
  const meta = isRecord(card.meta) ? card.meta : {};
  const progressive = isRecord(meta.progressive) ? meta.progressive : {};
  return {
    sourceLineage: readProgressiveSourceLineage(progressive.sourceLineage)
      ?? buildLegacyProgressiveSourceLineage(card, progressive),
    disclosureState: readProgressiveDisclosureState(progressive.disclosureState),
    payloadIdentity: readProgressivePayloadIdentity(progressive.payloadIdentity),
    sourceAvailability: readProgressiveSourceAvailability(progressive.sourceAvailability),
  };
}

function readProgressiveSourceLineage(value: unknown): ProgressiveSourceLineage | null {
  if (!isRecord(value)) {
    return null;
  }
  const optionalParentTopicCardId = readOptionalString(value.parentTopicCardId);
  const optionalParentExcerptId = readOptionalString(value.parentExcerptId);
  const optionalSessionId = readOptionalString(value.sessionId);
  const optionalMode = value.mode === 'linear' || value.mode === 'nonlinear' ? value.mode : undefined;
  if (
    value.version !== 1
    || !isProgressiveContentAuthority(value.authority)
    || !isProgressiveRootKind(value.rootKind)
    || !isProgressiveLogicalParentType(value.logicalParentType)
    || !isNonEmptyString(value.sourceDocId)
    || !isNonEmptyString(value.rootDocId)
    || !isNonEmptyString(value.sourceBlockId)
    || !isStringArray(value.sourceBlockIds)
    || !isNonEmptyString(value.logicalParentId)
  ) {
    return null;
  }
  return {
    version: 1,
    authority: value.authority,
    sourceDocId: value.sourceDocId,
    rootDocId: value.rootDocId,
    rootKind: value.rootKind,
    sourceBlockId: value.sourceBlockId,
    sourceBlockIds: value.sourceBlockIds,
    logicalParentId: value.logicalParentId,
    logicalParentType: value.logicalParentType,
    ...(optionalParentTopicCardId ? { parentTopicCardId: optionalParentTopicCardId } : {}),
    ...(optionalParentExcerptId ? { parentExcerptId: optionalParentExcerptId } : {}),
    ...(optionalSessionId ? { sessionId: optionalSessionId } : {}),
    ...(optionalMode ? { mode: optionalMode } : {}),
  };
}

function readProgressiveDisclosureState(value: unknown): ProgressiveDisclosureState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.version !== 1
    || !isProgressiveDisclosureStatus(value.state)
    || value.formalSchedulerMutation !== false
  ) {
    return null;
  }
  return {
    version: 1,
    state: value.state,
    formalSchedulerMutation: false,
  };
}

function readProgressivePayloadIdentity(value: unknown): ProgressiveContentPayloadIdentity | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.version !== 1
    || value.algorithm !== 'fnv1a32'
    || !isNonEmptyString(value.hash)
    || !isStringArray(value.sourceBlockIds)
    || !isNonNegativeFiniteNumber(value.textLength)
    || !isNonNegativeFiniteNumber(value.domLength)
  ) {
    return null;
  }
  return {
    version: 1,
    algorithm: 'fnv1a32',
    hash: value.hash,
    sourceBlockIds: value.sourceBlockIds,
    textLength: value.textLength,
    domLength: value.domLength,
  };
}

function readProgressiveSourceAvailability(value: unknown): ProgressiveSourceAvailability | null {
  if (!isRecord(value)) {
    return null;
  }
  const currentPayloadHash = readOptionalString(value.currentPayloadHash);
  if (
    !isProgressiveSourceAvailabilityStatus(value.status)
    || !isNonEmptyString(value.expectedPayloadHash)
    || !isStringArray(value.missingBlockIds)
    || !isStringArray(value.detachedBlockIds)
    || !isStringArray(value.diagnostics)
  ) {
    return null;
  }
  return {
    status: value.status,
    expectedPayloadHash: value.expectedPayloadHash,
    ...(currentPayloadHash ? { currentPayloadHash } : {}),
    missingBlockIds: value.missingBlockIds,
    detachedBlockIds: value.detachedBlockIds,
    diagnostics: value.diagnostics,
  };
}

function buildLegacyProgressiveSourceLineage(
  card: FSRSCard,
  progressive: Record<string, unknown>,
): ProgressiveSourceLineage | null {
  const sourceBlockId = normalizeBlockId(progressive.sourceBlockId) || normalizeBlockId(card.extractedFrom);
  const sourceDocId = normalizeBlockId(progressive.sourceDocId);
  if (!sourceBlockId && !sourceDocId) {
    return null;
  }
  const sourceBlockIds = Array.isArray(progressive.sourceBlockIds)
    ? progressive.sourceBlockIds.map(normalizeBlockId).filter(Boolean)
    : sourceBlockId
      ? [sourceBlockId]
      : [];
  const parentTopicCardId = normalizeBlockId(progressive.parentTopicCardId);
  const parentExcerptId = normalizeBlockId(progressive.parentExcerptId);
  const sessionId = normalizeBlockId(progressive.sessionId);
  return {
    version: 1,
    authority: 'siyuan-block',
    sourceDocId: sourceDocId || normalizeBlockId(card.blockId),
    rootDocId: sourceDocId || normalizeBlockId(card.blockId),
    rootKind: progressive.kind === 'piece'
      ? 'piece'
      : progressive.kind === 'excerpt'
        ? 'excerpt-doc'
        : 'ordinary-doc',
    sourceBlockId: sourceBlockId || normalizeBlockId(card.blockId),
    sourceBlockIds,
    logicalParentId: parentExcerptId || parentTopicCardId || sourceDocId || normalizeBlockId(card.blockId),
    logicalParentType: parentExcerptId ? 'excerpt' : parentTopicCardId ? 'topic' : 'root-doc',
    ...(parentTopicCardId ? { parentTopicCardId } : {}),
    ...(parentExcerptId ? { parentExcerptId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(progressive.mode === 'linear' || progressive.mode === 'nonlinear' ? { mode: progressive.mode } : {}),
  };
}

function normalizeBlockId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown): string | null {
  const normalized = normalizeBlockId(value);
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProgressiveContentAuthority(value: unknown): value is ProgressiveSourceLineage['authority'] {
  return value === 'siyuan-block' || value === 'xiuyuan-aggregate';
}

function isProgressiveRootKind(value: unknown): value is ProgressiveSourceLineage['rootKind'] {
  return value === 'ordinary-doc'
    || value === 'piece'
    || value === 'excerpt-doc'
    || value === 'excerpt-block'
    || value === 'topic-doc';
}

function isProgressiveLogicalParentType(value: unknown): value is ProgressiveSourceLineage['logicalParentType'] {
  return value === 'root-doc' || value === 'topic' || value === 'excerpt';
}

function isProgressiveDisclosureStatus(value: unknown): value is ProgressiveDisclosureState['state'] {
  return value === 'created'
    || value === 'pending'
    || value === 'active'
    || value === 'completed'
    || value === 'deferred';
}

function isProgressiveSourceAvailabilityStatus(value: unknown): value is ProgressiveSourceAvailability['status'] {
  return value === 'current'
    || value === 'stale'
    || value === 'missing'
    || value === 'detached';
}

function buildAllowedActions(input: {
  showAnswer: boolean;
  targetKind: ReviewRenderableTargetKind;
  queueType: string;
  answerBlockId: string;
}): ReviewRenderableAction[] {
  const actions: ReviewRenderableAction[] = [];
  if (input.targetKind === 'progressive-excerpt') {
    actions.push('advance', 'defer', 'convert');
  } else if (input.targetKind === 'topic-derived-item') {
    actions.push('advance', 'defer', 'convert');
  } else if (input.targetKind === 'standard-card') {
    actions.push('answer', 'edit', 'skip', 'back');
  } else {
    actions.push('skip');
  }

  if (!input.showAnswer && input.answerBlockId) {
    actions.unshift('answer');
  }

  void input.queueType;
  return dedupe(actions);
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function buildReviewRenderableCommand(input: {
  context: ReviewRenderableContext;
  action: ReviewRenderableAction;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}): ReviewRenderableCommand {
  if (!input.context.allowedActions.includes(input.action)) {
    throw new Error(`REVIEW_RENDER_COMMAND_UNAVAILABLE: action ${input.action} is not allowed for ${input.context.targetKind}`);
  }
  return {
    version: 1,
    commandId: `review-render:${input.context.targetIdentity.cardId || input.context.targetIdentity.blockId || 'unknown'}:${input.action}`,
    action: input.action,
    targetIdentity: { ...input.context.targetIdentity },
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    payload: input.payload ? { ...input.payload } : {},
  };
}
