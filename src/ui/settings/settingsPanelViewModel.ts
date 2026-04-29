export type SettingsTabKey = 'learning' | 'review' | 'card' | 'capture-sync' | 'neural' | 'ai' | 'maintenance' | 'about';
export type SettingsSubTabKey = string;
export type SettingsTabSection = 'primary' | 'secondary';
export type SettingsI18nLookup = (key: string, fallback: string) => string;

export interface SettingsTabDefinition {
  key: SettingsTabKey;
  label: string;
  icon: string;
  section: SettingsTabSection;
}

export interface SettingsSubTabDefinition {
  key: SettingsSubTabKey;
  label: string;
  disabled?: boolean;
}

export type SettingsSubTabSelection = Record<SettingsTabKey, SettingsSubTabKey>;

export interface SettingsNavigationViewModel {
  primaryTabs: SettingsTabDefinition[];
  secondaryTabs: SettingsTabDefinition[];
  activeTabLabel: string;
  activeSubTabs: SettingsSubTabDefinition[];
  activeSubTabKey: SettingsSubTabKey;
  showSettingsFooter: boolean;
}

export const DEFAULT_SETTINGS_SUBTAB_SELECTION: SettingsSubTabSelection = {
  learning: 'fsrs',
  review: 'surface',
  card: 'quick-card',
  'capture-sync': 'entry',
  neural: 'history',
  ai: 'provider',
  maintenance: 'block-attrs',
  about: 'about',
};

export function normalizeSettingsTabKey(tab?: string): SettingsTabKey {
  switch (tab) {
    case 'learning':
    case 'review':
    case 'card':
    case 'capture-sync':
    case 'neural':
    case 'ai':
    case 'maintenance':
    case 'about':
      return tab;
    case 'fsrs':
    case 'general':
    case 'params':
    case 'study':
    default:
      return 'learning';
  }
}

export function buildSettingsTabs(t: SettingsI18nLookup): SettingsTabDefinition[] {
  return [
    { key: 'learning', label: t('settingsStudyTab', '学习与调度'), icon: '#iconSettings', section: 'primary' },
    { key: 'review', label: t('settingsReviewQueueTab', '复习与队列'), icon: '#iconSettings', section: 'primary' },
    { key: 'card', label: t('settingsCardTab', '制卡'), icon: '#iconSettings', section: 'primary' },
    { key: 'capture-sync', label: t('settingsCaptureSyncTab', '摘录与同步'), icon: '#iconSettings', section: 'primary' },
    { key: 'neural', label: t('settingsNeuralTab', '神经漫游'), icon: '#iconSettings', section: 'primary' },
    { key: 'ai', label: t('settingsAiTab', 'AI 工作台'), icon: '#iconSparkles', section: 'primary' },
    { key: 'maintenance', label: t('settingsMaintenanceTab', '维护'), icon: '#iconSettings', section: 'secondary' },
    { key: 'about', label: t('settingsAboutTab', '关于'), icon: '#iconInfo', section: 'secondary' },
  ];
}

export function buildSettingsSubTabsByTab(
  t: SettingsI18nLookup,
): Record<SettingsTabKey, SettingsSubTabDefinition[]> {
  return {
    learning: [
      { key: 'fsrs', label: t('settingsSubtabFsrsParams', 'FSRS 参数') },
      { key: 'scheduler', label: t('settingsSubtabScheduler', '调度器') },
      { key: 'day-start', label: t('settingsSubtabDayStart', '每日刷新') },
    ],
    review: [
      { key: 'surface', label: t('settingsSubtabReviewSurface', '复习界面') },
      { key: 'automation', label: t('settingsSubtabQueueAutomation', '队列自动化') },
      { key: 'ordering', label: t('settingsSubtabQueueOrdering', '排序与插入') },
    ],
    card: [
      { key: 'quick-card', label: t('settingsSubtabQuickCard', '监听符号制卡') },
    ],
    'capture-sync': [
      { key: 'entry', label: t('settingsSubtabExcerptEntry', '摘录入口') },
      { key: 'storage', label: t('settingsSubtabStorage', '存放位置') },
      { key: 'conflict', label: t('settingsSubtabConflict', '冲突处理') },
    ],
    neural: [
      { key: 'history', label: t('settingsSubtabNeuralHistory', '轨迹历史') },
      { key: 'channels', label: t('settingsSubtabHyperspaceChannels', '传播通道') },
      { key: 'range', label: t('settingsSubtabHyperspaceRange', '扩散范围') },
      { key: 'weights', label: t('settingsSubtabHyperspaceWeights', '传播权重') },
    ],
    ai: [
      { key: 'provider', label: t('settingsSubtabAiProvider', '模型接入') },
      { key: 'runtime', label: t('settingsSubtabAiRuntime', '聊天与工具') },
      { key: 'built-in-skill', label: t('settingsSubtabAiBuiltInSkill', '内置 Skill') },
      { key: 'user-skills', label: t('settingsSubtabAiUserSkills', '用户 Skill') },
    ],
    maintenance: [
      { key: 'block-attrs', label: t('blockAttrsCleanupTitle', '块属性清理') },
    ],
    about: [
      { key: 'about', label: t('settingsAboutTab', '关于') },
    ],
  };
}

