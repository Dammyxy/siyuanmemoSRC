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
  type QueueCounterSnapshot,
} from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot, ReviewTabRuntimeState } from '@/types/review-tab';
import type { ISchedulerRouter } from '@/application/interfaces/ISchedulerRouter';
import type { CdfLiveRelationRefreshResult } from '@/application/services/CdfLiveRelationRefreshService';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewPresentationSnapshotKeyParts,
  resolveReviewPresentation,
  resolveReviewPresentationHeaderVariant,
} from '@/types/review-presentation-semantics';
import { createLogger } from '@/utils/logger';
import type { BrowserOpenState } from '@/types/browser';
import type { BackendNeuralRoamStartFromFocusRequest } from '../../../packages/contracts/src/backend-rpc';
import { FilterGroupQueue } from '@/core/queue/domain/FilterGroupQueue';
import { SubsetReviewQueue } from '@/core/queue/domain/SubsetReviewQueue';
import { TemporaryDrillQueue } from '@/core/queue/domain/TemporaryDrillQueue';
import { NOOP_QUEUE_PERSISTENCE } from '@/core/queue/domain/ports';
import {
  loadReviewViewComponent,
  loadSrsBrowserComponent,
} from './lazySurfaceComponents';

const logger = createLogger('TabManager');

