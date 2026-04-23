import type { AIConceptCoachPromptTemplates, AIGeneralChatPromptTemplate } from '@/types/settings';
import { DEFAULT_AI_PROMPTS } from '@/types/settings';
import type { AISkillId } from '@/types/ai';

export type AIPromptTask = AISkillId;
export type AIPromptSettingKey = 'generalChat' | 'conceptCoach';

export interface AIPromptPresetDescriptor {
  task: AIPromptTask;
  settingKey: AIPromptSettingKey;
  titleKey: string;
  titleFallback: string;
  audienceKey: string;
  audienceFallback: string;
  behaviorKey: string;
  behaviorFallback: string;
  outputKey: string;
  outputFallback: string;
}

export const AI_PROMPT_PRESET_DESCRIPTORS: readonly AIPromptPresetDescriptor[] = [
  {
    task: 'general-chat',
    settingKey: 'generalChat',
    titleKey: 'aiGeneralChatPromptPresetTitle',
    titleFallback: '通用 AI 聊天推荐模板',
    audienceKey: 'aiGeneralChatPromptPresetAudience',
    audienceFallback: '面向想先理解材料、抓重点、厘清疑问，再决定是否摘录或制卡的日常学习对话。',
    behaviorKey: 'aiGeneralChatPromptPresetBehavior',
    behaviorFallback: '优先解释与澄清，再结合上下文和已启用工具决定是否建议摘录、继续生成 Item 或创建某类文本卡。',
    outputKey: 'aiGeneralChatPromptPresetOutput',
    outputFallback: '返回自然语言聊天结果；不要求结构化 JSON，但会遵守工具审批和上下文边界。',
  },
  {
    task: 'concept-coach',
    settingKey: 'conceptCoach',
    titleKey: 'aiConceptCoachPromptPresetTitle',
    titleFallback: 'AI 理解与制卡推荐模板',
    audienceKey: 'aiConceptCoachPromptPresetAudience',
    audienceFallback: '面向一个已有水平略懂、当前想真正理解概念的自己，目标不是看懂，而是下次能想起来、分得清、用得上。',
    behaviorKey: 'aiConceptCoachPromptPresetBehavior',
    behaviorFallback: '先给工作定义，再按五个视角建立结构化理解，最后生成宁缺毋滥的自测候选卡和现实触发器。',
    outputKey: 'aiConceptCoachPromptPresetOutput',
    outputFallback: '每个阶段都有可编辑 Prompt；运行时仍固定返回结构化 JSON，自测卡输出 canonical 字段而不是 mode-specific markdown。',
  },
] as const;

function cloneGeneralChatPromptTemplate(template: AIGeneralChatPromptTemplate): AIGeneralChatPromptTemplate {
  return {
    systemPrompt: template.systemPrompt,
  };
}

function clonePromptSet(set: AIConceptCoachPromptTemplates): AIConceptCoachPromptTemplates {
  return {
    baseRun: set.baseRun,
    tabs: {
      'working-definition': { ...set.tabs['working-definition'] },
      perspectives: { ...set.tabs.perspectives },
      'integrated-understanding': { ...set.tabs['integrated-understanding'] },
      'self-test-cards': { ...set.tabs['self-test-cards'] },
      'cdf-structure': { ...set.tabs['cdf-structure'] },
      'real-world-triggers': { ...set.tabs['real-world-triggers'] },
    },
  };
}

export function getRecommendedPromptTemplate(task: 'general-chat'): AIGeneralChatPromptTemplate;
export function getRecommendedPromptTemplate(task: AIPromptTask): AIConceptCoachPromptTemplates | AIGeneralChatPromptTemplate;
export function getRecommendedPromptTemplate(task: AIPromptTask): AIConceptCoachPromptTemplates | AIGeneralChatPromptTemplate {
  switch (task) {
    case 'general-chat':
      return cloneGeneralChatPromptTemplate(DEFAULT_AI_PROMPTS.skills.generalChat);
    case 'concept-coach':
    default:
      return clonePromptSet(DEFAULT_AI_PROMPTS.skills.conceptCoach);
  }
}

export function getRecommendedPromptTemplateForSetting(settingKey: 'generalChat'): AIGeneralChatPromptTemplate;
export function getRecommendedPromptTemplateForSetting(settingKey: AIPromptSettingKey): AIConceptCoachPromptTemplates | AIGeneralChatPromptTemplate;
export function getRecommendedPromptTemplateForSetting(settingKey: AIPromptSettingKey): AIConceptCoachPromptTemplates | AIGeneralChatPromptTemplate {
  switch (settingKey) {
    case 'generalChat':
      return cloneGeneralChatPromptTemplate(DEFAULT_AI_PROMPTS.skills.generalChat);
    case 'conceptCoach':
    default:
      return clonePromptSet(DEFAULT_AI_PROMPTS.skills.conceptCoach);
  }
}

export function getPromptPresetDescriptor(task: AIPromptTask): AIPromptPresetDescriptor {
  return AI_PROMPT_PRESET_DESCRIPTORS.find((descriptor) => descriptor.task === task)
    || AI_PROMPT_PRESET_DESCRIPTORS[0];
}
