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
import { ReviewView, RetrievalPracticeAdapter, NeuralRoamAdapter } from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import { LeechQueueV2 } from '@/core/queue/strategies/LeechQueueV2';
import { FinalDrillQueueV2 } from '@/core/queue/strategies/FinalDrillQueueV2';
import { NeuralRoamQueueV2 } from '@/core/queue/strategies/NeuralRoamQueueV2';
import { IncrementalLearningQueueV2 } from '@/core/queue/strategies/IncrementalLearningQueueV2';
import { FilterGroupQueueV2 } from '@/core/queue/strategies/FilterGroupQueueV2';
import type { StorageManager } from '@/core/storage/manager';
import type { SchedulerEngineAdapter } from '@/core/scheduler/types';

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
  finalDrillQueue: FinalDrillQueueV2;
  incrementalQueue: IncrementalLearningQueueV2;
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
      
      const session = new LeechQueueV2({
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
      const session = new NeuralRoamQueueV2({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this.deps.i18n || {},
        seedBlockId: options?.seedBlockId,
        includeSeedAsFirst: options?.includeSeedAsFirst,
      });
      const adapter = new NeuralRoamAdapter({ i18n: this.deps.i18n || {} });

      this.reviewDialog = this.createReviewDialog({
        title: this.deps.i18n?.neuralReviewTitle || '神经漫游',
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.neuralReviewTitle || '神经漫游',
          queue: session as any,
          adapter: adapter as any,
        },
      });
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
