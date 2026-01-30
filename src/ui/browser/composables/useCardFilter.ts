import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { parseQuery } from '../browserService';
import { matchesParsedQuery, extractSqlStatement } from '../utils/cardFilters';
import { BrowserCard } from '../types';

export interface CardFilterOptions {
  scopedRows: ComputedRef<BrowserCard[]>;
  currentPreset: Ref<string>;
  searchQuery: Ref<string>;
  currentCardType: Ref<'all' | 'topic-only' | 'item-only'>;
  // 传递回调函数
  onSearchChange?: () => void;
  onPresetChange?: () => void;
  onCardTypeChange?: () => void;
}

export function useCardFilter(
  options: CardFilterOptions
) {
  // 计算筛选后的卡片
  const filteredCards = computed(() => {
    // 如果是 SQL 模式，则不过滤，直接返回所有行
    if (extractSqlStatement(options.searchQuery.value) != null) {
      return options.scopedRows.value;
    }
    
    // 解析查询字符串
    const parsed = parseQuery(options.searchQuery.value || '');
    return options.scopedRows.value.filter((c) => matchesParsedQuery(c, parsed));
  });

  // 处理搜索输入
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSqlStmt: string | null = null;
  let lastSearchQuery: string = '';  // 记录上次搜索查询，支持普通搜索触发刷新
  const handleSearchInput = () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      const current = extractSqlStatement(options.searchQuery.value);
      // 修复：普通搜索也应该触发刷新（通过比较完整查询）
      const queryChanged = options.searchQuery.value !== lastSearchQuery;
      const sqlChanged = current !== lastSqlStmt;

      if (queryChanged || sqlChanged) {
        lastSqlStmt = current;
        lastSearchQuery = options.searchQuery.value;
        // 触发数据加载
        if (options.onSearchChange) {
          options.onSearchChange();
        }
      }
    }, 150);
  };

  // 处理预设变化
  const handlePresetChange = () => {
    // 四重筛选：不再清除其他筛选条件
    // activeQueueId → 保留队列
    // activeDocId → 保留文档
    // searchQuery → 保留搜索
    // 注意：这里需要从外部调用 refreshData 函数
    if (options.onPresetChange) {
      options.onPresetChange();
    }
  };

  // 处理卡片类型变化
  const handleCardTypeChange = () => {
    // 五重筛选：不再清除其他筛选条件
    // activeQueueId → 保留队列
    // activeDocId → 保留文档
    // currentPreset → 保留预设
    // searchQuery → 保留搜索
    // 强制刷新缓存，因为 cardType 筛选在 loadCards() 中应用
    // 注意：这里需要从外部调用 refreshData 函数
    if (options.onCardTypeChange) {
      options.onCardTypeChange();
    }
  };

  // 返回筛选相关的方法和计算属性
  return {
    filteredCards,
    handleSearchInput,
    handlePresetChange,
    handleCardTypeChange,
  };
}