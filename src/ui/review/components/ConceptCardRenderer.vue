<template>
  <div class="concept-card-renderer">
    <CardLoadingState v-if="showLoading && !viewModel" :text="t('loadingContent', '内容加载中...')" />
    <CardErrorState v-else-if="error && !viewModel" :message="error" />

    <div v-else-if="viewModel" class="concept-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div class="concept-card-renderer__main">
        <div class="concept-card-renderer__badge">
          <span class="concept-card-renderer__badge-icon">📥</span>
          <span class="concept-card-renderer__badge-label">概念卡</span>
        </div>

        <div v-if="!showAnswer" class="concept-card-renderer__front">
          <div class="concept-card-renderer__concept-name">
            {{ viewModel.conceptName }}
          </div>
        </div>

        <div v-else class="concept-card-renderer__back">
          <div class="concept-card-renderer__front-preview">
            {{ viewModel.conceptName }}
          </div>

          <div class="concept-card-renderer__answer-divider">
            <span>内容</span>
          </div>

          <ReviewRichHtmlContent
            class="concept-card-renderer__html-content"
            :html="viewModel.contentHtml"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ConceptCardRenderService } from '@/core/card/concept/application/ConceptCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import ReviewRichHtmlContent from './ReviewRichHtmlContent.vue';
import type { ConceptCardViewModel } from '@/core/card/concept/application/ConceptCardRenderService';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';

const logger = createLogger('ConceptCardRenderer');

interface ConceptCardInput {
  xiuyuanID?: string;
  meta?: {
    xiuyuanID?: string;
  };
}

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: ConceptCardInput;
  showAnswer?: boolean;
  i18n?: Record<string, string>;
  renderService?: ConceptCardRenderService;
  preparedViewModel?: unknown;
  preparedIdentity?: string;
  refreshEpoch?: number;
}>();

const emit = defineEmits<{
  loaded: [result: { viewModel: ConceptCardViewModel | null }];
  error: [error: Error];
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptCardViewModel | null>(null);
const activeViewModelIdentity = ref('');
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

const fallbackRenderService = new ConceptCardRenderService();
const renderService = computed(() => props.renderService ?? fallbackRenderService);

const renderIdentity = computed(() => {
  return [props.blockId || '', props.cardId || '', props.card?.xiuyuanID || props.card?.meta?.xiuyuanID || ''].join('|');
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
    emit('loaded', { viewModel: viewModel.value });
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    logger.error('[ConceptCardRenderer] Failed to load view model:', err);
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function applyPreparedViewModel(identity = renderIdentity.value): boolean {
  const prepared = props.preparedViewModel as ConceptCardViewModel | null | undefined;
  if (!prepared || props.preparedIdentity !== identity) {
    return false;
  }

  loadSeq += 1;
  viewModel.value = prepared;
  activeViewModelIdentity.value = identity;
  error.value = null;
  loading.value = false;
  emit('loaded', { viewModel: prepared });
  return true;
}

watch(
  () => [renderIdentity.value, props.preparedIdentity || '', props.refreshEpoch || 0],
  () => {
    void loadViewModel();
  },
  { immediate: true }
);
</script>

<style scoped>
.concept-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.concept-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.concept-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.concept-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-size: var(--siyuanmemo-review-font-xs, 0.75em);
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.concept-card-renderer__badge-icon {
  font-size: var(--siyuanmemo-review-font-body, 1em);
}

.concept-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  min-height: 200px;
}

.concept-card-renderer__concept-name {
  font-size: var(--siyuanmemo-review-font-display, 2em);
  font-weight: 700;
  color: var(--b3-theme-primary);
  text-align: center;
  line-height: 1.4;
}

.concept-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
}

.concept-card-renderer__front-preview {
  opacity: 0.4;
  font-size: var(--siyuanmemo-review-font-title-lg, 1.375em);
  font-weight: 700;
  margin-bottom: 24px;
}

.concept-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-small, 0.875em);
  font-weight: 500;
}

.concept-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-card-renderer__answer-divider span {
  padding: 0;
}

.concept-card-renderer__html-content {
  font-size: var(--siyuanmemo-review-font-body, 1em);
  line-height: 1.8;
  color: var(--b3-theme-on-surface);
}

.concept-card-renderer__html-content :deep(.protyle-wysiwyg) {
  background: transparent;
}

</style>
