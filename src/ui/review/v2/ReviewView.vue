<template>
  <div
    ref="rootRef"
    class="fsrs-review-v2"
    :class="{ 'fsrs-review-v2--mobile': props.isMobile }"
    data-key="dialog-opencard"
    @click="handleRootClick"
  >
    <div class="fsrs-review-v2__workspace" :class="{ 'fsrs-review-v2__workspace--with-side-area': showReviewSideArea }">
      <!-- 📝 复习内容区 -->
      <div class="fsrs-review-v2__content-wrapper">
        <ReviewHeader
          :header="displayedReviewHeader"
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

        <div
          v-if="reviewWriterUnavailableNotice"
          class="fsrs-review-v2__writer-recovery"
          role="status"
        >
          <div class="fsrs-review-v2__writer-recovery-main">
            <div class="fsrs-review-v2__writer-recovery-title">
              {{ reviewWriterUnavailableNotice.title }}
            </div>
            <div class="fsrs-review-v2__writer-recovery-message">
              {{ reviewWriterUnavailableNotice.message }}
            </div>
            <div v-if="reviewWriterUnavailableNotice.detail" class="fsrs-review-v2__writer-recovery-detail">
              {{ reviewWriterUnavailableNotice.detail }}
            </div>
          </div>
          <div class="fsrs-review-v2__writer-recovery-actions">
            <button
              v-if="lastReviewWriterRecoveryAction"
              type="button"
              class="b3-button b3-button--text"
              @click="retryReviewWriterRecoveryAction"
            >
              {{ reviewWriterUnavailableNotice.retryLabel }}
            </button>
            <button
              type="button"
              class="b3-button b3-button--outline"
              @click="reloadReviewWriterRecoverySurface"
            >
              {{ reviewWriterUnavailableNotice.reopenLabel }}
            </button>
            <button
              type="button"
              class="b3-button b3-button--cancel"
              @click="dismissReviewWriterRecoveryNotice"
            >
              {{ reviewWriterUnavailableNotice.dismissLabel }}
            </button>
          </div>
        </div>

        <ReviewContent
          ref="contentRef"
          :app="app"
          :plugin="props.plugin"
          :content="displayedReviewContent"
          :overlay="state.overlay"
          :has-hidden-content="displayedReviewMeta.hasHiddenContent"
          :show-answer="displayedReviewActions.showAnswer"
          :meta="displayedReviewMeta"
          :i18n="i18n"
          :render-epoch="renderEpoch"
          :render-services="reviewRenderServices"
          @editor-state-change="handleEditorStateChange"
          @concept-roam="handleConceptRoam"
        />

        <div v-if="reviewSemanticTemporaryView" class="fsrs-review-v2__temporary-view" role="status">
          <span>{{ t('semanticTemporaryViewing', 'Viewing: {title}').replace('{title}', reviewSemanticTemporaryView.title) }}</span>
          <button type="button" class="b3-button b3-button--outline" @click="clearSemanticTemporaryView">
            {{ t('semanticReturnToCurrentReview', 'Return to current review') }}
          </button>
        </div>

        <ReviewActions
          v-if="showReviewActions"
          :actions="displayedReviewActions"
          :meta="displayedReviewMeta"
          :current-card="displayedReviewContent.card"
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

        <div v-if="showCompletedEmptyStateExit || showLearnAheadAction" class="fsrs-review-v2__empty-footer">
          <button
            v-if="showLearnAheadAction"
            type="button"
            class="b3-button b3-button--text fsrs-review-v2__empty-learn-ahead"
            @click="hook.executeCommand('learn-ahead')"
          >
            {{ t('learnAhead', '提前学习') }}
          </button>
          <button
            v-if="showCompletedEmptyStateExit"
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

      <aside v-if="showReviewSideArea" class="fsrs-review-v2__side-area fsrs-review-v2__ai-sidecar">
        <div class="fsrs-review-v2__side-tabs" role="tablist" :aria-label="t('reviewSideAreaTabs', 'Review side area')">
          <button
            v-if="showReviewAISidecar && reviewAIService"
            type="button"
            class="fsrs-review-v2__side-tab"
            :class="{ 'fsrs-review-v2__side-tab--active': activeReviewSideAreaTab === 'ai' }"
            role="tab"
            :aria-selected="activeReviewSideAreaTab === 'ai'"
            @click="activeReviewSideAreaTab = 'ai'"
          >
            AI
          </button>
          <button
            v-if="showReviewSemanticSidePanel"
            type="button"
            class="fsrs-review-v2__side-tab"
            :class="{ 'fsrs-review-v2__side-tab--active': activeReviewSideAreaTab === 'semantic' }"
            role="tab"
            :aria-selected="activeReviewSideAreaTab === 'semantic'"
            @click="activeReviewSideAreaTab = 'semantic'"
          >
            语义
          </button>
        </div>
        <div
          v-if="showReviewAISidecar && reviewAIService"
          v-show="activeReviewSideAreaTab === 'ai'"
          class="fsrs-review-v2__side-panel"
          role="tabpanel"
        >
          <AiWorkbenchPane :service="reviewAIService" :i18n="i18n" @close="closeReviewAISidebar" />
        </div>
        <div
          v-if="showReviewSemanticSidePanel"
          v-show="activeReviewSideAreaTab === 'semantic'"
          class="fsrs-review-v2__side-panel fsrs-review-v2__side-panel--semantic"
          role="tabpanel"
        >
          <SemanticReviewSidebar
            :read-client="semanticActivationReadClient"
            :command-client="semanticActivationCommandClient"
            :current-node-id="reviewSemanticCurrentNodeId"
            :pinned-session-id="reviewSemanticPinnedSessionId"
            :i18n="i18n"
            @unpin="reviewSemanticPinnedSessionId = null"
            @start-exploration="startSemanticActivationEntry(null)"
            @view-ended-session="handleSemanticEndedSessionReview"
            @continue-ended-session="handleSemanticEndedSessionContinue"
            @view-node="handleSemanticSidebarViewNode"
            @analyze-path="handleSemanticAnalyzePath"
          />
        </div>
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
import AiWorkbenchPane from '@/ui/ai/AiWorkbenchPane.vue';
import LargeTextEditorDialog from '@/ui/shared/LargeTextEditorDialog.vue';
import SemanticReviewSidebar from './semantic/SemanticReviewSidebar.vue';
import {
  buildSemanticPathAnalysisContext,
  buildSemanticPathAnalysisPrompt,
  type SemanticPathAnalysisPayload,
} from './semantic/semanticReviewAIHandoff';
import {
  createReviewSessionController,
  useReviewSession,
  type ReviewSessionActionError,
  type ReviewSessionController,
  type ReviewSessionRetryAction,
  type ReviewSessionUpdateReason,
} from './useReviewSession';
import {
  type RefreshCurrentItemOptions,
  type ReviewEditableSource,
  type ReviewHeaderVariant,
  type ReviewNativeSplitGuardState,
  type ReviewUIState,
  type ReviewViewTabBridge,
} from './types';
import {
  resolveCurrentMainReviewQueueType,
  resolveReviewPresentationHeaderVariant,
} from '@/types/review-presentation-semantics';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import {
  QueueType,
  type FilterGroupQueueSessionSnapshot,
  type InitialReviewSessionState,
  type ReviewTabTransferState,
  type IUnifiedDataSourceManagerFacade,
  isNeuralRoamSessionQueue,
  type NeuralNavigationState,
  type NeuralRoamSessionQueue,
  type QueueReviewSchedulingContext,
  type ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { SrsArenaRecommendation } from '@/types/arena';
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
  resolveReviewWriterUnavailableRecovery,
  type ReviewWriterUnavailableRecoveryNotice,
} from './reviewWriterUnavailableRecovery';
import {
  createReviewKernelTransactionWriterActionTracker,
  resolveReviewActionForKernelTransactionWriterUnavailable,
} from './reviewKernelTransactionWriterUnavailable';
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
  buildReviewNeuralEngineModeMenuItems,
  buildReviewNeuralFocusMenuItems,
  buildReviewNeuralHistoryMenuItems,
  handleReviewNeuralEngineModeSelection,
  handleReviewNeuralToolbarAction,
  isReviewNeuralMenuAction,
  isReviewNeuralToolbarAction,
  type ReviewNeuralBrowserSubview,
} from './reviewNeuralCommands';
import { SemanticActivationSessionController } from '@/application/services/SemanticActivationSessionController';
import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import {
  getPreferredNeuralRoamUserMode,
  setPreferredNeuralRoamUserMode,
  type NeuralRoamUserMode,
} from './semantic/semanticActivationModePreference';
import { startSemanticActivationFromReviewConcept } from './semantic/reviewSemanticActivationEntry';
import { resolveReviewConceptRoamFocus, resolveReviewConceptRoamTargets } from './reviewConceptRoam';
import { buildReviewNeuralEntryMenuItems } from './reviewNeuralEntryMenuItems';
import {
  createReviewSourceRefreshRuntime,
  getSharedReviewSourceRefreshCoordinator,
  type ReviewTransactionWebSocketServiceLike,
} from './reviewSourceRefreshRuntime';
import {
  bindReviewGlobalEvents,
  createReviewDuplicateKeyGuard,
} from './reviewKeyboardRuntime';
import {
  buildReviewOpenAsMenuItems,
  type ReviewOpenAsDialogManager,
  type ReviewOpenAsTabManager,
  type ReviewTabOpenOptions,
} from './reviewOpenAsCommands';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import { PROGRESSIVE_EXCERPT_REQUEST_EVENT } from '@/application/handlers/ProgressiveExcerptHotkeyHandler';
import {
  REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
  REVIEW_LOCATE_CURRENT_SOURCE_REQUEST_EVENT,
  REVIEW_SET_PRIORITY_REQUEST_EVENT,
  REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT,
} from '@/application/handlers/ReviewCommandRequestEvents';
import {
  KERNEL_TRANSACTION_WRITER_UNAVAILABLE_EVENT,
  readKernelTransactionWriterUnavailableDetail,
} from '@/application/handlers/KernelTransactionWriterUnavailableEvent';
import {
  getReviewProgressiveReadingService,
  handleProgressiveCompletePiece as handleProgressiveCompletePieceCommand,
  handleProgressiveOpenSource as handleProgressiveOpenSourceCommand,
  isLinearPieceReviewCard,
  isProgressiveExcerptCard,
  isReviewProgressiveExcerptEnabled,
  resolveProgressiveSourceTargetId,
  runReviewProgressiveExcerptCommand,
  type ReviewProgressiveExcerptTrigger,
  type ReviewProgressiveReadingServiceLike,
  type ReviewSelectionExcerptServiceLike,
  type ReviewTabApplicationServiceLike,
} from './reviewProgressiveExcerptCommands';
import {
  buildStandardReviewQueueSwitchPresets,
  createReviewTitlebarQueueSwitchRuntime,
  handleQueueSwitchTriggerPointerDown,
  isReviewFullscreenActive as isReviewFullscreenActiveCommand,
  openMenuAtAnchor,
  openQueueSwitchMenuAtAnchor as openQueueSwitchMenuAtAnchorCommand,
  resolveCurrentMainQueueSwitchType as resolveCurrentMainQueueSwitchTypeCommand,
  resolveMenuAnchor,
  shouldApplyInitialReviewFullscreen,
  switchToStandardReviewQueue as switchToStandardReviewQueueCommand,
  toggleReviewFullscreen as toggleReviewFullscreenCommand,
} from './reviewShellCommands';
import { openReviewSrsEditorDialog } from './reviewSrsEditorCommands';
import { AI_GENERAL_CHAT_SKILL_ID, type AIWorkbenchOpenOptions, type AIWorkbenchSurface } from '@/types/ai';
import type { PluginSettings } from '@/types/settings';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { SharedReviewSessionRegistry } from '@/application/services/SharedReviewSessionRegistry';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import { prepareReviewPresentation } from './reviewPresentationPreparer';
import {
  createReviewArenaRuntime,
  resolveArenaTargetKindFromCard,
  resolveReviewArenaScenario,
} from './reviewArenaCommands';
import { createReviewCardActionRuntime, type ReviewCardPeerInfo } from './reviewCardActionCommands';
import { createReviewCurrentContentEditorRuntime } from './reviewCurrentContentEditorRuntime';
import { createReviewFilterRuntime, type ReviewFilterGroupQueueLike } from './reviewFilterCommands';
import { createReviewDataObserverRuntime } from './reviewDataObserverRuntime';
import { createReviewNativeSplitRuntime } from './reviewNativeSplitRuntime';
import { buildReviewDomainSyncSafetyDecision } from '@/application/services/ReviewDomainSyncSafetyService';
import { openManualSyncConflictResolutionDialog } from '@/ui/syncConflict/manualSyncConflictResolutionDialog';

