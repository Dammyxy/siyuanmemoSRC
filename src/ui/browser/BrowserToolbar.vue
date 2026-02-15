<template>
  <div class="card-browser__toolbar">
    <div class="toolbar__left">
      <!-- 搜索框 -->
      <div class="b3-form__icon toolbar__search">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input 
          type="text" 
          class="b3-text-field b3-form__icon-input"
          :value="searchQuery"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          :placeholder="t('searchPlaceholderAdvanced', '搜索：tag:xxx deck:xxx state:new/review doc:xxx 或关键字')"
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
          {{ t(option.value === 'all' ? 'allTypes' : option.value === 'topic-only' ? 'topicOnly' : option.value === 'item-only' ? 'itemOnly' : option.value === 'concept-only' ? 'conceptOnly' : 'descriptorOnly', option.label) }}
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
    
    <div class="toolbar__center">
      <span class="toolbar__count">{{ cardCount }} {{ t('cards', '张卡片') }}</span>
    </div>
    
    <div class="toolbar__right">
      <!-- 退出队列按钮 -->
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
        {{ t('startPractice', '开始练习') }}
      </button>

      <!-- 应用排序到队列按钮 -->
      <button
        v-if="canApplySortToQueue"
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
        v-if="showSpreadButton"
        class="b3-button b3-button--outline" 
        @click="$emit('openSpreadDialog')" 
        :disabled="loading"
        :title="t('spreadReviews', '分摊复习压力 - 将积压的复习任务均匀分散')"
      >
        <svg><use xlink:href="#iconCalendar"></use></svg>
        {{ t('spread', '分摊压力') }}
      </button>

      <!-- 分隔线 -->
      <div class="toolbar__divider"></div>

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
        class="b3-button b3-button--outline" 
        @click="$emit('forceRefresh')" 
        :disabled="loading" 
        :title="t('forceRefresh', '强制刷新数据（清除缓存）')"
      >
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>

      <!-- 更多菜单按钮 -->
      <button 
        class="b3-button b3-button--outline" 
        @click="toggleMoreMenu"
        :title="t('more', '更多')"
        ref="moreButtonRef"
      >
        <svg><use xlink:href="#iconMore"></use></svg>
      </button>

      <!-- 更多菜单下拉 -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import FilterButton from './components/FilterButton.vue';
import type { CardFilter } from '@/types/unified-data-source';
import { getAvailableCardTypeFilters } from './types';

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
  queueType: string;
  appliedFilter: CardFilter | null;
  activeQueueId: string | null;  // 🆕 添加当前队列 ID
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
}>();

// 更多菜单状态
const showMoreMenu = ref(false);
const moreButtonRef = ref<HTMLElement | null>(null);
const moreMenuRef = ref<HTMLElement | null>(null);

// 切换更多菜单
function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
}

// 处理菜单项点击
function handleMenuAction(action: string) {
  showMoreMenu.value = false;
  emit(action as any);
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
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
</script>
