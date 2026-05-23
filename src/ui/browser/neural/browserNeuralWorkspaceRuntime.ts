import type {
  BackendNeuralRoamCommand,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewState,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
} from '../../../../packages/contracts/src/backend-rpc';

export type BrowserNeuralWorkspaceManager = {
  readNeuralRoamViewState?: (
    request: BackendNeuralRoamViewStateRequest,
  ) => Promise<BackendNeuralRoamViewStateResult>;
  neuralRoamCommand?: (
    request: BackendNeuralRoamCommandRequest,
  ) => Promise<BackendNeuralRoamCommandResult>;
};

export type BrowserNeuralWorkspaceRuntimeDeps = {
  getManager: () => BrowserNeuralWorkspaceManager | null | undefined;
  t: (key: string, fallback: string) => string;
};

export type BrowserNeuralWorkspaceRuntime = ReturnType<typeof createBrowserNeuralWorkspaceRuntime>;

const NEURAL_ROAM_QUEUE_TYPE = 'neural-roam' as const;

function commandUnavailableResult(message: string): BackendNeuralRoamCommandResult {
  return {
    queueType: NEURAL_ROAM_QUEUE_TYPE,
    status: 'unavailable',
    viewState: null,
    queueState: null,
    unavailableReason: 'advance-contract-unavailable',
    message,
  };
}

function viewStateUnavailableResult(message: string): BackendNeuralRoamViewStateResult {
  return {
    queueType: NEURAL_ROAM_QUEUE_TYPE,
    status: 'unavailable',
    viewState: null,
    unavailableReason: 'advance-contract-unavailable',
    message,
  };
}

export function createBrowserNeuralWorkspaceRuntime(deps: BrowserNeuralWorkspaceRuntimeDeps) {
  const unavailableMessage = () => deps.t('neuralRoamEntryActionUnavailable', '神经漫游动作不可用');

  async function readViewStateResult(
    request: Omit<BackendNeuralRoamViewStateRequest, 'queueType'> = {},
  ): Promise<BackendNeuralRoamViewStateResult> {
    const manager = deps.getManager();
    if (typeof manager?.readNeuralRoamViewState !== 'function') {
      return viewStateUnavailableResult(unavailableMessage());
    }
    return manager.readNeuralRoamViewState({
      queueType: NEURAL_ROAM_QUEUE_TYPE,
      ...request,
    });
  }

  async function readViewState(
    request: Omit<BackendNeuralRoamViewStateRequest, 'queueType'> = {},
  ): Promise<BackendNeuralRoamViewState | null> {
    const result = await readViewStateResult(request);
    return result.status === 'ready' ? result.viewState : null;
  }

  async function runCommand(command: BackendNeuralRoamCommand): Promise<BackendNeuralRoamCommandResult> {
    const manager = deps.getManager();
    if (typeof manager?.neuralRoamCommand !== 'function') {
      return commandUnavailableResult(unavailableMessage());
    }
    return manager.neuralRoamCommand({
      queueType: NEURAL_ROAM_QUEUE_TYPE,
      command,
    });
  }

  return {
    readViewState,
    readViewStateResult,
    runCommand,
  };
}
