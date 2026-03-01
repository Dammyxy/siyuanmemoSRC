<template>
  <div
    ref="rootRef"
    class="fsrs-review-v2"
    :class="{ 'fsrs-review-v2--mobile': props.isMobile }"
    data-key="dialog-opencard"
    @click="handleRootClick"
  >
    <!-- 📝 复习内容区 -->
    <div class="fsrs-review-v2__content-wrapper">
      <ReviewHeader
        :header="state.header"
        :is-tab-mode="!!props.reviewUI"
        :title="props.title"
        :mode="props.mode"
        :is-mobile="props.isMobile"
        :navigation-state="state.header.navigationState"
        @toolbar-action="handleToolbarAction"
        @action="hook.executeCommand"
        @context="handleContext"
        @breadcrumb-click="handleBreadcrumbClick"
      />

      <ReviewContent :app="app" :plugin="props.plugin" :content="state.content" :overlay="state.overlay" :has-hidden-content="state.meta.hasHiddenContent" :show-answer="state.actions.showAnswer" :meta="state.meta" :i18n="i18n" />

      <ReviewActions
        :actions="state.actions"
        :meta="state.meta"
        :i18n="i18n"
        :queue="providerQueue || props.queue"
        :plugin="props.plugin"
        :is-mobile="props.isMobile"
        @reveal="hook.reveal"
        @grade="hook.grade"
        @skip="hook.skip"
        @back="hook.back"
        @command="hook.executeCommand"
        @openMenu="handleOpenMenu"
      />

      <div v-if="state.meta.resumePrompt" class="fsrs-review-v2-resume">
        <div class="fsrs-review-v2-resume__panel b3-card">
          <div class="fsrs-review-v2-resume__title">{{ t('resumePromptTitle', '发现未完成的练习') }}</div>
          <div class="fsrs-review-v2-resume__desc ft__secondary">
            {{ state.meta.resumePrompt.message }}
          </div>
          <div class="fsrs-review-v2-resume__actions">
            <button class="b3-button b3-button--cancel" type="button" @click="hook.executeCommand('resume-start-over')">
              {{ t('resumeStartOver', '从头开始') }}
            </button>
            <button class="b3-button b3-button--text" type="button" @click="hook.executeCommand('resume-continue')">
              {{ t('resumeContinue', '继续练习') }}
            </button>
          </div>
        </div>
      </div>

      <teleport to="body">
        <div
          v-if="showReviewFilterDialog"
          class="review-filter-dialog-overlay"
          :class="{ 'review-filter-dialog-overlay--mobile': props.isMobile }"
          @click.self="showReviewFilterDialog = false"
        >
          <div class="review-filter-dialog-container">
            <FilterDialog
              :is-open="showReviewFilterDialog"
              :initial-filter="appliedReviewFilter"
              :i18n="i18n"
              @apply="handleApplyReviewFilter"
              @cancel="showReviewFilterDialog = false"
              @clear="handleClearReviewFilter"
              @rebuild="handleRebuildReviewFilterQueue"
            />
          </div>
        </div>
      </teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Menu, openTab, showMessage, type App } from 'siyuan';
import { onMounted, onUnmounted, ref } from 'vue';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import FilterDialog from '@/ui/browser/dialogs/FilterDialog.vue';
import { useReviewSession } from './useReviewSession';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { ProviderBackedQueueStrategy, type QueueProvider } from '@/core/extensions';
import { createVueDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import {
  type CardFilter,
  isNeuralRoamSessionQueue,
  type NeuralRoamHistoryEntry,
  type NeuralRoamSessionQueue,
} from '@/types/unified-data-source';

const logger = createLogger('ReviewView');

type ReviewProviderLike = {
  id?: string;
  displayName?: string;
  skipBehavior?: 'drop' | 'rotate' | string;
  getProgress?: () => unknown;
  getResumePrompt?: () => { message: string; data: unknown } | null;
};

type ReviewUIConfigLike = {
  adapter?: {
    toUIState: (provider: unknown, item: unknown, context: unknown) => Promise<unknown>;
    fetchAuxiliaryData?: (item: unknown) => Promise<unknown>;
  };
  context?: {
    queue?: Record<string, unknown>;
    uiConfig?: {
      statsType: 'infinite' | 'queue-size' | 'riff-counts';
      showRatingButtons: boolean;
      allowSkip: boolean;
      hiddenContentTypes?: string[];
      customButtons?: Array<{
        actionId: string;
        label: string;
        icon?: string;
        danger?: boolean;
        variant?: 'ghost' | 'info';
      }>;
      menuCommands?: IQueueCommand<unknown>[];
    };
  };
};

type ReviewPluginContextLike = {
  getDialogManager?: () =>
    | {
        openBrowserDialog?: (options?: {
          initialQueueId?: string;
          initialNeuralSubview?: 'concept-cards' | 'focus-blocks' | 'roam-history';
        }) => void;
      }
    | undefined;
  getTabManager?: () =>
    | {
        openReviewTab: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
        }) => void;
        openReviewTabInNewTab?: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
        }) => void;
        openReviewInNewWindow?: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
        }) => void;
      }
    | undefined;
  getHybridSyncService?: () => { incrementalSync: () => Promise<void> } | undefined;
  getStorage?: () => {
    getSettings?: () => {
      riffIntegration?: {
        mode?: string;
        incrementalSync?: {
          enabled?: boolean;
          triggers?: string[];
        };
      };
    };
    getCardByBlockId?: (blockId: string) => { id: string } | undefined;
  };
  getReviewService?: () => {
    getSiyuanApi?: () => {
      BUILTIN_DECK_ID: string;
    } | undefined;
  };
};

type ReviewPluginLike = {
  name?: unknown;
  getContext?: () => ReviewPluginContextLike | undefined;
  openReviewTab?: (options: {
    provider?: unknown;
    queue?: unknown;
    adapter?: unknown;
    title: string;
  }) => void;
};

