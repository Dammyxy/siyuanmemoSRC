import { getNeuralEngineLabel, getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import {
  buildNeuralRoamModeOptions,
  type NeuralRoamUserMode,
} from './semantic/semanticActivationModePreference';
import type {
  NeuralEngineMode,
  NeuralRoamHistoryEntry,
  NeuralRoamSessionQueue,
  NeuralRoamSourceEntry,
} from '@/types/unified-data-source';
import type {
  BackendNeuralRoamCommand,
  BackendNeuralRoamCommandResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { ReviewMenuItem } from './reviewMoreMenuItems';

export type ReviewNeuralBrowserSubview = 'concept-cards' | 'engine-history' | 'roam-history' | 'worldline-anchors';

export type ReviewNeuralToolbarAction =
  | 'lock-focus'
  | 'neural-engine-mode'
  | 'neural-nav-mode'
  | 'neural-return-bookmark';

export type ReviewNeuralMenuAction =
  | 'neural-focuses'
  | 'neural-history';

type ReviewTranslate = (key: string, fallback: string) => string;

type ReviewNeuralLogger = {
  debug?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type ReviewNeuralToastType = 'info' | 'error';

type ReviewNeuralShowMessage = (
  message: string,
  timeout?: number,
  type?: ReviewNeuralToastType,
) => void;

type ReviewNeuralCommandDeps = {
  t: ReviewTranslate;
  neuralQueue: NeuralRoamSessionQueue | null;
  currentBlockId: string;
  loadCardByBlockId: (blockId: string) => void | Promise<void>;
  refreshNavigationState: () => void;
  showMessage: ReviewNeuralShowMessage;
  logger?: ReviewNeuralLogger;
  runNeuralRoamCommand?: (command: BackendNeuralRoamCommand) => Promise<BackendNeuralRoamCommandResult>;
};

type ReviewNeuralEngineModeSelectionDeps = ReviewNeuralCommandDeps & {
  selectedMode: NeuralRoamUserMode;
  persistPreferredMode: (mode: NeuralRoamUserMode) => void | Promise<void>;
};

type BuildReviewNeuralMenuItemsInput = Omit<ReviewNeuralCommandDeps, 'currentBlockId'> & {
  neuralQueue: NeuralRoamSessionQueue;
  openNeuralBrowserSubview: (subview: ReviewNeuralBrowserSubview) => void;
};

type BuildReviewNeuralEngineModeMenuItemsInput = {
  t: ReviewTranslate;
  currentMode: NeuralRoamUserMode;
  onSelect: (mode: NeuralRoamUserMode) => void | Promise<void>;
};

export function isReviewNeuralToolbarAction(actionType: string): actionType is ReviewNeuralToolbarAction {
  return actionType === 'lock-focus'
    || actionType === 'neural-engine-mode'
    || actionType === 'neural-nav-mode'
    || actionType === 'neural-return-bookmark';
}

export function isReviewNeuralMenuAction(actionType: string): actionType is ReviewNeuralMenuAction {
  return actionType === 'neural-focuses' || actionType === 'neural-history';
}

export function buildReviewNeuralEngineModeMenuItems(input: BuildReviewNeuralEngineModeMenuItemsInput): ReviewMenuItem[] {
  const { t, currentMode, onSelect } = input;
  return buildNeuralRoamModeOptions(t).map((option) => ({
    icon: 'iconRefresh',
    label: option.mode === currentMode ? `${option.label} ✓` : option.label,
    description: option.description,
    disabled: option.mode === currentMode,
    click: () => onSelect(option.mode),
  }));
}

export async function handleReviewNeuralEngineModeSelection(
  deps: ReviewNeuralEngineModeSelectionDeps,
): Promise<void> {
  const { selectedMode, persistPreferredMode, neuralQueue, showMessage, t, logger } = deps;
  const effectiveMode = selectedMode === 'semantic-activation' ? 'orbit' : selectedMode;
  await persistPreferredMode(effectiveMode);

  if (!neuralQueue) {
    showMessage(t('queueNoFocusSupport', 'This queue does not support center actions'), 3000, 'error');
    return;
  }

  try {
    await switchNeuralEngineMode(effectiveMode, { ...deps, neuralQueue });
  } catch (error) {
    logger?.error?.('[SiYuanMemo][ReviewView] Failed to switch engine mode:', error);
    showMessage(t('engineModeSwitchFailed', 'Failed to switch engine mode'), 3000, 'error');
  }
}

function shortenBlockId(blockId: string): string {
  return blockId.length > 20 ? `${blockId.slice(0, 20)}...` : blockId;
}

function resolveNeuralSourceLabels(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate) {
  const engineMode = neuralQueue.getNavigationState().engineMode ?? 'orbit';
  return getNeuralSourceLabelSet(engineMode, t);
}

function getReviewSourceListLabel(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('viewActivationSourceList', '查看概念卡：激活源列表')
    : t('viewOrbitCenterList', '查看概念卡：轨道中心列表');
}

function getBuildStationSuccessMessage(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('stationBuiltAndSetPrimaryActivationSource', '已建立空间站，并切换为当前主概念卡：激活源')
    : t('stationBuiltAndSetOrbitCenter', '已建立空间站，并切换为当前概念卡：轨道中心');
}

function getBuildStationFailedMessage(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('buildStationAndSetPrimaryActivationSourceFailed', '建立空间站并切换主概念卡：激活源失败')
    : t('buildStationAndSetOrbitCenterFailed', '建立空间站并切换概念卡：轨道中心失败');
}

function getLockCurrentCenterFailedMessage(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('lockPrimaryActivationSourceFailed', '设为主概念卡：激活源失败')
    : t('lockCurrentOrbitCenterFailed', '设为当前概念卡：轨道中心失败');
}

function getStartPathFromSourceMessage(
  nodeId: string,
  neuralQueue: NeuralRoamSessionQueue,
  t: ReviewTranslate,
): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('roamStartedFromActivationSource', '已从概念卡：激活源 {id} 开始新的路径').replace('{id}', nodeId)
    : t('roamStartedFromOrbitCenter', '已从概念卡：轨道中心 {id} 开始新的路径').replace('{id}', nodeId);
}

function getSourceRemovedMessage(
  nodeId: string,
  neuralQueue: NeuralRoamSessionQueue,
  t: ReviewTranslate,
): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('activationSourceRemoved', '已移除概念卡：激活源 {id}').replace('{id}', nodeId)
    : t('orbitCenterRemoved', '已移除概念卡：轨道中心 {id}').replace('{id}', nodeId);
}

function getRemoveSourceFailedMessage(neuralQueue: NeuralRoamSessionQueue, t: ReviewTranslate): string {
  return neuralQueue.getNavigationState().engineMode === 'hyperspace'
    ? t('removeActivationSourceFailed', '移除概念卡：激活源失败')
    : t('removeOrbitCenterFailed', '移除概念卡：轨道中心失败');
}

async function syncNeuralQueueFromBackendResult(
  neuralQueue: NeuralRoamSessionQueue | null,
  result: BackendNeuralRoamCommandResult | null | undefined,
): Promise<void> {
  if (!result) {
    return;
  }
  if (result.queueState && neuralQueue && typeof neuralQueue.syncFromBackendState === 'function') {
    await neuralQueue.syncFromBackendState(result.queueState);
  }
  neuralQueue?.setBackendViewState?.(result.viewState ?? null);
}

async function runRequiredBackendNeuralCommand(
  deps: ReviewNeuralCommandDeps,
  neuralQueue: NeuralRoamSessionQueue | null,
  command: BackendNeuralRoamCommand,
): Promise<BackendNeuralRoamCommandResult | null> {
  if (!deps.runNeuralRoamCommand) {
    deps.showMessage(
      deps.t('neuralRoamEntryActionUnavailable', '神经漫游动作不可用'),
      3000,
      'error',
    );
    return null;
  }

  const result = await deps.runNeuralRoamCommand(command);
  await syncNeuralQueueFromBackendResult(neuralQueue, result);
  if (result.status !== 'ok') {
    deps.showMessage(
      result.message || deps.t('neuralRoamEntryActionUnavailable', '神经漫游动作不可用'),
      3000,
      'error',
    );
    return null;
  }
  return result;
}

function buildSeedMenuLabel(entry: NeuralRoamSourceEntry, t: ReviewTranslate): string {
  const preview = entry.nodePreview || shortenBlockId(entry.nodeId);
  const typeLabel = entry.role === 'activation-source'
    ? t('activationKindSourceRoot', '概念卡：激活源')
    : t('activationKindFocusRoot', '概念卡：轨道中心节点');
  return `${preview} — ${typeLabel}`;
}

function resolveAssociationTypeLabel(entry: NeuralRoamHistoryEntry, t: ReviewTranslate): string {
  const reason = String(entry.reason || '').trim();
  if (reason) {
    return reason;
  }

  const associationTypeMap: Record<string, string> = {
    backlink: t('associationBacklink', '反向链接'),
    'outgoing-direct': t('associationOutgoingDirect', '直接引用'),
    'outgoing-indirect': t('associationOutgoingIndirect', '间接引用'),
    descriptor: t('descriptorCard', '描述符卡'),
    'associated-review': t('associationAssociatedReview', '关联复习卡'),
    focus: t('associationFocusNode', '概念卡：轨道中心节点'),
    source: t('activationKindSourceRoot', '概念卡：激活源'),
    path: t('associationPathNode', '轨迹节点'),
  };
  return associationTypeMap[entry.associationType] || entry.associationType || t('unknown', '未知');
}

function buildHistoryLabel(entry: NeuralRoamHistoryEntry, absoluteIndex: number, t: ReviewTranslate): string {
  const preview = entry.nodePreview || shortenBlockId(entry.nodeId);
  const association = resolveAssociationTypeLabel(entry, t);
  return `${absoluteIndex}. ${preview} · ${association}`;
}

export async function startWorldlineFromCurrentNode(
  neuralQueue: NeuralRoamSessionQueue,
  blockId: string,
  deps: ReviewNeuralCommandDeps,
): Promise<void> {
  const anchorResult = await runRequiredBackendNeuralCommand(
    deps,
    neuralQueue,
    { type: 'set-anchor', nodeId: blockId, enabled: true },
  );
  if (!anchorResult) {
    return;
  }
  await runRequiredBackendNeuralCommand(deps, neuralQueue, {
    type: 'set-current-focus',
    nodeId: blockId,
    includeFocusAsFirst: false,
    resetHistory: false,
    bookmarkCurrentPath: true,
  });
}

async function switchNeuralEngineMode(
  nextMode: NeuralEngineMode,
  deps: ReviewNeuralCommandDeps & { neuralQueue: NeuralRoamSessionQueue },
): Promise<void> {
  const { neuralQueue, refreshNavigationState, loadCardByBlockId, showMessage, t } = deps;
  const backendResult = await runRequiredBackendNeuralCommand(deps, neuralQueue, {
    type: 'switch-engine-mode',
    mode: nextMode,
    carryCurrentNode: true,
  });
  if (!backendResult) {
    return;
  }
  refreshNavigationState();
  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await loadCardByBlockId(navState.currentNodeId);
  }
  const modeText = getNeuralEngineLabel(nextMode, t, 'full');
  showMessage(t('engineModeSwitched', '已切换引擎：{mode}').replace('{mode}', modeText), 2000, 'info');
}

