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
          :meta="state.meta"
          :i18n="i18n"
          :is-tab-mode="props.mode === 'tab'"
          :title="props.title"
          :mode="props.mode"
          :is-mobile="props.isMobile"
          :native-dialog-titlebar="props.nativeDialogTitlebar === true"
          :navigation-state="neuralNavigationState"
          @toolbar-action="handleToolbarAction"
          @action="hook.executeCommand"
          @context="handleContext"
          @breadcrumb-click="handleBreadcrumbClick"
          @queue-switch="handleQueueSwitchTrigger"
        />

        <div v-if="reviewArenaHint" class="fsrs-review-v2__arena-hint">
          {{ reviewArenaHint }}
        </div>

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
          :render-epoch="renderEpoch"
          :render-services="reviewRenderServices"
          @editor-state-change="handleEditorStateChange"
        />

        <ReviewActions
          v-if="!isEmptyReviewContent"
          :actions="state.actions"
          :meta="state.meta"
          :current-card="state.content.card"
          :i18n="i18n"
          :queue="props.queue"
          :queue-type="activeReviewQueueType"
          :plugin="props.plugin"
          :is-mobile="props.isMobile"
          @reveal="handleReveal"
          @grade="handleGrade"
          @skip="handleSkip"
          @back="handleBack"
          @command="hook.executeCommand"
          @openMenu="handleOpenMenu"
        />

        <div v-if="showCompletedEmptyStateExit" class="fsrs-review-v2__empty-footer">
          <button
            type="button"
            class="b3-button b3-button--outline fsrs-review-v2__empty-exit"
            @click="closeCurrentReviewSurface"
          >
            {{ t('exitFocus', '退出') }}
          </button>
        </div>

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

        <LargeTextEditorDialog
          :open="reviewTextEditorOpen"
          :title="reviewTextEditorTitle"
          :model-value="reviewTextEditorValue"
          :readonly="reviewTextEditorReadonly"
          :placeholder="t('editCurrentContentPlaceholder', '使用 Markdown 编辑当前块内容')"
          :hint="reviewTextEditorHint"
          :confirm-label="t('save', '保存')"
          :confirm-disabled="reviewTextEditorConfirmDisabled"
          :cancel-label="t('cancel', '取消')"
          :close-label="t('close', '关闭')"
          @update:model-value="reviewTextEditorValue = $event"
          @confirm="confirmCurrentContentEditor"
          @close="closeCurrentContentEditor"
        />
      </div>

      <aside v-if="showReviewAISidecar && reviewAIService" class="fsrs-review-v2__ai-sidecar">
        <AiWorkbenchPane :service="reviewAIService" :i18n="i18n" @close="closeReviewAISidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Menu, showMessage, type App } from 'siyuan';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import FilterDialog from '@/ui/browser/dialogs/FilterDialog.vue';
