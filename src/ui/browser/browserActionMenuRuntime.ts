import { Menu } from 'siyuan';
import type { CellContextMenuEvent } from 'ag-grid-community';
import { confirmDialog } from '@/utils/dialog';
import { PerformanceMonitor } from '@/utils/performance';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import type { NeuralEngineMode } from '@/types/unified-data-source';
import type { BrowserCard } from './types';
import type { BrowserActionTarget, ICardDataSource, SortModel } from './datasource/types';
import {
  getBrowserActionErrorMessage,
  getBrowserActionLabel,
  parseBrowserAddToQueueResult,
  parseBrowserRelativePriorityResult,
  shouldForceRefreshAfterBrowserAction,
  shouldReloadAfterBrowserAction,
  summarizeBrowserActionResult,
} from './browserActionFeedback';
import { createBrowserActionParamBuilders } from './browserActionParamDialogs';
import { resolveQueryableDataSource } from './browserDataSnapshots';
import { SORT_FIELD_CONFIGS } from './constants';
import { interpolateI18n } from './utils/i18n';
import { resolveSubsetReviewSelection } from './utils/subsetReviewSelection';

type BrowserTranslate = (key: string, fallback: string) => string;

export type BrowserMenuItem = {
  icon?: string;
  label?: string;
  type?: 'separator';
  click?: () => void;
  submenu?: BrowserMenuItem[];
};

type BrowserMenuPort = {
  addItem: (item: BrowserMenuItem) => void;
  open: (options: { x: number; y: number; isLeft?: boolean }) => void;
};

type BrowserActionLike = {
  id: string;
  label: string;
  icon?: string;
  submenu?: BrowserActionLike[];
};

