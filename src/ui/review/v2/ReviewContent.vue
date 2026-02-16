<template>
  <div class="fsrs-review-v2-content">
    <Transition :name="transitionName">
      <div :key="contentKey" class="fsrs-review-v2-content__inner">
        <div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty">
          <div class="fsrs-review-v2-content__empty-icon">🔮</div>
          <div class="fsrs-review-v2-content__empty-title">{{ t('noDueCard', '没有到期卡片') }}</div>
        </div>

        <div v-else-if="content.type === 'html'" class="fsrs-review-v2-content__html" v-html="content.data"></div>

        <!-- Xiuyuan 列表模版卡：自定义渲染 -->
        <div v-else-if="content.isXiuyuanListTemplate && content.xiuyuanMeta" class="fsrs-review-v2-content__xiuyuan">
          <XiuyuanListTemplateCard
            :meta="content.xiuyuanMeta"
            :show-answer="!showAnswer"
            :question-block-id="content.id"
          />
        </div>

        <!-- 描述符卡渲染 -->
        <div v-else-if="shouldUseDescriptorCardRenderer" class="fsrs-review-v2-content__descriptor-card">
          <DescriptorCardRenderer
            :block-id="content.id"
            :card-id="content.card?.id"
            :card="content.card"
            :render-service="descriptorCardRenderService"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleDescriptorCardLoaded"
            @error="handleDescriptorCardError"
          />
        </div>

        <!-- 快速卡片渲染 -->
        <div v-else-if="shouldUseQuickCardRenderer" class="fsrs-review-v2-content__quick-card">
          <QuickCardRenderer
            :block-id="content.id"
            :card-id="content.card?.id"
            :render-service="quickCardRenderService"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleQuickCardLoaded"
            @error="handleQuickCardError"
          />
        </div>

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
import XiuyuanListTemplateCard from './components/XiuyuanListTemplateCard.vue';
import QuickCardRenderer from '../components/QuickCardRenderer.vue';
import DescriptorCardRenderer from '../components/DescriptorCardRenderer.vue';
import { SiyuanBlockAdapter } from '@/core/card/quick-card/infrastructure/SiyuanBlockAdapter';
import { QuickCardRepository } from '@/core/card/quick-card/infrastructure/QuickCardRepository';
import { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import { SiyuanBlockAdapter as DescriptorBlockAdapter } from '@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter';
import { DescriptorCardRepository } from '@/core/card/descriptor-card/infrastructure/DescriptorCardRepository';
import { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';

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

// 快速卡片渲染服务
const quickCardRenderService = ref(
  new QuickCardRenderService(
    new QuickCardRepository(
      new SiyuanBlockAdapter()
    )
  )
);
const isQuickCard = ref(false);

// 描述符卡渲染服务
const descriptorCardRenderService = ref(
  new DescriptorCardRenderService(
    new DescriptorCardRepository(
      new DescriptorBlockAdapter()
    )
  )
);
const isDescriptorCard = ref(false);

// 判断是否应该使用描述符卡渲染器
const shouldUseDescriptorCardRenderer = computed(() => {
  // 只有在 protyle 类型且检测到描述符卡时才使用
  return props.content.type === 'protyle' && isDescriptorCard.value;
});

// 判断是否应该使用快速卡片渲染器
const shouldUseQuickCardRenderer = computed(() => {
  // 只有在 protyle 类型且检测到快速卡片时才使用
  // 描述符卡优先级更高
  return props.content.type === 'protyle' && !isDescriptorCard.value && isQuickCard.value;
});

// 描述符卡加载成功
function handleDescriptorCardLoaded(result: any) {
  console.log('[SiyuanMemo][ReviewContent] Descriptor card loaded:', result);
}

// 描述符卡加载失败，降级到普通渲染
function handleDescriptorCardError(error: Error) {
  console.warn('[SiyuanMemo][ReviewContent] Descriptor card failed, fallback to normal render:', error);
  isDescriptorCard.value = false;
}

// 快速卡片加载成功
function handleQuickCardLoaded(result: any) {
  console.log('[SiyuanMemo][ReviewContent] Quick card loaded:', result);
}

// 快速卡片加载失败，降级到普通渲染
function handleQuickCardError(error: Error) {
  // 如果是 "not a quick card" 错误，这是预期的降级行为，不需要警告
  if (error.message && error.message.includes('not a quick card')) {
    console.log('[SiyuanMemo][ReviewContent] Not a quick card, using normal Protyle render');
  } else {
    console.warn('[SiyuanMemo][ReviewContent] Quick card failed, fallback to normal render:', error);
  }
  isQuickCard.value = false;
}

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
    console.warn('[SiyuanMemo][SiyuanMemo][ReviewContent] Cannot apply answer visibility: hostRef.value is null');
    return;
  }
  
  const hasHidden = props.hasHiddenContent;
  const showAnswerButton = props.showAnswer;  // 重命名以明确语义：是否显示"显示答案"按钮
  
  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] applyAnswerVisibility called:', { hasHidden, showAnswerButton });
  
  if (!hasHidden) {
    // 没有隐藏内容，移除所有隐藏类
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] No hidden content, removing all hide classes');
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
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Hiding answer (showAnswerButton=true), adding hide classes');
    element.classList.add(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  } else {
    // 不显示"显示答案"按钮 → 显示答案
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Showing answer (showAnswerButton=false), removing all hide classes');
    element.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  }
}

