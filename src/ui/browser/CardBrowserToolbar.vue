<template>
  <div class="card-browser__toolbar">
    <div class="toolbar__left">
      <!-- 搜索框 -->
      <div class="b3-form__icon toolbar__search">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input 
          type="text" 
          class="b3-text-field b3-form__icon-input"
          v-model="searchQuery" 
          :placeholder="t('searchPlaceholderAdvanced', '')"
          @input="handleSearchInput"
        />
      </div>
      
      <!-- 筛选器 -->
      <select v-model="localCurrentPreset" class="b3-select" @change="handlePresetChange">
        <option value="all">{{ t('allCards', 'All') }}</option>
        <option value="due">{{ t('dueToday', 'Due Today') }}</option>
        <option value="overdue">{{ t('overdue', 'Overdue') }}</option>
        <option value="leech">{{ t('leech', 'Leech') }}</option>
        <option value="new">{{ t('new', 'New') }}</option>
      </select>
      <select v-model="localCurrentCardType" class="b3-select" @change="handleCardTypeChange">
        <option 
          v-for="option in availableCardTypeFilters" 
          :key="option.value" 
          :value="option.value"
        >
          {{ t(option.value === 'all' ? 'allTypes' : option.value === 'topic-only' ? 'topicOnly' : option.value === 'item-only' ? 'itemOnly' : option.value === 'concept-only' ? 'conceptOnly' : 'descriptorOnly', option.label) }}
        </option>
      </select>
    </div>
    
    <div class="toolbar__center">
      <span class="toolbar__count">{{ filteredCount }} {{ t('cards', 'cards') }}</span>
    </div>
    
    <div class="toolbar__right">
      <!-- ✅ 退出队列按钮：仅在【丢失/关闭闪卡】或队列模式下显示 -->
      <button
        v-if="activeDocId === '__lost__' || shouldFocusDocList"
        class="b3-button b3-button--outline"
        @click="onExitFocus"
        :title="t('exitFocus', '退出队列')"
      >
        <svg><use xlink:href="#iconClose"></use></svg>
        {{ t('exitFocus', '退出队列') }}
      </button>

      <button
        class="b3-button b3-button--outline"
        @click.stop.prevent="onOpenPracticeMenu"
        :disabled="!plugin"
        :title="t('startPractice', '开始练习')"
      >
        <svg><use xlink:href="#iconPlay"></use></svg>
        {{ t('startPractice', '开始练习') }}
      </button>

      <button
        v-if="false"
        class="b3-button b3-button--outline"
        @click="onAutoSortFinalDrillQueue"
        :disabled="!plugin"
        :title="t('autoSortQueue', '按优先级重排队列')"
      >
        <svg><use xlink:href="#iconSort"></use></svg>
        {{ t('autoSortQueue', '按优先级重排队列') }}
      </button>

      <button
        v-if="canApplySortToQueue"
        class="b3-button b3-button--outline"
        @click="onApplySortToQueue"
        :disabled="!plugin"
        :title="t('applySortToQueue', '应用排序到队列')"
      >
        <svg><use xlink:href="#iconSort"></use></svg>
        {{ t('applySortToQueue', '应用排序到队列') }}
      </button>

      <button
        class="b3-button b3-button--outline"
        @click="onToggleViewMode"
        :title="viewMode === 'flat' ? t('hierarchyView', 'Hierarchy View') : t('flatView', 'Flat View')"
      >
        <svg><use :xlink:href="viewMode === 'flat' ? '#iconFiles' : '#iconList'"></use></svg>
      </button>

      <!-- 强制刷新按钮 -->
      <button class="b3-button b3-button--outline" @click="onForceRefresh" :disabled="loading" :title="t('forceRefresh', '强制刷新数据（清除缓存）')">
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>

      <!-- Topic/Item 迁移按钮 -->
      <button class="b3-button b3-button--outline" @click="onMigrateTopicItem" :disabled="loading" :title="t('migrateTopicItem', '识别 Topic/Item 类型')">
        <svg><use xlink:href="#iconTags"></use></svg>
      </button>

      <!-- 性能报告按钮 -->
      <button class="b3-button b3-button--outline" @click="onShowPerformanceReport" :disabled="loading" :title="t('perfReport', '性能报告')">
        <svg><use xlink:href="#iconInfo"></use></svg>
      </button>

      <!-- 预览切换按钮 -->
      <button 
        class="b3-button b3-button--outline" 
        :class="{ 'b3-button--text': showPreview }"
        @click="onTogglePreview"
        :title="t('togglePreview', '切换预览')"
      >
        <svg><use xlink:href="#iconPreview"></use></svg>
      </button>
      
      <!-- 转换为 Tab 按钮 -->
      <button 
        v-if="mode === 'dialog'"
        class="b3-button b3-button--outline" 
        @click="onConvertToTab"
        :title="t('openInTab', '在 Tab 中打开')"
      >
        <svg><use xlink:href="#iconLayoutRight"></use></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { getAvailableCardTypeFilters } from './types';

