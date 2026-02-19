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
            const { HybridSyncService } = await import('@/services');
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
            const { HybridSyncService } = await import('@/services');
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
                const { TransactionWebSocketService } = await import('@/services/TransactionWebSocketService');
                const { RiffSyncHandler } = await import('@/services/handlers/RiffSyncHandler');
                const { AutoCardHandler } = await import('@/services/handlers/AutoCardHandler');
                
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
    
    this.srsBrowserDialog = createVueDialog({
      dataKey: 'srs-browser-dialog',
      title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        plugin: this.plugin,
        storage,
        scheduler,
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
  // 复习对话框（委托给 ReviewDialogManager）
  // ========================================================================
  
  /**
   * 打开复习对话框
   * 
   * 注意：复习对话框由 ReviewDialogManager 管理，
   * 这里只是提供一个便捷的访问方法。
   */
  async openReviewDialog(): Promise<void> {
    // 复习对话框由 ReviewDialogManager 管理
    // 这里通过 plugin 访问 reviewDialogManager
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openRetrievalPractice();
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开渐进学习对话框
   */
  async openIncrementalLearningDialog(): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openIncrementalLearning();
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开刻意练习对话框
   */
  async openFinalDrillDialog(): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openFinalDrill();
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开筛选复习对话框
   */
  async openFilterGroupPracticeDialog(): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openFilterGroupPractice();
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开神经漫游对话框
   */
  async openNeuralRoamDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openNeuralRoam(options);
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开难点攻坚对话框
   */
  async openLeechReviewDialog(): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openLeechReview();
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
    }
  }
  
  /**
   * 打开子集复习对话框
   */
  async openSubsetReviewDialog(blockIds: string[]): Promise<void> {
    const reviewDialogManager = (this.plugin as any).reviewDialogManager;
    if (reviewDialogManager) {
      await reviewDialogManager.openSubsetReview(blockIds);
    } else {
      console.error('[DialogManager] ReviewDialogManager not found');
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
    if (this.templateSelectDialog) {
      this.templateSelectDialog.destroy();
      this.templateSelectDialog = null;
    }
  }
}
