import { describe, expect, it, vi } from 'vitest';
import { AgentToolService } from '../AgentToolService';

function createServiceDeps() {
  return {
    browserService: {
      getQueueCounts: vi.fn(async () => ({
        'retrieval-practice': 3,
        'incremental-learning': 2,
      })),
    },
    cardService: {
      getDueCount: vi.fn(async () => 5),
      getTotalCount: vi.fn(async () => 12),
      getCard: vi.fn(async ({ cardId }: { cardId: string }) => ({
        card: {
          id: cardId,
          blockId: 'block-1',
          state: 2,
        },
      })),
      getCards: vi.fn(async () => ({
        cards: [],
        total: 0,
      })),
      createCard: vi.fn(async (command: unknown) => ({
        ok: true,
        value: {
          id: `created-${(command as { blockId?: string }).blockId || 'unknown'}`,
        },
      })),
      updateFSRSCard: vi.fn(async ({ cardId }: { cardId: string }) => ({
        ok: true,
        value: {
          card: {
            id: cardId,
          },
        },
      })),
    },
    dialogManager: {
      openBrowserDialog: vi.fn(async () => undefined),
      openReviewDialog: vi.fn(async () => undefined),
      openAiWorkbenchDialog: vi.fn(async () => undefined),
      openMobileQueueLauncherDialog: vi.fn(async () => undefined),
    },
    tabManager: {
      focusReviewAICompanionTab: vi.fn(() => false),
      openReviewAICompanionTab: vi.fn(async () => undefined),
    },
    reviewSessionRegistry: {
      getSession: vi.fn(() => ({
        getCurrentCard: () => ({
          id: 'card-current',
          blockId: 'block-current',
          type: 'item',
        }),
      })),
    },
    cardDraftService: {
      draft: vi.fn(async () => ({
        ok: true,
        status: 'success' as const,
        data: {
          candidates: [{
            draftId: 'draft-ai-0',
            type: 'qa',
            front: 'AI front',
            back: 'AI back',
            sourceRefs: [{ blockId: 'block-source' }],
            validationWarnings: [],
            persisted: false,
          }],
          persisted: false,
        },
        meta: {
          returnedItemCount: 1,
          totalItemCount: 1,
          followUpAction: 'memo_card action=save selectedDraftIds=[...] drafts=[...]',
        },
      })),
    },
    idFactory: (seed: string, index: number) => `draft-${seed}-${index}`,
    now: () => 10,
  };
}

describe('AgentToolService', () => {
  it('rejects missing action before touching read owners', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    await expect(service.execute({ tool: 'memo_query', args: {} })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(deps.cardService.getDueCount).not.toHaveBeenCalled();
    expect(deps.browserService.getQueueCounts).not.toHaveBeenCalled();
  });

  it('returns learning overview through browser and card read owners', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    await expect(service.execute({ tool: 'memo_query', args: { action: 'status' } })).resolves.toMatchObject({
      ok: true,
      data: {
        overview: {
          dueCount: 5,
          totalCount: 12,
          queueCounts: {
            'retrieval-practice': 3,
            'incremental-learning': 2,
          },
        },
        readOwners: expect.arrayContaining(['CardApplicationService', 'BrowserApplicationService']),
      },
    });
  });

  it('rejects raw database query requests', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    await expect(service.execute({
      tool: 'memo_query',
      args: {
        action: 'query',
        sql: 'select * from cards',
      },
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_OPERATION' },
    });
    expect(deps.browserService.getQueueCounts).not.toHaveBeenCalled();
  });

  it('routes draft requests to the card draft service without card writes', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    const result = await service.execute({
      tool: 'memo_card',
      args: {
        action: 'draft',
        sourceContent: 'Question one? Answer one.\nQuestion two? Answer two.',
        sourceBlockId: 'block-source',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        persisted: false,
        candidates: [{
          draftId: 'draft-ai-0',
          front: 'AI front',
        }],
      },
    });
    expect(deps.cardDraftService.draft).toHaveBeenCalledWith({
      action: 'draft',
      sourceContent: 'Question one? Answer one.\nQuestion two? Answer two.',
      sourceBlockId: 'block-source',
    });
    expect(deps.cardService.createCard).not.toHaveBeenCalled();
  });

  it('returns explicit unavailable for draft when the draft service is not wired', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService({
      ...deps,
      cardDraftService: null,
    });

    await expect(service.execute({
      tool: 'memo_card',
      args: {
        action: 'draft',
        sourceContent: 'Would have been a heuristic candidate before.',
      },
    })).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      error: { code: 'AGENT_API_UNAVAILABLE' },
    });
    expect(deps.cardDraftService.draft).not.toHaveBeenCalled();
    expect(deps.cardService.createCard).not.toHaveBeenCalled();
  });

  it('saves only selected draft candidates through CardApplicationService', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);
    const drafts = [
      {
        draftId: 'draft-a',
        type: 'qa',
        front: 'front a',
        back: 'back a',
        sourceRefs: [{ blockId: 'block-a' }],
        persisted: false,
      },
      {
        draftId: 'draft-b',
        type: 'cloze',
        front: 'front b',
        back: 'back b',
        sourceRefs: [{ blockId: 'block-b' }],
        persisted: false,
      },
    ];

    await expect(service.execute({
      tool: 'memo_card',
      args: {
        action: 'save',
        selectedDraftIds: ['draft-b'],
        drafts,
      },
    })).resolves.toMatchObject({
      ok: true,
      data: {
        savedCount: 1,
        skippedDraftIds: ['draft-a'],
      },
    });
    expect(deps.cardService.createCard).toHaveBeenCalledTimes(1);
    expect(deps.cardService.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockId: 'block-b',
      faces: [{ question: 'front b', answer: 'back b' }],
    }));
  });

  it('assists review without accepting feedback submission', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    await expect(service.execute({
      tool: 'memo_review',
      args: {
        action: 'query',
        sessionId: 'review-1',
        mode: 'hint',
      },
    })).resolves.toMatchObject({
      ok: true,
      data: {
        currentCard: {
          id: 'card-current',
          blockId: 'block-current',
        },
        allowedAssistance: expect.arrayContaining(['hint', 'score_suggestion']),
      },
    });

    await expect(service.execute({
      tool: 'memo_review',
      args: {
        action: 'feedback',
        rating: 4,
      },
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_OPERATION' },
    });
  });

  it('opens frontend surfaces through existing dialog managers', async () => {
    const deps = createServiceDeps();
    const service = new AgentToolService(deps);

    await expect(service.execute({
      tool: 'memo_ui',
      args: {
        action: 'open',
        target: 'browser',
      },
    })).resolves.toMatchObject({
      ok: true,
      data: {
        target: 'browser',
      },
    });
    expect(deps.dialogManager.openBrowserDialog).toHaveBeenCalledTimes(1);
  });
});
