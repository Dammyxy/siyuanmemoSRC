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
        <NeuralRoamJourneyHeader
          v-if="showNeuralRoamJourneyHeader"
          :header="displayedReviewHeader"
          :i18n="i18n"
          :is-mobile="props.isMobile"
          :navigation-state="neuralNavigationState"
          :route-control="neuralRoamRouteControl"
          :batch="neuralRoamBatch"
          :progress="neuralRoamJourneyProgress"
          @toolbar-action="handleToolbarAction"
          @engine-mode-select="handleNeuralRoamEngineModeSelect"
          @route-menu="handleNeuralRoamRouteMenu"
        />

        <ReviewHeader
          v-else
          :header="displayedReviewHeader"
          :meta="state.meta"
          :i18n="i18n"
          :is-tab-mode="props.mode === 'tab'"
          :title="props.title"
          :mode="props.mode"
          :is-mobile="props.isMobile"
          :native-dialog-titlebar="props.nativeDialogTitlebar === true"
          :navigation-state="neuralNavigationState"
          :route-control="neuralRoamRouteControl"
          @toolbar-action="handleToolbarAction"
          @action="hook.executeCommand"
          @context="handleContext"
          @breadcrumb-click="handleBreadcrumbClick"
          @queue-switch="handleQueueSwitchTrigger"
          @route-menu="handleNeuralRoamRouteMenu"
        />

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
          v-show="!reviewInlineCardEditorOpen"
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
        />

        <ReviewInlineCardEditor
          v-if="reviewInlineCardEditorOpen"
          :open="reviewInlineCardEditorOpen"
          :title="reviewInlineCardEditorTitle"
          :hint="reviewInlineCardEditorHint"
          :i18n="i18n"
          :source-open="reviewTextEditorOpen"
          :source-entries="reviewTextEditorEntries"
          :source-readonly="reviewTextEditorReadonly"
          :source-placeholder="t('editSourceContentPlaceholder', '使用 Markdown 编辑源块内容')"
          :source-confirm-disabled="reviewTextEditorConfirmDisabled"
          :structured-model="reviewInlineCardEditorStructuredModel"
          :answer-revealed="hook.context.value.showAnswer"
          :cancel-label="t('cancel', '取消')"
          :save-label="t('save', '保存')"
          :close-label="t('cancel', '取消')"
          :concept-reference-options-by-target="reviewConceptReferenceOptionsByTarget"
          :source-latest-conflict-label="t('reviewStructuredConflictUseSourceLatest', '使用源文档最新')"
          :draft-overwrite-conflict-label="t('reviewStructuredConflictKeepDraft', '保留我的草稿')"
          @update-source-target="updateCurrentContentEditorTarget"
          @search-concept-reference="searchCurrentContentEditorConceptReference"
          @resolve-source-conflict="resolveCurrentContentEditorConflict"
          @confirm-source="confirmInlineCardEditorSource"
          @reveal-answer-fields="revealAnswerFieldsForInlineEditor"
          @close="requestCloseInlineCardEditor"
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
          @scheduled="advanceScheduledCurrentCard"
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

      </div>

      <aside v-if="showReviewSideArea" class="fsrs-review-v2__side-area">
        <div class="fsrs-review-v2__side-tabs" role="tablist" :aria-label="t('reviewSideAreaTabs', 'Review side area')">
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
import ReviewCdfRelationPreviewDialog from './components/ReviewCdfRelationPreviewDialog.vue';
import ReviewInlineCardEditor from './components/ReviewInlineCardEditor.vue';
import NeuralRoamJourneyHeader from './NeuralRoamJourneyHeader.vue';
import FilterDialog from '@/ui/browser/dialogs/FilterDialog.vue';
import SemanticReviewSidebar from './semantic/SemanticReviewSidebar.vue';
import type { SemanticPathAnalysisPayload } from './semantic/semanticReviewAIHandoff';
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
  type ReviewEditableTarget,
  type ReviewHeaderVariant,
  type ReviewHeaderRouteControl,
  type ReviewMidSessionInsertedOrigin,
  type ReviewNeuralRoamJourneyProgress,
  type ReviewNativeSplitGuardState,
  type ReviewUIState,
  type ReviewViewTabBridge,
} from './types';
import {
  resolveCurrentMainReviewQueueType,
  resolveReviewPresentationHeaderVariant,
} from '@/types/review-presentation-semantics';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { confirmDialog, createVueDialog, inputDialog, threeChoiceDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import { closeTemporaryRouteWithPrompt } from '@/application/services/NeuralRoamTemporaryRouteLifecycle';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { BrowserOpenState } from '@/types/browser';
import {
  QueueType,
  type InitialReviewSessionState,
  type ReviewTabTransferState,
  type IUnifiedDataSourceManagerFacade,
  isNeuralRoamSessionQueue,
  type BackendNeuralRoamViewState,
  type NeuralNavigationState,
  type NeuralRoamBatchSnapshot,
  type NeuralRoamSessionQueue,
  type QueueReviewSchedulingContext,
} from '@/types/unified-data-source';
import type { NeuralRoamRouteListItem } from '@/core/queue/neural/routes';
import type { FSRSCard } from '@/types/card';
import {
  buildReviewRenderableCommand,
  type ReviewRenderableAction,
  type ReviewRenderableCommand,
} from '@/application/adapters/reviewRenderableContext';
import type { ReviewTabRuntimeState } from '@/types/review-tab';
import { isTopicLikeCard } from './reviewCardSemantics';
import { resolveReviewDialogEscapeKeydown, shouldResetReviewDialogEscapeLatch } from './reviewDialogEscape';
import { createReviewEditorState, type ReviewEditorState } from './reviewEditorState';
import { createReviewWriterRecoveryRuntime } from './reviewWriterRecoveryRuntime';
import { createReviewTabTransferRuntime } from './reviewTabTransferRuntime';
import { resolveReviewKeyAction } from './reviewKeyActionResolver';
import type { ReviewWriterUnavailableRecoveryNotice } from './reviewWriterUnavailableRecovery';
import type {
  BackendNeuralRoamCommand,
  BackendReviewSyncDivergenceAuditResult,
} from '../../../../packages/contracts/src/backend-rpc';
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
import {
  createReviewNeuralRouteCommandRuntime,
  formatReviewNeuralRouteDetail,
  isReviewNeuralRouteMenuSeparator,
} from './reviewNeuralRouteCommands';
import {
  createReviewSemanticTemporaryRuntime,
  type ReviewSemanticTemporaryView,
} from './reviewSemanticTemporaryRuntime';
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
  createReviewSourceRefreshHostRuntime,
  createReviewSourceRefreshRuntime,
  getSharedReviewSourceRefreshCoordinator,
  type ReviewTransactionWebSocketServiceLike,
} from './reviewSourceRefreshRuntime';
import { createReviewTruthFlushHostRuntime } from './reviewHostRuntime';
import { createReviewInlineCardEditorBridgeRuntime } from './reviewInlineCardEditorBridgeRuntime';
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
  isProgressiveExcerptCard,
  isReviewProgressiveExcerptEnabled,
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
import type { PluginSettings } from '@/types/settings';
import type {
  ReviewApplicationService,
  ReviewConceptReferenceSearchOption,
} from '@/application/services/ReviewApplicationService';
import type { SharedReviewSessionRegistry } from '@/application/services/SharedReviewSessionRegistry';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import { prepareReviewPresentation } from './reviewPresentationPreparer';
import { createReviewCardActionRuntime, type ReviewCardPeerInfo } from './reviewCardActionCommands';
import {
  createReviewCurrentContentEditorRuntime,
  type ReviewCurrentContentEditorAfterSuccessfulWritesResult,
  type ReviewCurrentContentEditorRelationPreview,
  type ReviewEditableTargetConflictResolution,
  type ReviewCurrentContentEditorPendingWrite,
  type ReviewCurrentContentEditorValidationResult,
} from './reviewCurrentContentEditorRuntime';
import {
  buildReviewStructuredFieldModelFromExplicitSources,
  createReviewStructuredFieldOriginHash,
  extractReviewStructuredGrammarFieldValue,
  hasReviewStructuredDescriptorGroupLeafShape,
  parseReviewStructuredFieldTargetId,
  type ReviewStructuredCardFamily,
  type ReviewStructuredField,
  type ReviewStructuredFieldRole,
} from './reviewStructuredFieldModel';
import {
  type CdfReconciliationAction,
  applyCdfConceptBindingEdit,
  planCdfConceptBindingEdit,
  type CdfConceptTarget,
  type CdfConceptBindingEditDiagnostic,
  type CdfConceptBindingEditPlan,
  extractSafeCardSourceGrammarFields,
  readCdfLiveRelationMetadata,
  replaceDefinitionInCardSourceGrammar,
  replaceDescriptorInCardSourceGrammar,
  replaceItemInCardSourceGrammar,
} from '@/core/card/cdf-live-relation';
import type {
  CdfLiveRelationWriteSyncOptions,
  CdfLiveRelationWriteSyncResult,
} from '@/application/services/CdfLiveRelationWriteSyncService';
import { createReviewFilterRuntime, type ReviewFilterCommandClient, type ReviewFilterGroupQueueLike } from './reviewFilterCommands';
import { createReviewDataObserverRuntime } from './reviewDataObserverRuntime';
import { createReviewNativeSplitRuntime } from './reviewNativeSplitRuntime';
import { buildReviewDomainSyncSafetyDecision } from '@/application/services/ReviewDomainSyncSafetyService';
import type { BackendReviewSessionRepairGateEvidence } from '../../../../packages/contracts/src/backend-rpc';
import { openManualSyncConflictResolutionDialog } from '@/ui/syncConflict/manualSyncConflictResolutionDialog';

const logger = createLogger('ReviewView');
type ReviewSideAreaTab = 'semantic';

