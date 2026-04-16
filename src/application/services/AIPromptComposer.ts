import type { AIConceptCoachPromptTemplates } from '@/types/settings';
import { DEFAULT_AI_PROMPTS } from '@/types/settings';
import type { AISkillId } from '@/types/ai';

export type AIPromptTask = AISkillId;
export type AIPromptSettingKey = 'conceptCoach';

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
    task: 'concept-coach',
    settingKey: 'conceptCoach',
    titleKey: 'aiConceptCoachPromptPresetTitle',
    titleFallback: 'AI 理解与制卡推荐模板',
    audienceKey: 'aiConceptCoachPromptPresetAudience',
    audienceFallback: '面向正在理解概念、复习卡片或整理材料的自己，目标是分得清、想得起、用得上。',
    behaviorKey: 'aiConceptCoachPromptPresetBehavior',
    behaviorFallback: '按工作定义、多视角理解、整合理解、自测卡片和现实触发器五个阶段组织理解。',
    outputKey: 'aiConceptCoachPromptPresetOutput',
    outputFallback: '每个阶段都有可编辑 Prompt；结构化 JSON 规则由系统自动附加。',
  },
] as const;

function clonePromptSet(set: AIConceptCoachPromptTemplates): AIConceptCoachPromptTemplates {
  return {
    baseRun: set.baseRun,
    tabs: {
      'working-definition': { ...set.tabs['working-definition'] },
      perspectives: { ...set.tabs.perspectives },
      'integrated-understanding': { ...set.tabs['integrated-understanding'] },
      'self-test-cards': { ...set.tabs['self-test-cards'] },
      'real-world-triggers': { ...set.tabs['real-world-triggers'] },
    },
  };
}

export function getRecommendedPromptTemplate(task: AIPromptTask): AIConceptCoachPromptTemplates {
  switch (task) {
    case 'concept-coach':
    default:
      return clonePromptSet(DEFAULT_AI_PROMPTS.skills.conceptCoach);
  }
}

export function getRecommendedPromptTemplateForSetting(settingKey: AIPromptSettingKey): AIConceptCoachPromptTemplates {
  switch (settingKey) {
    case 'conceptCoach':
    default:
      return clonePromptSet(DEFAULT_AI_PROMPTS.skills.conceptCoach);
  }
}

export function getPromptPresetDescriptor(task: AIPromptTask): AIPromptPresetDescriptor {
  return AI_PROMPT_PRESET_DESCRIPTORS.find((descriptor) => descriptor.task === task)
    || AI_PROMPT_PRESET_DESCRIPTORS[0];
}
