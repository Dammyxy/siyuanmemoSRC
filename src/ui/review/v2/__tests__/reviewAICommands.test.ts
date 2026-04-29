import { describe, expect, it, vi } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AIWorkbenchOpenOptions } from '@/types/ai';
import {
  buildReviewAIChatKey,
  buildReviewAICompanionTitle,
  buildReviewAIOpenOptions,
  openReviewAIAssistantCommand,
  resolveDefaultReviewAIEntryView,
  resolveReviewAIEntryView,
  syncReviewAIContextIfNeededCommand,
  type ReviewAIRequestedView,
} from '../reviewAICommands';

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
    reviewChatKey: 'retrieval::Daily',
  };
}

describe('reviewAICommands', () => {
  it('builds review AI chat key, title, and open options', () => {
    expect(buildReviewAIChatKey({ queueType: ' retrieval ', queueLabel: ' Daily ' })).toBe('retrieval::Daily');
    expect(buildReviewAIChatKey({ queueType: '', queueLabel: 'Daily' })).toBeNull();

    expect(buildReviewAICompanionTitle({
      view: 'general-chat',
      reviewTitle: ' Retrieval ',
      labels: {
        generalChat: 'General Chat',
        conceptCoach: 'Concept Coach',
        review: 'Review',
      },
    })).toBe('General Chat · Retrieval');

    expect(buildReviewAICompanionTitle({
      view: 'make-cards',
      reviewTitle: '',
      labels: {
        generalChat: 'General Chat',
        conceptCoach: 'Concept Coach',
        review: 'Review',
      },
    })).toBe('Concept Coach · Review');

    expect(buildReviewAIOpenOptions({
      view: 'concept-coach',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-1',
      reviewChatKey: 'retrieval::Daily',
      currentCard: null,
      currentBlockId: 'block-1',
      queueType: 'retrieval',
      queueProgress: null,
      revealed: true,
      neuralBatch: null,
      arenaScenarioId: 'candidate-card-generation',
      arenaTargetKind: 'item',
    })).toEqual(expect.objectContaining({
      view: 'concept-coach',
      source: 'review',
      sourceReviewSessionId: 'review-1',
      currentBlockId: 'block-1',
      revealed: true,
    }));
  });

  it('resolves requested, active, and default review AI views', () => {
    expect(resolveDefaultReviewAIEntryView('concept-coach')).toBe('concept-coach');
    expect(resolveDefaultReviewAIEntryView('other')).toBe('general-chat');
    expect(resolveReviewAIEntryView({
      requestedView: 'make-cards',
      defaultView: 'general-chat',
    })).toBe('make-cards');
    expect(resolveReviewAIEntryView({
      activeServiceView: 'concept-coach',
      activeRegistryView: 'general-chat',
      defaultView: 'general-chat',
    })).toBe('concept-coach');
    expect(resolveReviewAIEntryView({
      activeRegistryView: 'concept-coach',
      defaultView: 'general-chat',
    })).toBe('concept-coach');
    expect(resolveReviewAIEntryView({
      activeRegistryView: 'explain',
      defaultView: 'general-chat',
    })).toBe('general-chat');
  });

  it('syncs context only when current AI surface is visible and hydrated', async () => {
    const updated = service('concept-coach');
    const onService = vi.fn();
    const registry = {
      hasReviewSession: vi.fn(() => true),
      updateReviewSessionContext: vi.fn(async () => updated),
    };

    expect(await syncReviewAIContextIfNeededCommand({
      visible: false,
      registry,
      sessionId: 'review-1',
      surface: 'review-dialog-sidecar',
      activeView: 'general-chat',
      buildOptions,
      onService,
    })).toBe(false);
    expect(registry.updateReviewSessionContext).not.toHaveBeenCalled();

    expect(await syncReviewAIContextIfNeededCommand({
      visible: true,
      registry,
      sessionId: 'review-1',
      surface: 'review-dialog-sidecar',
      activeView: 'concept-coach',
      buildOptions,
      onService,
    })).toBe(true);
    expect(registry.updateReviewSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      view: 'concept-coach',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-1',
    }));
    expect(onService).toHaveBeenCalledWith(updated);
  });

  it('opens standalone dialog when dialog sidecar cannot embed', async () => {
    const openAiWorkbenchDialog = vi.fn(async () => undefined);
    const registry = {
      openReviewSession: vi.fn(async () => service()),
    };
    const onPluginNotReady = vi.fn();

    await openReviewAIAssistantCommand({
      requestedView: undefined,
      mode: 'dialog',
      canUseEmbeddedReviewAISidecar: false,
      sessionId: 'review-1',
      defaultView: 'general-chat',
      registry,
      dialogManager: { openAiWorkbenchDialog },
      tabManager: null,
      buildOptions,
      getCompanionTitle: () => 'AI · Review',
      onService: vi.fn(),
      onOpenSidecar: vi.fn(),
      onPluginNotReady,
    });

    expect(openAiWorkbenchDialog).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'standalone-dialog',
      view: 'general-chat',
    }));
    expect(registry.openReviewSession).not.toHaveBeenCalled();
    expect(onPluginNotReady).not.toHaveBeenCalled();
  });

  it('opens tab companion or embedded sidecar through registry commands', async () => {
    const tabService = service('general-chat');
    const sidecarService = service('concept-coach');
    const registry = {
      getReviewSession: vi.fn(() => tabService),
      openReviewSession: vi.fn(async () => sidecarService),
    };
    const openReviewAICompanionTab = vi.fn(async () => undefined);
    const onTabService = vi.fn();

    await openReviewAIAssistantCommand({
      mode: 'tab',
      canUseEmbeddedReviewAISidecar: true,
      sessionId: 'review-1',
      defaultView: 'concept-coach',
      registry,
      dialogManager: null,
      tabManager: { openReviewAICompanionTab },
      buildOptions,
      getCompanionTitle: () => 'Concept Coach · Review',
      onService: onTabService,
      onOpenSidecar: vi.fn(),
      onPluginNotReady: vi.fn(),
    });

    expect(openReviewAICompanionTab).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-tab-companion',
      title: 'Concept Coach · Review',
    }));
    expect(onTabService).toHaveBeenCalledWith(tabService);

    const onSidecarService = vi.fn();
    const onOpenSidecar = vi.fn();
    await openReviewAIAssistantCommand({
      requestedView: 'concept-coach',
      mode: 'dialog',
      canUseEmbeddedReviewAISidecar: true,
      sessionId: 'review-1',
      defaultView: 'general-chat',
      registry,
      dialogManager: null,
      tabManager: null,
      buildOptions,
      getCompanionTitle: () => 'Concept Coach · Review',
      onService: onSidecarService,
      onOpenSidecar,
      onPluginNotReady: vi.fn(),
    });

    expect(registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-dialog-sidecar',
      view: 'concept-coach',
    }));
    expect(onSidecarService).toHaveBeenCalledWith(sidecarService);
    expect(onOpenSidecar).toHaveBeenCalled();
  });
});
