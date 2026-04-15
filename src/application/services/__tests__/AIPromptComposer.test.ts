import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplate,
} from '@/application/services/AIPromptComposer';

describe('AIPromptComposer', () => {
  it('ships a single explain prompt preset with run and follow-up text', () => {
    const explainPrompt = getRecommendedPromptTemplate('explain');

    expect(explainPrompt.run).toContain('学习教练');
    expect(explainPrompt.run).toContain('分得清');
    expect(explainPrompt.run).not.toContain('workingDefinition');
    expect(explainPrompt.followUp).toContain('工作定义 / 边界 / 因果 / 触发器');
  });

  it('only exposes the explain preset descriptor', () => {
    expect(AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => descriptor.task)).toEqual([
      'explain',
    ]);
  });
});
