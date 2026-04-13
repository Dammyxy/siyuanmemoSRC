<template>
  <div
    ref="rootRef"
    class="fsrs-review-v2"
    :class="{ 'fsrs-review-v2--mobile': props.isMobile }"
    data-key="dialog-opencard"
    @click="handleRootClick"
  >
    <div class="fsrs-review-v2__workspace" :class="{ 'fsrs-review-v2__workspace--with-ai': showReviewAISidecar }">
      <!-- 📝 复习内容区 -->
      <div class="fsrs-review-v2__content-wrapper">
        <ReviewHeader
          :header="state.header"
          :i18n="i18n"
          :is-tab-mode="!!props.reviewUI"
          :title="props.title"
          :mode="props.mode"
          :is-mobile="props.isMobile"
          :navigation-state="neuralNavigationState"
          @toolbar-action="handleToolbarAction"
          @action="hook.executeCommand"
          @context="handleContext"
          @breadcrumb-click="handleBreadcrumbClick"
        />

        <ReviewContent
          ref="contentRef"
          :app="app"
          :plugin="props.plugin"
          :content="state.content"
          :overlay="state.overlay"
          :has-hidden-content="state.meta.hasHiddenContent"
          :show-answer="state.actions.showAnswer"
          :meta="state.meta"
          :i18n="i18n"
          @editor-state-change="handleEditorStateChange"
        />

        <ReviewActions
          :actions="state.actions"
          :meta="state.meta"
          :current-card="state.content.card"
          :i18n="i18n"
          :queue="providerQueue || props.queue"
          :plugin="props.plugin"
          :is-mobile="props.isMobile"
          @reveal="handleReveal"
          @grade="handleGrade"
          @skip="handleSkip"
          @back="handleBack"
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

      <aside v-if="showReviewAISidecar && reviewAIService" class="fsrs-review-v2__ai-sidecar">
        <AiWorkbenchPane :service="reviewAIService" :i18n="i18n" @close="closeReviewAISidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Menu, showMessage, type App } from 'siyuan';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import FilterDialog from '@/ui/browser/dialogs/FilterDialog.vue';
import AiWorkbenchPane from '@/ui/ai/AiWorkbenchPane.vue';
import { useReviewSession } from './useReviewSession';
import type { ReviewHeaderVariant, ReviewViewTabBridge } from './types';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { ProviderBackedQueueStrategy, type QueueProvider } from '@/core/extensions';
import { createVueDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import { getNeuralEngineLabel, getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import {
  type DataChangeEvent,
  type CardFilter,
  type FilterGroupQueueSessionSnapshot,
  type IDataSourceObserver,
  type InitialReviewSessionState,
  type ReviewTabTransferState,
  type IUnifiedDataSourceManagerFacade,
  isNeuralRoamSessionQueue,
  type NeuralNavigationState,
  type NeuralRoamSourceEntry,
  type NeuralRoamHistoryEntry,
  type NeuralRoamSessionQueue,
  type ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { isTopicLikeCard } from './reviewCardSemantics';
import { resolveReviewDialogEscapeKeydown, shouldResetReviewDialogEscapeLatch } from './reviewDialogEscape';
import { createReviewEditorState, type ReviewEditorState } from './reviewEditorState';
import { resolveReviewKeyAction } from './reviewKeyActionResolver';
import {
  consumeRecentlyModifiedReviewHotkey,
  getForwardedReviewHotkey,
  hasReviewKeyboardModifier,
  normalizeReviewKeyboardKey,
  rememberModifiedReviewHotkey,
} from './reviewKeyboardGuard';
import {
  isProgressiveSelectionInsideNativeProtyle,
  type ProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import { PROGRESSIVE_EXCERPT_REQUEST_EVENT } from '@/application/handlers/ProgressiveExcerptHotkeyHandler';
import {
  applyProgressiveExcerptHighlight,
  prepareProgressiveExcerptHighlight,
} from '@/application/entries/ProgressiveExcerptHighlight';
import type { ExcerptRecord } from '@/application/services/ExcerptRecordService';
import type { ProgressiveExcerptCreationResult } from '@/application/services/ProgressiveReadingService';
import type { AIWorkbenchOpenOptions, AIWorkbenchSurface } from '@/types/ai';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';

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
    fetchAuxiliaryData?: (item: unknown, queue?: unknown, context?: unknown) => Promise<unknown>;
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
          initialNeuralSubview?: 'concept-cards' | 'roam-history' | 'worldline-anchors';
        }) => void;
        openAiWorkbenchDialog?: (options?: AIWorkbenchOpenOptions) => Promise<void> | void;
      }
    | undefined;
  getReviewAIWorkbenchRegistry?: () =>
    | {
        hasReviewSession?: (sessionId: string) => boolean;
        getReviewSession?: (sessionId: string) => AIWorkbenchService | null;
        openReviewSession?: (options: AIWorkbenchOpenOptions & { sessionId: string; surface: 'review-dialog-sidecar' | 'review-tab-companion' }) => Promise<AIWorkbenchService>;
        updateReviewSessionContext?: (options: AIWorkbenchOpenOptions & { sessionId: string; surface: 'review-dialog-sidecar' | 'review-tab-companion' }) => Promise<AIWorkbenchService>;
        disposeReviewSession?: (sessionId: string) => void;
      }
    | undefined;
  getTabManager?: () =>
    | {
        openReviewTab: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          transferState?: ReviewTabTransferState;
        }) => void;
        openReviewTabInNewTab?: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          transferState?: ReviewTabTransferState;
        }) => void;
        openReviewInNewWindow?: (options: {
          provider?: unknown;
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          transferState?: ReviewTabTransferState;
        }) => void;
        openReviewAICompanionTab?: (options: AIWorkbenchOpenOptions & { sessionId: string; title: string }) => Promise<void> | void;
        focusReviewAICompanionTab?: (reviewSessionId: string) => boolean;
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
    getCard?: (cardId: string) => { id: string; blockId?: string } | undefined;
    getCardByBlockId?: (blockId: string) => { id: string } | undefined;
  };
  getReviewService?: () => {
    getSiyuanApi?: () => {
      BUILTIN_DECK_ID: string;
    } | undefined;
  };
  getProgressiveReadingService?: () => {
    completeCurrentPiece: (pieceDocId: string) => Promise<{ nextPieceDocId?: string }>;
  } | undefined;
  getSelectionExcerptService?: () => {
    materializeExcerptSource: (snapshot: ProgressiveExcerptSelectionSnapshot) => Promise<{
      sourceBlockId: string;
      sourceBlockIds: string[];
      contentDom: string;
      highlightSnapshot: ProgressiveExcerptSelectionSnapshot;
      reused: boolean;
    }>;
    createFromSelection: (input: {
      sourceBlockId: string;
      sourceBlockIds?: string[];
      selectedText: string;
      contentDom?: string;
      origin: 'editor' | 'review';
      currentCardId?: string;
    }) => Promise<ProgressiveExcerptCreationResult>;
    updateSourceBlockDom: (blockId: string, dom: string) => Promise<void>;
  } | undefined;
  getTabApplicationService?: () => {
    openDocumentTab: (options: { docId: string }) => Promise<void>;
    openBlockTab: (options: { blockId: string }) => Promise<void>;
  } | undefined;
  getSettingsService?: () => {
    getSettings?: () => {
      progressiveReading?: {
        altXExcerptEnabled?: boolean;
      };
    };
  } | undefined;
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | null | undefined;
};

