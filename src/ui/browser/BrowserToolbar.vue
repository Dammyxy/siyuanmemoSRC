<template>
  <div
    ref="toolbarRootRef"
    class="card-browser__toolbar"
    :class="{
      'card-browser__toolbar--mobile': props.mobileMode,
      'card-browser__toolbar--normal': !props.mobileMode && toolbarDensity === 'normal',
      'card-browser__toolbar--compact': !props.mobileMode && toolbarDensity === 'compact',
      'card-browser__toolbar--tight': !props.mobileMode && toolbarDensity === 'tight',
      'card-browser__toolbar--tab-wide': isTabWide,
      'card-browser__toolbar--tab-narrow': isTabNarrow,
    }"
  >
    <div class="toolbar__left">
      <div class="b3-form__icon toolbar__search">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input
          type="text"
          class="b3-text-field b3-form__icon-input"
          :value="searchQuery"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          placeholder=""
        />
      </div>

      <select :value="currentPreset" class="b3-select" @change="$emit('update:currentPreset', ($event.target as HTMLSelectElement).value)">
        <option value="all">{{ t('allCards', 'All') }}</option>
        <option value="due">{{ t('dueToday', 'Due Today') }}</option>
        <option value="overdue">{{ t('overdue', 'Overdue') }}</option>
        <option value="leech">{{ t('leech', 'Leech') }}</option>
        <option value="new">{{ t('new', 'New') }}</option>
      </select>
      <select :value="currentCardType" class="b3-select" @change="$emit('update:currentCardType', ($event.target as HTMLSelectElement).value)">
        <option
          v-for="option in availableCardTypeFilters"
          :key="option.value"
          :value="option.value"
        >
          {{ getCardTypeLabel(option.i18nKey, option.label) }}
        </option>
      </select>

      <FilterButton
        :queue-type="queueType"
        :applied-filter="appliedFilter"
        :i18n="i18n"
        @open-dialog="$emit('openFilterDialog')"
      />
    </div>

    <div v-if="!props.mobileMode && !isTabNarrow" class="toolbar__center">
      <span class="toolbar__count">{{ cardCount }} {{ t('cards', '张卡片') }}</span>
      <span v-if="selectedCount > 0" class="toolbar__count">
        · {{ t('selectedCount', '已选 {count}').replace('{count}', String(selectedCount)) }}
      </span>
      <span v-if="selectionMode === 'all-matching'" class="toolbar__count">
        · {{ t('allMatchingMode', '全匹配模式') }}
      </span>
    </div>

    <div class="toolbar__right">
      <button
        class="b3-button b3-button--outline toolbar__action toolbar__action--page-select"
        @click="$emit('selectCurrentPage')"
        :disabled="loading || cardCount <= 0"
        :title="t('selectCurrentPage', '选当前页')"
      >
        <svg><use xlink:href="#iconList"></use></svg>
        {{ selectCurrentPageButtonLabel }}
      </button>

      <button
        class="b3-button b3-button--outline toolbar__action toolbar__action--global-select"
        :class="{ 'toolbar__action--active': isAllMatchingActive }"
        @click="handleSelectAllToggle"
        :disabled="!canSelectAllMatching || loading"
        :title="isAllMatchingActive ? t('cancelSelectAll', '取消全选') : t('selectAllMatching', '全选匹配结果')"
      >
        <svg><use :xlink:href="isAllMatchingActive ? '#iconClose' : '#iconCheck'"></use></svg>
        {{ selectAllButtonLabel }}
      </button>

      <button
        v-if="selectedCount > 0 && !isAllMatchingActive"
        class="b3-button b3-button--outline"
        @click="$emit('clearSelection')"
        :title="t('clearSelection', '清空选择')"
      >
        <svg><use xlink:href="#iconClose"></use></svg>
        {{ clearSelectionButtonLabel }}
      </button>

      <button
        v-if="showExitFocus"
        class="b3-button b3-button--outline"
        @click="$emit('exitFocus')"
        :title="exitFocusButtonLabel"
      >
        <svg><use xlink:href="#iconClose"></use></svg>
        {{ exitFocusButtonLabel }}
      </button>

      <button
        class="b3-button b3-button--outline toolbar__action toolbar__action--practice"
        :class="{ 'toolbar__action--active': isPracticeContextActive }"
        @click.stop.prevent="$emit('openPracticeMenu', $event)"
        :disabled="!hasPlugin"
        :title="t('startPractice', '开始练习')"
      >
        <svg><use xlink:href="#iconPlay"></use></svg>
        {{ startPracticeButtonLabel }}
      </button>

      <button
        v-if="canApplySortToQueue && !props.mobileMode"
        class="b3-button b3-button--outline"
        @click="$emit('applySortToQueue')"
        :disabled="!hasPlugin"
        :title="t('applySortToQueue', '应用排序到队列')"
      >
        <svg><use xlink:href="#iconSort"></use></svg>
        {{ t('applySortToQueue', '应用排序') }}
      </button>

      <button
        v-if="showSpreadButton && !props.mobileMode"
        class="b3-button b3-button--outline"
        @click="$emit('openSpreadDialog')"
        :disabled="loading"
        :title="t('spreadReviews', '分摊复习压力 - 将积压的复习任务均匀分散')"
      >
        <svg><use xlink:href="#iconCalendar"></use></svg>
        {{ t('spread', '分摊压力') }}
      </button>

      <div v-if="!props.mobileMode && !isTabNarrow" class="toolbar__divider"></div>

      <button
        class="b3-button b3-button--outline toolbar__action toolbar__action--view-toggle"
        :class="{ 'b3-button--text': viewMode === 'hierarchy' }"
        @click="$emit('toggleViewMode')"
        :title="viewMode === 'flat' ? t('hierarchyView', '层级视图') : t('flatView', '平铺视图')"
      >
        <svg><use :xlink:href="viewMode === 'flat' ? '#iconFiles' : '#iconList'"></use></svg>
      </button>

      <button
        class="b3-button b3-button--outline"
        :class="{ 'b3-button--text': showPreview }"
        @click="$emit('update:showPreview', !showPreview)"
        :title="t('togglePreview', '切换预览')"
      >
        <svg><use xlink:href="#iconPreview"></use></svg>
      </button>

      <button
        v-if="showNavigatorToggle"
        class="b3-button b3-button--outline"
        :class="{ 'b3-button--text': navigatorOpen }"
        @click="$emit('toggleNavigator')"
        :title="t('browserNavigator', 'Navigator')"
      >
        <svg><use xlink:href="#iconFiles"></use></svg>
      </button>

      <button
        v-if="!props.mobileMode"
        class="b3-button b3-button--outline toolbar__action toolbar__action--ai"
        :class="{ 'toolbar__action--active': isAiContextActive }"
        @click="$emit('openAiWorkbench')"
        :disabled="loading"
        :title="t('aiWorkbench', 'AI 工作台')"
      >
        <svg><use xlink:href="#iconSparkles"></use></svg>
      </button>

      <button
        v-if="!props.mobileMode"
        class="b3-button b3-button--outline"
        @click="$emit('forceRefresh')"
        :disabled="loading"
        :title="t('forceRefresh', '强制刷新数据（清除缓存）')"
      >
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>

      <button
        v-if="mode === 'dialog' && !props.mobileMode"
        class="b3-button b3-button--outline toolbar__action toolbar__action--open-in-tab"
        @click="$emit('convertToTab')"
        :title="t('openInTab', 'Open')"
      >
        <svg><use xlink:href="#iconLayoutRight"></use></svg>
        {{ openInTabButtonLabel }}
      </button>
    </div>

    <div v-if="showScopeChips" class="toolbar__chips" role="list">
      <span v-for="chip in toolbarChipItems" :key="chip.key" class="toolbar__chip" role="listitem">
        {{ chip.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import FilterButton from './components/FilterButton.vue';
import type { CardFilter } from '@/types/unified-data-source';
import type { BrowserGlobalScope, CardTypeFilter } from './types';
import { getAvailableCardTypeFilters } from './types';
import type { BrowserLayoutProfile } from './layoutProfile';

type ToolbarDensity = 'normal' | 'compact' | 'tight';

const props = defineProps<{
  i18n?: Record<string, string>;
  searchQuery: string;
  currentPreset: string;
  currentCardType: string;
  cardCount: number;
  showExitFocus: boolean;
  hasPlugin: boolean;
  canApplySortToQueue: boolean;
  viewMode: 'flat' | 'hierarchy';
  loading: boolean;
  showPreview: boolean;
  mode: 'dialog' | 'tab' | 'dock';
  layoutProfile: BrowserLayoutProfile;
  mobileMode?: boolean;
  queueType: string;
  appliedFilter: CardFilter | null;
  activeQueueId: string | null;
  activeScopeDocIds?: string[] | null;
  activeDocId?: string | null;
  activeGlobalScope?: BrowserGlobalScope | null;
  selectedCount: number;
  selectionMode: 'explicit' | 'all-matching';
  canSelectAllMatching: boolean;
  showNavigatorToggle?: boolean;
  navigatorOpen?: boolean;
  aiContextActive?: boolean;
}>();

const availableCardTypeFilters = computed(() => {
  return getAvailableCardTypeFilters(props.activeQueueId, { docId: props.activeDocId });
});

const showSpreadButton = computed(() => {
  if (!props.activeQueueId) {
    return true;
  }

  return props.activeQueueId === 'retrieval' || props.activeQueueId === 'incremental-learning';
});

const emit = defineEmits<{
  (e: 'update:searchQuery', value: string): void;
  (e: 'update:currentPreset', value: string): void;
  (e: 'update:currentCardType', value: string): void;
  (e: 'update:showPreview', value: boolean): void;
  (e: 'exitFocus'): void;
  (e: 'openPracticeMenu', event: MouseEvent): void;
  (e: 'applySortToQueue'): void;
  (e: 'toggleViewMode'): void;
  (e: 'forceRefresh'): void;
  (e: 'showPerformanceReport'): void;
  (e: 'convertToTab'): void;
  (e: 'toggleNavigator'): void;
  (e: 'openFilterDialog'): void;
  (e: 'openSpreadDialog'): void;
  (e: 'openAiWorkbench'): void;
  (e: 'selectCurrentPage'): void;
  (e: 'selectAllMatching'): void;
  (e: 'clearSelection'): void;
}>();

const toolbarRootRef = ref<HTMLElement | null>(null);
const isAllMatchingActive = computed(() => props.selectionMode === 'all-matching');
const isPracticeContextActive = computed(() => Boolean(props.activeQueueId));
const isAiContextActive = computed(() => props.aiContextActive === true);
const toolbarDensity = ref<ToolbarDensity>('normal');
let toolbarResizeObserver: ResizeObserver | null = null;

const isTabWide = computed(() => props.layoutProfile === 'tab-wide');
const isTabNarrow = computed(() => props.layoutProfile === 'tab-narrow');
const showScopeChips = computed(() => !props.mobileMode && isTabNarrow.value);
const showNavigatorToggle = computed(() => props.showNavigatorToggle === true);
const navigatorOpen = computed(() => props.navigatorOpen === true);
const hasActiveScopeDocIds = computed(() => (props.activeScopeDocIds?.length ?? 0) > 0);

const isCompactDesktop = computed(() => {
  if (props.mobileMode) {
    return false;
  }
  return toolbarDensity.value === 'compact' || toolbarDensity.value === 'tight';
});

const selectAllButtonLabel = computed(() => {
  if (isAllMatchingActive.value) {
    if (isCompactDesktop.value) {
      return t('cancelSelectAllShort', '取消');
    }
    return t('cancelSelectAll', '取消全选');
  }

  if (props.mobileMode || isCompactDesktop.value) {
    return t('selectAllShort', '全选');
  }
  return t('selectAllMatching', '全选匹配结果');
});

const selectCurrentPageButtonLabel = computed(() => {
  if (props.mobileMode || isCompactDesktop.value) {
    return t('selectCurrentPageShort', '当前页');
  }
  return t('selectCurrentPage', '选当前页');
});

const clearSelectionButtonLabel = computed(() => {
  if (props.mobileMode || isCompactDesktop.value) {
    return t('clearShort', '清空');
  }
  return t('clearSelection', '清空选择');
});

const startPracticeButtonLabel = computed(() => {
  if (!props.mobileMode && isCompactDesktop.value) {
    return t('startPracticeShort', '练习');
  }
  return t('startPractice', '开始练习');
});

const openInTabButtonLabel = computed(() => t('openInTab', 'Open'));
const exitFocusButtonLabel = computed(() => (
  hasActiveScopeDocIds.value
    ? t('exitDocTreeScope', 'Exit Doc Tree Scope')
    : t('exitFocus', 'Exit Queue')
));

const toolbarChipItems = computed(() => {
  const viewLabel = props.viewMode === 'hierarchy'
    ? t('hierarchyView', '层级视图')
    : t('flatView', '平铺视图');

  const items = [
    { key: 'scope', label: resolveScopeLabel() },
  ];

  if (hasActiveScopeDocIds.value) {
    items.push({ key: 'doc-scope', label: resolveDocTreeScopeLabel() });
  }

  items.push(
    { key: 'preset', label: resolvePresetLabel(props.currentPreset) },
    { key: 'cardType', label: resolveCardTypeLabel(props.currentCardType) },
    { key: 'view', label: viewLabel },
  );

  return items;
});

function handleSelectAllToggle() {
  if (isAllMatchingActive.value) {
    emit('clearSelection');
    return;
  }
  emit('selectAllMatching');
}

function resolveToolbarDensity(width: number): ToolbarDensity {
  if (width >= 1680) {
    return 'normal';
  }
  if (width >= 1366) {
    return 'compact';
  }
  return 'tight';
}

function updateToolbarDensity(width: number): void {
  toolbarDensity.value = resolveToolbarDensity(width);
}

function getToolbarWidth(el: HTMLElement): number {
  const rectWidth = Number(el.getBoundingClientRect().width || 0);
  const clientWidth = Number(el.clientWidth || 0);
  const offsetWidth = Number(el.offsetWidth || 0);
  return Math.max(rectWidth, clientWidth, offsetWidth, 0);
}

function setupToolbarDensityObserver(): void {
  if (props.mobileMode) {
    toolbarDensity.value = 'normal';
    return;
  }

  const root = toolbarRootRef.value;
  if (!root) {
    return;
  }

  updateToolbarDensity(getToolbarWidth(root));

  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  toolbarResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    updateToolbarDensity(entry.contentRect.width);
  });
  toolbarResizeObserver.observe(root);
}

