import type { NeuralNavigationState } from '@/types/unified-data-source';

type NeuralBrowserCommandQueue = {
  jumpToHistoryNode(nodeId: string): Promise<boolean>;
  setCurrentFocus(
    nodeId: string,
    options?: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
      bookmarkCurrentPath?: boolean;
    },
  ): Promise<void>;
  setSourceEntry(nodeId: string, enabled?: boolean): Promise<void>;
  setAnchorEntry(nodeId: string, enabled?: boolean): Promise<void>;
  clearHistory(scope?: 'current' | 'all'): Promise<void>;
  clearRouteHistory?(): Promise<void>;
  getNavigationState(): Pick<NeuralNavigationState, 'currentNodeId'>;
};

type NeuralBrowserCommandDeps = {
  getQueue: () => NeuralBrowserCommandQueue | null;
  setSelectedTraceState: (options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  }) => void;
  previewNode: (nodeId: string) => Promise<void>;
  refreshNeuralSubviewData: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  handoffReviewSurface: (fallbackNodeId?: string | null) => Promise<void>;
  pushMessage: (message: string) => Promise<void>;
  pushError: (message: string) => Promise<void>;
  confirmClearHistory: () => Promise<boolean>;
  confirmClearRouteHistory?: () => Promise<boolean>;
  resetHistoryRequest: () => void;
  logError?: (message: string, error: unknown) => void;
  t?: (key: string, fallback: string) => string;
};

function translateNeuralCommandMessage(
  deps: Pick<NeuralBrowserCommandDeps, 't'>,
  key: string,
  fallback: string,
): string {
  return deps.t ? deps.t(key, fallback) : `${key}:${fallback}`;
}

export async function runNeuralJump(nodeId: string, deps: NeuralBrowserCommandDeps): Promise<void> {
  deps.setSelectedTraceState({
    selectedTraceEventId: null,
    selectedTraceNodeId: nodeId,
  });
  await deps.previewNode(nodeId);

  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    await deps.pushError(translateNeuralCommandMessage(deps, 'jumpHistoryNodeFailed', 'Failed to jump trajectory node'));
    return;
  }

  const jumped = await neuralQueue.jumpToHistoryNode(nodeId);
  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await deps.previewNode(navState.currentNodeId);
  }

  if (!jumped) {
    await deps.pushError(translateNeuralCommandMessage(deps, 'jumpHistoryNodeFailed', 'Failed to jump trajectory node'));
    return;
  }

  await deps.handoffReviewSurface(navState.currentNodeId || nodeId);
}

export async function runNeuralSetCurrentFocus(nodeId: string, deps: NeuralBrowserCommandDeps): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  deps.setSelectedTraceState({
    selectedTraceEventId: null,
    selectedTraceNodeId: nodeId,
  });
  await neuralQueue.setCurrentFocus(nodeId, {
    includeFocusAsFirst: false,
    resetHistory: false,
    bookmarkCurrentPath: true,
  });
  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();
  await deps.previewNode(nodeId);
  await deps.handoffReviewSurface(nodeId);
}

export async function runNeuralToggleSource(
  nodeId: string,
  enabled: boolean,
  deps: Pick<NeuralBrowserCommandDeps, 'getQueue' | 'refreshNeuralSubviewData' | 'refreshQueueCounts'>,
): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  await neuralQueue.setSourceEntry(nodeId, enabled);
  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();
}

export async function runNeuralToggleAnchor(
  nodeId: string,
  enabled: boolean,
  deps: Pick<NeuralBrowserCommandDeps, 'getQueue' | 'refreshNeuralSubviewData' | 'refreshQueueCounts'>,
): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  await neuralQueue.setAnchorEntry(nodeId, enabled);
  await deps.refreshNeuralSubviewData();
  await deps.refreshQueueCounts();
}

export async function runNeuralClearHistory(deps: NeuralBrowserCommandDeps): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }

  const ok = await deps.confirmClearHistory();
  if (!ok) {
    return;
  }

  try {
    deps.resetHistoryRequest();
    await neuralQueue.clearHistory('all');
    await deps.refreshNeuralSubviewData();
    await deps.refreshQueueCounts();
    await deps.pushMessage(translateNeuralCommandMessage(deps, 'historyClearedSuccess', '轨迹历史已清空'));
  } catch (error) {
    deps.logError?.('Failed to clear neural history:', error);
    await deps.pushError(translateNeuralCommandMessage(deps, 'clearHistoryFailed', '清空轨迹历史失败'));
  }
}

export async function runNeuralClearRouteHistory(deps: NeuralBrowserCommandDeps): Promise<void> {
  const neuralQueue = deps.getQueue();
  if (!neuralQueue) {
    return;
  }
  if (typeof neuralQueue.clearRouteHistory !== 'function') {
    await deps.pushError(translateNeuralCommandMessage(deps, 'clearRouteHistoryFailed', '清空航线日志失败'));
    return;
  }

  const ok = await (deps.confirmClearRouteHistory?.() ?? deps.confirmClearHistory());
  if (!ok) {
    return;
  }

  try {
    deps.resetHistoryRequest();
    await neuralQueue.clearRouteHistory();
    await deps.refreshNeuralSubviewData();
    await deps.refreshQueueCounts();
    await deps.pushMessage(translateNeuralCommandMessage(deps, 'routeHistoryClearedSuccess', '航线日志已清空'));
  } catch (error) {
    deps.logError?.('Failed to clear neural route history:', error);
    await deps.pushError(translateNeuralCommandMessage(deps, 'clearRouteHistoryFailed', '清空航线日志失败'));
  }
}
