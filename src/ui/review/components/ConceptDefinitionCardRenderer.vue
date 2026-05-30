<template>
  <div class="concept-definition-card-renderer">
    <CardLoadingState v-if="showLoading && !viewModel" :text="t('loadingContent', '内容加载中...')" />
    <CardErrorState v-else-if="error && !viewModel" :message="error" />

    <CdfDirectLayout
      v-else-if="viewModel && shouldUseDirectDisplay"
      class="concept-definition-card-renderer__direct"
      :breadcrumbs="viewModel.breadcrumbs"
      :content-html="directContentHtml"
    />

    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />
      <ReviewRichHtmlContent
        class="concept-definition-card-renderer__html-content"
        :class="showAnswer ? 'concept-definition-card-renderer__back' : 'concept-definition-card-renderer__front'"
        :html="showAnswer ? viewModel.backHtml : viewModel.frontHtml"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CdfDirectLayout from '@/ui/shared/cdf-direct/CdfDirectLayout.vue';
import ReviewRichHtmlContent from './ReviewRichHtmlContent.vue';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import type {
  ConceptDefinitionCardInput,
  ConceptDefinitionCardViewModel,
} from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import { renderCdfDirectScene } from '@/ui/shared/cdf-direct/renderScene';
import { buildReviewRendererIdentity } from './reviewRendererIdentity';

const FAILURE_CACHE_KEY = '__siyuanmemo_concept_definition_render_failures__';

function getLoggedRenderFailures(): Map<string, string> {
  const scope = globalThis as typeof globalThis & {
    [FAILURE_CACHE_KEY]?: Map<string, string>;
  };

  if (!scope[FAILURE_CACHE_KEY]) {
    scope[FAILURE_CACHE_KEY] = new Map<string, string>();
  }

  return scope[FAILURE_CACHE_KEY];
}

const loggedRenderFailures = getLoggedRenderFailures();

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: ConceptDefinitionCardInput;
  showAnswer?: boolean;
  displayMode?: 'semantic' | 'direct';
  i18n?: Record<string, string>;
  renderService?: ConceptDefinitionCardRenderService;
  preparedViewModel?: unknown;
  preparedIdentity?: string;
  refreshEpoch?: number;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: ConceptDefinitionCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptDefinitionCardViewModel | null>(null);
const activeViewModelIdentity = ref('');
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

const logger = createLogger('ConceptDefinitionCardRenderer');
const fallbackRenderService = new ConceptDefinitionCardRenderService(props.i18n || {});
const renderService = computed(() => props.renderService ?? fallbackRenderService);