type UnderlyingQueueLike = {
  name?: string;
  removeCard?: (blockId: string) => Promise<void>;
  lockCurrentAsFocus?: (blockId: string, priority?: 'normal' | 'high') => Promise<void>;
} & Partial<NeuralRoamSessionQueue>;

type FilterGroupQueueLike = {
  setFilter?: (filter: CardFilter) => Promise<void> | void;
  getFilter?: () => CardFilter;
  rebuild?: () => Promise<void> | void;
};

type QueueStrategyWithUnderlying = {
  getUnderlyingQueue?: () => unknown;
};

type CommandLike = {
  id?: unknown;
  label?: unknown;
  icon?: string;
};

type ProtyleLike = {
  resize?: () => void;
};

type ProtyleHostElement = HTMLElement & {
  __vnode__?: { ctx?: { protyle?: ProtyleLike } };
  __vueParentComponent?: { protyle?: ProtyleLike };
};

type WindowWithReviewPlugin = Window & {
  siyuanMemoPlugin?: ReviewPluginLike;
  siyuan?: {
    ws?: {
      app?: {
        plugins?: unknown[];
      };
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPluginContext(plugin: unknown): ReviewPluginContextLike | undefined {
  return (plugin as ReviewPluginLike | undefined)?.getContext?.();
}

function getWindowPlugin(): ReviewPluginLike | null {
  const runtimeWindow = window as WindowWithReviewPlugin;
  if (runtimeWindow.siyuanMemoPlugin) {
    return runtimeWindow.siyuanMemoPlugin;
  }

  const plugins = runtimeWindow.siyuan?.ws?.app?.plugins;
  if (!Array.isArray(plugins)) {
    return null;
  }

  const matched = plugins.find((plugin) => {
    if (!isRecord(plugin)) {
      return false;
    }
    return String(plugin.name ?? '') === 'siyuan-plugin-siyuanmemo';
  });

  return isRecord(matched) ? (matched as ReviewPluginLike) : null;
}

function getProtyleFromHost(host: Element): ProtyleLike | null {
  const protyleHost = host as ProtyleHostElement;
  return protyleHost.__vnode__?.ctx?.protyle || protyleHost.__vueParentComponent?.protyle || null;
}

function getCommandLike(cmd: unknown): CommandLike {
  if (!isRecord(cmd)) {
    return {};
  }
  return {
    id: cmd.id,
    label: cmd.label,
    icon: typeof cmd.icon === 'string' ? cmd.icon : undefined,
  };
}

const props = defineProps<{
  app: App;
  i18n?: Record<string, string>;
  queue?: unknown;
  adapter?: unknown;
  provider?: unknown;
  reviewUI?: ReviewUIConfigLike;
  title?: string; // 队列标题（如"提取练习"）
  mode?: 'dialog' | 'tab'; // 🆕 打开模式（对话框/Tab）
  plugin?: unknown; // 🆕 插件实例，用于访问 hybridSyncService
  isMobile?: boolean;
  onReview?: (cardId: string, rating: number) => void; // 🆕 复习回调（用于刻意练习黑名单）
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
  (e: 'close'): void; // 添加关闭事件
  (e: 'convert-to-tab'): void; // 🆕 转换为 Tab 模式（kebab-case）
}>();

const rootRef = ref<HTMLDivElement | null>(null);

// 🆕 防重复触发机制 - 使用更智能的策略
let lastKeyPressTime = 0;
let lastKeyPressed = '';
let isProcessingKey = false; // 标记是否正在处理按键
const KEY_PRESS_DEBOUNCE = 30; // 30ms 内的重复按键视为同一次（进一步降低延迟）

function shouldIgnoreDuplicateKey(key: string): boolean {
  const now = Date.now();
  const timeSinceLastPress = now - lastKeyPressTime;
  
  // 如果正在处理同一个按键，直接忽略
  if (isProcessingKey && key === lastKeyPressed) {
    logger.debug('[SiYuanMemo][ReviewView] Key is being processed, ignoring:', key);
    return true;
  }
  
  // 如果是相同按键且在防抖时间内，忽略
  if (key === lastKeyPressed && timeSinceLastPress < KEY_PRESS_DEBOUNCE) {
    logger.debug('[SiYuanMemo][ReviewView] Ignoring duplicate key press:', key, 'timeSince:', timeSinceLastPress);
    return true;
  }
  
  lastKeyPressTime = now;
  lastKeyPressed = key;
  isProcessingKey = true;
  
  // 30ms 后重置处理标记
  setTimeout(() => {
    isProcessingKey = false;
  }, KEY_PRESS_DEBOUNCE);
  
  return false;
}

function getUnderlyingQueueFromStrategy(strategy: unknown): UnderlyingQueueLike | null {
  if (!isRecord(strategy)) {
    return null;
  }

  const getUnderlyingQueue = (strategy as QueueStrategyWithUnderlying).getUnderlyingQueue;
  if (typeof getUnderlyingQueue !== 'function') {
    return null;
  }

  try {
    // 必须绑定 strategy 作为 this，避免方法解构后 this 丢失。
    const underlying = getUnderlyingQueue.call(strategy);
    return isRecord(underlying) ? (underlying as UnderlyingQueueLike) : null;
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to resolve underlying queue:', error);
    return null;
  }
}

function getUnderlyingQueue(): UnderlyingQueueLike | null {
  return getUnderlyingQueueFromStrategy(hook.getQueueStrategy());
}

function getFilterGroupQueue(): FilterGroupQueueLike | null {
  const queue = getUnderlyingQueue();
  if (!queue) {
    return null;
  }
  const candidate = queue as FilterGroupQueueLike;
  if (typeof candidate.setFilter !== 'function' || typeof candidate.rebuild !== 'function') {
    return null;
  }
  return candidate;
}

function getNeuralRoamQueue(): NeuralRoamSessionQueue | null {
  const underlyingQueue = getUnderlyingQueue();
  if (!isNeuralRoamSessionQueue(underlyingQueue)) {
    return null;
  }
  return underlyingQueue;
}

function getDialogManager() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getDialogManager?.() || contextFromWindow?.getDialogManager?.() || null;
}

function openNeuralBrowserSubview(subview: 'focus-blocks' | 'roam-history'): void {
  const dialogManager = getDialogManager();
  if (!dialogManager || typeof dialogManager.openBrowserDialog !== 'function') {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }
  dialogManager.openBrowserDialog({
    initialQueueId: 'neural-roam',
    initialNeuralSubview: subview,
  });
}

// 组件挂载
onMounted(() => {
  logger.debug('[SiYuanMemo][ReviewView] Component mounted');
  logger.debug('[SiYuanMemo][ReviewView] Checking environment:', {
    hasRootRef: !!rootRef.value,
    rootElement: rootRef.value,
    rootDataKey: rootRef.value?.getAttribute('data-key'),
    inDialog: !!document.querySelector('.b3-dialog__container'),
    dialogElements: document.querySelectorAll('.b3-dialog__container').length,
    ourDialog: document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]'),
  });

  // 🆕 添加键盘事件监听器
  document.addEventListener('keydown', handleKeyDown);
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener added');

  // 🌌 恢复侧边栏状态（已删除）

  // 🆕 触发增量同步（如果启用）
  const context = getPluginContext(props.plugin);
  const hybridSyncService = context?.getHybridSyncService?.();
  if (hybridSyncService) {
    const storage = context?.getStorage?.();
    const riffConfig = storage?.getSettings?.()?.riffIntegration;
    if (riffConfig?.mode === 'advanced' &&
        riffConfig?.incrementalSync?.enabled &&
        riffConfig?.incrementalSync?.triggers?.includes('review-open')) {
      // 后台执行增量同步，不阻塞 UI
      void hybridSyncService.incrementalSync().catch((err: Error) => {
        logger.error('[ReviewView] Incremental sync failed:', err);
      });
    }
  }

  // 🆕 初始化导航状态（Phase 3: UI 控件）
  refreshNavigationState();
  syncReviewFilterFromQueue();
});

// 🆕 组件卸载时移除键盘事件监听器
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener removed');
});

