<template>
  <div class="descriptor-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <CdfDirectLayout
      v-else-if="viewModel && shouldUseDirectDisplay"
      class="descriptor-card-renderer__direct"
      :breadcrumbs="viewModel.breadcrumbs"
      :content-html="directContentHtml"
    />

    <div v-else-if="viewModel" class="descriptor-card-renderer__content">
      <CardBreadcrumb :items="viewModel.breadcrumbs" />
      <div
        class="descriptor-card-renderer__html-content"
        :class="showAnswer ? 'descriptor-card-renderer__back' : 'descriptor-card-renderer__front'"
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
import type { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { DescriptorCardViewModel } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';
import {
  buildCdfEditorContentHtml,
  createCdfEllipsisHtml,
  renderCdfDirectMarkdown,
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
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const isReverseCard = computed(() => {
  return viewModel.value?.isReverse === true
    || (typeof props.card?.meta?.typeMarker === 'string' && props.card.meta.typeMarker.includes('reverse'));
});

const shouldUseDirectDisplay = computed(() => {
  if (props.displayMode !== 'direct') {
    return false;
  }
  if (!viewModel.value) {
    return false;
  }
  return viewModel.value.attribute.trim().length > 0
    || viewModel.value.description.trim().length > 0;
});

function renderConceptReferenceHtml(conceptTitle: string): string {
  return renderCdfDirectMarkdown(`[[${conceptTitle}]]`);
}

const directContentHtml = computed(() => {
  const vm = viewModel.value;
  if (!vm || !shouldUseDirectDisplay.value) {
    return '';
  }

  const rows = [];
  const conceptTitle = (vm.parentConcept?.title || vm.parentConcept?.preview || '').trim();

  if (conceptTitle) {
    const conceptHtml = renderConceptReferenceHtml(conceptTitle);
    rows.push({
      key: 'concept',
      level: 0 as const,
      standaloneHtml: isReverseCard.value && !props.showAnswer ? createCdfEllipsisHtml() : conceptHtml,
      emphasize: 'primary' as const,
      ellipsisSide: isReverseCard.value && !props.showAnswer ? 'left' as const : null,
    });
  }

  if (vm.attribute.trim().length > 0) {
    rows.push({
      key: 'descriptor',
      level: conceptTitle ? 1 as const : 0 as const,
      leftHtml: renderCdfDirectMarkdown(vm.attribute),
      rightHtml: isReverseCard.value
        ? renderCdfDirectMarkdown(vm.description)
        : (props.showAnswer ? renderCdfDirectMarkdown(vm.description) : createCdfEllipsisHtml()),
      arrow: vm.relationArrow || '→',
      ellipsisSide: isReverseCard.value ? null : (!props.showAnswer ? 'right' as const : null),
    });
  } else if (vm.description.trim().length > 0) {
    rows.push({
      key: 'descriptor-fallback',
      level: conceptTitle ? 1 as const : 0 as const,
      standaloneHtml: renderCdfDirectMarkdown(vm.description),
    });
  }

  return buildCdfEditorContentHtml(rows);
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

.descriptor-card-renderer__html-content {
  flex: 1;
  padding: 12px 16px 20px;
  font-size: var(--siyuanmemo-review-font-body, 1em);
  line-height: 1.7;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__html-content :deep(p:first-child),
.descriptor-card-renderer__html-content :deep(ul:first-child),
.descriptor-card-renderer__html-content :deep(ol:first-child),
.descriptor-card-renderer__html-content :deep(blockquote:first-child) {
  margin-top: 0;
}

.descriptor-card-renderer__html-content :deep(p:last-child),
.descriptor-card-renderer__html-content :deep(ul:last-child),
.descriptor-card-renderer__html-content :deep(ol:last-child),
.descriptor-card-renderer__html-content :deep(blockquote:last-child) {
  margin-bottom: 0;
}
</style>
