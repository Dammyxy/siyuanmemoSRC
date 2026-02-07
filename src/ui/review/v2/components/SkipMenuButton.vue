<template>
  <div class="skip-menu-button">
    <!-- 左侧: 跳过按钮 -->
    <button
      class="b3-button b3-button--cancel skip-menu-button__skip"
      @click="handleSkip"
    >
      <div class="card__icon">💤</div>
      {{ t('skip', '跳过') }} (S)
    </button>
    
    <!-- 右侧: 下拉箭头 -->
    <button
      class="b3-button b3-button--cancel skip-menu-button__dropdown"
      @click="toggleMenu"
    >
      <svg><use xlink:href="#iconUp"></use></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Menu } from 'siyuan';

interface Props {
  i18n?: Record<string, string>;
  queueSize?: number; // 剩余卡片数量
}

interface Emits {
  (e: 'skip'): void;
  (e: 'insert'): void;
  (e: 'schedule'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function handleSkip(ev: MouseEvent) {
  // 阻止事件冒泡到 ReviewView 的 handleRootClick
  ev.stopPropagation();
  ev.preventDefault();
  
  console.log('[SkipMenuButton] Skip clicked');
  emit('skip');
}

function toggleMenu(ev: MouseEvent) {
  // 阻止事件冒泡到 ReviewView 的 handleRootClick
  ev.stopPropagation();
  ev.preventDefault();
  
  console.log('[SkipMenuButton] toggleMenu called', {
    target: ev.target,
    currentTarget: ev.currentTarget,
  });
  
  const menu = new Menu();
  
  menu.addItem({
    icon: 'iconPin',
    label: t('insertToPosition', '插入到队列指定位置'),
    click: () => {
      console.log('[SkipMenuButton] Insert clicked');
      emit('insert');
    },
  });
  
  menu.addItem({
    icon: 'iconCalendar',
    label: t('scheduleDate', '安排复习日期'),
    click: () => {
      console.log('[SkipMenuButton] Schedule clicked');
      emit('schedule');
    },
  });
  
  // 获取整个按钮组的位置，让菜单在按钮组正上方弹出
  const buttonGroup = (ev.currentTarget as HTMLElement).parentElement;
  if (buttonGroup) {
    const rect = buttonGroup.getBoundingClientRect();
    // 菜单在按钮组正上方弹出（y 使用 top，菜单会自动向上展开）
    console.log('[SkipMenuButton] Opening menu above button group at:', { x: rect.left, y: rect.top });
    menu.open({ x: rect.left, y: rect.top });
  } else {
    // 降级方案：使用当前按钮的位置
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    console.log('[SkipMenuButton] Opening menu above button at:', { x: rect.left, y: rect.top });
    menu.open({ x: rect.left, y: rect.top });
  }
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

.skip-menu-button__dropdown {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding: 4px 6px; /* 减小内边距，让按钮更窄 */
  min-width: 24px; /* 减小最小宽度 */
  max-width: 28px; /* 限制最大宽度 */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* 防止按钮被压缩 */
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
