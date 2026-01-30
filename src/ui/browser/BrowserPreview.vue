<template>
  <div class="card-browser__preview" :style="previewStyle">
    <div v-if="card" class="preview__content">
      <div class="preview__header">
        <span class="preview__title">{{ t('preview', '预览') }}</span>
        <div class="preview__actions">
          <!-- 锁定/解锁按钮 -->
          <button 
            class="b3-button b3-button--outline" 
            :class="{ 'preview__lock--active': isLocked }"
            @click="toggleLock" 
            :title="isLocked ? t('unlockPreview', '双击内容区也可解锁') : t('lockPreview', '锁定编辑')"
          >
            <svg><use :xlink:href="isLocked ? '#iconLock' : '#iconUnlock'"></use></svg>
          </button>
          <button class="b3-button b3-button--outline" @click="$emit('jump')" :title="t('jumpToBlock', '跳转')">
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
          @click="loadContent(item.id)"
        >
          <span class="breadcrumb__text">
            <svg class="breadcrumb__icon"><use :xlink:href="item.type === 'NodeDocument' ? '#iconFile' : '#iconALIGN'"></use></svg>
            {{ item.name || '...' }}
          </span>
        </div>
      </div>

      <div class="preview__body" ref="bodyRef" @dblclick="handleDoubleClick">
        <!-- Protyle 渲染区域 -->
      </div>
    </div>
    <div v-else class="preview__empty">
      <span>{{ t('clickToPreview', '点击卡片查看详情') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Protyle, type App } from 'siyuan';
import type { BrowserCard } from './types';

// Props
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  card: BrowserCard | null;
  mode: 'dialog' | 'tab' | 'dock';
  size: number;
}>();

// Emits
const emit = defineEmits<{
  (e: 'jump'): void;
  (e: 'update:size', size: number): void;
}>();

// State
const bodyRef = ref<HTMLElement | null>(null);
const isLocked = ref(true);
const breadcrumbs = ref<IBreadcrumbItem[]>([]);
let currentProtyle: Protyle | null = null;

// 面包屑接口
interface IBreadcrumbItem {
  id: string;
  name: string;
  type: string;
  subType: string;
  children: [];
}

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 预览区域样式
const previewStyle = computed(() => {
  if (props.mode === 'dialog') {
    return { width: `${props.size}px` };
  } else {
    return { height: `${props.size}px` };
  }
});

// 切换锁定状态
function toggleLock() {
  isLocked.value = !isLocked.value;
  updateProtyleReadonly();
}

// 双击解锁
function handleDoubleClick() {
  if (isLocked.value) {
    isLocked.value = false;
    updateProtyleReadonly();
  }
}

// 更新 Protyle 只读状态
function updateProtyleReadonly() {
  if (currentProtyle && (currentProtyle as any).protyle) {
    if (isLocked.value) {
      if (typeof (currentProtyle as any).disable === 'function') {
        (currentProtyle as any).disable();
      }
    } else {
      if (typeof (currentProtyle as any).enable === 'function') {
        (currentProtyle as any).enable();
      }
    }
  }
}

// 获取面包屑数据
async function fetchBreadcrumbs(blockId: string) {
  breadcrumbs.value = [];
  if (!props.app) return;
  
  try {
    const response = await fetch('/api/block/getBlockBreadcrumb', {
      method: 'POST',
      body: JSON.stringify({ id: blockId }),
    });
    const data = await response.json();
    if (data.code === 0 && data.data) {
      breadcrumbs.value = data.data;
    }
  } catch (err) {
    console.error('[BrowserPreview] Fetch breadcrumbs error:', err);
  }
}

// 加载预览内容
async function loadContent(blockId: string) {
  if (!bodyRef.value || !props.app) return;
  
  // 清理之前的 Protyle
  if (currentProtyle) {
    currentProtyle.destroy();
    currentProtyle = null;
  }
  
  // 清空容器
  bodyRef.value.innerHTML = '';
  
  try {
    currentProtyle = new Protyle(props.app, bodyRef.value, {
      blockId: blockId,
      mode: 'wysiwyg',
      render: {
        background: false,
        title: false,
        gutter: true,
        breadcrumb: false,
        breadcrumbDocName: false,
      },
      after: (protyle: any) => {
        if (isLocked.value) {
          protyle.disable();
        }
      }
    });
  } catch (err) {
    console.error('[BrowserPreview] Protyle load error:', err);
    bodyRef.value.innerHTML = `<div class="preview-error">加载失败</div>`;
  }
}

// 监听卡片变化
watch(() => props.card, async (newCard) => {
  if (newCard?.blockId) {
    await fetchBreadcrumbs(newCard.blockId);
    await loadContent(newCard.blockId);
  } else {
    breadcrumbs.value = [];
    if (currentProtyle) {
      currentProtyle.destroy();
      currentProtyle = null;
    }
    if (bodyRef.value) {
      bodyRef.value.innerHTML = '';
    }
  }
}, { immediate: true });

// 清理
onBeforeUnmount(() => {
  if (currentProtyle) {
    currentProtyle.destroy();
    currentProtyle = null;
  }
});

// 暴露方法供父组件调用
defineExpose({
  loadContent,
  fetchBreadcrumbs,
});
</script>
