import type { SchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import type {
  ProgressiveContentPayloadIdentity,
  ProgressiveDisclosureState,
  ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import type { FSRSCard } from '@/types/card';
import type {
  ReviewContentTarget,
  ReviewContentTargetAction,
  ReviewContentTargetIdentity,
  ReviewContentTargetKind,
  ReviewContentTargetResolution,
  ReviewContentTargetUnavailable,
} from './reviewContentTarget';
import type { ReviewRenderableRenderPolicy } from './reviewRenderableRenderPolicy';

export type ReviewRenderableTargetKind = ReviewContentTargetKind | 'unavailable';
export type ReviewRenderableAction = ReviewContentTargetAction;

export interface ReviewRenderableContext {
  version: 1;
  contentTarget: ReviewContentTarget | null;
  targetKind: ReviewRenderableTargetKind;
  targetIdentity: ReviewContentTargetIdentity;
  schedulerSnapshot: SchedulerStateSnapshot | null;
  sourceLineage: ProgressiveSourceLineage | null;
  progressiveDisclosure: ProgressiveDisclosureState | null;
  renderPayload: {
    contentBlockId: string;
    answerBlockId: string;
    cardType: FSRSCard['type'] | null;
  };
  renderPolicy: ReviewRenderableRenderPolicy | null;
  allowedActions: readonly ReviewRenderableAction[];
  diagnostics: readonly string[];
  unavailable: ReviewContentTargetUnavailable | null;
  sourcePayloadIdentity: ProgressiveContentPayloadIdentity | null;
}

export interface ReviewRenderableCommand {
  version: 1;
  commandId: string;
  action: ReviewRenderableAction;
  targetKind: ReviewContentTargetKind;
  targetIdentity: ReviewContentTargetIdentity;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

const EMPTY_IDENTITY: ReviewContentTargetIdentity = {
  itemId: '',
  cardId: '',
  blockId: '',
  deckId: '',
  contentBlockId: '',
  answerBlockId: '',
};

export function buildReviewRenderableContext(
  resolution: ReviewContentTargetResolution,
): ReviewRenderableContext {
  if (resolution.status === 'unavailable') {
    return {
      version: 1,
      contentTarget: null,
      targetKind: resolution.error.targetKind ?? 'unavailable',
      targetIdentity: resolution.error.identity ?? { ...EMPTY_IDENTITY },
      schedulerSnapshot: null,
      sourceLineage: null,
      progressiveDisclosure: null,
      renderPayload: {
        contentBlockId: resolution.error.identity?.contentBlockId ?? '',
        answerBlockId: resolution.error.identity?.answerBlockId ?? '',
        cardType: null,
      },
      renderPolicy: null,
      allowedActions: ['skip', 'back'],
      diagnostics: [...resolution.error.diagnostics],
      unavailable: resolution.error,
      sourcePayloadIdentity: null,
    };
  }

  const target = resolution.target;
  return {
    version: 1,
    contentTarget: target,
    targetKind: target.kind,
    targetIdentity: target.identity,
    schedulerSnapshot: target.classification.kind === 'scheduled-card'
      ? target.classification.schedulerSnapshot
      : null,
    sourceLineage: target.sourceLineage,
    progressiveDisclosure: target.classification.kind === 'scheduled-card'
      ? null
      : target.classification.disclosureState,
    renderPayload: {
      contentBlockId: target.renderIntent.contentBlockId,
      answerBlockId: target.renderIntent.answerBlockId,
      cardType: target.renderIntent.cardType,
    },
    renderPolicy: target.renderIntent.policy,
    allowedActions: target.supportedActions,
    diagnostics: target.diagnostics,
    unavailable: null,
    sourcePayloadIdentity: target.sourcePayloadIdentity,
  };
}

export function buildReviewRenderableCommand(input: {
  context: ReviewRenderableContext;
  action: ReviewRenderableAction;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}): ReviewRenderableCommand {
  const target = input.context.contentTarget;
  if (!target) {
    const unavailable = input.context.unavailable;
    if (
      unavailable?.targetKind
      && unavailable.identity
      && (input.action === 'skip' || input.action === 'back')
    ) {
      return {
        version: 1,
        commandId: `review-content:${unavailable.identity.itemId || unavailable.identity.blockId}:${input.action}`,
        action: input.action,
        targetKind: unavailable.targetKind,
        targetIdentity: { ...unavailable.identity },
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        payload: input.payload ? { ...input.payload } : {},
      };
    }
    throw new Error(
      `REVIEW_RENDER_COMMAND_UNAVAILABLE: action ${input.action} is not allowed for ${input.context.targetKind}`,
    );
  }
  if (!target.supportedActions.includes(input.action)) {
    throw new Error(
      `REVIEW_RENDER_COMMAND_UNAVAILABLE: action ${input.action} is not allowed for ${input.context.targetKind}`,
    );
  }
  return {
    version: 1,
    commandId: `review-content:${target.identity.itemId || target.identity.blockId}:${input.action}`,
    action: input.action,
    targetKind: target.kind,
    targetIdentity: { ...target.identity },
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    payload: input.payload ? { ...input.payload } : {},
  };
}