function normalizeOptionalId(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

type ReviewProviderRef = {
  id: string;
};

type ReviewQueueRef = {
  getType?: () => unknown;
};

type CdfLiveRelationReviewOpenRefresher = {
  refreshCdfLiveRelationOnOpen: (card: FSRSCard | string) => Promise<CdfLiveRelationRefreshResult>;
};

interface ReviewTabData {
  providerId: string;
  title: string;
  queueType: QueueType | null;
  headerVariant: ReviewHeaderVariant;
  sharedReviewSessionId?: string | null;
  transferState?: ReviewTabTransferState | null;
  reviewState?: ReviewTabRuntimeState | null;
  suppressSnapshotRecovery?: boolean;
  neuralRoamStartFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
  neuralRoamTemporaryEngineModeTouched?: boolean;
  initialSemanticPinnedSessionId?: string | null;
}

interface BrowserTabData {
  initialState?: BrowserOpenState | null;
}

export type TabRuntimeContext = Custom & {
  id?: string;
  vueApp?: VueApp<Element>;
};

type TabRuntimeCallback<T> = (runtime: TabRuntimeContext) => T;

function withTabRuntimeContext<T>(callback: TabRuntimeCallback<T>): (this: Custom) => T {
  return function runWithTabRuntimeContext(this: Custom): T {
    return callback(this);
  };
}

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

interface ReviewTabSurfaceSnapshot {
  customId: string;
  providerId: string;
  queueType: QueueType | null;
  title: string;
  headerVariant: ReviewHeaderVariant;
  sharedReviewSessionId?: string | null;
  transferStateKey: string;
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
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === 'filter-group-session') {
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

  if (value.kind === 'static-subset-session') {
    const queueType = value.queueType === QueueType.FinalDrill
      ? QueueType.FinalDrill
      : value.queueType === QueueType.FilterGroup
        ? QueueType.FilterGroup
        : null;
    if (!queueType) {
      return null;
    }

    const blockIds = normalizeStringArray(value.blockIds) ?? [];
    const cardIds = normalizeStringArray(value.cardIds);
    if (blockIds.length === 0 && (!cardIds || cardIds.length === 0)) {
      return null;
    }

    const preferredCardId = String(value.preferredCardId || '').trim();
    return {
      kind: 'static-subset-session',
      queueType,
      blockIds,
      cardIds,
      preferredCardId: preferredCardId.length > 0 ? preferredCardId : undefined,
      session: normalizeInitialReviewSessionState(value.session),
    };
  }

  return null;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type QueueCounterBucketDto = {
  all: number;
  item: number;
  descriptor: number;
  topic: number;
  concept: number;
};

function isValidQueueCounterBuckets(value: unknown): value is QueueCounterBucketDto {
  if (!isRecord(value)) {
    return false;
  }

  return isFiniteNumber(value.all)
    && isFiniteNumber(value.item)
    && isFiniteNumber(value.descriptor)
    && isFiniteNumber(value.topic)
    && isFiniteNumber(value.concept);
}

function normalizeQueueCounterTotal(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return isFiniteNumber(value) ? value : undefined;
}

function normalizeQueueCounterSnapshot(value: unknown): QueueCounterSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const total = normalizeQueueCounterTotal(value.total);
  if (!isFiniteNumber(value.version)
    || !isFiniteNumber(value.remaining)
    || !isFiniteNumber(value.due)
    || total === undefined
    || !isValidQueueCounterBuckets(value.buckets)
    || (value.source !== 'hot' && value.source !== 'reconciled')
  ) {
    return null;
  }

  const snapshot: QueueCounterSnapshot = {
    version: value.version,
    remaining: value.remaining,
    due: value.due,
    total,
    buckets: {
      all: value.buckets.all,
      item: value.buckets.item,
      descriptor: value.buckets.descriptor,
      topic: value.buckets.topic,
      concept: value.buckets.concept,
    },
    source: value.source,
  };

  if (isFiniteNumber(value.currentLearningDue)) {
    snapshot.currentLearningDue = value.currentLearningDue;
  }
  if (isFiniteNumber(value.todayReviewDue)) {
    snapshot.todayReviewDue = value.todayReviewDue;
  }
  if (isFiniteNumber(value.allowedNew)) {
    snapshot.allowedNew = value.allowedNew;
  }
  if (isFiniteNumber(value.learnAheadAvailable)) {
    snapshot.learnAheadAvailable = value.learnAheadAvailable;
  }
  if (isFiniteNumber(value.scheduledTotal)) {
    snapshot.scheduledTotal = value.scheduledTotal;
  }

  return snapshot;
}

function isCardStateValue(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function normalizeReviewSnapshotCard(value: unknown): FSRSCard | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.id !== 'string' || !value.id.trim()
    || typeof value.xiuyuanID !== 'string'
    || typeof value.blockId !== 'string' || !value.blockId.trim()
    || !isFiniteNumber(value.due)
    || !isFiniteNumber(value.stability)
    || !isFiniteNumber(value.difficulty)
    || !isFiniteNumber(value.reps)
    || !isFiniteNumber(value.lapses)
    || !isCardStateValue(value.state)
    || !isFiniteNumber(value.lastReview)
    || !isFiniteNumber(value.elapsedDays)
    || !isFiniteNumber(value.scheduledDays)
    || !isFiniteNumber(value.priority)
    || typeof value.type !== 'string'
    || !Array.isArray(value.tags)
    || !isFiniteNumber(value.leechCount)
    || typeof value.isLeech !== 'boolean'
    || typeof value.skipped !== 'boolean'
    || !isFiniteNumber(value.createdAt)
    || !isFiniteNumber(value.updatedAt)
  ) {
    return null;
  }

  const cloned = cloneSerializableValue(value);
  return isRecord(cloned) ? cloned as unknown as FSRSCard : null;
}

function normalizeReviewSnapshotCards(value: unknown): FSRSCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeReviewSnapshotCard(item))
    .filter((card): card is FSRSCard => card !== null);
}

function normalizeReviewQueueSessionSnapshot(value: unknown): ReviewQueueSessionSnapshot | null {
  if (!isRecord(value) || Number(value.version) !== 1) {
    return null;
  }

  const queueType = typeof value.queueType === 'string' ? value.queueType.trim() : '';
  if (!queueType) {
    return null;
  }

  const cachedCards = normalizeReviewSnapshotCards(value.cachedCards);
  const currentItem = value.currentItem == null
    ? null
    : normalizeReviewSnapshotCard(value.currentItem);
  const forwardBuffer = normalizeReviewSnapshotCards(value.forwardBuffer);
  const lastCounterSnapshot = normalizeQueueCounterSnapshot(value.lastCounterSnapshot);

  return {
    version: 1,
    queueType,
    cacheValid: value.cacheValid === true,
    currentIndex: Math.max(0, Number(value.currentIndex) || 0),
    cachedCards,
    currentItem,
    forwardBuffer,
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
    lastCounterSnapshot,
  };
}

