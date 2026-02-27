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
import '@/index.scss';

export default class FSRSPlugin extends Plugin implements IPluginFacade {
  public isMobile: boolean = false;
  public isBrowser: boolean = false;
  private context!: ApplicationContext;
  private readonly logger = createLogger('Plugin');

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
  async openSubsetReviewDialog(blockIds: string[]): Promise<void> {
    await this.context.getDialogManager()?.openSubsetReviewDialog(blockIds);
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
    this.setupTopBar();

    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');

    try {
      this.context = await ApplicationContext.create({ plugin: this, i18n: this.i18n || {} });
      await this.performConfigMigrations();
      this.context.getTabManager().registerAll();
      this.isInitialized = true;
      
      // ✅ 只有在初始化成功后才注册事件处理器
      this.registerDock();
      this.registerEventHandlers();
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
  }

  onunload() {
    if (this.topBarElement && this.topBarContextMenuHandler) {
      this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
    }
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
          this.logger.warn('Failed to remount topbar:', err);
          this.didWarnTopbarMount = true;
        }
      }
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