export async function handleReviewNeuralToolbarAction(
  actionType: ReviewNeuralToolbarAction,
  deps: ReviewNeuralCommandDeps,
): Promise<void> {
  const { neuralQueue, currentBlockId, refreshNavigationState, loadCardByBlockId, showMessage, logger, t } = deps;

  if (actionType === 'lock-focus') {
    logger?.debug?.('[SiYuanMemo][ReviewView] Lock focus button clicked');
    if (!currentBlockId) {
      logger?.error?.('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
      return;
    }
    if (!neuralQueue) {
      logger?.error?.('[SiYuanMemo][ReviewView] Queue does not support orbit center actions');
      showMessage(t('queueNoFocusSupport', 'This queue does not support center actions'), 3000, 'error');
      return;
    }
    try {
      await startWorldlineFromCurrentNode(neuralQueue, currentBlockId, deps);
      refreshNavigationState();
      logger?.debug?.('[SiYuanMemo][ReviewView] Started a new orbit from center node:', currentBlockId);
      showMessage(getBuildStationSuccessMessage(neuralQueue, t), 3000, 'info');
    } catch (error) {
      logger?.error?.('[SiYuanMemo][ReviewView] Failed to set orbit center:', error);
      showMessage(getBuildStationFailedMessage(neuralQueue, t), 3000, 'error');
    }
    return;
  }

  if (!neuralQueue) {
    return;
  }

  if (actionType === 'neural-engine-mode') {
    logger?.debug?.('[SiYuanMemo][ReviewView] Engine mode toggle button clicked');
    const nextMode = neuralQueue.getEngineMode() === 'hyperspace' ? 'orbit' : 'hyperspace';
    try {
      await switchNeuralEngineMode(nextMode, { ...deps, neuralQueue });
    } catch (error) {
      logger?.error?.('[SiYuanMemo][ReviewView] Failed to switch engine mode:', error);
      showMessage(t('engineModeSwitchFailed', 'Failed to switch engine mode'), 3000, 'error');
    }
    return;
  }

  if (actionType === 'neural-nav-mode') {
    logger?.debug?.('[SiYuanMemo][ReviewView] Navigation mode toggle button clicked');
    const currentMode = neuralQueue.getNavigationState().navigationMode;
    const newMode = currentMode === 'follow' ? 'explore' : 'follow';
    if (newMode === 'explore') {
      if (!currentBlockId) {
        logger?.error?.('[SiYuanMemo][ReviewView] Cannot start branch exploration without current block id');
        showMessage(getLockCurrentCenterFailedMessage(neuralQueue, t), 3000, 'error');
        return;
      }
      try {
        await startWorldlineFromCurrentNode(neuralQueue, currentBlockId, deps);
        refreshNavigationState();
        const modeText = t('navModeExplore', '自由航行');
        showMessage(t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText), 2000, 'info');
      } catch (error) {
        logger?.error?.('[SiYuanMemo][ReviewView] Failed to promote current node as worldline focus:', error);
        showMessage(getLockCurrentCenterFailedMessage(neuralQueue, t), 3000, 'error');
      }
      return;
    }

    const backendResult = await runRequiredBackendNeuralCommand(deps, neuralQueue, {
      type: 'set-navigation-mode',
      mode: newMode,
    });
    if (!backendResult) {
      return;
    }
    refreshNavigationState();
    const modeText = newMode === 'follow'
      ? t('navModeFollow', '沿当前路径')
      : t('navModeExplore', '自由航行');
    showMessage(t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText), 2000, 'info');
    return;
  }

  logger?.debug?.('[SiYuanMemo][ReviewView] Return to bookmark button clicked');
  const backendResult = await runRequiredBackendNeuralCommand(deps, neuralQueue, {
    type: 'return-to-bookmark',
  });
  if (!backendResult) {
    return;
  }
  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await loadCardByBlockId(navState.currentNodeId);
  }
  refreshNavigationState();
  showMessage(t('navReturnedToBookmark', '已返回空间站'), 2000, 'info');
}

