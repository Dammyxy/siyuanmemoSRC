import {
  AI_PROMPT_PRESET_DESCRIPTORS,
  getRecommendedPromptTemplateForSetting,
  type AIPromptPresetDescriptor,
  type AIPromptSettingKey,
} from '@/application/services/AIPromptComposer';
import { getPromptContractForSetting } from '@/application/services/AIPromptContractRegistry';
import type {
  AIConceptCoachPromptTemplates,
  AIGeneralChatPromptTemplate,
  AISettings,
} from '@/types/settings';
import { normalizeAIUserSkills } from '@/types/settings';
import type {
  AIChatToolGroupKey,
  AIConceptCoachTabId,
  AIGenericStructuredRendererKind,
  AIUserSkillDefinition,
} from '@/types/ai';

export type SettingsI18nLookup = (key: string, fallback: string) => string;
export type SettingsAIPromptUsageState = 'recommended' | 'custom' | 'empty';
export type SettingsUserSkillMode = 'chat' | 'structured';

export interface SettingsAIConceptCoachPromptTab {
  id: string;
  title: string;
}

export interface SettingsAIUserSkillToolGroupOption {
  key: AIChatToolGroupKey;
  label: string;
  hint: string;
}

export interface SettingsAIUserSkillRendererOption {
  key: AIGenericStructuredRendererKind;
  label: string;
}

export interface SettingsAIPromptUsageCopy {
  usageState: SettingsAIPromptUsageState;
  usageLabel: string;
  usageHint: string;
}

export interface SettingsAIPromptPresetCard extends AIPromptPresetDescriptor, SettingsAIPromptUsageCopy {
  title: string;
  audience: string;
  behavior: string;
  output: string;
  hasStructuredContract: boolean;
  systemContractSummary: string;
  systemContractLines: string[];
}

export const SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS: SettingsAIUserSkillToolGroupOption[] = [
  { key: 'context-read', label: 'context-read', hint: '读取当前卡片、选中块和手工材料。' },
  { key: 'study-decision', label: 'study-decision', hint: '只做学习动作判断，不直接写入。' },
  { key: 'siyuan-read', label: 'siyuan-read', hint: '检索和读取思源块内容。' },
  { key: 'siyuan-write', label: 'siyuan-write', hint: '追加内容、建文档和 diff 写入，默认更严格审批。' },
  { key: 'review-read', label: 'review-read', hint: '读取复习状态和当前队列。' },
  { key: 'web', label: 'web', hint: '抓取网页或调用搜索后端。' },
  { key: 'vars', label: 'vars', hint: '读写会话内变量缓存。' },
  { key: 'flashcard-write', label: 'flashcard-write', hint: '写工具始终逐次审批。' },
];

export const SETTINGS_AI_USER_SKILL_RENDERER_OPTIONS: SettingsAIUserSkillRendererOption[] = [
  { key: 'markdown', label: 'Markdown' },
  { key: 'list', label: 'List' },
  { key: 'cards', label: 'Cards' },
  { key: 'keyValue', label: 'Key / Value' },
];

export function buildSettingsAIUserSkillToolGroupLabelMap(
  options: SettingsAIUserSkillToolGroupOption[] = SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS,
): Record<string, string> {
  return Object.fromEntries(options.map((option) => [option.key, option.label]));
}

function getConceptCoachPromptPair(
  template: AIConceptCoachPromptTemplates,
  tabId: string,
) {
  return template.tabs[tabId as keyof AIConceptCoachPromptTemplates['tabs']];
}

function isConceptCoachPromptEmpty(
  template: AIConceptCoachPromptTemplates,
  aiPromptTabs: SettingsAIConceptCoachPromptTab[],
): boolean {
  return String(template.baseRun || '').trim().length === 0
    && aiPromptTabs.every((tab) => {
      const pair = getConceptCoachPromptPair(template, tab.id);
      return String(pair?.run || '').trim().length === 0
        && String(pair?.followUp || '').trim().length === 0;
    });
}