import ActionParamsDialog from '@/ui/browser/ActionParamsDialog.vue';
import AiWorkbenchPane from '@/ui/ai/AiWorkbenchPane.vue';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import SrsArenaConflictDialog from './dialogs/SrsArenaConflictDialog.vue';
import {
  createReviewSessionController,
  useReviewSession,
  type ReviewSessionActionError,
  type ReviewSessionController,
  type ReviewSessionUpdateReason,
} from './useReviewSession';
import {
  resolveReviewHeaderVariant,
  type RefreshCurrentItemOptions,
  type ReviewEditableSource,
  type ReviewHeaderVariant,
  type ReviewNativeSplitGuardState,
  type ReviewUIState,
  type ReviewViewTabBridge,
} from './types';
import { matchReviewNativeTabSplitCommand, pruneNativeTabSplitMenu } from './reviewNativeSplitHostGuard';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import { getNeuralEngineLabel, getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import {
  QueueType,
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
  type QueueReviewSchedulingContext,
  type ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import type { ReviewQueueSessionSnapshot, ReviewTabRuntimeState } from '@/types/review-tab';
import { isTopicLikeCard } from './reviewCardSemantics';
import { resolveReviewDialogEscapeKeydown, shouldResetReviewDialogEscapeLatch } from './reviewDialogEscape';
import { createReviewEditorState, type ReviewEditorState } from './reviewEditorState';
import {
  buildReviewAIChatKey as buildReviewAIChatKeyFromQueue,
  buildReviewAICompanionTitle,
  buildReviewAIOpenOptions,
  openReviewAIAssistantCommand,
  resolveDefaultReviewAIEntryView as resolveDefaultReviewAIEntryViewFromSettings,
  resolveReviewAIEntryView as resolveReviewAIEntryViewFromState,
  syncReviewAIContextIfNeededCommand,
  type ReviewAIRegistryLike,
  type ReviewAIRequestedView,
  type ReviewAISurface,
} from './reviewAICommands';
import { resolveReviewKeyAction } from './reviewKeyActionResolver';
import {
  consumeRecentlyModifiedReviewHotkey,
  getForwardedReviewHotkey,
  hasReviewKeyboardModifier,
  normalizeReviewKeyboardKey,
  rememberModifiedReviewHotkey,
} from './reviewKeyboardGuard';
import {
  buildReviewMoreMenuItems,
  isReviewMenuSeparator,
  type ReviewMenuItem,
} from './reviewMoreMenuItems';
import {
  isProgressiveSelectionInsideNativeProtyle,
  type ProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import { PROGRESSIVE_EXCERPT_REQUEST_EVENT } from '@/application/handlers/ProgressiveExcerptHotkeyHandler';
import {
  REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
  REVIEW_SET_PRIORITY_REQUEST_EVENT,
  REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT,
} from '@/application/handlers/ReviewCommandRequestEvents';
import {
  applyProgressiveExcerptHighlight,
  prepareProgressiveExcerptHighlight,
} from '@/application/entries/ProgressiveExcerptHighlight';
import type { ExcerptRecord } from '@/application/services/ExcerptRecordService';
import type { ProgressiveExcerptCreationResult } from '@/application/services/ProgressiveReadingService';
import type { AIWorkbenchOpenOptions, AIWorkbenchSurface } from '@/types/ai';
import type { PluginSettings } from '@/types/settings';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { SharedReviewSessionRegistry } from '@/application/services/SharedReviewSessionRegistry';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import { prepareReviewPresentation } from './reviewPresentationPreparer';
import type { SrsArenaRecommendation } from '@/types/arena';

const logger = createLogger('ReviewView');

const STANDARD_REVIEW_DIALOG_VARIANT_BY_QUEUE_TYPE: Partial<Record<QueueType, ReviewHeaderVariant>> = {
  [QueueType.RetrievalPractice]: 'retrieval-practice',
  [QueueType.IncrementalLearning]: 'incremental-learning',
  [QueueType.FinalDrill]: 'final-drill',
  [QueueType.FilterGroup]: 'filter-group',
  [QueueType.NeuralRoam]: 'neural-roam',
};

const MAIN_REVIEW_QUEUE_SWITCH_ORDER: QueueType[] = [
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FinalDrill,
  QueueType.FilterGroup,
  QueueType.NeuralRoam,
];

const MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT: Partial<Record<ReviewHeaderVariant, QueueType>> = {
  'retrieval-practice': QueueType.RetrievalPractice,
  'incremental-learning': QueueType.IncrementalLearning,
  'final-drill': QueueType.FinalDrill,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
};

type ReviewPluginContextLike = {
  getDialogManager?: () =>
    | {
        openBrowserDialog?: (options?: {
          initialQueueId?: string;
          initialNeuralSubview?: 'concept-cards' | 'roam-history' | 'worldline-anchors';
        }) => void;
        openAiWorkbenchDialog?: (options?: AIWorkbenchOpenOptions) => Promise<void> | void;
        openStandardReviewDialog?: (options: {
          queueType: QueueType;
          title: string;
          headerVariant: ReviewHeaderVariant;
          queueInstance?: unknown;
          initialSessionState?: InitialReviewSessionState;
        }) => void;
        switchStandardReviewDialogQueue?: (queueType: QueueType) => Promise<void> | void;
      }
    | undefined;
  getReviewAIWorkbenchRegistry?: () =>
    | (ReviewAIRegistryLike & {
        disposeReviewSession?: (sessionId: string) => void;
      })
    | undefined;
  getSharedReviewSessionRegistry?: () => SharedReviewSessionRegistry | undefined;
  createReviewRenderServices?: (options?: { i18n?: Record<string, string> }) => ReviewRenderServices;
  getCardStorage?: () => unknown;
  getTabManager?: () =>
    | {
        openReviewTab: (options: {
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          position?: 'right' | 'bottom';
          sharedReviewSessionId?: string | null;
          transferState?: ReviewTabTransferState;
          reviewState?: ReviewTabRuntimeState | null;
        }) => void;
        openReviewTabInNewTab?: (options: {
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          position?: 'right' | 'bottom';
          sharedReviewSessionId?: string | null;
          transferState?: ReviewTabTransferState;
          reviewState?: ReviewTabRuntimeState | null;
        }) => void;
        openReviewInNewWindow?: (options: {
          queue?: unknown;
          adapter?: unknown;
          title: string;
          headerVariant?: ReviewHeaderVariant;
          position?: 'right' | 'bottom';
          sharedReviewSessionId?: string | null;
          transferState?: ReviewTabTransferState;
          reviewState?: ReviewTabRuntimeState | null;
        }) => void;
        replaceCurrentReviewTabWithStandardQueue?: (queueType: QueueType) => void;
        closeReviewTab?: (reviewSessionId: string) => void;
        openReviewAICompanionTab?: (options: AIWorkbenchOpenOptions & { sessionId: string; title: string }) => Promise<void> | void;
        focusReviewAICompanionTab?: (reviewSessionId: string) => boolean;
        hasReviewAICompanionTab?: (reviewSessionId: string) => boolean;
      }
    | undefined;
  getHybridSyncService?: () => { incrementalSync: () => Promise<void> } | undefined;
  getStorage?: () => {
    getSettings?: () => ReviewRuntimeSettingsLike;
    getCard?: (cardId: string) => { id: string; blockId?: string } | undefined;
    getCardByBlockId?: (blockId: string) => { id: string } | undefined;
  };
  getReviewService?: () => ReviewApplicationService | undefined;
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
    getSettings?: () => ReviewRuntimeSettingsLike;
  } | undefined;
  getTransactionWebSocketService?: () => ReviewTransactionWebSocketServiceLike | undefined;
  getCardService?: () => CardApplicationService | undefined;
  getCardEditorService?: () => CardEditorApplicationService | undefined;
  getArenaKernelService?: () => {
    buildSrsRecommendation?: (
      card: FSRSCard,
      currentSchedulerType?: 'fsrs-v6' | 'sm15' | 'a-factor-v2' | null,
      now?: number,
      options?: { ratingBasis?: number; schedulingContext?: QueueReviewSchedulingContext | null },
    ) => Promise<SrsArenaRecommendation | null>;
    recordSrsReview?: (input: { card: FSRSCard; rating: number; currentSchedulerType?: 'fsrs-v6' | 'sm15' | 'a-factor-v2' | null; schedulingContext?: QueueReviewSchedulingContext | null }) => Promise<unknown>;
  } | undefined;
  getSchedulerRouter?: () => {
    getSchedulerType?: (card: FSRSCard) => 'fsrs-v6' | 'sm15' | 'a-factor-v2';
  } | undefined;
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | null | undefined;
};

type ReviewRuntimeSettingsLike = Pick<Partial<PluginSettings>,
  'ai' | 'progressiveReading' | 'quickCard' | 'riffIntegration' | 'ui'
>;

type ReviewWorkspaceTransactionOperation = {
  id?: unknown;
  parentID?: unknown;
  previousID?: unknown;
  nextID?: unknown;
};

type ReviewWorkspaceTransaction = {
  doOperations?: ReviewWorkspaceTransactionOperation[] | null;
};

type ReviewTransactionHandler = {
  handle(transactions: ReviewWorkspaceTransaction[]): void;
};

type ReviewTransactionWebSocketServiceLike = {
  registerHandler?: (handler: ReviewTransactionHandler) => void;
  unregisterHandler?: (handler: ReviewTransactionHandler) => void;
};

type ReviewPluginLike = {
  name?: unknown;
  getContext?: () => ReviewPluginContextLike | undefined;
  openReviewTab?: (options: {
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
  getReviewSchedulingContext?: (card: FSRSCard) => QueueReviewSchedulingContext | null;
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

type QueueStrategyWithSessionSnapshot = {
  serializeSessionSnapshot?: () => ReviewQueueSessionSnapshot;
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

type SrsArenaConflictAdoptPayload = {
  kind?: 'weighted' | 'contestant';
  contestantId?: string;
  dueTimestamp?: number;
  scheduledDays?: number;
};

type DismissedReviewCardPayload = {
  cardId?: string;
  blockId?: string;
  dismissed?: boolean;
};

type ReviewCardPeerInfo = {
  currentCardId: string;
  currentBlockId: string;
  peerCards: FSRSCard[];
};

type ReviewContentExpose = {
  exitEditorByEscape: () => boolean;
  getEditableSource: () => ReviewEditableSource | null;
  getDependencyBlockIds?: () => string[];
  getNativeSplitGuardState?: () => ReviewNativeSplitGuardState;
  refreshVisibleContent?: (reason?: string) => Promise<boolean>;
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

function getReviewRuntimeSettings(): ReviewRuntimeSettingsLike | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getSettingsService?.()?.getSettings?.()
    || contextFromWindow?.getSettingsService?.()?.getSettings?.()
    || contextFromProps?.getStorage?.()?.getSettings?.()
    || contextFromWindow?.getStorage?.()?.getSettings?.()
    || null;
}

function isReviewSourceBlockRefreshEnabled(): boolean {
  return getReviewRuntimeSettings()?.ui?.reviewSourceBlockRefreshEnabled === true;
}

function getReviewTransactionWebSocketService(): ReviewTransactionWebSocketServiceLike | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getTransactionWebSocketService?.()
    || contextFromWindow?.getTransactionWebSocketService?.()
    || null;
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
  title?: string; // 队列标题（如"提取练习"）
  headerVariant?: ReviewHeaderVariant;
  mode?: 'dialog' | 'tab'; // 🆕 打开模式（对话框/Tab）
  plugin?: unknown; // 🆕 插件实例，用于访问 hybridSyncService
  isMobile?: boolean;
  nativeDialogTitlebar?: boolean;
  startFullscreen?: boolean;
  reviewSessionId?: string;
  sharedReviewSessionId?: string | null;
  onReview?: (cardId: string, rating: number) => void; // 🆕 复习回调（用于刻意练习黑名单）
  reviewState?: ReviewTabRuntimeState | null;
  initialSessionState?: InitialReviewSessionState;
  initialCurrentItem?: FSRSCard | null;
  initialCurrentCardId?: string;
  initialShowAnswer?: boolean;
  onTabRuntimeStateChange?: (state: ReviewTabRuntimeState | null) => void;
  reviewRenderServices?: ReviewRenderServices;
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
  (e: 'close'): void; // 添加关闭事件
  (e: 'convert-to-tab'): void; // 🆕 转换为 Tab 模式（kebab-case）
}>();

function createReviewSessionId(): string {
  return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSharedReviewSessionId(): string {
  return `shared-review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const reviewSessionId = ref(String(props.reviewSessionId || '').trim() || createReviewSessionId());
const sharedReviewSessionId = ref(String(props.sharedReviewSessionId || '').trim());
const i18n = props.i18n;
const reviewRenderServices = computed(() => (
  props.reviewRenderServices
  ?? getPluginContext(props.plugin)?.createReviewRenderServices?.({ i18n: i18n || {} })
));
const reviewAIService = ref<AIWorkbenchService | null>(null);
const reviewAISidebarOpen = ref(false);
const reviewArenaHint = ref<string | null>(null);
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);

const rootRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<ReviewContentExpose | null>(null);
const recentModifiedHotkeys = new Map<string, number>();
const reviewSourceRefreshSuppressedBlockIds = new Map<string, number>();
const pendingReviewSourceBlockIds = new Set<string>();
const editorState = ref<ReviewEditorState>(createReviewEditorState());
const renderEpoch = ref(0);
const reviewTextEditorOpen = ref(false);
const reviewTextEditorLoading = ref(false);
const reviewTextEditorSaving = ref(false);
const reviewTextEditorSource = ref<ReviewEditableSource | null>(null);
const reviewTextEditorValue = ref('');
const reviewTextEditorOriginalValue = ref('');
let reviewTextEditorSeq = 0;
let reviewResizeHandler: (() => void) | null = null;
let srsArenaConflictDialog: ReturnType<typeof createVueDialog> | null = null;
let initialFullscreenTimer: number | null = null;
let initialTabSurfaceRefreshTimer: number | null = null;
let nativeSplitMenuPruneTimer: number | null = null;
let reviewSourceRefreshTimer: number | null = null;
let nativeSplitBlockedNoticeAt = 0;
let escRepeatLatch = false;
const NATIVE_SPLIT_BLOCKED_NOTICE_COOLDOWN_MS = 1500;
const REVIEW_SOURCE_REFRESH_DEBOUNCE_MS = 200;
const REVIEW_SOURCE_REFRESH_SUPPRESSION_MS = 600;

const reviewTextEditorTitle = computed(() => (
  reviewTextEditorSource.value?.title || t('editCurrentContent', '编辑当前内容')
));
const reviewTextEditorReadonly = computed(() => reviewTextEditorLoading.value || reviewTextEditorSaving.value);
const reviewTextEditorConfirmDisabled = computed(() => (
  reviewTextEditorReadonly.value
  || !reviewTextEditorSource.value
  || reviewTextEditorValue.value === reviewTextEditorOriginalValue.value
));
const reviewTextEditorHint = computed(() => {
  if (reviewTextEditorLoading.value) {
    return t('loadingCurrentContentMarkdown', '正在读取当前块的原始 Markdown...');
  }
  if (reviewTextEditorSaving.value) {
    return t('savingCurrentContentMarkdown', '正在保存到思源块...');
  }
  return t('editCurrentContentHint', '支持 Markdown，Ctrl/Cmd + Enter 保存');
});

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

function resolveCurrentReviewSchedulingContext(card: FSRSCard | null | undefined): QueueReviewSchedulingContext | null {
  if (!card) {
    return null;
  }
  const queue = getUnderlyingQueue();
  const queueContext = typeof queue?.getReviewSchedulingContext === 'function'
    ? queue.getReviewSchedulingContext(card)
    : null;
  return {
    queueType: queueContext?.queueType ?? QueueType.RetrievalPractice,
    source: queueContext?.source ?? 'queue',
    ...(queueContext || {}),
  };
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
  const activeQueue = props.queue;
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

function getTabManager() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getTabManager?.() || contextFromWindow?.getTabManager?.() || null;
}

function getReviewAIWorkbenchRegistry() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getReviewAIWorkbenchRegistry?.() || contextFromWindow?.getReviewAIWorkbenchRegistry?.() || null;
}

function getSharedReviewSessionRegistry(): SharedReviewSessionRegistry | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getSharedReviewSessionRegistry?.() || contextFromWindow?.getSharedReviewSessionRegistry?.() || null;
}

function getArenaKernelService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getArenaKernelService?.() || contextFromWindow?.getArenaKernelService?.() || null;
}

function getSchedulerTypeForCard(card: FSRSCard | null | undefined): 'fsrs-v6' | 'sm15' | 'a-factor-v2' | null {
  if (!card) {
    return null;
  }
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  const schedulerRouter = contextFromProps?.getSchedulerRouter?.() || contextFromWindow?.getSchedulerRouter?.();
  if (schedulerRouter?.getSchedulerType) {
    return schedulerRouter.getSchedulerType(card);
  }
  const raw = String(card.schedulerType || '').trim();
  return raw === 'sm15' || raw === 'a-factor-v2' ? raw : 'fsrs-v6';
}

function resolveActiveReviewQueueType(): string | null {
  const activeQueue = props.queue;
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

const activeReviewQueueType = computed(() => resolveActiveReviewQueueType() || undefined);

function resolveActiveReviewQueueLabel(): string {
  const title = String(props.title || '').trim();
  if (title.length > 0) {
    return title;
  }

  const activeQueue = props.queue;
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

function buildReviewAIChatKey(): string | null {
  return buildReviewAIChatKeyFromQueue({
    queueType: resolveActiveReviewQueueType(),
    queueLabel: resolveActiveReviewQueueLabel(),
  });
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

function buildReviewQueueSessionSnapshot(): ReviewQueueSessionSnapshot | null {
  const activeQueue = props.queue;
  const snapshotCarrier = activeQueue as QueueStrategyWithSessionSnapshot | null | undefined;
  if (!snapshotCarrier || typeof snapshotCarrier.serializeSessionSnapshot !== 'function') {
    return null;
  }

  try {
    return snapshotCarrier.serializeSessionSnapshot();
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to serialize review queue session snapshot:', error);
    return null;
  }
}

function buildReviewTabRuntimeState(): ReviewTabRuntimeState | null {
  if (props.mode !== 'tab') {
    return null;
  }

  const reference = getCurrentReviewCardReference();

  return {
    version: 1,
    showAnswer: hook.context.value.showAnswer === true,
    sharedReviewSessionId: sharedReviewSessionId.value || undefined,
    currentCardId: reference.cardId || undefined,
    currentBlockId: reference.blockId || undefined,
    session: getInitialReviewSessionState(),
    queueSnapshot: buildReviewQueueSessionSnapshot(),
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

function buildReviewTabOpenOptions(overrides?: {
  position?: 'right' | 'bottom';
  sharedReviewSessionId?: string | null;
  reviewState?: ReviewTabRuntimeState | null;
}) {
  const resolvedSharedReviewSessionId = overrides?.sharedReviewSessionId ?? sharedReviewSessionId.value;
  return {
    queue: props.queue,
    adapter: props.adapter,
    title: props.title || t('reviewTitle', 'Review'),
    headerVariant: props.headerVariant,
    position: overrides?.position,
    sharedReviewSessionId: String(resolvedSharedReviewSessionId || '').trim() || null,
    transferState: buildReviewTabTransferState(),
    reviewState: overrides?.reviewState ?? buildReviewTabRuntimeState(),
  };
}

function ensureSharedReviewSessionPromotion(): string | null {
  const normalizedExistingId = String(sharedReviewSessionId.value || '').trim();
  if (normalizedExistingId) {
    const registry = getSharedReviewSessionRegistry();
    const existing = registry?.getSession<unknown>(normalizedExistingId);
    if (registry && !isReviewSessionControllerLike(existing)) {
      registry.registerSession(normalizedExistingId, reviewSessionController);
    }
    return normalizedExistingId;
  }

  const registry = getSharedReviewSessionRegistry();
  if (!registry) {
    return null;
  }

  const nextSharedSessionId = createSharedReviewSessionId();
  const registered = registry.registerSession(nextSharedSessionId, reviewSessionController);
  if (!isReviewSessionControllerLike(registered)) {
    return null;
  }

  sharedReviewSessionId.value = nextSharedSessionId;
  return nextSharedSessionId;
}

function openManagedReviewSplit(position: 'right' | 'bottom'): void {
  const tabManager = getTabManager();
  if (!tabManager?.openReviewTab) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const managedSharedSessionId = ensureSharedReviewSessionPromotion();
  if (!managedSharedSessionId) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  tabManager.openReviewTab(buildReviewTabOpenOptions({
    position,
    sharedReviewSessionId: managedSharedSessionId,
    reviewState: buildReviewTabRuntimeState(),
  }));
}

function resolveStandardReviewDialogTarget(): { queueType: QueueType; headerVariant: ReviewHeaderVariant } | null {
  const activeQueueType = resolveActiveReviewQueueType();
  if (!activeQueueType || !(Object.values(QueueType) as string[]).includes(activeQueueType)) {
    return null;
  }

  const queueType = activeQueueType as QueueType;
  const expectedHeaderVariant = STANDARD_REVIEW_DIALOG_VARIANT_BY_QUEUE_TYPE[queueType];
  if (!expectedHeaderVariant) {
    return null;
  }

  const activeHeaderVariant = props.headerVariant ?? resolveReviewHeaderVariant(queueType);
  if (activeHeaderVariant !== expectedHeaderVariant) {
    return null;
  }

  return {
    queueType,
    headerVariant: expectedHeaderVariant,
  };
}

function resolveCurrentMainQueueSwitchType(): QueueType | null {
  const variantQueueType = props.headerVariant
    ? MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT[props.headerVariant]
    : null;
  if (variantQueueType) {
    return variantQueueType;
  }

  const activeQueueType = activeReviewQueueType.value;
  if ((MAIN_REVIEW_QUEUE_SWITCH_ORDER as string[]).includes(String(activeQueueType || ''))) {
    return activeQueueType as QueueType;
  }

  return null;
}

function resolveMenuAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function resolveMenuOpenPoint(anchor: HTMLElement, event?: MouseEvent | null): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  const hasUsableRect = Number.isFinite(rect.left)
    && Number.isFinite(rect.bottom)
    && (rect.width > 0 || rect.height > 0 || rect.left !== 0 || rect.bottom !== 0);
  if (hasUsableRect) {
    return {
      x: rect.left,
      y: rect.bottom,
    };
  }

  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return { x: 0, y: 0 };
}

function openMenuAtAnchor(menu: Menu, anchor: HTMLElement, event?: MouseEvent | null): void {
  const position = resolveMenuOpenPoint(anchor, event);
  menu.open(position);
}

function switchToStandardReviewQueue(queueType: QueueType): void {
  if (queueType === resolveCurrentMainQueueSwitchType()) {
    return;
  }

  if (props.mode === 'dialog') {
    const dialogManager = getDialogManager();
    if (typeof dialogManager?.switchStandardReviewDialogQueue === 'function') {
      void dialogManager.switchStandardReviewDialogQueue(queueType);
      return;
    }
  }

  if (props.mode === 'tab') {
    const tabManager = getTabManager();
    if (typeof tabManager?.replaceCurrentReviewTabWithStandardQueue === 'function') {
      tabManager.replaceCurrentReviewTabWithStandardQueue(queueType);
      return;
    }
  }

  showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
}

function openQueueSwitchMenuAtAnchor(anchor: HTMLElement, event?: MouseEvent | null): void {
  const currentQueueType = resolveCurrentMainQueueSwitchType();
  const menu = new Menu('review-queue-switch-menu');

  for (const item of buildStandardReviewQueueSwitchPresets()) {
    const isCurrent = item.queueType === currentQueueType;
    menu.addItem({
      id: item.queueType,
      icon: isCurrent ? 'iconCheck' : undefined,
      label: item.title,
      disabled: isCurrent,
      click: () => {
        switchToStandardReviewQueue(item.queueType);
      },
    });
  }

  openMenuAtAnchor(menu, anchor, event);
}

function handleQueueSwitchTriggerPointerDown(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function handleQueueSwitchTrigger(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const anchor = resolveMenuAnchor(event.currentTarget) || resolveMenuAnchor(event.target);
  if (!anchor) {
    logger.warn('[SiYuanMemo][ReviewView] Queue switch trigger is missing a usable anchor');
    return;
  }
  openQueueSwitchMenuAtAnchor(anchor, event);
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

function getCardService(): CardApplicationService | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getCardService?.() || contextFromWindow?.getCardService?.() || null;
}

function getCardEditorService(): CardEditorApplicationService | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getCardEditorService?.() || contextFromWindow?.getCardEditorService?.() || null;
}

function getReviewService(): ReviewApplicationService | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getReviewService?.() || contextFromWindow?.getReviewService?.() || null;
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
  document.addEventListener('contextmenu', handleNativeSplitTabContextMenu, true);
  window.addEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, handleProgressiveExcerptCommandRequest as EventListener);
  window.addEventListener(REVIEW_SET_PRIORITY_REQUEST_EVENT, handleReviewSetPriorityCommandRequest as EventListener);
  window.addEventListener(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, handleReviewSuspendCurrentCardCommandRequest as EventListener);
  window.addEventListener(REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT, handleReviewDeleteCurrentCardCommandRequest as EventListener);
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener added');

  // 🌌 恢复侧边栏状态（已删除）

  // 🆕 初始化导航状态（Phase 3: UI 控件）
  refreshNavigationState();
  syncReviewFilterFromQueue();
  bindReviewDataObserver();
  bindReviewTransactionService();
  reviewResizeHandler = () => {
    viewportWidth.value = window.innerWidth;
    updateReviewDialogContainerLayout();
  };
  window.addEventListener('resize', reviewResizeHandler);
  scheduleReviewDialogTitlebarQueueSwitchSync();
  initialFullscreenTimer = window.setTimeout(() => {
    initialFullscreenTimer = null;
    applyInitialReviewFullscreen();
  }, 0);
  if (props.mode === 'tab' && effectiveInitialCurrentCardId) {
    initialTabSurfaceRefreshTimer = window.setTimeout(() => {
      initialTabSurfaceRefreshTimer = null;
      void refreshTabSurface(effectiveInitialCurrentCardId);
    }, 0);
  }
});

// 🆕 组件卸载时移除键盘事件监听器
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  document.removeEventListener('contextmenu', handleNativeSplitTabContextMenu, true);
  window.removeEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, handleProgressiveExcerptCommandRequest as EventListener);
  window.removeEventListener(REVIEW_SET_PRIORITY_REQUEST_EVENT, handleReviewSetPriorityCommandRequest as EventListener);
  window.removeEventListener(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, handleReviewSuspendCurrentCardCommandRequest as EventListener);
  window.removeEventListener(REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT, handleReviewDeleteCurrentCardCommandRequest as EventListener);
  if (reviewDialogTitlebarSyncTimer !== null) {
    window.clearTimeout(reviewDialogTitlebarSyncTimer);
    reviewDialogTitlebarSyncTimer = null;
  }
  disconnectReviewDialogTitlebarObserver();
  restoreReviewDialogTitlebarText();
  recentModifiedHotkeys.clear();
  escRepeatLatch = false;
  clearNativeSplitMenuPruneTimer();
  unbindReviewDataObserver();
  unbindReviewTransactionService();
  if (reviewResizeHandler) {
    window.removeEventListener('resize', reviewResizeHandler);
    reviewResizeHandler = null;
  }
  if (initialFullscreenTimer !== null) {
    window.clearTimeout(initialFullscreenTimer);
    initialFullscreenTimer = null;
  }
  if (initialTabSurfaceRefreshTimer !== null) {
    window.clearTimeout(initialTabSurfaceRefreshTimer);
    initialTabSurfaceRefreshTimer = null;
  }
  destroySrsArenaConflictDialog();
  if (props.mode !== 'tab') {
    getReviewAIWorkbenchRegistry()?.disposeReviewSession?.(reviewSessionId.value);
  }
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener removed');
});

type ActiveReviewItem = FSRSCard;

function isReviewSessionControllerLike(value: unknown): value is ReviewSessionController<ActiveReviewItem> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.attachSurface === 'function'
    && typeof value.detachSurface === 'function'
    && typeof value.reveal === 'function'
    && typeof value.grade === 'function'
    && typeof value.skip === 'function'
    && typeof value.back === 'function'
    && typeof value.executeCommand === 'function'
    && typeof value.reload === 'function'
    && typeof value.refreshCurrentItem === 'function'
    && typeof value.getQueueStrategy === 'function'
    && typeof value.loadCardByBlockId === 'function'
    && typeof value.isDisposed === 'function'
  );
}

const effectiveInitialSessionState = props.initialSessionState ?? props.reviewState?.session;
const effectiveInitialCurrentItem = props.initialCurrentItem ?? props.reviewState?.queueSnapshot?.currentItem ?? null;
const effectiveInitialCurrentCardId = String(props.initialCurrentCardId || props.reviewState?.currentCardId || '').trim();
const effectiveInitialShowAnswer = props.initialShowAnswer === true
  ? true
  : props.reviewState?.showAnswer === true;

function resolveArenaTargetKindFromCard(card: FSRSCard | null | undefined): 'topic' | 'item' | 'concept' | 'descriptor' | 'note' {
  const type = String(card?.type || '').trim();
  if (type === 'topic' || type === 'item' || type === 'concept' || type === 'descriptor') {
    return type;
  }
  return 'note';
}

function resolveReviewArenaScenario(view: ReviewAIRequestedView, card: FSRSCard | null | undefined): 'topic-auto-card' | 'candidate-card-generation' | 'card-prompt-rewrite' | 'descriptor-augmentation' | 'concept-expression-coach' | 'note-refinement' {
  const type = String(card?.type || '').trim();
  if (type === 'topic') return 'topic-auto-card';
  if (type === 'descriptor') return 'descriptor-augmentation';
  if (type === 'concept') return 'concept-expression-coach';
  if (type === 'item') return 'card-prompt-rewrite';
  return view === 'general-chat' ? 'note-refinement' : 'candidate-card-generation';
}

function destroySrsArenaConflictDialog(): void {
  if (!srsArenaConflictDialog) {
    return;
  }
  srsArenaConflictDialog.destroy();
  srsArenaConflictDialog = null;
}

function openSrsArenaConflictDialog(card: FSRSCard, recommendation: SrsArenaRecommendation): void {
  const context = getPluginContext(props.plugin);
  const reviewService = context?.getReviewService?.();
  if (!reviewService?.rescheduleCard) {
    logger.warn('[SiYuanMemo][ReviewView] Cannot open SRS arena conflict dialog without review service');
    return;
  }

  destroySrsArenaConflictDialog();
  srsArenaConflictDialog = createVueDialog({
    title: t('srsArenaConflictTitle', 'Arena 排期冲突'),
    component: SrsArenaConflictDialog,
    props: {
      recommendation,
      i18n: props.i18n || {},
    },
    events: {
      keep: () => {
        destroySrsArenaConflictDialog();
      },
      close: () => {
        destroySrsArenaConflictDialog();
      },
      adopt: async (payload: unknown) => {
        const adoptPayload = isRecord(payload) ? payload as SrsArenaConflictAdoptPayload : {};
        const dueTimestamp = Number(adoptPayload.dueTimestamp);
        const scheduledDays = Number(adoptPayload.scheduledDays);
        if (!Number.isFinite(dueTimestamp) || dueTimestamp <= 0 || !Number.isFinite(scheduledDays) || scheduledDays < 0) {
          logger.warn('[SiYuanMemo][ReviewView] Ignore invalid SRS arena adopt payload', adoptPayload);
          return;
        }
        try {
          await reviewService.rescheduleCard(card.id, {
            mode: 'direct',
            dueTimestamp,
            scheduledDays,
          });
          notifyReviewMessage(t('srsArenaAdopted', '已采用 Arena 排期'), 2000, 'info');
          destroySrsArenaConflictDialog();
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to adopt SRS arena schedule:', error);
          notifyReviewMessage(t('srsArenaAdoptFailed', '采用 Arena 排期失败'), 3000, 'error');
        }
      },
    },
    width: 'min(720px, 92vw)',
    height: 'min(680px, 78vh)',
    onClose: () => {
      srsArenaConflictDialog = null;
    },
    visualVariant: 'form',
    containerClass: 'siyuanmemo-srs-arena-conflict-dialog',
  });
}

async function refreshReviewArenaHint(card: FSRSCard | null | undefined, rating: number): Promise<SrsArenaRecommendation | null> {
  const currentCard = (card || state.value.content.card || null) as FSRSCard | null;
  const arenaKernel = getArenaKernelService();
  if (!arenaKernel?.buildSrsRecommendation || !currentCard || rating < 1 || rating > 4) {
    reviewArenaHint.value = null;
    return null;
  }
  try {
    const recommendation = await arenaKernel.buildSrsRecommendation(
      currentCard,
      getSchedulerTypeForCard(currentCard),
      Date.now(),
      {
        ratingBasis: rating,
        schedulingContext: resolveCurrentReviewSchedulingContext(currentCard),
      },
    );
    reviewArenaHint.value = recommendation?.shouldHighlight ? (recommendation.summary || null) : null;
    return recommendation;
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to refresh SRS arena hint:', error);
    reviewArenaHint.value = null;
    return null;
  }
}

async function handleReviewArenaFeedback(payload: { cardId: string; rating: number; item: ActiveReviewItem | null }): Promise<void> {
  const reviewedCard = (payload.item || state.value.content.card || null) as FSRSCard | null;
  const recommendation = await refreshReviewArenaHint(reviewedCard, payload.rating);
  if (reviewedCard && recommendation?.shouldHighlight === true) {
    openSrsArenaConflictDialog(reviewedCard, recommendation);
  }
}

function createReviewSessionControllerInstance(): ReviewSessionController<ActiveReviewItem> {
  return createReviewSessionController(
    props.queue as never,
    props.adapter as never,
    {
      onReview: props.onReview,
      onReviewDetailed: handleReviewArenaFeedback as never,
      onActionError: handleReviewSessionActionError as never,
      initialSessionState: effectiveInitialSessionState,
      initialCurrentItem: effectiveInitialCurrentItem as never,
      initialShowAnswer: effectiveInitialShowAnswer,
      prepareStateBeforeCommit: prepareReviewStateBeforeCommit,
    },
  ) as ReviewSessionController<ActiveReviewItem>;
}

function resolveReviewSessionController(): ReviewSessionController<ActiveReviewItem> {
  const registry = getSharedReviewSessionRegistry();
  const normalizedSharedId = sharedReviewSessionId.value;
  if (registry && normalizedSharedId) {
    const existing = registry.getSession<unknown>(normalizedSharedId);
    if (isReviewSessionControllerLike(existing)) {
      return existing;
    }

    if (existing) {
      registry.disposeSession(normalizedSharedId);
    }

    return registry.registerSession(normalizedSharedId, createReviewSessionControllerInstance());
  }

  return createReviewSessionControllerInstance();
}

const reviewSessionController = resolveReviewSessionController();

const hook = useReviewSession(
  props.queue as never,
  props.adapter as never,
  {
    onReview: props.onReview, // 🆕 传递 onReview 回调
    onReviewDetailed: handleReviewArenaFeedback as never,
    onActionError: handleReviewSessionActionError as never,
    initialSessionState: effectiveInitialSessionState,
    initialCurrentItem: effectiveInitialCurrentItem as never,
    initialShowAnswer: effectiveInitialShowAnswer,
    prepareStateBeforeCommit: prepareReviewStateBeforeCommit,
    controller: reviewSessionController as never,
    surfaceId: reviewSessionId.value,
  }
);
const state = hook.state;
const app = props.app;
const showReviewFilterDialog = ref(false);
const appliedReviewFilter = ref<CardFilter | null>(null);
const neuralNavigationState = ref<NeuralNavigationState | null>(null);

watch(
  () => String((state.value.content.card as FSRSCard | null)?.id || ''),
  () => {
    clearPendingReviewSourceRefresh();
    reviewArenaHint.value = null;
  },
  { immediate: true },
);

const usesNativeDialogTitlebarQueueSwitch = computed(() => (
  props.mode === 'dialog'
  && props.nativeDialogTitlebar === true
  && props.isMobile !== true
));
const resolvedReviewSurfaceTitle = computed(() => (
  String(
    props.title
    || state.value.header.title
    || state.value.header.stats.queueName
    || t('reviewTitle', 'Review'),
  ).trim() || t('reviewTitle', 'Review')
));
let subscribedReviewManager: IUnifiedDataSourceManagerFacade | null = null;
let subscribedReviewTransactionService: ReviewTransactionWebSocketServiceLike | null = null;
let reviewDialogTitlebarSyncTimer: number | null = null;
let reviewDialogTitlebarObserver: MutationObserver | null = null;
let observedReviewDialogHeader: HTMLElement | null = null;

const REVIEW_AI_SIDECAR_MIN_VIEWPORT = 1040;

const canUseEmbeddedReviewAISidecar = computed(() => (
  props.mode === 'dialog' && props.isMobile !== true && viewportWidth.value >= REVIEW_AI_SIDECAR_MIN_VIEWPORT
));

const showReviewAISidecar = computed(() => (
  canUseEmbeddedReviewAISidecar.value && reviewAISidebarOpen.value && reviewAIService.value !== null
));

const isEmptyReviewContent = computed(() => state.value.content.type === 'empty');

const showCompletedEmptyStateExit = computed(() => (
  isEmptyReviewContent.value
  && state.value.meta.emptyStateMode === 'completed'
));

function getReviewActionErrorMessage(payload: ReviewSessionActionError<ActiveReviewItem>): string {
  const base = payload.reason === 'skip'
    ? t('reviewSkipFailedKeepCard', '跳过失败，当前卡片已保留')
    : payload.reason === 'custom'
      ? t('reviewCommandFailedKeepCard', '操作失败，当前卡片已保留')
      : t('reviewFeedbackFailedKeepCard', '评分失败，当前卡片已保留');
  const detail = payload.error instanceof Error
    ? payload.error.message
    : String(payload.error || '').trim();
  return detail ? `${base}: ${detail}` : base;
}

function handleReviewSessionActionError(payload: ReviewSessionActionError<ActiveReviewItem>): void {
  showMessage(getReviewActionErrorMessage(payload), 5000, 'error');
}

async function prepareReviewStateBeforeCommit(
  nextState: ReviewUIState,
  reason: ReviewSessionUpdateReason,
): Promise<ReviewUIState> {
  try {
    return await prepareReviewPresentation(nextState, reviewRenderServices);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to prepare review presentation before commit:', {
      reason,
      cardId: nextState.content.card?.id,
      blockId: nextState.content.id,
      error,
    });
    return nextState;
  }
}

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function notifyReviewMessage(message: string, timeout = 3000, type: 'info' | 'error' | 'warning' = 'info'): void {
  if (typeof showMessage === 'function') {
    showMessage(message, timeout, type);
  }
}

type StandardReviewQueueSwitchPreset = {
  queueType: QueueType;
  headerVariant: ReviewHeaderVariant;
  title: string;
};

function buildStandardReviewQueueSwitchPresets(): StandardReviewQueueSwitchPreset[] {
  return [
    {
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
      title: t('retrievalPractice', '提取练习'),
    },
    {
      queueType: QueueType.IncrementalLearning,
      headerVariant: 'incremental-learning',
      title: t('incrementalLearning', '渐进学习'),
    },
    {
      queueType: QueueType.FinalDrill,
      headerVariant: 'final-drill',
      title: t('finalDrill', '刻意练习'),
    },
    {
      queueType: QueueType.FilterGroup,
      headerVariant: 'filter-group',
      title: t('filterGroupPractice', '分组队列'),
    },
    {
      queueType: QueueType.NeuralRoam,
      headerVariant: 'neural-roam',
      title: t('neuralReviewTitle', t('neuralRoam', '神经漫游')),
    },
  ];
}

function openNumberDialog(options: {
  title: string;
  label: string;
  description?: string;
  unit?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}): Promise<number | null> {
  return new Promise((resolve) => {
    const dialog = createVueDialog({
      title: options.title,
      component: ActionParamsDialog,
      props: {
        label: options.label,
        description: options.description,
        unit: options.unit,
        defaultValue: options.defaultValue,
        min: options.min,
        max: options.max,
        step: options.step,
        integer: options.integer,
        confirmText: t('confirm', '确认'),
        cancelText: t('cancel', '取消'),
      },
      events: {
        confirm: (value: number) => {
          dialog.destroy();
          resolve(value);
        },
        cancel: () => {
          dialog.destroy();
          resolve(null);
        },
      },
      width: '520px',
      height: '220px',
      visualVariant: 'form',
      containerClass: 'siyuanmemo-action-params-dialog',
    });
  });
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

function buildExpectedRefreshOptions(reference: { cardId?: string; blockId?: string } | null | undefined): RefreshCurrentItemOptions {
  return {
    expectedCurrentCardId: String(reference?.cardId || '').trim(),
    expectedCurrentBlockId: String(reference?.blockId || '').trim(),
  };
}

function hasCurrentReviewCard(): boolean {
  const reference = getCurrentReviewCardReference();
  return reference.cardId.length > 0 && reference.blockId.length > 0;
}

function resolveCurrentReviewCardActionReference(): { cardId: string; blockId: string } | null {
  const reference = getCurrentReviewCardReference();
  if (reference.cardId.length === 0 || reference.blockId.length === 0) {
    showMessage(t('reviewNoCurrentCardAction', '当前没有可操作的卡片'), 3000, 'info');
    return null;
  }
  return reference;
}

function resolveCurrentReviewCardPriority(): number | null {
  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  if (!currentCard) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.floor(Number(currentCard.priority) || 0)));
}

function resolveCurrentReviewCardDismissed(): boolean {
  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  return currentCard ? isCardDismissed(currentCard) : false;
}

function getActiveRemovableReviewQueue(): { removeCard?: (cardIdOrBlockId: string) => Promise<void> } | null {
  const activeQueue = props.queue;
  if (!isRecord(activeQueue)) {
    return null;
  }

  const underlyingQueue = getUnderlyingQueueFromStrategy(activeQueue);
  if (underlyingQueue && typeof underlyingQueue.removeCard === 'function') {
    return underlyingQueue as { removeCard?: (cardIdOrBlockId: string) => Promise<void> };
  }

  return activeQueue as { removeCard?: (cardIdOrBlockId: string) => Promise<void> };
}

async function removeCardIdsFromActiveQueue(cardIds: string[]): Promise<void> {
  const removableQueue = getActiveRemovableReviewQueue();
  if (!removableQueue || typeof removableQueue.removeCard !== 'function') {
    return;
  }

  for (const cardId of Array.from(new Set(
    cardIds
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  ))) {
    try {
      await removableQueue.removeCard(cardId);
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewView] Failed to remove card from active review queue:', {
        cardId,
        error,
      });
    }
  }
}

function resolveCurrentBlockPeerCards(): ReviewCardPeerInfo | null {
  const currentCardId = resolveCurrentReviewCardId();
  const currentBlockId = resolveCurrentReviewBlockId();
  if (!currentCardId || !currentBlockId) {
    return null;
  }

  const cardService = getCardService();
  if (!cardService) {
    return null;
  }

  const peerCards = cardService
    .getCardsByBlockId(currentBlockId)
    .filter((card) => String(card?.id || '').trim().length > 0 && card.id !== currentCardId);

  return {
    currentCardId,
    currentBlockId,
    peerCards,
  };
}

function resolveCurrentAndPeerCardIds(peerInfo: ReviewCardPeerInfo): string[] {
  return Array.from(new Set([
    peerInfo.currentCardId,
    ...peerInfo.peerCards.map((card) => String(card?.id || '').trim()),
  ].filter((cardId) => cardId.length > 0)));
}

function filterOutCurrentCardId(cardIds: string[], currentCardId: string): string[] {
  return cardIds.filter((cardId) => cardId !== currentCardId);
}

async function advanceCurrentReviewCardByReference(payload: { cardId?: string; blockId?: string }): Promise<void> {
  const requestedCardId = String(payload.cardId || '').trim();
  const requestedBlockId = String(payload.blockId || '').trim();
  const currentReference = getCurrentReviewCardReference();
  const matchesCurrentCard =
    (requestedCardId && requestedCardId === currentReference.cardId)
    || (requestedBlockId && requestedBlockId === currentReference.blockId);

  if (!matchesCurrentCard) {
    logger.debug('[SiYuanMemo][ReviewView] Ignore advance request for non-current card:', {
      payload,
      currentReference,
    });
    return;
  }

  await removeCardIdsFromActiveQueue([requestedCardId || requestedBlockId]);
  await hook.skip();
}

async function advanceScheduledCurrentCard(payload: ScheduledReviewCardPayload): Promise<void> {
  const scheduledCardId = String(payload.cardId || '').trim();
  const scheduledBlockId = String(payload.blockId || '').trim();
  await advanceCurrentReviewCardByReference({
    cardId: scheduledCardId,
    blockId: scheduledBlockId,
  });
}

async function advanceDismissedCurrentCard(payload: DismissedReviewCardPayload): Promise<void> {
  if (payload.dismissed !== true) {
    return;
  }

  const dismissedCardId = String(payload.cardId || '').trim();
  const dismissedBlockId = String(payload.blockId || '').trim();
  await advanceCurrentReviewCardByReference({
    cardId: dismissedCardId,
    blockId: dismissedBlockId,
  });
}

async function refreshCurrentReviewCard(): Promise<void> {
  const manager = subscribedReviewManager;
  const currentReference = getCurrentReviewCardReference();
  const { cardId } = currentReference;
  if (!manager || !cardId) {
    return;
  }

  try {
    const requestedCardId = cardId;
    const nextCard = await manager.getCard(cardId);
    if (getCurrentReviewCardReference().cardId !== requestedCardId) {
      return;
    }
    await hook.refreshCurrentItem(nextCard, buildExpectedRefreshOptions(currentReference));
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to refresh current review card from unified manager:', {
      cardId,
      error,
    });
  }
}

async function refreshReviewCardById(cardId: string): Promise<boolean> {
  const normalizedCardId = String(cardId || '').trim();
  if (!normalizedCardId) {
    return false;
  }

  const manager = subscribedReviewManager || getUnifiedDataSourceManager();
  if (!manager) {
    return false;
  }

  try {
    const nextCard = await manager.getCard(normalizedCardId, { silent: true });
    if (String(nextCard?.id || '').trim() !== normalizedCardId) {
      return false;
    }
    await hook.refreshCurrentItem(nextCard);
    return true;
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to refresh review card by explicit card id:', {
      cardId: normalizedCardId,
      error,
    });
    return false;
  }
}

async function refreshTabSurface(preferredCardId?: string | null): Promise<boolean> {
  const preferred = String(preferredCardId || '').trim();
  const currentReference = getCurrentReviewCardReference();
  const targetCardId = preferred || currentReference.cardId;
  let refreshedCardState = false;

  if (targetCardId) {
    const shouldForceCardRefresh = (
      currentReference.cardId !== targetCardId
      || state.value.content.type === 'empty'
      || !state.value.content.card
    );
    if (shouldForceCardRefresh) {
      await refreshReviewCardById(targetCardId);
      refreshedCardState = true;
    }
  }

  if (!refreshedCardState) {
    const refreshedVisibleContent = await contentRef.value?.refreshVisibleContent?.('tab-surface');
    if (!refreshedVisibleContent) {
      renderEpoch.value += 1;
    }
  }

  await nextTick();

  return Boolean(
    resolveCurrentReviewCardId()
    || resolveCurrentReviewBlockId()
    || state.value.content.id,
  );
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
    await hook.refreshCurrentItem(currentCard, buildExpectedRefreshOptions({
      cardId: currentCard.id,
      blockId: currentCard.blockId,
    }));
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

function clearReviewSourceRefreshTimer(): void {
  if (reviewSourceRefreshTimer !== null) {
    window.clearTimeout(reviewSourceRefreshTimer);
    reviewSourceRefreshTimer = null;
  }
}

function clearPendingReviewSourceRefresh(): void {
  clearReviewSourceRefreshTimer();
  pendingReviewSourceBlockIds.clear();
}

function isReviewAdvancePending(): boolean {
  return state.value.meta.advancePending?.active === true;
}

function pruneReviewSourceRefreshSuppression(now: number = Date.now()): void {
  for (const [blockId, expiresAt] of reviewSourceRefreshSuppressedBlockIds.entries()) {
    if (expiresAt <= now) {
      reviewSourceRefreshSuppressedBlockIds.delete(blockId);
    }
  }
}

function suppressReviewSourceRefreshForBlock(blockId: string): void {
  const normalizedBlockId = String(blockId || '').trim();
  if (!normalizedBlockId) {
    return;
  }

  reviewSourceRefreshSuppressedBlockIds.set(
    normalizedBlockId,
    Date.now() + REVIEW_SOURCE_REFRESH_SUPPRESSION_MS,
  );
}

function collectChangedBlockIdsFromTransactions(transactions: ReviewWorkspaceTransaction[]): string[] {
  const changedBlockIds = new Set<string>();

  for (const transaction of transactions) {
    for (const operation of transaction.doOperations || []) {
      for (const candidate of [operation.id, operation.parentID, operation.previousID, operation.nextID]) {
        const normalized = String(candidate || '').trim();
        if (normalized.length > 0) {
          changedBlockIds.add(normalized);
        }
      }
    }
  }

  return Array.from(changedBlockIds);
}

function getCurrentReviewDependencyBlockIds(): string[] {
  const dependencyBlockIds = contentRef.value?.getDependencyBlockIds?.() || [];
  if (dependencyBlockIds.length > 0) {
    return dependencyBlockIds;
  }

  const currentCard = state.value.content.card;
  return [
    state.value.content.id,
    state.value.content.answerBlockID,
    currentCard?.blockId,
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);
}

function isCurrentMainProtyleEditing(): boolean {
  const state = editorState.value;
  return state.renderer === 'main-protyle'
    && state.supportsNativeEdit === true
    && state.isEditing === true;
}

async function refreshCurrentReviewCardForSourceChange(matchedBlockIds: string[]): Promise<void> {
  if (!isReviewSourceBlockRefreshEnabled() || isReviewAdvancePending()) {
    clearPendingReviewSourceRefresh();
    return;
  }

  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  const currentReference = getCurrentReviewCardReference();
  if (!currentCard || (!currentReference.cardId && !currentReference.blockId)) {
    return;
  }

  logger.debug('[SiYuanMemo][ReviewView] Refreshing current review card for source block changes:', {
    matchedBlockIds,
    currentCardId: currentReference.cardId,
    currentBlockId: currentReference.blockId,
  });

  if (isCurrentMainProtyleEditing()) {
    logger.debug('[SiYuanMemo][ReviewView] Skip source refresh while native Protyle editing is active:', {
      matchedBlockIds,
      currentCardId: currentReference.cardId,
      currentBlockId: currentReference.blockId,
    });
    return;
  }

  await contentRef.value?.refreshVisibleContent?.('source-transaction');
}

async function flushPendingReviewSourceRefresh(): Promise<void> {
  if (!isReviewSourceBlockRefreshEnabled() || isReviewAdvancePending()) {
    clearPendingReviewSourceRefresh();
    return;
  }

  const pendingBlockIds = Array.from(pendingReviewSourceBlockIds);
  pendingReviewSourceBlockIds.clear();
  if (pendingBlockIds.length === 0) {
    return;
  }

  const now = Date.now();
  pruneReviewSourceRefreshSuppression(now);
  const effectiveBlockIds = pendingBlockIds.filter((blockId) => {
    const expiresAt = reviewSourceRefreshSuppressedBlockIds.get(blockId);
    return !expiresAt || expiresAt <= now;
  });
  if (effectiveBlockIds.length === 0) {
    return;
  }

  const dependencyBlockIds = new Set(getCurrentReviewDependencyBlockIds());
  if (dependencyBlockIds.size === 0) {
    return;
  }

  const matchedBlockIds = effectiveBlockIds.filter((blockId) => dependencyBlockIds.has(blockId));
  if (matchedBlockIds.length === 0) {
    return;
  }

  await refreshCurrentReviewCardForSourceChange(matchedBlockIds);
}

function queueReviewSourceRefresh(blockIds: string[]): void {
  if (!isReviewSourceBlockRefreshEnabled() || isReviewAdvancePending()) {
    clearPendingReviewSourceRefresh();
    return;
  }

  for (const blockId of blockIds) {
    const normalized = String(blockId || '').trim();
    if (normalized.length > 0) {
      pendingReviewSourceBlockIds.add(normalized);
    }
  }

  if (pendingReviewSourceBlockIds.size === 0) {
    return;
  }

  clearReviewSourceRefreshTimer();
  reviewSourceRefreshTimer = window.setTimeout(() => {
    reviewSourceRefreshTimer = null;
    void flushPendingReviewSourceRefresh();
  }, REVIEW_SOURCE_REFRESH_DEBOUNCE_MS);
}

const reviewSourceTransactionHandler: ReviewTransactionHandler = {
  handle(transactions: ReviewWorkspaceTransaction[]): void {
    if (!isReviewSourceBlockRefreshEnabled() || isReviewAdvancePending()) {
      clearPendingReviewSourceRefresh();
      return;
    }

    const changedBlockIds = collectChangedBlockIdsFromTransactions(transactions);
    if (changedBlockIds.length === 0) {
      return;
    }

    queueReviewSourceRefresh(changedBlockIds);
  },
};

const reviewDataObserver: IDataSourceObserver = {
  onDataChanged(event: DataChangeEvent) {
    if (event.type === 'card-created') {
      void appendCreatedCardsToActiveScopeQueue(event.cardIds || []);
      return;
    }

    if (event.type === 'card-deleted') {
      const deletedCardIds = Array.from(new Set(
        (event.cardIds || [])
          .map((id) => String(id || '').trim())
          .filter((id) => id.length > 0)
      ));
      if (deletedCardIds.length === 0) {
        return;
      }

      const { cardId, blockId } = getCurrentReviewCardReference();
      if (cardId && deletedCardIds.includes(cardId)) {
        void advanceCurrentReviewCardByReference({ cardId, blockId });
        return;
      }

      void removeCardIdsFromActiveQueue(deletedCardIds);
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

    if (isReviewAdvancePending()) {
      logger.debug('[SiYuanMemo][ReviewView] Skip current card refresh while review advance is pending:', {
        cardId,
        blockId,
        eventCardIds: event.cardIds || [],
      });
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

function bindReviewTransactionService(): void {
  if (!isReviewSourceBlockRefreshEnabled()) {
    unbindReviewTransactionService();
    return;
  }

  const transactionService = getReviewTransactionWebSocketService();
  if (transactionService === subscribedReviewTransactionService) {
    return;
  }

  subscribedReviewTransactionService?.unregisterHandler?.(reviewSourceTransactionHandler);

  subscribedReviewTransactionService = transactionService;
  subscribedReviewTransactionService?.registerHandler?.(reviewSourceTransactionHandler);
}

function unbindReviewDataObserver(): void {
  if (!subscribedReviewManager) {
    return;
  }

  subscribedReviewManager.unregisterObserver(reviewDataObserver);
  subscribedReviewManager = null;
}

function unbindReviewTransactionService(): void {
  clearReviewSourceRefreshTimer();
  pendingReviewSourceBlockIds.clear();
  reviewSourceRefreshSuppressedBlockIds.clear();

  if (!subscribedReviewTransactionService) {
    return;
  }

  subscribedReviewTransactionService.unregisterHandler?.(reviewSourceTransactionHandler);
  subscribedReviewTransactionService = null;
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

function resolveCurrentNativeSplitGuardState(): ReviewNativeSplitGuardState | null {
  return contentRef.value?.getNativeSplitGuardState?.() || null;
}

function getActiveTabHeaderId(): string {
  const activeTabHeader = document.querySelector('[data-type="tab-header"].item--focus');
  if (!(activeTabHeader instanceof HTMLElement)) {
    return '';
  }
  return String(activeTabHeader.getAttribute('data-id') || '').trim();
}

function isCurrentReviewTabActive(): boolean {
  if (props.mode !== 'tab') {
    return false;
  }
  const normalizedReviewSessionId = String(reviewSessionId.value || '').trim();
  return normalizedReviewSessionId.length > 0 && getActiveTabHeaderId() === normalizedReviewSessionId;
}

function shouldBlockCurrentNativeTabSplit(): boolean {
  return isCurrentReviewTabActive() && resolveCurrentNativeSplitGuardState()?.blockNativeTabSplit === true;
}

function showNativeSplitBlockedNotice(): void {
  const now = Date.now();
  if (now - nativeSplitBlockedNoticeAt < NATIVE_SPLIT_BLOCKED_NOTICE_COOLDOWN_MS) {
    return;
  }
  nativeSplitBlockedNoticeAt = now;
  showMessage(
    t(
      'nativeSplitBlockedForSpecialReview',
      '当前特殊渲染卡已禁用思源原生分屏，请使用“右侧/下方分屏当前复习”',
    ),
    2500,
    'info',
  );
}

function clearNativeSplitMenuPruneTimer(): void {
  if (nativeSplitMenuPruneTimer !== null) {
    window.clearTimeout(nativeSplitMenuPruneTimer);
    nativeSplitMenuPruneTimer = null;
  }
}

function scheduleNativeSplitMenuPrune(): void {
  clearNativeSplitMenuPruneTimer();
  nativeSplitMenuPruneTimer = window.setTimeout(() => {
    nativeSplitMenuPruneTimer = null;
    if (!shouldBlockCurrentNativeTabSplit()) {
      return;
    }
    const commonMenu = document.getElementById('commonMenu');
    if (!(commonMenu instanceof HTMLElement) || commonMenu.getAttribute('data-name') !== 'tab') {
      return;
    }
    const removed = pruneNativeTabSplitMenu(commonMenu);
    if (removed) {
      logger.debug('[SiYuanMemo][ReviewView] Removed native split menu for special renderer review tab', {
        reviewSessionId: reviewSessionId.value,
        rendererKind: resolveCurrentNativeSplitGuardState()?.rendererKind,
      });
    }
  }, 0);
}

function handleNativeSplitTabContextMenu(event: MouseEvent): void {
  if (!shouldBlockCurrentNativeTabSplit()) {
    return;
  }

  const targetElement = getEventElement(event.target);
  const tabHeader = targetElement?.closest('[data-type="tab-header"]');
  if (!(tabHeader instanceof HTMLElement)) {
    return;
  }

  if (String(tabHeader.getAttribute('data-id') || '').trim() !== String(reviewSessionId.value || '').trim()) {
    return;
  }

  scheduleNativeSplitMenuPrune();
}

function isInsideReviewRoot(target: EventTarget | null): boolean {
  const root = rootRef.value;
  const element = getEventElement(target);
  return !!root && !!element && root.contains(element);
}

function isVisibleReviewRoot(root: HTMLElement | null): root is HTMLElement {
  if (!root || !root.isConnected) {
    return false;
  }
  if (root.hidden) {
    return false;
  }
  const style = window.getComputedStyle(root);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getVisibleReviewRoots(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.fsrs-review-v2'))
    .filter((element): element is HTMLDivElement => element instanceof HTMLDivElement)
    .filter((element) => isVisibleReviewRoot(element));
}

function isActiveReviewSurface(): boolean {
  const root = rootRef.value;
  if (!isVisibleReviewRoot(root)) {
    return false;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && root.contains(activeElement)) {
    return true;
  }

  const visibleRoots = getVisibleReviewRoots();
  return visibleRoots.length === 1
    && visibleRoots[0] === root
    && (activeElement === document.body || activeElement === document.documentElement || activeElement === null);
}

function maybeHandleBlockedNativeTabSplitHotkey(event: KeyboardEvent): boolean {
  const command = matchReviewNativeTabSplitCommand(event);
  if (!command || !shouldBlockCurrentNativeTabSplit()) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  logger.debug('[SiYuanMemo][ReviewView] Blocked native split hotkey for special renderer review tab', {
    command,
    reviewSessionId: reviewSessionId.value,
    rendererKind: resolveCurrentNativeSplitGuardState()?.rendererKind,
  });
  showNativeSplitBlockedNotice();
  return true;
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

function handleReviewCommandRequest(
  event: Event,
  action: () => void | Promise<void>,
): void {
  if (event.defaultPrevented || !isActiveReviewSurface()) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation?.();
  void action();
}

function handleReviewSetPriorityCommandRequest(event: Event): void {
  handleReviewCommandRequest(event, handleEditCurrentCardPriority);
}

function handleReviewSuspendCurrentCardCommandRequest(event: Event): void {
  handleReviewCommandRequest(event, handleDismissCurrentCard);
}

function handleReviewDeleteCurrentCardCommandRequest(event: Event): void {
  handleReviewCommandRequest(event, handleDeleteCurrentCard);
}

function maybeHandleReviewEscape(event: KeyboardEvent): boolean {
  if (!isReviewKeyboardContext(event.target)) {
    return false;
  }

  const decision = resolveReviewDialogEscapeKeydown({
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
  if (state.value.meta.advancePending?.active === true) {
    return;
  }

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
    topicLikeAction: activeReviewQueueType.value === QueueType.FilterGroup
      && isTopicLikeCard(state.value.actions.cardMeta)
      ? 'hide-current-in-scope'
      : 'grade-good',
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

  if (action.type === 'command') {
    logger.debug('[SiYuanMemo][ReviewView] Executing custom command for review card', {
      commandId: action.commandId,
      blockId: state.value.actions.cardMeta?.blockID,
      cardId: state.value.actions.cardMeta?.cardID,
      cardType: state.value.actions.cardMeta?.cardType || state.value.actions.cardMeta?.type,
    });
    void hook.executeCommand(action.commandId);
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
  if (maybeHandleBlockedNativeTabSplitHotkey(e)) {
    return;
  }
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

function buildReviewAIOptions(view: ReviewAIRequestedView, surface?: AIWorkbenchSurface): AIWorkbenchOpenOptions {
  const neuralQueue = getNeuralRoamQueue();
  const currentCard = state.value.content.card as FSRSCard | null;
  return buildReviewAIOpenOptions({
    view,
    surface,
    sessionId: reviewSessionId.value,
    reviewChatKey: buildReviewAIChatKey(),
    currentCard,
    currentBlockId: resolveCurrentReviewBlockId() || null,
    queueType: resolveActiveReviewQueueType(),
    queueProgress: buildReviewQueueProgress(),
    revealed: hook.context.value.showAnswer === true,
    neuralBatch: neuralQueue?.getCurrentBatchSnapshot() ?? null,
    arenaScenarioId: resolveReviewArenaScenario(view, currentCard),
    arenaTargetKind: resolveArenaTargetKindFromCard(currentCard),
  });
}

function resolveDefaultReviewAIEntryView() {
  const context = getPluginContext(props.plugin) || getWindowPlugin()?.getContext?.();
  const configured = context?.getSettingsService?.().getSettings?.()?.ai?.chatDefaults?.reviewDefaultSkillId;
  return resolveDefaultReviewAIEntryViewFromSettings(configured);
}

function resolveReviewAIEntryView(requestedView?: ReviewAIRequestedView): ReviewAIRequestedView {
  const registry = getReviewAIWorkbenchRegistry();
  return resolveReviewAIEntryViewFromState({
    requestedView,
    activeServiceView: reviewAIService.value?.state.activeView,
    activeRegistryView: registry?.getReviewSession?.(reviewSessionId.value)?.state.activeView,
    defaultView: resolveDefaultReviewAIEntryView(),
  });
}

function getReviewAICompanionTitle(view: ReviewAIRequestedView): string {
  return buildReviewAICompanionTitle({
    view,
    reviewTitle: String(props.title || t('reviewTitle', 'Review')).trim(),
    labels: {
      generalChat: t('generalChat', '通用 AI 聊天'),
      conceptCoach: t('aiConceptCoachCard', 'AI 理解与制卡'),
      review: t('reviewTitle', 'Review'),
    },
  });
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

function isReviewAIContextSyncVisible(surface: ReviewAISurface): boolean {
  if (surface === 'review-dialog-sidecar') {
    return showReviewAISidecar.value;
  }
  return getTabManager()?.hasReviewAICompanionTab?.(reviewSessionId.value) === true;
}

async function syncReviewAIContextIfNeeded(surface: ReviewAISurface): Promise<void> {
  const activeView = resolveReviewAIEntryView();
  await syncReviewAIContextIfNeededCommand({
    visible: isReviewAIContextSyncVisible(surface),
    registry: getReviewAIWorkbenchRegistry(),
    sessionId: reviewSessionId.value,
    surface,
    activeView,
    buildOptions: buildReviewAIOptions,
    onService: (service) => {
      reviewAIService.value = service;
    },
  });
}

async function openReviewAIAssistant(requestedView?: ReviewAIRequestedView): Promise<void> {
  const registry = getReviewAIWorkbenchRegistry();
  await openReviewAIAssistantCommand({
    requestedView,
    mode: props.mode,
    canUseEmbeddedReviewAISidecar: canUseEmbeddedReviewAISidecar.value,
    sessionId: reviewSessionId.value,
    activeServiceView: reviewAIService.value?.state.activeView,
    activeRegistryView: registry?.getReviewSession?.(reviewSessionId.value)?.state.activeView,
    defaultView: resolveDefaultReviewAIEntryView(),
    registry,
    dialogManager: getDialogManager(),
    tabManager: getTabManager(),
    buildOptions: buildReviewAIOptions,
    getCompanionTitle: getReviewAICompanionTitle,
    onService: (service) => {
      reviewAIService.value = service;
    },
    onOpenSidecar: () => {
      reviewAISidebarOpen.value = true;
      updateReviewDialogContainerLayout();
    },
    onPluginNotReady: () => {
      showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    },
  });
}

function openCurrentSrsEditor(): void {
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
}

function getReviewDialogContainer(): HTMLElement | null {
  return (rootRef.value?.closest('.b3-dialog__container.siyuanmemo-review-dialog-container')
    || document.querySelector('.b3-dialog__container.siyuanmemo-review-dialog-container')) as HTMLElement | null;
}

function getReviewDialogTitleElement(): HTMLElement | null {
  return getReviewDialogContainer()?.querySelector('.b3-dialog__title') as HTMLElement | null;
}

function getReviewDialogHeaderElement(): HTMLElement | null {
  return getReviewDialogContainer()?.querySelector('.b3-dialog__header') as HTMLElement | null;
}

function getReviewDialogTitlebarHostElement(): HTMLElement | null {
  return getReviewDialogTitleElement() || getReviewDialogHeaderElement();
}

function getReviewDialogTitlebarSlotElement(host: HTMLElement | null): HTMLElement | null {
  if (!host) {
    return null;
  }
  if (host.classList.contains('b3-dialog__title')) {
    return host;
  }
  return host.querySelector('.siyuanmemo-review-titlebar__slot') as HTMLElement | null;
}

function disconnectReviewDialogTitlebarObserver(): void {
  reviewDialogTitlebarObserver?.disconnect();
  reviewDialogTitlebarObserver = null;
  observedReviewDialogHeader = null;
}

function isReviewDialogTitlebarQueueSwitchSynced(): boolean {
  if (!usesNativeDialogTitlebarQueueSwitch.value) {
    return false;
  }

  const hostElement = getReviewDialogTitlebarHostElement();
  const slotElement = getReviewDialogTitlebarSlotElement(hostElement);
  if (!hostElement || !slotElement) {
    return false;
  }

  const trigger = slotElement.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
  if (!trigger) {
    return false;
  }

  return hostElement.dataset.siyuanmemoQueueSwitch === 'true'
    && slotElement.classList.contains('siyuanmemo-review-titlebar__slot')
    && trigger.textContent === resolvedReviewSurfaceTitle.value
    && trigger.title === resolvedReviewSurfaceTitle.value
    && trigger.getAttribute('aria-label') === t('switchReviewQueueAriaLabel', '切换复习队列：{title}')
      .replace('{title}', resolvedReviewSurfaceTitle.value);
}

function ensureReviewDialogTitlebarObserver(): void {
  if (!usesNativeDialogTitlebarQueueSwitch.value) {
    disconnectReviewDialogTitlebarObserver();
    return;
  }

  const headerElement = getReviewDialogHeaderElement();
  if (!headerElement) {
    return;
  }

  if (reviewDialogTitlebarObserver && observedReviewDialogHeader === headerElement) {
    return;
  }

  disconnectReviewDialogTitlebarObserver();
  reviewDialogTitlebarObserver = new MutationObserver(() => {
    if (!usesNativeDialogTitlebarQueueSwitch.value) {
      return;
    }
    if (!isReviewDialogTitlebarQueueSwitchSynced()) {
      scheduleReviewDialogTitlebarQueueSwitchSync();
    }
  });
  reviewDialogTitlebarObserver.observe(headerElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  observedReviewDialogHeader = headerElement;
}

function restoreReviewDialogTitlebarText(): void {
  const hostElement = getReviewDialogTitlebarHostElement();
  if (!hostElement || hostElement.dataset.siyuanmemoQueueSwitch !== 'true') {
    return;
  }

  hostElement.classList.remove('siyuanmemo-review-titlebar__host');
  delete hostElement.dataset.siyuanmemoQueueSwitch;

  if (hostElement.classList.contains('b3-dialog__title')) {
    hostElement.classList.remove('siyuanmemo-review-titlebar__slot');
    hostElement.replaceChildren();
    hostElement.textContent = resolvedReviewSurfaceTitle.value;
    return;
  }

  hostElement.replaceChildren();
  hostElement.textContent = resolvedReviewSurfaceTitle.value;
}

function syncReviewDialogTitlebarQueueSwitchTrigger(): void {
  ensureReviewDialogTitlebarObserver();
  const hostElement = getReviewDialogTitlebarHostElement();
  if (!hostElement) {
    return;
  }

  if (!usesNativeDialogTitlebarQueueSwitch.value) {
    disconnectReviewDialogTitlebarObserver();
    restoreReviewDialogTitlebarText();
    return;
  }

  const slotElement = hostElement.classList.contains('b3-dialog__title')
    ? hostElement
    : (hostElement.querySelector('.siyuanmemo-review-titlebar__slot') as HTMLElement | null)
      || document.createElement('span');
  if (!hostElement.classList.contains('b3-dialog__title')) {
    slotElement.className = 'siyuanmemo-review-titlebar__slot';
  }

  const existingTrigger = slotElement.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
  if (existingTrigger && isReviewDialogTitlebarQueueSwitchSynced()) {
    return;
  }

  const trigger = existingTrigger || document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'siyuanmemo-review-titlebar__queue-switch';
  trigger.title = resolvedReviewSurfaceTitle.value;
  trigger.textContent = resolvedReviewSurfaceTitle.value;
  trigger.setAttribute(
    'aria-label',
    t('switchReviewQueueAriaLabel', '切换复习队列：{title}').replace('{title}', resolvedReviewSurfaceTitle.value),
  );
  trigger.onpointerdown = handleQueueSwitchTriggerPointerDown;
  trigger.onmousedown = handleQueueSwitchTriggerPointerDown;
  trigger.onclick = handleQueueSwitchTrigger;

  hostElement.dataset.siyuanmemoQueueSwitch = 'true';
  if (hostElement.classList.contains('b3-dialog__title')) {
    hostElement.classList.add('siyuanmemo-review-titlebar__slot');
    hostElement.replaceChildren(trigger);
    return;
  }

  hostElement.classList.add('siyuanmemo-review-titlebar__host');
  slotElement.replaceChildren(trigger);
  hostElement.replaceChildren(slotElement);
}

function scheduleReviewDialogTitlebarQueueSwitchSync(): void {
  if (reviewDialogTitlebarSyncTimer !== null) {
    window.clearTimeout(reviewDialogTitlebarSyncTimer);
  }

  reviewDialogTitlebarSyncTimer = window.setTimeout(() => {
    reviewDialogTitlebarSyncTimer = null;
    ensureReviewDialogTitlebarObserver();
    syncReviewDialogTitlebarQueueSwitchTrigger();
  }, 0);
}

function getReviewContentMain(): HTMLElement | null {
  return (rootRef.value?.querySelector('.fsrs-review-v2-content')
    || document.querySelector('.fsrs-review-v2-content')) as HTMLElement | null;
}

function isReviewFullscreenActive(): boolean {
  const dialogContainer = getReviewDialogContainer();
  const contentMain = getReviewContentMain();
  return Boolean(
    dialogContainer?.classList.contains('fullscreen')
    || contentMain?.classList.contains('fullscreen'),
  );
}

function applyInitialReviewFullscreen(): void {
  if (props.startFullscreen !== true || props.mode === 'tab' || props.isMobile === true || isReviewFullscreenActive()) {
    return;
  }
  toggleReviewFullscreen();
}

function toggleReviewFullscreen(): void {
  if (props.isMobile || props.mode === 'tab') {
    return;
  }

  logger.debug('[SiYuanMemo][ReviewView] Fullscreen button clicked');

  const dialogContainer = getReviewDialogContainer();
  const contentMain = getReviewContentMain();
  logger.debug('[SiYuanMemo][ReviewView] dialogContainer found:', !!dialogContainer);
  logger.debug('[SiYuanMemo][ReviewView] contentMain found:', !!contentMain);

  if (contentMain && dialogContainer) {
    const isFullscreen = contentMain.classList.contains('fullscreen');
    logger.debug('[SiYuanMemo][ReviewView] Current fullscreen state:', isFullscreen);

    if (isFullscreen) {
      contentMain.classList.remove('fullscreen');
      dialogContainer.classList.remove('fullscreen');
      (dialogContainer as HTMLElement).style.maxWidth = '1024px';
      document.getElementById('drag')?.classList.remove('fn__hidden');
      logger.debug('[SiYuanMemo][ReviewView] Exited fullscreen');
    } else {
      contentMain.classList.add('fullscreen');
      dialogContainer.classList.add('fullscreen');
      (dialogContainer as HTMLElement).style.maxWidth = '100vw';
      document.getElementById('drag')?.classList.add('fn__hidden');
      logger.debug('[SiYuanMemo][ReviewView] Entered fullscreen');
    }

    setTimeout(() => {
      const protyleHost = contentMain.querySelector('.fsrs-review-v2-content__protyle-host');
      logger.debug('[SiYuanMemo][ReviewView] protyleHost:', protyleHost);

      if (protyleHost) {
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
}

function isLinearPieceReviewCard(card: FSRSCard | null | undefined): boolean {
  if (!card || card.type !== 'topic' || !isRecord(card.meta)) {
    return false;
  }
  const progressive = card.meta.progressive;
  return isRecord(progressive)
    && String(progressive.kind || '').trim() === 'piece'
    && String(progressive.mode || '').trim() === 'linear';
}

async function handleEditCurrentCardPriority(): Promise<void> {
  const cardEditorService = getCardEditorService();
  const reference = resolveCurrentReviewCardActionReference();
  if (!reference) {
    return;
  }
  if (!cardEditorService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const nextPriority = await openNumberDialog({
    title: t('priority', '优先级'),
    label: t('priorityLabel', '优先级'),
    description: t('priorityHelper', '范围 0-100，数值越小越优先。'),
    defaultValue: resolveCurrentReviewCardPriority() ?? 0,
    min: 0,
    max: 100,
    step: 1,
    integer: true,
  });
  if (nextPriority === null) {
    return;
  }

  try {
    const snapshot = await cardEditorService.updatePriority(reference.cardId, nextPriority);
    await hook.refreshCurrentItem(snapshot.card, buildExpectedRefreshOptions(reference));
    showMessage(t('prioritySaved', '优先级已更新'), 3000, 'info');
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to update current card priority:', error);
    showMessage(
      t('prioritySaveFailed', '优先级更新失败'),
      5000,
      'error',
    );
  }
}

async function handleDismissCurrentCard(): Promise<void> {
  const cardEditorService = getCardEditorService();
  const reference = resolveCurrentReviewCardActionReference();
  if (!reference) {
    return;
  }
  if (!cardEditorService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  try {
    const nextDismissed = !resolveCurrentReviewCardDismissed();
    const snapshot = await cardEditorService.setDismissed(reference.cardId, nextDismissed);
    if (!nextDismissed) {
      await hook.refreshCurrentItem(snapshot.card, buildExpectedRefreshOptions(reference));
      showMessage(t('reviewCardUnsuspended', '已取消暂停这张卡片'), 3000, 'info');
      return;
    }

    await advanceDismissedCurrentCard({
      cardId: reference.cardId,
      blockId: reference.blockId,
      dismissed: true,
    });
    showMessage(t('reviewCardSuspended', '已暂停这张卡片'), 3000, 'info');
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to toggle current card dismissed state:', error);
    showMessage(
      t('reviewCardDismissToggleFailed', '更新暂停状态失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

async function handleDismissPeerCards(): Promise<void> {
  const cardEditorService = getCardEditorService();
  const peerInfo = resolveCurrentBlockPeerCards();
  if (!cardEditorService || !peerInfo || peerInfo.peerCards.length === 0) {
    return;
  }
  const targetCardIds = resolveCurrentAndPeerCardIds(peerInfo);

  try {
    const result = await cardEditorService.setDismissedMany(
      targetCardIds,
      true,
    );
    const currentUpdated = result.updatedCardIds.includes(peerInfo.currentCardId);
    const updatedPeerCardIds = filterOutCurrentCardId(result.updatedCardIds, peerInfo.currentCardId);
    await removeCardIdsFromActiveQueue(updatedPeerCardIds);
    if (currentUpdated) {
      await advanceDismissedCurrentCard({
        cardId: peerInfo.currentCardId,
        blockId: peerInfo.currentBlockId,
        dismissed: true,
      });
    }

    if (result.failedCardIds.length > 0) {
      showMessage(
        t('reviewPeerCardsSuspendPartial', '已暂停 {done} 张卡片，另有 {failed} 张失败')
          .replace('{done}', String(result.updatedCardIds.length))
          .replace('{failed}', String(result.failedCardIds.length)),
        4000,
        'error',
      );
      return;
    }

    showMessage(
      t('reviewPeerCardsSuspended', '已暂停这张卡片和同块的其余 {count} 张卡片')
        .replace('{count}', String(Math.max(0, result.updatedCardIds.length - 1))),
      3000,
      'info',
    );
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to suspend peer cards:', error);
    showMessage(
      t('reviewPeerCardsSuspendFailed', '暂停其余卡片失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

async function handleDeleteCurrentCard(): Promise<void> {
  const cardService = getCardService();
  const reference = resolveCurrentReviewCardActionReference();
  if (!reference) {
    return;
  }
  if (!cardService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const confirmed = await confirmDialog({
    title: t('deleteCurrentCardConfirmTitle', '删除卡片'),
    content: t('deleteCurrentCardConfirmContent', '确认删除当前卡片吗？此操作不可撤销。'),
    confirmText: t('deleteCard', '删除'),
    cancelText: t('cancel', '取消'),
  });
  if (!confirmed) {
    return;
  }

  try {
    const result = await cardService.deleteCard({ cardId: reference.cardId });
    if (!result.ok) {
      throw result.error;
    }
    await advanceCurrentReviewCardByReference({
      cardId: reference.cardId,
      blockId: reference.blockId,
    });
    showMessage(t('reviewCardDeleted', '已删除当前卡片'), 3000, 'info');
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to delete current card:', error);
    showMessage(
      t('reviewCardDeleteFailed', '删除卡片失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

async function handleDeletePeerCards(): Promise<void> {
  const cardService = getCardService();
  const peerInfo = resolveCurrentBlockPeerCards();
  if (!cardService || !peerInfo || peerInfo.peerCards.length === 0) {
    return;
  }
  const targetCardIds = resolveCurrentAndPeerCardIds(peerInfo);

  const confirmed = await confirmDialog({
    title: t('deletePeerCardsConfirmTitle', '删除这张卡片和同块卡片'),
    content: t('deletePeerCardsConfirmContent', '确认删除这张卡片和同块的其余 {count} 张卡片吗？此操作不可撤销。')
      .replace('{count}', String(peerInfo.peerCards.length)),
    confirmText: t('deleteCard', '删除'),
    cancelText: t('cancel', '取消'),
  });
  if (!confirmed) {
    return;
  }

  try {
    const result = await cardService.deleteCards({
      cardIds: targetCardIds,
    });
    if (!result.ok) {
      throw result.error;
    }

    const currentDeleted = result.value.deletedCardIds.includes(peerInfo.currentCardId);
    const deletedPeerCardIds = filterOutCurrentCardId(result.value.deletedCardIds, peerInfo.currentCardId);
    await removeCardIdsFromActiveQueue(deletedPeerCardIds);
    if (currentDeleted) {
      await advanceCurrentReviewCardByReference({
        cardId: peerInfo.currentCardId,
        blockId: peerInfo.currentBlockId,
      });
    }

    if (result.value.failedCardIds.length > 0) {
      showMessage(
        t('reviewPeerCardsDeletePartial', '已删除 {done} 张卡片，另有 {failed} 张失败')
          .replace('{done}', String(result.value.deletedCardIds.length))
          .replace('{failed}', String(result.value.failedCardIds.length)),
        4000,
        'error',
      );
      return;
    }

    showMessage(
      t('reviewPeerCardsDeleted', '已删除这张卡片和同块的其余 {count} 张卡片')
        .replace('{count}', String(Math.max(0, result.value.deletedCardIds.length - 1))),
      3000,
      'info',
    );
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to delete peer cards:', error);
    showMessage(
      t('reviewPeerCardsDeleteFailed', '删除其余卡片失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

function resolveCurrentEditableSource(): ReviewEditableSource | null {
  return contentRef.value?.getEditableSource?.() || null;
}

function closeCurrentContentEditor(): void {
  if (reviewTextEditorSaving.value) {
    return;
  }

  reviewTextEditorOpen.value = false;
  reviewTextEditorLoading.value = false;
  reviewTextEditorSource.value = null;
  reviewTextEditorValue.value = '';
  reviewTextEditorOriginalValue.value = '';
  reviewTextEditorSeq += 1;
}

async function openCurrentContentEditor(): Promise<void> {
  const editableSource = resolveCurrentEditableSource();
  if (!editableSource) {
    showMessage(t('currentContentNotEditable', '当前内容暂不支持编辑'), 3000, 'info');
    return;
  }

  const reviewService = getReviewService();
  if (!reviewService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const seq = ++reviewTextEditorSeq;
  reviewTextEditorSource.value = editableSource;
  reviewTextEditorOpen.value = true;
  reviewTextEditorLoading.value = true;
  reviewTextEditorValue.value = '';
  reviewTextEditorOriginalValue.value = '';

  try {
    const kramdown = await reviewService.getBlockKramdown(editableSource.blockId);
    if (seq !== reviewTextEditorSeq || !reviewTextEditorOpen.value) {
      return;
    }
    reviewTextEditorValue.value = kramdown;
    reviewTextEditorOriginalValue.value = kramdown;
  } catch (error) {
    if (seq !== reviewTextEditorSeq) {
      return;
    }
    logger.error('[SiYuanMemo][ReviewView] Failed to load editable review content:', error);
    closeCurrentContentEditor();
    showMessage(
      t('loadCurrentContentFailed', '读取当前内容失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
    return;
  } finally {
    if (seq === reviewTextEditorSeq) {
      reviewTextEditorLoading.value = false;
    }
  }
}

async function confirmCurrentContentEditor(): Promise<void> {
  const editableSource = reviewTextEditorSource.value;
  if (!editableSource || reviewTextEditorConfirmDisabled.value) {
    return;
  }

  const reviewService = getReviewService();
  if (!reviewService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const seq = ++reviewTextEditorSeq;
  reviewTextEditorSaving.value = true;

  try {
    await reviewService.updateBlockMarkdown(editableSource.blockId, reviewTextEditorValue.value);
    if (seq !== reviewTextEditorSeq) {
      return;
    }

    reviewTextEditorOriginalValue.value = reviewTextEditorValue.value;
    suppressReviewSourceRefreshForBlock(editableSource.blockId);
    await contentRef.value?.refreshVisibleContent?.('manual-edit-save');

    reviewTextEditorOpen.value = false;
    reviewTextEditorSource.value = null;
    showMessage(t('currentContentSaved', '当前内容已保存'), 2000, 'info');
  } catch (error) {
    if (seq !== reviewTextEditorSeq) {
      return;
    }
    logger.error('[SiYuanMemo][ReviewView] Failed to save editable review content:', error);
    showMessage(
      t('saveCurrentContentFailed', '保存当前内容失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  } finally {
    if (seq === reviewTextEditorSeq) {
      reviewTextEditorSaving.value = false;
    }
  }
}

function buildMoreMenuItems(): ReviewMenuItem[] {
  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  const openAsItems = buildOpenAsMenuItems();
  const peerInfo = resolveCurrentBlockPeerCards();
  const editableSource = resolveCurrentEditableSource();
  const hasReviewCard = hasCurrentReviewCard();
  const hasCardEditorService = Boolean(getCardEditorService());

  return buildReviewMoreMenuItems({
    t,
    currentCardType: currentCard?.type,
    progressiveExcerptEnabled: isProgressiveExcerptEnabled(),
    hasProgressiveSourceTarget: Boolean(resolveProgressiveSourceTargetId()),
    isLinearPieceReviewCard: isLinearPieceReviewCard(currentCard),
    openAsItems,
    editableSourceTitle: editableSource?.title ?? null,
    currentPriority: resolveCurrentReviewCardPriority(),
    currentDismissed: resolveCurrentReviewCardDismissed(),
    canEditCurrentPriority: hasReviewCard && hasCardEditorService,
    canSuspendCurrentCard: hasReviewCard && hasCardEditorService,
    canDeleteCurrentCard: hasReviewCard && Boolean(getCardService()),
    peerCount: peerInfo?.peerCards.length ?? 0,
    isMobile: props.isMobile === true,
    actions: {
      progressiveExcerpt: () => void handleProgressiveExcerptFromReview('toolbar'),
      progressiveOpenSource: handleProgressiveOpenSource,
      progressiveCompletePiece: () => void handleProgressiveCompletePiece(),
      editSrs: openCurrentSrsEditor,
      editCurrentContent: () => void openCurrentContentEditor(),
      toggleFullscreen: toggleReviewFullscreen,
      editPriority: () => void handleEditCurrentCardPriority(),
      toggleDismissed: () => void handleDismissCurrentCard(),
      dismissPeers: () => void handleDismissPeerCards(),
      deleteCurrent: () => void handleDeleteCurrentCard(),
      deletePeers: () => void handleDeletePeerCards(),
    },
  });
}

function handleOpenMoreMenu(ev: MouseEvent): void {
  const menu = new Menu('review-more-menu');
  for (const item of buildMoreMenuItems()) {
    if (isReviewMenuSeparator(item)) {
      menu.addSeparator();
      continue;
    }
    menu.addItem(item);
  }
  openMenuAtEvent(menu, ev);
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

  if (actionType === 'more') {
    handleOpenMoreMenu(ev);
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

  if (actionType === 'ai-sidebar') {
    void openReviewAIAssistant();
    return;
  }

  if (actionType === 'ai-explain') {
    void openReviewAIAssistant('explain');
    return;
  }

  if (actionType === 'fullscreen') {
    toggleReviewFullscreen();
  } else if (actionType === 'edit-srs') {
    openCurrentSrsEditor();
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

function closeCurrentReviewSurface(): void {
  if (props.mode === 'tab') {
    const tabManager = getTabManager();
    if (reviewSessionId.value && typeof tabManager?.closeReviewTab === 'function') {
      tabManager.closeReviewTab(reviewSessionId.value);
      return;
    }
    logger.warn('[SiYuanMemo][ReviewView] Failed to close tab review because TabManager.closeReviewTab is unavailable', {
      reviewSessionId: reviewSessionId.value,
    });
  }
  emit('close');
}

function buildOpenAsMenuItems(): ReviewMenuItem[] {
  const currentSourceBlockId = resolveCurrentReviewSourceBlockId();
  const tabManager = getTabManager();
  const dialogManager = getDialogManager();
  const isTabSurface = props.mode === 'tab';
  const standardDialogTarget = isTabSurface ? resolveStandardReviewDialogTarget() : null;

  if (!tabManager || typeof tabManager.openReviewTab !== 'function') {
    return [];
  }

  const menuItems: ReviewMenuItem[] = [
    {
      id: 'locateSourceBlock',
      icon: 'iconOpen',
      label: t('locateSourceBlock', '定位到原块位置'),
      disabled: !props.app || !currentSourceBlockId,
      click() {
        if (!props.app || !currentSourceBlockId) {
          return;
        }
        openReviewBlockAtSource({
          app: props.app,
          blockId: currentSourceBlockId,
        });
      },
    },
    {
      id: 'openRightReviewAndLocateSource',
      icon: 'iconLayoutRight',
      label: t('openRightReviewAndLocateSource', '右侧复习并定位原块'),
      disabled: !props.app || !currentSourceBlockId,
      async click() {
        if (!props.app || !currentSourceBlockId) {
          return;
        }
        try {
          await openReviewBlockAtSource({
            app: props.app,
            blockId: currentSourceBlockId,
          });
        } catch (error) {
          logger.warn('[SiYuanMemo][ReviewView] Failed to locate source block before opening review:', error);
        }
        tabManager.openReviewTab(buildReviewTabOpenOptions({
          position: 'right',
          reviewState: buildReviewTabRuntimeState(),
        }));
        closeCurrentReviewSurface();
      },
    },
  ];

  if (isTabSurface) {
    menuItems.push({
      id: 'managedSplitRight',
      icon: 'iconLayoutRight',
      label: t('splitCurrentReviewRight', '右侧分屏当前复习'),
      click() {
        openManagedReviewSplit('right');
      },
    });

    menuItems.push({
      id: 'managedSplitBottom',
      icon: 'iconLayout',
      label: t('splitCurrentReviewBottom', '下方分屏当前复习'),
      click() {
        openManagedReviewSplit('bottom');
      },
    });

    if (standardDialogTarget && typeof dialogManager?.openStandardReviewDialog === 'function') {
      menuItems.push({
        id: 'openInDialog',
        icon: 'iconOpen',
        label: t('openInDialog', 'Dialog'),
        click() {
          logger.debug('[SiYuanMemo][ReviewView] Opening review in dialog and closing current tab');
          dialogManager.openStandardReviewDialog?.({
            queueType: standardDialogTarget.queueType,
            title: props.title || t('reviewTitle', 'Review'),
            headerVariant: standardDialogTarget.headerVariant,
            queueInstance: getUnderlyingQueue(),
            initialSessionState: getInitialReviewSessionState(),
          });
          closeCurrentReviewSurface();
        },
      });
    }
    return menuItems;
  }

  menuItems.push({
    id: 'openByTab',
    icon: 'iconOpen',
    label: t('openInNewTab', 'New Tab'),
    click() {
      logger.debug('[SiYuanMemo][ReviewView] Opening review in new tab and closing dialog');
      const reviewTabOptions = buildReviewTabOpenOptions();
      if (typeof tabManager.openReviewTabInNewTab === 'function') {
        tabManager.openReviewTabInNewTab(reviewTabOptions);
      } else {
        tabManager.openReviewTab(reviewTabOptions);
      }
      closeCurrentReviewSurface();
    },
  });
  menuItems.push({
    id: 'insertRight',
    icon: 'iconLayoutRight',
    label: t('openInRight', 'Right Side'),
    click() {
      logger.debug('[SiYuanMemo][ReviewView] Opening review on right side and closing dialog');
      tabManager.openReviewTab(buildReviewTabOpenOptions({
        position: 'right',
      }));
      closeCurrentReviewSurface();
    },
  });

  if (typeof tabManager.openReviewInNewWindow === 'function') {
    menuItems.push({
      id: 'openByNewWindow',
      icon: 'iconOpenWindow',
      label: t('openInNewWindow', 'New Window'),
      click() {
        logger.debug('[SiYuanMemo][ReviewView] Opening review in new window and closing dialog');
        tabManager.openReviewInNewWindow?.(buildReviewTabOpenOptions());
        closeCurrentReviewSurface();
      },
    });
  }

  return menuItems;
}

function handleOpenAsMenu(ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenAsMenu called', ev);

  const menu = new Menu();
  const menuItems = buildOpenAsMenuItems();
  if (menuItems.length === 0) {
    logger.error('[SiYuanMemo][ReviewView] TabManager not available for open-as');
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const [firstItem, secondItem, ...remainingItems] = menuItems;
  if (firstItem) {
    menu.addItem(firstItem);
  }
  if (secondItem) {
    menu.addItem(secondItem);
  }
  if (remainingItems.length > 0) {
    menu.addSeparator();
    for (const item of remainingItems) {
      menu.addItem(item);
    }
  }

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
      schedulingContext: resolveCurrentReviewSchedulingContext(card as FSRSCard),
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
    visualVariant: 'form',
    containerClass: 'siyuanmemo-srs-editor-dialog',
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
  const target = resolveMenuAnchor(ev.currentTarget) || resolveMenuAnchor(ev.target);
  if (!target) {
    logger.error('[SiYuanMemo][ReviewView] Cannot open menu: target element is null');
    return;
  }

  openMenuAtAnchor(menu, target);
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

function resolveCurrentReviewSourceBlockId(): string {
  return String(
    resolveCurrentEditableSource()?.blockId
    || state.value.content.id
    || state.value.content.data
    || state.value.actions.cardMeta?.blockID
    || state.value.content.card?.blockId
    || '',
  ).trim();
}

function resolveCurrentReviewNeuralSyncIds(): string[] {
  const ids = new Set<string>();
  const pushId = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      ids.add(normalized);
    }
  };

  pushId(state.value.actions.cardMeta?.blockID);
  pushId(state.value.content.card?.blockId);
  pushId(state.value.content.data);
  pushId(state.value.content.id);

  const neuralContext = state.value.content.card?.meta?.neuralContext;
  if (neuralContext && typeof neuralContext === 'object') {
    pushId((neuralContext as Record<string, unknown>).sourceVirtualNodeId);
  }

  return [...ids];
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
        ? t('progressiveExcerptCreatedInserted', '已创建 Topic，并插入当前渐进复习')
        : routedExcerptTarget === 'hyperspace'
          ? t('progressiveExcerptCreatedMergedHyperspace', '已创建 Topic，并并入当前超空间神经漫游')
        : trigger !== 'toolbar'
          ? t('progressiveExcerptCreatedHotkey', '已创建 Topic')
          : t('progressiveExcerptCreated', '已创建 Topic'),
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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await nextTick();
    if (resolveCurrentReviewNeuralSyncIds().includes(currentNodeId)) {
      return true;
    }
  }

  logger.warn('[SiYuanMemo][ReviewView] Neural tab sync finished without matching the requested node', {
    requestedNodeId: currentNodeId,
    resolvedBlockId: resolveCurrentReviewBlockId(),
    resolvedSyncIds: resolveCurrentReviewNeuralSyncIds(),
    contentId: String(state.value.content.id || ''),
    cardBlockId: String(state.value.content.card?.blockId || ''),
  });
  return false;
}

defineExpose<ReviewViewTabBridge>({
  syncToNeuralQueueCurrentNode,
  refreshTabSurface,
});

watch(
  () => [
    props.mode,
    props.nativeDialogTitlebar === true,
    props.isMobile === true,
    resolvedReviewSurfaceTitle.value,
  ],
  () => {
    scheduleReviewDialogTitlebarQueueSwitchSync();
  },
  { flush: 'post' },
);

watch(
  () => [
    props.mode,
    sharedReviewSessionId.value,
    state.value.content.card?.id || '',
    state.value.content.card?.updatedAt || 0,
    state.value.content.id || '',
    hook.context.value.showAnswer ? 1 : 0,
    hook.context.value.session?.initialTotal || 0,
    hook.context.value.session?.answeredCount || 0,
    hook.context.value.session?.correctCount || 0,
  ],
  () => {
    props.onTabRuntimeStateChange?.(buildReviewTabRuntimeState());
  },
  { immediate: true },
);

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
  background: var(--b3-theme-background);
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

.fsrs-review-v2__arena-hint {
  margin: 8px 16px 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 26%, var(--b3-border-color) 74%);
  border-radius: 8px;
  background: color-mix(in srgb, var(--b3-theme-primary-lightest) 62%, var(--b3-theme-background) 38%);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1.5;
}

.fsrs-review-v2__workspace--with-ai .fsrs-review-v2__content-wrapper {
  border-right: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.fsrs-review-v2__empty-footer {
  display: flex;
  justify-content: center;
  padding: 0 16px 16px;
}

.fsrs-review-v2__empty-exit {
  min-width: 140px;
}

.fsrs-review-v2__ai-sidecar {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--b3-theme-background);
}

.fsrs-review-v2-resume {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.16);
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
  background: rgba(0, 0, 0, 0.18);
  overflow-y: auto;
}

.review-filter-dialog-container {
  width: min(900px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  border-radius: 6px !important;
}

.b3-dialog__container.siyuanmemo-review-dialog-container .b3-dialog__title.siyuanmemo-review-titlebar__slot {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.b3-dialog__container.siyuanmemo-review-dialog-container .b3-dialog__header.siyuanmemo-review-titlebar__host {
  min-width: 0;
  overflow: hidden;
}

.b3-dialog__container.siyuanmemo-review-dialog-container .b3-dialog__header > .siyuanmemo-review-titlebar__slot {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.b3-dialog__container.siyuanmemo-review-dialog-container .siyuanmemo-review-titlebar__queue-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: min(320px, 100%);
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
  pointer-events: auto;
  user-select: none;
  -webkit-app-region: no-drag;
}

.b3-dialog__container.siyuanmemo-review-dialog-container .siyuanmemo-review-titlebar__queue-switch:hover,
.b3-dialog__container.siyuanmemo-review-dialog-container .siyuanmemo-review-titlebar__queue-switch:focus-visible {
  color: var(--b3-theme-primary);
  outline: none;
}

.b3-dialog__container.fsrs-mobile-review-dialog {
  border-radius: 0 !important;
  max-width: 100vw !important;
}
</style>

