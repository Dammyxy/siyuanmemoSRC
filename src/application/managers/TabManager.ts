/**
 * TabManager - tab registration and opening.
 *
 * This manager keeps the review-tab path deterministic:
 * - open tab with serializable tab data only
 * - restore queue/adapter from current architecture on init
 */

import type { Custom, Plugin } from 'siyuan';
import { openTab, Constants } from 'siyuan';
import { createApp, type App as VueApp } from 'vue';
import type { ApplicationContext } from '../ApplicationContext';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import type { IAdapter, ReviewHeaderVariant, ReviewViewTabBridge } from '@/ui/review/v2/types';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import {
  QueueType,
  type CardFilter,
  type FilterGroupQueueSessionSnapshot,
  type InitialReviewSessionState,
  type ReviewTabTransferState,
  type IReviewQueue,
} from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot, ReviewTabRuntimeState } from '@/types/review-tab';
import type { ISchedulerRouter } from '@/application/interfaces/ISchedulerRouter';
import { resolveReviewHeaderVariant } from '@/ui/review/v2/types';
import { createLogger } from '@/utils/logger';
import type { BrowserOpenState } from '@/types/browser';
import type { AIWorkbenchOpenOptions } from '@/types/ai';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { NOOP_QUEUE_PERSISTENCE } from '@/core/queue/domain/ports';
import {
  loadAiWorkbenchPaneComponent,
  loadReviewViewComponent,
  loadSrsBrowserComponent,
} from './lazySurfaceComponents';

const logger = createLogger('TabManager');

type ReviewProviderRef = {
  id: string;
};

type ReviewQueueRef = {
  getType?: () => unknown;
};

interface ReviewTabData {
  providerId: string;
  title: string;
  queueType: QueueType | null;
  headerVariant: ReviewHeaderVariant;
  sharedReviewSessionId?: string | null;
  transferState?: ReviewTabTransferState | null;
  reviewState?: ReviewTabRuntimeState | null;
}

interface BrowserTabData {
  initialState?: BrowserOpenState | null;
}

interface ReviewAICompanionTabData {
  reviewSessionId: string;
  sourceReviewSessionId: string;
  title: string;
}

export type TabRuntimeContext = Custom & {
  vueApp?: VueApp<Element>;
};

interface ReviewTabRuntimeHandle {
  customId: string;
  queueType: QueueType | null;
  title: string;
  custom: TabRuntimeContext;
  bridge: ReviewViewTabBridge | null;
  lastActiveAt: number;
  pendingSurfaceRefreshTimer: number | null;
  removeActivityListeners: () => void;
}

interface ReviewAICompanionRuntimeHandle {
  customId: string;
  reviewSessionId: string;
  sourceReviewSessionId: string;
  title: string;
  custom: TabRuntimeContext;
}

interface ReviewTabSurfaceSnapshot {
  customId: string;
  providerId: string;
  queueType: QueueType | null;
  title: string;
  headerVariant: ReviewHeaderVariant;
  sharedReviewSessionId?: string | null;
  reviewState: ReviewTabRuntimeState | null;
  updatedAt: number;
}

type PluginWithI18n = Plugin & {
  i18n?: Record<string, string>;
};

type ElectronIpcRenderer = {
  send(channel: string, payload: unknown): void;
};

