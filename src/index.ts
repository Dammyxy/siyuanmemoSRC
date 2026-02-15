/**
 * FSRS Plugin Entry
 * 插件入口文件
 */

// 🆕 快速禁用调试日志（在所有导入之前）
import '@/utils/disableLogs';

import {
  Plugin,
  getFrontend,
  Menu,
  openTab,
  openWindow,
  Constants,
} from 'siyuan';
/// #if !BROWSER
import { ipcRenderer } from 'electron';
/// #endif
import { createApp } from 'vue';

import { StorageManager } from '@/core/storage';
import { createScheduler, type SchedulerEngineAdapter, SchedulerRouter } from '@/core/scheduler';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, unmarkBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import { FinalDrillAdapter, FinalDrillProvider, LeechAdapter, RetrievalPracticeAdapter, ReviewView, SubsetPracticeAdapter } from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { SettingsPanel } from '@/ui/settings';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';

import { createDefaultCard } from '@/types';
import '@/index.scss';
import { XiuyuanService, XiuyuanStorage, BUILTIN_TEMPLATES } from '@/core/xiuyuan';
import { TemplateSelectDialog } from '@/ui/xiuyuan';

// 🆕 Debug tools (only in development)
if (process.env.NODE_ENV === 'development') {
  import('@/debug/fsrs-debug');
}

import { ConsoleQueueMonitor, DEFAULT_PRIORITY, QueueContext, StorageFileJsonAdapter, type QueueItem } from '@/core/queue';
import { SubsetPracticeStrategy } from '@/core/queue/strategies';
import { TransactionObserver } from '@/core/box/TransactionObserver';
// 🆕 使用新架构队列（统一从 @/queues 导入）
import { RetrievalPracticeQueue } from '@/queues/RetrievalPracticeQueue';
import { FilterGroupQueue } from '@/queues/FilterGroupQueue';
import { FinalDrillQueue } from '@/queues/FinalDrillQueue';
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
// 🔧 旧架构队列（仅用于难点攻坚）
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { NeuralQueueStorage } from '@/core/queue/neural';
import { ExtractionNativeAdapter, FinalDrillNativeAdapter } from '@/core/native/adapter';
// Services
import { DialogService, MenuService, ReviewDialogManager, BlockMenuHandler, createQueueHandlers, clearPracticeQueue, HybridSyncService } from '@/services';
import { TransactionWebSocketService } from '@/services/TransactionWebSocketService';
import { RiffSyncHandler } from '@/services/handlers/RiffSyncHandler';
import { NativeReviewSession } from '@/core/native/session';
import { ConfigMigrator } from '@/utils/configMigrator';

// 🆕 Unified Data Source
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';
import { AdvancedDataRouter } from '@/routers/AdvancedDataRouter';

