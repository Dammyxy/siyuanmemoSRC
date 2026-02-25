<template>
  <div class="block__icons siyuanmemo-review-header">
    <!-- Logo + 队列名称 -->
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>{{ title || header.stats.queueName || '闪卡' }}</span>
    </div>

    <!-- 拖拽区域 -->
    <span class="fn__flex-1 resize__move" style="min-height: 100%"></span>

    <!-- Counter: New Cards/Total New + Review Cards/Total Review (native format) -->
    <div
      data-type="count"
      class="ft__on-surface ft__smaller fn__flex-center"
    >
      <!-- 新卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardNewCard', '新卡')">
        <span class="ft__error">{{ header.stats.currentNewCards || 0 }}</span>
        <span> / </span>
        <span class="ft__primary">{{ header.stats.newCards || 0 }}</span>
      </span>
      <span class="fn__space"></span>
      <span>+</span>
      <span class="fn__space"></span>
      <!-- 复习卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardReviewCard', '复习卡')">
        <span class="ft__error">{{ header.stats.currentReviewCards || 0 }}</span>
        <span> / </span>
        <span class="ft__success">{{ header.stats.reviewCards || 0 }}</span>
      </span>
    </div>

    <div class="fn__space"></div>

    <!-- 头部工具栏 -->
    <!-- 调试信息 -->
    <!-- <div style="color: red; font-size: 12px;">
      Toolbar: {{ filteredToolbar.length }} buttons
    </div> -->
    <template v-if="filteredToolbar.length > 0">
      <template v-for="(btn, index) in filteredToolbar" :key="btn.type">
        <div v-if="index > 0" class="fn__space"></div>
        <button v-if="!btn.disabled"
                :data-type="btn.type"
                class="b3-tooltips b3-tooltips__sw block__icon block__icon--show"
                :aria-label="btn.ariaLabel"
                @click="handleToolbarClick(btn, $event)">
          <svg v-if="btn.icon"><use :xlink:href="btn.icon"></use></svg>
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewUIState } from './types';
import { createLogger } from '@/utils/logger';

const props = defineProps<{
  header: ReviewUIState['header'];
  isTabMode?: boolean;
  title?: string; // 队列标题（如"提取练习"）
  mode?: 'dialog' | 'tab'; // 🆕 打开模式（对话框/Tab）
  showSidebarToggle?: boolean; // 🌌 是否显示侧边栏切换按钮
  sidebarCollapsed?: boolean;  // 🌌 侧边栏是否折叠
  navigationState?: { // 🆕 神经漫游导航状态
    currentPathIndex: number;
    navigationMode: 'explore' | 'follow';
    hasBookmark: boolean;
    pathLength: number;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'action', actionId: string): void;
  (e: 'context', payload: { id: string; openNewTab: boolean }): void;
  (e: 'breadcrumb-click', crumb: { icon?: string; text: string; id?: string; action?: string }, index: number): void;
}>();

const logger = createLogger('ReviewHeader');

// 🆕 根据 mode 和侧边栏状态过滤工具栏按钮
const filteredToolbar = computed(() => {
  let toolbar = props.header?.toolbar || [];
  logger.debug('[SiYuanMemo][ReviewHeader] filteredToolbar computed:', {
    hasHeader: !!props.header,
    hasToolbar: !!props.header?.toolbar,
    toolbarLength: toolbar.length,
    toolbar: toolbar,
    mode: props.mode,
    showSidebarToggle: props.showSidebarToggle,
    navigationState: props.navigationState,
  });

  // 🌌 如果需要显示侧边栏切换按钮（已删除）

  // 🆕 神经漫游导航按钮（Phase 3: UI 控件）
  const navState = props.navigationState;
  if (navState) {
    const navButtons: typeof toolbar = [];

    // 1. 模式切换按钮（仅在 follow 模式时显示）
    if (navState.navigationMode === 'follow') {
      navButtons.push({
        type: 'nav-toggle-mode',
        icon: '#iconMove',  // 沿路径图标
        ariaLabel: `当前: 沿路径前进 (${navState.currentPathIndex + 1}/${navState.pathLength}) | 点击切换为探索新分支`,
        disabled: false,
      });
    }

    // 2. 返回书签按钮（仅在有书签时显示）
    if (navState.hasBookmark) {
      navButtons.push({
        type: 'nav-return-bookmark',
        icon: '#iconBookmark',
        ariaLabel: '返回最新位置',
        disabled: false,
      });
    }

    // 插入到工具栏开头
    if (navButtons.length > 0) {
      toolbar = [
        ...navButtons,
        ...toolbar,
      ];
    }
  }

  if (props.mode === 'tab') {
    // Tab 模式：移除 sticktab 按钮（已经在 Tab 中了，不需要"在 Tab 中打开"按钮）
    return toolbar.filter(btn => btn.type !== 'sticktab');
  }
  return toolbar;
});

function t(key: string, fallback: string): string {
  const i18n = (window as any)?.siyuan?.languages?.flashcard || {};
  return (i18n as any)?.[key] || fallback;
}

function handleToolbarClick(btn: { type: string; icon?: string; ariaLabel?: string; disabled?: boolean }, event: MouseEvent) {
  if (btn.disabled) return;
  event.stopPropagation(); // 阻止事件冒泡，防止被其他处理器拦截
  emit('toolbar-action', btn.type, event);
}
</script>

<style>
/* 只影响插件复习界面的标题栏样式 */
.block__icons.siyuanmemo-review-header {
  /* 添加标题栏背景色，与原生复习界面一致 */
  background-color: var(--b3-theme-surface) !important;
  border-bottom: 1px solid var(--b3-theme-background);
}

.block__logo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

/* 移除 .ariaLabel 的 flex 样式，让计数器横排显示 */
/* .ariaLabel { display: flex; align-items: center; } */


/* Part 6: 面包屑导航样式 - 使用思原生样式 */
.protyle-breadcrumb {
  display: flex;
  padding: 0 8px;
  background-color: var(--b3-theme-background);
  flex-shrink: 0;
  box-sizing: border-box;
  min-height: 30px;
  z-index: 1;
  font-size: 14px;
  margin-left: 12px;
  border-radius: 4px;
}

.protyle-breadcrumb__bar {
  align-items: center;
  flex-wrap: wrap;
  display: flex;
  transition: var(--b3-transition);
  overflow: auto;
  min-height: 30px;
}

.protyle-breadcrumb__arrow {
  height: 10px;
  width: 10px;
  color: var(--b3-theme-on-surface-light);
  margin: 0 4px;
  flex-shrink: 0;
}

.protyle-breadcrumb__text {
  margin-left: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.protyle-breadcrumb__item {
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 4px;
  line-height: 24px;
  height: 24px;
  border-radius: var(--b3-border-radius);
  margin: 3px 0;
  color: var(--b3-theme-on-surface);
  border: 0;
  background-color: transparent;
  box-sizing: inherit;

  svg {
    height: 14px;
    width: 14px;
    flex-shrink: 0;
    color: var(--b3-theme-on-surface);

    &:hover {
      color: var(--b3-theme-on-background);
    }
  }

  &:hover {
    color: var(--b3-theme-on-background);
    background-color: var(--b3-list-hover);
  }

  &.protyle-breadcrumb__item--active {
    color: var(--b3-theme-on-background);
    background-color: var(--b3-list-hover);
  }
}

.popover__block {
  cursor: pointer;
}

.fn__grab {
  cursor: grab;
}
</style>
