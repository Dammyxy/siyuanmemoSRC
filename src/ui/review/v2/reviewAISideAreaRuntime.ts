import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AIWorkbenchOpenOptions } from '@/types/ai';
import {
  syncReviewAIContextIfNeededCommand,
  type ReviewAIRegistryLike,
  type ReviewAIRequestedView,
  type ReviewAISurface,
} from './reviewAICommands';

export type ReviewSideAreaTab = 'ai' | 'semantic';

export type ReviewAICompanionTabProbe = (reviewSessionId: string) => boolean | undefined;

export function isReviewAISideAreaContextVisible(input: {
  surface: ReviewAISurface;
  sessionId: string;
  sidecarVisible: boolean;
  hasCompanionTab?: ReviewAICompanionTabProbe;
}): boolean {
  if (input.surface === 'review-dialog-sidecar') {
    return input.sidecarVisible;
  }
  return input.hasCompanionTab?.(input.sessionId) === true;
}

export async function syncReviewAISideAreaContextIfNeeded(input: {
  surface: ReviewAISurface;
  sidecarVisible: boolean;
  hasCompanionTab?: ReviewAICompanionTabProbe;
  registry: ReviewAIRegistryLike | null;
  sessionId: string;
  activeView: ReviewAIRequestedView;
  buildOptions: (view: ReviewAIRequestedView, surface: ReviewAISurface) => AIWorkbenchOpenOptions;
  onService: (service: AIWorkbenchService) => void;
}): Promise<boolean> {
  return syncReviewAIContextIfNeededCommand({
    visible: isReviewAISideAreaContextVisible(input),
    registry: input.registry,
    sessionId: input.sessionId,
    surface: input.surface,
    activeView: input.activeView,
    buildOptions: input.buildOptions,
    onService: input.onService,
  });
}

export function resolveReviewSideAreaTabForVisibility(input: {
  currentTab: ReviewSideAreaTab;
  aiVisible: boolean;
  semanticVisible: boolean;
}): ReviewSideAreaTab {
  if (input.currentTab === 'ai' && !input.aiVisible && input.semanticVisible) {
    return 'semantic';
  }
  if (input.currentTab === 'semantic' && !input.semanticVisible && input.aiVisible) {
    return 'ai';
  }
  return input.currentTab;
}

export function resolveReviewSideAreaTabAfterAIClose(input: {
  currentTab: ReviewSideAreaTab;
  semanticVisible: boolean;
}): ReviewSideAreaTab {
  if (input.currentTab === 'ai' && input.semanticVisible) {
    return 'semantic';
  }
  return input.currentTab;
}
