import { describe, expect, it, vi } from 'vitest';
import { AISelfTestCardCreationService } from '@/application/services/AISelfTestCardCreationService';
import type { AIConceptCoachCandidateCard, AIWorkbenchSelfTestCardTargetInput } from '@/types/ai';

function createCandidate(overrides?: Partial<AIConceptCoachCandidateCard>): AIConceptCoachCandidateCard {
  return {
    id: 'candidate-a',
    kind: '应用',
    selected: true,
    summary: 'Question A',
    prompt: 'Question A',
    answer: 'Answer A',
    details: ['Detail A'],
    clozeTargets: ['Answer A'],
    ...overrides,
  };
}

function createTarget(): AIWorkbenchSelfTestCardTargetInput {
  return {
    mode: 'daily-note',
    notebookId: 'notebook-1',
    notebookName: '学习笔记',
  };
}

function createService() {
  return {
    flashcardTools: {
      createNativeHeadingCards: vi.fn(async (args: unknown) => ({
        target: createTarget(),
        items: (args as { items?: Array<{ draftMarkdown?: string }> }).items?.map((item) => ({
          status: 'created',
          summary: 'candidate',
          draftMarkdown: item.draftMarkdown,
        })) || [],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
      })),
      createNativeListItemCards: vi.fn(async (args: unknown) => ({
        target: createTarget(),
        items: (args as { items?: Array<{ draftMarkdown?: string }> }).items?.map((item) => ({
          status: 'created',
          summary: 'candidate',
          draftMarkdown: item.draftMarkdown,
        })) || [],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
      })),
      createNativeMarkCards: vi.fn(async (args: unknown) => ({
        target: createTarget(),
        items: (args as { items?: Array<{ draftMarkdown?: string }> }).items?.map((item) => ({
          status: 'created',
          summary: 'candidate',
          draftMarkdown: item.draftMarkdown,
        })) || [],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
      })),
      createNativeSuperBlockCards: vi.fn(async (args: unknown) => ({
        target: createTarget(),
        items: (args as { items?: Array<{ draftMarkdown?: string }> }).items?.map((item) => ({
          status: 'created',
          summary: 'candidate',
          draftMarkdown: item.draftMarkdown,
        })) || [],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
      })),
    },
    getRuntimeContext: () => ({
      context: null,
      attachedContexts: [],
    }),
  };
}

describe('AISelfTestCardCreationService', () => {
  it('renders native modes locally from canonical cards', async () => {
    const deps = createService();
    const service = new AISelfTestCardCreationService(deps);

    const result = await service.createFromCandidates(createTarget(), [createCandidate()], 'list-item');

    expect(deps.flashcardTools.createNativeListItemCards).toHaveBeenCalledTimes(1);
    expect(deps.flashcardTools.createNativeListItemCards.mock.calls[0]?.[0]).toMatchObject({
      items: [
        {
          summary: 'Question A',
          draftMarkdown: '* Question A\n\n  * Answer A\n  * Detail A',
        },
      ],
    });
    expect(result.itemResults[0]).toMatchObject({
      mode: 'list-item',
      status: 'created',
      draftMarkdown: '* Question A\n\n  * Answer A\n  * Detail A',
    });
  });

  it('renders mark mode locally from canonical cards without using legacy plugin paths', async () => {
    const deps = createService();
    const service = new AISelfTestCardCreationService(deps);

    const result = await service.createFromCandidates(createTarget(), [createCandidate()], 'mark');

    expect(deps.flashcardTools.createNativeMarkCards).toHaveBeenCalledTimes(1);
    expect(deps.flashcardTools.createNativeMarkCards.mock.calls[0]?.[0]).toMatchObject({
      items: [
        {
          summary: 'Question A',
          draftMarkdown: '题干：Question A 答案：==Answer A==',
        },
      ],
    });
    expect(result.itemResults[0]?.draftMarkdown).toBe('题干：Question A 答案：==Answer A==');
  });

  it('ignores legacy modeDraft caches when creating native modes', async () => {
    const deps = createService();
    const service = new AISelfTestCardCreationService(deps);
    const candidate = createCandidate({
      modeDrafts: {
        'multi-mark': '题干：Question A 答案：==Answer A==',
        'cdf-multiline': '* Question A:::\n  * Answer A\n  * Detail A',
      },
    });

    await service.createFromCandidates(createTarget(), [candidate], 'heading');

    expect(deps.flashcardTools.createNativeHeadingCards).toHaveBeenCalledTimes(1);
    expect(deps.flashcardTools.createNativeHeadingCards.mock.calls[0]?.[0]).toMatchObject({
      items: [
        {
          draftMarkdown: '## Question A\nAnswer A\n- Detail A',
        },
      ],
    });
  });
});
