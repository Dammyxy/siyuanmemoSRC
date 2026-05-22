import { nextTick, ref, type Ref } from 'vue';
import type { loadBrowserCardsByBlockIds as loadBrowserCardsByBlockIdsFn } from '../browserService';
import type { BrowserCard, BrowserMode } from '../types';
import type {
  IReviewQueue,
  NeuralActivationTrace,
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
  NeuralRoamSessionQueue,
} from '@/types/unified-data-source';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import type {
  NeuralActivationTraceViewModel,
  NeuralAnchorListEntry,
  NeuralHistoryEventRef,
  NeuralListEntry,
  NeuralSourceListEntry,
  NeuralTraceConvergenceViewModel,
} from './types';
import {
  buildNeuralHistoryIndex,
  resolveNeuralTraceConvergenceForStep,
} from './traceAggregation';
import {
  handoffNeuralNavigationToReviewSurface,
  hasOpenNeuralReviewSurface,
  type NeuralReviewSurfaceHandoffDeps,
} from './reviewSurfaceHandoff';
import {
  toNeuralAnchorListEntries,
  toNeuralHistoryListEntries,
  toNeuralSourceListEntries,
} from './neuralListViewModels';
import {
  applyNeuralTraceSelectionState,
  buildNeuralActivationTraceViewModel,
  buildNeuralTraceConvergenceCacheKey,
  isBlockIdFallbackLabel,
  resolveNeuralTraceStepByEventId,
  type NeuralTraceTranslator,
  updateNeuralTraceStepConvergenceState,
  withNeuralTraceRepeatHitState,
} from './neuralTraceViewModel';
import {
  runNeuralClearHistory,
  runNeuralJump,
  runNeuralSetCurrentFocus,
  runNeuralToggleAnchor,
  runNeuralToggleSource,
} from './neuralBrowserCommands';
import {
  runNeuralReturnToBookmark,
  runNeuralReviewSurfaceHandoff,
  runNeuralToggleEngineMode,
  runNeuralToggleNavigationMode,
} from './neuralNavigationCommands';
import {
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  type NeuralRoamRouteListItem,
} from '@/core/queue/neural/routes';

type LoadBrowserCardsByBlockIds = typeof loadBrowserCardsByBlockIdsFn;
type LoadBrowserCardsOptions = NonNullable<Parameters<LoadBrowserCardsByBlockIds>[1]>;
type NeuralRoamQueue = IReviewQueue & NeuralRoamSessionQueue;

export type UseNeuralBrowserControllerDeps = {
  getQueueById: (id: string) => unknown | null;
  loadCardsByBlockIds: LoadBrowserCardsByBlockIds;
  getCardLoadOptions: () => Partial<Pick<LoadBrowserCardsOptions, 'manager' | 'siyuanApi'>>;
  previewCard: Ref<BrowserCard | null>;
  refreshQueueCounts: () => Promise<void>;
  getReviewSurfaceDeps: () => NeuralReviewSurfaceHandoffDeps;
  confirmClearHistory: () => Promise<boolean>;
  confirmRouteSwitchReviewReset: () => Promise<boolean>;
  promptRouteName: (options: {
    title: string;
    placeholder: string;
    defaultValue: string;
  }) => Promise<string | null | undefined>;
  confirmDeleteRoute: (route: NeuralRoamRouteListItem) => Promise<boolean>;
  close: () => void;
  getMode: () => BrowserMode;
  pushMessage: (message: string) => Promise<void>;
  pushError: (message: string) => Promise<void>;
  logError: (message: string, error: unknown) => void;
  t: NeuralTraceTranslator;
  historyPageSize?: number;
};

