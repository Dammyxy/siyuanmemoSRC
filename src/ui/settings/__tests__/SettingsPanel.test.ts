import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SettingsPanel from '../SettingsPanel.vue';
import { DEFAULT_SETTINGS } from '@/types/settings';

function mountPanel(defaultTab = 'params') {
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
      i18n: {
        settingsStudyTab: 'Learning & Queue',
        settingsCaptureSyncTab: 'Capture & Sync',
        settingsNeuralTab: 'Neural Roam',
        settingsAiTab: 'AI',
        settingsAboutTab: 'About',
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
        progressiveDailyTraceEnabled: 'Write Daily Notes trace after excerpting',
        progressiveDailyTraceEnabledHint: 'Leave trace entries in Daily Notes after creating excerpts.',
        aiSettingsTitle: 'AI Workbench',
        aiBaseUrl: 'Base URL',
        aiApiKey: 'API Key',
        aiModel: 'Model',
        aiEnabled: 'Enable AI',
        aiPromptTemplates: 'Prompt Templates',
        aiTutorPrompt: 'Tutor Prompt',
        aiExplainPrompt: 'Explain Prompt',
        aiCardCandidatePrompt: 'Card Prompt',
        aiTutorPromptPresetTitle: 'Tutor Preset',
        aiExplainPromptPresetTitle: 'Explain Preset',
        aiCardPromptPresetTitle: 'Card Preset',
        aiRestoreRecommendedPrompt: 'Restore Recommended Template',
        aiShowAdvancedEditor: 'Advanced Editor',
        aiHideAdvancedEditor: 'Hide Advanced Editor',
        aiPromptAudience: 'Audience',
        aiPromptBehavior: 'Default Behavior',
        aiPromptOutput: 'Output Shape',
        aiPromptCurrentStatus: 'Current Status',
        aiPromptStatusRecommended: 'Using Recommended Template',
        aiPromptStatusRecommendedHint: 'The advanced editor is currently showing the built-in recommended template body.',
        aiPromptStatusCustom: 'Using Custom Override',
        aiPromptStatusCustomHint: 'The advanced editor is showing your saved or in-progress custom override instead of the built-in recommended template.',
        aiPromptStatusEmpty: 'Editor Is Empty',
        aiPromptStatusEmptyHint: 'The editor is empty right now; saving will fall back to the recommended template.',
        saveSettings: 'Save Settings',
      },
    },
  });
}

