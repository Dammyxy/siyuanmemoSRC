import { pushMsg, pushErrMsg } from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import { openTab } from 'siyuan';
import type FSRSPlugin from '../index';
import { 
  FinalDrillAdapter, 
  FinalDrillProvider as UIFinalDrillProvider, 
  LeechAdapter, 
  RetrievalPracticeAdapter, 
  ReviewView, 
  SubsetPracticeAdapter 
} from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import { FinalDrillProvider as ProviderFinalDrillProvider } from '@/ui/review/v2/providers/FinalDrillProvider';
import { SubsetPracticeStrategy } from '@/core/queue/strategies';
import { riff } from '@/core/siyuan';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import { createUnifiedReviewDialog, getQueueDisplayName } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

/**
 * 复习服务类
 * 负责处理所有与复习相关的操作
 */
export class ReviewService {
  constructor(private plugin: FSRSPlugin) {}

  /**
   * 打开复习面板（弹窗模式）- 使用 Vue UI 2.0
   */
  async openReviewDialog() {
    // 使用 Vue UI 2.0（提取练习）
    await this.openReviewProviderV2Dialog();
  }

  async openReviewV2Dialog() {
    await this.openReviewProviderV2Dialog();
  }
  
  /**
   * 🆕 使用统一数据源打开复习对话框
   * 
   * 这个方法使用 UnifiedQueueStrategy 和 UnifiedReviewAdapter，
   * 自动集成到统一数据源架构中，获得以下好处：
   * - 自动数据同步
   * - 统一的错误处理
   * - 统一的日志记录
   * - 观察者模式支持
   */
  async openUnifiedReviewDialog(queueType: QueueType = QueueType.RetrievalPractice) {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    
    try {
      const title = getQueueDisplayName(queueType, this.plugin.i18n);
      
      this.plugin.reviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType,
        title,
        onClose: () => {
          this.plugin.reviewDialog = null;
        }
      });
      
