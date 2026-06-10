import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendNeuralRoamAdvanceResult,
  type BackendNeuralRoamCommandResult,
  type BackendNeuralRoamViewState,
  type BackendNeuralRoamViewStateResult,
} from '../../../packages/contracts/src/backend-rpc';
import { buildQueueProjectionSourceCardFingerprint } from '@/application/services/queue-projection/QueueProjectionBuilder';
import { createDefaultRoute } from '@/core/queue/neural/routes';
import { SqlNeuralRoamRouteRepository } from '@/infrastructure/persistence/sqlite/SqlNeuralRoamRouteRepository';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { BackendKernel } from '../BackendKernel';
import {
  BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS,
  type BackendNeuralRoamRpcHandlerContext,
} from '../rpc/BackendNeuralRoamRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendNeuralRoamRpcAdapter', () => {
  it('delegates advance, view state, and command requests to the NeuralRoam runtime', async () => {
    const dispatcher = createNeuralRoamDispatcher();
    const context = createNeuralRoamContext();

    await expect(dispatchNeuralRoam(dispatcher, context, 'neural-roam.advance', {
      queueType: 'neural-roam',
      sessionId: 'session-1',
      routeId: 'default',
    })).resolves.toMatchObject({
      result: {
        queueType: 'neural-roam',
        status: 'advanced',
        routeId: 'default',
      },
    });
    expect(context.neuralRoam.advance).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      sessionId: 'session-1',
      routeId: 'default',
    });

    await expect(dispatchNeuralRoam(dispatcher, context, 'neural-roam.viewState', {
      queueType: 'neural-roam',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      result: {
        queueType: 'neural-roam',
        status: 'ready',
        unavailableReason: null,
      },
    });
    expect(context.neuralRoam.readViewState).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      sessionId: 'session-1',
    });

    await expect(dispatchNeuralRoam(dispatcher, context, 'neural-roam.command', {
      queueType: 'neural-roam',
      sessionId: 'session-1',
      command: { type: 'switch-route', routeId: 'default' },
    })).resolves.toMatchObject({
      result: {
        queueType: 'neural-roam',
        status: 'ok',
        unavailableReason: null,
      },
    });
    expect(context.neuralRoam.executeCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      sessionId: 'session-1',
      command: { type: 'switch-route', routeId: 'default' },
    });
  });

  it('keeps named-param validation explicit for NeuralRoam methods', async () => {
    const dispatcher = createNeuralRoamDispatcher();
    const context = createNeuralRoamContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-neural-advance',
      method: 'neural-roam.advance',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'neural-roam.advance requires named params',
      },
    });
    expect(context.neuralRoam.advance).not.toHaveBeenCalled();
  });

  it('preserves explicit unavailable domain results as successful NeuralRoam payloads', async () => {
    const dispatcher = createNeuralRoamDispatcher();
    const context = createNeuralRoamContext({
      advance: vi.fn(async () => createAdvanceResult({
        status: 'unavailable',
        unavailableReason: 'advance-contract-unavailable',
        message: 'NeuralRoam graph query host effect is unavailable',
      })),
    });

    await expect(dispatchNeuralRoam(dispatcher, context, 'neural-roam.advance', {
      queueType: 'neural-roam',
      sessionId: 'session-unavailable',
    })).resolves.toMatchObject({
      result: {
        queueType: 'neural-roam',
        status: 'unavailable',
        unavailableReason: 'advance-contract-unavailable',
        message: 'NeuralRoam graph query host effect is unavailable',
      },
    });
  });

  it('advances neural-roam through backend graph query and persisted session state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'neural-source-1': {
        id: 'neural-source-1',
        content: 'Neural source content',
        type: 'p',
        root_id: 'doc-neural',
      },
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-success',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        counters: {
          sourceNodes: 1,
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-source-1',
          exhausted: false,
        },
        queueState: {
          version: 8,
          engineMode: 'hyperspace',
          hyperspace: {
            session: expect.objectContaining({
              history: expect.arrayContaining([
                expect.objectContaining({
                  nodeId: 'neural-source-1',
                }),
              ]),
            }),
          },
        },
      });
    }
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'neural-source-1',
    }));
  });

  it('continues neural-roam from request current virtual item when persisted session lost current path', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: request.blockId === 'neural-source-1' ? 'Neural source content' : 'Neighbor content',
            type: 'p',
            root_id: 'doc-neural',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-neighbor-1' ? 0.7 : 0.9,
          error: null,
        };
      }
      if (request.operation === 'fetchHyperspaceEdges') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1'
            ? [{
              nodeId: 'neural-neighbor-1',
              associationType: 'concept-link',
              weight: 12,
              channel: 'concept-map',
              origin: 'backlink',
              distance: 1,
              sourcePriority: 0.9,
              targetPriority: 0.7,
              rootId: 'doc-neural',
            }]
            : [],
          error: null,
        };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-virtual-repair',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: 'neural-source-1',
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'neural-neighbor-1',
          sourceKind: 'virtual',
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-neighbor-1',
          exhausted: false,
        },
      });
      expect(response.result.queueState).toMatchObject({
        hyperspace: {
          session: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({ nodeId: 'neural-source-1' }),
              expect.objectContaining({ nodeId: 'neural-neighbor-1' }),
            ]),
          }),
        },
      });
    }
  });

  it('returns exhausted neural-roam advance when backend session has no graph item', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-exhausted',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'empty-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
        sessionState: {
          exhausted: true,
        },
      });
    }
  });

  it('does not report stale source-pool nodes as due after neural-roam advance exhausts', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamHyperspaceSource(database, [
      'neural-source-missing-1',
      'neural-source-missing-2',
      'neural-source-missing-3',
    ]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-exhausted-counters',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        nextItem: null,
        counters: {
          remaining: 0,
          due: 0,
          total: 0,
          sourceNodes: 3,
        },
      });
    }
  });

  it('starts backend neural-roam advance from requested concept focus', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'concept-source-1': {
        id: 'concept-source-1',
        content: 'Concept source',
        type: 'p',
      },
      'old-source-1': {
        id: 'old-source-1',
        content: 'Old source',
        type: 'p',
      },
    });
    await seedNeuralRoamHyperspaceSource(database, 'old-source-1');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-start-focus',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'concept-source-1',
          includeFocusAsFirst: true,
          startNewSession: true,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'concept-source-1',
        },
        sessionState: {
          currentNodeId: 'concept-source-1',
          pathLength: 1,
        },
      });
    }
  });

  it('returns orbit round progress and engine history after advancing from focus to neighbor', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        const block = {
          id: request.blockId,
          content: `${request.blockId} content`,
          type: 'p',
        };
        return { status: 'found', blockId: request.blockId, data: block, error: null };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-source-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNeighbors') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-source-1'
            ? [{ id: 'orbit-neighbor-1', type: 'backlink', weight: 15 }]
            : [],
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const startResponse = await kernel.handle({
      id: 'neural-advance-orbit-start-focus',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'concept-source-1',
          includeFocusAsFirst: true,
          startNewSession: true,
        },
      }],
    });

    expect('result' in startResponse).toBe(true);
    if (!('result' in startResponse)) {
      return;
    }

    const nextResponse = await kernel.handle({
      id: 'neural-advance-orbit-next-neighbor',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: startResponse.result.nextItem,
        feedback: { action: 'skip' },
      }],
    });

    expect('result' in nextResponse).toBe(true);
    if ('result' in nextResponse) {
      expect(nextResponse.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'orbit-neighbor-1',
        },
        sessionState: {
          engineMode: 'orbit',
          currentNodeId: 'orbit-neighbor-1',
          pathLength: 2,
          historyCount: 2,
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            anchorPool: [
              expect.objectContaining({
                nodeId: 'concept-source-1',
                neighborsViewed: 1,
              }),
            ],
            session: expect.objectContaining({
              currentFocus: 'concept-source-1',
              history: expect.arrayContaining([
                expect.objectContaining({ nodeId: 'concept-source-1' }),
                expect.objectContaining({ nodeId: 'orbit-neighbor-1' }),
              ]),
            }),
          },
        },
      });
    }
  });

  it('trusts neural-roam start conceptBlockId as the backend orbit seed for temporary current-block roam', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: `${request.blockId} content`,
            type: 'p',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-seed-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-block-with-concept-seed',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'definition-block-1',
          seedBlockId: 'concept-seed-1',
          conceptBlockId: 'concept-seed-1',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'definition-block-1',
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            seedPool: [
              expect.objectContaining({
                nodeId: 'concept-seed-1',
              }),
            ],
            anchorPool: [
              expect.objectContaining({
                nodeId: 'definition-block-1',
              }),
            ],
          },
        },
      });
    }
  });

  it('uses neural-roam start seedBlockId as the backend orbit seed when conceptBlockId is absent', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: `${request.blockId} content`,
            type: 'p',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'seed-only-concept',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-block-with-seed-only',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'definition-block-1',
          seedBlockId: 'seed-only-concept',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'definition-block-1',
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            seedPool: [
              expect.objectContaining({
                nodeId: 'seed-only-concept',
              }),
            ],
            anchorPool: [
              expect.objectContaining({
                nodeId: 'definition-block-1',
              }),
            ],
          },
        },
      });
    }
  });

  it('uses SQL active route by default for backend neural-roam advance', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-b', 'route-b-source');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-b-source': { id: 'route-b-source', content: 'Route B', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-active-route',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'route-b',
        status: 'advanced',
        nextItem: { blockId: 'route-b-source' },
        sessionState: { routeId: 'route-b' },
      });
    }
  });

  it('rejects stale backend neural-roam feedback for an inactive route', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source', 'default');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-stale-route-feedback',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-a',
        sessionId: null,
        currentItem: {
          id: 'route-a-source',
          cardId: 'route-a-source',
          blockId: 'route-a-source',
          sourceKind: 'virtual',
        },
        feedback: { action: 'skip' },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'default',
        status: 'mismatch',
        nextItem: null,
        unavailableReason: 'route-mismatch',
      });
    }
  });

  it('rejects stale backend neural-roam commands for an inactive route', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source', 'default');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-command-stale-route',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'set-anchor',
          nodeId: 'route-a-source',
          enabled: true,
          routeId: 'route-a',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'mismatch',
        unavailableReason: 'route-mismatch',
        viewState: {
          route: {
            id: 'default',
          },
        },
        queueState: expect.objectContaining({
          version: 8,
        }),
      });
    }
  });

  it('returns backend-owned NeuralRoam route selector state after create and switch commands', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const created = await kernel.handle({
      id: 'neural-command-create-route-selector',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'create-route',
          name: 'Backend Route',
        },
      }],
    });

    expect('result' in created).toBe(true);
    let createdRouteId = '';
    if ('result' in created) {
      createdRouteId = String(created.result.viewState?.route.id || '');
      expect(createdRouteId).toMatch(/^route-/);
      expect(created.result.viewState).toMatchObject({
        route: {
          id: createdRouteId,
          name: 'Backend Route',
        },
        routes: expect.arrayContaining([
          expect.objectContaining({
            id: createdRouteId,
            name: 'Backend Route',
            isActive: true,
            stats: expect.objectContaining({
              routeId: createdRouteId,
            }),
          }),
          expect.objectContaining({
            id: 'default',
            isActive: false,
          }),
        ]),
      });
    }

    const switched = await kernel.handle({
      id: 'neural-command-switch-route-selector',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'switch-route',
          routeId: 'default',
        },
      }],
    });

    expect('result' in switched).toBe(true);
    if ('result' in switched) {
      expect(switched.result.viewState).toMatchObject({
        route: {
          id: 'default',
        },
        routes: expect.arrayContaining([
          expect.objectContaining({
            id: 'default',
            isActive: true,
          }),
          expect.objectContaining({
            id: createdRouteId,
            isActive: false,
          }),
        ]),
      });
    }
  });

  it('syncs cached backend neural-roam queue to the SQL active route before mismatch checks', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
        'route-b-source': { id: 'route-b-source', content: 'Route B', type: 'p' },
      }),
    });

    const firstResponse = await kernel.handle({
      id: 'neural-advance-cache-route-a',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-a',
        sessionId: null,
      }],
    });
    expect('result' in firstResponse && firstResponse.result.routeId).toBe('route-a');

    const repository = new SqlNeuralRoamRouteRepository(database as never);
    const state = await repository.loadState();
    expect(state).not.toBeNull();
    const now = 1_700_000_000_100;
    await repository.saveState({
      activeRouteId: 'route-b',
      engineMode: 'hyperspace',
      routes: [
        ...(state?.routes ?? []),
        {
          metadata: {
            id: 'route-b',
            name: 'route-b',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
          seedPool: [{
            routeId: 'route-b',
            nodeId: 'route-b-source',
            kind: 'seed',
            nodeKind: 'concept',
            role: 'orbit-center',
            priority: 0.9,
            addedAt: now,
            visitedAt: null,
            preview: 'route-b-source',
          }],
          anchorPool: [],
          sessions: { orbit: null, hyperspace: null },
          history: [],
        },
      ],
    });

    const secondResponse = await kernel.handle({
      id: 'neural-advance-after-route-b-switch',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-b',
        sessionId: null,
      }],
    });

    expect('result' in secondResponse).toBe(true);
    if ('result' in secondResponse) {
      expect(secondResponse.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'route-b',
        status: 'advanced',
        nextItem: { blockId: 'route-b-source' },
        sessionState: { routeId: 'route-b' },
      });
    }
  });

  it('starts backend neural-roam from a block seed while returning the source review card first', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'review-block-1': {
        id: 'review-block-1',
        content: 'Review block',
        type: 'p',
      },
    });
    await database.upsertCards([buildCard({
      id: 'source-review-card-1',
      blockId: 'review-block-1',
      type: CardType.Item,
    })]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-start-source-review-card',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'review-block-1',
          seedBlockId: 'review-block-1',
          sourceReviewCardId: 'source-review-card-1',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          cardId: 'source-review-card-1',
          blockId: 'review-block-1',
          sourceKind: 'virtual',
        },
        sessionState: {
          currentNodeId: 'review-block-1',
        },
      });
    }
  });

  it('returns explicit unavailable when neural-roam graph query authority is absent', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'neural-advance-unavailable',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-no-graph',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        nextItem: null,
        unavailableReason: 'advance-contract-unavailable',
      });
    }
  });

  it('returns neural-roam generation mismatch without local advance', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedQueueProjection(database, {
      queueType: 'neural-roam',
      policyHash: 'neural-policy-current',
      generation: 5,
      rows: [],
    });
    const resolveNeuralGraphQuery = createNeuralGraphResolver({});
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-generation-mismatch',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-stale',
        projectionGeneration: 4,
        policyHash: 'neural-policy-current',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'mismatch',
        nextItem: null,
        unavailableReason: 'generation-mismatch',
        projectionImpact: expect.objectContaining({
          refreshRequired: true,
        }),
      });
    }
    expect(resolveNeuralGraphQuery).not.toHaveBeenCalled();
  });

  it('returns neural-roam current item unavailable when source is known missing', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const current = buildCard({
      id: 'missing-neural-card',
      blockId: 'missing-neural-block',
    });
    await database.upsertCards([current]);
    await database.updateSourceExistence([
      { blockId: current.blockId, exists: false },
    ], 1_700_000_200_000);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-after-missing');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'neural-source-after-missing': {
          id: 'neural-source-after-missing',
          content: 'Next available source',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-source-missing',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: current.id,
          cardId: current.id,
          blockId: current.blockId,
          sourceKind: 'associated-review',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        unavailableReason: 'source-block-missing',
        nextItem: {
          blockId: 'neural-source-after-missing',
        },
      });
    }
  });

  it('keeps neural-roam virtual item rating practice-only without formal SRS commit', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const virtualShadow = buildCard({
      id: 'virtual-shadow-card',
      blockId: 'virtual-shadow-block',
      due: reviewedAt - 10_000,
      reps: 2,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([virtualShadow]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-virtual-rating',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'virtual-session',
        currentItem: {
          id: virtualShadow.id,
          cardId: virtualShadow.id,
          blockId: virtualShadow.blockId,
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 4,
        },
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        projectionImpact: null,
      });
    }
    const after = await database.getCard(virtualShadow.id);
    expect(after?.reps).toBe(2);
    expect(after?.lastReview).toBe(reviewedAt - 86_400_000);
  });

  it('migrates old neural-roam queue state into SQL default route for backend advance', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-import-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'imported-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        routeId: 'default',
        status: 'advanced',
        nextItem: {
          blockId: 'legacy-neural-source',
        },
      });
    }
    const routes = await new SqlNeuralRoamRouteRepository(database as never).loadState();
    expect(routes?.activeRouteId).toBe('default');
    expect(routes?.routes[0]?.seedPool.map((entry) => entry.nodeId)).toContain('legacy-neural-source');
  });

  it('ignores old session-specific neural-roam state after route SQL ownership is active', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    await seedNeuralRoamHyperspaceSource(database, 'backend-neural-source', 'neuralRoamQueue:kept-session');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
        'backend-neural-source': {
          id: 'backend-neural-source',
          content: 'Backend source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-keeps-backend-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'kept-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'advanced',
        routeId: 'default',
        nextItem: {
          blockId: 'legacy-neural-source',
        },
      });
    }
  });

  it('resets corrupted old neural-roam state into SQL default route state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.setQueueStateValue('neuralRoamQueue', {
      broken: true,
      version: 'not-a-neural-roam-state',
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-corrupted-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'corrupted-import-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        routeId: 'default',
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
      });
    }
    const routes = await new SqlNeuralRoamRouteRepository(database as never).loadState();
    expect(routes?.activeRouteId).toBe('default');
    expect(routes?.routes[0]?.metadata.id).toBe('default');
  });

});

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

