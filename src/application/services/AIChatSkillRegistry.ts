import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIGenericStructuredRendererKind,
  type AIChatSkillDescriptor,
  type AIBuiltinSkillId,
  type AISkillId,
  type AISkillTabId,
  type AIUserSkillDefinition,
  type AIUserSkillId,
  type AIUserSkillSectionDefinition,
} from '@/types/ai';
import { normalizeAISettings, type AISettings } from '@/types/settings';

export interface AIChatSkillTabDescriptor {
  id: AISkillTabId;
  title: string;
  emptyHint: string;
}

export interface AIResolvedSkillSectionDescriptor extends AIChatSkillTabDescriptor {
  sourceId: string;
  responseKey: string;
  renderer: AIGenericStructuredRendererKind;
  runPrompt: string;
  followUpPrompt: string;
  required: boolean;
}

export type AIChatRegisteredSkillDescriptor = AIChatSkillDescriptor & {
  source: 'builtin' | 'user';
  tabs: AIChatSkillTabDescriptor[];
  sections?: AIResolvedSkillSectionDescriptor[];
  userSkill?: AIUserSkillDefinition;
};

const GENERAL_CHAT_SKILL: AIChatRegisteredSkillDescriptor = {
  id: AI_GENERAL_CHAT_SKILL_ID,
  source: 'builtin',
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
  { id: 'cdf-structure', title: 'CDF 语义卡', emptyHint: '把概念、定义和描述维度整理成可筛选的 CDF 结构。' },
  { id: 'real-world-triggers', title: '现实触发器', emptyHint: '找到以后该想起这个概念的真实场景。' },
];

const CONCEPT_COACH_SKILL: AIChatRegisteredSkillDescriptor = {
  id: AI_CONCEPT_COACH_SKILL_ID,
  source: 'builtin',
  title: 'AI 理解与制卡',
  brief: '理解这份材料，并生成可自测的候选卡',
  mode: 'structured',
  systemPromptTemplate: '运行 AI 理解与制卡结构化 skill。',
  defaultToolGroups: ['context-read', 'review-read', 'vars'],
  composerPreset: '请基于当前材料，先帮我形成结构化理解，再生成可自测、宁缺毋滥的候选卡。',
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
    sections: skill.sections?.map((section) => ({ ...section })),
    userSkill: skill.userSkill ? {
      ...skill.userSkill,
      defaultToolGroups: [...skill.userSkill.defaultToolGroups],
      sections: skill.userSkill.sections.map((section) => ({ ...section })),
      surfaceHints: skill.userSkill.surfaceHints ? { ...skill.userSkill.surfaceHints } : undefined,
    } : undefined,
  };
}

