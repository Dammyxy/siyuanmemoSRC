import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  composePrompt,
  getRecommendedPromptTemplate,
} from '@/application/services/AIPromptComposer';

describe('AIPromptComposer', () => {
  it('composes tutor, explain, and card-candidate prompts with shared base and task protocol', () => {
    const tutorPrompt = composePrompt('tutor', getRecommendedPromptTemplate('tutor'));
    const explainPrompt = composePrompt('explain', getRecommendedPromptTemplate('explain'));
    const candidatePrompt = composePrompt('card-candidate', getRecommendedPromptTemplate('card-candidate'));

    expect(tutorPrompt).toContain('你正在为 SiyuanMemo 的 AI 工作台服务');
    expect(tutorPrompt).toContain('当前任务是 AI 导师');
    expect(tutorPrompt).toContain('blindSpots');

    expect(explainPrompt).toContain('当前任务是 AI 解释卡片');
    expect(explainPrompt).toContain('工作定义');
    expect(explainPrompt).toContain('workingDefinition');
    expect(explainPrompt).toContain('whatItTests');
    expect(explainPrompt).toContain('triggers');

    expect(candidatePrompt).toContain('当前任务是 AI 辅助制卡');
    expect(candidatePrompt).toContain('6-10 张高价值候选');
    expect(candidatePrompt).toContain('宁可少出');
    expect(candidatePrompt).toContain('mode、candidates');
  });

  it('switches follow-up prompts to natural-language mode', () => {
    const followUpPrompt = composePrompt('explain', getRecommendedPromptTemplate('explain'), {
      followUp: true,
    });
    const candidateFollowUpPrompt = composePrompt('card-candidate', getRecommendedPromptTemplate('card-candidate'), {
      followUp: true,
    });

    expect(followUpPrompt).toContain('现在你是在回答解释卡片后的追问');
    expect(followUpPrompt).not.toContain('workingDefinition、whatItTests');
    expect(followUpPrompt).toContain('工作定义 / 边界 / 因果 / 触发器');
    expect(followUpPrompt).toContain('不要输出 JSON');

    expect(candidateFollowUpPrompt).toContain('现在你是在回答制卡候选上的追问');
    expect(candidateFollowUpPrompt).toContain('为什么这样拆');
    expect(candidateFollowUpPrompt).toContain('不要重新生成整批候选');
  });

  it('ships preset descriptors for all three AI tasks', () => {
    expect(AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => descriptor.task)).toEqual([
      'tutor',
      'explain',
      'card-candidate',
    ]);
  });
});
