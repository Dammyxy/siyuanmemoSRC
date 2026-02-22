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
import type { IDialogManager } from '../interfaces/IDialogManager';
import { createVueDialog } from '@/utils/dialog';
import { SettingsPanel } from '@/ui/settings';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { TemplateSelectDialog } from '@/ui/xiuyuan';
import { pushMsg, pushErrMsg, sql } from '@/core/siyuan/api';
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
 * 
 * @implements {IDialogManager}
 */
export class DialogManager implements IDialogManager {
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
    const settingsService = this.context.getSettingsService();
    const currentSettings = settingsService.getSettings();
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
          // 🔍 调试日志：检查接收到的 quickCard 配置
          console.log('[DialogManager] Received settings with quickCard:', settings.quickCard);
          
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
          
          // 🔍 调试日志：检查合并后的 quickCard 配置
          console.log('[DialogManager] Merged settings with quickCard:', updatedSettings.quickCard);
          
          await settingsService.updateSettings(updatedSettings);
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

          // 更新 HybridSyncService 配置 (符合 DDD 架构)
          if (settings.riffIntegration && plugin.hybridSyncService) {
            // 通过 ApplicationContext 更新配置 (符合 DDD 封装原则)
            await this.context.updateHybridSyncConfig({
              incrementalSync: {
                ...settings.riffIntegration.incrementalSync,
                autoDetectCardType: true
              },
              fullSync: settings.riffIntegration.fullSync,
              deleteSync: settings.riffIntegration.deleteSync
            });
          }

