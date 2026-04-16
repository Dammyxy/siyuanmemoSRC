import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIChatSkillDescriptor,
  type AISkillId,
  type AISkillTabId,
} from '@/types/ai';

export interface AIChatSkillTabDescriptor {
  id: AISkillTabId;
  title: string;
  emptyHint: string;
}

export type AIChatRegisteredSkillDescriptor = AIChatSkillDescriptor & {
  tabs: AIChatSkillTabDescriptor[];
};

const GENERAL_CHAT_SKILL: AIChatRegisteredSkillDescriptor = {
  id: AI_GENERAL_CHAT_SKILL_ID,
  title: '通用 AI 聊天',
  brief: '在同一会话里结合当前上下文、思源只读工具和网页工具进行问答。',
  mode: 'chat',
  systemPromptTemplate: [
    '你是思源笔记里的学习与制卡助手，优先帮助用户理解当前材料、整理知识、规划下一步行动。',
    '可以使用已启用的工具读取当前上下文、查询思源块内容、读取复习状态或抓取网页。',
    '不要假装执行了未启用的能力；涉及写入思源、创建卡片、摘录或 daily note 的动作必须先请求用户明确审批。',
    '回答时先给结论，再给必要依据；如果工具返回的信息不足，请直接说明还缺什么。',
  ].join('\n'),
  defaultToolGroups: ['context-read', 'siyuan-read', 'review-read', 'web', 'vars'],
  composerPreset: '你可以直接追问，也可以粘贴 URL、块 ID 或补充材料。',
  primaryActionLabel: '开始聊天',
  supportsStructuredResult: false,
  surfaceHints: {
    hideTabs: true,
    composerRows: 5,
  },
  tabs: [{
    id: AI_GENERAL_CHAT_TAB_ID,
    title: '聊天',
    emptyHint: '直接提问，或让 AI 基于当前卡片和材料继续分析。',
  }],
};

const CONCEPT_COACH_TABS: AIChatSkillTabDescriptor[] = [
  { id: 'working-definition', title: '工作定义', emptyHint: '先抓住这个概念最可用的 1-2 句话。' },
  { id: 'perspectives', title: '多视角理解', emptyHint: '从特性、辨析、整体、因果和意义五个角度理解。' },
  { id: 'integrated-understanding', title: '整合理解', emptyHint: '把分散视角压缩成能复述、能辨析、能应用的理解。' },
  { id: 'self-test-cards', title: '自测卡片', emptyHint: '把理解转成可回忆、可编辑、可选择的候选问答卡。' },
  { id: 'real-world-triggers', title: '现实触发器', emptyHint: '找到以后该想起这个概念的真实场景。' },
];

const CONCEPT_COACH_SKILL: AIChatRegisteredSkillDescriptor = {
  id: AI_CONCEPT_COACH_SKILL_ID,
  title: 'AI 理解与制卡',
  brief: '理解这份材料，并生成可自测的候选卡',
  mode: 'structured',
  systemPromptTemplate: '运行 AI 理解与制卡结构化 skill。',
  defaultToolGroups: ['context-read', 'review-read', 'vars'],
  composerPreset: '请基于当前材料，完成 AI 理解与制卡：先解释清楚，再生成可自测的候选卡。',
  primaryActionLabel: '理解并制卡',
  supportsStructuredResult: true,
  surfaceHints: {
    hideTabs: false,
    composerRows: 4,
  },
  tabs: CONCEPT_COACH_TABS,
};

function cloneSkill(skill: AIChatRegisteredSkillDescriptor): AIChatRegisteredSkillDescriptor {
  return {
    ...skill,
    defaultToolGroups: [...skill.defaultToolGroups],
    surfaceHints: skill.surfaceHints ? { ...skill.surfaceHints } : undefined,
    tabs: skill.tabs.map((tab) => ({ ...tab })),
  };
}

export class AIChatSkillRegistry {
  private readonly skills = new Map<AISkillId, AIChatRegisteredSkillDescriptor>();

  constructor() {
    this.register(GENERAL_CHAT_SKILL);
    this.register(CONCEPT_COACH_SKILL);
  }

  register(skill: AIChatRegisteredSkillDescriptor): void {
    this.skills.set(skill.id, cloneSkill(skill));
  }

  list(): AIChatRegisteredSkillDescriptor[] {
    return Array.from(this.skills.values()).map(cloneSkill);
  }

  get(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIChatRegisteredSkillDescriptor {
    return cloneSkill(this.skills.get(skillId) || this.skills.get(AI_GENERAL_CHAT_SKILL_ID)!);
  }

  getTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIChatSkillTabDescriptor[] {
    return this.get(skillId).tabs;
  }
}

export const defaultAIChatSkillRegistry = new AIChatSkillRegistry();

export function getAIChatSkills(): AIChatRegisteredSkillDescriptor[] {
  return defaultAIChatSkillRegistry.list();
}

export function getAIChatSkill(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIChatRegisteredSkillDescriptor {
  return defaultAIChatSkillRegistry.get(skillId);
}

export function getAIChatSkillTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIChatSkillTabDescriptor[] {
  return defaultAIChatSkillRegistry.getTabs(skillId);
}

export function isAIChatSkillId(value: unknown): value is AISkillId {
  return value === AI_GENERAL_CHAT_SKILL_ID || value === AI_CONCEPT_COACH_SKILL_ID;
}

export function isAIChatTabId(value: unknown): value is AISkillTabId {
  return value === AI_GENERAL_CHAT_TAB_ID || AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number]);
}

export function normalizeAIChatSkillId(value: unknown, fallback: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AISkillId {
  return isAIChatSkillId(value) ? value : fallback;
}

export function normalizeAIChatTabId(value: unknown, skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AISkillTabId {
  if (skillId === AI_GENERAL_CHAT_SKILL_ID) {
    return AI_GENERAL_CHAT_TAB_ID;
  }
  return AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])
    ? value as AISkillTabId
    : 'working-definition';
}
