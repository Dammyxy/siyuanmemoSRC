/**
 * ApplicationContext - 应用上下文
 * 
 * 职责：
 * - 管理所有服务的生命周期
 * - 提供依赖注入容器
 * - 提供统一的服务访问接口
 * 
 * @see .kiro/specs/ddd-refactoring/design.md - Section 2.1
 */

import type { Plugin } from 'siyuan';
import { StorageManager } from '@/core/storage';
import { SchedulerRouter, RescheduleService, createScheduler, type SchedulerEngineAdapter } from '@/core/scheduler';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { DialogManager } from '@/application/managers/DialogManager';
import { MenuManager } from '@/application/managers/MenuManager';
import { TabManager } from '@/application/managers/TabManager';
import { DockManager } from '@/application/managers/DockManager';
import { PracticeQueueManager } from '@/application/managers/PracticeQueueManager';
import { XiuyuanService, XiuyuanStorage } from '@/core/xiuyuan';
import { DialogService, MenuService, ReviewDialogManager, BlockMenuHandler, HybridSyncService } from '@/services';
import { TransactionWebSocketService } from '@/services/TransactionWebSocketService';
import { QueueContext, type QueueItem } from '@/core/queue';
import { RetrievalPracticeQueue } from '@/queues/RetrievalPracticeQueue';
import { FilterGroupQueue } from '@/queues/FilterGroupQueue';
import { FinalDrillQueue } from '@/queues/FinalDrillQueue';
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { QueueType } from '@/types/unified-data-source';
import { AdvancedDataRouter } from '@/routers/AdvancedDataRouter';

/**
 * 应用配置接口
 */
export interface ApplicationConfig {
  /** 思源插件实例 */
  plugin: Plugin;
  /** 国际化资源 */
  i18n: Record<string, any>;
}

/**
 * ApplicationContext 类
 * 
 * 应用上下文，管理所有服务的生命周期和依赖注入。
 * 采用工厂方法模式创建实例，确保所有依赖正确初始化。
 * 
 * 使用示例：
 * ```typescript
 * const context = await ApplicationContext.create({
 *   plugin: this,
 *   i18n: this.i18n
 * });
 * 
 * // 获取服务
 * const storage = context.getStorage();
 * 
 * // 销毁上下文
 * await context.dispose();
 * ```
 */
export class ApplicationContext {
  // ========================================================================
  // 核心服务
  // ========================================================================
  
  private storageManager: StorageManager;
  private schedulerRouter: SchedulerRouter;
  private scheduler: SchedulerEngineAdapter; // 向后兼容的旧调度器
  private rescheduleService: RescheduleService;
  private unifiedDataSourceManager: UnifiedDataSourceManager;
  
  // 队列
  private queueContext: QueueContext<QueueItem>;
  private retrievalQueue: RetrievalPracticeQueue;
  private finalDrillQueue: FinalDrillQueue;
  private leechQueue: LeechQueue;
  private incrementalQueue: IncrementalLearningQueue;
  private subsetQueue: FilterGroupQueue;
  
  // Xiuyuan 服务
  private xiuyuanStorage: XiuyuanStorage;
  private xiuyuanService: XiuyuanService;
  
  // 应用服务
  private dialogService: DialogService;
  private menuService: MenuService;
  private reviewDialogManager: ReviewDialogManager;
  private blockMenuHandler: BlockMenuHandler;
  
  // 基础设施服务
  private hybridSyncService?: HybridSyncService;
  private transactionWebSocketService?: TransactionWebSocketService;
  private fullSyncTimer?: NodeJS.Timeout;
  
  // ========================================================================
  // 服务容器
  // ========================================================================
  
  /**
   * 服务容器 - 管理所有服务的创建和访问
   * 使用 Map 存储服务实例，支持懒加载
   */
  private serviceContainer: Map<string, any> = new Map();
  
  /**
   * 服务工厂 - 定义如何创建各种服务
   * 键为服务名称，值为创建服务的工厂函数
   * 工厂函数接收 ApplicationContext 作为参数，用于依赖注入
   */
  private serviceFactories: Map<string, (context: ApplicationContext) => any> = new Map();
  
  // ========================================================================
  // 应用服务（懒加载）
  // ========================================================================
  
  // Phase 3 - 应用服务
  // 通过服务容器懒加载，不需要在这里声明私有字段
  
  // ========================================================================
  // UI 管理器（懒加载）
  // ========================================================================
  
