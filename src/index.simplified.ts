/**
 * FSRS Plugin Entry - 简化版（< 200 行）
 * 职责：插件生命周期、UI 事件路由、最小胶水代码
 */

import { Plugin, getFrontend } from 'siyuan';
import { pushErrMsg, pushMsg } from '@/core/siyuan/api';
import { ApplicationContext } from '@/application/ApplicationContext';
import { ConfigMigrator } from '@/utils/configMigrator';
import '@/index.scss';

if (process.env.NODE_ENV === 'development') import('@/debug/fsrs-debug');

export default class FSRSPlugin extends Plugin {
  public isMobile: boolean = false;
  public isBrowser: boolean = false;
  private context!: ApplicationContext;

  // 向后兼容访问器
  public get storage() { return this.context.getStorage(); }
  public get scheduler() { return this.context.getLegacyScheduler(); }
  public get schedulerRouter() { return this.context.getScheduler(); }
  public get rescheduleService() { return this.context.getRescheduleService(); }
  public get queueContext() { return this.context.getQueueContext(); }
  public get retrievalQueue() { return this.context.getRetrievalQueue() as any; }
  public get finalDrillQueue() { return this.context.getFinalDrillQueue(); }
  public get leechQueue() { return this.context.getLeechQueue(); }
  public get incrementalQueue() { return this.context.getIncrementalQueue(); }
  public get subsetQueue() { return this.context.getSubsetQueue(); }
  public get xiuyuanService() { return this.context.getXiuyuanService(); }
  public get xiuyuanStorage() { return this.context.getXiuyuanStorage(); }
  public get unifiedDataSourceManager() { return this.context.getUnifiedDataSourceManager(); }
  public get deliberateQueue() { return this.finalDrillQueue; }
  public get neuralQueue() { return this.unifiedDataSourceManager.getQueue('neural-roam' as any) as any; }
  public get neuralRoamQueue() { return this.neuralQueue; }
  public get filterGroupQueue() { return this.subsetQueue; }

  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;

  constructor(options: any) {
    super(options);
  }

  async onload() {
    console.log('[SiYuanMemo] Plugin loading...');
    this.isInitialized = false;
    this.setupTopBar();

    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');

    try {
      this.context = await ApplicationContext.create({ plugin: this, i18n: this.i18n || {} });
      await this.performConfigMigrations();
      this.isInitialized = true;
    } catch (err) {
      console.error('[SiYuanMemo] Plugin initialization failed:', err);
      try { await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败'); } catch {}
    }

    this.registerDock();
    this.registerEventHandlers();
    (window as any).siyuanMemoPlugin = this;
    console.log('[SiYuanMemo] Plugin loaded successfully');
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
  }

  onunload() {
    if (this.topBarElement && this.topBarContextMenuHandler) {
      this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
    }
    if (this.context) {
      this.context.dispose().catch(err => console.error('[SiYuanMemo] Error disposing context:', err));
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

  openSetting(defaultTab?: string) {
    this.context.getDialogManager()?.openSettingsDialog(defaultTab);
  }

  async getDueCount(): Promise<number> {
    return await this.context.getCardService().getDueCount();
  }

  private setupTopBar() {
    this.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><symbol id="iconSiyuanMemo" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/></symbol></svg>`);
    this.topBarElement = this.addTopBar({
      icon: 'iconSiyuanMemo',
      title: this.i18n?.topbarTitle || '间隔重复系统',
      position: 'right',
      callback: () => {
        if (!this.isInitialized) { pushMsg(this.i18n?.loading || '插件初始化中...'); return; }
        this.context.getDialogManager()?.openBrowserDialog();
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
          console.warn('[SiYuanMemo] Failed to remount topbar:', err);
          this.didWarnTopbarMount = true;
        }
      }
    }
  }

  private async performConfigMigrations() {
    const settings = this.storage.getSettings();
    const riffConfig = settings.riffIntegration;

    if (riffConfig && ConfigMigrator.needsMigration(riffConfig)) {
      const migratedConfig = ConfigMigrator.migrate(riffConfig as any);
      await this.storage.updateSettings({ ...settings, riffIntegration: migratedConfig });
      setTimeout(() => pushMsg(ConfigMigrator.getMigrationMessage((riffConfig as any).mode)), 1000);
    }

    const { SimpleModeRemovalMigrator } = await import('./utils/simpleModeRemovalMigrator');
    const finalConfig = this.storage.getSettings().riffIntegration;
    
    if (finalConfig && SimpleModeRemovalMigrator.needsMigration(finalConfig)) {
      try {
        const result = await SimpleModeRemovalMigrator.performMigration(finalConfig, this.context.getHybridSyncService());
        await this.storage.updateSettings({ ...this.storage.getSettings(), riffIntegration: result.migratedConfig as any });
      } catch (error) {
        await SimpleModeRemovalMigrator.handleMigrationError(error as Error, 'plugin initialization');
      }
    } else if (finalConfig && finalConfig.mode) {
      const { mode, ...cleanConfig } = finalConfig;
      await this.storage.updateSettings({ ...this.storage.getSettings(), riffIntegration: cleanConfig as any });
    }
  }
}
