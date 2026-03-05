<template>
  <div class="concept-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

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

          <div class="concept-card-renderer__html-content" v-html="viewModel.contentHtml"></div>
        </div>
      </div>

      <div class="concept-card-renderer__actions">
        <button class="concept-card-renderer__btn concept-card-renderer__btn--secondary" @click="jumpToConcept">
          📫 跳转到概念
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { App } from 'siyuan';
import { ConceptCardRenderService } from '@/core/card/concept/application/ConceptCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import type { ConceptCardViewModel } from '@/core/card/concept/application/ConceptCardRenderService';
import { createLogger } from '@/utils/logger';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';

const logger = createLogger('ConceptCardRenderer');

interface ConceptCardInput {
  xiuyuanID?: string;
}

type SiyuanWindow = Window & {
  siyuan?: {
    ws?: {
      app?: App;
    };
  };
};

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: ConceptCardInput;
  showAnswer?: boolean;
  i18n?: Record<string, string>;
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
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

const renderService = new ConceptCardRenderService();

const renderIdentity = computed(() => {
  return [props.blockId || '', props.cardId || '', props.card?.xiuyuanID || ''].join('|');
});

async function loadViewModel() {
  const seq = ++loadSeq;

  try {
    loading.value = true;
    error.value = null;

    const nextViewModel = await renderService.prepareViewModel(props.blockId, props.card);
    if (seq !== loadSeq) {
      return;
    }

    viewModel.value = nextViewModel;
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

function jumpToConcept() {
  if (!viewModel.value) return;

  const app = (window as SiyuanWindow).siyuan?.ws?.app;
  if (!app) {
    logger.error('[ConceptCardRenderer] App instance not found');
    return;
  }

  openReviewBlockAtSource({
    app,
    blockId: viewModel.value.conceptBlockId,
    zoomIn: false,
  });
}

watch(
  renderIdentity,
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
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.concept-card-renderer__badge-icon {
  font-size: 16px;
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
  font-size: 36px;
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
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 24px;
}

.concept-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
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
  font-size: 16px;
  line-height: 1.8;
  color: var(--b3-theme-on-surface);
}

.concept-card-renderer__html-content :deep(.protyle-wysiwyg) {
  background: transparent;
}

.concept-card-renderer__actions {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.concept-card-renderer__btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  outline: none;
}

.concept-card-renderer__btn--secondary {
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  border: 1px solid var(--b3-border-color);
}

.concept-card-renderer__btn--secondary:hover {
  background: var(--b3-theme-surface-light);
}
</style>