function areConceptCoachPromptsEqual(
  left: AIConceptCoachPromptTemplates,
  right: AIConceptCoachPromptTemplates,
  aiPromptTabs: SettingsAIConceptCoachPromptTab[],
): boolean {
  return String(left.baseRun || '').trim() === String(right.baseRun || '').trim()
    && aiPromptTabs.every((tab) => {
      const leftPair = getConceptCoachPromptPair(left, tab.id);
      const rightPair = getConceptCoachPromptPair(right, tab.id);
      return String(leftPair?.run || '').trim() === String(rightPair?.run || '').trim()
        && String(leftPair?.followUp || '').trim() === String(rightPair?.followUp || '').trim();
    });
}

function isGeneralChatPromptEmpty(template: AIGeneralChatPromptTemplate): boolean {
  return String(template.systemPrompt || '').trim().length === 0;
}

function areGeneralChatPromptsEqual(left: AIGeneralChatPromptTemplate, right: AIGeneralChatPromptTemplate): boolean {
  return String(left.systemPrompt || '').trim() === String(right.systemPrompt || '').trim();
}

export function resolveSettingsAIPromptUsageState(input: {
  settingKey: AIPromptSettingKey;
  aiSettings: AISettings;
  aiPromptTabs: SettingsAIConceptCoachPromptTab[];
}): SettingsAIPromptUsageState {
  switch (input.settingKey) {
    case 'generalChat': {
      const currentValue = input.aiSettings.prompts.skills.generalChat;
      if (isGeneralChatPromptEmpty(currentValue)) {
        return 'empty';
      }
      return areGeneralChatPromptsEqual(
        currentValue,
        getRecommendedPromptTemplateForSetting(input.settingKey) as AIGeneralChatPromptTemplate,
      )
        ? 'recommended'
        : 'custom';
    }
    case 'conceptCoach':
    default: {
      const currentValue = input.aiSettings.prompts.skills.conceptCoach;
      if (isConceptCoachPromptEmpty(currentValue, input.aiPromptTabs)) {
        return 'empty';
      }

      return areConceptCoachPromptsEqual(
        currentValue,
        getRecommendedPromptTemplateForSetting(input.settingKey) as AIConceptCoachPromptTemplates,
        input.aiPromptTabs,
      )
        ? 'recommended'
        : 'custom';
    }
  }
}

export function getSettingsAIPromptUsageCopy(input: {
  settingKey: AIPromptSettingKey;
  aiSettings: AISettings;
  aiPromptTabs: SettingsAIConceptCoachPromptTab[];
  t: SettingsI18nLookup;
}): SettingsAIPromptUsageCopy {
  const usageState = resolveSettingsAIPromptUsageState(input);
  switch (usageState) {
    case 'custom':
      return {
        usageState,
        usageLabel: input.t('aiPromptStatusCustom', '当前使用自定义覆盖'),
        usageHint: input.t('aiPromptStatusCustomHint', '下面显示的是你当前保存或正在编辑的行为 Prompt 和追问 Prompt；结构化规则会由系统自动附加。'),
      };
    case 'empty':
      return {
        usageState,
        usageLabel: input.t('aiPromptStatusEmpty', '当前编辑区为空'),
        usageHint: input.t('aiPromptStatusEmptyHint', '当前这组 Prompt 为空；你可以直接填写，或点击恢复推荐模板。'),
      };
    case 'recommended':
    default:
      return {
        usageState: 'recommended',
        usageLabel: input.t('aiPromptStatusRecommended', '当前使用推荐模板'),
        usageHint: input.t('aiPromptStatusRecommendedHint', '下面显示的是当前内置推荐的行为 Prompt 和追问 Prompt；结构化规则会由系统自动附加。'),
      };
  }
}

