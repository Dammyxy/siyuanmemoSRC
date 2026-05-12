export type CoreReviewEntryActionId =
  | 'retrieval-due'
  | 'retrieval-all'
  | 'incremental-due'
  | 'incremental-all'
  | 'temporary-drill';

export interface CoreReviewEntryDefinition {
  id: CoreReviewEntryActionId;
  icon: string;
  commandLangKey: string;
  fallbackLabel: string;
  slashId: string;
  slashFilters: string[];
}

export const CORE_REVIEW_ENTRY_DEFINITIONS: CoreReviewEntryDefinition[] = [
  {
    id: 'retrieval-due',
    icon: 'iconRiffCard',
    commandLangKey: 'coreReviewRetrievalDue',
    fallbackLabel: 'SiYuanMemo: 提取练习 - 到期',
    slashId: 'siyuanmemo-core-review-retrieval-due',
    slashFilters: ['siyuanmemo', 'retrieval due', '提取 到期', '复习 到期'],
  },
  {
    id: 'retrieval-all',
    icon: 'iconRiffCard',
    commandLangKey: 'coreReviewRetrievalAll',
    fallbackLabel: 'SiYuanMemo: 提取练习 - 全部',
    slashId: 'siyuanmemo-core-review-retrieval-all',
    slashFilters: ['siyuanmemo', 'retrieval all', '提取 全部', '复习 全部'],
  },
  {
    id: 'incremental-due',
    icon: 'iconBook',
    commandLangKey: 'coreReviewIncrementalDue',
    fallbackLabel: 'SiYuanMemo: 渐进学习 - 到期',
    slashId: 'siyuanmemo-core-review-incremental-due',
    slashFilters: ['siyuanmemo', 'incremental due', '渐进 到期'],
  },
  {
    id: 'incremental-all',
    icon: 'iconBook',
    commandLangKey: 'coreReviewIncrementalAll',
    fallbackLabel: 'SiYuanMemo: 渐进学习 - 全部',
    slashId: 'siyuanmemo-core-review-incremental-all',
    slashFilters: ['siyuanmemo', 'incremental all', 'incremental learning', '渐进学习', '渐进复习', '渐进 全部'],
  },
  {
    id: 'temporary-drill',
    icon: 'iconEye',
    commandLangKey: 'coreReviewTemporaryDrill',
    fallbackLabel: 'SiYuanMemo: 临时练习',
    slashId: 'siyuanmemo-core-review-temporary-drill',
    slashFilters: ['siyuanmemo', 'temporary drill', '临时练习'],
  },
];

const coreReviewEntryDefinitionMap = new Map<CoreReviewEntryActionId, CoreReviewEntryDefinition>(
  CORE_REVIEW_ENTRY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getCoreReviewEntryDefinition(
  actionId: CoreReviewEntryActionId,
): CoreReviewEntryDefinition | undefined {
  return coreReviewEntryDefinitionMap.get(actionId);
}
