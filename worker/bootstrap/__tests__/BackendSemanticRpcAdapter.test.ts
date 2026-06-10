import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendSemanticBrowserReadResult,
  type BackendSemanticCommandResult,
  type BackendSemanticSessionReadResult,
  type BackendSemanticSidebarReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS,
  type BackendSemanticRpcHandlerContext,
} from '../rpc/BackendSemanticRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import { BackendKernel } from '../BackendKernel';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';

describe('BackendSemanticRpcAdapter', () => {
  it('delegates semantic command and read methods to the semantic runtime', async () => {
    const dispatcher = createSemanticDispatcher();
    const context = createSemanticContext();

    await expect(dispatchSemantic(dispatcher, context, 'semantic.command.execute', {
      requestId: 'semantic-command-1',
      method: 'semantic.command.execute',
      callerIntent: 'test-semantic',
      idempotencyKey: 'semantic-key-1',
      command: { type: 'start-session', sessionId: 'session-1', rootFocusNodeId: 'node-1' },
    })).resolves.toMatchObject({
      result: {
        status: 'ok',
        commandId: 'semantic-command-1',
      },
    });

    await expect(dispatchSemantic(dispatcher, context, 'semantic.session.read', {
      requestId: 'semantic-session-read-1',
      method: 'semantic.session.read',
      callerIntent: 'test-semantic',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      result: {
        status: 'ok',
        requestId: 'semantic-session-read-1',
      },
    });

    await expect(dispatchSemantic(dispatcher, context, 'semantic.sidebar.read', {
      requestId: 'semantic-sidebar-read-1',
      method: 'semantic.sidebar.read',
      callerIntent: 'test-semantic',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      result: {
        status: 'ok',
        requestId: 'semantic-sidebar-read-1',
      },
    });

    await expect(dispatchSemantic(dispatcher, context, 'semantic.browser.read', {
      requestId: 'semantic-browser-read-1',
      method: 'semantic.browser.read',
      callerIntent: 'test-semantic',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      result: {
        status: 'ok',
        requestId: 'semantic-browser-read-1',
      },
    });

    expect(context.semantic.executeCommand).toHaveBeenCalledTimes(1);
    expect(context.semantic.readSession).toHaveBeenCalledTimes(1);
    expect(context.semantic.readSidebar).toHaveBeenCalledTimes(1);
    expect(context.semantic.readBrowser).toHaveBeenCalledTimes(1);
  });

  it('keeps named-param validation explicit for semantic methods', async () => {
    const dispatcher = createSemanticDispatcher();
    const context = createSemanticContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-semantic',
      method: 'semantic.command.execute',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'semantic.command.execute requires named params',
      },
    });
    expect(context.semantic.executeCommand).not.toHaveBeenCalled();
  });

  it('executes writer-owned semantic activation commands through the backend database owner', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const start = await kernel.handle({
      id: 'semantic-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'node-root',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in start).toBe(true);
    if (!('result' in start)) {
      throw new Error('semantic start did not return result');
    }
    expect(start.result).toMatchObject({
      status: 'ok',
      commandId: 'semantic-start-1',
      changed: {
        semanticSessionIds: ['semantic-session-1'],
      },
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'node-root',
        currentNodeId: 'node-root',
        activeLens: 'assimilation',
      },
      event: {
        type: 'node-visited',
      },
      events: [
        { type: 'session-started' },
        { type: 'node-visited' },
      ],
    });

    const follow = await kernel.handle({
      id: 'semantic-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-session-1',
          candidateId: 'node-next',
          lens: 'free',
        },
      }],
    });
    expect('result' in follow).toBe(true);
    if ('result' in follow) {
      expect(follow.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-next',
          activeLens: 'free',
        },
        event: {
          type: 'node-visited',
          nodeId: 'node-next',
        },
        events: [
          { type: 'lens-switched' },
          { type: 'edge-traversed' },
          { type: 'node-visited' },
        ],
      });
    }

    const station = await kernel.handle({
      id: 'semantic-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'node',
        },
      }],
    });
    expect('result' in station).toBe(true);
    if ('result' in station) {
      expect(station.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'node',
          sessionId: 'semantic-session-1',
          nodeId: 'node-next',
        },
      });
    }

    const pathStation = await kernel.handle({
      id: 'semantic-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    if ('result' in pathStation) {
      expect(pathStation.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'path',
          sessionId: 'semantic-session-1',
          nodeId: null,
          path: [
            { nodeId: 'node-root', lens: 'assimilation' },
            { nodeId: 'node-next', lens: 'free' },
          ],
          lensHistory: ['assimilation', 'free'],
        },
      });
    }

    const relation = await kernel.handle({
      id: 'semantic-relation',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-relation-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-relation-key',
        command: {
          type: 'accept-relation',
          sessionId: 'semantic-session-1',
          relationId: 'relation-1',
          fromNodeId: 'node-root',
          toNodeId: 'node-next',
          confidence: 0.8,
          reason: 'accepted by user',
        },
      }],
    });
    expect('result' in relation).toBe(true);
    if ('result' in relation) {
      expect(relation.result).toMatchObject({
        status: 'ok',
        relation: {
          relationId: 'relation-1',
          decision: 'accepted',
          source: 'ai',
        },
        event: {
          type: 'ai-relation-accepted',
        },
      });
    }

    const implicitAction = await kernel.handle({
      id: 'semantic-implicit-action',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-implicit-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-implicit-key',
        command: {
          type: 'record-implicit-node-action',
          sessionId: 'semantic-session-1',
          nodeId: 'implicit-node-1',
          action: 'expand',
        },
      }],
    });
    expect('result' in implicitAction).toBe(true);
    if ('result' in implicitAction) {
      expect(implicitAction.result).toMatchObject({
        status: 'ok',
        event: {
          type: 'implicit-node-action',
          nodeId: 'implicit-node-1',
          payload: {
            action: 'expand',
          },
        },
      });
    }

    const projectionRow = database.getOne<{
      session_id: string | null;
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT session_id, node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-session-1'],
    );
    expect(projectionRow?.session_id).toBe('semantic-session-1');
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(nodeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'node-root',
      }),
      expect.objectContaining({
        nodeId: 'node-next',
      }),
      expect.objectContaining({
        nodeId: 'implicit-node-1',
      }),
    ]));
    expect(edgeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromNodeId: 'node-root',
        toNodeId: 'node-next',
        traversalCount: 1,
      }),
    ]));

    const ended = await kernel.handle({
      id: 'semantic-end',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-end-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-end-key',
        command: {
          type: 'end-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in ended).toBe(true);
    if ('result' in ended) {
      expect(ended.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          endedAt: expect.any(Number),
        },
        event: {
          type: 'session-ended',
        },
      });
    }

    const restored = await kernel.handle({
      id: 'semantic-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-restore-key',
        command: {
          type: 'restore-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          rootFocusNodeId: 'node-root',
          currentNodeId: 'node-next',
          activeLens: 'free',
          endedAt: expect.any(Number),
        },
      });
    }

    const replay = await kernel.handle({
      id: 'semantic-start-replay',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-2',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'other-root',
          sessionId: 'semantic-session-2',
        },
      }],
    });
    expect('result' in replay).toBe(true);
    if ('result' in replay) {
      expect(replay.result).toMatchObject({
        status: 'ok',
        commandId: 'semantic-start-1',
        session: {
          sessionId: 'semantic-session-1',
        },
      });
    }
  });

  it('returns explicit semantic session unavailable instead of fallback writes', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-missing-session',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-missing-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-missing-key',
        command: {
          type: 'create-station',
          sessionId: 'missing-session',
          stationType: 'node',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
      });
    }
  });

  it('archives semantic stations and restores path stations without replaying traversal events', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-restore-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root',
          sessionId: 'semantic-restore-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-restore-follow-a',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-a-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-a-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-a',
          lens: 'free',
        },
      }],
    });
    const pathStation = await kernel.handle({
      id: 'semantic-restore-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-restore-session',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    await kernel.handle({
      id: 'semantic-restore-follow-b',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-b-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-b-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-b',
          lens: 'accommodation',
        },
      }],
    });

    const beforeRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    const restored = await kernel.handle({
      id: 'semantic-path-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-path-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-a',
          narrativePath: [
            { nodeId: 'root', lens: 'assimilation' },
            { nodeId: 'node-a', lens: 'free' },
          ],
        },
        event: {
          type: 'station-restored',
        },
      });
    }
    const afterRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    expect(afterRestoreEdges).toBe(beforeRestoreEdges);

    const archived = await kernel.handle({
      id: 'semantic-station-archive',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-archive-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-station-archive-key',
        command: {
          type: 'archive-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archived).toBe(true);
    if ('result' in archived) {
      expect(archived.result).toMatchObject({
        status: 'ok',
        archivedStationId: 'semantic-station:semantic-restore-path-station-1',
        station: {
          archivedAt: expect.any(Number),
        },
        event: {
          type: 'station-archived',
        },
      });
    }

    const archivedRestore = await kernel.handle({
      id: 'semantic-archived-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-archived-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-archived-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archivedRestore).toBe(true);
    if ('result' in archivedRestore) {
      expect(archivedRestore.result).toMatchObject({
        status: 'failed',
        unavailableReason: 'inactive-station',
      });
    }
  });

  it('serves Browser Semantic read models without UI SQL and scopes stations to the current root', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-browser-root-a-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-a',
          sessionId: 'semantic-browser-session-a',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-browser-session-a',
          candidateId: 'old-node-a',
          lens: 'free',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-a',
          stationType: 'node',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-b',
          sessionId: 'semantic-browser-session-b',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-b',
          stationType: 'node',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-browser-read-root-a',
      jsonrpc: '2.0',
      method: 'semantic.browser.read' as never,
      params: [{
        requestId: 'semantic-browser-read-root-a-1',
        method: 'semantic.browser.read',
        callerIntent: 'test-semantic-browser-read',
        rootFocusNodeId: 'root-a',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        activeSession: {
          sessionId: 'semantic-browser-session-a',
          rootFocusNodeId: 'root-a',
          currentNodeId: 'old-node-a',
        },
        session: {
          sessionId: 'semantic-browser-session-a',
        },
        rootNode: {
          nodeId: 'root-a',
          nodeType: 'concept',
        },
        currentNode: {
          nodeId: 'old-node-a',
        },
        projection: {
          session: {
            sessionId: 'semantic-browser-session-a',
          },
          activePath: [
            { nodeId: 'root-a' },
            { nodeId: 'old-node-a' },
          ],
        },
        selectedNode: {
          nodeId: 'old-node-a',
          presentation: expect.objectContaining({
            debugId: 'old-node-a',
          }),
        },
      });
      expect(response.result.edgeExplanations).toEqual([
        expect.objectContaining({
          fromNodeId: 'root-a',
          toNodeId: 'old-node-a',
          primaryExplanation: 'Semantic path step',
        }),
      ]);
      expect(response.result.archivedBranches).toEqual([]);
      expect(response.result.later).toEqual([]);
      expect(response.result.suggestions).toEqual([]);
      expect(response.result.rootScopedStations.map((station: { sessionId: string }) => station.sessionId)).toEqual([
        'semantic-browser-session-a',
      ]);
      expect(response.result.stations.map((station: { stationId: string }) => station.stationId)).toEqual([
        'semantic-station:semantic-browser-root-a-node-station-1',
      ]);
      expect(response.result.candidates.free.map((candidate: { candidateId: string }) => candidate.candidateId)).not.toContain('root-b');
    }
  });

  it('serves presentation-ready Semantic session read models without bare ids as primary labels', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-session-read-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-session-read-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-session-read',
        idempotencyKey: 'semantic-session-read-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-session-read',
          sessionId: 'semantic-session-read-1',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-session-read-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-session-read-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-session-read',
        idempotencyKey: 'semantic-session-read-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-session-read-1',
          candidateId: '20260517130000-abc1234',
          lens: 'accommodation',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-session-read',
      jsonrpc: '2.0',
      method: 'semantic.session.read',
      params: [{
        requestId: 'semantic-session-read-1',
        method: 'semantic.session.read',
        callerIntent: 'test-semantic-session-read',
        sessionId: 'semantic-session-read-1',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        projection: {
          session: {
            sessionId: 'semantic-session-read-1',
            currentNodeId: '20260517130000-abc1234',
          },
          activePath: [
            { nodeId: 'root-session-read', lens: 'assimilation' },
            { nodeId: '20260517130000-abc1234', lens: 'accommodation' },
          ],
          ended: false,
        },
      });
      expect(response.result.projection.tree).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'root-session-read',
          childNodeIds: ['20260517130000-abc1234'],
        }),
      ]));
      expect(response.result.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: '20260517130000-abc1234',
          presentation: expect.objectContaining({
            displayTitle: 'Content unavailable',
            availability: expect.objectContaining({
              status: 'unavailable',
              reason: 'content-missing',
            }),
            debugId: '20260517130000-abc1234',
          }),
        }),
      ]));
    }
  });

  it('executes Semantic cursor and branch commands for Review sidebar interactions', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-sidebar-action-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-action',
          sessionId: 'semantic-sidebar-action-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-action-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-sidebar-action-session',
          candidateId: 'node-action-next',
          lens: 'free',
        },
      }],
    });

    const moved = await kernel.handle({
      id: 'semantic-sidebar-action-move',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-move-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-move-key',
        command: {
          type: 'move-active-cursor',
          sessionId: 'semantic-sidebar-action-session',
          nodeId: 'root-action',
        },
      }],
    });
    expect('result' in moved).toBe(true);
    if ('result' in moved) {
      expect(moved.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'root-action',
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-action-branch',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-branch-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-branch-key',
        command: {
          type: 'create-branch-edge',
          sessionId: 'semantic-sidebar-action-session',
          fromNodeId: 'root-action',
          toNodeId: 'node-action-branch',
          lens: 'assimilation',
        },
      }],
    });
    const withBranch = await kernel.handle({
      id: 'semantic-sidebar-action-read',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-action-read-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-action',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-action-session',
      }],
    });
    expect('result' in withBranch).toBe(true);
    let branchId = '';
    if ('result' in withBranch) {
      branchId = withBranch.result.model.branches[0]?.branchId ?? '';
      expect(withBranch.result.model.branches[0]).toEqual(expect.objectContaining({
        rootNodeId: 'root-action',
        activeCursorNodeId: 'node-action-branch',
      }));
    }

    await kernel.handle({
      id: 'semantic-sidebar-action-archive',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-archive-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-archive-key',
        command: {
          type: 'archive-branch',
          sessionId: 'semantic-sidebar-action-session',
          branchId,
        },
      }],
    });
    const afterArchive = await kernel.handle({
      id: 'semantic-sidebar-action-after-archive',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-action-after-archive-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-action',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-action-session',
      }],
    });
    expect('result' in afterArchive).toBe(true);
    if ('result' in afterArchive) {
      expect(afterArchive.result.model.branches).toEqual([]);
    }
  });

  it('serves Review sidebar Semantic read models for follow-current and pinned sessions without auto-creating sessions', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const kernel = new BackendKernel({ database });

    const empty = await kernel.handle({
      id: 'semantic-sidebar-empty',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-empty-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'follow-current',
        currentNodeId: 'root-sidebar',
      }],
    });

    expect('result' in empty).toBe(true);
    if ('result' in empty) {
      expect(empty.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'follow-current', rootFocusNodeId: 'root-sidebar' },
          session: null,
          candidates: { assimilation: [], accommodation: [], free: [] },
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-sidebar',
          sessionId: 'semantic-sidebar-session-1',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-sidebar-session-1',
          candidateId: 'node-sidebar-next',
          lens: 'free',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-later',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-later-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-later-key',
        command: {
          type: 'add-later',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-later',
          reason: 'compare after current path',
        },
      }],
    });

    const pinned = await kernel.handle({
      id: 'semantic-sidebar-pinned',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-pinned-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
        currentNodeId: 'other-review-item',
      }],
    });

    expect('result' in pinned).toBe(true);
    if ('result' in pinned) {
      expect(pinned.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'pinned-session', sessionId: 'semantic-sidebar-session-1' },
          session: {
            sessionId: 'semantic-sidebar-session-1',
            currentNodeId: 'node-sidebar-next',
          },
          currentNode: {
            nodeId: 'node-sidebar-next',
            presentation: expect.objectContaining({
              debugId: 'node-sidebar-next',
            }),
          },
          activePath: [
            { nodeId: 'root-sidebar' },
            { nodeId: 'node-sidebar-next' },
          ],
          later: [
            expect.objectContaining({
              nodeId: 'node-sidebar-later',
              reason: 'compare after current path',
              removedAt: null,
            }),
          ],
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-later-remove',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-later-remove-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-later-remove-key',
        command: {
          type: 'remove-later',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-later',
        },
      }],
    });
    const afterRemove = await kernel.handle({
      id: 'semantic-sidebar-after-remove',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-after-remove-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
      }],
    });
    expect('result' in afterRemove).toBe(true);
    if ('result' in afterRemove) {
      expect(afterRemove.result.model.later).toEqual([]);
    }

    await kernel.handle({
      id: 'semantic-sidebar-irrelevant-root',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-irrelevant-root-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-irrelevant-root-key',
        command: {
          type: 'mark-irrelevant',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-nope',
          scope: 'root',
        },
      }],
    });
    const feedback = database.getOne<{ scope: string; root_focus_node_id: string | null }>(
      `SELECT scope, root_focus_node_id
       FROM semantic_irrelevant_feedback
       WHERE feedback_id = ?`,
      ['semantic-irrelevant:semantic-sidebar-irrelevant-root-1'],
    );
    expect(feedback).toEqual({
      scope: 'root',
      root_focus_node_id: 'root-sidebar',
    });

    await kernel.handle({
      id: 'semantic-sidebar-suggestion-create',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-suggestion-create-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-suggestion-create-key',
        command: {
          type: 'create-suggestion',
          sessionId: 'semantic-sidebar-session-1',
          suggestionId: 'suggestion-sidebar-1',
          source: 'ai',
          summary: 'bind this idea to a real note',
          targetNodeId: 'node-sidebar-next',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-suggestion-bind',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-suggestion-bind-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-suggestion-bind-key',
        command: {
          type: 'bind-suggestion',
          sessionId: 'semantic-sidebar-session-1',
          suggestionId: 'suggestion-sidebar-1',
          nodeId: 'node-sidebar-bound',
        },
      }],
    });
    const afterSuggestion = await kernel.handle({
      id: 'semantic-sidebar-after-suggestion',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-after-suggestion-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
      }],
    });
    expect('result' in afterSuggestion).toBe(true);
    if ('result' in afterSuggestion) {
      expect(afterSuggestion.result.model.suggestions).toEqual([
        expect.objectContaining({
          suggestionId: 'suggestion-sidebar-1',
          status: 'bound',
          boundNodeId: 'node-sidebar-bound',
        }),
      ]);
      expect(afterSuggestion.result.model.session.currentNodeId).toBe('node-sidebar-next');
      expect(afterSuggestion.result.model.activePath.map((entry: { nodeId: string }) => entry.nodeId)).toEqual([
        'root-sidebar',
        'node-sidebar-next',
      ]);
    }
  });

  it('surfaces most recent ended Semantic session for Review sidebar restore without auto-creating a session', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-sidebar-ended-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-ended-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-ended',
        idempotencyKey: 'semantic-sidebar-ended-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-ended',
          sessionId: 'semantic-sidebar-ended-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-ended-end',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-ended-end-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-ended',
        idempotencyKey: 'semantic-sidebar-ended-end-key',
        command: {
          type: 'end-session',
          sessionId: 'semantic-sidebar-ended-session',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-sidebar-ended-read',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-ended-read-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-ended',
        bindingMode: 'follow-current',
        currentNodeId: 'root-ended',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'follow-current', rootFocusNodeId: 'root-ended' },
          session: null,
          recentEndedSession: {
            sessionId: 'semantic-sidebar-ended-session',
            rootFocusNodeId: 'root-ended',
            endedAt: expect.any(Number),
          },
        },
      });
    }
  });

  it('starts Semantic sessions from real review-card roots instead of forcing Concept-only roots', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-real-root-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-real-root-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-real-root',
        idempotencyKey: 'semantic-real-root-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'review-root-block',
          rootFocusNodeType: 'real-review-card',
          sessionId: 'semantic-real-root-session',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-real-root-read',
      jsonrpc: '2.0',
      method: 'semantic.session.read',
      params: [{
        requestId: 'semantic-real-root-read-1',
        method: 'semantic.session.read',
        callerIntent: 'test-semantic-real-root',
        sessionId: 'semantic-real-root-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        projection: {
          session: {
            rootFocusNodeId: 'review-root-block',
            rootFocusNodeType: 'real-review-card',
          },
        },
      });
      expect(response.result.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'review-root-block',
          nodeType: 'real-review-card',
          presentation: expect.objectContaining({
            nodeKind: 'flashcard',
          }),
        }),
      ]));
    }
  });

  it('uses old neural-roam pools as read-only semantic projection boosts', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const oldState = {
      version: 8,
      engineMode: 'hyperspace',
      orbit: {
        seedPool: [{ nodeId: 'old-orbit-seed', priority: 0.5, label: 'Orbit seed' }],
        anchorPool: [{ nodeId: 'old-orbit-anchor', priority: 1, label: 'Orbit anchor' }],
        session: { active: false },
      },
      hyperspace: {
        sourcePool: [{ nodeId: 'old-hyperspace-source', priority: 0.25, label: 'Hyperspace source' }],
        anchorPool: [{ nodeId: 'old-hyperspace-anchor', priority: 0.75, label: 'Hyperspace anchor' }],
        session: { active: false },
      },
      pendingAssociatedReviewCardIds: ['card-pending'],
      seenAssociatedReviewCardIds: ['card-seen'],
    };
    await database.setQueueStateValue('neuralRoamQueue', oldState);
    const before = await database.getQueueStateValue('neuralRoamQueue');
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-old-mode-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-old-mode-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-old-mode',
        idempotencyKey: 'semantic-old-mode-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'semantic-root',
          sessionId: 'semantic-old-mode-session',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        changed: {
          semanticSessionIds: ['semantic-old-mode-session'],
        },
      });
    }
    await expect(database.getQueueStateValue('neuralRoamQueue')).resolves.toEqual(before);
    const projectionRow = database.getOne<{
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-old-mode-session'],
    );
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(edgeMemory).toEqual([]);
    for (const nodeId of ['old-orbit-seed', 'old-orbit-anchor', 'old-hyperspace-source', 'old-hyperspace-anchor']) {
      const node = nodeMemory.find((entry) => entry.nodeId === nodeId);
      expect(node?.manualBoost).toBeGreaterThan(0);
      expect(node?.oldKnowledgeScore).toBeGreaterThan(0);
    }
  });
});

function createSemanticDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchSemantic(
  dispatcher: BackendRpcDispatcher<BackendSemanticRpcHandlerContext>,
  context: BackendSemanticRpcHandlerContext,
  method: typeof BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createSemanticContext(): BackendSemanticRpcHandlerContext {
  return {
    semantic: {
      executeCommand: vi.fn(async (request): Promise<BackendSemanticCommandResult> => ({
        status: 'ok',
        commandId: request.requestId,
        writerInstanceId: 'backend-worker',
        changed: { semanticSessionIds: ['session-1'] },
        diagnosticEventId: `semantic-command:${request.requestId}`,
      })),
      readSession: vi.fn((request): BackendSemanticSessionReadResult => ({
        status: 'ok',
        requestId: request.requestId,
        projection: {},
        nodes: [],
        diagnosticEventId: `semantic-session:${request.requestId}`,
      } as BackendSemanticSessionReadResult)),
      readSidebar: vi.fn((request): BackendSemanticSidebarReadResult => ({
        status: 'ok',
        requestId: request.requestId,
        model: {
          bindingState: { type: 'current-node-unavailable', reason: 'test' },
          session: null,
          currentNode: null,
          activePath: [],
          candidates: { assimilation: [], accommodation: [], free: [] },
          stations: [],
          stationNodes: [],
          rootScopedStations: [],
          later: [],
          suggestions: [],
          archivedBranches: [],
        },
        diagnosticEventId: `semantic-sidebar:${request.requestId}`,
      } as BackendSemanticSidebarReadResult)),
      readBrowser: vi.fn((request): BackendSemanticBrowserReadResult => ({
        status: 'ok',
        requestId: request.requestId,
        activeSession: null,
        session: null,
        rootNode: null,
        currentNode: null,
        candidates: { assimilation: [], accommodation: [], free: [] },
        stations: [],
        stationNodes: [],
        rootScopedStations: [],
        diagnosticEventId: `semantic-browser:${request.requestId}`,
      } as BackendSemanticBrowserReadResult)),
    },
  };
}
