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
import type SiyuanMemoPlugin from '@/index';
import { StorageManager } from '@/core/storage';
import {
  UnifiedStorageManager,
  type UnifiedCardStore,
  type UnifiedStorageDeltaPersistenceCallbacks,
} from '@/core/storage/UnifiedStorageManager';
import { createLegacyStorageLoader } from '@/core/storage/UnifiedStoragePersistence';
import { SchedulerRouter, RescheduleService } from '@/core/scheduler';
import { UnifiedStorageCardUpdateAdapter } from '@/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter';
import { SiyuanErrorNotificationAdapter } from '@/infrastructure/notifications/SiyuanErrorNotificationAdapter';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { DialogManager } from '@/application/managers/DialogManager';
import { MenuManager } from '@/application/managers/MenuManager';
import { TabManager } from '@/application/managers/TabManager';
import { DockManager } from '@/application/managers/DockManager';
import { PracticeQueueManager } from '@/application/managers/PracticeQueueManager';
import { TabApplicationService } from '@/application/services/TabApplicationService';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';
import { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import { TransactionWebSocketService } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import { TransactionProvenanceRegistry } from '@/core/infrastructure/websocket/transaction-provenance-registry';
import type { AutoCardHandler } from '@/application/handlers/AutoCardHandler';
import type { KernelTransactionActionPump } from '@/application/handlers/KernelTransactionActionPump';
import { dispatchKernelTransactionWriterUnavailableEvent } from '@/application/handlers/KernelTransactionWriterUnavailableEvent';
import type { KernelTransactionIngestHandler } from '@/application/handlers/KernelTransactionIngestHandler';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { AdvancedDataRouter } from '@/application/queries/DataAccessFacade';

// ✅ 静态导入所有服务工厂需要的类
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import { CreateCardUseCase } from '@/application/usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '@/application/usecases/card/DeleteCardUseCase';
import { DeleteCardsUseCase } from '@/application/usecases/card/DeleteCardsUseCase';
import { DeleteFSRSCardUseCase } from '@/application/usecases/card/DeleteFSRSCardUseCase';
import { UpdateCardUseCase } from '@/application/usecases/card/UpdateCardUseCase';
import {
  ReviewCommitUseCase,
  type ReviewCommitFollowerCommandClient,
  type ReviewCommitWriterLeaseGuard,
} from '@/application/usecases/review/ReviewCommitUseCase';
import { ReviewAttemptKernel } from '@/application/usecases/review/ReviewAttemptKernel';
import { CardApplicationService } from '@/application/services/CardApplicationService';
import { CardReadModel } from '@/infrastructure/queries/CardReadModel';
import { SqlCardReadModel } from '@/infrastructure/queries/SqlCardReadModel';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import type { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import type { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { SrsTransparencyApplicationService } from '@/application/services/SrsTransparencyApplicationService';
import type { NeuralRoamEntryActionService } from '@/application/services/NeuralRoamEntryActionService';
import { NeuralRoamRouteCatalog } from '@/core/queue/neural/routes';
import {
  SyncConflictDirectionResolutionService,
  type SyncConflictDirectionApplyResult,
  type SyncConflictDirectionChoice,
  type SyncConflictDirectionPreview,
} from '@/application/services/SyncConflictDirectionResolutionService';
import { SyncConflictMergeApplicationService } from '@/application/services/SyncConflictMergeApplicationService';
import { ReviewSyncDivergenceAuditApplicationService } from '@/application/services/ReviewSyncDivergenceAuditApplicationService';
import { DomainSyncDiagnosticsApplicationService } from '@/application/services/DomainSyncDiagnosticsApplicationService';
import {
  ManualSyncBackupRetentionApplicationService,
  type ManualSyncBackupRetentionApplyResult,
  type ManualSyncBackupRetentionPreviewResult,
} from '@/application/services/ManualSyncBackupRetentionApplicationService';
import {
  createReviewRenderServices as createInjectedReviewRenderServices,
  type ReviewRenderServices,
} from '@/application/factories/createReviewRenderServices';
import {
  createAutoCardKernelXiuyuanServiceBundle,
  type AutoCardKernelXiuyuanServiceBundle,
} from '@/application/factories/createAutoCardKernelXiuyuanServiceBundle';
import { createReviewBrowserServiceBundle } from '@/application/factories/createReviewBrowserServiceBundle';
import { EventBus } from '@/core/shared/domain/events/EventBus';

// ✅ DDD 重构服务导入
import { FileService } from '@/infrastructure/services/FileService';
import { QueuePersistenceService } from '@/infrastructure/services/QueuePersistenceService';
import { executeWriterRelayCommand } from '@/application/commands/writerRelayCommandDispatcher';
import {
  SqlArenaRepository,
  SqliteDatabaseService,
  SqliteMigrationService,
  SqlNeuralRoamRouteMigrationService,
  SqlNeuralRoamRouteRepository,
  SqlQueueStateRepository,
  SqlReviewLogRepository,
  SqlUnifiedStorageRepository,
  SqlXiuyuanReadRepository,
} from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SettingsService } from '@/application/services/SettingsService';
import { ReviewLogService } from '@/application/services/ReviewLogService';
import { RiffBlacklistService } from '@/application/services/RiffBlacklistService';
import { ReviewQueuePreparationService } from '@/application/services/ReviewQueuePreparationService';
import { ReviewAdmissionModule } from '@/application/services/ReviewAdmissionModule';
import { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import { BrowserSiyuanAdapter } from '@/infrastructure/siyuan/BrowserSiyuanAdapter';
import { BrowserAdvancedSqlQuerySourceSiyuanAdapter } from '@/infrastructure/siyuan/BrowserAdvancedSqlQuerySourceSiyuanAdapter';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import { QuerySiyuanAdapter } from '@/infrastructure/siyuan/QuerySiyuanAdapter';
import { ReviewSiyuanAdapter } from '@/infrastructure/siyuan/ReviewSiyuanAdapter';
import { HostBlockQuerySiyuanAdapter } from '@/infrastructure/siyuan/HostBlockQuerySiyuanAdapter';
import { DocTreeReviewScopeService } from '@/application/services/DocTreeReviewScopeService';
import { ExcerptRecordService } from '@/application/services/ExcerptRecordService';
import { ProgressiveExcerptCompletionService } from '@/application/services/ProgressiveExcerptCompletionService';
import { ProgressiveReadingService } from '@/application/services/ProgressiveReadingService';
import { ReviewScopeCardCreationSyncService } from '@/application/services/ReviewScopeCardCreationSyncService';
import { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import { SelectionTopicContinuationService } from '@/application/services/SelectionTopicContinuationService';
import { TopicDerivedItemService } from '@/application/services/TopicDerivedItemService';
import { ConfiguredCaptureStorageService } from '@/application/services/ConfiguredCaptureStorageService';
import { ArenaKernelService } from '@/application/services/ArenaKernelService';
import { ArenaStoreService } from '@/application/services/ArenaStoreService';
import { ReviewLogLearningCurveEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import { PrivateApiAuditService } from '@/application/services/PrivateApiAuditService';
import { PrivateApiService } from '@/application/services/PrivateApiService';
import { SharedReviewSessionRegistry } from '@/application/services/SharedReviewSessionRegistry';
import { AgentToolService } from '@/application/services/AgentToolService';
import { SrsCardSemanticsRepairService } from '@/application/services/SrsCardSemanticsRepairService';
import {
  buildAgentValidationErrorResult,
  isAgentToolName,
  type AgentToolName,
} from '@/application/agent/AgentToolContracts';
import { ProgressiveSiyuanAdapter } from '@/infrastructure/siyuan/ProgressiveSiyuanAdapter';
import { NativeRiffCompatibilityAdapter } from '@/infrastructure/siyuan/NativeRiffCompatibilityAdapter';
import { ConfiguredCaptureStorageSiyuanAdapter } from '@/infrastructure/siyuan/ConfiguredCaptureStorageSiyuanAdapter';
import { SiyuanKernelCompanionAdapter } from '@/infrastructure/siyuan/SiyuanKernelCompanionAdapter';
import { SiyuanNeuralRoamGraphQueryAdapter } from '@/infrastructure/siyuan/SiyuanNeuralRoamGraphQueryAdapter';
import { SiyuanLeechActionEffectsAdapter } from '@/infrastructure/queue/SiyuanLeechActionEffectsAdapter';
import { SiyuanBlockAdapter as QuickCardSiyuanBlockAdapter } from '@/core/card/quick-card/infrastructure/SiyuanBlockAdapter';
import { SiyuanBlockAdapter as DescriptorCardSiyuanBlockAdapter } from '@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter';
import { CardCreationSiyuanAdapter } from '@/infrastructure/siyuan/CardCreationSiyuanAdapter';
import { CardDeletionSiyuanAdapter } from '@/infrastructure/siyuan/CardDeletionSiyuanAdapter';
import { createLogger } from '@/utils/logger';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { DEFAULT_SETTINGS, type RiffIntegrationConfig } from '@/types/settings';
import type { HybridSyncConfig } from '@/application/services/XiuyuanSyncService.types';
import { isErr } from '@/types/result';
import type { KernelCompanionPort } from '@/application/ports/KernelCompanionPort';
import { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';
import { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import {
  createApplicationBackendRuntimeBundle,
  type ApplicationBackendRuntimeTransport,
} from '@/application/factories/createApplicationBackendRuntimeBundle';
import { PrivateApiClient } from '@/application/clients/PrivateApiClient';
import { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import { SemanticActivationBrowserReadClient } from '@/application/clients/SemanticActivationBrowserReadClient';
import {
  BACKEND_MIGRATION_FEATURE_GATES,
  listMigratedStateFamilies,
  type MigratedStateFamily,
} from '@/application/backendMigration/ownershipMap';
import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import type {
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusRequest,
  BackendDomainSyncStatusResult,
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
  BackendSyncConflictMergeResult,
  BackendKernelTransactionActionType,
} from '../../packages/contracts/src/backend-rpc';

const logger = createLogger('ApplicationContext');
const APPLICATION_CONTEXT_DISPOSE_STEP_TIMEOUT_MS = 2_000;
const REVIEW_TRUTH_FLUSH_DISPOSE_TIMEOUT_MS = 1_500;

type I18nDictionary = Record<string, string>;

function createSqlProjectionFileService(fileService: FileService) {
  return {
    readJSON: <T>(fileName: string) => fileService.readJSON<T>(fileName),
    writeJSON: (fileName: string, data: unknown) => fileService.writeJSON(fileName, data),
    readBinary: (fileName: string) => fileName === SQLITE_DB_FILE
      ? fileService.readTempProjectionBinary(fileName)
      : fileService.readBinary(fileName),
    writeBinary: (
      fileName: string,
      bytes: Uint8Array,
      options?: { diagnostics?: Record<string, unknown> },
    ) => fileName === SQLITE_DB_FILE
      ? fileService.writeTempProjectionBinary(fileName, bytes, options)
      : fileService.writeBinary(fileName, bytes, options),
    deleteFile: (fileName: string) => fileName === SQLITE_DB_FILE
      ? Promise.resolve()
      : fileService.deleteFile(fileName),
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

interface ApplicationServiceRegistry {
  storage: StorageManager;
  unifiedStorage: UnifiedStorageManager;
  scheduler: SchedulerRouter;
  unifiedDataSource: UnifiedDataSourceManager;
  eventBus: EventBus;
  fileService: FileService;
  queuePersistenceService: QueuePersistenceService;
  settingsService: SettingsService;
  reviewQueuePreparationService: ReviewQueuePreparationService;
  reviewAdmissionModule: ReviewAdmissionModule;
  reviewLogService: ReviewLogService;
  reviewCommitUseCase: ReviewCommitUseCase;
  reviewAttemptKernel: ReviewAttemptKernel;
  riffBlacklistService: RiffBlacklistService;
  cardTypeDetectionService: CardTypeDetectionService;
  docTreeReviewScopeService: DocTreeReviewScopeService;
  configuredCaptureStorageService: ConfiguredCaptureStorageService;
  kernelCompanion: KernelCompanionPort;
  excerptRecordService: ExcerptRecordService;
  progressiveExcerptCompletionService: ProgressiveExcerptCompletionService;
  progressiveReadingService: ProgressiveReadingService;
  reviewScopeCardCreationSyncService: ReviewScopeCardCreationSyncService;
  selectionExcerptService: SelectionExcerptService;
  selectionTopicContinuationService: SelectionTopicContinuationService;
  topicDerivedItemService: TopicDerivedItemService;
  cardContentQueryService: CardContentQueryService;
  arenaStoreService: ArenaStoreService;
  arenaKernelService: ArenaKernelService;
  sharedReviewSessionRegistry: SharedReviewSessionRegistry;
  agentToolService: AgentToolService;
  privateApiAuditService: PrivateApiAuditService;
  privateApiClient: PrivateApiClient;
  semanticActivationCommandClient: SemanticActivationCommandClient | null;
  semanticActivationBrowserReadClient: SemanticActivationBrowserReadClient | null;
  privateApiService: PrivateApiService;
  dialogManager: DialogManager;
  menuManager: MenuManager;
  tabManager: TabManager;
  tabApplicationService: TabApplicationService;
  dockManager: DockManager;
  practiceQueueManager: PracticeQueueManager;
  cardService: CardApplicationService;
  srsCardSemanticsRepairService: SrsCardSemanticsRepairService;
  browserService: BrowserApplicationService;
  reviewService: ReviewApplicationService;
  neuralRoamEntryActionService: NeuralRoamEntryActionService;
  cardEditorService: CardEditorApplicationService;
  srsTransparencyService: SrsTransparencyApplicationService;
}

type ServiceName = keyof ApplicationServiceRegistry;
type ServiceFactory<K extends ServiceName> = (context: ApplicationContext) => ApplicationServiceRegistry[K];

interface SqlPersistenceBundle {
  database: SqliteDatabaseService;
  unified: SqlUnifiedStorageRepository;
  queue: SqlQueueStateRepository;
  neuralRoamRoutes: SqlNeuralRoamRouteRepository;
  reviewLogs: SqlReviewLogRepository;
  arena: SqlArenaRepository;
  xiuyuanRead: SqlXiuyuanReadRepository;
}

type DisposableSrsBackendTransport = ApplicationBackendRuntimeTransport;
type DisposalErrorCollector = Array<{ service: string; error: unknown }>;
type DisposalStepOutcome<TResult> =
  | { status: 'completed'; value: TResult }
  | { status: 'failed'; error: unknown }
  | { status: 'timeout'; error: Error };

/**
 * 应用配置接口
 */
export interface ApplicationConfig {
  /** 思源插件实例 */
  plugin: Plugin;
  /** 国际化资源 */
  i18n: I18nDictionary;
  /** SiYuan frontend kind from getFrontend() */
  frontendKind?: string;
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
  private static readonly KERNEL_WRITER_LEASE_INSTANCE_ID_ENV_KEY = 'VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_INSTANCE_ID';
  private static readonly KERNEL_WRITER_LEASE_TTL_MS_ENV_KEY = 'VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_TTL_MS';

  // ========================================================================
  // 核心服务
  // ========================================================================
  
  private storageManager: StorageManager;
  private unifiedStorageManager: UnifiedStorageManager;  // 🆕 统一存储管理器
  private schedulerRouter: SchedulerRouter;
  private rescheduleService: RescheduleService;
  private unifiedDataSourceManager: UnifiedDataSourceManager;
  
  // 队列上下文（不再直接持有具体队列实例）
  
  // Xiuyuan 服务
  private xiuyuanApplicationService?: XiuyuanApplicationService;  // 懒加载
  private deletionTracker?: IDeletionTracker;
  
  // 应用服务
  private blockMenuHandler: BlockMenuHandler;
  
  // 基础设施服务
  private hybridSyncService?: XiuyuanSyncService;
  private transactionWebSocketService?: TransactionWebSocketService;
  private readonly transactionProvenanceRegistry = new TransactionProvenanceRegistry();
  private autoCardHandler?: AutoCardHandler;
  private readonly autoCardBackendExecutionHandlerScopes: Array<{ handler: AutoCardHandler }> = [];
  private autoCardBackendExecutionDepth = 0;
  private kernelTransactionIngestHandler?: KernelTransactionIngestHandler;
  private kernelTransactionActionPump?: KernelTransactionActionPump;
  private fullSyncTimer?: NodeJS.Timeout;
  private progressiveExcerptCompletionRepairTimer?: ReturnType<typeof setTimeout>;
  private sqlPersistence?: SqlPersistenceBundle;
  private srsBackendClient: SrsBackendClient | null = null;
  private srsBackendTransport: DisposableSrsBackendTransport | null = null;
  private frontendInstanceRuntime: FrontendInstanceRuntime | null = null;
  private followerCommandClient: FollowerCommandClient | null = null;
  private kernelSidecarClient: KernelSidecarClient;
  private readonly backendMigrationRuntimePolicy: BackendMigrationRuntimePolicy;
  private readonly backendStartupError: string | null;
  private readonly autoCardKernelXiuyuanServiceBundle: AutoCardKernelXiuyuanServiceBundle;
  
  // ========================================================================
  // 服务容器
  // ========================================================================
  
  /**
   * 服务容器 - 管理所有服务的创建和访问
   * 使用 Map 存储服务实例，支持懒加载
   */
  private serviceContainer: Map<ServiceName, ApplicationServiceRegistry[ServiceName]> = new Map();
  
  /**
   * 服务工厂 - 定义如何创建各种服务
   * 键为服务名称，值为创建服务的工厂函数
   * 工厂函数接收 ApplicationContext 作为参数，用于依赖注入
   */
  private serviceFactories: Map<ServiceName, ServiceFactory<ServiceName>> = new Map();
  
  /**
   * 正在创建的服务集合 - 用于检测循环依赖
   * Phase 8: 性能优化 - 循环依赖检测
   */
  private creatingServices = new Set<ServiceName>();
  
  /**
   * 失败的服务记录 - 用于错误恢复
   * Phase 8: 性能优化 - 错误恢复机制
   */
  private failedServices = new Map<ServiceName, Error>();
  
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
      rescheduleService: RescheduleService;
      unifiedDataSourceManager: UnifiedDataSourceManager;
      blockMenuHandler: BlockMenuHandler;
      sharedEventBus?: EventBus;  // ✅ 新增：共享的 EventBus 实例
      sqlPersistence?: SqlPersistenceBundle;
      hybridSyncService?: XiuyuanSyncService;
      transactionWebSocketService?: TransactionWebSocketService;
      fullSyncTimer?: NodeJS.Timeout;
      srsBackendClient?: SrsBackendClient | null;
      srsBackendTransport?: DisposableSrsBackendTransport | null;
      frontendInstanceRuntime?: FrontendInstanceRuntime | null;
      followerCommandClient?: FollowerCommandClient | null;
      kernelSidecarClient: KernelSidecarClient;
      backendMigrationRuntimePolicy: BackendMigrationRuntimePolicy;
      backendStartupError?: string | null;
    }
  ) {
    this.config = config;
    this.storageManager = services.storageManager;
    this.unifiedStorageManager = services.unifiedStorageManager;  // 🆕 统一存储管理器
    this.schedulerRouter = services.schedulerRouter;
    this.rescheduleService = services.rescheduleService;
    this.unifiedDataSourceManager = services.unifiedDataSourceManager;
    this.blockMenuHandler = services.blockMenuHandler;
    this.hybridSyncService = services.hybridSyncService;
    this.transactionWebSocketService = services.transactionWebSocketService;
    this.fullSyncTimer = services.fullSyncTimer;
    this.sqlPersistence = services.sqlPersistence;
    this.srsBackendClient = services.srsBackendClient ?? null;
    this.srsBackendTransport = services.srsBackendTransport ?? null;
    this.frontendInstanceRuntime = services.frontendInstanceRuntime ?? null;
    this.followerCommandClient = services.followerCommandClient ?? null;
    this.kernelSidecarClient = services.kernelSidecarClient;
    this.backendMigrationRuntimePolicy = services.backendMigrationRuntimePolicy;
    this.backendStartupError = services.backendStartupError ?? null;
    this.autoCardKernelXiuyuanServiceBundle = createAutoCardKernelXiuyuanServiceBundle({
      plugin: this.config.plugin,
      getUnifiedStorage: () => this.unifiedStorageManager,
      getUnifiedDataSourceManager: () => this.unifiedDataSourceManager,
      getSqlXiuyuanReadRepository: () => this.sqlPersistence?.xiuyuanRead ?? null,
      getSrsBackendClient: () => this.srsBackendClient,
      getCardTypeDetectionService: () => this.getCardTypeDetectionService(),
      getEventBus: () => this.getEventBus(),
      getRiffBlacklistService: () => this.getRiffBlacklistService(),
      getDeletionTracker: () => {
        if (!this.deletionTracker) {
          throw new Error('[ApplicationContext] deletionTracker should have been created during initialization');
        }
        return this.deletionTracker;
      },
    });
    
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
      this.registerServiceFactory('eventBus', () => {
        return new EventBus(false);  // false = 不启用调试日志
      });
    }
    
    // ✅ 注册 DDD 重构服务工厂
    // 基础设施层服务
    this.registerServiceFactory('fileService', (context) => {
      return new FileService(context.getPlugin() as unknown as SiyuanMemoPlugin);
    });
    this.registerServiceFactory('queuePersistenceService', (context) => {
      const service = new QueuePersistenceService(context.sqlPersistence?.queue ?? null);
      // 🔧 修复：延迟初始化（在首次使用前）
      // 注意：init() 会在 ApplicationContext.init() 中调用
      return service;
    });
    
    // 应用层服务
    this.registerServiceFactory('settingsService', (context) => {
      const fileService = context.getFileService();
      const service = new SettingsService(fileService);
      // 🔧 修复：延迟初始化（在首次使用前）
      // 注意：init() 会在 ApplicationContext.create() 中调用
      return service;
    });

    this.registerServiceFactory('cardTypeDetectionService', (context) => {
      return new CardTypeDetectionService({
        resolveFlashcardConfig: () => {
          try {
            return context.getSettingsService().getSettings().quickCard?.flashcard;
          } catch {
            return DEFAULT_SETTINGS.quickCard.flashcard;
          }
        },
      });
    });

    this.registerServiceFactory('docTreeReviewScopeService', (context) => {
      return new DocTreeReviewScopeService(
        new ManagerSiyuanAdapter(),
        context.getStorage(),
        context.sqlPersistence?.unified ?? null,
      );
    });

    this.registerServiceFactory('configuredCaptureStorageService', (context) => {
      return new ConfiguredCaptureStorageService(
        new ConfiguredCaptureStorageSiyuanAdapter(context.getPlugin().app),
      );
    });

    this.registerServiceFactory('srsCardSemanticsRepairService', (context) => {
      return new SrsCardSemanticsRepairService({
        repository: context.sqlPersistence?.unified ?? null,
        cardMirror: context.getCardService(),
      });
    });

    this.registerServiceFactory('kernelCompanion', () => {
      return new SiyuanKernelCompanionAdapter();
    });

    const reviewBrowserServiceBundle = createReviewBrowserServiceBundle({
      neuralRoam: {
        getStorage: () => this.getStorage(),
        getCardService: () => this.getCardService(),
        getUnifiedDataSourceManager: () => this.getUnifiedDataSourceManager(),
        getI18n: () => this.getI18n(),
        createManagerSiyuanPort: () => new ManagerSiyuanAdapter(),
        openNeuralRoamDialog: async (options) => {
          await this.getDialogManager().openNeuralRoamDialog(options);
        },
      },
      browser: {
        getUnifiedStorage: () => this.getUnifiedStorage(),
        getUnifiedDataSourceManager: () => this.getUnifiedDataSourceManager(),
        getSrsBackendClient: () => this.srsBackendClient,
        getFrontendInstanceRuntime: () => this.frontendInstanceRuntime,
        getFollowerCommandClient: () => this.followerCommandClient,
        getBrowserDeckReadPort: () => this.sqlPersistence?.unified ?? null,
        createBrowserAdvancedSqlQuerySource: () => new BrowserAdvancedSqlQuerySourceSiyuanAdapter(new QuerySiyuanAdapter()),
        createBrowserSiyuanPort: () => new BrowserSiyuanAdapter(),
        createBrowserQuerySiyuanPort: () => new QuerySiyuanAdapter(),
      },
      review: {
        getUnifiedStorage: () => this.getUnifiedStorage(),
        getUnifiedDataSourceManager: () => this.getUnifiedDataSourceManager(),
        getScheduler: () => this.getScheduler(),
        getSrsBackendClient: () => this.srsBackendClient,
        getFrontendInstanceRuntime: () => this.frontendInstanceRuntime,
        getFollowerCommandClient: () => this.followerCommandClient,
        createReviewSiyuanPort: () => new ReviewSiyuanAdapter(),
      },
      cardEditor: {
        getUnifiedDataSourceManager: () => this.getUnifiedDataSourceManager(),
        getReviewService: () => this.getReviewService(),
      },
      srsTransparency: {
        getScheduler: () => this.getScheduler(),
        getArenaKernelService: () => this.getArenaKernelService(),
        getReviewLogService: () => this.getReviewLogService(),
      },
    });

    this.registerServiceFactory('excerptRecordService', (context) => {
      return new ExcerptRecordService(context.getFileService());
    });

    this.registerServiceFactory('progressiveExcerptCompletionService', (context) => {
      const siyuanApi = new ProgressiveSiyuanAdapter();
      return new ProgressiveExcerptCompletionService({
        cardService: context.getCardService(),
        excerptRecordService: context.getExcerptRecordService(),
        blockExists: async (blockId) => {
          const normalizedBlockId = String(blockId || '').trim();
          if (!normalizedBlockId) {
            return false;
          }
          const rows = await siyuanApi.sql<{ id: string }>(`
            SELECT id
            FROM blocks
            WHERE id = '${escapeSqlLiteral(normalizedBlockId)}'
            LIMIT 1
          `);
          return rows.length > 0;
        },
      });
    });

    this.registerServiceFactory('progressiveReadingService', (context) => {
      return new ProgressiveReadingService(
        new ProgressiveSiyuanAdapter(),
        undefined,
        context.getFileService(),
        context.getCardService(),
        context.getSettingsService(),
        context.getConfiguredCaptureStorageService(),
        context.getExcerptRecordService(),
        context.getDocTreeReviewScopeService(),
        undefined,
        context.srsBackendClient || undefined,
        context.frontendInstanceRuntime,
        context.followerCommandClient,
        context.transactionProvenanceRegistry,
        context.getProgressiveExcerptCompletionService(),
      );
    });

    this.registerServiceFactory('reviewScopeCardCreationSyncService', (context) => {
      return new ReviewScopeCardCreationSyncService(
        context.getEventBus(),
        context.getCardService(),
        context.getUnifiedDataSourceManager(),
        context.getDocTreeReviewScopeService(),
        { siyuanApi: new ManagerSiyuanAdapter() },
      );
    });

    this.registerServiceFactory('selectionExcerptService', (context) => {
      return new SelectionExcerptService(context.getProgressiveReadingService());
    });

    this.registerServiceFactory('selectionTopicContinuationService', (context) => {
      return new SelectionTopicContinuationService(
        new ProgressiveSiyuanAdapter(),
        context.getCardService(),
        context.getTopicDerivedItemService(),
      );
    });

    this.registerServiceFactory('topicDerivedItemService', (context) => {
      return new TopicDerivedItemService(
        context.getCardService(),
        context.getProgressiveReadingService(),
        undefined,
        context.getSettingsService(),
        undefined,
        context.srsBackendClient || undefined,
        context.frontendInstanceRuntime,
        context.followerCommandClient,
      );
    });

    this.registerServiceFactory('neuralRoamEntryActionService', () => {
      return reviewBrowserServiceBundle.createNeuralRoamEntryActionService();
    });
    
    this.registerServiceFactory('reviewQueuePreparationService', (context) => {
      return new ReviewQueuePreparationService(
        context.getUnifiedDataSourceManager(),
        context.getRescheduleService(),
        context.getQueuePersistenceService(),
        context.getSettingsService()
      );
    });

    this.registerServiceFactory('reviewAdmissionModule', (context) => {
      return new ReviewAdmissionModule(context.getUnifiedDataSourceManager());
    });

    this.registerServiceFactory('reviewLogService', (context) => {
      const fileService = context.getFileService();
      return new ReviewLogService(fileService, context.sqlPersistence?.reviewLogs ?? null);
    });

    this.registerServiceFactory('reviewCommitUseCase', (context) => {
      const unifiedDataSourceManager = context.getUnifiedDataSourceManager();
      const runtimePolicy = context.getBackendMigrationRuntimePolicy();
      const writerLeaseGuard = runtimePolicy.capabilities.writerRelayRuntimeEnabled
        ? context.createReviewCommitWriterLeaseGuard()
        : null;
      const followerCommandClient = runtimePolicy.capabilities.writerRelayRuntimeEnabled
        ? context.createReviewCommitFollowerCommandClient()
        : null;
      const schedulerSettings = context.getSettingsService().getSettings();
      return new ReviewCommitUseCase({
        cards: unifiedDataSourceManager,
        schedulerConfig: {
          defaultScheduler: schedulerSettings.scheduler?.defaultScheduler || 'fsrs-v6',
          fsrsParams: schedulerSettings.fsrs,
        },
        arena: context.getArenaKernelService(),
        srsBackend: context.srsBackendClient,
        writerLeaseGuard,
        followerCommandClient,
        runtimePolicy,
      });
    });

    this.registerServiceFactory('reviewAttemptKernel', (context) => {
      return new ReviewAttemptKernel({
        reviewCommitter: context.getReviewCommitUseCase(),
      });
    });
    
    this.registerServiceFactory('riffBlacklistService', (context) => {
      return new RiffBlacklistService(
        context.getUnifiedStorage(),
        { enabled: true }
      );
    });
    
    // ✅ 卡片内容查询服务
    this.registerServiceFactory('cardContentQueryService', () => {
      return new CardContentQueryService(new QuerySiyuanAdapter());
    });

    this.registerServiceFactory('arenaStoreService', () => {
      return new ArenaStoreService(
        this.getFileService(),
        this.sqlPersistence?.arena ?? null,
      );
    });

    this.registerServiceFactory('arenaKernelService', (context) => {
      return new ArenaKernelService({
        getArenaSettings: () => context.getSettingsService().getSettings().arena,
        updateArenaSettings: async (updater) => {
          const settingsService = context.getSettingsService();
          await settingsService.updateSettings({
            arena: updater(settingsService.getSettings().arena),
          });
        },
        getFsrsParams: () => context.getSettingsService().getSettings().fsrs,
        arenaStore: context.getArenaStoreService(),
        evidenceReader: new ReviewLogLearningCurveEvidenceReader(context.getReviewLogService()),
      });
    });

    this.registerServiceFactory('privateApiAuditService', () => {
      return new PrivateApiAuditService();
    });

    this.registerServiceFactory('privateApiClient', (context) => {
      if (!context.srsBackendClient) {
        throw new Error('BACKEND_UNAVAILABLE: private API backend client unavailable');
      }
      return new PrivateApiClient({
        backendClient: context.srsBackendClient,
        frontendRuntime: context.getFrontendInstanceRuntime(),
        followerCommandClient: context.getFollowerCommandClient(),
        writerRelayRequiredForMutations: context.getBackendMigrationRuntimePolicy().capabilities.writerRelayRequiredForBackendWrites,
      });
    });

    this.registerServiceFactory('semanticActivationCommandClient', (context) => {
      if (!context.srsBackendClient) {
        return null;
      }
      return new SemanticActivationCommandClient({
        backendClient: context.srsBackendClient,
        frontendRuntime: context.getFrontendInstanceRuntime(),
        followerCommandClient: context.getFollowerCommandClient(),
        writerRelayRequiredForMutations: true,
      });
    });

    this.registerServiceFactory('semanticActivationBrowserReadClient', (context) => {
      if (!context.srsBackendClient) {
        return null;
      }
      return new SemanticActivationBrowserReadClient({
        backendClient: context.srsBackendClient,
      });
    });

    this.registerServiceFactory('privateApiService', (context) => {
      const runtimePolicy = context.getBackendMigrationRuntimePolicy();
      if (!runtimePolicy.capabilities.privateApiReadEnabled) {
        throw new Error('BACKEND_UNAVAILABLE: private API is disabled by runtime policy');
      }
      const auditService = context.getService('privateApiAuditService');
      const privateApiClient = context.getService('privateApiClient');
      return new PrivateApiService({
        privateApiClient,
        auditService,
        resolveCapabilitySource: () => ({
          backendWorkerAvailable: runtimePolicy.capabilities.backendWorkerAvailable,
          kernelSidecarAvailable: true,
          writerAvailable: runtimePolicy.capabilities.writerRelayRuntimeEnabled,
        }),
      });
    });

    this.registerServiceFactory('sharedReviewSessionRegistry', () => {
      return new SharedReviewSessionRegistry();
    });

    this.registerServiceFactory('agentToolService', (context) => {
      return new AgentToolService({
        browserService: context.getBrowserService(),
        cardService: context.getCardService(),
        dialogManager: context.getDialogManager(),
        reviewSessionRegistry: context.getSharedReviewSessionRegistry(),
      });
    });
    
    // TODO: Phase 1 Task 2 - 注册 UI 管理器工厂
    // ✅ Task 2.1: DialogManager 已注册
    this.registerServiceFactory('dialogManager', (context) => {
      return new DialogManager(context, context.getPlugin(), {
        siyuanApi: new ManagerSiyuanAdapter(),
        progressiveSiyuanApi: new ProgressiveSiyuanAdapter(),
        hostBlockQuery: new HostBlockQuerySiyuanAdapter(),
        leechActionEffects: new SiyuanLeechActionEffectsAdapter(),
      });
    });
    // ✅ Task 2.2: MenuManager 已注册
    this.registerServiceFactory('menuManager', (context) => {
      return new MenuManager(
        context, 
        context.getPlugin(), 
        context.getI18n(),
        context.getDialogManager(),  // ✅ 注入 DialogManager
        new ManagerSiyuanAdapter()
      );
    });
    // ✅ Task 2.3: TabManager 已注册
    this.registerServiceFactory('tabManager', (context) => {
      return new TabManager(context, context.getPlugin(), {
        siyuanApi: new ManagerSiyuanAdapter(),
      });
    });
    // ✅ Phase 9 Task 1.3: TabApplicationService 已注册
    this.registerServiceFactory('tabApplicationService', (context) => {
      return new TabApplicationService(context.getPlugin().app);
    });
    // ✅ Task 3.4: DockManager 已注册
    this.registerServiceFactory('dockManager', (context) => {
      return new DockManager(context.getPlugin(), context, context.getI18n());
    });
    // ✅ Task 3.4: PracticeQueueManager 已注册
    this.registerServiceFactory('practiceQueueManager', (context) => {
      return new PracticeQueueManager(
        context.getRetrievalQueue(),
        context.getBlockMenuHandler(),
        context.getI18n(),
        new ManagerSiyuanAdapter()
      );
    });
    
    // ✅ Task 13.1: 注册卡片应用服务工厂
    this.registerServiceFactory('cardService', (context) => {
      // 创建基础设施层：XiuyuanRepository
      // ✅ DDD 架构修复：使用 UnifiedStorageManager 而不是 XiuyuanStorage
      // UnifiedStorageManager 是统一的数据访问层，符合 DDD 原则
      
      // ✅ 创建 CardTypeDetectionService（领域服务）
      const cardTypeDetectionService = context.getCardTypeDetectionService();
      
      const xiuyuanRepo = new XiuyuanRepository(
        context.getUnifiedStorage(),  // ✅ 使用 UnifiedStorageManager
        cardTypeDetectionService,      // ✅ 注入 CardTypeDetectionService
        context.sqlPersistence?.xiuyuanRead ?? null,
      );

      // 创建领域服务
      const cardCreationService = new CardCreationService();
      const cardDeletionService = new CardDeletionService();
      const cardCreationSiyuanApi = new CardCreationSiyuanAdapter();
      const cardDeletionSiyuanApi = new CardDeletionSiyuanAdapter();

      // ✅ 获取 DeletionTracker（应该已经在 create() 中创建）
      const deletionTracker = context.deletionTracker;
      if (!deletionTracker) {
        throw new Error('[ApplicationContext] deletionTracker should have been created during initialization');
      }

      // 创建用例
      const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService, context.getEventBus(), {
        siyuanApi: cardCreationSiyuanApi,
      });
      const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService, context.getEventBus(), {
        siyuanApi: cardDeletionSiyuanApi,
        deletionTracker,
      });
      const deleteCardsUseCase = new DeleteCardsUseCase(
        xiuyuanRepo,
        cardDeletionService,
        context.getEventBus(),
        deletionTracker,
        { siyuanApi: cardDeletionSiyuanApi }
      );
      const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

      // ✅ 创建 Read Model（基础设施层）
      const unifiedStorage = context.getUnifiedStorage();
      const cardReadModel = context.sqlPersistence
        ? new SqlCardReadModel(context.sqlPersistence.unified)
        : new CardReadModel(unifiedStorage);
      
      // 创建应用服务
      const scheduleService = new CardScheduleService();
      const deleteFSRSCardUseCase = new DeleteFSRSCardUseCase(unifiedStorage, {
        siyuanApi: cardDeletionSiyuanApi,
      });
      
      return new CardApplicationService(
        createCardUseCase,
        deleteCardUseCase,
        deleteCardsUseCase,
        updateCardUseCase,
        cardReadModel,  // ✅ 传入 Read Model 接口
        scheduleService,
        unifiedStorage,  // ✅ 传递 UnifiedStorageManager 用于 FSRS 卡片操作
        deleteFSRSCardUseCase
      );
    });
    
    // ✅ 注册浏览器应用服务工厂
    this.registerServiceFactory('browserService', () => {
      return reviewBrowserServiceBundle.createBrowserApplicationService();
    });
    
    // ✅ 注册复习应用服务工厂
    this.registerServiceFactory('reviewService', () => {
      return reviewBrowserServiceBundle.createReviewApplicationService();
    });

    this.registerServiceFactory('cardEditorService', () => {
      return reviewBrowserServiceBundle.createCardEditorApplicationService();
    });

    this.registerServiceFactory('srsTransparencyService', () => {
      return reviewBrowserServiceBundle.createSrsTransparencyApplicationService();
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
  registerServiceFactory<K extends ServiceName>(serviceName: K, factory: ServiceFactory<K>): void {
    this.serviceFactories.set(serviceName, factory as ServiceFactory<ServiceName>);
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
  getService<K extends ServiceName>(serviceName: K): ApplicationServiceRegistry[K] {
    this.ensureNotDisposed();
    
    // ✅ 检查缓存 - 如果服务已创建，直接返回
    if (this.serviceContainer.has(serviceName)) {
      return this.serviceContainer.get(serviceName) as ApplicationServiceRegistry[K];
    }
    
    // ⚠️ 检查是否之前创建失败 - Phase 8: 错误恢复
    if (this.failedServices.has(serviceName)) {
      const previousError = this.failedServices.get(serviceName)!;
      logger.warn(
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
          logger.warn(
            `[ApplicationContext] Service '${serviceName}' took ${duration.toFixed(2)}ms to create ` +
            `(threshold: ${this.performanceThreshold}ms)`
          );
        }
      }
      
      return service as ApplicationServiceRegistry[K];
    } catch (error) {
      // 记录失败
      this.failedServices.set(serviceName, error as Error);
      logger.error(`[ApplicationContext] Failed to create service '${serviceName}':`, error);
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
    const name = serviceName as ServiceName;
    return this.serviceContainer.has(name) || this.serviceFactories.has(name);
  }
  
  /**
   * 检查服务是否已创建
   * 
   * @param serviceName - 服务名称
   * @returns boolean - 服务是否已创建
   */
  isServiceCreated(serviceName: ServiceName): boolean {
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
    await measureRuntimePerformance('startup', 'storage-manager.init', () => storageManager.init());
    const fileService = new FileService(config.plugin as unknown as SiyuanMemoPlugin);
    const legacyPersistence = createLegacyStorageLoader(config.plugin);
    let sqlPersistence: SqlPersistenceBundle | undefined;
    let unifiedSave!: (data: UnifiedCardStore) => Promise<void>;
    let unifiedLoad = legacyPersistence.load;
    let unifiedDeltaPersistence: UnifiedStorageDeltaPersistenceCallbacks = {};

    try {
      await measureRuntimePerformance('startup', 'sqlite.init-and-migrate', async () => {
        const sqlFileService = createSqlProjectionFileService(fileService);
        const database = new SqliteDatabaseService(sqlFileService, SQLITE_DB_FILE, {
          persistOnInit: false,
          enableDeltaPersistence: true,
          checkpointStorageClass: 'volatile-projection',
          dropStoredDatabaseOnSchemaMismatch: true,
        });
        await database.init();
        const unified = new SqlUnifiedStorageRepository(database);
        const queue = new SqlQueueStateRepository(database);
        const neuralRoamRoutes = new SqlNeuralRoamRouteRepository(database);
        const reviewLogs = new SqlReviewLogRepository(database);
        const arena = new SqlArenaRepository(database);
        const xiuyuanRead = new SqlXiuyuanReadRepository(database);
        const migrationService = new SqliteMigrationService(
          database,
          fileService,
          { unified, queue, reviewLogs, arena },
          legacyPersistence.load,
        );
        await migrationService.migrateIfNeeded();
        const routeMigrationService = new SqlNeuralRoamRouteMigrationService(queue, neuralRoamRoutes);
        await routeMigrationService.migrateIfNeeded();
        sqlPersistence = { database, unified, queue, neuralRoamRoutes, reviewLogs, arena, xiuyuanRead };
        unifiedSave = (data) => unified.saveStore(data);
        unifiedLoad = (reason) => unified.loadStore(reason);
        unifiedDeltaPersistence = {
          saveXiuyuanCardDelta: (delta) => unified.saveXiuyuanCardDelta(delta),
        };
      });
      logger.info('[ApplicationContext] ✅ SQLite storage active');
    } catch (error) {
      logger.error('[ApplicationContext] SQLite migration/init failed; refusing storage continuation:', error);
      const startupError = new Error('STORAGE_UNAVAILABLE: SQLite migration/init failed');
      (startupError as Error & { cause?: unknown }).cause = error;
      throw startupError;
    }
    
    // 🆕 1.1 初始化统一存储管理器
    const unifiedStorageManager = new UnifiedStorageManager();
    unifiedStorageManager.setPersistenceCallbacks(unifiedSave, unifiedLoad, unifiedDeltaPersistence);
    
    // 尝试加载数据，如果文件不存在则初始化为空
    const loadResult = await measureRuntimePerformance(
      'startup',
      'unified-storage.load',
      () => unifiedStorageManager.load(),
    );
    if (isErr(loadResult)) {
      logger.error('[ApplicationContext] Failed to load UnifiedStorageManager, aborting startup to protect data:', loadResult.error);
      throw new Error(`[ApplicationContext] Failed to load unified storage: ${loadResult.error.message}`);
    } else {
      const stats = unifiedStorageManager.getStats();
      logger.info('[ApplicationContext] ✅ UnifiedStorageManager loaded:', {
        xiuyuans: stats.totalXiuYuans,
        cards: stats.totalCards,
      });

      const migratedLegacyFSRSCount = unifiedStorageManager.migrateLegacyFSRSV5SchedulerType();
      const normalizedMalformedScheduleCount = unifiedStorageManager.normalizeMalformedReviewScheduling();
      if (migratedLegacyFSRSCount > 0 || normalizedMalformedScheduleCount > 0) {
        logger.info('[ApplicationContext] Persisting unified storage scheduling normalization:', {
          migratedLegacyFSRSCount,
          normalizedMalformedScheduleCount,
        });
        const migrationSaveResult = await measureRuntimePerformance(
          'startup',
          'unified-storage.schedule-normalization-save',
          () => unifiedStorageManager.save(),
          { migratedLegacyFSRSCount, normalizedMalformedScheduleCount },
        );
        if (isErr(migrationSaveResult)) {
          logger.error('[ApplicationContext] Failed to persist scheduling normalization:', migrationSaveResult.error);
          throw new Error(`[ApplicationContext] Failed to persist scheduling normalization: ${migrationSaveResult.error.message}`);
        }
      }
      
      // 🔧 修复：检查并创建缺失的 Xiuyuan（历史遗留数据迁移）
      const allCards = unifiedStorageManager.getAllCards();
      const orphanCards = allCards.filter(card => !card.meta?.xiuyuanID);
      incrementRuntimePerformanceCounter('startup', 'orphan-card-count', orphanCards.length);
      
      if (orphanCards.length > 0) {
        await measureRuntimePerformance('startup', 'unified-storage.orphan-card-repair', async () => {
        logger.warn(`[ApplicationContext] Found ${orphanCards.length} orphan cards without Xiuyuan, creating Xiuyuans...`);
        
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
        
        const repairedXiuyuans = [];
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
              logger.error(`[ApplicationContext] Failed to create value objects for card ${orphanCard.id}`);
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
              logger.error(`[ApplicationContext] Failed to create Xiuyuan for card ${orphanCard.id}`);
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
              logger.error(`[ApplicationContext] Failed to create Card entity for ${orphanCard.id}`);
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
              logger.error(`[ApplicationContext] Failed to create Card for ${orphanCard.id}`);
              continue;
            }
            
            // 添加 Card 到 Xiuyuan
            const addResult = xiuyuan.addCard(cardResult.value);
            if (!addResult.ok) {
              logger.error(`[ApplicationContext] Failed to add Card to Xiuyuan for ${orphanCard.id}`);
              continue;
            }
            
            repairedXiuyuans.push(xiuyuan);
          } catch (error) {
            logger.error(`[ApplicationContext] Error fixing orphan card ${orphanCard.id}:`, error);
          }
        }
        
        let fixedCount = 0;
        if (repairedXiuyuans.length > 0) {
          const xiuyuanRepo = new XiuyuanRepository(unifiedStorageManager);
          const saveResult = await xiuyuanRepo.saveMany(repairedXiuyuans);

          if (isErr(saveResult)) {
            logger.error('[ApplicationContext] Failed to batch save orphan-card Xiuyuans:', saveResult.error);
          } else {
            fixedCount = repairedXiuyuans.length;
            logger.info(`[ApplicationContext] ✅ Fixed ${fixedCount}/${orphanCards.length} orphan cards`);
          }
        }
        incrementRuntimePerformanceCounter('startup', 'orphan-card-repaired', fixedCount);
        }, { orphanCardCount: orphanCards.length });
      }
    }
    
    const settings = storageManager.getSettings();
    
    // 2. 自动修复无效日期（首次加载时）
    try {
      const repairResult = await measureRuntimePerformance(
        'startup',
        'storage-manager.repair-invalid-dates',
        () => storageManager.repairInvalidDates(),
      );
      if (repairResult.fixed > 0) {
        logger.info(`[ApplicationContext] 🔧 Repaired ${repairResult.fixed}/${repairResult.total} cards with invalid dates`);
      }
    } catch (err) {
      logger.error('[ApplicationContext] Failed to repair invalid dates:', err);
    }
    
    // 3. 创建 CardApplicationService 相关组件
    // ✅ DDD 架构修复：使用 UnifiedStorageManager 创建 XiuyuanRepository
    // 确保所有地方使用统一的数据访问层，避免数据不一致
    
    // ✅ 创建 CardTypeDetectionService
    let settingsServiceRef: SettingsService | undefined;
    const cardTypeDetectionServiceTemp = new CardTypeDetectionService({
      resolveFlashcardConfig: () => {
        try {
          return settingsServiceRef?.getSettings().quickCard?.flashcard ?? DEFAULT_SETTINGS.quickCard.flashcard;
        } catch {
          return DEFAULT_SETTINGS.quickCard.flashcard;
        }
      },
    });
    
    const xiuyuanRepoTemp = new XiuyuanRepository(
      unifiedStorageManager,
      cardTypeDetectionServiceTemp,  // ✅ 注入 CardTypeDetectionService
      sqlPersistence?.xiuyuanRead ?? null,
    );
    
    // 创建领域服务
    const cardCreationService = new CardCreationService();
    const cardDeletionService = new CardDeletionService();
    const cardScheduleService = new CardScheduleService();
    const cardCreationSiyuanApi = new CardCreationSiyuanAdapter();
    const cardDeletionSiyuanApi = new CardDeletionSiyuanAdapter();
    
    // ⚠️ 注意：此时 context 还未创建，所以先创建一个临时的 EventBus
    // 这个 EventBus 将被 DeleteCardUseCase 和 RiffSyncEventHandler 共享
    const sharedEventBus = new EventBus(false);
    
    // ✅ 创建 InMemoryDeletionTracker（在创建用例之前）
    const { InMemoryDeletionTracker } = await import('@/core/xiuyuan/infrastructure/InMemoryDeletionTracker');
    const deletionTracker = new InMemoryDeletionTracker();
    logger.info('[ApplicationContext] Created InMemoryDeletionTracker for early initialization');
    
    // 创建用例
    const createCardUseCase = new CreateCardUseCase(xiuyuanRepoTemp, cardCreationService, sharedEventBus, {
      siyuanApi: cardCreationSiyuanApi,
    });
    const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepoTemp, cardDeletionService, sharedEventBus, {
      siyuanApi: cardDeletionSiyuanApi,
      deletionTracker,
    });
    const deleteCardsUseCase = new DeleteCardsUseCase(
      xiuyuanRepoTemp,
      cardDeletionService,
      sharedEventBus,
      deletionTracker,
      { siyuanApi: cardDeletionSiyuanApi }
    );
    const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepoTemp);
    
    // ✅ 创建 Read Model（基础设施层）
    const cardReadModel = sqlPersistence
      ? new SqlCardReadModel(sqlPersistence.unified)
      : new CardReadModel(unifiedStorageManager);
    const deleteFSRSCardUseCase = new DeleteFSRSCardUseCase(unifiedStorageManager, {
      siyuanApi: cardDeletionSiyuanApi,
    });
    
    // ✅ 创建 CardApplicationService（使用 UnifiedStorageManager）
    const cardApplicationService = new CardApplicationService(
      createCardUseCase,
      deleteCardUseCase,
      deleteCardsUseCase,  // ✅ 添加批量删除用例
      updateCardUseCase,
      cardReadModel,  // ✅ 传入 Read Model 接口
      cardScheduleService,
      unifiedStorageManager,  // ✅ 传递 UnifiedStorageManager 用于 FSRS 卡片操作
      deleteFSRSCardUseCase
    );
    
    // 4. 初始化 ReviewLogService / RescheduleService（使用新架构）
    // static create() 阶段还没有 context 实例，先创建调度写入所需的日志服务，
    // context 创建后再注册回服务容器，避免启动期走不存在的实例 getter。
    const reviewLogService = new ReviewLogService(fileService, sqlPersistence?.reviewLogs ?? null);
    const schedulerCardUpdater = new UnifiedStorageCardUpdateAdapter(
      unifiedStorageManager,
      reviewLogService,
      sqlPersistence?.unified ?? null
    );
    const schedulerErrorNotifier = new SiyuanErrorNotificationAdapter();
    const rescheduleService = new RescheduleService(
      unifiedStorageManager,
      schedulerCardUpdater,
      schedulerErrorNotifier
    );
    
    // 5. 初始化调度器路由（使用新架构）
    const schedulerRouter = new SchedulerRouter(
      {
        defaultScheduler: settings.scheduler?.defaultScheduler || 'fsrs-v6',
        fsrsParams: settings.fsrs,
      },
      schedulerCardUpdater
    );
    const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();

    let contextRef: ApplicationContext | null = null;
    const backendRuntimeBundle = await createApplicationBackendRuntimeBundle({
      config,
      fileService,
      unifiedDataSourceManager,
      executeAutoCard: async (request) => {
        if (!contextRef) {
          throw new Error('SrsBackendWorker autocard.execute unavailable: application context is not ready');
        }
        const autoCardHandler = contextRef.getAutoCardBackendExecutionHandler();
        if (!autoCardHandler) {
          throw new Error('SrsBackendWorker autocard.execute unavailable: auto-card handler is not active');
        }
        return contextRef.runAutoCardBackendExecution(() => autoCardHandler.executeEnvelopeFromBackend(request));
      },
      executeAutoCardBatch: async (request) => {
        if (!contextRef) {
          throw new Error('SrsBackendWorker autocard.executeBatch unavailable: application context is not ready');
        }
        const autoCardHandler = contextRef.getAutoCardBackendExecutionHandler();
        if (!autoCardHandler) {
          throw new Error('SrsBackendWorker autocard.executeBatch unavailable: auto-card handler is not active');
        }
        return contextRef.runAutoCardBackendExecution(() => autoCardHandler.executeBatchFromBackend(request));
      },
      executeProgressiveCommand: async (request) => {
        if (!contextRef) {
          throw new Error('SrsBackendWorker progressive.command.execute unavailable: application context is not ready');
        }
        return contextRef.getProgressiveReadingService().executeFromBackend(request);
      },
      executeTopicDerivedCommand: async (request) => {
        if (!contextRef) {
          throw new Error('SrsBackendWorker topic-derived.command.execute unavailable: application context is not ready');
        }
        return contextRef.getTopicDerivedItemService().executeFromBackend(request);
      },
      executeReviewRiffFeedback: async (request) => {
        if (!contextRef) {
          throw new Error('SrsBackendWorker review.riffFeedback.execute unavailable: application context is not ready');
        }
        const siyuanApi = contextRef.getReviewService().getSiyuanApi();
        if (request.action === 'skip') {
          await siyuanApi.skipReviewRiffCard(request.deckId, request.riffCardId);
        } else {
          await siyuanApi.reviewRiffCard(request.deckId, request.riffCardId, request.rating as 1 | 2 | 3 | 4);
        }
        return {
          status: 'completed',
          commandId: request.commandId,
          idempotencyKey: request.idempotencyKey,
          action: request.action,
          updated: request.action === 'rate' ? 1 : 0,
          skipped: request.action === 'skip' ? 1 : 0,
          queueImpact: {
            refreshRequired: true,
            projectionChanged: true,
            removedFromQueue: request.action === 'rate' && Number(request.rating) >= 4,
          },
          diagnostics: {
            diagnosticEventId: `review-riff-feedback:${request.commandId}:${Date.now()}`,
            family: 'review.riff-feedback' as const,
            commandId: request.commandId,
            errorCategory: null,
          },
        };
      },
      executeWriterRelayCommand,
      executeAgentTool: async (request) => {
        if (!contextRef) {
          return buildAgentValidationErrorResult('agent.tool.execute unavailable: application context is not ready');
        }
        const tool = request.tool;
        if (!isAgentToolName(tool)) {
          return buildAgentValidationErrorResult('agent.tool.execute requires supported SiYuanMemo tool');
        }
        const args = request.args && typeof request.args === 'object'
          ? request.args as Record<string, unknown>
          : {};
        const source = request.source === 'frontend' || request.source === 'writer-relay' || request.source === 'test'
          ? request.source
          : 'mcp';
        return contextRef.getAgentToolService().execute({
          tool: tool as AgentToolName,
          args,
          source,
        });
      },
      notifyKernelTransactionIngested: () => contextRef?.kernelTransactionActionPump?.notifyActivity('relay-ingest'),
      kernelSidecarClient: new KernelSidecarClient(new SiyuanKernelCompanionAdapter()),
      createBlockExistenceSiyuanPort: () => new QuerySiyuanAdapter(),
      createNeuralRoamGraphQuery: (deps) => new SiyuanNeuralRoamGraphQueryAdapter(deps),
      resolveKernelWriterLeaseInstanceId: () => ApplicationContext.resolveKernelWriterLeaseInstanceId(),
      resolveKernelWriterLeaseTtlMs: () => ApplicationContext.resolveKernelWriterLeaseTtlMs(),
    });
    const {
      srsBackendClient,
      srsBackendTransport,
      frontendInstanceRuntime,
      followerCommandClient,
      kernelSidecarClient,
      backendMigrationRuntimePolicy,
      backendStartupError,
    } = backendRuntimeBundle;

    // 创建 CardCreationHelper
    const cardCreationHelper = new CardCreationHelper(cardApplicationService);
    logger.info('[ApplicationContext] ✅ CardCreationHelper initialized');
    
    // 7. 初始化统一数据源管理器
    unifiedDataSourceManager.setLeechActionEffects(new SiyuanLeechActionEffectsAdapter());
    
    // 8. 初始化队列上下文（空的，稍后注册队列）
    // 10. 加载内置模板（硬编码，不需要持久化）
    // ✅ DDD 架构优化：模板作为代码的一部分，不需要持久化到文件
    const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
    logger.info('[ApplicationContext] ✅ Loaded', BUILTIN_TEMPLATES.length, 'builtin templates from code');
    
    // 11. 初始化 BlockMenuHandler
    const blockMenuHandler = new BlockMenuHandler({
      app: config.plugin.app,
      i18n: config.i18n,
      dialogManager: undefined as unknown as DialogManager, // 将在 ApplicationContext 创建后设置
      cardCreationHelper: cardCreationHelper,  // ✅ 注入 CardCreationHelper
      siyuanApi: new ManagerSiyuanAdapter(),
      hostBlockQuery: new HostBlockQuerySiyuanAdapter(),
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
      applicationContext: undefined as unknown as ApplicationContext, // 🆕 将在 ApplicationContext 创建后设置
    });
    
    logger.info('[ApplicationContext] ✅ BlockMenuHandler initialized');
    
    // 11. 初始化 HybridSyncService（如果配置启用）
    let hybridSyncService: XiuyuanSyncService | undefined;
    let fullSyncTimer: NodeJS.Timeout | undefined;
    let riffConfig = settings.riffIntegration;
    // HybridSyncService 将在 context 创建后初始化（需要 CardApplicationService 和 EventBus）
    
    // 12. 创建应用上下文（不需要队列实例，队列通过 UnifiedDataSourceManager 延迟获取）
    const context = new ApplicationContext(config, {
      storageManager,
      unifiedStorageManager,  // 🆕 传入统一存储管理器
      schedulerRouter,
      rescheduleService,
      unifiedDataSourceManager,
      blockMenuHandler,
      sharedEventBus,  // ✅ 传入 sharedEventBus
      sqlPersistence,
      hybridSyncService: undefined,  // 将在下面初始化
      transactionWebSocketService: undefined,  // 将在下面初始化
      fullSyncTimer: undefined,  // 将在下面初始化
      srsBackendClient,
      srsBackendTransport,
      frontendInstanceRuntime,
      followerCommandClient,
      kernelSidecarClient,
      backendMigrationRuntimePolicy,
      backendStartupError,
    });
    
    // 设置 context 引用（用于 blockMenuHandler 的闭包）
    context.serviceContainer.set('fileService', fileService);
    context.serviceContainer.set('reviewLogService', reviewLogService);
    context.serviceContainer.set('cardTypeDetectionService', cardTypeDetectionServiceTemp);
    contextRef = context;
    
    // ✅ 存储 deletionTracker 到 context（供 cardService 工厂复用）
    context.deletionTracker = deletionTracker;
    logger.info('[ApplicationContext] Stored deletionTracker to context');
    
    // 13. 设置 ApplicationContext 和 DialogManager 引用（解决循环依赖）
    blockMenuHandler.setApplicationContext(context);
    const blockMenuHandlerDeps = blockMenuHandler as unknown as { deps: { dialogManager: DialogManager } };
    blockMenuHandlerDeps.deps.dialogManager = context.getDialogManager();
    
    // 13.5. 初始化 UnifiedDataSourceManager 的延迟依赖
    const settingsService = context.getSettingsService();
    settingsServiceRef = settingsService;
    // 🔧 修复：初始化 SettingsService（加载配置文件）
    await measureRuntimePerformance('startup', 'settings-service.init', () => settingsService.init());
    logger.info('[ApplicationContext] ✅ SettingsService initialized');

    const initializedRiffConfig = settingsService.getSettings().riffIntegration;
    riffConfig = initializedRiffConfig;
    const startupConflictStrategy = initializedRiffConfig?.storageConflictResolution || 'merge';
    unifiedStorageManager.setConflictResolutionStrategy(startupConflictStrategy);
    logger.info('[ApplicationContext] UnifiedStorage conflict strategy set:', startupConflictStrategy);
    
    const advancedRouter = new AdvancedDataRouter(
      cardApplicationService, 
      unifiedStorageManager as unknown as StorageManager,  // ✅ 使用 UnifiedStorageManager
      config.plugin, 
      settingsService,
      new QuerySiyuanAdapter(),
      new HostBlockQuerySiyuanAdapter(),
    );
    // ✅ 设置 ApplicationContext 引用，使 advancedRouter 可以访问 CardContentQueryService
    advancedRouter.setApplicationContext(context);
    unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
    
    const queuePersistenceService = context.getQueuePersistenceService();
    // 🔧 修复：初始化 QueuePersistenceService
    await measureRuntimePerformance(
      'startup',
      'queue-persistence-service.init',
      () => queuePersistenceService.init(),
    );
    logger.info('[ApplicationContext] ✅ QueuePersistenceService initialized');

    context.getDocTreeReviewScopeService();
    logger.info('[ApplicationContext] ✅ DocTreeReviewScopeService initialized lazily');

    context.getReviewScopeCardCreationSyncService();
    logger.info('[ApplicationContext] ✅ ReviewScopeCardCreationSyncService initialized');
    
    unifiedDataSourceManager.setQueuePersistence(queuePersistenceService);
    if (sqlPersistence?.neuralRoamRoutes) {
      unifiedDataSourceManager.setNeuralRoamRouteCatalog(new NeuralRoamRouteCatalog({
        repository: sqlPersistence.neuralRoamRoutes,
      }));
    }
    logger.info('[ApplicationContext] ✅ UnifiedDataSourceManager initialized with Advanced mode and QueuePersistence');
    
    // 14. 初始化 HybridSyncService（需要 CardApplicationService、EventBus 和 XiuyuanRepository）
    logger.info('[ApplicationContext] Checking riffConfig:', { hasRiffConfig: !!riffConfig });
    if (riffConfig) {
      logger.info('[ApplicationContext] Initializing HybridSyncService...');
      hybridSyncService = context.autoCardKernelXiuyuanServiceBundle.createXiuyuanSyncService(riffConfig);
      
      // 将 HybridSyncService 设置到 context（使用类型断言）
      context.hybridSyncService = hybridSyncService;
      
      logger.info('[ApplicationContext] ✅ HybridSyncService initialized with XiuyuanRepository');
      
      const nativeRiffDeleteSyncEnabled = ApplicationContext.shouldEnableNativeRiffDeleteCompatibilitySync({
        riffIntegration: riffConfig,
        hybridSyncAvailable: Boolean(hybridSyncService),
      });
      if (nativeRiffDeleteSyncEnabled) {
        // 使用 sharedEventBus 而不是 context.getEventBus()，确保与 DeleteCardUseCase 使用同一个 EventBus
        logger.info('[ApplicationContext] Importing RiffSyncEventHandler...');
        const { RiffSyncEventHandler } = await import('@/infrastructure/events/RiffSyncEventHandler');
        logger.info('[ApplicationContext] Creating RiffSyncEventHandler...');
        new RiffSyncEventHandler(sharedEventBus, hybridSyncService);
        logger.info('[ApplicationContext] ✅ RiffSyncEventHandler registered');
        logger.info('[ApplicationContext] EventBus subscriber count for CardDeleted:', sharedEventBus.getSubscriberCount('CardDeleted'));
      } else {
        logger.info('[ApplicationContext] RiffSyncEventHandler skipped because native Riff delete compatibility is disabled');
      }
      
      // 启动同步服务
      await measureRuntimePerformance('startup', 'hybrid-sync-service.start', () => hybridSyncService!.start(), {
        fullSyncEnabled: riffConfig.fullSync.enabled,
        incrementalSyncEnabled: riffConfig.incrementalSync.enabled,
      });
      
      // 启动全量同步定时器
      if (riffConfig.fullSync.enabled) {
        fullSyncTimer = setInterval(
          () => hybridSyncService!.fullSync(),
          riffConfig.fullSync.interval
        );
        context.fullSyncTimer = fullSyncTimer;
        logger.info(`[ApplicationContext] Full sync timer started (interval: ${riffConfig.fullSync.interval}ms)`);
      }
      
    }

    await measureRuntimePerformance(
      'startup',
      'transaction-websocket-service.update',
      () => context.updateTransactionWebSocketService(),
    );
    
    logger.info('[ApplicationContext] ✅ ApplicationContext created successfully');
    context.scheduleProgressiveExcerptCompletionStartupRepair();
    
    return context;
  }

  private scheduleProgressiveExcerptCompletionStartupRepair(delayMs = 1500): void {
    if (this.progressiveExcerptCompletionRepairTimer) {
      clearTimeout(this.progressiveExcerptCompletionRepairTimer);
    }
    this.progressiveExcerptCompletionRepairTimer = setTimeout(() => {
      this.progressiveExcerptCompletionRepairTimer = undefined;
      void this.runProgressiveExcerptCompletionStartupRepair();
    }, delayMs);
  }

  private async runProgressiveExcerptCompletionStartupRepair(): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      const results = await this.getProgressiveExcerptCompletionService().repairBatch({ limit: 20 });
      if (results.length === 0) {
        return;
      }
      const completed = results.filter((result) => result.status === 'completed').length;
      const failed = results.filter((result) => result.status === 'failed').length;
      logger.info('[ApplicationContext] Progressive excerpt completion startup repair finished', {
        total: results.length,
        completed,
        failed,
      });
    } catch (error) {
      logger.warn('[ApplicationContext] Progressive excerpt completion startup repair failed:', error);
    }
  }

  private static resolveKernelWriterLeaseInstanceId(): string | undefined {
    const raw = ApplicationContext.readEnvValue(ApplicationContext.KERNEL_WRITER_LEASE_INSTANCE_ID_ENV_KEY, false);
    const value = String(raw || '').trim();
    return value || undefined;
  }

  private static resolveKernelWriterLeaseTtlMs(): number | undefined {
    const raw = ApplicationContext.readEnvValue(ApplicationContext.KERNEL_WRITER_LEASE_TTL_MS_ENV_KEY, false);
    if (!raw) {
      return undefined;
    }
    const ttlMs = Number(raw);
    if (!Number.isFinite(ttlMs)) {
      return undefined;
    }
    return Math.max(3_000, Math.floor(ttlMs));
  }

  private static shouldEnableKernelTransactionIngestListener(input: {
    kernelTransactionIngestAvailable: boolean;
    quickCardEnabled: boolean;
    nativeRiffSyncEnabled: boolean;
  }): boolean {
    return input.kernelTransactionIngestAvailable
      && (input.quickCardEnabled || input.nativeRiffSyncEnabled);
  }

  private static shouldEnableNativeRiffCompatibilitySync(input: {
    riffIntegration?: RiffIntegrationConfig;
    hybridSyncAvailable: boolean;
  }): boolean {
    return input.hybridSyncAvailable
      && input.riffIntegration?.incrementalSync?.enabled === true;
  }

  private static shouldEnableNativeRiffDeleteCompatibilitySync(input: {
    riffIntegration?: RiffIntegrationConfig;
    hybridSyncAvailable: boolean;
  }): boolean {
    return input.hybridSyncAvailable
      && input.riffIntegration?.deleteSync?.enabled === true;
  }

  private static resolveKernelTransactionIngestActionTypes(input: {
    quickCardEnabled: boolean;
    nativeRiffSyncEnabled: boolean;
  }): BackendKernelTransactionActionType[] {
    const actionTypes: BackendKernelTransactionActionType[] = [];
    if (input.nativeRiffSyncEnabled) {
      actionTypes.push('native-riff-remove', 'native-riff-upsert');
    }
    if (input.quickCardEnabled) {
      actionTypes.push('auto-card-candidates');
    }
    return actionTypes;
  }

  private static resolveNativeRiffCompatibilitySyncOwner(input: {
    nativeRiffSyncEnabled: boolean;
    kernelTransactionIngestEnabled: boolean;
  }): 'disabled' | 'kernel-transaction-action-pump' | 'unavailable' {
    if (!input.nativeRiffSyncEnabled) {
      return 'disabled';
    }
    return input.kernelTransactionIngestEnabled
      ? 'kernel-transaction-action-pump'
      : 'unavailable';
  }

  private static readEnvValue(key: string, lowercase = true): string {
    const viteEnv = typeof import.meta !== 'undefined'
      && import.meta.env
      ? import.meta.env[key]
      : undefined;
    const processEnv = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
    const raw = String(viteEnv ?? processEnv ?? '').trim();
    return lowercase ? raw.toLowerCase() : raw;
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
    return this.unifiedStorageManager as unknown as StorageManager;
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
   * 获取难点攻坚队列
   * 
   * @returns IReviewQueue - 难点攻坚队列实例（通过 UnifiedDataSourceManager）
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
   * 获取 Xiuyuan 应用服务（DDD 架构）
   * 
   * @returns XiuyuanApplicationService - Xiuyuan 应用服务实例
   */
  async getXiuyuanApplicationService(): Promise<XiuyuanApplicationService> {
    if (!this.xiuyuanApplicationService) {
      this.xiuyuanApplicationService = await this.autoCardKernelXiuyuanServiceBundle.createXiuyuanApplicationService();
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
  getHybridSyncService(): XiuyuanSyncService | undefined {
    return this.hybridSyncService;
  }
  
  /**
   * 更新混合同步服务配置并重启定时器
   * 
   * 符合 DDD 架构原则:
   * - 封装定时器管理逻辑
   * - 提供清晰的配置更新接口
   * - 避免外部直接访问内部状态
   * 
   * @param config - 新的同步配置
   */
  async updateHybridSyncConfig(config: Partial<HybridSyncConfig>): Promise<void> {
    if (!this.hybridSyncService) {
      logger.warn('[ApplicationContext] HybridSyncService not initialized');
      return;
    }
    
    // 清理旧定时器
    if (this.fullSyncTimer) {
      clearInterval(this.fullSyncTimer);
      this.fullSyncTimer = undefined;
    }
    
    // 更新配置
    this.hybridSyncService.updateConfig(config);
    
    // 重启服务
    this.hybridSyncService.stop();
    await this.hybridSyncService.start();
    
    // 重启定时器
    if (config.fullSync?.enabled) {
      this.fullSyncTimer = setInterval(
        () => this.hybridSyncService!.fullSync(),
        config.fullSync.interval
      );
      logger.info(`[ApplicationContext] Full sync timer restarted (interval: ${config.fullSync.interval}ms)`);
    }
    
    logger.info('[ApplicationContext] ✅ HybridSyncService config updated');
  }
  
  /**
   * 更新 TransactionWebSocketService 状态
   * 
   * 符合 DDD 架构原则:
   * - 封装 WebSocket 服务管理逻辑
   * - 提供清晰的启用/禁用接口
   * 
   * 根据当前设置刷新监听制卡事务服务
   */
  async updateTransactionWebSocketService(): Promise<void> {
    const finishUpdateSpan = startRuntimePerformanceSpan('startup', 'transaction-websocket-service.configure');
    const settings = this.getSettingsService().getSettings();
    const quickCardEnabled = settings.quickCard?.enabled === true;
    const nativeRiffSyncEnabled = ApplicationContext.shouldEnableNativeRiffCompatibilitySync({
      riffIntegration: settings.riffIntegration,
      hybridSyncAvailable: Boolean(this.hybridSyncService),
    });
    const reviewSourceBlockRefreshEnabled = settings.ui?.reviewSourceBlockRefreshEnabled === true;
    const runtimePolicy = this.getBackendMigrationRuntimePolicy();
    const kernelTransactionIngestAvailable = runtimePolicy.capabilities.kernelTransactionIngestEnabled
      && Boolean(this.srsBackendClient)
      && Boolean(this.frontendInstanceRuntime);
    const kernelTransactionIngestEnabled = ApplicationContext.shouldEnableKernelTransactionIngestListener({
      kernelTransactionIngestAvailable,
      quickCardEnabled,
      nativeRiffSyncEnabled,
    });
    const kernelTransactionIngestActionTypes = ApplicationContext.resolveKernelTransactionIngestActionTypes({
      quickCardEnabled,
      nativeRiffSyncEnabled,
    });
    const nativeRiffSyncOwner = ApplicationContext.resolveNativeRiffCompatibilitySyncOwner({
      nativeRiffSyncEnabled,
      kernelTransactionIngestEnabled,
    });
    const shouldEnable = quickCardEnabled
      || nativeRiffSyncOwner !== 'disabled'
      || reviewSourceBlockRefreshEnabled
      || kernelTransactionIngestEnabled;
    incrementRuntimePerformanceCounter('daily-editing', 'transaction-listener-configured', shouldEnable ? 1 : 0);

    if (!shouldEnable) {
      if (this.transactionWebSocketService) {
        logger.info('[ApplicationContext] Stopping TransactionWebSocketService...');
        measureRuntimePerformance('startup', 'transaction-websocket-service.stop', () => this.transactionWebSocketService?.stop());
        this.autoCardHandler = undefined;
        this.kernelTransactionIngestHandler?.dispose();
        this.kernelTransactionIngestHandler = undefined;
        void this.kernelTransactionActionPump?.dispose();
        this.kernelTransactionActionPump = undefined;
        this.transactionWebSocketService = undefined;
        logger.info('[ApplicationContext] ✅ TransactionWebSocketService stopped');
      }
      finishUpdateSpan({
        kernelTransactionIngestEnabled,
        nativeRiffSyncEnabled,
        quickCardEnabled,
        reviewSourceBlockRefreshEnabled,
        shouldEnable,
      });
      return;
    }

    if (this.transactionWebSocketService) {
      measureRuntimePerformance('startup', 'transaction-websocket-service.restart-stop', () => this.transactionWebSocketService?.stop());
      this.autoCardHandler = undefined;
      this.kernelTransactionIngestHandler?.dispose();
      this.kernelTransactionIngestHandler = undefined;
      void this.kernelTransactionActionPump?.dispose();
      this.kernelTransactionActionPump = undefined;
      this.transactionWebSocketService = undefined;
    }

    logger.info('[ApplicationContext] Initializing TransactionWebSocketService...', {
      quickCardEnabled,
      nativeRiffSyncEnabled,
      reviewSourceBlockRefreshEnabled,
      kernelTransactionIngestEnabled,
    });

    const { TransactionWebSocketService } = await import('@/core/infrastructure/websocket/TransactionWebSocketService');
    const transactionWebSocketService = new TransactionWebSocketService(
      this.config.plugin as unknown as SiyuanMemoPlugin,
      { provenanceRegistry: this.transactionProvenanceRegistry },
    );
    if (quickCardEnabled || nativeRiffSyncEnabled || kernelTransactionIngestEnabled) {
      await measureRuntimePerformance(
        'startup',
        'transaction-websocket-service.scope-hydrate',
        () => this.getDocTreeReviewScopeService().hydrate(),
        { shouldEnable },
      );
      transactionWebSocketService.registerHandler(this.getDocTreeReviewScopeService());
    } else {
      logger.info('[ApplicationContext] DocTreeReviewScopeService transaction consumer skipped for review-source-only ws-main listener');
    }

    if (quickCardEnabled) {
      const autoCardHandler = await measureRuntimePerformance(
        'startup',
        'transaction-websocket-service.create-autocard-handler',
        () => this.createAutoCardHandler(),
        { kernelTransactionIngestEnabled },
      );
      this.autoCardHandler = autoCardHandler;
      if (kernelTransactionIngestEnabled) {
        logger.info('[ApplicationContext] AutoCardHandler wired to kernel transaction action pump (ws-main direct registration skipped)');
      } else {
        transactionWebSocketService.registerHandler(autoCardHandler);
        logger.info('[ApplicationContext] ✅ AutoCardHandler registered');
      }
    }

    if (nativeRiffSyncOwner === 'unavailable') {
      logger.error('[ApplicationContext] Native Riff compatibility sync unavailable: kernel transaction ingest action pump is required', {
        backendWorker: runtimePolicy.flags.backendWorker,
        writerLeaseGuard: runtimePolicy.flags.writerLeaseGuard,
        kernelTransactionIngest: runtimePolicy.flags.kernelTransactionIngest,
      });
    } else if (nativeRiffSyncOwner === 'kernel-transaction-action-pump') {
      logger.info('[ApplicationContext] Native Riff compatibility sync owned by kernel transaction action pump');
    }

    if (kernelTransactionIngestEnabled && this.srsBackendClient) {
      const { KernelTransactionIngestHandler } = await import('@/application/handlers/KernelTransactionIngestHandler');
      const { KernelTransactionActionPump } = await import('@/application/handlers/KernelTransactionActionPump');
      const kernelTransactionIngestHandler = new KernelTransactionIngestHandler(
        this.srsBackendClient,
        this.frontendInstanceRuntime,
        this.followerCommandClient,
        {
          writerRelayRequired: runtimePolicy.capabilities.writerRelayRequiredForBackendWrites,
          enabledActionTypes: kernelTransactionIngestActionTypes,
          onIngested: () => this.kernelTransactionActionPump?.notifyActivity('ws-ingest'),
          provenanceRegistry: this.transactionProvenanceRegistry,
        },
      );
      transactionWebSocketService.registerHandler(kernelTransactionIngestHandler);
      this.kernelTransactionIngestHandler = kernelTransactionIngestHandler;
      const kernelTransactionActionPump = measureRuntimePerformance(
        'startup',
        'transaction-websocket-service.create-kernel-action-pump',
        () => new KernelTransactionActionPump(
          this.srsBackendClient,
          this.frontendInstanceRuntime,
          this.followerCommandClient,
          () => this.hybridSyncService,
          () => this.autoCardHandler,
          {
            writerRelayRequired: runtimePolicy.capabilities.writerRelayRequiredForBackendWrites,
            onWriterUnavailable: dispatchKernelTransactionWriterUnavailableEvent,
            deferNativeRiffUpsertWhile: () => this.isAutoCardBackendExecutionInProgress(),
            backgroundWorkRegistry: this.srsBackendClient.getBackgroundWorkRegistry(),
          },
        ),
        { writerRelayRequired: runtimePolicy.capabilities.writerRelayRequiredForBackendWrites },
      );
      measureRuntimePerformance('startup', 'kernel-transaction-action-pump.start', () => kernelTransactionActionPump.start());
      this.kernelTransactionActionPump = kernelTransactionActionPump;
      logger.info('[ApplicationContext] ✅ KernelTransactionIngestHandler registered');
    }

    measureRuntimePerformance('startup', 'transaction-websocket-service.start', () => transactionWebSocketService.start(), {
      kernelTransactionIngestEnabled,
      nativeRiffSyncEnabled,
      quickCardEnabled,
      reviewSourceBlockRefreshEnabled,
    });
    this.transactionWebSocketService = transactionWebSocketService;
    logger.info('[ApplicationContext] ✅ TransactionWebSocketService started');
    finishUpdateSpan({
      kernelTransactionIngestEnabled,
      nativeRiffSyncEnabled,
      quickCardEnabled,
      reviewSourceBlockRefreshEnabled,
      shouldEnable,
    });
  }
  
  /**
   * 获取事务 WebSocket 服务
   * 
   * @returns TransactionWebSocketService | undefined - 事务 WebSocket 服务实例
   */
  getTransactionWebSocketService(): TransactionWebSocketService | undefined {
    return this.transactionWebSocketService;
  }

  getAutoCardHandler(): AutoCardHandler | undefined {
    return this.autoCardHandler;
  }

  async runWithAutoCardBackendExecutionHandler<T>(
    handler: AutoCardHandler,
    task: () => Promise<T>,
  ): Promise<T> {
    this.ensureNotDisposed();
    const scope = { handler };
    this.autoCardBackendExecutionHandlerScopes.push(scope);
    try {
      return await task();
    } finally {
      const index = this.autoCardBackendExecutionHandlerScopes.lastIndexOf(scope);
      if (index >= 0) {
        this.autoCardBackendExecutionHandlerScopes.splice(index, 1);
      }
    }
  }

  private getAutoCardBackendExecutionHandler(): AutoCardHandler | undefined {
    const scopes = this.autoCardBackendExecutionHandlerScopes;
    return scopes.length > 0
      ? scopes[scopes.length - 1].handler
      : this.autoCardHandler;
  }

  private async runAutoCardBackendExecution<T>(task: () => Promise<T>): Promise<T> {
    this.autoCardBackendExecutionDepth += 1;
    try {
      return await task();
    } finally {
      this.autoCardBackendExecutionDepth = Math.max(0, this.autoCardBackendExecutionDepth - 1);
    }
  }

  private isAutoCardBackendExecutionInProgress(): boolean {
    return this.autoCardBackendExecutionDepth > 0
      || this.autoCardBackendExecutionHandlerScopes.length > 0;
  }

  async createAutoCardHandler(): Promise<AutoCardHandler> {
    this.ensureNotDisposed();
    return this.autoCardKernelXiuyuanServiceBundle.createAutoCardHandler();
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
   * @returns I18nDictionary - 国际化资源
   */
  getI18n(): I18nDictionary {
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
  getCardService(): CardApplicationService {
    return this.getService('cardService');
  }

  getSrsCardSemanticsRepairService(): SrsCardSemanticsRepairService {
    return this.getService('srsCardSemanticsRepairService');
  }
  
  /**
   * 获取浏览器应用服务
   * 
   * @returns BrowserApplicationService - 浏览器应用服务实例
   */
  getBrowserService(): BrowserApplicationService {
    return this.getService('browserService');
  }
  
  /**
   * 获取复习应用服务
   * 
   * @returns ReviewApplicationService - 复习应用服务实例
   */
  getReviewService(): ReviewApplicationService {
    return this.getService('reviewService');
  }

  getAgentToolService(): AgentToolService {
    return this.getService('agentToolService');
  }

  getNeuralRoamEntryActionService(): NeuralRoamEntryActionService {
    return this.getService('neuralRoamEntryActionService');
  }

  getSrsBackendClient(): SrsBackendClient | null {
    return this.srsBackendClient;
  }

  async mergeSyncConflictDatabasesNow(mergedAt = Date.now()): Promise<BackendSyncConflictMergeResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: sync conflict merge requires SRS backend');
    }
    const service = new SyncConflictMergeApplicationService(this.getFileService(), backendClient);
    return service.mergeNow({ mergedAt });
  }

  async auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: review sync divergence audit requires SRS backend');
    }
    const service = new ReviewSyncDivergenceAuditApplicationService(backendClient, logger);
    return service.runAudit(request);
  }

  async readDomainSyncDiagnostics(request: BackendDomainSyncStatusRequest = {}): Promise<BackendDomainSyncStatusResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: domain sync diagnostics requires SRS backend');
    }
    const service = new DomainSyncDiagnosticsApplicationService(
      backendClient,
      logger,
      this.frontendInstanceRuntime,
      this.followerCommandClient,
    );
    return service.readStatus(request);
  }

  async previewDomainSyncRepair(
    request: BackendDomainSyncRepairPreviewRequest = {},
  ): Promise<BackendDomainSyncRepairPreviewResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: domain sync repair preview requires SRS backend');
    }
    const service = new DomainSyncDiagnosticsApplicationService(
      backendClient,
      logger,
      this.frontendInstanceRuntime,
      this.followerCommandClient,
    );
    return service.previewRepair(request);
  }

  async applyDomainSyncRepair(
    request: BackendDomainSyncRepairApplyRequest,
  ): Promise<BackendDomainSyncRepairApplyResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: domain sync repair apply requires SRS backend');
    }
    const service = new DomainSyncDiagnosticsApplicationService(
      backendClient,
      logger,
      this.frontendInstanceRuntime,
      this.followerCommandClient,
    );
    return service.applyRepair(request);
  }

  async cleanupDomainSyncConflictSources(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: domain sync conflict source cleanup requires SRS backend');
    }
    const service = new DomainSyncDiagnosticsApplicationService(
      backendClient,
      logger,
      this.frontendInstanceRuntime,
      this.followerCommandClient,
    );
    return service.cleanupConflictSources(request);
  }

  async listDomainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: domain sync conflict source cleanup candidates require SRS backend');
    }
    const service = new DomainSyncDiagnosticsApplicationService(
      backendClient,
      logger,
      this.frontendInstanceRuntime,
      this.followerCommandClient,
    );
    return service.listCleanupCandidates();
  }

  async previewManualSyncBackupRetention(): Promise<ManualSyncBackupRetentionPreviewResult> {
    const service = new ManualSyncBackupRetentionApplicationService(
      this.getFileService().createManualSyncBackupInventory(),
    );
    return service.preview();
  }

  async applyManualSyncBackupRetention(): Promise<ManualSyncBackupRetentionApplyResult> {
    const service = new ManualSyncBackupRetentionApplicationService(
      this.getFileService().createManualSyncBackupInventory(),
    );
    return service.apply();
  }

  async previewSyncConflictDirectionResolution(): Promise<SyncConflictDirectionPreview> {
    return this.createSyncConflictDirectionResolutionService().preview();
  }

  async applySyncConflictDirectionResolution(
    choice: SyncConflictDirectionChoice,
  ): Promise<SyncConflictDirectionApplyResult> {
    return this.createSyncConflictDirectionResolutionService().apply(choice);
  }

  private createSyncConflictDirectionResolutionService(): SyncConflictDirectionResolutionService {
    const backendClient = this.getSrsBackendClient();
    if (!backendClient) {
      throw new Error('BACKEND_UNAVAILABLE: sync conflict direction resolution requires SRS backend');
    }
    return new SyncConflictDirectionResolutionService(this.getFileService(), backendClient);
  }

  getFrontendInstanceRuntime(): FrontendInstanceRuntime | null {
    return this.frontendInstanceRuntime;
  }

  getFollowerCommandClient(): FollowerCommandClient | null {
    return this.followerCommandClient;
  }

  getKernelSidecarClient(): KernelSidecarClient {
    return this.kernelSidecarClient;
  }

  getBackendMigrationRuntimePolicy(): BackendMigrationRuntimePolicy {
    return this.backendMigrationRuntimePolicy;
  }

  getBackendStartupError(): string | null {
    return this.backendStartupError;
  }

  private createReviewCommitWriterLeaseGuard(): ReviewCommitWriterLeaseGuard {
    return {
      ensureWritable: async () => {
        const runtime = this.getFrontendInstanceRuntime();
        if (!runtime) {
          throw new Error('BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime');
        }
        await runtime.ensureWritable();
      },
      getMode: () => this.getFrontendInstanceRuntime()?.getMode(),
      getInstanceId: () => this.getFrontendInstanceRuntime()?.getInstanceId(),
    };
  }

  private createReviewCommitFollowerCommandClient(): ReviewCommitFollowerCommandClient {
    return {
      submitAndWait: async <TResult,>(request: {
        instanceId: string;
        method: string;
        params?: unknown;
      }, timeoutMs?: number): Promise<TResult> => {
        const client = this.getFollowerCommandClient();
        if (!client) {
          throw new Error('BACKEND_UNAVAILABLE: review.feedback relay is unavailable in follower mode');
        }
        return client.submitAndWait<TResult>(request, timeoutMs);
      },
    };
  }

  getBackendMigrationOwnershipMap(): MigratedStateFamily[] {
    return listMigratedStateFamilies();
  }

  getBackendMigrationFeatureGates(): typeof BACKEND_MIGRATION_FEATURE_GATES {
    return BACKEND_MIGRATION_FEATURE_GATES;
  }

  getCardEditorService(): CardEditorApplicationService {
    return this.getService('cardEditorService');
  }

  getSrsTransparencyService(): SrsTransparencyApplicationService {
    return this.getService('srsTransparencyService');
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
  getDialogManager(): DialogManager {
    return this.getService('dialogManager');
  }
  
  /**
   * 获取菜单管理器
   * 
   * @returns MenuManager - 菜单管理器实例
   */
  getMenuManager(): MenuManager {
    return this.getService('menuManager');
  }
  
  /**
   * 获取 Tab 管理器
   * 
   * @returns TabManager - Tab 管理器实例
   */
  getTabManager(): TabManager {
    return this.getService('tabManager');
  }
  
  /**
   * 获取 Tab 应用服务
   * 
   * @returns TabApplicationService - Tab 应用服务实例
   */
  getTabApplicationService(): TabApplicationService {
    return this.getService('tabApplicationService');
  }
  
  /**
   * 获取 Dock 管理器
   * 
   * @returns DockManager - Dock 管理器实例
   */
  getDockManager(): DockManager {
    return this.getService('dockManager');
  }
  
  /**
   * 获取练习队列管理器
   * 
   * @returns PracticeQueueManager - 练习队列管理器实例
   */
  getPracticeQueueManager(): PracticeQueueManager {
    return this.getService('practiceQueueManager');
  }
  
  /**
   * 获取事件总线
   * 
   * @returns EventBus - 事件总线实例
   */
  getEventBus(): EventBus {
    return this.getService('eventBus');
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
    return this.getService('fileService');
  }
  
  /**
   * 获取队列持久化服务
   * 
   * @returns QueuePersistenceService - 队列持久化服务实例
   */
  getQueuePersistenceService(): QueuePersistenceService {
    return this.getService('queuePersistenceService');
  }
  
  /**
   * 获取设置服务
   * 
   * @returns SettingsService - 设置服务实例
   */
  getSettingsService(): SettingsService {
    return this.getService('settingsService');
  }

  getSemanticActivationCommandClient(): SemanticActivationCommandClient | null {
    return this.getService('semanticActivationCommandClient');
  }

  getSemanticActivationBrowserReadClient(): SemanticActivationBrowserReadClient | null {
    return this.getService('semanticActivationBrowserReadClient');
  }

  getCardTypeDetectionService(): CardTypeDetectionService {
    return this.getService('cardTypeDetectionService');
  }

  getDocTreeReviewScopeService(): DocTreeReviewScopeService {
    return this.getService('docTreeReviewScopeService');
  }

  getConfiguredCaptureStorageService(): ConfiguredCaptureStorageService {
    return this.getService('configuredCaptureStorageService');
  }

  getKernelCompanionPort(): KernelCompanionPort {
    return this.getService('kernelCompanion');
  }

  getExcerptRecordService(): ExcerptRecordService {
    return this.getService('excerptRecordService');
  }

  getProgressiveExcerptCompletionService(): ProgressiveExcerptCompletionService {
    return this.getService('progressiveExcerptCompletionService');
  }

  getReviewScopeCardCreationSyncService(): ReviewScopeCardCreationSyncService {
    return this.getService('reviewScopeCardCreationSyncService');
  }

  getProgressiveReadingService(): ProgressiveReadingService {
    return this.getService('progressiveReadingService');
  }

  getSelectionExcerptService(): SelectionExcerptService {
    return this.getService('selectionExcerptService');
  }

  getSelectionTopicContinuationService(): SelectionTopicContinuationService {
    return this.getService('selectionTopicContinuationService');
  }

  getTopicDerivedItemService(): TopicDerivedItemService {
    return this.getService('topicDerivedItemService');
  }
  
  /**
   * 获取复习日志服务
   * 
   * @returns ReviewLogService - 复习日志服务实例
   */
  getReviewQueuePreparationService(): ReviewQueuePreparationService {
    return this.getService('reviewQueuePreparationService');
  }

  getReviewAdmissionModule(): ReviewAdmissionModule {
    return this.getService('reviewAdmissionModule');
  }
  
  getReviewLogService(): ReviewLogService {
    return this.getService('reviewLogService');
  }

  getReviewCommitUseCase(): ReviewCommitUseCase {
    return this.getService('reviewCommitUseCase');
  }

  getReviewAttemptKernel(): ReviewAttemptKernel {
    return this.getService('reviewAttemptKernel');
  }
  
  /**
   * 获取 Riff 黑名单服务
   * 
   * @returns RiffBlacklistService - Riff 黑名单服务实例
   */
  getRiffBlacklistService(): RiffBlacklistService {
    return this.getService('riffBlacklistService');
  }
  
  /**
   * 获取卡片内容查询服务
   * 
   * @returns CardContentQueryService - 卡片内容查询服务实例
   */
  getCardContentQueryService(): CardContentQueryService {
    return this.getService('cardContentQueryService');
  }

  getArenaStoreService(): ArenaStoreService {
    return this.getService('arenaStoreService');
  }

  getArenaKernelService(): ArenaKernelService {
    return this.getService('arenaKernelService');
  }

  getSharedReviewSessionRegistry(): SharedReviewSessionRegistry {
    return this.getService('sharedReviewSessionRegistry');
  }

  getPrivateApiService(options: { mutation?: boolean } = {}): PrivateApiService {
    const runtimePolicy = this.getBackendMigrationRuntimePolicy();
    if (!runtimePolicy.capabilities.privateApiReadEnabled) {
      throw new Error('BACKEND_UNAVAILABLE: private API read is disabled by runtime policy');
    }
    if (options.mutation === true && !runtimePolicy.capabilities.privateApiMutationEnabled) {
      throw new Error('BACKEND_UNAVAILABLE: private API mutation requires backend worker + writer relay runtime');
    }
    if (options.mutation === true && !this.getFrontendInstanceRuntime()) {
      throw new Error('BACKEND_UNAVAILABLE: private API mutation requires writer relay runtime instance');
    }
    return this.getService('privateApiService');
  }

  /**
   * 获取卡片存储接口
   * 
   * @returns 卡片存储实例
   */
  getCardStorage(): StorageManager {
    return this.getStorage(); // StorageManager 实现了 ICardStorage 接口
  }

  createReviewRenderServices(options: { i18n?: Record<string, string> } = {}): ReviewRenderServices {
    this.ensureNotDisposed();
    return createInjectedReviewRenderServices({
      quickBlockAdapter: new QuickCardSiyuanBlockAdapter(),
      descriptorBlockAdapter: new DescriptorCardSiyuanBlockAdapter(),
      cardStorage: this.getCardStorage(),
      i18n: options.i18n || this.getI18n(),
    });
  }

  /**
   * 获取调度器路由接口
   * 
   * @returns 调度器路由实例
   */
  getSchedulerRouter(): SchedulerRouter {
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
  async dispose(options?: { persistStorage?: boolean }): Promise<void> {
    const shouldPersistStorage = options?.persistStorage !== false;
    // 幂等性：如果已经销毁，直接返回
    if (this.disposed) {
      return;
    }
    
    const errors: DisposalErrorCollector = [];
    
    try {
      logger.info('[ApplicationContext] Starting disposal...');

      this.logSrsBackendTransportDiagnostics('before-review-truth-flush');
      await this.flushReviewTruthBeforeUnloadIfWritable(errors);

      try {
        this.frontendInstanceRuntime?.prepareForUnload?.();
      } catch (error) {
        logger.warn('[ApplicationContext] FrontendInstanceRuntime unload quiesce failed; continuing disposal', error);
        errors.push({ service: 'frontendInstanceRuntime.prepareForUnload', error });
      }

      if (this.progressiveExcerptCompletionRepairTimer) {
        try {
          clearTimeout(this.progressiveExcerptCompletionRepairTimer);
          this.progressiveExcerptCompletionRepairTimer = undefined;
          logger.info('[ApplicationContext] ✅ Progressive excerpt completion startup repair timer cleared');
        } catch (error) {
          logger.error('[ApplicationContext] Error clearing progressive excerpt completion startup repair timer:', error);
          errors.push({ service: 'progressiveExcerptCompletionRepairTimer', error });
        }
      }
      
      // 0. 立即保存 SettingsService (优先级最高)
      if (this.isServiceCreated('settingsService')) {
        const settingsService = this.getSettingsService();
        const outcome = await this.runBoundedDisposalStep(
          'settingsService',
          () => settingsService.dispose(),
          errors,
        );
        if (outcome.status === 'completed') {
          logger.info('[ApplicationContext] ✅ SettingsService disposed and saved');
        }
      }
      
      // 1. 停止 TransactionWebSocketService
      if (this.transactionWebSocketService) {
        try {
          this.transactionWebSocketService.stop();
          this.autoCardHandler = undefined;
          this.kernelTransactionIngestHandler?.dispose();
          this.kernelTransactionIngestHandler = undefined;
          void this.kernelTransactionActionPump?.dispose();
          this.kernelTransactionActionPump = undefined;
          logger.info('[ApplicationContext] ✅ TransactionWebSocketService stopped');
        } catch (error) {
          logger.error('[ApplicationContext] Error stopping TransactionWebSocketService:', error);
          errors.push({ service: 'transactionWebSocketService', error });
        }
      }
      
      // 2. 清理全量同步定时器
      if (this.fullSyncTimer) {
        try {
          clearInterval(this.fullSyncTimer);
          this.fullSyncTimer = undefined;
          logger.info('[ApplicationContext] ✅ Full sync timer cleared');
        } catch (error) {
          logger.error('[ApplicationContext] Error clearing full sync timer:', error);
          errors.push({ service: 'fullSyncTimer', error });
        }
      }
      
      // 3. 停止 HybridSyncService
      if (this.hybridSyncService) {
        try {
          this.hybridSyncService.stop();
          logger.info('[ApplicationContext] ✅ HybridSyncService stopped');
        } catch (error) {
          logger.error('[ApplicationContext] Error stopping HybridSyncService:', error);
          errors.push({ service: 'hybridSyncService', error });
        }
      }

      this.logSrsBackendTransportDiagnostics('before-srs-backend-runtime-dispose');
      this.disposeSrsBackendRuntime(errors);

      if (this.frontendInstanceRuntime) {
        const frontendInstanceRuntime = this.frontendInstanceRuntime;
        const outcome = await this.runBoundedDisposalStep(
          'frontendInstanceRuntime',
          () => frontendInstanceRuntime.dispose(),
          errors,
        );
        this.frontendInstanceRuntime = null;
        this.followerCommandClient = null;
        if (outcome.status === 'completed') {
          logger.info('[ApplicationContext] ✅ FrontendInstanceRuntime disposed');
        }
      }
      
      // 4. 销毁所有已创建的服务（按创建顺序的逆序）
      await this.disposeServices(errors);
      
      // 5. Save storage data only when explicitly allowed
      if (shouldPersistStorage) {
        try {
          logger.info('[ApplicationContext] Saving storage data...');
          const saveResult = await this.unifiedStorageManager.save();  // ✅ 使用新架构 UnifiedStorageManager
          if (isErr(saveResult)) {
            throw new Error(saveResult.error.message || 'Unknown error');
          }
          logger.info('[ApplicationContext] Storage data saved successfully');
        } catch (error) {
          logger.error('[ApplicationContext] Critical error: Failed to save storage data:', error);
          errors.push({ service: 'unifiedStorageManager.save', error });
          throw new Error(`Failed to save storage data during disposal: ${error}`);
        }
      } else {
        logger.info('[ApplicationContext] Skipping storage save during disposal (persistStorage=false)');
      }

      if (this.sqlPersistence) {
        try {
          this.sqlPersistence.database.dispose();
          logger.info('[ApplicationContext] ✅ SQLite database closed without implicit checkpoint');
        } catch (error) {
          logger.error('[ApplicationContext] Error closing SQLite database:', error);
          errors.push({ service: 'sqliteDatabase', error });
        }
      }

      // 6. 清空服务容器和工厂
      this.serviceContainer.clear();
      this.serviceFactories.clear();
      
      // 7. 标记为已销毁
      this.disposed = true;
      
      // 8. 报告结果
      if (errors.length > 0) {
        logger.warn(`[ApplicationContext] Disposed with ${errors.length} non-critical errors:`, errors);
      } else {
        logger.info('[ApplicationContext] Disposed successfully');
      }
    } catch (error) {
      // 标记为已销毁，即使发生错误
      this.disposed = true;
      
      logger.error('[ApplicationContext] Critical error during disposal:', error);
      throw error;
    }
  }

  private async flushReviewTruthBeforeUnloadIfWritable(
    errors: DisposalErrorCollector,
  ): Promise<void> {
    if (!this.srsBackendClient || typeof this.srsBackendClient.flushReviewTruthBeforeUnload !== 'function') {
      return;
    }
    const writerRelayRequired = this.backendMigrationRuntimePolicy.capabilities.writerRelayRequiredForBackendWrites;
    const frontendMode = this.frontendInstanceRuntime?.getMode() ?? null;
    if (writerRelayRequired && frontendMode !== 'writer') {
      logger.info('[ApplicationContext] skipped Review truth flush before unload because current runtime is not writer', {
        frontendMode,
      });
      return;
    }
    const srsBackendClient = this.srsBackendClient;
    const outcome = await this.runBoundedDisposalStep(
      'srsBackendClient.reviewTruthFlush',
      () => srsBackendClient.flushReviewTruthBeforeUnload(),
      errors,
      REVIEW_TRUTH_FLUSH_DISPOSE_TIMEOUT_MS,
    );
    if (outcome.status === 'completed' && !outcome.value) {
      logger.warn('[ApplicationContext] Review truth flush did not finish before unload timeout; startup compensation will retry');
    }
  }

  private disposeSrsBackendRuntime(errors: DisposalErrorCollector): void {
    if (this.srsBackendClient) {
      try {
        this.srsBackendClient.dispose?.();
      } catch (error) {
        logger.error('[ApplicationContext] Error disposing SRS backend client:', error);
        errors.push({ service: 'srsBackendClient', error });
      }
    }

    if (this.srsBackendTransport) {
      try {
        this.logSrsBackendTransportDiagnostics('before-worker-transport-dispose');
        this.srsBackendTransport.dispose?.();
        logger.info('[ApplicationContext] ✅ SRS backend Worker transport disposed');
      } catch (error) {
        logger.error('[ApplicationContext] Error disposing SRS backend Worker transport:', error);
        errors.push({ service: 'srsBackendTransport', error });
      }
    }

    this.srsBackendTransport = null;
    this.srsBackendClient = null;
  }

  private logSrsBackendTransportDiagnostics(phase: string): void {
    if (!this.srsBackendTransport || typeof this.srsBackendTransport.getDiagnostics !== 'function') {
      return;
    }
    try {
      logger.info('[ApplicationContext] backend unload diagnostics', {
        phase,
        diagnostics: this.srsBackendTransport.getDiagnostics(),
      });
    } catch (error) {
      logger.warn('[ApplicationContext] backend unload diagnostics unavailable', {
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runBoundedDisposalStep<TResult>(
    service: string,
    task: () => Promise<TResult> | TResult,
    errors: DisposalErrorCollector,
    timeoutMs = APPLICATION_CONTEXT_DISPOSE_STEP_TIMEOUT_MS,
  ): Promise<DisposalStepOutcome<TResult>> {
    const normalizedTimeoutMs = Math.max(0, Math.floor(timeoutMs));
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const taskPromise = Promise.resolve().then(task);
    const guardedTask = taskPromise.then<DisposalStepOutcome<TResult>>(
      (value) => ({ status: 'completed', value }),
      (error) => ({ status: 'failed', error }),
    );
    const timeout = new Promise<DisposalStepOutcome<TResult>>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          status: 'timeout',
          error: new Error(`${service} disposal timed out after ${normalizedTimeoutMs}ms`),
        });
      }, normalizedTimeoutMs);
    });
    const outcome = await Promise.race([guardedTask, timeout]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (outcome.status === 'failed') {
      logger.error(`[ApplicationContext] Error disposing ${service}:`, outcome.error);
      errors.push({ service, error: outcome.error });
    } else if (outcome.status === 'timeout') {
      logger.warn(`[ApplicationContext] ${service} disposal did not finish before timeout; continuing unload cleanup`, {
        timeoutMs: normalizedTimeoutMs,
      });
      errors.push({ service, error: outcome.error });
    }
    return outcome;
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
  private async disposeServices(errors: DisposalErrorCollector): Promise<void> {
    // 获取所有已创建的服务（按创建顺序）
    const services = Array.from(this.serviceContainer.entries());
    
    // 按逆序销毁（后创建的先销毁）
    for (let i = services.length - 1; i >= 0; i--) {
      const [serviceName, service] = services[i];
      
      // 如果服务有 dispose 方法，调用它
      const disposableService = service as { dispose?: () => Promise<void> | void } | undefined;
      if (disposableService && typeof disposableService.dispose === 'function') {
        logger.info(`[ApplicationContext] Disposing service: ${serviceName}...`);
        const outcome = await this.runBoundedDisposalStep(
          serviceName,
          () => disposableService.dispose!(),
          errors,
        );
        if (outcome.status === 'completed') {
          logger.info(`[ApplicationContext] Disposed service: ${serviceName}`);
        }
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
