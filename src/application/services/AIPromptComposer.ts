import type { AISettings } from '@/types/settings';
import { DEFAULT_AI_PROMPTS } from '@/types/settings';

export type AIPromptTask = 'tutor' | 'explain' | 'card-candidate';

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

const SHARED_PROMPT_BASE = [
  '你正在为 SiyuanMemo 的 AI 工作台服务。',
  '如果 payload.language 存在，请使用该语言输出；否则使用用户当前语言。',
  '严格基于 payload.context、当前卡片、当前路径、当前材料和已给结果回答。',
  '材料未说明的地方请明确说“材料未说明”或“这里有不确定性”，不要脑补。',
  '不要伪造来源、不要捏造卡片内容、不要替用户做未被请求的结论跃迁。',
  '如果当前卡片仍处于提取练习保护状态，不要越权泄露被刻意隐藏的答案面信息。',
].join('\n');

const TASK_INTROS: Record<AIPromptTask, string> = {
  tutor: [
    '当前任务是 AI 导师。',
    '受众是“正在学习的现在的自己”，重点是帮助用户在当前神经漫游里继续思考，而不是替用户过早总结或定稿。',
    '如果 context.neuralBatch.engineMode=orbit，请围绕当前 round、当前焦点和最近路径理解材料；如果是 hyperspace，请围绕当前节点、路径位置和激活来源理解材料，不要假装它也是固定 5 条批次。',
    '默认保持导师式、启发式、可继续漫游的风格；只有 requestBatchSummary=true 时，才允许给出更收束的总结。',
  ].join('\n'),
  explain: [
    '当前任务是 AI 解释卡片。',
    '受众是“正在复习或理解这张卡片的现在的自己”，目标是帮用户讲明白，而不是只复述答案。',
    '优先帮助用户形成可迁移的理解：给出抓本质的工作定义，说清这张卡在考什么、它最容易和什么混淆、为什么会这样、边界在哪、以后什么时候该想起它。',
    '如果当前卡是阅读型 topic/concept，请把它当作阅读与理解节点，而不是问答卡。',
  ].join('\n'),
  'card-candidate': [
    '当前任务是 AI 辅助制卡。',
    '受众是“未来要复习的自己”，目标是从当前材料中挑出少而精、真正值得复习的候选卡，而不是把材料机械拆散。',
    '默认目标是生成 6-10 张高价值候选，但质量优先，不够好时宁可少出；优先区别、因果、应用、边界、触发器，尽量减少纯定义复述。',
    '你可以先在内部做更充分的结构化理解，但最终对外只返回候选卡 JSON。',
  ].join('\n'),
};

const JSON_OUTPUT_PROTOCOLS: Record<AIPromptTask, string> = {
  tutor: [
    '输出协议：',
    '- 只返回合法 JSON，不要附带 Markdown 代码块。',
    '- JSON 字段固定为 blindSpots、patterns、nextLines、cardIdeas、batchSummary。',
    '- blindSpots / patterns / nextLines / cardIdeas 必须是字符串数组。',
    '- batchSummary 必须是字符串或 null。',
  ].join('\n'),
  explain: [
    '输出协议：',
    '- 只返回合法 JSON，不要附带 Markdown 代码块。',
    '- JSON 字段固定为 workingDefinition、whatItTests、whyItsTricky、connections、triggers、cardIdeas。',
    '- connections / triggers / cardIdeas 必须是字符串数组。',
  ].join('\n'),
  'card-candidate': [
    '输出协议：',
    '- 只返回合法 JSON，不要附带 Markdown 代码块。',
    '- 顶层字段必须是 mode、candidates。',
    '- mode 必须回显 payload.mode。',
    '- candidates 必须是数组，且每项都包含 templateId、title、preview、fieldMapping、sourceBlockIds、rationale、confidence。',
    '- templateId 必须来自 allowedTemplateIds。',
    '- fieldMapping 中填的是字段文本草稿，不是块 ID。',
    '- sourceBlockIds 必须引用 context.currentCard.sourceBlockIds 或 context.selectedBlocks 里的 blockId。',
    '- confidence 必须是 0 到 1 之间的数字。',
  ].join('\n'),
};

