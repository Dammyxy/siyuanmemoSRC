import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendNeuralRoamClientFacet {
  neuralRoamAdvance(request: BackendNeuralRoamAdvanceRequest): Promise<BackendNeuralRoamAdvanceResult>;
  neuralRoamViewState(request: BackendNeuralRoamViewStateRequest): Promise<BackendNeuralRoamViewStateResult>;
  neuralRoamCommand(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult>;
}

export class BackendNeuralRoamRpcClient implements BackendNeuralRoamClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  neuralRoamAdvance(request: BackendNeuralRoamAdvanceRequest): Promise<BackendNeuralRoamAdvanceResult> {
    return this.rpcCaller.call<BackendNeuralRoamAdvanceResult>('neural-roam.advance', request);
  }

  neuralRoamViewState(request: BackendNeuralRoamViewStateRequest): Promise<BackendNeuralRoamViewStateResult> {
    return this.rpcCaller.call<BackendNeuralRoamViewStateResult>('neural-roam.viewState', request);
  }

  neuralRoamCommand(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult> {
    return this.rpcCaller.call<BackendNeuralRoamCommandResult>('neural-roam.command', request);
  }
}
