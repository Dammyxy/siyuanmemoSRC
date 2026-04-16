import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplate,
} from '@/application/services/AIPromptComposer';

describe('AIPromptComposer', () => {
  it('ships a single concept-coach skill prompt with base and per-tab text', () => {
    const prompt = getRecommendedPromptTemplate('concept-coach');

    expect(prompt.baseRun).toContain('学习教练');
    expect(prompt.baseRun).toContain('分得清');
    expect(prompt.baseRun).not.toContain('workingDefinition');
    expect(prompt.tabs['working-definition'].run).toContain('工作定义');
    expect(prompt.tabs['self-test-cards'].run).toContain('问答卡');
    expect(prompt.tabs['real-world-triggers'].followUp).toContain('现实触发器');
  });

  it('only exposes the concept-coach preset descriptor', () => {
    expect(AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => descriptor.task)).toEqual([
      'concept-coach',
    ]);
  });
});