type ReviewPluginLike = {
  name?: unknown;
  getContext?: () => ReviewPluginContextLike | undefined;
  openReviewTab?: (options: {
    provider?: unknown;
    queue?: unknown;
    adapter?: unknown;
    title: string;
    headerVariant?: ReviewHeaderVariant;
    transferState?: ReviewTabTransferState;
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
  getSize?: () => Promise<number>;
  serializeSessionSnapshot?: () => FilterGroupQueueSessionSnapshot;
};

type QueueStrategyWithUnderlying = {
  getUnderlyingQueue?: () => unknown;
};

type QueueStrategyWithInsertAt = {
  insertAt?: (cardId: string, position: number) => Promise<void> | void;
};

type QueueStrategyWithTailAppend = {
  appendCardsToTail?: (cards: FSRSCard[]) => number;
};

type CommandLike = {
  id?: unknown;
  label?: unknown;
  icon?: string;
};

type ProtyleLike = {
  resize?: () => void;
  protyle?: {
    wysiwyg?: {
      element?: HTMLElement;
    };
    toolbar?: unknown;
  };
  wysiwyg?: {
    element?: HTMLElement;
  };
  toolbar?: unknown;
};

type ScheduledReviewCardPayload = {
  cardId?: string;
  blockId?: string;
  dueTimestamp?: number;
};

type DismissedReviewCardPayload = {
  cardId?: string;
  blockId?: string;
  dismissed?: boolean;
};

type ReviewContentExpose = {
  exitEditorByEscape: () => boolean;
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
  headerVariant?: ReviewHeaderVariant;
  mode?: 'dialog' | 'tab'; // 🆕 打开模式（对话框/Tab）
  plugin?: unknown; // 🆕 插件实例，用于访问 hybridSyncService
  isMobile?: boolean;
  reviewSessionId?: string;
  onReview?: (cardId: string, rating: number) => void; // 🆕 复习回调（用于刻意练习黑名单）
  initialSessionState?: InitialReviewSessionState;
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
  (e: 'close'): void; // 添加关闭事件
  (e: 'convert-to-tab'): void; // 🆕 转换为 Tab 模式（kebab-case）
}>();

function createReviewSessionId(): string {
  return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const reviewSessionId = ref(String(props.reviewSessionId || '').trim() || createReviewSessionId());
const reviewAIService = ref<AIWorkbenchService | null>(null);
const reviewAISidebarOpen = ref(false);
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);

const rootRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<ReviewContentExpose | null>(null);
const recentModifiedHotkeys = new Map<string, number>();
const editorState = ref<ReviewEditorState>(createReviewEditorState());
let reviewResizeHandler: (() => void) | null = null;
let escRepeatLatch = false;

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

function getQueueStrategyWithInsertAt(): QueueStrategyWithInsertAt | null {
  const strategy = hook.getQueueStrategy();
  if (!isRecord(strategy)) {
    return null;
  }
  const candidate = strategy as QueueStrategyWithInsertAt;
  return typeof candidate.insertAt === 'function' ? candidate : null;
}

function getQueueStrategyWithTailAppend(): QueueStrategyWithTailAppend | null {
  const strategy = hook.getQueueStrategy();
  if (!isRecord(strategy)) {
    return null;
  }
  const candidate = strategy as QueueStrategyWithTailAppend;
  return typeof candidate.appendCardsToTail === 'function' ? candidate : null;
}

function getActiveQueueStrategy(): { next?: () => Promise<unknown> } | null {
  const activeQueue = providerQueue || props.queue;
  return isRecord(activeQueue) ? activeQueue as { next?: () => Promise<unknown> } : null;
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

function getReviewAIWorkbenchRegistry() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getReviewAIWorkbenchRegistry?.() || contextFromWindow?.getReviewAIWorkbenchRegistry?.() || null;
}

function resolveActiveReviewQueueType(): string | null {
  const activeQueue = providerQueue || props.queue;
  if (!isRecord(activeQueue)) {
    return null;
  }

  if (typeof activeQueue.queueType === 'string' && activeQueue.queueType.trim().length > 0) {
    return activeQueue.queueType.trim();
  }
  if (typeof activeQueue.id === 'string' && activeQueue.id.trim().length > 0) {
    return activeQueue.id.trim();
  }
  if (typeof activeQueue.name === 'string' && activeQueue.name.trim().length > 0) {
    return activeQueue.name.trim();
  }
  return null;
}

function resolveActiveReviewQueueLabel(): string {
  const title = String(props.title || '').trim();
  if (title.length > 0) {
    return title;
  }

  const activeQueue = providerQueue || props.queue;
  if (isRecord(activeQueue)) {
    const displayName = String(activeQueue.displayName || '').trim();
    if (displayName.length > 0) {
      return displayName;
    }
    const name = String(activeQueue.name || '').trim();
    if (name.length > 0) {
      return name;
    }
  }

  return resolveActiveReviewQueueType() || t('reviewTitle', 'Review');
}

function buildReviewQueueProgress(): ReviewQueueProgressSnapshot | null {
  const meta = isRecord(state.value.meta) ? state.value.meta as Record<string, unknown> : null;
  const candidate = meta?.queueProgress;
  if (isRecord(candidate)) {
    return {
      queueType: typeof candidate.queueType === 'string' ? candidate.queueType : resolveActiveReviewQueueType(),
      queueLabel: resolveActiveReviewQueueLabel(),
      completed: Math.max(0, Number(candidate.completed) || 0),
      remaining: Math.max(0, Number(candidate.remaining) || 0),
      total: Number.isFinite(Number(candidate.total)) && Number(candidate.total) > 0 ? Number(candidate.total) : null,
    };
  }

  const rawTotal = Number(meta?.queueSize);
  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : null;
  const rawRemaining = Number(meta?.remainingSize);
  const remaining = Number.isFinite(rawRemaining) && rawRemaining >= 0
    ? Math.max(0, total !== null ? Math.min(rawRemaining, total) : rawRemaining)
    : (total ?? 0);
  const completed = total !== null ? Math.max(0, total - remaining) : 0;

  return {
    queueType: resolveActiveReviewQueueType(),
    queueLabel: resolveActiveReviewQueueLabel(),
    completed,
    remaining,
    total,
  };
}

function getUnifiedDataSourceManager(): IUnifiedDataSourceManagerFacade | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getUnifiedDataSourceManager?.() || contextFromWindow?.getUnifiedDataSourceManager?.() || null;
}

function normalizeCardFilterIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map((id) => String(id || '').trim())
    .filter((id) => id.length > 0);
}

function getInitialReviewSessionState(): InitialReviewSessionState | undefined {
  const session = hook.context.value.session;
  if (!session) {
    return undefined;
  }

  const initialTotal = Math.max(0, Number(session.initialTotal) || 0);
  const answeredCount = Math.max(0, Number(session.answeredCount) || 0);
  const correctCount = Math.max(0, Number(session.correctCount) || 0);

  if (initialTotal === 0 && answeredCount === 0 && correctCount === 0) {
    return undefined;
  }

  return {
    initialTotal,
    answeredCount,
    correctCount,
  };
}

function buildReviewTabTransferState(): ReviewTabTransferState | undefined {
  const filterQueue = getFilterGroupQueue();
  if (!filterQueue || typeof filterQueue.serializeSessionSnapshot !== 'function') {
    return undefined;
  }

  try {
    return {
      kind: 'filter-group-session',
      filterSession: filterQueue.serializeSessionSnapshot(),
      session: getInitialReviewSessionState(),
    };
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to serialize filter-group transfer state:', error);
    return undefined;
  }
}

function readCardRootId(card: FSRSCard): string {
  const meta = card.meta;
  if (!isRecord(meta)) {
    return '';
  }

  const value = meta.rootId ?? meta.rootID ?? meta.root_id;
  return typeof value === 'string' ? value.trim() : '';
}

function matchesFilterCardType(card: FSRSCard, filter: CardFilter): boolean {
  if (!filter.cardType) {
    return true;
  }

  const requestedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
  return requestedTypes.includes(card.type as typeof requestedTypes[number]);
}

function isProgressiveExcerptCard(card: FSRSCard): boolean {
  if (card.type !== 'topic') {
    return false;
  }

  const progressive = isRecord(card.meta) ? card.meta.progressive : null;
  return isRecord(progressive) && String(progressive.kind || '').trim() === 'excerpt';
}

function getProgressiveReadingService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getProgressiveReadingService?.() || contextFromWindow?.getProgressiveReadingService?.() || null;
}

function getSelectionExcerptService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getSelectionExcerptService?.() || contextFromWindow?.getSelectionExcerptService?.() || null;
}

function getTabApplicationService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getTabApplicationService?.() || contextFromWindow?.getTabApplicationService?.() || null;
}

