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
import MobileReviewLauncher from '@/ui/mobile/MobileReviewLauncher.vue';
import { TemplateSelectDialog } from '@/ui/xiuyuan';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import {
  QueueType,
  isNeuralRoamSessionQueue,
  type CardFilter,
  type IReviewQueue,
} from '@/types/unified-data-source';
import { ReviewView } from '@/ui/review/v2';
import { LeechReviewQueue } from '@/core/queue/domain/LeechReviewQueue';
import { SubsetReviewQueue } from '@/core/queue/domain/SubsetReviewQueue';
import { TemporaryDrillQueue } from '@/core/queue/domain/TemporaryDrillQueue';
import { SiyuanLeechActionEffectsAdapter } from '@/infrastructure/queue/SiyuanLeechActionEffectsAdapter';
import { createLogger } from '@/utils/logger';
import type { PluginSettings, RiffIntegrationConfig } from '@/types/settings';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { findConceptByUpwardSearch } from '@/application/usecases/xiuyuan/shared/ConceptLocator';
import { resolveListChildrenBySubtype } from '@/application/usecases/xiuyuan/shared/ListChildrenResolver';
import { resolveCdfMultilineScan } from '@/application/usecases/xiuyuan/shared/CdfMultilineScanner';
import {
  hasExpectedCdfTailMarkerFromSources,
  type CdfMultilineTemplateId,
} from '@/application/usecases/xiuyuan/shared/CdfTailMarker';
import {
  detectDescriptorOrDefinitionKind,
  isDefinitionTemplate,
  templateIdFromDescriptorOrDefinitionKind,
} from '@/application/usecases/xiuyuan/shared/DescriptorTemplateStrategy';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';

const logger = createLogger('DialogManager');

type VueDialogHandle = ReturnType<typeof createVueDialog>;
type PluginWithMobileFlag = Plugin & { isMobile?: boolean };
type MobileLauncherQueueId =
  | 'retrieval'
  | 'incremental-learning'
  | 'final-drill'
  | 'neural-roam'
  | 'filter-group';

type SettingsPanelSavePayload = {
  requestRetention?: number;
  maximumInterval?: number;
  enableShortTerm?: boolean;
  params?: number[];
  dayStartHour?: number;
  priorityRandomness?: number;
  queues?: PluginSettings['queues'];
  scheduler?: PluginSettings['scheduler'];
  riffIntegration?: RiffIntegrationConfig;
  incremental?: PluginSettings['incremental'];
  quickCard?: PluginSettings['quickCard'];
  ui?: PluginSettings['ui'];
};

interface QueueBufferSnapshot {
  localBuffer?: unknown[];
  cards?: unknown[];
  buffer?: unknown[];
}

interface FilterGroupQueueLike extends IReviewQueue {
  setFilter?: (filter: CardFilter) => void | Promise<void>;
  clearTemporaryBlacklist?: () => void | Promise<void>;
}

function hasFilterSetter(queue: IReviewQueue | null): queue is FilterGroupQueueLike {
  return Boolean(queue && typeof (queue as FilterGroupQueueLike).setFilter === 'function');
}

function hasTemporaryBlacklistCleaner(queue: IReviewQueue | null): queue is FilterGroupQueueLike {
  return Boolean(queue && typeof (queue as FilterGroupQueueLike).clearTemporaryBlacklist === 'function');
}

interface BlockSqlRow {
  id: string;
  type?: string;
  subtype?: string;
  parent_id?: string;
  content?: string;
  markdown?: string;
}

interface AttributeSqlRow {
  name?: string;
  value?: string;
}

const FW_SEMICOLON = '\uFF1B';
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060]/g;
const DESCRIPTOR_MULTILINE_TAIL_RE = new RegExp(`\\s*(;;;|${FW_SEMICOLON}{3})\\s*$`);

