import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendNeuralRoamAdvanceResult,
  type BackendNeuralRoamCommandResult,
  type BackendNeuralRoamViewState,
  type BackendNeuralRoamViewStateResult,
} from '../../../packages/contracts/src/backend-rpc';
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
});

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
