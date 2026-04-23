import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SettingsPanel from '../SettingsPanel.vue';
import { DEFAULT_SETTINGS } from '@/types/settings';

const { createVueDialogMock } = vi.hoisted(() => ({
  createVueDialogMock: vi.fn(() => ({
    dialog: {},
    destroy: vi.fn(),
  })),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: createVueDialogMock,
}));

function mountPanel(defaultTab = 'params', extraProps: Record<string, unknown> = {}) {
  return mount(SettingsPanel, {
    props: {
      defaultTab,
      queueSettings: DEFAULT_SETTINGS.queues,
      fsrsSettings: DEFAULT_SETTINGS.fsrs,
      schedulerSettings: DEFAULT_SETTINGS.scheduler,
      priorityRandomness: DEFAULT_SETTINGS.priorityRandomness,
      quickCardSettings: DEFAULT_SETTINGS.quickCard,
      progressiveReadingSettings: DEFAULT_SETTINGS.progressiveReading,
      aiSettings: DEFAULT_SETTINGS.ai,
      captureStorageNotebooks: [
        { id: 'notebook-a', name: 'Notebook A' },
        { id: 'notebook-b', name: 'Notebook B' },
      ],
      i18n: {
        settingsStudyTab: 'Learning & Scheduling',
        settingsReviewQueueTab: 'Review & Queue',
        settingsCardTab: 'Card Creation',
        settingsCaptureSyncTab: 'Excerpt & Sync',
        settingsNeuralTab: 'Neural Roam',
        settingsAiTab: 'AI Workbench',
        settingsMaintenanceTab: 'Maintenance',
        settingsAboutTab: 'About',
        settingsSubtabFsrsParams: 'FSRS Parameters',
        settingsSubtabScheduler: 'Scheduler',
        settingsSubtabDayStart: 'Daily Refresh',
        settingsSubtabReviewSurface: 'Review Surface',
        settingsSubtabQueueAutomation: 'Queue Automation',
        settingsSubtabQueueOrdering: 'Ordering & Insertion',
        settingsSubtabQuickCard: 'Symbol Card Listener',
        settingsSubtabTopicDerivation: 'Continue Under Topic',
        settingsSubtabExcerptEntry: 'Excerpt Entry',
        settingsSubtabStorage: 'Storage',
        settingsSubtabConflict: 'Conflict Handling',
        settingsSubtabNeuralHistory: 'Path History',
        settingsSubtabHyperspaceChannels: 'Propagation Channels',
        settingsSubtabHyperspaceRange: 'Spread Range',
        settingsSubtabHyperspaceWeights: 'Propagation Weights',
        settingsSubtabAiProvider: 'Model Access',
        settingsSubtabAiRuntime: 'Chat & Tools',
        settingsSubtabAiBuiltInSkill: 'Built-in Skill',
        settingsSubtabAiUserSkills: 'User Skills',
        reviewWindowSectionTitle: 'Review Surface',
        queueAutomationSectionTitle: 'Queue Automation',
        queueOrderingSectionTitle: 'Queue Ordering & Insertions',
        aiDraftStorageSectionTitle: 'AI Draft Storage',
        neuralHistorySettingsTitle: 'Path History',
        neuralHistorySettingsIntro: 'Path history settings live here.',
        neuralHistoryMaxEntries: 'Path history limit',
        neuralHistoryMaxEntriesHint: 'Recommended range 200-5000.',
        hyperspaceSettingsTitle: 'Hyperspace / SuperMemo Fidelity',
        learningQueueTitle: 'Learning & Queue',
        neuralSettingsIntro: 'Hyperspace settings live here.',
        hyperspaceChannelsSection: 'Propagation Channels',
        hyperspaceRangeSection: 'Spread Range',
        hyperspaceWeightsSection: 'Propagation Weights',
        hyperspaceEnableBlockTree: 'Enable block tree conduction',
        hyperspaceEnableDocumentTree: 'Enable document tree conduction',
        hyperspaceMaxLayersPerRepetition: 'Layers per repetition',
        hyperspaceElementLinkPriority: 'Block-link weight',
        progressiveReadingSettingsTitle: 'Progressive Reading',
        progressiveAltXExcerptEnabled: 'Enable excerpt shortcut (default ⌥⇧X)',
        reviewOpenInNewTabByDefault: 'Open review in a new tab by default',
        reviewOpenInNewTabByDefaultHint: 'Desktop global review entries open in a new tab by default.',
        reviewOpenFullscreenByDefault: 'Open review fullscreen by default',
        reviewOpenFullscreenByDefaultHint: 'Only applies to desktop dialog mode and is ignored when new-tab open is enabled.',
        enableDebugLogs: 'Enable Debug Logs',
        enableDebugLogsHint: 'Display detailed debug information in the browser console.',
        progressiveStorageModeLabel: 'Excerpt storage mode',
        progressiveStorageModeHint: 'Choose where excerpts should be stored.',
        captureStorageModeSourceChild: 'Under source document',
        captureStorageModeLibrary: 'Library',
        captureStorageModeDailyNote: 'Daily Note',
        captureStorageNotebookLabel: 'Target notebook',
        captureStorageNotebookPlaceholder: 'Select notebook',
        captureStorageNotebookHint: 'Notebook is manually fixed here.',
        progressiveStorageNotebookIgnoredHint: 'Source-document mode follows the source document.',
        captureStorageTargetBlockIdLabel: 'Target block ID (optional)',
        progressiveStorageTargetBlockHint: 'Library mode accepts a target document block ID.',
        progressiveStorageTargetBlockIgnoredSourceChildHint: 'Target block ID is ignored in source-document mode.',
        progressiveStorageTargetBlockIgnoredHint: 'Target block ID is ignored in Daily Note mode.',
        topicDerivationTitle: 'Item Storage',
        topicDerivationEnabled: 'Enable symbol-based continuation inside existing Topics',
        topicDerivationEnabledHint: 'Only affects the symbol card listener flow and not manual Item creation with ⌥⇧Z.',
        topicDerivationStorageMode: 'Item storage',
        topicDerivationStorageWorkbench: 'Workbench document (default)',
        topicDerivationStorageSourceChild: 'Direct child under source document',
        topicDerivationStorageModeHint: 'Applies to Item derivation inside existing Topics, including ⌥⇧Z and symbol continuation.',
        aiDraftStorageModeLabel: 'AI draft storage mode',
        aiDraftStorageModeHint: 'Choose where AI drafts should be saved.',
        aiDraftStorageTargetBlockHint: 'Library mode accepts a target document or block ID.',
        aiSettingsTitle: 'AI Workbench',
        aiBaseUrl: 'Base URL',
        aiApiKey: 'API Key',
        aiModel: 'Model',
        aiEnabled: 'Enable AI',
        aiPromptTemplates: 'Prompt Templates',
        aiToolManagerSummaryTitle: 'Tool Group Manager',
        aiManageToolPermissions: 'Manage Tool Permissions',
        aiEditPrompt: 'Edit Prompt',
        aiWriteRisk: 'Write Risk',
        aiToolOverridesCount: '{count} overrides',
        aiExpandGroup: 'Expand Tools',
        aiCollapseGroup: 'Collapse Tools',
        aiToolOverrideBadge: 'Approval Override',
        aiGeneralChatPromptPresetTitle: 'General Chat Preset',
        aiTutorPrompt: 'Tutor Prompt',
        aiExplainPrompt: 'Explain Prompt',
        aiCardCandidatePrompt: 'Card Prompt',
        aiCardCandidateCdfPrompt: 'CDF Card Prompt',
        aiTutorPromptPresetTitle: 'Tutor Preset',
        aiExplainPromptPresetTitle: 'Explain Preset',
        aiCardPromptPresetTitle: 'Card Preset',
        aiCdfPromptPresetTitle: 'CDF Preset',
        aiRestoreRecommendedPrompt: 'Restore Recommended Template',
        aiBehaviorPrompt: 'Behavior Prompt',
        aiBehaviorPromptHint: 'The system appends structured output rules automatically; use this area for role, goal, tone, and preferences.',
        aiPromptShowSystemContract: 'Show the system-appended structured contract',
        aiRunPrompt: 'Run Prompt',
        aiFollowUpPrompt: 'Follow-up Prompt',
        aiPromptAudience: 'Audience',
        aiPromptBehavior: 'Default Behavior',
        aiPromptOutput: 'Output Shape',
        aiPromptCurrentStatus: 'Current Status',
        aiPromptStatusRecommended: 'Using Recommended Template',
        aiPromptStatusRecommendedHint: 'The recommended behavior and follow-up prompts are shown below; the system appends structured rules automatically.',
        aiPromptStatusCustom: 'Using Custom Override',
        aiPromptStatusCustomHint: 'The saved behavior and follow-up prompts below are custom; the system appends structured rules automatically.',
        aiPromptStatusEmpty: 'Editor Is Empty',
        aiPromptStatusEmptyHint: 'This prompt pair is empty right now.',
        aiNoUserSkills: 'No user skills yet',
        aiNoUserSkillsHint: 'Create one to customize your workflows.',
        aiAddChatSkill: 'Add Chat Skill',
        aiAddStructuredSkill: 'Add Structured Skill',
        edit: 'Edit',
        duplicate: 'Duplicate',
        delete: 'Delete',
        disabled: 'Disabled',
        tools: 'Tools',
        sections: 'Sections',
        primaryAction: 'Primary Action',
        saveSettings: 'Save Settings',
      },
      ...extraProps,
    },
  });
}