async function seedQueueProjection(database: WorkerSqliteDatabaseService, input: {
  queueType?: string;
  policyHash?: string;
  generation?: number;
  rows: FSRSCard[];
  updatedAt?: number;
}): Promise<void> {
  const queueType = input.queueType ?? 'retrieval-practice';
  const policyHash = input.policyHash ?? 'policy-a';
  const generation = input.generation ?? 1;
  const updatedAt = input.updatedAt ?? 1_700_000_100_000;
  await database.runTransaction('seed.queue-projection', (db) => {
    db.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [queueType, policyHash, generation, 'ready', null, updatedAt, '{}'],
    );
    db.run(
      `INSERT OR REPLACE INTO queue_projection_counters
        (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        queueType,
        policyHash,
        generation,
        generation,
        input.rows.length,
        input.rows.length,
        input.rows.length,
        JSON.stringify({
          all: input.rows.length,
          item: input.rows.filter((card) => card.type === CardType.Item).length,
          descriptor: input.rows.filter((card) => card.type === CardType.Descriptor).length,
          topic: input.rows.filter((card) => card.type === CardType.Topic).length,
          concept: input.rows.filter((card) => card.type === CardType.Concept).length,
        }),
        updatedAt,
      ],
    );
    for (const [index, card] of input.rows.entries()) {
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueType,
          card.id,
          card.id,
          card.blockId,
          null,
          'review-due',
          card.due,
          card.due <= updatedAt ? 'overdue' : 'due',
          card.priority ?? 50,
          `${String(index + 1).padStart(9, '0')}:${card.id}`,
          index + 1,
          policyHash,
          generation,
          JSON.stringify({
            cardType: card.type,
            rowId: card.id,
            state: card.state,
            due: card.due,
            priority: card.priority,
            sourceCardFingerprint: buildQueueProjectionSourceCardFingerprint(card),
          }),
          updatedAt,
        ],
      );
    }
  });
}

async function seedNeuralRoamHyperspaceSource(
  database: WorkerSqliteDatabaseService,
  sourceId: string | string[] = 'neural-source-1',
  storageKey = 'neuralRoamQueue',
): Promise<void> {
  const sourceIds = Array.isArray(sourceId) ? sourceId : [sourceId];
  await database.setQueueStateValue(storageKey, {
    version: 8,
    engineMode: 'hyperspace',
    orbit: {
      seedPool: [],
      anchorPool: [],
      session: {},
    },
    hyperspace: {
      sourcePool: sourceIds.map((nodeId) => ({
        nodeId,
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: 1_700_000_000_000,
        visitedAt: 0,
        nodePreview: 'Neural source',
      })),
      anchorPool: [],
      session: {
        displayPath: [],
        displayPathEventIds: [],
        currentPathIndex: -1,
        navigationMode: 'source',
        bookmarkPathIndex: null,
        history: [],
        currentLeadSource: null,
        currentLeadSourceEventId: null,
        branchRootNodeId: null,
        currentSessionId: null,
        visitedBlocks: [],
        frontier: [],
        exhaustedSources: [],
      },
    },
    pendingAssociatedReviewCardIds: [],
    seenAssociatedReviewCardIds: [],
  });
}

async function seedNeuralRoamRouteSource(
  database: WorkerSqliteDatabaseService,
  routeId: string,
  sourceId: string,
  activeRouteId = routeId,
): Promise<void> {
  await database.init();
  const repository = new SqlNeuralRoamRouteRepository(database as never);
  const now = 1_700_000_000_000;
  const routes = [createDefaultRoute(now)];
  if (routeId !== 'default') {
    routes.push({
      metadata: {
        id: routeId,
        name: routeId,
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      },
      seedPool: [{
        routeId,
        nodeId: sourceId,
        kind: 'seed',
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: 1_700_000_000_000,
        visitedAt: null,
        preview: sourceId,
      }],
      anchorPool: [],
      sessions: { orbit: null, hyperspace: null },
      history: [],
    });
  } else {
    routes[0] = {
      ...routes[0],
      seedPool: [{
        routeId,
        nodeId: sourceId,
        kind: 'seed',
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: now,
        visitedAt: null,
        preview: sourceId,
      }],
    };
  }
  await repository.saveState({
    activeRouteId,
    engineMode: 'hyperspace',
    routes,
  });
}

function createNeuralGraphResolver(
  dataByBlockId: Record<string, {
    id: string;
    content: string;
    type: string;
    parent_id?: string;
    root_id?: string;
    attrs?: Record<string, string>;
    ial?: Record<string, string>;
    attributes?: Record<string, string>;
  }>,
) {
  return vi.fn(async (
    request: BackendNeuralGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult> => {
    if (request.operation === 'fetchBlockData') {
      const block = dataByBlockId[request.blockId];
      return block
        ? { status: 'found', blockId: request.blockId, data: block, error: null }
        : { status: 'known-missing', blockId: request.blockId, data: null, error: null };
    }
    if (request.operation === 'isConceptCard') {
      return {
        status: 'found',
        blockId: request.blockId,
        data: request.blockId.includes('source'),
        error: null,
      };
    }
    if (request.operation === 'fetchNodePriority') {
      return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
    }
    return { status: 'found', blockId: request.blockId, data: [], error: null };
  });
}

function createNeuralRoamDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchNeuralRoam(
  dispatcher: BackendRpcDispatcher<BackendNeuralRoamRpcHandlerContext>,
  context: BackendNeuralRoamRpcHandlerContext,
  method: typeof BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createNeuralRoamContext(
  overrides: Partial<BackendNeuralRoamRpcHandlerContext['neuralRoam']> = {},
): BackendNeuralRoamRpcHandlerContext {
  return {
    neuralRoam: {
      advance: vi.fn(async () => createAdvanceResult()),
      readViewState: vi.fn(async () => createViewStateResult()),
      executeCommand: vi.fn(async () => createCommandResult()),
      ...overrides,
    },
  };
}

function createAdvanceResult(
  overrides: Partial<BackendNeuralRoamAdvanceResult> = {},
): BackendNeuralRoamAdvanceResult {
  return {
    queueType: 'neural-roam',
    routeId: 'default',
    sessionId: 'session-1',
    status: 'advanced',
    nextItem: null,
    counters: {},
    sessionState: {},
    viewState: createViewState(),
    queueState: { version: 1 },
    projectionImpact: null,
    unavailableReason: null,
    message: null,
    ...overrides,
  } as BackendNeuralRoamAdvanceResult;
}

function createViewStateResult(): BackendNeuralRoamViewStateResult {
  return {
    queueType: 'neural-roam',
    status: 'ready',
    viewState: createViewState(),
    unavailableReason: null,
    message: null,
  };
}

function createCommandResult(): BackendNeuralRoamCommandResult {
  return {
    queueType: 'neural-roam',
    status: 'ok',
    viewState: createViewState(),
    queueState: { version: 1 },
    unavailableReason: null,
    message: null,
  };
}

function createViewState(): BackendNeuralRoamViewState {
  return {
    version: 1,
    queueType: 'neural-roam',
    route: {
      id: 'default',
      name: 'Default',
      temporary: false,
      previousRouteId: null,
    },
    routes: [],
    engineMode: 'orbit',
    currentNodeId: null,
    currentEventId: null,
    navigationState: null,
    counters: {},
    sources: [],
    anchors: [],
    engineHistory: [],
    routeHistory: [],
    batchProgress: {
      kind: 'none',
      viewedCount: 0,
      totalCount: 0,
      remainingCount: 0,
      label: '',
    },
    updatedAt: 100,
  } as BackendNeuralRoamViewState;
}
