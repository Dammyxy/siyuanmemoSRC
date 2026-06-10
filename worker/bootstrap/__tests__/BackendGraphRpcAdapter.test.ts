import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendGraphQueryResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_GRAPH_RPC_HANDLER_REGISTRATIONS,
  type BackendGraphRpcHandlerContext,
} from '../rpc/BackendGraphRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendGraphRpcAdapter', () => {
  it('delegates graph.query through the graph family runtime', async () => {
    const dispatcher = createGraphDispatcher();
    const context = createGraphContext();

    await expect(dispatchGraph(dispatcher, context, {
      queryId: 'graph-1',
      kind: 'neighbors',
      sourceNodeId: 'block-1',
      limit: 10,
    })).resolves.toMatchObject({
      result: {
        status: 'ready',
        queryId: 'graph-1',
        kind: 'neighbors',
      },
    });
    expect(context.graph.query).toHaveBeenCalledWith({
      queryId: 'graph-1',
      kind: 'neighbors',
      sourceNodeId: 'block-1',
      limit: 10,
    });
  });

  it('keeps named-param validation explicit for graph.query', async () => {
    const dispatcher = createGraphDispatcher();
    const context = createGraphContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-graph',
      method: 'graph.query',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'graph.query requires named params',
      },
    });
    expect(context.graph.query).not.toHaveBeenCalled();
  });
});

function createGraphDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_GRAPH_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchGraph(
  dispatcher: BackendRpcDispatcher<BackendGraphRpcHandlerContext>,
  context: BackendGraphRpcHandlerContext,
  params: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: 'graph.query',
    method: 'graph.query',
    params: [params],
  }, context);
}

function createGraphContext(): BackendGraphRpcHandlerContext {
  return {
    graph: {
      query: vi.fn(async (request): Promise<BackendGraphQueryResult> => ({
        status: 'ready',
        queryId: request.queryId,
        kind: request.kind,
        nodes: [],
        edges: [],
        limitReached: false,
        continuation: null,
        diagnostics: {
          timingMs: 1,
          nodeCount: 0,
          edgeCount: 0,
          sourceAvailability: 'available',
        },
      })),
    },
  };
}