export function buildSettingsAIPromptPresetCards(input: {
  aiSettings: AISettings;
  aiPromptTabs: SettingsAIConceptCoachPromptTab[];
  t: SettingsI18nLookup;
}): SettingsAIPromptPresetCard[] {
  return AI_PROMPT_PRESET_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    title: input.t(descriptor.titleKey, descriptor.titleFallback),
    audience: input.t(descriptor.audienceKey, descriptor.audienceFallback),
    behavior: input.t(descriptor.behaviorKey, descriptor.behaviorFallback),
    output: input.t(descriptor.outputKey, descriptor.outputFallback),
    hasStructuredContract: descriptor.settingKey === 'conceptCoach',
    systemContractSummary: descriptor.settingKey === 'conceptCoach'
      ? getPromptContractForSetting(descriptor.settingKey).summary
      : '',
    systemContractLines: descriptor.settingKey === 'conceptCoach'
      ? getPromptContractForSetting(descriptor.settingKey).runtimeLines
      : [],
    ...getSettingsAIPromptUsageCopy({
      settingKey: descriptor.settingKey,
      aiSettings: input.aiSettings,
      aiPromptTabs: input.aiPromptTabs,
      t: input.t,
    }),
  }));
}

export function buildSettingsAIPromptEditorTabs(
  aiPromptTabs: SettingsAIConceptCoachPromptTab[],
): Array<{ id: AIConceptCoachTabId; title: string }> {
  return aiPromptTabs.map((tab) => ({
    id: tab.id as AIConceptCoachTabId,
    title: tab.title,
  }));
}

export function reorderSettingsListByIds<T extends { id: string }>(source: T[], orderedIds: string[]): T[] {
  const itemsById = new Map(source.map((item) => [item.id, item] as const));
  return orderedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is T => Boolean(item));
}

export function upsertSettingsUserSkillDraft(input: {
  skills: AIUserSkillDefinition[];
  skill: AIUserSkillDefinition;
  index?: number;
}): AIUserSkillDefinition[] {
  const next = [...input.skills];
  if (typeof input.index === 'number' && input.index >= 0 && input.index < next.length) {
    next.splice(input.index, 1, input.skill);
  } else {
    next.push(input.skill);
  }
  return normalizeAIUserSkills(next);
}

export function createSettingsUserSkillSection(index = 0) {
  return {
    id: `section-${index + 1}`,
    title: `Section ${index + 1}`,
    emptyHint: '这个 section 暂时没有可展示内容。',
    runPrompt: `生成第 ${index + 1} 个 section。`,
    followUpPrompt: `基于第 ${index + 1} 个 section 回答用户追问。`,
    responseKey: `section${index + 1}`,
    renderer: 'markdown' as const,
    required: true,
  };
}

export function createSettingsUserSkill(
  mode: SettingsUserSkillMode,
  index: number,
): AIUserSkillDefinition {
  return normalizeAIUserSkills([{
    id: `skill-${index + 1}`,
    title: mode === 'structured' ? `结构化 Skill ${index + 1}` : `聊天 Skill ${index + 1}`,
    brief: mode === 'structured' ? '按 section 生成结构化结果。' : '在统一会话里使用上下文和工具聊天。',
    enabled: true,
    mode,
    systemPromptTemplate: mode === 'structured'
      ? '你是一个结构化学习助手。请按给定 sections 返回 JSON。'
      : '你是一个学习助手。请基于当前上下文和工具回答用户。',
    composerPreset: mode === 'structured' ? '请基于当前材料运行这个 Skill。' : '请继续聊天或贴入材料。',
    primaryActionLabel: mode === 'structured' ? '运行 Skill' : '开始聊天',
    defaultToolGroups: ['context-read', 'vars'],
    sections: mode === 'structured' ? [createSettingsUserSkillSection(0)] : [],
    surfaceHints: {
      hideTabs: mode === 'chat',
      composerRows: mode === 'chat' ? 5 : 4,
      compactTitle: '',
    },
    version: 1,
  }])[0];
}

export function duplicateSettingsUserSkill(skill: AIUserSkillDefinition): AIUserSkillDefinition {
  return normalizeAIUserSkills([{
    ...JSON.parse(JSON.stringify(skill)) as AIUserSkillDefinition,
    id: `${skill.id}-copy`,
    title: `${skill.title} Copy`,
  }])[0];
}
