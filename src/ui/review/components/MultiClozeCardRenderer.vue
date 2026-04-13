<template>
  <div
    class="multi-cloze-card-renderer"
    :class="showAnswer ? 'multi-cloze-card-renderer--show-answer' : 'multi-cloze-card-renderer--question'"
  >
    <CardLoadingState v-if="showLoading" text="加载中..." />
    <CardErrorState v-else-if="error" :message="error" />

    <div v-else-if="viewModel" class="multi-cloze-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div class="multi-cloze-card-renderer__card">
        <div class="multi-cloze-card-renderer__protyle protyle">
          <div class="multi-cloze-card-renderer__body protyle-content" v-html="renderedHtml"></div>
        </div>
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

const rawHtml = computed(() => {
  if (!viewModel.value) return '';
  return props.showAnswer ? viewModel.value.backHtml : viewModel.value.frontHtml;
});

const renderedHtml = computed(() => {
  return renderMathWithKatex(rawHtml.value, (renderError) => {
    logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX content:', renderError);
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
  { deep: true },
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

.multi-cloze-card-renderer__card {
  --siyuanmemo-multi-cloze-font-size: clamp(19px, 0.55vw + 15px, 22px);
  --siyuanmemo-multi-cloze-line-height: 1.64;
  flex: 1;
  min-height: 0;
  padding: 36px 28px 48px;
}

.multi-cloze-card-renderer__protyle {
  height: 100%;
  min-height: 0;
  background: transparent;
}

.multi-cloze-card-renderer__body {
  width: 100%;
  min-height: 100%;
  font-size: var(--siyuanmemo-multi-cloze-font-size);
  line-height: var(--siyuanmemo-multi-cloze-line-height);
  padding: 0;
}

.multi-cloze-card-renderer__body :deep(.protyle-wysiwyg) {
  background: transparent;
  font-size: inherit;
  line-height: inherit;
  padding: 0;
}

.multi-cloze-card-renderer__body :deep(.protyle) {
  height: 100%;
}

.multi-cloze-card-renderer__body :deep(.katex-display) {
  margin: 0.4em 0;
}

@media screen and (max-width: 768px) {
  .multi-cloze-card-renderer__card {
    --siyuanmemo-multi-cloze-font-size: clamp(18px, 3.8vw, 20px);
    padding: 28px 20px 40px;
  }
}
</style>