          // 更新 TransactionWebSocketService 配置 (符合 DDD 架构)
          if (settings.riffIntegration) {
            const incrementalEnabled = settings.riffIntegration.incrementalSync?.enabled || false;
            await this.context.updateTransactionWebSocketService(incrementalEnabled);
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
    
    // ✅ 响应式宽度计算 - 接近全屏，确保所有字段都能显示
    const screenWidth = window.innerWidth;
    let dialogWidth: string;
    let dialogHeight: string;
    
    if (screenWidth < 1024) {
      // 小屏幕（平板）：使用 94% 宽度
      dialogWidth = '94vw';
      dialogHeight = '90vh';
    } else if (screenWidth < 1440) {
      // 中等屏幕（笔记本）：使用 92% 宽度
      dialogWidth = '92vw';
      dialogHeight = '90vh';
    } else if (screenWidth < 1920) {
      // 大屏幕（桌面）：使用 90% 宽度
      dialogWidth = '90vw';
      dialogHeight = '90vh';
    } else {
      // 超大屏幕（4K）：使用 88% 宽度
      dialogWidth = '88vw';
      dialogHeight = '90vh';
    }
    
    this.srsBrowserDialog = createVueDialog({
      dataKey: 'srs-browser-dialog',
      title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        app: this.plugin.app,  // ✅ 添加 app prop（预览区需要）
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
      width: dialogWidth,
      height: dialogHeight,
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
        eventBus: this.context.getEventBus(),  // ✅ 显式传递 EventBus
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
        eventBus: this.context.getEventBus(),  // ✅ 显式传递 EventBus
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
        eventBus: this.context.getEventBus(),  // ✅ 显式传递 EventBus
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
        eventBus: this.context.getEventBus(),  // ✅ 显式传递 EventBus
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
        eventBus: this.context.getEventBus(),  // ✅ 显式传递 EventBus
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
      const settingsService = this.context.getSettingsService();
      const settings = settingsService.getSettings();
      const leech = (settings as any)?.leech || {};
      
      const { LeechQueue } = await import('@/core/queue/strategies/LeechQueue');
      const { UnifiedReviewAdapter } = await import('@/application/adapters/UnifiedReviewAdapter');
      
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
          adapter: new UnifiedReviewAdapter({ i18n: this.context.getI18n() || {} }) as any,
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
      const schedulerRouter = this.context.getSchedulerRouter();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRouter);
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
      const schedulerRouter = this.context.getSchedulerRouter();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRouter);
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
   * 处理多填空卡片的创建
   * 
   * @description
   * 多填空卡片需要特殊处理：
   * 1. 读取块内容
   * 2. 解析所有填空
   * 3. 动态生成 cardRules（每个填空一个 rule）
   * 4. 创建卡片
   * 
   * @param blockIds - 块 ID 列表（多填空卡只使用第一个块）
   * @param template - 多填空模版
   */
  private async handleListTemplateCard(blockIds: string[], template: any): Promise<void> {
    try {
      if (blockIds.length === 0) {
        pushErrMsg('未选中任何块');
        return;
      }

      const parentBlockId = blockIds[0];

      // 1. 检查块类型
      const typeResult = await sql(`
        SELECT type, content FROM blocks
        WHERE id = '${parentBlockId}'
        LIMIT 1
      `);

      if (!typeResult || typeResult.length === 0) {
        pushErrMsg('块不存在');
        return;
      }

      const blockType = typeResult[0].type;

      if (blockType !== 'i') {
        pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      // 2. 获取子级列表项（必须是有序列表）
      // 思源的列表结构：列表项(i) → 段落(p) + 列表容器(l) → 子列表项(i)
      const allChildrenResult = await sql(`
        SELECT id, type, content FROM blocks
        WHERE parent_id = '${parentBlockId}'
        ORDER BY id ASC
      `);
      
      // 找到列表容器
      const listContainer = allChildrenResult?.find((r: any) => r.type === 'l');
      
      if (!listContainer) {
        pushErrMsg('未找到列表容器，请确保列表结构正确');
        return;
      }
      
      // 查询列表容器的子级列表项（必须是有序列表）
      const childrenResult = await sql(`
        SELECT id, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        AND type = 'i'
        AND subtype = 'o'
        ORDER BY id ASC
      `);

      // 如果没有找到直接子级，尝试查询所有后代列表项（必须是有序列表）
      let finalChildren = childrenResult;
      if (!finalChildren || finalChildren.length === 0) {
        const descendantsResult = await sql(`
          WITH RECURSIVE descendants AS (
            SELECT id, type, subtype, content, parent_id FROM blocks WHERE parent_id = '${listContainer.id}'
            UNION ALL
            SELECT b.id, b.type, b.subtype, b.content, b.parent_id FROM blocks b
            INNER JOIN descendants d ON b.parent_id = d.id
          )
          SELECT id, content FROM descendants WHERE type = 'i' AND subtype = 'o' ORDER BY id ASC
        `);
        
        finalChildren = descendantsResult;
      }

      if (!finalChildren || finalChildren.length < 2) {
        pushErrMsg(`需要至少2个有序子列表项（当前：${finalChildren?.length || 0}个）`);
        return;
      }

      const childBlockIds = finalChildren.map((row: any) => row.id);

      // 3. 创建列表模版卡
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      const result = await xiuyuanAppService.createListTemplateCards({
        parentBlockId,
        childBlockIds,
        templateId: template.id
      });

      if (!result.ok) {
        console.error('[DialogManager] Failed to create list template cards:', result.error);
        pushErrMsg(`创建失败：${result.error.message}`);
        return;
      }

      const { xiuyuan, cards } = result.value;
      console.log('[DialogManager] List template cards created:', { xiuyuan, cards });

      pushMsg(
        `✅ 有序列表模版卡创建成功！\n` +
        `子列表项：${childBlockIds.length} 个\n` +
        `生成卡片：${cards.length} 张`
      );
    } catch (err) {
      console.error('[DialogManager] Failed to handle list template card:', err);
      pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 处理多填空卡片创建
   * 
   * @description
   * 多填空卡片的创建流程：
   * 1. 读取块内容
   * 2. 解析所有填空
   * 3. 动态生成 cardRules（每个填空一个 rule）
   * 4. 创建卡片
   * 
   * @param blockIds - 块 ID 列表（多填空卡只使用第一个块）
   * @param template - 多填空模版
   */
  private async handleMultiClozeCard(blockIds: string[], template: any): Promise<void> {
    try {
      if (blockIds.length === 0) {
        pushErrMsg('未选中任何块');
        return;
      }

      const blockId = blockIds[0];

      // 1. 读取块内容
      const blocks = await sql(`SELECT * FROM blocks WHERE id = '${blockId}'`);
      if (!blocks || blocks.length === 0) {
        pushErrMsg('无法读取块内容');
        return;
      }

      const block = blocks[0];
      // 优先使用 markdown 字段，如果没有则使用 content 字段
      let content = block.markdown || block.content || '';
      
      // 移除 IAL（Inline Attribute List）
      // 格式：{: id="..." updated="..." ...}
      content = content.replace(/\{:.*?\}/g, '').trim();
      
      console.log('[DialogManager] Block content:', content);

      // 2. 解析填空
      const clozes = this.extractClozes(content);

      if (clozes.length === 0) {
        pushErrMsg('未找到填空内容（支持 {{}}、== 和思源标记）');
        return;
      }

      // 3. 动态生成 cardRules
      const dynamicTemplate = {
        ...template,
        cardRules: clozes.map((_, index) => ({
          typeMarker: `cloze-${index}`,
          frontFields: ['content'],
          backFields: ['content'],
        })),
      };

      // 4. 创建卡片
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      const result = await xiuyuanAppService.createFromBlocks({
        blockIds: [blockId],
        templateId: template.id,
        fieldMapping: { content: blockId },
        deckId: riff.BUILTIN_DECK_ID,
        // 🆕 传入动态模版（覆盖原模版）
        template: dynamicTemplate,
        // 🆕 传入填空信息
        clozeInfo: {
          originalContent: content,
          clozes: clozes,
        },
      });

      if (!result.ok) {
        console.error('[DialogManager] Failed to create multi-cloze card:', result.error);
        pushErrMsg(`创建失败：${result.error.message}`);
        return;
      }

      const { xiuyuan, cards } = result.value;
      console.log('[DialogManager] Multi-cloze cards created:', { xiuyuan, cards, clozeCount: clozes.length });

      pushMsg(
        `✅ 多填空卡片创建成功！\n` +
        `找到填空：${clozes.length} 个\n` +
        `生成卡片：${cards.length} 张`
      );
    } catch (err) {
      console.error('[DialogManager] Failed to handle multi-cloze card:', err);
      pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 提取块内容中的所有填空
   * 
   * @description
   * 支持三种填空符号：
   * - {{填空内容}}
   * - ==填空内容==
   * - <span data-type="mark">填空内容</span>（思源标记）
   * 
   * @param content - 块内容
   * @returns 填空列表
   */
  private extractClozes(content: string): Array<{ text: string; start: number; end: number; type: string }> {
    const clozes: Array<{ text: string; start: number; end: number; type: string }> = [];
    
    // 提取 {{}} 填空
    const braceRegex = /\{\{([^}]*)\}\}/g;
    let match;
    while ((match = braceRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1],
        start: match.index,
        end: match.index + match[0].length,
        type: 'brace',
      });
    }
    
    // 提取 == 填空
    const equalRegex = /==([^=]*)==/g;
    while ((match = equalRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1],
        start: match.index,
        end: match.index + match[0].length,
        type: 'equal',
      });
    }
    
    // 提取思源标记填空
    const markRegex = /<span data-type="mark">([^<]*)<\/span>/g;
    while ((match = markRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1],
        start: match.index,
        end: match.index + match[0].length,
        type: 'mark',
      });
    }
    