async function clickSubtab(wrapper: ReturnType<typeof mountPanel>, label: string) {
  const button = wrapper.findAll('.settings-subtab').find((tab) => tab.text().includes(label));
  expect(button).toBeDefined();
  await button!.trigger('click');
  await wrapper.vm.$nextTick();
  return button!;
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    createVueDialogMock.mockClear();
  });

  it('renders left-side settings tabs and maps legacy params/fsrs tabs to learning', async () => {
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    const tabLabels = wrapper.findAll('.settings-tab').map((tab) => tab.text());
    expect(tabLabels).toEqual([
      'Learning & Scheduling',
      'Review & Queue',
      'Card Creation',
      'Excerpt & Sync',
      'Neural Roam',
      'AI Workbench',
      'Maintenance',
      'About',
    ]);
    expect(wrapper.findAll('.settings-subtab').map((tab) => tab.text())).toEqual([
      'FSRS Parameters',
      'Scheduler',
      'Daily Refresh',
    ]);
    expect(wrapper.text()).toContain('FSRS 参数');

    for (const label of tabLabels) {
      const tab = wrapper.findAll('.settings-tab').find((entry) => entry.text() === label);
      expect(tab).toBeDefined();
      await tab!.trigger('click');
      await wrapper.vm.$nextTick();
      expect(wrapper.findAll('.settings-subtab').length).toBeGreaterThan(0);
    }

    const fsrsAliasWrapper = mountPanel('fsrs');
    await fsrsAliasWrapper.vm.$nextTick();
    expect(fsrsAliasWrapper.text()).toContain('FSRS 参数');
  });

  it('saves learning and scheduling settings from the learning tab', async () => {
    const wrapper = mountPanel('learning');
    await wrapper.vm.$nextTick();

    const formItems = wrapper.findAll('.form-item');
    const retentionItem = formItems.find((item) => item.text().includes('请求保留率'));
    const retentionInput = retentionItem?.find('input[type="range"]');
    const dayStartItem = formItems.find((item) => item.text().includes('每日刷新时间'));
    const dayStartInput = dayStartItem?.find('input[type="number"]');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    expect(retentionInput).toBeDefined();
    expect(dayStartInput).toBeDefined();
    expect(saveButton).toBeDefined();

    await retentionInput!.setValue(0.93);
    await clickSubtab(wrapper, 'Scheduler');
    expect(wrapper.findAll('.settings-subtab').find((tab) => tab.text().includes('Scheduler'))!.attributes('aria-selected')).toBe('true');
    await clickSubtab(wrapper, 'Daily Refresh');
    await dayStartInput!.setValue(6);
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.requestRetention).toBe(0.93);
    expect(payload.dayStartHour).toBe(6);
  });

  it('renders hyperspace settings section on the neural tab and saves updates', async () => {
    const wrapper = mountPanel('neural');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Hyperspace / SuperMemo Fidelity');
    expect(wrapper.text()).toContain('Path History');

    const formItems = wrapper.findAll('.form-item');
    const historyLimitItem = formItems.find((item) => item.text().includes('Path history limit'));
    const historyLimitInput = historyLimitItem?.find('input[type="number"]');
    expect(historyLimitInput).toBeDefined();
    await historyLimitInput!.setValue(4200);

    await clickSubtab(wrapper, 'Propagation Channels');
    expect(wrapper.text()).toContain('Enable block tree conduction');
    expect(wrapper.text()).toContain('Enable document tree conduction');

    const blockTreeItem = formItems.find((item) => item.text().includes('Enable block tree conduction'));
    const blockTreeToggle = blockTreeItem?.find('input[type="checkbox"]');
    expect(blockTreeToggle).toBeDefined();
    await blockTreeToggle!.setValue(true);

    await clickSubtab(wrapper, 'Spread Range');
    const maxLayersItem = formItems.find((item) => item.text().includes('Layers per repetition'));
    const maxLayersInput = maxLayersItem?.find('input[type="number"]');
    expect(maxLayersInput).toBeDefined();
    await maxLayersInput!.setValue(4);

    await clickSubtab(wrapper, 'Propagation Weights');
    expect(wrapper.text()).toContain('Block-link weight');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.queues.neuralRoam?.history.maxEntries).toBe(4200);
    expect(payload.queues.neuralRoam?.hyperspace.treeChannels.blockTree).toBe(true);
    expect(payload.queues.neuralRoam?.hyperspace.maxLayersPerRepetition).toBe(4);
    expect(payload.queues.neuralRoam?.hyperspace.treeChannels.documentTree).toBe(false);
  });

  it('hides the global actions on the maintenance and about tabs', async () => {
    const maintenanceWrapper = mountPanel('maintenance');
    await maintenanceWrapper.vm.$nextTick();

    expect(maintenanceWrapper.text()).not.toContain('Save Settings');
    expect(maintenanceWrapper.find('.settings-footer').exists()).toBe(false);

    const aboutWrapper = mountPanel('about');
    await aboutWrapper.vm.$nextTick();

    expect(aboutWrapper.text()).not.toContain('Save Settings');
    expect(aboutWrapper.find('.settings-footer').exists()).toBe(false);
  });

  it('shows the symbol-only continuation toggle in the card tab without restoring extra subtabs', async () => {
    const wrapper = mountPanel('card', {
      quickCardSettings: {
        ...DEFAULT_SETTINGS.quickCard,
        enabled: true,
        topicDerivation: {
          ...DEFAULT_SETTINGS.quickCard.topicDerivation,
          enabled: true,
        },
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.settings-subtab').map((tab) => tab.text())).toEqual(['Symbol Card Listener']);
    expect(wrapper.text()).toContain('Enable symbol-based continuation inside existing Topics');

    const formItems = wrapper.findAll('.form-item');
    const topicEnabledItem = formItems.find((item) => item.text().includes('Enable symbol-based continuation inside existing Topics'));
    const topicEnabledToggle = topicEnabledItem?.find('input[type="checkbox"]');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    expect(topicEnabledToggle).toBeDefined();
    expect(saveButton).toBeDefined();

    await topicEnabledToggle!.setValue(false);
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.quickCard.topicDerivation.enabled).toBe(false);
  });

  it('shows item storage controls in capture-sync storage even when symbol card listening is disabled', async () => {
    const wrapper = mountPanel('capture-sync', {
      quickCardSettings: {
        ...DEFAULT_SETTINGS.quickCard,
        enabled: false,
      },
    });
    await wrapper.vm.$nextTick();

    await clickSubtab(wrapper, 'Storage');
    expect(wrapper.text()).toContain('Item Storage');
    expect(wrapper.text()).toContain('Item storage');
    expect(wrapper.text()).not.toContain('Symbol card listening is currently disabled.');

    const formItems = wrapper.findAll('.form-item');
    const topicStorageModeItem = formItems.find((item) => item.text().includes('Item storage'));
    const topicStorageModeSelect = topicStorageModeItem?.find('select');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    expect(topicStorageModeSelect).toBeDefined();
    expect(saveButton).toBeDefined();

    await topicStorageModeSelect!.setValue('source-child');
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.quickCard.enabled).toBe(false);
    expect(payload.quickCard.topicDerivation.storageMode).toBe('source-child');
  });

  it('saves excerpt storage, item storage, and conflict strategy from the excerpt tab', async () => {
    const wrapper = mountPanel('capture-sync');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Progressive Reading');
    expect(wrapper.text()).toContain('Enable excerpt shortcut');
    expect(wrapper.text()).toContain('⌥⇧X');
    expect(wrapper.text()).not.toContain('Alt+X');

    const formItems = wrapper.findAll('.form-item');
    const altXItem = formItems.find((item) => item.text().includes('Enable excerpt shortcut'));
    const altXToggle = altXItem?.find('input[type="checkbox"]');
    const storageModeItem = formItems.find((item) => item.text().includes('Excerpt storage mode'));
    const storageModeSelect = storageModeItem?.find('select');
    const notebookItem = formItems.find((item) => item.text().includes('Target notebook'));
    const notebookSelect = notebookItem?.find('select');
    const targetBlockItem = formItems.find((item) => item.text().includes('Target block ID'));
    const targetBlockInput = targetBlockItem?.find('input[type="text"]');
    const topicStorageModeItem = formItems.find((item) => item.text().includes('Item storage'));
    const topicStorageModeSelect = topicStorageModeItem?.find('select');
    const conflictItem = formItems.find((item) => item.text().includes('冲突策略'));
    const conflictSelect = conflictItem?.find('select');

    expect(altXToggle).toBeDefined();
    await altXToggle!.setValue(true);

    await clickSubtab(wrapper, 'Storage');

    expect(storageModeSelect).toBeDefined();
    expect(notebookSelect).toBeDefined();
    expect(targetBlockInput).toBeDefined();
    expect(topicStorageModeSelect).toBeDefined();
    expect((storageModeSelect!.element as HTMLSelectElement).value).toBe('source-child');
    expect((notebookSelect!.element as HTMLSelectElement).disabled).toBe(true);
    expect((targetBlockInput!.element as HTMLInputElement).disabled).toBe(true);

    await storageModeSelect!.setValue('library');
    await notebookSelect!.setValue('notebook-a');
    await targetBlockInput!.setValue('doc-root-1');
    await topicStorageModeSelect!.setValue('source-child');

    await clickSubtab(wrapper, 'Conflict Handling');
    expect(conflictSelect).toBeDefined();
    await conflictSelect!.setValue('prefer-local');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.progressiveReading.altXExcerptEnabled).toBe(true);
    expect(payload.progressiveReading).not.toHaveProperty('dailyTraceEnabled');
    expect(payload.progressiveReading.storage).toEqual({
      mode: 'library',
      notebookId: 'notebook-a',
      targetBlockId: 'doc-root-1',
    });
    expect(payload.quickCard.topicDerivation).toEqual({
      enabled: true,
      storageMode: 'source-child',
    });
    expect(payload.riffIntegration.storageConflictResolution).toBe('prefer-local');
  });

  it('keeps source-document excerpt storage without forcing notebook or target block fields', async () => {
    const wrapper = mountPanel('capture-sync');
    await wrapper.vm.$nextTick();

    const formItems = wrapper.findAll('.form-item');
    const storageModeItem = formItems.find((item) => item.text().includes('Excerpt storage mode'));
    const storageModeSelect = storageModeItem?.find('select');
    const notebookItem = formItems.find((item) => item.text().includes('Target notebook'));
    const notebookSelect = notebookItem?.find('select');
    const targetBlockItem = formItems.find((item) => item.text().includes('Target block ID'));
    const targetBlockInput = targetBlockItem?.find('input[type="text"]');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    await clickSubtab(wrapper, 'Storage');

    expect(storageModeSelect).toBeDefined();
    expect(notebookSelect).toBeDefined();
    expect(targetBlockInput).toBeDefined();
    expect(saveButton).toBeDefined();

    await storageModeSelect!.setValue('library');
    await notebookSelect!.setValue('notebook-b');
    await targetBlockInput!.setValue('ignored-block');
    await storageModeSelect!.setValue('source-child');
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.progressiveReading.storage).toEqual({
      mode: 'source-child',
      notebookId: 'notebook-b',
      targetBlockId: 'ignored-block',
    });
  });

  it('renders AI settings managers and saves runtime tool defaults without changing schema', async () => {
    const wrapper = mountPanel('ai');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('AI Workbench');
    expect(wrapper.text()).toContain('Prompt Templates');

    const formItems = wrapper.findAll('.form-item');
    const enableItem = formItems.find((item) => item.text().includes('Enable AI'));
    const enableToggle = enableItem?.find('input[type="checkbox"]');
    expect(enableToggle).toBeDefined();

    const baseUrlItem = formItems.find((item) => item.text().includes('Base URL'));
    const baseUrlInput = baseUrlItem?.find('input[type="text"]');
    const modelItem = formItems.find((item) => item.text().includes('Model'));
    const modelInput = modelItem?.find('input[type="text"]');
    const apiKeyItem = formItems.find((item) => item.text().includes('API Key'));
    const passwordInput = apiKeyItem?.find('input[type="password"]');
    expect(baseUrlInput).toBeDefined();
    expect(modelInput).toBeDefined();
    expect(passwordInput).toBeDefined();

    await baseUrlInput!.setValue('https://example.test/v1');
    await modelInput!.setValue('gpt-test');
    await passwordInput!.setValue('secret-key');
    await enableToggle!.setValue(false);

    await clickSubtab(wrapper, 'Chat & Tools');
    expect(wrapper.find('.settings-panel').classes()).toContain('siyuanmemo-settings-theme');
    expect(wrapper.text()).toContain('学习决策');
    expect(wrapper.text()).toContain('思源写入');
    expect(wrapper.text()).toContain('Tool Group Manager');
    expect(wrapper.findAll('.ai-tool-group-card').length).toBeGreaterThan(0);
    expect(wrapper.find('.ai-tool-group-card select').exists()).toBe(false);
    expect(wrapper.find('.ai-tool-group-card__head .ai-tool-group-card__meta').exists()).toBe(true);
    expect(wrapper.find('.ai-tool-group-card > .ai-tool-group-card__meta').exists()).toBe(false);

    const toolPermissionButton = wrapper.find('.ai-settings-manager__action');
    expect(toolPermissionButton.exists()).toBe(true);
    await toolPermissionButton.trigger('click');
    expect(createVueDialogMock).toHaveBeenCalledTimes(1);
    expect(createVueDialogMock.mock.calls[0]?.[0]?.props?.groupKey).toBeNull();
    expect(createVueDialogMock.mock.calls[0]?.[0]?.visualVariant).toBe('manager');
    expect(createVueDialogMock.mock.calls[0]?.[0]?.containerClass).toBe('siyuanmemo-ai-tool-permission-dialog');

    const expandButton = wrapper.find('.ai-tool-group-card__expand');
    expect(expandButton.exists()).toBe(true);
    await expandButton.trigger('click');
    await wrapper.vm.$nextTick();

    const firstToolToggle = wrapper.find('.ai-tool-row input[type="checkbox"]');
    expect(firstToolToggle.exists()).toBe(true);
    await firstToolToggle.setValue(false);

    await clickSubtab(wrapper, 'Built-in Skill');
    expect(wrapper.findAll('.ai-prompt-preset-card')).toHaveLength(2);
    expect(wrapper.findAll('.ai-prompt-preset-card textarea')).toHaveLength(0);
    expect(wrapper.findAll('.ai-prompt-preset-card__row')).toHaveLength(6);
    expect(wrapper.text()).toContain('General Chat Preset');
    expect(wrapper.text()).toContain('Using Recommended Template');

    const promptEditButtons = wrapper.findAll('.ai-prompt-preset-card__edit-action');
    expect(promptEditButtons).toHaveLength(2);
    await promptEditButtons[0].trigger('click');
    expect(createVueDialogMock).toHaveBeenCalledTimes(2);
    expect(createVueDialogMock.mock.calls[1]?.[0]?.props?.mode).toBe('generalChat');
    expect(createVueDialogMock.mock.calls[1]?.[0]?.visualVariant).toBe('manager');

    const restoreButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Restore Recommended Template'));
    expect(restoreButtons).toHaveLength(2);
    await restoreButtons[0].trigger('click');
    await restoreButtons[1].trigger('click');
    expect(wrapper.text()).toContain('Using Recommended Template');

    await clickSubtab(wrapper, 'User Skills');
    expect(wrapper.text()).toContain('No user skills yet');

    const addChatSkillButton = wrapper.findAll('button').find((btn) => btn.text().includes('Add Chat Skill'));
    expect(addChatSkillButton).toBeDefined();
    await addChatSkillButton!.trigger('click');
    expect(createVueDialogMock).toHaveBeenCalledTimes(3);
    expect(createVueDialogMock.mock.calls[2]?.[0]?.props?.isNew).toBe(true);
    expect(createVueDialogMock.mock.calls[2]?.[0]?.visualVariant).toBe('manager');
    expect(wrapper.text()).toContain('No user skills yet');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ai.enabled).toBe(false);
    expect(payload.ai.baseUrl).toBe('https://example.test/v1');
    expect(payload.ai.apiKey).toBe('secret-key');
    expect(payload.ai.model).toBe('gpt-test');
    expect(payload.ai.promptContractVersion).toBe(6);
    expect(payload.ai.toolPolicies.toolDefaults.GetCurrentContext).toBe(false);
    expect(payload.ai.prompts.skills.generalChat).toEqual(DEFAULT_SETTINGS.ai.prompts.skills.generalChat);
    expect(payload.ai.prompts.skills.conceptCoach).toEqual(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach);
    expect(payload.ai).not.toHaveProperty('draftStorage');
    expect(payload.ai).not.toHaveProperty('promptProfiles');
  });

  it('renders user skill summary cards and keeps edit flows inside dialogs', async () => {
    const wrapper = mountPanel('ai', {
      aiSettings: {
        ...DEFAULT_SETTINGS.ai,
        userSkills: [{
          id: 'user:test-skill',
          title: 'My Skill',
          brief: 'Summarize the selected material.',
          enabled: true,
          mode: 'structured',
          systemPromptTemplate: 'You are a study helper.',
          composerPreset: 'Use the current material.',
          primaryActionLabel: 'Run Skill',
          defaultToolGroups: ['context-read', 'study-decision'],
          sections: [{
            id: 'section-1',
            title: 'Summary',
            emptyHint: 'No summary',
            runPrompt: 'Write a summary',
            followUpPrompt: 'Answer follow-up questions',
            responseKey: 'summary',
            renderer: 'markdown',
            required: true,
          }],
          surfaceHints: {
            compactTitle: 'Skill',
            hideTabs: false,
            composerRows: 4,
          },
          version: 1,
        }],
      },
    });
    await wrapper.vm.$nextTick();

    await clickSubtab(wrapper, 'User Skills');
    expect(wrapper.findAll('.ai-user-skill-card--summary')).toHaveLength(1);
    expect(wrapper.text()).toContain('My Skill');
    expect(wrapper.text()).toContain('Run Skill');
    expect(wrapper.text()).toContain('context-read');
    expect(wrapper.text()).toContain('study-decision');

    const editButton = wrapper.findAll('button').find((btn) => btn.text() === 'Edit');
    expect(editButton).toBeDefined();
    await editButton!.trigger('click');
    expect(createVueDialogMock).toHaveBeenCalledTimes(1);
    expect(createVueDialogMock.mock.calls[0]?.[0]?.props?.skill?.title).toBe('My Skill');

    const duplicateButton = wrapper.findAll('button').find((btn) => btn.text() === 'Duplicate');
    expect(duplicateButton).toBeDefined();
    await duplicateButton!.trigger('click');
    expect(wrapper.findAll('.ai-user-skill-card--summary')).toHaveLength(2);

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ai.userSkills).toHaveLength(2);
    expect(payload.ai.userSkills[1]?.id).toContain('copy');
  });

  it('saves the default review open-mode UI toggles from the review tab', async () => {
    const wrapper = mountPanel('review');
    await wrapper.vm.$nextTick();

    const formItems = wrapper.findAll('.form-item');
    const newTabItem = formItems.find((item) => item.text().includes('Open review in a new tab by default'));
    const fullscreenItem = formItems.find((item) => item.text().includes('Open review fullscreen by default'));
    const debugLogsItem = formItems.find((item) => item.text().includes('Enable Debug Logs'));
    const autoSortItem = formItems.find((item) => item.text().includes('自动排序'));
    const newTabToggle = newTabItem?.find('input[type="checkbox"]');
    const fullscreenToggle = fullscreenItem?.find('input[type="checkbox"]');
    const debugLogsToggle = debugLogsItem?.find('input[type="checkbox"]');
    const autoSortToggle = autoSortItem?.find('input[type="checkbox"]');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    expect(newTabToggle).toBeDefined();
    expect(fullscreenToggle).toBeDefined();
    expect(debugLogsToggle).toBeDefined();
    expect(autoSortToggle).toBeDefined();
    expect(saveButton).toBeDefined();

    await newTabToggle!.setValue(true);
    await fullscreenToggle!.setValue(true);
    await debugLogsToggle!.setValue(true);
    await autoSortToggle!.setValue(false);
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ui.reviewOpenInNewTabByDefault).toBe(true);
    expect(payload.ui.reviewOpenFullscreenByDefault).toBe(true);
    expect(payload.ui.enableDebugLogs).toBe(true);
    expect(payload.queues.autoSort?.enabled).toBe(false);
  });
});
