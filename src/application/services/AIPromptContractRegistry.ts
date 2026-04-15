import type { AISettings } from '@/types/settings';

export type AIPromptSettingKey = keyof AISettings['prompts'];
export type AIStructuredPromptTask = 'explain';

export interface AIPromptContractDescriptor {
  settingKey: AIPromptSettingKey;
  title: string;
  summary: string;
  runtimeLines: string[];
}

const PROMPT_CONTRACTS: Record<AIPromptSettingKey, AIPromptContractDescriptor> = {
  explain: {
    settingKey: 'explain',
    title: 'AI 解释结构化规则',
    summary: '系统会固定要求解释首轮返回 workingDefinition / whatItTests / whyItsTricky / connections / triggers / cardIdeas 这组 JSON。',
    runtimeLines: [
      '你会收到一个 JSON payload，其中至少包含 language、context.currentCard、context.selectedBlocks、context.queueProgress、context.neuralBatch，以及当前卡片的来源材料。',
      '如果 payload.attachedContexts 存在，必须把它们当成补充参考材料，但不要把它们伪装成当前卡片原文。',
      '严格以当前卡片和当前材料为锚点；超出材料直接支持的地方，必须明确说明“这是补充理解，不是材料原文直接说明”。',
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 字段固定为 workingDefinition、whatItTests、whyItsTricky、connections、triggers、cardIdeas。',
      'connections / triggers / cardIdeas 必须是字符串数组。',
    ],
  },
};

function cloneContract(contract: AIPromptContractDescriptor): AIPromptContractDescriptor {
  return {
    ...contract,
    runtimeLines: [...contract.runtimeLines],
  };
}

export function getPromptContractForSetting(settingKey: AIPromptSettingKey): AIPromptContractDescriptor {
  return cloneContract(PROMPT_CONTRACTS[settingKey]);
}

export function getPromptContractForTask(task: AIStructuredPromptTask): AIPromptContractDescriptor {
  return getPromptContractForSetting(task);
}

export function formatStructuredPromptContract(contract: AIPromptContractDescriptor): string {
  return [
    '以下结构化输出规则由系统自动附加，优先级高于用户行为 Prompt。',
    ...contract.runtimeLines,
  ].join('\n');
}