    // 按位置排序
    clozes.sort((a, b) => a.start - b.start);
    
    return clozes;
  }

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

      // ✅ 使用 XiuyuanApplicationService（符合 DDD 架构）
      const xiuyuanAppService = await this.plugin.context.getXiuyuanApplicationService();
      
      if (!xiuyuanAppService) {
        console.error('[DialogManager] XiuyuanApplicationService not found');
        pushErrMsg('XiuyuanApplicationService 未初始化');
        return;
      }

      // 获取所有可用模板
      const templates = await xiuyuanAppService.getAllTemplates();
      
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
            // 使用 XiuyuanApplicationService 获取模板
            const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
            const template = await xiuyuanAppService.getTemplate(templateId);
            if (!template) return;

            try {
              // 🆕 多填空卡片特殊处理
              if (templateId === 'builtin-multi-cloze') {
                await this.handleMultiClozeCard(blockIds, template);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }
              
              // 🆕 有序列表模版特殊处理
              if (templateId === 'builtin-list-item') {
                await this.handleListTemplateCard(blockIds, template);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              // 普通模版：自动字段映射
              const fieldMapping: Record<string, string> = {};
              template.fields.forEach((field: any, index: number) => {
                if (index < blockIds.length) {
                  fieldMapping[field.name] = blockIds[index];
                }
              });

              // 🆕 检测背面块是否有挖空
              const { ClozeDetector } = await import('@/utils/cloze-detector');
              const { getBlockText } = await import('@/core/siyuan/block');
              
              let backClozeInfo = undefined;
              
              // 只在有至少2个块时检测背面挖空
              if (blockIds.length >= 2) {
                const backBlockId = blockIds[blockIds.length - 1];
                const backContent = await getBlockText(backBlockId);
                const backClozes = ClozeDetector.extractClozes(backContent);
                
                if (backClozes.length > 0) {
                  const frontBlockId = blockIds[0];
                  const frontContent = await getBlockText(frontBlockId);
                  
                  backClozeInfo = {
                    originalContent: `${frontContent} → ${backContent}`,
                    front: frontContent,
                    back: backContent,
                    clozes: backClozes,
                    direction: 'forward' as const,
                    symbol: template.name
                  };
                  
                  console.log('[DialogManager] Detected back clozes in template card:', backClozes.length);
                }
              }

              // 创建 Xiuyuan 和卡片（使用 XiuyuanApplicationService）
              const result = await xiuyuanAppService.createFromBlocks({
                blockIds,
                templateId,
                fieldMapping,
                deckId: riff.BUILTIN_DECK_ID,
                backClozeInfo  // 🆕 添加背面挖空信息
              });

              if (!result.ok) {
                console.error('[DialogManager] Failed to create template card:', result.error);
                pushErrMsg(`创建失败：${result.error.message}`);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              const { xiuyuan, cards } = result.value;
              console.log('[DialogManager] Xiuyuan created:', { xiuyuan, cards });

              // 🆕 CDF 概念定义卡：自动为概念文档块创建概念卡
              if (templateId === 'builtin-concept-definition') {
                await this.ensureConceptDocumentCard(fieldMapping, xiuyuanAppService);
              }

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
  // CDF 概念定义卡辅助方法
  // ========================================================================
  
  /**
   * 确保概念文档块有对应的概念卡
   * 如果概念文档块还不是卡片，自动创建 Xiuyuan 概念卡
   * 
   * @param fieldMapping 字段映射（包含 concept 字段）
   * @param xiuyuanAppService Xiuyuan 应用服务
   */
  private async ensureConceptDocumentCard(
    fieldMapping: Record<string, string>,
    xiuyuanAppService: any
  ): Promise<void> {
    try {
      const conceptBlockId = fieldMapping['concept'];
      if (!conceptBlockId) {
        console.warn('[DialogManager] No concept field in fieldMapping');
        return;
      }
      
      console.log('[DialogManager] Ensuring concept document card:', conceptBlockId);
      
      // 1. 获取概念块的引用目标（文档块）
      const blockQuery = `
        SELECT * FROM blocks WHERE id = '${conceptBlockId}'
      `;
      const blockResult = await sql(blockQuery);
      
      if (!blockResult || blockResult.length === 0) {
        console.warn('[DialogManager] Concept block not found:', conceptBlockId);
        return;
      }
      
      const block = blockResult[0];
      
      // 2. 提取块引用 ID
      const refMatch = block.markdown?.match(/\(\((\d{14}-[a-z0-9]{7})\s+'[^']*'\)\)/);
      if (!refMatch) {
        console.warn('[DialogManager] No block reference found in concept block');
        return;
      }
      
      const refBlockId = refMatch[1];
      console.log('[DialogManager] Found reference block ID:', refBlockId);
      
      // 3. 验证引用的块是文档块
      const refBlockQuery = `
        SELECT * FROM blocks WHERE id = '${refBlockId}'
      `;
      const refBlockResult = await sql(refBlockQuery);
      
      if (!refBlockResult || refBlockResult.length === 0) {
        console.warn('[DialogManager] Referenced block not found:', refBlockId);
        return;
      }
      
      const refBlock = refBlockResult[0];
      if (refBlock.type !== 'd') {
        console.warn('[DialogManager] Referenced block is not a document:', refBlock.type);
        return;
      }
      
      const conceptName = refBlock.content || '未命名概念';
      console.log('[DialogManager] Concept document:', conceptName);
      
      // 4. 检查是否已经是卡片
      const cardQuery = `
        SELECT value 
        FROM attributes 
        WHERE block_id = '${refBlockId}' 
          AND name = 'custom-fsrs-card-id'
      `;
      const cardResult = await sql(cardQuery);
      
      if (cardResult && cardResult.length > 0) {
        console.log('[DialogManager] Concept document already has card:', refBlockId);
        return;
      }
      
      // 5. 创建 Xiuyuan 概念卡
      console.log('[DialogManager] Creating Xiuyuan concept card for:', conceptName);
      
      const result = await xiuyuanAppService.createFromBlocks({
        blockIds: [refBlockId],
        templateId: 'builtin-concept-simple',
        fieldMapping: {
          concept: refBlockId
        },
        deckId: riff.BUILTIN_DECK_ID
      });
      
      if (!result.ok) {
        const error = (result as { ok: false; error: Error }).error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[DialogManager] Failed to create concept card:', errorMsg);
        return;
      }
      
      // 6. 标记为概念卡类型
      const { setBlockAttrs } = await import('@/core/siyuan/api');
      await setBlockAttrs(refBlockId, {
        'custom-fsrs-card-type': 'concept'
      });
      
      console.log('[DialogManager] Concept card created for document:', refBlockId);
      
      pushMsg(`✅ 已为概念「${conceptName}」创建概念卡`);
      
    } catch (error) {
      console.error('[DialogManager] Failed to ensure concept document card:', error);
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