onMounted(() => {
  setupToolbarDensityObserver();
});

onBeforeUnmount(() => {
  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getCardTypeLabel(i18nKey: string, fallback: string): string {
  return t(i18nKey, fallback);
}

function resolveScopeLabel(): string {
  if (props.activeQueueId) {
    const queueLabels: Record<string, string> = {
      retrieval: t('queueExtract', 'Retrieval Practice'),
      'incremental-learning': t('queueIncremental', 'Incremental Learning'),
      'final-drill': t('queueDeliberate', 'Final Drill'),
      'neural-roam': t('queueNeural', 'Neural Roam'),
      'filter-group': t('queueFilterGroup', 'Filter Group'),
    };
    return queueLabels[props.activeQueueId] || props.activeQueueId;
  }

  if (props.activeGlobalScope === '__dismissed__') {
    return t('filterPresetSuspended', 'Suspended');
  }

  return t('allFlashcards', 'All flashcards');
}

function resolveDocTreeScopeLabel(): string {
  return t('docTreeScopeCount', 'Doc Tree ({count})')
    .replace('{count}', String(props.activeScopeDocIds?.length || 0));
}

function resolvePresetLabel(preset: string): string {
  const presetLabels: Record<string, string> = {
    all: t('allCards', 'All'),
    due: t('dueToday', 'Due Today'),
    overdue: t('overdue', 'Overdue'),
    leech: t('leech', 'Leech'),
    new: t('new', 'New'),
    suspended: t('filterPresetSuspended', 'Suspended'),
  };
  return presetLabels[preset] || preset;
}

function resolveCardTypeLabel(cardType: string): string {
  const cardTypeLabels: Record<CardTypeFilter, string> = {
    all: t('cardTypeAll', 'All types'),
    'topic-only': t('cardTypeTopicOnly', 'Topic'),
    'item-only': t('cardTypeItemOnly', 'Item'),
    'concept-only': t('cardTypeConceptOnly', 'Concept'),
    'descriptor-only': t('cardTypeDescriptorOnly', 'Descriptor'),
    'missing-block-only': t('missingBlocks', 'Missing blocks'),
  };

  return cardTypeLabels[cardType as CardTypeFilter] || cardType;
}
</script>