const providerAdapter = props.reviewUI?.adapter;
const provider = props.provider as QueueProvider<unknown> | undefined;
const providerLike = provider as (QueueProvider<unknown> & ReviewProviderLike) | undefined;
const providerQueue = provider && providerAdapter
  ? new ProviderBackedQueueStrategy(provider, {
      providerOptions: props.reviewUI?.context?.queue || {},
      uiConfig: props.reviewUI?.context?.uiConfig || { statsType: 'queue-size', showRatingButtons: true, allowSkip: true },
      statsLabel: String(providerLike?.displayName || providerLike?.id || ''),
      skipBehavior: providerLike?.skipBehavior === 'rotate' || String(providerLike?.id || '') === 'final-drill' ? 'rotate' : 'drop',
      getProgress: typeof providerLike?.getProgress === 'function' ? () => providerLike.getProgress() : undefined,
      getResumePrompt: typeof providerLike?.getResumePrompt === 'function' ? () => providerLike.getResumePrompt() : undefined,
    })
  : null;

const bridgedAdapter = provider && providerAdapter
  ? {
      toUIState: (_queue: unknown, item: unknown, context: unknown) => providerAdapter.toUIState(provider, item, context),
      fetchAuxiliaryData: typeof providerAdapter.fetchAuxiliaryData === 'function'
        ? (item: unknown) => providerAdapter.fetchAuxiliaryData(item)
        : undefined,
    }
  : null;

const hook = useReviewSession(
  providerQueue || props.queue, 
  bridgedAdapter || props.adapter,
  {
    onReview: props.onReview, // 🆕 传递 onReview 回调
  }
);
const state = hook.state;
const app = props.app;
const i18n = props.i18n;
const showReviewFilterDialog = ref(false);
const appliedReviewFilter = ref<CardFilter | null>(null);

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

const RATING_KEYS = new Set(['1', '2', '3', '4']);
const SKIP_KEYS = new Set(['0', 'x', 's']);
const BACK_KEYS = new Set(['p', 'q']);

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

function isTopicCard(): boolean {
  const cardMeta = state.value.actions.cardMeta;
  return cardMeta?.type === 'topic' || cardMeta?.cardType === 'topic';
}

function handleReviewKeyAction(
  source: 'hotkey' | 'keydown',
  key: string,
  event: Pick<KeyboardEvent, 'preventDefault' | 'stopPropagation'>
): void {
  if (shouldIgnoreDuplicateKey(key)) {
    return;
  }

  logger.debug('[SiYuanMemo][ReviewView] Key action:', {
    source,
    key,
    answerShown: hook.context.value.showAnswer,
    blockId: state.value.actions.cardMeta?.blockID,
    cardId: state.value.actions.cardMeta?.cardID,
    cardType: state.value.actions.cardMeta?.cardType || state.value.actions.cardMeta?.type,
  });

  if (key === ' ' || key === 'enter') {
    event.preventDefault();
    event.stopPropagation();

    if (!hook.context.value.showAnswer) {
      if (isTopicCard()) {
        logger.debug('[SiYuanMemo][ReviewView] Topic card - grading with 3 (Good)', {
          blockId: state.value.actions.cardMeta?.blockID,
          cardId: state.value.actions.cardMeta?.cardID,
          cardType: state.value.actions.cardMeta?.cardType || state.value.actions.cardMeta?.type,
        });
        void hook.grade(3);
      } else {
        logger.debug('[SiYuanMemo][ReviewView] Revealing answer...', {
          blockId: state.value.actions.cardMeta?.blockID,
          cardId: state.value.actions.cardMeta?.cardID,
          cardType: state.value.actions.cardMeta?.cardType || state.value.actions.cardMeta?.type,
        });
        hook.reveal();
      }
    } else {
      logger.debug('[SiYuanMemo][ReviewView] Answer shown - grading with 3 (Good)');
      void hook.grade(3);
    }
    return;
  }

  if (RATING_KEYS.has(key)) {
    if (hook.context.value.showAnswer) {
      event.preventDefault();
      event.stopPropagation();
      logger.debug('[SiYuanMemo][ReviewView] Grading with rating:', key);
      void hook.grade(Number(key));
    } else {
      logger.debug('[SiYuanMemo][ReviewView] Rating key pressed but answer not shown, ignoring');
    }
    return;
  }

  if (SKIP_KEYS.has(key)) {
    event.preventDefault();
    event.stopPropagation();
    logger.debug('[SiYuanMemo][ReviewView] Skipping card...');
    void hook.skip();
    return;
  }

  if (BACK_KEYS.has(key)) {
    event.preventDefault();
    event.stopPropagation();
    logger.debug('[SiYuanMemo][ReviewView] Going back...');
    void hook.back();
  }
}

