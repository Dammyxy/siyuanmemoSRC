import type {
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewState,
  NeuralRoamSessionQueue,
} from '@/types/unified-data-source';
import { DEFAULT_NEURAL_ROAM_ROUTE_ID, type NeuralRoamRouteListItem } from '@/core/queue/neural/routes';

type ReviewTranslate = (key: string, fallback: string) => string;

type ReviewNeuralRouteToastType = 'info' | 'error';

type ReviewNeuralRouteShowMessage = (
  message: string,
  timeout?: number,
  type?: ReviewNeuralRouteToastType,
) => void;

type ReviewNeuralRouteLogger = {
  warn?: (...args: unknown[]) => void;
};

export type ReviewNeuralRouteBrowserSubview = 'concept-cards' | 'engine-history' | 'roam-history' | 'worldline-anchors';

export type ReviewNeuralRoutePromptOptions = {
  title: string;
  placeholder: string;
  defaultValue: string;
  confirmText: string;
  cancelText: string;
  visualVariant: 'workspace';
};

export type ReviewNeuralRouteConfirmOptions = {
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
  visualVariant: 'workspace';
};

export type ReviewNeuralRouteMenuItem = {
  id?: string;
  icon?: string;
  label: string;
  accelerator?: string;
  disabled?: boolean;
  click?: () => void | Promise<void>;
};

export type ReviewNeuralRouteCommandRunner = (
  request: BackendNeuralRoamCommandRequest,
) => Promise<BackendNeuralRoamCommandResult>;

export type ReviewNeuralRouteCommandRuntimeDeps = {
  t: ReviewTranslate;
  getNeuralQueue: () => NeuralRoamSessionQueue | null;
  getRouteCommand: () => ReviewNeuralRouteCommandRunner | null | undefined;
  getRoutes: () => NeuralRoamRouteListItem[];
  setRoutes: (routes: NeuralRoamRouteListItem[]) => void;
  showMessage: ReviewNeuralRouteShowMessage;
  reload: () => Promise<void> | void;
  promptRouteName: (options: ReviewNeuralRoutePromptOptions) => Promise<string | null | undefined>;
  confirmRouteDelete: (options: ReviewNeuralRouteConfirmOptions) => Promise<boolean>;
  openNeuralBrowserSubview: (subview: ReviewNeuralRouteBrowserSubview) => void;
  logger?: ReviewNeuralRouteLogger;
};

type RouteCommandFailureMessage = {
  key: string;
  fallback: string;
};

const ROUTE_MENU_SEPARATOR_PREFIX = 'review-neural-route-separator:';

export function isReviewNeuralRouteMenuSeparator(item: ReviewNeuralRouteMenuItem): boolean {
  return item.id?.startsWith(ROUTE_MENU_SEPARATOR_PREFIX) === true;
}

export function formatReviewNeuralRouteDetail(
  route: NeuralRoamRouteListItem,
  t: ReviewTranslate,
): string {
  return [
    `${t('routeConceptCount', '概念')} ${Math.max(0, Number(route.stats?.seedCount) || 0)}`,
    `${t('routeStationCount', '空间站')} ${Math.max(0, Number(route.stats?.anchorCount) || 0)}`,
    `${t('routeHistoryCount', '日志')} ${Math.max(0, Number(route.stats?.historyCount) || 0)}`,
  ].join(' · ');
}

function separator(id: string): ReviewNeuralRouteMenuItem {
  return {
    id: `${ROUTE_MENU_SEPARATOR_PREFIX}${id}`,
    label: '',
  };
}

function routeListFromBackendViewState(viewState: BackendNeuralRoamViewState | null | undefined): NeuralRoamRouteListItem[] | null {
  return Array.isArray(viewState?.routes)
    ? viewState.routes as NeuralRoamRouteListItem[]
    : null;
}

function activeRouteFrom(routes: NeuralRoamRouteListItem[]): NeuralRoamRouteListItem | null {
  return routes.find((route) => route.isActive) ?? routes[0] ?? null;
}

