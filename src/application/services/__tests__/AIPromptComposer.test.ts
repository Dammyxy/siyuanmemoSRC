import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplate,
} from '@/application/services/AIPromptComposer';

describe('AIPromptComposer', () => {
  it('ships a general-chat prompt template with the expected chat boundary guidance', () => {
    const prompt = getRecommendedPromptTemplate('general-chat');

    expect(prompt.systemPrompt).toContain('学习与制卡助手');
    expect(prompt.systemPrompt).toContain('涉及写入思源、创建卡片、摘录或 daily note 的动作必须先请求用户明确审批');
  });

  it('ships a single concept-coach skill prompt with base and per-tab text', () => {
    const prompt = getRecommendedPromptTemplate('concept-coach');

    expect(prompt.baseRun).toContain('学习教练');
    expect(prompt.baseRun).toContain('已有水平=略懂');
    expect(prompt.baseRun).not.toContain('workingDefinition');
    expect(prompt.tabs['working-definition'].run).toContain('工作定义');
    expect(prompt.tabs['self-test-cards'].run).toContain('宁可少一些');
    expect(prompt.tabs['self-test-cards'].run).toContain('3-20 个字');
    expect(prompt.tabs['cdf-structure'].run).toContain('CDF 语义制卡草稿');
    expect(prompt.tabs['cdf-structure'].run).toContain('超过 1 个 items');
    expect(prompt.tabs['cdf-structure'].run).toContain('每个 items[].text 都写成“提示→答案”');
    expect(prompt.tabs['real-world-triggers'].followUp).toContain('现实触发器');
  });

  it('exposes both general-chat and concept-coach preset descriptors', () => {
    expect(AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => descriptor.task)).toEqual([
      'general-chat',
      'concept-coach',
    ]);
  });
});
