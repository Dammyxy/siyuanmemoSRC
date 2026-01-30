<template>
  <div class="card-browser__preview" :style="previewStyle">
    <div v-if="previewCard" class="preview__content">
      <div class="preview__header">
        <span class="preview__title">{{ t('preview', '预览') }}</span>
        <div class="preview__actions">
          <!-- 锁定/解锁按钮 -->
          <button 
            class="b3-button b3-button--outline" 
            :class="{ 'preview__lock--active': isLocked }"
            @click="onToggleLock" 
            :title="isLocked ? t('unlockPreview', '双击内容区也可解锁') : t('lockPreview', '锁定编辑')"
          >
            <svg><use :xlink:href="isLocked ? '#iconLock' : '#iconUnlock'"></use></svg>
          </button>
          <button class="b3-button b3-button--outline" @click="onJumpToBlock" :title="t('jumpToBlock', '跳转')">
            <svg><use xlink:href="#iconOpen"></use></svg>
          </button>
        </div>
      </div>
      
      <!-- 卡片路径面包屑 (垂直层级) -->
      <div class="preview__breadcrumb" v-if="breadcrumbs.length > 0">
        <div 
          v-for="(item, index) in breadcrumbs" 
          :key="item.id"
          class="breadcrumb__item"
          :style="{ paddingLeft: `${index * 16 + 8}px` }"
          @click="onLoadPreviewContent(item.id)"
        >
          <span class="breadcrumb__text">
            <svg class="breadcrumb__icon"><use :xlink:href="item.type === 'NodeDocument' ? '#iconFile' : '#iconALIGN'"></use></svg>
            {{ item.name || '...' }}
          </span>
        </div>
      </div>

      <div class="preview__body" ref="previewBodyRef" @dblclick="onPreviewDoubleClick">
        <!-- Protyle 渲染区域 -->
      </div>
    </div>
    <div v-else class="preview__empty">
      <span>{{ t('clickToPreview', '点击卡片查看详情') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BrowserCard, IBreadcrumbItem } from './types';

// 定义 props
interface Props {
  card?: BrowserCard | null;
  locked: boolean;
  breadcrumbs: IBreadcrumbItem[];
  previewSize: number;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;
  app?: any;
  i18n?: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  card: undefined,
  locked: true,
  breadcrumbs: () => [],
  previewSize: 350,
  mode: 'dialog',
});

// 定义 emits
const emit = defineEmits<{
  (e: 'toggle-lock'): void;
  (e: 'jump-to-block'): void;
  (e: 'load-preview-content', blockId: string): void;
  (e: 'preview-double-click'): void;
}>();

// 引用 DOM 元素
const previewBodyRef = ref<HTMLDivElement>();

// 计算属性
const previewCard = computed(() => props.card);
const isLocked = computed(() => props.locked);

const previewStyle = computed(() => {
  if (props.mode === 'dialog') {
    return { width: `${props.previewSize}px` };
  } else {
    return { height: `${props.previewSize}px` };
  }
});

// 国际化函数
const t = (key: string, fallback: string): string => {
  return props.i18n?.[key] || fallback;
};

// 事件处理函数
const onToggleLock = () => {
  emit('toggle-lock');
};

const onJumpToBlock = () => {
  emit('jump-to-block');
};

const onLoadPreviewContent = (blockId: string) => {
  emit('load-preview-content', blockId);
};

const onPreviewDoubleClick = () => {
  emit('preview-double-click');
};
</script>

<style scoped>
.card-browser__preview {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.card-browser--tab .card-browser__preview,
.card-browser--dock .card-browser__preview {
  border-left: none;
  border-top: 1px solid var(--b3-border-color);
}

.preview__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.preview__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.preview__body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
}

/* 垂直面包屑样式 */
.preview__breadcrumb {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  margin-bottom: 0;
  /* 移除背景色和边框，使其融入背景 */
  background: transparent;
}

.breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--b3-theme-on-surface); /* 默认文字颜色，非蓝色 */
  line-height: 1.6;
  position: relative;
  border-radius: 4px;
}

.breadcrumb__item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary); /* 悬浮时变蓝 */
  background-color: var(--b3-list-hover); /* 悬浮时添加轻微背景 */
}

.breadcrumb__text {
  display: flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--b3-font-family);
  opacity: 0.86;
  flex: 1;
  min-width: 0;
}

.breadcrumb__icon {
  width: 12px;
  height: 12px;
  margin-right: 6px;
  opacity: 0.6;
  fill: var(--b3-theme-on-surface);
}
</style>