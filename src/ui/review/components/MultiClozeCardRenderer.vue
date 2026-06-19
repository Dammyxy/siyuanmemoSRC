<template>
  <div
    class="multi-cloze-card-renderer"
    :class="showAnswer ? 'multi-cloze-card-renderer--show-answer' : 'multi-cloze-card-renderer--question'"
  >
    <CardLoadingState v-if="showLoading && !viewModel" :text="t('loadingContent', '内容加载中...')" />
    <CardErrorState v-else-if="error && !viewModel" :message="error" />

    <div v-else-if="viewModel" class="multi-cloze-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div class="multi-cloze-card-renderer__card">
        <ReviewRichHtmlContent
          class="multi-cloze-card-renderer__body protyle-content"
          :content="renderedContent"
          :on-open-block="onOpenBlock"
        />
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
import type { RichContentResult } from '@/core/card/common/application/richContent';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import { renderMathWithKatex } from './mathRender';
import { buildReviewRendererIdentity } from './reviewRendererIdentity';
import ReviewRichHtmlContent from './ReviewRichHtmlContent.vue';

const logger = createLogger('MultiClozeCardRenderer');

const props = defineProps<{
  card: FSRSCard;
  showAnswer?: boolean;
  renderService?: MultiClozeCardRenderService;
  i18n?: Record<string, string>;
  preparedViewModel?: unknown;
  preparedIdentity?: string;
  refreshEpoch?: number;
  onOpenBlock?: (blockId: string) => void | Promise<void>;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<MultiClozeCardViewModel | null>(null);
const activeViewModelIdentity = ref('');
const fallbackRenderService = new MultiClozeCardRenderService();
const renderService = computed(() => props.renderService ?? fallbackRenderService);
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const renderIdentity = computed(() => {
  return buildReviewRendererIdentity(props.card);
});

const rawContent = computed<RichContentResult | null>(() => {
  if (!viewModel.value) return null;
  return props.showAnswer ? viewModel.value.backContent : viewModel.value.frontContent;
});

const renderedContent = computed<RichContentResult>(() => {
  const content = rawContent.value;
  if (!content) {
    return {
      html: '',
      atoms: [],
      diagnostics: [],
      source: {
        kind: 'multi-cloze',
      },
      renderKind: 'html',
    };
  }
  return {
    ...content,
    html: renderMathWithKatex(content.html, (renderError) => {
      logger.warn('[MultiClozeCardRenderer] Failed to render KaTeX content:', renderError);
    }),
  };
});

async function loadViewModel() {
  const seq = ++loadSeq;
  if (applyPreparedViewModel()) {
    return;
  }
  const identity = renderIdentity.value;
  if (activeViewModelIdentity.value !== identity) {
    viewModel.value = null;
    activeViewModelIdentity.value = '';
  }

  try {
    loading.value = true;
    error.value = null;
    const nextViewModel = await renderService.value.prepareViewModel(props.card);
    if (seq !== loadSeq) {
      return;
    }
    viewModel.value = nextViewModel;
    activeViewModelIdentity.value = identity;
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

function applyPreparedViewModel(): boolean {
  const prepared = props.preparedViewModel as MultiClozeCardViewModel | null | undefined;
  if (!prepared || props.preparedIdentity !== renderIdentity.value) {
    return false;
  }

  loadSeq += 1;
  viewModel.value = prepared;
  activeViewModelIdentity.value = renderIdentity.value;
  error.value = null;
  loading.value = false;
  return true;
}

onMounted(() => {
  void loadViewModel();
});

watch(
  () => [renderIdentity.value, props.preparedIdentity || '', props.refreshEpoch || 0],
  () => {
    void loadViewModel();
  },
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
  --siyuanmemo-multi-cloze-font-size: var(--siyuanmemo-review-font-title-lg, 1.375em);
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

.multi-cloze-card-renderer__body :deep(.siyuanmemo-multi-cloze__placeholder) {
  display: inline-block;
  min-width: var(--siyuanmemo-multi-cloze-blank-width, 4ch);
  max-width: 28ch;
  padding: 0 0.28em;
  border-bottom: 2px solid var(--b3-theme-primary);
  border-radius: 4px 4px 2px 2px;
  color: transparent;
  background: color-mix(in srgb, var(--b3-theme-primary) 9%, transparent);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  vertical-align: baseline;
}

.multi-cloze-card-renderer__body :deep(.siyuanmemo-multi-cloze__answer) {
  border-radius: 4px;
  padding: 0 0.16em;
}

.multi-cloze-card-renderer__body :deep(.siyuanmemo-multi-cloze__answer--current) {
  color: var(--b3-theme-primary);
  background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
  font-weight: 600;
}

.multi-cloze-card-renderer__body :deep(.siyuanmemo-multi-cloze__answer--context) {
  color: var(--b3-theme-on-surface);
  opacity: 0.72;
  background: color-mix(in srgb, var(--b3-theme-surface-lighter) 70%, transparent);
}

@media screen and (max-width: 768px) {
  .multi-cloze-card-renderer__card {
    --siyuanmemo-multi-cloze-font-size: var(--siyuanmemo-review-font-title, 1.125em);
    padding: 28px 20px 40px;
  }
}
</style>
