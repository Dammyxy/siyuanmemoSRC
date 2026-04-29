import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_SUBTAB_SELECTION,
  buildSettingsSubTabsByTab,
  buildSettingsTabs,
  ensureActiveSettingsSubTabSelection,
  isSettingsSubTabActive,
  normalizeSettingsTabKey,
  resolveSettingsNavigationViewModel,
  selectSettingsSubTab,
  type SettingsI18nLookup,
} from '../settingsPanelViewModel';

const labels: Record<string, string> = {
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
  blockAttrsCleanupTitle: 'Block Attribute Cleanup',
};

const t: SettingsI18nLookup = (key, fallback) => labels[key] || fallback;

describe('settingsPanelViewModel', () => {
  it('normalizes active settings tabs including legacy aliases', () => {
    expect(normalizeSettingsTabKey('ai')).toBe('ai');
    expect(normalizeSettingsTabKey('capture-sync')).toBe('capture-sync');
    expect(normalizeSettingsTabKey('fsrs')).toBe('learning');
    expect(normalizeSettingsTabKey('params')).toBe('learning');
    expect(normalizeSettingsTabKey('missing')).toBe('learning');
  });

  it('builds primary and secondary navigation view model', () => {
    const viewModel = resolveSettingsNavigationViewModel({
      tabs: buildSettingsTabs(t),
      subTabsByTab: buildSettingsSubTabsByTab(t),
      activeTab: 'learning',
      selectedSubTabs: DEFAULT_SETTINGS_SUBTAB_SELECTION,
    });

    expect(viewModel.primaryTabs.map((tab) => tab.label)).toEqual([
      'Learning & Scheduling',
      'Review & Queue',
      'Card Creation',
      'Excerpt & Sync',
      'Neural Roam',
      'AI Workbench',
    ]);
    expect(viewModel.secondaryTabs.map((tab) => tab.label)).toEqual(['Maintenance', 'About']);
    expect(viewModel.activeTabLabel).toBe('Learning & Scheduling');
    expect(viewModel.activeSubTabs.map((tab) => tab.label)).toEqual([
      'FSRS Parameters',
      'Scheduler',
      'Daily Refresh',
    ]);
    expect(viewModel.activeSubTabKey).toBe('fsrs');
    expect(viewModel.showSettingsFooter).toBe(true);
  });

  it('hides footer on maintenance and about tabs', () => {
    const tabs = buildSettingsTabs(t);
    const subTabsByTab = buildSettingsSubTabsByTab(t);

    expect(resolveSettingsNavigationViewModel({
      tabs,
      subTabsByTab,
      activeTab: 'maintenance',
      selectedSubTabs: DEFAULT_SETTINGS_SUBTAB_SELECTION,
    }).showSettingsFooter).toBe(false);
    expect(resolveSettingsNavigationViewModel({
      tabs,
      subTabsByTab,
      activeTab: 'about',
      selectedSubTabs: DEFAULT_SETTINGS_SUBTAB_SELECTION,
    }).showSettingsFooter).toBe(false);
  });

  it('falls back to first enabled subtab and refuses disabled selection', () => {
    const subTabsByTab = buildSettingsSubTabsByTab(t);
    subTabsByTab.ai = [
      { key: 'provider', label: 'Model Access', disabled: true },
      { key: 'runtime', label: 'Chat & Tools' },
    ];
    const selectedSubTabs = {
      ...DEFAULT_SETTINGS_SUBTAB_SELECTION,
      ai: 'provider',
    };

    const ensured = ensureActiveSettingsSubTabSelection({
      tab: 'ai',
      selectedSubTabs,
      subTabsByTab,
    });
    expect(ensured.ai).toBe('runtime');
    expect(selectSettingsSubTab({
      activeTab: 'ai',
      requestedSubTab: 'provider',
      selectedSubTabs,
      subTabsByTab,
    })).toBeNull();
  });

  it('selects available subtabs and resolves active panel checks', () => {
    const subTabsByTab = buildSettingsSubTabsByTab(t);
    const selected = selectSettingsSubTab({
      activeTab: 'capture-sync',
      requestedSubTab: 'storage',
      selectedSubTabs: DEFAULT_SETTINGS_SUBTAB_SELECTION,
      subTabsByTab,
    });

    expect(selected?.['capture-sync']).toBe('storage');
    expect(isSettingsSubTabActive({
      activeTab: 'capture-sync',
      activeSubTabKey: selected?.['capture-sync'] || '',
      tab: 'capture-sync',
      subTab: 'storage',
    })).toBe(true);
  });
});
