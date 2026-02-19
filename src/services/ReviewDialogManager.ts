﻿﻿﻿﻿﻿/**
 * ReviewDialogManager - 管理所有复习对话框的打开
 * 从 index.ts 拆分出来的服务
 * 
 * @deprecated 此服务的功能正在被 DialogManager 和 ReviewApplicationService 替代，将在未来版本中移除
 * @see application/managers/DialogManager.ts
 * @see application/services/ReviewApplicationService.ts
 */

import type { App } from 'siyuan';
import type { StorageManager } from '@/core/storage';
import type { SchedulerEngineAdapter } from '@/core/scheduler';
import { riff } from '@/core/siyuan';
import { pushErrMsg, pushMsg } from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';

// UI Components
import {
  FinalDrillAdapter,
  FinalDrillProvider,
  LeechAdapter,
  RetrievalPracticeAdapter,
  ReviewView,
  SubsetPracticeAdapter,
} from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';

// Queue strategies
import { SubsetPracticeStrategy } from '@/core/queue/strategies';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { DEFAULT_PRIORITY } from '@/core/queue';

// Types
import type { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import type { FilterGroupQueue } from '@/core/queue/strategies/FilterGroupQueue';
import type { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';

// 🆕 Unified Data Source
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { UnifiedQueueStrategy } from '@/strategies/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/strategies/UnifiedReviewAdapter';
import { QueueType } from '@/types/unified-data-source';

export interface ReviewDialogManagerDeps {
  app: App;
  i18n: Record<string, string>;
  storage: StorageManager;
  scheduler: SchedulerEngineAdapter;
  finalDrillQueue: FinalDrillQueue;
  filterGroupQueue: FilterGroupQueue;
  incrementalQueue: IncrementalLearningQueue;
  isInitialized: () => boolean;
  plugin?: any;  // 🆕 添加 plugin 引用，用于访问 hybridSyncService
  openReviewTab?: (options: {
    provider?: any;
    queue?: any;
    adapter: any;
    title: string;
  }) => void;
}

/** 标准对话框尺寸 */
const STANDARD_SIZE = { width: 'min(860px, 96vw)', height: 'min(720px, 90vh)' };

/** 对话框配置选项 */
interface DialogOptions {
  title: string;
  queue?: any;
  adapter: any;
  provider?: any;
  reviewUI?: any;
  dataKey?: string;
  transparent?: boolean;
  isReview?: boolean;
  size?: { width: string; height: string };
}

export class ReviewDialogManager {
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;

  constructor(private deps: ReviewDialogManagerDeps) {}

  /**
   * 销毁当前对话框
   */
  destroyCurrentDialog(): void {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
      this.reviewDialog = null;
    }
  }

  /**
   * 创建标准复习对话框（抽取公共配置）
   */
  private createDialog(options: DialogOptions): void {
    const { title, queue, adapter, provider, reviewUI, dataKey = 'dialog-opencard', transparent = true, isReview = true, size = STANDARD_SIZE } = options;
    
    this.reviewDialog = createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey,
      transparent,
      isReview,
      props: {
        app: this.deps.app,
        i18n: this.deps.i18n || {},
        title,
        plugin: this.deps.plugin,  // 🆕 传递 plugin 引用
        ...(provider && { provider }),
        ...(queue && { queue }),
        ...(adapter && { adapter }),
        ...(reviewUI && { reviewUI }),
      },
      events: { 
        close: () => this.destroyCurrentDialog(),
        'convert-to-tab': () => {
          // 保存当前状态
          const currentProvider = provider;
          const currentQueue = queue;
          const currentAdapter = adapter;
          const currentTitle = title;
          
          // 关闭对话框
          this.destroyCurrentDialog();
          
          // 在 Tab 中打开
          if (this.deps.openReviewTab) {
            this.deps.openReviewTab({
              provider: currentProvider,
              queue: currentQueue,
              adapter: currentAdapter,
              title: currentTitle,
            });
          } else {
            console.warn('[SiYuanMemo][ReviewDialogManager] openReviewTab callback not provided');
          }
        },
      },
      ...size,
      onClose: () => { this.reviewDialog = null; },
    });
  }

  /**
   * 检查初始化状态，未初始化则提示错误
   */
  private async checkInitialized(): Promise<boolean> {
    if (!this.deps.isInitialized()) {
      await pushErrMsg(this.deps.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return false;
    }
    return true;
  }

  /**
   * 打开提取练习对话框 (Vue UI 2.0)
   * 🆕 使用统一数据源架构
   */
  async openRetrievalPractice(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.reviewDialog = createUnifiedReviewDialog({
        plugin: this.deps.plugin,
        queueType: QueueType.RetrievalPractice,
        title: this.deps.i18n?.retrievalPractice || '提取练习',
        onClose: () => {
          this.reviewDialog = null;
        }
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Retrieval practice dialog created with unified data source');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open retrieval practice dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 打开难点攻坚对话框
   */
  async openLeechReview(): Promise<void> {
    this.destroyCurrentDialog();

    try {
      const settings = this.deps.storage?.getSettings?.();
      const leech = (settings as any)?.leech || {};
      const queue = new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Number(leech.threshold) || 8,
        action: (leech.action || 'notify') as any,
        tagName: String(leech.tagName || ''),
      });

      this.createDialog({
        title: (this.deps.i18n as any)?.startLeechPractice || '难点攻坚',
        queue: queue as any,
        adapter: new LeechAdapter({ i18n: this.deps.i18n || {} }) as any,
      });
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open leech review dialog:', err);
      try { await pushErrMsg('难点攻坚启动失败'); } catch {}
    }
  }

  /**
   * 打开刻意练习对话框 (Vue UI 2.0)
   * 🆕 使用统一数据源架构
   */
  async openFinalDrill(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.reviewDialog = createUnifiedReviewDialog({
        plugin: this.deps.plugin,
        queueType: QueueType.FinalDrill,
        title: this.deps.i18n?.finalDrill || '刻意练习',
        onClose: () => {
          this.reviewDialog = null;
        }
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Final drill dialog created with unified data source');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open final drill dialog:', err);
      await pushErrMsg(this.deps.i18n?.drillFailed || '机械练习启动失败');
    }
  }

  /**
   * 打开渐进学习队列对话框
   * 🆕 使用统一数据源架构
   */
  async openIncrementalLearning(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.reviewDialog = createUnifiedReviewDialog({
        plugin: this.deps.plugin,
        queueType: QueueType.IncrementalLearning,
        title: this.deps.i18n?.incrementalLearning || '渐进学习',
        onClose: () => {
          this.reviewDialog = null;
        }
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Incremental learning dialog created with unified data source');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.deps.i18n?.openFailed || '打开渐进学习失败');
    }
  }

  /**
   * 打开分组队列对话框
   * 🆕 使用统一数据源架构
   */
  async openFilterGroupPractice(): Promise<void> {
    if (!(await this.checkInitialized())) return;
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.reviewDialog = createUnifiedReviewDialog({
        plugin: this.deps.plugin,
        queueType: QueueType.FilterGroup,
        title: this.deps.i18n?.filterGroupPractice || '分组队列',
        onClose: () => {
          this.reviewDialog = null;
        }
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Filter group dialog created with unified data source');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open filter group practice dialog:', err);
      await pushErrMsg(this.deps.i18n?.openFailed || '打开分组队列失败');
    }
  }

  /**
   * 打开渐进学习对话框（带过滤条件）
   * 
   * 用于块菜单中的渐进学习入口，支持按 blockIds 过滤卡片。
   * 使用 FilterGroup 队列 + 临时过滤条件实现。
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
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 FilterGroup 队列 + 临时过滤条件
      const manager = this.deps.plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[SiYuanMemo][ReviewDialogManager] UnifiedDataSourceManager not found');
        await pushErrMsg('无法打开渐进学习');
        return;
      }
      
      const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
      
      // 设置临时过滤条件
      const filter: any = {
        blockIds: options.blockIds,
        // 渐进学习接受所有类型（Item + Topic）
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      console.log('[SiYuanMemo][ReviewDialogManager] 🔍 openIncrementalLearningWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
        filter: JSON.stringify(filter, null, 2)
      });
      
      // 应用过滤条件
      if (typeof (filterGroupQueue as any).setFilter === 'function') {
        (filterGroupQueue as any).setFilter(filter);
        
        // 🔍 验证过滤条件是否正确设置
        const currentFilter = (filterGroupQueue as any).getFilter?.();
        console.log('[SiYuanMemo][ReviewDialogManager] 🔍 After setFilter, current filter:', {
          hasDueDate: !!currentFilter?.dueDate,
          filter: JSON.stringify(currentFilter, null, 2)
        });
      }
      
      // ✅ 修复：当 dueOnly 为 false（全部模式）时，清除临时黑名单
      // 临时黑名单用于"到期"模式下记录已复习的卡片，避免重复复习
      // 但在"全部"模式下，用户希望看到所有卡片，包括已复习的
      if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
        (filterGroupQueue as any).clearTemporaryBlacklist();
        console.log('[SiYuanMemo][ReviewDialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用 FilterGroup 队列）
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
      const adapter = new UnifiedReviewAdapter({ i18n: this.deps.i18n || {} });
      
      this.reviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.incrementalLearning || '渐进学习',
          queue: queue as any,
          adapter: adapter as any,
          plugin: this.deps.plugin,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (typeof (filterGroupQueue as any).setFilter === 'function') {
              (filterGroupQueue as any).setFilter({});
            }
            this.destroyCurrentDialog();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.reviewDialog = null;
        },
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Incremental learning dialog created with blockIds filter');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.deps.i18n?.openFailed || '打开渐进学习失败');
    }
  }

  /**
   * 打开提取练习对话框（带过滤条件）
   * 
   * 用于块菜单中的提取练习入口，支持按 blockIds 过滤卡片。
   * 使用 FilterGroup 队列 + 临时过滤条件实现。
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
    this.destroyCurrentDialog();

    try {
      // 🆕 使用 FilterGroup 队列 + 临时过滤条件
      const manager = this.deps.plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[SiYuanMemo][ReviewDialogManager] UnifiedDataSourceManager not found');
        await pushErrMsg('无法打开提取练习');
        return;
      }
      
      const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
      
      // 设置临时过滤条件
      const filter: any = {
        blockIds: options.blockIds,
        cardType: 'item',  // 只接受 Item
      };
      
      if (options.dueOnly) {
        filter.dueDate = {
          lte: new Date(),
        };
      }
      
      console.log('[SiYuanMemo][ReviewDialogManager] 🔍 openRetrievalPracticeWithFilter - Setting filter:', {
        dueOnly: options.dueOnly,
        blockIdsCount: options.blockIds.length,
        hasDueDate: !!filter.dueDate,
        filter: JSON.stringify(filter, null, 2)
      });
      
      // 应用过滤条件
      if (typeof (filterGroupQueue as any).setFilter === 'function') {
        (filterGroupQueue as any).setFilter(filter);
        
        // 🔍 验证过滤条件是否正确设置
        const currentFilter = (filterGroupQueue as any).getFilter?.();
        console.log('[SiYuanMemo][ReviewDialogManager] 🔍 After setFilter, current filter:', {
          hasDueDate: !!currentFilter?.dueDate,
          filter: JSON.stringify(currentFilter, null, 2)
        });
      }
      
      // ✅ 修复：当 dueOnly 为 false（全部模式）时，清除临时黑名单
      // 临时黑名单用于"到期"模式下记录已复习的卡片，避免重复复习
      // 但在"全部"模式下，用户希望看到所有卡片，包括已复习的
      if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
        (filterGroupQueue as any).clearTemporaryBlacklist();
        console.log('[SiYuanMemo][ReviewDialogManager] ✅ Cleared temporary blacklist for "all" mode');
      }
      
      // 创建对话框（使用 FilterGroup 队列）
      const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
      const adapter = new UnifiedReviewAdapter({ i18n: this.deps.i18n || {} });
      
      this.reviewDialog = createVueDialog({
        hideTitle: true,
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.deps.app,
          i18n: this.deps.i18n || {},
          title: this.deps.i18n?.retrievalPractice || '提取练习',
          queue: queue as any,
          adapter: adapter as any,
          plugin: this.deps.plugin,
        },
        events: {
          close: () => {
            // 清除过滤条件
            if (typeof (filterGroupQueue as any).setFilter === 'function') {
              (filterGroupQueue as any).setFilter({});
            }
            this.destroyCurrentDialog();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.reviewDialog = null;
        },
      });
      
      console.log('[SiYuanMemo][ReviewDialogManager] ✅ Retrieval practice dialog created with blockIds filter');
    } catch (err) {
      console.error('[SiYuanMemo] Failed to open retrieval practice dialog:', err);
      await pushErrMsg(this.deps.i18n?.loadFailed || '加载失败');
    }
  }

  /**
   * 鎵撳紑绁炵粡婕父瀵硅瘽妗?(Vue UI 2.0)
   * 馃啎 浣跨敤缁熶竴鏁版嵁婧愭灦鏋?
   */
  async openNeuralRoam(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }): Promise<void> {
      if (!(await this.checkInitialized())) return;
      this.destroyCurrentDialog();

      try {
        // 🆕 清理神经漫游队列的历史记录
        const neuralQueue = this.deps.plugin?.unifiedDataSourceManager?.getQueue(QueueType.NeuralRoam);
        if (neuralQueue && typeof (neuralQueue as any).clearHistory === 'function') {
          (neuralQueue as any).clearHistory();
          console.log('[SiYuanMemo][ReviewDialogManager] ✅ Neural roam history cleared');
        }

        // 🆕 使用 createUnifiedReviewDialog 创建对话框
        this.reviewDialog = createUnifiedReviewDialog({
          plugin: this.deps.plugin,
          queueType: QueueType.NeuralRoam,
          title: this.deps.i18n?.neuralReviewTitle || '神经漫游',
          onClose: () => {
            this.reviewDialog = null;
          }
        });

        console.log('[SiYuanMemo][ReviewDialogManager] ✅ Neural roam dialog created with unified data source');
      } catch (err) {
        console.error('[SiYuanMemo] Failed to open neural roam dialog:', err);
        await pushErrMsg(this.deps.i18n?.neuralReviewFailed || '神经复习启动失败');
      }
    }


  /**
   * 打开子集复习对话框
   */
  async openSubsetReview(blockIds: string[]): Promise<void> {
    this.destroyCurrentDialog();

    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    const title = (this.deps.i18n?.reviewSubsetTitleWithCount || '子集复习 ({n} 张)').replace('{n}', String(ids.length));
    this.createDialog({
      title,
      queue: new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID, storage: this.deps.storage }) as any,
      adapter: new SubsetPracticeAdapter({ i18n: this.deps.i18n || {}, label: title, queueName: 'subset' }) as any,
    });
  }

  /**
   * 打开练习对话框（基于卡片列表）
   * 
   * @param cards 卡片列表
   * @param practiceMode 练习模式
   * @param options 可选配置
   * @param options.onReview 复习回调（cardId, rating）
   */
  openDrillWithCards(
    cards: any[], 
    practiceMode: 'queue' | 'block' = 'queue',
    options?: {
      onReview?: (cardId: string, rating: number) => void;
    }
  ): void {
    this.destroyCurrentDialog();

    const ids = Array.from(new Set((cards || []).map((c) => String(c?.blockID || c?.blockId || '')).filter(Boolean)));
    if (ids.length === 0) {
      void pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }

    const modeLabel = practiceMode === 'block'
      ? (this.deps.i18n?.blockModeLabel || '块练习')
      : (this.deps.i18n?.queueModeLabel || '队列练习');
    const blockTitleTemplate = this.deps.i18n?.blockPracticeTitleWithCount || '当前练习队列：{n}张闪卡';
    const blockTitle = blockTitleTemplate.replace('{n}', String(cards.length));
    const title = practiceMode === 'block'
      ? blockTitle
      : (cards.length > 0 ? `${modeLabel} (${cards.length} 张)` : modeLabel);

    const session = new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID, storage: this.deps.storage });
    const adapter = new SubsetPracticeAdapter({ i18n: this.deps.i18n || {}, label: title, queueName: practiceMode });

    this.reviewDialog = createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey: 'dialog-opencard',
      props: {
        app: this.deps.app,
        i18n: this.deps.i18n || {},
        title,
        plugin: this.deps.plugin,  // 🆕 传递 plugin 引用
        queue: session as any,
        adapter: adapter as any,
        onReview: options?.onReview,  // 🆕 传递 onReview 回调
      },
      events: {
        close: () => this.destroyCurrentDialog(),
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.reviewDialog = null;
      },
    });

    // 样式调整
    const dialogEl = this.reviewDialog.dialog.element;
    const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
    const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

    if (scrim) {
      scrim.style.backgroundColor = 'var(--b3-theme-surface)';
    }
    if (container) {
      container.style.maxWidth = '1024px';
    }

    setTimeout(() => {
      const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
      if (focusEl) {
        focusEl.focus();
      }
    }, 100);
  }
  /**
     * 打开临时练习对话框（使用 TemporaryDrillStrategy）
     *
     * 特点：
     * - 评分 4（简单）：从队列移除
     * - 评分 1/2/3（困难/一般/良好）：保留在队列中
     * - 不持久化到 localStorage
     * - 不影响间隔重复算法
     *
     * @param blockIds 块 ID 列表
     */
    async openTemporaryDrill(blockIds: string[]): Promise<void> {
      this.destroyCurrentDialog();

      if (blockIds.length === 0) {
        await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
        return;
      }

      try {
        const { TemporaryDrillStrategy } = await import('@/core/queue/strategies/TemporaryDrillStrategy');
        const { SubsetPracticeAdapter } = await import('@/ui/review/v2/adapters/SubsetPracticeAdapter');
        const { createVueDialog } = await import('@/utils/dialog');
        const { ReviewView } = await import('@/ui/review/v2');

        const title = `临时练习 (${blockIds.length} 张)`;
        const session = new TemporaryDrillStrategy({
          blockIds,
          deckID: riff.BUILTIN_DECK_ID,
          storage: this.deps.storage
        });
        const adapter = new SubsetPracticeAdapter({
          i18n: this.deps.i18n || {},
          label: title,
          queueName: 'temporary-drill'
        });

        this.reviewDialog = createVueDialog({
          hideTitle: true,
          component: ReviewView,
          dataKey: 'dialog-temporary-drill',
          props: {
            app: this.deps.app,
            i18n: this.deps.i18n || {},
            title,
            plugin: this.deps.plugin,
            queue: session as any,
            adapter: adapter as any,
          },
          events: {
            close: () => this.destroyCurrentDialog(),
          },
          width: '80vw',
          height: '70vh',
          onClose: () => {
            this.reviewDialog = null;
          },
        });

        // 样式调整
        const dialogEl = this.reviewDialog.dialog.element;
        const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
        const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

        if (scrim) {
          scrim.style.backgroundColor = 'var(--b3-theme-surface)';
        }
        if (container) {
          container.style.maxWidth = '1024px';
        }

        setTimeout(() => {
          const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
          if (focusEl) {
            focusEl.focus();
          }
        }, 100);

        console.log('[SiYuanMemo][ReviewDialogManager] ✅ Temporary drill dialog opened with TemporaryDrillStrategy');
      } catch (err) {
        console.error('[SiYuanMemo][ReviewDialogManager] Failed to open temporary drill:', err);
        await pushErrMsg(this.deps.i18n?.drillFailed || '临时练习启动失败');
      }
    }
}