const logger = createLogger('ReviewView');

type ReviewPluginContextLike = {
  getDialogManager?: () =>
    | (ReviewOpenAsDialogManager & {
        openBrowserDialog?: (options?: {
          initialQueueId?: string;
          initialNeuralSubview?: 'concept-cards' | 'roam-history' | 'worldline-anchors';
        }) => void;
        openNeuralRoamDialog?: (options?: {
          focusBlockId?: string;
          seedBlockId?: string | null;
          sourceReviewCardId?: string | null;
          conceptBlockId?: string | null;
          previousEngineMode?: 'orbit' | 'hyperspace' | null;
          includeFocusAsFirst?: boolean;
          resetHistory?: boolean;
          startNewSession?: boolean;
          entrySessionKind?: 'temporary-current-block' | 'temporary-concept' | 'station-roam' | 'concept-card-roam' | 'direct-focus' | null;
        }) => Promise<void> | void;
        openAiWorkbenchDialog?: (options?: AIWorkbenchOpenOptions) => Promise<void> | void;
        switchStandardReviewDialogQueue?: (queueType: QueueType) => Promise<void> | void;
      })
    | undefined;
  getReviewAIWorkbenchRegistry?: () =>
    | (ReviewAIRegistryLike & {
        disposeReviewSession?: (sessionId: string) => void;
      })
    | undefined;
  getNeuralRoamEntryActionService?: () =>
    | {
        startTemporaryCurrentBlockRoam?: (input: {
          blockId: string;
          sourceReviewCardId?: string | null;
        }) => Promise<{ ok: boolean; message?: string }>;
        startTemporaryConceptRoam?: (input: {
          conceptBlockId: string;
          conceptCardId?: string | null;
        }) => Promise<{ ok: boolean; message?: string }>;
        establishStation?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
        establishStationAndStartRoam?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
        makeConceptOnly?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
        makeConceptAndAddToQueue?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
        makeConceptAndStartRoam?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
        addExistingConceptToQueue?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
      }
    | undefined;
  getSharedReviewSessionRegistry?: () => SharedReviewSessionRegistry | undefined;
  createReviewRenderServices?: (options?: { i18n?: Record<string, string> }) => ReviewRenderServices;
  getCardStorage?: () => unknown;
  getTabManager?: () =>
    | (ReviewOpenAsTabManager & {
        replaceCurrentReviewTabWithStandardQueue?: (queueType: QueueType) => void;
        closeReviewTab?: (reviewSessionId: string) => void;
        openReviewAICompanionTab?: (options: AIWorkbenchOpenOptions & { sessionId: string; title: string }) => Promise<void> | void;
        focusReviewAICompanionTab?: (reviewSessionId: string) => boolean;
        hasReviewAICompanionTab?: (reviewSessionId: string) => boolean;
      })
    | undefined;
  getHybridSyncService?: () => { incrementalSync: () => Promise<void> } | undefined;
  getStorage?: () => {
    getSettings?: () => ReviewRuntimeSettingsLike;
    getCard?: (cardId: string) => { id: string; blockId?: string } | undefined;
    getCardByBlockId?: (blockId: string) => FSRSCard | undefined;
  };
  getReviewService?: () => ReviewApplicationService | undefined;
  getProgressiveReadingService?: () => ReviewProgressiveReadingServiceLike | undefined;
  getSelectionExcerptService?: () => ReviewSelectionExcerptServiceLike | undefined;
  getTabApplicationService?: () => ReviewTabApplicationServiceLike | undefined;
  getSettingsService?: () => {
    getSettings?: () => ReviewRuntimeSettingsLike;
    updateSettings?: (settings: Partial<PluginSettings>) => Promise<void>;
  } | undefined;
  getSemanticActivationCommandClient?: () => Pick<SemanticActivationCommandClient, 'execute'> | null | undefined;
  getSemanticActivationBrowserReadClient?: () => Pick<SemanticActivationBrowserReadClient, 'readSidebar'> | null | undefined;
  getTransactionWebSocketService?: () => ReviewTransactionWebSocketServiceLike | undefined;
  getCardService?: () => CardApplicationService | undefined;
  getCardEditorService?: () => CardEditorApplicationService | undefined;
  getArenaKernelService?: () => {
    buildSrsRecommendation?: (
      card: FSRSCard,
      currentSchedulerType?: 'fsrs-v6' | 'a-factor-v2' | null,
      now?: number,
      options?: { ratingBasis?: number; schedulingContext?: QueueReviewSchedulingContext | null },
    ) => Promise<SrsArenaRecommendation | null>;
    recordSrsReview?: (input: { card: FSRSCard; rating: number; currentSchedulerType?: 'fsrs-v6' | 'a-factor-v2' | null; schedulingContext?: QueueReviewSchedulingContext | null }) => Promise<unknown>;
  } | undefined;
  getSchedulerRouter?: () => {
    getSchedulerType?: (card: FSRSCard) => 'fsrs-v6' | 'a-factor-v2';
  } | undefined;
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | null | undefined;
  readDomainSyncDiagnostics?: () => Promise<unknown>;
};

