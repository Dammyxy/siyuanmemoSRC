import { getNeuralEngineLabel } from '@/ui/shared/neuralRoamLabels';
import type { BrowserMode } from '../types';
import type {
  NeuralEngineMode,
  NeuralNavigationMode,
  NeuralNavigationState,
} from '@/types/unified-data-source';

type NeuralNavigationQueue = {
  getEngineMode(): NeuralEngineMode;
  setEngineMode(mode: NeuralEngineMode, options?: { carryCurrentNode?: boolean }): Promise<void>;
  getNavigationState(): Pick<NeuralNavigationState, 'currentNodeId' | 'navigationMode'>;
  setNavigationMode(mode: NeuralNavigationMode): void;
  returnToBookmark(): boolean;
};

type NeuralNavigationDeps = {
  getQueue: () => NeuralNavigationQueue | null;
  setSelectedTraceState: (options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  }) => void;
  previewNode: (nodeId: string) => Promise<void>;
  refreshNeuralSubviewData: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  pushMessage: (message: string) => Promise<void>;
  pushError: (message: string) => Promise<void>;
  t: (key: string, fallback: string) => string;
};

export async function runNeuralToggleEngineMode(deps: NeuralNavigationDeps): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  const currentMode = neuralQueue.getEngineMode();
  const nextMode = currentMode === 'hyperspace' ? 'orbit' : 'hyperspace';
  await neuralQueue.setEngineMode(nextMode, { carryCurrentNode: true });
  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    deps.setSelectedTraceState({
      selectedTraceEventId: null,
      selectedTraceNodeId: navState.currentNodeId,
    });
    await deps.previewNode(navState.currentNodeId);
  }

  const modeText = getNeuralEngineLabel(nextMode, deps.t, 'full');
  await deps.pushMessage(deps.t('engineModeSwitched', '已切换引擎：{mode}').replace('{mode}', modeText));
}

export async function runNeuralToggleNavigationMode(deps: NeuralNavigationDeps): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  const currentMode = neuralQueue.getNavigationState().navigationMode;
  const nextMode = currentMode === 'follow' ? 'explore' : 'follow';
  neuralQueue.setNavigationMode(nextMode);
  await deps.refreshNeuralSubviewData();

  const modeText = nextMode === 'follow'
    ? deps.t('navModeFollow', '沿当前路径')
    : deps.t('navModeExplore', '自由航行');
  await deps.pushMessage(deps.t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText));
}

export async function runNeuralReturnToBookmark(
  deps: NeuralNavigationDeps,
): Promise<{ moved: boolean; currentNodeId: string | null }> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return { moved: false, currentNodeId: null };
  }

  const moved = neuralQueue.returnToBookmark();
  if (!moved) {
    return { moved: false, currentNodeId: null };
  }

  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    deps.setSelectedTraceState({
      selectedTraceEventId: null,
      selectedTraceNodeId: navState.currentNodeId,
    });
    await deps.previewNode(navState.currentNodeId);
  }
  return { moved: true, currentNodeId: navState.currentNodeId ?? null };
}

export async function runNeuralReviewSurfaceHandoff(options: {
  result: 'tab' | 'dialog' | 'failed' | 'none';
  mode: BrowserMode;
  close: () => void;
  pushError: (message: string) => Promise<void>;
  t: (key: string, fallback: string) => string;
}): Promise<void> {
  if (options.result === 'tab' && options.mode === 'dialog') {
    options.close();
    return;
  }

  if (options.result === 'failed') {
    await options.pushError(options.t('syncOpenReviewTabFailed', 'Failed to sync the open review tab'));
  }
}
