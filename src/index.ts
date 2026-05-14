/**
 * FSRS Plugin Entry - 简化版（< 200 行）
 * 职责：插件生命周期、UI 事件路由、最小胶水代码
 * 
 * @implements {IPluginFacade}
 */

import { Plugin, getFrontend, showMessage, type IProtyle } from 'siyuan';
import { pushErrMsg, pushMsg } from '@/infrastructure/siyuan/api';
import { ApplicationContext } from '@/application/ApplicationContext';
import type { IPluginFacade } from '@/application/interfaces/IPluginFacade';
import type { TabRuntimeContext } from '@/application/managers/TabManager';
import { ConfigMigrator } from '@/utils/configMigrator';
import { createLogger } from '@/utils/logger';
import type { RiffIntegrationConfig } from '@/types/settings';
import { FormulaClozeAssistant } from '@/application/handlers/FormulaClozeAssistant';
import { ImageOcclusionHandler } from '@/application/handlers/ImageOcclusionHandler';
import { ProgressiveExcerptHotkeyHandler } from '@/application/handlers/ProgressiveExcerptHotkeyHandler';
import {
  dispatchReviewCommandRequest,
  REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
  REVIEW_SET_PRIORITY_REQUEST_EVENT,
  REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT,
} from '@/application/handlers/ReviewCommandRequestEvents';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import {
  CORE_REVIEW_ENTRY_DEFINITIONS,
  type CoreReviewEntryActionId,
} from '@/application/entries/CoreReviewEntryRegistry';
import {
  TOPBAR_QUICK_ENTRY_DEFINITIONS,
  getTopBarQuickEntryDefinition,
  type TopBarQuickEntryActionId,
} from '@/application/entries/TopBarQuickEntryRegistry';
import { ensureSiyuanMenuComponentFallbacks } from '@/utils/siyuanMenuComponentFallbacks';
import {
  initializeRuntimePerformanceDiagnosticsFromSession,
  installRuntimePerformanceDiagnosticsGlobal,
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import '@/index.scss';
import '@/ui/shared/siyuanmemo-admin-skin.scss';

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  settled: boolean;
};

type BootstrappedTabRuntimeContext = TabRuntimeContext & {
  __siyuanMemoBootstrap?: {
    abortController: AbortController;
    initPromise: Promise<void>;
    mounted: boolean;
  };
};

function createDeferredValue<T>(): DeferredValue<T> {
  let resolveFn!: (value: T | PromiseLike<T>) => void;
  let rejectFn!: (reason?: unknown) => void;
  const deferred: DeferredValue<T> = {
    promise: new Promise<T>((resolve, reject) => {
      resolveFn = (value) => {
        if (deferred.settled) {
          return;
        }
        deferred.settled = true;
        resolve(value);
      };
      rejectFn = (reason) => {
        if (deferred.settled) {
          return;
        }
        deferred.settled = true;
        reject(reason);
      };
    }),
    resolve: (value) => resolveFn(value),
    reject: (reason) => rejectFn(reason),
    settled: false,
  };
  return deferred;
}

export default class FSRSPlugin extends Plugin implements IPluginFacade {
  public isMobile: boolean = false;
  public isBrowser: boolean = false;
  private context?: ApplicationContext;
  private readonly logger = createLogger('Plugin');
  private readonly mobileSidebarEntryId = 'siyuanmemo-mobile-review-entry';
  private readonly mobileSidebarToolbarEntryType = 'sidebar-siyuanmemo-tab';
  private readonly mobileSidebarToolbarPanelType = 'sidebar-siyuanmemo';
  private readonly legacyMobileSidebarToolbarEntryType = 'sidebar-siyuanmemo-review-tab';
  private mobileSidebarEntryClickHandler: ((ev: MouseEvent) => void) | null = null;
  private mobileMenuObserver: MutationObserver | null = null;
  private mobileMenuEnsureQueued = false;
  private mobileSidebarToolbarObserver: MutationObserver | null = null;
  private mobileSidebarToolbarEnsureQueued = false;
  private mobileSidebarToolbarEntryClickHandler: ((ev: MouseEvent) => void) | null = null;
  private formulaClozeAssistant: FormulaClozeAssistant | null = null;
  private imageOcclusionHandler: ImageOcclusionHandler | null = null;
  private progressiveExcerptHotkeyHandler: ProgressiveExcerptHotkeyHandler | null = null;
  private readonly topBarQuickSlashIds = TOPBAR_QUICK_ENTRY_DEFINITIONS.map((definition) => definition.slashId);
  private readonly coreReviewSlashIds = CORE_REVIEW_ENTRY_DEFINITIONS.map((definition) => definition.slashId);
  private readonly blockToolSlashIds = [
    'siyuanmemo-block-tool-edit-srs-data',
    'siyuanmemo-block-tool-rebind-descriptor-concept',
  ];

  // ========================================================================
  // IPluginFacade 实现
  // ========================================================================
  
  /**
   * 获取应用上下文
   * 
   * 推荐使用此方法访问所有应用服务。
   * 
   * @returns 应用上下文实例
   */
  getContext(): ApplicationContext {
    if (!this.context) {
      throw new Error('ApplicationContext is not ready');
    }
    return this.context;
  }
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认打开的标签页（可选）
   */
  openSettings(defaultTab?: string): void {
    this.getContext().getDialogManager()?.openSettingsDialog(defaultTab);
  }

  openSRSBrowser(): void {
    this.getContext().getDialogManager()?.openBrowserDialog();
  }

