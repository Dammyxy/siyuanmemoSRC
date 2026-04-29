import { ref, type ComputedRef, type Ref } from 'vue';
import type { AIPromptSettingKey } from '@/application/services/AIPromptComposer';
import {
  AI_CHAT_TOOL_DESCRIPTORS,
  AI_CHAT_TOOL_GROUPS,
} from '@/application/services/AIChatToolRegistry';
import type {
  AIConceptCoachPromptTemplates,
  AIGeneralChatPromptTemplate,
  AISettings,
  AIToolExecutionPolicy,
  AIToolResultApprovalPolicy,
} from '@/types';
import type {
  AIChatToolGroupKey,
  AIUserSkillDefinition,
} from '@/types/ai';
import { createVueDialog } from '@/utils/dialog';
import AiToolPermissionManagerDialog from '@/ui/settings/ai/AiToolPermissionManagerDialog.vue';
import AiBuiltInPromptEditorDialog from '@/ui/settings/ai/AiBuiltInPromptEditorDialog.vue';
import AiUserSkillEditorDialog from '@/ui/settings/ai/AiUserSkillEditorDialog.vue';
import {
  SETTINGS_AI_USER_SKILL_RENDERER_OPTIONS,
  SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS,
  buildSettingsAIPromptEditorTabs,
  createSettingsUserSkill,
  duplicateSettingsUserSkill,
  reorderSettingsListByIds,
  upsertSettingsUserSkillDraft,
  type SettingsAIConceptCoachPromptTab,
  type SettingsAIPromptPresetCard,
  type SettingsI18nLookup,
  type SettingsUserSkillMode,
} from './settingsAIViewModel';
import {
  cloneSettingsSerializable,
  resetAiPromptToRecommended,
} from './settingsStateDefaults';

type SettingsManagedDialogHandle = ReturnType<typeof createVueDialog>;

export interface SettingsAIDialogsControllerInput {
  aiSettings: Ref<AISettings>;
  aiPromptTabs: SettingsAIConceptCoachPromptTab[];
  aiPromptPresetCards: ComputedRef<SettingsAIPromptPresetCard[]>;
  t: SettingsI18nLookup;
  getI18n: () => Record<string, string>;
}

export interface SettingsAIDialogsController {
  openToolPermissionManager: (groupKey?: AIChatToolGroupKey) => void;
  openBuiltInPromptEditor: (settingKey: AIPromptSettingKey) => void;
  openUserSkillEditor: (skill: AIUserSkillDefinition, options?: { index?: number; isNew?: boolean }) => void;
  handleUserSkillReorder: (items: Array<{ id: string }>) => void;
  resetAiPromptTemplate: (settingKey: AIPromptSettingKey) => void;
  addUserSkill: (mode: SettingsUserSkillMode) => void;
  duplicateUserSkill: (index: number) => void;
  removeUserSkill: (index: number) => void;
  destroySettingsAIDialogs: () => void;
}

function destroyManagedDialog(handle: SettingsManagedDialogHandle | null): void {
  handle?.destroy();
}

