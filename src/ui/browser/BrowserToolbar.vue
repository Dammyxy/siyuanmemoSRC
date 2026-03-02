<template>
  <div
    ref="toolbarRootRef"
    class="card-browser__toolbar"
    :class="{
      'card-browser__toolbar--mobile': props.mobileMode,
      'card-browser__toolbar--normal': !props.mobileMode && toolbarDensity === 'normal',
      'card-browser__toolbar--compact': !props.mobileMode && toolbarDensity === 'compact',
      'card-browser__toolbar--tight': !props.mobileMode && toolbarDensity === 'tight',
    }"
  >
    <div class="toolbar__left">
      <!-- 搜索框 -->
      <div class="b3-form__icon toolbar__search">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input 
          type="text" 
          class="b3-text-field b3-form__icon-input"
          :value="searchQuery"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          :placeholder="t('searchPlaceholderAdvanced', '')"
        />
      </div>
      
      <!-- 筛选器 -->
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

      <!-- 过滤按钮 (需求 1.1, 1.2, 1.3) -->
      <FilterButton
        :queue-type="queueType"
        :applied-filter="appliedFilter"
        :i18n="i18n"
        @open-dialog="$emit('openFilterDialog')"
      />
    </div>
    
    <div v-if="!props.mobileMode" class="toolbar__center">
      <span class="toolbar__count">{{ cardCount }} {{ t('cards', '张卡片') }}</span>
      <span v-if="selectedCount > 0" class="toolbar__count">
        · {{ t('selectedCount', '已选 {count}').replace('{count}', String(selectedCount)) }}
      </span>
      <span v-if="selectionMode === 'all-matching'" class="toolbar__count">
        · {{ t('allMatchingMode', '全匹配模式') }}
      </span>
    </div>
    
    <div class="toolbar__right">
      <!-- 退出队列按钮 -->
      <button
        class="b3-button b3-button--outline"
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
        :title="t('exitFocus', '退出队列')"
      >
        <svg><use xlink:href="#iconClose"></use></svg>
        {{ t('exitFocus', '退出') }}
      </button>

      <!-- 开始练习按钮 -->
      <button
        class="b3-button b3-button--outline"
        @click.stop.prevent="$emit('openPracticeMenu', $event)"
        :disabled="!hasPlugin"
        :title="t('startPractice', '开始练习')"
      >
        <svg><use xlink:href="#iconPlay"></use></svg>
        {{ startPracticeButtonLabel }}
      </button>

      <!-- 应用排序到队列按钮 -->
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

      <!-- 分摊复习压力按钮 -->
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

      <!-- 分隔线 -->
      <div v-if="!props.mobileMode" class="toolbar__divider"></div>

      <!-- 视图切换按钮 -->
      <button
        class="b3-button b3-button--outline"
        @click="$emit('toggleViewMode')"
        :title="viewMode === 'flat' ? t('hierarchyView', '层级视图') : t('flatView', '平铺视图')"
      >
        <svg><use :xlink:href="viewMode === 'flat' ? '#iconFiles' : '#iconList'"></use></svg>
      </button>

      <!-- 预览切换按钮 -->
      <button 
        class="b3-button b3-button--outline" 
        :class="{ 'b3-button--text': showPreview }"
        @click="$emit('update:showPreview', !showPreview)"
        :title="t('togglePreview', '切换预览')"
      >
        <svg><use xlink:href="#iconPreview"></use></svg>
      </button>

      <!-- 强制刷新按钮 -->
      <button 
        v-if="!props.mobileMode"
        class="b3-button b3-button--outline" 
        @click="$emit('forceRefresh')" 
        :disabled="loading" 
        :title="t('forceRefresh', '强制刷新数据（清除缓存）')"
      >
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>

      <!-- 更多菜单按钮 -->
      <!-- 🔇 已隐藏：更多菜单
      <button 
        class="b3-button b3-button--outline" 
        @click="toggleMoreMenu"
        :title="t('more', '更多')"
        ref="moreButtonRef"
      >
        <svg><use xlink:href="#iconMore"></use></svg>
      </button>
      -->

      <!-- 更多菜单下拉 -->
      <!-- 🔇 已隐藏：更多菜单下拉
      <div v-if="showMoreMenu" class="toolbar__more-menu" ref="moreMenuRef">
        <div class="b3-menu__items">
          <button 
            class="b3-menu__item" 
            @click="handleMenuAction('migrateTopicItem')"
            :disabled="loading"
          >
            <svg class="b3-menu__icon"><use xlink:href="#iconTags"></use></svg>
            <span class="b3-menu__label">{{ t('migrateTopicItem', '识别 Topic/Item 类型') }}</span>
          </button>
          <button 
            class="b3-menu__item" 
            @click="handleMenuAction('showPerformanceReport')"
            :disabled="loading"
          >
            <svg class="b3-menu__icon"><use xlink:href="#iconInfo"></use></svg>
            <span class="b3-menu__label">{{ t('perfReport', '性能报告') }}</span>
          </button>
          <button 
            v-if="mode === 'dialog'"
            class="b3-menu__item" 
            @click="handleMenuAction('convertToTab')"
          >
            <svg class="b3-menu__icon"><use xlink:href="#iconLayoutRight"></use></svg>
            <span class="b3-menu__label">{{ t('openInTab', '在 Tab 中打开') }}</span>
          </button>
        </div>
      </div>
      -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import FilterButton from './components/FilterButton.vue';
