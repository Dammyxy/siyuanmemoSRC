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
      createInlineCards: vi.fn(async (args: unknown) => ({
        target: createTarget(),
        items: (args as { items?: Array<{ content?: string }> }).items?.map((item) => ({
          status: 'created',
          summary: 'candidate',
          draftMarkdown: item.content,
        })) || [],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
      })),
      createCdfDraftCards: vi.fn(async (args: unknown) => ({
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

  it('routes plugin modes through Xiuyuan tools using cached mode drafts', async () => {
    const deps = createService();
    const service = new AISelfTestCardCreationService(deps);
    const candidate = createCandidate({
      modeDrafts: {
        'multi-mark': '题干：Question A 答案：==Answer A==',
        'cdf-multiline': '* Question A:::\n  * Answer A\n  * Detail A',
      },
    });

    const multiMarkResult = await service.createFromCandidates(createTarget(), [candidate], 'multi-mark');
    const cdfResult = await service.createFromCandidates(createTarget(), [candidate], 'cdf-multiline');

    expect(deps.flashcardTools.createInlineCards).toHaveBeenCalledTimes(1);
    expect(deps.flashcardTools.createInlineCards.mock.calls[0]?.[0]).toMatchObject({
      mode: 'multi-cloze',
      items: [{ content: '题干：Question A 答案：==Answer A==' }],
    });
    expect(deps.flashcardTools.createCdfDraftCards).toHaveBeenCalledTimes(1);
    expect(deps.flashcardTools.createCdfDraftCards.mock.calls[0]?.[0]).toMatchObject({
      items: [{ draftMarkdown: '* Question A:::\n  * Answer A\n  * Detail A' }],
    });
    expect(multiMarkResult.itemResults[0]?.draftMarkdown).toBe('题干：Question A 答案：==Answer A==');
    expect(cdfResult.itemResults[0]?.draftMarkdown).toBe('* Question A:::\n  * Answer A\n  * Detail A');
  });

  it('requires generated drafts before creating plugin-backed modes', async () => {
    const deps = createService();
    const service = new AISelfTestCardCreationService(deps);

    await expect(service.createFromCandidates(createTarget(), [createCandidate()], 'multi-mark'))
      .rejects
      .toThrow('请先勾选至少一张包含有效制卡草稿的自测卡片。');
    expect(deps.flashcardTools.createInlineCards).not.toHaveBeenCalled();
  });
});
