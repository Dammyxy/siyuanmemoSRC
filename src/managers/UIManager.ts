import FSRSPlugin from '../index';
import { createApp } from 'vue';
import SRSBrowser from '@/ui/browser/SRSBrowser.vue';
import { SettingsPanel } from '@/ui/settings';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';
import { pushMsg, pushErrMsg, sql } from '@/core/siyuan/api';
import { ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY, type QueueItem } from '@/core/queue';
import { SubsetPracticeStrategy } from '@/core/queue/strategies';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import { RetrievalPracticeAdapter, ReviewView, SubsetPracticeAdapter, LeechAdapter, FinalDrillAdapter } from '@/ui/review/v2';
import { RetrievalPracticeProvider } from '@/ui/review/v2/providers/RetrievalPracticeProvider';
import { FinalDrillProvider } from '@/ui/review/v2/providers/FinalDrillProvider';
import { PluginUIAssembler } from '@/core/application/PluginAssembler';
// 🆕 Unified Data Source
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export class UIManager {
  private assembler: PluginUIAssembler;
  
  constructor(private plugin: FSRSPlugin) {
    // 初始化组装器
    this.assembler = this.plugin.pluginService.uiAssembler;
  }

  initializeTabs() {
    // 注册复习 Tab
    try {
      this.plugin.reviewTab = this.plugin.addTab({
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
      console.log('[FSRS] Review tab registered:', this.plugin.REVIEW_TAB_ID);
    } catch (err) {
      console.error('[FSRS] Failed to register review tab:', err);
    }

    // 注册自定义 Tab
    const self = this.plugin;
    this.plugin.addTab({
      type: this.plugin.TAB_TYPE,
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
  }

  initializeDock() {
    // 注册 Dock 面板
    this.plugin.addDock({
      config: {
        position: 'RightBottom',
        size: { width: 400, height: 500 },
        icon: 'iconCards',
        title: 'FSRS',
      },
      data: { plugin: this.plugin },
      type: 'fsrs-dock',
      init: (dock) => {
        this.initDockPanel(dock.element);
      },
    });
  }

  private initDockPanel(element: HTMLElement) {
    this.assembler.initDockPanel(element);
  }

  initializeCommands() {
    // 注册快捷键 - 复习
    this.plugin.addCommand({
      langKey: 'startReview',
      hotkey: 'Alt+R',
      callback: () => {
        this.plugin.openReviewDialog();
      },
    });

    this.plugin.addCommand({
      langKey: 'startDrill',
      hotkey: 'Alt+D',
      callback: () => {
        this.plugin.openFinalDrillDialog();
      },
    });

    // 渐进学习队列命令
    this.plugin.addCommand({
      langKey: 'startIncrementalLearning',
      hotkey: '',
      callback: async () => {
        await this.plugin.openIncrementalLearningDialog();
      },
    });

    // 注册快捷键 - 打开 SRS 浏览器
    this.plugin.addCommand({
      langKey: 'openSrsBrowser',
      hotkey: 'Alt+B',
      callback: () => {
        this.plugin.openSRSBrowser();
      },
    });
  }

  /**
   * 打开卡片浏览器（Dialog 模式）
   * 实现单例模式：避免重复打开多个浏览器窗口
   */
  openSRSBrowser() {
    // 如果已有打开的浏览器，先销毁
    if (this.plugin.srsBrowserDialog) {
      this.plugin.srsBrowserDialog.destroy();
    }

    this.plugin.srsBrowserDialog = createVueDialog({
      title: this.plugin.i18n?.srsBrowser || 'SRS 浏览器',
      component: SRSBrowser,
      props: {
        app: this.plugin.app,
        i18n: this.plugin.i18n || {},
        mode: 'dialog',
        plugin: this.plugin,
      },
      events: {
        convertToTab: () => {
          // 关闭对话框并打开 Tab
          this.plugin.srsBrowserDialog?.destroy();
          this.plugin.srsBrowserDialog = null;
          this.openSRSBrowserTab();
        },
      },
      width: '90vw',
      height: '80vh',
      onClose: () => {
        // 对话框关闭时清理引用
        this.plugin.srsBrowserDialog = null;
      },
    });
  }

  /**
   * 打开卡片浏览器（Tab 模式）
   */
  openSRSBrowserTab() {
    this.plugin.openTab({
      app: this.plugin.app,
      custom: {
        icon: 'iconCard',
        title: this.plugin.i18n?.srsBrowser || 'SRS 浏览器',
        id: this.plugin.name + this.plugin.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
  }

  /**
   * 🆕 打开复习界面（Tab 模式）
   */
  openReviewTab(provider: any, title: string, providerId?: string) {
    this.plugin.openTab({
      app: this.plugin.app,
      custom: {
        icon: 'iconRiffCard',
        title: title,
        id: this.plugin.name + this.plugin.REVIEW_TAB_TYPE,
        data: {
          provider: provider,
          title: title,
          providerId: providerId || provider?.id || 'retrieval',
        },
      },
      position: 'right',
    });
  }

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
          mode: 'dialog',  // 🆕 明确指定 Dialog 模式
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
          // 🆕 新增：转换为 Tab
          'convert-to-tab': () => {
            console.log('[UIManager] convert-to-tab event received!');
            // 保存当前 provider 和 title
            const currentProvider = provider;
            const currentTitle = provider.displayName;
            const providerId = provider.id || 'retrieval';

            // 关闭对话框
            this.plugin.reviewDialog?.destroy();
            this.plugin.reviewDialog = null;

            // 打开 Tab
            this.openReviewTab(currentProvider, currentTitle, providerId);
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
          mode: 'dialog',  // 🆕 明确指定 Dialog 模式
          title: (this.plugin.i18n as any)?.startLeechPractice || '难点攻坚',
          queue: session as any,
          adapter: new LeechAdapter({ i18n: this.plugin.i18n || {} }) as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
          // 🆕 新增：转换为 Tab
          convertToTab: () => {
            const currentTitle = (this.plugin.i18n as any)?.startLeechPractice || '难点攻坚';
            const provider = {
              id: 'leech',
              displayName: currentTitle,
              getDueCards: () => session?.getDueCards?.() || [],
            };

            this.plugin.reviewDialog?.destroy();
            this.plugin.reviewDialog = null;

            this.openReviewTab(provider, currentTitle, 'leech');
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
      const provider = new FinalDrillProvider({
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
          mode: 'dialog',  // 🆕 明确指定 Dialog 模式
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
          // 🆕 新增：转换为 Tab
          convertToTab: () => {
            const currentProvider = provider;
            const currentTitle = provider.displayName;
            const providerId = 'final-drill';

            this.plugin.reviewDialog?.destroy();
            this.plugin.reviewDialog = null;

            this.openReviewTab(currentProvider, currentTitle, providerId);
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
          mode: 'dialog',  // 🆕 明确指定 Dialog 模式
          title,  // 传递给 Vue 组件显示
          queue: this.plugin.incrementalQueue as any,
          adapter: adapter as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
          // 🆕 新增：转换为 Tab
          convertToTab: () => {
            const provider = {
              id: 'incremental-learning',
              displayName: title,
              getDueCards: () => this.plugin.incrementalQueue?.getDueCards?.() || [],
            };

            this.plugin.reviewDialog?.destroy();
            this.plugin.reviewDialog = null;

            this.openReviewTab(provider, title, 'incremental-learning');
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
          mode: 'dialog',  // 🆕 明确指定 Dialog 模式
          title,  // 传递给 Vue 组件显示
          queue: this.plugin.filterGroupQueue as any,
          adapter: adapter as any,
        },
        events: {
          close: () => {
            this.plugin.reviewDialog?.destroy();
          },
          // 🆕 新增：转换为 Tab
          convertToTab: () => {
            const provider = {
              id: 'filter-group',
              displayName: title,
              getDueCards: () => this.plugin.filterGroupQueue?.getDueCards?.() || [],
            };

            this.plugin.reviewDialog?.destroy();
            this.plugin.reviewDialog = null;

            this.openReviewTab(provider, title, 'filter-group');
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
      
      console.log('[UIManager] ✅ Neural roam dialog created with unified data source');
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

  private openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
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

  openSetting(defaultTab?: string) {
    const currentSettings = this.plugin.storage.getSettings();
    const settingsDialog = createVueDialog({
      title: this.plugin.i18n?.settings || '设置',
      component: SettingsPanel,
      props: {
        fsrsSettings: currentSettings.fsrs,
        queueSettings: currentSettings.queues,
        schedulerSettings: currentSettings.scheduler,  // 🆕 新增
        i18n: this.plugin.i18n || {},
        defaultTab,
        queueCount: this.plugin.retrievalQueue['localBuffer']?.length || 0,
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
          };
          await this.plugin.storage.updateSettings(updatedSettings);
          this.plugin.scheduler.updateParams(updatedSettings.fsrs);

          // 🆕 更新 SchedulerRouter 配置
          if (this.plugin.schedulerRouter && settings.scheduler) {
            this.plugin.schedulerRouter.updateConfig({
              defaultScheduler: settings.scheduler.defaultScheduler,
              enableRiffSync: settings.scheduler.enableRiffSync,
              fsrsParams: updatedSettings.fsrs,
            });
            console.log('[FSRS] ✅ SchedulerRouter config updated');
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
}