/**
 * DialogService - 对话框管理服务
 * 
 * 负责创建和管理所有复习相关的对话框
 * 从 index.ts 中抽取以提高代码可维护性
 */

import type { App } from 'siyuan';
import * as riff from '@/core/siyuan/riff';
import { pushErrMsg } from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import { ReviewView, RetrievalPracticeAdapter } from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
// 🔧 使用新架构的 IncrementalLearningQueue
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/strategies/FilterGroupQueue';
import type { StorageManager } from '@/core/storage/manager';
import type { SchedulerEngineAdapter } from '@/core/scheduler/types';

// 🆕 Unified Data Source
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

type I18n = Record<string, string>;

/**
 * 对话框服务的依赖接口
 */
export interface DialogServiceDependencies {
  app: App;
  i18n: I18n;
  storage: StorageManager;
  scheduler: SchedulerEngineAdapter;
  isInitialized: boolean;
  // 队列实例
  finalDrillQueue: FinalDrillQueue;
  incrementalQueue: IncrementalLearningQueue;
}

/**
 * 对话框服务
 * 
 * 管理所有复习对话框的创建和销毁
 */
export class DialogService {
  private reviewDialog: ReturnType<typeof createVueDialog> | null = null;
  private readonly deps: DialogServiceDependencies;

  constructor(deps: DialogServiceDependencies) {
    this.deps = deps;
  }

  /**
   * 获取当前对话框实例
   */
  getReviewDialog() {
    return this.reviewDialog;
  }

  /**
   * 销毁当前对话框
   */
  destroyCurrentDialog() {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
      this.reviewDialog = null;
    }
  }

  /**
   * 打开提取练习对话框
   */
  async openRetrievalPracticeDialog() {
    if (!this.deps.isInitialized) {
      await pushErrMsg(this.deps.i18n?.initFailed || 'FSRS 插件初始化失败');
      return;
    }
    this.destroyCurrentDialog();

    try {
      const provider = new RetrievalPracticeProvider({
        storage: this.deps.storage,
        scheduler: this.deps.scheduler,
      });
      const adapter = new RetrievalPracticeAdapter({ i18n: this.deps.i18n || {} });
      
      this.reviewDialog = this.createReviewDialog({
        title: provider.displayName,
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: provider.displayName,
          provider: provider as any,
          reviewUI: {
            component: ReviewView,
            adapter: adapter as any,
            context: {
              uiConfig: { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true },
            },
          },
        },
      });
    } catch (err) {
      console.error('[DialogService] Failed to open retrieval practice dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 打开难点攻坚对话框
   */
  async openLeechReviewDialog() {
    this.destroyCurrentDialog();

    try {
      const settings = this.deps.storage?.getSettings?.();
      const leech = (settings as any)?.leech || {};
      
      const session = new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Number(leech.threshold) || 8,
        action: (leech.action || 'notify') as any,
        tagName: String(leech.tagName || ''),
      });

      this.reviewDialog = this.createReviewDialog({
        title: this.deps.i18n?.startLeechPractice || '难点攻坚',
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.startLeechPractice || '难点攻坚',
          queue: session as any,
        },
      });
    } catch (err) {
      console.error('[DialogService] Failed to open leech review dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 打开刻意练习对话框
   */
  async openFinalDrillDialog() {
    if (!this.deps.isInitialized) {
      await pushErrMsg(this.deps.i18n?.initFailed || 'FSRS 插件初始化失败');
      return;
    }
    this.destroyCurrentDialog();

    try {
      this.reviewDialog = this.createReviewDialog({
        title: this.deps.i18n?.startFinalDrill || '刻意练习',
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.startFinalDrill || '刻意练习',
          queue: this.deps.finalDrillQueue as any,
        },
      });
    } catch (err) {
      console.error('[DialogService] Failed to open final drill dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 打开神经漫游对话框
   * 🆕 使用统一数据源架构
   */
  async openNeuralRoamDialog(options?: { 
    seedBlockId?: string; 
    includeSeedAsFirst?: boolean;
    resetHistory?: boolean;
  }) {
    if (!this.deps.isInitialized) {
      await pushErrMsg(this.deps.i18n?.initFailed || 'FSRS 插件初始化失败');
      return;
    }
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.reviewDialog = createUnifiedReviewDialog({
        plugin: (this.deps as any).plugin, // 需要插件实例
        queueType: QueueType.NeuralRoam,
        title: this.deps.i18n?.neuralReviewTitle || '神经漫游',
        onClose: () => {
          this.reviewDialog = null;
        }
      });
      
      console.log('[DialogService] ✅ Neural roam dialog created with unified data source');
    } catch (err) {
      console.error('[DialogService] Failed to open neural roam dialog:', err);
      await pushErrMsg(this.deps.i18n?.neuralReviewFailed || '神经漫游启动失败');
    }
  }

  /**
   * 打开渐进学习对话框
   */
  async openIncrementalLearningDialog() {
    if (!this.deps.isInitialized) {
      await pushErrMsg(this.deps.i18n?.initFailed || 'FSRS 插件初始化失败');
      return;
    }
    this.destroyCurrentDialog();

    try {
      this.reviewDialog = this.createReviewDialog({
        title: this.deps.i18n?.incrementalLearning || '渐进学习',
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.incrementalLearning || '渐进学习',
          queue: this.deps.incrementalQueue as any,
        },
      });
    } catch (err) {
      console.error('[DialogService] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 创建标准复习对话框
   */
  private createReviewDialog(options: {
    title: string;
    props: Record<string, any>;
  }): ReturnType<typeof createVueDialog> {
    return createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey: 'dialog-opencard',
      transparent: true,
      isReview: true,
      props: options.props,
      events: {
        close: () => {
          this.destroyCurrentDialog();
        },
      },
      width: 'min(860px, 96vw)',
      height: 'min(720px, 90vh)',
      onClose: () => {
        this.reviewDialog = null;
      },
    });
  }
}