function normalizeSharedReviewSessionId(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeNeuralRoamStartFromFocus(value: unknown): BackendNeuralRoamStartFromFocusRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const blockId = String(value.blockId || '').trim();
  if (!blockId) {
    return null;
  }
  return {
    blockId,
    seedBlockId: String(value.seedBlockId || '').trim() || blockId,
    sourceReviewCardId: String(value.sourceReviewCardId || '').trim() || null,
    conceptBlockId: String(value.conceptBlockId || '').trim() || null,
    previousEngineMode: value.previousEngineMode === 'hyperspace' || value.previousEngineMode === 'orbit'
      ? value.previousEngineMode
      : null,
    includeFocusAsFirst: value.includeFocusAsFirst !== false,
    resetHistory: value.resetHistory === true,
    startNewSession: value.startNewSession === true,
    entrySessionKind: typeof value.entrySessionKind === 'string' ? value.entrySessionKind as BackendNeuralRoamStartFromFocusRequest['entrySessionKind'] : null,
  };
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
  suppressSnapshotRecovery?: boolean;
  neuralRoamStartFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
  initialSemanticPinnedSessionId?: string | null;
}

interface ReviewTabOpenOptions {
  position?: 'right' | 'bottom';
  keepCursor?: boolean;
  removeCurrentTab?: boolean;
}

type NeuralReviewSurfaceSyncResult = 'synced' | 'missing' | 'failed';

export interface BrowserTabOpenOptions {
  initialState?: BrowserOpenState | null;
  position?: 'right' | 'bottom';
}

