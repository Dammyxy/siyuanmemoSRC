import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AISkillId,
  type AISkillTabId,
} from '@/types/ai';
import {
  getAIChatSkill,
  getAIChatSkills,
  getAIChatSkillTabs,
  isAIChatSkillId,
  isAIChatTabId,
  normalizeAIChatSkillId,
  normalizeAIChatTabId,
  type AIChatSkillTabDescriptor,
} from '@/application/services/AIChatSkillRegistry';

export type AIWorkbenchSkillTabDescriptor = AIChatSkillTabDescriptor;

export interface AIWorkbenchSkillDescriptor {
  id: AISkillId;
  title: string;
  brief: string;
  primaryActionLabel: string;
  defaultUserPrompt: string;
  tabs: AIWorkbenchSkillTabDescriptor[];
  mode: 'chat' | 'structured';
  hideTabs: boolean;
}

function toWorkbenchDescriptor(skillId: AISkillId): AIWorkbenchSkillDescriptor {
  const skill = getAIChatSkill(skillId);
  return {
    id: skill.id,
    title: skill.title,
    brief: skill.brief,
    primaryActionLabel: skill.primaryActionLabel,
    defaultUserPrompt: skill.composerPreset,
    tabs: skill.tabs,
    mode: skill.mode,
    hideTabs: skill.surfaceHints?.hideTabs === true,
  };
}

export function getAIWorkbenchSkills(): AIWorkbenchSkillDescriptor[] {
  return getAIChatSkills().map((skill) => toWorkbenchDescriptor(skill.id));
}

export function getAIWorkbenchSkill(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIWorkbenchSkillDescriptor {
  return toWorkbenchDescriptor(normalizeAIChatSkillId(skillId));
}

export function getAIWorkbenchSkillTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AIWorkbenchSkillTabDescriptor[] {
  return getAIChatSkillTabs(normalizeAIChatSkillId(skillId));
}

export function isAIWorkbenchSkillTabId(value: unknown): value is AISkillTabId {
  return isAIChatTabId(value);
}

export function normalizeAIWorkbenchSkillId(value: unknown, fallback: AISkillId = AI_GENERAL_CHAT_SKILL_ID): AISkillId {
  if (value === 'explain' || value === 'make-cards' || value === 'tutor') {
    return AI_CONCEPT_COACH_SKILL_ID;
  }
  return normalizeAIChatSkillId(value, fallback);
}

export function normalizeAIWorkbenchTabId(value: unknown, skillId: AISkillId = AI_CONCEPT_COACH_SKILL_ID): AISkillTabId {
  if (skillId === AI_GENERAL_CHAT_SKILL_ID) {
    return AI_GENERAL_CHAT_TAB_ID;
  }
  if (AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])) {
    return value as AISkillTabId;
  }
  return normalizeAIChatTabId(value, skillId);
}
