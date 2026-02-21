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
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { createPersistenceCallbacks } from '@/core/storage/UnifiedStoragePersistence';
import { SchedulerRouter, RescheduleService, createScheduler, type SchedulerEngineAdapter } from '@/core/scheduler';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { DialogManager } from '@/application/managers/DialogManager';
import { MenuManager } from '@/application/managers/MenuManager';
import { TabManager } from '@/application/managers/TabManager';
import { DockManager } from '@/application/managers/DockManager';
import { PracticeQueueManager } from '@/application/managers/PracticeQueueManager';
import { TabApplicationService } from '@/application/services/TabApplicationService';
import { XiuyuanStorage } from '@/core/xiuyuan';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';
import { HybridSyncService } from '@/application/services/XiuyuanSyncService';
import { TransactionWebSocketService } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import { QueueContext, type QueueItem } from '@/core/queue';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { AdvancedDataRouter } from '@/application/queries/DataAccessFacade';

// ✅ 静态导入所有服务工厂需要的类
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import { CreateCardUseCase } from '@/application/usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '@/application/usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '@/application/usecases/card/UpdateCardUseCase';
import { CardApplicationService } from '@/application/services/CardApplicationService';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import { EventBus } from '@/core/shared/domain/events/EventBus';

// ✅ DDD 重构服务导入
import { FileService } from '@/infrastructure/services/FileService';
import { QueuePersistenceService } from '@/infrastructure/services/QueuePersistenceService';
import { SettingsService } from '@/application/services/SettingsService';
import { ReviewLogService } from '@/application/services/ReviewLogService';
import { RiffBlacklistService } from '@/application/services/RiffBlacklistService';

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
  private unifiedStorageManager: UnifiedStorageManager;  // 🆕 统一存储管理器
  private schedulerRouter: SchedulerRouter;
  private scheduler: SchedulerEngineAdapter; // 向后兼容的旧调度器
  private rescheduleService: RescheduleService;
  private unifiedDataSourceManager: UnifiedDataSourceManager;
  
  // 队列上下文（不再直接持有具体队列实例）
  private queueContext: QueueContext<QueueItem>;
  
  // Xiuyuan 服务
  private xiuyuanStorage: XiuyuanStorage;
  private xiuyuanApplicationService?: XiuyuanApplicationService;  // 懒加载
  
  // 应用服务
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
  
  /**
   * 正在创建的服务集合 - 用于检测循环依赖
   * Phase 8: 性能优化 - 循环依赖检测
   */
  private creatingServices = new Set<string>();
  
  /**
   * 失败的服务记录 - 用于错误恢复
   * Phase 8: 性能优化 - 错误恢复机制
   */
  private failedServices = new Map<string, Error>();
  
  /**
   * 性能监控配置
   * Phase 8: 性能优化 - 性能监控
   */
  private readonly enablePerformanceMonitoring = process.env.NODE_ENV === 'development';
  private readonly performanceThreshold = 100; // ms
  
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
      unifiedStorageManager: UnifiedStorageManager;  // 🆕 统一存储管理器
      schedulerRouter: SchedulerRouter;
      scheduler: SchedulerEngineAdapter;
      rescheduleService: RescheduleService;
      unifiedDataSourceManager: UnifiedDataSourceManager;
      queueContext: QueueContext<QueueItem>;
      xiuyuanStorage: XiuyuanStorage;
      blockMenuHandler: BlockMenuHandler;
      sharedEventBus?: EventBus;  // ✅ 新增：共享的 EventBus 实例
      hybridSyncService?: HybridSyncService;
      transactionWebSocketService?: TransactionWebSocketService;
      fullSyncTimer?: NodeJS.Timeout;
    }
  ) {
    this.config = config;
    this.storageManager = services.storageManager;
    this.unifiedStorageManager = services.unifiedStorageManager;  // 🆕 统一存储管理器
    this.schedulerRouter = services.schedulerRouter;
    this.scheduler = services.scheduler;
    this.rescheduleService = services.rescheduleService;
    this.unifiedDataSourceManager = services.unifiedDataSourceManager;
    this.queueContext = services.queueContext;
    this.xiuyuanStorage = services.xiuyuanStorage;
    this.blockMenuHandler = services.blockMenuHandler;
    this.hybridSyncService = services.hybridSyncService;
    this.transactionWebSocketService = services.transactionWebSocketService;
    this.fullSyncTimer = services.fullSyncTimer;
    
    // ✅ 保存 sharedEventBus 引用（如果提供）
    if (services.sharedEventBus) {
      this.serviceContainer.set('eventBus', services.sharedEventBus);
    }
    
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
    this.serviceContainer.set('unifiedStorage', this.unifiedStorageManager);  // 🆕 注册统一存储
    this.serviceContainer.set('scheduler', this.schedulerRouter);
    this.serviceContainer.set('unifiedDataSource', this.unifiedDataSourceManager);
    
    // ✅ EventBus 已经在构造函数中设置（如果提供了 sharedEventBus）
    // 如果没有提供，则懒加载创建
    if (!this.serviceContainer.has('eventBus')) {
      this.registerServiceFactory('eventBus', (context) => {
        return new EventBus(false);  // false = 不启用调试日志
      });
    }
    
    // ✅ 注册 DDD 重构服务工厂
    // 基础设施层服务
    this.registerServiceFactory('fileService', (context) => {
      return new FileService(context.getPlugin() as any);
    });
    
    this.registerServiceFactory('queuePersistenceService', (context) => {
      const fileService = context.getFileService();
      return new QueuePersistenceService(fileService);
    });
    
    // 应用层服务
    this.registerServiceFactory('settingsService', (context) => {
      const fileService = context.getFileService();
      return new SettingsService(fileService);
    });
    
    this.registerServiceFactory('reviewLogService', (context) => {
      const fileService = context.getFileService();
      return new ReviewLogService(fileService);
    });
    
    this.registerServiceFactory('riffBlacklistService', (context) => {
      const fileService = context.getFileService();
      return new RiffBlacklistService(fileService);
    });
    
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
    // ✅ Phase 9 Task 1.3: TabApplicationService 已注册
    this.registerServiceFactory('tabApplicationService', (context) => {
      return new TabApplicationService(context.getPlugin().app);
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
      // ✅ DDD 架构修复：使用 UnifiedStorageManager 而不是 XiuyuanStorage
      // UnifiedStorageManager 是统一的数据访问层，符合 DDD 原则
      
      // ✅ 创建 CardTypeDetectionService（领域服务）
      const cardTypeDetectionService = new CardTypeDetectionService();
      
      const xiuyuanRepo = new XiuyuanRepository(
        context.getUnifiedStorage(),  // ✅ 使用 UnifiedStorageManager
        cardTypeDetectionService      // ✅ 注入 CardTypeDetectionService
      );

      // 创建领域服务
      const cardCreationService = new CardCreationService();
      const cardDeletionService = new CardDeletionService();

      // 创建用例
      const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
      const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService, context.getEventBus());
      const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

      // 创建应用服务
      const scheduleService = new CardScheduleService();
      const unifiedStorage = context.getUnifiedStorage();
      
      return new CardApplicationService(
        createCardUseCase,
        deleteCardUseCase,
        updateCardUseCase,
        unifiedStorage as any,  // ✅ 临时保留用于查询（StorageManager 接口）
        scheduleService,
        unifiedStorage  // ✅ 传递 UnifiedStorageManager 用于 FSRS 卡片操作
      );
    });
    
    // ✅ 注册浏览器应用服务工厂
    this.registerServiceFactory('browserService', (context) => {
      // 创建领域服务
      const cardScheduleService = new CardScheduleService();
      const cardFilterService = new CardFilterService();
      const cardSortService = new CardSortService();

      // 创建应用服务
      return new BrowserApplicationService(
        context.getUnifiedStorage() as any,  // ✅ 使用 UnifiedStorageManager
        cardScheduleService,
        cardFilterService,
        cardSortService,
        context.getUnifiedDataSourceManager()  // ✅ 传入 UnifiedDataSourceManager
      );
    });
    
    // ✅ 注册复习应用服务工厂
    this.registerServiceFactory('reviewService', (context) => {
      return new ReviewApplicationService(
        context.getUnifiedStorage() as any,  // ✅ 使用 UnifiedStorageManager
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
   * Phase 8 优化:
   * - 循环依赖检测：防止栈溢出
   * - 性能监控：发现慢服务
   * - 错误恢复：允许重试失败的服务
   * 
   * @param serviceName - 服务名称
   * @returns T - 服务实例
   * @throws Error - 如果服务未注册或存在循环依赖
   * 
   * @example
   * ```typescript
   * const dialogManager = this.getService<DialogManager>('dialogManager');
   * ```
   */
  getService<T>(serviceName: string): T {
    this.ensureNotDisposed();
    
    // ✅ 检查缓存 - 如果服务已创建，直接返回
    if (this.serviceContainer.has(serviceName)) {
      return this.serviceContainer.get(serviceName) as T;
    }
    
    // ⚠️ 检查是否之前创建失败 - Phase 8: 错误恢复
    if (this.failedServices.has(serviceName)) {
      const previousError = this.failedServices.get(serviceName)!;
      console.warn(
        `[ApplicationContext] Service '${serviceName}' failed to create previously. ` +
        `Retrying... Previous error: ${previousError.message}`
      );
      // 允许重试,但记录警告
    }
    
    // 🔍 检查循环依赖 - Phase 8: 循环依赖检测
    if (this.creatingServices.has(serviceName)) {
      const chain = Array.from(this.creatingServices).join(' -> ');
      throw new Error(
        `Circular dependency detected: ${chain} -> ${serviceName}\n` +
        `Please check your service dependencies and break the cycle.`
      );
    }
    
    // 获取工厂函数
    const factory = this.serviceFactories.get(serviceName);
    if (!factory) {
      throw new Error(`Service '${serviceName}' is not registered in the service container`);
    }
    
    // 标记正在创建
    this.creatingServices.add(serviceName);
    
    try {
      // 📊 性能监控 - Phase 8: 性能监控
      const startTime = this.enablePerformanceMonitoring ? performance.now() : 0;
      
      // 创建服务
      const service = factory(this);
      this.serviceContainer.set(serviceName, service);
      
      // 清除失败记录
      this.failedServices.delete(serviceName);
      
      // 记录慢服务
      if (this.enablePerformanceMonitoring) {
        const duration = performance.now() - startTime;
        if (duration > this.performanceThreshold) {
          console.warn(
            `[ApplicationContext] Service '${serviceName}' took ${duration.toFixed(2)}ms to create ` +
            `(threshold: ${this.performanceThreshold}ms)`
          );
        }
      }
      
      return service as T;
    } catch (error) {
      // 记录失败
      this.failedServices.set(serviceName, error as Error);
      console.error(`[ApplicationContext] Failed to create service '${serviceName}':`, error);
      throw error;
    } finally {
      // 清理标记
      this.creatingServices.delete(serviceName);
    }
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
    
    // 🆕 1.1 初始化统一存储管理器
    const unifiedStorageManager = new UnifiedStorageManager();
    const { save, load } = createPersistenceCallbacks(config.plugin);
    unifiedStorageManager.setPersistenceCallbacks(save, load);
    
    // 尝试加载数据，如果文件不存在则初始化为空
    const loadResult = await unifiedStorageManager.load();
    if (!loadResult.ok) {
      console.log('[ApplicationContext] UnifiedStorageManager: No existing data, starting fresh');
    } else {
      const stats = unifiedStorageManager.getStats();
      console.log('[ApplicationContext] ✅ UnifiedStorageManager loaded:', {
        xiuyuans: stats.totalXiuYuans,
        cards: stats.totalCards,
      });
      
      // 🔧 修复：检查并创建缺失的 Xiuyuan（历史遗留数据迁移）
      const allCards = unifiedStorageManager.getAllCards();
      const orphanCards = allCards.filter(card => !card.meta?.xiuyuanID);
      
      if (orphanCards.length > 0) {
        console.warn(`[ApplicationContext] Found ${orphanCards.length} orphan cards without Xiuyuan, creating Xiuyuans...`);
        
        // 动态导入所需的类
        const { XiuyuanId } = await import('@/core/xiuyuan/domain/XiuyuanId');
        const { BlockId } = await import('@/core/xiuyuan/domain/BlockId');
        const { TemplateId } = await import('@/core/xiuyuan/domain/TemplateId');
        const { Priority } = await import('@/core/xiuyuan/domain/Priority');
        const { CardFace } = await import('@/core/xiuyuan/domain/CardFace');
        const { Xiuyuan } = await import('@/core/xiuyuan/domain/Xiuyuan');
        const { CardId } = await import('@/core/xiuyuan/domain/CardId');
        const { ScheduleInfo } = await import('@/core/xiuyuan/domain/ScheduleInfo');
        const { Card } = await import('@/core/xiuyuan/domain/Card');
        
        let fixedCount = 0;
        for (const orphanCard of orphanCards) {
          try {
            // 为每个孤儿卡片创建 Xiuyuan
            const xiuyuanIdStr = `xy_migrated_${orphanCard.id}`;
            const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
            const blockIdResult = BlockId.create(orphanCard.blockId);
            const templateIdResult = TemplateId.create('builtin-riff-sync');
            const priorityResult = Priority.create(orphanCard.priority || 50);
            const cardFaceResult = CardFace.create({
              question: `Card ${orphanCard.id}`,
              answer: '',
              questionBlockId: orphanCard.blockId,
              answerBlockId: orphanCard.blockId
            });
            
            if (!xiuyuanIdResult.ok || !blockIdResult.ok || !templateIdResult.ok || !cardFaceResult.ok) {
              console.error(`[ApplicationContext] Failed to create value objects for card ${orphanCard.id}`);
              continue;
            }
            
            // 创建 Xiuyuan
            const xiuyuanResult = Xiuyuan.create({
              id: xiuyuanIdResult.value,
              blockIDs: [blockIdResult.value],
              templateID: templateIdResult.value,
              faces: [cardFaceResult.value],
              priority: priorityResult.ok ? priorityResult.value : Priority.createDefault(),
              meta: { schedulerType: 'fsrs-v6' }
            });
            
            if (!xiuyuanResult.ok) {
              console.error(`[ApplicationContext] Failed to create Xiuyuan for card ${orphanCard.id}`);
              continue;
            }
            
            const xiuyuan = xiuyuanResult.value;
            
            // 创建 Card 实体
            const cardIdResult = CardId.create(orphanCard.id);
            const scheduleInfoResult = ScheduleInfo.create({
              due: new Date(orphanCard.due),
              stability: orphanCard.stability,
              difficulty: orphanCard.difficulty,
              reps: orphanCard.reps,
              lapses: orphanCard.lapses,
              state: orphanCard.state,
              lastReview: new Date(orphanCard.lastReview || Date.now()),
              elapsedDays: orphanCard.elapsedDays || 0,
              scheduledDays: orphanCard.scheduledDays || 0,
              learning_step: 0
            });
            
            if (!cardIdResult.ok || !scheduleInfoResult.ok) {
              console.error(`[ApplicationContext] Failed to create Card entity for ${orphanCard.id}`);
              continue;
            }
            
            const cardResult = Card.create({
              id: cardIdResult.value,
              xiuyuanId: xiuyuanIdResult.value,
              faceIndex: 0,
              scheduleInfo: scheduleInfoResult.value,
              createdAt: new Date(orphanCard.createdAt || Date.now()),
              updatedAt: new Date(orphanCard.updatedAt || Date.now())
            });
            
            if (!cardResult.ok) {
              console.error(`[ApplicationContext] Failed to create Card for ${orphanCard.id}`);
              continue;
            }
            
            // 添加 Card 到 Xiuyuan
            const addResult = xiuyuan.addCard(cardResult.value);
            if (!addResult.ok) {
              console.error(`[ApplicationContext] Failed to add Card to Xiuyuan for ${orphanCard.id}`);
              continue;
            }
            
            // 保存 Xiuyuan（这会自动保存 Card 并更新 meta.xiuyuanID）
            const xiuyuanRepo = new (await import('@/core/xiuyuan/infrastructure/XiuyuanRepository')).XiuyuanRepository(unifiedStorageManager);
            const saveResult = await xiuyuanRepo.save(xiuyuan);
            
            if (saveResult.ok) {
              fixedCount++;
            } else {
              console.error(`[ApplicationContext] Failed to save Xiuyuan for card ${orphanCard.id}:`, saveResult.error);
            }
          } catch (error) {
            console.error(`[ApplicationContext] Error fixing orphan card ${orphanCard.id}:`, error);
          }
        }
        
        if (fixedCount > 0) {
          console.log(`[ApplicationContext] ✅ Fixed ${fixedCount}/${orphanCards.length} orphan cards`);
          // 立即保存
          await unifiedStorageManager.save();
        }
      }
    }
    
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
    
    // 3. 创建 CardApplicationService 相关组件
    // ✅ DDD 架构修复：使用 UnifiedStorageManager 创建 XiuyuanRepository
    // 确保所有地方使用统一的数据访问层，避免数据不一致
    
    // ✅ 创建 CardTypeDetectionService
    const { CardTypeDetectionService: CardTypeDetectionServiceClass } = await import('@/core/xiuyuan/domain/services/CardTypeDetectionService');
    const cardTypeDetectionServiceTemp = new CardTypeDetectionServiceClass();
    
    const xiuyuanRepoTemp = new XiuyuanRepository(
      unifiedStorageManager,
      cardTypeDetectionServiceTemp  // ✅ 注入 CardTypeDetectionService
    );
    
    // 创建领域服务
    const cardCreationService = new CardCreationService();
    const cardDeletionService = new CardDeletionService();
    const cardScheduleService = new CardScheduleService();
    
    // ⚠️ 注意：此时 context 还未创建，所以先创建一个临时的 EventBus
    // 这个 EventBus 将被 DeleteCardUseCase 和 RiffSyncEventHandler 共享
    const sharedEventBus = new EventBus(false);
    
    // 创建用例
    const createCardUseCase = new CreateCardUseCase(xiuyuanRepoTemp, cardCreationService);
    const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepoTemp, cardDeletionService, sharedEventBus);
    const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepoTemp);
    
    // ✅ 创建 CardApplicationService（使用 UnifiedStorageManager）
    const cardApplicationService = new CardApplicationService(
      createCardUseCase,
      deleteCardUseCase,
      updateCardUseCase,
      unifiedStorageManager as any,  // 临时保留用于查询
      cardScheduleService,
      unifiedStorageManager  // ✅ 传递 UnifiedStorageManager 用于 FSRS 卡片操作
    );
    
    // 4. 初始化 RescheduleService（使用新架构）
    const rescheduleService = new RescheduleService(
      unifiedStorageManager,
      cardApplicationService
    );
    
    // 5. 初始化调度器路由（使用新架构）
    const schedulerRouter = new SchedulerRouter(
      {
        defaultScheduler: settings.scheduler?.defaultScheduler || 'fsrs-v6',
        enableRiffSync: settings.scheduler?.enableRiffSync || false,
        fsrsParams: settings.fsrs,
      },
      unifiedStorageManager,
      cardApplicationService
    );
    
    // 6. 创建旧调度器（向后兼容）
    const scheduler = createScheduler(settings.fsrs, settings.schedulerEngine);
    
    // 创建 CardCreationHelper
    const cardCreationHelper = new CardCreationHelper(cardApplicationService);
    console.log('[ApplicationContext] ✅ CardCreationHelper initialized');
    
    // 7. 初始化统一数据源管理器
    const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
    
    // 8. 初始化队列上下文（空的，稍后注册队列）
    const queueContext = new QueueContext<QueueItem>({
      initial: 'retrieval',
      monitors: [],
    });
    
    // 10. 初始化 Xiuyuan 存储（用于模板管理）
    // 注意：XiuyuanStorage 只用于模板管理，卡片数据使用 UnifiedStorageManager
    const xiuyuanStorage = new XiuyuanStorage(config.plugin as any);
    await xiuyuanStorage.load();
    
    // 初始化内置模板
    const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
    for (const template of BUILTIN_TEMPLATES) {
      const existing = xiuyuanStorage.getTemplate(template.id);
      if (!existing) {
        xiuyuanStorage.createTemplate(template);
      }
    }
    await xiuyuanStorage.save();
    console.log('[ApplicationContext] ✅ XiuyuanStorage initialized with builtin templates');
    
    // 11. 初始化 BlockMenuHandler
    // 创建一个临时变量来存储 context 引用（用于闭包）
    let contextRef: ApplicationContext | null = null;
    
    const blockMenuHandler = new BlockMenuHandler({
      app: (config.plugin as any).app,
      i18n: config.i18n,
      storage: unifiedStorageManager as any,  // ✅ 使用新架构 UnifiedStorageManager
      dialogManager: null as any, // 将在 ApplicationContext 创建后设置
      cardCreationHelper: cardCreationHelper,  // ✅ 注入 CardCreationHelper
      openCreateTemplateCardDialog: async (blockIds) => {
        // 使用闭包延迟获取 DialogManager
        if (contextRef) {
          const dialogManager = contextRef.getDialogManager();
          if (dialogManager) {
            await dialogManager.openCreateTemplateCardDialog(blockIds);
          }
        }
      },
      openNeuralReviewDialog: async (options) => {
        // 使用闭包延迟获取 DialogManager
        if (contextRef) {
          const dialogManager = contextRef.getDialogManager();
          if (dialogManager) {
            await dialogManager.openNeuralRoamDialog(options);
          }
        }
      },
      plugin: config.plugin as any,
      applicationContext: undefined, // 🆕 将在 ApplicationContext 创建后设置
    });
    
    console.log('[ApplicationContext] ✅ BlockMenuHandler initialized');
    
    // 11. 初始化 HybridSyncService（如果配置启用）
    let hybridSyncService: HybridSyncService | undefined;
    let fullSyncTimer: NodeJS.Timeout | undefined;
    let transactionWebSocketService: TransactionWebSocketService | undefined;
    
    const riffConfig = settings.riffIntegration;
    // HybridSyncService 将在 context 创建后初始化（需要 CardApplicationService 和 EventBus）
    
    // 12. 创建应用上下文（不需要队列实例，队列通过 UnifiedDataSourceManager 延迟获取）
    const context = new ApplicationContext(config, {
      storageManager,
      unifiedStorageManager,  // 🆕 传入统一存储管理器
      schedulerRouter,
      scheduler,
      rescheduleService,
      unifiedDataSourceManager,
      queueContext,
      xiuyuanStorage,  // ✅ 使用 xiuyuanStorage (不再需要 xiuyuanService)
      blockMenuHandler,
      sharedEventBus,  // ✅ 传入 sharedEventBus
      hybridSyncService: undefined,  // 将在下面初始化
      transactionWebSocketService: undefined,  // 将在下面初始化
      fullSyncTimer: undefined,  // 将在下面初始化
    });
    
    // 设置 context 引用（用于 blockMenuHandler 的闭包）
    contextRef = context;
    
    // 13. 设置 ApplicationContext 和 DialogManager 引用（解决循环依赖）
    blockMenuHandler.setApplicationContext(context);
    (blockMenuHandler.deps as any).dialogManager = context.getDialogManager();
    
    // 13.5. 初始化 UnifiedDataSourceManager 的延迟依赖
    const settingsService = context.getSettingsService();
    const advancedRouter = new AdvancedDataRouter(
      cardApplicationService, 
      unifiedStorageManager as any,  // ✅ 使用 UnifiedStorageManager
      config.plugin as any, 
      settingsService
    );
    unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
    
    const queuePersistenceService = context.getQueuePersistenceService();
    unifiedDataSourceManager.setQueuePersistence(queuePersistenceService);
    console.log('[ApplicationContext] ✅ UnifiedDataSourceManager initialized with Advanced mode and QueuePersistence');
    
    // 13.6. 注册队列到 QueueContext（延迟获取队列实例）
    // 只注册实际使用的队列类型
    queueContext.register('retrieval', context.getRetrievalQueue() as any);
    queueContext.register('final-drill', context.getFinalDrillQueue() as any);
    queueContext.register('filter-group', context.getSubsetQueue() as any);
    queueContext.register('incremental-learning', context.getIncrementalQueue() as any);
    // 注意：leech 队列是旧架构，仅在 DialogManager 中按需加载，不在这里注册
    console.log('[ApplicationContext] ✅ Core queues registered to QueueContext');
    
    // 14. 初始化 HybridSyncService（需要 CardApplicationService、EventBus 和 XiuyuanRepository）
    console.log('[ApplicationContext] Checking riffConfig:', { hasRiffConfig: !!riffConfig });
    if (riffConfig) {
      console.log('[ApplicationContext] Initializing HybridSyncService...');
      const { riff } = await import('@/core/siyuan');
      
      // 获取依赖服务
      const cardService = context.getCardService();
      const eventBus = context.getEventBus();
      
      // ✅ 创建 CardTypeDetectionService
      const { CardTypeDetectionService: CardTypeDetectionServiceClass2 } = await import('@/core/xiuyuan/domain/services/CardTypeDetectionService');
      const cardTypeDetectionService2 = new CardTypeDetectionServiceClass2();
      
      // ✅ 创建 XiuyuanRepository
      const xiuyuanRepository = new XiuyuanRepository(
        unifiedStorageManager,
        cardTypeDetectionService2  // ✅ 注入 CardTypeDetectionService
      );
      const cardTypeDetectionService = new CardTypeDetectionService();
      
      // 创建 HybridSyncService
      // 构造函数签名：(config, eventBus, xiuyuanRepository, riffBlacklistService, cardTypeDetectionService)
      hybridSyncService = new HybridSyncService(
        {
          deckId: riff.BUILTIN_DECK_ID,
          storage: unifiedStorageManager as any,  // ✅ 使用新架构 UnifiedStorageManager
          riffBlacklistService: context.getRiffBlacklistService(),
          incrementalSync: {
            ...riffConfig.incrementalSync,
            autoDetectCardType: true,
          },
          fullSync: riffConfig.fullSync,
          deleteSync: riffConfig.deleteSync,
        },
        eventBus,                              // ✅ 第2个参数：EventBus
        xiuyuanRepository,                     // ✅ 第3个参数：XiuyuanRepository
        context.getRiffBlacklistService(),     // ✅ 第4个参数：RiffBlacklistService
        cardTypeDetectionService               // ✅ 第5个参数：CardTypeDetectionService
      );
      
      // 将 HybridSyncService 设置到 context（使用类型断言）
      (context as any).hybridSyncService = hybridSyncService;
      
      console.log('[ApplicationContext] ✅ HybridSyncService initialized with XiuyuanRepository');
      
      // ✅ 注册 RiffSyncEventHandler（监听领域事件并同步到 Riff）
      // 使用 sharedEventBus 而不是 context.getEventBus()，确保与 DeleteCardUseCase 使用同一个 EventBus
      console.log('[ApplicationContext] Importing RiffSyncEventHandler...');
      const { RiffSyncEventHandler } = await import('@/infrastructure/events/RiffSyncEventHandler');
      console.log('[ApplicationContext] Creating RiffSyncEventHandler...');
      const riffSyncEventHandler = new RiffSyncEventHandler(sharedEventBus, hybridSyncService);
      (context as any).riffSyncEventHandler = riffSyncEventHandler;
      console.log('[ApplicationContext] ✅ RiffSyncEventHandler registered');
      console.log('[ApplicationContext] EventBus subscriber count for CardDeleted:', sharedEventBus.getSubscriberCount('CardDeleted'));
      
      // 启动同步服务
      await hybridSyncService.start();
      
      // 启动全量同步定时器
      if (riffConfig.fullSync.enabled) {
        fullSyncTimer = setInterval(
          () => hybridSyncService!.fullSync(),
          riffConfig.fullSync.interval
        );
        (context as any).fullSyncTimer = fullSyncTimer;
        console.log(`[ApplicationContext] Full sync timer started (interval: ${riffConfig.fullSync.interval}ms)`);
      }
      
      // 初始化 TransactionWebSocketService
      if (riffConfig.incrementalSync?.enabled) {
        const { RiffSyncHandler } = await import('@/application/handlers/RiffSyncHandler');
        const { AutoCardHandler } = await import('@/application/handlers/AutoCardHandler');
        
        transactionWebSocketService = new TransactionWebSocketService(config.plugin as any);
        transactionWebSocketService.registerHandler(new RiffSyncHandler(hybridSyncService));
        transactionWebSocketService.registerHandler(new AutoCardHandler(config.plugin as any));
        transactionWebSocketService.start();
        
        (context as any).transactionWebSocketService = transactionWebSocketService;
        console.log('[ApplicationContext] ✅ TransactionWebSocketService initialized');
      }
    }
    
    console.log('[ApplicationContext] ✅ ApplicationContext created successfully');
    
    return context;
  }
  
  // ========================================================================
  // 核心服务访问（向后兼容）
  // ========================================================================
  
  /**
   * 获取存储管理器
   * 
   * ✅ 返回 UnifiedStorageManager（新架构）
   * UnifiedStorageManager 实现了 StorageManager 接口，向后兼容
   * 
   * @returns StorageManager - 存储管理器实例（实际是 UnifiedStorageManager）
   */
  getStorage(): StorageManager {
    // ✅ 返回 UnifiedStorageManager 而不是旧的 StorageManager
    // UnifiedStorageManager 实现了 StorageManager 接口，完全兼容
    return this.unifiedStorageManager as any as StorageManager;
  }
  
  /**
   * 获取统一存储管理器
   * 
   * @returns UnifiedStorageManager - 统一存储管理器实例
   */
  getUnifiedStorage(): UnifiedStorageManager {
    return this.unifiedStorageManager;
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
   * @returns IReviewQueue - 检索练习队列实例（通过 UnifiedDataSourceManager）
   */
  getRetrievalQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice);
  }
  
  /**
   * 获取最终演练队列
   * 
   * @returns IReviewQueue - 最终演练队列实例（通过 UnifiedDataSourceManager）
   */
  getFinalDrillQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.FinalDrill);
  }
  
  /**
   * 获取难点攻坚队列（可选，旧架构）
   * 
   * 注意：LeechQueue 是旧架构的队列，仅在特定场景下使用（如 Leech 复习对话框）。
   * 如果你不使用 Leech 功能，可以不调用此方法。
   * 
   * @returns IReviewQueue - 难点攻坚队列实例（通过 UnifiedDataSourceManager）
   * @deprecated 旧架构队列，仅在需要时使用
   */
  getLeechQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.Leech);
  }
  
  /**
   * 获取渐进学习队列
   * 
   * @returns IReviewQueue - 渐进学习队列实例（通过 UnifiedDataSourceManager）
   */
  getIncrementalQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.IncrementalLearning);
  }
  
  /**
   * 获取子集队列
   * 
   * @returns IReviewQueue - 子集队列实例（通过 UnifiedDataSourceManager）
   */
  getSubsetQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.FilterGroup);
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
   * 获取 Xiuyuan 应用服务（DDD 架构）
   * 
   * @returns XiuyuanApplicationService - Xiuyuan 应用服务实例
   */
  getXiuyuanApplicationService(): XiuyuanApplicationService {
    if (!this.xiuyuanApplicationService) {
      // 懒加载：首次调用时创建
      
      // 创建 CardTypeDetectionService（领域服务）
      const cardTypeDetectionService = new CardTypeDetectionService();
      
      // 创建 XiuyuanRepository
      const xiuyuanRepository = new XiuyuanRepository(
        this.unifiedStorageManager,
        cardTypeDetectionService  // ✅ 注入 CardTypeDetectionService
      );
      
      // 获取模板注册表（从 XiuyuanStorage）
      const templatesObj = this.xiuyuanStorage.data.templates;
      const templateRegistry = new Map<string, any>();
      for (const [id, template] of Object.entries(templatesObj)) {
        templateRegistry.set(id, template);
      }
      
      this.xiuyuanApplicationService = new XiuyuanApplicationService(
        xiuyuanRepository,
        templateRegistry
      );
    }
    return this.xiuyuanApplicationService;
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
   * 获取 Tab 应用服务
   * 
   * @returns TabApplicationService - Tab 应用服务实例
   */
  getTabApplicationService(): TabApplicationService {
    return this.getService<TabApplicationService>('tabApplicationService');
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
  
  /**
   * 获取事件总线
   * 
   * @returns EventBus - 事件总线实例
   */
  getEventBus(): any {
    return this.getService<any>('eventBus');
  }
  
  // ========================================================================
  // DDD 重构服务访问（懒加载）
  // ========================================================================
  
  /**
   * 获取文件服务
   * 
   * @returns FileService - 文件服务实例
   */
  getFileService(): FileService {
    return this.getService<FileService>('fileService');
  }
  
  /**
   * 获取队列持久化服务
   * 
   * @returns QueuePersistenceService - 队列持久化服务实例
   */
  getQueuePersistenceService(): QueuePersistenceService {
    return this.getService<QueuePersistenceService>('queuePersistenceService');
  }
  
  /**
   * 获取设置服务
   * 
   * @returns SettingsService - 设置服务实例
   */
  getSettingsService(): SettingsService {
    return this.getService<SettingsService>('settingsService');
  }
  
  /**
   * 获取复习日志服务
   * 
   * @returns ReviewLogService - 复习日志服务实例
   */
  getReviewLogService(): ReviewLogService {
    return this.getService<ReviewLogService>('reviewLogService');
  }
  
  /**
   * 获取 Riff 黑名单服务
   * 
   * @returns RiffBlacklistService - Riff 黑名单服务实例
   */
  getRiffBlacklistService(): RiffBlacklistService {
    return this.getService<RiffBlacklistService>('riffBlacklistService');
  }

  /**
   * 获取卡片存储接口
   * 
   * @returns 卡片存储实例
   */
  getCardStorage(): any {
    return this.getStorage(); // StorageManager 实现了 ICardStorage 接口
  }

  /**
   * 获取调度器路由接口
   * 
   * @returns 调度器路由实例
   */
  getSchedulerRouter(): any {
    return this.getScheduler(); // SchedulerRouter 实现了 ISchedulerRouter 接口
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
        const saveResult = await this.unifiedStorageManager.save();  // ✅ 使用新架构 UnifiedStorageManager
        if (!saveResult.ok) {
          throw new Error(saveResult.error?.message || 'Unknown error');
        }
        console.log('[ApplicationContext] Storage data saved successfully');
      } catch (error) {
        console.error('[ApplicationContext] Critical error: Failed to save storage data:', error);
        errors.push({ service: 'unifiedStorageManager.save', error });
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