function normalizeUserSkillSlug(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^user:/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toAIUserSkillId(value: unknown): AIUserSkillId | null {
  const slug = normalizeUserSkillSlug(value);
  return slug ? `user:${slug}` : null;
}

export function toAIUserSkillTabId(skill: AIUserSkillDefinition | string, section: AIUserSkillSectionDefinition | string): AISkillTabId {
  const skillSlug = normalizeUserSkillSlug(typeof skill === 'string' ? skill : skill.id);
  const sectionSlug = normalizeUserSkillSlug(typeof section === 'string' ? section : section.id);
  return `user:${skillSlug}:${sectionSlug}` as AISkillTabId;
}

function userSectionToDescriptor(skill: AIUserSkillDefinition, section: AIUserSkillSectionDefinition): AIResolvedSkillSectionDescriptor {
  return {
    id: toAIUserSkillTabId(skill, section),
    sourceId: section.id,
    title: section.title,
    emptyHint: section.emptyHint,
    responseKey: section.responseKey,
    renderer: section.renderer,
    runPrompt: section.runPrompt,
    followUpPrompt: section.followUpPrompt,
    required: section.required,
  };
}

function userSkillToDescriptor(skill: AIUserSkillDefinition): AIChatRegisteredSkillDescriptor | null {
  if (!skill.enabled) {
    return null;
  }
  const id = toAIUserSkillId(skill.id);
  if (!id) {
    return null;
  }
  const sections = skill.mode === 'structured'
    ? skill.sections.map((section) => userSectionToDescriptor(skill, section))
    : [];
  if (skill.mode === 'structured' && sections.length === 0) {
    return null;
  }
  const tabs: AIChatSkillTabDescriptor[] = skill.mode === 'chat'
    ? [{
      id: AI_GENERAL_CHAT_TAB_ID,
      title: '聊天',
      emptyHint: skill.brief || '直接提问，或让这个 Skill 基于当前上下文继续处理。',
    }]
    : sections.map((section) => ({
      id: section.id,
      title: section.title,
      emptyHint: section.emptyHint,
    }));
  return {
    id,
    source: 'user',
    title: skill.title,
    brief: skill.brief,
    mode: skill.mode,
    systemPromptTemplate: skill.systemPromptTemplate,
    defaultToolGroups: [...skill.defaultToolGroups],
    composerPreset: skill.composerPreset,
    primaryActionLabel: skill.primaryActionLabel,
    supportsStructuredResult: skill.mode === 'structured',
    surfaceHints: {
      ...skill.surfaceHints,
      hideTabs: skill.mode === 'chat' ? true : skill.surfaceHints?.hideTabs === true,
    },
    tabs,
    sections,
    userSkill: skill,
  };
}

function resolveUserSkills(settings?: AISettings): AIChatRegisteredSkillDescriptor[] {
  const normalized = settings ? normalizeAISettings(settings) : null;
  return (normalized?.userSkills || [])
    .map(userSkillToDescriptor)
    .filter((skill): skill is AIChatRegisteredSkillDescriptor => Boolean(skill));
}

export class AIChatSkillRegistry {
  private readonly skills = new Map<AIBuiltinSkillId, AIChatRegisteredSkillDescriptor>();

  constructor() {
    this.register(GENERAL_CHAT_SKILL);
    this.register(CONCEPT_COACH_SKILL);
  }

  register(skill: AIChatRegisteredSkillDescriptor): void {
    if (skill.id === AI_GENERAL_CHAT_SKILL_ID || skill.id === AI_CONCEPT_COACH_SKILL_ID) {
      this.skills.set(skill.id, cloneSkill(skill));
    }
  }

  list(settings?: AISettings): AIChatRegisteredSkillDescriptor[] {
    return [
      ...Array.from(this.skills.values()).map(cloneSkill),
      ...resolveUserSkills(settings),
    ];
  }

  get(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIChatRegisteredSkillDescriptor {
    return cloneSkill(
      this.list(settings).find((skill) => skill.id === skillId)
      || this.skills.get(AI_GENERAL_CHAT_SKILL_ID)!,
    );
  }

  getTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIChatSkillTabDescriptor[] {
    return this.get(skillId, settings).tabs;
  }
}

export const defaultAIChatSkillRegistry = new AIChatSkillRegistry();

export function getAIChatSkills(settings?: AISettings): AIChatRegisteredSkillDescriptor[] {
  return defaultAIChatSkillRegistry.list(settings);
}

export function getAIChatSkill(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIChatRegisteredSkillDescriptor {
  return defaultAIChatSkillRegistry.get(skillId, settings);
}

export function getAIChatSkillTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIChatSkillTabDescriptor[] {
  return defaultAIChatSkillRegistry.getTabs(skillId, settings);
}

export function isAIChatSkillId(value: unknown, settings?: AISettings): value is AISkillId {
  if (value === AI_GENERAL_CHAT_SKILL_ID || value === AI_CONCEPT_COACH_SKILL_ID) {
    return true;
  }
  return typeof value === 'string'
    && value.startsWith('user:')
    && getAIChatSkills(settings).some((skill) => skill.id === value);
}

export function isAIChatTabId(value: unknown, settings?: AISettings, skillId?: AISkillId): value is AISkillTabId {
  if (value === AI_GENERAL_CHAT_TAB_ID || AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])) {
    return true;
  }
  return typeof value === 'string'
    && value.startsWith('user:')
    && getAIChatSkillTabs(skillId || AI_GENERAL_CHAT_SKILL_ID, settings).some((tab) => tab.id === value);
}

export function normalizeAIChatSkillId(
  value: unknown,
  fallback: AISkillId = AI_GENERAL_CHAT_SKILL_ID,
  settings?: AISettings,
): AISkillId {
  return isAIChatSkillId(value, settings) ? value : fallback;
}

export function normalizeAIChatTabId(
  value: unknown,
  skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID,
  settings?: AISettings,
): AISkillTabId {
  const skill = getAIChatSkill(skillId, settings);
  if (skill.mode === 'chat') {
    return AI_GENERAL_CHAT_TAB_ID;
  }
  return skill.tabs.some((tab) => tab.id === value)
    ? value as AISkillTabId
    : skill.tabs[0]?.id || 'working-definition';
}