// 处理来自思源热键系统的 CustomEvent
function handleRootClick(e: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleRootClick triggered:', {
    detail: e.detail,
    detailType: typeof e.detail,
    target: e.target,
    currentTarget: e.currentTarget,
  });

  // 只处理来自思源热键系统的 CustomEvent（event.detail 为字符串）
  if (typeof e.detail !== 'string') return;

  const key = e.detail.toLowerCase();
  handleReviewKeyAction('hotkey', key, e);
}

// 🆕 处理标准键盘事件
function handleKeyDown(e: KeyboardEvent) {
  // 忽略在输入框中的按键
  if (isTypingTarget(e.target)) {
    return;
  }

  const key = e.key.toLowerCase();
  handleReviewKeyAction('keydown', key, e);
}

function handleOpenMenu(menuCommands: IQueueCommand<unknown>[], ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenMenu called:', {
    currentTarget: ev.currentTarget,
    clientX: ev.clientX,
    clientY: ev.clientY,
    target: ev.target,
  });

  const cmds = Array.isArray(menuCommands) ? menuCommands : [];
  const cardMeta = state.value.actions.cardMeta;
  const currentCard = state.value.content.card;

  const menu = new Menu();

  // 添加卡片统计(只读项)
  if (cardMeta) {
    menu.addItem({
      id: 'card-stats',
      type: 'readonly',
      labelHTML: buildCardStatsHTML(cardMeta),
    });
    menu.addSeparator();
  }

  // Part 5: 添加"打开"子菜单
  if (currentCard?.blockId) {
    menu.addItem({
      icon: 'iconOpen',
      label: t('openCard', 'Open'),
      submenu: [
        {
          icon: 'iconTab',
          label: t('openInNewTab', 'New Tab'),
          click: () => openCardInTab(currentCard.blockId, false),
        },
        {
          icon: 'iconLayoutRight',
          label: t('openInRight', 'Right Side'),
          click: () => openCardInTab(currentCard.blockId, true),
        },
        // 注释掉"使用新窗口打开"选项
        // {
        //   icon: 'iconExport',
        //   label: t('openInNewWindow', 'New Window'),
        //   click: () => openCardInNewWindow(currentCard.blockId),
        // },
      ],
    });
    menu.addSeparator();
  }

  // Part 4: 添加"编辑 SRS 数据"菜单项
  if (currentCard?.blockId) {
    menu.addItem({
      icon: 'iconEdit',
      label: t('editSrsData', '编辑 SRS 数据'),
      click: () => {
        void openSrsEditorDialog(currentCard.blockId);
      },
    });
    menu.addSeparator();
  }

  // 标准菜单项
  for (const cmd of cmds) {
    const command = getCommandLike(cmd);
    const id = String(command.id || '');
    const label = String(command.label || '');
    if (!id || !label) continue;
    menu.addItem({
      icon: command.icon,
      label,
      click: () => {
        void hook.executeCommand(id);
      },
    });
  }

  // 使用按钮位置定位菜单（与思源原生闪卡一致）
  const target = ev.currentTarget as HTMLElement;
  if (!target) {
    logger.error('[SiYuanMemo][ReviewView] Cannot open menu: currentTarget is null');
    return;
  }

  const rect = target.getBoundingClientRect();
  logger.debug('[SiYuanMemo][ReviewView] Opening menu at button position:', {
    rectLeft: rect.left,
    rectBottom: rect.bottom,
    rectTop: rect.top,
    rectRight: rect.right,
  });
  menu.open({ x: rect.left, y: rect.bottom });
}

function buildCardStatsHTML(meta: NonNullable<ReviewUIState['actions']['cardMeta']>): string {
  const stateText = meta.isReviewCard
    ? t('reviewCard', 'Review Card')
    : t('newCard', 'New Card');

  const lastReview = meta.lastReview && meta.lastReview > 0
    ? new Date(meta.lastReview).toISOString().split('T')[0]
    : '';

  return `
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('lapses', '遗忘次数')}</div>
      <div class="fn__space"></div>
      <div>${meta.lapses ?? 0}</div>
    </div>
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('reps', '复习次数')}</div>
      <div class="fn__space"></div>
      <div>${meta.reps ?? 0}</div>
    </div>
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('cardState', '卡片状态')}</div>
      <div class="fn__space"></div>
      <div class="${meta.isReviewCard ? 'ft__success' : 'ft__primary'}">
        ${stateText}
      </div>
    </div>
    <div class="fn__flex ${!lastReview ? 'fn__none' : ''}">
      <div class="fn__flex-1 ft__breakword" style="width: 170px;">
        ${t('lastReview', '上次复习')}
      </div>
      <div class="fn__space"></div>
      <div>${lastReview}</div>
    </div>
  `;
}

function handleContext(payload: { id: string; openNewTab: boolean }) {
  const id = String(payload?.id || '');
  if (!id || !props.app) return;
  void openTab({
    app: props.app,
    doc: { id },
    openNewTab: Boolean(payload?.openNewTab),
  });
}

