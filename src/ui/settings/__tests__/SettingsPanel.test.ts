import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SettingsPanel from '../SettingsPanel.vue';
import { DEFAULT_SETTINGS } from '@/types/settings';

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
        progressiveAltXExcerptEnabledHint: 'Registers ⌥⇧X for excerpting while native Alt+X stays bound to SiYuan recent appearance.',
        reviewOpenInNewTabByDefault: 'Open review in a new tab by default',
        reviewOpenInNewTabByDefaultHint: 'Desktop global review entries open in a new tab by default.',
        reviewOpenFullscreenByDefault: 'Open review fullscreen by default',
        reviewOpenFullscreenByDefaultHint: 'Only applies to desktop dialog mode and is ignored when new-tab open is enabled.',
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
        topicDerivationTitle: 'Continue card creation under Topic',
        topicDerivationEnabled: 'Enable continuing card creation under Topic',
        topicDerivationEnabledHint: 'When the current block already belongs to a Topic, further highlights or symbol-based card creation keep the original Topic and add new practice child documents and cards under it. This is not the excerpt flow.',
        topicDerivationStorageMode: 'Storage for continued card creation',
        topicDerivationStorageWorkbench: 'Workbench document (default)',
        topicDerivationStorageSourceChild: 'Direct child under current Topic',
        topicDerivationStorageModeHint: 'Workbench mode collects continued card-creation content under the source reading workbench; source mode places it directly under the current Topic.',
        aiDraftStorageModeLabel: 'AI draft storage mode',
        aiDraftStorageModeHint: 'Choose where AI drafts should be saved.',
        aiDraftStorageTargetBlockHint: 'Library mode accepts a target document or block ID.',
        aiSettingsTitle: 'AI Workbench',
        aiBaseUrl: 'Base URL',
        aiApiKey: 'API Key',
        aiModel: 'Model',
        aiEnabled: 'Enable AI',
        aiPromptTemplates: 'Prompt Templates',
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

  it('saves quick-card settings from the card tab', async () => {
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

    expect(wrapper.text()).toContain('Continue card creation under Topic');
    expect(wrapper.text()).toContain('Enable continuing card creation under Topic');
    expect(wrapper.text()).toContain('Storage for continued card creation');
    expect(wrapper.text()).toContain('This is not the excerpt flow.');
    await clickSubtab(wrapper, 'Continue Under Topic');
    const formItems = wrapper.findAll('.form-item');
    const enabledItem = formItems.find((item) => item.text().includes('Enable continuing card creation under Topic'));
    const enabledToggle = enabledItem?.find('input[type="checkbox"]');
    const storageModeItem = formItems.find((item) => item.text().includes('Storage for continued card creation'));
    const storageModeSelect = storageModeItem?.find('select');
    expect(enabledToggle).toBeDefined();
    expect(storageModeSelect).toBeDefined();

    await enabledToggle!.setValue(false);
    await storageModeSelect!.setValue('source-child');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.quickCard.topicDerivation).toEqual({
      enabled: false,
      storageMode: 'source-child',
    });
  });

  it('disables the topic continuation subtab until symbol card listening is enabled', async () => {
    const wrapper = mountPanel('card', {
      quickCardSettings: {
        ...DEFAULT_SETTINGS.quickCard,
        enabled: false,
      },
    });
    await wrapper.vm.$nextTick();

    const topicSubtab = wrapper.findAll('.settings-subtab').find((tab) => tab.text().includes('Continue Under Topic'));
    expect(topicSubtab).toBeDefined();
    expect(topicSubtab!.attributes('disabled')).toBeDefined();
    expect(topicSubtab!.attributes('aria-selected')).toBe('false');

    const quickCardItem = wrapper.findAll('.form-item').find((item) => item.text().includes('启用监听符号制卡'));
    const quickCardToggle = quickCardItem?.find('input[type="checkbox"]');
    expect(quickCardToggle).toBeDefined();
    await quickCardToggle!.setValue(true);
    await wrapper.vm.$nextTick();

    expect(topicSubtab!.attributes('disabled')).toBeUndefined();
    await clickSubtab(wrapper, 'Continue Under Topic');
    expect(wrapper.findAll('.settings-subtab').find((tab) => tab.text().includes('Continue Under Topic'))!.attributes('aria-selected')).toBe('true');
  });

  it('saves excerpt storage and conflict strategy from the excerpt tab', async () => {
    const wrapper = mountPanel('capture-sync');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Progressive Reading');
    expect(wrapper.text()).toContain('Enable excerpt shortcut');
    expect(wrapper.text()).toContain('⌥⇧X');
    expect(wrapper.text()).toContain('Alt+X');

    const formItems = wrapper.findAll('.form-item');
    const altXItem = formItems.find((item) => item.text().includes('Enable excerpt shortcut'));
    const altXToggle = altXItem?.find('input[type="checkbox"]');
    const storageModeItem = formItems.find((item) => item.text().includes('Excerpt storage mode'));
    const storageModeSelect = storageModeItem?.find('select');
    const notebookItem = formItems.find((item) => item.text().includes('Target notebook'));
    const notebookSelect = notebookItem?.find('select');
    const targetBlockItem = formItems.find((item) => item.text().includes('Target block ID'));
    const targetBlockInput = targetBlockItem?.find('input[type="text"]');
    const conflictItem = formItems.find((item) => item.text().includes('冲突策略'));
    const conflictSelect = conflictItem?.find('select');

    expect(altXToggle).toBeDefined();
    await altXToggle!.setValue(true);

    await clickSubtab(wrapper, 'Storage');

    expect(storageModeSelect).toBeDefined();
    expect(notebookSelect).toBeDefined();
    expect(targetBlockInput).toBeDefined();
    expect((storageModeSelect!.element as HTMLSelectElement).value).toBe('source-child');
    expect((notebookSelect!.element as HTMLSelectElement).disabled).toBe(true);
    expect((targetBlockInput!.element as HTMLInputElement).disabled).toBe(true);

    await storageModeSelect!.setValue('library');
    await notebookSelect!.setValue('notebook-a');
    await targetBlockInput!.setValue('doc-root-1');

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

  it('renders AI settings tab and saves AI configuration', async () => {
    const wrapper = mountPanel('ai');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('AI Workbench');
    expect(wrapper.text()).toContain('Prompt Templates');
    expect(wrapper.text()).toContain('AI 理解与制卡推荐模板');
    expect(wrapper.text()).not.toContain('Tutor Preset');
    expect(wrapper.text()).not.toContain('Card Preset');
    expect(wrapper.text()).not.toContain('CDF Preset');
    expect(wrapper.text()).toContain('想起来、分得清、用得上');
    expect(wrapper.text()).toContain('先给工作定义，再按五个视角建立结构化理解，最后生成宁缺毋滥的自测候选卡和现实触发器。');
    expect(wrapper.text()).toContain('Current Status');
    expect(wrapper.text()).toContain('Using Recommended Template');
    expect(wrapper.text()).toContain('Skill 基础 Prompt');
    expect(wrapper.text()).toContain('Behavior Prompt');
    expect(wrapper.text()).toContain('CDF 语义卡 · Behavior Prompt');
    expect(wrapper.text()).toContain('Show the system-appended structured contract');

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

    await clickSubtab(wrapper, 'Built-in Skill');

    const textareas = wrapper.findAll('textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(11);
    await textareas[0].setValue('Concept coach base prompt body');
    await textareas[1].setValue('Working definition run prompt body');
    expect(wrapper.text()).toContain('Using Custom Override');
    expect(wrapper.text()).toContain('The saved behavior and follow-up prompts below are custom; the system appends structured rules automatically.');

    const restoreButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Restore Recommended Template'));
    expect(restoreButtons).toHaveLength(1);
    await restoreButtons[0].trigger('click');
    expect(wrapper.text()).toContain('Using Recommended Template');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ai.enabled).toBe(false);
    expect(payload.ai.baseUrl).toBe('https://example.test/v1');
    expect(payload.ai.apiKey).toBe('secret-key');
    expect(payload.ai.model).toBe('gpt-test');
    expect(payload.ai.promptContractVersion).toBe(5);
    expect(payload.ai.prompts.skills.conceptCoach).toEqual(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach);
    expect(payload.ai).not.toHaveProperty('draftStorage');
    expect(payload.ai).not.toHaveProperty('promptProfiles');
  });

  it('saves the default review open-mode UI toggles from the review tab', async () => {
    const wrapper = mountPanel('review');
    await wrapper.vm.$nextTick();

    const formItems = wrapper.findAll('.form-item');
    const newTabItem = formItems.find((item) => item.text().includes('Open review in a new tab by default'));
    const fullscreenItem = formItems.find((item) => item.text().includes('Open review fullscreen by default'));
    const autoSortItem = formItems.find((item) => item.text().includes('自动排序'));
    const newTabToggle = newTabItem?.find('input[type="checkbox"]');
    const fullscreenToggle = fullscreenItem?.find('input[type="checkbox"]');
    const autoSortToggle = autoSortItem?.find('input[type="checkbox"]');
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));

    expect(newTabToggle).toBeDefined();
    expect(fullscreenToggle).toBeDefined();
    expect(autoSortToggle).toBeDefined();
    expect(saveButton).toBeDefined();

    await newTabToggle!.setValue(true);
    await fullscreenToggle!.setValue(true);
    await autoSortToggle!.setValue(false);
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ui.reviewOpenInNewTabByDefault).toBe(true);
    expect(payload.ui.reviewOpenFullscreenByDefault).toBe(true);
    expect(payload.queues.autoSort?.enabled).toBe(false);
  });
});