function isProgressiveExcerptEnabled(): boolean {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  const candidates = [contextFromProps, contextFromWindow];
  for (const candidate of candidates) {
    try {
      const enabled = candidate?.getSettingsService?.()?.getSettings?.()?.progressiveReading?.altXExcerptEnabled;
      if (typeof enabled === 'boolean') {
        return enabled;
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewView] Failed to read progressive excerpt setting:', error);
    }
  }
  return false;
}

function isCurrentProgressivePieceCard(): boolean {
  const progressive = state.value.content.card?.meta?.progressive;
  return Boolean(progressive && typeof progressive === 'object' && (progressive as Record<string, unknown>).kind === 'piece');
}

async function enqueueExcerptIntoCurrentProgressiveReview(excerptEntityId: string): Promise<boolean> {
  if (!isCurrentProgressivePieceCard()) {
    return false;
  }

  const normalizedBlockId = String(excerptEntityId || '').trim();
  if (!normalizedBlockId) {
    return false;
  }

  const filterQueue = getFilterGroupQueue();
  const queueStrategy = getQueueStrategyWithInsertAt();
  if (!filterQueue || typeof filterQueue.getFilter !== 'function' || typeof filterQueue.setFilter !== 'function' || !queueStrategy?.insertAt) {
    return false;
  }

  const currentFilter = filterQueue.getFilter() || {};
  const currentBlockIds = Array.isArray(currentFilter.blockIds)
    ? currentFilter.blockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean)
    : [];

  if (currentBlockIds.length === 0) {
    return false;
  }

  const nextBlockIds = Array.from(new Set([...currentBlockIds, normalizedBlockId]));
  if (nextBlockIds.length !== currentBlockIds.length) {
    await filterQueue.setFilter({
      ...currentFilter,
      blockIds: nextBlockIds,
    });
    appliedReviewFilter.value = {
      ...currentFilter,
      blockIds: nextBlockIds,
    };
  }

  await queueStrategy.insertAt(normalizedBlockId, 1);
  return true;
}

async function injectExcerptIntoCurrentHyperspaceReview(excerptEntityId: string): Promise<boolean> {
  const normalizedBlockId = String(excerptEntityId || '').trim();
  if (!normalizedBlockId) {
    return false;
  }

  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue || neuralQueue.getEngineMode() !== 'hyperspace') {
    return false;
  }

  if (typeof neuralQueue.injectExcerptIntoHyperspace !== 'function') {
    return false;
  }

  const navigationState = neuralQueue.getNavigationState();
  return neuralQueue.injectExcerptIntoHyperspace(normalizedBlockId, {
    currentNodeId: navigationState.currentNodeId ?? null,
    currentEventId: navigationState.currentEventId ?? null,
  });
}

function openNeuralBrowserSubview(subview: 'concept-cards' | 'roam-history' | 'worldline-anchors'): void {
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
    ourDialog: rootRef.value?.closest('.b3-dialog__container.siyuanmemo-review-dialog-container'),
  });

  // 🆕 添加键盘事件监听器
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, handleProgressiveExcerptCommandRequest as EventListener);
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
  bindReviewDataObserver();
  reviewResizeHandler = () => {
    viewportWidth.value = window.innerWidth;
    updateReviewDialogContainerLayout();
  };
  window.addEventListener('resize', reviewResizeHandler);
});

// 🆕 组件卸载时移除键盘事件监听器
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  window.removeEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, handleProgressiveExcerptCommandRequest as EventListener);
  recentModifiedHotkeys.clear();
  escRepeatLatch = false;
  unbindReviewDataObserver();
  if (reviewResizeHandler) {
    window.removeEventListener('resize', reviewResizeHandler);
    reviewResizeHandler = null;
  }
  if (props.mode !== 'tab') {
    getReviewAIWorkbenchRegistry()?.disposeReviewSession?.(reviewSessionId.value);
  }
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
        ? (item: unknown, _queue?: unknown, context?: unknown) => providerAdapter.fetchAuxiliaryData(item, provider, context)
        : undefined,
    }
  : null;

const hook = useReviewSession(
  providerQueue || props.queue, 
  bridgedAdapter || props.adapter,
  {
    onReview: props.onReview, // 🆕 传递 onReview 回调
    initialSessionState: props.initialSessionState,
  }
);
const state = hook.state;
const app = props.app;
const i18n = props.i18n;
const showReviewFilterDialog = ref(false);
const appliedReviewFilter = ref<CardFilter | null>(null);
const neuralNavigationState = ref<NeuralNavigationState | null>(null);
let subscribedReviewManager: IUnifiedDataSourceManagerFacade | null = null;

const REVIEW_AI_SIDECAR_MIN_VIEWPORT = 1040;

const canUseEmbeddedReviewAISidecar = computed(() => (
  props.mode === 'dialog' && props.isMobile !== true && viewportWidth.value >= REVIEW_AI_SIDECAR_MIN_VIEWPORT
));

const showReviewAISidecar = computed(() => (
  canUseEmbeddedReviewAISidecar.value && reviewAISidebarOpen.value && reviewAIService.value !== null
));

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function resolveNeuralSourceLabels(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()) {
  const engineMode = neuralQueue?.getNavigationState().engineMode ?? neuralNavigationState.value?.engineMode ?? 'orbit';
  return getNeuralSourceLabelSet(engineMode, t);
}

function getReviewSourceListLabel(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('viewActivationSourceList', '查看概念卡：激活源列表')
    : t('viewOrbitCenterList', '查看概念卡：轨道中心列表');
}

function getBuildStationSuccessMessage(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('stationBuiltAndSetPrimaryActivationSource', '已建立空间站，并切换为当前主概念卡：激活源')
    : t('stationBuiltAndSetOrbitCenter', '已建立空间站，并切换为当前概念卡：轨道中心');
}

function getBuildStationFailedMessage(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('buildStationAndSetPrimaryActivationSourceFailed', '建立空间站并切换主概念卡：激活源失败')
    : t('buildStationAndSetOrbitCenterFailed', '建立空间站并切换概念卡：轨道中心失败');
}

function getLockCurrentCenterFailedMessage(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('lockPrimaryActivationSourceFailed', '设为主概念卡：激活源失败')
    : t('lockCurrentOrbitCenterFailed', '设为当前概念卡：轨道中心失败');
}

function getStartPathFromSourceMessage(nodeId: string, neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('roamStartedFromActivationSource', '已从概念卡：激活源 {id} 开始新的路径').replace('{id}', nodeId)
    : t('roamStartedFromOrbitCenter', '已从概念卡：轨道中心 {id} 开始新的路径').replace('{id}', nodeId);
}

function getSourceRemovedMessage(nodeId: string, neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('activationSourceRemoved', '已移除概念卡：激活源 {id}').replace('{id}', nodeId)
    : t('orbitCenterRemoved', '已移除概念卡：轨道中心 {id}').replace('{id}', nodeId);
}

function getRemoveSourceFailedMessage(neuralQueue: NeuralRoamSessionQueue | null = getNeuralRoamQueue()): string {
  return neuralQueue?.getNavigationState().engineMode === 'hyperspace'
    ? t('removeActivationSourceFailed', '移除概念卡：激活源失败')
    : t('removeOrbitCenterFailed', '移除概念卡：轨道中心失败');
}

function getCurrentReviewCardReference(): { cardId: string; blockId: string } {
  const cardMeta = state.value.actions.cardMeta;
  const currentCard = state.value.content.card;
  return {
    cardId: String(cardMeta?.cardID || currentCard?.id || '').trim(),
    blockId: String(cardMeta?.blockID || currentCard?.blockId || '').trim(),
  };
}

function getActiveRemovableReviewQueue(): { removeCard?: (cardIdOrBlockId: string) => Promise<void> } | null {
  const activeQueue = providerQueue || props.queue;
  return isRecord(activeQueue) ? activeQueue as { removeCard?: (cardIdOrBlockId: string) => Promise<void> } : null;
}