function syncReviewFilterFromQueue(): void {
  const filterQueue = getFilterGroupQueue();
  if (!filterQueue || typeof filterQueue.getFilter !== 'function') {
    appliedReviewFilter.value = null;
    return;
  }

  try {
    const nextFilter = filterQueue.getFilter();
    appliedReviewFilter.value = nextFilter ? { ...nextFilter } : null;
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to read filter-group filter:', error);
    appliedReviewFilter.value = null;
  }
}

async function applyFilterAndReload(filter: CardFilter): Promise<void> {
  const filterQueue = getFilterGroupQueue();
  if (!filterQueue) {
    showMessage(t('filterQueueUnavailable', '筛选复习队列不可用'), 3000, 'error');
    return;
  }

  try {
    await filterQueue.setFilter?.(filter);
    await filterQueue.rebuild?.();
    appliedReviewFilter.value = Object.keys(filter).length > 0 ? { ...filter } : null;
    showReviewFilterDialog.value = false;
    await hook.reload();
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to apply review filter:', error);
    showMessage(t('applyFilterFailed', '应用筛选失败'), 3000, 'error');
  }
}

async function handleApplyReviewFilter(filter: CardFilter): Promise<void> {
  await applyFilterAndReload(filter);
}

async function handleClearReviewFilter(): Promise<void> {
  await applyFilterAndReload({});
}

async function handleRebuildReviewFilterQueue(): Promise<void> {
  const filterQueue = getFilterGroupQueue();
  if (!filterQueue) {
    showMessage(t('filterQueueUnavailable', '筛选复习队列不可用'), 3000, 'error');
    return;
  }

  try {
    await filterQueue.rebuild?.();
    syncReviewFilterFromQueue();
    await hook.reload();
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to rebuild filter-group queue:', error);
    showMessage(t('rebuildFailed', '重建失败'), 3000, 'error');
  }
}

function handleToolbarAction(actionType: string, ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleToolbarAction called:', actionType);

  if (actionType === 'close-review') {
    emit('close');
    return;
  }

  if (actionType === 'plan-review-scope') {
    syncReviewFilterFromQueue();
    showReviewFilterDialog.value = true;
    return;
  }

  if (actionType === 'fullscreen') {
    if (props.isMobile) {
      return;
    }

    // 实现全屏功能（参考思源原生实现）
    logger.debug('[SiYuanMemo][ReviewView] Fullscreen button clicked');

    // 查找对话框容器
    const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]');
    // 使用自定义类名查找内容区域
    const contentMain = rootRef.value?.querySelector('.fsrs-review-v2-content') || document.querySelector('.fsrs-review-v2-content');
    logger.debug('[SiYuanMemo][ReviewView] dialogContainer found:', !!dialogContainer);
    logger.debug('[SiYuanMemo][ReviewView] contentMain found:', !!contentMain);

    if (contentMain && dialogContainer) {
      const isFullscreen = contentMain.classList.contains('fullscreen');
      logger.debug('[SiYuanMemo][ReviewView] Current fullscreen state:', isFullscreen);

      if (isFullscreen) {
        // 退出全屏
        contentMain.classList.remove('fullscreen');
        dialogContainer.classList.remove('fullscreen');
        // 恢复 maxWidth
        (dialogContainer as HTMLElement).style.maxWidth = '1024px';
        document.getElementById('drag')?.classList.remove('fn__hidden');
        logger.debug('[SiYuanMemo][ReviewView] Exited fullscreen');
      } else {
        // 进入全屏
        contentMain.classList.add('fullscreen');
        dialogContainer.classList.add('fullscreen');
        // 设置为 100vw 以确保全屏效果(覆盖内联样式)
        (dialogContainer as HTMLElement).style.maxWidth = '100vw';
        document.getElementById('drag')?.classList.add('fn__hidden');
        logger.debug('[SiYuanMemo][ReviewView] Entered fullscreen');
      }

      // 调整 protyle 尺寸
      setTimeout(() => {
        const protyleHost = contentMain.querySelector('.fsrs-review-v2-content__protyle-host');
        logger.debug('[SiYuanMemo][ReviewView] protyleHost:', protyleHost);

        if (protyleHost) {
          // 查找 protyle 实例
          const protyle = getProtyleFromHost(protyleHost);
          logger.debug('[SiYuanMemo][ReviewView] protyle instance:', protyle);

          if (protyle && typeof protyle.resize === 'function') {
            protyle.resize();
            logger.debug('[SiYuanMemo][ReviewView] Protyle resized');
          }
        }
      }, 0);
    } else {
      logger.debug('[SiYuanMemo][ReviewView] ERROR: contentMain or dialogContainer not found!');
    }
  } else if (actionType === 'edit-srs') {
    // 打开SRS编辑器
    logger.debug('[SiYuanMemo][ReviewView] Edit SRS button clicked');
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;
    logger.debug('[SiYuanMemo][ReviewView] cardMeta:', cardMeta);
    logger.debug('[SiYuanMemo][ReviewView] blockId:', blockId);
    if (blockId) {
      openSrsEditorDialog(blockId);
    } else {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'sticktab') {
    // 打开为菜单
    handleOpenAsMenu(ev);
  } else if (actionType === 'lock-focus') {
    logger.debug('[SiYuanMemo][ReviewView] Lock focus button clicked');
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;

    if (blockId) {
      const underlyingQueue = getUnderlyingQueue() as
        | (UnderlyingQueueLike & { addCard?: (card: string, source?: unknown) => Promise<void> })
        | null;

      if (underlyingQueue?.lockCurrentAsFocus) {
        void underlyingQueue.lockCurrentAsFocus(blockId, 'high')
          .then(() => {
            logger.debug('[SiYuanMemo][ReviewView] Block locked as focus:', blockId);
            showMessage(t('lockedAsFocus', 'Locked as focus'), 3000, 'info');
          })
          .catch((error: Error) => {
            logger.error('[SiYuanMemo][ReviewView] Failed to lock focus:', error);
            showMessage(t('lockFocusFailed', 'Failed to lock focus'), 3000, 'error');
          });
      } else if (underlyingQueue && typeof underlyingQueue.addCard === 'function') {
        void underlyingQueue.addCard(blockId)
          .then(async () => {
            await underlyingQueue.setPinnedFocusBlock?.(blockId, true);
            logger.debug('[SiYuanMemo][ReviewView] Block locked as focus:', blockId);
            showMessage(t('lockedAsFocus', 'Locked as focus'), 3000, 'info');
          })
          .catch((error: Error) => {
            logger.error('[SiYuanMemo][ReviewView] Failed to lock focus:', error);
            showMessage(t('lockFocusFailed', 'Failed to lock focus'), 3000, 'error');
          });
      } else {
        logger.error('[SiYuanMemo][ReviewView] Queue does not support focus locking');
        showMessage(t('queueNoFocusSupport', 'Queue does not support focus locking'), 3000, 'error');
      }
    } else {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'neural-focuses') {
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralFocusMenu(ev);
  } else if (actionType === 'neural-history') {
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralHistoryMenu(ev);
  } else if (actionType === 'neural-nav-mode') {
    logger.debug('[SiYuanMemo][ReviewView] Navigation mode toggle button clicked');
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }

    const currentMode = neuralQueue.getNavigationState().navigationMode;
    const newMode = currentMode === 'follow' ? 'explore' : 'follow';
    neuralQueue.setNavigationMode(newMode);
    refreshNavigationState();

    const modeText = newMode === 'follow'
      ? t('navModeFollow', '沿路径前进')
      : t('navModeExplore', '探索新分支');
    showMessage(t('navModeSwitched', '已切换为: {mode}').replace('{mode}', modeText), 2000, 'info');
  } else if (actionType === 'neural-return-bookmark') {
    logger.debug('[SiYuanMemo][ReviewView] Return to bookmark button clicked');
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }

    const success = neuralQueue.returnToBookmark();
    if (!success) {
      return;
    }

    const navState = neuralQueue.getNavigationState();
    if (navState.currentNodeId) {
      void hook.loadCardByBlockId(navState.currentNodeId);
    }
    refreshNavigationState();
    showMessage(t('navReturnedToBookmark', '已返回书签位置'), 2000, 'info');
  }
}

