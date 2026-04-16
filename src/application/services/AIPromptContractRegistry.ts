import type { AIPromptSettingKey } from '@/application/services/AIPromptComposer';
import type { AISkillId, AISkillTabId } from '@/types/ai';

export type AIStructuredPromptTask = 'concept-coach/full-run' | `concept-coach/${AISkillTabId}`;

export interface AIPromptContractDescriptor {
  settingKey: AIPromptSettingKey;
  title: string;
  summary: string;
  runtimeLines: string[];
}

const FULL_RUN_CONTRACT: AIPromptContractDescriptor = {
  settingKey: 'conceptCoach',
  title: 'AI 理解与制卡结构化规则',
  summary: '系统会固定要求首轮返回 workingDefinition / perspectives / integratedUnderstanding / selfTestCards / realWorldTriggers 这组 JSON。',
  runtimeLines: [
    '你会收到一个 JSON payload，其中至少包含 language、skillId、tabIds、context.currentCard、context.selectedBlocks、context.queueProgress、context.neuralBatch 和 attachedContexts。',
    '严格以当前卡片和当前材料为锚点；超出材料直接支持的地方，必须明确说明“这是补充理解，不是材料原文直接说明”。',
    '只返回合法 JSON，不要附带 Markdown 代码块。',
    'JSON 顶层字段固定为 workingDefinition、perspectives、integratedUnderstanding、selfTestCards、realWorldTriggers。',
    'perspectives 固定包含 traits、contrasts、partsAndWhole、causality、significance 五个对象。',
    '如果某个视角当前材料不足，也必须保留该 key，返回显式空节，不要省略字段。',
    'perspectives 最小合法示例：{"traits":{"title":"特性和倾向","keyPoints":[]},"contrasts":{"title":"辨析异同","keyPoints":[]},"partsAndWhole":{"title":"部分和整体","keyPoints":[]},"causality":{"title":"因果关系","keyPoints":[]},"significance":{"title":"意义和影响","keyPoints":[]}}。',
    'integratedUnderstanding 固定包含 essence、notWhat、capabilities；没有内容时返回空字符串或空数组，不要省略 key。',
    'integratedUnderstanding 最小合法示例：{"essence":"","notWhat":[],"capabilities":[]}。',
    'selfTestCards.cards 必须是数组，每项固定包含 question、answer、kind、selected；kind 使用“辨析 / 因果 / 应用 / 反例 / 触发 / 定义 / 边界 / 其他”。',
    'realWorldTriggers.triggers 必须是字符串数组。',
  ],
};

const TAB_CONTRACTS: Record<AISkillTabId, AIPromptContractDescriptor> = {
  'working-definition': {
    settingKey: 'conceptCoach',
    title: '工作定义结构化规则',
    summary: '当前 tab 局部重跑时只返回 workingDefinition 字符串。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 workingDefinition，值为 1-2 句话的工作定义。',
    ],
  },
  perspectives: {
    settingKey: 'conceptCoach',
    title: '多视角理解结构化规则',
    summary: '当前 tab 局部重跑时只返回 perspectives 对象。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 perspectives。',
      'perspectives 固定包含 traits、contrasts、partsAndWhole、causality、significance 五个对象。',
      '如果某个视角没有足够材料，请保留该 key 并返回显式空节，不要省略字段。',
      '最小合法示例：{"perspectives":{"traits":{"title":"特性和倾向","keyPoints":[]},"contrasts":{"title":"辨析异同","keyPoints":[]},"partsAndWhole":{"title":"部分和整体","keyPoints":[]},"causality":{"title":"因果关系","keyPoints":[]},"significance":{"title":"意义和影响","keyPoints":[]}}}。',
    ],
  },
  'integrated-understanding': {
    settingKey: 'conceptCoach',
    title: '整合理解结构化规则',
    summary: '当前 tab 局部重跑时只返回 integratedUnderstanding 对象。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 integratedUnderstanding。',
      'integratedUnderstanding 固定包含 essence、notWhat、capabilities。',
      '如果某一项当前材料不足，也必须保留该 key，空内容使用空字符串或空数组。',
      '最小合法示例：{"integratedUnderstanding":{"essence":"","notWhat":[],"capabilities":[]}}。',
    ],
  },
  'self-test-cards': {
    settingKey: 'conceptCoach',
    title: '自测卡片结构化规则',
    summary: '当前 tab 局部重跑时只返回 selfTestCards.cards 候选卡数组。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 selfTestCards。',
      'selfTestCards.cards 必须是数组，每项固定包含 question、answer、kind、selected。',
    ],
  },
  'real-world-triggers': {
    settingKey: 'conceptCoach',
    title: '现实触发器结构化规则',
    summary: '当前 tab 局部重跑时只返回 realWorldTriggers.triggers 数组。',
    runtimeLines: [
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 顶层字段固定为 realWorldTriggers。',
      'realWorldTriggers.triggers 必须是字符串数组。',
    ],
  },
};

function cloneContract(contract: AIPromptContractDescriptor): AIPromptContractDescriptor {
  return {
    ...contract,
    runtimeLines: [...contract.runtimeLines],
  };
}

export function getPromptContractForSetting(_settingKey: AIPromptSettingKey): AIPromptContractDescriptor {
  return cloneContract(FULL_RUN_CONTRACT);
}

export function getPromptContractForSkillRun(skillId: AISkillId, tabId?: AISkillTabId): AIPromptContractDescriptor {
  if (skillId !== 'concept-coach') {
    return cloneContract(FULL_RUN_CONTRACT);
  }
  return cloneContract(tabId ? TAB_CONTRACTS[tabId] : FULL_RUN_CONTRACT);
}

export function getPromptContractForTask(task: AIStructuredPromptTask): AIPromptContractDescriptor {
  if (task === 'concept-coach/full-run') {
    return cloneContract(FULL_RUN_CONTRACT);
  }
  const tabId = task.replace('concept-coach/', '') as AISkillTabId;
  return cloneContract(TAB_CONTRACTS[tabId] || FULL_RUN_CONTRACT);
}

export function formatStructuredPromptContract(contract: AIPromptContractDescriptor): string {
  return [
    '以下结构化输出规则由系统自动附加，优先级高于用户行为 Prompt。',
    ...contract.runtimeLines,
  ].join('\n');
}
