import { buildSchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import {
  buildProgressiveDisclosureState,
  type ProgressiveContentPayloadIdentity,
  type ProgressiveDisclosureState,
  type ProgressiveSourceAvailability,
  type ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewRenderableRenderPolicy,
  type ReviewRenderableRenderPolicy,
} from './reviewRenderableRenderPolicy';
import {
  unavailableReviewContentTarget,
  type ReviewContentTarget,
  type ReviewContentTargetAction,
  type ReviewContentTargetIdentity,
  type ReviewContentTargetKind,
  type ReviewContentTargetResolution,
} from './reviewContentTarget';

export interface LegacyReviewContentTargetInput {
  card: FSRSCard;
  queueType: string;
  showAnswer: boolean;
  contentBlockId: string;
  answerBlockId: string;
  rendererSupported?: boolean;
  diagnostics?: readonly string[];
  renderPolicy?: ReviewRenderableRenderPolicy;
}

interface ProgressiveMetadata {
  kind: string;
  sourceLineage: ProgressiveSourceLineage | null;
  disclosureState: ProgressiveDisclosureState | null;
  payloadIdentity: ProgressiveContentPayloadIdentity | null;
  sourceAvailability: ProgressiveSourceAvailability | null;
}

export function resolveLegacyReviewContentTarget(
  input: LegacyReviewContentTargetInput,
): ReviewContentTargetResolution {
  const card = input.card;
  const meta = readRecord(card.meta);
  const progressive = normalizeProgressiveMetadata(card, readRecord(meta.progressive));
  const evidence = collectTargetEvidence(meta, progressive);
  const identity = buildIdentity(card, input.contentBlockId, input.answerBlockId, progressive);

  if (evidence.length > 1) {
    return unavailableReviewContentTarget(
      'conflicting-evidence',
      evidence.map(kind => `target-evidence-${kind === 'topic-derived-item' ? 'topic-derived' : kind}`),
      null,
      identity,
    );
  }

  const kind = evidence[0] ?? 'standard-card';
  if (input.rendererSupported === false || !input.contentBlockId) {
    return unavailableReviewContentTarget(
      'unsupported-renderer',
      [...(input.diagnostics ?? []), 'unsupported-content-type'],
      kind,
      identity,
    );
  }

  const sourceAvailability = progressive.sourceAvailability;
  if (sourceAvailability?.status === 'missing' || sourceAvailability?.status === 'detached') {
    return unavailableReviewContentTarget(
      sourceAvailability.status === 'missing' ? 'source-missing' : 'source-detached',
      sourceAvailability.diagnostics.length > 0
        ? sourceAvailability.diagnostics
        : [`source-${sourceAvailability.status}`],
      kind,
      identity,
    );
  }

  const sourceLineage = requiresSourceLineage(kind)
    ? progressive.sourceLineage ?? buildLegacyProgressiveSourceLineage(card, readRecord(meta.progressive))
    : progressive.sourceLineage;
  if (requiresSourceLineage(kind) && !sourceLineage) {
    return unavailableReviewContentTarget(
      'insufficient-evidence',
      ['review-content-source-lineage-missing'],
      kind,
      identity,
    );
  }

  const disclosureState = progressive.disclosureState ?? buildProgressiveDisclosureState('created');
  const renderPolicy = input.renderPolicy ?? resolveLegacyReviewContentRenderPolicy(card, {
    contentBlockId: input.contentBlockId,
    answerBlockId: input.answerBlockId,
  });
  const diagnostics = dedupe([
    ...(input.diagnostics ?? []),
    ...(sourceAvailability?.diagnostics ?? []),
    ...(sourceAvailability?.status === 'stale' ? ['source-stale'] : []),
    ...renderPolicy.diagnostics,
  ]);
  const target: ReviewContentTarget = {
    version: 1,
    kind,
    identity,
    contentAuthority: kind === 'topic-derived-item'
      ? {
        kind: 'xiuyuan-aggregate',
        sourceId: normalizeString(card.xiuyuanID) || identity.cardId || identity.blockId,
      }
      : {
        kind: sourceLineage?.authority ?? 'siyuan-block',
        sourceId: sourceLineage?.sourceBlockId || identity.contentBlockId || identity.blockId,
      },
    classification: kind === 'standard-card'
      ? {
        kind: 'scheduled-card',
        formalSchedulerMutation: true,
        schedulerSnapshot: buildSchedulerStateSnapshot(card),
      }
      : kind === 'source-location'
        ? {
          kind: 'source-processing',
          formalSchedulerMutation: false,
          disclosureState,
        }
        : {
          kind: 'progressive-processing',
          formalSchedulerMutation: false,
          disclosureState,
        },
    renderIntent: {
      contentBlockId: input.contentBlockId,
      answerBlockId: input.answerBlockId,
      cardType: card.type,
      policy: renderPolicy,
    },
    supportedActions: buildSupportedActions(kind, input.showAnswer, input.answerBlockId),
    sourceLineage: sourceLineage ?? null,
    sourcePayloadIdentity: progressive.payloadIdentity,
    versionEvidence: {
      cardUpdatedAt: String(card.updatedAt ?? ''),
      ...(progressive.payloadIdentity?.hash
        ? { sourcePayloadHash: progressive.payloadIdentity.hash }
        : {}),
      ...(sourceAvailability?.expectedPayloadHash
        ? { expectedSourceHash: sourceAvailability.expectedPayloadHash }
        : {}),
      ...(sourceAvailability?.currentPayloadHash
        ? { currentSourceHash: sourceAvailability.currentPayloadHash }
        : {}),
      ...(sourceAvailability?.status
        ? { sourceStatus: sourceAvailability.status }
        : {}),
    },
    diagnostics,
  } as ReviewContentTarget;

  void input.queueType;
  return {
    status: 'ready',
    target,
  };
}

export function resolveLegacyReviewContentRenderPolicy(
  card: FSRSCard,
  context: {
    contentBlockId?: string | null;
    answerBlockId?: string | null;
    sourceContent?: string | null;
  } = {},
): ReviewRenderableRenderPolicy {
  return buildReviewRenderableRenderPolicy(card, context);
}

function collectTargetEvidence(
  meta: Record<string, unknown>,
  progressive: ProgressiveMetadata,
): ReviewContentTargetKind[] {
  const evidence: ReviewContentTargetKind[] = [];
  if (
    normalizeString(meta.source) === 'topic-derived'
    || normalizeString(meta.cardSource) === 'topic-derived'
    || progressive.kind === 'derived-item'
  ) {
    evidence.push('topic-derived-item');
  }
  if (progressive.kind === 'excerpt' || progressive.kind === 'excerpt-doc') {
    evidence.push('progressive-excerpt');
  }
  if (
    progressive.kind === 'piece'
    || progressive.kind === 'source-location'
    || progressive.kind === 'source-workbench'
  ) {
    evidence.push('source-location');
  }
  return dedupe(evidence);
}

function buildIdentity(
  card: FSRSCard,
  contentBlockId: string,
  answerBlockId: string,
  progressive: ProgressiveMetadata,
): ReviewContentTargetIdentity {
  const cardWithDeck = card as FSRSCard & { deckID?: string; deckId?: string };
  return {
    itemId: normalizeString(card.id) || normalizeString(card.blockId),
    cardId: normalizeString(card.id),
    blockId: normalizeString(card.blockId),
    deckId: normalizeString(cardWithDeck.deckID) || normalizeString(cardWithDeck.deckId),
    contentBlockId: normalizeString(contentBlockId),
    answerBlockId: normalizeString(answerBlockId),
    ...(progressive.kind === 'piece'
      ? {
        sourceLocationId: progressive.sourceLineage?.sourceBlockId
          || normalizeString(card.extractedFrom)
          || normalizeString(contentBlockId),
      }
      : {}),
  };
}

function buildSupportedActions(
  kind: ReviewContentTargetKind,
  showAnswer: boolean,
  answerBlockId: string,
): ReviewContentTargetAction[] {
  const actions: ReviewContentTargetAction[] = kind === 'standard-card'
    ? ['answer', 'edit', 'skip', 'back']
    : kind === 'source-location'
      ? ['answer', 'edit', 'open-source', 'advance', 'defer', 'convert', 'skip', 'back']
      : ['answer', 'open-source', 'advance', 'defer', 'convert', 'skip', 'back'];
  if (!showAnswer && answerBlockId) {
    actions.unshift('answer');
  }
  return dedupe(actions);
}

function requiresSourceLineage(kind: ReviewContentTargetKind): boolean {
  return kind === 'progressive-excerpt' || kind === 'source-location';
}

function normalizeProgressiveMetadata(
  card: FSRSCard,
  progressive: Record<string, unknown>,
): ProgressiveMetadata {
  return {
    kind: normalizeString(progressive.kind),
    sourceLineage: readProgressiveSourceLineage(progressive.sourceLineage)
      ?? buildLegacyProgressiveSourceLineage(card, progressive),
    disclosureState: readProgressiveDisclosureState(progressive.disclosureState),
    payloadIdentity: readProgressivePayloadIdentity(progressive.payloadIdentity),
    sourceAvailability: readProgressiveSourceAvailability(progressive.sourceAvailability),
  };
}

function readProgressiveSourceLineage(value: unknown): ProgressiveSourceLineage | null {
  const record = readRecord(value);
  const parentTopicCardId = readOptionalString(record.parentTopicCardId);
  const parentExcerptId = readOptionalString(record.parentExcerptId);
  const sessionId = readOptionalString(record.sessionId);
  const mode = record.mode === 'linear' || record.mode === 'nonlinear' ? record.mode : undefined;
  if (
    record.version !== 1
    || !isProgressiveContentAuthority(record.authority)
    || !isProgressiveRootKind(record.rootKind)
    || !isProgressiveLogicalParentType(record.logicalParentType)
    || !isNonEmptyString(record.sourceDocId)
    || !isNonEmptyString(record.rootDocId)
    || !isNonEmptyString(record.sourceBlockId)
    || !isStringArray(record.sourceBlockIds)
    || !isNonEmptyString(record.logicalParentId)
  ) {
    return null;
  }
  return {
    version: 1,
    authority: record.authority,
    sourceDocId: record.sourceDocId,
    rootDocId: record.rootDocId,
    rootKind: record.rootKind,
    sourceBlockId: record.sourceBlockId,
    sourceBlockIds: record.sourceBlockIds,
    logicalParentId: record.logicalParentId,
    logicalParentType: record.logicalParentType,
    ...(parentTopicCardId ? { parentTopicCardId } : {}),
    ...(parentExcerptId ? { parentExcerptId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(mode ? { mode } : {}),
  };
}

function readProgressiveDisclosureState(value: unknown): ProgressiveDisclosureState | null {
  const record = readRecord(value);
  if (
    record.version !== 1
    || !isProgressiveDisclosureStatus(record.state)
    || record.formalSchedulerMutation !== false
  ) {
    return null;
  }
  return {
    version: 1,
    state: record.state,
    formalSchedulerMutation: false,
  };
}

function readProgressivePayloadIdentity(value: unknown): ProgressiveContentPayloadIdentity | null {
  const record = readRecord(value);
  if (
    record.version !== 1
    || record.algorithm !== 'fnv1a32'
    || !isNonEmptyString(record.hash)
    || !isStringArray(record.sourceBlockIds)
    || !isNonNegativeFiniteNumber(record.textLength)
    || !isNonNegativeFiniteNumber(record.domLength)
  ) {
    return null;
  }
  return {
    version: 1,
    algorithm: 'fnv1a32',
    hash: record.hash,
    sourceBlockIds: record.sourceBlockIds,
    textLength: record.textLength,
    domLength: record.domLength,
  };
}

function readProgressiveSourceAvailability(value: unknown): ProgressiveSourceAvailability | null {
  const record = readRecord(value);
  const currentPayloadHash = readOptionalString(record.currentPayloadHash);
  if (
    !isProgressiveSourceAvailabilityStatus(record.status)
    || !isNonEmptyString(record.expectedPayloadHash)
    || !isStringArray(record.missingBlockIds)
    || !isStringArray(record.detachedBlockIds)
    || !isStringArray(record.diagnostics)
  ) {
    return null;
  }
  return {
    status: record.status,
    expectedPayloadHash: record.expectedPayloadHash,
    ...(currentPayloadHash ? { currentPayloadHash } : {}),
    missingBlockIds: record.missingBlockIds,
    detachedBlockIds: record.detachedBlockIds,
    diagnostics: record.diagnostics,
  };
}

function buildLegacyProgressiveSourceLineage(
  card: FSRSCard,
  progressive: Record<string, unknown>,
): ProgressiveSourceLineage | null {
  const sourceBlockId = normalizeString(progressive.sourceBlockId) || normalizeString(card.extractedFrom);
  const sourceDocId = normalizeString(progressive.sourceDocId);
  if (!sourceBlockId && !sourceDocId) {
    return null;
  }
  const sourceBlockIds = Array.isArray(progressive.sourceBlockIds)
    ? progressive.sourceBlockIds.map(normalizeString).filter(Boolean)
    : sourceBlockId
      ? [sourceBlockId]
      : [];
  const parentTopicCardId = normalizeString(progressive.parentTopicCardId);
  const parentExcerptId = normalizeString(progressive.parentExcerptId);
  const sessionId = normalizeString(progressive.sessionId);
  return {
    version: 1,
    authority: 'siyuan-block',
    sourceDocId: sourceDocId || normalizeString(card.blockId),
    rootDocId: sourceDocId || normalizeString(card.blockId),
    rootKind: progressive.kind === 'piece'
      ? 'piece'
      : progressive.kind === 'excerpt'
        ? 'excerpt-doc'
        : 'ordinary-doc',
    sourceBlockId: sourceBlockId || normalizeString(card.blockId),
    sourceBlockIds,
    logicalParentId: parentExcerptId || parentTopicCardId || sourceDocId || normalizeString(card.blockId),
    logicalParentType: parentExcerptId ? 'excerpt' : parentTopicCardId ? 'topic' : 'root-doc',
    ...(parentTopicCardId ? { parentTopicCardId } : {}),
    ...(parentExcerptId ? { parentExcerptId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(progressive.mode === 'linear' || progressive.mode === 'nonlinear'
      ? { mode: progressive.mode }
      : {}),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown): string | null {
  return normalizeString(value) || null;
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

function dedupe<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