export function resolveActiveSettingsSubTabKey(input: {
  activeTab: SettingsTabKey;
  selectedSubTabs: SettingsSubTabSelection;
  subTabsByTab: Record<SettingsTabKey, SettingsSubTabDefinition[]>;
}): SettingsSubTabKey {
  const activeSubTabs = input.subTabsByTab[input.activeTab] || [];
  const selectedKey = input.selectedSubTabs[input.activeTab];
  const selected = activeSubTabs.find((subTab) => subTab.key === selectedKey && !subTab.disabled);
  if (selected) {
    return selected.key;
  }

  return activeSubTabs.find((subTab) => !subTab.disabled)?.key || activeSubTabs[0]?.key || '';
}

export function ensureActiveSettingsSubTabSelection(input: {
  tab: SettingsTabKey;
  selectedSubTabs: SettingsSubTabSelection;
  subTabsByTab: Record<SettingsTabKey, SettingsSubTabDefinition[]>;
}): SettingsSubTabSelection {
  const availableSubTabs = input.subTabsByTab[input.tab] || [];
  const selectedKey = input.selectedSubTabs[input.tab];
  const selected = availableSubTabs.find((subTab) => subTab.key === selectedKey && !subTab.disabled);
  if (selected) {
    return input.selectedSubTabs;
  }

  const fallback = availableSubTabs.find((subTab) => !subTab.disabled) || availableSubTabs[0];
  if (!fallback) {
    return input.selectedSubTabs;
  }

  return {
    ...input.selectedSubTabs,
    [input.tab]: fallback.key,
  };
}

export function selectSettingsSubTab(input: {
  activeTab: SettingsTabKey;
  requestedSubTab: SettingsSubTabKey;
  selectedSubTabs: SettingsSubTabSelection;
  subTabsByTab: Record<SettingsTabKey, SettingsSubTabDefinition[]>;
}): SettingsSubTabSelection | null {
  const target = (input.subTabsByTab[input.activeTab] || [])
    .find((subTab) => subTab.key === input.requestedSubTab);
  if (!target || target.disabled) {
    return null;
  }

  return {
    ...input.selectedSubTabs,
    [input.activeTab]: input.requestedSubTab,
  };
}

export function resolveSettingsNavigationViewModel(input: {
  tabs: SettingsTabDefinition[];
  subTabsByTab: Record<SettingsTabKey, SettingsSubTabDefinition[]>;
  activeTab: SettingsTabKey;
  selectedSubTabs: SettingsSubTabSelection;
}): SettingsNavigationViewModel {
  const activeSubTabs = input.subTabsByTab[input.activeTab] || [];
  return {
    primaryTabs: input.tabs.filter((tab) => tab.section === 'primary'),
    secondaryTabs: input.tabs.filter((tab) => tab.section === 'secondary'),
    activeTabLabel: input.tabs.find((tab) => tab.key === input.activeTab)?.label || '',
    activeSubTabs,
    activeSubTabKey: resolveActiveSettingsSubTabKey(input),
    showSettingsFooter: input.activeTab !== 'maintenance' && input.activeTab !== 'about',
  };
}

export function isSettingsSubTabActive(input: {
  activeTab: SettingsTabKey;
  activeSubTabKey: SettingsSubTabKey;
  tab: SettingsTabKey;
  subTab: SettingsSubTabKey;
}): boolean {
  return input.activeTab === input.tab && input.activeSubTabKey === input.subTab;
}
