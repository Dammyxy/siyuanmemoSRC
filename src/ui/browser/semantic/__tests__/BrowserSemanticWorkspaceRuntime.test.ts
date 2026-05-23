import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';
import type {
  BackendSemanticBrowserReadRequest,
  BackendSemanticCommandRequest,
} from '../../../../../packages/contracts/src/backend-rpc';
import { createBrowserSemanticWorkspaceRuntime } from '../BrowserSemanticWorkspaceRuntime';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function conceptCard(blockId = 'concept-root'): BrowserCard {
  return {
    id: `card-${blockId}`,
    fsrsCardId: `card-${blockId}`,
    blockId,
    deckId: 'deck-1',
    content: 'Concept Root',
    fullContent: 'Concept Root',
    rootId: 'doc-1',
    state: 0,
    stateLabel: 'New',
    due: new Date(0),
    dueFormatted: '',
    stability: 1,
    difficulty: 1,
    retrievability: 0.5,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 0,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 0,
    suspended: false,
    tags: [],
    note: '',
    cardType: 'concept',
  };
}

function semanticNode(nodeId: string) {
  return {
    nodeId,
    nodeType: 'concept' as const,
    title: 'Visible Semantic Root',
    preview: 'Semantic preview',
    location: { blockId: nodeId },
  };
}

function semanticSession(sessionId = 'semantic-session-1', rootNodeId = 'concept-root') {
  return {
    sessionId,
    rootFocusNodeId: rootNodeId,
    currentNodeId: rootNodeId,
    activeLens: 'assimilation' as const,
    narrativePath: [{ nodeId: rootNodeId, lens: 'assimilation' as const, eventId: 'event-root', visitedAt: 1 }],
    startedAt: 1,
    endedAt: null,
  };
}

function createRuntime(options: {
  loadRootCard?: (nodeId: string) => Promise<BrowserCard | null>;
  openSemanticReviewSession?: (options: {
    sessionId: string;
    currentNodeId: string;
    focusBlockId?: string;
  }) => Promise<void> | void;
} = {}) {
  const execute = vi.fn(async (request: BackendSemanticCommandRequest) => ({
    status: 'ok' as const,
    commandId: request.requestId,
    writerInstanceId: 'writer-1',
    changed: {},
    session: semanticSession('semantic-session-1', request.command.type === 'start-session' ? request.command.rootFocusNodeId : 'concept-root'),
    diagnosticEventId: 'semantic-command-ok',
  }));
  const read = vi.fn(async (request: BackendSemanticBrowserReadRequest) => {
    if (request.rootFocusNodeId) {
      return {
        status: 'ok' as const,
        requestId: request.requestId,
        activeSession: null,
        session: null,
        rootNode: null,
        currentNode: null,
        candidates: { assimilation: [], accommodation: [], free: [] },
        stations: [],
        stationNodes: [],
        rootScopedStations: [],
        diagnosticEventId: 'semantic-active-root-read',
      };
    }
    const session = semanticSession(String(request.sessionId || 'semantic-session-1'));
    const rootNode = semanticNode(session.rootFocusNodeId);
    return {
      status: 'ok' as const,
      requestId: request.requestId,
      activeSession: session,
      session,
      rootNode,
      currentNode: rootNode,
      candidates: { assimilation: [], accommodation: [], free: [] },
      stations: [],
      stationNodes: [],
      rootScopedStations: [],
      diagnosticEventId: 'semantic-read-model',
    };
  });
  const pushErrMsg = vi.fn(async () => undefined);
  const openSemanticReviewSession = vi.fn(options.openSemanticReviewSession ?? (async () => undefined));
  const runtime = createBrowserSemanticWorkspaceRuntime({
    getCommandClient: () => ({ execute }),
    getReadClient: () => ({ read }),
    loadRootCard: options.loadRootCard ?? (async (nodeId) => conceptCard(nodeId)),
    openSemanticReviewSession: options.openSemanticReviewSession ? openSemanticReviewSession : undefined,
    pushErrMsg,
    t,
  });
  return {
    execute,
    read,
    pushErrMsg,
    openSemanticReviewSession,
    runtime,
  };
}

describe('BrowserSemanticWorkspaceRuntime', () => {
  it('starts Semantic root exploration from a Neural concept-pool root', async () => {
    const loadRootCard = vi.fn(async (nodeId: string) => conceptCard(nodeId));
    const { execute, runtime } = createRuntime({ loadRootCard });

    await runtime.startFromNeuralRoot('concept-root');

    expect(loadRootCard).toHaveBeenCalledWith('concept-root');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      callerIntent: 'semantic.browser-concept.start',
      command: expect.objectContaining({
        type: 'start-session',
        rootFocusNodeId: 'concept-root',
      }),
    }));
    expect(runtime.state.value).toMatchObject({
      status: 'ready',
      activeSessionId: 'semantic-session-1',
      model: {
        rootNode: { nodeId: 'concept-root' },
      },
    });
  });

  it('returns explicit unavailable state when a Neural root cannot resolve to a Browser card', async () => {
    const { runtime } = createRuntime({
      loadRootCard: async () => null,
    });

    await runtime.startFromNeuralRoot('missing-root');

    expect(runtime.state.value).toMatchObject({
      status: 'unavailable',
      unavailable: {
        reason: 'focus-unavailable',
        message: 'browserSemanticRootUnavailable:Semantic root cannot be resolved from this concept pool item.',
      },
    });
  });

  it('keeps Review handoff explicit when no Review Semantic surface is wired', async () => {
    const { pushErrMsg, runtime } = createRuntime();

    await runtime.startFromNeuralRoot('concept-root');
    await runtime.openInReview();

    expect(pushErrMsg).toHaveBeenCalledWith('browserSemanticReviewHandoffUnavailable:Review Semantic handoff is not wired yet; continue in Browser Semantic Review.');
    expect(runtime.state.value).toMatchObject({
      status: 'unavailable',
      unavailable: {
        reason: 'session-unavailable',
      },
    });
  });
});