type ReviewPluginContextLike = {
  getDialogManager?: () =>
    | (ReviewOpenAsDialogManager & {
        openBrowserDialog?: (options?: {
          initialOpenState?: BrowserOpenState | null;
          initialQueueId?: string;
          initialNeuralSubview?: 'concept-cards' | 'engine-history' | 'roam-history' | 'worldline-anchors';
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
        switchStandardReviewDialogQueue?: (queueType: QueueType) => Promise<void> | void;
      })
    | undefined;
  getNeuralRoamEntryActionService?: () =>
    | {
        startTemporaryCurrentBlockRoam?: (input: {
          blockId: string;
          seedBlockId?: string | null;
          conceptBlockId?: string | null;
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
        closeReviewTab?: (reviewSessionId: string) => void | Promise<void>;
      })
    | undefined;
  getSrsBackendClient?: () => {
    requestReviewTruthFlush?: (reason: 'review-exit' | 'queue-complete' | 'manual') => boolean;
  } | null | undefined;
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
  getBrowserService?: () => Pick<IBrowserApplicationService, 'setFilterGroupFilter' | 'rebuildFilterGroupQueue'> | undefined;
  getSchedulerRouter?: () => {
    getSchedulerType?: (card: FSRSCard) => 'fsrs-v6' | 'a-factor-v2';
  } | undefined;
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | null | undefined;
  readDomainSyncDiagnostics?: (request?: { context?: 'review-feedback-preflight'; cardId?: string | null }) => Promise<unknown>;
  auditReviewSyncDivergence?: (request?: { cardIds?: string[]; limit?: number }) => Promise<BackendReviewSyncDivergenceAuditResult>;
};

type ReviewRuntimeSettingsLike = Pick<Partial<PluginSettings>,
  'ai' | 'progressiveReading' | 'quickCard' | 'ui' | 'queues'
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

type DismissedReviewCardPayload = {
  cardId?: string;
  blockId?: string;
  dismissed?: boolean;
};

type ReviewContentExpose = {
  exitEditorByEscape: () => boolean;
  getEditableTargets: () => ReviewEditableTarget[];
  getDependencyBlockIds?: () => string[];
  getNativeSplitGuardState?: () => ReviewNativeSplitGuardState;
  refreshVisibleContent?: (reason?: string) => Promise<boolean>;
};

type ReviewSourceEditSessionImpact = {
  currentStillReviewable: boolean;
  refreshedSameSourceSnapshots: boolean;
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

type CdfRelationPreviewSummary = {
  create: number;
  orphan: number;
  duplicate: number;
  restore: number;
  legacyUnavailable: number;
};

type CdfRelationPreviewDialogProps = {
  summary: Array<{ key: string; label: string; count: number }>;
  currentImpact: string;
  sessionImpact: string;
  details: Array<{ kind: string; text: string }>;
  currentImpactLabel: string;
  sessionImpactLabel: string;
  detailsLabel: string;
  noDetailsLabel: string;
  confirmLabel: string;
  cancelLabel: string;
};

type CdfRelationPreviewRaw = {
  kind: 'cdf-live-relation-preview';
  dryRun: CdfLiveRelationWriteSyncResult;
  options: CdfLiveRelationWriteSyncOptions;
  dialogProps: CdfRelationPreviewDialogProps;
};

type CdfConceptBindingConfirmationRaw = {
  kind: 'cdf-concept-binding-confirmation';
  plan: CdfConceptBindingEditPlan;
};

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

const reviewTruthFlushRuntime = createReviewTruthFlushHostRuntime({
  getPlugin: () => props.plugin as ReviewPluginLike | null | undefined,
  getWindowPlugin,
  logger,
});
const requestReviewTruthFlush = reviewTruthFlushRuntime.requestReviewTruthFlush;

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
const reviewSemanticInitialPinnedSessionId = String(props.initialSemanticPinnedSessionId || '').trim();
const reviewSemanticSidebarOpen = ref(Boolean(reviewSemanticInitialPinnedSessionId));
const reviewSemanticPinnedSessionId = ref<string | null>(reviewSemanticInitialPinnedSessionId || null);
const reviewSemanticTemporaryView = ref<ReviewSemanticTemporaryView | null>(null);
const activeReviewSideAreaTab = ref<ReviewSideAreaTab>('semantic');
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
const reviewSourceRefreshRuntime = createReviewSourceRefreshRuntime({
  isEnabled: isReviewSourceBlockRefreshEnabled,
  isAdvancePending: isReviewAdvancePending,
  getCurrentReference: getCurrentReviewCardReference,
  getDependencyBlockIds: () => reviewSourceRefreshHostRuntime.getDependencyBlockIds(),
  resolveBackendImpact(request) {
    return getReviewService().executeReviewSourceRefresh(request);
  },
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
const reviewSourceRefreshHostRuntime = createReviewSourceRefreshHostRuntime({
  surfaceId: `review-source:${reviewSessionId.value}`,
  runtime: reviewSourceRefreshRuntime,
  coordinator: getSharedReviewSourceRefreshCoordinator(),
  isEnabled: isReviewSourceBlockRefreshEnabled,
  getTransactionService: getReviewTransactionWebSocketService,
  getContentExpose: () => contentRef.value,
  getContentSnapshot: () => state.value.content,
  onDependencyChanged: () => undefined,
});
const reviewStructuredTouchedFieldIdsBySourceTarget = new Map<string, Set<string>>();
const reviewStructuredConflictResolutionsBySourceTarget = new Map<string, Map<string, {
  resolution: ReviewEditableTargetConflictResolution;
  latestSource?: string;
}>>();
const reviewConceptReferenceOptionsByTarget = ref<Record<string, ReviewConceptReferenceSearchOption[]>>({});
const reviewConceptReferenceSearchSeqByTarget = new Map<string, number>();

function clearReviewStructuredEditorState(): void {
  reviewStructuredTouchedFieldIdsBySourceTarget.clear();
  reviewStructuredConflictResolutionsBySourceTarget.clear();
  reviewConceptReferenceOptionsByTarget.value = {};
  reviewConceptReferenceSearchSeqByTarget.clear();
}

const reviewTextEditorRuntime = createReviewCurrentContentEditorRuntime({
  t,
  showMessage,
  logger,
  getReviewService,
  resolveEditableTargets: () => resolveCurrentEditableTargets(),
  validatePendingWrites: validateCurrentContentEditorPendingWrites,
  confirmRelationPreview: confirmCurrentContentEditorRelationPreview,
  afterSuccessfulWrites: reconcileCurrentContentEditorRelationWrites,
  suppressSourceBlockRefresh: (blockId) => reviewSourceRefreshRuntime.suppressBlock(blockId),
  refreshVisibleContent: (reason) => contentRef.value?.refreshVisibleContent?.(reason),
});
const reviewTextEditorOpen = reviewTextEditorRuntime.open;
const reviewTextEditorEntries = reviewTextEditorRuntime.entries;
const reviewTextEditorTitle = reviewTextEditorRuntime.title;
const reviewTextEditorReadonly = reviewTextEditorRuntime.readonly;
const reviewTextEditorConfirmDisabled = reviewTextEditorRuntime.confirmDisabled;
const reviewTextEditorHint = reviewTextEditorRuntime.hint;
const reviewInlineCardEditorBridgeRuntime = createReviewInlineCardEditorBridgeRuntime({
  clearStructuredState: clearReviewStructuredEditorState,
  canOpen: () => resolveCurrentEditableTargets().length > 0,
  showNotEditable: () => showMessage(resolveSourceEditUnavailableMessage(), 3000, 'info'),
  openSourceEditor: reviewTextEditorRuntime.openEditor,
  closeSourceEditor: reviewTextEditorRuntime.close,
  confirmSourceEditor: reviewTextEditorRuntime.confirm,
});
const reviewInlineCardEditorOpen = reviewInlineCardEditorBridgeRuntime.open;
const reviewCardActionRuntime = createReviewCardActionRuntime({
  t,
  showMessage,
  logger,
  createDialog: createVueDialog,
  confirmDialog,
  getCurrentCard: () => state.value.content.card as FSRSCard | null | undefined,
  getCurrentCardMeta: () => state.value.actions.cardMeta,
  getCurrentContentTargetIdentity: () => state.value.meta.renderContext?.contentTarget?.identity ?? null,
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
  if (typeof candidate.getFilter !== 'function') {
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

async function refreshNeuralRoamRoutes(): Promise<void> {
  await neuralRouteCommandRuntime.refreshRoutes();
}

function getNeuralRoamViewState(): BackendNeuralRoamViewState | null {
  return getNeuralRoamQueue()?.getBackendViewState?.() ?? null;
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

function getUnifiedDataSourceManager(): IUnifiedDataSourceManagerFacade | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getUnifiedDataSourceManager?.() || contextFromWindow?.getUnifiedDataSourceManager?.() || null;
}

function getReviewDataManager(): IUnifiedDataSourceManagerFacade | null {
  return reviewDataObserverRuntime.getSubscribedManager() || getUnifiedDataSourceManager();
}

function getReviewFilterCommandClient(): ReviewFilterCommandClient | null {
  const contextFromProps = getPluginContext(props.plugin);
  const contextFromWindow = getWindowPlugin()?.getContext?.();
  return contextFromProps?.getBrowserService?.() || contextFromWindow?.getBrowserService?.() || null;
}

function getNeuralRoamCommandRequestRunner() {
  const manager = getUnifiedDataSourceManager();
  if (!manager || typeof manager.neuralRoamCommand !== 'function') {
    return null;
  }
  return manager.neuralRoamCommand.bind(manager);
}

function getNeuralRoamCommand() {
  const runner = getNeuralRoamCommandRequestRunner();
  if (!runner) {
    return null;
  }
  return (command: BackendNeuralRoamCommand) => runner({
    queueType: 'neural-roam',
    command,
  });
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

function buildReviewTabRuntimeState(): ReviewTabRuntimeState | null {
  return reviewTabTransferRuntime.buildRuntimeState();
}

function buildReviewTabTransferState(): ReviewTabTransferState | undefined {
  return reviewTabTransferRuntime.buildTransferState();
}

function buildReviewTabOpenOptions(overrides?: {
  position?: 'right' | 'bottom';
  sharedReviewSessionId?: string | null;
  reviewState?: ReviewTabRuntimeState | null;
}): ReviewTabOpenOptions {
  return reviewTabTransferRuntime.buildOpenOptions(overrides);
}

function ensureSharedReviewSessionPromotion(): string | null {
  return reviewTabTransferRuntime.ensureSharedSessionPromotion();
}

function openManagedReviewSplit(position: 'right' | 'bottom'): void {
  reviewTabTransferRuntime.openManagedSplit(position);
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
  void refreshNeuralRoamRoutes();

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
    && typeof value.advanceWithoutFeedback === 'function'
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
  void payload;
}

async function ensureReviewDomainSyncSafeForAction(input: {
  action: ReviewSessionRetryAction;
  item: ActiveReviewItem | null;
}): Promise<BackendReviewSessionRepairGateEvidence> {
  const context = getPluginContext(props.plugin);
  const currentCardId = input.item?.id || input.item?.cardID || null;
  if (typeof context?.readDomainSyncDiagnostics !== 'function') {
    throw new Error('DOMAIN_SYNC_DIAGNOSTICS_UNAVAILABLE: Review feedback requires domain sync diagnostics');
  }

  let blockedDecisionMessage: string | null = null;
  try {
    const status = await context.readDomainSyncDiagnostics({
      context: 'review-feedback-preflight',
      cardId: currentCardId,
    });
    const decision = buildReviewDomainSyncSafetyDecision(status as never, undefined, {
      currentCardId,
      surface: 'review-feedback',
    });
    if (decision.canOpenReview) {
      return buildReviewRepairGateEvidence(decision, currentCardId, 'domain-sync-safe');
    }
    if (
      currentCardId
      && decision.kind === 'block-repairable'
      && typeof context.auditReviewSyncDivergence === 'function'
    ) {
      const audit = await context.auditReviewSyncDivergence({ cardIds: [currentCardId], limit: 1 });
      if (audit.reasons['review-history-newer-than-card-state'] <= 0) {
        logger.info('[ReviewView] card-specific domain sync audit allows Review despite global repairable status', {
          action: input.action.type,
          cardId: currentCardId,
          auditReasons: audit.reasons,
        });
        return buildReviewRepairGateEvidence(decision, currentCardId, 'current-card-audit-accepted-repairable');
      }
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
    const decision = buildReviewDomainSyncSafetyDecision(null, error, {
      currentCardId,
    });
    await openManualSyncConflictResolutionDialog(context as never, {
      reviewBlockDecision: decision,
      diagnosticsUnavailableReason: decision.message,
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function buildReviewRepairGateEvidence(
  decision: ReturnType<typeof buildReviewDomainSyncSafetyDecision>,
  currentCardId: string | null,
  reason: string,
): BackendReviewSessionRepairGateEvidence {
  return {
    state: decision.sanityStatus === 'repairable' ? 'accepted-repairable' : 'clean',
    reason,
    createdAt: Date.now(),
    cardId: currentCardId,
    sanityStatus: decision.sanityStatus ?? null,
  };
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
      onQueueCompleted: () => requestReviewTruthFlush('queue-complete'),
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
    onQueueCompleted: () => requestReviewTruthFlush('queue-complete'),
    controller: reviewSessionController as never,
    surfaceId: reviewSessionId.value,
  }
);
const state = hook.state;
const neuralRoamRoutes = ref<NeuralRoamRouteListItem[]>([]);
const neuralRouteCommandRuntime = createReviewNeuralRouteCommandRuntime({
  t,
  getNeuralQueue: () => getNeuralRoamQueue(),
  getRouteCommand: () => getNeuralRoamCommandRequestRunner(),
  getRoutes: () => neuralRoamRoutes.value,
  setRoutes: (routes) => {
    neuralRoamRoutes.value = routes;
  },
  showMessage,
  reload: () => hook.reload(),
  promptRouteName: inputDialog,
  confirmRouteDelete: confirmDialog,
  openNeuralBrowserSubview,
  logger,
});
const reviewSemanticTemporaryRuntime = createReviewSemanticTemporaryRuntime({
  t,
  getTemporaryView: () => reviewSemanticTemporaryView.value,
  setTemporaryView: (temporaryView) => {
    reviewSemanticTemporaryView.value = temporaryView;
  },
  getReviewQueue: () => props.queue as never,
  resolveCardByBlockId: findSemanticTemporaryCard,
  renderItemPreview: (card, options) => hook.renderItemPreview(card, options as never),
  getSession: () => hook.context.value.session,
  showMessage,
});
const app = props.app;
const reviewWriterUnavailableNotice = ref<ReviewWriterUnavailableRecoveryNotice | null>(null);
const lastReviewWriterRecoveryAction = ref<ReviewSessionRetryAction | null>(null);
const reviewWriterRecoveryRuntime = createReviewWriterRecoveryRuntime({
  t,
  getAction: () => lastReviewWriterRecoveryAction.value,
  setAction: (action) => {
    lastReviewWriterRecoveryAction.value = action;
  },
  setNotice: (notice) => {
    reviewWriterUnavailableNotice.value = notice;
  },
  notifyReviewMessage,
  grade: (rating) => hook.grade(rating),
  skip: () => hook.skip(),
  executeCommand: (commandId) => hook.executeCommand(commandId),
  reload: () => hook.reload(),
});
const reviewTabTransferRuntime = createReviewTabTransferRuntime({
  mode: props.mode || 'dialog',
  queue: props.queue,
  adapter: props.adapter,
  title: props.title,
  headerVariant: props.headerVariant,
  transferState: props.transferState,
  getSharedReviewSessionId: () => sharedReviewSessionId.value,
  setSharedReviewSessionId: (sessionId) => {
    sharedReviewSessionId.value = sessionId;
  },
  createSharedReviewSessionId,
  getInitialSessionState: getInitialReviewSessionState,
  getQueueSessionSource: () => props.queue,
  getFilterSessionSource: getFilterGroupQueue,
  getCurrentReference: getCurrentReviewCardReference,
  isShowingAnswer: () => hook.context.value.showAnswer === true,
  getReviewSessionController: () => reviewSessionController,
  isReviewSessionControllerLike,
  getSharedReviewSessionRegistry,
  getTabManager,
  t,
  showMessage,
  logger,
});
const kernelTransactionWriterActionTracker = createReviewKernelTransactionWriterActionTracker(
  reviewSessionId.value,
  30_000,
);
const reviewFilterRuntime = createReviewFilterRuntime({
  t,
  showMessage,
  logger,
  getFilterGroupQueue,
  getFilterCommandClient: getReviewFilterCommandClient,
  reload: () => hook.reload(),
});
const showReviewFilterDialog = reviewFilterRuntime.dialogOpen;
const appliedReviewFilter = reviewFilterRuntime.appliedFilter;
const neuralNavigationState = ref<NeuralNavigationState | null>(null);

watch(
  reviewSourceRefreshHostRuntime.getDependencySignature,
  reviewSourceRefreshHostRuntime.handleDependencyChange,
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
  notifyMidSessionInserted: notifyReviewMidSessionInserted,
  getManager: getUnifiedDataSourceManager,
  getFilterGroupQueue,
  getFilterCommandClient: getReviewFilterCommandClient,
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

function notifyReviewMidSessionInserted(input: {
  count: number;
  origin: ReviewMidSessionInsertedOrigin;
  cards: FSRSCard[];
}): void {
  if (input.count <= 0) {
    return;
  }
  const messageKey = input.origin === 'review-editor-save'
    ? 'reviewCdfEditorInsertedDueCardsToast'
    : 'reviewCdfExternalInsertedDueCardsToast';
  const fallback = input.origin === 'review-editor-save'
    ? '已将 {count} 张编辑产生的到期 CDF 卡加入本轮尾部'
    : '已将 {count} 张修复后的到期 CDF 卡加入本轮尾部';
  showMessage(
    t(messageKey, fallback).replace('{count}', String(input.count)),
    3000,
    'info',
  );
}

const REVIEW_SIDE_AREA_MIN_VIEWPORT = 1040;
const SEMANTIC_ACTIVATION_USER_ENTRY_ENABLED = false;

const canUseReviewSideArea = computed(() => (
  props.isMobile !== true && viewportWidth.value >= REVIEW_SIDE_AREA_MIN_VIEWPORT
));

const showReviewSemanticSidePanel = computed(() => (
  SEMANTIC_ACTIVATION_USER_ENTRY_ENABLED
  && canUseReviewSideArea.value
  && reviewSemanticSidebarOpen.value
));

const showReviewSideArea = computed(() => (
  showReviewSemanticSidePanel.value
));

const semanticActivationReadClient = computed(() => (
  getPluginContext(props.plugin)?.getSemanticActivationBrowserReadClient?.() ?? null
));

const semanticActivationCommandClient = computed(() => (
  getPluginContext(props.plugin)?.getSemanticActivationCommandClient?.() ?? null
));

const reviewSemanticCurrentNodeId = computed(() => resolveCurrentReviewBlockId() || null);

const activeNeuralRoamRoute = computed(() => (
  neuralRoamRoutes.value.find((route) => route.isActive)
  ?? neuralRoamRoutes.value[0]
  ?? null
));

const neuralRoamRouteControl = computed<ReviewHeaderRouteControl | null>(() => {
  if (!getNeuralRoamQueue()) {
    return null;
  }
  const route = activeNeuralRoamRoute.value;
  if (!route) {
    return null;
  }
  return {
    label: t('route', '航线'),
    name: route.name,
    detail: formatReviewNeuralRouteDetail(route, t),
    temporary: route.temporary === true,
    disabled: false,
  };
});

const neuralRoamBatch = computed<NeuralRoamBatchSnapshot | null>(() => {
  void state.value.content.id;
  void hook.context.value.showAnswer;
  void neuralNavigationState.value?.currentNodeId;
  void neuralNavigationState.value?.currentEventId;
  return getNeuralRoamQueue()?.getCurrentBatchSnapshot?.() ?? null;
});

const showNeuralRoamJourneyHeader = computed(() => (
  Boolean(neuralNavigationState.value && neuralRoamRouteControl.value)
));

const neuralRoamHeaderCounterFocusKey = ref<string | null>(null);

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
  let toolbar = Array.isArray(header.toolbar) ? header.toolbar : [];
  let toolbarChanged = false;
  const editLabel = t('editSourceContent', '编辑源内容');
  if (shouldExposeHeaderEditButton()) {
    const editButtonActive = reviewInlineCardEditorOpen.value ? true : undefined;
    const editButtonIndex = toolbar.findIndex((button) => button.type === 'edit-current-content');
    if (editButtonIndex < 0) {
      toolbar = [
        ...toolbar.slice(0, 1),
        {
          icon: '#iconEdit',
          type: 'edit-current-content',
          ariaLabel: editLabel,
          tooltip: editLabel,
          active: editButtonActive,
        },
        ...toolbar.slice(1),
      ];
      toolbarChanged = true;
    } else {
      const currentButton = toolbar[editButtonIndex];
      if (currentButton.active !== editButtonActive) {
        toolbar = toolbar.map((button, index) => (
          index === editButtonIndex
            ? { ...button, active: editButtonActive }
            : button
        ));
        toolbarChanged = true;
      }
    }
  }

  const canShowNeuralRoamEntry = !(
    state.value.content.type === 'empty'
    || !resolveCurrentReviewBlockId()
    || !getNeuralRoamEntryActionService()
    || toolbar.some((button) => button.type === 'neural-roam-entry')
  );

  if (canShowNeuralRoamEntry) {
    toolbar = [
      ...toolbar.slice(0, 1),
      {
        icon: '#iconGraph',
        type: 'neural-roam-entry',
        ariaLabel: t('neuralRoam', '神经漫游'),
        tooltip: t('neuralRoam', '神经漫游'),
      },
      ...toolbar.slice(1),
    ];
    toolbarChanged = true;
  }

  if (!toolbarChanged) {
    return header;
  }

  return {
    ...header,
    toolbar,
  };
});

function toJourneyCount(value: number | string | null | undefined): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function resolveNeuralRoamJourneyFocusKey(
  batch: NeuralRoamBatchSnapshot | null,
  navigationState: NeuralNavigationState | null,
): string {
  return String(
    batch?.focusNodeId
    || batch?.currentNodeId
    || navigationState?.currentNodeId
    || '',
  ).trim();
}

function resolveHeaderJourneyProgress(header: ReviewUIState['header']): ReviewNeuralRoamJourneyProgress | null {
  const viewedCount = toJourneyCount(header.counterSummary?.value);
  if (viewedCount === null) {
    return null;
  }
  const totalCount = toJourneyCount(header.stats.total);
  const remainingCount = toJourneyCount(header.stats.current);
  return {
    viewedCount,
    totalCount: totalCount ?? viewedCount,
    remainingCount: remainingCount ?? Math.max(0, (totalCount ?? viewedCount) - viewedCount),
  };
}

function resolveBatchJourneyProgress(batch: NeuralRoamBatchSnapshot | null): ReviewNeuralRoamJourneyProgress | null {
  const viewedCount = toJourneyCount(batch?.viewedCount);
  const totalCount = toJourneyCount(batch?.roundSize);
  if (viewedCount === null || totalCount === null) {
    return null;
  }
  return {
    viewedCount,
    totalCount,
    remainingCount: toJourneyCount(batch?.remainingCount) ?? Math.max(0, totalCount - viewedCount),
  };
}

const neuralRoamJourneyFocusKey = computed(() => resolveNeuralRoamJourneyFocusKey(
  neuralRoamBatch.value,
  neuralNavigationState.value,
));

watch(
  () => ({
    header: displayedReviewHeader.value,
    focusKey: neuralRoamJourneyFocusKey.value,
  }),
  (current, previous) => {
    if (current.header === previous?.header || !resolveHeaderJourneyProgress(current.header)) {
      return;
    }
    neuralRoamHeaderCounterFocusKey.value = current.focusKey || null;
  },
  { immediate: true },
);

const neuralRoamJourneyProgress = computed<ReviewNeuralRoamJourneyProgress | null>(() => {
  const headerProgress = resolveHeaderJourneyProgress(displayedReviewHeader.value);
  const batchProgress = resolveBatchJourneyProgress(neuralRoamBatch.value);
  const focusKey = neuralRoamJourneyFocusKey.value;
  const headerFocusKey = neuralRoamHeaderCounterFocusKey.value;
  if (headerProgress && (!focusKey || headerFocusKey === focusKey)) {
    return headerProgress;
  }
  return batchProgress ?? headerProgress;
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

const reviewInlineCardEditorTitle = computed(() => t('editSourceContent', '编辑源内容'));
const reviewInlineCardEditorHint = computed(() => (
  t('inlineCardEditorHint', '修改源块后会刷新当前复习卡；关系方向保持只读。')
));
const reviewInlineCardEditorStructuredModel = computed(() => {
  const card = state.value.content.card as FSRSCard | null | undefined;
  return buildReviewStructuredFieldModelFromExplicitSources({
    card,
    sources: reviewTextEditorEntries.value.map(entry => ({
      id: entry.target.id,
      blockId: entry.target.blockId,
      title: entry.target.title,
      role: entry.target.role,
      rendererKind: entry.target.rendererKind,
      value: entry.value,
    })),
  });
});

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
  if (reviewWriterRecoveryRuntime.showActionError(payload)) {
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
  reviewWriterRecoveryRuntime.showRecovery({
    reason: action.type,
    error: new Error(detail?.message || 'BACKEND_UNAVAILABLE: writer relay timeout'),
    action,
  });
}

function dismissReviewWriterRecoveryNotice(): void {
  reviewWriterRecoveryRuntime.dismiss();
}

async function retryReviewWriterRecoveryAction(): Promise<void> {
  await reviewWriterRecoveryRuntime.retry();
}

async function reloadReviewWriterRecoverySurface(): Promise<void> {
  await reviewWriterRecoveryRuntime.reloadSurface();
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

function getCurrentReviewCardReference(): { cardId: string; blockId: string } {
  return reviewCardActionRuntime.getCurrentReviewCardReference();
}

function resolveCurrentReviewContentCommand(
  action: ReviewRenderableAction,
  payload: Record<string, unknown> = {},
): ReviewRenderableCommand | null {
  const context = state.value.meta.renderContext;
  if (!context) {
    return null;
  }
  try {
    return buildReviewRenderableCommand({
      context,
      action,
      payload,
    });
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Review content action unavailable', {
      action,
      targetKind: context.targetKind,
      diagnostics: context.diagnostics,
      error,
    });
    return null;
  }
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

async function advanceCurrentReviewCardByReference(
  payload: { cardId?: string; blockId?: string },
  options: { withoutFeedback?: boolean } = {},
): Promise<void> {
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

  await removeCardIdsFromActiveQueue([requestedCardId, requestedBlockId]);
  if (options.withoutFeedback === true) {
    await hook.advanceWithoutFeedback({ decrementTotal: true });
    return;
  }
  await hook.skip();
}

async function advanceScheduledCurrentCard(payload: ScheduledReviewCardPayload): Promise<void> {
  const scheduledCardId = String(payload.cardId || '').trim();
  const scheduledBlockId = String(payload.blockId || '').trim();
  await advanceCurrentReviewCardByReference({
    cardId: scheduledCardId,
    blockId: scheduledBlockId,
  }, {
    withoutFeedback: true,
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
  }, {
    withoutFeedback: true,
  });
}

async function refreshCurrentReviewCard(): Promise<void> {
  const manager = getReviewDataManager();
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

  const manager = getReviewDataManager();
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
  reviewSourceRefreshHostRuntime.bindTransactionService();
}

function unbindReviewDataObserver(): void {
  reviewDataObserverRuntime.unbind();
}

function unbindReviewTransactionService(): void {
  reviewSourceRefreshHostRuntime.unbind();
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
  if (key === 'e' && !reviewInlineCardEditorOpen.value) {
    void openInlineCardEditor();
    return;
  }
  if (reviewInlineCardEditorOpen.value) {
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

  if (key === 'e' && !reviewInlineCardEditorOpen.value) {
    e.preventDefault();
    e.stopPropagation();
    void openInlineCardEditor();
    return;
  }

  if (reviewInlineCardEditorOpen.value) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  handleReviewKeyAction('keydown', key, e);
}

function handleReveal(): void {
  if (reviewInlineCardEditorOpen.value) {
    return;
  }
  if (reviewSemanticTemporaryRuntime.revealTemporaryView()) {
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  if (!resolveCurrentReviewContentCommand('answer')) {
    return;
  }
  hook.reveal();
}

async function revealAnswerFieldsForInlineEditor(): Promise<void> {
  if (hook.context.value.showAnswer === true) {
    return;
  }
  const confirmed = await confirmDialog({
    title: t('reviewRevealAnswerFieldsTitle', '显示答案字段'),
    content: t('reviewRevealAnswerFieldsContent', '编辑答案字段会先显示当前卡答案。是否继续？'),
    confirmText: t('reviewRevealAnswerFieldsConfirm', '显示答案并编辑'),
    cancelText: t('cancel', '取消'),
    visualVariant: 'form',
  });
  if (!confirmed) {
    return;
  }
  hook.reveal();
}

function handleGrade(rating: number): void {
  if (reviewInlineCardEditorOpen.value) {
    return;
  }
  if (reviewSemanticTemporaryView.value?.card) {
    void reviewSemanticTemporaryRuntime.gradeTemporaryReview(rating);
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  const command = resolveCurrentReviewContentCommand('answer', { rating });
  if (!command) {
    return;
  }
  kernelTransactionWriterActionTracker.record({
    type: 'grade',
    rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4,
  });
  void hook.grade(rating);
}

function handleSkip(): void {
  if (reviewInlineCardEditorOpen.value) {
    return;
  }
  if (reviewSemanticTemporaryView.value) {
    clearSemanticTemporaryView();
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  if (!resolveCurrentReviewContentCommand('skip')) {
    return;
  }
  kernelTransactionWriterActionTracker.record({ type: 'skip' });
  void hook.skip();
}

function handleBack(): void {
  if (reviewInlineCardEditorOpen.value) {
    return;
  }
  if (reviewSemanticTemporaryView.value) {
    clearSemanticTemporaryView();
    return;
  }
  clearSemanticTemporaryView();
  escRepeatLatch = false;
  if (!resolveCurrentReviewContentCommand('back')) {
    return;
  }
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

function resolveCurrentEditableTargets(): ReviewEditableTarget[] {
  return contentRef.value?.getEditableTargets?.() || [];
}

function resolvePrimaryEditableTarget(): ReviewEditableTarget | null {
  return resolveCurrentEditableTargets()[0] || null;
}

function getEditableTargetsProbeKey(): string {
  return [
    state.value.content.id,
    state.value.content.card?.id,
    state.value.content.card?.blockId,
    renderEpoch.value,
  ].join(':');
}

function shouldExposeHeaderEditButton(): boolean {
  getEditableTargetsProbeKey();
  return hasCurrentReviewCard() && state.value.content.type !== 'empty';
}

function isStructuredEditableFamily(family: ReviewStructuredCardFamily): family is Exclude<ReviewStructuredCardFamily, 'source'> {
  return family === 'item' || family === 'definition' || family === 'descriptor';
}

function getReviewStructuredExternalConflictMessage(field?: ReviewStructuredField): string {
  const fieldLabel = field?.label || t('reviewStructuredFieldGenericLabel', '字段');
  return t('reviewStructuredFieldExternalConflict', '源文档中的「{field}」已被外部修改，请先处理冲突')
    .replace('{field}', fieldLabel);
}

function getReviewStructuredFieldHash(field: ReviewStructuredField, value: string): string {
  return createReviewStructuredFieldOriginHash({
    role: field.role,
    value,
    blockId: field.origin.blockId,
    originKind: field.origin.kind,
  });
}

function readStructuredGrammarFieldValues(input: {
  source: string;
  family: Exclude<ReviewStructuredCardFamily, 'source'>;
  descriptorGroupLeaf: boolean;
}): Partial<Record<ReviewStructuredFieldRole, string>> | null {
  const extracted = extractSafeCardSourceGrammarFields({
    source: input.source,
    family: input.family,
    descriptorGroupLeaf: input.descriptorGroupLeaf,
  });
  if (!extracted.ok) {
    return null;
  }

  const result: Partial<Record<ReviewStructuredFieldRole, string>> = {};
  for (const field of extracted.fields) {
    result[field.role] = field.value;
  }
  return result;
}

function rewriteStructuredGrammarSource(input: {
  source: string;
  family: Exclude<ReviewStructuredCardFamily, 'source'>;
  values: Partial<Record<ReviewStructuredFieldRole, string>>;
  descriptorGroupLeaf: boolean;
}): string | null {
  if (input.family === 'definition') {
    const rewritten = replaceDefinitionInCardSourceGrammar({
      source: input.source,
      definition: input.values.definition ?? '',
    });
    return rewritten.ok ? rewritten.source : null;
  }
  if (input.family === 'descriptor') {
    const rewritten = replaceDescriptorInCardSourceGrammar({
      source: input.source,
      cue: input.values.cue,
      answer: input.values.answer ?? '',
      descriptorGroupLeaf: input.descriptorGroupLeaf,
    });
    return rewritten.ok ? rewritten.source : null;
  }

  const rewritten = replaceItemInCardSourceGrammar({
    source: input.source,
    question: input.values.question ?? '',
    answer: input.values.answer ?? '',
  });
  return rewritten.ok ? rewritten.source : null;
}

function rewriteStructuredGrammarFieldValue(input: {
  source: string;
  family: Exclude<ReviewStructuredCardFamily, 'source'>;
  field: ReviewStructuredField;
  value: string;
  descriptorGroupLeaf: boolean;
}): string | null {
  const values = readStructuredGrammarFieldValues({
    source: input.source,
    family: input.family,
    descriptorGroupLeaf: input.descriptorGroupLeaf,
  });
  if (!values) {
    return null;
  }

  values[input.field.role] = input.value;
  return rewriteStructuredGrammarSource({
    source: input.source,
    family: input.family,
    values,
    descriptorGroupLeaf: input.descriptorGroupLeaf,
  });
}

function findCurrentContentEditorMarkdownWriteForConceptReference(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  conceptWrite: ReviewCurrentContentEditorPendingWrite,
): ReviewCurrentContentEditorPendingWrite | null {
  const card = state.value.content.card as FSRSCard | null | undefined;
  const meta = readReviewCardMeta(card);
  const mapping = readReviewFieldMapping(meta);
  const preferredSourceBlockId = mapping.definition || mapping.descriptor || resolveCurrentCdfLiveSourceBlockId(pendingWrites);
  const markdownWrites = pendingWrites.filter(write => write.sourceKind === 'block-markdown');
  return markdownWrites.find(write => write.blockId === preferredSourceBlockId)
    || markdownWrites.find(write => write.entry.target.rendererKind === conceptWrite.entry.target.rendererKind)
    || markdownWrites[0]
    || null;
}

async function mergeConceptReferenceWritesIntoMarkdown(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
): Promise<ReviewCurrentContentEditorValidationResult> {
  const conceptWrites = pendingWrites.filter(write => write.sourceKind === 'concept-reference');
  const result: ReviewCurrentContentEditorValidationResult = {
    conflicts: [],
    relationPreview: null,
  };
  if (conceptWrites.length === 0) {
    return result;
  }

  for (const conceptWrite of conceptWrites) {
    const markdownWrite = findCurrentContentEditorMarkdownWriteForConceptReference(pendingWrites, conceptWrite);
    if (!markdownWrite) {
      result.conflicts?.push({
        targetId: conceptWrite.targetId,
        message: t('reviewConceptReferenceSourceMissing', '找不到可改写的关系源码块'),
      });
      continue;
    }

    const reviewService = getReviewService();
    const source = markdownWrite.value
      || String(await reviewService?.getEditableBlockMarkdown(markdownWrite.blockId) ?? '');
    const target = await resolveCurrentCdfConceptBindingTarget(conceptWrite.value);
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: markdownWrite.blockId,
      source,
      selectedConceptBlockId: conceptWrite.value,
      expectedConceptBlockId: conceptWrite.originalValue,
      relationFamily: resolveCurrentCdfConceptBindingRelationFamily(conceptWrite),
      relationKind: resolveCurrentCdfConceptBindingRelationKind(),
      target,
    });
    const applied = applyCdfConceptBindingEdit(plan);
    if (!applied.ok) {
      result.conflicts?.push({
        targetId: conceptWrite.targetId,
        message: formatCdfConceptBindingDiagnostic(applied.diagnostics[0], plan),
      });
      continue;
    }

    if (plan.requiresConfirmation && !result.relationPreview) {
      result.relationPreview = buildCdfConceptBindingConfirmationPreview(plan);
    }

    markdownWrite.value = applied.source;
    markdownWrite.entry.value = applied.source;
  }

  return result;
}

async function resolveCurrentCdfConceptBindingTarget(
  selectedConceptBlockId: string,
): Promise<CdfConceptTarget | null> {
  const normalized = String(selectedConceptBlockId || '').trim();
  const reviewService = getReviewService();
  if (!normalized || typeof reviewService?.resolveConceptReferenceTarget !== 'function') {
    return null;
  }
  try {
    return await reviewService.resolveConceptReferenceTarget(normalized);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to resolve concept reference target:', {
      blockId: normalized,
      error,
    });
    return null;
  }
}

function resolveCurrentCdfConceptBindingRelationFamily(
  conceptWrite: ReviewCurrentContentEditorPendingWrite,
): 'definition' | 'descriptor' | undefined {
  if (conceptWrite.entry.target.rendererKind === 'concept-definition') {
    return 'definition';
  }
  if (conceptWrite.entry.target.rendererKind === 'descriptor') {
    return 'descriptor';
  }
  return undefined;
}

function resolveCurrentCdfConceptBindingRelationKind() {
  const meta = readReviewCardMeta(state.value.content.card as FSRSCard | null | undefined);
  const relationKind = readReviewRecordString(meta, 'relationKind');
  return relationKind.includes('definition') || relationKind.includes('descriptor')
    ? relationKind as ReturnType<typeof readCdfLiveRelationMetadata>['relationKind']
    : undefined;
}

function buildCdfConceptBindingConfirmationPreview(
  plan: CdfConceptBindingEditPlan,
): ReviewCurrentContentEditorRelationPreview {
  const diagnostic = plan.diagnostics[0];
  return {
    title: t('reviewConceptReferenceStaleConfirmTitle', '确认修复异常概念引用'),
    message: formatCdfConceptBindingDiagnostic(diagnostic, plan),
    confirmText: t('reviewConceptReferenceStaleConfirmText', '修复并保存'),
    cancelText: t('cancel', '取消'),
    raw: {
      kind: 'cdf-concept-binding-confirmation',
      plan,
    } satisfies CdfConceptBindingConfirmationRaw,
  };
}

function formatCdfConceptBindingDiagnostic(
  diagnostic: CdfConceptBindingEditDiagnostic | undefined,
  plan?: CdfConceptBindingEditPlan,
): string {
  const code = diagnostic?.code;
  if (code === 'invalid-target-block') {
    return t('reviewConceptReferenceInvalidTarget', '请选择文档块作为概念卡');
  }
  if (code === 'invalid-source-grammar') {
    return t('reviewConceptReferenceInvalidGrammar', '当前关系源码含有多个 CDF 操作符，无法安全改写概念引用');
  }
  if (code === 'ambiguous-concept-reference') {
    return t('reviewConceptReferenceAmbiguous', '当前关系源码里有多个块引用，无法判断哪个是概念引用');
  }
  if (code === 'descriptor-structure-repair-unavailable') {
    return t('reviewConceptReferenceDescriptorStructureUnavailable', '当前描述符没有可安全绑定的概念边界，请先在源文档建立概念边界后再保存');
  }
  if (code === 'missing-source-block') {
    return t('reviewConceptReferenceSourceMissing', '找不到可改写的关系源码块');
  }
  if (code === 'stale-old-concept-reference') {
    return t(
      'reviewConceptReferenceStaleConfirmContent',
      '编辑器记录的旧概念与源码当前概念不一致：记录 {expected}，源码 {actual}，将改为 {selected}。确认修复？',
    )
      .replace('{expected}', diagnostic?.expectedConceptBlockId || plan?.expectedConceptBlockId || '-')
      .replace('{actual}', diagnostic?.actualConceptBlockId || '-')
      .replace('{selected}', diagnostic?.selectedConceptBlockId || plan?.selectedConceptBlockId || '-');
  }
  return t('reviewConceptReferenceWriteUnavailable', '当前关系源码无法安全改写概念引用');
}

function getCurrentStructuredDescriptorGroupLeaf(): boolean {
  const model = reviewInlineCardEditorStructuredModel.value;
  return model.mode === 'structured'
    && model.family === 'descriptor'
    && hasReviewStructuredDescriptorGroupLeafShape(state.value.content.card as FSRSCard | null | undefined);
}

function getStructuredConflictResolution(
  sourceTargetId: string,
  fieldId: string,
  latestSource: string,
): ReviewEditableTargetConflictResolution | null {
  const resolution = reviewStructuredConflictResolutionsBySourceTarget.get(sourceTargetId)?.get(fieldId);
  if (!resolution || resolution.latestSource !== latestSource) {
    return null;
  }
  return resolution.resolution;
}

function setStructuredConflictResolution(
  sourceTargetId: string,
  fieldId: string,
  resolution: ReviewEditableTargetConflictResolution,
  latestSource?: string,
): void {
  let fieldResolutions = reviewStructuredConflictResolutionsBySourceTarget.get(sourceTargetId);
  if (!fieldResolutions) {
    fieldResolutions = new Map();
    reviewStructuredConflictResolutionsBySourceTarget.set(sourceTargetId, fieldResolutions);
  }
  fieldResolutions.set(fieldId, {
    resolution,
    latestSource,
  });
}

function clearStructuredConflictResolution(sourceTargetId: string, fieldId?: string): void {
  const fieldResolutions = reviewStructuredConflictResolutionsBySourceTarget.get(sourceTargetId);
  if (!fieldResolutions) {
    return;
  }
  if (fieldId) {
    fieldResolutions.delete(fieldId);
  } else {
    fieldResolutions.clear();
  }
  if (fieldResolutions.size === 0) {
    reviewStructuredConflictResolutionsBySourceTarget.delete(sourceTargetId);
  }
}

function setReviewConceptReferenceOptions(
  targetId: string,
  options: ReviewConceptReferenceSearchOption[],
): void {
  reviewConceptReferenceOptionsByTarget.value = {
    ...reviewConceptReferenceOptionsByTarget.value,
    [targetId]: options,
  };
}

async function searchCurrentContentEditorConceptReference(targetId: string, query: string): Promise<void> {
  const normalized = String(query || '').trim();
  const nextSeq = (reviewConceptReferenceSearchSeqByTarget.get(targetId) || 0) + 1;
  reviewConceptReferenceSearchSeqByTarget.set(targetId, nextSeq);
  if (!normalized || /^\d{14}-[a-z0-9]{7}$/i.test(normalized)) {
    setReviewConceptReferenceOptions(targetId, []);
    return;
  }

  const reviewService = getReviewService();
  if (!reviewService?.searchConceptReferenceBlocks) {
    setReviewConceptReferenceOptions(targetId, []);
    return;
  }

  try {
    const options = await reviewService.searchConceptReferenceBlocks(normalized);
    if (reviewConceptReferenceSearchSeqByTarget.get(targetId) !== nextSeq) {
      return;
    }
    setReviewConceptReferenceOptions(targetId, options);
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to search concept reference blocks:', error);
    if (reviewConceptReferenceSearchSeqByTarget.get(targetId) === nextSeq) {
      setReviewConceptReferenceOptions(targetId, []);
    }
  }
}

function getTouchedStructuredGrammarFieldsForWrite(
  write: ReviewCurrentContentEditorPendingWrite,
): {
  family: Exclude<ReviewStructuredCardFamily, 'source'>;
  fields: ReviewStructuredField[];
  descriptorGroupLeaf: boolean;
} | null {
  const model = reviewInlineCardEditorStructuredModel.value;
  if (model.mode !== 'structured' || !isStructuredEditableFamily(model.family)) {
    return null;
  }

  const touchedFieldIds = reviewStructuredTouchedFieldIdsBySourceTarget.get(write.targetId);
  if (!touchedFieldIds || touchedFieldIds.size === 0) {
    return null;
  }

  const fields = model.fields.filter(field => (
    field.origin.kind === 'grammar'
    && field.origin.blockId === write.blockId
    && touchedFieldIds.has(field.id)
  ));
  if (fields.length === 0) {
    return null;
  }

  return {
    family: model.family,
    fields,
    descriptorGroupLeaf: model.family === 'descriptor'
      && hasReviewStructuredDescriptorGroupLeafShape(state.value.content.card as FSRSCard | null | undefined),
  };
}

async function validateCurrentContentEditorPendingWrites(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
): Promise<ReviewCurrentContentEditorValidationResult> {
  const reviewService = getReviewService();
  if (!reviewService) {
    return {};
  }

  const result: ReviewCurrentContentEditorValidationResult = {
    conflicts: [],
    updates: [],
  };
  const relationPreviews: ReviewCurrentContentEditorRelationPreview[] = [];

  const conceptBindingValidation = await mergeConceptReferenceWritesIntoMarkdown(pendingWrites);
  result.conflicts?.push(...(conceptBindingValidation.conflicts || []));
  if (conceptBindingValidation.relationPreview) {
    relationPreviews.push(conceptBindingValidation.relationPreview);
  }
  if ((result.conflicts || []).length > 0) {
    return result;
  }

  for (const write of pendingWrites) {
    if (write.sourceKind !== 'block-markdown') {
      continue;
    }
    const latestSource = String(await reviewService.getEditableBlockMarkdown(write.blockId) ?? '');
    if (latestSource === write.originalValue) {
      continue;
    }

    const touchedGrammar = getTouchedStructuredGrammarFieldsForWrite(write);
    if (!touchedGrammar) {
      if (getStructuredConflictResolution(write.targetId, 'source', latestSource)) {
        continue;
      }
      result.conflicts?.push({
        targetId: write.targetId,
        message: getReviewStructuredExternalConflictMessage(),
        sourceLatestValue: latestSource,
        draftValue: write.value,
        latestSource,
      });
      continue;
    }

    const latestValues = readStructuredGrammarFieldValues({
      source: latestSource,
      family: touchedGrammar.family,
      descriptorGroupLeaf: touchedGrammar.descriptorGroupLeaf,
    });
    const localValues = readStructuredGrammarFieldValues({
      source: write.value,
      family: touchedGrammar.family,
      descriptorGroupLeaf: touchedGrammar.descriptorGroupLeaf,
    });
    if (!latestValues || !localValues) {
      result.conflicts?.push({
        targetId: write.targetId,
        fieldId: touchedGrammar.fields[0]?.id,
        message: getReviewStructuredExternalConflictMessage(touchedGrammar.fields[0]),
      });
      continue;
    }

    const conflicts = touchedGrammar.fields.filter((field) => {
      const originalFieldValue = extractReviewStructuredGrammarFieldValue({
        field,
        family: touchedGrammar.family,
        source: write.originalValue,
        descriptorGroupLeaf: touchedGrammar.descriptorGroupLeaf,
      });
      if (originalFieldValue === null) {
        return true;
      }
      const externallyChanged = getReviewStructuredFieldHash(field, originalFieldValue)
        !== getReviewStructuredFieldHash(field, latestValues[field.role] ?? '');
      if (!externallyChanged) {
        return false;
      }
      return !getStructuredConflictResolution(write.targetId, field.id, latestSource);
    });
    if (conflicts.length > 0) {
      for (const field of conflicts) {
        result.conflicts?.push({
          targetId: write.targetId,
          fieldId: field.id,
          message: getReviewStructuredExternalConflictMessage(field),
          sourceLatestValue: latestValues[field.role] ?? '',
          draftValue: localValues[field.role] ?? '',
          latestSource,
        });
      }
      continue;
    }

    const mergedValues = { ...latestValues };
    for (const field of touchedGrammar.fields) {
      mergedValues[field.role] = localValues[field.role] ?? '';
    }
    const mergedSource = rewriteStructuredGrammarSource({
      source: latestSource,
      family: touchedGrammar.family,
      values: mergedValues,
      descriptorGroupLeaf: touchedGrammar.descriptorGroupLeaf,
    });
    if (mergedSource === null) {
      result.conflicts?.push({
        targetId: write.targetId,
        fieldId: touchedGrammar.fields[0]?.id,
        message: getReviewStructuredExternalConflictMessage(touchedGrammar.fields[0]),
      });
      continue;
    }

    if (mergedSource !== write.value) {
      result.updates?.push({
        targetId: write.targetId,
        value: mergedSource,
      });
    }
  }

  if ((result.conflicts || []).length === 0) {
    const relationPreview = await buildCurrentContentEditorRelationPreview(pendingWrites, result);
    if (relationPreview) {
      relationPreviews.push(relationPreview);
    }
  }
  if (relationPreviews.length > 0) {
    result.relationPreviews = relationPreviews;
    result.relationPreview = relationPreviews[0] || null;
  }

  return result;
}

function readReviewRecordString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readReviewCardMeta(card: FSRSCard | null | undefined): Record<string, unknown> {
  return isRecord(card?.meta) ? card.meta as Record<string, unknown> : {};
}

function readReviewFieldMapping(meta: Record<string, unknown>): Record<string, string> {
  if (!isRecord(meta.fieldMapping)) {
    return {};
  }
  const mapping: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta.fieldMapping)) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) {
      mapping[key] = normalized;
    }
  }
  return mapping;
}

function isCurrentReviewCdfLiveRelationCard(): boolean {
  const card = state.value.content.card as FSRSCard | null | undefined;
  const meta = readReviewCardMeta(card);
  return Boolean(
    readReviewRecordString(meta, 'liveRelationKey')
    || readReviewRecordString(meta, 'relationAuthority') === 'live-backlink'
    || readReviewRecordString(meta, 'relationKind').includes('definition')
    || readReviewRecordString(meta, 'relationKind').includes('descriptor'),
  );
}

function isReviewCardStillSessionReviewable(card: FSRSCard | null | undefined): boolean {
  if (!card) {
    return false;
  }
  const blockId = String(card.blockId || '').trim();
  if (!blockId) {
    return false;
  }

  return !(card as { deleted?: boolean; dismissed?: boolean }).deleted
    && !(card as { sourceMissingAt?: unknown }).sourceMissingAt
    && card.skipped !== true
    && readReviewRecordString(readReviewCardMeta(card), 'sourceMissingAt') === '';
}

function buildInvalidAfterSourceEditDiagnostic(card: FSRSCard | null | undefined): ReviewNoScoreRemovalDiagnostic {
  const cardId = String(card?.id || resolveCurrentReviewCardId() || '').trim();
  const blockId = String(card?.blockId || resolveCurrentReviewBlockId() || '').trim();
  return {
    kind: 'invalid-after-source-edit',
    cardId,
    blockId,
    sourceBlockId: resolveCurrentReviewSourceBlockId() || blockId,
    reasonCode: 'invalid-after-source-edit',
    reasonLabel: t('reviewSourceEditInvalidAfterSave', '保存后当前卡已不再适合本轮复习'),
  };
}

async function refreshSameSessionSnapshotsAfterSourceEdit(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
): Promise<boolean> {
  const markdownBlockIds = Array.from(new Set(
    pendingWrites
      .filter(write => write.sourceKind === 'block-markdown')
      .map(write => String(write.blockId || '').trim())
      .filter(Boolean),
  ));
  if (markdownBlockIds.length === 0) {
    return true;
  }

  const dependencyBlockIds = Array.from(new Set([
    ...reviewSourceRefreshHostRuntime.getDependencyBlockIds(),
    ...markdownBlockIds,
  ].map(value => String(value || '').trim()).filter(Boolean)));
  const currentReference = getCurrentReviewCardReference();
  if ((!currentReference.cardId && !currentReference.blockId) || dependencyBlockIds.length === 0) {
    return true;
  }

  const reviewService = getReviewService();
  if (typeof reviewService?.executeReviewSourceRefresh !== 'function') {
    return true;
  }

  try {
    const timestamp = Date.now();
    const impact = await reviewService.executeReviewSourceRefresh({
      commandId: `review-source-edit-save:${currentReference.cardId || currentReference.blockId}:${timestamp}`,
      idempotencyKey: `review-source-edit-save:${currentReference.cardId || currentReference.blockId}:${markdownBlockIds.join(',')}:${timestamp}`,
      sessionId: reviewSessionId.value,
      currentCardId: currentReference.cardId || null,
      currentBlockId: currentReference.blockId || null,
      changedBlockIds: markdownBlockIds,
      dependencyBlockIds,
    });
    return impact.status !== 'failed' && impact.status !== 'unavailable';
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Same-session source snapshot refresh failed after source edit save:', {
      blockIds: markdownBlockIds,
      error,
    });
    return false;
  }
}

async function applyOrdinarySourceEditSessionImpact(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
): Promise<ReviewSourceEditSessionImpact> {
  const sameSessionRefreshOk = await refreshSameSessionSnapshotsAfterSourceEdit(pendingWrites);
  if (!sameSessionRefreshOk) {
    showMessage(
      t('reviewSourceEditSessionRefreshFailed', '源内容已保存；本轮部分同源卡可能要等下次加载才刷新'),
      5000,
      'warning',
    );
  }

  const currentReference = getCurrentReviewCardReference();
  const manager = getReviewDataManager();
  if (!manager || !currentReference.cardId) {
    return {
      currentStillReviewable: true,
      refreshedSameSourceSnapshots: sameSessionRefreshOk,
    };
  }

  try {
    const nextCard = await manager.getCard(currentReference.cardId);
    if (getCurrentReviewCardReference().cardId !== currentReference.cardId) {
      return {
        currentStillReviewable: true,
        refreshedSameSourceSnapshots: sameSessionRefreshOk,
      };
    }
    if (isReviewCardStillSessionReviewable(nextCard)) {
      await hook.refreshCurrentItem(nextCard, buildExpectedRefreshOptions(currentReference));
      return {
        currentStillReviewable: true,
        refreshedSameSourceSnapshots: sameSessionRefreshOk,
      };
    }

    await removeCardIdsFromActiveQueue([currentReference.cardId, currentReference.blockId]);
    await hook.advanceWithoutFeedback({
      diagnostic: buildInvalidAfterSourceEditDiagnostic(nextCard),
      decrementTotal: true,
    });
    showMessage(
      t('reviewSourceEditInvalidAfterSaveToast', '源内容已保存；当前卡已移出本轮且未评分'),
      3000,
      'warning',
    );
    return {
      currentStillReviewable: false,
      refreshedSameSourceSnapshots: sameSessionRefreshOk,
    };
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to re-evaluate current card after source edit save:', {
      cardId: currentReference.cardId,
      error,
    });
    return {
      currentStillReviewable: true,
      refreshedSameSourceSnapshots: sameSessionRefreshOk,
    };
  }
}

function resolveCurrentCdfLiveSourceBlockId(pendingWrites: ReviewCurrentContentEditorPendingWrite[]): string {
  const card = state.value.content.card as FSRSCard | null | undefined;
  const meta = readReviewCardMeta(card);
  const mapping = readReviewFieldMapping(meta);
  return readReviewRecordString(meta, 'sourceBlockId')
    || mapping.definition
    || mapping.descriptor
    || resolveCurrentReviewSourceBlockId()
    || pendingWrites[0]?.blockId
    || '';
}

function buildDraftMarkdownByBlockId(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  updates: ReviewCurrentContentEditorValidationResult['updates'] = [],
): Record<string, string> {
  const markdownWrites = pendingWrites.filter(write => write.sourceKind === 'block-markdown');
  const valueByTargetId = new Map(markdownWrites.map(write => [write.targetId, write.value]));
  for (const update of updates || []) {
    if (markdownWrites.some(write => write.targetId === update.targetId)) {
      valueByTargetId.set(update.targetId, update.value);
    }
  }

  const draftMarkdownByBlockId: Record<string, string> = {};
  for (const write of markdownWrites) {
    draftMarkdownByBlockId[write.blockId] = valueByTargetId.get(write.targetId) ?? write.value;
  }
  return draftMarkdownByBlockId;
}

function buildCurrentCdfWriteSyncOptions(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  updates?: ReviewCurrentContentEditorValidationResult['updates'],
  persist = false,
): CdfLiveRelationWriteSyncOptions | null {
  if (!isCurrentReviewCdfLiveRelationCard()) {
    return null;
  }

  const sourceBlockId = resolveCurrentCdfLiveSourceBlockId(pendingWrites);
  if (!sourceBlockId) {
    return null;
  }

  const markdownWrites = pendingWrites.filter(write => write.sourceKind === 'block-markdown');
  const changedBlockIds = Array.from(new Set(markdownWrites.map(write => write.blockId).filter(Boolean)));
  return {
    sourceBlockId,
    changedBlockId: changedBlockIds.length === 1 ? changedBlockIds[0] : sourceBlockId,
    reconciliationScope: 'block-edit',
    persist,
    ...(persist ? {} : { draftMarkdownByBlockId: buildDraftMarkdownByBlockId(pendingWrites, updates) }),
  };
}

function summarizeCdfRelationPreviewActions(actions: CdfReconciliationAction[]): CdfRelationPreviewSummary {
  return actions.reduce((summary, action) => {
    if (action.kind === 'create-card') {
      summary.create += 1;
      return summary;
    }
    if (action.reason === 'orphaned' || action.status === 'orphaned-by-live-relation') {
      summary.orphan += 1;
      return summary;
    }
    if (action.reason === 'duplicate' || action.status === 'duplicate-live-relation') {
      summary.duplicate += 1;
      return summary;
    }
    if (action.reason === 'reactivated') {
      summary.restore += 1;
      return summary;
    }
    if (action.reason === 'legacy-unavailable' || action.status === 'legacy-relation-unavailable') {
      summary.legacyUnavailable += 1;
    }
    return summary;
  }, {
    create: 0,
    orphan: 0,
    duplicate: 0,
    restore: 0,
    legacyUnavailable: 0,
  });
}

function hasPreviewableCdfRelationChange(actions: CdfReconciliationAction[]): boolean {
  const summary = summarizeCdfRelationPreviewActions(actions);
  return summary.create > 0
    || summary.orphan > 0
    || summary.duplicate > 0
    || summary.restore > 0
    || summary.legacyUnavailable > 0;
}

function hasConceptReferencePendingWrite(pendingWrites: ReviewCurrentContentEditorPendingWrite[]): boolean {
  return pendingWrites.some(write => write.sourceKind === 'concept-reference');
}

function countSameSourceRelatedRelationImpacts(
  actions: CdfReconciliationAction[],
  sourceBlockId: string,
): number {
  const normalizedSourceBlockId = String(sourceBlockId || '').trim();
  const currentCardId = resolveCurrentReviewCardId();
  if (!normalizedSourceBlockId || !currentCardId) {
    return 0;
  }

  const impactedCardIds = new Set<string>();
  for (const action of actions) {
    if (
      action.kind !== 'update-card-meta'
      || action.cardId === currentCardId
      || action.relation?.sourceBlockId !== normalizedSourceBlockId
    ) {
      continue;
    }
    impactedCardIds.add(action.cardId);
  }
  return impactedCardIds.size;
}

function formatReviewCountLabel(label: string, count: number): string {
  return label.replace('{count}', String(count));
}

function buildCdfRelationPreviewSummaryItems(summary: CdfRelationPreviewSummary): CdfRelationPreviewDialogProps['summary'] {
  return [
    {
      key: 'create',
      label: t('reviewCdfRelationPreviewCategoryCreate', '新建关系'),
      count: summary.create,
    },
    {
      key: 'orphan',
      label: t('reviewCdfRelationPreviewCategoryOrphan', '暂停孤儿'),
      count: summary.orphan,
    },
    {
      key: 'duplicate',
      label: t('reviewCdfRelationPreviewCategoryDuplicate', '暂停重复'),
      count: summary.duplicate,
    },
    {
      key: 'restore',
      label: t('reviewCdfRelationPreviewCategoryRestore', '恢复关系'),
      count: summary.restore,
    },
    {
      key: 'legacy-unavailable',
      label: t('reviewCdfRelationPreviewCategoryLegacy', '旧关系不可用'),
      count: summary.legacyUnavailable,
    },
  ];
}

function buildCdfRelationPreviewCountLines(summary: CdfRelationPreviewSummary): string[] {
  return [
    [t('reviewCdfRelationPreviewCreateCount', '新建 {count} 张'), summary.create],
    [t('reviewCdfRelationPreviewOrphanCount', '暂停孤儿 {count} 张'), summary.orphan],
    [t('reviewCdfRelationPreviewDuplicateCount', '暂停重复 {count} 张'), summary.duplicate],
    [t('reviewCdfRelationPreviewRestoreCount', '恢复 {count} 张'), summary.restore],
    [t('reviewCdfRelationPreviewLegacyCount', '旧关系不可用 {count} 张'), summary.legacyUnavailable],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => formatReviewCountLabel(String(label), Number(count)));
}

function resolveCdfRelationPreviewCurrentImpact(dryRun: CdfLiveRelationWriteSyncResult): string {
  const currentCardId = resolveCurrentReviewCardId();
  const currentAction = dryRun.actions.find(action => (
    action.kind === 'update-card-meta'
    && action.cardId === currentCardId
  ));
  if (currentAction?.kind !== 'update-card-meta') {
    return t('reviewCdfRelationPreviewCurrentUnchanged', '当前卡保存后保持在本轮复习中');
  }
  return currentAction.status === 'active-live'
    ? t('reviewCdfRelationPreviewCurrentRerender', '当前卡保存后将重新渲染')
    : t('reviewCdfRelationPreviewCurrentExit', '当前卡保存后将移出本轮复习且不评分');
}

function resolveCdfRelationPreviewSessionImpact(summary: CdfRelationPreviewSummary): string {
  return summary.create > 0 || summary.restore > 0
    ? t('reviewCdfRelationPreviewSessionMayAppend', '新建或恢复的到期卡后续会按会话规则追加到队尾')
    : t('reviewCdfRelationPreviewSessionNoAppend', '本次不会追加新关系卡到队尾');
}

function buildCdfRelationPreviewDetailItems(actions: CdfReconciliationAction[]): CdfRelationPreviewDialogProps['details'] {
  return actions.map((action) => {
    if (action.kind === 'create-card') {
      return {
        kind: t('reviewCdfRelationPreviewDetailCreate', '新建'),
        text: [
          action.relation.sourceBlockId,
          action.relation.conceptBlockId,
          action.relation.relationKind,
        ].filter(Boolean).join(' / '),
      };
    }
    const kindByReason: Record<string, string> = {
      orphaned: t('reviewCdfRelationPreviewDetailOrphan', '暂停孤儿'),
      duplicate: t('reviewCdfRelationPreviewDetailDuplicate', '暂停重复'),
      reactivated: t('reviewCdfRelationPreviewDetailRestore', '恢复'),
      'legacy-unavailable': t('reviewCdfRelationPreviewDetailLegacy', '旧关系不可用'),
      'legacy-migrated': t('reviewCdfRelationPreviewDetailMigrated', '旧关系迁移'),
      'active-live': t('reviewCdfRelationPreviewDetailActive', '保持活跃'),
    };
    const relationLabel = action.relation
      ? [action.relation.sourceBlockId, action.relation.conceptBlockId, action.relation.relationKind].filter(Boolean).join(' / ')
      : action.status;
    return {
      kind: kindByReason[action.reason] || action.reason,
      text: [action.cardId, relationLabel].filter(Boolean).join(' / '),
    };
  });
}

function buildCdfRelationPreviewDialogProps(dryRun: CdfLiveRelationWriteSyncResult): CdfRelationPreviewDialogProps {
  const summary = summarizeCdfRelationPreviewActions(dryRun.actions);
  return {
    summary: buildCdfRelationPreviewSummaryItems(summary),
    currentImpact: resolveCdfRelationPreviewCurrentImpact(dryRun),
    sessionImpact: resolveCdfRelationPreviewSessionImpact(summary),
    details: buildCdfRelationPreviewDetailItems(dryRun.actions),
    currentImpactLabel: t('reviewCdfRelationPreviewCurrentImpactLabel', '当前卡'),
    sessionImpactLabel: t('reviewCdfRelationPreviewSessionImpactLabel', '本轮复习'),
    detailsLabel: t('reviewCdfRelationPreviewDetailsLabel', '展开详情'),
    noDetailsLabel: t('reviewCdfRelationPreviewNoDetails', '无详细变化'),
    confirmLabel: t('save', '保存'),
    cancelLabel: t('cancel', '取消'),
  };
}

function buildCdfRelationPreviewMessage(dryRun: CdfLiveRelationWriteSyncResult): string {
  const summary = summarizeCdfRelationPreviewActions(dryRun.actions);
  const countParts = buildCdfRelationPreviewCountLines(summary);

  return [
    countParts.join('；') || t('reviewCdfRelationPreviewNoRelationChange', '未发现关系集合变化'),
    resolveCdfRelationPreviewCurrentImpact(dryRun),
    resolveCdfRelationPreviewSessionImpact(summary),
  ].filter(Boolean).join('\n');
}

type CdfRelationUpdateAction = Extract<CdfReconciliationAction, { kind: 'update-card-meta' }>;

function findCdfRelationUpdateActionForCard(
  actions: CdfReconciliationAction[],
  cardId: string,
): CdfRelationUpdateAction | null {
  return actions.find((action): action is CdfRelationUpdateAction => (
    action.kind === 'update-card-meta'
    && action.cardId === cardId
  )) || null;
}

function resolveCdfWriteSyncCardMetaForCurrent(
  result: CdfLiveRelationWriteSyncResult,
  cardId: string,
  currentCard: FSRSCard | null | undefined,
): Record<string, unknown> | null {
  const action = findCdfRelationUpdateActionForCard(result.actions, cardId);
  if (action) {
    return action.meta;
  }

  const updatedCard = result.updatedCards.find((card) => String(card.id || '').trim() === cardId);
  if (updatedCard) {
    return readReviewCardMeta(updatedCard);
  }

  if (String(currentCard?.id || '').trim() === cardId) {
    return readReviewCardMeta(currentCard);
  }

  return null;
}

async function appendDueCdfCardsFromCurrentEditorSave(
  result: CdfLiveRelationWriteSyncResult,
): Promise<void> {
  const cardsToConsider = [
    ...result.createdCards,
    ...result.updatedCards.filter((card) => {
      const updateAction = findCdfRelationUpdateActionForCard(result.actions, String(card.id || '').trim());
      return updateAction?.reason === 'reactivated';
    }),
  ];
  if (cardsToConsider.length === 0) {
    return;
  }
  await reviewDataObserverRuntime.appendDueCdfCardsToActiveSessionTail(
    cardsToConsider,
    'review-editor-save',
  );
}

function resolveCurrentCdfSourceBlockIdFromLiveMetadata(card?: FSRSCard | null): string {
  return readCdfLiveRelationMetadata(card).sourceBlockId || '';
}

function isSameSourceActiveLiveCdfCard(card: FSRSCard, sourceBlockId: string): boolean {
  const normalizedSourceBlockId = String(sourceBlockId || '').trim();
  if (!normalizedSourceBlockId) {
    return false;
  }
  const liveMeta = readCdfLiveRelationMetadata(card);
  return liveMeta.sourceBlockId === normalizedSourceBlockId
    && liveMeta.liveRelationStatus === 'active-live';
}

async function resolveSameSourceActiveLiveCdfCards(sourceBlockId: string): Promise<FSRSCard[]> {
  const manager = getReviewDataManager();
  if (!manager) {
    return [];
  }

  try {
    const cards = await manager.getCards();
    const byCardId = new Map<string, FSRSCard>();
    for (const card of cards) {
      const cardId = String(card?.id || '').trim();
      if (!cardId || !isSameSourceActiveLiveCdfCard(card, sourceBlockId)) {
        continue;
      }
      byCardId.set(cardId, card);
    }
    return Array.from(byCardId.values());
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewView] Failed to resolve same-source CDF cards for reset:', {
      sourceBlockId,
      error,
    });
    return [];
  }
}

async function handleResetCurrentProgress(): Promise<void> {
  const cardEditorService = getCardEditorService();
  const reference = resolveCurrentReviewCardActionReference();
  if (!reference) {
    return;
  }
  if (!cardEditorService || typeof cardEditorService.resetProgress !== 'function') {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const confirmed = await confirmDialog({
    title: t('resetConfirmTitle', '确认重置进度'),
    content: t('resetConfirmContent', '这会清空本卡的复习历史，且不能撤销。是否继续？'),
    confirmText: t('reset', '重置'),
    cancelText: t('cancel', '取消'),
  });
  if (!confirmed) {
    return;
  }

  try {
    const snapshot = await cardEditorService.resetProgress(reference.cardId);
    await hook.refreshCurrentItem(snapshot.card, buildExpectedRefreshOptions(reference));
    showMessage(t('resetDone', '已重置卡片'), 3000, 'info');
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to reset current card progress:', error);
    showMessage(t('resetFailed', '重置失败'), 5000, 'error');
  }
}

async function handleResetSameSourceProgress(): Promise<void> {
  const cardEditorService = getCardEditorService();
  const reference = resolveCurrentReviewCardActionReference();
  if (!reference) {
    return;
  }
  if (!cardEditorService || typeof cardEditorService.resetProgress !== 'function') {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const sourceBlockId = resolveCurrentCdfSourceBlockIdFromLiveMetadata(state.value.content.card as FSRSCard | null | undefined);
  if (!sourceBlockId) {
    showMessage(t('reviewResetSameSourceNoSource', '当前卡片没有 CDF 同源标识'), 3000, 'info');
    return;
  }

  const targetCards = await resolveSameSourceActiveLiveCdfCards(sourceBlockId);
  if (targetCards.length === 0) {
    showMessage(t('reviewResetSameSourceNoTargets', '没有可重置的同源活跃关系卡'), 3000, 'info');
    return;
  }

  const confirmed = await confirmDialog({
    title: t('reviewResetSameSourceConfirmTitle', '重置同源活跃关系卡'),
    content: t(
      'reviewResetSameSourceConfirmContent',
      '将重置同一 sourceBlockId 下 {count} 张 active-live 关系卡的学习进度。此操作不可撤销。是否继续？',
    ).replace('{count}', String(targetCards.length)),
    confirmText: t('reset', '重置'),
    cancelText: t('cancel', '取消'),
  });
  if (!confirmed) {
    return;
  }

  const resetCardIds = targetCards.map((card) => String(card.id || '').trim()).filter(Boolean);
  const succeededCardIds: string[] = [];
  const failedCardIds: string[] = [];
  let currentSnapshotCard: FSRSCard | null = null;

  for (const cardId of resetCardIds) {
    try {
      const snapshot = await cardEditorService.resetProgress(cardId);
      succeededCardIds.push(cardId);
      if (cardId === reference.cardId) {
        currentSnapshotCard = snapshot.card;
      }
    } catch (error) {
      failedCardIds.push(cardId);
      logger.warn('[SiYuanMemo][ReviewView] Failed to reset same-source CDF card progress:', {
        cardId,
        error,
      });
    }
  }

  if (currentSnapshotCard) {
    await hook.refreshCurrentItem(currentSnapshotCard, buildExpectedRefreshOptions(reference));
  }

  if (failedCardIds.length > 0) {
    showMessage(
      t('reviewResetSameSourcePartial', '已重置 {done} 张同源活跃关系卡，另有 {failed} 张失败')
        .replace('{done}', String(succeededCardIds.length))
        .replace('{failed}', String(failedCardIds.length)),
      5000,
      'error',
    );
    return;
  }

  showMessage(
    t('reviewResetSameSourceDone', '已重置 {count} 张同源活跃关系卡')
      .replace('{count}', String(succeededCardIds.length)),
    3000,
    'info',
  );
}

async function applyCurrentReviewSessionImpactFromCdfWriteSync(
  result: CdfLiveRelationWriteSyncResult,
): Promise<void> {
  await appendDueCdfCardsFromCurrentEditorSave(result);

  const currentReference = getCurrentReviewCardReference();
  const currentCardId = currentReference.cardId;
  if (!currentCardId) {
    return;
  }

  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  const currentMeta = resolveCdfWriteSyncCardMetaForCurrent(result, currentCardId, currentCard);
  if (currentMeta) {
    await refreshCurrentReviewCard();
    return;
  }
}

async function buildCurrentContentEditorRelationPreview(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  validation: ReviewCurrentContentEditorValidationResult,
): Promise<ReviewCurrentContentEditorRelationPreview | null> {
  const reviewService = getReviewService();
  if (!reviewService?.syncCdfLiveRelationsAfterEditorWrite) {
    return null;
  }

  const options = buildCurrentCdfWriteSyncOptions(pendingWrites, validation.updates, false);
  if (!options) {
    return null;
  }

  const dryRun = await reviewService.syncCdfLiveRelationsAfterEditorWrite(options);
  if (!hasPreviewableCdfRelationChange(dryRun.actions)) {
    return null;
  }

  return {
    title: t('reviewCdfRelationPreviewTitle', '保存前预览关系变化'),
    message: buildCdfRelationPreviewMessage(dryRun),
    confirmText: t('save', '保存'),
    cancelText: t('cancel', '取消'),
    raw: {
      kind: 'cdf-live-relation-preview',
      dryRun,
      options,
      dialogProps: buildCdfRelationPreviewDialogProps(dryRun),
    } satisfies CdfRelationPreviewRaw,
  };
}

async function confirmCurrentContentEditorRelationPreview(
  preview: ReviewCurrentContentEditorRelationPreview,
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
): Promise<boolean> {
  const raw = preview.raw;
  if (isRecord(raw) && raw.kind === 'cdf-concept-binding-confirmation') {
    return confirmDialog({
      title: preview.title,
      content: preview.message,
      confirmText: preview.confirmText || t('reviewConceptReferenceStaleConfirmText', '修复并保存'),
      cancelText: preview.cancelText || t('cancel', '取消'),
      visualVariant: 'form',
    });
  }
  if (isRecord(raw) && raw.kind === 'cdf-live-relation-preview') {
    const cdfPreview = raw as CdfRelationPreviewRaw;
    const confirmedPreview = await new Promise<boolean>((resolve) => {
      let settled = false;
      let instance: ReturnType<typeof createVueDialog> | null = null;
      const settle = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        instance?.destroy();
        resolve(value);
      };
      instance = createVueDialog({
        title: preview.title,
        component: ReviewCdfRelationPreviewDialog,
        props: cdfPreview.dialogProps as unknown as Record<string, unknown>,
        events: {
          confirm: () => settle(true),
          cancel: () => settle(false),
        },
        width: '520px',
        height: '420px',
        responsive: true,
        visualVariant: 'form',
        containerClass: 'siyuanmemo-review-cdf-relation-preview-dialog',
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        },
      });
    });
    if (!confirmedPreview) {
      return false;
    }

    const relatedImpactCount = hasConceptReferencePendingWrite(pendingWrites)
      ? countSameSourceRelatedRelationImpacts(cdfPreview.dryRun.actions, cdfPreview.options.sourceBlockId)
      : 0;
    if (relatedImpactCount === 0) {
      return true;
    }

    return confirmDialog({
      title: t('reviewConceptReferenceRelatedConfirmTitle', '确认更换同源关系'),
      content: t(
        'reviewConceptReferenceRelatedConfirmContent',
        '这次更换概念会影响同一来源下 {count} 张其他关系卡。确认继续保存？',
      ).replace('{count}', String(relatedImpactCount)),
      confirmText: t('reviewConceptReferenceRelatedConfirmText', '继续保存'),
      cancelText: t('cancel', '取消'),
      visualVariant: 'form',
    });
  }

  return confirmDialog({
    title: preview.title,
    content: preview.message,
    confirmText: preview.confirmText || t('save', '保存'),
    cancelText: preview.cancelText || t('cancel', '取消'),
    visualVariant: 'form',
  });
}

async function reconcileCurrentContentEditorRelationWrites(
  pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  validation: ReviewCurrentContentEditorValidationResult,
): Promise<ReviewCurrentContentEditorAfterSuccessfulWritesResult | void> {
  const reviewService = getReviewService();
  if (!reviewService?.syncCdfLiveRelationsAfterEditorWrite) {
    const impact = await applyOrdinarySourceEditSessionImpact(pendingWrites);
    return { refreshVisibleContent: impact.currentStillReviewable };
  }

  const options = buildCurrentCdfWriteSyncOptions(pendingWrites, validation.updates, true);
  if (!options) {
    const impact = await applyOrdinarySourceEditSessionImpact(pendingWrites);
    return { refreshVisibleContent: impact.currentStillReviewable };
  }

  const result = await reviewService.syncCdfLiveRelationsAfterEditorWrite(options);
  await applyCurrentReviewSessionImpactFromCdfWriteSync(result);
}

function resolveStructuredGrammarFieldForTarget(targetId: string): {
  entry: (typeof reviewTextEditorEntries.value)[number];
  field: ReviewStructuredField;
} | null {
  const parsedTarget = parseReviewStructuredFieldTargetId(targetId);
  const sourceTargetId = parsedTarget?.sourceTargetId || targetId;
  const entry = reviewTextEditorEntries.value.find(item => item.target.id === sourceTargetId);
  const model = reviewInlineCardEditorStructuredModel.value;
  if (!entry || model.mode !== 'structured') {
    return null;
  }

  const matchingFields = model.fields.filter(field => (
    field.origin.kind === 'grammar'
    && field.origin.blockId === entry.target.blockId
  ));
  if (parsedTarget) {
    const field = matchingFields.find(candidate => candidate.id === parsedTarget.fieldId);
    return field ? { entry, field } : null;
  }

  const field = matchingFields[0];
  if (matchingFields.length !== 1 || !field) {
    return null;
  }

  return { entry, field };
}

function markStructuredGrammarFieldTouched(
  grammarField: { entry: (typeof reviewTextEditorEntries.value)[number]; field: ReviewStructuredField },
): void {
  let touchedFieldIds = reviewStructuredTouchedFieldIdsBySourceTarget.get(grammarField.entry.target.id);
  if (!touchedFieldIds) {
    touchedFieldIds = new Set<string>();
    reviewStructuredTouchedFieldIdsBySourceTarget.set(grammarField.entry.target.id, touchedFieldIds);
  }
  touchedFieldIds.add(grammarField.field.id);
}

function resolveCurrentContentEditorConflict(
  targetId: string,
  resolution: ReviewEditableTargetConflictResolution,
): void {
  const grammarField = resolveStructuredGrammarFieldForTarget(targetId);
  if (grammarField) {
    resolveStructuredGrammarFieldConflict(grammarField, resolution);
    return;
  }

  const entry = reviewTextEditorEntries.value.find(item => item.target.id === targetId);
  const conflict = entry?.conflict;
  if (!entry || !conflict) {
    return;
  }

  if (resolution === 'source-latest' && (conflict.latestSource || conflict.sourceLatestValue !== undefined)) {
    reviewTextEditorRuntime.replaceTargetDraft(
      entry.target.id,
      conflict.latestSource ?? conflict.sourceLatestValue ?? entry.value,
      conflict.latestSource,
    );
  }
  setStructuredConflictResolution(entry.target.id, conflict.fieldId || 'source', resolution, conflict.latestSource);
  reviewTextEditorRuntime.clearTargetConflict(entry.target.id);
}

function resolveStructuredGrammarFieldConflict(
  grammarField: { entry: (typeof reviewTextEditorEntries.value)[number]; field: ReviewStructuredField },
  resolution: ReviewEditableTargetConflictResolution,
): void {
  const model = reviewInlineCardEditorStructuredModel.value;
  if (model.mode !== 'structured' || !isStructuredEditableFamily(model.family)) {
    return;
  }

  const conflict = grammarField.entry.fieldConflicts?.[grammarField.field.id];
  if (!conflict) {
    return;
  }

  if (resolution === 'source-latest' && conflict.sourceLatestValue !== undefined) {
    const rewritten = rewriteStructuredGrammarFieldValue({
      source: grammarField.entry.value,
      family: model.family,
      field: grammarField.field,
      value: conflict.sourceLatestValue,
      descriptorGroupLeaf: getCurrentStructuredDescriptorGroupLeaf(),
    });
    if (rewritten === null) {
      showMessage(t('reviewStructuredConflictSourceLatestUnavailable', '当前字段无法安全套用源文档最新内容'), 3000, 'warning');
      return;
    }
    grammarField.entry.value = rewritten;
  }

  setStructuredConflictResolution(
    grammarField.entry.target.id,
    grammarField.field.id,
    resolution,
    conflict.latestSource,
  );
  reviewTextEditorRuntime.clearTargetConflict(grammarField.entry.target.id, grammarField.field.id);
}

function rewriteDefinitionGrammarField(
  grammarField: { entry: (typeof reviewTextEditorEntries.value)[number]; field: ReviewStructuredField },
  nextValue: string,
): boolean {
  const model = reviewInlineCardEditorStructuredModel.value;
  if (model.mode !== 'structured' || model.family !== 'definition' || grammarField.field.role !== 'definition') {
    return false;
  }

  const rewritten = replaceDefinitionInCardSourceGrammar({
    source: grammarField.entry.value,
    definition: nextValue,
  });
  if (!rewritten.ok) {
    showMessage(t('reviewDefinitionFieldWriteUnavailable', '当前定义源码无法安全改写'), 3000, 'warning');
    return true;
  }

  reviewTextEditorRuntime.updateTargetValue(grammarField.entry.target.id, rewritten.source);
  return true;
}

function rewriteDescriptorGrammarField(
  grammarField: { entry: (typeof reviewTextEditorEntries.value)[number]; field: ReviewStructuredField },
  nextValue: string,
): boolean {
  const model = reviewInlineCardEditorStructuredModel.value;
  if (
    model.mode !== 'structured'
    || model.family !== 'descriptor'
    || (grammarField.field.role !== 'cue' && grammarField.field.role !== 'answer')
  ) {
    return false;
  }

  const fields = model.fields.filter(field => (
    field.origin.kind === 'grammar'
    && field.origin.blockId === grammarField.entry.target.blockId
  ));
  const cueField = fields.find(field => field.role === 'cue');
  const answerField = fields.find(field => field.role === 'answer');
  const rewritten = replaceDescriptorInCardSourceGrammar({
    source: grammarField.entry.value,
    cue: grammarField.field.role === 'cue' ? nextValue : cueField?.value ?? '',
    answer: grammarField.field.role === 'answer' ? nextValue : answerField?.value ?? '',
    descriptorGroupLeaf: hasReviewStructuredDescriptorGroupLeafShape(state.value.content.card as FSRSCard | null | undefined),
  });
  if (!rewritten.ok) {
    showMessage(t('reviewDescriptorFieldWriteUnavailable', '当前描述符源码无法安全改写'), 3000, 'warning');
    return true;
  }

  reviewTextEditorRuntime.updateTargetValue(grammarField.entry.target.id, rewritten.source);
  return true;
}

function rewriteItemGrammarField(
  grammarField: { entry: (typeof reviewTextEditorEntries.value)[number]; field: ReviewStructuredField },
  nextValue: string,
): boolean {
  const model = reviewInlineCardEditorStructuredModel.value;
  if (
    model.mode !== 'structured'
    || model.family !== 'item'
    || (grammarField.field.role !== 'question' && grammarField.field.role !== 'answer')
  ) {
    return false;
  }

  const fields = model.fields.filter(field => (
    field.origin.kind === 'grammar'
    && field.origin.blockId === grammarField.entry.target.blockId
  ));
  const questionField = fields.find(field => field.role === 'question');
  const answerField = fields.find(field => field.role === 'answer');
  const rewritten = replaceItemInCardSourceGrammar({
    source: grammarField.entry.value,
    question: grammarField.field.role === 'question' ? nextValue : questionField?.value ?? '',
    answer: grammarField.field.role === 'answer' ? nextValue : answerField?.value ?? '',
  });
  if (!rewritten.ok) {
    showMessage(t('reviewItemFieldWriteUnavailable', '当前问答源码无法安全改写'), 3000, 'warning');
    return true;
  }

  reviewTextEditorRuntime.updateTargetValue(grammarField.entry.target.id, rewritten.source);
  return true;
}

function updateCurrentContentEditorTarget(targetId: string, nextValue: string): void {
  const grammarField = resolveStructuredGrammarFieldForTarget(targetId);
  if (!grammarField) {
    clearStructuredConflictResolution(targetId);
    reviewTextEditorRuntime.updateTargetValue(targetId, nextValue);
    return;
  }
  clearStructuredConflictResolution(grammarField.entry.target.id, grammarField.field.id);
  markStructuredGrammarFieldTouched(grammarField);
  if (rewriteDefinitionGrammarField(grammarField, nextValue)) {
    return;
  }
  if (rewriteDescriptorGrammarField(grammarField, nextValue)) {
    return;
  }
  if (rewriteItemGrammarField(grammarField, nextValue)) {
    return;
  }

  reviewTextEditorRuntime.updateTargetValue(targetId, nextValue);
}

function canOpenInlineCardEditor(): boolean {
  return reviewInlineCardEditorBridgeRuntime.canOpen();
}

function resolveSourceEditUnavailableMessage(): string {
  const guardState = contentRef.value?.getNativeSplitGuardState?.();
  switch (guardState?.rendererKind) {
    case 'image-occlusion':
      return t('sourceEditUnavailableImageOcclusion', '图像遮挡卡暂不支持复习中编辑源内容');
    case 'html':
      return t('sourceEditUnavailableHtml', 'HTML 内容暂不支持复习中编辑源内容');
    case 'empty':
      return t('sourceEditUnavailableEmpty', '当前没有可编辑的复习卡');
    case 'unsupported':
      return t('sourceEditUnavailableUnsupportedRenderer', '当前渲染器暂不支持复习中编辑源内容');
    case 'concept-definition':
      return t('sourceEditUnavailableConceptDefinition', '当前定义卡还没有可编辑的定义源块；概念引用稍后用选择器更换');
    case 'descriptor':
      return t('sourceEditUnavailableDescriptor', '当前描述符卡还没有可编辑的描述符源块；概念引用稍后用选择器更换');
    default:
      return t('sourceEditUnavailableNoTargets', '当前卡片没有可编辑的源块');
  }
}

async function openInlineCardEditor(): Promise<void> {
  if (reviewInlineCardEditorOpen.value) {
    await requestCloseInlineCardEditor();
    return;
  }

  await reviewInlineCardEditorBridgeRuntime.openEditor();
}

function closeInlineCardEditor(): void {
  reviewInlineCardEditorBridgeRuntime.close();
}

async function requestCloseInlineCardEditor(): Promise<boolean> {
  if (!reviewInlineCardEditorOpen.value) {
    return true;
  }
  if (!reviewTextEditorRuntime.dirty.value) {
    closeInlineCardEditor();
    return true;
  }

  const decision = await threeChoiceDialog({
    title: t('reviewInlineEditorDirtyExitTitle', '保存源内容改动？'),
    content: t('reviewInlineEditorDirtyExitContent', '当前源内容有未保存改动。离开前请选择保存、丢弃或继续编辑。'),
    primaryText: t('save', '保存'),
    secondaryText: t('discard', '丢弃'),
    cancelText: t('cancel', '取消'),
    visualVariant: 'form',
  });

  if (decision === 'primary') {
    return reviewInlineCardEditorBridgeRuntime.confirmSource();
  }
  if (decision === 'secondary') {
    closeInlineCardEditor();
    return true;
  }
  return false;
}

async function confirmInlineCardEditorSource(): Promise<void> {
  await reviewInlineCardEditorBridgeRuntime.confirmSource();
}

function buildMoreMenuItems(): ReviewMenuItem[] {
  const currentCard = state.value.content.card as FSRSCard | null | undefined;
  const contentTarget = state.value.meta.renderContext?.contentTarget;
  const openAsItems = buildOpenAsMenuItems();
  const peerInfo = resolveCurrentBlockPeerCards();
  const editableSourceTitle = shouldExposeHeaderEditButton()
    ? t('editSourceContent', '编辑源内容')
    : null;
  const hasReviewCard = hasCurrentReviewCard();
  const cardEditorService = getCardEditorService();
  const hasCardEditorService = Boolean(cardEditorService);
  const hasResetProgressService = typeof cardEditorService?.resetProgress === 'function';
  const currentCdfSourceBlockId = resolveCurrentCdfSourceBlockIdFromLiveMetadata(currentCard);

  return buildReviewMoreMenuItems({
    t,
    currentCardType: currentCard?.type,
    progressiveExcerptEnabled: isReviewProgressiveExcerptEnabled({
      contexts: getReviewProgressiveContexts(),
      logger,
    }),
    hasProgressiveSourceTarget: Boolean(
      contentTarget?.sourceLineage?.sourceBlockId
      || contentTarget?.identity.sourceLocationId,
    ),
    isLinearPieceReviewCard: contentTarget?.kind === 'source-location'
      && contentTarget.sourceLineage.mode === 'linear',
    openAsItems,
    editableSourceTitle,
    currentPriority: resolveCurrentReviewCardPriority(),
    currentDismissed: resolveCurrentReviewCardDismissed(),
    canEditCurrentPriority: hasReviewCard && hasCardEditorService,
    canResetCurrentProgress: hasReviewCard && hasResetProgressService,
    canResetSameSourceProgress: hasReviewCard && hasResetProgressService && Boolean(currentCdfSourceBlockId),
    canSuspendCurrentCard: hasReviewCard && hasCardEditorService,
    canDeleteCurrentCard: hasReviewCard && Boolean(getCardService()),
    peerCount: peerInfo?.peerCards.length ?? 0,
    isMobile: props.isMobile === true,
    actions: {
      progressiveExcerpt: () => void handleProgressiveExcerptFromReview('toolbar'),
      progressiveOpenSource: handleProgressiveOpenSource,
      progressiveCompletePiece: () => void handleProgressiveCompletePiece(),
      editSrs: openCurrentSrsEditor,
      editCurrentContent: () => void openInlineCardEditor(),
      toggleFullscreen: toggleReviewFullscreen,
      editPriority: () => void handleEditCurrentCardPriority(),
      resetCurrentProgress: () => void handleResetCurrentProgress(),
      resetSameSourceProgress: () => void handleResetSameSourceProgress(),
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

async function handleNeuralRoamEngineModeSelect(mode: NeuralRoamUserMode): Promise<void> {
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
    runNeuralRoamCommand: getNeuralRoamCommand() || undefined,
  });
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

  if (canUseReviewSideArea.value) {
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
  void payload;
  showMessage(t('semanticAnalyzePathAIUnavailable', 'AI path analysis moved to host Agent. Use MCP context instead.'), 3000, 'error');
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
  await reviewSemanticTemporaryRuntime.viewNode(nodeId, title, sourceBlockId);
}

function clearSemanticTemporaryView(): void {
  reviewSemanticTemporaryRuntime.clearTemporaryView();
}

function handleNeuralEngineModeMenu(ev: MouseEvent): void {
  const menu = new Menu('neural-engine-mode-menu');
  addReviewMenuItems(menu, buildReviewNeuralEngineModeMenuItems({
    t,
    currentMode: resolveCurrentNeuralRoamUserMode(),
    onSelect: async (mode) => {
      await handleNeuralRoamEngineModeSelect(mode);
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

function handleNeuralRoamRouteMenu(ev: MouseEvent): void {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    showMessage(t('neuralRoamRouteUnavailable', '航线不可用'), 3000, 'error');
    return;
  }
  void refreshNeuralRoamRoutes();
  const menu = new Menu('neural-roam-route-menu');
  for (const item of neuralRouteCommandRuntime.buildMenuItems()) {
    if (isReviewNeuralRouteMenuSeparator(item)) {
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
    void closeCurrentReviewSurface();
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

  if (actionType === 'edit-current-content') {
    void openInlineCardEditor();
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
      runNeuralRoamCommand: getNeuralRoamCommand() || undefined,
    });
  }
}

async function closeReviewSurfaceAfterTemporaryRouteClose(): Promise<void> {
  if (props.mode === 'tab') {
    const tabManager = getTabManager();
    if (reviewSessionId.value && typeof tabManager?.closeReviewTab === 'function') {
      await tabManager.closeReviewTab(reviewSessionId.value);
      return;
    }
    logger.warn('[SiYuanMemo][ReviewView] Failed to close tab review because TabManager.closeReviewTab is unavailable', {
      reviewSessionId: reviewSessionId.value,
    });
  }
  emit('close');
}

async function closeCurrentReviewSurface(): Promise<void> {
  const canCloseInlineEditor = await requestCloseInlineCardEditor();
  if (!canCloseInlineEditor) {
    return;
  }

  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue?.resolveTemporaryRouteCloseAction) {
    await closeReviewSurfaceAfterTemporaryRouteClose();
    return;
  }

  void closeActiveTemporaryRouteBeforeReviewClose().then((closeResult) => {
    if (closeResult !== 'cancelled') {
      void closeReviewSurfaceAfterTemporaryRouteClose();
    }
  });
}

async function closeActiveTemporaryRouteBeforeReviewClose(): Promise<'closed-or-none' | 'cancelled'> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue?.resolveTemporaryRouteCloseAction) {
    return 'closed-or-none';
  }
  try {
    const result = await closeTemporaryRouteWithPrompt(neuralQueue, async () => {
      const choice = await threeChoiceDialog({
        title: t('temporaryRouteDirtyTitle', '临时航线有改动'),
        content: t(
          'temporaryRouteDirtyClosePrompt',
          '当前临时航线已有新的概念、空间站或漫游记录。请选择保存为航线、丢弃，或取消关闭。',
        ),
        primaryText: t('saveAsRoute', '保存为航线'),
        secondaryText: t('discard', '丢弃'),
        cancelText: t('cancel', '取消'),
        visualVariant: 'workspace',
      });
      if (choice === 'primary') {
        return 'save';
      }
      if (choice === 'secondary') {
        return 'discard';
      }
      return 'cancel';
    });
    if (result.status === 'cancelled') {
      return 'cancelled';
    }
    if (result.status === 'closed' && result.action === 'save') {
      showMessage(t('temporaryRouteSaved', '临时航线已保存'), 2500, 'info');
    }
    return 'closed-or-none';
  } catch (error) {
    logger.error('[SiYuanMemo][ReviewView] Failed to close temporary NeuralRoam route:', error);
    showMessage(t('temporaryRouteCloseFailed', '临时航线关闭处理失败'), 3000, 'error');
    return 'cancelled';
  }
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
    runNeuralRoamCommand: getNeuralRoamCommand() || undefined,
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
    runNeuralRoamCommand: getNeuralRoamCommand() || undefined,
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
  const targetIdentity = state.value.meta.renderContext?.contentTarget?.identity
    ?? state.value.meta.renderContext?.unavailable?.identity;
  return String(
    targetIdentity?.blockId
    || state.value.actions.cardMeta?.blockID
    || state.value.content.card?.blockId
    || state.value.content.data
    || state.value.content.id
    || '',
  ).trim();
}

function resolveCurrentReviewSourceBlockId(): string {
  const target = state.value.meta.renderContext?.contentTarget;
  return String(
    target?.sourceLineage?.sourceBlockId
    || target?.identity.contentBlockId
    || resolvePrimaryEditableTarget()?.blockId
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
  const targetIdentity = state.value.meta.renderContext?.contentTarget?.identity
    ?? state.value.meta.renderContext?.unavailable?.identity;
  return String(
    targetIdentity?.cardId
    || state.value.actions.cardMeta?.cardID
    || state.value.content.card?.id
    || '',
  ).trim();
}

async function handleProgressiveExcerptFromReview(trigger: ReviewProgressiveExcerptTrigger): Promise<void> {
  const command = resolveCurrentReviewContentCommand('convert', { trigger });
  if (!command) {
    return;
  }
  await runReviewProgressiveExcerptCommand({
    trigger,
    contexts: getReviewProgressiveContexts(),
    currentCard: state.value.content.card,
    currentCardId: command.targetIdentity.cardId,
    root: rootRef.value,
    resolveSelection: resolveProgressiveExcerptSelectionSnapshot,
    resolveProtyle: (commonElement) => {
      const host = commonElement.closest('.fsrs-review-v2-content__protyle-host');
      return host ? getProtyleFromHost(host) : null;
    },
    filterQueue: getFilterGroupQueue(),
    filterCommandClient: getReviewFilterCommandClient(),
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
  const command = resolveCurrentReviewContentCommand('open-source');
  if (!command) {
    return;
  }
  const target = state.value.meta.renderContext?.contentTarget;
  handleProgressiveOpenSourceCommand({
    app: props.app,
    sourceTargetId: target?.sourceLineage?.sourceBlockId
      || command.targetIdentity.sourceLocationId
      || command.targetIdentity.contentBlockId,
    t,
    showMessage,
  });
}

async function handleProgressiveCompletePiece(): Promise<void> {
  const command = resolveCurrentReviewContentCommand('advance');
  if (!command) {
    return;
  }
  await handleProgressiveCompletePieceCommand({
    service: getReviewProgressiveReadingService(getReviewProgressiveContexts()),
    pieceDocId: command.targetIdentity.sourceLocationId || command.targetIdentity.blockId,
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
  showReviewSideArea,
  () => {
    updateReviewDialogContainerLayout();
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

.fsrs-review-v2--mobile .fsrs-review-v2__workspace {
  position: relative;
}

.fsrs-review-v2--mobile .fsrs-review-v2__workspace--with-side-area {
  grid-template-columns: minmax(0, 1fr);
}

.fsrs-review-v2--mobile .fsrs-review-v2__content-wrapper {
  min-height: 0;
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

.fsrs-review-v2__cdf-interruption {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 16px 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-error) 30%, var(--b3-border-color) 70%);
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-theme-error-light) 18%, var(--b3-theme-background) 82%);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1.5;
}

.fsrs-review-v2__cdf-interruption-main {
  min-width: 0;
}

.fsrs-review-v2__cdf-interruption-kicker {
  color: var(--b3-theme-error);
  font-size: 11px;
  font-weight: 600;
}

.fsrs-review-v2__cdf-interruption-title {
  margin-top: 2px;
  font-weight: 600;
}

.fsrs-review-v2__cdf-interruption-reason,
.fsrs-review-v2__cdf-interruption-meta {
  overflow-wrap: anywhere;
}

.fsrs-review-v2__cdf-interruption-reason {
  margin-top: 2px;
}

.fsrs-review-v2__cdf-interruption-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.fsrs-review-v2__cdf-interruption-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.fsrs-review-v2__blocked-summary {
  margin: 0 16px 12px;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1.5;
}

.fsrs-review-v2__blocked-summary > summary {
  cursor: pointer;
  font-weight: 600;
}

.fsrs-review-v2__blocked-summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.fsrs-review-v2__blocked-summary-item {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(96px, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent 28%);
}

.fsrs-review-v2__blocked-summary-reason,
.fsrs-review-v2__blocked-summary-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fsrs-review-v2__blocked-summary-id {
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.fsrs-review-v2--mobile .fsrs-review-v2__writer-recovery {
  flex-direction: column;
}

.fsrs-review-v2--mobile .fsrs-review-v2__writer-recovery-actions {
  width: 100%;
  flex-wrap: wrap;
}

.fsrs-review-v2--mobile .fsrs-review-v2__cdf-interruption {
  flex-direction: column;
}

.fsrs-review-v2--mobile .fsrs-review-v2__cdf-interruption-actions {
  width: 100%;
  justify-content: flex-start;
}

.fsrs-review-v2--mobile .fsrs-review-v2__blocked-summary-item {
  grid-template-columns: minmax(0, 1fr) auto;
}

.fsrs-review-v2--mobile .fsrs-review-v2__blocked-summary-id {
  grid-column: 1 / -1;
}

.fsrs-review-v2--mobile .fsrs-review-v2__temporary-view,
.fsrs-review-v2--mobile .fsrs-review-v2__writer-recovery,
.fsrs-review-v2--mobile .fsrs-review-v2__cdf-interruption {
  margin: 6px 8px 0;
}

.fsrs-review-v2--mobile .fsrs-review-v2__blocked-summary {
  margin: 0 8px 10px;
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

.fsrs-review-v2--mobile .fsrs-review-v2__side-area {
  position: absolute;
  inset: 0 0 0 auto;
  width: min(92vw, 420px);
  z-index: 8;
  border-left: 1px solid var(--b3-border-color);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.02);
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

