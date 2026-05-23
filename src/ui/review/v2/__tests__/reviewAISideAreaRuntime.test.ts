import { describe, expect, it, vi } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AIWorkbenchOpenOptions } from '@/types/ai';
import {
  resolveReviewSideAreaTabAfterAIClose,
  resolveReviewSideAreaTabForVisibility,
  syncReviewAISideAreaContextIfNeeded,
  type ReviewSideAreaTab,
} from '../reviewAISideAreaRuntime';
import type { ReviewAIRequestedView } from '../reviewAICommands';

function service(activeView: ReviewAIRequestedView = 'general-chat'): AIWorkbenchService {
  return {
    state: {
      activeView,
    },
  } as unknown as AIWorkbenchService;
}

function buildOptions(view: ReviewAIRequestedView, surface: AIWorkbenchOpenOptions['surface']): AIWorkbenchOpenOptions {
  return {
    view,
    source: 'review',
    surface,
    sessionId: 'review-1',
    sourceReviewSessionId: 'review-1',
    currentBlockId: 'block-1',
  };
}

describe('reviewAISideAreaRuntime', () => {
  it('syncs dialog sidecar context only while the sidecar is visible', async () => {
    const updated = service('concept-coach');
    const onService = vi.fn();
    const registry = {
      hasReviewSession: vi.fn(() => true),
      updateReviewSessionContext: vi.fn(async () => updated),
    };

    expect(await syncReviewAISideAreaContextIfNeeded({
      surface: 'review-dialog-sidecar',
      sidecarVisible: false,
      hasCompanionTab: undefined,
      registry,
      sessionId: 'review-1',
      activeView: 'general-chat',
      buildOptions,
      onService,
    })).toBe(false);
    expect(registry.updateReviewSessionContext).not.toHaveBeenCalled();

    expect(await syncReviewAISideAreaContextIfNeeded({
      surface: 'review-dialog-sidecar',
      sidecarVisible: true,
      hasCompanionTab: undefined,
      registry,
      sessionId: 'review-1',
      activeView: 'concept-coach',
      buildOptions,
      onService,
    })).toBe(true);
    expect(registry.updateReviewSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-dialog-sidecar',
      view: 'concept-coach',
      sessionId: 'review-1',
    }));
    expect(onService).toHaveBeenCalledWith(updated);
  });

  it('syncs tab companion context only while the companion tab exists', async () => {
    const updated = service('general-chat');
    const onService = vi.fn();
    const registry = {
      hasReviewSession: vi.fn(() => true),
      updateReviewSessionContext: vi.fn(async () => updated),
    };
    const hasCompanionTab = vi.fn(() => false);

    expect(await syncReviewAISideAreaContextIfNeeded({
      surface: 'review-tab-companion',
      sidecarVisible: true,
      hasCompanionTab,
      registry,
      sessionId: 'review-1',
      activeView: 'general-chat',
      buildOptions,
      onService,
    })).toBe(false);
    expect(hasCompanionTab).toHaveBeenCalledWith('review-1');
    expect(registry.updateReviewSessionContext).not.toHaveBeenCalled();

    hasCompanionTab.mockReturnValue(true);
    expect(await syncReviewAISideAreaContextIfNeeded({
      surface: 'review-tab-companion',
      sidecarVisible: false,
      hasCompanionTab,
      registry,
      sessionId: 'review-1',
      activeView: 'general-chat',
      buildOptions,
      onService,
    })).toBe(true);
    expect(registry.updateReviewSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-tab-companion',
      sessionId: 'review-1',
    }));
  });

  it('selects the remaining visible side tab when AI or Semantic visibility changes', () => {
    expect(resolveReviewSideAreaTabForVisibility({
      currentTab: 'ai',
      aiVisible: false,
      semanticVisible: true,
    })).toBe('semantic');

    expect(resolveReviewSideAreaTabForVisibility({
      currentTab: 'semantic',
      aiVisible: true,
      semanticVisible: false,
    })).toBe('ai');

    expect(resolveReviewSideAreaTabForVisibility({
      currentTab: 'semantic',
      aiVisible: true,
      semanticVisible: true,
    })).toBe('semantic');

    expect(resolveReviewSideAreaTabForVisibility({
      currentTab: 'ai',
      aiVisible: false,
      semanticVisible: false,
    })).toBe<ReviewSideAreaTab>('ai');
  });

  it('moves to Semantic when closing AI with Semantic still visible', () => {
    expect(resolveReviewSideAreaTabAfterAIClose({
      currentTab: 'ai',
      semanticVisible: true,
    })).toBe('semantic');

    expect(resolveReviewSideAreaTabAfterAIClose({
      currentTab: 'semantic',
      semanticVisible: true,
    })).toBe('semantic');

    expect(resolveReviewSideAreaTabAfterAIClose({
      currentTab: 'ai',
      semanticVisible: false,
    })).toBe('ai');
  });
});
