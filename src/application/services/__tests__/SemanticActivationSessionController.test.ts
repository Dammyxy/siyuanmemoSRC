import { describe, expect, it, vi } from 'vitest';
import { SemanticActivationSessionController } from '../SemanticActivationSessionController';
import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import type { BackendSemanticCommandRequest, BackendSemanticCommandResult } from '../../../../packages/contracts/src/backend-rpc';

function okResult(
  request: BackendSemanticCommandRequest,
  overrides: Partial<Extract<BackendSemanticCommandResult, { status: 'ok' }>> = {},
): BackendSemanticCommandResult {
  return {
    status: 'ok',
    commandId: request.requestId,
    writerInstanceId: 'writer-1',
    changed: { semanticSessionIds: ['semantic-session-1'] },
    diagnosticEventId: `semantic-command:${request.requestId}`,
    ...overrides,
  };
}

describe('SemanticActivationSessionController', () => {
  it('starts a Review concept session with assimilation root/current node and no old-mode writes', async () => {
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => okResult(request, {
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'concept-root',
        activeLens: 'assimilation',
        narrativePath: [{ nodeId: 'concept-root', lens: 'assimilation', eventId: 'event-start', visitedAt: 1 }],
        startedAt: 1,
        endedAt: null,
      },
      events: [
        { type: 'session-started', nodeId: 'concept-root' },
        { type: 'node-visited', nodeId: 'concept-root' },
      ],
    }));
    const controller = new SemanticActivationSessionController({
      commandClient: { execute } as unknown as SemanticActivationCommandClient,
      idFactory: () => 'semantic-session-1',
    });

    const result = await controller.startSessionFromReviewConcept('concept-root');

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.command.execute',
      callerIntent: 'semantic.review-concept.start',
      command: {
        type: 'start-session',
        rootFocusNodeId: 'concept-root',
        sessionId: 'semantic-session-1',
      },
    }));
    expect(result).toMatchObject({
      status: 'ok',
      session: {
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'concept-root',
        activeLens: 'assimilation',
      },
    });
  });

  it('follows a candidate while preserving root focus and recording lens switch before traversal', async () => {
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => okResult(request, {
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'implicit-next',
        activeLens: 'free',
        narrativePath: [
          { nodeId: 'concept-root', lens: 'assimilation', eventId: 'event-start', visitedAt: 1 },
          { nodeId: 'implicit-next', lens: 'free', eventId: 'event-visit', visitedAt: 2 },
        ],
        startedAt: 1,
        endedAt: null,
      },
      events: [
        { type: 'lens-switched', nodeId: 'concept-root', lens: 'free' },
        { type: 'edge-traversed', fromNodeId: 'concept-root', toNodeId: 'implicit-next', lens: 'free' },
        { type: 'node-visited', nodeId: 'implicit-next', lens: 'free' },
      ],
    }));
    const controller = new SemanticActivationSessionController({
      commandClient: { execute } as unknown as SemanticActivationCommandClient,
      activeSessionId: 'semantic-session-1',
      idFactory: () => 'unused',
    });

    const result = await controller.followCandidate('implicit-next', 'free');

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      callerIntent: 'semantic.navigation.follow-candidate',
      command: {
        type: 'follow-candidate',
        sessionId: 'semantic-session-1',
        candidateId: 'implicit-next',
        lens: 'free',
      },
    }));
    expect(result).toMatchObject({
      status: 'ok',
      session: {
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'implicit-next',
        activeLens: 'free',
      },
      events: [
        { type: 'lens-switched' },
        { type: 'edge-traversed' },
        { type: 'node-visited' },
      ],
    });
  });

  it('ends and restores a historical Semantic session by id', async () => {
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => okResult(request, {
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'implicit-next',
        activeLens: 'free',
        narrativePath: [
          { nodeId: 'concept-root', lens: 'assimilation', eventId: 'event-start', visitedAt: 1 },
          { nodeId: 'implicit-next', lens: 'free', eventId: 'event-visit', visitedAt: 2 },
        ],
        startedAt: 1,
        endedAt: request.command.type === 'end-session' ? 3 : null,
      },
    }));
    const controller = new SemanticActivationSessionController({
      commandClient: { execute } as unknown as SemanticActivationCommandClient,
      activeSessionId: 'semantic-session-1',
      idFactory: () => 'unused',
    });

    await controller.endSession();
    await controller.restoreSession('semantic-session-1');

    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      callerIntent: 'semantic.session.end',
      command: { type: 'end-session', sessionId: 'semantic-session-1' },
    }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      callerIntent: 'semantic.session.restore',
      command: { type: 'restore-session', sessionId: 'semantic-session-1' },
    }));
  });

  it('routes implicit-node actions, stations, and AI relation decisions through writer-owned commands', async () => {
    const execute = vi.fn(async (request: BackendSemanticCommandRequest) => okResult(request));
    const controller = new SemanticActivationSessionController({
      commandClient: { execute } as unknown as SemanticActivationCommandClient,
      activeSessionId: 'semantic-session-1',
      idFactory: () => 'unused',
    });

    await controller.recordImplicitNodeAction('implicit-1', 'expand', 'free');
    await controller.createStation('path');
    await controller.acceptRelation({
      relationId: 'relation-1',
      fromNodeId: 'root',
      toNodeId: 'implicit-1',
      confidence: 0.4,
      reason: 'current path explains relation',
    });
    await controller.rejectRelation({
      relationId: 'relation-2',
      fromNodeId: 'root',
      toNodeId: 'outside',
      confidence: 0.1,
      reason: 'outside allowed path',
    });
    const ignored = await controller.ignoreRelation();

    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      callerIntent: 'semantic.implicit-node.action',
      command: {
        type: 'record-implicit-node-action',
        sessionId: 'semantic-session-1',
        nodeId: 'implicit-1',
        action: 'expand',
        lens: 'free',
      },
    }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      callerIntent: 'semantic.station.create',
      command: {
        type: 'create-station',
        sessionId: 'semantic-session-1',
        stationType: 'path',
      },
    }));
    expect(execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      callerIntent: 'semantic.ai-relation.accept',
      command: expect.objectContaining({
        type: 'accept-relation',
        source: 'ai',
      }),
    }));
    expect(execute).toHaveBeenNthCalledWith(4, expect.objectContaining({
      callerIntent: 'semantic.ai-relation.reject',
      command: expect.objectContaining({
        type: 'reject-relation',
        source: 'ai',
      }),
    }));
    expect(ignored).toMatchObject({
      status: 'ok',
      changed: {},
      writerInstanceId: 'local-noop',
    });
  });
});