export function createReviewNeuralRouteCommandRuntime(deps: ReviewNeuralRouteCommandRuntimeDeps) {
  async function refreshRoutes(): Promise<void> {
    const backendRoutes = routeListFromBackendViewState(deps.getNeuralQueue()?.getBackendViewState?.() ?? null);
    if (backendRoutes) {
      deps.setRoutes(backendRoutes);
      return;
    }

    const neuralQueue = deps.getNeuralQueue();
    if (!neuralQueue?.listRoutes) {
      deps.setRoutes([]);
      return;
    }

    try {
      deps.setRoutes(await neuralQueue.listRoutes());
    } catch (error) {
      deps.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to list NeuralRoam routes:', error);
      deps.setRoutes([]);
    }
  }

  async function runBackendRouteCommand(
    command: BackendNeuralRoamCommandRequest['command'],
  ): Promise<BackendNeuralRoamCommandResult | null> {
    const runner = deps.getRouteCommand();
    if (typeof runner !== 'function') {
      return null;
    }
    return runner({
      queueType: 'neural-roam',
      command,
    });
  }

  async function syncRouteCommandResult(result: BackendNeuralRoamCommandResult | null): Promise<void> {
    if (!result) {
      return;
    }

    const neuralQueue = deps.getNeuralQueue();
    if (result.queueState && neuralQueue && typeof neuralQueue.syncFromBackendState === 'function') {
      await neuralQueue.syncFromBackendState(result.queueState);
    }
    neuralQueue?.setBackendViewState?.(result.viewState ?? null);

    const backendRoutes = routeListFromBackendViewState(result.viewState);
    if (backendRoutes) {
      deps.setRoutes(backendRoutes);
      return;
    }

    await refreshRoutes();
  }

  async function acceptCommandResult(
    result: BackendNeuralRoamCommandResult | null,
    failure: RouteCommandFailureMessage,
  ): Promise<boolean> {
    if (!result) {
      deps.showMessage(deps.t(failure.key, failure.fallback), 3000, 'error');
      return false;
    }
    if (result.status !== 'ok') {
      deps.showMessage(result.message || deps.t(failure.key, failure.fallback), 3000, 'error');
      return false;
    }
    await syncRouteCommandResult(result);
    return true;
  }

  async function switchRoute(routeId: string): Promise<void> {
    const accepted = await acceptCommandResult(
      await runBackendRouteCommand({ type: 'switch-route', routeId }),
      { key: 'neuralRoamRouteSwitchUnavailable', fallback: '航线切换不可用' },
    );
    if (accepted) {
      await deps.reload();
    }
  }

  async function createRoute(): Promise<void> {
    if (!deps.getRouteCommand()) {
      deps.showMessage(deps.t('neuralRoamRouteCreateUnavailable', '航线创建不可用'), 3000, 'error');
      return;
    }

    const name = await deps.promptRouteName({
      title: deps.t('createRoute', '新建航线'),
      placeholder: deps.t('routeNamePlaceholder', '航线名称'),
      defaultValue: deps.t('newRoute', '新航线'),
      confirmText: deps.t('confirm', '确认'),
      cancelText: deps.t('cancel', '取消'),
      visualVariant: 'workspace',
    });
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return;
    }

    const accepted = await acceptCommandResult(
      await runBackendRouteCommand({ type: 'create-route', name: normalizedName }),
      { key: 'neuralRoamRouteCreateUnavailable', fallback: '航线创建不可用' },
    );
    if (accepted) {
      await deps.reload();
    }
  }

  async function renameRoute(route: NeuralRoamRouteListItem): Promise<void> {
    if (!deps.getRouteCommand()) {
      deps.showMessage(deps.t('neuralRoamRouteRenameUnavailable', '航线重命名不可用'), 3000, 'error');
      return;
    }

    const name = await deps.promptRouteName({
      title: deps.t('renameRoute', '重命名航线'),
      placeholder: deps.t('routeNamePlaceholder', '航线名称'),
      defaultValue: route.name,
      confirmText: deps.t('confirm', '确认'),
      cancelText: deps.t('cancel', '取消'),
      visualVariant: 'workspace',
    });
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return;
    }

    await acceptCommandResult(
      await runBackendRouteCommand({ type: 'rename-route', routeId: route.id, name: normalizedName }),
      { key: 'neuralRoamRouteRenameUnavailable', fallback: '航线重命名不可用' },
    );
  }

  async function deleteRoute(route: NeuralRoamRouteListItem): Promise<void> {
    if (!deps.getRouteCommand()) {
      deps.showMessage(deps.t('neuralRoamRouteDeleteUnavailable', '航线删除不可用'), 3000, 'error');
      return;
    }

    const confirmed = await deps.confirmRouteDelete({
      title: deps.t('deleteRoute', '删除航线'),
      content: deps.t('deleteRouteConfirm', '删除航线只会移除航线状态，不会删除卡片或思源块。是否继续？'),
      confirmText: deps.t('delete', '删除'),
      cancelText: deps.t('cancel', '取消'),
      visualVariant: 'workspace',
    });
    if (!confirmed) {
      return;
    }

    const accepted = await acceptCommandResult(
      await runBackendRouteCommand({ type: 'delete-route', routeId: route.id }),
      { key: 'neuralRoamRouteDeleteUnavailable', fallback: '航线删除不可用' },
    );
    if (accepted) {
      await deps.reload();
    }
  }

  async function saveTemporaryRoute(route: NeuralRoamRouteListItem): Promise<void> {
    if (!deps.getRouteCommand()) {
      deps.showMessage(deps.t('neuralRoamRouteSaveUnavailable', '临时航线保存不可用'), 3000, 'error');
      return;
    }

    const accepted = await acceptCommandResult(
      await runBackendRouteCommand({ type: 'save-temporary-route', routeId: route.id }),
      { key: 'neuralRoamRouteSaveUnavailable', fallback: '临时航线保存不可用' },
    );
    if (accepted) {
      deps.showMessage(deps.t('temporaryRouteSaved', '临时航线已保存'), 2500, 'info');
    }
  }

  function buildMenuItems(): ReviewNeuralRouteMenuItem[] {
    const routes = deps.getRoutes();
    const activeRoute = activeRouteFrom(routes);
    const items: ReviewNeuralRouteMenuItem[] = routes.map((route) => ({
      icon: route.isActive ? 'iconCheck' : undefined,
      label: route.name,
      accelerator: formatReviewNeuralRouteDetail(route, deps.t),
      disabled: route.isActive,
      click: () => switchRoute(route.id),
    }));

    if (routes.length > 0) {
      items.push(separator('routes'));
    }

    items.push({
      icon: 'iconAdd',
      label: deps.t('createRoute', '新建航线'),
      click: createRoute,
    });

    if (activeRoute) {
      items.push({
        icon: 'iconEdit',
        label: deps.t('renameRoute', '重命名航线'),
        click: () => renameRoute(activeRoute),
      });
      if (activeRoute.temporary) {
        items.push({
          icon: 'iconSave',
          label: deps.t('saveAsRoute', '保存为航线'),
          click: () => saveTemporaryRoute(activeRoute),
        });
      }
      if (activeRoute.id !== DEFAULT_NEURAL_ROAM_ROUTE_ID) {
        items.push({
          icon: 'iconTrashcan',
          label: deps.t('deleteRoute', '删除航线'),
          click: () => deleteRoute(activeRoute),
        });
      }
    }

    items.push(
      separator('browser'),
      {
        icon: 'iconHistory',
        label: deps.t('routeLog', '航线日志'),
        click: () => deps.openNeuralBrowserSubview('roam-history'),
      },
      {
        icon: 'iconHistory',
        label: deps.t('engineHistory', '双链轨道'),
        click: () => deps.openNeuralBrowserSubview('engine-history'),
      },
      {
        icon: 'iconDatabase',
        label: deps.t('openBrowserNeuralRoamPanel', '打开浏览器神经漫游面板'),
        click: () => deps.openNeuralBrowserSubview('concept-cards'),
      },
    );

    return items;
  }

  return {
    buildMenuItems,
    createRoute,
    deleteRoute,
    refreshRoutes,
    renameRoute,
    saveTemporaryRoute,
    switchRoute,
    syncRouteCommandResult,
  };
}
