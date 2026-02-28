<template>
  <div class="multi-cloze-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" text="加载多挖孔卡片..." />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 卡片内容 -->
    <div v-else-if="viewModel" class="multi-cloze-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 正面：显示问题 -->
      <div v-if="!showAnswer" class="multi-cloze-card-renderer__front">
        <div class="multi-cloze-card-renderer__question" v-html="renderedQuestionHtml"></div>
      </div>

      <!-- 背面：显示答案 -->
      <div v-else class="multi-cloze-card-renderer__back">
        <div class="multi-cloze-card-renderer__front-preview" v-html="renderedQuestionHtml"></div>
        <div class="multi-cloze-card-renderer__answer-divider"><span>答案</span></div>
        <div class="multi-cloze-card-renderer__answer" v-html="renderedAnswerHtml"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { MultiClozeCardRenderService } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { MultiClozeCardViewModel } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import { renderMathWithKatex } from './mathRender';

const logger = createLogger('MultiClozeCardRenderer');

const props = defineProps<{
  card: FSRSCard;
  showAnswer?: boolean;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<MultiClozeCardViewModel | null>(null);

const renderService = new MultiClozeCardRenderService();

const renderedQuestionHtml = computed(() => {
  const question = viewModel.value?.currentFace.question || '';
  return renderMathWithKatex(question, (error) => {
    logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX question:', error);
  });
});

const renderedAnswerHtml = computed(() => {
  const answer = viewModel.value?.currentFace.answer || '';
  return renderMathWithKatex(answer, (error) => {
    logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX answer:', error);
  });
});

async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;
    viewModel.value = await renderService.prepareViewModel(props.card);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    logger.error('[MultiClozeCardRenderer] Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadViewModel();
});

// 监听 card 变化，重新加载 viewModel
watch(
  () => props.card,
  () => {
    loadViewModel();
  },
  { deep: true }
);
</script>

<style scoped>
.multi-cloze-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.multi-cloze-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

/* 正面样式 - 与背面保持相同位置 */
.multi-cloze-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px;
  min-height: 200px;
}

.multi-cloze-card-renderer__question {
  font-size: 24px;
  line-height: 1.6;
  text-align: left;
  color: var(--b3-theme-on-surface);
  width: 100%;
}

/* 背面样式 - 视线自然向下流动 */
.multi-cloze-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
  display: flex;
  flex-direction: column;
}

/* 正面预览 - 保持原始大小，仅灰显在顶部 */
.multi-cloze-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 24px;
  line-height: 1.6;
  margin-bottom: 20px;
  text-align: left;
}

/* 答案分隔线 - 视觉引导 */
.multi-cloze-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.multi-cloze-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.multi-cloze-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

/* 答案 - 左对齐,与正面保持相同位置 */
.multi-cloze-card-renderer__answer {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
  text-align: left;
  width: 100%;
}

/* 挖空占位符样式 - 只在问题中显示淡绿色 */
.multi-cloze-card-renderer__question :deep(mark) {
  background-color: #C8E6C9; /* 柔和的淡绿色 (Material Green 100) */
  color: #00695C; /* 深青色文字 (Material Teal 800) */
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

/* 答案中的 mark 标签不显示样式（如果有的话） */
.multi-cloze-card-renderer__answer :deep(mark) {
  background-color: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-weight: inherit;
}

/* 响应式设计 */
@media screen and (max-width: 768px) {
  .multi-cloze-card-renderer__front,
  .multi-cloze-card-renderer__back {
    padding: 32px 24px;
  }
  
  .multi-cloze-card-renderer__question,
  .multi-cloze-card-renderer__answer {
    font-size: 20px;
  }
  
  .multi-cloze-card-renderer__front-preview {
    font-size: 20px;
  }
}
</style>
