/**
 * DialogManager - 对话框管理器
 * 
 * 职责：
 * - 管理所有对话框的打开和关闭
 * - 统一对话框生命周期管理
 * - 提供对话框访问接口
 * 
 * @see .kiro/specs/ddd-refactoring/design.md - Section 2.5
 */

import type { Plugin } from 'siyuan';
import type { ApplicationContext } from '../ApplicationContext';
import { createVueDialog } from '@/utils/dialog';
import { SettingsPanel } from '@/ui/settings';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { TemplateSelectDialog } from '@/ui/xiuyuan';
import { pushMsg, pushErrMsg } from '@/core/siyuan/api';
import { riff } from '@/core/siyuan';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import { QueueType } from '@/types/unified-data-source';
import { ReviewView } from '@/ui/review/v2';

/**
 * DialogManager 类
 * 
 * 管理所有对话框的打开和关闭。
 * 
 * 使用示例：
 * ```typescript
 * const dialogManager = new DialogManager(context, plugin);
 * 
 * // 打开设置对话框
 * dialogManager.openSettingsDialog();
 * 
 * // 打开浏览器对话框
 * dialogManager.openBrowserDialog();
 * ```
 */
export class DialogManager {
  // ========================================================================
  // 对话框实例
  // ========================================================================
  
  private settingsDialog: { dialog: any; destroy: () => void } | null = null;
  private srsBrowserDialog: { dialog: any; destroy: () => void } | null = null;
  private templateSelectDialog: { dialog: any; destroy: () => void } | null = null;
  private currentReviewDialog: { dialog: any; destroy: () => void } | null = null;
  
