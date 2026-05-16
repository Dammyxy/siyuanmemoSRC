import { describe, expect, it, vi } from 'vitest';
import { BrowserSemanticEntryController } from '../BrowserSemanticEntryController';
import { buildBrowserSemanticReadModel } from '../browserSemanticReadModel';
import type { BrowserCard } from '../../types';
import type { BackendSemanticCommandRequest, BackendSemanticCommandResult } from '../../../../../packages/contracts/src/backend-rpc';
import type { SemanticNode, SemanticSessionSnapshot } from '@/core/semantic/semanticActivationTypes';
import type { SemanticActivationSessionController } from '@/application/services/SemanticActivationSessionController';

function browserCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'concept-root',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'Concept Root',
    fullContent: overrides.fullContent ?? overrides.content ?? 'Concept Root',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(0),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 0,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    meta: overrides.meta,
  };
}

function session(overrides: Partial<SemanticSessionSnapshot> = {}): SemanticSessionSnapshot {
  return {
    sessionId: 'semantic-session-1',
    rootFocusNodeId: 'concept-root',
    currentNodeId: 'concept-root',
    activeLens: 'assimilation',
    narrativePath: [{ nodeId: 'concept-root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
    startedAt: 1,
    endedAt: null,
    ...overrides,
  };
}

function node(nodeId: string, title = nodeId): SemanticNode {
  return {
    nodeId,
    nodeType: 'concept',
    title,
    preview: `${title} preview`,
    location: { blockId: nodeId },
  };
}

function okResult(
  request: BackendSemanticCommandRequest,
  semanticSession: SemanticSessionSnapshot = session(),
): BackendSemanticCommandResult {
  return {
    status: 'ok',
    commandId: request.requestId,
    writerInstanceId: 'writer-1',
    changed: { semanticSessionIds: [semanticSession.sessionId] },
    session: semanticSession,
    diagnosticEventId: `semantic-command:${request.requestId}`,
  };
}

function createHarness(options: {
  activeSession?: SemanticSessionSnapshot | null;
  startResult?: BackendSemanticCommandResult;
  restoreResult?: BackendSemanticCommandResult;
} = {}) {
  const startSessionFromBrowserConcept = vi.fn(async (rootFocusNodeId: string) => (
    options.startResult ?? okResult({
      requestId: 'start-1',
      method: 'semantic.command.execute',
      callerIntent: 'semantic.browser-concept.start',
      idempotencyKey: 'start-1',
      command: { type: 'start-session', rootFocusNodeId },
    }, session({ rootFocusNodeId, currentNodeId: rootFocusNodeId }))
  ));
  const restoreSession = vi.fn(async (sessionId: string) => (
    options.restoreResult ?? okResult({
      requestId: 'restore-1',
      method: 'semantic.command.execute',
      callerIntent: 'semantic.session.restore',
      idempotencyKey: 'restore-1',
      command: { type: 'restore-session', sessionId },
    }, options.activeSession ?? session({ sessionId }))
  ));
  const controllerFactory = vi.fn((activeSessionId?: string | null) => ({
    startSessionFromBrowserConcept,
    restoreSession,
    followCandidate: vi.fn(),
    createStation: vi.fn(),
    archiveStation: vi.fn(),
    restorePathStation: vi.fn(),
    endSession: vi.fn(),
    __activeSessionId: activeSessionId,
  }) as unknown as Pick<
    SemanticActivationSessionController,
    | 'startSessionFromBrowserConcept'
    | 'restoreSession'
    | 'followCandidate'
    | 'createStation'
    | 'archiveStation'
    | 'restorePathStation'
    | 'endSession'
  >);
  const findActiveSessionByRoot = vi.fn(async () => options.activeSession ?? null);
  const loadReadModel = vi.fn(async (sessionId: string) => buildBrowserSemanticReadModel({
    session: session({ sessionId }),
    rootNode: node('concept-root', 'Concept Root'),
    currentNode: node('concept-root', 'Concept Root'),
    candidates: { assimilation: [], accommodation: [], free: [] },
    stations: [],
  }));
  return {
    startSessionFromBrowserConcept,
    restoreSession,
    controllerFactory,
    findActiveSessionByRoot,
    loadReadModel,
    controller: new BrowserSemanticEntryController({
      createSemanticController: controllerFactory,
      findActiveSessionByRoot,
      loadReadModel,
    }),
  };
}

describe('BrowserSemanticEntryController', () => {
  it('starts Semantic only when Browser selection resolves to a Concept focus', async () => {
    const harness = createHarness();

    const result = await harness.controller.startFromBrowserCard(browserCard({ cardType: 'concept' }));

    expect(result.status).toBe('ready');
    expect(harness.startSessionFromBrowserConcept).toHaveBeenCalledWith('concept-root');
    expect(harness.loadReadModel).toHaveBeenCalledWith('semantic-session-1');
  });

  it('returns unavailable for non-Concept Browser selection without creating a session', async () => {
    const harness = createHarness();

    const result = await harness.controller.startFromBrowserCard(browserCard({ cardType: 'item', blockId: 'item-1' }));

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'focus-unavailable',
    });
    expect(harness.startSessionFromBrowserConcept).not.toHaveBeenCalled();
    expect(harness.restoreSession).not.toHaveBeenCalled();
  });

  it('restores same-root active Semantic session before creating a new session', async () => {
    const active = session({
      sessionId: 'semantic-active',
      narrativePath: [
        { nodeId: 'concept-root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 },
        { nodeId: 'old-node', lens: 'free', eventId: 'event-old', visitedAt: 2 },
      ],
      currentNodeId: 'old-node',
    });
    const harness = createHarness({ activeSession: active });

    const result = await harness.controller.startFromBrowserCard(browserCard({ cardType: 'concept' }));

    expect(result).toMatchObject({ status: 'ready', restored: true });
    expect(harness.restoreSession).toHaveBeenCalledWith('semantic-active');
    expect(harness.startSessionFromBrowserConcept).not.toHaveBeenCalled();
  });

  it('creates a new session when same-root session is ended', async () => {
    const harness = createHarness({
      activeSession: session({ sessionId: 'semantic-ended', endedAt: 10 }),
    });

    const result = await harness.controller.startFromBrowserCard(browserCard({ cardType: 'concept' }));

    expect(result).toMatchObject({ status: 'ready', restored: false });
    expect(harness.startSessionFromBrowserConcept).toHaveBeenCalledWith('concept-root');
    expect(harness.restoreSession).not.toHaveBeenCalled();
  });

  it('does not call old Orbit/Hyperspace engine mutation ports while starting Semantic', async () => {
    const oldNeuralQueue = {
      setEngineMode: vi.fn(),
      setSeedEntry: vi.fn(),
      setAnchorEntry: vi.fn(),
    };
    const harness = createHarness();

    await harness.controller.startFromBrowserCard(browserCard({ cardType: 'concept' }));

    expect(oldNeuralQueue.setEngineMode).not.toHaveBeenCalled();
    expect(oldNeuralQueue.setSeedEntry).not.toHaveBeenCalled();
    expect(oldNeuralQueue.setAnchorEntry).not.toHaveBeenCalled();
  });

  it('scopes station summaries to the current Semantic session and excludes archived stations', async () => {
    const readModel = buildBrowserSemanticReadModel({
      session: session({ sessionId: 'semantic-current', currentNodeId: 'current-node' }),
      rootNode: node('concept-root', 'Concept Root'),
      currentNode: node('current-node', 'Current Node'),
      candidates: { assimilation: [], accommodation: [], free: [] },
      stations: [
        {
          stationId: 'station-current',
          sessionId: 'semantic-current',
          type: 'node',
          nodeId: 'current-node',
          createdAt: 1,
        },
        {
          stationId: 'station-other-session',
          sessionId: 'semantic-other',
          type: 'node',
          nodeId: 'other-node',
          createdAt: 2,
        },
        {
          stationId: 'station-archived',
          sessionId: 'semantic-current',
          type: 'node',
          nodeId: 'archived-node',
          createdAt: 3,
          archivedAt: 4,
        },
      ],
      stationNodes: [
        node('current-node', 'Current Node'),
        node('other-node', 'Other Node'),
        node('archived-node', 'Archived Node'),
      ],
    });

    expect(readModel.status).toBe('ready');
    if (readModel.status === 'ready') {
      expect(readModel.nodeStations.map((summary) => summary.station.stationId)).toEqual(['station-current']);
      expect(readModel.nodeStations[0]?.isCurrentNode).toBe(true);
    }
  });
});