const shouldUseDirectDisplay = computed(() => {
  if (props.displayMode !== 'direct') {
    return false;
  }
  if (!viewModel.value) {
    return false;
  }
  return !viewModel.value.totalClozes
    && Array.isArray(viewModel.value.directScene?.rows)
    && viewModel.value.directScene.rows.length > 0;
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const directContentHtml = computed(() => {
  const vm = viewModel.value;
  if (!vm || !shouldUseDirectDisplay.value) {
    return '';
  }
  return renderCdfDirectScene(vm.directScene!, {
    showAnswer: props.showAnswer === true,
  });
});

async function loadViewModel() {
  const seq = ++loadSeq;
  const identity = renderIdentity.value;
  if (applyPreparedViewModel(identity)) {
    return;
  }
  if (activeViewModelIdentity.value !== identity) {
    viewModel.value = null;
    activeViewModelIdentity.value = '';
  }

  try {
    loading.value = true;
    error.value = null;

    const nextViewModel = await renderService.value.prepareViewModel(props.blockId, props.card);
    if (seq !== loadSeq) {
      return;
    }

    viewModel.value = nextViewModel;
    activeViewModelIdentity.value = identity;
    loggedRenderFailures.delete(identity);
    emit('loaded', viewModel.value);
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    if (loggedRenderFailures.get(identity) !== errorMessage) {
      loggedRenderFailures.set(identity, errorMessage);
      logger.debug('Suppressed duplicate concept-definition renderer error; parent will surface it', {
        identity,
        error: errorMessage,
      });
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function applyPreparedViewModel(identity = renderIdentity.value): boolean {
  const prepared = props.preparedViewModel as ConceptDefinitionCardViewModel | null | undefined;
  if (!prepared || props.preparedIdentity !== identity) {
    return false;
  }

  loadSeq += 1;
  viewModel.value = prepared;
  activeViewModelIdentity.value = identity;
  loggedRenderFailures.delete(identity);
  error.value = null;
  loading.value = false;
  emit('loaded', prepared);
  return true;
}

const renderIdentity = computed(() => {
  const card = props.card;
  const meta = card?.meta;
  const cardXiuyuanID = typeof card?.xiuyuanID === 'string' ? card.xiuyuanID : '';
  const metaXiuyuanID = typeof meta?.xiuyuanID === 'string' ? meta.xiuyuanID : '';

  return buildReviewRendererIdentity(card, [
    props.blockId || '',
    props.cardId || '',
    cardXiuyuanID || metaXiuyuanID,
  ]);
});

watch(
  () => [renderIdentity.value, props.preparedIdentity || '', props.refreshEpoch || 0],
  () => {
    void loadViewModel();
  },
  { immediate: true }
);
</script>

<style scoped>
.concept-definition-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.concept-definition-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.concept-definition-card-renderer__html-content {
  flex: 1;
  padding: 12px 16px 20px;
  font-size: var(--siyuanmemo-review-font-body, 1em);
  line-height: 1.7;
  color: var(--b3-theme-on-surface);
}

.concept-definition-card-renderer__html-content :deep(.concept-definition-question) {
  font-size: var(--siyuanmemo-review-font-title-lg, 1.375em);
  line-height: 1.6;
}

.concept-definition-card-renderer__html-content :deep(.concept-name) {
  font-weight: 700;
  color: var(--b3-theme-primary);
}

.concept-definition-card-renderer__html-content :deep(.question-text) {
  color: var(--b3-theme-on-surface);
}

.concept-definition-card-renderer__html-content :deep(.concept-definition-answer) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.concept-definition-card-renderer__html-content :deep(.question-repeat) {
  font-size: var(--siyuanmemo-review-font-title, 1.125em);
}

.concept-definition-card-renderer__html-content :deep(.answer-divider) {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 8px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-small, 0.875em);
  font-weight: 500;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider::before) {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider::after) {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-definition-card-renderer__html-content :deep(.definition-content) {
  font-size: var(--siyuanmemo-review-font-title-lg, 1.375em);
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

.concept-definition-card-renderer__html-content :deep(.concept-definition-question.reverse) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.concept-definition-card-renderer__html-content :deep(.reverse-label) {
  font-size: var(--siyuanmemo-review-font-title, 1.125em);
  color: var(--b3-theme-on-surface-light);
}

.concept-definition-card-renderer__html-content :deep(.concept-answer) {
  padding: 16px 0;
}

.concept-definition-card-renderer__html-content :deep(.concept-name.large) {
  font-size: var(--siyuanmemo-review-font-display, 2em);
  font-weight: 700;
  color: var(--b3-theme-primary);
}

.concept-definition-card-renderer__html-content :deep(p:first-child),
.concept-definition-card-renderer__html-content :deep(ul:first-child),
.concept-definition-card-renderer__html-content :deep(ol:first-child),
.concept-definition-card-renderer__html-content :deep(blockquote:first-child) {
  margin-top: 0;
}

.concept-definition-card-renderer__html-content :deep(p:last-child),
.concept-definition-card-renderer__html-content :deep(ul:last-child),
.concept-definition-card-renderer__html-content :deep(ol:last-child),
.concept-definition-card-renderer__html-content :deep(blockquote:last-child) {
  margin-bottom: 0;
}

</style>