type BrowserLogger = {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type BrowserActionSelectionRuntime = {
  mode: ReadonlyRef<string>;
  explicitIds: ReadonlyRef<Set<string>>;
  resolveSelectedIds: (ids: string[]) => string[];
};

type BrowserSubsetReviewPlugin = {
  openSubsetReviewDialog?: (
    blockIds: string[],
    options?: { cardIds?: string[]; preferredCardId?: string },
  ) => Promise<void> | void;
};

type BrowserActionStoragePort = RescheduleStoragePort;

type BrowserQueueSizePort = {
  getSize?: () => number | Promise<number>;
};

type BrowserNeuralQueuePort = {
  getNavigationState: () => { engineMode?: NeuralEngineMode };
  getSeedSnapshot: () => Array<{ nodeId: string }>;
  setSeedEntry: (blockId: string, enabled: boolean) => Promise<void> | void;
};

type BrowserPracticeDialogManager = {
  openReviewDialog?: () => Promise<void> | void;
  openIncrementalLearningDialog?: () => Promise<void> | void;
  openFinalDrillDialog?: () => Promise<void> | void;
  openNeuralRoamDialog?: () => Promise<void> | void;
  openFilterGroupPracticeDialog?: () => Promise<void> | void;
};

export type BrowserActionMenuRuntimeDeps = {
  applyRandomSort: () => Promise<void> | void;
  applySort: (field: string, order: 'asc' | 'desc') => void;
  buildCardTypeSubmenu: (selected: BrowserCard[]) => BrowserMenuItem[];
  currentDataSource: ReadonlyRef<ICardDataSource | null>;
  createMenu?: (id: string) => BrowserMenuPort;
  defer?: (fn: () => void) => void;
  describeCurrentFilterSummary: () => string;
  ensureAllRowsSnapshotReady: () => Promise<BrowserCard[]>;
  getDialogManager: () => BrowserPracticeDialogManager | null | undefined;
  getNeuralRoamQueue: () => BrowserNeuralQueuePort | null | undefined;
  getPlugin: () => BrowserSubsetReviewPlugin | null | undefined;
  getQueueById: (id: string) => BrowserQueueSizePort | undefined;
  getStorage: () => BrowserActionStoragePort | null | undefined;
  globalSelection: BrowserActionSelectionRuntime;
  gridApi: ReadonlyRef<{ refreshCells?: (params: { force: boolean }) => void } | null>;
  i18n?: Record<string, string>;
  invalidateCardCache: () => void;
  isMobileMode: ReadonlyRef<boolean>;
  isNeuralRoamQueueActive: ReadonlyRef<boolean>;
  loadAllRowsForCurrentView: (sortModel?: SortModel[]) => Promise<BrowserCard[]>;
  loadData: (forceRefresh?: boolean) => Promise<void>;
  logger: BrowserLogger;
  neuralSubview: ReadonlyRef<string>;
  openDocumentTabById: (blockId: string) => Promise<boolean>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  refreshGlobalStats: (force?: boolean) => Promise<void> | void;
  refreshNeuralSubviewData: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  resolveNeuralSourceLabels: (engineMode?: NeuralEngineMode) => {
    addItem: string;
    removeItem: string;
  };
  selectedRows: ReadonlyRef<BrowserCard[]>;
  t: BrowserTranslate;
};

function createDefaultMenu(id: string): BrowserMenuPort {
  return new Menu(id) as unknown as BrowserMenuPort;
}

function defaultDefer(fn: () => void): void {
  setTimeout(fn, 0);
}

function isDevMode(): boolean {
  return typeof process !== 'undefined' && String(process.env.DEV_MODE) === 'true';
}

export function createBrowserActionMenuRuntime(deps: BrowserActionMenuRuntimeDeps) {
  const createMenu = deps.createMenu ?? createDefaultMenu;
  const defer = deps.defer ?? defaultDefer;
  const actionParamBuilders = createBrowserActionParamBuilders({
    ensureAllRowsSnapshotReady: deps.ensureAllRowsSnapshotReady,
    getQueueById: deps.getQueueById,
    getStorage: deps.getStorage,
    i18n: deps.i18n,
    loadAllRowsForCurrentView: deps.loadAllRowsForCurrentView,
    t: deps.t,
  });

  function getActionLabel(action: { id: string; label: string }): string {
    return getBrowserActionLabel(action, deps.t);
  }

  function getReviewSubsetAction(): BrowserActionLike {
    return {
      id: 'review-subset',
      label: deps.t('reviewSubset', 'Review Subset'),
      icon: 'iconPlay',
    };
  }

  function ensureReviewSubsetAction(actions: BrowserActionLike[]): BrowserActionLike[] {
    if (typeof deps.getPlugin()?.openSubsetReviewDialog !== 'function') {
      return actions;
    }

    if (actions.some((action) => action.id === 'review-subset')) {
      return actions;
    }

    return [getReviewSubsetAction(), ...actions];
  }

  async function openSubsetReviewFromSelection(
    cards: BrowserActionTarget[],
    anchorRow?: BrowserCard,
  ): Promise<void> {
    const plugin = deps.getPlugin();
    if (typeof plugin?.openSubsetReviewDialog !== 'function') {
      await deps.pushErrMsg(deps.t('initFailed', 'FSRS plugin initialization failed, please check console for errors'));
      return;
    }

    const selection = resolveSubsetReviewSelection(cards, anchorRow);
    if (selection.blockIds.length === 0 && selection.cardIds.length === 0) {
      await deps.pushErrMsg(deps.t('drillNoCards', 'No flashcards available in the current range'));
      return;
    }

    await Promise.resolve(
      plugin.openSubsetReviewDialog(selection.blockIds, {
        cardIds: selection.cardIds.length > 0 ? selection.cardIds : undefined,
        preferredCardId: selection.preferredCardId,
      }),
    );
  }

  async function resolveActionTargets(
    actionId: string,
    targetCards: BrowserCard[],
  ): Promise<BrowserActionTarget[]> {
    if (actionId === 'open') {
      return targetCards;
    }

    if (deps.globalSelection.mode.value === 'explicit') {
      const explicitIds = Array.from(deps.globalSelection.explicitIds.value);
      if (explicitIds.length === 0) {
        return targetCards;
      }

      const queryable = resolveQueryableDataSource(deps.currentDataSource.value);
      if (!queryable) {
        if (explicitIds.length > targetCards.length) {
          await deps.pushMsg('Current view does not support cross-page selection. Using visible selections only.');
        }
        return targetCards;
      }

      return PerformanceMonitor.measure('browser.action.targets.ms', async () => {
        return queryable.getActionTargetsByIds(explicitIds);
      });
    }

    if (deps.globalSelection.mode.value !== 'all-matching') {
      return targetCards;
    }

    const queryable = resolveQueryableDataSource(deps.currentDataSource.value);
    if (!queryable) {
      await deps.pushErrMsg(deps.t('selectAllMatchingUnsupported', 'Current view does not support select-all-matching'));
      return [];
    }

    const allMatchedIds = await queryable.getAllMatchedIds();
    const selectedIds = deps.globalSelection.resolveSelectedIds(allMatchedIds);
    if (selectedIds.length === 0) {
      return [];
    }

    return PerformanceMonitor.measure('browser.action.targets.ms', async () => {
      const targets: BrowserActionTarget[] = [];
      for (let index = 0; index < selectedIds.length; index += 500) {
        const chunkIds = selectedIds.slice(index, index + 500);
        const chunkTargets = await queryable.getActionTargetsByIds(chunkIds);
        targets.push(...chunkTargets);
      }
      return targets;
    });
  }

  async function handleAction(actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard): Promise<void> {
    const materializedTargets = await resolveActionTargets(actionId, targetCards);

    deps.logger.debug('handleAction called:', {
      actionId,
      count: materializedTargets?.length || 0,
      blockIds: materializedTargets?.map((card) => card.blockId),
    });

    if (!materializedTargets?.length) {
      deps.logger.debug('handleAction skipped: no selected cards');
      return;
    }

    if (actionId === 'open') {
      const blockId = String(anchorRow?.blockId || materializedTargets[0]?.blockId || '');
      if (blockId) {
        await deps.openDocumentTabById(blockId);
        return;
      }
      await deps.pushErrMsg(deps.t('envNotInit', 'Environment not initialized, cannot open tab'));
      return;
    }

    if (actionId === 'review-subset') {
      await openSubsetReviewFromSelection(materializedTargets, anchorRow);
      return;
    }

    const dataSource = deps.currentDataSource.value;
    deps.logger.debug('current data source:', dataSource?.constructor?.name);

    if (!dataSource) {
      deps.logger.debug('handleAction skipped: data source is not available');
      return;
    }

    if (actionId === 'reset') {
      const ok = await confirmDialog({
        title: deps.t('resetCard', 'Reset'),
        content: interpolateI18n(
          deps.t('confirmReset', 'Are you sure you want to reset {count} cards?'),
          { count: materializedTargets.length },
        ),
        confirmText: deps.t('confirm', 'Confirm'),
        cancelText: deps.t('cancel', 'Cancel'),
      });
      if (!ok) return;
    }

    if (actionId === 'delete-card') {
      const confirmContent = interpolateI18n(
        deps.t('confirmDelete', 'Are you sure you want to remove {count} flashcards? This action cannot be undone.'),
        { count: materializedTargets.length },
      );
      const contentWithScope = deps.globalSelection.mode.value === 'all-matching'
        ? `${confirmContent}\n${deps.describeCurrentFilterSummary()}`
        : confirmContent;
      const ok = await confirmDialog({
        title: deps.t('deleteCard', 'Remove Flashcard'),
        content: contentWithScope,
        confirmText: deps.t('confirm', 'Confirm'),
        cancelText: deps.t('cancel', 'Cancel'),
      });
      if (!ok) return;
    }

    const builder = actionParamBuilders[actionId];
    deps.logger.debug('action param builder exists:', Boolean(builder));

    const ctx = builder ? await builder(materializedTargets) : { refresh: () => void deps.loadData() };
    if (builder && ctx == null) {
      deps.logger.debug('action canceled by builder');
      return;
    }

    try {
      const result = await dataSource.performAction(actionId, materializedTargets, ctx);
      deps.logger.debug('performAction result:', { actionId, res: result });
      let handledActionMessage = false;
      const addToQueueResult = parseBrowserAddToQueueResult(actionId, result);
      const relativePriorityResult = parseBrowserRelativePriorityResult(actionId, result);

      if (addToQueueResult) {
        handledActionMessage = true;
        if (addToQueueResult.added <= 0) {
          await deps.refreshQueueCounts();
          await deps.pushErrMsg(
            addToQueueResult.message || deps.t('batchNoEffect', 'No cards were updated (some cards may be unsynced)'),
          );
          return;
        }

        await deps.pushMsg(addToQueueResult.message || deps.t('actionSuccess', 'Success'));
      }

      if (relativePriorityResult) {
        handledActionMessage = true;
        const key = relativePriorityResult.delta >= 0 ? 'priorityRelativeIncreased' : 'priorityRelativeDecreased';
        let message = deps.t(key, 'Updated priority value for {count} cards')
          .replace('{count}', String(relativePriorityResult.updated));
        const boundParts: string[] = [];
        if (relativePriorityResult.upperBoundReached) {
          boundParts.push(deps.t('priorityReachedUpperBound', 'some reached 100'));
        }
        if (relativePriorityResult.lowerBoundReached) {
          boundParts.push(deps.t('priorityReachedLowerBound', 'some reached 0'));
        }
        if (boundParts.length > 0) {
          message += deps.t('priorityBoundSuffix', ', {bounds}').replace('{bounds}', boundParts.join(', '));
        }
        await deps.pushMsg(message);
      }

      const { updated, skipped } = summarizeBrowserActionResult(result);
      if (updated <= 0 && skipped > 0) {
        await deps.pushErrMsg(deps.t('batchNoEffect', 'No cards were updated (some cards may be unsynced)'));
        return;
      }
      if (skipped > 0) {
        await deps.pushMsg(
          deps.t('batchSummary', 'Updated {updated}, skipped {skipped}')
            .replace('{updated}', String(updated))
            .replace('{skipped}', String(skipped)),
        );
      }

      if (shouldReloadAfterBrowserAction(actionId)) {
        if (actionId === 'delete-card') {
          deps.logger.debug('invalidate card cache after delete-card');
          deps.invalidateCardCache();
          void deps.refreshGlobalStats(true);
        }

        await deps.loadData(shouldForceRefreshAfterBrowserAction(actionId));
      } else {
        deps.gridApi.value?.refreshCells?.({ force: true });
      }
      await deps.refreshQueueCounts();
      if (!handledActionMessage) {
        await deps.pushMsg(deps.t('actionSuccess', 'Success'));
      }
    } catch (err: unknown) {
      deps.logger.error('action failed:', { actionId, err });
      await deps.pushErrMsg(getBrowserActionErrorMessage(err, deps.t('actionFailed', 'Action failed')));
    }
  }

  function addNeuralSeedMenuItems(menu: BrowserMenuPort, selected: BrowserCard[]): void {
    if (!deps.isNeuralRoamQueueActive.value || deps.neuralSubview.value !== 'concept-cards') {
      return;
    }

    const neuralQueue = deps.getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }

    const sourceLabels = deps.resolveNeuralSourceLabels(neuralQueue.getNavigationState().engineMode);
    const seedIds = new Set(neuralQueue.getSeedSnapshot().map((entry) => entry.nodeId));
    const selectedIds = selected.map((row) => String(row.blockId || '')).filter(Boolean);
    const allInSeedPool = selectedIds.length > 0 && selectedIds.every((id) => seedIds.has(id));

    menu.addItem({
      icon: 'iconList',
      label: allInSeedPool ? sourceLabels.removeItem : sourceLabels.addItem,
      click: () => {
        void (async () => {
          for (const blockId of selectedIds) {
            await neuralQueue.setSeedEntry(blockId, !allInSeedPool);
          }
          await deps.refreshNeuralSubviewData();
          await deps.refreshQueueCounts();
        })();
      },
    });
    menu.addItem({ type: 'separator' });
  }

  function addSortMenu(menu: BrowserMenuPort): void {
    const sortMenu: BrowserMenuItem[] = [];

    for (const field of SORT_FIELD_CONFIGS) {
      sortMenu.push({
        icon: field.icon || 'iconSort',
        label: deps.t(field.i18nKey, field.label),
        submenu: [
          {
            icon: 'iconUp',
            label: deps.t('sortAscending', 'Ascending'),
            click: () => {
              deps.logger.debug('menu click sort asc:', field.colId);
              deps.applySort(field.colId, 'asc');
            },
          },
          {
            icon: 'iconDown',
            label: deps.t('sortDescending', 'Descending'),
            click: () => {
              deps.logger.debug('menu click sort desc:', field.colId);
              deps.applySort(field.colId, 'desc');
            },
          },
        ],
      });
    }

    sortMenu.push({ type: 'separator' });
    sortMenu.push({
      icon: 'iconRefresh',
      label: deps.t('sortRandom', 'Random Sort'),
      click: () => {
        deps.logger.debug('menu click random sort');
        void deps.applyRandomSort();
      },
    });

    menu.addItem({
      icon: 'iconSort',
      label: deps.t('sortMenu', 'Sort'),
      submenu: sortMenu,
    });
    menu.addItem({ type: 'separator' });
  }

  function addDataSourceActionItems(
    menu: BrowserMenuPort,
    actions: BrowserActionLike[],
    selected: BrowserCard[],
    rowData: BrowserCard,
  ): void {
    deps.logger.debug('rendering context actions:', actions.length);

    for (const action of actions) {
      if (!action || !action.id) {
        deps.logger.warn('skip invalid action:', action);
        continue;
      }

      if (action.submenu && action.submenu.length > 0) {
        const validSubmenu = action.submenu.filter((sub) => sub && sub.id);
        const submenuItems = validSubmenu.map((sub) => ({
          icon: sub.icon || 'iconMore',
          label: getActionLabel({ id: sub.id, label: sub.label }),
          click: () => {
            deps.logger.debug('submenu clicked:', { id: sub.id, label: sub.label });
            void handleAction(sub.id, selected, rowData);
          },
        }));

        menu.addItem({
          icon: action.icon || 'iconMore',
          label: getActionLabel({ id: action.id, label: action.label }),
          submenu: submenuItems,
        });
        continue;
      }

      menu.addItem({
        icon: action.icon || 'iconMore',
        label: getActionLabel({ id: action.id, label: action.label }),
        click: () => void handleAction(action.id, selected, rowData),
      });
    }
  }

  function onCellContextMenu(event: CellContextMenuEvent): void {
    event.event?.preventDefault();

    const dataSource = deps.currentDataSource.value;
    const rawActions = dataSource?.getSupportedActions?.() || [];
    const actions = ensureReviewSubsetAction(rawActions.filter((action) => action && action.id));
    deps.logger.debug('context menu actions:', {
      rawCount: rawActions.length,
      validCount: actions.length,
      dataSourceType: dataSource?.constructor?.name,
      dataSourceId: dataSource?.id,
    });

    const menu = createMenu('card-browser-context');
    const rowData = event.data as BrowserCard;
    const selected = deps.selectedRows.value?.length ? deps.selectedRows.value : [rowData];

    addNeuralSeedMenuItems(menu, selected);
    addSortMenu(menu);

    menu.addItem({
      icon: 'iconHR',
      label: deps.t('cardTypeMenu', 'Card Type'),
      submenu: deps.buildCardTypeSubmenu(selected),
    });
    menu.addItem({ type: 'separator' });

    addDataSourceActionItems(menu, actions, selected, rowData);

    const mouseEvent = event.event as MouseEvent;
    menu.open({ x: mouseEvent.clientX, y: mouseEvent.clientY });
  }

  function showBatchMenu(event?: MouseEvent): void {
    const menu = createMenu('card-browser-batch');
    const dataSource = deps.currentDataSource.value;
    const actions = ensureReviewSubsetAction(
      (dataSource?.getSupportedActions?.() || []).filter((action) => action && action.id),
    );
    const selected = deps.selectedRows.value || [];
    const anchorRow = selected[0];

    for (const action of actions) {
      menu.addItem({
        icon: action.icon || 'iconMore',
        label: getActionLabel({ id: action.id, label: action.label }),
        click: () => void handleAction(action.id, selected, anchorRow),
      });
    }

    const anchor = (event?.currentTarget || event?.target) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      menu.open({ x: rect.left, y: rect.bottom, isLeft: true });
      return;
    }
    if (event) {
      menu.open({ x: event.clientX, y: event.clientY, isLeft: true });
      return;
    }
    menu.open({ x: 0, y: 0, isLeft: true });
  }

  function openPracticeMenu(event: MouseEvent): void {
    try {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    } catch {}

    const dialogManager = deps.getDialogManager();
    if (!dialogManager) return;

    const menu = createMenu('fsrs-browser-practice-menu');
    menu.addItem({
      icon: 'iconRiffCard',
      label: deps.t('practiceExtract', 'Retrieval Practice'),
      click: () => {
        void dialogManager.openReviewDialog?.();
      },
    });
    menu.addItem({
      icon: 'iconBook',
      label: deps.t('incrementalLearning', 'Incremental Learning'),
      click: () => {
        void dialogManager.openIncrementalLearningDialog?.();
      },
    });
    menu.addItem({
      icon: 'iconFlag',
      label: deps.t('practiceDeliberate', 'Deliberate Practice'),
      click: () => {
        void dialogManager.openFinalDrillDialog?.();
      },
    });
    menu.addItem({
      icon: 'iconRefresh',
      label: deps.t('practiceNeural', 'Neural Roam'),
      click: () => {
        void dialogManager.openNeuralRoamDialog?.();
      },
    });
    menu.addItem({
      icon: 'iconList',
      label: deps.t('practiceFilterGroup', 'Filtered Review'),
      click: () => {
        void dialogManager.openFilterGroupPracticeDialog?.();
      },
    });

    const target = (event?.currentTarget || event?.target) as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    const rawX = Number(event?.clientX);
    const rawY = Number(event?.clientY);
    const hasMousePoint = Number.isFinite(rawX) && Number.isFinite(rawY);
    const pos = rect
      ? { x: rect.left, y: rect.bottom }
      : hasMousePoint
        ? { x: rawX, y: rawY }
        : null;

    if (!pos) {
      deps.logger.error('[SiYuanMemo][CardBrowser] openPracticeMenu failed: invalid pointer position');
      void deps.pushErrMsg('打开练习菜单失败');
      return;
    }

    if (isDevMode()) {
      deps.logger.info('[SiYuanMemo][CardBrowser] openPracticeMenu', {
        pos,
        hasDialogManager: Boolean(dialogManager),
      });
    }

    const safePos = (() => {
      const padding = 8;
      if (!deps.isMobileMode.value || typeof window === 'undefined') {
        return pos;
      }
      const estimatedMenuWidth = 220;
      return {
        x: Math.max(padding, Math.min(pos.x, window.innerWidth - estimatedMenuWidth - padding)),
        y: Math.max(padding, Math.min(pos.y, window.innerHeight - padding)),
      };
    })();

    defer(() => {
      try {
        menu.open({ x: safePos.x, y: safePos.y, isLeft: !deps.isMobileMode.value });
      } catch (err) {
        deps.logger.error('[SiYuanMemo][CardBrowser] openPracticeMenu failed:', err);
        void deps.pushErrMsg('打开练习菜单失败');
      }
    });
  }

  return {
    ensureReviewSubsetAction,
    handleAction,
    onCellContextMenu,
    openPracticeMenu,
    resolveActionTargets,
    showBatchMenu,
  };
}