export class TabManager {
  private readonly TAB_TYPE: string;
  private readonly REVIEW_TAB_TYPE: string;
  private readonly siyuanApi: ManagerSiyuanPort;
  private tabsRegistered = false;
  private readonly reviewTabRuntimes = new Map<string, ReviewTabRuntimeHandle>();
  private readonly reviewTabSurfaceSnapshots = new Map<string, ReviewTabSurfaceSnapshot>();
  private readonly tabMountTokens = new WeakMap<TabRuntimeContext, number>();

  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    ports: { siyuanApi: ManagerSiyuanPort }
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.TAB_TYPE = this.plugin.name + '-browser';
    this.REVIEW_TAB_TYPE = this.plugin.name + '-review';
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
      init: withTabRuntimeContext((runtime) => self.initBrowserTab(runtime)),
      destroy: withTabRuntimeContext((runtime) => {
        self.destroyBrowserTab(runtime);
      }),
    });
    this.plugin.addTab({
      type: this.REVIEW_TAB_TYPE,
      init: withTabRuntimeContext((runtime) => self.initReviewTab(runtime)),
      destroy: withTabRuntimeContext((runtime) => {
        self.destroyReviewTab(runtime);
      }),
      resize: withTabRuntimeContext((runtime) => {
        self.refreshReviewTab(runtime);
      }),
      update: withTabRuntimeContext((runtime) => {
        self.refreshReviewTab(runtime);
      }),
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
      transferState: data.transferState ?? undefined,
      initialCurrentItem: data.reviewState?.queueSnapshot?.currentItem ?? null,
      initialCurrentCardId: data.reviewState?.currentCardId ?? '',
      initialShowAnswer: data.reviewState?.showAnswer === true,
      initialSemanticPinnedSessionId: data.initialSemanticPinnedSessionId ?? null,
      onNeuralRoamEngineModeTouched: () => {
        this.markNeuralRoamTemporaryEngineModeTouched(runtime, data);
      },
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

  hasOpenNeuralReviewTab(): boolean {
    return this.getLatestNeuralReviewTabRuntime() !== null;
  }

  getActiveReviewQueueType(): QueueType | null {
    let selected: ReviewTabRuntimeHandle | null = null;
    for (const runtime of this.reviewTabRuntimes.values()) {
      if (!runtime.queueType) {
        continue;
      }
      if (!selected || runtime.lastActiveAt > selected.lastActiveAt) {
        selected = runtime;
      }
    }
    return selected?.queueType ?? null;
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
    const presentation = resolveReviewPresentation({
      queueType,
      i18n: this.getPluginI18n(),
      surfaceKind: 'tab',
    });
    return presentation.ok
      ? { title: presentation.title, headerVariant: presentation.headerVariant }
      : null;
  }

  async focusSemanticReviewSession(sessionId: string, options?: {
    focus?: boolean;
  }): Promise<'synced' | 'missing' | 'failed'> {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return 'failed';
    }

    const runtime = this.getLatestNeuralReviewTabRuntime();
    if (!runtime) {
      return 'missing';
    }

    if (!runtime.bridge || typeof runtime.bridge.focusSemanticSession !== 'function') {
      logger.warn('Review Semantic tab bridge is unavailable', {
        customId: runtime.customId,
        title: runtime.title,
      });
      return 'failed';
    }

    try {
      const synced = await runtime.bridge.focusSemanticSession(normalizedSessionId);
      if (!synced) {
        logger.warn('Review Semantic tab declined session focus request', {
          customId: runtime.customId,
          title: runtime.title,
          sessionId: normalizedSessionId,
        });
        return 'failed';
      }

      if (options?.focus !== false && !this.focusReviewTab(runtime)) {
        return 'failed';
      }

      runtime.lastActiveAt = Date.now();
      return 'synced';
    } catch (error) {
      logger.error('Failed to focus Review Semantic session', {
        customId: runtime.customId,
        title: runtime.title,
        sessionId: normalizedSessionId,
        error,
      });
      return 'failed';
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
    const currentData = this.normalizeReviewTabData(runtime.data);
    const nextData: ReviewTabData = {
      ...baseData,
      reviewState: normalizeReviewTabRuntimeState(reviewState),
      neuralRoamTemporaryEngineModeTouched: currentData.neuralRoamTemporaryEngineModeTouched === true
        || baseData.neuralRoamTemporaryEngineModeTouched === true,
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

  private markNeuralRoamTemporaryEngineModeTouched(
    runtime: TabRuntimeContext,
    baseData: ReviewTabData,
  ): void {
    const nextData: ReviewTabData = {
      ...baseData,
      neuralRoamTemporaryEngineModeTouched: true,
    };
    runtime.data = nextData;
    const tabModel = runtime.tab?.model as { data?: ReviewTabData } | undefined;
    if (tabModel) {
      tabModel.data = nextData;
    }
  }

  private restoreTemporaryNeuralRoamEngineModeIfNeeded(data: ReviewTabData | null): void {
    const start = data?.neuralRoamStartFromFocus;
    const isTemporary = typeof start?.entrySessionKind === 'string'
      && start.entrySessionKind.startsWith('temporary-');
    const previousMode = start?.previousEngineMode;
    if (!isTemporary || data?.neuralRoamTemporaryEngineModeTouched === true || (previousMode !== 'orbit' && previousMode !== 'hyperspace')) {
      return;
    }

    const queue = this.context.getUnifiedDataSourceManager().getQueue(QueueType.NeuralRoam) as {
      getEngineMode?: () => string;
      setBackendViewState?: (viewState: unknown) => void;
    };
    const neuralManager = this.context.getUnifiedDataSourceManager();
    const command = neuralManager.neuralRoamCommand.bind(neuralManager);
    if (typeof command !== 'function') {
      return;
    }
    if (typeof queue.getEngineMode === 'function' && queue.getEngineMode() === previousMode) {
      return;
    }
    void command({
      queueType: 'neural-roam',
      command: {
        type: 'switch-engine-mode',
        mode: previousMode,
        carryCurrentNode: true,
      },
    }).then((result) => {
      if (result.queueState && typeof queue?.setBackendViewState === 'function') {
        queue.setBackendViewState(result.viewState ?? null);
      }
    }).catch((error) => {
      logger.warn('Failed to restore temporary NeuralRoam engine mode on tab close', {
        previousMode,
        error,
      });
    });
  }

  private buildReviewTabTransferStateKey(transferState?: ReviewTabTransferState | null): string {
    if (!transferState) {
      return '';
    }

    if (transferState.kind === 'static-subset-session') {
      return JSON.stringify({
        kind: transferState.kind,
        queueType: transferState.queueType,
        blockIds: transferState.blockIds,
        cardIds: transferState.cardIds ?? [],
        preferredCardId: transferState.preferredCardId ?? '',
      });
    }

    return JSON.stringify({
      kind: transferState.kind,
      filter: transferState.filterSession.filter,
      visibleCardIds: transferState.filterSession.visibleCardIds ?? [],
    });
  }

  private buildReviewTabSurfaceSnapshotKey(data: Pick<ReviewTabData, 'providerId' | 'queueType' | 'title' | 'headerVariant' | 'sharedReviewSessionId' | 'transferState'>): string {
    const presentationKeyParts = buildReviewPresentationSnapshotKeyParts({
      surfaceKind: 'tab',
      queueType: data.queueType,
      headerVariant: data.headerVariant,
      title: data.title,
      scopeFingerprint: this.buildReviewTabTransferStateKey(data.transferState),
    });
    return [
      String(data.sharedReviewSessionId || '').trim(),
      String(data.providerId || '').trim(),
      ...presentationKeyParts,
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

  private isReviewStateCompatibleWithStaticSubset(
    transferState: Extract<ReviewTabTransferState, { kind: 'static-subset-session' }>,
    reviewState: ReviewTabRuntimeState | null | undefined,
  ): boolean {
    if (!this.hasRenderableReviewRuntimeState(reviewState)) {
      return true;
    }

    const expectedCardIds = new Set((transferState.cardIds ?? []).map((id) => String(id || '').trim()).filter(Boolean));
    const expectedBlockIds = new Set((transferState.blockIds ?? []).map((id) => String(id || '').trim()).filter(Boolean));
    const currentCardId = String(reviewState?.currentCardId || '').trim();
    const currentBlockId = String(reviewState?.currentBlockId || '').trim();
    const currentItem = isRecord(reviewState?.queueSnapshot?.currentItem)
      ? reviewState.queueSnapshot.currentItem
      : null;
    const currentItemCardId = String(currentItem?.id || '').trim();
    const currentItemBlockId = String(currentItem?.blockId || '').trim();

    if (expectedCardIds.size > 0) {
      const candidateCardIds = [currentCardId, currentItemCardId].filter(Boolean);
      if (candidateCardIds.some((id) => !expectedCardIds.has(id))) {
        return false;
      }

      const cachedCards = Array.isArray(reviewState?.queueSnapshot?.cachedCards)
        ? reviewState.queueSnapshot.cachedCards
        : [];
      return cachedCards.every((card) => {
        if (!isRecord(card)) {
          return true;
        }
        const cardId = String(card.id || '').trim();
        return !cardId || expectedCardIds.has(cardId);
      });
    }

    if (expectedBlockIds.size > 0) {
      const candidateBlockIds = [currentBlockId, currentItemBlockId].filter(Boolean);
      if (candidateBlockIds.some((id) => !expectedBlockIds.has(id))) {
        return false;
      }

      const cachedCards = Array.isArray(reviewState?.queueSnapshot?.cachedCards)
        ? reviewState.queueSnapshot.cachedCards
        : [];
      return cachedCards.every((card) => {
        if (!isRecord(card)) {
          return true;
        }
        const blockId = String(card.blockId || '').trim();
        return !blockId || expectedBlockIds.has(blockId);
      });
    }

    return true;
  }

  private sanitizeReviewTabDataForTransferState(data: ReviewTabData): ReviewTabData {
    if (data.transferState?.kind !== 'static-subset-session') {
      return data;
    }

    if (this.isReviewStateCompatibleWithStaticSubset(data.transferState, data.reviewState)) {
      return data;
    }

    logger.warn('Dropping stale review tab state because it does not match the static subset transfer scope', {
      queueType: data.queueType,
      headerVariant: data.headerVariant,
      title: data.title,
      transferCardCount: data.transferState.cardIds?.length ?? 0,
      transferBlockCount: data.transferState.blockIds.length,
      currentCardId: data.reviewState?.currentCardId ?? null,
      currentBlockId: data.reviewState?.currentBlockId ?? null,
    });

    return {
      ...data,
      reviewState: null,
    };
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
      transferStateKey: this.buildReviewTabTransferStateKey(data.transferState),
      reviewState: normalizedRuntimeState,
      updatedAt: Date.now(),
    });
  }

  private recoverReviewTabData(
    data: ReviewTabData,
    runtimeId?: string | null,
  ): ReviewTabData {
    const sanitizedData = this.sanitizeReviewTabDataForTransferState(data);
    if (this.hasRenderableReviewRuntimeState(sanitizedData.reviewState)) {
      return sanitizedData;
    }
    if (sanitizedData.suppressSnapshotRecovery === true) {
      return sanitizedData;
    }

    const snapshotKey = this.buildReviewTabSurfaceSnapshotKey(sanitizedData);
    const snapshot = this.reviewTabSurfaceSnapshots.get(snapshotKey);
    if (!snapshot?.reviewState || !this.hasRenderableReviewRuntimeState(snapshot.reviewState)) {
      return sanitizedData;
    }

    const normalizedRuntimeId = String(runtimeId || '').trim();
    if (normalizedRuntimeId && snapshot.customId && snapshot.customId === normalizedRuntimeId) {
      return sanitizedData;
    }

    if (Date.now() - snapshot.updatedAt > 10 * 60 * 1000) {
      return sanitizedData;
    }

    return {
      ...sanitizedData,
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
    this.restoreTemporaryNeuralRoamEngineModeIfNeeded(this.normalizeReviewTabData(existing.custom.data));
    existing.removeActivityListeners();
    this.reviewTabRuntimes.delete(normalizedId);
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
      this.context.getSrsBackendClient()?.requestReviewTruthFlush('review-exit');
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

  private resolveReviewTabData(options: ReviewTabOptions): ReviewTabData {
    const queueType = this.normalizeQueueType(options.queue?.getType?.(), options.provider?.id);
    const reviewState = normalizeReviewTabRuntimeState(options.reviewState);
    return {
      providerId: this.resolveProviderId(options),
      title: String(options.title || this.getDefaultReviewTitle()),
      queueType,
      headerVariant: options.headerVariant || resolveReviewPresentationHeaderVariant(queueType),
      sharedReviewSessionId: normalizeSharedReviewSessionId(
        options.sharedReviewSessionId ?? reviewState?.sharedReviewSessionId,
      ),
      transferState: normalizeReviewTabTransferState(options.transferState),
      reviewState,
      suppressSnapshotRecovery: options.suppressSnapshotRecovery === true,
      neuralRoamStartFromFocus: normalizeNeuralRoamStartFromFocus(options.neuralRoamStartFromFocus),
      neuralRoamTemporaryEngineModeTouched: options.neuralRoamStartFromFocus?.previousEngineMode
        ? false
        : options.neuralRoamStartFromFocus?.entrySessionKind?.startsWith('temporary-') === true
          ? false
          : undefined,
      initialSemanticPinnedSessionId: normalizeOptionalId(options.initialSemanticPinnedSessionId),
    };
  }

  private async reuseExistingNeuralReviewSurface(options?: {
    fallbackNodeId?: string | null;
  }): Promise<NeuralReviewSurfaceSyncResult> {
    const existing = this.getLatestNeuralReviewTabRuntime();
    if (!existing) {
      return 'missing';
    }
    if (!existing.bridge || typeof existing.bridge.syncToNeuralQueueCurrentNode !== 'function') {
      return this.focusReviewTab(existing) ? 'synced' : 'failed';
    }

    try {
      const synced = await existing.bridge.syncToNeuralQueueCurrentNode(options?.fallbackNodeId ?? null);
      if (!synced) {
        return 'failed';
      }
      return this.focusReviewTab(existing) ? 'synced' : 'failed';
    } catch (error) {
      logger.error('Failed to reuse existing NeuralRoam review surface', {
        customId: existing.customId,
        title: existing.title,
        error,
      });
      return 'failed';
    }
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
        : resolveReviewPresentationHeaderVariant(queueType),
      sharedReviewSessionId: normalizeSharedReviewSessionId(
        data?.sharedReviewSessionId ?? reviewState?.sharedReviewSessionId,
      ),
      transferState: normalizeReviewTabTransferState(data?.transferState),
      reviewState,
      suppressSnapshotRecovery: data?.suppressSnapshotRecovery === true,
      neuralRoamStartFromFocus: normalizeNeuralRoamStartFromFocus(data?.neuralRoamStartFromFocus),
      neuralRoamTemporaryEngineModeTouched: data?.neuralRoamTemporaryEngineModeTouched === true,
      initialSemanticPinnedSessionId: normalizeOptionalId(data?.initialSemanticPinnedSessionId),
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

  private buildReviewQueueFromTabData(data: ReviewTabData): UnifiedQueueStrategy {
    const transferredQueue = this.buildTransferredReviewQueue(data.transferState);
    const strategy = new UnifiedQueueStrategy(
      transferredQueue ?? data.queueType,
      this.context.getUnifiedDataSourceManager(),
      this.context.getEventBus(),
      this.context.getSchedulerRouter() as unknown as ISchedulerRouter,
      this.createCdfLiveRelationReviewOpenRefresher(),
    );
    strategy.restoreSessionSnapshot?.(data.reviewState?.queueSnapshot);
    strategy.startNeuralRoamFromFocusOnNextAdvance?.(data.neuralRoamStartFromFocus);
    return strategy;
  }

  private createCdfLiveRelationReviewOpenRefresher(): CdfLiveRelationReviewOpenRefresher {
    const reviewService = this.context.getReviewService();
    return {
      refreshCdfLiveRelationOnOpen: (card) => reviewService.refreshCdfLiveRelationOnOpen(card),
    };
  }

  private buildTransferredReviewQueue(transferState?: ReviewTabTransferState | null): IReviewQueue | null {
    if (!transferState) {
      return null;
    }

    if (transferState.kind === 'static-subset-session') {
      const manager = this.context.getUnifiedDataSourceManager();
      const options = {
        cardIds: transferState.cardIds,
        preferredCardId: transferState.preferredCardId,
      };
      if (transferState.queueType === QueueType.FinalDrill) {
        return new TemporaryDrillQueue(manager, transferState.blockIds, options);
      }
      return new SubsetReviewQueue(manager, transferState.blockIds, options);
    }

    if (transferState.kind !== 'filter-group-session') {
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
      if (tabData.queueType === QueueType.NeuralRoam && tabOpenOptions.removeCurrentTab !== true) {
        const reused = await this.reuseExistingNeuralReviewSurface({
          fallbackNodeId: tabData.neuralRoamStartFromFocus?.blockId ?? null,
        });
        if (reused !== 'missing') {
          return;
        }
      }
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
      if (tabData.queueType === QueueType.NeuralRoam) {
        const reused = await this.reuseExistingNeuralReviewSurface({
          fallbackNodeId: tabData.neuralRoamStartFromFocus?.blockId ?? null,
        });
        if (reused !== 'missing') {
          return;
        }
      }
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
