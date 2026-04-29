import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAIWorkbenchSkillTabs } from '@/application/services/AIWorkbenchSkillRegistry';
import { DEFAULT_SETTINGS } from '@/types/settings';
import {
  buildSettingsAIPromptPresetCards,
  createSettingsUserSkill,
} from '../settingsAIViewModel';
import { useSettingsAIDialogs } from '../settingsAIDialogs';

const { createVueDialogMock, destroyDialogMock } = vi.hoisted(() => ({
  destroyDialogMock: vi.fn(),
  createVueDialogMock: vi.fn(() => ({
    dialog: {},
    destroy: destroyDialogMock,
  })),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: createVueDialogMock,
}));

vi.mock('@/ui/settings/ai/AiToolPermissionManagerDialog.vue', () => ({
  default: { name: 'AiToolPermissionManagerDialog' },
}));

vi.mock('@/ui/settings/ai/AiBuiltInPromptEditorDialog.vue', () => ({
  default: { name: 'AiBuiltInPromptEditorDialog' },
}));

vi.mock('@/ui/settings/ai/AiUserSkillEditorDialog.vue', () => ({
  default: { name: 'AiUserSkillEditorDialog' },
}));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createController() {
  const aiSettings = ref(clone(DEFAULT_SETTINGS.ai));
  const aiPromptTabs = getAIWorkbenchSkillTabs('concept-coach');
  const t = (key: string, fallback: string) => ({
    aiPermissionManagerTitle: 'Tool permissions',
    aiCreateUserSkillTitle: 'Create skill',
    aiEditUserSkillTitle: 'Edit skill',
    aiGeneralChatPromptPresetTitle: 'General Chat',
    aiConceptCoachPromptPresetTitle: 'Concept Coach',
  }[key] || fallback);
  const aiPromptPresetCards = computed(() => buildSettingsAIPromptPresetCards({
    aiSettings: aiSettings.value,
    aiPromptTabs,
    t,
  }));

  return {
    aiSettings,
    controller: useSettingsAIDialogs({
      aiSettings,
      aiPromptTabs,
      aiPromptPresetCards,
      t,
      getI18n: () => ({ save: 'Save' }),
    }),
  };
}

describe('settingsAIDialogs', () => {
  beforeEach(() => {
    createVueDialogMock.mockClear();
    destroyDialogMock.mockClear();
  });

  it('opens tool permission manager and applies saved policies', () => {
    const { aiSettings, controller } = createController();

    controller.openToolPermissionManager();

    const dialogConfig = createVueDialogMock.mock.calls[0]?.[0] as {
      props: Record<string, unknown>;
      events: Record<string, (payload: unknown) => void>;
      visualVariant: string;
    };
    expect(dialogConfig.props.groupKey).toBeNull();
    expect(dialogConfig.props.i18n).toEqual({ save: 'Save' });
    expect(dialogConfig.visualVariant).toBe('manager');

    dialogConfig.events.save({
      executionPolicies: { GetCurrentContext: 'ask-always' },
      resultApprovalPolicies: { ReadBlock: 'always' },
    });

    expect(aiSettings.value.toolPolicies.executionPolicies.GetCurrentContext).toBe('ask-always');
    expect(aiSettings.value.toolPolicies.resultApprovalPolicies.ReadBlock).toBe('always');
    expect(destroyDialogMock).toHaveBeenCalledTimes(1);
  });

  it('opens built-in prompt editor and applies saved prompt templates', () => {
    const { aiSettings, controller } = createController();

    controller.openBuiltInPromptEditor('generalChat');

    const dialogConfig = createVueDialogMock.mock.calls[0]?.[0] as {
      props: Record<string, unknown>;
      events: Record<string, (payload: unknown) => void>;
      containerClass: string;
    };
    expect(dialogConfig.props.mode).toBe('generalChat');
    expect(dialogConfig.containerClass).toBe('siyuanmemo-ai-prompt-dialog');

    dialogConfig.events.save({
      generalChatTemplate: { systemPrompt: 'Custom system prompt' },
    });

    expect(aiSettings.value.prompts.skills.generalChat.systemPrompt).toBe('Custom system prompt');
    expect(destroyDialogMock).toHaveBeenCalledTimes(1);
  });

  it('opens user skill editor and keeps skill commands in the controller', () => {
    const { aiSettings, controller } = createController();

    controller.addUserSkill('structured');

    const dialogConfig = createVueDialogMock.mock.calls[0]?.[0] as {
      props: { skill: ReturnType<typeof createSettingsUserSkill>; isNew: boolean };
      events: Record<string, (payload: unknown) => void>;
      containerClass: string;
    };
    expect(dialogConfig.props.isNew).toBe(true);
    expect(dialogConfig.containerClass).toBe('siyuanmemo-ai-user-skill-dialog');

    dialogConfig.events.save({
      ...dialogConfig.props.skill,
      id: 'user:skill-a',
      title: 'Skill A',
    });

    expect(aiSettings.value.userSkills.map((skill) => skill.title)).toEqual(['Skill A']);

    controller.duplicateUserSkill(0);
    expect(aiSettings.value.userSkills).toHaveLength(2);
    expect(aiSettings.value.userSkills[1]?.id).toContain('copy');

    controller.handleUserSkillReorder([
      { id: aiSettings.value.userSkills[1]!.id },
      { id: aiSettings.value.userSkills[0]!.id },
    ]);
    expect(aiSettings.value.userSkills[0]?.id).toContain('copy');

    controller.removeUserSkill(1);
    expect(aiSettings.value.userSkills).toHaveLength(1);
  });
});
