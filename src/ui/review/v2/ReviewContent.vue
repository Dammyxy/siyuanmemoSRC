<template>
  <div class="fsrs-review-v2-content">
    <Transition :name="transitionName">
      <div :key="contentKey" class="fsrs-review-v2-content__inner">
        <div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty ft__secondary">
          {{ t('loadingContent', '内容加载中...') }}
        </div>

        <div v-else-if="content.type === 'html'" class="fsrs-review-v2-content__html" v-html="content.data"></div>

        <div v-else class="fsrs-review-v2-content__protyle">
          <!-- 正面：问题块 -->
          <div ref="hostRef" class="fsrs-review-v2-content__protyle-host"></div>
          
          <!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
          <div v-if="showAnswer && answerBlockID" class="fsrs-review-v2-content__answer-divider">
            <span>{{ t('answerDivider', '─── 答案 ───') }}</span>
          </div>
          <div v-if="showAnswer && answerBlockID" ref="answerHostRef" class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"></div>
        </div>

        <div v-if="overlay && overlayComponent" class="fsrs-review-v2-content__overlay" :data-layout="overlay.layout">
          <component :is="overlayComponent" v-bind="overlay.props"></component>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import * as siyuan from 'siyuan';
import type { ReviewUIState } from './types';
import { OVERLAY_REGISTRY } from './overlays/index';