      console.log(`[ReviewService] Opened unified review dialog: ${queueType}`);
    } catch (err) {
      console.error('[ReviewService] Failed to open unified review dialog:', err);
      await pushErrMsg(this.plugin.i18n?.loadFailed || '加载失败');
    }
  }

  async openReviewProviderV2Dialog() {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    try {
      // ✅ 使用 RetrievalPracticeProvider，传递 storage 和 scheduler
      const provider = new RetrievalPracticeProvider({
        storage: this.plugin.storage,
        scheduler: this.plugin.scheduler,
      });
      const adapter = new RetrievalPracticeAdapter({ i18n: this.plugin.i18n || {} });
      this.plugin.reviewDialog = createVueDialog({
        hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          title: provider.displayName,  // 传递 title 给组件显示在 logo 区域
          provider: provider as any,
          reviewUI: {
            component: ReviewView,
            adapter: adapter as any,
            context: {
              uiConfig: { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true },
            },
          },
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open review provider v2 dialog:', err);
      await pushErrMsg(this.plugin.i18n?.loadFailed || '加载失败');
    }
  }

  async openLeechReviewDialog() {
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    try {
      const settings = this.plugin.storage?.getSettings?.();
      const leech = (settings as any)?.leech || {};
      // ✅ 使用 队列（复合架构）
      const session = new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Number(leech.threshold) || 8,
        action: (leech.action || 'notify') as any,
        tagName: String(leech.tagName || ''),
      });
      this.plugin.reviewDialog = createVueDialog({
        title: (this.plugin.i18n as any)?.startLeechPractice || '难点攻坚',
        component: ReviewView,
        dataKey: 'dialog-opencard', // 让思源热键系统能够识别
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          queue: session as any,
          adapter: new LeechAdapter({ i18n: this.plugin.i18n || {} }) as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open leech review dialog:', err);
      try {
        await pushErrMsg('难点攻坚启动失败');
      } catch {}
    }
  }

  async openFinalDrillV2Dialog() {
    await this.openFinalDrillProviderV2Dialog();
  }

  async openFinalDrillProviderV2Dialog() {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    try {
      const provider = new ProviderFinalDrillProvider({
        queue: this.plugin.finalDrillQueue as any,
        storage: this.plugin.storage,
        i18n: this.plugin.i18n || {},
      });
      await provider.init();
      const adapter = new FinalDrillAdapter({ i18n: this.plugin.i18n || {} });
      this.plugin.reviewDialog = createVueDialog({
        hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
        component: ReviewView,
        dataKey: 'dialog-opencard', // 让思源热键系统能够识别
        transparent: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          title: provider.displayName,  // 传递给 Vue 组件显示
          provider: provider as any,
          reviewUI: {
            component: ReviewView,
            adapter: adapter as any,
            context: {
              uiConfig: { statsType: 'queue-size', showRatingButtons: true, allowSkip: true },
            },
          },
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open final drill provider v2 dialog:', err);
      await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
    }
  }

  async openFinalDrillDialog() {
    // 使用 Vue UI 2.0（刻意练习）
    await this.openFinalDrillProviderV2Dialog();
  }

  /**
   * 打开渐进学习队列对话框
   */
  async openIncrementalLearningDialog() {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }

    try {
      const title = this.plugin.i18n?.incrementalLearning || '渐进学习';
      const adapter = new RetrievalPracticeAdapter({
        i18n: this.plugin.i18n || {},
        label: title,
        queueName: 'incremental-learning'
      });

      this.plugin.reviewDialog = createVueDialog({
        hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
        component: ReviewView,
        dataKey: 'dialog-incremental-learning',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          title,  // 传递给 Vue 组件显示
          queue: this.plugin.incrementalQueue as any,
          adapter: adapter as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open incremental learning dialog:', err);
      await pushErrMsg(this.plugin.i18n?.openFailed || '打开渐进学习失败');
    }
  }

  async openFilterGroupPracticeDialog() {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }

    try {
      const title = this.plugin.i18n?.filterGroupPractice || '分组队列';
      const adapter = new SubsetPracticeAdapter({
        i18n: this.plugin.i18n || {},
        label: title,
        queueName: 'filter-group'
      });

      this.plugin.reviewDialog = createVueDialog({
        hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          title,  // 传递给 Vue 组件显示
          queue: this.plugin.filterGroupQueue as any,
          adapter: adapter as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open filter group practice dialog:', err);
      await pushErrMsg(this.plugin.i18n?.openFailed || '打开分组队列失败');
    }
  }

  async openLeechPracticeDialog() {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }

    try {
      const title = this.plugin.i18n?.leechPractice || '难点攻坚';
      const adapter = new LeechAdapter({
        i18n: this.plugin.i18n || {}
      });

      this.plugin.reviewDialog = createVueDialog({
        hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
        component: ReviewView,
        dataKey: 'dialog-opencard',
        transparent: true,
        isReview: true,
        props: {
          app: this.plugin.app,
          i18n: this.plugin.i18n || {},
          title,  // 传递给 Vue 组件显示
          queue: this.plugin.leechQueue as any,
          adapter: adapter as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
        },
        width: 'min(860px, 96vw)',
        height: 'min(720px, 90vh)',
        onClose: () => {
          this.plugin.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open leech practice dialog:', err);
      await pushErrMsg(this.plugin.i18n?.openFailed || '打开难点攻坚失败');
    }
  }

  async openNeuralRoamDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.openNeuralRoamV2Dialog(options);
  }

  /**
   * 打开神经漫游对话框 (V2 - 统一数据源架构)
   */
  async openNeuralRoamV2Dialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    if (!this.plugin.isInitialized) {
      await pushErrMsg(this.plugin.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }

    try {
      // 🆕 使用 createUnifiedReviewDialog 创建对话框
      this.plugin.reviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType: QueueType.NeuralRoam,
        title: this.plugin.i18n?.neuralReviewTitle || '神经漫游',
        onClose: () => {
          this.plugin.reviewDialog = null;
        }
      });
      
      console.log('[ReviewService] ✅ Neural roam dialog created with unified data source');
    } catch (err) {
      console.error('[FSRS] Failed to open neural review v2 dialog:', err);
      await pushErrMsg(this.plugin.i18n?.neuralReviewFailed || '神经漫游启动失败');
    }
  }

  async openNeuralReviewDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.openNeuralRoamDialog(options);
  }

  async openSubsetReviewDialog(blockIds: string[]) {
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }
    const session = new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID });
    const title = (this.plugin.i18n?.reviewSubsetTitleWithCount || '子集复习 ({n} 张)').replace('{n}', String(ids.length));
    const adapter = new SubsetPracticeAdapter({ i18n: this.plugin.i18n || {}, label: title, queueName: 'subset' });
    this.plugin.reviewDialog = createVueDialog({
      hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
      component: ReviewView,
      dataKey: 'dialog-opencard', // 让思源热键系统能够识别
      transparent: true,
      props: {
        app: this.plugin.app,
        i18n: this.plugin.i18n || {},
        title,  // 传递给 Vue 组件显示
        queue: session as any,
        adapter: adapter as any,
      },
      events: {
        close: () => {
          this.plugin.reviewDialog?.destroy();
        },
      },
      width: 'min(860px, 96vw)',
      height: 'min(720px, 90vh)',
      onClose: () => {
        this.plugin.reviewDialog = null;
      },
    });
  }

  openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    const ids = Array.from(new Set((cards || []).map((c) => String(c?.blockID || c?.blockId || '')).filter(Boolean)));
    if (ids.length === 0) {
      void pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }
    const modeLabel = practiceMode === 'block'
      ? (this.plugin.i18n?.blockModeLabel || '块练习')
      : (this.plugin.i18n?.queueModeLabel || '队列练习');
    const blockTitleTemplate = this.plugin.i18n?.blockPracticeTitleWithCount || '当前练习队列：{n}张闪卡';
    const blockTitle = blockTitleTemplate.replace('{n}', String(cards.length));
    const title = practiceMode === 'block'
      ? blockTitle
      : (cards.length > 0 ? `${modeLabel} (${cards.length} 张)` : modeLabel);

    const session = new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID });
    const adapter = new SubsetPracticeAdapter({ i18n: this.plugin.i18n || {}, label: title, queueName: practiceMode });
    this.plugin.reviewDialog = createVueDialog({
      hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
      component: ReviewView,
      dataKey: 'dialog-opencard', // 让思源热键系统能够识别
      props: {
        app: this.plugin.app,
        i18n: this.plugin.i18n || {},
        title,  // 传递给 Vue 组件显示
        queue: session as any,
        adapter: adapter as any,
      },
      events: {
        close: () => {
          this.plugin.reviewDialog?.destroy();
        },
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.plugin.reviewDialog = null;
      },
    });

    const dialogEl = this.plugin.reviewDialog.dialog.element;
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
      app: this.plugin.app,
      custom: {
        icon: 'iconFSRS',
        title: title || '复习',
        id: this.plugin.REVIEW_TAB_ID,
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
      (window as any).openWindow({
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
}