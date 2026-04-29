import {
  AI_GENERAL_CHAT_TAB_ID,
  type AIBlockContext,
  type AISkillId,
  type AISkillTabId,
  type AIWorkbenchContextSnapshot,
  type AIWorkbenchRunMode,
  type AIWorkbenchRunStatus,
  type AIWorkbenchSource,
} from '@/types/ai';

export interface AIWorkbenchRunTabProjection {
  id: AISkillTabId;
  title: string;
}

export interface CreateAIWorkbenchRunStatusInput {
  mode: AIWorkbenchRunMode;
  skillId: AISkillId;
  tabIds: AISkillTabId[];
  activeTabId: AISkillTabId;
  tabs: AIWorkbenchRunTabProjection[];
  activeTabTitle: string;
  now?: () => number;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function createAIWorkbenchRunStatus(input: CreateAIWorkbenchRunStatusInput): AIWorkbenchRunStatus {
  const startedAt = input.now ? input.now() : Date.now();
  const tabTitle = (tabId: AISkillTabId) => (
    input.tabs.find((tab) => tab.id === tabId)?.title || input.activeTabTitle
  );
  if (input.mode === 'chat' || input.mode === 'tool-chain') {
    return {
      mode: input.mode,
      skillId: input.skillId,
      tabIds: input.tabIds,
      activeTabId: AI_GENERAL_CHAT_TAB_ID,
      title: input.mode === 'tool-chain' ? 'AI 正在运行工具' : 'AI 正在思考',
      description: input.mode === 'tool-chain'
        ? '正在根据模型请求执行可用工具，并把结果带回同一会话。'
        : '正在结合当前上下文、会话历史和已启用工具生成回复。',
      startedAt,
    };
  }
  if (input.mode === 'tab-rerun') {
    const targetTabId = input.tabIds[0] || input.activeTabId;
    const title = tabTitle(targetTabId);
    return {
      mode: input.mode,
      skillId: input.skillId,
      tabIds: input.tabIds,
      activeTabId: targetTabId,
      title: 'AI 正在重跑当前阶段',
      description: `只会更新「${title}」，其他阶段保持不变。`,
      startedAt,
    };
  }
  if (input.mode === 'follow-up') {
    const targetTabId = input.tabIds[0] || input.activeTabId;
    const title = tabTitle(targetTabId);
    return {
      mode: input.mode,
      skillId: input.skillId,
      tabIds: input.tabIds,
      activeTabId: targetTabId,
      title: 'AI 正在回应追问',
      description: `只携带「${title}」结果和本次补充上下文。`,
      startedAt,
    };
  }
  return {
    mode: input.mode,
    skillId: input.skillId,
    tabIds: input.tabIds,
    activeTabId: input.activeTabId,
    title: 'AI 正在理解材料',
    description: `正在生成 ${input.tabs.length} 个阶段：${input.tabs.map((tab) => tab.title).join('、')}`,
    startedAt,
  };
}

export function generateAIWorkbenchSessionTitle(context: AIWorkbenchContextSnapshot): string {
  if (context.source === 'review') {
    const queueLabel = normalizeString(context.queueProgress?.queueLabel);
    if (queueLabel) {
      return truncateAIWorkbenchTitle(`${queueLabel} · AI 会话`);
    }
    const queueType = normalizeString(context.queueType);
    if (queueType) {
      return truncateAIWorkbenchTitle(`${queueType} · AI 会话`);
    }
  }
  const currentCard = context.currentCard;
  if (currentCard) {
    const cardText = normalizeString(currentCard.frontText) || normalizeString(currentCard.sourceText);
    if (cardText) {
      return truncateAIWorkbenchTitle(cardText);
    }
  }
  const firstBlockText = context.blocks
    .map((block: AIBlockContext) => normalizeString(block.text))
    .find((text) => text.length > 0);
  if (firstBlockText) {
    return truncateAIWorkbenchTitle(firstBlockText);
  }
  const sourceTitle = getAIWorkbenchSourceTitle(context.source);
  return context.neuralBatch ? `${sourceTitle} · 神经漫游` : `${sourceTitle} · AI 会话`;
}

export function truncateAIWorkbenchTitle(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > 28 ? `${singleLine.slice(0, 28)}...` : singleLine;
}

export function getAIWorkbenchSourceTitle(source: AIWorkbenchSource): string {
  switch (source) {
    case 'review':
      return '复习';
    case 'browser':
      return '浏览器';
    case 'template-dialog':
      return '模板制卡';
    default:
      return '工作台';
  }
}
