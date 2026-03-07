import { computed, type Ref, type ComputedRef } from 'vue';
import { parseQuery } from '../browserService';
import { matchesParsedQuery, extractSqlStatement } from '../utils/cardFilters';
import type { BrowserCard, CardTypeFilter } from '../types';

export interface CardFilterOptions {
  scopedRows: ComputedRef<BrowserCard[]>;
  currentPreset: Ref<string>;
  searchQuery: Ref<string>;
  currentCardType: Ref<CardTypeFilter>;
  onSearchChange?: () => void;
  onPresetChange?: () => void;
  onCardTypeChange?: () => void;
}

export function useCardFilter(options: CardFilterOptions) {
  const filteredCards = computed(() => {
    if (extractSqlStatement(options.searchQuery.value) != null) {
      return options.scopedRows.value;
    }

    const parsed = parseQuery(options.searchQuery.value || '');
    return options.scopedRows.value.filter((card) => matchesParsedQuery(card, parsed));
  });

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSqlStmt: string | null = null;
  let lastSearchQuery = '';

  const handleSearchInput = () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(() => {
      const current = extractSqlStatement(options.searchQuery.value);
      const queryChanged = options.searchQuery.value !== lastSearchQuery;
      const sqlChanged = current !== lastSqlStmt;

      if (queryChanged || sqlChanged) {
        lastSqlStmt = current;
        lastSearchQuery = options.searchQuery.value;
        options.onSearchChange?.();
      }
    }, 150);
  };

  const handlePresetChange = () => {
    options.onPresetChange?.();
  };

  const handleCardTypeChange = () => {
    options.onCardTypeChange?.();
  };

  return {
    filteredCards,
    handleSearchInput,
    handlePresetChange,
    handleCardTypeChange,
  };
}
