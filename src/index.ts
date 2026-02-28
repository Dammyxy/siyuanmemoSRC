/**
 * FSRS Plugin Entry - 简化版（< 200 行）
 * 职责：插件生命周期、UI 事件路由、最小胶水代码
 * 
 * @implements {IPluginFacade}
 */

import { Plugin, getFrontend } from 'siyuan';
import { pushErrMsg, pushMsg } from '@/infrastructure/siyuan/api';
import { ApplicationContext } from '@/application/ApplicationContext';
import type { IPluginFacade } from '@/application/interfaces/IPluginFacade';
import { ConfigMigrator } from '@/utils/configMigrator';
import { createLogger, installConsoleBridge } from '@/utils/logger';
import type { RiffIntegrationConfig } from '@/types/settings';
import { FormulaClozeAssistant } from '@/application/handlers/FormulaClozeAssistant';
import { ImageOcclusionHandler } from '@/application/handlers/ImageOcclusionHandler';
import '@/index.scss';

export default class FSRSPlugin extends Plugin implements IPluginFacade {
  public isMobile: boolean = false;
  public isBrowser: boolean = false;
  private context!: ApplicationContext;
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
  private readonly oneClickSymbolSlashId = 'siyuanmemo-one-click-symbol-cards';

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
    return this.context;
  }
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认打开的标签页（可选）
   */
  openSettings(defaultTab?: string): void {
    this.context.getDialogManager()?.openSettingsDialog(defaultTab);
  }

  /**
   * 打开子集复习对话框
   *
   * 供浏览器右键菜单「选中复习」使用。
   */
  async openSubsetReviewDialog(
    blockIds: string[],
    options?: {
      preferredCardId?: string;
    }
  ): Promise<void> {
    await this.context.getDialogManager()?.openSubsetReviewDialog(blockIds, options);
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   */
  async getDueCount(): Promise<number> {
    const cardService = this.context.getCardService();
    return await cardService.getDueCount();
  }
  
  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;

  async onload() {
    installConsoleBridge();
    this.logger.info('Plugin loading...');
    this.isInitialized = false;

    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');
    this.setupTopBar();
    this.startMobileMenuObserver();
    this.startMobileSidebarToolbarObserver();

    try {
      this.context = await ApplicationContext.create({ plugin: this, i18n: this.i18n || {} });
      await this.performConfigMigrations();
      this.context.getTabManager().registerAll();
      this.isInitialized = true;
      
      // ✅ 只有在初始化成功后才注册事件处理器
      this.imageOcclusionHandler = new ImageOcclusionHandler(this);
      this.registerDock();
      this.registerEventHandlers();
      this.registerOneClickSymbolCardCommands();
      this.registerImageOcclusionCommands();
      this.registerOneClickSymbolCardSlash();
      this.formulaClozeAssistant = new FormulaClozeAssistant(this);
      this.formulaClozeAssistant.start();
    } catch (err) {
      this.logger.error('Plugin initialization failed:', err);
      try { await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败'); } catch {}
      // ❌ 初始化失败时不注册事件处理器
      return;
    }

    // ❌ 移除全局状态（Phase 3: DDD 重构）
    // 不再将插件实例暴露到全局，使用依赖注入代替
    // window.siyuanMemoPlugin = this;
    
    this.logger.info('Plugin loaded successfully');
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
    this.scheduleMobileMenuEnsure();
    this.scheduleMobileSidebarToolbarEnsure();
  }

  onunload() {
    if (this.topBarElement && this.topBarContextMenuHandler) {
      this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
    }
    this.stopMobileMenuObserver();
    this.removeMobileSidebarEntry();
    this.stopMobileSidebarToolbarObserver();
    this.removeMobileSidebarToolbarEntry();
    this.unregisterOneClickSymbolCardSlash();
    this.formulaClozeAssistant?.stop();
    this.formulaClozeAssistant = null;
    this.imageOcclusionHandler?.dispose();
    this.imageOcclusionHandler = null;
    if (this.context) {
      this.context.dispose().catch(err => this.logger.error('Error disposing context:', err));
    }
  }

  uninstall() {
    const files = [
      'cards.msgpack', 'cards.json', 'settings.json', 'xiuyuan.msgpack', 'reschedule-configs.json',
      'riff-blacklist.msgpack', 'riff-blacklist.json', 'practice-queue.msgpack', 'practice-queue.json',
      'practice-queue-backup.msgpack', 'incremental-learning-queue.msgpack', 'incremental-learning-queue.json',
      'queue-final-drill.json', 'queue-retrieval-practice.json', 'queue-neural-roam.json',
      'queue-incremental-learning.json', 'review-v2-final-drill.json', 'queue-final-drill.backup.json',
      'queue-retrieval-practice.backup.json', 'queue-neural-roam.backup.json', 'queue-incremental-learning.backup.json',
    ];
    files.forEach(f => this.removeData(f).catch(() => {}));
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
        const dialogManager = this.context.getDialogManager();
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
      this.context.getMenuManager()?.openTopBarMenu(ev);
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
        this.context.getDockManager().initDockPanel(
          dock.element,
          () => this.context.getDialogManager()?.openReviewDialog(),
          () => this.context.getDialogManager()?.openBrowserDialog()
        );
      },
    });
  }

  private registerEventHandlers() {
    const blockMenuHandler = this.context.getBlockMenuHandler();
    this.eventBus.on('click-blockicon', (e) => blockMenuHandler.handleBlockIconClick(e));
    this.eventBus.on('click-editortitleicon', (e) => blockMenuHandler.handleEditorTitleIconClick(e));
    this.eventBus.on('open-menu-breadcrumbmore', (e) => blockMenuHandler.handleBreadcrumbMore(e));
    this.eventBus.on('open-menu-doctree', (e) => blockMenuHandler.handleDocTreeMenu(e));
    this.eventBus.on('open-menu-blockref', (e) => blockMenuHandler.handleBlockRefMenu(e));
    this.eventBus.on('open-menu-image', (e) => this.imageOcclusionHandler?.handleImageMenu(e));
  }

  private registerOneClickSymbolCardCommands(): void {
    this.addCommand({
      langKey: 'oneClickSymbolCardsCurrentDoc',
      callback: () => {
        void this.context.getMenuManager().runOneClickSymbolCardCreationForCurrentDoc();
      },
      editorCallback: (protyle: unknown) => {
        const docId = this.extractDocIdFromProtyle(protyle);
        if (docId) {
          void this.context.getMenuManager().runOneClickSymbolCardCreationByDocId(docId);
          return;
        }
        void this.context.getMenuManager().runOneClickSymbolCardCreationForCurrentDoc();
      },
    });
  }

  private registerImageOcclusionCommands(): void {
    this.addCommand({
      langKey: 'imageOcclusionCardCurrentBlock',
      callback: () => {
        void this.imageOcclusionHandler?.openFromActiveEditor();
      },
      editorCallback: (protyle: unknown) => {
        void this.imageOcclusionHandler?.openFromEditor(protyle);
      },
    });
  }

  private registerOneClickSymbolCardSlash(): void {
    if (this.protyleSlash.some((item) => item.id === this.oneClickSymbolSlashId)) {
      return;
    }

    const label = this.i18n?.oneClickSymbolCardsCurrentDoc || 'One-click Symbol Cards (Current Doc)';
    this.protyleSlash.push({
      id: this.oneClickSymbolSlashId,
      filter: [
        'symbol card',
        'one click card',
        'symbol',
        'symbol cards',
        'fuhao card',
        '\u7b26\u53f7\u5236\u5361',
        '\u4e00\u952e\u7b26\u53f7\u5236\u5361',
      ],
      html: `
        <div class="b3-list-item__first">
          <svg class="b3-list-item__graphic"><use xlink:href="#iconRiffCard"></use></svg>
          <span class="b3-list-item__text">${label}</span>
        </div>
      `,
      callback: (protyle) => {
        const docId = this.extractDocIdFromProtyle(protyle);
        if (docId) {
          void this.context.getMenuManager().runOneClickSymbolCardCreationByDocId(docId);
          return;
        }
        void this.context.getMenuManager().runOneClickSymbolCardCreationForCurrentDoc();
      },
    });
  }

  private unregisterOneClickSymbolCardSlash(): void {
    this.protyleSlash = this.protyleSlash.filter((item) => item.id !== this.oneClickSymbolSlashId);
  }

  private extractDocIdFromProtyle(protyle: unknown): string | null {
    if (!protyle || typeof protyle !== 'object') {
      return null;
    }

    const block = (protyle as { block?: { rootID?: string; id?: string } }).block;
    const rootId = typeof block?.rootID === 'string' ? block.rootID.trim() : '';
    if (rootId) {
      return rootId;
    }

    const blockId = typeof block?.id === 'string' ? block.id.trim() : '';
    return blockId || null;
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
      void this.context.getDialogManager()?.openMobileQueueLauncherDialog();
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
      void this.context.getDialogManager()?.openMobileQueueLauncherDialog();
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

  private async performConfigMigrations() {
    const settingsService = this.context.getSettingsService();
    const settings = settingsService.getSettings();
    const riffConfig = settings.riffIntegration;

    if (riffConfig && ConfigMigrator.needsMigration(riffConfig)) {
      const migratedConfig = ConfigMigrator.migrate(riffConfig);
      await settingsService.updateSettings({ ...settings, riffIntegration: migratedConfig });
      setTimeout(() => pushMsg(ConfigMigrator.getMigrationMessage(riffConfig.mode)), 1000);
    }

    const { SimpleModeRemovalMigrator } = await import('./utils/simpleModeRemovalMigrator');
    const finalConfig = settingsService.getSettings().riffIntegration;
    
    if (finalConfig && SimpleModeRemovalMigrator.needsMigration(finalConfig)) {
      try {
        const result = await SimpleModeRemovalMigrator.performMigration(finalConfig, this.context.getHybridSyncService());
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