const FOLLOW_UP_PROTOCOLS: Record<AIPromptTask, string> = {
  tutor: [
    '现在你是在回答导师追问。',
    '请基于已有结构化结果和最新上下文，用简洁自然语言直接回答。',
    '不要输出 JSON，不要重复整份结构化结果，不要突然改写成正式总结。',
  ].join('\n'),
  explain: [
    '现在你是在回答解释卡片后的追问。',
    '请基于已有结构化结果和最新上下文，用简洁自然语言直接回答，并延续“工作定义 / 边界 / 因果 / 触发器”的解释风格。',
    '不要输出 JSON，不要重复整份结构化结果。',
  ].join('\n'),
  'card-candidate': [
    '现在你是在回答制卡候选上的追问。',
    '请基于已有候选结果和最新上下文，用简洁自然语言直接回答，可以解释为什么这样拆、哪些候选该删、怎样收窄成更稳的少数卡。',
    '不要输出 JSON，不要重新生成整批候选，除非用户明确要求重新生成。',
  ].join('\n'),
};

export const AI_PROMPT_PRESET_DESCRIPTORS: readonly AIPromptPresetDescriptor[] = [
  {
    task: 'tutor',
    settingKey: 'tutor',
    titleKey: 'aiTutorPromptPresetTitle',
    titleFallback: 'AI 导师推荐模板',
    audienceKey: 'aiTutorPromptPresetAudience',
    audienceFallback: '面向正在神经漫游中的“现在的自己”，强调线索、张力和下一步追问。',
    behaviorKey: 'aiTutorPromptPresetBehavior',
    behaviorFallback: '不会急着正式总结，默认更像陪学导师，只在你显式要求时才收束。',
    outputKey: 'aiTutorPromptPresetOutput',
    outputFallback: '输出结构化 JSON，适合后续追问和保留为本次复习辅助结果。',
  },
  {
    task: 'explain',
    settingKey: 'explain',
    titleKey: 'aiExplainPromptPresetTitle',
    titleFallback: 'AI 解释卡片推荐模板',
    audienceKey: 'aiExplainPromptPresetAudience',
    audienceFallback: '面向正在复习的“现在的自己”，像一个压缩理解教练，而不是百科讲义。',
    behaviorKey: 'aiExplainPromptPresetBehavior',
    behaviorFallback: '强调工作定义、因果、边界、连接和触发器；条件式提及答案，不空泛复述。',
    outputKey: 'aiExplainPromptPresetOutput',
    outputFallback: '输出短而强的结构化 JSON，适合在侧栏快速阅读和继续追问。',
  },
  {
    task: 'card-candidate',
    settingKey: 'cardCandidate',
    titleKey: 'aiCardPromptPresetTitle',
    titleFallback: 'AI 辅助制卡推荐模板',
    audienceKey: 'aiCardPromptPresetAudience',
    audienceFallback: '面向“未来复习的自己”，目标是从当前材料中挑出少而精的高价值候选卡。',
    behaviorKey: 'aiCardPromptPresetBehavior',
    behaviorFallback: '内部遵循 Andy 的多视角理解法，质量优先，宁可少出，也不输出凑数卡。',
    outputKey: 'aiCardPromptPresetOutput',
    outputFallback: '严格返回候选卡 JSON，维持现有 mode + candidates 契约。',
  },
] as const;

function resolveDefaultPrompt(settingKey: AIPromptSettingKey): string {
  return DEFAULT_AI_PROMPTS[settingKey];
}

export function getRecommendedPromptTemplate(task: AIPromptTask): string {
  switch (task) {
    case 'tutor':
      return resolveDefaultPrompt('tutor');
    case 'explain':
      return resolveDefaultPrompt('explain');
    case 'card-candidate':
      return resolveDefaultPrompt('cardCandidate');
    default:
      return resolveDefaultPrompt('explain');
  }
}

export function getPromptPresetDescriptor(task: AIPromptTask): AIPromptPresetDescriptor {
  return AI_PROMPT_PRESET_DESCRIPTORS.find((descriptor) => descriptor.task === task)
    || AI_PROMPT_PRESET_DESCRIPTORS[0];
}

function normalizePromptBody(promptBody: string, task: AIPromptTask): string {
  const trimmed = String(promptBody || '').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return getRecommendedPromptTemplate(task);
}

export function composePrompt(task: AIPromptTask, promptBody: string, options?: { followUp?: boolean }): string {
  const followUp = options?.followUp === true;
  return [
    SHARED_PROMPT_BASE,
    TASK_INTROS[task],
    normalizePromptBody(promptBody, task),
    followUp ? FOLLOW_UP_PROTOCOLS[task] : JSON_OUTPUT_PROTOCOLS[task],
  ].join('\n\n');
}