  // TODO: Phase 1 Task 2 - 添加 UI 管理器
  // private dialogManager?: DialogManager; // ✅ Task 2.1 完成
  // private menuManager?: MenuManager;
  // private tabManager?: TabManager;
  
  // ========================================================================
  // 配置
  // ========================================================================
  
  private readonly config: ApplicationConfig;
  private disposed: boolean = false;
  
  /**
   * 私有构造函数
   * 使用 ApplicationContext.create() 工厂方法创建实例
   */
  private constructor(
    config: ApplicationConfig,
    services: {
      storageManager: StorageManager;
      schedulerRouter: SchedulerRouter;
      scheduler: SchedulerEngineAdapter;
      rescheduleService: RescheduleService;
      unifiedDataSourceManager: UnifiedDataSourceManager;
      queueContext: QueueContext<QueueItem>;
      retrievalQueue: RetrievalPracticeQueue;
      finalDrillQueue: FinalDrillQueue;
      leechQueue: LeechQueue;
      incrementalQueue: IncrementalLearningQueue;
      subsetQueue: FilterGroupQueue;
      xiuyuanStorage: XiuyuanStorage;
      xiuyuanService: XiuyuanService;
      dialogService: DialogService;
      menuService: MenuService;
      reviewDialogManager: ReviewDialogManager;
      blockMenuHandler: BlockMenuHandler;
      hybridSyncService?: HybridSyncService;
      transactionWebSocketService?: TransactionWebSocketService;
      fullSyncTimer?: NodeJS.Timeout;
    }
  ) {
    this.config = config;
    this.storageManager = services.storageManager;
    this.schedulerRouter = services.schedulerRouter;
    this.scheduler = services.scheduler;
    this.rescheduleService = services.rescheduleService;
    this.unifiedDataSourceManager = services.unifiedDataSourceManager;
    this.queueContext = services.queueContext;
    this.retrievalQueue = services.retrievalQueue;
    this.finalDrillQueue = services.finalDrillQueue;
    this.leechQueue = services.leechQueue;
    this.incrementalQueue = services.incrementalQueue;
    this.subsetQueue = services.subsetQueue;
    this.xiuyuanStorage = services.xiuyuanStorage;
    this.xiuyuanService = services.xiuyuanService;
    this.dialogService = services.dialogService;
    this.menuService = services.menuService;
    this.reviewDialogManager = services.reviewDialogManager;
    this.blockMenuHandler = services.blockMenuHandler;
    this.hybridSyncService = services.hybridSyncService;
    this.transactionWebSocketService = services.transactionWebSocketService;
    this.fullSyncTimer = services.fullSyncTimer;
    
    // 初始化服务容器
    this.initializeServiceContainer();
  }
  
  // ========================================================================
  // 服务容器管理
  // ========================================================================
  
  /**
   * 初始化服务容器
   * 
   * 注册所有服务的工厂函数，但不立即创建服务实例（懒加载）。
   * 服务只在第一次访问时才会被创建。
   */
  private initializeServiceContainer(): void {
    // 注册核心服务（已经创建，直接存储）
    this.serviceContainer.set('storage', this.storageManager);
    this.serviceContainer.set('scheduler', this.schedulerRouter);
    this.serviceContainer.set('unifiedDataSource', this.unifiedDataSourceManager);
    
    // TODO: Phase 1 Task 2 - 注册 UI 管理器工厂
    // ✅ Task 2.1: DialogManager 已注册
    this.registerServiceFactory('dialogManager', (context) => {
      return new DialogManager(context, context.getPlugin());
    });
    // ✅ Task 2.2: MenuManager 已注册
    this.registerServiceFactory('menuManager', (context) => {
      return new MenuManager(
        context, 
        context.getPlugin(), 
        context.getI18n(),
        context.getDialogManager()  // ✅ 注入 DialogManager
      );
    });
    // ✅ Task 2.3: TabManager 已注册
    this.registerServiceFactory('tabManager', (context) => {
      return new TabManager(context, context.getPlugin());
    });
    // ✅ Task 3.4: DockManager 已注册
    this.registerServiceFactory('dockManager', (context) => {
      return new DockManager(context.getPlugin(), context.getStorage(), context.getI18n());
    });
    // ✅ Task 3.4: PracticeQueueManager 已注册
    this.registerServiceFactory('practiceQueueManager', (context) => {
      return new PracticeQueueManager(
        context.getRetrievalQueue(),
        context.getBlockMenuHandler(),
        context.getI18n()
      );
    });
    
    // ✅ Task 13.1: 注册卡片应用服务工厂
    this.registerServiceFactory('cardService', (context) => {
      // 创建基础设施层：XiuyuanRepository
      const { XiuyuanRepository } = require('@/core/xiuyuan/infrastructure/XiuyuanRepository');
      const xiuyuanRepo = new XiuyuanRepository(
        context.getXiuyuanStorage(),
        context.getPlugin()
      );

      // 创建领域服务
      const { CardCreationService } = require('@/core/xiuyuan/domain/services/CardCreationService');
      const { CardDeletionService } = require('@/core/xiuyuan/domain/services/CardDeletionService');
      const cardCreationService = new CardCreationService();
      const cardDeletionService = new CardDeletionService();

      // 创建用例
      const { CreateCardUseCase } = require('@/application/usecases/card/CreateCardUseCase');
      const { DeleteCardUseCase } = require('@/application/usecases/card/DeleteCardUseCase');
      const { UpdateCardUseCase } = require('@/application/usecases/card/UpdateCardUseCase');
      const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
      const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService);
      const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

      // 创建应用服务
      const { CardApplicationService } = require('@/application/services/CardApplicationService');
      return new CardApplicationService(
        createCardUseCase,
        deleteCardUseCase,
        updateCardUseCase
      );
    });
    
