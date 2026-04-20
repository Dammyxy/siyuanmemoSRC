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
    audienceFallback: '面向一个已有水平略懂、当前想真正理解概念的自己，目标不是看懂，而是下次能想起来、分得清、用得上。',
    behaviorKey: 'aiConceptCoachPromptPresetBehavior',
    behaviorFallback: '先给工作定义，再按五个视角建立结构化理解，最后生成宁缺毋滥的自测候选卡和现实触发器。',
    outputKey: 'aiConceptCoachPromptPresetOutput',
    outputFallback: '每个阶段都有可编辑 Prompt；运行时仍固定返回结构化 JSON，自测卡输出 canonical 字段而不是 mode-specific markdown。',
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
