import { describe, expect, it } from 'vitest';
import {
  createAIWorkbenchRunStatus,
  generateAIWorkbenchSessionTitle,
  truncateAIWorkbenchTitle,
} from '../AIWorkbenchRunProjection';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_GENERAL_CHAT_SKILL_ID,
  type AIWorkbenchContextSnapshot,
} from '@/types/ai';

const tabs = [
  { id: 'working-definition' as const, title: '工作定义' },
  { id: 'perspectives' as const, title: '多角度' },
];

describe('AIWorkbenchRunProjection', () => {
  it('projects run status copy for chat and focused tab reruns', () => {
    expect(createAIWorkbenchRunStatus({
      mode: 'tool-chain',
      skillId: AI_GENERAL_CHAT_SKILL_ID,
      tabIds: ['chat'],
      activeTabId: 'chat',
      tabs,
      activeTabTitle: '聊天',
      now: () => 123,
    })).toMatchObject({
      mode: 'tool-chain',
      activeTabId: 'chat',
      title: 'AI 正在运行工具',
      startedAt: 123,
    });

    expect(createAIWorkbenchRunStatus({
      mode: 'tab-rerun',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      tabIds: ['perspectives'],
      activeTabId: 'working-definition',
      tabs,
      activeTabTitle: '工作定义',
      now: () => 456,
    })).toMatchObject({
      mode: 'tab-rerun',
      activeTabId: 'perspectives',
      description: '只会更新「多角度」，其他阶段保持不变。',
      startedAt: 456,
    });
  });

  it('generates compact session titles from review queue, card text, block text, and neural fallback', () => {
    const base: AIWorkbenchContextSnapshot = {
      source: 'browser',
      selectedBlockIds: [],
      blocks: [],
      currentCard: null,
      currentCardRaw: null,
      neuralBatch: null,
    };

    expect(generateAIWorkbenchSessionTitle({
      ...base,
      source: 'review',
      queueType: 'due',
      queueProgress: { queueLabel: '今日复习' } as never,
    })).toBe('今日复习 · AI 会话');
    expect(generateAIWorkbenchSessionTitle({
      ...base,
      currentCard: {
        cardId: 'card-1',
        blockId: 'block-1',
        cardType: 'item',
        revealed: false,
        hasAnswerFace: true,
        explainRequiresReveal: true,
        reviewActionLabel: '显示答案',
        roleDescription: '',
        sourceBlockIds: [],
        frontText: '  card front  ',
        backText: '',
        sourceText: '',
        neuralContext: null,
      },
    })).toBe('card front');
    expect(generateAIWorkbenchSessionTitle({
      ...base,
      blocks: [{ blockId: 'block-1', text: ' block title ' }],
    })).toBe('block title');
    expect(generateAIWorkbenchSessionTitle({
      ...base,
      neuralBatch: { kind: 'graph-seed' } as never,
    })).toBe('浏览器 · 神经漫游');
    expect(truncateAIWorkbenchTitle('x'.repeat(40))).toBe(`${'x'.repeat(28)}...`);
  });
});
