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
        <option value="all">{{ t('allTypes', 'All Types') }}</option>
        <option value="topic-only">{{ t('topicOnly', 'Topic Only') }}</option>
        <option value="item-only">{{ t('itemOnly', 'Item Only') }}</option>
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
        {{ t('exitFocus', '退出队列') }}
      </button>

      <button
        class="b3-button b3-button--outline"
        @click.stop.prevent="$emit('openPracticeMenu', $event)"
        :disabled="!hasPlugin"
        :title="t('startPractice', '开始练习')"
      >
        <svg><use xlink:href="#iconPlay"></use></svg>
        {{ t('startPractice', '开始练习') }}
      </button>

      <button
        v-if="canApplySortToQueue"
        class="b3-button b3-button--outline"
        @click="$emit('applySortToQueue')"
        :disabled="!hasPlugin"
        :title="t('applySortToQueue', '应用排序到队列')"
      >
        <svg><use xlink:href="#iconSort"></use></svg>
        {{ t('applySortToQueue', '应用排序到队列') }}
      </button>

      <button
        class="b3-button b3-button--outline"
        @click="$emit('toggleViewMode')"
        :title="viewMode === 'flat' ? t('hierarchyView', 'Hierarchy View') : t('flatView', 'Flat View')"
      >
        <svg><use :xlink:href="viewMode === 'flat' ? '#iconFiles' : '#iconList'"></use></svg>
      </button>

      <!-- 强制刷新按钮 -->
      <button class="b3-button b3-button--outline" @click="$emit('forceRefresh')" :disabled="loading" :title="t('forceRefresh', '强制刷新数据（清除缓存）')">
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>

      <!-- 🆕 分摊复习压力按钮 -->
      <button 
        class="b3-button b3-button--outline" 
        @click="$emit('openSpreadDialog')" 
        :disabled="loading"
        :title="t('spreadReviews', '分摊复习压力 - 将积压的复习任务均匀分散')"
      >
        <svg><use xlink:href="#iconCalendar"></use></svg>
        {{ t('spread', '分摊复习压力') }}
      </button>

      <!-- Topic/Item 迁移按钮 -->
      <button class="b3-button b3-button--outline" @click="$emit('migrateTopicItem')" :disabled="loading" :title="t('migrateTopicItem', '识别 Topic/Item 类型')">
        <svg><use xlink:href="#iconTags"></use></svg>
      </button>

      <!-- 性能报告按钮 -->
      <button class="b3-button b3-button--outline" @click="$emit('showPerformanceReport')" :disabled="loading" :title="t('perfReport', '性能报告')">
        <svg><use xlink:href="#iconInfo"></use></svg>
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
      
      <!-- 转换为 Tab 按钮 -->
      <button 
        v-if="mode === 'dialog'"
        class="b3-button b3-button--outline" 
        @click="$emit('convertToTab')"
        :title="t('openInTab', '在 Tab 中打开')"
      >
        <svg><use xlink:href="#iconLayoutRight"></use></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import FilterButton from './components/FilterButton.vue';
import type { CardFilter } from '@/types/unified-data-source';

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
  // 新增：队列类型和过滤条件 (需求 1.1, 1.2)
  queueType: string;
  appliedFilter: CardFilter | null;
}>();

// Emits
defineEmits<{
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
  // 新增：打开过滤对话框事件 (需求 1.3)
  (e: 'openFilterDialog'): void;
  // 新增：打开分散对话框事件 (supermemo-reschedule-operations)
  (e: 'openSpreadDialog'): void;
}>();

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
</script>
