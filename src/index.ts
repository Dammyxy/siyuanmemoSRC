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
} from 'siyuan';
import { createApp } from 'vue';

import { StorageManager } from '@/core/storage';
import { createScheduler, type SchedulerEngineAdapter, SchedulerRouter } from '@/core/scheduler';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, unmarkBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import { FinalDrillAdapter, FinalDrillProvider, LeechAdapter, NeuralRoamAdapter, RetrievalPracticeAdapter, ReviewView, SubsetPracticeAdapter } from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { SettingsPanel } from '@/ui/settings';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';
// import { FSRSRetrievalProvider } from '@/core/extensions'; // Reserved for future use

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
// 队列导入（直接从V2文件导入）
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import { FilterGroupQueue } from '@/core/queue/strategies/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/strategies/NeuralRoamQueue';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
import { NeuralQueueStorage } from '@/core/queue/neural';
import { ExtractionNativeAdapter, FinalDrillNativeAdapter } from '@/core/native/adapter';
// Services
import { DialogService, MenuService, ReviewDialogManager, BlockMenuHandler, createQueueHandlers, clearPracticeQueue } from '@/services';
import { NativeReviewSession } from '@/core/native/session';

// Topic/Item 迁移
import { checkMigrationNeeded, migrateExistingCards } from '@/scripts/migrateToTopicItem';

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
  public neuralQueue!: NeuralRoamQueue;
  public finalDrillQueue!: FinalDrillQueue;
  public leechQueue!: LeechQueue;
  public incrementalQueue!: IncrementalLearningQueue;
  private subsetQueue!: FilterGroupQueue; // 内部命名

  // 🆕 Services
  private dialogService!: DialogService;
  private menuService!: MenuService;
  private xiuyuanService!: XiuyuanService;
  private xiuyuanStorage!: XiuyuanStorage;
  private reviewDialogManager!: ReviewDialogManager;
  private blockMenuHandler!: BlockMenuHandler;
  private transactionObserver!: TransactionObserver;

  // 为兼容性提供的别名访问器
  public get deliberateQueue(): FinalDrillQueue {
    return this.finalDrillQueue;
  }

  public get neuralRoamQueue(): NeuralRoamQueue {
    return this.neuralQueue;
  }

  // filterGroupQueue 别名 → subsetQueue（保持兼容性）
  public get filterGroupQueue(): FilterGroupQueue {
    return this.subsetQueue;
  }

  private TAB_TYPE = 'plugin-fsrs-srs-browser';

  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;


  // UI 状态
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;
  private srsBrowserDialog: { dialog: any; destroy: () => void } | null = null;

  // 自定义 Tab
  static readonly REVIEW_TAB_TYPE = "-review-tab";
  readonly REVIEW_TAB_ID: string;
  private reviewTab: any;

  constructor(options: any) {
    super(options);
    // 初始化 Tab ID
    this.REVIEW_TAB_ID = `${this.name}${FSRSPlugin.REVIEW_TAB_TYPE}`;
  }

  async onload() {
    console.log('[FSRS] Plugin loading...');

    this.isInitialized = false;

    try {
      this.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="iconFSRS" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/>
  </symbol>
</svg>`);
      this.topBarElement = this.addTopBar({
        icon: 'iconFSRS',
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
      console.error('[FSRS] Failed to register topbar:', err);
    }

    // 检测运行环境
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
    this.isBrowser = frontEnd.includes('browser');

    try {
      // 初始化存储
      this.storage = new StorageManager(this.name);
      await this.storage.init();

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

      // ✅ 使用 队列（复合架构）
      this.retrievalQueue = new RetrievalPracticeQueue({
        storage: this.storage,
        localScheduler: this.scheduler,      // 保留（向后兼容）
        schedulerRouter: this.schedulerRouter, // 🆕 新增
      });

      this.queueContext = new QueueContext<QueueItem>({
        initial: 'retrieval',
        monitors: [new ConsoleQueueMonitor()],
      });
      this.queueContext.register('retrieval', this.retrievalQueue as any);
      
      const groupConfigs = (settings.queues?.filterGroup?.groups || []).map((g: any) => ({
        id: String(g.id),
        weight: Number(g.weight) || 1,
      })).filter((g: any) => g.id);
      const configs = groupConfigs.length ? groupConfigs : [{ id: 'default', weight: 1 }];

      // ✅ 使用 队列（复合架构）
      const filterGroupQueue = new FilterGroupQueue(
        configs,
        new StorageFileJsonAdapter(this.storage, 'queue-filter-group.json'),
      );
      await filterGroupQueue.init();
      this.subsetQueue = filterGroupQueue;
      this.queueContext.register('filter-group', this.subsetQueue as any);

      // ✅ 使用 队列（复合架构）
      this.finalDrillQueue = new FinalDrillQueue(this.storage);
      await this.finalDrillQueue.init();
      this.queueContext.register('final-drill', this.finalDrillQueue as any);

      // 初始化难点攻坚队列（✅ 使用 V2）
      this.leechQueue = new LeechQueue();
      this.queueContext.register('leech' as any, this.leechQueue as any);

      // 初始化神经漫游队列（✅ 使用 V2）
      const neuralConfig = NeuralQueueStorage.loadConfig();
      this.neuralQueue = new NeuralRoamQueue({ config: neuralConfig });
      this.queueContext.register('neural-roam', this.neuralQueue as any);

      // 初始化渐进学习队列（✅ 使用 V2 - Simplified）
      this.incrementalQueue = new IncrementalLearningQueue({
        storage: this.storage,
        scheduler: this.scheduler,
        schedulerRouter: this.schedulerRouter, // 🆕 Phase 2.1: 传入 schedulerRouter
        config: {
          enableRiffSync: settings.scheduler?.enableRiffSync || false, // 🆕 Phase 2.1: 传入配置
        },
      });
      this.queueContext.register('incremental-learning' as any, this.incrementalQueue as any);

      console.log('[FSRS] ✅ Incremental learning queue initialized:', {
        hasQueue: !!this.incrementalQueue,
        hasAddItems: typeof this.incrementalQueue.addItems === 'function',
        queueName: this.incrementalQueue.constructor.name,
        hasSchedulerRouter: !!this.schedulerRouter,
        enableRiffSync: settings.scheduler?.enableRiffSync || false,
      });

      console.log('[FSRS] ✅ SchedulerRouter initialized');

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

      console.log('[FSRS] ✅ Services initialized');

      // 🆕 初始化 ReviewDialogManager
      this.reviewDialogManager = new ReviewDialogManager({
        app: this.app,
        i18n: this.i18n || {},
        storage: this.storage,
        scheduler: this.scheduler,
        finalDrillQueue: this.finalDrillQueue,
        filterGroupQueue: this.subsetQueue,
        incrementalQueue: this.incrementalQueue,
        isInitialized: () => this.isInitialized,
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
      });

      console.log('[FSRS] ✅ ReviewDialogManager & BlockMenuHandler initialized');

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
      console.log('[FSRS] ✅ XiuyuanService initialized with', BUILTIN_TEMPLATES.length, 'builtin templates');

      // 🆕 初始化 TransactionObserver（自动制卡）
      this.transactionObserver = new TransactionObserver(this);
      this.transactionObserver.init();
      
      // 根据设置启用/禁用自动制卡
      const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
      this.transactionObserver.setEnabled(autoCardEnabled);
      console.log('[FSRS] ✅ TransactionObserver initialized, autoCardEnabled:', autoCardEnabled);

      this.isInitialized = true;

      // 检查是否需要 Topic/Item 迁移
      setTimeout(async () => {
        try {
          const needsMigration = await checkMigrationNeeded();
          if (needsMigration) {
            console.log('[FSRS] Topic/Item migration needed');
            // 显示迁移提示对话框
            const confirmed = confirm(
              '检测到现有卡片需要识别 Topic/Item 类型。\n\n' +
              'Topic（主题）= 纯阅读材料，使用 A-Factor 算法\n' +
              'Item（卡片）= 问答卡片，使用 FSRS 算法\n\n' +
              '是否立即自动识别？'
            );

            if (confirmed) {
              pushMsg('正在识别卡片类型，请稍候...');
              const result = await migrateExistingCards();
              pushMsg(
                `✅ 识别完成！\n` +
                `总计：${result.total} 张卡片\n` +
                `主题：${result.topics} 张\n` +
                `卡片：${result.items} 张\n` +
                `耗时：${result.duration}ms`
              );
            } else {
              console.log('[FSRS] User cancelled Topic/Item migration');
            }
          } else {
            console.log('[FSRS] No Topic/Item migration needed');
          }
        } catch (err) {
          console.error('[FSRS] Topic/Item migration check failed:', err);
        }
      }, 2000); // 延迟 2 秒，避免影响启动速度
    } catch (err) {
      console.error('[FSRS] Plugin initialization failed:', err);
      try {
        await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      } catch {}
    }

    // 注册复习 Tab
    try {
      this.reviewTab = this.addTab({
        type: FSRSPlugin.REVIEW_TAB_TYPE,
        init() {
          console.log('[FSRS Review Tab] Init called with data:', this.data);
          const tab = this as any;

          // 显示复习准备界面
          tab.element.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100%;
              padding: 20px;
              text-align: center;
            ">
              <div style="font-size: 48px; margin-bottom: 20px;">📚</div>
              <h2 style="margin-bottom: 10px;">从这里复习</h2>
              <p style="color: var(--b3-theme-on-surface); margin-bottom: 20px;">
                在新窗口中继续复习
              </p>
              <button id="start-review-btn" class="b3-button b3-button--primary" style="margin-top: 20px;">
                开始复习
              </button>
            </div>
          `;

          // 绑定按钮事件
          const startBtn = tab.element.querySelector('#start-review-btn');
          if (startBtn) {
            startBtn.addEventListener('click', () => {
              console.log('[FSRS Review Tab] Start review button clicked');
              // 通过全局变量获取插件实例
              const plugin = (window as any).siyuanFsrsPlugin;
              if (plugin && typeof plugin.openReviewDialogFromSavedState === 'function') {
                plugin.openReviewDialogFromSavedState();
              } else {
                console.error('[FSRS Review Tab] Plugin instance or method not found');
              }
            });
          }
        },
        destroy() {
          const tab = this as any;
          if (tab.vueApp) {
            tab.vueApp.unmount();
            tab.vueApp = undefined;
          }
        },
      });
      console.log('[FSRS] Review tab registered:', this.REVIEW_TAB_ID);
    } catch (err) {
      console.error('[FSRS] Failed to register review tab:', err);
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
      type: 'fsrs-dock',
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



    // 注册块菜单
    this.eventBus.on('click-blockicon', this.handleBlockIconClick.bind(this));
    this.eventBus.on('click-editortitleicon', this.handleEditorTitleIconClick.bind(this));
    this.eventBus.on('open-menu-breadcrumbmore', this.handleBreadcrumbMore.bind(this));

    // 将插件实例存储到全局变量，供 RestoreTab 访问
    (window as any).siyuanFsrsPlugin = this;

    console.log('[FSRS] Plugin loaded successfully');
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
  }

  onunload() {
    console.log('[FSRS] Plugin unloading...');

    // 关闭复习对话框和 SRS 浏览器
    this.reviewDialog?.destroy();
    this.srsBrowserDialog?.destroy();

    // 卸载 TransactionObserver
    if (this.transactionObserver) {
      this.transactionObserver.unload();
    }

    try {
      if (this.topBarElement && this.topBarContextMenuHandler) {
        this.topBarElement.removeEventListener('contextmenu', this.topBarContextMenuHandler);
      }
    } catch {}

    // 保存数据
    this.storage?.saveCards?.();

    console.log('[FSRS] Plugin unloaded');
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
          console.warn('[FSRS] Failed to remount topbar element:', err);
          this.didWarnTopbarMount = true;
        }
        return;
      }
    }

    if (!this.didWarnTopbarMount) {
      console.warn('[FSRS] Topbar container not found; topbar button may be hidden by layout');
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
        incrementalSettings: currentSettings.incremental,  // 🆕 新增
        i18n: this.i18n || {},
        defaultTab,
        queueCount: this.retrievalQueue['localBuffer']?.length || 0,
        queueHandlers: {
          preview: (filter: PracticeQueueFilter) => this.previewPracticeQueue(filter),
          add: (filter: PracticeQueueFilter) => this.addPracticeQueue(filter),
          start: () => this.startPracticeQueue(),
          clear: () => this.clearPracticeQueue(),
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
            incremental: settings.incremental || currentSettings.incremental,  // 🆕 保存增量阅读配置
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
            console.log('[FSRS] ✅ SchedulerRouter config updated');
          }

          // 🆕 更新 TransactionObserver 启用状态
          if (this.transactionObserver && settings.incremental) {
            const autoCardEnabled = settings.incremental.autoCardEnabled || false;
            this.transactionObserver.setEnabled(autoCardEnabled);
            console.log('[FSRS] ✅ TransactionObserver enabled:', autoCardEnabled);
          }
        },
        close: () => {
          settingsDialog.destroy();
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
      <div class="fsrs-dock-container">
        <div class="fsrs-dock-header">FSRS ${this.i18n?.flashcard || '闪卡'}</div>
        <div class="fsrs-dock-content">
          <div class="fsrs-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">${this.i18n?.dueCountLabel || '待复习'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">${this.i18n?.totalCountLabel || '总卡片'}</span>
            </div>
          </div>
          <div class="fsrs-dock-buttons">
            <button class="fsrs-dock-btn b3-button b3-button--outline" id="fsrs-start-review">
              <svg class="b3-button__icon"><use xlink:href="#iconRiffCard"></use></svg>
              ${this.i18n?.startReview || '开始复习'}
            </button>
            <button class="fsrs-dock-btn b3-button b3-button--outline" id="fsrs-srs-browser">
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

  private async handleEditorTitleIconClick(e: any) {
    await this.blockMenuHandler.handleEditorTitleIconClick(e);
  }

  private async handleBreadcrumbMore(e: any) {
    await this.blockMenuHandler.handleBreadcrumbMore(e);
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
    const cards = await this.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
    return this.retrievalQueue.addItems(cards as QueueItem[]);
  }

  private async clearPracticeQueue(): Promise<void> {
    await clearPracticeQueue({
      blockMenuHandler: this.blockMenuHandler,
      retrievalQueue: this.retrievalQueue,
    });
  }

  private async startPracticeQueue(): Promise<void> {
    const cards = this.retrievalQueue.getAllItems();
    if (cards.length === 0) {
      await pushMsg(this.i18n?.practiceQueueEmpty || '练习队列为空');
      return;
    }
    this.openDrillDialogWithCards(cards, 'queue');
  }





  /**
   * 在新窗口中打开复习界面（使用 Tab + 手动触发）
   */
  async openReviewInNewWindow(options: {
    blockId: string;
    providerId: string;
    title?: string;
  }) {
    const { blockId, providerId, title } = options;

    console.log('[FSRS] Opening review in new window for block:', blockId);

    // 保存复习类型到 localStorage（跨窗口共享）
    try {
      const reviewMeta = {
        providerId,
        title: title || '复习',
        timestamp: Date.now(),
      };
      localStorage.setItem('siyuanFsrsReviewMeta', JSON.stringify(reviewMeta));
      console.log('[FSRS] Saved review meta to localStorage:', reviewMeta);
    } catch (err) {
      console.error('[FSRS] Failed to save review meta:', err);
    }

    // 打开自定义 Tab，然后在新窗口中打开
    const tab = await openTab({
      app: this.app,
      custom: {
        icon: 'iconFSRS',
        title: title || '复习',
        id: this.REVIEW_TAB_ID,
        data: {
          // 不需要传递队列对象，只传递元数据
          blockId,
          providerId,
          title,
        },
      },
    });

    // 在新窗口中打开这个 tab
    if (tab) {
      openWindow({
        tab,
      });
    }

    // 关闭当前对话框
    const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]');
    if (dialogContainer) {
      const dialogs = (window as any).siyuan.dialogs || [];
      for (const dialog of dialogs) {
        if (dialog.element.contains(dialogContainer) || dialog.element === dialogContainer) {
          dialog.destroy();
          break;
        }
      }
    }
  }

  /**
   * 从保存的元数据恢复复习界面（供新窗口调用）
   */
  openReviewDialogFromSavedState() {
    let savedMeta: any;

    // 从 localStorage 读取复习元数据
    try {
      const metaStr = localStorage.getItem('siyuanFsrsReviewMeta');
      if (!metaStr) {
        console.warn('[FSRS] No saved review meta found');
        return;
      }
      savedMeta = JSON.parse(metaStr);

      // 检查状态是否过期（5 分钟）
      if (Date.now() - savedMeta.timestamp > 5 * 60 * 1000) {
        console.warn('[FSRS] Saved review meta is expired');
        localStorage.removeItem('siyuanFsrsReviewMeta');
        return;
      }

      console.log('[FSRS] Restoring review dialog from saved meta:', savedMeta);
    } catch (err) {
      console.error('[FSRS] Failed to parse saved review meta:', err);
      return;
    }

    // 清理保存的元数据
    localStorage.removeItem('siyuanFsrsReviewMeta');

    // 根据 provider ID 打开对应的复习对话框
    // 注意：这里我们重新开始复习，而不是严格恢复队列状态
    // 但对用户来说体验是一致的（复习相同的卡片）
    switch (savedMeta.providerId) {
      case 'retrieval':
        this.openReviewDialog();
        break;
      case 'final-drill':
        this.openFinalDrillDialog();
        break;
      case 'neural-roam':
        this.openNeuralRoamDialog();
        break;
      case 'leech':
        this.openLeechPracticeDialog();
        break;
      case 'filter-group':
        this.openFilterGroupPracticeDialog();
        break;
      default:
        console.log('[FSRS] Unknown provider ID, opening default review:', savedMeta.providerId);
        this.openReviewDialog();
    }
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
              const { xiuyuan, cards } = await this.xiuyuanService.createFromBlocks(
                blockIds,
                templateId,
                fieldMapping,
                riff.BUILTIN_DECK_ID
              );

              console.log('[FSRS] Xiuyuan created:', { xiuyuan, cards });

              pushMsg(
                `✅ 模板卡片创建成功！\n` +
                `模板：${template.name}\n` +
                `生成卡片：${cards.length} 张`
              );
            } catch (err) {
              console.error('[FSRS] Failed to create template card:', err);
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
      console.error('[FSRS] Failed to open create template card dialog:', err);
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