function handleOpenAsMenu(ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenAsMenu called', ev);

  const menu = new Menu();

  const pluginCandidate = isRecord(props.plugin) ? (props.plugin as ReviewPluginLike) : null;
  const pluginFromWindow = getWindowPlugin();
  const context = pluginCandidate?.getContext?.() ?? pluginFromWindow?.getContext?.();
  const tabManager = context?.getTabManager?.();

  if (!tabManager || typeof tabManager.openReviewTab !== 'function') {
    logger.error('[SiYuanMemo][ReviewView] TabManager not available for open-as');
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const reviewTabOptions = {
    provider: props.provider,
    queue: props.queue,
    adapter: props.adapter,
    title: props.title || t('reviewTitle', 'Review'),
  };

  // 在新标签中打开
  menu.addItem({
    id: 'openByTab',
    icon: 'iconOpen',
    label: t('openInNewTab', 'New Tab'),
    click() {
      logger.debug('[SiYuanMemo][ReviewView] Opening review in new tab and closing dialog');
      if (typeof tabManager.openReviewTabInNewTab === 'function') {
        tabManager.openReviewTabInNewTab(reviewTabOptions);
      } else {
        tabManager.openReviewTab(reviewTabOptions);
      }
      emit('close');
    },
  });

  // 在右侧打开
  menu.addItem({
    id: 'insertRight',
    icon: 'iconLayoutRight',
    label: t('openInRight', 'Right Side'),
    click() {
      logger.debug('[SiYuanMemo][ReviewView] Opening review on right side and closing dialog');
      tabManager.openReviewTab(reviewTabOptions);
      emit('close');
    },
  });

  if (typeof tabManager.openReviewInNewWindow === 'function') {
    menu.addItem({
      id: 'openByNewWindow',
      icon: 'iconOpenWindow',
      label: t('openInNewWindow', 'New Window'),
      click() {
        logger.debug('[SiYuanMemo][ReviewView] Opening review in new window and closing dialog');
        tabManager.openReviewInNewWindow?.(reviewTabOptions);
        emit('close');
      },
    });
  }

  // 打开菜单
  const target = ev.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  menu.open({
    x: rect.left,
    y: rect.bottom,
  });
}

// Part 4: 打开 SRS 编辑器对话框
function openSrsEditorDialog(blockId: string) {
  logger.debug('[SiYuanMemo][ReviewView] openSrsEditorDialog called with blockId:', blockId);

  if (!props.app) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: props.app is undefined!');
    return;
  }

  if (!blockId) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is required but got undefined!');
    return;
  }

  const context = getPluginContext(props.plugin);
  const reviewService = context?.getReviewService?.();
  const siyuanApi = reviewService?.getSiyuanApi?.();
  if (!siyuanApi) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: review siyuan api is unavailable');
    return;
  }

  const card = context?.getStorage?.()?.getCardByBlockId(blockId);
  if (!card) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: Card not found for blockId:', blockId);
    return;
  }

  createVueDialog({
    title: t('editSrsData', '编辑 SRS 数据'),
    component: SrsEditorDialog,
    props: {
      card: {
        id: card.id,
        blockId: blockId,
        deckId: siyuanApi.BUILTIN_DECK_ID,
      },
      deckId: siyuanApi.BUILTIN_DECK_ID,
      i18n: props.i18n || {},
      plugin: props.plugin,
      reviewService,
    },
    width: '860px',
    height: '80vh',
  });
}

