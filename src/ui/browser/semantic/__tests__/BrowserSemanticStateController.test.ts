import { describe, expect, it, vi } from 'vitest';
import { BrowserSemanticStateController } from '../BrowserSemanticStateController';
import type { BrowserSemanticReadModel } from '../types';
import type { SemanticNodePresentation } from '@/core/semantic/SemanticActivationPresentation';

function presentation(nodeId: string, title: string, nodeType: SemanticNodePresentation['nodeType']): SemanticNodePresentation {
  const isReviewCard = nodeType === 'real-review-card';
  const isImplicitKnowledge = nodeType === 'implicit-knowledge';
  const isConceptNode = nodeType === 'concept';
  return {
    nodeId,
    nodeType,
    title,
    preview: `${title} preview`,
    breadcrumb: [],
    backlinkBlockIds: [],
    blockId: nodeId,
    cardId: isReviewCard ? `card-${nodeId}` : null,
    isReviewCard,
    isImplicitKnowledge,
    isConceptNode,
    readOnly: isImplicitKnowledge,
    canReveal: isReviewCard,
    canGrade: isReviewCard,
    canSchedule: isReviewCard,
    canAutoCreateCard: false,
    actions: [],
  };
}

function model(sessionId = 'session-1', currentNodeId = 'current'): BrowserSemanticReadModel {
  return {
    status: 'ready',
    session: {
      sessionId,
      rootFocusNodeId: 'root',
      currentNodeId,
      activeLens: 'assimilation',
      narrativePath: [{ nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
      startedAt: 1,
      endedAt: null,
    },
    rootNode: presentation('root', 'Root', 'concept'),
    currentNode: presentation(currentNodeId, 'Current', 'implicit-knowledge'),
    path: [{ nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
    candidates: { assimilation: [], accommodation: [], free: [] },
    candidateState: 'empty',
    emptyReason: 'empty',
    nodeStations: [],
    pathStations: [],
  };
}

describe('BrowserSemanticStateController', () => {
  it('starts, follows, creates stations, archives, restores path stations, and ends through entry controller', async () => {
    const entryController = {
      startFromBrowserCard: vi.fn(async () => ({
        status: 'ready' as const,
        focus: { rootFocusNodeId: 'root', title: 'Root', sourceCard: {} as never },
        restored: false,
        commandResult: null,
        model: model('session-1', 'root'),
      })),
      followCandidate: vi.fn(async () => ({ status: 'ok' as const, commandResult: {} as never, model: model('session-1', 'candidate') })),
      createStation: vi.fn(async () => ({ status: 'ok' as const, commandResult: {} as never, model: model() })),
      archiveStation: vi.fn(async () => ({ status: 'ok' as const, commandResult: {} as never, model: model() })),
      restorePathStation: vi.fn(async () => ({ status: 'ok' as const, commandResult: {} as never, model: model('session-1', 'path-end') })),
      endSession: vi.fn(async () => ({ status: 'ok' as const, commandResult: {} as never, model: null })),
    };
    const controller = new BrowserSemanticStateController({ entryController });

    await controller.start({ blockId: 'root' } as never);
    expect(controller.state).toMatchObject({ status: 'ready', activeSessionId: 'session-1' });

    await controller.followCandidate('candidate', 'free');
    expect(entryController.followCandidate).toHaveBeenCalledWith('session-1', 'candidate', 'free');

    await controller.createStation('node');
    expect(entryController.createStation).toHaveBeenCalledWith('session-1', 'node');

    await controller.archiveStation('station-1');
    expect(entryController.archiveStation).toHaveBeenCalledWith('session-1', 'station-1');

    await controller.restorePathStation('station-path');
    expect(entryController.restorePathStation).toHaveBeenCalledWith('session-1', 'station-path');
    expect(controller.state.model?.session.currentNodeId).toBe('path-end');

    await controller.openNodeStation('station-node');
    expect(entryController.followCandidate).toHaveBeenCalledWith('session-1', 'station-node', 'assimilation');

    await controller.endSession();
    expect(entryController.endSession).toHaveBeenCalledWith('session-1');
    expect(controller.state).toMatchObject({ status: 'idle', activeSessionId: null, model: null });
  });

  it('preserves session/current node for continue-exploration handoff', async () => {
    const openReviewSession = vi.fn();
    const controller = new BrowserSemanticStateController({
      entryController: {
        startFromBrowserCard: vi.fn(async () => ({
          status: 'ready' as const,
          focus: { rootFocusNodeId: 'root', title: 'Root', sourceCard: {} as never },
          restored: false,
          commandResult: null,
          model: {
            ...model('session-review', 'current-review'),
            currentNode: presentation('current-review', 'Current Review', 'real-review-card'),
          },
        })),
        followCandidate: vi.fn(),
        createStation: vi.fn(),
        archiveStation: vi.fn(),
        restorePathStation: vi.fn(),
        endSession: vi.fn(),
      },
      openReviewSession,
    });

    await controller.start({ blockId: 'root' } as never);
    await controller.openInReview();

    expect(openReviewSession).toHaveBeenCalledWith({
      sessionId: 'session-review',
      currentNodeId: 'current-review',
      blockId: 'current-review',
      cardId: 'card-current-review',
      isReviewCard: true,
    });
  });
});
