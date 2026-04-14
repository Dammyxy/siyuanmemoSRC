import type { AISettings, AIPromptTextPair } from '@/types/settings';
import { DEFAULT_AI_PROMPTS } from '@/types/settings';

export type AIPromptTask = 'tutor' | 'explain' | 'card-candidate' | 'card-candidate-cdf';

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
    task: 'tutor',
    settingKey: 'tutor',
    titleKey: 'aiTutorPromptPresetTitle',
    titleFallback: 'AI 导师推荐模板',
    audienceKey: 'aiTutorPromptPresetAudience',
    audienceFallback: '面向正在神经漫游中的“现在的自己”',
    behaviorKey: 'aiTutorPromptPresetBehavior',
    behaviorFallback: '默认像陪学导师一样继续理解和连接，不会急着替你定稿。',
    outputKey: 'aiTutorPromptPresetOutput',
    outputFallback: '提供一组可编辑的行为 Prompt 和追问 Prompt；结构化输出规则由系统自动附加。',
  },
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
  {
    task: 'card-candidate',
    settingKey: 'cardCandidate',
    titleKey: 'aiCardPromptPresetTitle',
    titleFallback: 'AI 辅助制卡推荐模板',
    audienceKey: 'aiCardPromptPresetAudience',
    audienceFallback: '面向“未来复习的自己”，目标是挑出少而精的高价值候选卡。',
    behaviorKey: 'aiCardPromptPresetBehavior',
    behaviorFallback: '优先辨析、因果、应用、边界和触发器，质量优先，宁可少出。',
    outputKey: 'aiCardPromptPresetOutput',
    outputFallback: '提供一组可编辑的行为 Prompt 和追问 Prompt；结构化输出规则由系统自动附加。',
  },
  {
    task: 'card-candidate-cdf',
    settingKey: 'cardCandidateCdf',
    titleKey: 'aiCdfPromptPresetTitle',
    titleFallback: 'CDF 辅助制卡推荐模板',
    audienceKey: 'aiCdfPromptPresetAudience',
    audienceFallback: '面向“未来复习的自己”，按 CDF 先立概念锚点，再拆高价值描述维度。',
    behaviorKey: 'aiCdfPromptPresetBehavior',
    behaviorFallback: '优先概念定义、特征、机制、条件、证据、对比和例子，避免机械拆散原文。',
    outputKey: 'aiCdfPromptPresetOutput',
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
    case 'tutor':
      return resolveDefaultPrompt('tutor');
    case 'explain':
      return resolveDefaultPrompt('explain');
    case 'card-candidate':
      return resolveDefaultPrompt('cardCandidate');
    case 'card-candidate-cdf':
      return resolveDefaultPrompt('cardCandidateCdf');
    default:
      return resolveDefaultPrompt('explain');
  }
}

export function getPromptPresetDescriptor(task: AIPromptTask): AIPromptPresetDescriptor {
  return AI_PROMPT_PRESET_DESCRIPTORS.find((descriptor) => descriptor.task === task)
    || AI_PROMPT_PRESET_DESCRIPTORS[0];
}
