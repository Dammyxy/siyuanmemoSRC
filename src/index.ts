/**
 * FSRS Plugin Entry
 * 插件入口文件
 */

import {
  Plugin,
  getFrontend,
  Menu,
  openTab,
} from 'siyuan';
import { createApp } from 'vue';

import { StorageManager } from '@/core/storage';
import { createScheduler, type SchedulerEngineAdapter } from '@/core/scheduler';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, unmarkBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import { ReviewPanel } from '@/ui/review';
import CardBrowser from '@/ui/browser/CardBrowser.vue';
import { SettingsPanel } from '@/ui/settings';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';

import { createDefaultCard } from '@/types';
import '@/index.scss';
import { ConsoleQueueMonitor, QueueContext, StorageFileJsonAdapter, type QueueItem } from '@/core/queue';
import { ExtractionPracticeQueue, FilterGroupQueue, FinalDrillQueue, NeuralRoamQueue, RetrievalPracticeQueue, SubsetPracticeStrategy, LeechQueue } from '@/core/queue/strategies';
import { NeuralQueue, NeuralQueueStorage } from '@/core/queue/neural';

type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export default class FSRSPlugin extends Plugin {
  // 运行环境
  public isMobile: boolean = false;
  public isBrowser: boolean = false;

  // 核心模块
  public storage!: StorageManager;
  public scheduler!: SchedulerEngineAdapter;
  public rescheduleService!: RescheduleService;
  private queueContext!: QueueContext<QueueItem>;
  private extractionQueue!: ExtractionPracticeQueue;
  public neuralQueue!: NeuralQueue;
  public finalDrillQueue!: FinalDrillQueue;
  public filterGroupQueue!: FilterGroupQueue;

  private TAB_TYPE = 'plugin-fsrs-card-browser';

  private topBarElement: HTMLElement | null = null;
  private topBarContextMenuHandler: ((ev: MouseEvent) => void) | null = null;
  private isInitialized = false;
  private didWarnTopbarMount = false;


  // UI 状态
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;

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
        title: this.i18n?.topbarTitle || 'FSRS 闪卡 (左键制卡/右键菜单)',
        position: 'right',
        callback: () => {
          if (!this.isInitialized) {
            pushMsg(this.i18n?.loading || '插件初始化中，请稍后...');
            return;
          }
          pushMsg(this.i18n?.featureRemoved || '该功能已暂时移除');
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

      this.extractionQueue = new ExtractionPracticeQueue(this.storage);
      this.queueContext = new QueueContext<QueueItem>({
        initial: 'extraction',
        monitors: [new ConsoleQueueMonitor()],
      });
      this.queueContext.register('extraction', this.extractionQueue);
      
      const groupConfigs = (settings.queues?.filterGroup?.groups || []).map((g: any) => ({
        id: String(g.id),
        weight: Number(g.weight) || 1,
      })).filter((g: any) => g.id);
      const configs = groupConfigs.length ? groupConfigs : [{ id: 'default', weight: 1 }];
      const filterGroupQueue = new FilterGroupQueue(
        configs,
        new StorageFileJsonAdapter(this.storage, 'queue-filter-group.json'),
      );
      await filterGroupQueue.init();
      this.filterGroupQueue = filterGroupQueue;
      this.queueContext.register('filter-group', this.filterGroupQueue);
      this.finalDrillQueue = new FinalDrillQueue(this.storage);
      await this.finalDrillQueue.init();
      this.queueContext.register('final-drill', this.finalDrillQueue);

      // 初始化神经漫游队列
      const neuralConfig = NeuralQueueStorage.loadConfig();
      this.neuralQueue = new NeuralQueue(neuralConfig);
      this.queueContext.register('neural-roam', this.neuralQueue);

      // 初始化调度器
      this.scheduler = createScheduler(settings.fsrs, settings.schedulerEngine);

      this.isInitialized = true;
    } catch (err) {
      console.error('[FSRS] Plugin initialization failed:', err);
      try {
        await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      } catch {}
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
        this.openDrillDialog();
      },
    });



    // 注册快捷键 - 打开卡片浏览器
    this.addCommand({
      langKey: 'openCardBrowser',
      hotkey: 'Alt+B',
      callback: () => {
        this.openCardBrowser();
      },
    });

    // 注册自定义 Tab
    const self = this;
    this.addTab({
      type: this.TAB_TYPE,
      init() {
        const app = createApp(CardBrowser, {
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

    console.log('[FSRS] Plugin loaded successfully');
  }

  onLayoutReady(): void {
    this.ensureTopbarMounted();
  }

  onunload() {
    console.log('[FSRS] Plugin unloading...');

    // 关闭复习对话框
    this.reviewDialog?.destroy();

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
    const menu = new Menu('fsrs-topbar-menu');

    // 添加菜单项
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startReview || '开始提取练习',
      accelerator: 'Alt+R',
      click: () => {
        this.openReviewDialog();
      },
    });

    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startQueuePractice || '开始刻意练习',
      accelerator: 'Alt+D',
      click: () => {
        this.openDrillDialog();
      },
    });

    menu.addItem({
      icon: 'iconRefresh',
      label: this.i18n?.startNeuralReview || '开始神经复习',
      accelerator: 'Alt+N',
      click: () => {
        this.openNeuralRoamDialog();
      },
    });

    menu.addItem({
      icon: 'iconBug',
      label: (this.i18n as any)?.startLeechPractice || '开始难点攻坚',
      accelerator: 'Alt+L',
      click: () => {
        this.openLeechReviewDialog();
      },
    });

    menu.addItem({
      icon: 'iconLayoutRight',
      label: this.i18n?.cardBrowser || '卡片浏览器',
      accelerator: 'Alt+B',
      click: () => {
        this.openCardBrowser();
      },
    });





    menu.addSeparator();

    menu.addItem({
      icon: 'iconSettings',
      label: this.i18n?.settings || '设置',
      click: () => {
        this.openSetting();
      },
    });

    menu.addSeparator();

    menu.addItem({
      icon: 'iconInfo',
      label: `${this.i18n?.dueCountLabel || '待复习'}: ${this.getDueCount()} / ${this.i18n?.totalCountLabel || '总卡片'}: ${this.storage.getAllCards().length}`,
      type: 'readonly',
    });

    const anchor = (ev.currentTarget || ev.target) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    } else {
      menu.open({ x: ev.clientX, y: ev.clientY, isLeft: true });
    }
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
        i18n: this.i18n || {},
        defaultTab,
        queueCount: this.extractionQueue.size(),
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
          };
          await this.storage.updateSettings(updatedSettings);
          this.scheduler.updateParams(updatedSettings.fsrs);
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
   */
  openCardBrowser() {
    const browserDialog = createVueDialog({
      title: this.i18n?.cardBrowser || '卡片浏览器',
      component: CardBrowser,
      props: {
        app: this.app,
        i18n: this.i18n || {},
        mode: 'dialog',
        plugin: this,
      },
      events: {
        convertToTab: () => {
          // 关闭对话框并打开 Tab
          browserDialog.destroy();
          this.openCardBrowserTab();
        },
      },
      width: '90vw',
      height: '80vh',
    });
  }

  /**
   * 打开卡片浏览器（Tab 模式）
   */
  openCardBrowserTab() {
    openTab({
      app: this.app,
      custom: {
        icon: 'iconCard',
        title: this.i18n?.cardBrowser || '卡片浏览器',
        id: this.name + this.TAB_TYPE,
        data: {},
      },
      position: 'right',
    });
  }

  /**
   * 打开复习面板（弹窗模式）- 使用思源 riff API
   */
  async openReviewDialog() {
    // 如果已经打开，先关闭
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
    }

    try {
      // 创建复习对话框
      const session = new RetrievalPracticeQueue({ deckID: riff.BUILTIN_DECK_ID });
      this.reviewDialog = createVueDialog({
        title: this.i18n?.reviewTitle || 'FSRS 复习',
        component: ReviewPanel,
        props: {
          cards: [],
          deckID: riff.BUILTIN_DECK_ID,
          app: this.app,
          i18n: this.i18n || {},
          drillMode: true,
          practiceMode: 'retrieval-practice',
          queueSession: session as any,
        },
        events: {
          close: () => {
            this.reviewDialog?.destroy();
          },
        },
        width: '80vw',  // 使用视窗百分比，响应式
        height: '70vh',
        onClose: () => {
          this.reviewDialog = null;
        },
      });

      // 设置对话框样式（与思源原生一致）
      const dialogEl = this.reviewDialog.dialog.element;
      const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
      const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

      if (scrim) {
        scrim.style.backgroundColor = 'var(--b3-theme-surface)';
      }
      if (container) {
        container.style.maxWidth = '1024px';
      }

      // 聚焦到筛选按钮
      setTimeout(() => {
        const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
        if (focusEl) {
          focusEl.focus();
        }
      }, 100);
    } catch (err) {
      console.error('[FSRS] Failed to get due cards:', err);
    }
  }

  async openLeechReviewDialog() {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
    }
    try {
      const settings = this.storage?.getSettings?.();
      const leech = (settings as any)?.leech || {};
      const session = new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Number(leech.threshold) || 8,
        action: (leech.action || 'notify') as any,
        tagName: String(leech.tagName || ''),
      });
      this.reviewDialog = createVueDialog({
        title: (this.i18n as any)?.startLeechPractice || '难点攻坚',
        component: ReviewPanel,
        props: {
          cards: [],
          deckID: riff.BUILTIN_DECK_ID,
          app: this.app,
          i18n: this.i18n || {},
          drillMode: true,
          practiceMode: 'leech',
          queueSession: session as any,
        },
        events: {
          close: () => {
            this.reviewDialog?.destroy();
          },
        },
        width: '80vw',
        height: '70vh',
        onClose: () => {
          this.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open leech review dialog:', err);
      try {
        await pushErrMsg('难点攻坚启动失败');
      } catch {}
    }
  }

  async openDrillDialog() {
    await this.startPracticeQueue();
  }

  openFinalDrillDialog() {
    this.openCardBrowser();
  }

  openDeliberatePracticeDialog() {
    this.openFinalDrillDialog();
  }

  openFilterGroupPracticeDialog() {
    this.openCardBrowser();
  }

  async openNeuralRoamDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    if (!this.isInitialized) {
      await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
      return;
    }
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
    }

    try {
      const session = new NeuralRoamQueue({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this.i18n || {},
        seedBlockId: options?.seedBlockId,
        includeSeedAsFirst: options?.includeSeedAsFirst,
      });
      this.reviewDialog = createVueDialog({
        title: this.i18n?.neuralReviewTitle || '神经复习',
        component: ReviewPanel,
        props: {
          cards: [],
          deckID: riff.BUILTIN_DECK_ID,
          app: this.app,
          i18n: this.i18n || {},
          drillMode: true,
          practiceMode: 'neural-roam',
          queueSession: session as any,
        },
        events: {
          close: () => {
            this.reviewDialog?.destroy();
          },
        },
        width: '80vw',
        height: '70vh',
        onClose: () => {
          this.reviewDialog = null;
        },
      });
    } catch (err) {
      console.error('[FSRS] Failed to open neural review dialog:', err);
      await pushErrMsg(this.i18n?.neuralReviewFailed || '神经复习启动失败');
    }
  }

  async openNeuralReviewDialog(options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) {
    await this.openNeuralRoamDialog(options);
  }

  async openSubsetReviewDialog(blockIds: string[]) {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
    }
    const ids = Array.from(new Set((blockIds || []).map((x) => String(x || '')).filter(Boolean)));
    if (ids.length === 0) {
      await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }
    const session = new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID });
    this.reviewDialog = createVueDialog({
      title: (this.i18n?.reviewSubsetTitleWithCount || '子集复习 ({n} 张)').replace('{n}', String(ids.length)),
      component: ReviewPanel,
      props: {
        cards: [],
        deckID: riff.BUILTIN_DECK_ID,
        app: this.app,
        i18n: this.i18n || {},
        drillMode: true,
        practiceMode: 'retrieval-practice',
        queueSession: session as any,
      },
      events: {
        close: () => {
          this.reviewDialog?.destroy();
        },
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.reviewDialog = null;
      },
    });
  }

  private openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
    }
    const modeLabel = practiceMode === 'block'
      ? (this.i18n?.blockModeLabel || '块练习')
      : (this.i18n?.queueModeLabel || '队列练习');
    const blockTitleTemplate = this.i18n?.blockPracticeTitleWithCount || '当前练习队列：{n}张闪卡';
    const blockTitle = blockTitleTemplate.replace('{n}', String(cards.length));
    this.reviewDialog = createVueDialog({
      title: practiceMode === 'block'
        ? blockTitle
        : (cards.length > 0 ? `${modeLabel} (${cards.length} 张)` : modeLabel),
      component: ReviewPanel,
      props: {
        cards: cards,
        deckID: riff.BUILTIN_DECK_ID,
        app: this.app,
        i18n: this.i18n || {},
        drillMode: true,
        practiceMode,
      },
      events: {
        close: () => {
          this.reviewDialog?.destroy();
        },
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.reviewDialog = null;
      },
    });

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
            <button class="fsrs-dock-btn b3-button b3-button--outline" id="fsrs-card-browser">
              <svg class="b3-button__icon"><use xlink:href="#iconLayoutRight"></use></svg>
              ${this.i18n?.cardBrowser || '卡片浏览器'}
            </button>
          </div>
        </div>
      </div>
    `;

    // 绑定按钮事件
    element.querySelector('#fsrs-start-review')?.addEventListener('click', () => {
      this.openReviewDialog();
    });

    element.querySelector('#fsrs-card-browser')?.addEventListener('click', () => {
      this.openCardBrowser();
    });
  }












  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  private handleBlockIconClick(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const blockElements: HTMLElement[] = detail?.blockElements || [];

    if (!menu || blockElements.length === 0) {
      return;
    }

    const blockIds = blockElements
      .map(el => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    if (blockIds.length === 0) {
      return;
    }

    const hasUncarded = blockElements.some(el => !el.hasAttribute(ATTR_CARD_ID));
    const hasCarded = blockElements.some(el => el.hasAttribute(ATTR_CARD_ID));
    const drillBlocks = this.getDrillBlockElements(blockElements);
    const drillCount = drillBlocks.length;
    const drillLabel = `<span title="${this.i18n?.drillHint || '将当前块及子块中的闪卡加入机械练习队列'}">${this.i18n?.blockModeLabel || '块练习'}</span> <span class="ft__secondary">(${drillCount})</span>`;

    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        if (drillCount === 0) {
          await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        try {
          const cards = this.buildDrillCardsFromElements(drillBlocks);
          if (cards.length === 0) {
            await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from blocks:', err);
          await pushErrMsg(this.i18n?.drillFailed || '机械练习启动失败');
        }
      },
    });

    menu.addItem({
      icon: 'iconRefresh',
      label: this.i18n?.startNeuralReviewFromHere || '从此处开始神经复习',
      click: async () => {
        const seedBlockId = blockIds[0];
        const includeSeedAsFirst = Boolean(blockElements[0]?.hasAttribute?.(ATTR_CARD_ID));
        try {
          await this.openNeuralReviewDialog({ seedBlockId, includeSeedAsFirst, resetHistory: true });
        } catch (err) {
          console.error('[FSRS] Failed to open neural review from block:', err);
          await pushErrMsg(this.i18n?.neuralReviewFailed || '神经复习启动失败');
        }
      },
    });

    // 编辑 SRS 数据 - 支持新卡（有 ATTR_CARD_ID）和老 riff 卡（只在 riff 数据库中）
    menu.addItem({
      icon: 'iconEdit',
      label: this.i18n?.editSrsData || '编辑SRS数据',
      click: async () => {
        // 优先查找有 ATTR_CARD_ID 的新卡
        let target = blockElements.find(el => el.hasAttribute(ATTR_CARD_ID));
        let blockID = target?.getAttribute('data-node-id');
        let cardID = target?.getAttribute(ATTR_CARD_ID);

        // 如果没找到，尝试从 riff API 查询老卡
        if (!cardID && blockIds.length > 0) {
          try {
            console.log('[FSRS] Querying riff cards for blockIds:', blockIds);
            const riffBlocks = await getRiffCardsByBlockIDs(blockIds);
            console.log('[FSRS] Riff API response:', riffBlocks);

            if (riffBlocks.length > 0) {
              const riffBlock = riffBlocks[0];
              blockID = riffBlock.id || blockIds[0];

              // 尝试从多个位置获取卡片 ID
              // 1. 从 riffCard 子对象（新版本格式）
              // 2. 从 ial 属性中的 custom-riff-decks（老版本格式）
              // 3. 如果都没有，使用块 ID 作为标识（SrsEditorDialog 会自己查询）
              cardID = riffBlock.riffCard?.id
                || riffBlock.ial?.['custom-riff-decks']?.split(',')[0]
                || blockID; // 使用 blockID 作为后备

              console.log('[FSRS] Resolved blockID:', blockID, 'cardID:', cardID);
            }
          } catch (err) {
            console.warn('[FSRS] Failed to query riff cards:', err);
          }
        }

        if (!blockID || !cardID) {
          pushErrMsg(this.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
          return;
        }
        createVueDialog({
          title: this.i18n?.editSrsData || '编辑SRS数据',
          component: SrsEditorDialog,
          props: {
            card: {
              cardID,
              blockID,
              deckID: riff.BUILTIN_DECK_ID,
            },
            deckID: riff.BUILTIN_DECK_ID,
            i18n: this.i18n || {},
          },
          width: '760px',
          height: '70vh',
        });
      },
    });

    if (hasUncarded) {
      menu.addItem({
        icon: 'iconAdd',
        label: this.i18n?.makeCardFromSelection || '选中制卡',
        click: async () => {
          let createdCount = 0;

          for (const element of blockElements) {
            if (element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            if (!blockId) {
              continue;
            }
            try {
              const card = createDefaultCard(blockId);
              await markBlockAsCard(blockId, card.id, card.priority);
              this.storage.setCard(card);
              createdCount++;
            } catch (err) {
              console.error('[FSRS] Failed to create card from block:', blockId, err);
            }
          }

          if (createdCount > 0) {
            await this.storage.saveCards();
            await pushMsg((this.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
          } else {
            await pushMsg(this.i18n?.msg_already_cards || '选中的块已经是闪卡');
          }
        },
      });
    }

    if (hasCarded) {
      menu.addItem({
        icon: 'iconTrashcan',
        label: '取消闪卡',
        click: async () => {
          let removedCount = 0;

          for (const element of blockElements) {
            if (!element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            const cardId = element.getAttribute(ATTR_CARD_ID);
            if (!blockId || !cardId) {
              continue;
            }
            try {
              await unmarkBlockAsCard(blockId);
              this.storage.removeCard(cardId);
              removedCount++;
            } catch (err) {
              console.error('[FSRS] Failed to remove card from block:', blockId, err);
            }
          }

          if (removedCount > 0) {
            await this.storage.saveCards();
            await pushMsg((this.i18n?.msg_unmarked || '已取消 {n} 张闪卡').replace('{n}', String(removedCount)));
          } else {
            await pushMsg(this.i18n?.msg_no_removable || '未找到可取消的闪卡');
          }
        },
      });
    }

    if (!hasUncarded && !hasCarded) {
      pushErrMsg(this.i18n?.msg_no_operable_blocks || '未找到可操作的块');
    }
  }

  private async handleEditorTitleIconClick(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const docInfo = detail?.data;
    const docId = docInfo?.rootID || docInfo?.id;
    if (!menu || !docId) {
      return;
    }
    const drillLabel = this.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from doc menu:', err);
          await pushErrMsg(this.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  private async handleBreadcrumbMore(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const protyle = detail?.protyle;
    const docId = protyle?.block?.rootID || protyle?.block?.id;
    if (!menu || !docId) {
      return;
    }
    const drillLabel = this.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from breadcrumb menu:', err);
          await pushErrMsg(this.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  private getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    const seen = new Set<string>();
    const result: HTMLElement[] = [];
    const roots = blockElements.map(el => (el.closest('[data-node-id]') as HTMLElement) || el);
    for (const root of roots) {
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))];
      for (const node of nodes) {
        const id = node.getAttribute('data-node-id');
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        if (node.hasAttribute(ATTR_CARD_ID)) {
          result.push(node);
        }
      }
    }
    return result;
  }

  private buildDrillCardsFromElements(elements: HTMLElement[]) {
    const result: any[] = [];
    const seen = new Set<string>();
    for (const el of elements) {
      const blockID = el.getAttribute('data-node-id');
      const cardID = el.getAttribute(ATTR_CARD_ID);
      if (!blockID || !cardID || seen.has(cardID)) {
        continue;
      }
      seen.add(cardID);
      result.push({
        cardID,
        blockID,
        deckID: riff.BUILTIN_DECK_ID,
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
        state: 0,
        lapses: 0,
        reps: 0,
      });
    }
    return result;
  }

  private async getDrillCardsFromDocTree(docId: string) {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  private async buildDrillCardsFromBlockIds(blockIds: string[]) {
    const uniqueIds = Array.from(new Set(blockIds));
    if (uniqueIds.length === 0) {
      return [];
    }
    const result: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map(id => `'${id}'`).join(',');
      const rows = await sql(`SELECT block_id, value FROM attributes WHERE name = '${ATTR_CARD_ID}' AND block_id IN (${idsStr}) AND value != ''`);
      for (const row of rows) {
        const blockID = row.block_id || row.blockID;
        const cardID = row.value || row.card_id || row.cardID;
        if (!blockID || !cardID || seen.has(cardID)) {
          continue;
        }
        seen.add(cardID);
        result.push({
          cardID,
          blockID,
          deckID: riff.BUILTIN_DECK_ID,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
          state: 0,
          lapses: 0,
          reps: 0,
        });
      }
    }
    return result;
  }

  private async getPracticeQueueBlockIds(filter: PracticeQueueFilter): Promise<string[]> {
    if (!filter.value) {
      return [];
    }
    return getCardBlockIds({ type: filter.type, value: filter.value });
  }

  private async previewPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    return blockIds.length;
  }

  private async addPracticeQueue(filter: PracticeQueueFilter): Promise<number> {
    const blockIds = await this.getPracticeQueueBlockIds(filter);
    if (blockIds.length === 0) {
      return 0;
    }
    const cards = await this.buildDrillCardsFromBlockIds(blockIds);
    return this.extractionQueue.addItems(cards as QueueItem[]);
  }

  private async clearPracticeQueue(): Promise<void> {
    await this.extractionQueue.clear();
  }

  private async startPracticeQueue(): Promise<void> {
    const cards = this.extractionQueue.getAllItems();
    if (cards.length === 0) {
      await pushMsg(this.i18n?.practiceQueueEmpty || '练习队列为空');
      return;
    }
    this.openDrillDialogWithCards(cards, 'queue');
  }





  /**
   * 获取到期卡片数量
   */
  getDueCount(): number {
    return this.storage.getDueCards().length;
  }
}