function resolveIpcRenderer(): ElectronIpcRenderer | undefined {
  const runtimeWindow = window as Window & {
    require?: (id: string) => unknown;
  };

  if (typeof runtimeWindow.require !== 'function') {
    return undefined;
  }

  try {
    const electronModule = runtimeWindow.require('electron') as {
      ipcRenderer?: ElectronIpcRenderer;
    };
    return electronModule.ipcRenderer;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDateValue(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function cloneCardFilter(filter: CardFilter): CardFilter {
  try {
    const structuredCloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
    if (typeof structuredCloneFn === 'function') {
      return structuredCloneFn(filter);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(filter)) as CardFilter;
  } catch {
    return { ...filter };
  }
}

function normalizeCardFilter(value: unknown): CardFilter {
  if (!isRecord(value)) {
    return {};
  }

  const candidate = value as CardFilter;
  const normalized: CardFilter = {
    ...candidate,
  };

  if ('blockIds' in candidate) {
    normalized.blockIds = normalizeStringArray(candidate.blockIds);
  }
  if ('scopeDocIds' in candidate) {
    normalized.scopeDocIds = normalizeStringArray(candidate.scopeDocIds);
  }
  if ('tags' in candidate) {
    normalized.tags = normalizeStringArray(candidate.tags);
  }
  if ('cardStatus' in candidate) {
    normalized.cardStatus = Array.isArray(candidate.cardStatus)
      ? candidate.cardStatus.filter((item): item is 'new' | 'learning' | 'review' | 'relearning' => (
          item === 'new' || item === 'learning' || item === 'review' || item === 'relearning'
        ))
      : undefined;
  }
  if ('dueDate' in candidate && isRecord(candidate.dueDate)) {
    normalized.dueDate = {
      lte: normalizeDateValue(candidate.dueDate.lte),
      gte: normalizeDateValue(candidate.dueDate.gte),
    };
  }
  if ('lastReview' in candidate && isRecord(candidate.lastReview)) {
    normalized.lastReview = {
      lte: normalizeDateValue(candidate.lastReview.lte),
      gte: normalizeDateValue(candidate.lastReview.gte),
    };
  }

  return normalized;
}

function normalizeInitialReviewSessionState(value: unknown): InitialReviewSessionState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized: InitialReviewSessionState = {};
  const initialTotal = Number(value.initialTotal);
  const answeredCount = Number(value.answeredCount);
  const correctCount = Number(value.correctCount);

  if (Number.isFinite(initialTotal) && initialTotal >= 0) {
    normalized.initialTotal = initialTotal;
  }
  if (Number.isFinite(answeredCount) && answeredCount >= 0) {
    normalized.answeredCount = answeredCount;
  }
  if (Number.isFinite(correctCount) && correctCount >= 0) {
    normalized.correctCount = correctCount;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeFilterGroupQueueSessionSnapshot(value: unknown): FilterGroupQueueSessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const rollbackSnapshot = isRecord(value.rollbackSnapshot) ? value.rollbackSnapshot : {};
  const normalized: FilterGroupQueueSessionSnapshot = {
    filter: cloneCardFilter(normalizeCardFilter(value.filter)),
    rollbackSnapshot: {
      temporaryBlacklist: normalizeStringArray(rollbackSnapshot.temporaryBlacklist) ?? [],
      customOrder: normalizeStringArray(rollbackSnapshot.customOrder) ?? null,
      manualCards: normalizeStringArray(rollbackSnapshot.manualCards) ?? [],
    },
  };

  const visibleCardIds = normalizeStringArray(value.visibleCardIds);
  if (visibleCardIds && visibleCardIds.length > 0) {
    normalized.visibleCardIds = visibleCardIds;
  }

  return normalized;
}

function normalizeReviewTabTransferState(value: unknown): ReviewTabTransferState | null {
  if (!isRecord(value) || value.kind !== 'filter-group-session') {
    return null;
  }

  const filterSession = normalizeFilterGroupQueueSessionSnapshot(value.filterSession);
  if (!filterSession) {
    return null;
  }

  return {
    kind: 'filter-group-session',
    filterSession,
    session: normalizeInitialReviewSessionState(value.session),
  };
}

function cloneSerializableValue<T>(value: T): T | null {
  try {
    const structuredCloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
    if (typeof structuredCloneFn === 'function') {
      return structuredCloneFn(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

function normalizeReviewQueueSessionSnapshot(value: unknown): ReviewQueueSessionSnapshot | null {
  if (!isRecord(value) || Number(value.version) !== 1) {
    return null;
  }

  const queueType = typeof value.queueType === 'string' ? value.queueType.trim() : '';
  if (!queueType) {
    return null;
  }

  const cachedCards = Array.isArray(value.cachedCards)
    ? cloneSerializableValue(value.cachedCards)
    : [];
  const currentItem = value.currentItem == null
    ? null
    : cloneSerializableValue(value.currentItem);
  const forwardBuffer = Array.isArray(value.forwardBuffer)
    ? cloneSerializableValue(value.forwardBuffer)
    : [];
  const lastCounterSnapshot = isRecord(value.lastCounterSnapshot)
    ? cloneSerializableValue(value.lastCounterSnapshot)
    : null;

  return {
    version: 1,
    queueType,
    cacheValid: value.cacheValid === true,
    currentIndex: Math.max(0, Number(value.currentIndex) || 0),
    cachedCards: Array.isArray(cachedCards) ? cachedCards : [],
    currentItem: isRecord(currentItem) ? currentItem : null,
    forwardBuffer: Array.isArray(forwardBuffer) ? forwardBuffer : [],
    pendingRotateCardId: typeof value.pendingRotateCardId === 'string'
      ? value.pendingRotateCardId
      : null,
    avoidOnceCardId: typeof value.avoidOnceCardId === 'string'
      ? value.avoidOnceCardId
      : typeof value.deferOnceCardId === 'string'
        ? value.deferOnceCardId
        : null,
    avoidOnceBlockId: typeof value.avoidOnceBlockId === 'string'
      ? value.avoidOnceBlockId
      : null,
    deferOnceCardId: typeof value.deferOnceCardId === 'string'
      ? value.deferOnceCardId
      : null,
    sessionExcludedCardIds: normalizeStringArray(value.sessionExcludedCardIds) ?? [],
    sessionExcludedLogicalKeys: normalizeStringArray(value.sessionExcludedLogicalKeys) ?? [],
    lastCounterSnapshot: isRecord(lastCounterSnapshot) ? lastCounterSnapshot : null,
  };
}

function normalizeSharedReviewSessionId(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeReviewTabRuntimeState(value: unknown): ReviewTabRuntimeState | null {
  if (!isRecord(value) || Number(value.version) !== 1) {
    return null;
  }

  const queueSnapshot = normalizeReviewQueueSessionSnapshot(value.queueSnapshot);
  const snapshotCurrentItem = isRecord(queueSnapshot?.currentItem)
    ? queueSnapshot.currentItem
    : null;
  const snapshotCurrentCardId = typeof snapshotCurrentItem?.id === 'string'
    ? snapshotCurrentItem.id.trim()
    : '';
  const snapshotCurrentBlockId = typeof snapshotCurrentItem?.blockId === 'string'
    ? snapshotCurrentItem.blockId.trim()
    : '';
  const currentCardId = typeof value.currentCardId === 'string'
    ? value.currentCardId.trim()
    : snapshotCurrentCardId;
  const currentBlockId = typeof value.currentBlockId === 'string'
    ? value.currentBlockId.trim()
    : snapshotCurrentBlockId;

  return {
    version: 1,
    showAnswer: value.showAnswer === true,
    sharedReviewSessionId: normalizeSharedReviewSessionId(value.sharedReviewSessionId) || undefined,
    currentCardId: currentCardId || undefined,
    currentBlockId: currentBlockId || undefined,
    session: normalizeInitialReviewSessionState(value.session),
    queueSnapshot,
  };
}

/**
 * Review tab options.
 *
 * `adapter` is kept for API compatibility. Restoration now rebuilds
 * queue+adapter from tab data in a single path.
 */
export interface ReviewTabOptions {
  provider?: ReviewProviderRef;
  queue?: ReviewQueueRef;
  adapter?: IAdapter<unknown>;
  title: string;
  headerVariant?: ReviewHeaderVariant;
  position?: 'right' | 'bottom';
  sharedReviewSessionId?: string | null;
  transferState?: ReviewTabTransferState;
  reviewState?: ReviewTabRuntimeState | null;
}

interface ReviewTabOpenOptions {
  position?: 'right' | 'bottom';
  keepCursor?: boolean;
  removeCurrentTab?: boolean;
}

export interface BrowserTabOpenOptions {
  initialState?: BrowserOpenState | null;
  position?: 'right' | 'bottom';
}

export class TabManager {
  private readonly TAB_TYPE: string;
  private readonly REVIEW_TAB_TYPE: string;
  private readonly REVIEW_AI_TAB_TYPE: string;
  private readonly siyuanApi: ManagerSiyuanPort;
  private tabsRegistered = false;
  private readonly reviewTabRuntimes = new Map<string, ReviewTabRuntimeHandle>();
  private readonly reviewTabSurfaceSnapshots = new Map<string, ReviewTabSurfaceSnapshot>();
  private readonly reviewAICompanionRuntimes = new Map<string, ReviewAICompanionRuntimeHandle>();
  private readonly tabMountTokens = new WeakMap<TabRuntimeContext, number>();

  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    ports: { siyuanApi: ManagerSiyuanPort }
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.TAB_TYPE = this.plugin.name + '-browser';
    this.REVIEW_TAB_TYPE = this.plugin.name + '-review';
    this.REVIEW_AI_TAB_TYPE = this.plugin.name + '-review-ai';
  }

  private beginTabMount(runtime: TabRuntimeContext): number {
    const token = (this.tabMountTokens.get(runtime) ?? 0) + 1;
    this.tabMountTokens.set(runtime, token);
    return token;
  }

  private cancelTabMount(runtime: TabRuntimeContext): void {
    this.beginTabMount(runtime);
  }

  private isCurrentTabMount(runtime: TabRuntimeContext, token: number): boolean {
    return this.tabMountTokens.get(runtime) === token;
  }

  registerAll(): void {
    if (this.tabsRegistered) {
      return;
    }
    this.tabsRegistered = true;
    const self = this;
    this.plugin.addTab({
      type: this.TAB_TYPE,
      init() {
        return self.initBrowserTab(this as unknown as TabRuntimeContext);
      },
      destroy() {
        self.destroyBrowserTab(this as unknown as TabRuntimeContext);
      },
    });
    this.plugin.addTab({
      type: this.REVIEW_TAB_TYPE,
      init() {
        return self.initReviewTab(this as unknown as TabRuntimeContext);
      },
      destroy() {
        self.destroyReviewTab(this as unknown as TabRuntimeContext);
      },
      resize() {
        self.refreshReviewTab(this as unknown as TabRuntimeContext);
      },
      update() {
        self.refreshReviewTab(this as unknown as TabRuntimeContext);
      },
    });
    this.plugin.addTab({
      type: this.REVIEW_AI_TAB_TYPE,
      init() {
        return self.initReviewAICompanionTab(this as unknown as TabRuntimeContext);
      },
      destroy() {
        self.destroyReviewAICompanionTab(this as unknown as TabRuntimeContext);
      },
    });
  }

  async initBrowserTab(runtime: TabRuntimeContext): Promise<void> {
    const mountToken = this.beginTabMount(runtime);
    const data = this.normalizeBrowserTabData(runtime.data);
    const SRSBrowser = await loadSrsBrowserComponent();
    if (!this.isCurrentTabMount(runtime, mountToken)) {
      return;
    }
    const app = createApp(SRSBrowser, {
      app: this.plugin.app,
      i18n: this.context.getI18n() || {},
      mode: 'tab',
      plugin: this.plugin,
      initialOpenState: data.initialState ?? null,
    });
    app.mount(runtime.element);
    runtime.vueApp = app;
  }

  destroyBrowserTab(runtime: TabRuntimeContext): void {
    this.cancelTabMount(runtime);
    runtime.vueApp?.unmount();
    runtime.vueApp = undefined;
  }

  async initReviewTab(runtime: TabRuntimeContext): Promise<void> {
    const mountToken = this.beginTabMount(runtime);
    const data = this.recoverReviewTabData(
      this.normalizeReviewTabData(runtime.data),
      this.resolveReviewTabRuntimeId(runtime),
    );
    logger.info('Restoring review tab', {
      providerId: data.providerId,
      queueType: data.queueType,
      headerVariant: data.headerVariant,
      title: data.title,
    });

    const queue = this.buildReviewQueueFromTabData(data);
    const adapter = new UnifiedReviewAdapter({
      i18n: this.getPluginI18n(),
      headerVariant: data.headerVariant,
      progressiveExcerptEnabled: this.context.getSettingsService().getSettings().progressiveReading?.altXExcerptEnabled === true,
    });

    const ReviewView = await loadReviewViewComponent();
    if (!this.isCurrentTabMount(runtime, mountToken)) {
      return;
    }
    const app = createApp(ReviewView, {
      app: this.plugin.app,
      i18n: this.getPluginI18n(),
      mode: 'tab',
      reviewSessionId: this.resolveReviewTabRuntimeId(runtime) || data.providerId,
      sharedReviewSessionId: data.sharedReviewSessionId ?? data.reviewState?.sharedReviewSessionId ?? null,
      title: data.title,
      headerVariant: data.headerVariant,
      queue,
      adapter,
      plugin: this.plugin,
      reviewState: data.reviewState ?? null,
      initialSessionState: data.reviewState?.session ?? data.transferState?.session,
      initialCurrentItem: data.reviewState?.queueSnapshot?.currentItem ?? null,
      initialCurrentCardId: data.reviewState?.currentCardId ?? '',
      initialShowAnswer: data.reviewState?.showAnswer === true,
      onTabRuntimeStateChange: (reviewState: ReviewTabRuntimeState | null) => {
        this.persistReviewTabRuntimeState(runtime, data, reviewState);
      },
    });

    const vm = app.mount(runtime.element);
    runtime.vueApp = app;
    this.registerReviewTabRuntime(runtime, data, this.resolveReviewViewBridge(vm));
  }

  destroyReviewTab(runtime: TabRuntimeContext): void {
    this.cancelTabMount(runtime);
    this.unregisterReviewTabRuntime(runtime);
    runtime.vueApp?.unmount();
    runtime.vueApp = undefined;
  }

  refreshReviewTab(runtime: TabRuntimeContext): void {
    const data = this.recoverReviewTabData(
      this.normalizeReviewTabData(runtime.data),
      this.resolveReviewTabRuntimeId(runtime),
    );
    this.refreshReviewTabRuntimeSurface(runtime, data);
  }

  async initReviewAICompanionTab(runtime: TabRuntimeContext): Promise<void> {
    await this.mountReviewAICompanionTab(runtime);
  }

  private async mountReviewAICompanionTab(runtime: TabRuntimeContext): Promise<void> {
    const mountToken = this.beginTabMount(runtime);
    const data = this.normalizeReviewAICompanionTabData(runtime.data);
    const service = this.context.getReviewAIWorkbenchRegistry().getOrCreateReviewSession(data.reviewSessionId, {
      surface: 'review-tab-companion',
      sourceReviewSessionId: data.sourceReviewSessionId,
    });

    const AiWorkbenchPane = await loadAiWorkbenchPaneComponent();
    if (!this.isCurrentTabMount(runtime, mountToken)) {
      return;
    }
    const app = createApp(AiWorkbenchPane, {
      service,
      i18n: this.getPluginI18n(),
    });

    app.mount(runtime.element);
    runtime.vueApp = app;
    this.registerReviewAICompanionRuntime(runtime, data);
  }

  destroyReviewAICompanionTab(runtime: TabRuntimeContext): void {
    this.cancelTabMount(runtime);
    this.unregisterReviewAICompanionRuntime(runtime);
    runtime.vueApp?.unmount();
    runtime.vueApp = undefined;
  }

  openBrowserTab(options?: BrowserTabOpenOptions): boolean {
    try {
      const browserModelType = this.buildCustomModelType(this.TAB_TYPE);
      openTab({
        app: this.plugin.app,
        custom: {
          icon: 'iconCard',
          title: this.context.getI18n()?.srsBrowser || 'SRS Browser',
          id: browserModelType,
          data: {
            initialState: options?.initialState ?? null,
          } satisfies BrowserTabData,
        },
        position: options?.position ?? 'right',
      });
      return true;
    } catch (error) {
      logger.error('Failed to open browser tab', error);
      return false;
    }
  }

  async openReviewAICompanionTab(
    options: AIWorkbenchOpenOptions & {
      sessionId: string;
      title: string;
    }
  ): Promise<void> {
    const reviewSessionId = String(options.sessionId || '').trim();
    if (!reviewSessionId) {
      logger.warn('Skip opening review AI companion tab because review session id is empty');
      return;
    }

    await this.context.getReviewAIWorkbenchRegistry().openReviewSession({
      ...options,
      source: 'review',
      surface: 'review-tab-companion',
      sessionId: reviewSessionId,
      sourceReviewSessionId: options.sourceReviewSessionId ?? reviewSessionId,
    });

    const existing = this.reviewAICompanionRuntimes.get(reviewSessionId);
    if (existing) {
      this.focusReviewAICompanionRuntime(existing);
      return;
    }

    const tabData: ReviewAICompanionTabData = {
      reviewSessionId,
      sourceReviewSessionId: options.sourceReviewSessionId ?? reviewSessionId,
      title: String(options.title || this.getPluginI18n()?.aiWorkbench || 'AI Workbench'),
    };

    try {
      const reviewAiModelType = this.buildCustomModelType(this.REVIEW_AI_TAB_TYPE);
      openTab({
        app: this.plugin.app,
        custom: {
          icon: 'iconSparkles',
          title: tabData.title,
          id: reviewAiModelType,
          data: tabData,
        },
        position: 'right',
        keepCursor: false,
        removeCurrentTab: false,
      });
    } catch (error) {
      logger.error('Failed to open review AI companion tab', error);
    }
  }

  openReviewTab(options: ReviewTabOptions): void {
    void this.openReviewTabInternal(options, {
      position: options.position,
      keepCursor: false,
      removeCurrentTab: false,
    });
  }

  openReviewTabInNewTab(options: ReviewTabOptions): void {
    const { position: _ignoredPosition, ...tabOptions } = options;
    void this.openReviewTabInternal(tabOptions, {
      keepCursor: false,
      removeCurrentTab: false,
    });
  }

  replaceCurrentReviewTabWithStandardQueue(queueType: QueueType): void {
    const preset = this.resolveStandardReviewPreset(queueType);
    if (!preset) {
      logger.warn('Unsupported standard review queue tab replacement target', {
        queueType,
      });
      return;
    }

    void this.openReviewTabInternal({
      queue: this.context.getUnifiedDataSourceManager().getQueue(queueType),
      title: preset.title,
      headerVariant: preset.headerVariant,
    }, {
      keepCursor: false,
      removeCurrentTab: true,
    });
  }

  openReviewInNewWindow(options: ReviewTabOptions): void {
    if (!this.canOpenInNewWindow()) {
      logger.warn('New window is not supported in current runtime, opening tab instead');
      this.openReviewTabInNewTab(options);
      return;
    }
    void this.openReviewInNewWindowInternal(options);
  }

  openDocumentTab(blockId: string): void {
    if (!blockId) {
      logger.warn('Cannot open document tab: blockId is empty');
      return;
    }

    try {
      openTab({
        app: this.plugin.app,
        doc: { id: blockId },
      });
    } catch (error) {
      logger.error('Failed to open document tab', error);
    }
  }

  dispose(): void {
    // Tab lifecycle is managed by SiYuan.
  }

  async syncExistingNeuralReviewTabToCurrentNode(options?: {
    fallbackNodeId?: string | null;
    focus?: boolean;
  }): Promise<'synced' | 'missing' | 'failed'> {
    const runtime = this.getLatestNeuralReviewTabRuntime();
    if (!runtime) {
      return 'missing';
    }

    if (!runtime.bridge || typeof runtime.bridge.syncToNeuralQueueCurrentNode !== 'function') {
      logger.warn('Neural review tab bridge is unavailable', {
        customId: runtime.customId,
        title: runtime.title,
      });
      return 'failed';
    }

    try {
      const synced = await runtime.bridge.syncToNeuralQueueCurrentNode(options?.fallbackNodeId);
      if (!synced) {
        logger.warn('Neural review tab declined sync request', {
          customId: runtime.customId,
          title: runtime.title,
          fallbackNodeId: options?.fallbackNodeId ?? null,
        });
        return 'failed';
      }

      if (options?.focus !== false && !this.focusReviewTab(runtime)) {
        return 'failed';
      }

      runtime.lastActiveAt = Date.now();
      return 'synced';
    } catch (error) {
      logger.error('Failed to sync neural review tab', {
        customId: runtime.customId,
        title: runtime.title,
        error,
      });
      return 'failed';
    }
  }

  private getPluginI18n(): Record<string, string> {
    const candidate = (this.plugin as PluginWithI18n).i18n;
    return candidate && typeof candidate === 'object' ? candidate : {};
  }

  private getDefaultReviewTitle(): string {
    return this.context.getI18n()?.reviewTitle || 'Review';
  }

  private resolveStandardReviewPreset(queueType: QueueType): {
    title: string;
    headerVariant: ReviewHeaderVariant;
  } | null {
    const i18n = this.getPluginI18n();

    switch (queueType) {
      case QueueType.RetrievalPractice:
        return {
          title: i18n.retrievalPractice || '提取练习',
          headerVariant: 'retrieval-practice',
        };
      case QueueType.IncrementalLearning:
        return {
          title: i18n.incrementalLearning || '渐进学习',
          headerVariant: 'incremental-learning',
        };
      case QueueType.FinalDrill:
        return {
          title: i18n.finalDrill || '刻意练习',
          headerVariant: 'final-drill',
        };
      case QueueType.FilterGroup:
        return {
          title: i18n.filterGroupPractice || '分组队列',
          headerVariant: 'filter-group',
        };
      case QueueType.NeuralRoam:
        return {
          title: i18n.neuralReviewTitle || '神经漫游',
          headerVariant: 'neural-roam',
        };
      default:
        return null;
    }
  }

  private buildCustomModelType(tabType: string): string {
    return this.plugin.name + tabType;
  }

  private resolveReviewViewBridge(vm: unknown): ReviewViewTabBridge | null {
    const candidate = vm as
      | (Partial<ReviewViewTabBridge> & {
          $?: {
            exposed?: Partial<ReviewViewTabBridge> | null;
            exposeProxy?: Partial<ReviewViewTabBridge> | null;
          } | null;
        })
      | null
      | undefined;

    if (typeof candidate?.syncToNeuralQueueCurrentNode === 'function') {
      return candidate as ReviewViewTabBridge;
    }

    const exposedCandidate = candidate?.$?.exposed;
    if (typeof exposedCandidate?.syncToNeuralQueueCurrentNode === 'function') {
      return exposedCandidate as ReviewViewTabBridge;
    }

    const exposeProxyCandidate = candidate?.$?.exposeProxy;
    if (typeof exposeProxyCandidate?.syncToNeuralQueueCurrentNode === 'function') {
      return exposeProxyCandidate as ReviewViewTabBridge;
    }

    return null;
  }

  private normalizeBrowserTabData(data: Partial<BrowserTabData> | undefined): BrowserTabData {
    return {
      initialState: data?.initialState ?? null,
    };
  }

  private normalizeReviewAICompanionTabData(data: Partial<ReviewAICompanionTabData> | undefined): ReviewAICompanionTabData {
    const reviewSessionId = typeof data?.reviewSessionId === 'string' ? data.reviewSessionId.trim() : '';
    const sourceReviewSessionId = typeof data?.sourceReviewSessionId === 'string' ? data.sourceReviewSessionId.trim() : reviewSessionId;
    return {
      reviewSessionId,
      sourceReviewSessionId,
      title: typeof data?.title === 'string' && data.title.trim()
        ? data.title.trim()
        : this.getPluginI18n()?.aiWorkbench || 'AI Workbench',
    };
  }

  private resolveReviewTabRuntimeId(runtime: TabRuntimeContext): string {
    return String(runtime.tab?.id || runtime.id || '').trim();
  }

  private registerReviewTabRuntime(
    runtime: TabRuntimeContext,
    data: ReviewTabData,
    bridge: ReviewViewTabBridge | null,
  ): void {
    const customId = this.resolveReviewTabRuntimeId(runtime);
    if (!customId) {
      logger.warn('Skip review tab runtime registration because runtime id is empty', {
        title: data.title,
        queueType: data.queueType,
      });
      return;
    }

    this.unregisterReviewTabRuntime(customId);

    const markActive = () => {
      const handle = this.reviewTabRuntimes.get(customId);
      if (handle) {
        handle.lastActiveAt = Date.now();
      }
    };

    const attachListener = (
      target: EventTarget | null | undefined,
      type: string,
      listener: EventListener,
    ): (() => void) => {
      if (!target || typeof (target as { addEventListener?: unknown }).addEventListener !== 'function') {
        return () => undefined;
      }
      target.addEventListener(type, listener);
      return () => {
        target.removeEventListener(type, listener);
      };
    };

    const detachFns = [
      attachListener(runtime.tab?.headElement ?? null, 'click', markActive),
      attachListener(runtime.element ?? null, 'mousedown', markActive),
      attachListener(runtime.element ?? null, 'focusin', markActive),
    ];

    this.reviewTabRuntimes.set(customId, {
      customId,
      queueType: data.queueType,
      title: data.title,
      custom: runtime,
      bridge,
      lastActiveAt: Date.now(),
      pendingSurfaceRefreshTimer: null,
      removeActivityListeners: () => {
        detachFns.forEach((detach) => detach());
      },
    });
    this.updateReviewTabSurfaceSnapshot(customId, data, data.reviewState);
  }

  private persistReviewTabRuntimeState(
    runtime: TabRuntimeContext,
    baseData: ReviewTabData,
    reviewState: ReviewTabRuntimeState | null,
  ): void {
    const nextData: ReviewTabData = {
      ...baseData,
      reviewState: normalizeReviewTabRuntimeState(reviewState),
    };
    nextData.sharedReviewSessionId = normalizeSharedReviewSessionId(
      nextData.reviewState?.sharedReviewSessionId ?? baseData.sharedReviewSessionId,
    );
    runtime.data = nextData;
    const tabModel = runtime.tab?.model as { data?: ReviewTabData } | undefined;
    if (tabModel) {
      tabModel.data = nextData;
    }
    this.updateReviewTabSurfaceSnapshot(
      this.resolveReviewTabRuntimeId(runtime),
      nextData,
      nextData.reviewState,
    );
  }

  private buildReviewTabSurfaceSnapshotKey(data: Pick<ReviewTabData, 'providerId' | 'queueType' | 'title' | 'headerVariant' | 'sharedReviewSessionId'>): string {
    return [
      String(data.sharedReviewSessionId || '').trim(),
      String(data.providerId || '').trim(),
      String(data.queueType || '').trim(),
      String(data.headerVariant || '').trim(),
      String(data.title || '').trim(),
    ].join('::');
  }

  private hasRenderableReviewRuntimeState(reviewState: ReviewTabRuntimeState | null | undefined): boolean {
    const normalizedCardId = String(reviewState?.currentCardId || '').trim();
    if (normalizedCardId) {
      return true;
    }

    const currentItem = reviewState?.queueSnapshot?.currentItem;
    if (!isRecord(currentItem)) {
      return false;
    }

    return String(currentItem.id || '').trim().length > 0;
  }

  private updateReviewTabSurfaceSnapshot(
    customId: string | null | undefined,
    data: ReviewTabData,
    reviewState: ReviewTabRuntimeState | null | undefined,
  ): void {
    const normalizedRuntimeState = normalizeReviewTabRuntimeState(reviewState);
    if (!this.hasRenderableReviewRuntimeState(normalizedRuntimeState)) {
      return;
    }

    const snapshotKey = this.buildReviewTabSurfaceSnapshotKey(data);
    this.reviewTabSurfaceSnapshots.set(snapshotKey, {
      customId: String(customId || '').trim(),
      providerId: data.providerId,
      queueType: data.queueType,
      title: data.title,
      headerVariant: data.headerVariant,
      sharedReviewSessionId: data.sharedReviewSessionId ?? null,
      reviewState: normalizedRuntimeState,
      updatedAt: Date.now(),
    });
  }

  private recoverReviewTabData(
    data: ReviewTabData,
    runtimeId?: string | null,
  ): ReviewTabData {
    if (this.hasRenderableReviewRuntimeState(data.reviewState)) {
      return data;
    }

    const snapshotKey = this.buildReviewTabSurfaceSnapshotKey(data);
    const snapshot = this.reviewTabSurfaceSnapshots.get(snapshotKey);
    if (!snapshot?.reviewState || !this.hasRenderableReviewRuntimeState(snapshot.reviewState)) {
      return data;
    }

    const normalizedRuntimeId = String(runtimeId || '').trim();
    if (normalizedRuntimeId && snapshot.customId && snapshot.customId === normalizedRuntimeId) {
      return data;
    }

    if (Date.now() - snapshot.updatedAt > 10 * 60 * 1000) {
      return data;
    }

    return {
      ...data,
      reviewState: snapshot.reviewState,
    };
  }

  private refreshReviewTabRuntimeSurface(
    runtime: TabRuntimeContext,
    data: ReviewTabData,
  ): void {
    const customId = this.resolveReviewTabRuntimeId(runtime);
    const handle = customId ? this.reviewTabRuntimes.get(customId) : null;
    if (!handle?.bridge || typeof handle.bridge.refreshTabSurface !== 'function') {
      return;
    }

    const preferredCardId = data.reviewState?.currentCardId ?? null;
    if (handle.pendingSurfaceRefreshTimer !== null) {
      window.clearTimeout(handle.pendingSurfaceRefreshTimer);
    }

    handle.pendingSurfaceRefreshTimer = window.setTimeout(() => {
      handle.pendingSurfaceRefreshTimer = null;
      void handle.bridge?.refreshTabSurface(preferredCardId).catch((error) => {
        logger.warn('Failed to refresh review tab surface after custom tab lifecycle update', {
          customId,
          preferredCardId,
          error,
        });
      });
    }, 0);
  }

  private registerReviewAICompanionRuntime(
    runtime: TabRuntimeContext,
    data: ReviewAICompanionTabData,
  ): void {
    const customId = this.resolveReviewTabRuntimeId(runtime);
    if (!customId || !data.sourceReviewSessionId) {
      return;
    }

    this.unregisterReviewAICompanionRuntime(data.sourceReviewSessionId);
    this.reviewAICompanionRuntimes.set(data.sourceReviewSessionId, {
      customId,
      reviewSessionId: data.reviewSessionId,
      sourceReviewSessionId: data.sourceReviewSessionId,
      title: data.title,
      custom: runtime,
    });
  }

  private unregisterReviewTabRuntime(customIdOrRuntime: string | TabRuntimeContext | null | undefined): void {
    const normalizedId = typeof customIdOrRuntime === 'string'
      ? String(customIdOrRuntime || '').trim()
      : customIdOrRuntime
        ? this.resolveReviewTabRuntimeId(customIdOrRuntime)
        : '';
    if (!normalizedId) {
      return;
    }

    const existing = this.reviewTabRuntimes.get(normalizedId);
    if (!existing) {
      return;
    }

    if (existing.pendingSurfaceRefreshTimer !== null) {
      window.clearTimeout(existing.pendingSurfaceRefreshTimer);
      existing.pendingSurfaceRefreshTimer = null;
    }
    existing.removeActivityListeners();
    this.reviewTabRuntimes.delete(normalizedId);
    this.closeReviewAICompanionTab(normalizedId);
    this.context.getReviewAIWorkbenchRegistry().disposeReviewSession(normalizedId);
  }

  private unregisterReviewAICompanionRuntime(sourceReviewSessionIdOrRuntime: string | TabRuntimeContext | null | undefined): void {
    const normalizedId = typeof sourceReviewSessionIdOrRuntime === 'string'
      ? String(sourceReviewSessionIdOrRuntime || '').trim()
      : sourceReviewSessionIdOrRuntime
        ? Array.from(this.reviewAICompanionRuntimes.values())
            .find((runtime) => this.resolveReviewTabRuntimeId(sourceReviewSessionIdOrRuntime) === runtime.customId)
            ?.sourceReviewSessionId || ''
        : '';

    if (!normalizedId) {
      return;
    }

    this.reviewAICompanionRuntimes.delete(normalizedId);
  }

  private getLatestNeuralReviewTabRuntime(): ReviewTabRuntimeHandle | null {
    let selected: ReviewTabRuntimeHandle | null = null;
    for (const runtime of this.reviewTabRuntimes.values()) {
      if (runtime.queueType !== QueueType.NeuralRoam) {
        continue;
      }
      if (!selected || runtime.lastActiveAt > selected.lastActiveAt) {
        selected = runtime;
      }
    }
    return selected;
  }

  private focusReviewTab(runtime: ReviewTabRuntimeHandle): boolean {
    try {
      runtime.custom.tab?.parent?.switchTab(runtime.custom.tab.headElement);
      runtime.lastActiveAt = Date.now();
      return true;
    } catch (error) {
      logger.error('Failed to focus neural review tab', {
        customId: runtime.customId,
        title: runtime.title,
        error,
      });
      return false;
    }
  }

  private focusReviewAICompanionRuntime(runtime: ReviewAICompanionRuntimeHandle): boolean {
    try {
      runtime.custom.tab?.parent?.switchTab(runtime.custom.tab.headElement);
      return true;
    } catch (error) {
      logger.error('Failed to focus review AI companion tab', {
        customId: runtime.customId,
        sourceReviewSessionId: runtime.sourceReviewSessionId,
        error,
      });
      return false;
    }
  }

  focusReviewAICompanionTab(reviewSessionId: string): boolean {
    const normalizedId = String(reviewSessionId || '').trim();
    if (!normalizedId) {
      return false;
    }
    const runtime = this.reviewAICompanionRuntimes.get(normalizedId);
    if (!runtime) {
      return false;
    }
    return this.focusReviewAICompanionRuntime(runtime);
  }

  hasReviewAICompanionTab(reviewSessionId: string): boolean {
    const normalizedId = String(reviewSessionId || '').trim();
    return normalizedId.length > 0 && this.reviewAICompanionRuntimes.has(normalizedId);
  }

  closeReviewTab(reviewSessionId: string): void {
    const normalizedId = String(reviewSessionId || '').trim();
    if (!normalizedId) {
      return;
    }

    const runtime = this.reviewTabRuntimes.get(normalizedId);
    if (!runtime) {
      return;
    }

    try {
      if (typeof runtime.custom.tab?.close === 'function') {
        runtime.custom.tab.close();
        return;
      }
      if (runtime.custom.tab?.parent && typeof runtime.custom.tab.parent.removeTab === 'function') {
        runtime.custom.tab.parent.removeTab(runtime.custom.tab.id);
        return;
      }
    } catch (error) {
      logger.error('Failed to close review tab', {
        reviewSessionId: normalizedId,
        error,
      });
      return;
    }

    logger.warn('Review tab runtime does not expose a close handler, unregistering it locally', {
      reviewSessionId: normalizedId,
    });
    this.unregisterReviewTabRuntime(normalizedId);
  }

  closeReviewAICompanionTab(reviewSessionId: string): void {
    const normalizedId = String(reviewSessionId || '').trim();
    if (!normalizedId) {
      return;
    }

    const runtime = this.reviewAICompanionRuntimes.get(normalizedId);
    if (!runtime) {
      return;
    }

    try {
      if (typeof runtime.custom.tab?.close === 'function') {
        runtime.custom.tab.close();
      } else if (runtime.custom.tab?.parent && typeof runtime.custom.tab.parent.removeTab === 'function') {
        runtime.custom.tab.parent.removeTab(runtime.custom.tab.id);
      }
    } catch (error) {
      logger.error('Failed to close review AI companion tab', {
        sourceReviewSessionId: normalizedId,
        error,
      });
    } finally {
      this.reviewAICompanionRuntimes.delete(normalizedId);
    }
  }

  private resolveReviewTabData(options: ReviewTabOptions): ReviewTabData {
    const queueType = this.normalizeQueueType(options.queue?.getType?.(), options.provider?.id);
    const reviewState = normalizeReviewTabRuntimeState(options.reviewState);
    return {
      providerId: this.resolveProviderId(options),
      title: String(options.title || this.getDefaultReviewTitle()),
      queueType,
      headerVariant: options.headerVariant || resolveReviewHeaderVariant(queueType),
      sharedReviewSessionId: normalizeSharedReviewSessionId(
        options.sharedReviewSessionId ?? reviewState?.sharedReviewSessionId,
      ),
      transferState: normalizeReviewTabTransferState(options.transferState),
      reviewState,
    };
  }

  private normalizeReviewTabData(data: Partial<ReviewTabData> | undefined): ReviewTabData {
    const providerId = typeof data?.providerId === 'string' && data.providerId
      ? data.providerId
      : 'retrieval';
    const queueType = this.normalizeQueueType(data?.queueType, providerId);
    const title = typeof data?.title === 'string' && data.title.trim()
      ? data.title
      : this.getDefaultReviewTitle();
    const reviewState = normalizeReviewTabRuntimeState(data?.reviewState);

    return {
      providerId,
      title,
      queueType,
      headerVariant: typeof data?.headerVariant === 'string'
        ? data.headerVariant
        : resolveReviewHeaderVariant(queueType),
      sharedReviewSessionId: normalizeSharedReviewSessionId(
        data?.sharedReviewSessionId ?? reviewState?.sharedReviewSessionId,
      ),
      transferState: normalizeReviewTabTransferState(data?.transferState),
      reviewState,
    };
  }

  private resolveProviderId(options: ReviewTabOptions): string {
    if (typeof options.provider?.id === 'string' && options.provider.id) {
      return options.provider.id;
    }
    return options.queue ? 'queue-based' : 'retrieval';
  }

  private normalizeQueueType(rawQueueType: unknown, providerId: unknown): QueueType {
    const queueType = String(rawQueueType || '');
    if ((Object.values(QueueType) as string[]).includes(queueType)) {
      return queueType as QueueType;
    }

    switch (String(providerId || '')) {
      case 'final-drill':
      case 'final_drill':
      case 'deliberate':
        return QueueType.FinalDrill;
      case 'incremental-learning':
      case 'incremental':
        return QueueType.IncrementalLearning;
      case 'filter-group':
      case 'filter_group':
        return QueueType.FilterGroup;
      case 'neural-roam':
      case 'neural-wandering':
      case 'neural_wandering':
        return QueueType.NeuralRoam;
      case 'leech':
        return QueueType.Leech;
      default:
        return QueueType.RetrievalPractice;
    }
  }

  private buildReviewQueue(queueType: QueueType): UnifiedQueueStrategy {
    return new UnifiedQueueStrategy(
      queueType,
      this.context.getUnifiedDataSourceManager(),
      this.context.getEventBus(),
      this.context.getSchedulerRouter() as unknown as ISchedulerRouter
    );
  }

  private buildReviewQueueFromTabData(data: ReviewTabData): UnifiedQueueStrategy {
    const transferredQueue = this.buildTransferredReviewQueue(data.transferState);
    const strategy = new UnifiedQueueStrategy(
      transferredQueue ?? data.queueType,
      this.context.getUnifiedDataSourceManager(),
      this.context.getEventBus(),
      this.context.getSchedulerRouter() as unknown as ISchedulerRouter,
    );
    strategy.restoreSessionSnapshot?.(data.reviewState?.queueSnapshot);
    return strategy;
  }

  private buildTransferredReviewQueue(transferState?: ReviewTabTransferState | null): IReviewQueue | null {
    if (!transferState || transferState.kind !== 'filter-group-session') {
      return null;
    }

    try {
      const manager = this.context.getUnifiedDataSourceManager();
      const queue = new FilterGroupQueue(manager, NOOP_QUEUE_PERSISTENCE, {}, {
        autoFailedSink: {
          addAutoFailed: async (cardId: string): Promise<void> => {
            const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
            await finalDrillQueue.addCard(cardId, 'auto-failed');
          },
        },
      });
      queue.restoreSessionSnapshot(transferState.filterSession);
      return queue;
    } catch (error) {
      logger.error('Failed to restore transferred filter-group review queue; refusing shared queue substitution', error);
      throw new Error('REVIEW_TRANSFER_UNAVAILABLE: failed to restore transferred filter-group review queue');
    }
  }

  private prepareQueueBeforeOpen(queueType: QueueType): Promise<void> | null {
    if (queueType !== QueueType.RetrievalPractice && queueType !== QueueType.IncrementalLearning) {
      return null;
    }

    const preparationService = this.context.getReviewQueuePreparationService?.();
    if (!preparationService || typeof preparationService.prepareBeforeReview !== 'function') {
      return null;
    }

    return preparationService.prepareBeforeReview(queueType).catch((error) => {
      logger.warn('Review queue preparation failed, continue opening review tab', {
        queueType,
        error,
      });
    });
  }

  private triggerQueuePreparationInBackground(queueType: QueueType): void {
    const prepare = this.prepareQueueBeforeOpen(queueType);
    if (!prepare) {
      return;
    }

    logger.debug('Start review queue preparation in background before opening new window', {
      queueType,
    });

    void prepare.then(() => {
      logger.debug('Review queue preparation finished in background', {
        queueType,
      });
    });
  }

  private canOpenInNewWindow(): boolean {
    const ipcRenderer = resolveIpcRenderer();
    return typeof ipcRenderer?.send === 'function';
  }

  private async openReviewTabInternal(
    options: ReviewTabOptions,
    tabOpenOptions: ReviewTabOpenOptions
  ): Promise<void> {
    try {
      const tabData = this.resolveReviewTabData(options);
      const reviewModelType = this.buildCustomModelType(this.REVIEW_TAB_TYPE);
      const position = tabOpenOptions.position ?? options.position;
      const prepare = this.prepareQueueBeforeOpen(tabData.queueType);
      if (prepare) {
        await prepare;
      }

      openTab({
        app: this.plugin.app,
        custom: {
          icon: 'iconSiyuanMemo',
          title: tabData.title,
          id: reviewModelType,
          data: tabData,
        },
        keepCursor: tabOpenOptions.keepCursor,
        removeCurrentTab: tabOpenOptions.removeCurrentTab,
        ...(position ? { position } : {}),
      });
    } catch (error) {
      logger.error('Failed to open review tab', error);
    }
  }

  private async openReviewInNewWindowInternal(options: ReviewTabOptions): Promise<void> {
    try {
      if (!this.canOpenInNewWindow()) {
        throw new Error('ipcRenderer is unavailable');
      }
      const ipcRenderer = resolveIpcRenderer();
      if (!ipcRenderer) {
        throw new Error('ipcRenderer is unavailable');
      }
      const tabData = this.resolveReviewTabData(options);
      const reviewModelType = this.buildCustomModelType(this.REVIEW_TAB_TYPE);
      this.triggerQueuePreparationInBackground(tabData.queueType);

      const json = [
        {
          title: tabData.title,
          icon: 'iconSiyuanMemo',
          instance: 'Tab',
          children: {
            instance: 'Custom',
            customModelType: reviewModelType,
            customModelData: tabData,
          },
        },
      ];

      ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
        url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`,
      });

      logger.info('Opened review in new window', {
        queueType: tabData.queueType,
        providerId: tabData.providerId,
      });
    } catch (error) {
      logger.error('Failed to open review in new window', error);
      void this.siyuanApi.pushErrMsg(this.context.getI18n()?.openFailed || 'Failed to open new window');
    }
  }
}