export function useSettingsAIDialogs(input: SettingsAIDialogsControllerInput): SettingsAIDialogsController {
  const toolPermissionDialogHandle = ref<SettingsManagedDialogHandle | null>(null);
  const builtInPromptDialogHandle = ref<SettingsManagedDialogHandle | null>(null);
  const userSkillDialogHandle = ref<SettingsManagedDialogHandle | null>(null);

  function closeToolPermissionDialog(): void {
    destroyManagedDialog(toolPermissionDialogHandle.value);
    toolPermissionDialogHandle.value = null;
  }

  function closeBuiltInPromptDialog(): void {
    destroyManagedDialog(builtInPromptDialogHandle.value);
    builtInPromptDialogHandle.value = null;
  }

  function closeUserSkillDialog(): void {
    destroyManagedDialog(userSkillDialogHandle.value);
    userSkillDialogHandle.value = null;
  }

  function openToolPermissionManager(groupKey?: AIChatToolGroupKey): void {
    closeToolPermissionDialog();
    const groupTitle = groupKey
      ? AI_CHAT_TOOL_GROUPS.find((group) => group.key === groupKey)?.title || groupKey
      : '';

    toolPermissionDialogHandle.value = createVueDialog({
      title: groupKey
        ? input.t('aiPermissionManagerGroupTitle', '管理分组执行权限').replace('{group}', groupTitle)
        : input.t('aiPermissionManagerTitle', '管理工具执行权限'),
      component: AiToolPermissionManagerDialog,
      props: {
        groupKey: groupKey || null,
        groups: AI_CHAT_TOOL_GROUPS,
        tools: AI_CHAT_TOOL_DESCRIPTORS,
        executionPolicies: cloneSettingsSerializable(input.aiSettings.value.toolPolicies.executionPolicies),
        resultApprovalPolicies: cloneSettingsSerializable(input.aiSettings.value.toolPolicies.resultApprovalPolicies),
        i18n: input.getI18n(),
      },
      events: {
        save: (payload: {
          executionPolicies: Partial<Record<string, AIToolExecutionPolicy>>;
          resultApprovalPolicies: Partial<Record<string, AIToolResultApprovalPolicy>>;
        }) => {
          input.aiSettings.value.toolPolicies.executionPolicies = payload.executionPolicies;
          input.aiSettings.value.toolPolicies.resultApprovalPolicies = payload.resultApprovalPolicies;
          closeToolPermissionDialog();
        },
        close: closeToolPermissionDialog,
      },
      width: 'min(1080px, 96vw)',
      height: 'min(780px, 92vh)',
      responsive: true,
      visualVariant: 'manager',
      containerClass: 'siyuanmemo-ai-tool-permission-dialog',
      onClose: () => {
        toolPermissionDialogHandle.value = null;
      },
    });
  }

  function openBuiltInPromptEditor(settingKey: AIPromptSettingKey): void {
    const preset = input.aiPromptPresetCards.value.find((entry) => entry.settingKey === settingKey);
    if (!preset) {
      return;
    }

    closeBuiltInPromptDialog();
    builtInPromptDialogHandle.value = createVueDialog({
      title: preset.title,
      component: AiBuiltInPromptEditorDialog,
      props: {
        mode: settingKey,
        title: preset.title,
        summary: preset.usageHint,
        i18n: input.getI18n(),
        generalChatTemplate: settingKey === 'generalChat'
          ? cloneSettingsSerializable(input.aiSettings.value.prompts.skills.generalChat)
          : undefined,
        conceptCoachTemplate: settingKey === 'conceptCoach'
          ? cloneSettingsSerializable(input.aiSettings.value.prompts.skills.conceptCoach)
          : undefined,
        tabs: buildSettingsAIPromptEditorTabs(input.aiPromptTabs),
        contractSummary: preset.systemContractSummary,
        contractLines: preset.systemContractLines,
      },
      events: {
        save: (payload: {
          generalChatTemplate?: AIGeneralChatPromptTemplate;
          conceptCoachTemplate?: AIConceptCoachPromptTemplates;
        }) => {
          if (payload.generalChatTemplate) {
            input.aiSettings.value.prompts.skills.generalChat = payload.generalChatTemplate;
          }
          if (payload.conceptCoachTemplate) {
            input.aiSettings.value.prompts.skills.conceptCoach = payload.conceptCoachTemplate;
          }
          closeBuiltInPromptDialog();
        },
        close: closeBuiltInPromptDialog,
      },
      width: 'min(1100px, 96vw)',
      height: 'min(820px, 94vh)',
      responsive: true,
      visualVariant: 'manager',
      containerClass: 'siyuanmemo-ai-prompt-dialog',
      onClose: () => {
        builtInPromptDialogHandle.value = null;
      },
    });
  }

  function handleUserSkillReorder(items: Array<{ id: string }>): void {
    input.aiSettings.value.userSkills = reorderSettingsListByIds(
      input.aiSettings.value.userSkills,
      items.map((item) => item.id),
    );
  }

  function upsertUserSkillDraft(skill: AIUserSkillDefinition, index?: number): void {
    input.aiSettings.value.userSkills = upsertSettingsUserSkillDraft({
      skills: input.aiSettings.value.userSkills,
      skill,
      index,
    });
  }

  function openUserSkillEditor(skill: AIUserSkillDefinition, options?: { index?: number; isNew?: boolean }): void {
    closeUserSkillDialog();
    userSkillDialogHandle.value = createVueDialog({
      title: options?.isNew
        ? input.t('aiCreateUserSkillTitle', '创建用户 Skill')
        : input.t('aiEditUserSkillTitle', '编辑用户 Skill'),
      component: AiUserSkillEditorDialog,
      props: {
        skill: cloneSettingsSerializable(skill),
        isNew: options?.isNew === true,
        toolGroupOptions: SETTINGS_AI_USER_SKILL_TOOL_GROUP_OPTIONS,
        rendererOptions: SETTINGS_AI_USER_SKILL_RENDERER_OPTIONS,
        i18n: input.getI18n(),
      },
      events: {
        save: (payload: AIUserSkillDefinition) => {
          upsertUserSkillDraft(payload, options?.index);
          closeUserSkillDialog();
        },
        close: closeUserSkillDialog,
      },
      width: 'min(1240px, 97vw)',
      height: 'min(900px, 95vh)',
      responsive: true,
      visualVariant: 'manager',
      containerClass: 'siyuanmemo-ai-user-skill-dialog',
      onClose: () => {
        userSkillDialogHandle.value = null;
      },
    });
  }

  function resetAiPromptTemplate(settingKey: AIPromptSettingKey): void {
    resetAiPromptToRecommended(input.aiSettings.value, settingKey);
  }

  function addUserSkill(mode: SettingsUserSkillMode): void {
    openUserSkillEditor(createSettingsUserSkill(mode, input.aiSettings.value.userSkills.length), { isNew: true });
  }

  function duplicateUserSkill(index: number): void {
    const current = input.aiSettings.value.userSkills[index];
    if (!current) {
      return;
    }
    input.aiSettings.value.userSkills.splice(index + 1, 0, duplicateSettingsUserSkill(current));
  }

  function removeUserSkill(index: number): void {
    input.aiSettings.value.userSkills.splice(index, 1);
  }

  function destroySettingsAIDialogs(): void {
    closeToolPermissionDialog();
    closeBuiltInPromptDialog();
    closeUserSkillDialog();
  }

  return {
    openToolPermissionManager,
    openBuiltInPromptEditor,
    openUserSkillEditor,
    handleUserSkillReorder,
    resetAiPromptTemplate,
    addUserSkill,
    duplicateUserSkill,
    removeUserSkill,
    destroySettingsAIDialogs,
  };
}
