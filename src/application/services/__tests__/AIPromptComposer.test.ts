import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplate,
} from '@/application/services/AIPromptComposer';

describe('AIPromptComposer', () => {
  it('ships full-text recommended prompt pairs for tutor, explain, candidate, and cdf tasks', () => {
    const tutorPrompt = getRecommendedPromptTemplate('tutor');
    const explainPrompt = getRecommendedPromptTemplate('explain');
    const candidatePrompt = getRecommendedPromptTemplate('card-candidate');
    const cdfPrompt = getRecommendedPromptTemplate('card-candidate-cdf');

    expect(tutorPrompt.run).toContain('AI 导师');
    expect(tutorPrompt.run).toContain('blindSpots');
    expect(tutorPrompt.followUp).toContain('不要输出 JSON');

    expect(explainPrompt.run).toContain('学习教练');
    expect(explainPrompt.run).toContain('workingDefinition');
    expect(explainPrompt.run).toContain('whatItTests');
    expect(explainPrompt.followUp).toContain('工作定义 / 边界 / 因果 / 触发器');

    expect(candidatePrompt.run).toContain('6-10 张');
    expect(candidatePrompt.run).toContain('candidates');
    expect(candidatePrompt.followUp).toContain('不要重新生成整批候选');

    expect(cdfPrompt.run).toContain('CDF 辅助制卡');
    expect(cdfPrompt.run).toContain('概念锚点');
    expect(cdfPrompt.followUp).toContain('概念锚点');
  });

  it('ships preset descriptors for all four AI tasks', () => {
    expect(AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => descriptor.task)).toEqual([
      'tutor',
      'explain',
      'card-candidate',
      'card-candidate-cdf',
    ]);
  });
});
