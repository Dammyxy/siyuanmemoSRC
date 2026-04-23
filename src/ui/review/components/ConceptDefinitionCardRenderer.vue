<template>
  <div class="concept-definition-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <CdfDirectLayout
      v-else-if="viewModel && shouldUseDirectDisplay"
      class="concept-definition-card-renderer__direct"
      :breadcrumbs="viewModel.breadcrumbs"
      :content-html="directContentHtml"
    />

    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />
      <div
        class="concept-definition-card-renderer__html-content"
        :class="showAnswer ? 'concept-definition-card-renderer__back' : 'concept-definition-card-renderer__front'"
        v-html="showAnswer ? viewModel.backHtml : viewModel.frontHtml"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CdfDirectLayout from './CdfDirectLayout.vue';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import type {
  ConceptDefinitionCardInput,
  ConceptDefinitionCardViewModel,
} from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import {
  buildCdfEditorContentHtml,
  createCdfEllipsisHtml,
  renderCdfDirectMarkdown,
  stripCdfDirectHtmlMarkers,
} from './cdfDirectContent';

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
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: ConceptDefinitionCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptDefinitionCardViewModel | null>(null);
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

const logger = createLogger('ConceptDefinitionCardRenderer');
const renderService = new ConceptDefinitionCardRenderService(props.i18n || {});

const shouldUseDirectDisplay = computed(() => {
  if (props.displayMode !== 'direct') {
    return false;
  }
  if (!viewModel.value) {
    return false;
  }
  return !viewModel.value.totalClozes
    && viewModel.value.conceptName.trim().length > 0
    && viewModel.value.definitionHtml.trim().length > 0;
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function renderConceptReferenceHtml(conceptName: string): string {
  return renderCdfDirectMarkdown(`[[${conceptName}]]`);
}

const directContentHtml = computed(() => {
  const vm = viewModel.value;
  if (!vm || !shouldUseDirectDisplay.value) {
    return '';
  }

  const conceptHtml = renderConceptReferenceHtml(vm.conceptName);
  const definitionHtml = stripCdfDirectHtmlMarkers(vm.definitionHtml);
  const ellipsisHtml = createCdfEllipsisHtml();
  const relationArrow = vm.relationArrow || '↔';

  return buildCdfEditorContentHtml([{
    key: 'concept-definition',
    level: 0,
    leftHtml: vm.isReverse && !props.showAnswer ? ellipsisHtml : conceptHtml,
    rightHtml: vm.isReverse ? definitionHtml : (props.showAnswer ? definitionHtml : ellipsisHtml),
    arrow: relationArrow,
    emphasize: 'primary',
    ellipsisSide: vm.isReverse && !props.showAnswer ? 'left' : (!props.showAnswer ? 'right' : null),
  }]);
});

async function loadViewModel() {
  const seq = ++loadSeq;
  const identity = renderIdentity.value;

  try {
    loading.value = true;
    error.value = null;

    const nextViewModel = await renderService.prepareViewModel(props.blockId, props.card);
    if (seq !== loadSeq) {
      return;
    }

    viewModel.value = nextViewModel;
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

const renderIdentity = computed(() => {
  const card = props.card;
  const meta = card?.meta;
  const cardXiuyuanID = typeof card?.xiuyuanID === 'string' ? card.xiuyuanID : '';
  const metaXiuyuanID = typeof meta?.xiuyuanID === 'string' ? meta.xiuyuanID : '';
  const faceIndex = typeof meta?.faceIndex === 'number' ? String(meta.faceIndex) : '';
  const typeMarker = typeof meta?.typeMarker === 'string' ? meta.typeMarker : '';

  return [
    props.blockId || '',
    props.cardId || '',
    cardXiuyuanID || metaXiuyuanID,
    faceIndex,
    typeMarker,
  ].join('|');
});

watch(
  renderIdentity,
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