async function advanceScheduledCurrentCard(payload: ScheduledReviewCardPayload): Promise<void> {
  const scheduledCardId = String(payload.cardId || '').trim();
  const scheduledBlockId = String(payload.blockId || '').trim();
  const currentReference = getCurrentReviewCardReference();
  const matchesCurrentCard =
    (scheduledCardId && scheduledCardId === currentReference.cardId)
    || (scheduledBlockId && scheduledBlockId === currentReference.blockId);

  if (!matchesCurrentCard) {
    logger.debug('[SiYuanMemo][ReviewView] Ignore scheduled event for non-current card:', {
      payload,
      currentReference,
    });
    return;
  }

  const removableQueue = getActiveRemovableReviewQueue();
  const removalTarget = scheduledCardId || scheduledBlockId;

  if (removableQueue && typeof removableQueue.removeCard === 'function' && removalTarget) {
    try {
      await removableQueue.removeCard(removalTarget);
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewView] Failed to remove scheduled current card from queue:', {
        removalTarget,
        error,
      });
    }
  }

  await hook.skip();
}

async function advanceDismissedCurrentCard(payload: DismissedReviewCardPayload): Promise<void> {
  if (payload.dismissed !== true) {
    return;
  }

  const dismissedCardId = String(payload.cardId || '').trim();
  const dismissedBlockId = String(payload.blockId || '').trim();
  const currentReference = getCurrentReviewCardReference();
  const matchesCurrentCard =
    (dismissedCardId && dismissedCardId === currentReference.cardId)
    || (dismissedBlockId && dismissedBlockId === currentReference.blockId);

  if (!matchesCurrentCard) {
    logger.debug('[SiYuanMemo][ReviewView] Ignore dismissed event for non-current card:', {
      payload,
      currentReference,
    });
    return;
  }

  const removableQueue = getActiveRemovableReviewQueue();
  const removalTarget = dismissedCardId || dismissedBlockId;

  if (removableQueue && typeof removableQueue.removeCard === 'function' && removalTarget) {
    try {
      await removableQueue.removeCard(removalTarget);
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewView] Failed to remove dismissed current card from queue:', {
        removalTarget,
        error,
      });
    }
  }

  await hook.skip();
}

async function refreshCurrentReviewCard(): Promise<void> {
  const manager = subscribedReviewManager;
  const { cardId } = getCurrentReviewCardReference();
  if (!manager || !cardId) {
    return;
  }

  try {
    const requestedCardId = cardId;
    const nextCard = await manager.getCard(cardId);
    if (getCurrentReviewCardReference().cardId !== requestedCardId) {
      return;
    }
    await hook.refreshCurrentItem(nextCard);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to refresh current review card from unified manager:', {
      cardId,
      error,
    });
  }
}

async function appendCreatedCardsToActiveScopeQueue(cardIds: string[]): Promise<void> {
  const manager = subscribedReviewManager;
  const filterQueue = getFilterGroupQueue();
  const queueStrategy = getQueueStrategyWithTailAppend();
  if (!manager || !filterQueue || typeof filterQueue.getFilter !== 'function' || typeof filterQueue.setFilter !== 'function' || !queueStrategy?.appendCardsToTail) {
    return;
  }

  const currentFilter = filterQueue.getFilter() || {};
  const scopeDocIds = normalizeCardFilterIds(currentFilter.scopeDocIds);
  if (scopeDocIds.length === 0) {
    return;
  }

  const normalizedCardIds = Array.from(new Set(
    cardIds
      .map((cardId) => String(cardId || '').trim())
      .filter((cardId) => cardId.length > 0)
  ));
  if (normalizedCardIds.length === 0) {
    return;
  }

  const loadedCards = await Promise.all(
    normalizedCardIds.map(async (cardId) => {
      try {
        return await manager.getCard(cardId, { silent: true });
      } catch (error) {
        logger.warn('[SiYuanMemo][ReviewView] Failed to load created card for doc-scope enqueue:', {
          cardId,
          error,
        });
        return null;
      }
    })
  );

  const cardsToAppend = loadedCards
    .filter((card): card is FSRSCard => Boolean(card))
    .filter((card) => {
      const rootId = readCardRootId(card);
      return rootId.length > 0 && scopeDocIds.includes(rootId);
    })
    .filter((card) => matchesFilterCardType(card, currentFilter))
    .filter((card) => !isProgressiveExcerptCard(card));

  if (cardsToAppend.length === 0) {
    return;
  }

  const currentBlockIds = normalizeCardFilterIds(currentFilter.blockIds);
  const nextBlockIds = Array.from(new Set([
    ...currentBlockIds,
    ...cardsToAppend.map((card) => String(card.blockId || '').trim()).filter((blockId) => blockId.length > 0),
  ]));

  const nextFilter = nextBlockIds.length === currentBlockIds.length
    ? currentFilter
    : {
        ...currentFilter,
        blockIds: nextBlockIds,
      };

  if (nextFilter !== currentFilter) {
    await filterQueue.setFilter(nextFilter);
    appliedReviewFilter.value = nextFilter;
  }

  const appendedCount = queueStrategy.appendCardsToTail(cardsToAppend);
  if (appendedCount === 0) {
    return;
  }

  const session = hook.context.value.session;
  if (session) {
    const currentInitialTotal = Math.max(0, Number(session.initialTotal) || 0);
    session.initialTotal = currentInitialTotal + appendedCount;
  }

  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  if (currentCard) {
    await hook.refreshCurrentItem(currentCard);
    return;
  }

  const activeQueue = getActiveQueueStrategy();
  if (typeof activeQueue?.next !== 'function') {
    return;
  }

  try {
    const nextItem = await activeQueue.next();
    if (!nextItem) {
      return;
    }
    hook.context.value.showAnswer = false;
    await hook.refreshCurrentItem(nextItem);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to advance into newly appended scope card:', error);
  }
}

const reviewDataObserver: IDataSourceObserver = {
  onDataChanged(event: DataChangeEvent) {
    if (event.type === 'card-created') {
      void appendCreatedCardsToActiveScopeQueue(event.cardIds || []);
      return;
    }

    if (event.type !== 'card-updated') {
      return;
    }

    const { cardId, blockId } = getCurrentReviewCardReference();
    if (!cardId && !blockId) {
      return;
    }

    const matched = (event.cardIds || []).some((id) => {
      const normalized = String(id || '').trim();
      return normalized === cardId || normalized === blockId;
    });
    if (!matched) {
      return;
    }

    void refreshCurrentReviewCard();
  },
};

function bindReviewDataObserver(): void {
  const manager = getUnifiedDataSourceManager();
  if (manager === subscribedReviewManager) {
    return;
  }

  if (subscribedReviewManager) {
    subscribedReviewManager.unregisterObserver(reviewDataObserver);
  }

  subscribedReviewManager = manager;
  subscribedReviewManager?.registerObserver(reviewDataObserver);
}

function unbindReviewDataObserver(): void {
  if (!subscribedReviewManager) {
    return;
  }

  subscribedReviewManager.unregisterObserver(reviewDataObserver);
  subscribedReviewManager = null;
}

function getEventElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function isInsideReviewRoot(target: EventTarget | null): boolean {
  const root = rootRef.value;
  const element = getEventElement(target);
  return !!root && !!element && root.contains(element);
}

