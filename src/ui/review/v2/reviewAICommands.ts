import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type {
  AIWorkbenchLegacyView,
  AIWorkbenchOpenOptions,
  AIWorkbenchSurface,
} from '@/types/ai';
import type { FSRSCard } from '@/types/card';
import type {
  NeuralRoamBatchSnapshot,
  ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';
import type { ArenaTargetKind, AIArenaScenarioId } from '@/types/arena';

export type ReviewAIEntryView = 'general-chat' | 'concept-coach';
export type ReviewAIRequestedView = ReviewAIEntryView | AIWorkbenchLegacyView;
export type ReviewAISurface = 'review-dialog-sidecar' | 'review-tab-companion';

export interface ReviewAIRegistryLike {
  hasReviewSession?: (sessionId: string) => boolean;
  getReviewSession?: (sessionId: string) => AIWorkbenchService | null;
  openReviewSession?: (options: AIWorkbenchOpenOptions & { sessionId: string; surface: ReviewAISurface }) => Promise<AIWorkbenchService>;
  updateReviewSessionContext?: (options: AIWorkbenchOpenOptions & { sessionId: string; surface: ReviewAISurface }) => Promise<AIWorkbenchService>;
}

export interface ReviewAIDialogManagerLike {
  openAiWorkbenchDialog?: (options?: AIWorkbenchOpenOptions) => Promise<void> | void;
}

export interface ReviewAITabManagerLike {
  openReviewAICompanionTab?: (options: AIWorkbenchOpenOptions & { sessionId: string; title: string }) => Promise<void> | void;
}

export interface BuildReviewAIOpenOptionsInput {
  view: ReviewAIRequestedView;
  surface?: AIWorkbenchSurface;
  sessionId: string;
  reviewChatKey: string | null;
  currentCard: FSRSCard | null;
  currentBlockId: string | null;
  queueType: string | null;
  queueProgress: ReviewQueueProgressSnapshot | null;
  revealed: boolean;
  neuralBatch: NeuralRoamBatchSnapshot | null;
  arenaScenarioId: AIArenaScenarioId | null;
  arenaTargetKind: ArenaTargetKind | null;
}

export function buildReviewAIChatKey(input: {
  queueType: string | null | undefined;
  queueLabel: string | null | undefined;
}): string | null {
  const queueType = String(input.queueType || '').trim();
  const queueLabel = String(input.queueLabel || '').trim();
  if (!queueType || !queueLabel) {
    return null;
  }
  return `${queueType}::${queueLabel}`;
}

export function buildReviewAIOpenOptions(input: BuildReviewAIOpenOptionsInput): AIWorkbenchOpenOptions {
  return {
    view: input.view,
    source: 'review',
    surface: input.surface,
    sessionId: input.sessionId,
    sourceReviewSessionId: input.sessionId,
    reviewChatKey: input.reviewChatKey,
    currentCard: input.currentCard,
    currentBlockId: input.currentBlockId,
    queueType: input.queueType,
    queueProgress: input.queueProgress,
    revealed: input.revealed,
    neuralBatch: input.neuralBatch,
    arenaScenarioId: input.arenaScenarioId,
    arenaTargetKind: input.arenaTargetKind,
  };
}

export function resolveDefaultReviewAIEntryView(configuredSkillId: unknown): ReviewAIEntryView {
  return configuredSkillId === 'concept-coach' ? 'concept-coach' : 'general-chat';
}

export function resolveReviewAIEntryView(input: {
  requestedView?: ReviewAIRequestedView;
  activeServiceView?: unknown;
  activeRegistryView?: unknown;
  defaultView: ReviewAIEntryView;
}): ReviewAIRequestedView {
  const requestedView = input.requestedView;
  if (requestedView) {
    if (requestedView === 'explain' || requestedView === 'make-cards' || requestedView === 'tutor') {
      return requestedView;
    }
    return requestedView === 'concept-coach' ? 'concept-coach' : 'general-chat';
  }

  const activeView = input.activeServiceView || input.activeRegistryView;
  return activeView === 'concept-coach' || activeView === 'general-chat'
    ? activeView
    : input.defaultView;
}

export function buildReviewAICompanionTitle(input: {
  view: ReviewAIRequestedView;
  reviewTitle: string;
  labels: {
    generalChat: string;
    conceptCoach: string;
    review: string;
  };
}): string {
  const viewTitle = input.view === 'general-chat'
    ? input.labels.generalChat
    : input.labels.conceptCoach;
  const reviewTitle = String(input.reviewTitle || input.labels.review).trim() || input.labels.review;
  return `${viewTitle} · ${reviewTitle}`;
}

export async function syncReviewAIContextIfNeededCommand(input: {
  visible: boolean;
  registry: ReviewAIRegistryLike | null;
  sessionId: string;
  surface: ReviewAISurface;
  activeView: ReviewAIRequestedView;
  buildOptions: (view: ReviewAIRequestedView, surface: ReviewAISurface) => AIWorkbenchOpenOptions;
  onService: (service: AIWorkbenchService) => void;
}): Promise<boolean> {
  if (!input.visible) {
    return false;
  }

  const registry = input.registry;
  if (!registry?.hasReviewSession?.(input.sessionId) || !registry.updateReviewSessionContext) {
    return false;
  }

  const service = await registry.updateReviewSessionContext({
    ...input.buildOptions(input.activeView, input.surface),
    view: input.activeView,
    surface: input.surface,
    sessionId: input.sessionId,
  });
  input.onService(service);
  return true;
}

export async function openReviewAIAssistantCommand(input: {
  requestedView?: ReviewAIRequestedView;
  mode: 'dialog' | 'tab' | undefined;
  canUseEmbeddedReviewAISidecar: boolean;
  sessionId: string;
  activeServiceView?: unknown;
  activeRegistryView?: unknown;
  defaultView: ReviewAIEntryView;
  registry: ReviewAIRegistryLike | null;
  dialogManager: ReviewAIDialogManagerLike | null;
  tabManager: ReviewAITabManagerLike | null;
  buildOptions: (view: ReviewAIRequestedView, surface: AIWorkbenchSurface) => AIWorkbenchOpenOptions;
  getCompanionTitle: (view: ReviewAIRequestedView) => string;
  onService: (service: AIWorkbenchService | null) => void;
  onOpenSidecar: () => void;
  onPluginNotReady: () => void;
}): Promise<void> {
  const view = resolveReviewAIEntryView({
    requestedView: input.requestedView,
    activeServiceView: input.activeServiceView,
    activeRegistryView: input.activeRegistryView,
    defaultView: input.defaultView,
  });
  const surface: ReviewAISurface = input.mode === 'tab'
    ? 'review-tab-companion'
    : 'review-dialog-sidecar';

  if (surface === 'review-dialog-sidecar' && !input.canUseEmbeddedReviewAISidecar) {
    if (!input.dialogManager?.openAiWorkbenchDialog) {
      input.onPluginNotReady();
      return;
    }
    await input.dialogManager.openAiWorkbenchDialog(input.buildOptions(view, 'standalone-dialog'));
    return;
  }

  const registry = input.registry;
  if (!registry?.openReviewSession) {
    input.onPluginNotReady();
    return;
  }

  if (surface === 'review-tab-companion') {
    if (!input.tabManager?.openReviewAICompanionTab) {
      input.onPluginNotReady();
      return;
    }

    await input.tabManager.openReviewAICompanionTab({
      ...input.buildOptions(view, surface),
      sessionId: input.sessionId,
      title: input.getCompanionTitle(view),
    });
    input.onService(registry.getReviewSession?.(input.sessionId) || null);
    return;
  }

  const service = await registry.openReviewSession({
    ...input.buildOptions(view, surface),
    sessionId: input.sessionId,
    surface,
  });
  input.onService(service);
  input.onOpenSidecar();
}