  /**
   * 打开子集复习对话框
   *
   * 供浏览器右键菜单「选中复习」使用。
   */
  async openSubsetReviewDialog(
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    }
  ): Promise<void> {
    await this.getContext().getDialogManager()?.openSubsetReviewDialog(blockIds, options);
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   */
  async getDueCount(): Promise<number> {
    const cardService = this.getContext().getCardService();
    return await cardService.getDueCount();
  }
  
  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;
  private isUninstalling = false;
  private customTabsRegistered = false;
  private contextReady = createDeferredValue<ApplicationContext>();

  private static readonly LOCAL_DATA_FILES_TO_REMOVE = [
    'unified-cards.msgpack',
    'unified-cards.json',
    'queues.msgpack',
    'queues.json',
    'cards.msgpack',
    'cards.json',
    'settings.json',
    'xiuyuan.msgpack',
    'reschedule-configs.json',
    'riff-blacklist.msgpack',
    'riff-blacklist.json',
    'practice-queue.msgpack',
    'practice-queue.json',
    'practice-queue-backup.msgpack',
    'incremental-learning-queue.msgpack',
    'incremental-learning-queue.json',
    'queue-final-drill.json',
    'queue-retrieval-practice.json',
    'queue-neural-roam.json',
    'queue-incremental-learning.json',
    'review-v2-final-drill.json',
    'queue-final-drill.backup.json',
    'queue-retrieval-practice.backup.json',
    'queue-neural-roam.backup.json',
    'queue-incremental-learning.backup.json',
  ] as const;

  async onload() {
    this.logger.info('Plugin loading...');
    installRuntimePerformanceDiagnosticsGlobal();
    initializeRuntimePerformanceDiagnosticsFromSession();
    const finishOnloadSpan = startRuntimePerformanceSpan('startup', 'plugin.onload');
    this.isInitialized = false;
    this.context = undefined;
    this.contextReady = createDeferredValue<ApplicationContext>();
    measureRuntimePerformance('startup', 'plugin.register-custom-tabs', () => this.registerCustomTabs());

    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');
    const patchedMenuFallbacks = measureRuntimePerformance(
      'startup',
      'plugin.ensure-menu-fallbacks',
      () => ensureSiyuanMenuComponentFallbacks(),
      { frontend: frontEnd },
    );
    if (patchedMenuFallbacks.length > 0) {
      this.logger.info('Installed menu component fallbacks:', patchedMenuFallbacks);
    }
    measureRuntimePerformance('startup', 'plugin.setup-topbar', () => this.setupTopBar(), { frontend: frontEnd });
    this.startMobileMenuObserver();
    this.startMobileSidebarToolbarObserver();
    this.formulaClozeAssistant = new FormulaClozeAssistant(this);
    measureRuntimePerformance('startup', 'plugin.formula-cloze.start', () => this.formulaClozeAssistant?.start(), {
      frontend: frontEnd,
    });

    try {
      this.context = await measureRuntimePerformance(
        'startup',
        'application-context.create',
        () => ApplicationContext.create({ plugin: this, i18n: this.i18n || {}, frontendKind: frontEnd }),
        { frontend: frontEnd },
      );
      this.contextReady.resolve(this.getContext());
      await measureRuntimePerformance(
        'startup',
        'plugin.config-migrations',
        () => this.performConfigMigrations(),
        { frontend: frontEnd },
      );
      this.isInitialized = true;
      
      // ✅ 只有在初始化成功后才注册事件处理器
      this.imageOcclusionHandler = new ImageOcclusionHandler(this);
      this.progressiveExcerptHotkeyHandler = new ProgressiveExcerptHotkeyHandler(this.getContext());
      measureRuntimePerformance('startup', 'plugin.register-runtime-handlers', () => {
        this.registerDock();
        this.registerEventHandlers();
        this.registerProgressiveExcerptCommand();
        this.registerProgressiveItemCommand();
        this.registerTopBarQuickCommands();
        if (this.shouldExposeCoreReviewContextEntries()) {
          this.registerCoreReviewCommands();
        }
        this.registerBlockToolCommands();
        this.registerTopBarQuickSlash();
        if (this.shouldExposeCoreReviewContextEntries()) {
          this.registerCoreReviewSlash();
        }
        this.registerBlockToolSlash();
      }, { frontend: frontEnd });
    } catch (err) {
      this.contextReady.reject(err);
      this.context = undefined;
      this.logger.error('Plugin initialization failed:', err);
      try { await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败'); } catch {}
      // ❌ 初始化失败时不注册事件处理器
      this.formulaClozeAssistant?.stop();
      this.formulaClozeAssistant = null;
      this.progressiveExcerptHotkeyHandler?.stop();
      this.progressiveExcerptHotkeyHandler = null;
      finishOnloadSpan({ frontend: frontEnd, status: 'failed' }, {
        ok: false,
        errorName: err instanceof Error ? err.name : 'Error',
      });
      return;
    }

    // ❌ 移除全局状态（Phase 3: DDD 重构）
    // 不再将插件实例暴露到全局，使用依赖注入代替
    // window.siyuanMemoPlugin = this;
    
    this.logger.info('Plugin loaded successfully');
    finishOnloadSpan({
      frontend: frontEnd,
      isBrowser: this.isBrowser,
      isMobile: this.isMobile,
      status: 'loaded',
    });
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
    this.scheduleMobileMenuEnsure();
    this.scheduleMobileSidebarToolbarEnsure();
  }

  onunload() {
    this.contextReady.reject(new Error('Plugin unloading'));
    this.customTabsRegistered = false;
    const context = this.context;
    this.context = undefined;
    if (this.topBarElement && this.topBarContextMenuHandler) {
      this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
    }
    this.stopMobileMenuObserver();
    this.removeMobileSidebarEntry();
    this.stopMobileSidebarToolbarObserver();
    this.removeMobileSidebarToolbarEntry();
    this.unregisterTopBarQuickSlash();
    if (this.shouldExposeCoreReviewContextEntries()) {
      this.unregisterCoreReviewSlash();
    }
    this.unregisterBlockToolSlash();
    this.formulaClozeAssistant?.stop();
    this.formulaClozeAssistant = null;
    this.progressiveExcerptHotkeyHandler?.stop();
    this.progressiveExcerptHotkeyHandler = null;
    this.imageOcclusionHandler?.dispose();
    this.imageOcclusionHandler = null;
    if (context) {
      context.dispose({ persistStorage: false })
        .catch(err => this.logger.error('Error disposing context:', err))
        .finally(() => {
          if (this.isUninstalling) {
            void this.cleanupLocalDataFiles();
          }
        });
    } else if (this.isUninstalling) {
      void this.cleanupLocalDataFiles();
    }
  }

  async uninstall(): Promise<void> {
    this.isUninstalling = true;
    await this.cleanupLocalDataFiles();
  }

  private async cleanupLocalDataFiles(): Promise<void> {
    const tasks = FSRSPlugin.LOCAL_DATA_FILES_TO_REMOVE.map((file) =>
      this.removeData(file).catch((error) => {
        this.logger.debug('[uninstall] removeData skipped/failed:', { file, error });
      })
    );
    await Promise.all(tasks);
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private setupTopBar() {
    this.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><symbol id="iconSiyuanMemo" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/></symbol></svg>`);
    this.topBarElement = this.addTopBar({
      icon: 'iconSiyuanMemo',
      title: this.i18n?.topbarTitle || '间隔重复系统',
      position: 'right',
      callback: () => {
        if (!this.isInitialized) { pushMsg(this.i18n?.loading || '插件初始化中...'); return; }
        const dialogManager = this.getContext().getDialogManager();
        if (this.isMobile) {
          void dialogManager?.openMobileQueueLauncherDialog();
          return;
        }
        dialogManager?.openBrowserDialog();
      },
    });
    this.topBarElement?.classList.add('fsrs-topbar');
    this.topBarContextMenuHandler = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();
      if (!this.isInitialized) {
        pushMsg(this.i18n?.loading || '插件初始化中...');
        return;
      }
      this.getContext().getMenuManager()?.openTopBarMenu(ev);
    };
    this.topBarElement?.addEventListener('contextmenu', this.topBarContextMenuHandler);
  }

  private registerDock() {
    this.addDock({
      config: {
        position: 'RightBottom',
        size: { width: 400, height: 500 },
        icon: 'iconCards',
        title: 'FSRS',
      },
      data: { plugin: this },
      type: 'siyuanmemo-dock',
      init: (dock) => {
        this.getContext().getDockManager().initDockPanel(
          dock.element,
          () => this.getContext().getDialogManager()?.openReviewDialog(),
          () => this.getContext().getDialogManager()?.openBrowserDialog()
        );
      },
    });
  }

  private registerEventHandlers() {
    const blockMenuHandler = this.getContext().getBlockMenuHandler();
    this.eventBus.on('click-blockicon', (e) => blockMenuHandler.handleBlockIconClick(e));
    this.eventBus.on('click-editortitleicon', (e) => blockMenuHandler.handleEditorTitleIconClick(e));
    this.eventBus.on('open-menu-content', (e) => this.progressiveExcerptHotkeyHandler?.handleContentMenu(e));
    this.eventBus.on('open-menu-breadcrumbmore', (e) => blockMenuHandler.handleBreadcrumbMore(e));
    this.eventBus.on('open-menu-doctree', (e) => blockMenuHandler.handleDocTreeMenu(e));
    this.eventBus.on('open-menu-blockref', (e) => blockMenuHandler.handleBlockRefMenu(e));
    this.eventBus.on('open-menu-image', (e) => this.imageOcclusionHandler?.handleImageMenu(e));
  }

  private registerProgressiveExcerptCommand(): void {
    this.addCommand({
      langKey: 'progressiveExcerptSelection',
      hotkey: '⌥⇧X',
      callback: () => {
        this.progressiveExcerptHotkeyHandler?.runFromCommand();
      },
      editorCallback: (protyle: IProtyle) => {
        void this.progressiveExcerptHotkeyHandler?.runFromEditor(protyle);
      },
    });
  }

  private registerProgressiveItemCommand(): void {
    this.addCommand({
      langKey: 'progressiveItemSelection',
      hotkey: '⌥⇧Z',
      callback: () => {
        this.progressiveExcerptHotkeyHandler?.runItemFromCommand();
      },
      editorCallback: (protyle: IProtyle) => {
        void this.progressiveExcerptHotkeyHandler?.runItemFromEditor(protyle);
      },
    });
  }

  private shouldExposeCoreReviewContextEntries(): boolean {
    return false;
  }

  private registerTopBarQuickCommands(): void {
    for (const definition of TOPBAR_QUICK_ENTRY_DEFINITIONS) {
      this.addCommand({
        langKey: definition.commandLangKey,
        hotkey: '',
        callback: () => {
          void this.runTopBarQuickEntryAction(definition.id);
        },
        editorCallback: (protyle: IProtyle) => {
          void this.runTopBarQuickEntryAction(definition.id, { protyle });
        },
      });
    }
  }

  private registerCoreReviewCommands(): void {
    for (const definition of CORE_REVIEW_ENTRY_DEFINITIONS) {
      this.addCommand({
        langKey: definition.commandLangKey,
        hotkey: '',
        callback: () => {
          void this.runCoreReviewEntryAction(definition.id);
        },
        editorCallback: (protyle: IProtyle) => {
          void this.runCoreReviewEntryAction(definition.id, { protyle });
        },
      });
    }
  }

  private registerBlockToolCommands(): void {
    this.addCommand({
      langKey: 'editSrsData',
      hotkey: '',
      callback: () => {
        void this.runEditSrsDataAction();
      },
      editorCallback: (protyle: IProtyle) => {
        void this.runEditSrsDataAction({ protyle });
      },
    });

    this.addCommand({
      langKey: 'rebindDescriptorConcept',
      hotkey: '',
      callback: () => {
        void this.runRebindDescriptorConceptAction();
      },
      editorCallback: (protyle: IProtyle) => {
        void this.runRebindDescriptorConceptAction({ protyle });
      },
    });

    this.addCommand({
      langKey: 'reviewSetCurrentCardPriorityCommand',
      hotkey: '',
      callback: () => {
        this.runReviewSurfaceCommandRequest(REVIEW_SET_PRIORITY_REQUEST_EVENT);
      },
    });

    this.addCommand({
      langKey: 'reviewSuspendCurrentCardCommand',
      hotkey: '',
      callback: () => {
        this.runReviewSurfaceCommandRequest(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT);
      },
    });

    this.addCommand({
      langKey: 'reviewDeleteCurrentCardCommand',
      hotkey: '',
      callback: () => {
        this.runReviewSurfaceCommandRequest(REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT);
      },
    });
  }

  private registerTopBarQuickSlash(): void {
    for (const definition of TOPBAR_QUICK_ENTRY_DEFINITIONS) {
      if (this.protyleSlash.some((item) => item.id === definition.slashId)) {
        continue;
      }

      const label = this.i18n?.[definition.commandLangKey] || definition.fallbackLabel;
      this.protyleSlash.push({
        id: definition.slashId,
        filter: definition.slashFilters,
        html: `
          <div class="b3-list-item__first">
            <svg class="b3-list-item__graphic"><use xlink:href="#${definition.icon}"></use></svg>
            <span class="b3-list-item__text">${label}</span>
          </div>
        `,
        callback: (protyle, nodeElement) => {
          void this.runTopBarQuickEntryAction(definition.id, {
            protyle,
            nodeElement,
          });
        },
      });
    }
  }

  private registerCoreReviewSlash(): void {
    for (const definition of CORE_REVIEW_ENTRY_DEFINITIONS) {
      if (this.protyleSlash.some((item) => item.id === definition.slashId)) {
        continue;
      }

      const label = this.i18n?.[definition.commandLangKey] || definition.fallbackLabel;
      this.protyleSlash.push({
        id: definition.slashId,
        filter: definition.slashFilters,
        html: `
          <div class="b3-list-item__first">
            <svg class="b3-list-item__graphic"><use xlink:href="#${definition.icon}"></use></svg>
            <span class="b3-list-item__text">${label}</span>
          </div>
        `,
        callback: (protyle, nodeElement) => {
          void this.runCoreReviewEntryAction(definition.id, {
            protyle,
            nodeElement,
          });
        },
      });
    }
  }

  private registerBlockToolSlash(): void {
    const editSrsSlashId = this.blockToolSlashIds[0];
    if (!this.protyleSlash.some((item) => item.id === editSrsSlashId)) {
      const editSrsLabel = this.i18n?.editSrsData || '编辑SRS数据';
      this.protyleSlash.push({
        id: editSrsSlashId,
        filter: ['siyuanmemo', 'edit srs', 'srs', '编辑srs', '编辑srs数据'],
        html: `
          <div class="b3-list-item__first">
            <svg class="b3-list-item__graphic"><use xlink:href="#iconEdit"></use></svg>
            <span class="b3-list-item__text">${editSrsLabel}</span>
          </div>
        `,
        callback: (protyle, nodeElement) => {
          void this.runEditSrsDataAction({
            protyle,
            nodeElement,
          });
        },
      });
    }

    const rebindSlashId = this.blockToolSlashIds[1];
    if (!this.protyleSlash.some((item) => item.id === rebindSlashId)) {
      const rebindLabel = this.i18n?.rebindDescriptorConcept || '🔄 重新绑定概念';
      this.protyleSlash.push({
        id: rebindSlashId,
        filter: ['siyuanmemo', 'rebind concept', 'descriptor concept', '重新绑定概念'],
        html: `
          <div class="b3-list-item__first">
            <svg class="b3-list-item__graphic"><use xlink:href="#iconRefresh"></use></svg>
            <span class="b3-list-item__text">${rebindLabel}</span>
          </div>
        `,
        callback: (protyle, nodeElement) => {
          void this.runRebindDescriptorConceptAction({
            protyle,
            nodeElement,
          });
        },
      });
    }
  }

  private unregisterTopBarQuickSlash(): void {
    const slashIds = new Set(this.topBarQuickSlashIds);
    this.protyleSlash = this.protyleSlash.filter((item) => !slashIds.has(item.id));
  }

  private unregisterCoreReviewSlash(): void {
    const slashIds = new Set(this.coreReviewSlashIds);
    this.protyleSlash = this.protyleSlash.filter((item) => !slashIds.has(item.id));
  }

  private unregisterBlockToolSlash(): void {
    const slashIds = new Set(this.blockToolSlashIds);
    this.protyleSlash = this.protyleSlash.filter((item) => !slashIds.has(item.id));
  }

  private async runEditSrsDataAction(
    input?: { protyle?: unknown; nodeElement?: HTMLElement | null },
  ): Promise<void> {
    const context = this.resolveCoreReviewBlockContext(input);
    if (!context) {
      return;
    }

    const blockMenuHandler = this.getContext().getBlockMenuHandler();
    await blockMenuHandler.runEditSrsDataAction(context.blockElements);
  }

  private async runRebindDescriptorConceptAction(
    input?: { protyle?: unknown; nodeElement?: HTMLElement | null },
  ): Promise<void> {
    const context = this.resolveCoreReviewBlockContext(input);
    if (!context) {
      return;
    }

    const blockMenuHandler = this.getContext().getBlockMenuHandler();
    await blockMenuHandler.runRebindDescriptorConceptAction(context.blockElements);
  }

  private async runCoreReviewEntryAction(
    actionId: CoreReviewEntryActionId,
    input?: { protyle?: unknown; nodeElement?: HTMLElement | null },
  ): Promise<void> {
    const context = this.resolveCoreReviewBlockContext(input);
    if (!context) {
      return;
    }

    const blockMenuHandler = this.getContext().getBlockMenuHandler();
    await blockMenuHandler.runCoreEntryAction(actionId, context.blockElements);
  }

  private async runTopBarQuickEntryAction(
    actionId: TopBarQuickEntryActionId,
    input?: { protyle?: unknown; nodeElement?: HTMLElement | null },
  ): Promise<void> {
    const definition = getTopBarQuickEntryDefinition(actionId);
    const docId = definition?.requiresDocContext
      ? this.extractDocIdFromProtyle(input?.protyle)
      : null;
    await this.getContext().getMenuManager().runTopBarQuickEntryAction(actionId, { docId });
  }

  private runReviewSurfaceCommandRequest(eventName: string): void {
    const handled = dispatchReviewCommandRequest(
      eventName as
        | typeof REVIEW_SET_PRIORITY_REQUEST_EVENT
        | typeof REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT
        | typeof REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
    );
    if (handled) {
      return;
    }

    showMessage(
      this.i18n?.reviewCommandRequiresOpenSurface || '请先打开复习界面',
      3000,
      'info',
    );
  }

  private resolveCoreReviewBlockContext(
    input?: { protyle?: unknown; nodeElement?: HTMLElement | null },
  ): { blockElements: HTMLElement[] } | null {
    const resolver = new BlockContextResolver({
      i18n: this.i18n || {},
      notify: (message) => {
        showMessage(message, 5000, 'info');
      },
    });

    const result = resolver.resolve({
      protyle: input?.protyle,
      nodeElement: input?.nodeElement || null,
    });
    if (!result) {
      return null;
    }

    return { blockElements: result.blockElements };
  }

  private extractDocIdFromProtyle(protyle: unknown): string | null {
    if (!protyle || typeof protyle !== 'object') {
      return null;
    }

    const rootId = this.normalizeNodeId(
      (protyle as { block?: { rootID?: string; rootId?: string } }).block?.rootID
      ?? (protyle as { block?: { rootID?: string; rootId?: string } }).block?.rootId
      ?? (protyle as { rootID?: string }).rootID
    );
    if (rootId) {
      return rootId;
    }

    // Do not fallback to block id here.
    // One-click symbol cards requires document root id; block id would make doc scan return 0.
    return null;
  }

  private normalizeNodeId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private ensureTopbarMounted(): void {
    const el = this.topBarElement;
    if (!el || el.isConnected) return;
    const container = document.querySelector('.toolbar__right') || document.querySelector('.toolbar__left');
    if (container) {
      try {
        (container as HTMLElement).appendChild(el);
        el.style.display = ''; el.style.opacity = '1'; el.style.pointerEvents = '';
      } catch (err) {
        if (!this.didWarnTopbarMount) {
          this.logger.warn('Failed to remount topbar:', err);
          this.didWarnTopbarMount = true;
        }
      }
    }
  }

  private startMobileMenuObserver(): void {
    if (!this.isMobile || this.mobileMenuObserver) {
      return;
    }

    const menuRoot = document.getElementById('menu');
    if (!menuRoot) {
      window.setTimeout(() => this.startMobileMenuObserver(), 300);
      return;
    }

    this.mobileMenuObserver = new MutationObserver(() => {
      this.scheduleMobileMenuEnsure();
    });
    this.mobileMenuObserver.observe(menuRoot, { childList: true, subtree: true });
    this.scheduleMobileMenuEnsure();
  }

  private stopMobileMenuObserver(): void {
    if (!this.mobileMenuObserver) {
      return;
    }
    this.mobileMenuObserver.disconnect();
    this.mobileMenuObserver = null;
  }

  private startMobileSidebarToolbarObserver(): void {
    if (!this.isMobile || this.mobileSidebarToolbarObserver) {
      return;
    }

    const sidebarRoot = document.getElementById('sidebar');
    if (!sidebarRoot) {
      window.setTimeout(() => this.startMobileSidebarToolbarObserver(), 300);
      return;
    }

    this.mobileSidebarToolbarObserver = new MutationObserver(() => {
      this.scheduleMobileSidebarToolbarEnsure();
    });
    this.mobileSidebarToolbarObserver.observe(sidebarRoot, { childList: true, subtree: true });
    this.scheduleMobileSidebarToolbarEnsure();
  }

  private stopMobileSidebarToolbarObserver(): void {
    if (!this.mobileSidebarToolbarObserver) {
      return;
    }
    this.mobileSidebarToolbarObserver.disconnect();
    this.mobileSidebarToolbarObserver = null;
  }

  private scheduleMobileMenuEnsure(): void {
    if (!this.isMobile || this.mobileMenuEnsureQueued) {
      return;
    }
    this.mobileMenuEnsureQueued = true;
    window.requestAnimationFrame(() => {
      this.mobileMenuEnsureQueued = false;
      this.ensureMobileSidebarEntry();
    });
  }

  private scheduleMobileSidebarToolbarEnsure(): void {
    if (!this.isMobile || this.mobileSidebarToolbarEnsureQueued) {
      return;
    }
    this.mobileSidebarToolbarEnsureQueued = true;
    window.requestAnimationFrame(() => {
      this.mobileSidebarToolbarEnsureQueued = false;
      this.ensureMobileSidebarToolbarEntry();
    });
  }

  private ensureMobileSidebarEntry(): void {
    if (!this.isMobile) {
      return;
    }

    const hasVisibleTopbarEntry = Boolean(
      this.topBarElement &&
      this.topBarElement.isConnected &&
      this.topBarElement.closest('#menu') &&
      !this.topBarElement.classList.contains('fn__none')
    );
    if (hasVisibleTopbarEntry) {
      this.removeMobileSidebarEntry();
      return;
    }

    const menuItems = document.querySelector('#menu .b3-menu__items') as HTMLElement | null;
    if (!menuItems) {
      return;
    }

    // On some clients plugin topbar can be unpinned/hidden; keep a dedicated mobile entry.
    let entry = document.getElementById(this.mobileSidebarEntryId) as HTMLElement | null;
    if (entry) {
      const label = entry.querySelector('.b3-menu__label');
      if (label) {
        label.textContent = this.i18n?.mobileReviewLauncherTitle || this.i18n?.reviewCards || '复习队列';
      }
      return;
    }

    entry = document.createElement('div');
    entry.id = this.mobileSidebarEntryId;
    entry.className = 'b3-menu__item';
    entry.setAttribute('data-menu', 'true');
    entry.innerHTML = `
      <svg class="b3-menu__icon"><use xlink:href="#iconSiyuanMemo"></use></svg>
      <span class="b3-menu__label">${this.i18n?.mobileReviewLauncherTitle || this.i18n?.reviewCards || '复习队列'}</span>
    `;

    this.mobileSidebarEntryClickHandler = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!this.isInitialized) {
        pushMsg(this.i18n?.loading || '插件初始化中...');
        return;
      }
      this.closeMobilePanel();
      void this.getContext().getDialogManager()?.openMobileQueueLauncherDialog();
    };
    entry.addEventListener('click', this.mobileSidebarEntryClickHandler);

    const riffCardEntry = document.getElementById('menuRiffCard');
    if (riffCardEntry?.parentElement === menuItems) {
      riffCardEntry.insertAdjacentElement('afterend', entry);
      return;
    }

    const pluginEntry = document.getElementById('menuPlugin');
    if (pluginEntry?.parentElement === menuItems) {
      pluginEntry.insertAdjacentElement('beforebegin', entry);
      return;
    }

    menuItems.appendChild(entry);
  }

  private removeMobileSidebarEntry(): void {
    const entry = document.getElementById(this.mobileSidebarEntryId);
    if (entry && this.mobileSidebarEntryClickHandler) {
      entry.removeEventListener('click', this.mobileSidebarEntryClickHandler);
    }
    this.mobileSidebarEntryClickHandler = null;
    entry?.remove();
  }

  private ensureMobileSidebarToolbarEntry(): void {
    if (!this.isMobile) {
      return;
    }

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      return;
    }

    const toolbar = sidebar.querySelector('.toolbar.toolbar--border') as HTMLElement | null;
    const panelContainer = sidebar.querySelector('.b3-list--mobile') as HTMLElement | null;
    if (!toolbar || !panelContainer) {
      return;
    }

    const legacyEntry = toolbar.querySelector(`[data-type="${this.legacyMobileSidebarToolbarEntryType}"]`) as HTMLElement | null;
    if (legacyEntry) {
      if (this.mobileSidebarToolbarEntryClickHandler) {
        legacyEntry.removeEventListener('click', this.mobileSidebarToolbarEntryClickHandler);
      }
      legacyEntry.remove();
    }

    const existed = toolbar.querySelector(`[data-type="${this.mobileSidebarToolbarEntryType}"]`) as HTMLElement | null;
    if (existed) {
      this.ensureMobileSidebarToolbarPanel(panelContainer);
      return;
    }

    const template = toolbar.querySelector('[data-type="sidebar-file-tab"], .toolbar__icon') as HTMLElement | null;
    let entry: HTMLElement;
    if (template) {
      entry = template.cloneNode(true) as HTMLElement;
      entry.querySelectorAll('.toolbar__icon--active').forEach((node) => {
        node.classList.remove('toolbar__icon--active');
      });
      entry.classList.remove('toolbar__icon--active');
    } else {
      entry = document.createElement('svg');
      entry.className = 'toolbar__icon';
      entry.innerHTML = '<use xlink:href="#iconSiyuanMemo"></use>';
    }

    entry.setAttribute('data-type', this.mobileSidebarToolbarEntryType);
    entry.setAttribute('aria-label', this.i18n?.mobileReviewLauncherTitle || this.i18n?.reviewCards || '复习队列');
    entry.setAttribute('data-menu', 'true');
    const useElement = entry.querySelector('use');
    if (useElement) {
      useElement.setAttribute('href', '#iconSiyuanMemo');
      useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#iconSiyuanMemo');
    } else {
      entry.innerHTML = '<use xlink:href="#iconSiyuanMemo"></use>';
    }

    this.mobileSidebarToolbarEntryClickHandler = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!this.isInitialized) {
        pushMsg(this.i18n?.loading || '插件初始化中...');
        return;
      }
      this.closeMobilePanel();
      void this.getContext().getDialogManager()?.openMobileQueueLauncherDialog();
    };
    entry.addEventListener('click', this.mobileSidebarToolbarEntryClickHandler);

    this.ensureMobileSidebarToolbarPanel(panelContainer);

    const pluginTab = toolbar.querySelector('[data-type="sidebar-plugin-tab"]');
    if (pluginTab?.parentElement === toolbar) {
      pluginTab.before(entry);
      return;
    }
    toolbar.appendChild(entry);
  }

  private removeMobileSidebarToolbarEntry(): void {
    const sidebar = document.getElementById('sidebar');
    const toolbar = sidebar?.querySelector('.toolbar.toolbar--border') as HTMLElement | null;
    const panelContainer = sidebar?.querySelector('.b3-list--mobile') as HTMLElement | null;
    const entries = [
      toolbar?.querySelector(`[data-type="${this.mobileSidebarToolbarEntryType}"]`) as HTMLElement | null,
      toolbar?.querySelector(`[data-type="${this.legacyMobileSidebarToolbarEntryType}"]`) as HTMLElement | null,
    ].filter((item): item is HTMLElement => Boolean(item));
    for (const entry of entries) {
      if (this.mobileSidebarToolbarEntryClickHandler) {
        entry.removeEventListener('click', this.mobileSidebarToolbarEntryClickHandler);
      }
      entry.remove();
    }
    this.mobileSidebarToolbarEntryClickHandler = null;
    panelContainer?.querySelector(`[data-type="${this.mobileSidebarToolbarPanelType}"]`)?.remove();
  }

  private ensureMobileSidebarToolbarPanel(panelContainer: HTMLElement): void {
    const existed = panelContainer.querySelector(`[data-type="${this.mobileSidebarToolbarPanelType}"]`) as HTMLElement | null;
    if (existed) {
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'fn__flex-column fn__none';
    panel.setAttribute('data-type', this.mobileSidebarToolbarPanelType);
    panel.style.cssText = 'height:100%;overflow:hidden';
    panel.innerHTML = `<div class="b3-list--empty">${this.i18n?.mobileReviewLauncherHint || this.i18n?.mobileReviewLauncherTitle || 'Tap to open review queue'}</div>`;
    panelContainer.appendChild(panel);
  }

  private closeMobilePanel(): void {
    const menuElement = document.getElementById('menu');
    const sidebarElement = document.getElementById('sidebar');
    const modelElement = document.getElementById('model');
    menuElement?.style && (menuElement.style.transform = '');
    sidebarElement?.style && (sidebarElement.style.transform = '');
    modelElement?.style && (modelElement.style.transform = '');

    const maskElement = document.querySelector('.side-mask') as HTMLElement | null;
    if (maskElement) {
      maskElement.classList.add('fn__none');
      maskElement.style.opacity = '';
    }

    try {
      (window as Window & { siyuan?: { menus?: { menu?: { remove?: () => void } } } })
        .siyuan?.menus?.menu?.remove?.();
    } catch {
      // noop: close panel fallback best effort
    }
  }

  private registerCustomTabs(): void {
    if (this.customTabsRegistered) {
      return;
    }
    this.customTabsRegistered = true;

    this.registerDeferredCustomTab({
      type: `${this.name}-browser`,
      resolveTitle: () => this.i18n?.srsBrowser || 'SRS Browser',
      mount: (context, runtime) => {
        context.getTabManager().initBrowserTab(runtime);
      },
      destroy: (context, runtime) => {
        context.getTabManager().destroyBrowserTab(runtime);
      },
    });

    this.registerDeferredCustomTab({
      type: `${this.name}-review`,
      resolveTitle: (runtime) => this.resolveRuntimeTitle(runtime, this.i18n?.reviewTitle || 'Review'),
      mount: (context, runtime) => {
        context.getTabManager().initReviewTab(runtime);
      },
      destroy: (context, runtime) => {
        context.getTabManager().destroyReviewTab(runtime);
      },
      refresh: (context, runtime) => {
        context.getTabManager().refreshReviewTab(runtime);
      },
    });

    this.registerDeferredCustomTab({
      type: `${this.name}-review-ai`,
      resolveTitle: (runtime) => this.resolveRuntimeTitle(runtime, this.i18n?.aiWorkbench || 'AI Workbench'),
      mount: (context, runtime) => {
        context.getTabManager().initReviewAICompanionTab(runtime);
      },
      destroy: (context, runtime) => {
        context.getTabManager().destroyReviewAICompanionTab(runtime);
      },
    });
  }

  private registerDeferredCustomTab(config: {
    type: string;
    resolveTitle: (runtime: BootstrappedTabRuntimeContext) => string;
    mount: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void;
    destroy: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void;
    refresh?: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void;
  }): void {
    const plugin = this;
    this.addTab({
      type: config.type,
      init() {
        const runtime = this as unknown as BootstrappedTabRuntimeContext;
        const title = config.resolveTitle(runtime);
        const abortController = new AbortController();
        runtime.__siyuanMemoBootstrap?.abortController.abort();
        runtime.__siyuanMemoBootstrap = {
          abortController,
          initPromise: Promise.resolve(),
          mounted: false,
        };
        plugin.renderCustomTabShell(runtime, 'loading', title);
        runtime.__siyuanMemoBootstrap.initPromise = plugin.bootstrapDeferredCustomTab(runtime, title, config.mount);
      },
      destroy() {
        const runtime = this as unknown as BootstrappedTabRuntimeContext;
        plugin.destroyDeferredCustomTab(runtime, config.destroy);
      },
      ...(config.refresh
        ? {
            resize() {
              const runtime = this as unknown as BootstrappedTabRuntimeContext;
              plugin.refreshDeferredCustomTab(runtime, config.refresh!);
            },
            update() {
              const runtime = this as unknown as BootstrappedTabRuntimeContext;
              plugin.refreshDeferredCustomTab(runtime, config.refresh!);
            },
          }
        : {}),
    });
  }

  private async bootstrapDeferredCustomTab(
    runtime: BootstrappedTabRuntimeContext,
    title: string,
    mount: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void,
  ): Promise<void> {
    const bootstrap = runtime.__siyuanMemoBootstrap;
    if (!bootstrap) {
      return;
    }

    try {
      const context = await this.waitForContextReady(bootstrap.abortController.signal);
      if (runtime.__siyuanMemoBootstrap !== bootstrap || bootstrap.abortController.signal.aborted) {
        return;
      }

      runtime.element.innerHTML = '';
      mount(context, runtime);
      bootstrap.mounted = true;
    } catch (error) {
      if (bootstrap.abortController.signal.aborted) {
        return;
      }

      this.logger.error('Failed to bootstrap deferred custom tab', {
        title,
        error,
      });
      this.renderCustomTabShell(
        runtime,
        'error',
        title,
        this.i18n?.initFailed || 'FSRS 插件初始化失败',
      );
    }
  }

  private destroyDeferredCustomTab(
    runtime: BootstrappedTabRuntimeContext,
    destroy: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void,
  ): void {
    const bootstrap = runtime.__siyuanMemoBootstrap;
    bootstrap?.abortController.abort();
    runtime.__siyuanMemoBootstrap = undefined;

    if (this.context) {
      try {
        destroy(this.context, runtime);
      } catch (error) {
        this.logger.error('Failed to destroy deferred custom tab', error);
        runtime.vueApp?.unmount();
        runtime.vueApp = undefined;
      }
    } else {
      runtime.vueApp?.unmount();
      runtime.vueApp = undefined;
    }

    runtime.element.innerHTML = '';
  }

  private refreshDeferredCustomTab(
    runtime: BootstrappedTabRuntimeContext,
    refresh: (context: ApplicationContext, runtime: BootstrappedTabRuntimeContext) => void,
  ): void {
    const bootstrap = runtime.__siyuanMemoBootstrap;
    if (!bootstrap) {
      return;
    }

    if (bootstrap.mounted && this.context) {
      refresh(this.context, runtime);
      return;
    }

    void bootstrap.initPromise.then(() => {
      if (
        runtime.__siyuanMemoBootstrap !== bootstrap
        || bootstrap.abortController.signal.aborted
        || !bootstrap.mounted
        || !this.context
      ) {
        return;
      }
      refresh(this.context, runtime);
    }).catch(() => undefined);
  }

  private resolveRuntimeTitle(
    runtime: BootstrappedTabRuntimeContext,
    fallback: string,
  ): string {
    const title = (runtime.data as { title?: unknown } | undefined)?.title;
    return typeof title === 'string' && title.trim() ? title.trim() : fallback;
  }

  private renderCustomTabShell(
    runtime: BootstrappedTabRuntimeContext,
    state: 'loading' | 'error',
    title: string,
    message?: string,
  ): void {
    const color = state === 'error' ? 'var(--b3-theme-error, #d23f31)' : 'var(--b3-theme-on-surface-light, #6b7280)';
    const secondary = message || (state === 'loading'
      ? (this.i18n?.loading || '插件初始化中...')
      : (this.i18n?.initFailed || 'FSRS 插件初始化失败'));
    runtime.element.innerHTML = `
      <div class="siyuanmemo-tab-bootstrap siyuanmemo-tab-bootstrap--${state}">
        <div class="siyuanmemo-tab-bootstrap__title">${this.escapeHtml(title)}</div>
        <div class="siyuanmemo-tab-bootstrap__message" style="color:${color}">${this.escapeHtml(secondary)}</div>
      </div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\'', '&#39;');
  }

  private async waitForContextReady(signal: AbortSignal): Promise<ApplicationContext> {
    if (signal.aborted) {
      throw new Error('Custom tab bootstrap aborted');
    }

    return await Promise.race([
      this.contextReady.promise,
      new Promise<never>((_, reject) => {
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort);
          reject(new Error('Custom tab bootstrap aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  }

  private async performConfigMigrations() {
    const context = this.getContext();
    const settingsService = context.getSettingsService();
    const settings = settingsService.getSettings();
    const riffConfig = settings.riffIntegration;

    if (riffConfig && ConfigMigrator.needsMigration(riffConfig)) {
      const legacyRiffConfig = riffConfig as Parameters<typeof ConfigMigrator.migrate>[0];
      const migratedConfig = ConfigMigrator.migrate(legacyRiffConfig);
      await settingsService.updateSettings({ ...settings, riffIntegration: migratedConfig });
      setTimeout(() => pushMsg(ConfigMigrator.getMigrationMessage(legacyRiffConfig.mode)), 1000);
    }

    const { SimpleModeRemovalMigrator } = await import('./utils/simpleModeRemovalMigrator');
    const finalConfig = settingsService.getSettings().riffIntegration;
    
    if (finalConfig && SimpleModeRemovalMigrator.needsMigration(finalConfig)) {
      try {
        const result = await SimpleModeRemovalMigrator.performMigration(finalConfig, context.getHybridSyncService());
        const migratedConfig: RiffIntegrationConfig = {
          mode: 'advanced',
          ...result.migratedConfig,
        };
        await settingsService.updateSettings({ ...settingsService.getSettings(), riffIntegration: migratedConfig });
      } catch (error) {
        await SimpleModeRemovalMigrator.handleMigrationError(error as Error, 'plugin initialization');
      }
    } else if (finalConfig && finalConfig.mode) {
      const cleanConfig: RiffIntegrationConfig = {
        ...finalConfig,
        mode: finalConfig.mode === 'simple' ? 'advanced' : finalConfig.mode,
      };
      await settingsService.updateSettings({ ...settingsService.getSettings(), riffIntegration: cleanConfig });
    }
  }
}