function normalizeForTextParsing(text: string): string {
  return (text || '')
    .replace(/\{:[^}]*\}/g, '')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
}

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
  
  private settingsDialog: VueDialogHandle | null = null;
  private srsBrowserDialog: VueDialogHandle | null = null;
  private mobileQueueLauncherDialog: VueDialogHandle | null = null;
  private templateSelectDialog: VueDialogHandle | null = null;
  private currentReviewDialog: VueDialogHandle | null = null;
  private readonly conceptCardEnsureInFlight = new Set<string>();
  
  // ========================================================================
  // 构造函数
  // ========================================================================
  
  private readonly siyuanApi: ManagerSiyuanPort;

  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    ports?: { siyuanApi?: ManagerSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new ManagerSiyuanAdapter();
  }

  private isMobileFrontend(): boolean {
    return (this.plugin as PluginWithMobileFlag).isMobile === true;
  }

  private resolveBrowserDialogSize(): { width: string; height: string } {
    if (this.isMobileFrontend()) {
      return { width: '100vw', height: '100vh' };
    }

    const screenWidth = window.innerWidth;
    if (screenWidth < 1024) return { width: '94vw', height: '90vh' };
    if (screenWidth < 1440) return { width: '92vw', height: '90vh' };
    if (screenWidth < 1920) return { width: '90vw', height: '90vh' };
    return { width: '88vw', height: '90vh' };
  }

  private resolveReviewDialogSize(): { width: string; height: string } {
    if (this.isMobileFrontend()) {
      return { width: '100vw', height: '100vh' };
    }
    return { width: 'min(860px, 96vw)', height: 'min(720px, 90vh)' };
  }

  private async openQueueFromMobileLauncher(queueId: MobileLauncherQueueId): Promise<void> {
    switch (queueId) {
      case 'retrieval':
        await this.openReviewDialog();
        return;
      case 'incremental-learning':
        await this.openIncrementalLearningDialog();
        return;
      case 'final-drill':
        await this.openFinalDrillDialog();
        return;
      case 'neural-roam':
        await this.openNeuralRoamDialog();
        return;
      case 'filter-group':
        await this.openFilterGroupPracticeDialog();
        return;
      default:
        return;
    }
  }
  
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
    const schedulerRouter = this.context.getScheduler();
    const storage = this.context.getStorage();
    const hybridSyncService = this.context.getHybridSyncService();
    const practiceQueueManager = this.context.getPracticeQueueManager();
    const retrievalQueue = this.context.getRetrievalQueue() as QueueBufferSnapshot;
    const queueCount = (() => {
      try {
        const candidates = [
          retrievalQueue?.localBuffer?.length,
          retrievalQueue?.cards?.length,
          retrievalQueue?.buffer?.length,
        ];
        for (const candidate of candidates) {
          if (Number.isFinite(candidate)) {
            return Math.max(0, Number(candidate));
          }
        }
      } catch (error) {
        logger.warn('[DialogManager] Failed to resolve retrieval queue count:', error);
      }
      return 0;
    })();
    
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
        priorityRandomness: currentSettings.priorityRandomness,
        schedulerSettings: currentSettings.scheduler,
        riffIntegrationSettings: currentSettings.riffIntegration,
        incrementalSettings: currentSettings.incremental,
        quickCardSettings: currentSettings.quickCard,
        uiSettings: { enableDebugLogs: currentSettings.ui?.enableDebugLogs ?? false },
        i18n: this.context.getI18n() || {},
        defaultTab,
        queueCount,
        queueHandlers: {
          preview: (filter: CardFilter) => practiceQueueManager.previewPracticeQueue(filter),
          add: (filter: CardFilter) => practiceQueueManager.addPracticeQueue(filter),
          start: () => practiceQueueManager.startPracticeQueue(() => {
            void this.openReviewDialog();
          }),
          clear: () => practiceQueueManager.clearPracticeQueue(),
        },
      },
      events: {
        save: async (settings: SettingsPanelSavePayload) => {
          // 🔍 调试日志：检查接收到的 quickCard 配置
          logger.info('[DialogManager] Received settings with quickCard:', settings.quickCard);
          
          const updatedSettings = {
            ...currentSettings,
            fsrs: {
              ...currentSettings.fsrs,
              requestRetention: settings.requestRetention ?? currentSettings.fsrs.requestRetention,
              maximumInterval: settings.maximumInterval ?? currentSettings.fsrs.maximumInterval,
              enableShortTerm: settings.enableShortTerm ?? currentSettings.fsrs.enableShortTerm,
              weights: settings.params ?? currentSettings.fsrs.weights,
              dayStartHour: settings.dayStartHour ?? 4,
            },
            queues: settings.queues || currentSettings.queues,
            priorityRandomness: settings.priorityRandomness ?? currentSettings.priorityRandomness,
            scheduler: settings.scheduler || currentSettings.scheduler,
            riffIntegration: settings.riffIntegration || currentSettings.riffIntegration,
            incremental: settings.incremental || currentSettings.incremental,
            quickCard: settings.quickCard || currentSettings.quickCard,
            ui: settings.ui || currentSettings.ui,
          };
          
          // 🔍 调试日志：检查合并后的 quickCard 配置
          logger.info('[DialogManager] Merged settings with quickCard:', updatedSettings.quickCard);
          
          await settingsService.updateSettings(updatedSettings);
          schedulerRouter.updateConfig({
            defaultScheduler: updatedSettings.scheduler.defaultScheduler,
            enableRiffSync: updatedSettings.scheduler.enableRiffSync,
            fsrsParams: updatedSettings.fsrs,
          });
          logger.info('[DialogManager] ✅ SchedulerRouter config updated');

          const conflictStrategy = updatedSettings.riffIntegration?.storageConflictResolution || 'merge';
          this.context.getUnifiedStorage().setConflictResolutionStrategy(conflictStrategy);
          logger.info('[DialogManager] ✅ UnifiedStorage conflict strategy updated:', conflictStrategy);

          // 更新 HybridSyncService 配置 (符合 DDD 架构)
          if (settings.riffIntegration && hybridSyncService) {
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
              this.siyuanApi.pushMsg(`已修复 ${result.fixed}/${result.total} 张卡片的无效日期`, 5000);
            } else {
              this.siyuanApi.pushMsg(`检查完成，未发现问题（共 ${result.total} 张卡片）`, 3000);
            }
          } catch (err) {
            logger.error('[DialogManager] Failed to repair dates:', err);
            this.siyuanApi.pushErrMsg(`修复失败: ${(err as Error).message}`);
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

  async openMobileQueueLauncherDialog(): Promise<void> {
    if (this.mobileQueueLauncherDialog) {
      this.mobileQueueLauncherDialog.destroy();
    }

    let counts: Record<string, number> = {};
    try {
      counts = await this.context.getBrowserService().getQueueCounts();
    } catch (error) {
      logger.warn('[DialogManager] Failed to load queue counts for mobile launcher:', error);
    }

    this.mobileQueueLauncherDialog = createVueDialog({
      hideTitle: true,
      component: MobileReviewLauncher,
      transparent: true,
      props: {
        i18n: this.context.getI18n() || {},
        counts,
      },
      events: {
        openQueue: async (queueId: MobileLauncherQueueId) => {
          this.closeMobileQueueLauncherDialog();
          await this.openQueueFromMobileLauncher(queueId);
        },
        openBrowser: () => {
          this.closeMobileQueueLauncherDialog();
          this.openBrowserDialog();
        },
        close: () => {
          this.closeMobileQueueLauncherDialog();
        },
      },
      width: '100vw',
      height: '100vh',
      onClose: () => {
        this.mobileQueueLauncherDialog = null;
      },
    });
  }

  closeMobileQueueLauncherDialog(): void {
    if (this.mobileQueueLauncherDialog) {
      this.mobileQueueLauncherDialog.destroy();
      this.mobileQueueLauncherDialog = null;
    }
  }
  
  // ========================================================================
  // SRS 浏览器对话框
  // ========================================================================
  
  /**
   * 打开 SRS 浏览器对话框
   */
  openBrowserDialog(options?: {
    initialQueueId?: string;
    initialNeuralSubview?: 'concept-cards' | 'focus-blocks' | 'roam-history';
  }): void {
    if (this.srsBrowserDialog) {
      this.srsBrowserDialog.destroy();
    }

    const storage = this.context.getStorage();
    const scheduler = this.context.getScheduler();
    const browserService = this.context.getBrowserService();
    const tabApplicationService = this.context.getTabApplicationService();
    const { width, height } = this.resolveBrowserDialogSize();
    
    this.srsBrowserDialog = createVueDialog({
      dataKey: 'srs-browser-dialog',
      title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        app: this.plugin.app,
        plugin: this.plugin,
        storage,
        scheduler,
        browserService,
        tabApplicationService,
        i18n: this.context.getI18n(),
        mobileMode: this.isMobileFrontend(),
        initialQueueId: options?.initialQueueId,
        initialNeuralSubview: options?.initialNeuralSubview,
      },
      events: {
        close: () => this.closeBrowserDialog(),
      },
      width,
      height,
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
      await this.siyuanApi.pushErrMsg('FSRS 插件初始化失败，请打开控制台查看错误');
      return false;
    }
    return true;
  }

  private async prepareQueueBeforeReview(queueType: QueueType): Promise<void> {
    if (queueType !== QueueType.RetrievalPractice && queueType !== QueueType.IncrementalLearning) {
      return;
    }

    const preparationService = this.context.getReviewQueuePreparationService?.();
    if (!preparationService || typeof preparationService.prepareBeforeReview !== 'function') {
      return;
    }

    try {
      await preparationService.prepareBeforeReview(queueType);
    } catch (error) {
      logger.warn('[DialogManager] Review queue preparation failed, continue opening dialog:', {
        queueType,
        error,
      });
    }
  }
  
  /**
   * 打开提取练习对话框
   */
  async openReviewDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();
    await this.prepareQueueBeforeReview(QueueType.RetrievalPractice);

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
      
      logger.info('[DialogManager] ✅ Retrieval practice dialog created');
    } catch (err) {
      logger.error('[DialogManager] Failed to open retrieval practice dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.loadFailed || '加载失败');
    }
  }
  
  /**
   * 打开渐进学习对话框
   */
  async openIncrementalLearningDialog(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();
    await this.prepareQueueBeforeReview(QueueType.IncrementalLearning);

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
      
      logger.info('[DialogManager] ✅ Incremental learning dialog created');
    } catch (err) {
      logger.error('[DialogManager] Failed to open incremental learning dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.openFailed || '打开渐进学习失败');
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
      
      logger.info('[DialogManager] ✅ Final drill dialog created');
    } catch (err) {
      logger.error('[DialogManager] Failed to open final drill dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.drillFailed || '机械练习启动失败');
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
      
      logger.info('[DialogManager] ✅ Filter group dialog created');
    } catch (err) {
      logger.error('[DialogManager] Failed to open filter group practice dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.openFailed || '打开分组队列失败');
    }
  }
  
  /**
   * 打开神经漫游对话框
   * 
   * @param options 可选配置
   * @param options.focusBlockId 焦点块 ID
   * @param options.includeFocusAsFirst 是否将焦点块作为第一张卡片
   * @param options.resetHistory 是否重置历史记录
   */
  async openNeuralRoamDialog(options?: { 
    focusBlockId?: string;
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean 
  }): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentReviewDialog();

    try {
      const neuralQueue = this.context.getUnifiedDataSourceManager().getQueue(QueueType.NeuralRoam);

      if (isNeuralRoamSessionQueue(neuralQueue)) {
        const focusBlockId = options?.focusBlockId;
        const includeFocusAsFirst = options?.includeFocusAsFirst ?? true;
        const resetHistory = options?.resetHistory === true;

        if (focusBlockId) {
          await neuralQueue.startRoamingFromFocus(focusBlockId, {
            includeFocusAsFirst,
            resetHistory,
          });
        } else if (resetHistory) {
          neuralQueue.clearHistory('all');
        }
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

      logger.info('[DialogManager] ✅ Neural roam dialog created');
    } catch (err) {
      logger.error('[DialogManager] Failed to open neural roam dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.neuralReviewFailed || '神经复习启动失败');
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
      const leech = settings.leech;

      const manager = this.context.getUnifiedDataSourceManager();
      const queue = new LeechReviewQueue(manager, {
        threshold: Number(leech?.threshold) || 8,
        action: leech?.action || 'notify',
        tagName: String(leech?.tagName || ''),
        effects: new SiyuanLeechActionEffectsAdapter(),
      });

      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.Leech,
        queueInstance: queue,
        title: this.context.getI18n()?.startLeechPractice || '难点攻坚',
        eventBus: this.context.getEventBus(),
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
    } catch (err) {
      logger.error('[DialogManager] Failed to open leech review dialog:', err);
      await this.siyuanApi.pushErrMsg('难点攻坚启动失败');
    }
  }
  
  /**
   * 打开子集复习对话框
   */
  async openSubsetReviewDialog(
    blockIds: string[],
    options?: {
      preferredCardId?: string;
    }
  ): Promise<void> {
    this.destroyCurrentReviewDialog();

    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await this.siyuanApi.pushMsg(this.context.getI18n()?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    try {
      const manager = this.context.getUnifiedDataSourceManager();
      const preferredCardId = String(options?.preferredCardId || '').trim();
      const queue = new SubsetReviewQueue(manager, ids, {
        preferredCardId: preferredCardId.length > 0 ? preferredCardId : undefined,
      });
      const title = (this.context.getI18n()?.reviewSubsetTitleWithCount || '子集复习 ({n} 张)').replace('{n}', String(ids.length));

      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.FilterGroup,
        queueInstance: queue,
        title,
        eventBus: this.context.getEventBus(),
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
    } catch (err) {
      logger.error('[DialogManager] Failed to open subset review dialog:', err);
      await this.siyuanApi.pushErrMsg('打开子集复习失败');
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
      const filter: CardFilter = {
        blockIds: options.blockIds,
        cardType: 'item',  // 只接受 Item
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      logger.info('[DialogManager] 🔍 openRetrievalPracticeWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
      });
      
      // 应用过滤条件
      if (hasFilterSetter(filterGroupQueue)) {
        await filterGroupQueue.setFilter(filter);
      }
      
      // 清除临时黑名单（全部模式）
      if (!options.dueOnly && hasTemporaryBlacklistCleaner(filterGroupQueue)) {
        await filterGroupQueue.clearTemporaryBlacklist();
        logger.info('[DialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用依赖注入）
      const eventBus = this.context.getEventBus();
      const schedulerRouter = this.context.getSchedulerRouter();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRouter);
      const adapter = new UnifiedReviewAdapter({ i18n: this.context.getI18n() || {} });
      const { width, height } = this.resolveReviewDialogSize();
      const isMobile = this.isMobileFrontend();
      
      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        isMobile,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title: this.context.getI18n()?.retrievalPractice || '提取练习',
          queue,
          adapter,
          plugin: this.plugin,
          isMobile,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (hasFilterSetter(filterGroupQueue)) {
              void filterGroupQueue.setFilter({});
            }
            this.destroyCurrentReviewDialog();
          },
        },
        width,
        height,
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
      
      logger.info('[DialogManager] ✅ Retrieval practice dialog created with blockIds filter');
    } catch (err) {
      logger.error('[DialogManager] Failed to open retrieval practice dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.loadFailed || '加载失败');
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
      const filter: CardFilter = {
        blockIds: options.blockIds,
        // 渐进学习接受所有类型（Item + Topic）
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      logger.info('[DialogManager] 🔍 openIncrementalLearningWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
      });
      
      // 应用过滤条件
      if (hasFilterSetter(filterGroupQueue)) {
        await filterGroupQueue.setFilter(filter);
      }
      
      // 清除临时黑名单（全部模式）
      if (!options.dueOnly && hasTemporaryBlacklistCleaner(filterGroupQueue)) {
        await filterGroupQueue.clearTemporaryBlacklist();
        logger.info('[DialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用依赖注入）
      const eventBus = this.context.getEventBus();
      const schedulerRouter = this.context.getSchedulerRouter();
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRouter);
      const adapter = new UnifiedReviewAdapter({ i18n: this.context.getI18n() || {} });
      const { width, height } = this.resolveReviewDialogSize();
      const isMobile = this.isMobileFrontend();
      
      this.currentReviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        isMobile,
        props: {
          app: this.plugin.app,
          i18n: this.context.getI18n() || {},
          title: this.context.getI18n()?.incrementalLearning || '渐进学习',
          queue,
          adapter,
          plugin: this.plugin,
          isMobile,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (hasFilterSetter(filterGroupQueue)) {
              void filterGroupQueue.setFilter({});
            }
            this.destroyCurrentReviewDialog();
          },
        },
        width,
        height,
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });
      
      logger.info('[DialogManager] ✅ Incremental learning dialog created with blockIds filter');
    } catch (err) {
      logger.error('[DialogManager] Failed to open incremental learning dialog:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.openFailed || '打开渐进学习失败');
    }
  }
  
  /**
   * 打开临时练习对话框
   * 
   * @param blockIds 块 ID 列表
   */
  async openTemporaryDrill(blockIds: string[]): Promise<void> {
    this.destroyCurrentReviewDialog();

    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await this.siyuanApi.pushMsg(this.context.getI18n()?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    try {
      const manager = this.context.getUnifiedDataSourceManager();
      const queue = new TemporaryDrillQueue(manager, ids);
      const title = (this.context.getI18n()?.temporaryDrill || '临时练习') + ` (${ids.length} 张)`;

      this.currentReviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.FinalDrill,
        queueInstance: queue,
        title,
        eventBus: this.context.getEventBus(),
        onClose: () => {
          this.currentReviewDialog = null;
        },
      });

      logger.info('[DialogManager] ✅ Temporary drill dialog opened');
    } catch (err) {
      logger.error('[DialogManager] Failed to open temporary drill:', err);
      await this.siyuanApi.pushErrMsg(this.context.getI18n()?.drillFailed || '临时练习启动失败');
    }
  }
  
  // ========================================================================
  // 模板卡片对话框
  // ========================================================================
  
  async createCdfMultilineTemplateCards(
    blockIds: string[],
    templateId: CdfMultilineTemplateId,
    options?: { skipSymbolConfirmation?: boolean }
  ): Promise<void> {
    await this.handleCdfMultilineTemplateCard(blockIds, templateId, options);
  }

  private async resolveListItemAnchorBlockId(selectedBlockId: string): Promise<string | null> {
    const safeSelectedBlockId = selectedBlockId.replace(/'/g, "''");
    const selectedRows = await this.siyuanApi.sql<BlockSqlRow>(`
      SELECT id, type, parent_id
      FROM blocks
      WHERE id = '${safeSelectedBlockId}'
      LIMIT 1
    `);
    if (!selectedRows || selectedRows.length === 0) {
      return null;
    }

    const selected = selectedRows[0];
    if (selected.type === 'i') {
      return selected.id;
    }
    if (selected.type !== 'p' || typeof selected.parent_id !== 'string' || selected.parent_id.length === 0) {
      return null;
    }

    const safeParentId = selected.parent_id.replace(/'/g, "''");
    const parentRows = await this.siyuanApi.sql<BlockSqlRow>(`
      SELECT id, type
      FROM blocks
      WHERE id = '${safeParentId}'
      LIMIT 1
    `);
    if (!parentRows || parentRows.length === 0 || parentRows[0].type !== 'i') {
      return null;
    }

    return parentRows[0].id;
  }

  private extractDescriptorGroupHint(source: string): string {
    const normalized = normalizeForTextParsing(source);
    if (!normalized) {
      return '';
    }
    const stripped = normalized.replace(DESCRIPTOR_MULTILINE_TAIL_RE, '').trim();
    return stripped || normalized;
  }

  private parseCueAndAnswerFromText(source: string): { cue: string; answer: string } {
    const text = normalizeForTextParsing(source);
    const unicodeArrow = '\u2192';
    const delimiter = text.includes(unicodeArrow) ? unicodeArrow : '->';
    const parts = text.split(delimiter);
    if (parts.length >= 2) {
      return {
        cue: parts[0].trim(),
        answer: parts.slice(1).join(delimiter).trim(),
      };
    }
    return {
      cue: '',
      answer: text,
    };
  }

  private hasExpectedTailMarker(
    parentParagraphKramdown: string,
    parentParagraphText: string,
    templateId: CdfMultilineTemplateId,
    fallbackParentKramdown?: string
  ): boolean {
    return hasExpectedCdfTailMarkerFromSources(
      [parentParagraphKramdown, parentParagraphText, fallbackParentKramdown],
      templateId
    );
  }

  private async confirmProceedWhenSymbolMissing(templateId: CdfMultilineTemplateId): Promise<boolean> {
    const expected = templateId === 'builtin-list-concept-multiline' ? ':::' : ';;;';
    const i18n = this.context.getI18n() || {};
    const title = i18n.cdfMultilineMarkerConfirmTitle || 'Symbol mismatch';
    const descriptionTemplate = i18n.cdfMultilineMarkerConfirmDesc
      || 'No tail marker {marker} found on parent block. Continue anyway?';
    const description = descriptionTemplate.replace('{marker}', expected);
    const continueLabel = i18n.cdfMultilineMarkerContinue || 'Continue';
    const cancelLabel = i18n.cancel || 'Cancel';

    return new Promise((resolve) => {
      const { Dialog } = require('siyuan');
      const dialog = new Dialog({
        title,
        content: `
          <div class="b3-dialog__content" style="padding: 16px;">
            <div style="margin-bottom: 12px;">${description}</div>
          </div>
          <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel" data-action="cancel">${cancelLabel}</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text" data-action="continue">${continueLabel}</button>
          </div>
        `,
        width: '460px',
      });

      const element = dialog.element;
      element.querySelector('[data-action=\"cancel\"]')?.addEventListener('click', () => {
        dialog.destroy();
        resolve(false);
      });
      element.querySelector('[data-action=\"continue\"]')?.addEventListener('click', () => {
        dialog.destroy();
        resolve(true);
      });
    });
  }

  private async resolveConceptDocumentIdFromReference(parentKramdown: string): Promise<string | null> {
    const refMatches = [...parentKramdown.matchAll(/\(\((\d{14}-[a-z0-9]{7})/g)];
    if (refMatches.length === 0) {
      return null;
    }

    for (const match of refMatches) {
      const conceptBlockId = match[1];
      const safeConceptBlockId = conceptBlockId.replace(/'/g, "''");
      const typeResult = await this.siyuanApi.sql<BlockSqlRow>(`
        SELECT type
        FROM blocks
        WHERE id = '${safeConceptBlockId}'
        LIMIT 1
      `);
      if (typeResult && typeResult.length > 0 && typeResult[0].type === 'd') {
        return conceptBlockId;
      }
    }

    return null;
  }

  private async ensureConceptCardById(
    conceptBlockId: string,
    xiuyuanAppService: XiuyuanApplicationService
  ): Promise<void> {
    if (!conceptBlockId) {
      return;
    }

    if (this.conceptCardEnsureInFlight.has(conceptBlockId)) {
      logger.debug('[DialogManager] Concept card ensure already in flight, skipping:', conceptBlockId);
      return;
    }

    this.conceptCardEnsureInFlight.add(conceptBlockId);
    try {
      const safeConceptBlockId = conceptBlockId.replace(/'/g, "''");
      const conceptRows = await this.siyuanApi.sql<BlockSqlRow>(`
        SELECT id, content
        FROM blocks
        WHERE id = '${safeConceptBlockId}'
        LIMIT 1
      `);
      if (!conceptRows || conceptRows.length === 0) {
        logger.warn('[DialogManager] Concept block not found:', conceptBlockId);
        return;
      }

      const conceptName = conceptRows[0].content || '未命名概念';
      const attrRows = await this.siyuanApi.sql<AttributeSqlRow>(`
        SELECT name, value
        FROM attributes
        WHERE block_id = '${safeConceptBlockId}'
          AND name IN (
            'custom-fsrs-card-id',
            'custom-xiuyuan-id',
            'custom-fsrs-xiuyuan-id',
            'custom-fsrs-card-type'
          )
      `);

      const hasXiuyuanId = (attrRows || []).some((row) => {
        if (row.name !== 'custom-xiuyuan-id' && row.name !== 'custom-fsrs-xiuyuan-id') {
          return false;
        }
        return typeof row.value === 'string' && row.value.trim().length > 0;
      });
      const hasLegacyCardId = (attrRows || []).some(
        (row) => row.name === 'custom-fsrs-card-id' && typeof row.value === 'string' && row.value.trim().length > 0
      );
      const isConceptType = (attrRows || []).some(
        (row) => row.name === 'custom-fsrs-card-type' && row.value === 'concept'
      );
      if (hasXiuyuanId || hasLegacyCardId || isConceptType) {
        return;
      }

      const result = await xiuyuanAppService.createFromBlocks({
        blockIds: [conceptBlockId],
        templateId: 'builtin-concept-simple',
        fieldMapping: {
          concept: conceptBlockId,
        },
        deckId: this.siyuanApi.BUILTIN_DECK_ID,
      });
      if (!result.ok) {
        logger.error('[DialogManager] Failed to auto-create concept card:', result.error);
        return;
      }

      await this.siyuanApi.setBlockAttrs(conceptBlockId, {
        'custom-fsrs-card-type': 'concept',
      });
      this.siyuanApi.pushMsg(`✅ 已为概念「${conceptName}」创建概念卡`);
    } catch (error) {
      logger.error('[DialogManager] Failed to ensure concept card:', error);
    } finally {
      this.conceptCardEnsureInFlight.delete(conceptBlockId);
    }
  }

  private async hasXiuyuanBindingOnBlock(blockId: string): Promise<boolean> {
    const safeBlockId = blockId.replace(/'/g, "''");
    const attrRows = await this.siyuanApi.sql<AttributeSqlRow>(`
      SELECT name, value
      FROM attributes
      WHERE block_id = '${safeBlockId}'
        AND name IN ('custom-xiuyuan-id', 'custom-fsrs-xiuyuan-id')
      LIMIT 2
    `);

    return (attrRows || []).some((row) => typeof row.value === 'string' && row.value.trim().length > 0);
  }

  private async getFirstParagraphForListItem(listItemId: string): Promise<BlockSqlRow | null> {
    const safeListItemId = listItemId.replace(/'/g, "''");
    const rows = await this.siyuanApi.sql<BlockSqlRow>(`
      SELECT id, content, markdown
      FROM blocks
      WHERE parent_id = '${safeListItemId}'
        AND type = 'p'
      ORDER BY sort ASC, id ASC
      LIMIT 1
    `);

    return rows && rows.length > 0 ? rows[0] : null;
  }

  private async hasXiuyuanBindingOnParagraphOrListItem(paragraphId: string, listItemId?: string): Promise<boolean> {
    const targets = [paragraphId];
    if (typeof listItemId === 'string' && listItemId.length > 0) {
      targets.push(listItemId);
    }

    const bindingFlags = await Promise.all(targets.map((targetId) => this.hasXiuyuanBindingOnBlock(targetId)));
    return bindingFlags.some(Boolean);
  }

  private async createDescriptorCardsFromListItems(params: {
    listItemIds: string[];
    conceptBlockId: string;
    descriptorGroupHint: string;
    xiuyuanAppService: XiuyuanApplicationService;
  }): Promise<{ created: number; skipped: number; failed: number; firstError: string }> {
    const { listItemIds, conceptBlockId, descriptorGroupHint, xiuyuanAppService } = params;

    let created = 0;
    let skipped = 0;
    let failed = 0;
    let firstError = '';
    const setFirstError = (message: string): void => {
      if (!firstError) {
        firstError = message;
      }
    };

    for (const listItemId of listItemIds) {
      const paragraph = await this.getFirstParagraphForListItem(listItemId);
      if (!paragraph?.id) {
        failed += 1;
        setFirstError(`子级缺少段落块：${listItemId}`);
        continue;
      }

      const hasBinding = await this.hasXiuyuanBindingOnParagraphOrListItem(paragraph.id, listItemId);
      if (hasBinding) {
        skipped += 1;
        continue;
      }

      const paragraphContent = paragraph.markdown || paragraph.content || '';
      const parsedCueAnswer = this.parseCueAndAnswerFromText(paragraph.content || paragraphContent);
      const kind = detectDescriptorOrDefinitionKind(paragraphContent);
      const descriptorKind = kind === 'descriptor-forward' || kind === 'descriptor-reverse' || kind === 'descriptor-both'
        ? kind
        : 'none';
      const descriptorTemplateId = templateIdFromDescriptorOrDefinitionKind(
        descriptorKind,
        'descriptor'
      );
      if (!descriptorTemplateId) {
        failed += 1;
        setFirstError(`无法解析描述符模板：${paragraph.id}`);
        continue;
      }

      const createResult = await xiuyuanAppService.createFromBlocks({
        blockIds: [conceptBlockId, paragraph.id],
        templateId: descriptorTemplateId,
        fieldMapping: {
          concept: conceptBlockId,
          descriptor: paragraph.id,
          cdf_group_hint: descriptorGroupHint,
          cdf_child_cue: parsedCueAnswer.cue,
          cdf_child_answer: parsedCueAnswer.answer,
        },
        deckId: this.siyuanApi.BUILTIN_DECK_ID,
        cardType: 'descriptor',
      });

      if (!createResult.ok) {
        failed += 1;
        setFirstError(createResult.error.message);
        continue;
      }

      created += 1;
    }

    return { created, skipped, failed, firstError };
  }

  private async handleCdfMultilineTemplateCard(
    blockIds: string[],
    templateId: CdfMultilineTemplateId,
    options?: { skipSymbolConfirmation?: boolean }
  ): Promise<void> {
    try {
      if (!blockIds || blockIds.length !== 1) {
        await this.siyuanApi.pushErrMsg('该模板仅支持单块创建');
        return;
      }

      const anchorBlockId = await this.resolveListItemAnchorBlockId(blockIds[0]);
      if (!anchorBlockId) {
        await this.siyuanApi.pushErrMsg('仅支持列表项块或其直属段落块');
        return;
      }

      const parentBlockId = anchorBlockId;
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      const fallbackForNone = templateId === 'builtin-list-concept-multiline' ? 'definition' : 'descriptor';

      const scanResult = await resolveCdfMultilineScan(parentBlockId, this.siyuanApi);
      if (scanResult.nodes.length === 0) {
        await this.siyuanApi.pushErrMsg('未找到可制卡的子级块');
        return;
      }

      if (
        !options?.skipSymbolConfirmation
        && !this.hasExpectedTailMarker(
          scanResult.parentParagraphKramdown,
          scanResult.parentParagraphText,
          templateId,
          scanResult.parentKramdown
        )
      ) {
        const shouldContinue = await this.confirmProceedWhenSymbolMissing(templateId);
        if (!shouldContinue) {
          await this.siyuanApi.pushMsg('已取消创建');
          return;
        }
      }

      let conceptBlockId: string | null = null;
      if (templateId === 'builtin-list-concept-multiline') {
        conceptBlockId = await this.resolveConceptDocumentIdFromReference(scanResult.parentParagraphKramdown);
        if (!conceptBlockId && scanResult.parentKramdown !== scanResult.parentParagraphKramdown) {
          conceptBlockId = await this.resolveConceptDocumentIdFromReference(scanResult.parentKramdown);
        }
        if (!conceptBlockId) {
          await this.siyuanApi.pushErrMsg('::: 模板要求父块中包含文档块引用概念');
          return;
        }
      } else {
        const located = await findConceptByUpwardSearch(
          parentBlockId,
          this.siyuanApi as unknown as XiuyuanSiyuanPort
        );
        if (!located) {
          await this.siyuanApi.pushErrMsg(';;; 模板未找到可用概念块（向上探路失败）');
          return;
        }
        conceptBlockId = located.conceptId;
      }

      await this.ensureConceptCardById(conceptBlockId, xiuyuanAppService);
      if (!conceptBlockId) {
        await this.siyuanApi.pushErrMsg('未找到可用概念块');
        return;
      }
      const resolvedConceptBlockId = conceptBlockId;

      const stats = {
        definitionCreated: 0,
        descriptorCreated: 0,
        skipped: 0,
        failed: 0,
        firstError: '' as string,
      };

      const setFirstError = (message: string): void => {
        if (!stats.firstError) {
          stats.firstError = message;
        }
      };

      for (const node of scanResult.nodes) {
        if (node.markerKind === 'descriptor-multiline') {
          const descriptorGroupHint = this.extractDescriptorGroupHint(
            node.firstParagraphKramdown || node.firstParagraphText
          );
          if (node.orderedChildListItemIds.length > 0) {
            const orderedResult = await this.createDescriptorCardsFromListItems({
              listItemIds: node.orderedChildListItemIds,
              conceptBlockId: resolvedConceptBlockId,
              descriptorGroupHint,
              xiuyuanAppService,
            });
            stats.descriptorCreated += orderedResult.created;
            stats.skipped += orderedResult.skipped;
            stats.failed += orderedResult.failed;
            if (orderedResult.firstError) {
              setFirstError(orderedResult.firstError);
            }
          }

          if (node.unorderedChildListItemIds.length > 0) {
            const unorderedResult = await this.createDescriptorCardsFromListItems({
              listItemIds: node.unorderedChildListItemIds,
              conceptBlockId: resolvedConceptBlockId,
              descriptorGroupHint,
              xiuyuanAppService,
            });
            stats.descriptorCreated += unorderedResult.created;
            stats.skipped += unorderedResult.skipped;
            stats.failed += unorderedResult.failed;
            if (unorderedResult.firstError) {
              setFirstError(unorderedResult.firstError);
            }
          }

          continue;
        }

        const resolvedTemplateId = templateIdFromDescriptorOrDefinitionKind(node.markerKind, fallbackForNone);
        if (!resolvedTemplateId) {
          continue;
        }

        const hasBinding = await this.hasXiuyuanBindingOnParagraphOrListItem(
          node.firstParagraphId,
          node.id
        );
        if (hasBinding) {
          stats.skipped += 1;
          continue;
        }

        const isDefinition = isDefinitionTemplate(resolvedTemplateId);
        const createResult = await xiuyuanAppService.createFromBlocks({
          blockIds: isDefinition
            ? [node.firstParagraphId, resolvedConceptBlockId]
            : [resolvedConceptBlockId, node.firstParagraphId],
          templateId: resolvedTemplateId,
          fieldMapping: isDefinition
            ? {
                concept: resolvedConceptBlockId,
                definition: node.firstParagraphId,
              }
            : {
                concept: resolvedConceptBlockId,
                descriptor: node.firstParagraphId,
              },
          deckId: this.siyuanApi.BUILTIN_DECK_ID,
          cardType: 'descriptor',
        });

        if (!createResult.ok) {
          stats.failed += 1;
          setFirstError(createResult.error.message);
          continue;
        }

        if (isDefinition) {
          stats.definitionCreated += 1;
        } else {
          stats.descriptorCreated += 1;
        }
      }

      const createdTotal = stats.definitionCreated + stats.descriptorCreated;
      if (createdTotal === 0 && stats.skipped === 0) {
        await this.siyuanApi.pushErrMsg(stats.firstError ? `创建失败：${stats.firstError}` : '未创建任何卡片');
        return;
      }

      const messageLines = [
        '✅ CDF 多行制卡完成',
        `定义卡：${stats.definitionCreated}`,
        `描述符卡：${stats.descriptorCreated}`,
        `跳过：${stats.skipped}`,
        `失败：${stats.failed}`,
      ];
      if (scanResult.stoppedByDocumentReference) {
        messageLines.push('探路范围已在下一条文档块引用处停止');
      }
      if (stats.failed > 0 && stats.firstError) {
        messageLines.push(`首个错误：${stats.firstError}`);
      }

      await this.siyuanApi.pushMsg(messageLines.join('\n'));
    } catch (err) {
      logger.error('[DialogManager] Failed to create CDF multiline list cards:', err);
      await this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 处理列表模版卡的创建（默认列表模式：有序逐条 + 无序汇总）
   */
  private async handleListTemplateCard(blockIds: string[], template: ICardTemplate): Promise<void> {
    try {
      if (blockIds.length === 0) {
        this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      const parentBlockId = blockIds[0];

      // 1. 检查块类型
      const typeResult = await this.siyuanApi.sql(`
        SELECT type, content FROM blocks
        WHERE id = '${parentBlockId}'
        LIMIT 1
      `);

      if (!typeResult || typeResult.length === 0) {
        this.siyuanApi.pushErrMsg('块不存在');
        return;
      }

      const blockType = typeResult[0].type;

      if (blockType !== 'i') {
        this.siyuanApi.pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      const resolved = await resolveListChildrenBySubtype(parentBlockId, this.siyuanApi);
      const orderedChildren = resolved.orderedChildren;
      const unorderedChildren = resolved.unorderedChildren;

      if (orderedChildren.length < 2 && unorderedChildren.length < 2) {
        this.siyuanApi.pushErrMsg('至少需要2个同类型子列表项（有序或无序）');
        return;
      }

      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      let orderedCreated = 0;
      let unorderedCreated = 0;
      let skippedCount = 0;

      if (orderedChildren.length >= 2) {
        const orderedResult = await xiuyuanAppService.createListTemplateCards({
          parentBlockId,
          childBlockIds: orderedChildren.map((row) => row.id),
          templateId: template.id,
          creationMode: 'split-v2',
          listKind: 'default',
        });

        if (!orderedResult.ok) {
          logger.error('[DialogManager] Failed to create split list template cards:', orderedResult.error);
          this.siyuanApi.pushErrMsg(`创建失败：${orderedResult.error.message}`);
          return;
        }

        orderedCreated = orderedResult.value.created.length;
        skippedCount += orderedResult.value.skippedChildBlockIds.length;
      }

      if (unorderedChildren.length >= 2) {
        const unorderedResult = await xiuyuanAppService.createListTemplateCards({
          parentBlockId,
          childBlockIds: unorderedChildren.map((row) => row.id),
          templateId: template.id,
          creationMode: 'summary-v1',
          listKind: 'default',
        });

        if (!unorderedResult.ok) {
          logger.error('[DialogManager] Failed to create summary list template cards:', unorderedResult.error);
          this.siyuanApi.pushErrMsg(`创建失败：${unorderedResult.error.message}`);
          return;
        }

        unorderedCreated = unorderedResult.value.created.length;
        skippedCount += unorderedResult.value.skippedChildBlockIds.length;
      }

      logger.info('[DialogManager] List template cards created (default flow):', {
        parentBlockId,
        orderedChildren: orderedChildren.length,
        unorderedChildren: unorderedChildren.length,
        orderedCreated,
        unorderedCreated,
        skippedCount,
      });

      this.siyuanApi.pushMsg(
        `✅ 列表卡创建成功：有序创建：${orderedCreated} / 无序汇总：${unorderedCreated} / 跳过：${skippedCount}`
      );
    } catch (err) {
      logger.error('[DialogManager] Failed to handle list template card:', err);
      this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 处理概念描述符卡的创建（支持方向检测）
   * 
   * @description
   * 概念描述符卡片的创建流程：
   * 1. 识别顶层列表项中引用的概念文档块 ((概念文档))
   * 2. 如果概念文档块没有被制作为概念卡，则制作
   * 3. 识别概念文档块子级里的描述符块（包含 ;; 符号）
   * 4. 自动检测方向符号：
   *    - ;; 或 ；； → 仅正向（默认）
   *    - ;< 或 ；《 → 仅反向
   *    - ;<> 或 ；《》 → 双向
   * 5. 为每个描述符块生成【概念-描述符】卡
   * 
   * @param blockIds - 块 ID 列表（只使用第一个块）
   */
  private async handleConceptDescriptorCard(blockIds: string[]): Promise<void> {
    try {
      if (blockIds.length === 0) {
        this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      const parentBlockId = blockIds[0];

      // 🆕 1. 读取块内容，检测是否有方向符号

      // 获取所有子块（只查询段落块）
      const children = await this.siyuanApi.sql(`
        SELECT id, markdown 
        FROM blocks 
        WHERE parent_id = '${parentBlockId}' AND type = 'p'
        ORDER BY sort
      `);

      // 检测是否有反向或双向符号
      let hasReverse = false;
      let hasBoth = false;

      if (children && children.length > 0) {
        for (const child of children) {
          const content = child.markdown || '';
          if (/;<>|；《》/.test(content)) {
            hasBoth = true;
            break;
          } else if (/;<|；《/.test(content)) {
            hasReverse = true;
          }
        }
      }

      logger.info('[DialogManager] Descriptor direction detection:', { hasReverse, hasBoth });

      // 🆕 2. 如果检测到反向或双向符号，使用特殊处理
      if (hasReverse || hasBoth) {
          // 使用类似 handleConceptDescriptorAutoCard 的逻辑
          // 但是需要先找到概念块
          const xiuyuanAppService = await this.context.getXiuyuanApplicationService();

          // 读取父块内容，提取概念块引用
          const { kramdown: parentKramdown } = await this.siyuanApi.getBlockKramdown(parentBlockId);
          const blockRefMatch = parentKramdown?.match(/\(\((\d{14}-[a-z0-9]{7})/);

          if (!blockRefMatch) {
            this.siyuanApi.pushErrMsg('未找到概念块引用');
            return;
          }

          const conceptBlockId = blockRefMatch[1];

          // 为每个描述符块创建卡片
          let createdCount = 0;
          const templateId = hasBoth ? 'builtin-concept-descriptor-both' : 'builtin-concept-descriptor-reverse';

          for (const child of children) {
            const content = child.markdown || '';
            // 检查是否包含描述符符号
            if (/;;|；；|;<|；《|;<>|；《》/.test(content)) {
              const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [conceptBlockId, child.id],
                templateId,
                fieldMapping: {
                  concept: conceptBlockId,
                  descriptor: child.id
                },
                deckId: this.siyuanApi.BUILTIN_DECK_ID,
                cardType: 'descriptor'
              });

              if (result.ok) {
                createdCount++;
              }
            }
          }

          const directionText = hasBoth ? '双向' : '仅反向';
          this.siyuanApi.pushMsg(
            `✅ 概念描述符卡创建成功！\n` +
            `方向：${directionText}\n` +
            `描述符卡：${createdCount} 张`
          );
          return;
        }

        // 🆕 3. 默认使用原有逻辑（仅正向）
        const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
        const result = await xiuyuanAppService.createConceptDescriptorCards({
          parentBlockId,
          deckId: this.siyuanApi.BUILTIN_DECK_ID
        });

        if (!result.ok) {
          logger.error('[DialogManager] Failed to create concept descriptor cards:', result.error);
          this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
          return;
        }

        const { conceptCardId, descriptorCards, skipped } = result.value;
        logger.info('[DialogManager] Concept descriptor cards created:', { conceptCardId, descriptorCards, skipped });

        let message = `✅ 概念描述符卡创建成功！\n`;
        message += `方向：仅正向\n`;
        if (conceptCardId) {
          message += `概念卡：已创建\n`;
        }
        message += `描述符卡：${descriptorCards.length} 张`;
        if (skipped.length > 0) {
          message += `\n跳过：${skipped.length} 个（已存在）`;
        }

        this.siyuanApi.pushMsg(message);
      } catch (err) {
        logger.error('[DialogManager] Failed to handle concept descriptor card:', err);
        this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
      }
    }


  /**
   * 处理概念定义卡的创建（自动识别方向）
   * 
   * @description
   * 概念定义卡支持三种方向符号：
   * - :: 或 ：： → 双向（builtin-concept-definition）
   * - :> 或 ：》 → 仅正向（builtin-concept-definition-forward）
   * - :< 或 ：《 → 仅反向（builtin-concept-definition-reverse）
   * 
   * 如果用户选择了 builtin-concept-definition，会自动检测块内容中的符号，
   * 并使用对应的模板。
   * 
   * @param blockIds - 块 ID 列表（只使用第一个块）
   * @param templateId - 用户选择的模板 ID
   */
  private async handleConceptDefinitionCard(blockIds: string[], templateId: string): Promise<void> {
    try {
      if (blockIds.length === 0) {
        this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      const blockId = blockIds[0];

      // 1. 读取块内容
      const { kramdown } = await this.siyuanApi.getBlockKramdown(blockId);
      
      if (!kramdown) {
        this.siyuanApi.pushErrMsg('无法读取块内容');
        return;
      }

      // 2. 检测方向符号（如果用户选择的是 builtin-concept-definition）
      let actualTemplateId = templateId;
      
      if (templateId === 'builtin-concept-definition') {
        // 自动检测方向
        if (kramdown.match(/:>|：》/)) {
          actualTemplateId = 'builtin-concept-definition-forward';
          logger.info('[DialogManager] Detected forward symbol, using builtin-concept-definition-forward');
        } else if (kramdown.match(/:<|：《/)) {
          actualTemplateId = 'builtin-concept-definition-reverse';
          logger.info('[DialogManager] Detected reverse symbol, using builtin-concept-definition-reverse');
        } else {
          // 默认使用双向
          actualTemplateId = 'builtin-concept-definition';
          logger.info('[DialogManager] Using default bidirectional template');
        }
      }

      // 3. 提取块引用 ID（概念块）
      const blockRefMatch = kramdown.match(/\(\((\d{14}-[a-z0-9]{7})/);
      if (!blockRefMatch) {
        this.siyuanApi.pushErrMsg('❌ 概念定义卡格式错误：需要使用 [[概念]]::定义 格式');
        return;
      }

      const conceptBlockId = blockRefMatch[1];

      // 4. 验证概念块是否为文档块
      const blockTypeQuery = `SELECT type FROM blocks WHERE id = '${conceptBlockId}' LIMIT 1`;
      const typeResult = await this.siyuanApi.sql(blockTypeQuery);
      
      if (!typeResult || typeResult.length === 0 || typeResult[0].type !== 'd') {
        this.siyuanApi.pushErrMsg('❌ 概念定义卡要求引用文档块，当前引用的不是文档块');
        return;
      }

      // 5. 创建概念定义卡
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      const result = await xiuyuanAppService.createFromBlocks({
        blockIds: [blockId, conceptBlockId],  // 定义块在前，概念块在后
        templateId: actualTemplateId,
        fieldMapping: {
          concept: conceptBlockId,
          definition: blockId
        },
        deckId: this.siyuanApi.BUILTIN_DECK_ID,
        cardType: 'descriptor'  // 概念定义卡的类型是 descriptor
      });

      if (!result.ok) {
        logger.error('[DialogManager] Failed to create concept definition card:', result.error);
        this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
        return;
      }

      const { xiuyuan, cards } = result.value;
      logger.info('[DialogManager] Concept definition card created:', { xiuyuan, cards });

      // 6. 设置定义块的卡片类型为 descriptor
      await this.siyuanApi.setBlockAttrs(blockId, {
        'custom-fsrs-card-type': 'descriptor'
      });

      // 7. 自动为概念文档块创建概念卡
      await this.ensureConceptDocumentCard({ concept: conceptBlockId }, xiuyuanAppService);

      // 8. 显示成功消息
      const directionText = actualTemplateId === 'builtin-concept-definition' ? '双向' : 
                           actualTemplateId === 'builtin-concept-definition-forward' ? '正向' : '反向';
      this.siyuanApi.pushMsg(
        `✅ 概念定义卡创建成功！\n` +
        `方向：${directionText}\n` +
        `生成卡片：${cards.length} 张`
      );
    } catch (err) {
      logger.error('[DialogManager] Failed to handle concept definition card:', err);
      this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 处理概念描述符卡片的批量创建（自动探路，自动识别方向）
   * 
   * @description
   * 概念描述符（自动）卡片的创建流程：
   * 1. 选择包含描述符符号的块（可以是多个）
   * 2. 自动识别方向符号：
   *    - ;; 或 ；； → 仅正向（默认）
   *    - ;< 或 ；《 → 仅反向
   *    - ;<> 或 ；《》 → 双向
   * 3. 向上探路查找概念块：优先标题块，其次文档块
   * 4. 如果概念块没有被制作为概念卡，则制作
   * 5. 为每个描述符块生成【概念-描述符】卡
   * 
   * @param blockIds - 块 ID 列表（包含描述符符号的块）
   * @param templateId - 用户选择的模板 ID（默认为 builtin-concept-descriptor-auto）
   */
  private async handleConceptDescriptorAutoCard(blockIds: string[], templateId: string = 'builtin-concept-descriptor-auto'): Promise<void> {
    try {
      if (blockIds.length === 0) {
        this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      // 🆕 1. 读取第一个块的内容，检测方向符号
      const { kramdown } = await this.siyuanApi.getBlockKramdown(blockIds[0]);
      
      if (!kramdown) {
        this.siyuanApi.pushErrMsg('无法读取块内容');
        return;
      }

      // 🆕 2. 检测方向符号（如果用户选择的是 builtin-concept-descriptor-auto）
      let actualTemplateId = templateId;
      let directionText = '仅正向';
      
      if (templateId === 'builtin-concept-descriptor-auto') {
        // 自动检测方向
        if (kramdown.match(/;<>|；《》/)) {
          actualTemplateId = 'builtin-concept-descriptor-both';
          directionText = '双向';
          logger.info('[DialogManager] Detected both symbol, using builtin-concept-descriptor-both');
        } else if (kramdown.match(/;<|；《/)) {
          actualTemplateId = 'builtin-concept-descriptor-reverse';
          directionText = '仅反向';
          logger.info('[DialogManager] Detected reverse symbol, using builtin-concept-descriptor-reverse');
        } else {
          // 默认使用仅正向（原始的 builtin-concept-descriptor-auto）
          actualTemplateId = 'builtin-concept-descriptor-auto';
          directionText = '仅正向';
          logger.info('[DialogManager] Using default forward-only template');
        }
      }

      // 🆕 3. 根据模板 ID 选择不同的创建逻辑
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      
      // 对于反向和双向模板，需要使用特殊的创建逻辑
      if (actualTemplateId === 'builtin-concept-descriptor-reverse' || actualTemplateId === 'builtin-concept-descriptor-both') {
        // 🆕 使用通用的 createFromBlocks 方法，但需要先找到概念块
        const { findConceptByUpwardSearch } = await import('@/application/usecases/xiuyuan/CreateConceptDescriptorAutoUseCase');
        const conceptResult = await findConceptByUpwardSearch(blockIds[0]);
        
        if (!conceptResult.ok) {
          this.siyuanApi.pushErrMsg(`未找到概念块：${conceptResult.error.message}`);
          return;
        }
        
        const { conceptBlockId } = conceptResult.value;
        
        // 为每个描述符块创建卡片
        let createdCount = 0;
        for (const descriptorBlockId of blockIds) {
          const result = await xiuyuanAppService.createFromBlocks({
            blockIds: [conceptBlockId, descriptorBlockId],
            templateId: actualTemplateId,
            fieldMapping: {
              concept: conceptBlockId,
              descriptor: descriptorBlockId
            },
            deckId: this.siyuanApi.BUILTIN_DECK_ID,
            cardType: 'descriptor'
          });
          
          if (result.ok) {
            createdCount++;
          }
        }
        
        this.siyuanApi.pushMsg(
          `✅ 概念描述符卡创建成功！\n` +
          `方向：${directionText}\n` +
          `描述符卡：${createdCount} 张`
        );
      } else {
        // 原有的正向逻辑
        const result = await xiuyuanAppService.createConceptDescriptorAuto({
          descriptorBlockIds: blockIds,
          deckId: this.siyuanApi.BUILTIN_DECK_ID
        });

        if (!result.ok) {
          logger.error('[DialogManager] Failed to create concept descriptor auto cards:', result.error);
          this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
          return;
        }

        const { conceptCardId, conceptType, descriptorCards, skipped } = result.value;
        logger.info('[DialogManager] Concept descriptor auto cards created:', { conceptCardId, conceptType, descriptorCards, skipped });

        const conceptTypeName = conceptType === 'heading' ? '标题块' : '文档块';
        let message = `✅ 概念描述符卡创建成功！\n`;
        message += `方向：${directionText}\n`;
        message += `概念卡：${conceptTypeName}\n`;
        message += `描述符卡：${descriptorCards.length} 张`;
        if (skipped.length > 0) {
          message += `\n跳过：${skipped.length} 个（已存在）`;
        }

        this.siyuanApi.pushMsg(message);
      }
    } catch (err) {
      logger.error('[DialogManager] Failed to handle concept descriptor auto card:', err);
      this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }
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
  private async handleMultiClozeCard(blockIds: string[], template: ICardTemplate): Promise<void> {
    try {
      if (blockIds.length === 0) {
        this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      const blockId = blockIds[0];

      // 1. 读取块内容
      const blocks = await this.siyuanApi.sql(`SELECT * FROM blocks WHERE id = '${blockId}'`);
      if (!blocks || blocks.length === 0) {
        this.siyuanApi.pushErrMsg('无法读取块内容');
        return;
      }

      const block = blocks[0];
      // 优先使用 markdown 字段，如果没有则使用 content 字段
      let content = block.markdown || block.content || '';
      
      // 移除 IAL（Inline Attribute List）
      // 格式：{: id="..." updated="..." ...}
      content = content.replace(/\{:.*?\}/g, '').trim();
      
      logger.info('[DialogManager] Block content:', content);

      // 2. 解析填空
      const clozes = this.extractClozes(content);

      if (clozes.length === 0) {
        this.siyuanApi.pushErrMsg('未找到填空内容（支持 {{}}、== 和思源标记）');
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
        deckId: this.siyuanApi.BUILTIN_DECK_ID,
        // 🆕 传入动态模版（覆盖原模版）
        template: dynamicTemplate,
        // 🆕 传入填空信息
        clozeInfo: {
          originalContent: content,
          clozes: clozes,
        },
      });

      if (!result.ok) {
        logger.error('[DialogManager] Failed to create multi-cloze card:', result.error);
        this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
        return;
      }

      const { xiuyuan, cards } = result.value;
      logger.info('[DialogManager] Multi-cloze cards created:', { xiuyuan, cards, clozeCount: clozes.length });

      this.siyuanApi.pushMsg(
        `✅ 多填空卡片创建成功！\n` +
        `找到填空：${clozes.length} 个\n` +
        `生成卡片：${cards.length} 张`
      );
    } catch (err) {
      logger.error('[DialogManager] Failed to handle multi-cloze card:', err);
      this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
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
   * 打开快速制卡对话框（Xiuyuan）- 带块 ID 列表
   * 
   * @param blockIds - 块 ID 列表
   */
  async openCreateTemplateCardDialog(blockIds: string[]): Promise<void> {
    try {
      if (!blockIds || blockIds.length === 0) {
        this.siyuanApi.pushMsg('未找到选中的块');
        return;
      }

      // ✅ 使用 XiuyuanApplicationService（符合 DDD 架构）
      const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
      
      if (!xiuyuanAppService) {
        logger.error('[DialogManager] XiuyuanApplicationService not found');
        this.siyuanApi.pushErrMsg('XiuyuanApplicationService 未初始化');
        return;
      }

      // 获取所有可用模板
      const templates = await xiuyuanAppService.getAllTemplates();
      
      if (templates.length === 0) {
        this.siyuanApi.pushMsg('暂无可用模板，请先创建模板');
        return;
      }

      // 如果已有打开的模板选择对话框，先销毁
      if (this.templateSelectDialog) {
        this.templateSelectDialog.destroy();
      }

      // 显示模板选择对话框
      this.templateSelectDialog = createVueDialog({
        title: this.context.getI18n()?.selectCardTypeTitle || '选择卡片类型',
        component: TemplateSelectDialog,
        props: {
          templates,
          blockCount: blockIds.length,
          i18n: this.context.getI18n(),
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

              if (
                templateId === 'builtin-list-concept-multiline' ||
                templateId === 'builtin-list-descriptor-multiline'
              ) {
                await this.handleCdfMultilineTemplateCard(blockIds, templateId);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              // 🆕 概念定义卡特殊处理：自动识别方向符号
              if (templateId === 'builtin-concept-definition' || 
                  templateId === 'builtin-concept-definition-forward' ||
                  templateId === 'builtin-concept-definition-reverse') {
                await this.handleConceptDefinitionCard(blockIds, templateId);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              // 🆕 概念描述符（自动）模版特殊处理：自动识别方向符号
              if (templateId === 'builtin-concept-descriptor-auto') {
                await this.handleConceptDescriptorAutoCard(blockIds, templateId);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              // 🆕 概念描述符卡特殊处理：批量处理列表结构
              if (templateId === 'builtin-concept-descriptor') {
                await this.handleConceptDescriptorCard(blockIds);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              // 普通模版：自动字段映射
              const fieldMapping: Record<string, string> = {};
              template.fields.forEach((field, index: number) => {
                if (index < blockIds.length) {
                  fieldMapping[field.name] = blockIds[index];
                }
              });

              // 🆕 检测背面块是否有挖空
              const { ClozeDetector } = await import('@/utils/cloze-detector');
              
              let backClozeInfo = undefined;
              
              // 只在有至少2个块时检测背面挖空
              if (blockIds.length >= 2) {
                const backBlockId = blockIds[blockIds.length - 1];
                const backContent = await this.siyuanApi.getBlockText(backBlockId);
                const backClozes = ClozeDetector.extractClozes(backContent);
                
                if (backClozes.length > 0) {
                  const frontBlockId = blockIds[0];
                  const frontContent = await this.siyuanApi.getBlockText(frontBlockId);
                  
                  backClozeInfo = {
                    originalContent: `${frontContent} → ${backContent}`,
                    front: frontContent,
                    back: backContent,
                    clozes: backClozes,
                    direction: 'forward' as const,
                    symbol: template.name
                  };
                  
                  logger.info('[DialogManager] Detected back clozes in template card:', backClozes.length);
                }
              }

              // 创建 Xiuyuan 和卡片（使用 XiuyuanApplicationService）
              const result = await xiuyuanAppService.createFromBlocks({
                blockIds,
                templateId,
                fieldMapping,
                deckId: this.siyuanApi.BUILTIN_DECK_ID,
                backClozeInfo,  // 🆕 添加背面挖空信息
                cardType: templateId === 'builtin-concept-definition' ? 'descriptor' : undefined  // 🆕 概念定义卡的类型是 descriptor
              });

              if (!result.ok) {
                logger.error('[DialogManager] Failed to create template card:', result.error);
                this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
                this.templateSelectDialog?.destroy();
                this.templateSelectDialog = null;
                return;
              }

              const { xiuyuan, cards } = result.value;
              logger.info('[DialogManager] Xiuyuan created:', { xiuyuan, cards });

              // 🆕 CDF 概念定义卡：自动为概念文档块创建概念卡
              if (templateId === 'builtin-concept-definition' || 
                  templateId === 'builtin-concept-definition-forward' ||
                  templateId === 'builtin-concept-definition-reverse') {
                await this.ensureConceptDocumentCard(fieldMapping, xiuyuanAppService);
                
                // 🆕 设置定义块的卡片类型为 descriptor（概念定义卡本质是描述符卡）
                          const definitionBlockId = blockIds[0];  // 定义块是第一个块
                await this.siyuanApi.setBlockAttrs(definitionBlockId, {
                  'custom-fsrs-card-type': 'descriptor'
                });
                logger.info('[DialogManager] Set definition block card type to descriptor:', definitionBlockId);
              }

              this.siyuanApi.pushMsg(
                `✅ 模板卡片创建成功！\n` +
                `模板：${template.name}\n` +
                `生成卡片：${cards.length} 张`
              );
            } catch (err) {
              logger.error('[DialogManager] Failed to create template card:', err);
              this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
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
      logger.error('[DialogManager] Failed to open create template card dialog:', err);
      this.siyuanApi.pushErrMsg(`打开对话框失败：${(err as Error).message}`);
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
    xiuyuanAppService: XiuyuanApplicationService
  ): Promise<void> {
    try {
      const conceptFieldBlockId = fieldMapping['concept'];
      if (!conceptFieldBlockId) {
        logger.warn('[DialogManager] No concept field in fieldMapping');
        return;
      }

      const safeConceptFieldBlockId = conceptFieldBlockId.replace(/'/g, "''");
      logger.info('[DialogManager] Ensuring concept document card:', conceptFieldBlockId);

      // 1. 解析概念文档块 ID（支持直接传文档块 ID，或传引用块 ID）
      const conceptBlockRows = await this.siyuanApi.sql<BlockSqlRow>(`
        SELECT id, type, content, markdown
        FROM blocks
        WHERE id = '${safeConceptFieldBlockId}'
        LIMIT 1
      `);

      if (!conceptBlockRows || conceptBlockRows.length === 0) {
        logger.warn('[DialogManager] Concept field block not found:', conceptFieldBlockId);
        return;
      }

      const conceptFieldBlock = conceptBlockRows[0];
      let conceptDocumentId = conceptFieldBlock.id;
      let conceptDocumentBlock: BlockSqlRow = conceptFieldBlock;

      if (conceptFieldBlock.type !== 'd') {
        const refMatch = conceptFieldBlock.markdown?.match(/\(\((\d{14}-[a-z0-9]{7})(?:\s+'[^']*')?\)\)/);
        if (!refMatch) {
          logger.warn('[DialogManager] No document block reference found in concept field block');
          return;
        }

        conceptDocumentId = refMatch[1];
        const safeConceptDocumentId = conceptDocumentId.replace(/'/g, "''");
        const conceptDocumentRows = await this.siyuanApi.sql<BlockSqlRow>(`
          SELECT id, type, content
          FROM blocks
          WHERE id = '${safeConceptDocumentId}'
          LIMIT 1
        `);

        if (!conceptDocumentRows || conceptDocumentRows.length === 0) {
          logger.warn('[DialogManager] Referenced concept document not found:', conceptDocumentId);
          return;
        }

        conceptDocumentBlock = conceptDocumentRows[0];
      }

      if (conceptDocumentBlock.type !== 'd') {
        logger.warn('[DialogManager] Resolved concept block is not a document:', conceptDocumentBlock.type);
        return;
      }

      if (this.conceptCardEnsureInFlight.has(conceptDocumentId)) {
        logger.debug('[DialogManager] Concept document ensure already in flight, skipping:', conceptDocumentId);
        return;
      }

      this.conceptCardEnsureInFlight.add(conceptDocumentId);
      try {
        const safeConceptDocumentId = conceptDocumentId.replace(/'/g, "''");
        const attrRows = await this.siyuanApi.sql<AttributeSqlRow>(`
          SELECT name, value
          FROM attributes
          WHERE block_id = '${safeConceptDocumentId}'
            AND name IN (
              'custom-fsrs-card-id',
              'custom-xiuyuan-id',
              'custom-fsrs-xiuyuan-id',
              'custom-fsrs-card-type'
            )
        `);

        const hasXiuyuanId = (attrRows || []).some((row) => {
          if (row.name !== 'custom-xiuyuan-id' && row.name !== 'custom-fsrs-xiuyuan-id') {
            return false;
          }
          return typeof row.value === 'string' && row.value.trim().length > 0;
        });

        const hasLegacyCardId = (attrRows || []).some((row) =>
          row.name === 'custom-fsrs-card-id' && typeof row.value === 'string' && row.value.trim().length > 0
        );

        const isConceptType = (attrRows || []).some((row) =>
          row.name === 'custom-fsrs-card-type' && row.value === 'concept'
        );

        if (hasXiuyuanId || hasLegacyCardId || isConceptType) {
          logger.info('[DialogManager] Concept document already has card metadata:', conceptDocumentId);
          return;
        }

        const conceptName = conceptDocumentBlock.content || '未命名概念';
        logger.info('[DialogManager] Creating Xiuyuan concept card for:', conceptName);

        const result = await xiuyuanAppService.createFromBlocks({
          blockIds: [conceptDocumentId],
          templateId: 'builtin-concept-simple',
          fieldMapping: {
            concept: conceptDocumentId,
          },
          deckId: this.siyuanApi.BUILTIN_DECK_ID,
        });

        if (!result.ok) {
          const error = (result as { ok: false; error: Error }).error;
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error('[DialogManager] Failed to create concept card:', errorMsg);
          return;
        }

        await this.siyuanApi.setBlockAttrs(conceptDocumentId, {
          'custom-fsrs-card-type': 'concept',
        });

        logger.info('[DialogManager] Concept card created for document:', conceptDocumentId);
        this.siyuanApi.pushMsg(`✅ 已为概念「${conceptName}」创建概念卡`);
      } finally {
        this.conceptCardEnsureInFlight.delete(conceptDocumentId);
      }
    } catch (error) {
      logger.error('[DialogManager] Failed to ensure concept document card:', error);
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
    this.closeMobileQueueLauncherDialog();
    this.closeBrowserDialog();
    this.destroyCurrentReviewDialog();
    if (this.templateSelectDialog) {
      this.templateSelectDialog.destroy();
      this.templateSelectDialog = null;
    }
  }
}