  // ========================================================================
  // 构造函数
  // ========================================================================
  
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin
  ) {}
  
  // ========================================================================
  // 设置对话框
  // ========================================================================
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认打开的标签页（可选）
   */
  openSettingsDialog(defaultTab?: string): void {
    const storage = this.context.getStorage();
    const currentSettings = storage.getSettings();
    const plugin = this.plugin as any;
    
    // 如果已有打开的设置对话框，先销毁
    if (this.settingsDialog) {
      this.settingsDialog.destroy();
    }
    
    this.settingsDialog = createVueDialog({
      title: this.context.getI18n()?.settings || '设置',
      component: SettingsPanel,
      props: {
        fsrsSettings: currentSettings.fsrs,
        queueSettings: currentSettings.queues,
        schedulerSettings: currentSettings.scheduler,
        riffIntegrationSettings: currentSettings.riffIntegration,
        incrementalSettings: currentSettings.incremental,
        quickCardSettings: currentSettings.quickCard,
        uiSettings: { enableDebugLogs: currentSettings.ui?.enableDebugLogs ?? false },
        i18n: this.context.getI18n() || {},
        defaultTab,
        queueCount: plugin.retrievalQueue?.['localBuffer']?.length || 0,
        queueHandlers: {
          preview: (filter: any) => plugin.previewPracticeQueue(filter),
          add: (filter: any) => plugin.addPracticeQueue(filter),
          start: () => plugin.startPracticeQueue(),
          clear: () => plugin.clearPracticeQueue(),
        },
      },
      events: {
        save: async (settings: any) => {
          const updatedSettings = {
            ...currentSettings,
            fsrs: {
              ...currentSettings.fsrs,
              requestRetention: settings.requestRetention,
              maximumInterval: settings.maximumInterval,
              enableShortTerm: settings.enableShortTerm,
              weights: settings.params,
              dayStartHour: settings.dayStartHour ?? 4,
            },
            queues: settings.queues || currentSettings.queues,
            scheduler: settings.scheduler || currentSettings.scheduler,
            riffIntegration: settings.riffIntegration || currentSettings.riffIntegration,
            incremental: settings.incremental || currentSettings.incremental,
            quickCard: settings.quickCard || currentSettings.quickCard,
            ui: settings.ui || currentSettings.ui,
          };
          await storage.updateSettings(updatedSettings);
          plugin.scheduler.updateParams(updatedSettings.fsrs);

          // 更新 SchedulerRouter 配置
          if (plugin.schedulerRouter && settings.scheduler) {
            plugin.schedulerRouter.updateConfig({
              defaultScheduler: settings.scheduler.defaultScheduler,
              enableRiffSync: settings.scheduler.enableRiffSync,
              fsrsParams: updatedSettings.fsrs,
            });
            console.log('[DialogManager] ✅ SchedulerRouter config updated');
          }

          // 更新 HybridSyncService 配置
          if (settings.riffIntegration && plugin.hybridSyncService) {
            // 清理旧定时器
            if (plugin.fullSyncTimer) {
              clearInterval(plugin.fullSyncTimer);
              plugin.fullSyncTimer = undefined;
            }
            
            // 重启服务以应用新配置
            plugin.hybridSyncService.stop();
            const { HybridSyncService } = await import('@/application/services/XiuyuanSyncService');
            plugin.hybridSyncService = new HybridSyncService({
              deckId: riff.BUILTIN_DECK_ID,
              storage: storage,
              incrementalSync: {
                ...settings.riffIntegration.incrementalSync,
                autoDetectCardType: true
              },
              fullSync: settings.riffIntegration.fullSync,
              deleteSync: settings.riffIntegration.deleteSync
            });
            await plugin.hybridSyncService.start();
            
            // 重启定时器
            if (settings.riffIntegration.fullSync.enabled) {
              plugin.fullSyncTimer = setInterval(
                () => plugin.hybridSyncService!.fullSync(),
                settings.riffIntegration.fullSync.interval
              );
              console.log(`[DialogManager] Full sync timer restarted (interval: ${settings.riffIntegration.fullSync.interval}ms)`);
            }
            
            console.log('[DialogManager] ✅ HybridSyncService config updated');
          } else if (settings.riffIntegration && !plugin.hybridSyncService) {
            // 如果 HybridSyncService 未初始化，初始化它
            const { HybridSyncService } = await import('@/application/services/XiuyuanSyncService');
            plugin.hybridSyncService = new HybridSyncService({
              deckId: riff.BUILTIN_DECK_ID,
              storage: storage,
              incrementalSync: {
                ...settings.riffIntegration.incrementalSync,
                autoDetectCardType: true
              },
              fullSync: settings.riffIntegration.fullSync,
              deleteSync: settings.riffIntegration.deleteSync
            });
            await plugin.hybridSyncService.start();
            
            // 启动定时器
            if (settings.riffIntegration.fullSync.enabled) {
              plugin.fullSyncTimer = setInterval(
                () => plugin.hybridSyncService!.fullSync(),
                settings.riffIntegration.fullSync.interval
              );
              console.log(`[DialogManager] Full sync timer started (interval: ${settings.riffIntegration.fullSync.interval}ms)`);
            }
            
            console.log('[DialogManager] ✅ HybridSyncService initialized');
          }

          // 更新 TransactionWebSocketService 配置
          if (settings.riffIntegration) {
            const incrementalEnabled = settings.riffIntegration.incrementalSync?.enabled || false;
            
            if (incrementalEnabled && plugin.hybridSyncService) {
              // 需要启用 TransactionWebSocketService
              if (!plugin.transactionWebSocketService) {
                // 初始化服务
                console.log('[DialogManager] Initializing TransactionWebSocketService...');
                const { TransactionWebSocketService } = await import('@/core/infrastructure/websocket/TransactionWebSocketService');
                const { RiffSyncHandler } = await import('@/application/handlers/RiffSyncHandler');
                const { AutoCardHandler } = await import('@/application/handlers/AutoCardHandler');
                
                plugin.transactionWebSocketService = new TransactionWebSocketService(plugin);
                
                // 创建并注册 RiffSyncHandler
                const riffSyncHandler = new RiffSyncHandler(plugin.hybridSyncService);
                plugin.transactionWebSocketService.registerHandler(riffSyncHandler);
                
                // 创建并注册 AutoCardHandler
                const autoCardHandler = new AutoCardHandler(plugin);
                plugin.transactionWebSocketService.registerHandler(autoCardHandler);
                console.log('[DialogManager] ✅ AutoCardHandler registered');
                
                // 启动服务
                plugin.transactionWebSocketService.start();
                console.log('[DialogManager] ✅ TransactionWebSocketService initialized and started');
              }
            } else {
              // 需要停止 TransactionWebSocketService
              if (plugin.transactionWebSocketService) {
                console.log('[DialogManager] Stopping TransactionWebSocketService...');
                plugin.transactionWebSocketService.stop();
                plugin.transactionWebSocketService = undefined;
                console.log('[DialogManager] ✅ TransactionWebSocketService stopped');
              }
            }
          }
        },
        close: () => {
          this.closeSettingsDialog();
        },
        // 数据修复事件
        'repair-dates': async () => {
          try {
            const result = await storage.repairInvalidDates();
            if (result.fixed > 0) {
              pushMsg(`已修复 ${result.fixed}/${result.total} 张卡片的无效日期`, 5000);
            } else {
              pushMsg(`检查完成，未发现问题（共 ${result.total} 张卡片）`, 3000);
            }
          } catch (err) {
            console.error('[DialogManager] Failed to repair dates:', err);
            pushErrMsg(`修复失败: ${(err as Error).message}`);
          }
        }
      },
      width: '700px',
      height: '600px',
      onClose: () => {
        this.settingsDialog = null;
      },
    });
  }
  
  /**
   * 关闭设置对话框
   */
  closeSettingsDialog(): void {
    if (this.settingsDialog) {
      this.settingsDialog.destroy();
      this.settingsDialog = null;
    }
  }
  
  // ========================================================================
  // SRS 浏览器对话框
  // ========================================================================
  
  /**
   * 打开 SRS 浏览器对话框
   */
  openBrowserDialog(): void {
    const storage = this.context.getStorage();
    const scheduler = this.context.getScheduler();
    const browserService = this.context.getBrowserService();
    const tabManager = this.context.getTabManager();  // ✅ 获取 TabManager
    
    this.srsBrowserDialog = createVueDialog({
      dataKey: 'srs-browser-dialog',
      title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        plugin: this.plugin,
        storage,
        scheduler,
        browserService,  // ✅ DDD 架构
        tabManager,      // ✅ DDD 架构
        i18n: this.context.getI18n(),
      },
      events: {
        close: () => this.closeBrowserDialog(),
      },
      width: 'min(1200px, 96vw)',
      height: 'min(800px, 90vh)',
      onClose: () => {
        this.srsBrowserDialog = null;
      },
    });
  }
  
  /**
   * 关闭 SRS 浏览器对话框
   */
  closeBrowserDialog(): void {
    if (this.srsBrowserDialog) {
      this.srsBrowserDialog.destroy();
      this.srsBrowserDialog = null;
    }
  }
  
  // ========================================================================
  // 复习对话框
  // ========================================================================
  
  /**
   * 销毁当前复习对话框
   */
  private destroyCurrentReviewDialog(): void {
    if (this.currentReviewDialog) {
      this.currentReviewDialog.destroy();
      this.currentReviewDialog = null;
    }
  }
  
  /**
   * 检查初始化状态
   */
  private async checkInitialized(): Promise<boolean> {
    if (!this.context) {
      await pushErrMsg(this.context.getI18n()?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return false;
    }
    return true;
  }
  
  /**
   * 打开提取练习对话框
   */
  async openReviewDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.RetrievalPractice,
        title: this.context.getI18n()?.retrievalPractice || '提取练习',
        onClose: () => {
          this.currentReviewDialog = null;
        }
      });
      
      console.log('[DialogManager] ✅ Retrieval practice dialog created');
    } catch (err) {
      console.error('[DialogManager] Failed to open retrieval practice dialog:', err);
      await pushErrMsg(this.context.getI18n()?.loadFailed || '加载失败');
    }
  }
  
  /**
   * 打开渐进学习对话框
   */
  async openIncrementalLearningDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.IncrementalLearning,
        title: this.context.getI18n()?.incrementalLearning || '渐进学习',
        onClose: () => {
          this.currentReviewDialog = null;
        }
      });
      
      console.log('[DialogManager] ✅ Incremental learning dialog created');
    } catch (err) {
      console.error('[DialogManager] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.context.getI18n()?.openFailed || '打开渐进学习失败');
    }
  }
  
  /**
   * 打开刻意练习对话框
   */
  async openFinalDrillDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.FinalDrill,
        title: this.context.getI18n()?.finalDrill || '刻意练习',
        onClose: () => {
          this.currentReviewDialog = null;
        }
      });
      
      console.log('[DialogManager] ✅ Final drill dialog created');
    } catch (err) {
      console.error('[DialogManager] Failed to open final drill dialog:', err);
      await pushErrMsg(this.context.getI18n()?.drillFailed || '机械练习启动失败');
    }
  }
  
  /**
   * 打开筛选复习对话框
   */
  async openFilterGroupPracticeDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.FilterGroup,
        title: this.context.getI18n()?.filterGroupPractice || '分组队列',
        onClose: () => {
          this.currentReviewDialog = null;
        }
      });
      
      console.log('[DialogManager] ✅ Filter group dialog created');
    } catch (err) {
      console.error('[DialogManager] Failed to open filter group practice dialog:', err);
      await pushErrMsg(this.context.getI18n()?.openFailed || '打开分组队列失败');
    }
  }
  
  /**
   * 打开神经漫游对话框
   * 
   * @param options 可选配置
   * @param options.seedBlockId 种子块 ID
   * @param options.includeSeedAsFirst 是否将种子块作为第一张卡片
   * @param options.resetHistory 是否重置历史记录
   */
  async openNeuralRoamDialog(options?: { 
    seedBlockId?: string; 
    includeSeedAsFirst?: boolean; 
    resetHistory?: boolean 
  }): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      // 清理神经漫游队列的历史记录
      const neuralQueue = this.context.getUnifiedDataSourceManager().getQueue(QueueType.NeuralRoam);
      if (neuralQueue && typeof (neuralQueue as any).clearHistory === 'function') {
        (neuralQueue as any).clearHistory();
        console.log('[DialogManager] ✅ Neural roam history cleared');
      }

      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.NeuralRoam,
        title: this.context.getI18n()?.neuralReviewTitle || '神经漫游',
        onClose: () => {
          this.currentReviewDialog = null;
        }
      });

      console.log('[DialogManager] ✅ Neural roam dialog created');
    } catch (err) {
      console.error('[DialogManager] Failed to open neural roam dialog:', err);
      await pushErrMsg(this.context.getI18n()?.neuralReviewFailed || '神经复习启动失败');
    }
  }
  
  /**
   * 打开难点攻坚对话框
   */
  async openLeechReviewDialog(): Promise<void> {
    this.destroyCurrentReviewDialog();

    try {
      const storage = this.context.getStorage();
      const settings = storage.getSettings();
      const leech = (settings as any)?.leech || {};
      
      const { LeechQueue } = await import('@/core/queue/strategies/LeechQueue');
      const { LeechAdapter } = await import('@/ui/review/v2');
      
      const queue = new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Number(leech.threshold) || 8,
        action: (leech.action || 'notify') as any,
        tagName: String(leech.tagName || ''),
      });

      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title: this.context.getI18n()?.startLeechPractice || '难点攻坚',
          queue: queue as any,
          adapter: new LeechAdapter({ i18n: this.context.getI18n() || {} }) as any,
          plugin: this.plugin,
        },
        events: {
          close: () => this.destroyCurrentReviewDialog(),
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[DialogManager] Failed to open leech review dialog:', err);
      await pushErrMsg('难点攻坚启动失败');
    }
  }
  
  /**
   * 打开子集复习对话框
   */
  async openSubsetReviewDialog(blockIds: string[]): Promise<void> {
    this.destroyCurrentReviewDialog();

    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await pushMsg(this.context.getI18n()?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    try {
      const { SubsetPracticeStrategy } = await import('@/core/queue/strategies');
      const { SubsetPracticeAdapter } = await import('@/ui/review/v2');
      
      const title = (this.context.getI18n()?.reviewSubsetTitleWithCount || '子集复习 ({n} 张)').replace('{n}', String(ids.length));
      
      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title,
          queue: new SubsetPracticeStrategy({ 
            blockIds: ids, 
            deckID: riff.BUILTIN_DECK_ID, 
            storage: this.context.getStorage() 
          }) as any,
          adapter: new SubsetPracticeAdapter({ 
            i18n: this.context.getI18n() || {}, 
            label: title, 
            queueName: 'subset' 
          }) as any,
          plugin: this.plugin,
        },
        events: {
          close: () => this.destroyCurrentReviewDialog(),
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[DialogManager] Failed to open subset review dialog:', err);
      await pushErrMsg('打开子集复习失败');
    }
  }
  
  /**
   * 打开提取练习对话框（带过滤条件）
   * 
   * @param options 过滤选项
   * @param options.blockIds 块 ID 列表
   * @param options.dueOnly 是否只显示到期卡片
   */
  async openRetrievalPracticeWithFilter(options: {
    blockIds: string[];
    dueOnly: boolean;
  }): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      const manager = this.context.getUnifiedDataSourceManager();
      const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
      
      // 设置临时过滤条件
      const filter: any = {
        blockIds: options.blockIds,
        cardType: 'item',  // 只接受 Item
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      console.log('[DialogManager] 🔍 openRetrievalPracticeWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
      });
      
      // 应用过滤条件
      if (typeof (filterGroupQueue as any).setFilter === 'function') {
        (filterGroupQueue as any).setFilter(filter);
      }
      
      // 清除临时黑名单（全部模式）
      if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
        (filterGroupQueue as any).clearTemporaryBlacklist();
        console.log('[DialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用依赖注入）
      const eventBus = this.context.getEventBus();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus);
      const adapter = new UnifiedReviewAdapter({ i18n: this.context.getI18n() || {} });
      
      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title: this.context.getI18n()?.retrievalPractice || '提取练习',
          queue: queue as any,
          adapter: adapter as any,
          plugin: this.plugin,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (typeof (filterGroupQueue as any).setFilter === 'function') {
              (filterGroupQueue as any).setFilter({});
            }
            this.destroyCurrentReviewDialog();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
      
      console.log('[DialogManager] ✅ Retrieval practice dialog created with blockIds filter');
    } catch (err) {
      console.error('[DialogManager] Failed to open retrieval practice dialog:', err);
      await pushErrMsg(this.context.getI18n()?.loadFailed || '加载失败');
    }
  }
  
  /**
   * 打开渐进学习对话框（带过滤条件）
   * 
   * @param options 过滤选项
   * @param options.blockIds 块 ID 列表
   * @param options.dueOnly 是否只显示到期卡片
   */
  async openIncrementalLearningWithFilter(options: {
    blockIds: string[];
    dueOnly: boolean;
  }): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      const manager = this.context.getUnifiedDataSourceManager();
      const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
      
      // 设置临时过滤条件
      const filter: any = {
        blockIds: options.blockIds,
        // 渐进学习接受所有类型（Item + Topic）
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      console.log('[DialogManager] 🔍 openIncrementalLearningWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
      });
      
      // 应用过滤条件
      if (typeof (filterGroupQueue as any).setFilter === 'function') {
        (filterGroupQueue as any).setFilter(filter);
      }
      
      // 清除临时黑名单（全部模式）
      if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
        (filterGroupQueue as any).clearTemporaryBlacklist();
        console.log('[DialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用依赖注入）
      const eventBus = this.context.getEventBus();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus);
      const adapter = new UnifiedReviewAdapter({ i18n: this.context.getI18n() || {} });
      
      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title: this.context.getI18n()?.incrementalLearning || '渐进学习',
          queue: queue as any,
          adapter: adapter as any,
          plugin: this.plugin,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (typeof (filterGroupQueue as any).setFilter === 'function') {
              (filterGroupQueue as any).setFilter({});
            }
            this.destroyCurrentReviewDialog();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
      
      console.log('[DialogManager] ✅ Incremental learning dialog created with blockIds filter');
    } catch (err) {
      console.error('[DialogManager] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.context.getI18n()?.openFailed || '打开渐进学习失败');
    }
  }
  
  /**
   * 打开临时练习对话框
   * 
   * @param blockIds 块 ID 列表
   */
  async openTemporaryDrill(blockIds: string[]): Promise<void> {
    this.destroyCurrentReviewDialog();

    if (blockIds.length === 0) {
      await pushMsg(this.context.getI18n()?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    try {
      const { TemporaryDrillStrategy } = await import('@/core/queue/strategies/TemporaryDrillStrategy');
      const { SubsetPracticeAdapter } = await import('@/ui/review/v2/adapters/SubsetPracticeAdapter');

      const title = `临时练习 (${blockIds.length} 张)`;
      const session = new TemporaryDrillStrategy({
        blockIds,
        deckID: riff.BUILTIN_DECK_ID,
        storage: this.context.getStorage()
      });
      const adapter = new SubsetPracticeAdapter({
        i18n: this.context.getI18n() || {},
        label: title,
        queueName: 'temporary-drill'
      });

      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-temporary-drill',
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title,
          plugin: this.plugin,
          queue: session as any,
          adapter: adapter as any,
        },
        events: {
          close: () => this.destroyCurrentReviewDialog(),
        },
        width: '80vw',
        height: '70vh',
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });

      // 样式调整
      const dialogEl = this.currentReviewDialog.dialog.element;
      const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
      const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

      if (scrim) {
        scrim.style.backgroundColor = 'var(--b3-theme-surface)';
      }
      if (container) {
        container.style.maxWidth = '1024px';
      }

      setTimeout(() => {
        const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
        if (focusEl) {
          focusEl.focus();
        }
      }, 100);

      console.log('[DialogManager] ✅ Temporary drill dialog opened');
    } catch (err) {
      console.error('[DialogManager] Failed to open temporary drill:', err);
      await pushErrMsg(this.context.getI18n()?.drillFailed || '临时练习启动失败');
    }
  }
  
  // ========================================================================
  // 模板卡片对话框
  // ========================================================================
  
  /**
   * 打开创建模板卡片对话框（Xiuyuan）- 带块 ID 列表
   * 
   * @param blockIds - 块 ID 列表
   */
  async openCreateTemplateCardDialog(blockIds: string[]): Promise<void> {
    try {
      if (!blockIds || blockIds.length === 0) {
        pushMsg('未找到选中的块');
        return;
      }

      const plugin = this.plugin as any;
      const xiuyuanService = plugin.xiuyuanService;
      
      if (!xiuyuanService) {
        console.error('[DialogManager] XiuyuanService not found');
        pushErrMsg('XiuyuanService 未初始化');
        return;
      }

      // 获取所有可用模板
      const templates = xiuyuanService.getAllTemplates();
      if (templates.length === 0) {
        pushMsg('暂无可用模板，请先创建模板');
        return;
      }

      // 如果已有打开的模板选择对话框，先销毁
      if (this.templateSelectDialog) {
        this.templateSelectDialog.destroy();
      }

      // 显示模板选择对话框
      this.templateSelectDialog = createVueDialog({
        title: '选择卡片模板',
        component: TemplateSelectDialog,
        props: {
          templates,
          blockCount: blockIds.length,
        },
        width: '640px',
        height: '650px',
        events: {
          confirm: async (templateId: string) => {
            const template = xiuyuanService.getTemplate(templateId);
            if (!template) return;

            // 自动字段映射：按顺序映射块到字段
            const fieldMapping: Record<string, string> = {};
            template.fields.forEach((field: any, index: number) => {
              if (index < blockIds.length) {
                fieldMapping[field.name] = blockIds[index];
              }
            });

            // 创建 Xiuyuan 和卡片
            // TODO: Phase 4 Task 14.3 - 迁移到 CardApplicationService
            // 当前使用 XiuyuanService.createFromBlocks，因为：
            // 1. 模板卡片创建涉及复杂的字段映射和多卡片生成
            // 2. CardApplicationService 还不支持模板功能
            // 3. 需要先扩展 CreateCardCommand 和 CreateCardUseCase 以支持模板
            try {
              const result = await xiuyuanService.createFromBlocks(
                blockIds,
                templateId,
                fieldMapping,
                riff.BUILTIN_DECK_ID
              );

              if (!result.ok) {
                console.error('[DialogManager] Failed to create template card:', result.error);
                pushErrMsg(`创建失败：${result.error.message}`);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              const { xiuyuan, cards } = result.value;
              console.log('[DialogManager] Xiuyuan created:', { xiuyuan, cards });

              pushMsg(
                `✅ 模板卡片创建成功！\n` +
                `模板：${template.name}\n` +
                `生成卡片：${cards.length} 张`
              );
            } catch (err) {
              console.error('[DialogManager] Failed to create template card:', err);
              pushErrMsg(`创建失败：${(err as Error).message}`);
            }

            this.templateSelectDialog?.destroy();
            this.templateSelectDialog = null;
          },
          cancel: () => {
            this.templateSelectDialog?.destroy();
            this.templateSelectDialog = null;
          },
        },
        onClose: () => {
          this.templateSelectDialog = null;
        },
      });
    } catch (err) {
      console.error('[DialogManager] Failed to open create template card dialog:', err);
      pushErrMsg(`打开对话框失败：${(err as Error).message}`);
    }
  }
  
  // ========================================================================
  // 生命周期管理
  // ========================================================================
  
  /**
   * 销毁所有对话框
   */
  dispose(): void {
    this.closeSettingsDialog();
    this.closeBrowserDialog();
    this.destroyCurrentReviewDialog();
    if (this.templateSelectDialog) {
      this.templateSelectDialog.destroy();
      this.templateSelectDialog = null;
    }
  }
}