function isReviewKeyboardContext(target: EventTarget | null): boolean {
  if (isInsideReviewRoot(target) || isInsideReviewRoot(document.activeElement)) {
    return true;
  }

  const root = rootRef.value;
  const activeElement = document.activeElement;
  return !!root
    && root.isConnected
    && (activeElement === document.body || activeElement === document.documentElement);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = getEventElement(target);
  if (!element) {
    return false;
  }
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

function isDialogMode(): boolean {
  return props.mode !== 'tab';
}

function handleEditorStateChange(nextState: ReviewEditorState): void {
  editorState.value = nextState;
  if (nextState.renderer !== 'main-protyle') {
    escRepeatLatch = false;
  }
}

function isCurrentReviewNativeProtyleSurface(target: EventTarget | null): boolean {
  if (editorState.value.renderer !== 'main-protyle') {
    return false;
  }
  const root = rootRef.value;
  if (!root || !root.querySelector('.protyle')) {
    return false;
  }
  return isInsideReviewRoot(target) || isInsideReviewRoot(document.activeElement);
}

function hasProgressiveExcerptRequestContext(): boolean {
  return isCurrentReviewNativeProtyleSurface(document.activeElement)
    || isProgressiveSelectionInsideNativeProtyle({ root: rootRef.value })
    || isInsideReviewRoot(document.activeElement);
}

function handleProgressiveExcerptCommandRequest(event: Event): void {
  if (event.defaultPrevented) {
    return;
  }
  if (!hasProgressiveExcerptRequestContext()) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation?.();
  void handleProgressiveExcerptFromReview('command');
}

function maybeHandleReviewEscape(event: KeyboardEvent): boolean {
  if (!isReviewKeyboardContext(event.target)) {
    return false;
  }

  const decision = resolveReviewDialogEscapeKeydown({
    isDialogMode: isDialogMode(),
    key: event.key,
    repeat: event.repeat,
    escRepeatLatch,
    editorState: editorState.value,
  });

  if (decision === 'consume-latched') {
    event.preventDefault();
    event.stopPropagation();
    logger.debug('[SiYuanMemo][ReviewView] Consumed repeated Escape while latch is active');
    return true;
  }

  if (decision === 'exit-editor' && contentRef.value?.exitEditorByEscape()) {
    event.preventDefault();
    event.stopPropagation();
    escRepeatLatch = true;
    logger.debug('[SiYuanMemo][ReviewView] Exited Protyle editor by repeated Escape');
    return true;
  }

  return false;
}

function handleKeyUp(event: KeyboardEvent): void {
  if (shouldResetReviewDialogEscapeLatch({
    key: event.key,
    escRepeatLatch,
  })) {
    escRepeatLatch = false;
  }
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

  const action = resolveReviewKeyAction({
    key,
    answerShown: hook.context.value.showAnswer,
    isTopicLike: isTopicLikeCard(state.value.actions.cardMeta),
  });

  if (action.type === 'none') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (action.type === 'reveal') {
    logger.debug('[SiYuanMemo][ReviewView] Revealing answer...');
    hook.reveal();
    return;
  }

  if (action.type === 'grade') {
    logger.debug('[SiYuanMemo][ReviewView] Grading card', {
      rating: action.rating,
      blockId: state.value.actions.cardMeta?.blockID,
      cardId: state.value.actions.cardMeta?.cardID,
      cardType: state.value.actions.cardMeta?.cardType || state.value.actions.cardMeta?.type,
    });
    void hook.grade(action.rating);
    return;
  }

  if (action.type === 'skip') {
    logger.debug('[SiYuanMemo][ReviewView] Skipping card...');
    void hook.skip();
    return;
  }

  if (action.type === 'back') {
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

  const key = getForwardedReviewHotkey(e.detail);
  if (!key) {
    return;
  }
  if (consumeRecentlyModifiedReviewHotkey(recentModifiedHotkeys, key)) {
    logger.debug('[SiYuanMemo][ReviewView] Ignoring forwarded modified hotkey:', { key });
    return;
  }
  handleReviewKeyAction('hotkey', key, e);
}

// 🆕 处理标准键盘事件
function handleKeyDown(e: KeyboardEvent) {
  if (!isReviewKeyboardContext(e.target)) {
    return;
  }
  if (maybeHandleReviewEscape(e)) {
    return;
  }

  const key = normalizeReviewKeyboardKey(e.key);
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.shiftKey && key === 'x') {
    if (isTypingTarget(e.target) && !isCurrentReviewNativeProtyleSurface(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    void handleProgressiveExcerptFromReview('hotkey');
    return;
  }
  if (hasReviewKeyboardModifier(e)) {
    rememberModifiedReviewHotkey(recentModifiedHotkeys, {
      key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    });
    return;
  }

  // 忽略在输入框中的按键
  if (isTypingTarget(e.target)) {
    return;
  }

  handleReviewKeyAction('keydown', key, e);
}

function handleReveal(): void {
  escRepeatLatch = false;
  hook.reveal();
}

function handleGrade(rating: number): void {
  escRepeatLatch = false;
  void hook.grade(rating);
}

function handleSkip(): void {
  escRepeatLatch = false;
  void hook.skip();
}

function handleBack(): void {
  escRepeatLatch = false;
  void hook.back();
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
        void openSrsEditorDialog(currentCard.blockId, currentCard.id);
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
  openReviewBlockAtSource({
    app: props.app,
    blockId: id,
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

function buildReviewAIOptions(view: 'tutor' | 'explain' | 'make-cards', surface?: AIWorkbenchSurface): AIWorkbenchOpenOptions {
  const neuralQueue = getNeuralRoamQueue();
  return {
    view,
    source: 'review',
    surface,
    sessionId: reviewSessionId.value,
    sourceReviewSessionId: reviewSessionId.value,
    currentCard: state.value.content.card as FSRSCard | null,
    currentBlockId: resolveCurrentReviewBlockId() || null,
    queueType: resolveActiveReviewQueueType(),
    queueProgress: buildReviewQueueProgress(),
    revealed: hook.context.value.showAnswer === true,
    neuralBatch: neuralQueue?.getCurrentBatchSnapshot() ?? null,
  };
}

function getReviewAICompanionTitle(view: 'tutor' | 'explain' | 'make-cards'): string {
  const viewTitle = view === 'tutor'
    ? t('aiTutor', 'AI 导师')
    : view === 'explain'
      ? t('aiExplainCard', 'AI 解释卡片')
      : t('aiMakeCards', 'AI 辅助制卡');
  const reviewTitle = String(props.title || t('reviewTitle', 'Review')).trim();
  return `${viewTitle} · ${reviewTitle || t('reviewTitle', 'Review')}`;
}

function updateReviewDialogContainerLayout(): void {
  const dialogContainer = rootRef.value?.closest('.b3-dialog__container.siyuanmemo-review-dialog-container') as HTMLElement | null;
  if (!dialogContainer || props.mode !== 'dialog' || props.isMobile) {
    return;
  }

  if (dialogContainer.classList.contains('fullscreen')) {
    return;
  }

  dialogContainer.style.transition = 'width 180ms ease, max-width 180ms ease';
  if (showReviewAISidecar.value) {
    dialogContainer.style.width = 'min(1320px, 98vw)';
    dialogContainer.style.maxWidth = '1320px';
  } else {
    dialogContainer.style.width = 'min(860px, 96vw)';
    dialogContainer.style.maxWidth = '1024px';
  }
}

function closeReviewAISidebar(): void {
  reviewAISidebarOpen.value = false;
  updateReviewDialogContainerLayout();
}

async function syncReviewAIContextIfNeeded(surface: 'review-dialog-sidecar' | 'review-tab-companion'): Promise<void> {
  const registry = getReviewAIWorkbenchRegistry();
  if (!registry?.hasReviewSession?.(reviewSessionId.value) || !registry.updateReviewSessionContext) {
    return;
  }

  const activeView = reviewAIService.value?.state.activeView
    || registry.getReviewSession?.(reviewSessionId.value)?.state.activeView
    || 'explain';
  const service = await registry.updateReviewSessionContext({
    ...buildReviewAIOptions(activeView, surface),
    view: activeView,
    surface,
    sessionId: reviewSessionId.value,
  });
  reviewAIService.value = service;
}

async function openReviewAIAssistant(view: 'tutor' | 'explain' | 'make-cards'): Promise<void> {
  const surface: 'review-dialog-sidecar' | 'review-tab-companion' = props.mode === 'tab'
    ? 'review-tab-companion'
    : 'review-dialog-sidecar';

  if (surface === 'review-dialog-sidecar' && !canUseEmbeddedReviewAISidecar.value) {
    const dialogManager = getDialogManager();
    if (!dialogManager?.openAiWorkbenchDialog) {
      showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }
    await dialogManager.openAiWorkbenchDialog(buildReviewAIOptions(view, 'standalone-dialog'));
    return;
  }

  const registry = getReviewAIWorkbenchRegistry();
  if (!registry?.openReviewSession) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  if (surface === 'review-tab-companion') {
    const context = getPluginContext(props.plugin) || getWindowPlugin()?.getContext?.();
    const tabManager = context?.getTabManager?.();
    if (!tabManager?.openReviewAICompanionTab) {
      showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    await tabManager.openReviewAICompanionTab({
      ...buildReviewAIOptions(view, surface),
      sessionId: reviewSessionId.value,
      title: getReviewAICompanionTitle(view),
    });
    reviewAIService.value = registry.getReviewSession?.(reviewSessionId.value) || null;
    return;
  }

  const service = await registry.openReviewSession({
    ...buildReviewAIOptions(view, surface),
    sessionId: reviewSessionId.value,
    surface,
  });
  reviewAIService.value = service;
  reviewAISidebarOpen.value = true;
  updateReviewDialogContainerLayout();
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

  if (actionType === 'progressive-excerpt') {
    void handleProgressiveExcerptFromReview('toolbar');
    return;
  }

  if (actionType === 'progressive-open-source') {
    handleProgressiveOpenSource();
    return;
  }

  if (actionType === 'progressive-complete-piece') {
    void handleProgressiveCompletePiece();
    return;
  }

  if (actionType === 'ai-explain') {
    void openReviewAIAssistant('explain');
    return;
  }

  if (actionType === 'ai-tutor') {
    void openReviewAIAssistant('tutor');
    return;
  }

  if (actionType === 'ai-make-cards') {
    void openReviewAIAssistant('make-cards');
    return;
  }

  if (actionType === 'fullscreen') {
    if (props.isMobile) {
      return;
    }

    // 实现全屏功能（参考思源原生实现）
    logger.debug('[SiYuanMemo][ReviewView] Fullscreen button clicked');

    // 查找对话框容器
    const dialogContainer = rootRef.value?.closest('.b3-dialog__container.siyuanmemo-review-dialog-container')
      || document.querySelector('.b3-dialog__container.siyuanmemo-review-dialog-container');
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
    const blockId = resolveCurrentReviewBlockId();
    const cardId = cardMeta?.cardID;
    logger.debug('[SiYuanMemo][ReviewView] cardMeta:', cardMeta);
    logger.debug('[SiYuanMemo][ReviewView] blockId:', blockId);
    if (blockId) {
      openSrsEditorDialog(blockId, cardId);
    } else {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'sticktab') {
    // 打开为菜单
    handleOpenAsMenu(ev);
  } else if (actionType === 'lock-focus') {
    logger.debug('[SiYuanMemo][ReviewView] Lock focus button clicked');
    const blockId = resolveCurrentReviewBlockId();

    if (!blockId) {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
      return;
    }

    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      logger.error('[SiYuanMemo][ReviewView] Queue does not support orbit center actions');
      showMessage(t('queueNoFocusSupport', 'This queue does not support center actions'), 3000, 'error');
      return;
    }

    void (async () => {
      await startWorldlineFromCurrentNode(neuralQueue, blockId);
      refreshNavigationState();
      logger.debug('[SiYuanMemo][ReviewView] Started a new orbit from center node:', blockId);
      showMessage(getBuildStationSuccessMessage(neuralQueue), 3000, 'info');
    })().catch((error: Error) => {
      logger.error('[SiYuanMemo][ReviewView] Failed to set orbit center:', error);
      showMessage(getBuildStationFailedMessage(neuralQueue), 3000, 'error');
    });
  } else if (actionType === 'neural-engine-mode') {
    logger.debug('[SiYuanMemo][ReviewView] Engine mode toggle button clicked');
    const neuralQueue = getNeuralRoamQueue();
    if (!neuralQueue) {
      return;
    }

    const nextMode = neuralQueue.getEngineMode() === 'hyperspace' ? 'orbit' : 'hyperspace';
    void (async () => {
      await neuralQueue.setEngineMode(nextMode, { carryCurrentNode: true });
      refreshNavigationState();
      const navState = neuralQueue.getNavigationState();
      if (navState.currentNodeId) {
        await hook.loadCardByBlockId(navState.currentNodeId);
      }
      const modeText = getNeuralEngineLabel(nextMode, t, 'full');
      showMessage(t('engineModeSwitched', '已切换引擎：{mode}').replace('{mode}', modeText), 2000, 'info');
    })().catch((error: Error) => {
      logger.error('[SiYuanMemo][ReviewView] Failed to switch engine mode:', error);
      showMessage(t('engineModeSwitchFailed', 'Failed to switch engine mode'), 3000, 'error');
    });
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
    if (newMode === 'explore') {
      const blockId = resolveCurrentReviewBlockId();
      if (!blockId) {
        logger.error('[SiYuanMemo][ReviewView] Cannot start branch exploration without current block id');
        showMessage(getLockCurrentCenterFailedMessage(neuralQueue), 3000, 'error');
        return;
      }

      void (async () => {
        await startWorldlineFromCurrentNode(neuralQueue, blockId);
        refreshNavigationState();
        const modeText = t('navModeExplore', '自由航行');
        showMessage(t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText), 2000, 'info');
      })().catch((error: Error) => {
        logger.error('[SiYuanMemo][ReviewView] Failed to promote current node as worldline focus:', error);
        showMessage(getLockCurrentCenterFailedMessage(neuralQueue), 3000, 'error');
      });
      return;
    }

    neuralQueue.setNavigationMode(newMode);
    refreshNavigationState();

    const modeText = newMode === 'follow'
      ? t('navModeFollow', '沿当前路径')
      : t('navModeExplore', '自由航行');
    showMessage(t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText), 2000, 'info');
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
    showMessage(t('navReturnedToBookmark', '已返回空间站'), 2000, 'info');
  }
}

function handleOpenAsMenu(ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenAsMenu called', ev);

  const menu = new Menu();
  const currentBlockId = String(
    state.value.actions.cardMeta?.blockID
    || state.value.content.card?.blockId
    || state.value.content.data
    || state.value.content.id
    || ''
  );

  const pluginCandidate = isRecord(props.plugin) ? (props.plugin as ReviewPluginLike) : null;
  const pluginFromWindow = getWindowPlugin();
  const context = pluginCandidate?.getContext?.() ?? pluginFromWindow?.getContext?.();
  const tabManager = context?.getTabManager?.();

  if (!tabManager || typeof tabManager.openReviewTab !== 'function') {
    logger.error('[SiYuanMemo][ReviewView] TabManager not available for open-as');
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const transferState = buildReviewTabTransferState();
  const reviewTabOptions = {
    provider: props.provider,
    queue: props.queue,
    adapter: props.adapter,
    title: props.title || t('reviewTitle', 'Review'),
    headerVariant: props.headerVariant,
    transferState,
  };

  menu.addItem({
    id: 'locateSourceBlock',
    icon: 'iconOpen',
    label: t('locateSourceBlock', '定位到原块位置'),
    disabled: !props.app || !currentBlockId,
    click() {
      if (!props.app || !currentBlockId) {
        return;
      }
      openReviewBlockAtSource({
        app: props.app,
        blockId: currentBlockId,
      });
    },
  });
  menu.addItem({
    id: 'openRightReviewAndLocateSource',
    icon: 'iconLayoutRight',
    label: t('openRightReviewAndLocateSource', '右侧复习并定位原块'),
    disabled: !props.app || !currentBlockId,
    async click() {
      if (!props.app || !currentBlockId) {
        return;
      }
      try {
        await openReviewBlockAtSource({
          app: props.app,
          blockId: currentBlockId,
        });
      } catch (error) {
        logger.warn('[SiYuanMemo][ReviewView] Failed to locate source block before opening review:', error);
      }
      tabManager.openReviewTab(reviewTabOptions);
      emit('close');
    },
  });
  menu.addSeparator();

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
  openMenuAtEvent(menu, ev);
}

// Part 4: 打开 SRS 编辑器对话框
function openSrsEditorDialog(blockId: string, cardId?: string) {
  logger.debug('[SiYuanMemo][ReviewView] openSrsEditorDialog called with card reference:', { blockId, cardId });

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

  const card = cardId
    ? context?.getStorage?.()?.getCard(cardId)
    : context?.getStorage?.()?.getCardByBlockId(blockId);
  if (!card) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: Card not found for card reference:', { blockId, cardId });
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
    events: {
      scheduled: async (payload: unknown) => {
        const scheduledPayload = isRecord(payload) ? payload as ScheduledReviewCardPayload : {};
        await advanceScheduledCurrentCard({
          cardId: typeof scheduledPayload.cardId === 'string' ? scheduledPayload.cardId : card.id,
          blockId,
          dueTimestamp: typeof scheduledPayload.dueTimestamp === 'number' ? scheduledPayload.dueTimestamp : undefined,
        });
      },
      dismissed: async (payload: unknown) => {
        const dismissedPayload = isRecord(payload) ? payload as DismissedReviewCardPayload : {};
        await advanceDismissedCurrentCard({
          cardId: typeof dismissedPayload.cardId === 'string' ? dismissedPayload.cardId : card.id,
          blockId: typeof dismissedPayload.blockId === 'string' ? dismissedPayload.blockId : blockId,
          dismissed: dismissedPayload.dismissed === true,
        });
      },
    },
    width: 'min(680px, 92vw)',
    height: 'min(640px, 66vh)',
  });
}

// Part 5: 在标签页中打开卡片
function openCardInTab(blockId: string, openInRight: boolean) {
  if (!props.app) return;

  openReviewBlockAtSource({
    app: props.app,
    blockId,
    position: openInRight ? 'right' : undefined,
  });
}

// Part 5: 在新窗口中打开卡片
function openCardInNewWindow(blockId: string) {
  if (!props.app) return;

  openReviewBlockAtSource({
    app: props.app,
    blockId,
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

function buildSeedMenuLabel(entry: NeuralRoamSourceEntry): string {
  const preview = entry.nodePreview || shortenBlockId(entry.nodeId);
  const typeLabel = entry.role === 'activation-source'
    ? t('activationKindSourceRoot', '概念卡：激活源')
    : t('activationKindFocusRoot', '概念卡：轨道中心节点');
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
    focus: t('associationFocusNode', '概念卡：轨道中心节点'),
    source: t('activationKindSourceRoot', '概念卡：激活源'),
    path: t('associationPathNode', '轨迹节点'),
  };
  return associationTypeMap[entry.associationType] || entry.associationType || t('unknown', '未知');
}

function handleNeuralFocusMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    showMessage(t('queueNoFocusSupport', '当前队列不支持中心操作'), 3000, 'error');
    return;
  }

  const sourceLabels = resolveNeuralSourceLabels(neuralQueue);
  const seedEntries = neuralQueue.getSourceSnapshot().sort((a, b) => b.visitedAt - a.visitedAt);
  const menu = new Menu('neural-focuses-menu');

  menu.addItem({
    icon: 'iconList',
    label: getReviewSourceListLabel(neuralQueue),
    click: () => {
      openNeuralBrowserSubview('concept-cards');
    },
  });

  menu.addItem({
    icon: 'iconPlay',
    label: sourceLabels.startPath,
    disabled: seedEntries.length === 0,
    submenu: seedEntries.map((entry) => ({
      label: buildSeedMenuLabel(entry),
      click: async () => {
        try {
          await neuralQueue.setCurrentFocus(entry.nodeId, {
            includeFocusAsFirst: true,
            resetHistory: false,
            bookmarkCurrentPath: true,
          });
          await hook.loadCardByBlockId(entry.nodeId);
          refreshNavigationState();
          showMessage(getStartPathFromSourceMessage(entry.nodeId, neuralQueue), 3000, 'info');
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to start roaming from focus:', error);
          showMessage(t('roamStartFailed', '开始漫游失败'), 3000, 'error');
        }
      },
    })),
  });

  menu.addItem({
    icon: 'iconTrashcan',
    label: sourceLabels.removeItem,
    disabled: seedEntries.length === 0,
    submenu: seedEntries.map((entry) => ({
      label: buildSeedMenuLabel(entry),
      click: async () => {
        try {
          await neuralQueue.setSourceEntry(entry.nodeId, false);
          refreshNavigationState();
          showMessage(getSourceRemovedMessage(entry.nodeId, neuralQueue), 3000, 'info');
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to remove focus:', error);
          showMessage(getRemoveSourceFailedMessage(neuralQueue), 3000, 'error');
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

  const totalHistoryCount = neuralQueue.getHistoryCount();
  const jumpCandidates = neuralQueue.getHistoryPage({
    offset: 0,
    limit: 20,
  }).entries.slice().reverse();
  const menu = new Menu('neural-history-menu');

  menu.addItem({
    icon: 'iconHistory',
    label: t('viewHistory', '查看双链轨道'),
    click: () => {
      openNeuralBrowserSubview('roam-history');
    },
  });

  menu.addItem({
    icon: 'iconBookmark',
    label: t('viewAnchors', '查看空间站'),
    click: () => {
      openNeuralBrowserSubview('worldline-anchors');
    },
  });

  menu.addItem({
    icon: 'iconOpen',
    label: t('jumpHistoryNode', '跳转轨迹节点'),
    disabled: jumpCandidates.length === 0,
    submenu: jumpCandidates.map((entry, index) => ({
      label: buildHistoryLabel(entry, totalHistoryCount - jumpCandidates.length + index + 1),
      click: async () => {
        const jumped = await neuralQueue.jumpToHistoryNode(entry.nodeId);
        if (!jumped) {
          showMessage(t('jumpHistoryNodeFailed', '跳转轨迹节点失败'), 3000, 'error');
          return;
        }
        const currentNodeId = neuralQueue.getNavigationState().currentNodeId || entry.nodeId;
        await hook.loadCardByBlockId(currentNodeId);
        refreshNavigationState();
      },
    })),
  });

  menu.addItem({
    icon: 'iconClear',
    label: t('clearHistory', '清空轨迹历史'),
    click: () => {
      neuralQueue.clearHistory('all');
      refreshNavigationState();
      showMessage(t('historyClearedSuccess', '轨迹历史已清空'), 3000, 'info');
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

function resolveCurrentReviewBlockId(): string {
  return String(
    state.value.actions.cardMeta?.blockID
    || state.value.content.card?.blockId
    || state.value.content.data
    || state.value.content.id
    || '',
  ).trim();
}

function resolveCurrentReviewCardId(): string {
  return String(
    state.value.actions.cardMeta?.cardID
    || state.value.content.card?.id
    || '',
  ).trim();
}

function resolveProgressiveSourceTargetId(): string {
  const card = state.value.content.card;
  if (typeof card?.extractedFrom === 'string' && card.extractedFrom.trim().length > 0) {
    return card.extractedFrom.trim();
  }
  const progressive = card?.meta?.progressive;
  if (!progressive || typeof progressive !== 'object') {
    return '';
  }
  const sourceBlockId = (progressive as Record<string, unknown>).sourceBlockId;
  if (typeof sourceBlockId === 'string' && sourceBlockId.trim().length > 0) {
    return sourceBlockId.trim();
  }
  const sourceDocId = (progressive as Record<string, unknown>).sourceDocId;
  return typeof sourceDocId === 'string' ? sourceDocId.trim() : '';
}

async function handleProgressiveExcerptFromReview(trigger: 'hotkey' | 'toolbar' | 'command'): Promise<void> {
  if (!isProgressiveExcerptEnabled()) {
    showMessage(t('progressiveExcerptDisabled', '摘抄快捷键已关闭，请先在设置中开启'), 3000, 'info');
    return;
  }

  const currentCard = state.value.content.card;
  if (!currentCard || currentCard.type !== 'topic') {
    showMessage(t('progressiveExcerptTopicOnly', '⌥⇧X 当前先只支持 Topic 卡'), 3000, 'error');
    return;
  }

  const selectionService = getSelectionExcerptService();
  if (!selectionService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const selection = resolveProgressiveExcerptSelectionSnapshot({
    root: rootRef.value,
    resolveProtyle: (commonElement) => {
      const host = commonElement.closest('.fsrs-review-v2-content__protyle-host');
      return host ? getProtyleFromHost(host) : null;
    },
  });
  if (!selection) {
    showMessage(t('progressiveExcerptNoSelection', '请先选中文本后再摘抄'), 3000, 'error');
    return;
  }

  await createProgressiveExcerptFromReviewSelection(selection, trigger);
}

async function createProgressiveExcerptFromReviewSelection(
  selection: ProgressiveExcerptSelectionSnapshot,
  trigger: 'hotkey' | 'toolbar' | 'command',
): Promise<void> {
  const selectionService = getSelectionExcerptService();
  if (!selectionService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  try {
    const materialized = await selectionService.materializeExcerptSource(selection);
    const preparedHighlight = tryPrepareProgressiveExcerptHighlight(materialized.highlightSnapshot);
    const result = await selectionService.createFromSelection({
      sourceBlockId: materialized.sourceBlockId,
      sourceBlockIds: materialized.sourceBlockIds,
      selectedText: selection.text,
      contentDom: materialized.contentDom,
      origin: 'review',
      currentCardId: resolveCurrentReviewCardId(),
    });
    if (result.kind === 'duplicate') {
      await tryApplyPreparedProgressiveExcerptHighlight(preparedHighlight);
      await tryOpenExistingExcerptFromReview(result.record);
      showMessage(
        t('progressiveExcerptDuplicateJumped', '这段原文已摘录过，已跳到现有摘录'),
        3000,
        'info',
      );
      return;
    }

    result.colorApplied = await tryApplyPreparedProgressiveExcerptHighlight(preparedHighlight);
    const routedExcerptTarget = await enqueueExcerptIntoCurrentProgressiveReview(result.excerptEntityId)
      .then((inserted) => (inserted ? 'progressive' as const : null))
      .then(async (target) => {
        if (target) {
          return target;
        }
        const injected = await injectExcerptIntoCurrentHyperspaceReview(result.excerptEntityId);
        return injected ? 'hyperspace' as const : null;
      })
      .catch((error) => {
        logger.warn('[SiYuanMemo][ReviewView] Failed to route progressive excerpt into current review:', error);
        return null;
      });
    showMessage(
      routedExcerptTarget === 'progressive'
        ? t('progressiveExcerptCreatedInserted', '摘抄已创建、制为 Topic，并插入当前渐进复习')
        : routedExcerptTarget === 'hyperspace'
          ? t('progressiveExcerptCreatedMergedHyperspace', '摘抄已创建、制为 Topic，并并入当前超空间神经漫游')
        : trigger !== 'toolbar'
          ? t('progressiveExcerptCreatedHotkey', '摘抄已创建并制为 Topic')
          : t('progressiveExcerptCreated', '摘抄已创建并制为 Topic'),
      3000,
      'info',
    );
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to create excerpt from review:', error);
    showMessage(
      t('progressiveExcerptFailed', '摘抄失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

function tryPrepareProgressiveExcerptHighlight(selection: ProgressiveExcerptSelectionSnapshot) {
  try {
    return prepareProgressiveExcerptHighlight(selection);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to prepare progressive excerpt highlight:', error);
    return null;
  }
}

async function tryApplyPreparedProgressiveExcerptHighlight(
  preparedHighlight: ReturnType<typeof prepareProgressiveExcerptHighlight>,
): Promise<boolean> {
  const selectionService = getSelectionExcerptService();
  if (!selectionService) {
    return false;
  }

  try {
    return await applyProgressiveExcerptHighlight(preparedHighlight, {
      persistDomBlock: (blockId, dom) => selectionService.updateSourceBlockDom(blockId, dom),
    });
  } catch (highlightError) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to apply progressive excerpt highlight:', highlightError);
    return false;
  }
}

async function tryOpenExistingExcerptFromReview(record: ExcerptRecord): Promise<void> {
  try {
    const tabApplicationService = getTabApplicationService();
    if (!tabApplicationService) {
      return;
    }

    if (record.excerptEntityType === 'doc') {
      await tabApplicationService.openDocumentTab({ docId: record.excerptEntityId });
      return;
    }

    await tabApplicationService.openBlockTab({ blockId: record.excerptEntityId });
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to open existing duplicate excerpt:', error);
  }
}

function handleProgressiveOpenSource(): void {
  const sourceTargetId = resolveProgressiveSourceTargetId();
  if (!props.app || !sourceTargetId) {
    showMessage(t('progressiveOpenSourceUnavailable', '当前卡片没有可回源的来源块'), 3000, 'error');
    return;
  }

  void openReviewBlockAtSource({
    app: props.app,
    blockId: sourceTargetId,
  });
}

async function handleProgressiveCompletePiece(): Promise<void> {
  const service = getProgressiveReadingService();
  const pieceDocId = resolveCurrentReviewBlockId();
  if (!service || !pieceDocId) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  try {
    const result = await service.completeCurrentPiece(pieceDocId);
    showMessage(
      result.nextPieceDocId
        ? t('progressivePieceCompletedNext', '当前片已完成，下一片已激活')
        : t('progressivePieceCompletedFinal', '当前片已完成，已到最后一片'),
      3000,
      'info',
    );
    handleGrade(3);
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to complete current progressive piece:', error);
    showMessage(
      t('progressiveCompletePieceFailed', '完成当前片失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

async function startWorldlineFromCurrentNode(
  neuralQueue: NeuralRoamSessionQueue,
  blockId: string,
): Promise<void> {
  await neuralQueue.setAnchorEntry(blockId, true);
  await neuralQueue.setCurrentFocus(blockId, {
    includeFocusAsFirst: false,
    resetHistory: false,
    bookmarkCurrentPath: true,
  });
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
    neuralNavigationState.value = null;
    return;
  }

  const navState = getNavigationState();
  if (navState) {
    neuralNavigationState.value = navState;
    return;
  }

  neuralNavigationState.value = null;
}

async function syncToNeuralQueueCurrentNode(fallbackNodeId?: string | null): Promise<boolean> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return false;
  }

  const currentNodeId = String(
    neuralQueue.getNavigationState().currentNodeId
    || fallbackNodeId
    || '',
  ).trim();

  if (!currentNodeId) {
    return false;
  }

  await hook.loadCardByBlockId(currentNodeId);
  refreshNavigationState();
  return resolveCurrentReviewBlockId() === currentNodeId;
}

defineExpose<ReviewViewTabBridge>({
  syncToNeuralQueueCurrentNode,
});

watch(
  () => state.value.content.id,
  () => {
    escRepeatLatch = false;
    refreshNavigationState();
  }
);

watch(
  () => [
    resolveCurrentReviewCardId(),
    resolveCurrentReviewBlockId(),
    hook.context.value.showAnswer === true,
    JSON.stringify(getNeuralRoamQueue()?.getCurrentBatchSnapshot() ?? null),
  ],
  () => {
    const surface = props.mode === 'tab' ? 'review-tab-companion' : 'review-dialog-sidecar';
    void syncReviewAIContextIfNeeded(surface);
  },
);

watch(
  showReviewAISidecar,
  () => {
    updateReviewDialogContainerLayout();
  },
);

watch(
  canUseEmbeddedReviewAISidecar,
  (enabled) => {
    if (!enabled && reviewAISidebarOpen.value) {
      reviewAISidebarOpen.value = false;
      updateReviewDialogContainerLayout();
    }
  },
);

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

.fsrs-review-v2__workspace {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  min-width: 0;
}

.fsrs-review-v2__workspace--with-ai {
  grid-template-columns: minmax(0, 1fr) minmax(380px, 420px);
  gap: 0;
  background:
    linear-gradient(180deg, rgba(248, 249, 255, 0.98), rgba(242, 244, 251, 0.98));
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

.fsrs-review-v2__workspace--with-ai .fsrs-review-v2__content-wrapper {
  border-right: 1px solid rgba(112, 102, 173, 0.12);
  background: var(--b3-theme-background);
}

.fsrs-review-v2__ai-sidecar {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(249, 249, 255, 0.98), rgba(242, 243, 251, 0.98));
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
  width: min(900px, calc(100vw - 32px));
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
.b3-dialog__container.siyuanmemo-review-dialog-container.fullscreen {
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
.b3-dialog__container.siyuanmemo-review-dialog-container:not(.fsrs-mobile-review-dialog) {
  border-radius: var(--b3-border-radius-b) !important;
}

.b3-dialog__container.fsrs-mobile-review-dialog {
  border-radius: 0 !important;
  max-width: 100vw !important;
}
</style>

