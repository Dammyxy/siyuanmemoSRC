export type TopBarQuickEntryActionId =
  | 'start-review'
  | 'start-incremental-learning'
  | 'start-deliberate-practice'
  | 'start-neural-roam'
  | 'start-filter-group-practice'
  | 'open-srs-browser'
  | 'one-click-symbol-current-doc'
  | 'one-click-cancel-current-doc';

export interface TopBarQuickEntryDefinition {
  id: TopBarQuickEntryActionId;
  order: number;
  icon: string;
  commandLangKey: string;
  fallbackLabel: string;
  slashId: string;
  slashFilters: string[];
  requiresDocContext: boolean;
}

export const TOPBAR_QUICK_ENTRY_DEFINITIONS: TopBarQuickEntryDefinition[] = [
  {
    id: 'start-review',
    order: 1,
    icon: 'iconCards',
    commandLangKey: 'startReview',
    fallbackLabel: '开始提取练习',
    slashId: 'siyuanmemo-topbar-start-review',
    slashFilters: ['siyuanmemo', 'start retrieval', 'retrieval practice', '开始提取练习', '提取练习'],
    requiresDocContext: false,
  },
  {
    id: 'start-incremental-learning',
    order: 2,
    icon: 'iconBook',
    commandLangKey: 'startIncrementalLearning',
    fallbackLabel: '开始渐进学习',
    slashId: 'siyuanmemo-topbar-start-incremental-learning',
    slashFilters: ['siyuanmemo', 'start incremental', 'incremental learning', '开始渐进学习', '渐进学习'],
    requiresDocContext: false,
  },
  {
    id: 'start-deliberate-practice',
    order: 3,
    icon: 'iconCards',
    commandLangKey: 'startDeliberatePractice',
    fallbackLabel: '开始刻意练习',
    slashId: 'siyuanmemo-topbar-start-deliberate-practice',
    slashFilters: ['siyuanmemo', 'start deliberate', 'final drill', '开始刻意练习', '刻意练习'],
    requiresDocContext: false,
  },
  {
    id: 'start-neural-roam',
    order: 4,
    icon: 'iconRefresh',
    commandLangKey: 'startNeuralReview',
    fallbackLabel: '开始神经漫游',
    slashId: 'siyuanmemo-topbar-start-neural-roam',
    slashFilters: ['siyuanmemo', 'start neural roam', 'neural roam', '开始神经漫游', '神经漫游'],
    requiresDocContext: false,
  },
  {
    id: 'start-filter-group-practice',
    order: 5,
    icon: 'iconCards',
    commandLangKey: 'startFilterGroupPractice',
    fallbackLabel: '开始筛选复习',
    slashId: 'siyuanmemo-topbar-start-filter-group-practice',
    slashFilters: ['siyuanmemo', 'start filtered review', 'filter group', '开始筛选复习', '筛选复习'],
    requiresDocContext: false,
  },
  {
    id: 'open-srs-browser',
    order: 6,
    icon: 'iconLayoutRight',
    commandLangKey: 'srsBrowser',
    fallbackLabel: 'SRS 浏览器',
    slashId: 'siyuanmemo-topbar-open-srs-browser',
    slashFilters: ['siyuanmemo', 'srs browser', 'open browser', '打开srs浏览器', 'srs 浏览器'],
    requiresDocContext: false,
  },
  {
    id: 'one-click-symbol-current-doc',
    order: 7,
    icon: 'iconRiffCard',
    commandLangKey: 'oneClickSymbolCardsCurrentDoc',
    fallbackLabel: '一键符号制卡（当前文档）',
    slashId: 'siyuanmemo-one-click-symbol-cards',
    slashFilters: ['siyuanmemo', 'one click symbol', 'symbol cards', '一键符号制卡', '符号制卡'],
    requiresDocContext: true,
  },
  {
    id: 'one-click-cancel-current-doc',
    order: 8,
    icon: 'iconTrashcan',
    commandLangKey: 'oneClickCancelCardsCurrentDoc',
    fallbackLabel: '一键取消闪卡（当前文档）',
    slashId: 'siyuanmemo-one-click-cancel-cards',
    slashFilters: ['siyuanmemo', 'one click cancel cards', 'cancel cards', '一键取消闪卡', '取消闪卡'],
    requiresDocContext: true,
  },
];

const topBarQuickEntryDefinitionMap = new Map<TopBarQuickEntryActionId, TopBarQuickEntryDefinition>(
  TOPBAR_QUICK_ENTRY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getTopBarQuickEntryDefinition(
  actionId: TopBarQuickEntryActionId,
): TopBarQuickEntryDefinition | undefined {
  return topBarQuickEntryDefinitionMap.get(actionId);
}
