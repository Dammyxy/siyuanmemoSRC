import FSRSPlugin from '../index';
import { StorageManager } from '@/core/storage';
import { createScheduler, type SchedulerEngineAdapter, SchedulerRouter } from '@/core/scheduler';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import { riff } from '@/core/siyuan';
import { QueueContext, type QueueItem, StorageFileJsonAdapter } from '@/core/queue';
import { ConsoleQueueMonitor } from '@/core/queue/monitors';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import { FilterGroupQueue } from '@/core/queue/strategies/FilterGroupQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import { NeuralRoamQueue } from '@/core/queue/strategies/NeuralRoamQueue';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
// 🔧 使用新架构的 IncrementalLearningQueue（注意：LifecycleManager 已废弃，不再使用）
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
import { NeuralQueueStorage } from '@/core/queue/neural';
import { DialogService, MenuService } from '@/services';
import { checkMigrationNeeded, migrateExistingCards } from '@/scripts/migrateToTopicItem';
import { pushMsg } from '@/core/siyuan/api';

export class LifecycleManager {
  constructor(private plugin: FSRSPlugin) {}

  async initializeCoreComponents() {
    // 初始化存储
    this.plugin.storage = new StorageManager(this.plugin.name);
    await this.plugin.storage.init();

    const settings = this.plugin.storage.getSettings();
    this.plugin.rescheduleService = new RescheduleService(this.plugin.storage);

    // 创建 SchedulerRouter（根据卡片类型自动选择调度器）
    this.plugin.schedulerRouter = new SchedulerRouter({
      defaultScheduler: settings.scheduler?.defaultScheduler || 'fsrs-v5',
      enableRiffSync: settings.scheduler?.enableRiffSync || false,
      fsrsParams: settings.fsrs,
    }, this.plugin.storage);

    // 保留旧调度器（向后兼容）
    this.plugin.scheduler = createScheduler(settings.fsrs, settings.schedulerEngine);
  }

  async initializeQueues() {
    // 使用 队列（复合架构）
    this.plugin.retrievalQueue = await RetrievalPracticeQueue.create({
      storage: this.plugin.storage,
      localScheduler: this.plugin.scheduler,      // 保留（向后兼容）
      schedulerRouter: this.plugin.schedulerRouter, // 新增
    });

    this.plugin.queueContext = new QueueContext<QueueItem>({
      initial: 'retrieval',
      monitors: [new ConsoleQueueMonitor()],
    });
    this.plugin.queueContext.register('retrieval', this.plugin.retrievalQueue as any);
    
    const groupConfigs = (this.plugin.storage.getSettings().queues?.filterGroup?.groups || []).map((g: any) => ({
      id: String(g.id),
      weight: Number(g.weight) || 1,
    })).filter((g: any) => g.id);
    const configs = groupConfigs.length ? groupConfigs : [{ id: 'default', weight: 1 }];

    // 使用 队列（复合架构）
    const filterGroupQueue = new FilterGroupQueue(
      configs,
      new StorageFileJsonAdapter(this.plugin.storage, 'queue-filter-group.json'),
    );
    await filterGroupQueue.init();
    this.plugin.subsetQueue = filterGroupQueue;
    this.plugin.queueContext.register('filter-group', this.plugin.subsetQueue as any);

    // 使用 队列（复合架构）
    this.plugin.finalDrillQueue = new FinalDrillQueue(this.plugin.storage);
    await this.plugin.finalDrillQueue.init();
    this.plugin.queueContext.register('final-drill', this.plugin.finalDrillQueue as any);

    // 初始化难点攻坚队列（使用 V2）
    this.plugin.leechQueue = new LeechQueue();
    this.plugin.queueContext.register('leech' as any, this.plugin.leechQueue as any);

    // 初始化神经漫游队列（使用 V2）
    const neuralConfig = NeuralQueueStorage.loadConfig();
    this.plugin.neuralQueue = new NeuralRoamQueue({ config: neuralConfig });
    this.plugin.queueContext.register('neural-roam', this.plugin.neuralQueue as any);

    // 初始化渐进学习队列（使用 V2 - Simplified）
    this.plugin.incrementalQueue = new IncrementalLearningQueue({
      storage: this.plugin.storage,
      scheduler: this.plugin.scheduler,
      schedulerRouter: this.plugin.schedulerRouter, // 🆕 Phase 2.1: 传入 schedulerRouter
      config: {
        enableRiffSync: this.plugin.settings?.scheduler?.enableRiffSync || false, // 🆕 Phase 2.1: 传入配置
      },
    });
    this.plugin.queueContext.register('incremental-learning' as any, this.plugin.incrementalQueue as any);

    console.log('[FSRS] ✅ Incremental learning queue initialized:', {
      hasQueue: !!this.plugin.incrementalQueue,
      hasAddItems: typeof this.plugin.incrementalQueue.addItems === 'function',
      queueName: this.plugin.incrementalQueue.constructor.name,
      hasSchedulerRouter: !!this.plugin.schedulerRouter,
      enableRiffSync: this.plugin.settings?.scheduler?.enableRiffSync || false,
    });

    console.log('[FSRS] ✅ SchedulerRouter initialized');
  }

  async initializeServices() {
    // 初始化 Services
    this.plugin.dialogService = new DialogService({
      app: this.plugin.app,
      i18n: this.plugin.i18n || {},
      storage: this.plugin.storage,
      scheduler: this.plugin.scheduler,
      isInitialized: true,
      finalDrillQueue: this.plugin.finalDrillQueue,
      incrementalQueue: this.plugin.incrementalQueue,
    });

    this.plugin.menuService = new MenuService({
      i18n: this.plugin.i18n || {},
      storage: this.plugin.storage,
      openReviewDialog: () => this.plugin.openReviewDialog(),
      openFinalDrillDialog: () => this.plugin.openFinalDrillDialog(),
      openFilterGroupPracticeDialog: () => this.plugin.openFilterGroupPracticeDialog(),
      openIncrementalLearningDialog: () => this.plugin.openIncrementalLearningDialog(),
      openNeuralRoamDialog: () => this.plugin.openNeuralRoamDialog(),
      openLeechReviewDialog: () => this.plugin.openLeechReviewDialog(),
      openSRSBrowser: () => this.plugin.openSRSBrowser(),
      openSetting: () => this.plugin.openSetting(),
      getDueCount: () => this.plugin.getDueCount(),
    });

    console.log('[FSRS] ✅ Services initialized');
  }

  async handleTopicItemMigration() {
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
  }
}