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
      i18n: {
        settingsStudyTab: 'Learning & Queue',
        settingsCaptureSyncTab: 'Capture & Sync',
        settingsNeuralTab: 'Neural Roam',
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
});