async function renderProtyle(blockId: string): Promise<void> {
  const seq = ++renderSeq;

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] renderProtyle called with blockId:', blockId);
  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] content.card type:', props.content.card?.type);

  // 🆕 检测是否为描述符卡（优先级最高）
  try {
    const isDescriptor = await descriptorCardRenderService.value.isDescriptorCard(blockId);
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] isDescriptorCard result:', isDescriptor);
    if (isDescriptor) {
      console.log('[SiyuanMemo][ReviewContent] Detected descriptor card, using DescriptorCardRenderer');
      isDescriptorCard.value = true;
      isQuickCard.value = false;
      return; // 使用描述符卡渲染器，不需要 Protyle
    }
  } catch (error) {
    console.warn('[SiyuanMemo][ReviewContent] Descriptor card detection failed:', error);
  }

  // 🆕 检测是否为快速卡片
  try {
    const isQuick = await quickCardRenderService.value.isQuickCard(blockId);
    if (isQuick) {
      console.log('[SiyuanMemo][ReviewContent] Detected quick card, using QuickCardRenderer');
      isQuickCard.value = true;
      isDescriptorCard.value = false;
      return; // 使用快速卡片渲染器，不需要 Protyle
    }
  } catch (error) {
    console.warn('[SiyuanMemo][ReviewContent] Quick card detection failed:', error);
  }
  
  // 降级到普通 Protyle 渲染
  isQuickCard.value = false;
  isDescriptorCard.value = false;

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] renderProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  const ready = await ensureHostRef();
  if (!ready) {
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] hostRef not ready after waiting');
    return;
  }

  if (seq !== renderSeq) {
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = (siyuan as any).Protyle;
  const Constants = (siyuan as any).Constants;
  const cbGetAll = Constants?.CB_GET_ALL ?? 2;

  if (!ProtyleCtor) {
    hostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    return;
  }

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Destroying old Protyle instance');

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
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Pre-applying hide classes to prevent flash');
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

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Creating new Protyle with blockId:', blockId);

  // Create new instance with blockId - Protyle will auto-load content
  editorRef.value = new ProtyleCtor(props.app, hostRef.value, {
    blockId: blockId,
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
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Protyle after callback called');
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] protyle.disable exists:', typeof protyle.disable);

      // 使用 after 回调锁定编辑器（参考卡片浏览器实现）
      if (typeof protyle.disable === 'function') {
        console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Locking editor with protyle.disable()...');
        protyle.disable();

        // 添加双击解锁功能
        const wysiwygElement = protyle.wysiwyg?.element;
        if (wysiwygElement) {
          const handleDoubleClick = () => {
            console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Double-click detected, unlocking editor');
            if (typeof protyle.enable === 'function') {
              protyle.enable();
              console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Editor unlocked');
            }
            wysiwygElement.removeEventListener('dblclick', handleDoubleClick);
          };
          wysiwygElement.addEventListener('dblclick', handleDoubleClick);
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Added double-click listener for unlock');
        }
      } else {
        console.warn('[SiyuanMemo][SiyuanMemo][ReviewContent] protyle.disable() not available in after callback');
      }
      
      // 🆕 标记 Protyle 已初始化，延迟更长时间确保 protyle.element 完全初始化
      nextTick(() => {
        setTimeout(() => {
          protyleInitialized = true;
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Protyle initialized, applying answer visibility');
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] protyle object:', protyle);
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] protyle.element:', protyle?.element);
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] hostRef.value:', hostRef.value);
          
          // 🆕 使用 hostRef.value 而不是 protyle.element
          // 因为 protyle.element 在 after 回调中可能还未设置
          const element = hostRef.value;
          if (!element) {
            console.warn('[SiyuanMemo][SiyuanMemo][ReviewContent] hostRef.value is null');
            return;
          }
          
          // 直接在这里应用 CSS 类，而不是调用 applyAnswerVisibility
          const hasHidden = props.hasHiddenContent;
          const showAnswerButton = props.showAnswer;
          
          console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Applying CSS classes:', { hasHidden, showAnswerButton });
          
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

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Protyle instance created, waiting for after callback...');
}

// 渲染答案块（Xiuyuan 模板卡片）
async function renderAnswerProtyle(blockId: string): Promise<void> {
  const seq = ++answerRenderSeq;

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] renderAnswerProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  for (let i = 0; i < 20; i++) {
    if (answerHostRef.value) break;
    await nextTick();
    await sleep(10);
  }

  if (!answerHostRef.value) {
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] answerHostRef not ready after waiting');
    return;
  }

  if (seq !== answerRenderSeq) {
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Answer render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = (siyuan as any).Protyle;
  const Constants = (siyuan as any).Constants;
  const cbGetAll = Constants?.CB_GET_ALL ?? 2;

  if (!ProtyleCtor) {
    answerHostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    return;
  }

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Destroying old Answer Protyle instance');

  // Destroy old instance
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}

  // Clear host
  answerHostRef.value.innerHTML = '';

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Creating new Answer Protyle with blockId:', blockId);

  // Create new instance with blockId
  answerEditorRef.value = new ProtyleCtor(props.app, answerHostRef.value, {
    blockId: blockId,
    action: [cbGetAll].filter(Boolean),
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: false,
      title: false,
    },
    typewriterMode: false,
    after: (protyle: any) => {
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Answer Protyle after callback called');
      if (typeof protyle.disable === 'function') {
        protyle.disable();
      }
    },
  });

  console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Answer Protyle instance created');
}

watch(
  () => props.content.id,  // 改为监听 content.id 而不是 content.data
  (id) => {
    if (props.content.type !== 'protyle') return;
    const blockId = String(id || '');
    if (!blockId) return;
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Watch triggered, blockId:', blockId);
    void renderProtyle(blockId);
  },
  { immediate: true },
);

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Watch triggered:', { hidden, show, protyleInitialized });
    
    // 🆕 只有在 Protyle 初始化后才应用 CSS 类
    if (!protyleInitialized) {
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Protyle not initialized yet, skipping');
      return;
    }
    
    if (!hostRef.value) {
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] No hostRef.value');
      return;
    }
    
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Applying answer visibility from watch');
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
    console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Answer watch triggered:', { show, ansBlockID });
    
    // showAnswer=false 表示答案已显示，此时渲染答案块
    if (!show && ansBlockID) {
      console.log('[SiyuanMemo][SiyuanMemo][ReviewContent] Rendering answer block:', ansBlockID);
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
  const blockId = String(data || '');
  if (!blockId) return;
  void renderProtyle(blockId);
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

.fsrs-review-v2-content__xiuyuan {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__quick-card {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__descriptor-card {
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