type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export default class FSRSPlugin extends Plugin {
  // 运行环境
  public isMobile: boolean = false;
  public isBrowser: boolean = false;

  // 核心模块
  public storage!: StorageManager;
  public scheduler!: SchedulerEngineAdapter;
  public schedulerRouter!: SchedulerRouter;
  public rescheduleService!: RescheduleService;
  private queueContext!: QueueContext<QueueItem>;
  private retrievalQueue!: RetrievalPracticeQueue;
  // 🆕 neuralQueue 通过 getter 访问，使用统一数据源管理器
  public finalDrillQueue!: FinalDrillQueue;
  public leechQueue!: LeechQueue;
  public incrementalQueue!: IncrementalLearningQueue;
  private subsetQueue!: FilterGroupQueue; // 内部命名
  
  // 🆕 统一数据源管理器
  public unifiedDataSourceManager!: UnifiedDataSourceManager;

  // 🆕 Services
  private dialogService!: DialogService;
  private menuService!: MenuService;
  public xiuyuanService!: XiuyuanService; // 🆕 改为 public，供 AutoCardHandler 使用
  private xiuyuanStorage!: XiuyuanStorage;
  private reviewDialogManager!: ReviewDialogManager;
  private blockMenuHandler!: BlockMenuHandler;
  private transactionObserver!: TransactionObserver;
  private hybridSyncService?: HybridSyncService;
  private fullSyncTimer?: NodeJS.Timeout; // 🆕 全量同步定时器
  private transactionWebSocketService?: TransactionWebSocketService; // 🆕 统一 WebSocket 服务

  // 为兼容性提供的别名访问器
  public get deliberateQueue(): FinalDrillQueue {
    return this.finalDrillQueue;
  }

  // 🆕 neuralQueue getter - 通过统一数据源管理器访问
  public get neuralQueue() {
    return this.unifiedDataSourceManager.getQueue(QueueType.NeuralRoam) as any;
  }

  // neuralRoamQueue 别名 → neuralQueue（保持兼容性）
  public get neuralRoamQueue() {
    return this.neuralQueue;
  }

  // filterGroupQueue 别名 → subsetQueue（保持兼容性）
  public get filterGroupQueue(): FilterGroupQueue {
    return this.subsetQueue;
  }

  private TAB_TYPE = 'plugin-siyuanmemo-srs-browser';
  private REVIEW_TAB_TYPE = 'plugin-siyuanmemo-review';  // 🆕 复习界面 Tab 类型

  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;


  // UI 状态
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;
  private srsBrowserDialog: { dialog: any; destroy: () => void } | null = null;

  constructor(options: any) {
    super(options);
  }

  async onload() {
    console.log('[SiyuanMemo] Plugin loading...');

    this.isInitialized = false;

    // 🆕 加载 vis-network 库（已删除）

    try {
      this.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="iconSiyuanMemo" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/>
  </symbol>
</svg>`);
      this.topBarElement = this.addTopBar({
        icon: 'iconSiyuanMemo',
        title: this.i18n?.topbarTitle || 'FSRS 闪卡 (左键卡片浏览器/右键菜单)',
        position: 'right',
        callback: () => {
          if (!this.isInitialized) {
            pushMsg(this.i18n?.loading || '插件初始化中，请稍后...');
            return;
          }
          this.openSRSBrowser();
        },
      });
      this.topBarElement.classList.add('fsrs-topbar');

      this.topBarContextMenuHandler = (ev: MouseEvent) => {
        ev.preventDefault();
        this.openTopBarMenu(ev);
      };
      this.topBarElement.addEventListener('contextmenu', this.topBarContextMenuHandler);
    } catch (err) {
      console.error('[SiyuanMemo] Failed to register topbar:', err);
    }

    // 检测运行环境
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');

    try {
      // 初始化存储
      this.storage = new StorageManager(this.name);
      await this.storage.init();
      
      // 🆕 自动修复无效日期（首次加载时）
      try {
        const repairResult = await this.storage.repairInvalidDates();
        if (repairResult.fixed > 0) {
          console.log(`[SiyuanMemo] 🔧 Repaired ${repairResult.fixed}/${repairResult.total} cards with invalid dates`);
          pushMsg(`已修复 ${repairResult.fixed} 张卡片的无效日期`, 3000);
        }
      } catch (err) {
        console.error('[SiyuanMemo] Failed to repair invalid dates:', err);
      }

      const settings = this.storage.getSettings();
      this.rescheduleService = new RescheduleService(this.storage);

      // 🆕 创建 SchedulerRouter（根据卡片类型自动选择调度器）
      this.schedulerRouter = new SchedulerRouter({
        defaultScheduler: settings.scheduler?.defaultScheduler || 'fsrs-v5',
        enableRiffSync: settings.scheduler?.enableRiffSync || false,
        fsrsParams: settings.fsrs,
      }, this.storage);

      // ✅ 保留旧调度器（向后兼容）
      this.scheduler = createScheduler(settings.fsrs, settings.schedulerEngine);

      // 🆕 初始化 UnifiedDataSourceManager（必须在队列初始化之前）
      this.unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
      const advancedRouter = new AdvancedDataRouter(this.storage, this);  // 🆕 传递 plugin 实例
      
      this.unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
      console.log('[SiyuanMemo] ✅ UnifiedDataSourceManager initialized with Advanced mode');

      // ✅ 使用新架构队列（通过 UnifiedDataSourceManager）
      this.retrievalQueue = this.unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice) as any;
      this.finalDrillQueue = this.unifiedDataSourceManager.getQueue(QueueType.FinalDrill) as any;
      this.subsetQueue = this.unifiedDataSourceManager.getQueue(QueueType.FilterGroup) as any;
      this.incrementalQueue = this.unifiedDataSourceManager.getQueue(QueueType.IncrementalLearning) as any;

      this.queueContext = new QueueContext<QueueItem>({
        initial: 'retrieval',
        monitors: [new ConsoleQueueMonitor()],
      });
      this.queueContext.register('retrieval', this.retrievalQueue as any);
      this.queueContext.register('final-drill', this.finalDrillQueue as any);
      this.queueContext.register('filter-group', this.subsetQueue as any);
      this.queueContext.register('incremental-learning' as any, this.incrementalQueue as any);

      // 初始化难点攻坚队列（✅ 使用 V2）
      this.leechQueue = new LeechQueue();
      this.queueContext.register('leech' as any, this.leechQueue as any);

      // 🆕 神经漫游队列通过 UnifiedDataSourceManager 管理，无需手动初始化

      console.log('[SiyuanMemo] ✅ SchedulerRouter initialized');
      console.log('[SiyuanMemo] ✅ All queues initialized with new architecture');

      // 🆕 初始化 Services
      this.dialogService = new DialogService({
        app: this.app,
        i18n: this.i18n || {},
        storage: this.storage,
        scheduler: this.scheduler,
        isInitialized: true,
        finalDrillQueue: this.finalDrillQueue,
        incrementalQueue: this.incrementalQueue,
      });

      this.menuService = new MenuService({
        i18n: this.i18n || {},
        storage: this.storage,
        openReviewDialog: () => this.openReviewDialog(),
        openFinalDrillDialog: () => this.openFinalDrillDialog(),
        openFilterGroupPracticeDialog: () => this.openFilterGroupPracticeDialog(),
        openIncrementalLearningDialog: () => this.openIncrementalLearningDialog(),
        openNeuralRoamDialog: () => this.openNeuralRoamDialog(),
        openLeechReviewDialog: () => this.openLeechReviewDialog(),
        openSRSBrowser: () => this.openSRSBrowser(),
        openSetting: () => this.openSetting(),
        getDueCount: () => this.getDueCount(),
      });

      console.log('[SiyuanMemo] ✅ Services initialized');

      // 🆕 初始化 ReviewDialogManager（使用统一数据源架构）
      this.reviewDialogManager = new ReviewDialogManager({
        app: this.app,
        i18n: this.i18n || {},
        storage: this.storage,
        scheduler: this.scheduler,
        isInitialized: () => this.isInitialized,
        plugin: this,  // 🆕 传递 plugin 引用（包含 UnifiedDataSourceManager）
        openReviewTab: (options) => this.openReviewTab(options),
      });

      // 🆕 初始化 BlockMenuHandler
      this.blockMenuHandler = new BlockMenuHandler({
        app: this.app,
        i18n: this.i18n || {},
        storage: this.storage,
        reviewDialogManager: this.reviewDialogManager,
        xiuyuanService: null as any, // 会在 xiuyuanService 初始化后更新
        openCreateTemplateCardDialog: (blockIds) => this.openCreateTemplateCardDialogWithBlockIds(blockIds),
        openNeuralReviewDialog: (options) => this.reviewDialogManager.openNeuralRoam(options),
        plugin: this,  // 🆕 传入 plugin 引用，用于访问 hybridSyncService
      });

      console.log('[SiyuanMemo] ✅ ReviewDialogManager & BlockMenuHandler initialized');

      // 🆕 初始化 XiuyuanService（修缘卡片来源抽象层）
      this.xiuyuanStorage = new XiuyuanStorage(this.name);
      await this.xiuyuanStorage.load();
      this.xiuyuanService = new XiuyuanService(this.xiuyuanStorage, this.storage);

      // 🆕 初始化内置模板
      for (const template of BUILTIN_TEMPLATES) {
        const existing = this.xiuyuanService.getTemplate(template.id);
        if (!existing) {
          this.xiuyuanService.createTemplate(template);
        }
      }
      await this.xiuyuanStorage.save();
      console.log('[SiyuanMemo] ✅ XiuyuanService initialized with', BUILTIN_TEMPLATES.length, 'builtin templates');

      // 🆕 更新 BlockMenuHandler 的 xiuyuanService 依赖
      (this.blockMenuHandler as any).deps.xiuyuanService = this.xiuyuanService;

      // 🆕 初始化 TransactionObserver（自动制卡）
      // ⚠️ DEPRECATED: TransactionObserver 已被 AutoCardHandler 替代
      // @see AutoCardHandler - 新的自动制卡处理器
      // @see .kiro/specs/quick-card-symbols/tasks.md - Task 2.8
      // 
      // 保留代码以便回滚，但默认不启用
      // this.transactionObserver = new TransactionObserver(this);
      // this.transactionObserver.init();
      // const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
      // this.transactionObserver.setEnabled(autoCardEnabled);
      // console.log('[SiyuanMemo] ✅ TransactionObserver initialized, autoCardEnabled:', autoCardEnabled);
      
      console.log('[SiyuanMemo] ⚠️ TransactionObserver is deprecated and not initialized. Use AutoCardHandler instead.');

      // 🆕 检测并执行配置迁移（旧版 disabled/data-only/full-scheduler）
      const riffConfig = settings.riffIntegration;
      if (riffConfig && ConfigMigrator.needsMigration(riffConfig)) {
        console.log('[SiyuanMemo] Riff config migration needed');
        const migratedConfig = ConfigMigrator.migrate(riffConfig as any);
        const message = ConfigMigrator.getMigrationMessage((riffConfig as any).mode);
        
        // 保存新配置
        await this.storage.updateSettings({
          ...settings,
          riffIntegration: migratedConfig
        });
        
        // 显示迁移提示
        setTimeout(() => {
          pushMsg(message);
        }, 1000);
        
        console.log('[SiyuanMemo] ✅ Riff config migrated');
      }

      // 🆕 初始化 HybridSyncService（始终初始化，不再检查 mode）
      const currentRiffConfig = this.storage.getSettings().riffIntegration;
      if (currentRiffConfig) {
        this.hybridSyncService = new HybridSyncService({
          deckId: riff.BUILTIN_DECK_ID,
          storage: this.storage,
          incrementalSync: {
            ...currentRiffConfig.incrementalSync,
            autoDetectCardType: true  // 启用自动检测卡片类型
          },
          fullSync: currentRiffConfig.fullSync,
          deleteSync: currentRiffConfig.deleteSync
        });
        
        // 启动同步服务（只执行初始同步）
        await this.hybridSyncService.start();
        
        // 🆕 插件主类管理全量同步定时器
        if (currentRiffConfig.fullSync.enabled) {
          this.fullSyncTimer = setInterval(
            () => this.hybridSyncService!.fullSync(),
            currentRiffConfig.fullSync.interval
          );
          console.log(`[SiyuanMemo] Full sync timer started (interval: ${currentRiffConfig.fullSync.interval}ms)`);
        }
        
        console.log('[SiyuanMemo] ✅ HybridSyncService initialized and started');
      } else {
        console.log('[SiyuanMemo] HybridSyncService not initialized (no riffIntegration config)');
      }

      // 🆕 初始化 TransactionWebSocketService（统一 WebSocket 服务）
      if (currentRiffConfig && currentRiffConfig.incrementalSync?.enabled && this.hybridSyncService) {
        console.log('[SiyuanMemo] Initializing TransactionWebSocketService...');
        
        // 创建 TransactionWebSocketService 实例
        this.transactionWebSocketService = new TransactionWebSocketService(this);
        
        // 创建并注册 RiffSyncHandler
        const riffSyncHandler = new RiffSyncHandler(this.hybridSyncService);
        this.transactionWebSocketService.registerHandler(riffSyncHandler);
        
        // 🆕 创建并注册 AutoCardHandler（自动制卡处理器）
        const { AutoCardHandler } = await import('@/services/handlers/AutoCardHandler');
        const autoCardHandler = new AutoCardHandler(this);
        this.transactionWebSocketService.registerHandler(autoCardHandler);
        console.log('[SiyuanMemo] ✅ AutoCardHandler registered');
        
        // 启动服务
        this.transactionWebSocketService.start();
        
        console.log('[SiyuanMemo] ✅ TransactionWebSocketService initialized and started');
      } else {
        console.log('[SiyuanMemo] TransactionWebSocketService not initialized (Riff incremental sync disabled)');
      }

      // 🆕 简单模式移除迁移（移除 mode 字段，自动切换到高级模式）
      const { SimpleModeRemovalMigrator } = await import('./utils/simpleModeRemovalMigrator');
      const finalRiffConfig = this.storage.getSettings().riffIntegration;
      
      if (finalRiffConfig && SimpleModeRemovalMigrator.needsMigration(finalRiffConfig)) {
        console.log('[SiyuanMemo] Simple mode removal migration needed');
        
        try {
          // 执行迁移
          const migrationResult = await SimpleModeRemovalMigrator.performMigration(
            finalRiffConfig,
            this.hybridSyncService
          );
          
          // 保存迁移后的配置
          await this.storage.updateSettings({
            ...this.storage.getSettings(),
            riffIntegration: migrationResult.migratedConfig as any
          });
          
          console.log('[SiyuanMemo] ✅ Simple mode removal migration completed');
          console.log('[SiyuanMemo] Sync triggered:', migrationResult.syncTriggered);
          console.log('[SiyuanMemo] Migration success:', migrationResult.success);
        } catch (error) {
          console.error('[SiyuanMemo] ❌ Simple mode removal migration failed:', error);
          await SimpleModeRemovalMigrator.handleMigrationError(
            error as Error,
            'plugin initialization'
          );
        }
      } else if (finalRiffConfig && finalRiffConfig.mode) {
        // 即使不是简单模式，也移除 mode 字段以保持一致性
        console.log('[SiyuanMemo] Removing mode field from config for consistency');
        const { mode, ...cleanConfig } = finalRiffConfig;
        await this.storage.updateSettings({
          ...this.storage.getSettings(),
          riffIntegration: cleanConfig as any
        });
      }

      this.isInitialized = true;

    } catch (err) {
      console.error('[SiyuanMemo] Plugin initialization failed:', err);
      try {
        await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      } catch {}
    }

    // 注册 Dock 面板
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
        this.initDockPanel(dock.element);
      },
    });

    // 注册快捷键 - 复习
    this.addCommand({
      langKey: 'startReview',
      hotkey: 'Alt+R',
      callback: () => {
        this.openReviewDialog();
      },
    });

    this.addCommand({
      langKey: 'startDrill',
      hotkey: 'Alt+D',
      callback: () => {
        this.openFinalDrillDialog();
      },
    });

    // 渐进学习队列命令
    this.addCommand({
      langKey: 'startIncrementalLearning',
      hotkey: '',
      callback: async () => {
        await this.openIncrementalLearningDialog();
      },
    });



    // 注册快捷键 - 打开 SRS 浏览器
    this.addCommand({
      langKey: 'openSrsBrowser',
      hotkey: 'Alt+B',
      callback: () => {
        this.openSRSBrowser();
      },
    });

    // 注册自定义 Tab
    const self = this;
    this.addTab({
      type: this.TAB_TYPE,
      init() {
        const app = createApp(SRSBrowser, {
          app: self.app,
          i18n: self.i18n || {},
          mode: 'tab',
          plugin: self,
        });
        app.mount(this.element);
        (this as any).vueApp = app;
      },
      destroy() {
        if ((this as any).vueApp) {
          (this as any).vueApp.unmount();
        }
      },
    });

    // 🆕 注册复习界面 Tab
    this.addTab({
      type: this.REVIEW_TAB_TYPE,
      init() {
        const plugin = (window as any).siyuanMemoPlugin;
        if (!plugin) {
          console.error('[SiyuanMemo] Plugin instance not found');
          return;
        }

        // 从 Tab data 恢复状态
        const savedProvider = (this as any).data?.provider;
        const savedQueue = (this as any).data?.queue;
        const savedAdapter = (this as any).data?.adapter;
        const savedTitle = (this as any).data?.title;
        const savedProviderId = (this as any).data?.providerId || 'retrieval';

        console.log('[FSRS Review Tab] Restoring state:', {
          hasProvider: !!savedProvider,
          hasQueue: !!savedQueue,
          hasAdapter: !!savedAdapter,
          title: savedTitle,
          providerId: savedProviderId,
        });

        // 如果有 savedQueue，使用 queue + adapter 模式
        if (savedQueue && savedAdapter) {
          console.log('[FSRS Review Tab] Using queue + adapter mode');
          const app = createApp(ReviewView, {
            app: plugin.app,
            i18n: plugin.i18n || {},
            mode: 'tab',
            title: savedTitle,
            queue: savedQueue,
            adapter: savedAdapter,
          });
          app.mount(this.element);
          (this as any).vueApp = app;
          return;
        }

        // 否则使用 provider + reviewUI 模式
        let provider = savedProvider;
        let adapter = savedAdapter;

        if (!provider) {
          console.log('[FSRS Review Tab] No saved provider, creating new one for:', savedProviderId);
          // 根据 providerId 创建对应的 provider
          if (savedProviderId === 'final-drill') {
            provider = new FinalDrillProvider({
              queue: plugin.finalDrillQueue,
              storage: plugin.storage,
            });
            adapter = new FinalDrillAdapter({ i18n: plugin.i18n || {} });
          } else if (savedProviderId === 'leech') {
            provider = {
              id: 'leech',
              displayName: plugin.i18n?.leechReview || '难记卡片',
              getDueCards: () => plugin.leechQueue?.getDueCards?.() || [],
            };
            adapter = new LeechAdapter({ i18n: plugin.i18n || {} });
          } else if (savedProviderId === 'neural-roam') {
            // 🆕 神经漫游使用新架构 - 通过 UnifiedDataSourceManager
            const neuralQueue = plugin.unifiedDataSourceManager?.getQueue(QueueType.NeuralRoam);
            provider = {
              id: 'neural-roam',
              displayName: plugin.i18n?.neuralRoam || '神经漫游',
              getDueCards: () => neuralQueue?.getAllCards?.() || [],
            };
            // 神经漫游适配器已迁移到新架构，使用通用适配器
            adapter = new RetrievalPracticeAdapter({ i18n: plugin.i18n || {} });
          } else {
            // 默认：提取练习
            provider = new RetrievalPracticeProvider({
              storage: plugin.storage,
              scheduler: plugin.scheduler,
            });
            adapter = new RetrievalPracticeAdapter({ i18n: plugin.i18n || {} });
          }
        } else {
          console.log('[FSRS Review Tab] Using saved provider:', provider.id);
          // 如果有保存的 provider 但没有 adapter，根据 provider.id 创建 adapter
          if (!adapter) {
            const providerId = provider.id || 'retrieval';
            if (providerId === 'final-drill') {
              adapter = new FinalDrillAdapter({ i18n: plugin.i18n || {} });
            } else if (providerId === 'leech') {
              adapter = new LeechAdapter({ i18n: plugin.i18n || {} });
            } else if (providerId === 'neural-roam') {
              // 🆕 神经漫游使用新架构 - 使用通用适配器
              adapter = new RetrievalPracticeAdapter({ i18n: plugin.i18n || {} });
            } else {
              adapter = new RetrievalPracticeAdapter({ i18n: plugin.i18n || {} });
            }
          }
        }

        const app = createApp(ReviewView, {
          app: plugin.app,
          i18n: plugin.i18n || {},
          mode: 'tab',  // 🔑 关键：Tab 模式
          title: savedTitle || provider.displayName,
          provider: provider,
          reviewUI: {
            component: ReviewView,
            adapter: adapter,
            context: {
              uiConfig: { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true },
            },
          },
        });
        app.mount(this.element);
        (this as any).vueApp = app;
      },
      destroy() {
        if ((this as any).vueApp) {
          (this as any).vueApp.unmount();
        }
      },
    });

    // 注册块菜单
    this.eventBus.on('click-blockicon', this.handleBlockIconClick.bind(this));
    this.eventBus.on('click-editortitleicon', this.handleEditorTitleIconClick.bind(this));
    this.eventBus.on('open-menu-breadcrumbmore', this.handleBreadcrumbMore.bind(this));
    this.eventBus.on('open-menu-doctree', this.handleDocTreeMenu.bind(this));

    // 将插件实例存储到全局变量，供 RestoreTab 访问
    (window as any).siyuanMemoPlugin = this;

    console.log('[SiyuanMemo] Plugin loaded successfully');
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
  }

  onunload() {
    console.log('[SiyuanMemo] Plugin unloading...');

    // 关闭复习对话框和 SRS 浏览器
    this.reviewDialog?.destroy();
    this.srsBrowserDialog?.destroy();

    // 卸载 TransactionObserver
    // ⚠️ DEPRECATED: TransactionObserver 已被 AutoCardHandler 替代
    // if (this.transactionObserver) {
    //   this.transactionObserver.unload();
    // }

    // 🆕 清理全量同步定时器
    if (this.fullSyncTimer) {
      clearInterval(this.fullSyncTimer);
      this.fullSyncTimer = undefined;
      console.log('[SiyuanMemo] ✅ Full sync timer cleared');
    }

    // 🆕 停止 HybridSyncService
    if (this.hybridSyncService) {
      this.hybridSyncService.stop();
      console.log('[SiyuanMemo] ✅ HybridSyncService stopped');
    }

    // 🆕 停止 TransactionWebSocketService
    if (this.transactionWebSocketService) {
      this.transactionWebSocketService.stop();
      console.log('[SiyuanMemo] ✅ TransactionWebSocketService stopped');
    }

    try {
      if (this.topBarElement && this.topBarContextMenuHandler) {
        this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
      }
    } catch {}

    // 保存数据
    this.storage?.saveCards?.();

    console.log('[SiyuanMemo] Plugin unloaded');
  }

  /**
   * 打开顶栏右键菜单
   */
  private openTopBarMenu(ev: MouseEvent) {
    this.ensureTopbarMounted();
    // 🆕 使用 MenuService
    this.menuService.openTopBarMenu(ev);
  }

  private ensureTopbarMounted(): void {
    const el = this.topBarElement;
    if (!el) return;
    if (el.isConnected) return;

    const right = document.querySelector('.toolbar__right') as HTMLElement | null;
    const left = document.querySelector('.toolbar__left') as HTMLElement | null;
    const container = right || left;
    if (container) {
      try {
        container.appendChild(el);
        el.style.display = '';
        el.style.opacity = '1';
        el.style.pointerEvents = '';
        return;
      } catch (err) {
        if (!this.didWarnTopbarMount) {
          console.warn('[SiyuanMemo] Failed to remount topbar element:', err);
          this.didWarnTopbarMount = true;
        }
        return;
      }
    }

    if (!this.didWarnTopbarMount) {
      console.warn('[SiyuanMemo] Topbar container not found; topbar button may be hidden by layout');
      this.didWarnTopbarMount = true;
    }
  }

  openSetting(defaultTab?: string) {
    const currentSettings = this.storage.getSettings();
    const settingsDialog = createVueDialog({
      title: this.i18n?.settings || '设置',
      component: SettingsPanel,
      props: {
        fsrsSettings: currentSettings.fsrs,
        queueSettings: currentSettings.queues,
        schedulerSettings: currentSettings.scheduler,  // 🆕 新增
        riffIntegrationSettings: currentSettings.riffIntegration,  // 🆕 Riff 集成配置
        incrementalSettings: currentSettings.incremental,  // 🆕 新增
        uiSettings: { enableDebugLogs: currentSettings.ui?.enableDebugLogs ?? false },  // 🆕 新增
        i18n: this.i18n || {},
        defaultTab,
        queueCount: this.retrievalQueue['localBuffer']?.length || 0,
        queueHandlers: {
          preview: (filter: PracticeQueueFilter) => this.previewPracticeQueue(filter),
          add: (filter: PracticeQueueFilter) => this.addPracticeQueue(filter),
          start: () => this.startPracticeQueue(),
          clear: () => this.clearPracticeQueue(),
        },
        optimizationHandlers: {  // 🆕 参数优化处理器
          optimize: async (config: any) => {
            return await this.optimizeParameters(config);
          },
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
            },
            queues: settings.queues || currentSettings.queues,
            scheduler: settings.scheduler || currentSettings.scheduler,  // 🆕 保存调度器配置
            riffIntegration: settings.riffIntegration || currentSettings.riffIntegration,  // 🆕 保存 Riff 集成配置
            incremental: settings.incremental || currentSettings.incremental,  // 🆕 保存增量阅读配置
            ui: settings.ui || currentSettings.ui,  // 🆕 保存 UI 设置
          };
          await this.storage.updateSettings(updatedSettings);
          this.scheduler.updateParams(updatedSettings.fsrs);

          // 🆕 更新 SchedulerRouter 配置
          if (this.schedulerRouter && settings.scheduler) {
            this.schedulerRouter.updateConfig({
              defaultScheduler: settings.scheduler.defaultScheduler,
              enableRiffSync: settings.scheduler.enableRiffSync,
              fsrsParams: updatedSettings.fsrs,
            });
            console.log('[SiyuanMemo] ✅ SchedulerRouter config updated');
          }

          // 🆕 更新 TransactionObserver 启用状态
          // ⚠️ DEPRECATED: TransactionObserver 已被 AutoCardHandler 替代
          // if (this.transactionObserver && settings.incremental) {
          //   const autoCardEnabled = settings.incremental.autoCardEnabled || false;
          //   this.transactionObserver.setEnabled(autoCardEnabled);
          //   console.log('[SiyuanMemo] ✅ TransactionObserver enabled:', autoCardEnabled);
          // }

          // 🆕 更新 HybridSyncService 配置（如果需要）
          if (settings.riffIntegration && this.hybridSyncService) {
            // 清理旧定时器
            if (this.fullSyncTimer) {
              clearInterval(this.fullSyncTimer);
              this.fullSyncTimer = undefined;
            }
            
            // 重启服务以应用新配置
            this.hybridSyncService.stop();
            this.hybridSyncService = new HybridSyncService({
              deckId: riff.BUILTIN_DECK_ID,
              storage: this.storage,
              incrementalSync: {
                ...settings.riffIntegration.incrementalSync,
                autoDetectCardType: true
              },
              fullSync: settings.riffIntegration.fullSync,
              deleteSync: settings.riffIntegration.deleteSync
            });
            await this.hybridSyncService.start();
            
            // 重启定时器
            if (settings.riffIntegration.fullSync.enabled) {
              this.fullSyncTimer = setInterval(
                () => this.hybridSyncService!.fullSync(),
                settings.riffIntegration.fullSync.interval
              );
              console.log(`[SiyuanMemo] Full sync timer restarted (interval: ${settings.riffIntegration.fullSync.interval}ms)`);
            }
            
            console.log('[SiyuanMemo] ✅ HybridSyncService config updated');
          } else if (settings.riffIntegration && !this.hybridSyncService) {
            // 如果 HybridSyncService 未初始化，初始化它
            this.hybridSyncService = new HybridSyncService({
              deckId: riff.BUILTIN_DECK_ID,
              storage: this.storage,
              incrementalSync: {
                ...settings.riffIntegration.incrementalSync,
                autoDetectCardType: true
              },
              fullSync: settings.riffIntegration.fullSync,
              deleteSync: settings.riffIntegration.deleteSync
            });
            await this.hybridSyncService.start();
            
            // 启动定时器
            if (settings.riffIntegration.fullSync.enabled) {
              this.fullSyncTimer = setInterval(
                () => this.hybridSyncService!.fullSync(),
                settings.riffIntegration.fullSync.interval
              );
              console.log(`[SiyuanMemo] Full sync timer started (interval: ${settings.riffIntegration.fullSync.interval}ms)`);
            }
            
            console.log('[SiyuanMemo] ✅ HybridSyncService initialized');
          }

          // 🆕 更新 TransactionWebSocketService 配置
          if (settings.riffIntegration) {
            const incrementalEnabled = settings.riffIntegration.incrementalSync?.enabled || false;
            
            if (incrementalEnabled && this.hybridSyncService) {
              // 需要启用 TransactionWebSocketService
              if (!this.transactionWebSocketService) {
                // 初始化服务
                console.log('[SiyuanMemo] Initializing TransactionWebSocketService...');
                this.transactionWebSocketService = new TransactionWebSocketService(this);
                
                // 创建并注册 RiffSyncHandler
                const riffSyncHandler = new RiffSyncHandler(this.hybridSyncService);
                this.transactionWebSocketService.registerHandler(riffSyncHandler);
                
                // 🆕 创建并注册 AutoCardHandler（自动制卡处理器）
                const { AutoCardHandler } = await import('@/services/handlers/AutoCardHandler');
                const autoCardHandler = new AutoCardHandler(this);
                this.transactionWebSocketService.registerHandler(autoCardHandler);
                console.log('[SiyuanMemo] ✅ AutoCardHandler registered');
                
                // 启动服务
                this.transactionWebSocketService.start();
                console.log('[SiyuanMemo] ✅ TransactionWebSocketService initialized and started');
              }
              // 如果已经初始化，不需要重启（处理器会自动使用新的 HybridSyncService 实例）
            } else {
              // 需要停止 TransactionWebSocketService
              if (this.transactionWebSocketService) {
                console.log('[SiyuanMemo] Stopping TransactionWebSocketService...');
                this.transactionWebSocketService.stop();
                this.transactionWebSocketService = undefined;
                console.log('[SiyuanMemo] ✅ TransactionWebSocketService stopped');
              }
            }
          }
        },
        close: () => {
          settingsDialog.destroy();
        },
        // 🆕 数据修复事件
        'repair-dates': async () => {
          try {
            const result = await this.storage.repairInvalidDates();
            if (result.fixed > 0) {
              pushMsg(`已修复 ${result.fixed}/${result.total} 张卡片的无效日期`, 5000);
            } else {
              pushMsg(`检查完成，未发现问题（共 ${result.total} 张卡片）`, 3000);
            }
            // 通知设置面板更新结果显示
            // 注意：由于 Vue 组件的限制，这里无法直接更新组件状态
            // 可以考虑使用事件总线或其他方式
          } catch (err) {
            console.error('[SiyuanMemo] Failed to repair dates:', err);
            pushErrMsg(`修复失败: ${err.message}`);
          }
        }
      },
      width: '700px',
      height: '600px',
    });
  }






  /**
   * 打开卡片浏览器（Dialog 模式）
   * 实现单例模式：避免重复打开多个浏览器窗口
   */
  openSRSBrowser() {
    // 如果已有打开的浏览器，先销毁
    if (this.srsBrowserDialog) {
      this.srsBrowserDialog.destroy();
    }

    this.srsBrowserDialog = createVueDialog({
      title: this.i18n?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        app: this.app,
        i18n: this.i18n || {},
        mode: 'dialog',
        plugin: this,
      },
      events: {
        convertToTab: () => {
          // 关闭对话框并打开 Tab
          this.srsBrowserDialog?.destroy();
          this.srsBrowserDialog = null;
          this.openSRSBrowserTab();
        },
      },
      width: '90vw',
      height: '80vh',
      onClose: () => {
        // 对话框关闭时清理引用
        this.srsBrowserDialog = null;
      },
    });
  }

  /**
   * 打开卡片浏览器（Tab 模式）
   */
  openSRSBrowserTab() {
    openTab({
      app: this.app,
      custom: {
        icon: 'iconCard',
        title: this.i18n?.srsBrowser || 'SRS 浏览器',
        id: this.name + this.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
  }

  /**
   * 打开复习界面（Tab 模式）
   */
  openReviewTab(options: {
    provider?: any;
    queue?: any;
    adapter: any;
    title: string;
  }): void {
    try {
      const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
      
      openTab({
        app: this.app,
        custom: {
          icon: 'iconSiyuanMemo',
          title: options.title,
          id: this.name + this.REVIEW_TAB_TYPE,
          data: {
            provider: options.provider,
            queue: options.queue,
            adapter: options.adapter,
            title: options.title,
            providerId: providerId,
          },
        },
        position: 'right',
      });
    } catch (err) {
      console.error('[SiyuanMemo] Failed to open review tab:', err);
      void pushErrMsg(this.i18n?.openFailed || '打开标签页失败');
    }
  }

  /**
   * 打开复习面板（弹窗模式）- 使用 Vue UI 2.0
   */
  async openReviewDialog() {
    await this.reviewDialogManager.openRetrievalPractice();
  }

  async openReviewV2Dialog() {
    await this.reviewDialogManager.openRetrievalPractice();
  }

  async openReviewProviderV2Dialog() {
    await this.reviewDialogManager.openRetrievalPractice();
  }

  async openLeechReviewDialog() {
    await this.reviewDialogManager.openLeechReview();
  }

  async openFinalDrillV2Dialog() {
    await this.reviewDialogManager.openFinalDrill();
  }

  async openFinalDrillProviderV2Dialog() {
    await this.reviewDialogManager.openFinalDrill();
  }

  async openFinalDrillDialog() {
    await this.reviewDialogManager.openFinalDrill();
  }

  /**
   * 打开渐进学习队列对话框
   */
  async openIncrementalLearningDialog() {
    await this.reviewDialogManager.openIncrementalLearning();
  }

  async openFilterGroupPracticeDialog() {
    await this.reviewDialogManager.openFilterGroupPractice();
  }

  async openLeechPracticeDialog() {
    await this.reviewDialogManager.openLeechReview();
  }

  async openNeuralRoamDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewDialogManager.openNeuralRoam(options);
  }

  async openNeuralRoamV2Dialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewDialogManager.openNeuralRoam(options);
  }

  async openNeuralReviewDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.reviewDialogManager.openNeuralRoam(options);
  }

  async openSubsetReviewDialog(blockIds: string[]) {
    await this.reviewDialogManager.openSubsetReview(blockIds);
  }

  private openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
    this.reviewDialogManager.openDrillWithCards(cards, practiceMode);
  }

  /**
   * 初始化 Dock 面板
   */
  private initDockPanel(element: HTMLElement) {
    const dueCount = this.storage.getDueCards().length;
    const totalCount = this.storage.getAllCards().length;

    element.innerHTML = `
      <div class="siyuanmemo-dock-container">
        <div class="siyuanmemo-dock-header">FSRS ${this.i18n?.flashcard || '闪卡'}</div>
        <div class="siyuanmemo-dock-content">
          <div class="siyuanmemo-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">${this.i18n?.dueCountLabel || '待复习'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">${this.i18n?.totalCountLabel || '总卡片'}</span>
            </div>
          </div>
          <div class="siyuanmemo-dock-buttons">
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-start-review">
              <svg class="b3-button__icon"><use xlink:href="#iconRiffCard"></use></svg>
              ${this.i18n?.startReview || '开始复习'}
            </button>
            <button class="siyuanmemo-dock-btn b3-button b3-button--outline" id="fsrs-srs-browser">
              <svg class="b3-button__icon"><use xlink:href="#iconLayoutRight"></use></svg>
              ${this.i18n?.srsBrowser || 'SRS 浏览器'}
            </button>
          </div>
        </div>
      </div>
    `;

    // 绑定按钮事件
    element.querySelector('#fsrs-start-review')?.addEventListener('click', () => {
      this.openReviewDialog();
    });

    element.querySelector('#fsrs-srs-browser')?.addEventListener('click', () => {
      this.openSRSBrowser();
    });
  }












  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  private handleBlockIconClick(e: any) {
    this.blockMenuHandler.handleBlockIconClick(e);
  }

  private handleEditorTitleIconClick(e: any) {
    this.blockMenuHandler.handleEditorTitleIconClick(e);
  }

  private handleBreadcrumbMore(e: any) {
    this.blockMenuHandler.handleBreadcrumbMore(e);
  }

  private handleDocTreeMenu(e: any) {
    this.blockMenuHandler.handleDocTreeMenu(e);
  }

  private getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    return this.blockMenuHandler.getDrillBlockElements(blockElements);
  }

  private buildDrillCardsFromElements(elements: HTMLElement[]) {
    return this.blockMenuHandler.buildDrillCardsFromElements(elements);
  }

  private async getDrillCardsFromDocTree(docId: string) {
    return this.blockMenuHandler.getDrillCardsFromDocTree(docId);
  }

  private async buildDrillCardsFromBlockIds(blockIds: string[]) {
    return this.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
  }

  private async getPracticeQueueBlockIds(filter: PracticeQueueFilter): Promise<string[]> {
    return getCardBlockIds({ type: filter.type, value: filter.value });
  }

  private async previewPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    return blockIds.length;
  }

  private async addPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    if (blockIds.length === 0) return 0;
    
    // ✅ 新架构：使用 addCard 方法（逐个添加）
    if (this.retrievalQueue?.addCard) {
      let added = 0;
      for (const blockId of blockIds) {
        try {
          await this.retrievalQueue.addCard(blockId, 'manual');
          added++;
        } catch (err) {
          console.error(`[Plugin] 添加卡片失败: ${blockId}`, err);
        }
      }
      return added;
    }
    
    // ✅ 旧架构：使用 addItems 方法（批量添加）
    if (this.retrievalQueue?.addItems) {
      const cards = await this.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
      return this.retrievalQueue.addItems(cards as QueueItem[]);
    }
    
    return 0;
  }

  private async clearPracticeQueue(): Promise<void> {
    await clearPracticeQueue({
      blockMenuHandler: this.blockMenuHandler,
      retrievalQueue: this.retrievalQueue,
    });
  }

  private async startPracticeQueue(): Promise<void> {
    // ✅ 新架构：使用 getAllCards 或 getSize
    let cards: any[] = [];
    let isEmpty = false;
    
    if (this.retrievalQueue?.getAllCards) {
      cards = await this.retrievalQueue.getAllCards();
      isEmpty = cards.length === 0;
    } else if (this.retrievalQueue?.getSize) {
      const size = await this.retrievalQueue.getSize();
      isEmpty = size === 0;
    } else if (this.retrievalQueue?.getAllItems) {
      // ✅ 旧架构：使用 getAllItems
      cards = this.retrievalQueue.getAllItems();
      isEmpty = cards.length === 0;
    }
    
    if (isEmpty) {
      await pushMsg(this.i18n?.practiceQueueEmpty || '练习队列为空');
      return;
    }
    
    this.openDrillDialogWithCards(cards, 'queue');
  }

  /**
   * 🆕 优化 FSRS 参数
   * 
   * 根据用户的复习历史数据优化 FSRS 参数
   */
  private async optimizeParameters(config: any): Promise<any> {
    const { ParameterOptimizer } = await import('@/core/scheduler/services/ParameterOptimizer');
    
    // 获取所有复习历史
    const reviewLogs = await this.storage.getAllReviewLogs();
    
    if (!reviewLogs || reviewLogs.length < 100) {
      throw new Error(this.i18n?.notEnoughReviewData || '复习数据不足，需要至少 100 条复习记录才能进行参数优化。');
    }
    
    // 创建优化器并执行优化
    const optimizer = new ParameterOptimizer();
    const result = await optimizer.optimize(reviewLogs, {
      enableShortTerm: config.enableShortTerm,
      progress: config.progress,
      timeout: 300000, // 5分钟超时
    });
    
    console.log('[Plugin] Parameter optimization completed:', result);
    
    return result;
  }




  /**
   * 在新窗口中打开复习界面（优雅实现 - 参考思源原生）
   */
  openReviewInNewWindow(options: {
    provider?: any;
    queue?: any;
    adapter: any;
    title: string;
  }): void {
    /// #if !BROWSER
    try {
      const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
      
      // 🔧 修复：不传递完整对象，只传递必要的标识符
      // 新窗口会重新创建 provider/queue/adapter
      const json = [{
        "title": options.title,
        "icon": "iconSiyuanMemo",
        "instance": "Tab",
        "children": {
          "instance": "Custom",
          "customModelType": this.REVIEW_TAB_TYPE,
          "customModelData": {
            // 只传递标识符，不传递完整对象（避免循环引用）
            "providerId": providerId,
            "title": options.title,
            // 新窗口会根据 providerId 重新创建 provider/queue/adapter
          }
        }
      }];
      
      // 发送到主进程（参考思源原生实现）
      ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
        url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`
      });
      
      console.log('[SiyuanMemo] Opened review in new window (elegant implementation)');
    } catch (err) {
      console.error('[SiyuanMemo] Failed to open review in new window:', err);
      void pushErrMsg(this.i18n?.openFailed || '打开新窗口失败');
    }
    /// #else
    // 浏览器环境降级：使用 Tab 模式
    console.warn('[SiyuanMemo] New window not supported in browser, using tab instead');
    this.openReviewTab(options);
    /// #endif
  }

  /**
   * 🆕 打开创建模板卡片对话框（Xiuyuan）- 带块 ID 列表
   */
  async openCreateTemplateCardDialogWithBlockIds(blockIds: string[]) {
    try {
      if (!blockIds || blockIds.length === 0) {
        pushMsg('未找到选中的块');
        return;
      }

      // 获取所有可用模板
      const templates = this.xiuyuanService.getAllTemplates();
      if (templates.length === 0) {
        pushMsg('暂无可用模板，请先创建模板');
        return;
      }

      // 显示模板选择对话框
      const templateSelectDialog = createVueDialog({
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
            const template = this.xiuyuanService.getTemplate(templateId);
            if (!template) return;

            // 自动字段映射：按顺序映射块到字段
            const fieldMapping: Record<string, string> = {};
            template.fields.forEach((field, index) => {
              if (index < blockIds.length) {
                fieldMapping[field.name] = blockIds[index];
              }
            });

            // 创建 Xiuyuan 和卡片
            try {
              const result = await this.xiuyuanService.createFromBlocks(
                blockIds,
                templateId,
                fieldMapping,
                riff.BUILTIN_DECK_ID
              );

              if (!result.ok) {
                console.error('[SiyuanMemo] Failed to create template card:', result.error);
                pushErrMsg(`创建失败：${result.error.message}`);
                templateSelectDialog.destroy();
                return;
              }

              const { xiuyuan, cards } = result.value;
              console.log('[SiyuanMemo] Xiuyuan created:', { xiuyuan, cards });

              pushMsg(
                `✅ 模板卡片创建成功！\n` +
                `模板：${template.name}\n` +
                `生成卡片：${cards.length} 张`
              );
            } catch (err) {
              console.error('[SiyuanMemo] Failed to create template card:', err);
              pushErrMsg(`创建失败：${(err as Error).message}`);
            }

            templateSelectDialog.destroy();
          },
          cancel: () => {
            templateSelectDialog.destroy();
          },
        },
      });
    } catch (err) {
      console.error('[SiyuanMemo] Failed to open create template card dialog:', err);
      pushErrMsg(`打开对话框失败：${(err as Error).message}`);
    }
  }


  /**
   * 获取到期卡片数量
   */
  getDueCount(): number {
    return this.storage.getDueCards().length;
  }
}