export function buildReviewNeuralFocusMenuItems(input: BuildReviewNeuralMenuItemsInput): ReviewMenuItem[] {
  const { neuralQueue, openNeuralBrowserSubview, refreshNavigationState, loadCardByBlockId, showMessage, logger, t } = input;
  const sourceLabels = resolveNeuralSourceLabels(neuralQueue, t);
  const seedEntries = neuralQueue.getSourceSnapshot().slice().sort((a, b) => b.visitedAt - a.visitedAt);

  return [
    {
      icon: 'iconList',
      label: getReviewSourceListLabel(neuralQueue, t),
      click: () => {
        openNeuralBrowserSubview('concept-cards');
      },
    },
    {
      icon: 'iconPlay',
      label: sourceLabels.startPath,
      disabled: seedEntries.length === 0,
      submenu: seedEntries.map((entry) => ({
        label: buildSeedMenuLabel(entry, t),
        click: async () => {
          try {
            const backendResult = await runRequiredBackendNeuralCommand(input, neuralQueue, {
              type: 'set-current-focus',
              nodeId: entry.nodeId,
              includeFocusAsFirst: true,
              resetHistory: false,
              bookmarkCurrentPath: true,
            });
            if (!backendResult) {
              return;
            }
            await loadCardByBlockId(entry.nodeId);
            refreshNavigationState();
            showMessage(getStartPathFromSourceMessage(entry.nodeId, neuralQueue, t), 3000, 'info');
          } catch (error) {
            logger?.error?.('[SiYuanMemo][ReviewView] Failed to start roaming from focus:', error);
            showMessage(t('roamStartFailed', '开始漫游失败'), 3000, 'error');
          }
        },
      })),
    },
    {
      icon: 'iconTrashcan',
      label: sourceLabels.removeItem,
      disabled: seedEntries.length === 0,
      submenu: seedEntries.map((entry) => ({
        label: buildSeedMenuLabel(entry, t),
        click: async () => {
          try {
            const backendResult = await runRequiredBackendNeuralCommand(input, neuralQueue, {
              type: 'set-source',
              nodeId: entry.nodeId,
              enabled: false,
            });
            if (!backendResult) {
              return;
            }
            refreshNavigationState();
            showMessage(getSourceRemovedMessage(entry.nodeId, neuralQueue, t), 3000, 'info');
          } catch (error) {
            logger?.error?.('[SiYuanMemo][ReviewView] Failed to remove focus:', error);
            showMessage(getRemoveSourceFailedMessage(neuralQueue, t), 3000, 'error');
          }
        },
      })),
    },
  ];
}

