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
