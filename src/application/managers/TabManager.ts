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
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { ReviewView } from '@/ui/review/v2';
import type { ApplicationContext } from '../ApplicationContext';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import type { IAdapter, ReviewHeaderVariant, ReviewViewTabBridge } from '@/ui/review/v2/types';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import { QueueType } from '@/types/unified-data-source';
import type { ISchedulerRouter } from '@/application/interfaces/ISchedulerRouter';
import { resolveReviewHeaderVariant } from '@/ui/review/v2/types';
import { createLogger } from '@/utils/logger';
import type { BrowserOpenState } from '@/ui/browser/types';

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
}

interface BrowserTabData {
  initialState?: BrowserOpenState | null;
}

type TabRuntimeContext = Custom & {
  vueApp?: VueApp<Element>;
};

interface ReviewTabRuntimeHandle {
  customId: string;
  queueType: QueueType | null;
  title: string;
  custom: TabRuntimeContext;
  bridge: ReviewViewTabBridge | null;
  lastActiveAt: number;
  removeActivityListeners: () => void;
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
  private readonly siyuanApi: ManagerSiyuanPort;
  private tabsRegistered = false;
  private readonly reviewTabRuntimes = new Map<string, ReviewTabRuntimeHandle>();

  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    ports?: { siyuanApi?: ManagerSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new ManagerSiyuanAdapter();
    this.TAB_TYPE = this.plugin.name + '-browser';
    this.REVIEW_TAB_TYPE = this.plugin.name + '-review';
  }

  registerAll(): void {
    if (this.tabsRegistered) {
      return;
    }
    this.tabsRegistered = true;
    this.registerBrowserTab();
    this.registerReviewTab();
  }

  private registerBrowserTab(): void {
    const self = this;

    this.plugin.addTab({
      type: this.TAB_TYPE,
      init() {
        const runtime = this as unknown as TabRuntimeContext;
        const data = self.normalizeBrowserTabData(runtime.data);
        const app = createApp(SRSBrowser, {
          app: self.plugin.app,
          i18n: self.context.getI18n() || {},
          mode: 'tab',
          plugin: self.plugin,
          initialOpenState: data.initialState ?? null,
        });
        app.mount(runtime.element);
        runtime.vueApp = app;
      },
      destroy() {
        const runtime = this as unknown as TabRuntimeContext;
        runtime.vueApp?.unmount();
        runtime.vueApp = undefined;
      },
    });
  }

  private registerReviewTab(): void {
    const self = this;

    this.plugin.addTab({
      type: this.REVIEW_TAB_TYPE,
      init() {
        const runtime = this as unknown as TabRuntimeContext;
        const data = self.normalizeReviewTabData(runtime.data);
        logger.info('Restoring review tab', {
          providerId: data.providerId,
          queueType: data.queueType,
          headerVariant: data.headerVariant,
          title: data.title,
        });

        const queue = self.buildReviewQueue(data.queueType);
        const adapter = new UnifiedReviewAdapter({
          i18n: self.getPluginI18n(),
          headerVariant: data.headerVariant,
          progressiveExcerptEnabled: self.context.getSettingsService().getSettings().progressiveReading?.altXExcerptEnabled === true,
        });

        const app = createApp(ReviewView, {
          app: self.plugin.app,
          i18n: self.getPluginI18n(),
          mode: 'tab',
          title: data.title,
          headerVariant: data.headerVariant,
          queue,
          adapter,
          plugin: self.plugin,
        });

        const vm = app.mount(runtime.element);
        runtime.vueApp = app;
        self.registerReviewTabRuntime(runtime, data, self.resolveReviewViewBridge(vm));
      },
      destroy() {
        const runtime = this as unknown as TabRuntimeContext;
        self.unregisterReviewTabRuntime(runtime);
        runtime.vueApp?.unmount();
        runtime.vueApp = undefined;
      },
    });
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
      position: 'right',
      keepCursor: false,
      removeCurrentTab: false,
    });
  }

  openReviewTabInNewTab(options: ReviewTabOptions): void {
    void this.openReviewTabInternal(options, {
      keepCursor: false,
      removeCurrentTab: false,
    });
  }

  openReviewInNewWindow(options: ReviewTabOptions): void {
    if (!this.canOpenInNewWindow()) {
      logger.warn('New window is not supported in current runtime, opening tab instead');
      this.openReviewTab(options);
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
      removeActivityListeners: () => {
        detachFns.forEach((detach) => detach());
      },
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

  private resolveReviewTabData(options: ReviewTabOptions): ReviewTabData {
    const queueType = this.normalizeQueueType(options.queue?.getType?.(), options.provider?.id);
    return {
      providerId: this.resolveProviderId(options),
      title: String(options.title || this.getDefaultReviewTitle()),
      queueType,
      headerVariant: options.headerVariant || resolveReviewHeaderVariant(queueType),
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

    return {
      providerId,
      title,
      queueType,
      headerVariant: typeof data?.headerVariant === 'string'
        ? data.headerVariant
        : resolveReviewHeaderVariant(queueType),
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
        position: tabOpenOptions.position,
        keepCursor: tabOpenOptions.keepCursor,
        removeCurrentTab: tabOpenOptions.removeCurrentTab,
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
