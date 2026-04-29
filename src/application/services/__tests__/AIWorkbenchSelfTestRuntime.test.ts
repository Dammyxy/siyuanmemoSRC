import { describe, expect, it } from 'vitest';
import {
  buildModeDraftGenerationMessages,
  extractModeDraftsFromPayload,
  isAppendableSelfTestTarget,
  listSelfTestCardsPendingDrafts,
  normalizeSelfTestCardTargetMemory,
  selectSelfTestCardCandidates,
} from '../AIWorkbenchSelfTestRuntime';
import type {
  AIConceptCoachCandidateCard,
  AIWorkbenchContextSnapshot,
} from '@/types/ai';
import { DEFAULT_SETTINGS } from '@/types/settings';

function candidate(overrides: Partial<AIConceptCoachCandidateCard> = {}): AIConceptCoachCandidateCard {
  return {
    id: 'card-1',
    kind: '定义',
    selected: true,
    summary: 'Gravity',
    prompt: 'What is gravity?',
    answer: 'Force attracting mass.',
    details: ['mass curves spacetime'],
    clozeTargets: ['gravity'],
    ...overrides,
  };
}

describe('AIWorkbenchSelfTestRuntime', () => {
  it('normalizes self-test target memory for daily notes and block targets', () => {
    expect(normalizeSelfTestCardTargetMemory({
      mode: 'daily-note',
      notebookId: ' nb ',
      notebookName: ' Notebook ',
    }, 100)).toEqual({
      mode: 'daily-note',
      notebookId: 'nb',
      notebookName: 'Notebook',
      targetBlockId: null,
      targetLabel: 'Notebook · 今日日记',
      updatedAt: 100,
    });

    expect(normalizeSelfTestCardTargetMemory({
      mode: 'block',
      notebookId: 'nb',
      targetBlockId: ' block-1 ',
      targetLabel: 'Custom',
    }, 200)).toMatchObject({
      mode: 'block',
      notebookId: 'nb',
      notebookName: 'nb',
      targetBlockId: 'block-1',
      targetLabel: 'Custom',
      updatedAt: 200,
    });

    expect(normalizeSelfTestCardTargetMemory({ mode: 'block', notebookId: 'nb' }, 300)).toBeNull();
  });

  it('selects cards with native fallback drafts and respects cached draft checks', () => {
    const cards = [
      candidate({ id: 'selected' }),
      candidate({ id: 'unchecked', selected: false }),
      candidate({ id: 'empty', prompt: '', answer: '', details: [], clozeTargets: [] }),
      candidate({ id: 'has-draft', modeDrafts: { mark: '==Gravity==' } }),
    ];

    expect(selectSelfTestCardCandidates(cards, 'list-item').map((card) => card.id)).toEqual(['selected', 'empty', 'has-draft']);
    expect(listSelfTestCardsPendingDrafts(cards, 'mark', ['selected', 'has-draft']).map((card) => card.id)).toEqual([]);
  });

  it('builds draft-generation payloads from context without leaking full huge block text', () => {
    const context: AIWorkbenchContextSnapshot = {
      source: 'review',
      selectedBlockIds: ['block-1'],
      blocks: [{ blockId: 'block-1', type: 'p', hPath: '/Doc', text: 'x'.repeat(400) }],
      queueType: 'due',
      queueProgress: { queueLabel: 'Today' } as never,
      currentCard: {
        cardId: 'card-1',
        blockId: 'block-1',
        cardType: 'item',
        revealed: true,
        hasAnswerFace: true,
        explainRequiresReveal: false,
        reviewActionLabel: '显示答案',
        roleDescription: '',
        sourceBlockIds: ['block-1'],
        frontText: 'front',
        backText: 'back',
        sourceText: 'source',
        neuralContext: null,
      },
      currentCardRaw: null,
      neuralBatch: null,
    };

    const messages = buildModeDraftGenerationMessages(DEFAULT_SETTINGS.ai, 'mark', [candidate()], context);
    const payload = JSON.parse(messages[1].content);

    expect(messages[0].content).toContain('插件模式草稿生成功能已停用');
    expect(payload).toMatchObject({
      language: DEFAULT_SETTINGS.ai.defaultOutputLanguage,
      context: {
        source: 'review',
        queueType: 'due',
        currentCard: {
          frontText: 'front',
          backText: 'back',
          sourceText: 'source',
        },
      },
      cards: [{
        id: 'card-1',
        kind: '定义',
        prompt: 'What is gravity?',
      }],
    });
    expect(payload.context.selectedBlocks[0].text.length).toBeLessThan(330);
  });

  it('extracts returned drafts by requested card id and keeps appendable target policy explicit', () => {
    const cards = [candidate({ id: 'card-1' }), candidate({ id: 'card-2' })];

    expect(extractModeDraftsFromPayload({
      cards: [
        { id: 'card-1', draftMarkdown: ' * Q\n  * A ' },
        { id: 'ignored', draftMarkdown: 'x' },
        { id: 'card-2', markdown: '## Q\nA' },
      ],
    }, cards)).toEqual({
      'card-1': '* Q\n  * A',
      'card-2': '## Q\nA',
    });

    expect(isAppendableSelfTestTarget({ type: 'd' })).toBe(true);
    expect(isAppendableSelfTestTarget({ type: 'p' })).toBe(false);
  });
});