// 定义 props
interface Props {
  loading: boolean;
  filteredCount: number;
  showPreview: boolean;
  activeDocId?: string | null;
  shouldFocusDocList: boolean;
  currentPreset: string;
  currentCardType: 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';
  viewMode: 'flat' | 'hierarchy';
  mode: 'dialog' | 'tab' | 'dock';
  plugin?: unknown;
  i18n?: Record<string, string>;
  canApplySortToQueue: boolean;
  activeQueueId?: string | null;  // 🆕 添加当前队列 ID
}

const props = defineProps<Props>();

// 🆕 根据队列类型计算可用的卡片类型筛选选项
const availableCardTypeFilters = computed(() => {
  return getAvailableCardTypeFilters(props.activeQueueId || null);
});

// 定义 emits
const emit = defineEmits<{
  (e: 'update:currentPreset', value: string): void;
  (e: 'update:currentCardType', value: 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only'): void;
  (e: 'update:searchQuery', value: string): void;
  (e: 'update:viewMode', value: 'flat' | 'hierarchy'): void;
  (e: 'update:showPreview', value: boolean): void;
  (e: 'search-input'): void;
  (e: 'preset-change'): void;
  (e: 'card-type-change'): void;
  (e: 'exit-focus'): void;
  (e: 'open-practice-menu', event: MouseEvent): void;
  (e: 'auto-sort-final-drill-queue'): void;
  (e: 'apply-sort-to-queue'): void;
  (e: 'toggle-view-mode'): void;
  (e: 'force-refresh'): void;
  (e: 'migrate-topic-item'): void;
  (e: 'show-performance-report'): void;
  (e: 'toggle-preview'): void;
  (e: 'convert-to-tab'): void;
}>();

// 使用 ref 来管理局部状态
const searchQuery = ref('');
const localCurrentPreset = ref(props.currentPreset);
const localCurrentCardType = ref(props.currentCardType as 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only');

// 同步 props 到本地状态
watch(() => props.currentPreset, (newVal) => {
  localCurrentPreset.value = newVal;
});

watch(() => props.currentCardType, (newVal) => {
  localCurrentCardType.value = newVal;
});

// 同步本地状态到父组件
watch(localCurrentPreset, (newVal) => {
  emit('update:currentPreset', newVal);
});

watch(localCurrentCardType, (newVal) => {
  emit('update:currentCardType', newVal);
});

// 国际化函数
const t = (key: string, fallback: string): string => {
  return props.i18n?.[key] || fallback;
};

// 事件处理函数
const handleSearchInput = () => {
  emit('update:searchQuery', searchQuery.value);
  emit('search-input');
};

const handlePresetChange = () => {
  emit('preset-change');
};

const handleCardTypeChange = () => {
  emit('card-type-change');
};

const onExitFocus = () => {
  emit('exit-focus');
};

const onOpenPracticeMenu = (event: MouseEvent) => {
  emit('open-practice-menu', event);
};

const onAutoSortFinalDrillQueue = () => {
  emit('auto-sort-final-drill-queue');
};

const onApplySortToQueue = () => {
  emit('apply-sort-to-queue');
};

const onToggleViewMode = () => {
  emit('toggle-view-mode');
};

const onForceRefresh = () => {
  emit('force-refresh');
};

const onMigrateTopicItem = () => {
  emit('migrate-topic-item');
};

const onShowPerformanceReport = () => {
  emit('show-performance-report');
};

const onTogglePreview = () => {
  emit('toggle-preview');
};

const onConvertToTab = () => {
  emit('convert-to-tab');
};
</script>

<style scoped>
.card-browser__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
  gap: 8px;
  flex-wrap: wrap; /* 允许换行 */
  flex-shrink: 0;
  overflow-x: auto; /* 允许横向滚动 */
  min-height: 44px; /* 确保有足够的高度 */
}

.toolbar__left,
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0; /* 防止按钮被压缩 */
  min-width: 0; /* 允许内容缩小但不会消失 */
}

.toolbar__center {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  white-space: nowrap; /* 防止文字换行 */
  flex-shrink: 0; /* 防止计数器被压缩 */
}

.toolbar__search {
  width: 160px;
  flex-shrink: 0; /* 防止搜索框被压缩 */
  min-width: 120px; /* 最小宽度 */
}

.toolbar__search .b3-text-field {
  width: 100%;
}

/* 确保按钮文字不换行 */
.b3-button {
  white-space: nowrap;
  flex-shrink: 0; /* 防止按钮被压缩 */
}

/* 确保下拉框不被压缩 */
.b3-select {
  flex-shrink: 0;
  min-width: 80px;
}
</style>
