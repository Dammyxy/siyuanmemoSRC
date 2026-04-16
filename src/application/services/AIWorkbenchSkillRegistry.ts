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
  isAIChatTabId,
  normalizeAIChatSkillId,
  normalizeAIChatTabId,
  type AIChatSkillTabDescriptor,
} from '@/application/services/AIChatSkillRegistry';
import type { AISettings } from '@/types/settings';

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

function toWorkbenchDescriptor(skillId: AISkillId, settings?: AISettings): AIWorkbenchSkillDescriptor {
  const skill = getAIChatSkill(skillId, settings);
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

export function getAIWorkbenchSkills(settings?: AISettings): AIWorkbenchSkillDescriptor[] {
  return getAIChatSkills(settings).map((skill) => toWorkbenchDescriptor(skill.id, settings));
}

export function getAIWorkbenchSkill(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIWorkbenchSkillDescriptor {
  return toWorkbenchDescriptor(normalizeAIChatSkillId(skillId, AI_GENERAL_CHAT_SKILL_ID, settings), settings);
}

export function getAIWorkbenchSkillTabs(skillId: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AIWorkbenchSkillTabDescriptor[] {
  return getAIChatSkillTabs(normalizeAIChatSkillId(skillId, AI_GENERAL_CHAT_SKILL_ID, settings), settings);
}

export function isAIWorkbenchSkillTabId(value: unknown, settings?: AISettings, skillId?: AISkillId): value is AISkillTabId {
  return isAIChatTabId(value, settings, skillId);
}

export function normalizeAIWorkbenchSkillId(value: unknown, fallback: AISkillId = AI_GENERAL_CHAT_SKILL_ID, settings?: AISettings): AISkillId {
  if (value === 'explain' || value === 'make-cards' || value === 'tutor') {
    return AI_CONCEPT_COACH_SKILL_ID;
  }
  return normalizeAIChatSkillId(value, fallback, settings);
}

export function normalizeAIWorkbenchTabId(value: unknown, skillId: AISkillId = AI_CONCEPT_COACH_SKILL_ID, settings?: AISettings): AISkillTabId {
  if (skillId === AI_GENERAL_CHAT_SKILL_ID) {
    return AI_GENERAL_CHAT_TAB_ID;
  }
  if (AI_CONCEPT_COACH_TAB_IDS.includes(value as typeof AI_CONCEPT_COACH_TAB_IDS[number])) {
    return value as AISkillTabId;
  }
  return normalizeAIChatTabId(value, skillId, settings);
}
