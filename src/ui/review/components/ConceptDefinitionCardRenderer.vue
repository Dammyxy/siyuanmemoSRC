<template>
  <div class="concept-definition-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div class="concept-definition-card-renderer__badge">
        <span class="concept-definition-card-renderer__badge-icon">📎</span>
        <span class="concept-definition-card-renderer__badge-label">
          {{ viewModel.isReverse ? t('conceptDefinitionCardReverse', '概念定义卡（反向）') : t('conceptDefinitionCard', '概念定义卡') }}
        </span>
      </div>

      <div class="concept-definition-card-renderer__main">
        <div
          v-if="!showAnswer"
          class="concept-definition-card-renderer__html-content concept-definition-card-renderer__front"
          v-html="viewModel.frontHtml"
        ></div>

        <div
          v-else
          class="concept-definition-card-renderer__html-content concept-definition-card-renderer__back"
          v-html="viewModel.backHtml"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import type {
  ConceptDefinitionCardInput,
  ConceptDefinitionCardViewModel,
} from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: ConceptDefinitionCardInput;
  showAnswer?: boolean;
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

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

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
    emit('loaded', viewModel.value);
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    logger.error('Failed to load view model:', err);
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
  padding: 16px;
}

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

.concept-definition-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.concept-definition-card-renderer__html-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

.concept-definition-card-renderer__front {
  padding: 24px 32px;
  min-height: 200px;
}

.concept-definition-card-renderer__back {
  padding: 24px 32px;
  min-height: 200px;
}

.concept-definition-card-renderer__html-content :deep(.concept-definition-question) {
  font-size: 24px;
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
  font-size: 20px;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider) {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 8px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
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
  font-size: 22px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

.concept-definition-card-renderer__html-content :deep(.concept-definition-question.reverse) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.concept-definition-card-renderer__html-content :deep(.reverse-label) {
  font-size: 18px;
  color: var(--b3-theme-on-surface-light);
}

.concept-definition-card-renderer__html-content :deep(.concept-answer) {
  padding: 16px 0;
}

.concept-definition-card-renderer__html-content :deep(.concept-name.large) {
  font-size: 32px;
  font-weight: 700;
  color: var(--b3-theme-primary);
}

</style>
