/**
 * TabManager - tab registration and opening.
 *
 * This manager keeps the review-tab path deterministic:
 * - open tab with serializable tab data only
 * - restore queue/adapter from current architecture on init
 */

import type { Plugin } from 'siyuan';
import { openTab, Constants } from 'siyuan';
import { createApp, type App as VueApp } from 'vue';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { ReviewView } from '@/ui/review/v2';
import type { ApplicationContext } from '../ApplicationContext';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import type { QueueProvider } from '@/core/extensions/QueueProvider';
import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { IAdapter } from '@/ui/review/v2/types';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import { QueueType } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
/// #if !BROWSER
import { ipcRenderer } from 'electron';
/// #endif

const logger = createLogger('TabManager');

type ReviewProviderRef = Pick<QueueProvider<unknown>, 'id'>;
type ReviewQueueRef = Pick<IQueueStrategy<unknown>, 'getType'>;

interface ReviewTabData {
  providerId: string;
  title: string;
  queueType: QueueType | null;
}

interface TabRuntimeContext {
  element: HTMLElement;
  data?: Partial<ReviewTabData>;
  vueApp?: VueApp<Element>;
}

type PluginWithI18n = Plugin & {
  i18n?: Record<string, string>;
};

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
}

interface ReviewTabOpenOptions {
  position?: 'right' | 'bottom';
  keepCursor?: boolean;
  removeCurrentTab?: boolean;
}

export class TabManager {
  private readonly TAB_TYPE: string;
  private readonly REVIEW_TAB_TYPE: string;
  private readonly siyuanApi: ManagerSiyuanPort;
  private tabsRegistered = false;

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
      init(this: TabRuntimeContext) {
        const app = createApp(SRSBrowser, {
          app: self.plugin.app,
          i18n: self.context.getI18n() || {},
          mode: 'tab',
          plugin: self.plugin,
        });
        app.mount(this.element);
        this.vueApp = app;
      },
      destroy(this: TabRuntimeContext) {
        this.vueApp?.unmount();
        this.vueApp = undefined;
      },
    });
  }

  private registerReviewTab(): void {
    const self = this;

    this.plugin.addTab({
      type: this.REVIEW_TAB_TYPE,
      init(this: TabRuntimeContext) {
        const data = self.normalizeReviewTabData(this.data);
        logger.info('Restoring review tab', {
          providerId: data.providerId,
          queueType: data.queueType,
          title: data.title,
        });

        const queue = self.buildReviewQueue(data.queueType);
        const adapter = new UnifiedReviewAdapter({ i18n: self.getPluginI18n() });

        const app = createApp(ReviewView, {
          app: self.plugin.app,
          i18n: self.getPluginI18n(),
          mode: 'tab',
          title: data.title,
          queue,
          adapter,
          plugin: self.plugin,
        });

        app.mount(this.element);
        this.vueApp = app;
      },
      destroy(this: TabRuntimeContext) {
        this.vueApp?.unmount();
        this.vueApp = undefined;
      },
    });
  }

  openBrowserTab(): void {
    openTab({
      app: this.plugin.app,
      custom: {
        icon: 'iconCard',
        title: this.context.getI18n()?.srsBrowser || 'SRS Browser',
        id: this.plugin.name + this.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
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

  private getPluginI18n(): Record<string, string> {
    const candidate = (this.plugin as PluginWithI18n).i18n;
    return candidate && typeof candidate === 'object' ? candidate : {};
  }

  private getDefaultReviewTitle(): string {
    return this.context.getI18n()?.reviewTitle || 'Review';
  }

  private resolveReviewTabData(options: ReviewTabOptions): ReviewTabData {
    const queueType = this.normalizeQueueType(options.queue?.getType?.(), options.provider?.id);
    return {
      providerId: this.resolveProviderId(options),
      title: String(options.title || this.getDefaultReviewTitle()),
      queueType,
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
      this.context.getSchedulerRouter()
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

  private canOpenInNewWindow(): boolean {
    return typeof ipcRenderer !== 'undefined' && typeof ipcRenderer.send === 'function';
  }

  private async openReviewTabInternal(
    options: ReviewTabOptions,
    tabOpenOptions: ReviewTabOpenOptions
  ): Promise<void> {
    try {
      const tabData = this.resolveReviewTabData(options);
      const prepare = this.prepareQueueBeforeOpen(tabData.queueType);
      if (prepare) {
        await prepare;
      }

      openTab({
        app: this.plugin.app,
        custom: {
          icon: 'iconSiyuanMemo',
          title: tabData.title,
          id: this.plugin.name + this.REVIEW_TAB_TYPE,
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
      const tabData = this.resolveReviewTabData(options);
      const prepare = this.prepareQueueBeforeOpen(tabData.queueType);
      if (prepare) {
        await prepare;
      }

      const json = [
        {
          title: tabData.title,
          icon: 'iconSiyuanMemo',
          instance: 'Tab',
          children: {
            instance: 'Custom',
            customModelType: this.REVIEW_TAB_TYPE,
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