describe('SettingsPanel', () => {
  it('renders split settings tabs and maps legacy params tab to study', async () => {
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    const tabLabels = wrapper.findAll('.settings-tab').map((tab) => tab.text());
    expect(tabLabels).toEqual([
      'Learning & Queue',
      'Capture & Sync',
      'Neural Roam',
      'AI',
      'About',
    ]);
    expect(wrapper.text()).toContain('FSRS 参数');
  });

  it('renders hyperspace settings section on the neural tab and saves updates', async () => {
    const wrapper = mountPanel('neural');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Hyperspace / SuperMemo Fidelity');
    expect(wrapper.text()).toContain('Path History');
    expect(wrapper.text()).toContain('Enable block tree conduction');
    expect(wrapper.text()).toContain('Enable document tree conduction');
    expect(wrapper.text()).toContain('Block-link weight');

    const formItems = wrapper.findAll('.form-item');
    const historyLimitItem = formItems.find((item) => item.text().includes('Path history limit'));
    const historyLimitInput = historyLimitItem?.find('input[type="number"]');
    expect(historyLimitInput).toBeDefined();
    await historyLimitInput!.setValue(4200);

    const blockTreeItem = formItems.find((item) => item.text().includes('Enable block tree conduction'));
    const blockTreeToggle = blockTreeItem?.find('input[type="checkbox"]');
    expect(blockTreeToggle).toBeDefined();
    await blockTreeToggle!.setValue(true);

    const maxLayersItem = formItems.find((item) => item.text().includes('Layers per repetition'));
    const maxLayersInput = maxLayersItem?.find('input[type="number"]');
    expect(maxLayersInput).toBeDefined();
    await maxLayersInput!.setValue(4);

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.queues.neuralRoam?.history.maxEntries).toBe(4200);
    expect(payload.queues.neuralRoam?.hyperspace.treeChannels.blockTree).toBe(true);
    expect(payload.queues.neuralRoam?.hyperspace.maxLayersPerRepetition).toBe(4);
    expect(payload.queues.neuralRoam?.hyperspace.treeChannels.documentTree).toBe(false);
  });

  it('hides the global actions on the about tab', async () => {
    const wrapper = mountPanel('about');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('Save Settings');
    expect(wrapper.find('.settings-footer').exists()).toBe(false);
  });

  it('saves the excerpt shortcut toggle and daily trace settings independently', async () => {
    const wrapper = mountPanel('capture-sync');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Progressive Reading');
    expect(wrapper.text()).toContain('⌥⇧X');
    expect(wrapper.text()).toContain('Alt+X');
    const formItems = wrapper.findAll('.form-item');
    const altXItem = formItems.find((item) => item.text().includes('Enable excerpt shortcut'));
    const altXToggle = altXItem?.find('input[type="checkbox"]');
    const progressiveItem = formItems.find((item) => item.text().includes('Write Daily Notes trace after excerpting'));
    const progressiveToggle = progressiveItem?.find('input[type="checkbox"]');
    expect(altXToggle).toBeDefined();
    expect((altXToggle!.element as HTMLInputElement).checked).toBe(false);
    expect(progressiveToggle).toBeDefined();
    expect((progressiveToggle!.element as HTMLInputElement).checked).toBe(false);

    await altXToggle!.setValue(true);
    await progressiveToggle!.setValue(true);

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.progressiveReading.altXExcerptEnabled).toBe(true);
    expect(payload.progressiveReading.dailyTraceEnabled).toBe(true);
  });

  it('renders AI settings tab and saves AI configuration', async () => {
    const wrapper = mountPanel('ai');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('AI Workbench');
    expect(wrapper.text()).toContain('Prompt Templates');
    expect(wrapper.text()).toContain('Tutor Preset');
    expect(wrapper.text()).toContain('Explain Preset');
    expect(wrapper.text()).toContain('Card Preset');
    expect(wrapper.text()).toContain('压缩理解教练');
    expect(wrapper.text()).toContain('质量优先，宁可少出');
    expect(wrapper.text()).toContain('Current Status');
    expect(wrapper.text()).toContain('Using Recommended Template');

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

    expect(wrapper.findAll('textarea')).toHaveLength(0);

    const advancedButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Advanced Editor'));
    expect(advancedButtons).toHaveLength(3);
    await advancedButtons[0].trigger('click');
    await advancedButtons[1].trigger('click');
    await advancedButtons[2].trigger('click');

    const textareas = wrapper.findAll('textarea');
    expect(textareas).toHaveLength(3);
    await textareas[0].setValue('Tutor prompt body');
    await textareas[1].setValue('Explain prompt body');
    await textareas[2].setValue('Card prompt body');
    expect(wrapper.text()).toContain('Using Custom Override');
    expect(wrapper.text()).toContain('The advanced editor is showing your saved or in-progress custom override instead of the built-in recommended template.');

    const restoreButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Restore Recommended Template'));
    expect(restoreButtons).toHaveLength(3);
    await restoreButtons[0].trigger('click');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Save Settings'));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    const payload = wrapper.emitted('save')?.[0]?.[0] as typeof DEFAULT_SETTINGS;
    expect(payload.ai.enabled).toBe(false);
    expect(payload.ai.baseUrl).toBe('https://example.test/v1');
    expect(payload.ai.apiKey).toBe('secret-key');
    expect(payload.ai.model).toBe('gpt-test');
    expect(payload.ai.prompts.tutor).not.toBe('Tutor prompt body');
    expect(payload.ai.prompts.tutor).toContain('AI 导师');
    expect(payload.ai.prompts.explain).toBe('Explain prompt body');
    expect(payload.ai.prompts.cardCandidate).toBe('Card prompt body');
    expect(payload.ai.promptProfiles.tutor).toEqual({
      preset: 'recommended',
      overrideEnabled: false,
      overrideTemplate: '',
    });
    expect(payload.ai.promptProfiles.explain).toEqual({
      preset: 'recommended',
      overrideEnabled: true,
      overrideTemplate: 'Explain prompt body',
    });
    expect(payload.ai.promptProfiles.cardCandidate).toEqual({
      preset: 'recommended',
      overrideEnabled: true,
      overrideTemplate: 'Card prompt body',
    });
  });
});