// Part 5: 在标签页中打开卡片
function openCardInTab(blockId: string, openInRight: boolean) {
  if (!props.app) return;

  openTab({
    app: props.app,
    doc: { id: blockId },
    position: openInRight ? 'right' : undefined,
  });
}

// Part 5: 在新窗口中打开卡片
function openCardInNewWindow(blockId: string) {
  if (!props.app) return;

  openTab({
    app: props.app,
    doc: { id: blockId },
    openInNewWindow: true,
  });
}

function openMenuAtEvent(menu: Menu, ev: MouseEvent): void {
  const target = ev.currentTarget as HTMLElement | null;
  if (!target) {
    logger.error('[SiYuanMemo][ReviewView] Cannot open menu: target element is null');
    return;
  }

  const rect = target.getBoundingClientRect();
  menu.open({
    x: rect.left,
    y: rect.bottom,
  });
}

function shortenBlockId(blockId: string): string {
  return blockId.length > 20 ? `${blockId.slice(0, 20)}...` : blockId;
}

type FocusMenuEntry = {
  nodeId: string;
  nodePreview: string;
  associationType: string;
  reason: string;
  isVirtual: boolean;
  visitedAt: number;
};

function buildFocusMenuEntries(neuralQueue: NeuralRoamSessionQueue): FocusMenuEntry[] {
  const byNodeId = new Map<string, FocusMenuEntry>();
  const sourceEntries = [
    ...neuralQueue.getSessionFocusStack(),
    ...neuralQueue.getPinnedFocusBlocks(),
  ].sort((a, b) => b.visitedAt - a.visitedAt);

  for (const entry of sourceEntries) {
    if (!byNodeId.has(entry.nodeId)) {
      byNodeId.set(entry.nodeId, {
        nodeId: entry.nodeId,
        nodePreview: entry.nodePreview || '',
        associationType: entry.associationType || '',
        reason: entry.reason || '',
        isVirtual: entry.isVirtual === true,
        visitedAt: Number.isFinite(entry.visitedAt) ? entry.visitedAt : 0,
      });
    }
  }

  for (const focusId of neuralQueue.getConceptBlocks()) {
    if (!byNodeId.has(focusId)) {
      byNodeId.set(focusId, {
        nodeId: focusId,
        nodePreview: '',
        associationType: 'focus',
        reason: '',
        isVirtual: false,
        visitedAt: 0,
      });
    }
  }

  return Array.from(byNodeId.values()).sort((a, b) => b.visitedAt - a.visitedAt);
}

function resolveFocusTypeLabel(entry: { associationType: string; isVirtual: boolean }): string {
  if (entry.isVirtual) {
    return t('virtualNode', '虚拟闪卡');
  }
  if (entry.associationType === 'descriptor') {
    return t('descriptorCard', '描述符卡');
  }
  return t('conceptCard', '概念卡');
}

function buildFocusMenuLabel(entry: FocusMenuEntry): string {
  const preview = entry.nodePreview || shortenBlockId(entry.nodeId);
  const typeLabel = resolveFocusTypeLabel(entry);
  return `${preview} — ${typeLabel}`;
}

function resolveAssociationTypeLabel(entry: NeuralRoamHistoryEntry): string {
  const reason = String(entry.reason || '').trim();
  if (reason) {
    return reason;
  }

  const associationTypeMap: Record<string, string> = {
    backlink: t('associationBacklink', '反向链接'),
    'outgoing-direct': t('associationOutgoingDirect', '直接引用'),
    'outgoing-indirect': t('associationOutgoingIndirect', '间接引用'),
    descriptor: t('descriptorCard', '描述符卡'),
    focus: t('associationFocusNode', '焦点节点'),
    path: t('associationPathNode', '路径节点'),
  };
  return associationTypeMap[entry.associationType] || entry.associationType || t('unknown', '未知');
}

function handleNeuralFocusMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  const underlyingQueue = getUnderlyingQueue();
  if (!neuralQueue) {
    showMessage(t('queueNoFocusSupport', '当前队列不支持焦点管理'), 3000, 'error');
    return;
  }

  const focusEntries = buildFocusMenuEntries(neuralQueue);
  const menu = new Menu('neural-focuses-menu');

  menu.addItem({
    icon: 'iconList',
    label: t('viewFocusList', '查看焦点块列表'),
    click: () => {
      openNeuralBrowserSubview('focus-blocks');
    },
  });

  menu.addItem({
    icon: 'iconPlay',
    label: t('roamFromFocus', '从焦点块开始漫游'),
    disabled: focusEntries.length === 0,
    submenu: focusEntries.map((entry) => ({
      label: buildFocusMenuLabel(entry),
      click: async () => {
        try {
          await neuralQueue.startRoamingFromFocus(entry.nodeId, {
            includeFocusAsFirst: true,
            resetHistory: false,
          });
          await hook.loadCardByBlockId(entry.nodeId);
          refreshNavigationState();
          showMessage(
            t('roamStartedFromFocus', '已从焦点 {id} 开始漫游').replace('{id}', entry.nodeId),
            3000,
            'info'
          );
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to start roaming from focus:', error);
          showMessage(t('roamStartFailed', '开始漫游失败'), 3000, 'error');
        }
      },
    })),
  });

  menu.addItem({
    icon: 'iconTrashcan',
    label: t('removeFocus', '移除焦点块'),
    disabled: focusEntries.length === 0 || typeof underlyingQueue?.removeCard !== 'function',
    submenu: focusEntries.map((entry) => ({
      label: buildFocusMenuLabel(entry),
      click: async () => {
        if (entry.isVirtual) {
          showMessage(t('virtualFocusSessionOnly', '虚拟闪卡是会话焦点，请在浏览器视图中管理'), 3000, 'info');
          return;
        }
        try {
          await underlyingQueue?.removeCard?.(entry.nodeId);
          refreshNavigationState();
          showMessage(t('focusRemoved', '已移除焦点块 {id}').replace('{id}', entry.nodeId), 3000, 'info');
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to remove focus:', error);
          showMessage(t('removeFocusFailed', '移除焦点块失败'), 3000, 'error');
        }
      },
    })),
  });

  openMenuAtEvent(menu, ev);
}

