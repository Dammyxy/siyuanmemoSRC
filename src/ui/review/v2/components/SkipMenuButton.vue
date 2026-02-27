<template>
  <div class="skip-menu-button">
    <!-- 左侧: 跳过按钮 -->
    <button
      class="b3-button b3-button--cancel skip-menu-button__skip"
      :class="{ 'skip-menu-button__skip--mobile': props.isMobile }"
      @click="handleSkip"
    >
      <div class="card__icon">💤</div>
      {{ t('skip', '跳过') }}
      <template v-if="!props.isMobile"> (S) </template>
    </button>
    
    <!-- 右侧: 下拉箭头 -->
    <button
      class="b3-button b3-button--cancel skip-menu-button__dropdown"
      :class="{ 'skip-menu-button__dropdown--mobile': props.isMobile }"
      @click="toggleMenu"
    >
      <svg><use xlink:href="#iconUp"></use></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Menu } from 'siyuan';
import { createLogger } from '@/utils/logger';

interface Props {
  i18n?: Record<string, string>;
  queueSize?: number; // 剩余卡片数量
  isMobile?: boolean;
}

interface Emits {
  (e: 'skip'): void;
  (e: 'insert'): void;
  (e: 'schedule'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const logger = createLogger('SkipMenuButton');

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function handleSkip(ev: MouseEvent) {
  // 阻止事件冒泡到 ReviewView 的 handleRootClick
  ev.stopPropagation();
  ev.preventDefault();
  
  logger.debug('[SkipMenuButton] Skip clicked');
  emit('skip');
}

function toggleMenu(ev: MouseEvent) {
  // 阻止事件冒泡到 ReviewView 的 handleRootClick
  ev.stopPropagation();
  ev.preventDefault();
  
  logger.debug('[SkipMenuButton] toggleMenu called', {
    target: ev.target,
    currentTarget: ev.currentTarget,
  });
  
  const menu = new Menu();
  
  menu.addItem({
    icon: 'iconPin',
    label: t('insertToPosition', '插入到队列指定位置'),
    click: () => {
      logger.debug('[SkipMenuButton] Insert clicked');
      emit('insert');
    },
  });
  
  menu.addItem({
    icon: 'iconCalendar',
    label: t('scheduleDate', '安排复习日期'),
    click: () => {
      logger.debug('[SkipMenuButton] Schedule clicked');
      emit('schedule');
    },
  });
  
  // 统一使用右侧箭头按钮本身作为锚点，避免移动端与桌面端位置偏差
  const target = ev.currentTarget as HTMLElement | null;
  if (!target) {
    logger.error('[SkipMenuButton] Failed to open menu: currentTarget is missing');
    return;
  }
  const rect = target.getBoundingClientRect();
  logger.debug('[SkipMenuButton] Opening anchored menu:', {
    x: rect.right,
    y: rect.bottom,
    width: rect.width,
    height: rect.height,
  });
  menu.open({ x: rect.right, y: rect.bottom, h: rect.height, w: rect.width, isLeft: true });
}
</script>

<style scoped>
.skip-menu-button {
  display: flex;
  gap: 0; /* 移除间隙，让按钮无缝连接 */
  align-items: stretch; /* 确保两个按钮高度一致 */
}

.skip-menu-button__skip {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none; /* 移除右边框，避免重叠 */
  flex: 1; /* 占据剩余空间 */
  min-width: 0; /* 允许按钮收缩 */
}

.skip-menu-button__skip--mobile {
  min-height: 44px;
}

.skip-menu-button__dropdown {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding: 4px 8px;
  min-width: 32px;
  max-width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* 防止按钮被压缩 */
}

.skip-menu-button__dropdown--mobile {
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
}

.skip-menu-button__dropdown svg {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

/* 悬停效果：当鼠标悬停在任一按钮上时，两个按钮都高亮 */
.skip-menu-button:hover .skip-menu-button__skip,
.skip-menu-button:hover .skip-menu-button__dropdown {
  background-color: var(--b3-theme-surface-lighter);
}
</style>