import type { CardFilter } from '@/types/unified-data-source';
import { getAvailableCardTypeFilters } from './types';

type ToolbarDensity = 'normal' | 'compact' | 'tight';

// Props
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
  mobileMode?: boolean;
  queueType: string;
  appliedFilter: CardFilter | null;
  activeQueueId: string | null;  // 🆕 添加当前队列 ID
  selectedCount: number;
  selectionMode: 'explicit' | 'all-matching';
  canSelectAllMatching: boolean;
}>();

// 🆕 根据队列类型计算可用的卡片类型筛选选项
const availableCardTypeFilters = computed(() => {
  return getAvailableCardTypeFilters(props.activeQueueId);
});

// 🆕 计算是否显示"分摊压力"按钮
const showSpreadButton = computed(() => {
  // 只在以下情况显示：
  // 1. 全部闪卡（没有激活队列）
  // 2. 提取练习队列
  // 3. 渐进学习队列
  if (!props.activeQueueId) {
    return true;  // 全部闪卡
  }
  
  return props.activeQueueId === 'retrieval' || props.activeQueueId === 'incremental-learning';
});

// Emits
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
  (e: 'migrateTopicItem'): void;
  (e: 'showPerformanceReport'): void;
  (e: 'convertToTab'): void;
  (e: 'openFilterDialog'): void;
  (e: 'openSpreadDialog'): void;
  (e: 'selectAllMatching'): void;
  (e: 'clearSelection'): void;
}>();

// 更多菜单状态
const showMoreMenu = ref(false);
const moreButtonRef = ref<HTMLElement | null>(null);
const moreMenuRef = ref<HTMLElement | null>(null);
const toolbarRootRef = ref<HTMLElement | null>(null);
const isAllMatchingActive = computed(() => props.selectionMode === 'all-matching');
const toolbarDensity = ref<ToolbarDensity>('normal');
let toolbarResizeObserver: ResizeObserver | null = null;

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

// 切换更多菜单
function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
}

type ToolbarMenuAction = 'migrateTopicItem' | 'showPerformanceReport' | 'convertToTab';

// 处理菜单项点击
function handleMenuAction(action: ToolbarMenuAction) {
  showMoreMenu.value = false;
  emit(action);
}

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

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  if (showMoreMenu.value && 
      moreButtonRef.value && 
      moreMenuRef.value &&
      !moreButtonRef.value.contains(event.target as Node) &&
      !moreMenuRef.value.contains(event.target as Node)) {
    showMoreMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  setupToolbarDensityObserver();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
});

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getCardTypeLabel(i18nKey: string, fallback: string): string {
  return t(i18nKey, fallback);
}
</script>
