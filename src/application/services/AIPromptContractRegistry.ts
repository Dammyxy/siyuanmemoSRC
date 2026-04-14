import type { AIMakeCardMode } from '@/types/ai';
import type { AISettings } from '@/types/settings';

export type AIPromptSettingKey = keyof AISettings['prompts'];
export type AIStructuredPromptTask = 'tutor' | 'explain' | 'card-candidate' | 'card-candidate-cdf';

export interface AIPromptContractDescriptor {
  settingKey: AIPromptSettingKey;
  title: string;
  summary: string;
  runtimeLines: string[];
}

const PROMPT_CONTRACTS: Record<AIPromptSettingKey, AIPromptContractDescriptor> = {
  tutor: {
    settingKey: 'tutor',
    title: 'AI 导师结构化规则',
    summary: '系统会固定要求导师首轮返回 blindSpots / patterns / nextLines / cardIdeas / batchSummary 这组 JSON。',
    runtimeLines: [
      '你会收到一个 JSON payload，其中至少包含 language、requestBatchSummary、context，并且在有额外临时材料时会附带 attachedContexts。',
      '严格基于 payload.language、payload.context、当前卡片、当前路径和当前材料回答；材料未说明就明确说“材料未说明”或“这里有不确定性”。',
      '如果 payload.attachedContexts 存在，必须把它们当作当前材料的补充参考，并在与 context 冲突时优先以当前 live context 为锚点。',
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      'JSON 字段固定为 blindSpots、patterns、nextLines、cardIdeas、batchSummary。',
      'blindSpots / patterns / nextLines / cardIdeas 必须是字符串数组。',
      'batchSummary 必须是字符串或 null。',
    ],
  },
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
  cardCandidate: {
    settingKey: 'cardCandidate',
    title: 'AI 制卡结构化规则',
    summary: '系统会固定要求制卡首轮回显 mode，并返回符合候选卡契约的 candidates 数组。',
    runtimeLines: [
      '你会收到一个 JSON，里面至少包含 mode、allowedTemplateIds、context、learnerProfile；在有临时补充材料时还会附带 attachedContexts。',
      '如果 attachedContexts 存在，必须把它们当成额外参考材料参与拆卡，但 sourceBlockIds 仍然只能引用当前上下文里真实存在的块。',
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      '顶层字段必须是 mode、candidates。',
      'mode 必须回显 payload.mode。',
      'candidates 必须是数组，且每项都包含 templateId、title、preview、fieldMapping、sourceBlockIds、rationale、confidence。',
      'templateId 必须来自 allowedTemplateIds。',
      'fieldMapping 中填的是字段文本草稿，不是块 ID。',
      'sourceBlockIds 必须引用 context.currentCard.sourceBlockIds 或 context.selectedBlocks 里的 blockId。',
      'confidence 必须是 0 到 1 之间的数字。',
    ],
  },
  cardCandidateCdf: {
    settingKey: 'cardCandidateCdf',
    title: 'CDF 制卡结构化规则',
    summary: '系统会固定要求 CDF 制卡首轮回显 mode，并返回符合概念定义 / 描述符候选卡契约的 candidates 数组。',
    runtimeLines: [
      '你会收到一个 JSON，里面至少包含 mode、allowedTemplateIds、context、learnerProfile；在有临时补充材料时还会附带 attachedContexts。',
      '如果 attachedContexts 存在，必须把它们当成额外参考材料参与 CDF 拆解，但 sourceBlockIds 仍然只能引用当前上下文里真实存在的块。',
      '只返回合法 JSON，不要附带 Markdown 代码块。',
      '顶层字段必须是 mode、candidates。',
      'mode 必须回显 payload.mode。',
      'candidates 必须是数组，且每项都包含 templateId、title、preview、fieldMapping、sourceBlockIds、rationale、confidence。',
      'templateId 必须来自 allowedTemplateIds，优先选择概念定义或概念描述符模板族。',
      'fieldMapping 中填的是字段文本草稿，不是块 ID。',
      'sourceBlockIds 必须引用 context.currentCard.sourceBlockIds 或 context.selectedBlocks 里的 blockId。',
      'confidence 必须是 0 到 1 之间的数字。',
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

export function getPromptContractForTask(
  task: AIStructuredPromptTask,
  options?: { mode?: AIMakeCardMode },
): AIPromptContractDescriptor {
  if (task === 'card-candidate-cdf') {
    return getPromptContractForSetting('cardCandidateCdf');
  }
  if (task === 'card-candidate') {
    return getPromptContractForSetting(options?.mode === 'cdf' ? 'cardCandidateCdf' : 'cardCandidate');
  }
  return getPromptContractForSetting(task);
}

export function formatStructuredPromptContract(contract: AIPromptContractDescriptor): string {
  return [
    '以下结构化输出规则由系统自动附加，优先级高于用户行为 Prompt。',
    ...contract.runtimeLines,
  ].join('\n');
}
