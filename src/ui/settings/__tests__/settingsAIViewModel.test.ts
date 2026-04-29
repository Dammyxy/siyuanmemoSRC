import { describe, expect, it } from 'vitest';
import { getAIWorkbenchSkillTabs } from '@/application/services/AIWorkbenchSkillRegistry';
import { DEFAULT_SETTINGS } from '@/types/settings';
import {
  SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS,
  buildSettingsAIPromptEditorTabs,
  buildSettingsAIPromptPresetCards,
  buildSettingsAIUserSkillToolGroupLabelMap,
  createSettingsUserSkill,
  duplicateSettingsUserSkill,
  reorderSettingsListByIds,
  resolveSettingsAIPromptUsageState,
  upsertSettingsUserSkillDraft,
} from '../settingsAIViewModel';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const t = (key: string, fallback: string) => ({
  aiPromptStatusRecommended: 'Using Recommended Template',
  aiPromptStatusCustom: 'Using Custom Override',
  aiPromptStatusEmpty: 'Editor Is Empty',
  aiGeneralChatPromptPresetTitle: 'General Chat Preset',
  aiConceptCoachPromptPresetTitle: 'Concept Coach Preset',
}[key] || fallback);

const aiPromptTabs = getAIWorkbenchSkillTabs('concept-coach');

describe('settingsAIViewModel', () => {
  it('resolves prompt usage states for recommended, custom, and empty prompts', () => {
    const recommended = clone(DEFAULT_SETTINGS.ai);
    expect(resolveSettingsAIPromptUsageState({
      settingKey: 'generalChat',
      aiSettings: recommended,
      aiPromptTabs,
    })).toBe('recommended');

    const custom = clone(DEFAULT_SETTINGS.ai);
    custom.prompts.skills.generalChat.systemPrompt = 'custom prompt';
    expect(resolveSettingsAIPromptUsageState({
      settingKey: 'generalChat',
      aiSettings: custom,
      aiPromptTabs,
    })).toBe('custom');

    const empty = clone(DEFAULT_SETTINGS.ai);
    empty.prompts.skills.generalChat.systemPrompt = '   ';
    expect(resolveSettingsAIPromptUsageState({
      settingKey: 'generalChat',
      aiSettings: empty,
      aiPromptTabs,
    })).toBe('empty');
  });

  it('builds prompt preset cards with contract metadata', () => {
    const cards = buildSettingsAIPromptPresetCards({
      aiSettings: clone(DEFAULT_SETTINGS.ai),
      aiPromptTabs,
      t,
    });

    expect(cards.map((card) => card.title)).toEqual([
      'General Chat Preset',
      'Concept Coach Preset',
    ]);
    expect(cards[0]?.usageLabel).toBe('Using Recommended Template');
    expect(cards[0]?.hasStructuredContract).toBe(false);
    expect(cards[1]?.hasStructuredContract).toBe(true);
    expect(cards[1]?.systemContractLines.length).toBeGreaterThan(0);
  });

  it('builds user skill options, labels, and default skill drafts', () => {
    const labels = buildSettingsAIUserSkillToolGroupLabelMap();
    expect(labels['context-read']).toBe('context-read');
    expect(SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS.map((option) => option.key)).toContain('flashcard-write');

    const chatSkill = createSettingsUserSkill('chat', 0);
    expect(chatSkill.mode).toBe('chat');
    expect(chatSkill.surfaceHints?.hideTabs).toBe(true);
    expect(chatSkill.sections).toHaveLength(0);

    const structuredSkill = createSettingsUserSkill('structured', 1);
    expect(structuredSkill.mode).toBe('structured');
    expect(structuredSkill.sections[0]?.renderer).toBe('markdown');
    expect(structuredSkill.primaryActionLabel).toBe('运行 Skill');
  });

  it('duplicates, reorders, and upserts user skill drafts', () => {
    const first = createSettingsUserSkill('chat', 0);
    const second = createSettingsUserSkill('structured', 1);
    const duplicate = duplicateSettingsUserSkill(first);

    expect(duplicate.id).toBe(`${first.id}-copy`);
    expect(duplicate.title).toBe(`${first.title} Copy`);

    expect(reorderSettingsListByIds([first, second], [second.id, first.id]).map((skill) => skill.id)).toEqual([
      second.id,
      first.id,
    ]);

    const replaced = upsertSettingsUserSkillDraft({
      skills: [first, second],
      skill: duplicate,
      index: 1,
    });
    expect(replaced.map((skill) => skill.id)).toEqual([first.id, duplicate.id]);

    const appended = upsertSettingsUserSkillDraft({
      skills: [first],
      skill: second,
      index: 10,
    });
    expect(appended.map((skill) => skill.id)).toEqual([first.id, second.id]);
  });

  it('builds prompt editor tab props from workbench skill tabs', () => {
    expect(buildSettingsAIPromptEditorTabs(aiPromptTabs).map((tab) => tab.id)).toEqual([
      'working-definition',
      'perspectives',
      'integrated-understanding',
      'self-test-cards',
      'cdf-structure',
      'real-world-triggers',
    ]);
  });
});
