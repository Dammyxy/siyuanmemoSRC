<template>
  <div class="multi-cloze-card-renderer">
    <CardLoadingState v-if="showLoading" text="加载中..." />
    <CardErrorState v-else-if="error" :message="error" />

    <div v-else-if="viewModel" class="multi-cloze-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div v-if="!showAnswer" class="multi-cloze-card-renderer__front">
        <div class="multi-cloze-card-renderer__question" v-html="renderedQuestionHtml"></div>
      </div>

      <div
        v-else
        class="multi-cloze-card-renderer__back"
        :class="{ 'multi-cloze-card-renderer__back--inline': isInlineFormulaMode }"
      >
        <template v-if="isInlineFormulaMode">
          <div class="multi-cloze-card-renderer__answer" v-html="renderedAnswerHtml"></div>
        </template>
        <template v-else>
          <div class="multi-cloze-card-renderer__front-preview" v-html="renderedQuestionHtml"></div>
          <div class="multi-cloze-card-renderer__answer-divider"><span>答案</span></div>
          <div class="multi-cloze-card-renderer__answer" v-html="renderedAnswerHtml"></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import { MultiClozeCardRenderService } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import type { MultiClozeCardViewModel } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
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
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

const isInlineFormulaMode = computed(() => viewModel.value?.renderMode === 'inline-formula-cloze');

const renderedQuestionHtml = computed(() => {
  const question = viewModel.value?.currentFace.question || '';
  return renderMathWithKatex(question, (renderError) => {
    logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX question:', renderError);
  });
});

const renderedAnswerHtml = computed(() => {
  const answer = viewModel.value?.currentFace.answer || '';
  return renderMathWithKatex(answer, (renderError) => {
    logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX answer:', renderError);
  });
});

async function loadViewModel() {
  const seq = ++loadSeq;

  try {
    loading.value = true;
    error.value = null;
    const nextViewModel = await renderService.prepareViewModel(props.card);
    if (seq !== loadSeq) {
      return;
    }
    viewModel.value = nextViewModel;
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }
    error.value = err instanceof Error ? err.message : String(err);
    logger.error('[MultiClozeCardRenderer] Failed to load view model:', err);
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void loadViewModel();
});

watch(
  () => props.card,
  () => {
    void loadViewModel();
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

.multi-cloze-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
  display: flex;
  flex-direction: column;
}

.multi-cloze-card-renderer__back--inline {
  align-items: flex-start;
  justify-content: flex-start;
}

.multi-cloze-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 24px;
  line-height: 1.6;
  margin-bottom: 20px;
  text-align: left;
}

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

.multi-cloze-card-renderer__answer {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
  text-align: left;
  width: 100%;
}

.multi-cloze-card-renderer__question :deep(mark) {
  background-color: var(--siyuanmemo-cloze-success-bg, var(--b3-button-background-success, #b8d7ba));
  color: var(--siyuanmemo-cloze-success-fg, var(--b3-theme-success, #166534));
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.multi-cloze-card-renderer__answer :deep(mark) {
  background-color: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-weight: inherit;
}

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