export function buildReviewNeuralHistoryMenuItems(input: BuildReviewNeuralMenuItemsInput): ReviewMenuItem[] {
  const { neuralQueue, openNeuralBrowserSubview, refreshNavigationState, loadCardByBlockId, showMessage, t } = input;
  const totalHistoryCount = neuralQueue.getHistoryCount();
  const jumpCandidates = neuralQueue.getHistoryPage({
    offset: 0,
    limit: 20,
  }).entries.slice().reverse();

  return [
    {
      icon: 'iconHistory',
      label: t('viewEngineHistory', '查看双链轨道'),
      click: () => {
        openNeuralBrowserSubview('engine-history');
      },
    },
    {
      icon: 'iconHistory',
      label: t('viewHistory', '查看航线日志'),
      click: () => {
        openNeuralBrowserSubview('roam-history');
      },
    },
    {
      icon: 'iconBookmark',
      label: t('viewAnchors', '查看空间站'),
      click: () => {
        openNeuralBrowserSubview('worldline-anchors');
      },
    },
    {
      icon: 'iconOpen',
      label: t('jumpHistoryNode', '跳转轨迹节点'),
      disabled: jumpCandidates.length === 0,
      submenu: jumpCandidates.map((entry, index) => ({
        label: buildHistoryLabel(entry, totalHistoryCount - jumpCandidates.length + index + 1, t),
        click: async () => {
          const backendResult = await runRequiredBackendNeuralCommand(input, neuralQueue, {
            type: 'jump-history-node',
            nodeId: entry.nodeId,
          });
          if (!backendResult) {
            return;
          }
          const currentNodeId = neuralQueue.getNavigationState().currentNodeId || entry.nodeId;
          await loadCardByBlockId(currentNodeId);
          refreshNavigationState();
        },
      })),
    },
    {
      icon: 'iconClear',
      label: t('clearHistory', '清空轨迹历史'),
      click: async () => {
        const backendResult = await runRequiredBackendNeuralCommand(input, neuralQueue, {
          type: 'clear-history',
          scope: 'all',
        });
        if (!backendResult) {
          return;
        }
        refreshNavigationState();
        showMessage(t('historyClearedSuccess', '轨迹历史已清空'), 3000, 'info');
      },
    },
  ];
}
