<template>
  <div class="descriptor-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <CdfDirectLayout
      v-else-if="viewModel && shouldUseDirectDisplay"
      class="descriptor-card-renderer__direct"
      :breadcrumbs="viewModel.breadcrumbs"
      :prompt-sections="directPromptSections"
      :answer-sections="directAnswerSections"
      :show-answer="showAnswer"
      :answer-divider-label="t('cdfDirectAnswer', '答案')"
    />

    <div v-else-if="viewModel" class="descriptor-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <div v-if="viewModel.warning" class="descriptor-card-renderer__warning">
        <span class="descriptor-card-renderer__warning-icon">⚠️</span>
        <span class="descriptor-card-renderer__warning-text">{{ viewModel.warning }}</span>
      </div>

      <div class="descriptor-card-renderer__main">
        <div class="descriptor-card-renderer__badge">
          <span class="descriptor-card-renderer__badge-icon">📑</span>
          <span class="descriptor-card-renderer__badge-label">{{ t('descriptorCard', '描述符卡') }}</span>
        </div>

        <div
          v-if="!showAnswer"
          class="descriptor-card-renderer__html-content descriptor-card-renderer__front"
          v-html="viewModel.frontHtml"
        ></div>

        <div
          v-else
          class="descriptor-card-renderer__html-content descriptor-card-renderer__back"
          v-html="viewModel.backHtml"
        ></div>
      </div>

      <div v-if="viewModel.siblingDescriptors.length > 0" class="descriptor-card-renderer__siblings">
        <div class="descriptor-card-renderer__siblings-title">{{ t('siblingDescriptors', '同概念的其他描述符') }}</div>
        <div class="descriptor-card-renderer__siblings-list">
          <div
            v-for="sibling in viewModel.siblingDescriptors"
            :key="sibling.blockId"
            class="descriptor-card-renderer__sibling-item"
          >
            {{ sibling.attribute }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="showConceptModal" class="descriptor-card-renderer__modal" @click="closeConceptModal">
      <div class="descriptor-card-renderer__modal-content" @click.stop>
        <div class="descriptor-card-renderer__modal-header">
          <h2 class="descriptor-card-renderer__modal-title">{{ t('fullConcept', '完整概念') }}</h2>
          <button class="descriptor-card-renderer__modal-close" @click="closeConceptModal">✕</button>
        </div>
        <div class="descriptor-card-renderer__modal-body" v-html="viewModel?.parentConcept?.html || ''"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CdfDirectLayout, { type CdfDirectSection } from './CdfDirectLayout.vue';
import type { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { DescriptorCardViewModel } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import {
  renderCdfDirectMarkdown,
  stripCdfDirectHtmlMarkers,
} from './cdfDirectContent';

const logger = createLogger('DescriptorCardRenderer');

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: FSRSCard;
  renderService: DescriptorCardRenderService;
  showAnswer?: boolean;
  displayMode?: 'semantic' | 'direct';
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: DescriptorCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<DescriptorCardViewModel | null>(null);
const showConceptModal = ref(false);
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const isReverseCard = computed(() => {
  const typeMarker = typeof props.card?.meta?.typeMarker === 'string' ? props.card.meta.typeMarker : '';
  return typeMarker.includes('reverse');
});

const shouldUseDirectDisplay = computed(() => {
  if (props.displayMode !== 'direct') {
    return false;
  }
  if (!viewModel.value) {
    return false;
  }
  return !!viewModel.value.parentConcept?.html
    && viewModel.value.attribute.trim().length > 0
    && viewModel.value.description.trim().length > 0;
});

const directPromptSections = computed<CdfDirectSection[]>(() => {
  const vm = viewModel.value;
  if (!vm || !shouldUseDirectDisplay.value) {
    return [];
  }

  if (isReverseCard.value) {
    return [{
      key: 'description',
      label: t('cdfDirectDescription', '描述'),
      html: renderCdfDirectMarkdown(vm.description),
    }];
  }

  return [
    {
      key: 'concept',
      label: t('cdfDirectConcept', '概念'),
      html: stripCdfDirectHtmlMarkers(vm.parentConcept?.html || ''),
    },
    {
      key: 'cue',
      label: t('cdfDirectCue', '线索'),
      html: renderCdfDirectMarkdown(vm.attribute),
    },
  ].filter((section) => section.html.trim().length > 0);
});

const directAnswerSections = computed<CdfDirectSection[]>(() => {
  const vm = viewModel.value;
  if (!vm || !shouldUseDirectDisplay.value) {
    return [];
  }

  if (isReverseCard.value) {
    return [
      {
        key: 'concept',
        label: t('cdfDirectConcept', '概念'),
        html: stripCdfDirectHtmlMarkers(vm.parentConcept?.html || ''),
      },
      {
        key: 'cue',
        label: t('cdfDirectCue', '线索'),
        html: renderCdfDirectMarkdown(vm.attribute),
      },
    ].filter((section) => section.html.trim().length > 0);
  }

  return [{
    key: 'description',
    label: t('cdfDirectDescription', '描述'),
    html: renderCdfDirectMarkdown(vm.description),
  }];
});

const renderIdentity = computed(() => {
  return [props.blockId || '', props.cardId || '', props.card?.id || '', props.card?.updatedAt || ''].join('|');
});

async function loadViewModel() {
  const seq = ++loadSeq;

  try {
    loading.value = true;
    error.value = null;

    const vm = await props.renderService.prepareViewModel(props.blockId, props.card);
    if (seq !== loadSeq) {
      return;
    }

    if (!vm) {
      throw new Error('Failed to load descriptor card');
    }

    viewModel.value = vm;
    emit('loaded', vm);
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    logger.error('[DescriptorCardRenderer] Failed to load view model:', err);
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function closeConceptModal() {
  showConceptModal.value = false;
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
.descriptor-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.descriptor-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.descriptor-card-renderer__warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--b3-theme-error-lighter);
  color: var(--b3-theme-error);
  border-left: 4px solid var(--b3-theme-error);
}

.descriptor-card-renderer__warning-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.descriptor-card-renderer__warning-text {
  font-size: 14px;
}

.descriptor-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.descriptor-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.descriptor-card-renderer__badge-icon {
  font-size: 16px;
}

.descriptor-card-renderer__html-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__front {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

.descriptor-card-renderer__back {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

.descriptor-card-renderer__siblings {
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.descriptor-card-renderer__siblings-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
}

.descriptor-card-renderer__siblings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.descriptor-card-renderer__sibling-item {
  padding: 4px 12px;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.descriptor-card-renderer__modal-content {
  background: var(--b3-theme-background);
  border-radius: 12px;
  max-width: 800px;
  max-height: 80vh;
  width: 90%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.descriptor-card-renderer__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--b3-border-color);
}

.descriptor-card-renderer__modal-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.descriptor-card-renderer__modal-close:hover {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}
</style>
