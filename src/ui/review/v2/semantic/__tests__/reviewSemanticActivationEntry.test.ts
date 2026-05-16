import { describe, expect, it, vi } from 'vitest';
import { startSemanticActivationFromReviewConcept } from '../reviewSemanticActivationEntry';
import { createEmptyReviewUIState } from '../../types';
import type { BackendSemanticCommandResult } from '../../../../../../packages/contracts/src/backend-rpc';

const t = (_key: string, fallback: string) => fallback;

function content() {
  return {
    ...createEmptyReviewUIState().content,
    type: 'protyle' as const,
    id: 'concept-block',
    data: 'Concept title',
    card: {
      id: 'card-1',
      blockId: 'concept-block',
      deckId: 'deck-1',
      content: 'Concept title',
      fullContent: 'Concept preview',
      meta: {},
    } as never,
  };
}

function okStartResult(): BackendSemanticCommandResult {
  return {
    status: 'ok',
    commandId: 'cmd-1',
    writerInstanceId: 'writer-1',
    changed: { semanticSessionIds: ['semantic-session-1'] },
    diagnosticEventId: 'diag-1',
    session: {
      sessionId: 'semantic-session-1',
      rootFocusNodeId: 'concept-block',
      currentNodeId: 'concept-block',
      activeLens: 'assimilation',
      narrativePath: [{
        nodeId: 'concept-block',
        lens: 'assimilation',
        eventId: 'event-1',
        visitedAt: 1,
      }],
      startedAt: 1,
      endedAt: null,
    },
  };
}

function controller(startResult: BackendSemanticCommandResult = okStartResult()) {
  return {
    startSessionFromReviewConcept: vi.fn(async () => startResult),
    followCandidate: vi.fn(async () => okStartResult()),
    recordImplicitNodeAction: vi.fn(async () => okStartResult()),
    createStation: vi.fn(async () => okStartResult()),
    acceptRelation: vi.fn(async () => okStartResult()),
    rejectRelation: vi.fn(async () => okStartResult()),
    ignoreRelation: vi.fn(async () => okStartResult()),
    markIrrelevant: vi.fn(async () => okStartResult()),
  };
}

describe('reviewSemanticActivationEntry', () => {
  it('starts from a Concept focus and returns a Review overlay entry', async () => {
    const semanticController = controller();
    const showMessage = vi.fn();

    const result = await startSemanticActivationFromReviewConcept({
      controller: semanticController,
      content: content(),
      conceptFocus: { focusBlockId: 'concept-block' },
      t,
      showMessage,
    });

    expect(result.status).toBe('started');
    expect(semanticController.startSessionFromReviewConcept).toHaveBeenCalledWith('concept-block');
    expect(result.entry?.overlay).toMatchObject({
      component: 'SemanticActivationSurface',
      layout: 'cover',
    });
    expect(result.entry?.model.session.activeLens).toBe('assimilation');
    expect(result.entry?.model.currentNode.canGrade).toBe(false);
  });

  it('does not create a session when the current item has no Concept focus', async () => {
    const semanticController = controller();
    const showMessage = vi.fn();

    const result = await startSemanticActivationFromReviewConcept({
      controller: semanticController,
      content: content(),
      conceptFocus: null,
      t,
      showMessage,
    });

    expect(result.status).toBe('unavailable');
    expect(semanticController.startSessionFromReviewConcept).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('Semantic Activation needs a Concept review context.', 3000, 'error');
  });

  it('does not render fake overlay state when writer-owned start is unavailable', async () => {
    const semanticController = controller({
      status: 'unavailable',
      unavailableReason: 'writer-unavailable',
      message: 'WRITER_UNAVAILABLE: no active writer',
      diagnosticEventId: 'diag-unavailable',
    });
    const showMessage = vi.fn();

    const result = await startSemanticActivationFromReviewConcept({
      controller: semanticController,
      content: content(),
      conceptFocus: { focusBlockId: 'concept-block' },
      t,
      showMessage,
    });

    expect(result.status).toBe('unavailable');
    expect(result.entry).toBeUndefined();
    expect(showMessage).toHaveBeenCalledWith('WRITER_UNAVAILABLE: no active writer', 3000, 'error');
  });

  it('routes overlay emitted actions to Semantic controller commands', async () => {
    const semanticController = controller();
    const result = await startSemanticActivationFromReviewConcept({
      controller: semanticController,
      content: content(),
      conceptFocus: { focusBlockId: 'concept-block' },
      aiRelations: [{
        relationId: 'relation-1',
        fromNodeId: 'concept-block',
        toNodeId: 'candidate-1',
        confidence: 0.7,
        reason: 'related',
      }],
      t,
      showMessage: vi.fn(),
    });

    const props = result.entry?.overlay.props as Record<string, (...args: never[]) => void>;
    props.onFollow?.('candidate-1' as never, 'free' as never);
    props.onImplicitAction?.('implicit-1' as never, 'expand' as never, 'free' as never);
    props.onCreateStation?.('path' as never);
    props.onRelationDecision?.('relation-1' as never, 'accepted' as never);

    expect(semanticController.followCandidate).toHaveBeenCalledWith('candidate-1', 'free');
    expect(semanticController.recordImplicitNodeAction).toHaveBeenCalledWith('implicit-1', 'expand', 'free');
    expect(semanticController.createStation).toHaveBeenCalledWith('path');
    expect(semanticController.acceptRelation).toHaveBeenCalledWith(expect.objectContaining({ relationId: 'relation-1' }));
  });
});