function buildHistoryLabel(entry: NeuralRoamHistoryEntry, absoluteIndex: number): string {
  const preview = entry.nodePreview || shortenBlockId(entry.nodeId);
  const association = resolveAssociationTypeLabel(entry);
  return `${absoluteIndex}. ${preview} · ${association}`;
}

function handleNeuralHistoryMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    showMessage(t('noHistory', '当前队列没有历史能力'), 3000, 'info');
    return;
  }

  const history = neuralQueue.getHistorySnapshot();
  const menu = new Menu('neural-history-menu');

  menu.addItem({
    icon: 'iconHistory',
    label: t('viewHistory', '查看历史记录'),
    click: () => {
      openNeuralBrowserSubview('roam-history');
    },
  });

  const jumpCandidates = history.slice(-20);
  menu.addItem({
    icon: 'iconOpen',
    label: t('jumpHistoryNode', '跳转历史节点'),
    disabled: jumpCandidates.length === 0,
    submenu: jumpCandidates.map((entry, index) => ({
      label: buildHistoryLabel(entry, history.length - jumpCandidates.length + index + 1),
      click: async () => {
        await neuralQueue.jumpToHistoryNode(entry.nodeId);
        await hook.loadCardByBlockId(entry.nodeId);
        refreshNavigationState();
      },
    })),
  });

  menu.addItem({
    icon: 'iconClear',
    label: t('clearHistory', '清空历史记录'),
    click: () => {
      neuralQueue.clearHistory('all');
      refreshNavigationState();
      showMessage(t('historyClearedSuccess', '历史记录已清空'), 3000, 'info');
    },
  });

  openMenuAtEvent(menu, ev);
}

// Part 6: 处理面包屑点击
function handleBreadcrumbClick(crumb: { icon?: string; text: string; id?: string; action?: string }, index: number) {
  const action = crumb.action || crumb.id;
  if (action) {
    void hook.executeCommand(action);
  }
}

// 🌐 Part 7: 侧边栏处理函数（已删除）

/**
 * 🆕 获取当前队列的导航状态（仅神经漫游队列）
 * Phase 3: UI 控件
 */
function getNavigationState() {
  const neuralQueue = getNeuralRoamQueue();
  return neuralQueue ? neuralQueue.getNavigationState() : null;
}

/**
 * 🆕 检查当前是否是神经漫游队列
 * Phase 3: UI 控件
 */
function isNeuralRoamQueue(): boolean {
  return getNeuralRoamQueue() !== null;
}

/**
 * 🆕 刷新导航状态到 UI
 * Phase 3: UI 控件
 */
function refreshNavigationState() {
  if (!isNeuralRoamQueue()) {
    if (state.value.header.navigationState) {
      state.value = {
        ...state.value,
        header: {
          ...state.value.header,
          navigationState: undefined,
        },
      };
    }
    return;
  }

  const navState = getNavigationState();
  if (navState) {
    // 更新 state.header.navigationState
    state.value = {
      ...state.value,
      header: {
        ...state.value.header,
        navigationState: navState,
      },
    };
  }
}

// 🌐 监听当前卡片变化（已删除图谱同步）
</script>

<style scoped>
.fsrs-review-v2 {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--b3-theme-background);
}

.fsrs-review-v2--mobile {
  height: 100vh;
  width: 100vw;
}

/* 🌌 内容包装器（占据剩余空间） */
.fsrs-review-v2__content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止 flex 子元素溢出 */
  height: 100%; /* 确保容器有明确的高度 */
  overflow: hidden; /* 防止整体滚动，只允许 ReviewContent 滚动 */
}

.fsrs-review-v2-resume {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  padding: 16px;
}

.fsrs-review-v2-resume__panel {
  width: min(520px, 100%);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fsrs-review-v2-resume__title {
  font-weight: 600;
}

.fsrs-review-v2-resume__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.review-filter-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px 16px;
  background: rgba(0, 0, 0, 0.28);
  overflow-y: auto;
}

.review-filter-dialog-container {
  width: min(1060px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: var(--b3-border-radius-b);
  background: var(--b3-theme-background);
  margin: 0 auto;
}

.review-filter-dialog-overlay--mobile {
  padding: 8px;
}

.review-filter-dialog-overlay--mobile .review-filter-dialog-container {
  width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
}

/* 全屏样式 - 只影响插件的复习对话框 */
/* 参考思源原生实现：siyuan/app/src/assets/scss/main/_main.scss:28-56 */

/* 1. 对话框容器全屏 */
.b3-dialog__container[data-key="dialog-opencard"].fullscreen {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  z-index: 8 !important;
  border-radius: 0 !important;

  /* 标题栏样式调整 */
  .block__icons {
    padding-left: var(--b3-toolbar-left-mac);
    height: 32px;
    min-height: 32px;
  }

  /* 拖拽区域样式 */
  .block__icons > .fn__flex-1 {
    -webkit-app-region: drag;
    min-width: 32px;
    height: 100%;
    box-sizing: border-box;
    border-radius: var(--b3-border-radius-b);

    &:hover {
      background-color: var(--b3-theme-surface-light);
    }
  }
}

/* 2. 内容区域全屏（填充父容器） */
.fsrs-review-v2-content.fullscreen {
  width: 100%;
  height: 100%;
}
</style>

<style>
/* 确保对话框有圆角 */
.b3-dialog__container[data-key="dialog-opencard"]:not(.fsrs-mobile-review-dialog) {
  border-radius: var(--b3-border-radius-b) !important;
}

.b3-dialog__container.fsrs-mobile-review-dialog {
  border-radius: 0 !important;
  max-width: 100vw !important;
}
</style>

