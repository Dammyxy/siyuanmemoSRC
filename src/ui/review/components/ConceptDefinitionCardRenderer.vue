<template>
  <div class="concept-definition-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" :text="t('loading', '加载中...')" />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 概念定义卡内容 -->
    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 卡片类型徽章 -->
      <div class="concept-definition-card-renderer__badge">
        <span class="concept-definition-card-renderer__badge-icon">📚</span>
        <span class="concept-definition-card-renderer__badge-label">概念定义</span>
      </div>

      <!-- 正面：概念的定义？ -->
      <div
        v-if="!showAnswer"
        class="concept-definition-card-renderer__front"
      >
        <div class="concept-definition-card-renderer__question">
          <span class="concept-definition-card-renderer__concept-name">{{ viewModel.conceptName }}</span>
          <span class="concept-definition-card-renderer__question-text">的定义？</span>
        </div>
      </div>

      <!-- 背面：显示定义，隐藏当前挖空 -->
      <div
        v-else
        class="concept-definition-card-renderer__back"
      >
        <!-- 显示正面内容（灰色） -->
        <div class="concept-definition-card-renderer__front-preview">
          <span class="concept-definition-card-renderer__concept-name">{{ viewModel.conceptName }}</span>
          <span class="concept-definition-card-renderer__question-text">的定义？</span>
        </div>
        
        <!-- 答案分隔线 -->
        <div class="concept-definition-card-renderer__answer-divider">
          <span>答案</span>
        </div>
        
        <!-- 显示定义内容（隐藏当前挖空） -->
        <div
          class="concept-definition-card-renderer__definition"
          v-html="viewModel.definitionHtml"
        ></div>
      </div>

      <!-- 跳转到概念按钮 -->
      <div class="concept-definition-card-renderer__actions">
        <button
          class="concept-definition-card-renderer__btn concept-definition-card-renderer__btn--secondary"
          @click="jumpToConcept"
        >
          跳转到概念
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { openTab } from 'siyuan';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { ConceptDefinitionCardViewModel } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: any; // FSRSCard，包含 xiuyuanID 和 ruleIndex
  showAnswer?: boolean;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: ConceptDefinitionCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

// 状态
const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptDefinitionCardViewModel | null>(null);

const renderService = new ConceptDefinitionCardRenderService();

// 方法
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 加载视图模型
 */
async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;

    viewModel.value = await renderService.prepareViewModel(props.blockId, props.card);
    emit('loaded', viewModel.value);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    console.error('[ConceptDefinitionCardRenderer] Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 跳转到概念文档
 */
function jumpToConcept() {
  if (!viewModel.value?.conceptBlockId) {
    return;
  }

  const app = (window as any).siyuan?.ws?.app;
  if (!app) {
    console.error('[ConceptDefinitionCardRenderer] App instance not found');
    return;
  }

  openTab({
    app,
    doc: { id: viewModel.value.conceptBlockId },
  });
}

// 生命周期
onMounted(async () => {
  await loadViewModel();
});
</script>

<style scoped>
/* 容器 */
.concept-definition-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 内容区域 */
.concept-definition-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 16px;
}

/* 卡片类型徽章 */
.concept-definition-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.concept-definition-card-renderer__badge-icon {
  font-size: 16px;
}

/* 正面样式 */
.concept-definition-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  min-height: 200px;
}

.concept-definition-card-renderer__question {
  font-size: 28px;
  line-height: 1.4;
  text-align: center;
}

.concept-definition-card-renderer__concept-name {
  font-weight: 700;
  color: var(--b3-theme-primary);
}

.concept-definition-card-renderer__question-text {
  color: var(--b3-theme-on-surface);
}

/* 背面样式 */
.concept-definition-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
}

.concept-definition-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  margin-bottom: 24px;
  text-align: center;
}

.concept-definition-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.concept-definition-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-definition-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-definition-card-renderer__definition {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 覆盖 Lute 渲染的默认样式 */
.concept-definition-card-renderer__definition :deep(*) {
  font-size: 24px !important;
  line-height: 1.6 !important;
}

/* 挖空占位符样式 */
.concept-definition-card-renderer__definition :deep([___]) {
  display: inline-block;
  min-width: 60px;
  padding: 0 8px;
  background: var(--b3-theme-surface);
  border: 2px dashed var(--b3-theme-primary);
  border-radius: 4px;
  color: transparent;
}

/* 操作按钮 */
.concept-definition-card-renderer__actions {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--b3-border-color);
  margin-top: auto;
}

.concept-definition-card-renderer__btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.concept-definition-card-renderer__btn--secondary {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  border: 1px solid var(--b3-border-color);
}

.concept-definition-card-renderer__btn--secondary:hover {
  background: var(--b3-theme-surface-light);
}
</style>
