import type { AISettings, AIPromptTextPair } from '@/types/settings';
import { DEFAULT_AI_PROMPTS } from '@/types/settings';

export type AIPromptTask = 'explain';

type AIPromptSettingKey = keyof AISettings['prompts'];

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
    task: 'explain',
    settingKey: 'explain',
    titleKey: 'aiExplainPromptPresetTitle',
    titleFallback: 'AI 解释卡片推荐模板',
    audienceKey: 'aiExplainPromptPresetAudience',
    audienceFallback: '面向正在复习的“现在的自己”，重点是讲清这张卡为什么值得记。',
    behaviorKey: 'aiExplainPromptPresetBehavior',
    behaviorFallback: '强调工作定义、边界、因果、连接和触发器，不空泛复述。',
    outputKey: 'aiExplainPromptPresetOutput',
    outputFallback: '提供一组可编辑的行为 Prompt 和追问 Prompt；结构化输出规则由系统自动附加。',
  },
] as const;

function clonePromptPair(pair: AIPromptTextPair): AIPromptTextPair {
  return {
    run: pair.run,
    followUp: pair.followUp,
  };
}

function resolveDefaultPrompt(settingKey: AIPromptSettingKey): AIPromptTextPair {
  return clonePromptPair(DEFAULT_AI_PROMPTS[settingKey]);
}

export function getRecommendedPromptTemplate(task: AIPromptTask): AIPromptTextPair {
  switch (task) {
    case 'explain':
      return resolveDefaultPrompt('explain');
    default:
      return resolveDefaultPrompt('explain');
  }
}

export function getPromptPresetDescriptor(task: AIPromptTask): AIPromptPresetDescriptor {
  return AI_PROMPT_PRESET_DESCRIPTORS.find((descriptor) => descriptor.task === task)
    || AI_PROMPT_PRESET_DESCRIPTORS[0];
}