    // ✅ 注册浏览器应用服务工厂
    this.registerServiceFactory('browserService', (context) => {
      // 创建领域服务
      const { CardScheduleService } = require('@/core/card/domain/services/CardScheduleService');
      const { CardFilterService } = require('@/core/card/domain/services/CardFilterService');
      const { CardSortService } = require('@/core/card/domain/services/CardSortService');
      const cardScheduleService = new CardScheduleService();
      const cardFilterService = new CardFilterService();
      const cardSortService = new CardSortService();

      // 创建应用服务
      const { BrowserApplicationService } = require('@/application/services/BrowserApplicationService');
      return new BrowserApplicationService(
        context.getStorage(),
        cardScheduleService,
        cardFilterService,
        cardSortService,
        context.getUnifiedDataSourceManager()  // ✅ 传入 UnifiedDataSourceManager
      );
    });
    
    // ✅ 注册复习应用服务工厂
    this.registerServiceFactory('reviewService', (context) => {
      const { ReviewApplicationService } = require('@/application/services/ReviewApplicationService');
      return new ReviewApplicationService(
        context.getStorage(),
        context.getScheduler()
      );
    });
    
    // TODO: Phase 3 - 注册其他应用服务工厂
    // this.registerServiceFactory('syncService', (context) => {
    //   return new SyncApplicationService(context);
    // });
  }
  
  /**
   * 注册服务工厂
   * 
   * 注册一个服务的工厂函数，用于懒加载创建服务实例。
   * 工厂函数接收 ApplicationContext 作为参数，可以通过它获取依赖的服务。
   * 
   * @param serviceName - 服务名称
   * @param factory - 创建服务的工厂函数，接收 ApplicationContext 作为参数
   * 
   * @example
   * ```typescript
   * this.registerServiceFactory('myService', (context) => {
   *   // 通过 context 获取依赖的服务
   *   const storage = context.getStorage();
   *   return new MyService(storage);
   * });
   * ```
   */
  registerServiceFactory(serviceName: string, factory: (context: ApplicationContext) => any): void {
    this.serviceFactories.set(serviceName, factory);
  }
  
  /**
   * 获取服务
   * 
   * 从服务容器中获取服务实例。如果服务尚未创建，则使用工厂函数创建。
   * 支持懒加载：服务只在第一次访问时才会被创建。
   * 工厂函数会接收 ApplicationContext 作为参数，实现依赖注入。
   * 
   * @param serviceName - 服务名称
   * @returns T - 服务实例
   * @throws Error - 如果服务未注册
   * 
   * @example
   * ```typescript
   * const dialogManager = this.getService<DialogManager>('dialogManager');
   * ```
   */
  getService<T>(serviceName: string): T {
    this.ensureNotDisposed();
    
    // 如果服务已创建，直接返回
    if (this.serviceContainer.has(serviceName)) {
      return this.serviceContainer.get(serviceName) as T;
    }
    
    // 如果有工厂函数，使用工厂创建服务
    const factory = this.serviceFactories.get(serviceName);
    if (factory) {
      // 将 ApplicationContext 传递给工厂函数，实现依赖注入
      const service = factory(this);
      this.serviceContainer.set(serviceName, service);
      return service as T;
    }
    
    // 服务未注册
    throw new Error(`Service '${serviceName}' is not registered in the service container`);
  }
  
  /**
   * 检查服务是否已注册
   * 
   * @param serviceName - 服务名称
   * @returns boolean - 服务是否已注册
   */
  hasService(serviceName: string): boolean {
    return this.serviceContainer.has(serviceName) || this.serviceFactories.has(serviceName);
  }
  
  /**
   * 检查服务是否已创建
   * 
   * @param serviceName - 服务名称
   * @returns boolean - 服务是否已创建
   */
  isServiceCreated(serviceName: string): boolean {
    return this.serviceContainer.has(serviceName);
  }
  
  // ========================================================================
  // 工厂方法
  // ========================================================================
  
  /**
   * 创建应用上下文
   * 
   * 工厂方法，负责初始化所有核心服务并创建 ApplicationContext 实例。
   * 
   * @param config - 应用配置
   * @returns Promise<ApplicationContext> - 应用上下文实例
   * 
   * @example
   * ```typescript
   * const context = await ApplicationContext.create({
   *   plugin: this,
   *   i18n: this.i18n
   * });
   * ```
   */
  static async create(config: ApplicationConfig): Promise<ApplicationContext> {
    // 1. 初始化存储管理器
    const storageManager = new StorageManager(config.plugin.name);
    await storageManager.init();
    
    const settings = storageManager.getSettings();
    
    // 2. 自动修复无效日期（首次加载时）
    try {
      const repairResult = await storageManager.repairInvalidDates();
      if (repairResult.fixed > 0) {
        console.log(`[ApplicationContext] 🔧 Repaired ${repairResult.fixed}/${repairResult.total} cards with invalid dates`);
      }
    } catch (err) {
      console.error('[ApplicationContext] Failed to repair invalid dates:', err);
    }
    
    // 3. 初始化 RescheduleService
    const rescheduleService = new RescheduleService(storageManager);
    
    // 4. 初始化调度器路由
    const schedulerRouter = new SchedulerRouter(
      {
        defaultScheduler: settings.scheduler?.defaultScheduler || 'fsrs-v6',
        enableRiffSync: settings.scheduler?.enableRiffSync || false,
        fsrsParams: settings.fsrs,
      },
      storageManager
    );
    
    // 5. 创建旧调度器（向后兼容）
    const scheduler = createScheduler(settings.fsrs, settings.schedulerEngine);
    
    // 6. 初始化统一数据源管理器
    const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
    const advancedRouter = new AdvancedDataRouter(storageManager, config.plugin as any);
    unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
    console.log('[ApplicationContext] ✅ UnifiedDataSourceManager initialized with Advanced mode');
    
    // 7. 初始化队列
    const retrievalQueue = unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice) as any;
    const finalDrillQueue = unifiedDataSourceManager.getQueue(QueueType.FinalDrill) as any;
    const subsetQueue = unifiedDataSourceManager.getQueue(QueueType.FilterGroup) as any;
    const incrementalQueue = unifiedDataSourceManager.getQueue(QueueType.IncrementalLearning) as any;
    const leechQueue = new LeechQueue();
    
    // 8. 初始化队列上下文
    const queueContext = new QueueContext<QueueItem>({
      initial: 'retrieval',
      monitors: [],
    });
    queueContext.register('retrieval', retrievalQueue as any);
    queueContext.register('final-drill', finalDrillQueue as any);
    queueContext.register('filter-group', subsetQueue as any);
    queueContext.register('incremental-learning' as any, incrementalQueue as any);
    queueContext.register('leech' as any, leechQueue as any);
    
    console.log('[ApplicationContext] ✅ All queues initialized');
    
    // 9. 初始化 Xiuyuan 服务
    const xiuyuanStorage = new XiuyuanStorage(config.plugin as any);
    await xiuyuanStorage.load();
    const xiuyuanService = new XiuyuanService(xiuyuanStorage, storageManager);
    
    // 初始化内置模板
    const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
    for (const template of BUILTIN_TEMPLATES) {
      const existing = xiuyuanService.getTemplate(template.id);
      if (!existing) {
        xiuyuanService.createTemplate(template);
      }
    }
    await xiuyuanStorage.save();
    console.log('[ApplicationContext] ✅ XiuyuanService initialized');
    
    // 10. 初始化应用服务（需要临时上下文）
    const tempContext = {
      getStorage: () => storageManager,
      getScheduler: () => schedulerRouter,
      getUnifiedDataSourceManager: () => unifiedDataSourceManager,
      getPlugin: () => config.plugin,
      getI18n: () => config.i18n,
    } as any;
    
    const dialogService = new DialogService({
      app: (config.plugin as any).app,
      i18n: config.i18n,
      storage: storageManager,
      scheduler: scheduler,
      isInitialized: true,
      finalDrillQueue: finalDrillQueue,
      incrementalQueue: incrementalQueue,
    });
    
    const menuService = new MenuService({
      i18n: config.i18n,
      storage: storageManager,
      openReviewDialog: () => {}, // 将在后面设置
      openFinalDrillDialog: () => {},
      openFilterGroupPracticeDialog: () => {},
      openIncrementalLearningDialog: () => {},
      openNeuralRoamDialog: () => {},
      openLeechReviewDialog: () => {},
      openSRSBrowser: () => {},
      openSetting: () => {},
      getDueCount: () => storageManager.getDueCards().length,
    });
    
    const reviewDialogManager = new ReviewDialogManager({
      app: (config.plugin as any).app,
      i18n: config.i18n,
      storage: storageManager,
      scheduler: scheduler,
      isInitialized: () => true,
      plugin: config.plugin as any,
      openReviewTab: (options) => {}, // 将在后面设置
    });
    
    // 创建一个临时变量来存储 context 引用（用于闭包）
    let contextRef: ApplicationContext | null = null;
    
    const blockMenuHandler = new BlockMenuHandler({
      app: (config.plugin as any).app,
      i18n: config.i18n,
      storage: storageManager,
      reviewDialogManager: reviewDialogManager,
      xiuyuanService: xiuyuanService,
      openCreateTemplateCardDialog: async (blockIds) => {
        // 使用闭包延迟获取 DialogManager
        if (contextRef) {
          const dialogManager = contextRef.getDialogManager();
          if (dialogManager) {
            await dialogManager.openCreateTemplateCardDialog(blockIds);
          }
        }
      },
      openNeuralReviewDialog: (options) => reviewDialogManager.openNeuralRoam(options),
      plugin: config.plugin as any,
      applicationContext: undefined, // 🆕 将在 ApplicationContext 创建后设置
    });
    
    console.log('[ApplicationContext] ✅ Application services initialized');
    
    // 11. 初始化 HybridSyncService（如果配置启用）
    let hybridSyncService: HybridSyncService | undefined;
    let fullSyncTimer: NodeJS.Timeout | undefined;
    let transactionWebSocketService: TransactionWebSocketService | undefined;
    
    const riffConfig = settings.riffIntegration;
    if (riffConfig) {
      const { riff } = await import('@/core/siyuan');
      hybridSyncService = new HybridSyncService({
        deckId: riff.BUILTIN_DECK_ID,
        storage: storageManager,
        incrementalSync: {
          ...riffConfig.incrementalSync,
          autoDetectCardType: true,
        },
        fullSync: riffConfig.fullSync,
        deleteSync: riffConfig.deleteSync,
      });
      
      await hybridSyncService.start();
      
      // 启动全量同步定时器
      if (riffConfig.fullSync.enabled) {
        fullSyncTimer = setInterval(
          () => hybridSyncService!.fullSync(),
          riffConfig.fullSync.interval
        );
        console.log(`[ApplicationContext] Full sync timer started (interval: ${riffConfig.fullSync.interval}ms)`);
      }
      
      console.log('[ApplicationContext] ✅ HybridSyncService initialized');
      
      // 初始化 TransactionWebSocketService
      if (riffConfig.incrementalSync?.enabled) {
        const { RiffSyncHandler } = await import('@/services/handlers/RiffSyncHandler');
        const { AutoCardHandler } = await import('@/services/handlers/AutoCardHandler');
        
        transactionWebSocketService = new TransactionWebSocketService(config.plugin as any);
        transactionWebSocketService.registerHandler(new RiffSyncHandler(hybridSyncService));
        transactionWebSocketService.registerHandler(new AutoCardHandler(config.plugin as any));
        transactionWebSocketService.start();
        
        console.log('[ApplicationContext] ✅ TransactionWebSocketService initialized');
      }
    }
    
    // 12. 创建应用上下文
    const context = new ApplicationContext(config, {
      storageManager,
      schedulerRouter,
      scheduler,
      rescheduleService,
      unifiedDataSourceManager,
      queueContext,
      retrievalQueue,
      finalDrillQueue,
      leechQueue,
      incrementalQueue,
      subsetQueue,
      xiuyuanStorage,
      xiuyuanService,
      dialogService,
      menuService,
      reviewDialogManager,
      blockMenuHandler,
      hybridSyncService,
      transactionWebSocketService,
      fullSyncTimer,
    });
    
    // 设置 context 引用（用于 blockMenuHandler 的闭包）
    contextRef = context;
    
    // 13. 设置 ApplicationContext 引用（解决循环依赖）
    blockMenuHandler.setApplicationContext(context);
    
    console.log('[ApplicationContext] ✅ ApplicationContext created successfully');
    
    return context;
  }
  
  // ========================================================================
  // 核心服务访问（向后兼容）
  // ========================================================================
  
  /**
   * 获取存储管理器
   * 
   * @returns StorageManager - 存储管理器实例
   */
  getStorage(): StorageManager {
    return this.storageManager;
  }
  
  /**
   * 获取调度器路由
   * 
   * @returns SchedulerRouter - 调度器路由实例
   */
  getScheduler(): SchedulerRouter {
    return this.schedulerRouter;
  }
  
  /**
   * 获取旧调度器（向后兼容）
   * 
   * @returns SchedulerEngineAdapter - 调度器实例
   */
  getLegacyScheduler(): SchedulerEngineAdapter {
    return this.scheduler;
  }
  
  /**
   * 获取重新调度服务
   * 
   * @returns RescheduleService - 重新调度服务实例
   */
  getRescheduleService(): RescheduleService {
    return this.rescheduleService;
  }
  
  /**
   * 获取统一数据源管理器
   * 
   * @returns UnifiedDataSourceManager - 统一数据源管理器实例
   */
  getUnifiedDataSourceManager(): UnifiedDataSourceManager {
    return this.unifiedDataSourceManager;
  }
  
  /**
   * 获取队列上下文
   * 
   * @returns QueueContext<QueueItem> - 队列上下文实例
   */
  getQueueContext(): QueueContext<QueueItem> {
    return this.queueContext;
  }
  
  /**
   * 获取检索练习队列
   * 
   * @returns RetrievalPracticeQueue - 检索练习队列实例
   */
  getRetrievalQueue(): RetrievalPracticeQueue {
    return this.retrievalQueue;
  }
  
  /**
   * 获取最终演练队列
   * 
   * @returns FinalDrillQueue - 最终演练队列实例
   */
  getFinalDrillQueue(): FinalDrillQueue {
    return this.finalDrillQueue;
  }
  
  /**
   * 获取难点攻坚队列
   * 
   * @returns LeechQueue - 难点攻坚队列实例
   */
  getLeechQueue(): LeechQueue {
    return this.leechQueue;
  }
  
  /**
   * 获取渐进学习队列
   * 
   * @returns IncrementalLearningQueue - 渐进学习队列实例
   */
  getIncrementalQueue(): IncrementalLearningQueue {
    return this.incrementalQueue;
  }
  
  /**
   * 获取子集队列
   * 
   * @returns FilterGroupQueue - 子集队列实例
   */
  getSubsetQueue(): FilterGroupQueue {
    return this.subsetQueue;
  }
  
  /**
   * 获取 Xiuyuan 存储
   * 
   * @returns XiuyuanStorage - Xiuyuan 存储实例
   */
  getXiuyuanStorage(): XiuyuanStorage {
    return this.xiuyuanStorage;
  }
  
  /**
   * 获取 Xiuyuan 服务
   * 
   * @returns XiuyuanService - Xiuyuan 服务实例
   */
  getXiuyuanService(): XiuyuanService {
    return this.xiuyuanService;
  }
  
  /**
   * 获取对话框服务
   * 
   * @returns DialogService - 对话框服务实例
   */
  getDialogService(): DialogService {
    return this.dialogService;
  }
  
  /**
   * 获取菜单服务
   * 
   * @returns MenuService - 菜单服务实例
   */
  getMenuService(): MenuService {
    return this.menuService;
  }
  
  /**
   * 获取复习对话框管理器
   * 
   * @returns ReviewDialogManager - 复习对话框管理器实例
   */
  getReviewDialogManager(): ReviewDialogManager {
    return this.reviewDialogManager;
  }
  
  /**
   * 获取块菜单处理器
   * 
   * @returns BlockMenuHandler - 块菜单处理器实例
   */
  getBlockMenuHandler(): BlockMenuHandler {
    return this.blockMenuHandler;
  }
  
  /**
   * 获取混合同步服务
   * 
   * @returns HybridSyncService | undefined - 混合同步服务实例
   */
  getHybridSyncService(): HybridSyncService | undefined {
    return this.hybridSyncService;
  }
  
  /**
   * 获取事务 WebSocket 服务
   * 
   * @returns TransactionWebSocketService | undefined - 事务 WebSocket 服务实例
   */
  getTransactionWebSocketService(): TransactionWebSocketService | undefined {
    return this.transactionWebSocketService;
  }
  
  /**
   * 获取插件实例
   * 
   * @returns Plugin - 思源插件实例
   */
  getPlugin(): Plugin {
    this.ensureNotDisposed();
    return this.config.plugin;
  }
  
  /**
   * 获取国际化资源
   * 
   * @returns Record<string, any> - 国际化资源
   */
  getI18n(): Record<string, any> {
    this.ensureNotDisposed();
    return this.config.i18n;
  }
  
  // ========================================================================
  // 应用服务访问（懒加载）
  // ========================================================================
  
  /**
   * 获取卡片应用服务
   * 
   * @returns CardApplicationService - 卡片应用服务实例
   */
  getCardService(): any {
    return this.getService<any>('cardService');
  }
  
  /**
   * 获取浏览器应用服务
   * 
   * @returns BrowserApplicationService - 浏览器应用服务实例
   */
  getBrowserService(): any {
    return this.getService<any>('browserService');
  }
  
  /**
   * 获取复习应用服务
   * 
   * @returns ReviewApplicationService - 复习应用服务实例
   */
  getReviewService(): any {
    return this.getService<any>('reviewService');
  }
  
  // TODO: Phase 3 - 实现其他应用服务访问方法
  // getSyncService(): SyncApplicationService
  
  // ========================================================================
  // UI 管理器访问（懒加载）
  // ========================================================================
  
  /**
   * 获取对话框管理器
   * 
   * @returns DialogManager - 对话框管理器实例
   */
  getDialogManager(): any {
    return this.getService<any>('dialogManager');
  }
  
  /**
   * 获取菜单管理器
   * 
   * @returns MenuManager - 菜单管理器实例
   */
  getMenuManager(): any {
    return this.getService<any>('menuManager');
  }
  
  /**
   * 获取 Tab 管理器
   * 
   * @returns TabManager - Tab 管理器实例
   */
  getTabManager(): any {
    return this.getService<any>('tabManager');
  }
  
  /**
   * 获取 Dock 管理器
   * 
   * @returns DockManager - Dock 管理器实例
   */
  getDockManager(): DockManager {
    return this.getService<DockManager>('dockManager');
  }
  
  /**
   * 获取练习队列管理器
   * 
   * @returns PracticeQueueManager - 练习队列管理器实例
   */
  getPracticeQueueManager(): PracticeQueueManager {
    return this.getService<PracticeQueueManager>('practiceQueueManager');
  }
  
  // ========================================================================
  // 生命周期管理
  // ========================================================================
  
  /**
   * 销毁应用上下文
   * 
   * 释放所有资源，清理所有服务。
   * 调用后，ApplicationContext 实例不可再使用。
   * 
   * 销毁顺序：
   * 1. 停止 TransactionWebSocketService
   * 2. 停止 HybridSyncService 和定时器
   * 3. 销毁所有已创建的服务（按创建顺序的逆序）
   * 4. 保存存储管理器数据
   * 5. 清空服务容器和工厂
   * 6. 标记为已销毁
   * 
   * 特性：
   * - 幂等性：可以多次调用，不会重复执行
   * - 错误隔离：单个服务销毁失败不影响其他服务
   * - 资源保证：即使发生错误，也会尽力释放所有资源
   * 
   * @returns Promise<void>
   * @throws Error - 如果关键资源释放失败（如存储保存失败）
   */
  async dispose(): Promise<void> {
    // 幂等性：如果已经销毁，直接返回
    if (this.disposed) {
      return;
    }
    
    const errors: Array<{ service: string; error: any }> = [];
    
    try {
      console.log('[ApplicationContext] Starting disposal...');
      
      // 1. 停止 TransactionWebSocketService
      if (this.transactionWebSocketService) {
        try {
          this.transactionWebSocketService.stop();
          console.log('[ApplicationContext] ✅ TransactionWebSocketService stopped');
        } catch (error) {
          console.error('[ApplicationContext] Error stopping TransactionWebSocketService:', error);
          errors.push({ service: 'transactionWebSocketService', error });
        }
      }
      
      // 2. 清理全量同步定时器
      if (this.fullSyncTimer) {
        try {
          clearInterval(this.fullSyncTimer);
          this.fullSyncTimer = undefined;
          console.log('[ApplicationContext] ✅ Full sync timer cleared');
        } catch (error) {
          console.error('[ApplicationContext] Error clearing full sync timer:', error);
          errors.push({ service: 'fullSyncTimer', error });
        }
      }
      
      // 3. 停止 HybridSyncService
      if (this.hybridSyncService) {
        try {
          this.hybridSyncService.stop();
          console.log('[ApplicationContext] ✅ HybridSyncService stopped');
        } catch (error) {
          console.error('[ApplicationContext] Error stopping HybridSyncService:', error);
          errors.push({ service: 'hybridSyncService', error });
        }
      }
      
      // 4. 销毁所有已创建的服务（按创建顺序的逆序）
      await this.disposeServices(errors);
      
      // 5. 保存存储管理器数据（关键操作）
      try {
        console.log('[ApplicationContext] Saving storage data...');
        await this.storageManager.saveCards();
        console.log('[ApplicationContext] Storage data saved successfully');
      } catch (error) {
        console.error('[ApplicationContext] Critical error: Failed to save storage data:', error);
        errors.push({ service: 'storageManager.saveCards', error });
        // 存储保存失败是关键错误，需要抛出
        throw new Error(`Failed to save storage data during disposal: ${error}`);
      }
      
      // 6. 清空服务容器和工厂
      this.serviceContainer.clear();
      this.serviceFactories.clear();
      
      // 7. 标记为已销毁
      this.disposed = true;
      
      // 8. 报告结果
      if (errors.length > 0) {
        console.warn(`[ApplicationContext] Disposed with ${errors.length} non-critical errors:`, errors);
      } else {
        console.log('[ApplicationContext] Disposed successfully');
      }
    } catch (error) {
      // 标记为已销毁，即使发生错误
      this.disposed = true;
      
      console.error('[ApplicationContext] Critical error during disposal:', error);
      throw error;
    }
  }
  
  /**
   * 销毁所有已创建的服务
   * 
   * 按照创建顺序的逆序销毁服务，确保依赖关系正确。
   * 例如：如果 ServiceB 依赖 ServiceA，则 ServiceB 会先被销毁。
   * 
   * 错误处理：
   * - 单个服务销毁失败不会阻止其他服务的销毁
   * - 所有错误都会被收集并记录
   * - 非关键服务的错误不会导致整体失败
   * 
   * @param errors - 错误收集数组
   */
  private async disposeServices(errors: Array<{ service: string; error: any }>): Promise<void> {
    // 获取所有已创建的服务（按创建顺序）
    const services = Array.from(this.serviceContainer.entries());
    
    // 按逆序销毁（后创建的先销毁）
    for (let i = services.length - 1; i >= 0; i--) {
      const [serviceName, service] = services[i];
      
      try {
        // 如果服务有 dispose 方法，调用它
        if (service && typeof service.dispose === 'function') {
          console.log(`[ApplicationContext] Disposing service: ${serviceName}...`);
          await service.dispose();
          console.log(`[ApplicationContext] Disposed service: ${serviceName}`);
        }
      } catch (error) {
        console.error(`[ApplicationContext] Error disposing service '${serviceName}':`, error);
        errors.push({ service: serviceName, error });
        // 继续销毁其他服务，不抛出错误
      }
    }
  }
  
  /**
   * 检查上下文是否已销毁
   * 
   * @returns boolean - 是否已销毁
   */
  isDisposed(): boolean {
    return this.disposed;
  }
  
  /**
   * 确保上下文未被销毁
   * 
   * @throws Error - 如果上下文已被销毁
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('ApplicationContext has been disposed');
    }
  }
}
