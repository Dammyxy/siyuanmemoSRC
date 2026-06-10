import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_NEURAL_ROAM_RPC_METHODS, type BackendNeuralRoamRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendNeuralRoamRpcRuntime {
  advance(
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<BackendNeuralRoamAdvanceResult> | BackendNeuralRoamAdvanceResult;
  readViewState(
    request: BackendNeuralRoamViewStateRequest,
  ): Promise<BackendNeuralRoamViewStateResult> | BackendNeuralRoamViewStateResult;
  executeCommand(
    request: BackendNeuralRoamCommandRequest,
  ): Promise<BackendNeuralRoamCommandResult> | BackendNeuralRoamCommandResult;
}

export interface BackendNeuralRoamRpcHandlerContext extends BackendRpcHandlerContext {
  readonly neuralRoam: BackendNeuralRoamRpcRuntime;
}

export type BackendNeuralRoamRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendNeuralRoamRpcHandlerContext
>;

const BACKEND_NEURAL_ROAM_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendNeuralRoamRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendNeuralRoamRpcHandlerContext
  >;
} = {
  'neural-roam.advance': {
    method: 'neural-roam.advance',
    family: 'neural-roam',
    handle(params, context): Promise<BackendNeuralRoamAdvanceResult> | BackendNeuralRoamAdvanceResult {
      const named = readRequiredNamedParams<BackendNeuralRoamAdvanceRequest>(
        params,
        'neural-roam.advance requires named params',
      );
      return context.neuralRoam.advance(named);
    },
  },
  'neural-roam.viewState': {
    method: 'neural-roam.viewState',
    family: 'neural-roam',
    handle(params, context): Promise<BackendNeuralRoamViewStateResult> | BackendNeuralRoamViewStateResult {
      const named = readRequiredNamedParams<BackendNeuralRoamViewStateRequest>(
        params,
        'neural-roam.viewState requires named params',
      );
      return context.neuralRoam.readViewState(named);
    },
  },
  'neural-roam.command': {
    method: 'neural-roam.command',
    family: 'neural-roam',
    handle(params, context): Promise<BackendNeuralRoamCommandResult> | BackendNeuralRoamCommandResult {
      const named = readRequiredNamedParams<BackendNeuralRoamCommandRequest>(
        params,
        'neural-roam.command requires named params',
      );
      return context.neuralRoam.executeCommand(named);
    },
  },
};

export const BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS: readonly BackendNeuralRoamRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_NEURAL_ROAM_RPC_METHODS.map((method) => ({
      ...BACKEND_NEURAL_ROAM_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendNeuralRoamRpcAdapter',
    })),
  );

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
  if (!params) {
    return null;
  }
  if (Array.isArray(params)) {
    const [first] = params;
    if (!first || typeof first !== 'object') {
      return null;
    }
    return first as TParams;
  }
  if (typeof params === 'object') {
    return params as TParams;
  }
  return null;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}