type ReviewRuntimeSettingsLike = Pick<Partial<PluginSettings>,
  'ai' | 'progressiveReading' | 'quickCard' | 'riffIntegration' | 'ui' | 'queues'
>;

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

type FilterGroupQueueLike = ReviewFilterGroupQueueLike & {
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

type QueueStrategyWithLearnAhead = {
  learnAhead?: () => Promise<boolean>;
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

type SemanticTemporaryReviewView = {
  nodeId: string;
  blockId: string;
  title: string;
  card: FSRSCard | null;
  uiState: ReviewUIState | null;
  showAnswer: boolean;
  status: 'block' | 'card' | 'scoring' | 'error';
  error?: string;
};

type QueueWithSemanticTemporaryReview = {
  onFeedback?: (currentItem: FSRSCard | null, feedback: { action: 'rate'; rating: number }) => Promise<void> | void;
  suppressReviewedCardForCurrentSession?: (card: FSRSCard) => boolean;
};

type DismissedReviewCardPayload = {
  cardId?: string;
  blockId?: string;
  dismissed?: boolean;
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
  transferState?: ReviewTabTransferState;
  initialCurrentItem?: FSRSCard | null;
  initialCurrentCardId?: string;
  initialShowAnswer?: boolean;
  initialSemanticPinnedSessionId?: string | null;
  onTabRuntimeStateChange?: (state: ReviewTabRuntimeState | null) => void;
  onNeuralRoamEngineModeTouched?: () => void;
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
const reviewSemanticInitialPinnedSessionId = String(props.initialSemanticPinnedSessionId || '').trim();
const reviewSemanticSidebarOpen = ref(Boolean(reviewSemanticInitialPinnedSessionId));
const reviewSemanticPinnedSessionId = ref<string | null>(reviewSemanticInitialPinnedSessionId || null);
const reviewSemanticTemporaryView = ref<SemanticTemporaryReviewView | null>(null);
const activeReviewSideAreaTab = ref<'ai' | 'semantic'>('ai');
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);

const rootRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<ReviewContentExpose | null>(null);
const recentModifiedHotkeys = new Map<string, number>();
const editorState = ref<ReviewEditorState>(createReviewEditorState());
const renderEpoch = ref(0);
let reviewResizeHandler: (() => void) | null = null;
let removeReviewGlobalEventBindings: (() => void) | null = null;
let initialFullscreenTimer: number | null = null;
let initialTabSurfaceRefreshTimer: number | null = null;
let escRepeatLatch = false;

const duplicateReviewKeyGuard = createReviewDuplicateKeyGuard({ logger });
function getReviewSourceDependencyBlockIds(): string[] {
  const dependencyBlockIds = contentRef.value?.getDependencyBlockIds?.() || [];
  const currentCard = state.value.content.card;
  const fallbackDependencyBlockIds = [
    state.value.content.id,
    state.value.content.answerBlockID,
    currentCard?.blockId,
  ];
  const normalized = new Set<string>();
  for (const value of [...dependencyBlockIds, ...fallbackDependencyBlockIds]) {
    const blockId = String(value || '').trim();
    if (blockId.length > 0) {
      normalized.add(blockId);
    }
  }
  return Array.from(normalized);
}

const reviewSourceRefreshRuntime = createReviewSourceRefreshRuntime({
  isEnabled: isReviewSourceBlockRefreshEnabled,
  isAdvancePending: isReviewAdvancePending,
  getCurrentReference: getCurrentReviewCardReference,
  getDependencyBlockIds: getReviewSourceDependencyBlockIds,
  isMainProtyleEditing() {
    const currentEditorState = editorState.value;
    return currentEditorState.renderer === 'main-protyle'
      && currentEditorState.supportsNativeEdit === true
      && currentEditorState.isEditing === true;
  },
  refreshVisibleContent(reason) {
    return contentRef.value?.refreshVisibleContent?.(reason) ?? false;
  },
  logger,
});
const reviewArenaRuntime = createReviewArenaRuntime({
  t,
  i18n: props.i18n || {},
  logger,
  showMessage: notifyReviewMessage,
  createDialog: createVueDialog,
  getCurrentCard: () => state.value.content.card as FSRSCard | null,
  getArenaKernelService,
  getReviewService,
  getSchedulerTypeForCard,
  resolveSchedulingContext: resolveCurrentReviewSchedulingContext,
});
const reviewArenaHint = reviewArenaRuntime.hint;
const reviewTextEditorRuntime = createReviewCurrentContentEditorRuntime({
  t,
  showMessage,
  logger,
  getReviewService,
  resolveEditableSource: () => resolveCurrentEditableSource(),
  suppressSourceBlockRefresh: (blockId) => reviewSourceRefreshRuntime.suppressBlock(blockId),
  refreshVisibleContent: (reason) => contentRef.value?.refreshVisibleContent?.(reason),
});
const reviewTextEditorOpen = reviewTextEditorRuntime.open;
const reviewTextEditorValue = reviewTextEditorRuntime.value;
const reviewTextEditorTitle = reviewTextEditorRuntime.title;
const reviewTextEditorReadonly = reviewTextEditorRuntime.readonly;
const reviewTextEditorConfirmDisabled = reviewTextEditorRuntime.confirmDisabled;
const reviewTextEditorHint = reviewTextEditorRuntime.hint;
const reviewCardActionRuntime = createReviewCardActionRuntime({
  t,
  showMessage,
  logger,
  createDialog: createVueDialog,
  confirmDialog,
  getCurrentCard: () => state.value.content.card as FSRSCard | null | undefined,
  getCurrentCardMeta: () => state.value.actions.cardMeta,
  getCurrentReviewCardId: resolveCurrentReviewCardId,
  getCurrentReviewBlockId: resolveCurrentReviewBlockId,
  getCardEditorService,
  getCardService,
  buildExpectedRefreshOptions,
  refreshCurrentItem: (card, options) => hook.refreshCurrentItem(card, options),
  advanceDismissedCurrentCard,
  advanceCurrentReviewCardByReference,
  removeCardIdsFromActiveQueue,
});
const reviewNativeSplitRuntime = createReviewNativeSplitRuntime({
  rootRef,
  editorState,
  mode: () => props.mode,
  reviewSessionId: () => reviewSessionId.value,
  resolveGuardState: () => contentRef.value?.getNativeSplitGuardState?.() || null,
  t,
  showMessage,
  logger,
});

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

function getNeuralRoamEntryActionService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getNeuralRoamEntryActionService?.() || contextFromWindow?.getNeuralRoamEntryActionService?.() || null;
}

function getArenaKernelService() {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getArenaKernelService?.() || contextFromWindow?.getArenaKernelService?.() || null;
}

function getSchedulerTypeForCard(card: FSRSCard | null | undefined): 'fsrs-v6' | 'a-factor-v2' | null {
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
  return raw === 'a-factor-v2' ? raw : 'fsrs-v6';
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

function withCurrentSessionTransferState(transferState: ReviewTabTransferState): ReviewTabTransferState {
  const session = getInitialReviewSessionState();
  if (transferState.kind === 'static-subset-session') {
    return {
      ...transferState,
      blockIds: [...transferState.blockIds],
      cardIds: transferState.cardIds ? [...transferState.cardIds] : undefined,
      session,
    };
  }

  return {
    ...transferState,
    session,
  };
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
  if (props.transferState) {
    return withCurrentSessionTransferState(props.transferState);
  }

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
}): ReviewTabOpenOptions {
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
  if (!resolveCurrentMainReviewQueueType({ activeQueueType: queueType })) {
    return null;
  }

  const expectedHeaderVariant = resolveReviewPresentationHeaderVariant(queueType);
  const activeHeaderVariant = props.headerVariant ?? resolveReviewPresentationHeaderVariant(queueType);
  if (activeHeaderVariant !== expectedHeaderVariant) {
    return null;
  }

  return {
    queueType,
    headerVariant: expectedHeaderVariant,
  };
}

function resolveCurrentMainQueueSwitchType(): QueueType | null {
  return resolveCurrentMainQueueSwitchTypeCommand({
    headerVariant: props.headerVariant,
    activeQueueType: activeReviewQueueType.value,
  });
}

function switchToStandardReviewQueue(queueType: QueueType): void {
  switchToStandardReviewQueueCommand({
    queueType,
    currentQueueType: resolveCurrentMainQueueSwitchType(),
    mode: props.mode,
    dialogManager: getDialogManager(),
    tabManager: getTabManager(),
    t,
    showMessage,
  });
}

function openQueueSwitchMenuAtAnchor(anchor: HTMLElement, event?: MouseEvent | null): void {
  openQueueSwitchMenuAtAnchorCommand({
    anchor,
    event,
    currentQueueType: resolveCurrentMainQueueSwitchType(),
    presets: buildStandardReviewQueueSwitchPresets(t),
    switchQueue: switchToStandardReviewQueue,
  });
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

function getReviewProgressiveContexts(): Array<ReviewPluginContextLike | undefined> {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return [contextFromProps, contextFromWindow];
}

function openNeuralBrowserSubview(subview: ReviewNeuralBrowserSubview): void {
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

  removeReviewGlobalEventBindings = bindReviewGlobalEvents([
    { target: document, type: 'keydown', listener: handleKeyDown as EventListener, options: true },
    { target: document, type: 'keyup', listener: handleKeyUp as EventListener, options: true },
    { target: document, type: 'contextmenu', listener: handleNativeSplitTabContextMenu as EventListener, options: true },
    { target: window, type: PROGRESSIVE_EXCERPT_REQUEST_EVENT, listener: handleProgressiveExcerptCommandRequest as EventListener },
    { target: window, type: REVIEW_SET_PRIORITY_REQUEST_EVENT, listener: handleReviewSetPriorityCommandRequest as EventListener },
    { target: window, type: REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, listener: handleReviewSuspendCurrentCardCommandRequest as EventListener },
    { target: window, type: REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT, listener: handleReviewDeleteCurrentCardCommandRequest as EventListener },
    { target: window, type: REVIEW_LOCATE_CURRENT_SOURCE_REQUEST_EVENT, listener: handleReviewLocateCurrentSourceCommandRequest as EventListener },
    { target: window, type: KERNEL_TRANSACTION_WRITER_UNAVAILABLE_EVENT, listener: handleKernelTransactionWriterUnavailable as EventListener },
  ]);
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

onUnmounted(() => {
  removeReviewGlobalEventBindings?.();
  removeReviewGlobalEventBindings = null;
  reviewTitlebarQueueSwitchRuntime.clear();
  recentModifiedHotkeys.clear();
  duplicateReviewKeyGuard.reset();
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
  reviewArenaRuntime.destroyConflictDialog();
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

async function handleReviewArenaFeedback(payload: { cardId: string; rating: number; item: ActiveReviewItem | null }): Promise<void> {
  await reviewArenaRuntime.handleFeedback(payload);
}

async function ensureReviewDomainSyncSafeForAction(input: {
  action: ReviewSessionRetryAction;
  item: ActiveReviewItem | null;
}): Promise<void> {
  const context = getPluginContext(props.plugin);
  if (typeof context?.readDomainSyncDiagnostics !== 'function') {
    throw new Error('DOMAIN_SYNC_DIAGNOSTICS_UNAVAILABLE: Review feedback requires domain sync diagnostics');
  }

  let blockedDecisionMessage: string | null = null;
  try {
    const status = await context.readDomainSyncDiagnostics();
    const decision = buildReviewDomainSyncSafetyDecision(status as never);
    if (decision.canOpenReview) {
      return;
    }
    blockedDecisionMessage = decision.message;
    await openManualSyncConflictResolutionDialog(context as never, {
      initialDomainStatus: status as never,
      reviewBlockDecision: decision,
      onDiagnosticsSafe: async () => {
        await reviewSessionController.reload();
      },
    });
    throw new Error(decision.message);
  } catch (error) {
    if (blockedDecisionMessage) {
      throw new Error(blockedDecisionMessage);
    }
    const decision = buildReviewDomainSyncSafetyDecision(null, error);
    await openManualSyncConflictResolutionDialog(context as never, {
      reviewBlockDecision: decision,
      diagnosticsUnavailableReason: decision.message,
    });
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    logger.info('[ReviewView] Domain sync safety checked before Review action', {
      action: input.action.type,
      cardId: input.item?.id || input.item?.cardID || null,
    });
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
      ensureActionSafe: ensureReviewDomainSyncSafeForAction as never,
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
    ensureActionSafe: ensureReviewDomainSyncSafeForAction as never,
    controller: reviewSessionController as never,
    surfaceId: reviewSessionId.value,
  }
);
const state = hook.state;
const app = props.app;
const reviewWriterUnavailableNotice = ref<ReviewWriterUnavailableRecoveryNotice | null>(null);
const lastReviewWriterRecoveryAction = ref<ReviewSessionRetryAction | null>(null);
const kernelTransactionWriterActionTracker = createReviewKernelTransactionWriterActionTracker(
  reviewSessionId.value,
  30_000,
);
const reviewFilterRuntime = createReviewFilterRuntime({
  t,
  showMessage,
  logger,
  getFilterGroupQueue,
  reload: () => hook.reload(),
});
const showReviewFilterDialog = reviewFilterRuntime.dialogOpen;
const appliedReviewFilter = reviewFilterRuntime.appliedFilter;
const neuralNavigationState = ref<NeuralNavigationState | null>(null);
let subscribedReviewTransactionService: ReviewTransactionWebSocketServiceLike | null = null;
let reviewSourceRefreshSubscribed = false;
const reviewSourceRefreshCoordinator = getSharedReviewSourceRefreshCoordinator();
const reviewSourceRefreshSurfaceId = `review-source:${reviewSessionId.value}`;

function getReviewSourceRefreshDependencySignature(): string {
  const currentCard = state.value.content.card as FSRSCard | null;
  return [
    currentCard?.id,
    state.value.content.id,
    state.value.content.answerBlockID,
    currentCard?.blockId,
  ]
    .map((value) => String(value || '').trim())
    .join('\u0001');
}

watch(
  getReviewSourceRefreshDependencySignature,
  () => {
    reviewSourceRefreshRuntime.clearPending();
    if (reviewSourceRefreshSubscribed) {
      reviewSourceRefreshCoordinator.refreshSubscription(reviewSourceRefreshSurfaceId);
    }
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
const reviewDataObserverRuntime = createReviewDataObserverRuntime({
  logger,
  getManager: getUnifiedDataSourceManager,
  getFilterGroupQueue,
  getQueueStrategyWithTailAppend,
  getActiveQueueStrategy,
  getCurrentReference: getCurrentReviewCardReference,
  getCurrentCard: () => state.value.content.card as FSRSCard | null | undefined,
  getSession: () => hook.context.value.session,
  setAppliedFilter: (filter) => {
    appliedReviewFilter.value = filter;
  },
  setShowAnswer: (showAnswer) => {
    hook.context.value.showAnswer = showAnswer;
  },
  isAdvancePending: isReviewAdvancePending,
  buildExpectedRefreshOptions,
  refreshCurrentItem: (item, options) => hook.refreshCurrentItem(item as never, options),
  refreshCurrentReviewCard,
  advanceCurrentReviewCardByReference,
  removeCardIdsFromActiveQueue,
});

const REVIEW_AI_SIDECAR_MIN_VIEWPORT = 1040;
const SEMANTIC_ACTIVATION_USER_ENTRY_ENABLED = false;

const canUseEmbeddedReviewAISidecar = computed(() => (
  props.mode === 'dialog' && props.isMobile !== true && viewportWidth.value >= REVIEW_AI_SIDECAR_MIN_VIEWPORT
));

const canUseReviewSideArea = computed(() => (
  props.isMobile !== true && viewportWidth.value >= REVIEW_AI_SIDECAR_MIN_VIEWPORT
));

const showReviewAISidecar = computed(() => (
  canUseEmbeddedReviewAISidecar.value && reviewAISidebarOpen.value && reviewAIService.value !== null
));

const showReviewSemanticSidePanel = computed(() => (
  SEMANTIC_ACTIVATION_USER_ENTRY_ENABLED
  && canUseReviewSideArea.value
  && reviewSemanticSidebarOpen.value
));

const showReviewSideArea = computed(() => (
  showReviewAISidecar.value || showReviewSemanticSidePanel.value
));

const semanticActivationReadClient = computed(() => (
  getPluginContext(props.plugin)?.getSemanticActivationBrowserReadClient?.() ?? null
));

const semanticActivationCommandClient = computed(() => (
  getPluginContext(props.plugin)?.getSemanticActivationCommandClient?.() ?? null
));

const reviewSemanticCurrentNodeId = computed(() => resolveCurrentReviewBlockId() || null);

const displayedReviewContent = computed<ReviewUIState['content']>(() => {
  const temporary = reviewSemanticTemporaryView.value;
  if (!temporary) {
    return state.value.content;
  }
  if (temporary.uiState) {
    return temporary.uiState.content;
  }
  return {
    type: 'protyle',
    data: temporary.blockId,
    id: temporary.blockId,
  };
});

const displayedReviewHeader = computed<ReviewUIState['header']>(() => {
  const header = state.value.header;
  const toolbar = Array.isArray(header.toolbar) ? header.toolbar : [];
  if (
    state.value.content.type === 'empty'
    || !resolveCurrentReviewBlockId()
    || !getNeuralRoamEntryActionService()
    || toolbar.some((button) => button.type === 'neural-roam-entry')
  ) {
    return header;
  }

  return {
    ...header,
    toolbar: [
      ...toolbar.slice(0, 1),
      {
        icon: '#iconGraph',
        type: 'neural-roam-entry',
        ariaLabel: t('neuralRoam', '神经漫游'),
        tooltip: t('neuralRoam', '神经漫游'),
      },
      ...toolbar.slice(1),
    ],
  };
});

const displayedReviewActions = computed<ReviewUIState['actions']>(() => {
  const temporary = reviewSemanticTemporaryView.value;
  if (!temporary?.uiState) {
    return state.value.actions;
  }
  return {
    ...temporary.uiState.actions,
    showAnswer: !temporary.showAnswer,
    menu: [],
  };
});

const displayedReviewMeta = computed<ReviewUIState['meta']>(() => {
  const temporary = reviewSemanticTemporaryView.value;
  if (!temporary?.uiState) {
    return state.value.meta;
  }
  return {
    ...temporary.uiState.meta,
    canBack: true,
    advancePending: temporary.status === 'scoring'
      ? { active: true, reason: 'grade', startedAt: Date.now() }
      : temporary.uiState.meta.advancePending,
  };
});

const isEmptyReviewContent = computed(() => state.value.content.type === 'empty');

const showReviewActions = computed(() => (
  !isEmptyReviewContent.value
  && (
    !reviewSemanticTemporaryView.value
    || (reviewSemanticTemporaryView.value.card !== null && reviewSemanticTemporaryView.value.uiState !== null)
  )
));

const showCompletedEmptyStateExit = computed(() => (
  isEmptyReviewContent.value
  && state.value.meta.emptyStateMode === 'completed'
));

const showLearnAheadAction = computed(() => (
  isEmptyReviewContent.value
  && state.value.meta.emptyStateMode === 'completed'
  && typeof (props.queue as QueueStrategyWithLearnAhead | null | undefined)?.learnAhead === 'function'
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
  const notice = resolveReviewWriterUnavailableRecovery({
    reason: payload.reason,
    error: payload.error,
    t,
  });
  if (notice.kind !== 'generic-error') {
    reviewWriterUnavailableNotice.value = notice;
    lastReviewWriterRecoveryAction.value = payload.action ?? null;
    notifyReviewMessage(`${notice.title}: ${notice.message}`, 5000, 'warning');
    return;
  }

  showMessage(getReviewActionErrorMessage(payload), 5000, 'error');
}

function handleKernelTransactionWriterUnavailable(event: Event): void {
  const detail = readKernelTransactionWriterUnavailableDetail(event);
  const action = resolveReviewActionForKernelTransactionWriterUnavailable({
    detail,
    currentSessionId: reviewSessionId.value,
    recentAction: kernelTransactionWriterActionTracker.getRecentAction(),
  });
  if (!action) {
    return;
  }
  const notice = resolveReviewWriterUnavailableRecovery({
    reason: action.type,
    error: new Error(detail?.message || 'BACKEND_UNAVAILABLE: writer relay timeout'),
    t,
  });
  if (notice.kind === 'generic-error') {
    return;
  }
  reviewWriterUnavailableNotice.value = notice;
  lastReviewWriterRecoveryAction.value = action;
  notifyReviewMessage(`${notice.title}: ${notice.message}`, 5000, 'warning');
}

function dismissReviewWriterRecoveryNotice(): void {
  reviewWriterUnavailableNotice.value = null;
}

async function retryReviewWriterRecoveryAction(): Promise<void> {
  const action = lastReviewWriterRecoveryAction.value;
  if (!action) {
    return;
  }
  reviewWriterUnavailableNotice.value = null;
  if (action.type === 'grade') {
    await hook.grade(action.rating);
    return;
  }
  if (action.type === 'skip') {
    await hook.skip();
    return;
  }
  await hook.executeCommand(action.commandId);
}

async function reloadReviewWriterRecoverySurface(): Promise<void> {
  reviewWriterUnavailableNotice.value = null;
  await hook.reload();
}

async function prepareReviewStateBeforeCommit(
  nextState: ReviewUIState,
  reason: ReviewSessionUpdateReason,
): Promise<ReviewUIState> {
  try {
    const services = reviewRenderServices.value;
    if (!services) {
      return nextState;
    }
    return await prepareReviewPresentation(nextState, services);
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

async function handleConceptRoam(focusBlockId: string): Promise<void> {
  const normalizedFocusBlockId = String(focusBlockId || '').trim();
  if (!normalizedFocusBlockId) {
    return;
  }

  if (resolveCurrentNeuralRoamUserMode() === 'semantic-activation') {
    await startSemanticActivationEntry({ focusBlockId: normalizedFocusBlockId });
    return;
  }

  const entryActionService = getNeuralRoamEntryActionService();
  if (typeof entryActionService?.startTemporaryConceptRoam !== 'function') {
    showMessage(t('reviewConceptRoamFailed', '无法从当前概念开始漫游'), 3000, 'error');
    return;
  }

  try {
    const result = await entryActionService.startTemporaryConceptRoam({
      conceptBlockId: normalizedFocusBlockId,
    });
    if (!result.ok) {
      showMessage(result.message || t('reviewConceptRoamFailed', '无法从当前概念开始漫游'), 3000, 'error');
    }
  } catch (error) {
    logger.error('[ReviewView] Failed to start concept roam from Review content', {
      focusBlockId: normalizedFocusBlockId,
      error,
    });
    showMessage(t('reviewConceptRoamFailed', '无法从当前概念开始漫游'), 3000, 'error');
  }
}

function getCurrentReviewCardReference(): { cardId: string; blockId: string } {
  return reviewCardActionRuntime.getCurrentReviewCardReference();
}

function buildExpectedRefreshOptions(reference: { cardId?: string; blockId?: string } | null | undefined): RefreshCurrentItemOptions {
  return {
    expectedCurrentCardId: String(reference?.cardId || '').trim(),
    expectedCurrentBlockId: String(reference?.blockId || '').trim(),
  };
}

function hasCurrentReviewCard(): boolean {
  return reviewCardActionRuntime.hasCurrentReviewCard();
}

function resolveCurrentReviewCardActionReference(): { cardId: string; blockId: string } | null {
  return reviewCardActionRuntime.resolveCurrentReviewCardActionReference();
}

function resolveCurrentReviewCardPriority(): number | null {
  return reviewCardActionRuntime.resolveCurrentReviewCardPriority();
}

function resolveCurrentReviewCardDismissed(): boolean {
  return reviewCardActionRuntime.resolveCurrentReviewCardDismissed();
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
  return reviewCardActionRuntime.resolveCurrentBlockPeerCards();
}

function filterOutCurrentCardId(cardIds: string[], currentCardId: string): string[] {
  return reviewCardActionRuntime.filterOutCurrentCardId(cardIds, currentCardId);
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
  const manager = reviewDataObserverRuntime.getSubscribedManager();
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

  const manager = reviewDataObserverRuntime.getSubscribedManager() || getUnifiedDataSourceManager();
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

function isReviewAdvancePending(): boolean {
  return state.value.meta.advancePending?.active === true;
}

function bindReviewDataObserver(): void {
  reviewDataObserverRuntime.bind();
}

function bindReviewTransactionService(): void {
  if (!isReviewSourceBlockRefreshEnabled()) {
    unbindReviewTransactionService();
    return;
  }

  const transactionService = getReviewTransactionWebSocketService();
  if (!reviewSourceRefreshSubscribed) {
    reviewSourceRefreshCoordinator.subscribe({
      surfaceId: reviewSourceRefreshSurfaceId,
      getDependencyBlockIds: getReviewSourceDependencyBlockIds,
      queue: (blockIds) => reviewSourceRefreshRuntime.queue(blockIds),
    });
    reviewSourceRefreshSubscribed = true;
  } else {
    reviewSourceRefreshCoordinator.refreshSubscription(reviewSourceRefreshSurfaceId);
  }

  if (transactionService === subscribedReviewTransactionService) {
    reviewSourceRefreshCoordinator.bindTransactionService(transactionService);
    return;
  }

  subscribedReviewTransactionService = transactionService;
  reviewSourceRefreshCoordinator.bindTransactionService(transactionService);
}

function unbindReviewDataObserver(): void {
  reviewDataObserverRuntime.unbind();
}

function unbindReviewTransactionService(): void {
  reviewSourceRefreshRuntime.clear();
  if (reviewSourceRefreshSubscribed) {
    reviewSourceRefreshCoordinator.unsubscribe(reviewSourceRefreshSurfaceId);
    reviewSourceRefreshSubscribed = false;
  }

  subscribedReviewTransactionService = null;
}

const clearNativeSplitMenuPruneTimer = reviewNativeSplitRuntime.clearMenuPruneTimer;
const handleNativeSplitTabContextMenu = reviewNativeSplitRuntime.handleTabContextMenu;
const isInsideReviewRoot = reviewNativeSplitRuntime.isInsideReviewRoot;
const isActiveReviewSurface = reviewNativeSplitRuntime.isActiveReviewSurface;
const maybeHandleBlockedNativeTabSplitHotkey = reviewNativeSplitRuntime.maybeHandleBlockedHotkey;
const isReviewKeyboardContext = reviewNativeSplitRuntime.isReviewKeyboardContext;
const isTypingTarget = reviewNativeSplitRuntime.isTypingTarget;
const isCurrentReviewNativeProtyleSurface = reviewNativeSplitRuntime.isCurrentNativeProtyleSurface;
const hasProgressiveExcerptRequestContext = reviewNativeSplitRuntime.hasProgressiveExcerptRequestContext;

function handleEditorStateChange(nextState: ReviewEditorState): void {
  editorState.value = nextState;
  if (nextState.renderer !== 'main-protyle') {
    escRepeatLatch = false;
  }
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

function handleReviewLocateCurrentSourceCommandRequest(event: Event): void {
  handleReviewCommandRequest(event, async () => {
    const blockId = resolveCurrentReviewSourceBlockId();
    if (!props.app || !blockId) {
      showMessage(t('reviewLocateNoCurrentCard', '当前没有可定位的复习卡片'), 3000, 'info');
      return;
    }

    try {
      await openReviewBlockAtSource({
        app: props.app,
        blockId,
      });
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewView] Failed to locate current review source block:', {
        blockId,
        error,
      });
      showMessage(t('reviewLocateSourceFailed', '定位当前复习卡原块失败'), 3000, 'error');
    }
  });
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

  if (duplicateReviewKeyGuard.shouldIgnore(key)) {
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
  const temporary = reviewSemanticTemporaryView.value;
  if (temporary?.card) {
    reviewSemanticTemporaryView.value = {
      ...temporary,
      showAnswer: true,
    };
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  hook.reveal();
}

async function gradeSemanticTemporaryReview(rating: number): Promise<void> {
  const temporary = reviewSemanticTemporaryView.value;
  if (!temporary?.card) {
    return;
  }

  const normalizedRating = Math.max(1, Math.min(4, Math.floor(rating)));
  reviewSemanticTemporaryView.value = {
    ...temporary,
    status: 'scoring',
    error: undefined,
  };

  try {
    const queue = props.queue as QueueWithSemanticTemporaryReview | null | undefined;
    if (typeof queue?.onFeedback !== 'function') {
      throw new Error('SEMANTIC_TEMPORARY_REVIEW_UNAVAILABLE: review queue cannot score temporary card');
    }
    await queue.onFeedback(temporary.card, { action: 'rate', rating: normalizedRating });
    queue.suppressReviewedCardForCurrentSession?.(temporary.card);
    clearSemanticTemporaryView();
  } catch (error) {
    reviewSemanticTemporaryView.value = {
      ...temporary,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    showMessage(
      `${t('semanticTemporaryReviewFailed', 'Temporary Semantic review failed')}: ${reviewSemanticTemporaryView.value.error}`,
      5000,
      'error',
    );
  }
}

function handleGrade(rating: number): void {
  if (reviewSemanticTemporaryView.value?.card) {
    void gradeSemanticTemporaryReview(rating);
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  kernelTransactionWriterActionTracker.record({
    type: 'grade',
    rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4,
  });
  void hook.grade(rating);
}

function handleSkip(): void {
  if (reviewSemanticTemporaryView.value) {
    clearSemanticTemporaryView();
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  kernelTransactionWriterActionTracker.record({ type: 'skip' });
  void hook.skip();
}

function handleBack(): void {
  if (reviewSemanticTemporaryView.value) {
    clearSemanticTemporaryView();
    return;
  }
  clearSemanticTemporaryView();
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

const syncReviewFilterFromQueue = reviewFilterRuntime.syncFromQueue;
const handleApplyReviewFilter = reviewFilterRuntime.handleApply;
const handleClearReviewFilter = reviewFilterRuntime.handleClear;
const handleRebuildReviewFilterQueue = reviewFilterRuntime.handleRebuild;

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
  if (showReviewSideArea.value) {
    dialogContainer.style.width = 'min(1320px, 98vw)';
    dialogContainer.style.maxWidth = '1320px';
  } else {
    dialogContainer.style.width = 'min(860px, 96vw)';
    dialogContainer.style.maxWidth = '1024px';
  }
}

function closeReviewAISidebar(): void {
  reviewAISidebarOpen.value = false;
  if (activeReviewSideAreaTab.value === 'ai' && showReviewSemanticSidePanel.value) {
    activeReviewSideAreaTab.value = 'semantic';
  }
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
      activeReviewSideAreaTab.value = 'ai';
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

const reviewTitlebarQueueSwitchRuntime = createReviewTitlebarQueueSwitchRuntime({
  isEnabled: () => usesNativeDialogTitlebarQueueSwitch.value,
  getDialogContainer: getReviewDialogContainer,
  getTitle: () => resolvedReviewSurfaceTitle.value,
  getAriaLabel: (title) => t('switchReviewQueueAriaLabel', '切换复习队列：{title}').replace('{title}', title),
  onTriggerPointerDown: handleQueueSwitchTriggerPointerDown,
  onTriggerClick: handleQueueSwitchTrigger,
});

function scheduleReviewDialogTitlebarQueueSwitchSync(): void {
  reviewTitlebarQueueSwitchRuntime.scheduleSync();
}

function getReviewContentMain(): HTMLElement | null {
  return (rootRef.value?.querySelector('.fsrs-review-v2-content')
    || document.querySelector('.fsrs-review-v2-content')) as HTMLElement | null;
}

function isReviewFullscreenActive(): boolean {
  return isReviewFullscreenActiveCommand({
    getDialogContainer: getReviewDialogContainer,
    getContentMain: getReviewContentMain,
  });
}

function applyInitialReviewFullscreen(): void {
  if (!shouldApplyInitialReviewFullscreen({
    startFullscreen: props.startFullscreen,
    mode: props.mode,
    isMobile: props.isMobile,
    fullscreenActive: isReviewFullscreenActive(),
  })) {
    return;
  }
  toggleReviewFullscreen();
}

function toggleReviewFullscreen(): void {
  toggleReviewFullscreenCommand({
    mode: props.mode,
    isMobile: props.isMobile,
    getDialogContainer: getReviewDialogContainer,
    getContentMain: getReviewContentMain,
    getProtyleFromHost,
    logger,
  });
}

const handleEditCurrentCardPriority = reviewCardActionRuntime.handleEditCurrentCardPriority;
const handleDismissCurrentCard = reviewCardActionRuntime.handleDismissCurrentCard;
const handleDismissPeerCards = reviewCardActionRuntime.handleDismissPeerCards;
const handleDeleteCurrentCard = reviewCardActionRuntime.handleDeleteCurrentCard;
const handleDeletePeerCards = reviewCardActionRuntime.handleDeletePeerCards;

function resolveCurrentEditableSource(): ReviewEditableSource | null {
  return contentRef.value?.getEditableSource?.() || null;
}

const closeCurrentContentEditor = reviewTextEditorRuntime.close;
const openCurrentContentEditor = reviewTextEditorRuntime.openEditor;
const confirmCurrentContentEditor = reviewTextEditorRuntime.confirm;

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
    progressiveExcerptEnabled: isReviewProgressiveExcerptEnabled({
      contexts: getReviewProgressiveContexts(),
      logger,
    }),
    hasProgressiveSourceTarget: Boolean(resolveProgressiveSourceTargetId(currentCard)),
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

function addReviewMenuItems(menu: Menu, items: ReviewMenuItem[]): void {
  for (const item of items) {
    if (isReviewMenuSeparator(item)) {
      menu.addSeparator();
      continue;
    }
    menu.addItem(item);
  }
}

function handleOpenMoreMenu(ev: MouseEvent): void {
  const menu = new Menu('review-more-menu');
  addReviewMenuItems(menu, buildMoreMenuItems());
  openMenuAtEvent(menu, ev);
}

let semanticActivationController: SemanticActivationSessionController | null = null;

function getSemanticActivationController(): SemanticActivationSessionController | null {
  if (semanticActivationController) {
    return semanticActivationController;
  }
  const commandClient = getPluginContext(props.plugin)?.getSemanticActivationCommandClient?.() ?? null;
  if (!commandClient) {
    return null;
  }
  semanticActivationController = new SemanticActivationSessionController({
    commandClient,
  });
  return semanticActivationController;
}

function resolveCurrentNeuralRoamUserMode(): NeuralRoamUserMode {
  if (state.value.overlay?.component === 'SemanticActivationSurface') {
    return 'semantic-activation';
  }
  const settings = getPluginContext(props.plugin)?.getSettingsService?.()?.getSettings?.();
  const preferred = getPreferredNeuralRoamUserMode(settings as Pick<PluginSettings, 'queues'> | null | undefined);
  if (preferred !== 'orbit') {
    return preferred;
  }
  return getNeuralRoamQueue()?.getEngineMode?.() ?? preferred;
}

async function persistPreferredNeuralRoamMode(mode: NeuralRoamUserMode): Promise<void> {
  const settingsService = getPluginContext(props.plugin)?.getSettingsService?.();
  const current = settingsService?.getSettings?.();
  const next = setPreferredNeuralRoamUserMode({
    queues: {
      ...(current?.queues ?? {}),
    },
  } as Pick<PluginSettings, 'queues'>, mode);
  await settingsService?.updateSettings?.({ queues: next.queues });
}

async function startSemanticActivationEntry(conceptFocusOverride?: { focusBlockId: string } | null): Promise<void> {
  const controller = getSemanticActivationController();
  if (!controller) {
    showMessage(t('semanticActivationStartUnavailable', 'Semantic Activation is unavailable.'), 3000, 'error');
    return;
  }

  const result = await startSemanticActivationFromReviewConcept({
    controller,
    content: state.value.content,
    conceptFocus: conceptFocusOverride ?? resolveReviewConceptRoamFocus(state.value.content),
    i18n,
    t,
    showMessage,
  });

  if (result.status !== 'started' || !result.entry) {
    return;
  }

  if (canUseEmbeddedReviewAISidecar.value) {
    reviewSemanticPinnedSessionId.value = result.entry.model.session.sessionId;
    reviewSemanticSidebarOpen.value = true;
    activeReviewSideAreaTab.value = 'semantic';
    updateReviewDialogContainerLayout();
    return;
  }

  state.value = {
    ...state.value,
    overlay: result.entry.overlay,
    actions: {
      ...state.value.actions,
      showAnswer: false,
      grades: result.entry.model.currentNode.canGrade ? state.value.actions.grades : [],
    },
  };
}

function handleSemanticEndedSessionReview(sessionId: string): void {
  reviewSemanticPinnedSessionId.value = sessionId;
}

async function focusSemanticSession(sessionId: string): Promise<boolean> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return false;
  }
  if (!semanticActivationReadClient.value || !semanticActivationCommandClient.value) {
    showMessage(t('semanticActivationStartUnavailable', 'Semantic Activation is unavailable.'), 3000, 'error');
    return false;
  }
  reviewSemanticPinnedSessionId.value = normalizedSessionId;
  reviewSemanticSidebarOpen.value = true;
  activeReviewSideAreaTab.value = 'semantic';
  updateReviewDialogContainerLayout();
  await nextTick();
  return showReviewSemanticSidePanel.value;
}

function handleSemanticEndedSessionContinue(): void {
  showMessage(t('semanticContinueFromHerePending', 'Continue from ended Semantic sessions is not wired yet.'), 3000, 'info');
}

async function handleSemanticAnalyzePath(payload: SemanticPathAnalysisPayload): Promise<void> {
  await openReviewAIAssistant(AI_GENERAL_CHAT_SKILL_ID);
  const service = reviewAIService.value || getReviewAIWorkbenchRegistry()?.getReviewSession?.(reviewSessionId.value) || null;
  if (!service) {
    showMessage(t('semanticAnalyzePathAIUnavailable', 'AI sidebar is unavailable for Semantic path analysis.'), 3000, 'error');
    return;
  }
  await service.submitFollowUp(buildSemanticPathAnalysisPrompt(payload), {
    attachedContexts: [buildSemanticPathAnalysisContext(payload)],
  });
  reviewAISidebarOpen.value = true;
  activeReviewSideAreaTab.value = 'ai';
  updateReviewDialogContainerLayout();
}

function findSemanticTemporaryCard(blockId: string): FSRSCard | null {
  const context = getPluginContext(props.plugin) || getWindowPlugin()?.getContext?.();
  const fromCardService = context?.getCardService?.()?.getCardByBlockId?.(blockId);
  if (fromCardService) {
    return fromCardService;
  }
  return context?.getStorage?.()?.getCardByBlockId?.(blockId) ?? null;
}

async function handleSemanticSidebarViewNode(nodeId: string, title?: string, sourceBlockId?: string): Promise<void> {
  const normalizedNodeId = String(nodeId || '').trim();
  if (!normalizedNodeId) {
    showMessage(t('semanticTemporaryViewPending', 'Temporary Semantic node view is not wired yet.'), 3000, 'info');
    return;
  }
  const normalizedBlockId = String(sourceBlockId || normalizedNodeId).trim() || normalizedNodeId;
  const temporaryTitle = String(title || normalizedNodeId).trim() || normalizedNodeId;
  const card = findSemanticTemporaryCard(normalizedBlockId);
  reviewSemanticTemporaryView.value = {
    nodeId: normalizedNodeId,
    blockId: normalizedBlockId,
    title: temporaryTitle,
    card,
    uiState: null,
    showAnswer: false,
    status: card ? 'card' : 'block',
  };

  if (!card) {
    return;
  }

  try {
    const uiState = await hook.renderItemPreview(card, {
      showAnswer: false,
      session: hook.context.value.session,
    });
    const current = reviewSemanticTemporaryView.value;
    if (!current || current.nodeId !== normalizedNodeId || current.blockId !== normalizedBlockId) {
      return;
    }
    reviewSemanticTemporaryView.value = {
      ...current,
      uiState,
    };
  } catch (error) {
    reviewSemanticTemporaryView.value = {
      nodeId: normalizedNodeId,
      blockId: normalizedBlockId,
      title: temporaryTitle,
      card,
      uiState: null,
      showAnswer: false,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    showMessage(
      `${t('semanticTemporaryViewFailed', 'Temporary Semantic card view failed')}: ${reviewSemanticTemporaryView.value.error}`,
      5000,
      'error',
    );
  }
}

function clearSemanticTemporaryView(): void {
  reviewSemanticTemporaryView.value = null;
}

function handleNeuralEngineModeMenu(ev: MouseEvent): void {
  const menu = new Menu('neural-engine-mode-menu');
  addReviewMenuItems(menu, buildReviewNeuralEngineModeMenuItems({
    t,
    currentMode: resolveCurrentNeuralRoamUserMode(),
    onSelect: async (mode) => {
      props.onNeuralRoamEngineModeTouched?.();
      await handleReviewNeuralEngineModeSelection({
        t,
        selectedMode: mode,
        neuralQueue: getNeuralRoamQueue(),
        currentBlockId: resolveCurrentReviewBlockId(),
        loadCardByBlockId: (blockId) => hook.loadCardByBlockId(blockId),
        refreshNavigationState,
        showMessage,
        logger,
        persistPreferredMode: persistPreferredNeuralRoamMode,
      });
    },
  }));
  openMenuAtEvent(menu, ev);
}

function notifyNeuralEntryResult(label: string, result: { ok: boolean; message?: string } | undefined): void {
  if (!result) {
    showMessage(t('neuralRoamEntryActionUnavailable', '神经漫游动作不可用'), 3000, 'error');
    return;
  }
  if (!result.ok) {
    showMessage(result.message || t('neuralRoamEntryActionFailed', '神经漫游动作失败'), 3000, 'error');
    return;
  }
  showMessage(t('neuralRoamEntryActionSucceeded', '{action}已完成').replace('{action}', label), 2500, 'info');
}

function handleNeuralRoamEntryMenu(ev: MouseEvent): void {
  const entryActionService = getNeuralRoamEntryActionService();
  const items = buildReviewNeuralEntryMenuItems({
    t,
    currentCard: state.value.content.card as FSRSCard | null | undefined,
    currentBlockId: resolveCurrentReviewBlockId(),
    currentCardId: resolveCurrentReviewCardId(),
    conceptTargets: resolveReviewConceptRoamTargets(state.value.content),
    entryActionService,
    runAction: (label, action) => {
      void (async () => {
        try {
          notifyNeuralEntryResult(label, await action());
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] NeuralRoam entry action failed:', { label, error });
          showMessage(t('neuralRoamEntryActionFailed', '神经漫游动作失败'), 3000, 'error');
        }
      })();
    },
  });

  if (items.length === 0) {
    showMessage(t('neuralRoamEntryUnavailable', '当前卡片不能启动神经漫游'), 3000, 'error');
    return;
  }

  const menu = new Menu('neural-roam-entry-menu');
  addReviewMenuItems(menu, items);
  openMenuAtEvent(menu, ev);
}

function handleToolbarAction(actionType: string, ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleToolbarAction called:', actionType);

  if (actionType === 'close-review') {
    emit('close');
    return;
  }

  if (actionType === 'plan-review-scope') {
    reviewFilterRuntime.openDialog();
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

  if (actionType === 'neural-roam-entry') {
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralRoamEntryMenu(ev);
    return;
  }

  if (actionType === 'fullscreen') {
    toggleReviewFullscreen();
  } else if (actionType === 'edit-srs') {
    openCurrentSrsEditor();
  } else if (actionType === 'sticktab') {
    // 打开为菜单
    handleOpenAsMenu(ev);
  } else if (isReviewNeuralMenuAction(actionType)) {
    ev.stopPropagation();
    ev.preventDefault();
    if (actionType === 'neural-focuses') {
      handleNeuralFocusMenu(ev);
    } else {
      handleNeuralHistoryMenu(ev);
    }
  } else if (actionType === 'neural-engine-mode') {
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralEngineModeMenu(ev);
  } else if (isReviewNeuralToolbarAction(actionType)) {
    void handleReviewNeuralToolbarAction(actionType, {
      t,
      neuralQueue: getNeuralRoamQueue(),
      currentBlockId: resolveCurrentReviewBlockId(),
      loadCardByBlockId: (blockId) => hook.loadCardByBlockId(blockId),
      refreshNavigationState,
      showMessage,
      logger,
    });
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
  return buildReviewOpenAsMenuItems({
    app: props.app,
    mode: props.mode,
    title: props.title,
    currentSourceBlockId: resolveCurrentReviewSourceBlockId(),
    tabManager: getTabManager(),
    dialogManager: getDialogManager(),
    standardDialogTarget: props.mode === 'tab' ? resolveStandardReviewDialogTarget() : null,
    t,
    buildReviewTabOpenOptions,
    buildReviewTabRuntimeState,
    getInitialReviewSessionState,
    getUnderlyingQueue,
    openManagedReviewSplit,
    closeCurrentReviewSurface,
    logger,
  });
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
  const context = getPluginContext(props.plugin);
  openReviewSrsEditorDialog({
    app: props.app,
    blockId,
    cardId,
    context,
    i18n: props.i18n || {},
    plugin: props.plugin,
    t,
    logger,
    createDialog: createVueDialog,
    resolveSchedulingContext: resolveCurrentReviewSchedulingContext,
    advanceScheduledCard: advanceScheduledCurrentCard,
    advanceDismissedCard: advanceDismissedCurrentCard,
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

function handleNeuralFocusMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    showMessage(t('queueNoFocusSupport', '当前队列不支持中心操作'), 3000, 'error');
    return;
  }

  const menu = new Menu('neural-focuses-menu');
  addReviewMenuItems(menu, buildReviewNeuralFocusMenuItems({
    t,
    neuralQueue,
    loadCardByBlockId: (blockId) => hook.loadCardByBlockId(blockId),
    refreshNavigationState,
    showMessage,
    logger,
    openNeuralBrowserSubview,
  }));

  openMenuAtEvent(menu, ev);
}

function handleNeuralHistoryMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    showMessage(t('noHistory', '当前队列没有历史能力'), 3000, 'info');
    return;
  }

  const menu = new Menu('neural-history-menu');
  addReviewMenuItems(menu, buildReviewNeuralHistoryMenuItems({
    t,
    neuralQueue,
    loadCardByBlockId: (blockId) => hook.loadCardByBlockId(blockId),
    refreshNavigationState,
    showMessage,
    logger,
    openNeuralBrowserSubview,
  }));

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

async function handleProgressiveExcerptFromReview(trigger: ReviewProgressiveExcerptTrigger): Promise<void> {
  await runReviewProgressiveExcerptCommand({
    trigger,
    contexts: getReviewProgressiveContexts(),
    currentCard: state.value.content.card,
    currentCardId: resolveCurrentReviewCardId(),
    root: rootRef.value,
    resolveSelection: resolveProgressiveExcerptSelectionSnapshot,
    resolveProtyle: (commonElement) => {
      const host = commonElement.closest('.fsrs-review-v2-content__protyle-host');
      return host ? getProtyleFromHost(host) : null;
    },
    filterQueue: getFilterGroupQueue(),
    queueStrategy: getQueueStrategyWithInsertAt(),
    setAppliedReviewFilter: (filter) => {
      appliedReviewFilter.value = { ...filter };
    },
    neuralQueue: getNeuralRoamQueue(),
    t,
    showMessage,
    logger,
  });
}

function handleProgressiveOpenSource(): void {
  handleProgressiveOpenSourceCommand({
    app: props.app,
    sourceTargetId: resolveProgressiveSourceTargetId(state.value.content.card),
    t,
    showMessage,
  });
}

async function handleProgressiveCompletePiece(): Promise<void> {
  await handleProgressiveCompletePieceCommand({
    service: getReviewProgressiveReadingService(getReviewProgressiveContexts()),
    pieceDocId: resolveCurrentReviewBlockId(),
    gradeGood: () => handleGrade(3),
    t,
    showMessage,
    logger,
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
  focusSemanticSession,
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
  showReviewSideArea,
  () => {
    updateReviewDialogContainerLayout();
  },
);

watch(
  [showReviewAISidecar, showReviewSemanticSidePanel],
  ([aiVisible, semanticVisible]) => {
    if (activeReviewSideAreaTab.value === 'ai' && !aiVisible && semanticVisible) {
      activeReviewSideAreaTab.value = 'semantic';
      return;
    }
    if (activeReviewSideAreaTab.value === 'semantic' && !semanticVisible && aiVisible) {
      activeReviewSideAreaTab.value = 'ai';
    }
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

.fsrs-review-v2__workspace--with-side-area {
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

.fsrs-review-v2__temporary-view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 16px 0;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1.5;
}

.fsrs-review-v2__temporary-view span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fsrs-review-v2__writer-recovery {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 16px 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-warning) 36%, var(--b3-border-color) 64%);
  border-radius: 8px;
  background: color-mix(in srgb, var(--b3-theme-warning-light) 26%, var(--b3-theme-background) 74%);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1.5;
}

.fsrs-review-v2__writer-recovery-main {
  min-width: 0;
}

.fsrs-review-v2__writer-recovery-title {
  font-weight: 600;
}

.fsrs-review-v2__writer-recovery-message,
.fsrs-review-v2__writer-recovery-detail {
  overflow-wrap: anywhere;
}

.fsrs-review-v2__writer-recovery-detail {
  margin-top: 2px;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-review-v2__writer-recovery-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.fsrs-review-v2--mobile .fsrs-review-v2__writer-recovery {
  flex-direction: column;
}

.fsrs-review-v2--mobile .fsrs-review-v2__writer-recovery-actions {
  width: 100%;
  flex-wrap: wrap;
}

.fsrs-review-v2__workspace--with-side-area .fsrs-review-v2__content-wrapper {
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

.fsrs-review-v2__side-area {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--b3-theme-background);
}

.fsrs-review-v2__side-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.fsrs-review-v2__side-tab {
  min-width: 52px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 26px;
  cursor: pointer;
}

.fsrs-review-v2__side-tab--active {
  border-color: var(--b3-border-color);
  background: var(--b3-theme-background);
  color: var(--b3-theme-primary);
  font-weight: 600;
}

.fsrs-review-v2__side-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.fsrs-review-v2__side-panel--semantic {
  overflow: auto;
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

