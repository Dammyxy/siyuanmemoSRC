<template>
  <div class="quick-card-renderer">
    <CardLoadingState v-if="showLoading && !viewModel" :text="t('loadingContent', '内容加载中...')" />
    <CardErrorState v-else-if="error && !viewModel" :message="error" />

    <div v-else-if="viewModel" class="quick-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <ReviewRichHtmlContent
        class="quick-card-renderer__card"
        :class="contentClasses"
        :html="renderedHtml"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { QuickCardRenderService, QuickCardViewModel } from '@/core/card/quick-card/application/QuickCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import ReviewRichHtmlContent from './ReviewRichHtmlContent.vue';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import { renderMathWithKatex } from './mathRender';

const logger = createLogger('QuickCardRenderer');

interface Props {
  blockId: string;
  cardId?: string;
  renderService: QuickCardRenderService;
  showAnswer?: boolean;
  i18n?: Record<string, string>;
  preparedViewModel?: unknown;
  preparedIdentity?: string;
  refreshEpoch?: number;
}

const props = withDefaults(defineProps<Props>(), {
  showAnswer: false,
});

interface Emits {
  (e: 'loaded', result: QuickCardViewModel): void;
  (e: 'error', error: Error): void;
}

const emit = defineEmits<Emits>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<QuickCardViewModel | null>(null);
const renderedHtml = ref('');
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;
const localViewModelCache = new Map<string, QuickCardViewModel>();

const renderIdentity = computed(() => {
  const side = props.showAnswer ? 'back' : 'front';
  return `${props.blockId}:${props.cardId || ''}:${side}`;
});

function renderDisplayHtml(result: QuickCardViewModel): string {
  const isLatexCloze = result.metadata.symbol === '\\cloze';
  if (!isLatexCloze) {
    return result.html;
  }
  logger.debug('[SiYuanMemo][QuickCardRenderer] Applying KaTeX re-render for latex cloze quick card', {
    blockId: result.blockId,
    cardId: result.metadata.cardId,
    side: (result as { side?: string }).side,
    symbol: result.metadata.symbol,
  });
  return renderMathWithKatex(result.html, (renderError) => {
    logger.warn('[QuickCardRenderer] Failed to render KaTeX expression:', renderError);
  });
}

const contentClasses = computed(() => {
  if (!viewModel.value) return [];
  return viewModel.value.cssClasses;
});

async function loadViewModel() {
  const seq = ++loadSeq;
  const side = props.showAnswer ? 'back' : 'front';
  const cacheKey = renderIdentity.value;
  if (applyPreparedViewModel(cacheKey)) {
    return;
  }
  const cached = localViewModelCache.get(cacheKey);
  if (cached) {
    viewModel.value = cached;
    renderedHtml.value = renderDisplayHtml(cached);
    error.value = null;
    loading.value = false;
    emit('loaded', cached);
    return;
  }

  try {
    loading.value = true;
    error.value = null;

    logger.info('[QuickCardRenderer] loadViewModel called:', {
      blockId: props.blockId,
      cardId: props.cardId,
      side,
    });

    const result = await props.renderService.prepareViewModel(props.blockId, side, props.cardId);
    if (seq !== loadSeq) {
      return;
    }

    logger.info('[SiYuanMemo][QuickCardRenderer] View model:', result);

    if (!result) {
      throw new Error('Failed to load card: not a quick card');
    }

    logger.debug('[SiYuanMemo][QuickCardRenderer] Quick render payload', {
      blockId: props.blockId,
      cardId: props.cardId,
      side,
      symbol: result.metadata.symbol,
      quickType: result.cardType,
      isLatexCloze: result.metadata.symbol === '\\cloze',
    });

    viewModel.value = result;
    localViewModelCache.set(cacheKey, result);
    renderedHtml.value = renderDisplayHtml(result);
    emit('loaded', result);
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    if (!errorMessage.includes('not a quick card')) {
      logger.error('[SiYuanMemo][QuickCardRenderer] Failed to load view model:', err);
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function applyPreparedViewModel(identity = renderIdentity.value): boolean {
  const prepared = props.preparedViewModel as QuickCardViewModel | null | undefined;
  if (!prepared || props.preparedIdentity !== identity) {
    return false;
  }

  loadSeq += 1;
  viewModel.value = prepared;
  renderedHtml.value = renderDisplayHtml(prepared);
  localViewModelCache.set(identity, prepared);
  error.value = null;
  loading.value = false;
  emit('loaded', prepared);
  return true;
}

watch(
  () => [props.showAnswer, props.preparedIdentity || '', props.refreshEpoch || 0],
  () => {
    void loadViewModel();
  }
);

watch(
  () => [props.blockId, props.cardId],
  () => {
    void loadViewModel();
  }
);

onMounted(() => {
  void loadViewModel();
});
</script>

<style scoped>
.quick-card-renderer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.quick-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.quick-card-renderer__card {
  flex: 1;
  padding: 48px 32px;
  font-size: var(--siyuanmemo-review-font-title-lg, 1.375em);
  line-height: 1.625;
  color: var(--b3-theme-on-background);
}

.quick-card-renderer__card :deep(p) {
  margin: 0.5em 0;
  line-height: 1.625;
}

.quick-card-renderer__card :deep(h1) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.75em;
}

.quick-card-renderer__card :deep(h2) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.5em;
}

.quick-card-renderer__card :deep(h3) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.25em;
}

.quick-card-renderer__card :deep(ul),
.quick-card-renderer__card :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

.quick-card-renderer__card :deep(code) {
  font-family: var(--b3-font-family-code);
  background-color: var(--b3-theme-surface);
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

.quick-card-renderer__card :deep(mark) {
  background-color: #c8e6c9;
  color: #00695c;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

</style>
