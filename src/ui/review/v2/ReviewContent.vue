<template>
  <div class="fsrs-review-v2-content">
    <Transition :name="transitionName">
      <div :key="contentKey" class="fsrs-review-v2-content__inner">
        <div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty">
          <div class="fsrs-review-v2-content__empty-icon">🔮</div>
          <div class="fsrs-review-v2-content__empty-title">{{ t('noDueCard', '没有到期卡片') }}</div>
        </div>

        <div v-else-if="content.type === 'html'" class="fsrs-review-v2-content__html" v-html="content.data"></div>

        <div v-else class="fsrs-review-v2-content__protyle">
          <!-- 正面：问题块 -->
          <div ref="hostRef" class="fsrs-review-v2-content__protyle-host"></div>
          
          <!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
          <!-- 注意：showAnswer 语义已反转，showAnswer=false 表示答案已显示 -->
          <div v-if="!showAnswer && answerBlockID" class="fsrs-review-v2-content__answer-divider">
            <span>{{ t('answerDivider', '─── 答案 ───') }}</span>
          </div>
          <div v-if="!showAnswer && answerBlockID" ref="answerHostRef" class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"></div>
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
let protyleInitialized = false;  // 🆕 跟踪 Protyle 是否已初始化

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

/**
 * 应用答案显示/隐藏逻辑
 * 根据 hasHiddenContent 和 showAnswer 状态，在 hostRef.value 上添加或移除 CSS 类
 * 
 * 注意：props.showAnswer 的语义已经被 Adapter 反转了！
 * - Adapter: showAnswer = !context.showAnswer
 * - context.showAnswer = false (初始状态，答案未显示) → props.showAnswer = true
 * - context.showAnswer = true (用户点击后，答案已显示) → props.showAnswer = false
 * 
 * 所以在这个函数中：
 * - props.showAnswer = true → 显示"显示答案"按钮 → 答案应该被隐藏
 * - props.showAnswer = false → 不显示"显示答案"按钮 → 答案应该显示
 */
function applyAnswerVisibility(): void {
  const element = hostRef.value;
  if (!element) {
    console.warn('[FSRS ReviewContent] Cannot apply answer visibility: hostRef.value is null');
    return;
  }
  
  const hasHidden = props.hasHiddenContent;
  const showAnswerButton = props.showAnswer;  // 重命名以明确语义：是否显示"显示答案"按钮
  
  console.log('[FSRS ReviewContent] applyAnswerVisibility called:', { hasHidden, showAnswerButton });
  
  if (!hasHidden) {
    // 没有隐藏内容，移除所有隐藏类
    console.log('[FSRS ReviewContent] No hidden content, removing all hide classes');
    element.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
    return;
  }
  
  // showAnswerButton = true → 显示"显示答案"按钮 → 答案应该被隐藏
  // showAnswerButton = false → 不显示"显示答案"按钮 → 答案应该显示
  if (showAnswerButton) {
    // 显示"显示答案"按钮 → 隐藏答案
    console.log('[FSRS ReviewContent] Hiding answer (showAnswerButton=true), adding hide classes');
    element.classList.add(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  } else {
    // 不显示"显示答案"按钮 → 显示答案
    console.log('[FSRS ReviewContent] Showing answer (showAnswerButton=false), removing all hide classes');
    element.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  }
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
  
  // 🆕 重置 Protyle 初始化标志
  protyleInitialized = false;
  
  // 🆕 预先应用隐藏类，避免闪烁
  // 如果有隐藏内容且需要显示"显示答案"按钮，立即添加隐藏类
  if (props.hasHiddenContent && props.showAnswer) {
    console.log('[FSRS ReviewContent] Pre-applying hide classes to prevent flash');
    hostRef.value.classList.add(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  } else {
    // 确保移除所有隐藏类
    hostRef.value.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  }

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
      
      // 🆕 标记 Protyle 已初始化，延迟更长时间确保 protyle.element 完全初始化
      nextTick(() => {
        setTimeout(() => {
          protyleInitialized = true;
          console.log('[FSRS ReviewContent] Protyle initialized, applying answer visibility');
          console.log('[FSRS ReviewContent] protyle object:', protyle);
          console.log('[FSRS ReviewContent] protyle.element:', protyle?.element);
          console.log('[FSRS ReviewContent] hostRef.value:', hostRef.value);
          
          // 🆕 使用 hostRef.value 而不是 protyle.element
          // 因为 protyle.element 在 after 回调中可能还未设置
          const element = hostRef.value;
          if (!element) {
            console.warn('[FSRS ReviewContent] hostRef.value is null');
            return;
          }
          
          // 直接在这里应用 CSS 类，而不是调用 applyAnswerVisibility
          const hasHidden = props.hasHiddenContent;
          const showAnswerButton = props.showAnswer;
          
          console.log('[FSRS ReviewContent] Applying CSS classes:', { hasHidden, showAnswerButton });
          
          if (!hasHidden) {
            element.classList.remove(
              'card__block--hidemark',
              'card__block--hideli',
              'card__block--hidesb',
              'card__block--hideh'
            );
          } else if (showAnswerButton) {
            // 显示"显示答案"按钮 → 隐藏答案
            element.classList.add(
              'card__block--hidemark',
              'card__block--hideli',
              'card__block--hidesb',
              'card__block--hideh'
            );
          } else {
            // 不显示"显示答案"按钮 → 显示答案
            element.classList.remove(
              'card__block--hidemark',
              'card__block--hideli',
              'card__block--hidesb',
              'card__block--hideh'
            );
          }
        }, 100);  // 增加延迟到 100ms
      });
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
    console.log('[FSRS ReviewContent] Watch triggered:', { hidden, show, protyleInitialized });
    
    // 🆕 只有在 Protyle 初始化后才应用 CSS 类
    if (!protyleInitialized) {
      console.log('[FSRS ReviewContent] Protyle not initialized yet, skipping');
      return;
    }
    
    if (!hostRef.value) {
      console.log('[FSRS ReviewContent] No hostRef.value');
      return;
    }
    
    console.log('[FSRS ReviewContent] Applying answer visibility from watch');
    // 调用统一的答案显示/隐藏逻辑
    applyAnswerVisibility();
  },
  { immediate: false, deep: true },  // 🆕 改为 immediate: false，因为初始化时在 after 回调中处理
);

// Xiuyuan 模板卡片：监听 showAnswer 变化，渲染答案块
// 注意：showAnswer 语义已反转，showAnswer=false 表示答案已显示
watch(
  () => [props.showAnswer, answerBlockID.value],
  ([show, ansBlockID]) => {
    console.log('[FSRS ReviewContent] Answer watch triggered:', { show, ansBlockID });
    
    // showAnswer=false 表示答案已显示，此时渲染答案块
    if (!show && ansBlockID) {
      console.log('[FSRS ReviewContent] Rendering answer block:', ansBlockID);
      void renderAnswerProtyle(ansBlockID as string);
    } else {
      // showAnswer=true 表示答案未显示，销毁答案 Protyle
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
  display: flex;
  flex-direction: column;
}

.fsrs-review-v2-content__inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.fsrs-review-v2-content__empty {
  padding: 48px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.fsrs-review-v2-content__empty-icon {
  font-size: 48px;
  line-height: 1;
}

.fsrs-review-v2-content__empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}

.fsrs-review-v2-content__empty-subtitle {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-review-v2-content__html {
  padding: 8px;
}

.fsrs-review-v2-content__protyle {
  flex: 1;
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
