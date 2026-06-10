import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_NEURAL_ROAM_RPC_METHODS = [
  'neural-roam.advance',
  'neural-roam.viewState',
  'neural-roam.command',
] as const satisfies readonly BackendRpcMethod[];

export type BackendNeuralRoamRpcMethod = typeof BACKEND_NEURAL_ROAM_RPC_METHODS[number];

export type BackendNeuralRoamRpcMethodContractMap = {
  readonly 'neural-roam.advance': BackendRpcMethodContract<
    'neural-roam.advance',
    BackendNeuralRoamAdvanceRequest,
    BackendNeuralRoamAdvanceResult
  >;
  readonly 'neural-roam.viewState': BackendRpcMethodContract<
    'neural-roam.viewState',
    BackendNeuralRoamViewStateRequest,
    BackendNeuralRoamViewStateResult
  >;
  readonly 'neural-roam.command': BackendRpcMethodContract<
    'neural-roam.command',
    BackendNeuralRoamCommandRequest,
    BackendNeuralRoamCommandResult
  >;
};

export const BACKEND_NEURAL_ROAM_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'neural-roam.advance', family: 'neural-roam', clientExposure: 'facade' },
  { method: 'neural-roam.viewState', family: 'neural-roam', clientExposure: 'facade' },
  { method: 'neural-roam.command', family: 'neural-roam', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_NEURAL_ROAM_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendNeuralRoamRpcMethodContractMap>;