const props = defineProps<{
  app: any;
  content: ReviewUIState['content'];
  overlay?: ReviewUIState['overlay'];
  i18n?: Record<string, string>;
  hasHiddenContent?: boolean;
  showAnswer?: boolean;
  meta?: ReviewUIState['meta'];
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 计算卡片切换动画名称
const transitionName = computed(() => {
  const transition = props.meta?.transition || 'none';
  return `fsrs-review-transition-${transition}`;
});

// 计算内容 key，用于触发过渡动画
const contentKey = computed(() => {
  return `${props.content.type}-${props.content.id}-${props.content.data}`;
});

const hostRef = ref<HTMLDivElement | null>(null);
const answerHostRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<any>(null);
const answerEditorRef = ref<any>(null);
let renderSeq = 0;
let answerRenderSeq = 0;

// 计算答案块 ID（Xiuyuan 模板卡片）
const answerBlockID = computed(() => props.content.answerBlockID || '');

const overlayComponent = computed<any | null>(() => {
  const key = String(props.overlay?.component || '');
  if (!key) return null;
  return (OVERLAY_REGISTRY as any)[key] || null;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// 等待 DOM 准备好
async function ensureHostRef(): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (hostRef.value) return true;
    await nextTick();
    await sleep(10);
  }
  return false;
}

async function renderProtyle(blockID: string): Promise<void> {
  const seq = ++renderSeq;

  console.log('[FSRS ReviewContent] renderProtyle called:', { blockID, seq });

  // 等待 DOM 准备
  const ready = await ensureHostRef();
  if (!ready) {
    console.log('[FSRS ReviewContent] hostRef not ready after waiting');
    return;
  }

  if (seq !== renderSeq) {
    console.log('[FSRS ReviewContent] Render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = (siyuan as any).Protyle;
  const Constants = (siyuan as any).Constants;
  const cbGetAll = Constants?.CB_GET_ALL ?? 2;

  if (!ProtyleCtor) {
    hostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    return;
  }

  console.log('[FSRS ReviewContent] Destroying old Protyle instance');

  // Destroy old instance
  try {
    editorRef.value?.destroy?.();
  } catch {}

  // Clear host
  hostRef.value.innerHTML = '';

  console.log('[FSRS ReviewContent] Creating new Protyle with blockId:', blockID);

  // Create new instance with blockId - Protyle will auto-load content
  editorRef.value = new ProtyleCtor(props.app, hostRef.value, {
    blockId: blockID,
    action: [cbGetAll].filter(Boolean),
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: true,
      title: true,
      hideTitleOnZoom: true,
    },
    typewriterMode: false,
    after: (protyle: any) => {
      console.log('[FSRS ReviewContent] Protyle after callback called');
      console.log('[FSRS ReviewContent] protyle.disable exists:', typeof protyle.disable);

      // 使用 after 回调锁定编辑器（参考卡片浏览器实现）
      if (typeof protyle.disable === 'function') {
        console.log('[FSRS ReviewContent] Locking editor with protyle.disable()...');
        protyle.disable();

        // 添加双击解锁功能
        const wysiwygElement = protyle.wysiwyg?.element;
        if (wysiwygElement) {
          const handleDoubleClick = () => {
            console.log('[FSRS ReviewContent] Double-click detected, unlocking editor');
            if (typeof protyle.enable === 'function') {
              protyle.enable();
              console.log('[FSRS ReviewContent] Editor unlocked');
            }
            wysiwygElement.removeEventListener('dblclick', handleDoubleClick);
          };
          wysiwygElement.addEventListener('dblclick', handleDoubleClick);
          console.log('[FSRS ReviewContent] Added double-click listener for unlock');
        }
      } else {
        console.warn('[FSRS ReviewContent] protyle.disable() not available in after callback');
      }
    },
  });

  console.log('[FSRS ReviewContent] Protyle instance created, waiting for after callback...');
}

// 渲染答案块（Xiuyuan 模板卡片）
async function renderAnswerProtyle(blockID: string): Promise<void> {
  const seq = ++answerRenderSeq;

  console.log('[FSRS ReviewContent] renderAnswerProtyle called:', { blockID, seq });

  // 等待 DOM 准备
  for (let i = 0; i < 20; i++) {
    if (answerHostRef.value) break;
    await nextTick();
    await sleep(10);
  }

  if (!answerHostRef.value) {
    console.log('[FSRS ReviewContent] answerHostRef not ready after waiting');
    return;
  }

  if (seq !== answerRenderSeq) {
    console.log('[FSRS ReviewContent] Answer render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = (siyuan as any).Protyle;
  const Constants = (siyuan as any).Constants;
  const cbGetAll = Constants?.CB_GET_ALL ?? 2;

  if (!ProtyleCtor) {
    answerHostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    return;
  }

  console.log('[FSRS ReviewContent] Destroying old Answer Protyle instance');

  // Destroy old instance
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}

  // Clear host
  answerHostRef.value.innerHTML = '';

  console.log('[FSRS ReviewContent] Creating new Answer Protyle with blockId:', blockID);

  // Create new instance with blockId
  answerEditorRef.value = new ProtyleCtor(props.app, answerHostRef.value, {
    blockId: blockID,
    action: [cbGetAll].filter(Boolean),
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: false,
      title: false,
    },
    typewriterMode: false,
    after: (protyle: any) => {
      console.log('[FSRS ReviewContent] Answer Protyle after callback called');
      if (typeof protyle.disable === 'function') {
        protyle.disable();
      }
    },
  });

  console.log('[FSRS ReviewContent] Answer Protyle instance created');
}

watch(
  () => props.content.data,
  (data) => {
    if (props.content.type !== 'protyle') return;
    const blockID = String(data || '');
    if (!blockID) return;
    console.log('[FSRS ReviewContent] Watch triggered, blockID:', blockID);
    void renderProtyle(blockID);
  },
  { immediate: true },
);

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    console.log('[FSRS ReviewContent] Watch triggered:', { hidden, show });
    
    const protyle = editorRef.value?.protyle;
    if (!protyle) {
      console.log('[FSRS ReviewContent] No protyle instance');
      return;
    }
    
    // 🔧 修复：应该操作 protyle.element，不是 wysiwyg.element
    const element = protyle.element;
    if (!element) {
      console.log('[FSRS ReviewContent] No protyle.element');
      return;
    }

    console.log('[FSRS ReviewContent] Applying styles to protyle.element');

    if (!hidden) {
      console.log('[FSRS ReviewContent] No hidden content, removing all hide classes');
      element.classList.remove(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
      return;
    }

    if (show) {
      console.log('[FSRS ReviewContent] Showing answer, removing all hide classes');
      element.classList.remove(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
    } else {
      console.log('[FSRS ReviewContent] Hiding answer, adding hide classes');
      // 🔧 添加所有隐藏类型（参考思源原生实现）
      element.classList.add('card__block--hideh');
      element.classList.add('card__block--hidemark');
      element.classList.add('card__block--hideli');
      element.classList.add('card__block--hidesb');
      console.log('[FSRS ReviewContent] Classes added:', element.className);
    }
  },
  { immediate: true, deep: true },
);

// Xiuyuan 模板卡片：监听 showAnswer 变化，渲染答案块
watch(
  () => [props.showAnswer, answerBlockID.value],
  ([show, ansBlockID]) => {
    console.log('[FSRS ReviewContent] Answer watch triggered:', { show, ansBlockID });
    
    if (show && ansBlockID) {
      console.log('[FSRS ReviewContent] Rendering answer block:', ansBlockID);
      void renderAnswerProtyle(ansBlockID as string);
    } else {
      // 隐藏答案时，销毁答案 Protyle
      try {
        answerEditorRef.value?.destroy?.();
        answerEditorRef.value = null;
      } catch {}
    }
  },
  { immediate: true },
);

onMounted(() => {
  const { type, data } = props.content;
  if (type !== 'protyle') return;
  const blockID = String(data || '');
  if (!blockID) return;
  void renderProtyle(blockID);
});

onUnmounted(() => {
  try {
    editorRef.value?.destroy?.();
  } catch {}
  editorRef.value = null;
  
  // 清理答案 Protyle
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}
  answerEditorRef.value = null;
});

const overlay = computed(() => props.overlay);
const content = computed(() => props.content);
</script>

<style scoped>
.fsrs-review-v2-content {
  position: relative;
  min-height: 240px;
  flex: 1;
  overflow: hidden;
}

.fsrs-review-v2-content__inner {
  height: 100%;
  width: 100%;
}

.fsrs-review-v2-content__empty {
  padding: 16px;
  text-align: center;
}

.fsrs-review-v2-content__html {
  padding: 8px;
}

.fsrs-review-v2-content__protyle {
  height: 100%;
  overflow: auto;
}

.fsrs-review-v2-content__protyle-host {
  padding: 0;
}

/* Xiuyuan 模板卡片答案分隔线 */
.fsrs-review-v2-content__answer-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.fsrs-review-v2-content__answer-divider span {
  background: var(--b3-theme-background);
  padding: 0 12px;
}

/* 答案块样式 */
.fsrs-review-v2-content__answer {
  border-top: 1px dashed var(--b3-border-color);
  margin-top: 8px;
  padding-top: 8px;
}

.fsrs-review-v2-content__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fsrs-review-v2-content__overlay[data-layout='top'] {
  inset: 0 0 auto 0;
}

.fsrs-review-v2-content__overlay[data-layout='bottom'] {
  inset: auto 0 0 0;
}

.fsrs-review-v2-content__overlay[data-layout='cover'] {
  inset: 0;
}

/* 卡片切换动画 - 淡入淡出 */
.fsrs-review-transition-fade-enter-active,
.fsrs-review-transition-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fsrs-review-transition-fade-enter-from,
.fsrs-review-transition-fade-leave-to {
  opacity: 0;
}

/* 卡片切换动画 - 左滑 */
.fsrs-review-transition-slide-left-enter-active,
.fsrs-review-transition-slide-left-leave-active {
  transition: all 0.3s ease;
}

.fsrs-review-transition-slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.fsrs-review-transition-slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 卡片切换动画 - 右滑 */
.fsrs-review-transition-slide-right-enter-active,
.fsrs-review-transition-slide-right-leave-active {
  transition: all 0.3s ease;
}

.fsrs-review-transition-slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.fsrs-review-transition-slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
