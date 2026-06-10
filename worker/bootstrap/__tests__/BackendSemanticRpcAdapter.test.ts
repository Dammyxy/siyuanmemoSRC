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