export function useNeuralBrowserController(deps: UseNeuralBrowserControllerDeps) {
  const historyPageSize = deps.historyPageSize ?? 200;

  const neuralSourceEntries = ref<NeuralSourceListEntry[]>([]);
  const neuralRoutes = ref<NeuralRoamRouteListItem[]>([]);
  const neuralRouteBusy = ref(false);
  const neuralHistoryEntries = ref<NeuralListEntry[]>([]);
  const neuralHistoryTotalCount = ref(0);
  const neuralHistoryHasMore = ref(false);
  const neuralHistoryLoadingMore = ref(false);
  const neuralAnchorEntries = ref<NeuralAnchorListEntry[]>([]);
  const neuralCurrentNodeId = ref<string | null>(null);
  const neuralNavigationState = ref<NeuralNavigationState | null>(null);
  const selectedNeuralHistoryEventId = ref<string | null>(null);
  const neuralActivationTrace = ref<NeuralActivationTraceViewModel | null>(null);
  const neuralTracePinnedToSelection = ref(false);
  const selectedNeuralTraceEventId = ref<string | null>(null);
  const selectedNeuralTraceNodeId = ref<string | null>(null);
  const neuralHistoryRequestedCount = ref(historyPageSize);

  let neuralPreviewRequestSeq = 0;
  let neuralTraceConvergenceRequestSeq = 0;
  const neuralTraceConvergenceCache = new Map<string, NeuralTraceConvergenceViewModel | null>();
  const neuralTraceRouteViewModelCache = new Map<string, NeuralActivationTraceViewModel | null>();

  function getNeuralRoamQueue(): NeuralRoamQueue | null {
    const queue = deps.getQueueById('neural-roam');
    if (!queue || !isNeuralRoamSessionQueue(queue)) {
      return null;
    }
    return queue;
  }

  async function refreshNeuralRoutes(): Promise<void> {
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue?.listRoutes) {
      neuralRoutes.value = [];
      return;
    }
    try {
      neuralRoutes.value = await neuralQueue.listRoutes();
    } catch (error) {
      deps.logError('Failed to list NeuralRoam routes:', error);
      neuralRoutes.value = [];
    }
  }

  function getActiveNeuralRoute(): NeuralRoamRouteListItem | null {
    return neuralRoutes.value.find((route) => route.isActive)
      ?? neuralRoutes.value[0]
      ?? null;
  }

  function formatRouteUnavailableMessage(key: string, fallback: string): string {
    return deps.t(key, fallback);
  }

  async function withRouteBusy(task: () => Promise<void>): Promise<void> {
    if (neuralRouteBusy.value) {
      return;
    }
    neuralRouteBusy.value = true;
    try {
      await task();
    } finally {
      neuralRouteBusy.value = false;
    }
  }

  async function confirmOpenReviewResetIfNeeded(): Promise<{
    confirmed: boolean;
    hadOpenReviewSurface: boolean;
    reviewSurfaceDeps: NeuralReviewSurfaceHandoffDeps;
  }> {
    const reviewSurfaceDeps = deps.getReviewSurfaceDeps();
    const hadOpenReviewSurface = hasOpenNeuralReviewSurface(reviewSurfaceDeps);
    if (!hadOpenReviewSurface) {
      return { confirmed: true, hadOpenReviewSurface, reviewSurfaceDeps };
    }
    const confirmed = await deps.confirmRouteSwitchReviewReset();
    return { confirmed, hadOpenReviewSurface, reviewSurfaceDeps };
  }

  async function refreshAfterRouteBoundary(options: {
    hadOpenReviewSurface: boolean;
    reviewSurfaceDeps: NeuralReviewSurfaceHandoffDeps;
  }): Promise<void> {
    clearNeuralSubviewData();
    await refreshNeuralSubviewData();
    await deps.refreshQueueCounts();
    if (!options.hadOpenReviewSurface) {
      return;
    }
    const result = await handoffNeuralNavigationToReviewSurface(options.reviewSurfaceDeps, {
      fallbackNodeId: neuralCurrentNodeId.value,
    });
    await runNeuralReviewSurfaceHandoff({
      result,
      mode: deps.getMode(),
      close: deps.close,
      pushError: deps.pushError,
      t: deps.t,
    });
  }

  function resetNeuralTraceConvergenceState(): void {
    neuralTraceConvergenceRequestSeq += 1;
    neuralTraceConvergenceCache.clear();
    neuralTraceRouteViewModelCache.clear();
  }

  function clearNeuralSubviewData(): void {
    neuralSourceEntries.value = [];
    neuralHistoryEntries.value = [];
    neuralHistoryTotalCount.value = 0;
    neuralHistoryHasMore.value = false;
    neuralHistoryLoadingMore.value = false;
    neuralHistoryRequestedCount.value = historyPageSize;
    neuralAnchorEntries.value = [];
    neuralCurrentNodeId.value = null;
    neuralNavigationState.value = null;
    selectedNeuralHistoryEventId.value = null;
    neuralActivationTrace.value = null;
    neuralTracePinnedToSelection.value = false;
    selectedNeuralTraceEventId.value = null;
    selectedNeuralTraceNodeId.value = null;
    resetNeuralTraceConvergenceState();
  }

  function resolveNeuralHistoryEventRef(
    neuralQueue: NeuralRoamQueue | null,
    historyEntries: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>[],
    navState: NeuralNavigationState,
  ): NeuralHistoryEventRef | null {
    if (neuralTracePinnedToSelection.value && selectedNeuralHistoryEventId.value) {
      const selectedEntry = historyEntries.find((entry) => entry.eventId === selectedNeuralHistoryEventId.value)
        ?? neuralQueue?.getHistoryEntryByEventId(selectedNeuralHistoryEventId.value);
      if (selectedEntry) {
        return {
          eventId: selectedEntry.eventId,
          nodeId: selectedEntry.nodeId,
        };
      }
      selectedNeuralHistoryEventId.value = null;
      neuralTracePinnedToSelection.value = false;
    }

    if (navState.currentEventId) {
      const currentEntry = historyEntries.find((entry) => entry.eventId === navState.currentEventId)
        ?? neuralQueue?.getHistoryEntryByEventId(navState.currentEventId);
      if (currentEntry) {
        return {
          eventId: currentEntry.eventId,
          nodeId: currentEntry.nodeId,
        };
      }
    }

    const latestEntry = historyEntries[0]
      ?? neuralQueue?.getHistoryPage({ offset: 0, limit: 1 }).entries[0]
      ?? null;
    if (!latestEntry) {
      return null;
    }

    return {
      eventId: latestEntry.eventId,
      nodeId: latestEntry.nodeId,
    };
  }

  async function enrichNeuralActivationTraceViewModel(
    trace: NeuralActivationTraceViewModel,
  ): Promise<NeuralActivationTraceViewModel> {
    const missingPreviewIds = Array.from(new Set(
      trace.steps
        .filter((step) => isBlockIdFallbackLabel(step.nodePreview, step.nodeId))
        .map((step) => step.nodeId)
        .filter(Boolean),
    ));

    if (missingPreviewIds.length === 0) {
      return trace;
    }

    const cards = await deps.loadCardsByBlockIds(missingPreviewIds, {
      applyQueryFilter: false,
      ...deps.getCardLoadOptions(),
    });
    const contentByNodeId = new Map(
      cards.map((card) => [
        card.blockId,
        String(card.content || card.fullContent || '').trim(),
      ]),
    );

    const steps = trace.steps.map((step) => {
      const resolvedContent = contentByNodeId.get(step.nodeId);
      if (!resolvedContent || !isBlockIdFallbackLabel(step.nodePreview, step.nodeId)) {
        return step;
      }
      return {
        ...step,
        nodePreview: resolvedContent,
      };
    });

    const directActivator = resolveNeuralTraceStepByEventId(steps, trace.directActivatorEventId);
    const branchRoot = resolveNeuralTraceStepByEventId(steps, trace.branchRootEventId);
    const target = steps[steps.length - 1] ?? null;

    return {
      ...trace,
      steps,
      targetTitle: target?.nodePreview || target?.nodeId || trace.targetNodeId,
      directActivatorTitle: directActivator?.nodePreview || directActivator?.nodeId || null,
      branchRootTitle: branchRoot?.nodePreview || branchRoot?.nodeId || trace.branchRootNodeId,
    };
  }

  function setSelectedNeuralTraceState(
    options: {
      selectedTraceEventId?: string | null;
      selectedTraceNodeId?: string | null;
    } = {},
  ): void {
    selectedNeuralTraceEventId.value = options.selectedTraceEventId ?? null;
    selectedNeuralTraceNodeId.value = options.selectedTraceNodeId ?? null;
    neuralActivationTrace.value = applyNeuralTraceSelectionState(neuralActivationTrace.value, options);
    if (neuralActivationTrace.value) {
      neuralTraceRouteViewModelCache.set(neuralActivationTrace.value.targetEventId, neuralActivationTrace.value);
    }
  }

  function resolveNeuralTraceRouteViewModelByEventId(
    neuralQueue: NeuralRoamQueue | null,
    eventId: string,
    options: {
      currentNodeId?: string | null;
      currentTrace?: NeuralActivationTraceViewModel | null;
    } = {},
  ): NeuralActivationTraceViewModel | null {
    const normalizedEventId = String(eventId || '').trim();
    if (!normalizedEventId) {
      return null;
    }
    if (options.currentTrace?.targetEventId === normalizedEventId) {
      return options.currentTrace;
    }
    if (neuralTraceRouteViewModelCache.has(normalizedEventId)) {
      return neuralTraceRouteViewModelCache.get(normalizedEventId) ?? null;
    }
    const routeTrace = neuralQueue?.getActivationTrace(normalizedEventId);
    if (!routeTrace) {
      neuralTraceRouteViewModelCache.set(normalizedEventId, null);
      return null;
    }
    const viewModel = buildNeuralActivationTraceViewModel(routeTrace, {
      t: deps.t,
      currentNodeId: options.currentNodeId ?? null,
    });
    neuralTraceRouteViewModelCache.set(normalizedEventId, viewModel);
    return viewModel;
  }

  function resolveNeuralConvergenceForTraceStep(
    neuralQueue: NeuralRoamQueue | null,
    trace: NeuralActivationTraceViewModel,
    stepEventId: string,
    options: {
      currentNodeId?: string | null;
    } = {},
  ): NeuralTraceConvergenceViewModel | null {
    if (!neuralQueue) {
      return null;
    }
    const step = trace.steps.find((candidate) => candidate.eventId === stepEventId) ?? null;
    if (!step || (step.repeatHitCount ?? 1) <= 1) {
      return null;
    }
    const matchingEntries = neuralQueue.getHistoryEntriesByNodeId(step.nodeId);
    if (matchingEntries.length <= 1) {
      return null;
    }
    return resolveNeuralTraceConvergenceForStep({
      step,
      historyIndex: buildNeuralHistoryIndex(matchingEntries),
      currentTrace: trace.targetEventId === stepEventId ? trace : null,
      getActivationTrace: (eventId) => neuralQueue.getActivationTrace(eventId),
      buildTraceViewModel: (routeTrace) => resolveNeuralTraceRouteViewModelByEventId(
        neuralQueue,
        routeTrace.targetEventId,
        { currentNodeId: options.currentNodeId ?? null },
      ) ?? buildNeuralActivationTraceViewModel(routeTrace, {
        t: deps.t,
        currentNodeId: options.currentNodeId ?? null,
      }),
      traceViewModelCache: neuralTraceRouteViewModelCache,
    });
  }

  async function buildAggregatedNeuralActivationTraceViewModel(
    neuralQueue: NeuralRoamQueue,
    trace: NeuralActivationTrace,
    options: {
      currentNodeId?: string | null;
      selectedTraceEventId?: string | null;
      selectedTraceNodeId?: string | null;
    } = {},
  ): Promise<NeuralActivationTraceViewModel> {
    resetNeuralTraceConvergenceState();
    const traceViewModel = buildNeuralActivationTraceViewModel(trace, {
      t: deps.t,
      ...options,
    });
    const enrichedTrace = await enrichNeuralActivationTraceViewModel(traceViewModel);
    let preparedTrace = withNeuralTraceRepeatHitState(
      enrichedTrace,
      (nodeId) => neuralQueue.getHistoryHitCount(nodeId),
    );
    neuralTraceRouteViewModelCache.set(preparedTrace.targetEventId, preparedTrace);

    const targetStep = preparedTrace.steps[preparedTrace.steps.length - 1] ?? null;
    if (!targetStep || (targetStep.repeatHitCount ?? 1) <= 1) {
      return preparedTrace;
    }

    const targetConvergence = resolveNeuralConvergenceForTraceStep(
      neuralQueue,
      preparedTrace,
      targetStep.eventId,
      { currentNodeId: options.currentNodeId ?? null },
    );
    neuralTraceConvergenceCache.set(
      buildNeuralTraceConvergenceCacheKey(preparedTrace.targetEventId, targetStep.eventId),
      targetConvergence,
    );
    preparedTrace = updateNeuralTraceStepConvergenceState(preparedTrace, targetStep.eventId, {
      convergenceStatus: 'ready',
      convergence: targetConvergence,
    });
    neuralTraceRouteViewModelCache.set(preparedTrace.targetEventId, preparedTrace);
    return preparedTrace;
  }

  async function syncNeuralActivationTrace(
    neuralQueue: NeuralRoamQueue,
    historyEntries: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>[],
    navState: NeuralNavigationState,
  ): Promise<void> {
    if (neuralQueue.getHistoryCount() === 0) {
      selectedNeuralHistoryEventId.value = null;
      neuralActivationTrace.value = null;
      neuralTracePinnedToSelection.value = false;
      selectedNeuralTraceEventId.value = null;
      selectedNeuralTraceNodeId.value = null;
      resetNeuralTraceConvergenceState();
      return;
    }

    const targetRef = resolveNeuralHistoryEventRef(neuralQueue, historyEntries, navState);
    if (!targetRef) {
      selectedNeuralHistoryEventId.value = null;
      neuralActivationTrace.value = null;
      selectedNeuralTraceEventId.value = null;
      selectedNeuralTraceNodeId.value = null;
      resetNeuralTraceConvergenceState();
      return;
    }

    selectedNeuralHistoryEventId.value = targetRef.eventId;
    const trace = neuralQueue.getActivationTrace(targetRef.eventId);
    if (!trace) {
      neuralActivationTrace.value = null;
      resetNeuralTraceConvergenceState();
      return;
    }

    const availableEventIds = new Set(trace.steps.map((step) => step.eventId));
    const availableNodeIds = new Set(trace.steps.map((step) => step.nodeId));
    if (!selectedNeuralTraceEventId.value || !availableEventIds.has(selectedNeuralTraceEventId.value)) {
      selectedNeuralTraceEventId.value = trace.targetEventId;
    }
    if (!selectedNeuralTraceNodeId.value || !availableNodeIds.has(selectedNeuralTraceNodeId.value)) {
      selectedNeuralTraceNodeId.value = trace.targetNodeId;
    }
    neuralActivationTrace.value = await buildAggregatedNeuralActivationTraceViewModel(neuralQueue, trace, {
      currentNodeId: navState.currentNodeId,
      selectedTraceEventId: selectedNeuralTraceEventId.value,
      selectedTraceNodeId: selectedNeuralTraceNodeId.value,
    });
  }

  async function refreshNeuralSubviewData(): Promise<void> {
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      clearNeuralSubviewData();
      neuralRoutes.value = [];
      return;
    }

    await refreshNeuralRoutes();
    const navState = neuralQueue.getNavigationState();
    const sourceSnapshot = neuralQueue.getSourceSnapshot();
    const historyPage = neuralQueue.getHistoryPage({
      offset: 0,
      limit: Math.max(historyPageSize, neuralHistoryRequestedCount.value),
    });
    const anchorSnapshot = neuralQueue.getAnchorSnapshot();
    await syncNeuralActivationTrace(neuralQueue, historyPage.entries, navState);
    const anchorIds = new Set(anchorSnapshot.map((entry) => entry.nodeId));
    neuralSourceEntries.value = toNeuralSourceListEntries(sourceSnapshot, {
      currentNodeId: navState.currentNodeId,
    });
    neuralHistoryEntries.value = toNeuralHistoryListEntries(historyPage.entries, {
      anchorIds,
      currentNodeId: navState.currentNodeId,
      selectedEventId: selectedNeuralHistoryEventId.value,
      getRepeatHitCount: (nodeId) => neuralQueue.getHistoryHitCount(nodeId),
    });
    neuralHistoryTotalCount.value = historyPage.totalCount;
    neuralHistoryHasMore.value = historyPage.hasMore;
    const currentSessionNodeIds = new Set(
      historyPage.entries
        .filter((entry) => entry.sessionId === navState.sessionId)
        .map((entry) => entry.nodeId),
    );
    neuralAnchorEntries.value = toNeuralAnchorListEntries(anchorSnapshot, {
      historyNodeIds: currentSessionNodeIds,
      currentNodeId: navState.currentNodeId,
    });
    neuralCurrentNodeId.value = navState.currentNodeId;
    neuralNavigationState.value = navState;
  }

  async function handleNeuralSwitchRoute(routeId: string): Promise<void> {
    const normalizedRouteId = String(routeId || '').trim();
    if (!normalizedRouteId) {
      return;
    }
    const currentRoute = getActiveNeuralRoute();
    if (currentRoute?.id === normalizedRouteId) {
      return;
    }

    await withRouteBusy(async () => {
      const neuralQueue = getNeuralRoamQueue();
      if (!neuralQueue?.switchRoute) {
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteSwitchUnavailable', '航线切换不可用'));
        return;
      }

      const reviewReset = await confirmOpenReviewResetIfNeeded();
      if (!reviewReset.confirmed) {
        return;
      }

      try {
        await neuralQueue.switchRoute(normalizedRouteId);
        await refreshAfterRouteBoundary(reviewReset);
      } catch (error) {
        deps.logError('Failed to switch NeuralRoam route:', error);
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteSwitchUnavailable', '航线切换不可用'));
      }
    });
  }

  async function handleNeuralCreateRoute(): Promise<void> {
    await withRouteBusy(async () => {
      const neuralQueue = getNeuralRoamQueue();
      if (!neuralQueue?.createRoute) {
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteCreateUnavailable', '航线创建不可用'));
        return;
      }
      const name = await deps.promptRouteName({
        title: deps.t('createRoute', '新建航线'),
        placeholder: deps.t('routeNamePlaceholder', '航线名称'),
        defaultValue: deps.t('newRoute', '新航线'),
      });
      const normalizedName = String(name || '').trim();
      if (!normalizedName) {
        return;
      }
      try {
        const reviewReset = await confirmOpenReviewResetIfNeeded();
        if (!reviewReset.confirmed) {
          return;
        }
        await neuralQueue.createRoute({ name: normalizedName });
        await refreshAfterRouteBoundary(reviewReset);
      } catch (error) {
        deps.logError('Failed to create NeuralRoam route:', error);
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteCreateUnavailable', '航线创建不可用'));
      }
    });
  }

  async function handleNeuralRenameRoute(routeId?: string | null): Promise<void> {
    const route = routeId
      ? neuralRoutes.value.find((candidate) => candidate.id === routeId)
      : getActiveNeuralRoute();
    if (!route) {
      return;
    }
    await withRouteBusy(async () => {
      const neuralQueue = getNeuralRoamQueue();
      if (!neuralQueue?.renameRoute) {
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteRenameUnavailable', '航线重命名不可用'));
        return;
      }
      const name = await deps.promptRouteName({
        title: deps.t('renameRoute', '重命名航线'),
        placeholder: deps.t('routeNamePlaceholder', '航线名称'),
        defaultValue: route.name,
      });
      const normalizedName = String(name || '').trim();
      if (!normalizedName) {
        return;
      }
      try {
        await neuralQueue.renameRoute(route.id, normalizedName);
        await refreshNeuralRoutes();
      } catch (error) {
        deps.logError('Failed to rename NeuralRoam route:', error);
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteRenameUnavailable', '航线重命名不可用'));
      }
    });
  }

  async function handleNeuralDeleteRoute(routeId?: string | null): Promise<void> {
    const route = routeId
      ? neuralRoutes.value.find((candidate) => candidate.id === routeId)
      : getActiveNeuralRoute();
    if (!route || route.id === DEFAULT_NEURAL_ROAM_ROUTE_ID) {
      return;
    }
    await withRouteBusy(async () => {
      const neuralQueue = getNeuralRoamQueue();
      if (!neuralQueue?.deleteRoute) {
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteDeleteUnavailable', '航线删除不可用'));
        return;
      }
      const confirmed = await deps.confirmDeleteRoute(route);
      if (!confirmed) {
        return;
      }
      try {
        const reviewReset = route.isActive
          ? await confirmOpenReviewResetIfNeeded()
          : { confirmed: true, hadOpenReviewSurface: false, reviewSurfaceDeps: {} };
        if (!reviewReset.confirmed) {
          return;
        }
        await neuralQueue.deleteRoute(route.id);
        await refreshAfterRouteBoundary(reviewReset);
      } catch (error) {
        deps.logError('Failed to delete NeuralRoam route:', error);
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteDeleteUnavailable', '航线删除不可用'));
      }
    });
  }

  async function handleNeuralSaveTemporaryRoute(routeId?: string | null): Promise<void> {
    const route = routeId
      ? neuralRoutes.value.find((candidate) => candidate.id === routeId)
      : getActiveNeuralRoute();
    if (!route?.temporary) {
      return;
    }
    await withRouteBusy(async () => {
      const neuralQueue = getNeuralRoamQueue();
      if (!neuralQueue?.saveTemporaryRoute) {
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteSaveUnavailable', '临时航线保存不可用'));
        return;
      }
      try {
        await neuralQueue.saveTemporaryRoute(route.id);
        await refreshNeuralRoutes();
        await deps.pushMessage(deps.t('temporaryRouteSaved', '临时航线已保存'));
      } catch (error) {
        deps.logError('Failed to save temporary NeuralRoam route:', error);
        await deps.pushError(formatRouteUnavailableMessage('neuralRoamRouteSaveUnavailable', '临时航线保存不可用'));
      }
    });
  }

  async function handleNeuralPreview(nodeId: string): Promise<void> {
    const requestSeq = ++neuralPreviewRequestSeq;
    const cards = await deps.loadCardsByBlockIds([nodeId], {
      applyQueryFilter: false,
      ...deps.getCardLoadOptions(),
    });
    if (requestSeq !== neuralPreviewRequestSeq) {
      return;
    }
    deps.previewCard.value = cards[0] || null;
  }

  async function handleNeuralExternalNodePreview(nodeId: string): Promise<void> {
    setSelectedNeuralTraceState({
      selectedTraceEventId: null,
      selectedTraceNodeId: nodeId,
    });
    await handleNeuralPreview(nodeId);
  }

  async function handleNeuralSelectHistoryEntry(
    entry: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>,
  ): Promise<void> {
    selectedNeuralHistoryEventId.value = entry.eventId;
    neuralTracePinnedToSelection.value = true;
    setSelectedNeuralTraceState({
      selectedTraceEventId: entry.eventId,
      selectedTraceNodeId: entry.nodeId,
    });

    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      neuralActivationTrace.value = null;
      resetNeuralTraceConvergenceState();
      return;
    }

    const trace = neuralQueue.getActivationTrace(entry.eventId);
    if (trace) {
      neuralActivationTrace.value = await buildAggregatedNeuralActivationTraceViewModel(neuralQueue, trace, {
        currentNodeId: neuralCurrentNodeId.value,
        selectedTraceEventId: selectedNeuralTraceEventId.value,
        selectedTraceNodeId: selectedNeuralTraceNodeId.value,
      });
    } else {
      neuralActivationTrace.value = null;
      resetNeuralTraceConvergenceState();
    }
    neuralHistoryEntries.value = neuralHistoryEntries.value.map((item) => ({
      ...item,
      isCurrent: neuralCurrentNodeId.value ? item.nodeId === neuralCurrentNodeId.value : false,
      isSelected: item.eventId === entry.eventId,
    }));
  }

  async function ensureNeuralStepConvergenceResolved(stepEventId: string): Promise<void> {
    const currentTrace = neuralActivationTrace.value;
    const currentTargetEventId = currentTrace?.targetEventId ?? null;
    const currentStep = currentTrace?.steps.find((step) => step.eventId === stepEventId) ?? null;
    if (!currentTrace || !currentStep || (currentStep.repeatHitCount ?? 1) <= 1) {
      return;
    }
    if (currentStep.convergenceStatus === 'ready' || currentStep.convergenceStatus === 'loading') {
      return;
    }

    const cacheKey = buildNeuralTraceConvergenceCacheKey(currentTargetEventId, stepEventId);
    if (neuralTraceConvergenceCache.has(cacheKey)) {
      neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(currentTrace, stepEventId, {
        convergenceStatus: 'ready',
        convergence: neuralTraceConvergenceCache.get(cacheKey) ?? null,
      });
      return;
    }

    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }

    const requestSeq = ++neuralTraceConvergenceRequestSeq;
    neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(currentTrace, stepEventId, {
      convergenceStatus: 'loading',
      convergence: null,
    });

    await nextTick();

    const latestTrace = neuralActivationTrace.value;
    if (!latestTrace || latestTrace.targetEventId !== currentTargetEventId || requestSeq !== neuralTraceConvergenceRequestSeq) {
      return;
    }

    const resolvedConvergence = resolveNeuralConvergenceForTraceStep(
      neuralQueue,
      latestTrace,
      stepEventId,
      { currentNodeId: neuralCurrentNodeId.value },
    );

    if (!neuralActivationTrace.value || neuralActivationTrace.value.targetEventId !== currentTargetEventId || requestSeq !== neuralTraceConvergenceRequestSeq) {
      return;
    }

    neuralTraceConvergenceCache.set(cacheKey, resolvedConvergence);
    neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(neuralActivationTrace.value, stepEventId, {
      convergenceStatus: 'ready',
      convergence: resolvedConvergence,
    });
    neuralTraceRouteViewModelCache.set(neuralActivationTrace.value.targetEventId, neuralActivationTrace.value);
  }

  async function handleNeuralSelectTraceStep(eventId: string): Promise<void> {
    const traceStep = neuralActivationTrace.value?.steps.find((step) => step.eventId === eventId) ?? null;
    setSelectedNeuralTraceState({
      selectedTraceEventId: eventId,
      selectedTraceNodeId: traceStep?.nodeId ?? null,
    });
    if (!neuralActivationTrace.value) {
      return;
    }
    if (eventId === neuralActivationTrace.value.targetEventId) {
      selectedNeuralHistoryEventId.value = eventId;
    }
    if ((traceStep?.repeatHitCount ?? 1) > 1 && traceStep?.convergenceStatus !== 'ready') {
      void ensureNeuralStepConvergenceResolved(eventId);
    }
  }

  async function handleNeuralRequestConvergenceDetails(eventId: string): Promise<void> {
    await ensureNeuralStepConvergenceResolved(eventId);
  }

  async function handleNeuralTracePreview(nodeId: string): Promise<void> {
    selectedNeuralTraceNodeId.value = nodeId;
    await handleNeuralPreview(nodeId);
  }

  async function handleNeuralTraceJump(nodeId: string): Promise<void> {
    selectedNeuralTraceNodeId.value = nodeId;
    await handleNeuralJump(nodeId);
  }

  async function handleNeuralSwitchTraceEvent(eventId: string): Promise<void> {
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }
    const historyEntry = neuralQueue.getHistoryEntryByEventId(eventId);
    if (!historyEntry) {
      return;
    }
    await handleNeuralSelectHistoryEntry(historyEntry);
  }

  async function handleNeuralLoadMoreHistory(): Promise<void> {
    if (neuralHistoryLoadingMore.value || !neuralHistoryHasMore.value) {
      return;
    }

    neuralHistoryLoadingMore.value = true;
    neuralHistoryRequestedCount.value += historyPageSize;
    try {
      await refreshNeuralSubviewData();
    } finally {
      neuralHistoryLoadingMore.value = false;
    }
  }

  function createNeuralBrowserCommandDeps() {
    return {
      getQueue: getNeuralRoamQueue,
      setSelectedTraceState: setSelectedNeuralTraceState,
      previewNode: handleNeuralPreview,
      refreshNeuralSubviewData,
      refreshQueueCounts: deps.refreshQueueCounts,
      handoffReviewSurface: handoffNeuralReviewSurface,
      pushMessage: deps.pushMessage,
      pushError: deps.pushError,
      confirmClearHistory: deps.confirmClearHistory,
      resetHistoryRequest: () => {
        neuralHistoryRequestedCount.value = historyPageSize;
      },
      logError: deps.logError,
      t: deps.t,
    };
  }

  function createNeuralNavigationCommandDeps() {
    return {
      getQueue: getNeuralRoamQueue,
      setSelectedTraceState: setSelectedNeuralTraceState,
      previewNode: handleNeuralPreview,
      refreshNeuralSubviewData,
      refreshQueueCounts: deps.refreshQueueCounts,
      pushMessage: deps.pushMessage,
      pushError: deps.pushError,
      t: deps.t,
    };
  }

  async function handoffNeuralReviewSurface(fallbackNodeId?: string | null): Promise<void> {
    const result = await handoffNeuralNavigationToReviewSurface(
      deps.getReviewSurfaceDeps(),
      {
        fallbackNodeId: fallbackNodeId ?? null,
      },
    );

    await runNeuralReviewSurfaceHandoff({
      result,
      mode: deps.getMode(),
      close: deps.close,
      pushError: deps.pushError,
      t: deps.t,
    });
  }

  async function handleNeuralJump(nodeId: string): Promise<void> {
    await runNeuralJump(nodeId, createNeuralBrowserCommandDeps());
  }

  async function handleNeuralJumpAnchor(nodeId: string): Promise<void> {
    await handleNeuralJump(nodeId);
  }

  async function handleNeuralSetCurrentFocus(nodeId: string): Promise<void> {
    await runNeuralSetCurrentFocus(nodeId, createNeuralBrowserCommandDeps());
  }

  async function handleNeuralToggleSource(nodeId: string, enabled: boolean): Promise<void> {
    await runNeuralToggleSource(nodeId, enabled, createNeuralBrowserCommandDeps());
  }

  async function handleNeuralToggleEngineMode(): Promise<void> {
    await runNeuralToggleEngineMode(createNeuralNavigationCommandDeps());
  }

  async function handleNeuralToggleNavigationMode(): Promise<void> {
    await runNeuralToggleNavigationMode(createNeuralNavigationCommandDeps());
  }

  async function handleNeuralReturnToBookmark(): Promise<void> {
    const result = await runNeuralReturnToBookmark(createNeuralNavigationCommandDeps());
    if (result.moved) {
      await handoffNeuralReviewSurface(result.currentNodeId);
    }
  }

  async function handleNeuralToggleAnchor(nodeId: string, enabled: boolean): Promise<void> {
    await runNeuralToggleAnchor(nodeId, enabled, createNeuralBrowserCommandDeps());
  }

  async function handleNeuralClearHistory(): Promise<void> {
    await runNeuralClearHistory(createNeuralBrowserCommandDeps());
  }

  return {
    neuralSourceEntries,
    neuralRoutes,
    neuralRouteBusy,
    neuralHistoryEntries,
    neuralHistoryTotalCount,
    neuralHistoryHasMore,
    neuralHistoryLoadingMore,
    neuralAnchorEntries,
    neuralCurrentNodeId,
    neuralNavigationState,
    selectedNeuralHistoryEventId,
    neuralActivationTrace,
    neuralTracePinnedToSelection,
    selectedNeuralTraceNodeId,
    selectedNeuralTraceEventId,
    clearNeuralSubviewData,
    getNeuralRoamQueue,
    refreshNeuralRoutes,
    refreshNeuralSubviewData,
    handleNeuralSwitchRoute,
    handleNeuralCreateRoute,
    handleNeuralRenameRoute,
    handleNeuralDeleteRoute,
    handleNeuralSaveTemporaryRoute,
    handleNeuralPreview,
    handleNeuralExternalNodePreview,
    handleNeuralSelectHistoryEntry,
    handleNeuralSelectTraceStep,
    handleNeuralRequestConvergenceDetails,
    handleNeuralTracePreview,
    handleNeuralTraceJump,
    handleNeuralSwitchTraceEvent,
    handleNeuralLoadMoreHistory,
    handleNeuralJump,
    handleNeuralJumpAnchor,
    handleNeuralSetCurrentFocus,
    handleNeuralToggleSource,
    handleNeuralToggleEngineMode,
    handleNeuralToggleNavigationMode,
    handleNeuralReturnToBookmark,
    handleNeuralToggleAnchor,
    handleNeuralClearHistory,
  };
}
