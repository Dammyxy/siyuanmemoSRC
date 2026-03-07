<template>
  <div class="image-occlusion-card-renderer">
    <CardLoadingState v-if="showLoading" :text="t('loading', '加载中...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <div
      v-else-if="viewModel"
      class="image-occlusion-card-renderer__content"
      :class="{ 'is-image-fullscreen': isImageFullscreen }"
    >
      <CardBreadcrumb
        v-if="viewModel.breadcrumbs.length > 0"
        :items="viewModel.breadcrumbs"
      />

      <div v-if="viewModel.prompt" class="image-occlusion-card-renderer__question">
        {{ viewModel.prompt }}
      </div>

      <div
        class="image-occlusion-card-renderer__stage"
        :class="{ 'is-image-fullscreen': isImageFullscreen }"
        data-role="image-fullscreen-stage"
      >
        <button
          class="image-occlusion-card-renderer__fullscreen-toggle"
          data-role="image-fullscreen-toggle"
          type="button"
          :aria-label="isImageFullscreen
            ? t('imageOcclusionReviewExitImageFullscreen', 'Exit image fullscreen')
            : t('imageOcclusionReviewEnterImageFullscreen', 'Enter image fullscreen')"
          :title="isImageFullscreen
            ? t('imageOcclusionReviewExitImageFullscreen', 'Exit image fullscreen')
            : t('imageOcclusionReviewEnterImageFullscreen', 'Enter image fullscreen')"
          @click.stop="toggleImageFullscreen"
        >
          <svg v-if="!isImageFullscreen"><use xlink:href="#iconFullscreen"></use></svg>
          <svg v-else><use xlink:href="#iconCloseRound"></use></svg>
        </button>

        <div
          v-if="isImageFullscreen"
          class="image-occlusion-card-renderer__zoom-controls"
          @click.stop
          @mousedown.stop
        >
          <button
            class="image-occlusion-card-renderer__zoom-button"
            data-role="image-fullscreen-zoom-out"
            type="button"
            :aria-label="t('imageOcclusionZoomOut', 'Zoom Out')"
            :title="t('imageOcclusionZoomOut', 'Zoom Out')"
            @click.stop="handleZoomOutClick"
          >
            <svg><use xlink:href="#iconZoomOut"></use></svg>
          </button>
          <span class="image-occlusion-card-renderer__zoom-value" data-role="image-zoom-value">{{ zoomValueLabel }}</span>
          <button
            class="image-occlusion-card-renderer__zoom-button"
            data-role="image-fullscreen-zoom-in"
            type="button"
            :aria-label="t('imageOcclusionZoomIn', 'Zoom In')"
            :title="t('imageOcclusionZoomIn', 'Zoom In')"
            @click.stop="handleZoomInClick"
          >
            <svg><use xlink:href="#iconZoomIn"></use></svg>
          </button>
          <span class="image-occlusion-card-renderer__zoom-wheel-tip">
            {{ t('imageOcclusionReviewZoomWheelHint', 'Ctrl + wheel to zoom, wheel to scroll, Shift + wheel for horizontal scroll') }}
          </span>
        </div>

        <div ref="viewportRef" class="image-occlusion-card-renderer__viewport" @wheel="handleStageWheel">
          <div class="image-occlusion-card-renderer__frame" :style="frameStyle">
            <img
              ref="imageRef"
              class="image-occlusion-card-renderer__image"
              :src="viewModel.imageSrc"
              alt="image-occlusion-source"
              draggable="false"
              @load="handleImageLoad"
            />
            <div class="image-occlusion-card-renderer__overlay">
              <div
                v-for="mask in viewModel.masks"
                :key="mask.id"
                class="image-occlusion-card-renderer__mask"
                :class="{ 'is-revealed': showAnswer }"
                :style="maskStyle(mask)"
              >
                <span v-if="!showAnswer" class="image-occlusion-card-renderer__mask-label">{{ mask.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!showAnswer && !isImageFullscreen" class="image-occlusion-card-renderer__hint">
        {{ t('imageOcclusionReviewFrontHint', 'Recall the hidden area, then reveal answer') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { BreadcrumbItem } from '@/core/card/common/application/types';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import { getBlockAttrs, getBlockKramdown } from '@/infrastructure/siyuan/api';
import type { FSRSCard } from '@/types/card';
import { loadBreadcrumbTrail } from '@/ui/review/shared/loadBreadcrumbTrail';
import {
  clamp01,
  computeFitWidthScale,
  computeScaledSize,
  toPercentMaskStyle,
} from '@/utils/imageOcclusionGeometry';
import { createLogger } from '@/utils/logger';
import { useDeferredLoadingIndicator } from './composables/useDeferredLoadingIndicator';

const logger = createLogger('ImageOcclusionCardRenderer');
const TRACE_IMAGE_OCCLUSION = false;

const ATTR_IMAGE_OCCLUSION = 'custom-fsrs-image-occlusion';
const ATTR_IMAGE_OCCLUSION_CARD_IDS = 'custom-fsrs-image-occlusion-card-ids';

interface OcclusionMask {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  prompt?: string;
}

interface OcclusionPayload {
  version?: number;
  imageSrc?: string;
  masks?: unknown;
  maskToCardId?: unknown;
}

interface ViewMask extends OcclusionMask {
  displayIndex: number;
  label: string;
}

interface ViewModel {
  breadcrumbs: BreadcrumbItem[];
  imageSrc: string;
  masks: ViewMask[];
  prompt: string;
}

interface Props {
  blockId: string;
  card?: FSRSCard;
  showAnswer?: boolean;
  i18n?: Record<string, string>;
}

interface Emits {
  (e: 'loaded', value: ViewModel): void;
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<Props>(), {
  showAnswer: false,
});

const emit = defineEmits<Emits>();

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ViewModel | null>(null);
const isImageFullscreen = ref(false);
const zoomPercent = ref(100);
const viewportRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const imageNaturalWidth = ref(0);
const imageNaturalHeight = ref(0);
const viewportInnerWidth = ref(0);
const { showLoading } = useDeferredLoadingIndicator(loading);
let loadSeq = 0;
let zoomCompensationVersion = 0;
let viewportResizeObserver: ResizeObserver | null = null;
let hasWindowResizeListener = false;

const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 300;
const ZOOM_STEP_PERCENT = 10;

const zoomValueLabel = computed(() => `${zoomPercent.value}%`);
const nonFullscreenFrameDimensions = computed(() => {
  if (isImageFullscreen.value || imageNaturalWidth.value <= 0 || imageNaturalHeight.value <= 0) {
    return null;
  }

  const maxWidth = viewportInnerWidth.value > 0 ? viewportInnerWidth.value : imageNaturalWidth.value;
  const scale = computeFitWidthScale(imageNaturalWidth.value, maxWidth, false);
  return computeScaledSize(imageNaturalWidth.value, imageNaturalHeight.value, scale);
});

const fullscreenFrameDimensions = computed(() => {
  if (!isImageFullscreen.value || imageNaturalWidth.value <= 0 || imageNaturalHeight.value <= 0) {
    return null;
  }

  return computeScaledSize(imageNaturalWidth.value, imageNaturalHeight.value, zoomPercent.value / 100);
});

const frameStyle = computed<Record<string, string>>(() => {
  const dimensions = isImageFullscreen.value
    ? fullscreenFrameDimensions.value
    : nonFullscreenFrameDimensions.value;
  if (!dimensions) {
    return {};
  }

  return {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
  };
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function traceImageOcclusion(message: string, payload?: Record<string, unknown>): void {
  if (!TRACE_IMAGE_OCCLUSION) {
    return;
  }
  logger.warn(`[TRACE_IOC][Renderer] ${message}`, payload || {});
  if (payload) {
    try {
      logger.warn(`[TRACE_IOC][Renderer][JSON] ${message} ${JSON.stringify(payload)}`);
    } catch {
      // ignore stringify error
    }
  }
}

function parseImageSourceFromKramdown(kramdown: string): string {
  const markdownMatch = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(kramdown);
  if (markdownMatch?.[1]) return markdownMatch[1];

  const htmlMatch = /<img[^>]+src="([^"]+)"/i.exec(kramdown);
  if (htmlMatch?.[1]) return htmlMatch[1];

  return '';
}

function normalizeMasks(masks: unknown): OcclusionMask[] {
  if (!Array.isArray(masks)) return [];

  return masks
    .map((item) => item as Partial<OcclusionMask>)
    .filter((item) =>
      typeof item?.id === 'string'
      && typeof item?.x === 'number'
      && typeof item?.y === 'number'
      && typeof item?.w === 'number'
      && typeof item?.h === 'number',
    )
    .map((item) => ({
      id: item.id as string,
      x: clamp01(item.x as number),
      y: clamp01(item.y as number),
      w: clamp01(item.w as number),
      h: clamp01(item.h as number),
      prompt: typeof item.prompt === 'string' && item.prompt.trim().length > 0 ? item.prompt.trim() : undefined,
    }))
    .filter((item) => item.w > 0 && item.h > 0);
}

function parseTrackedCardIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function parseMaskToCardId(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([maskId, cardId]) => [maskId.trim(), typeof cardId === 'string' ? cardId.trim() : ''] as const)
    .filter(([maskId, cardId]) => maskId.length > 0 && cardId.length > 0);

  if (entries.length === 0) {
    return {};
  }

  return Object.fromEntries(entries);
}

function resolveMaskIdFromCard(card: FSRSCard | undefined): string | null {
  const meta = card?.meta;
  if (!meta || typeof meta !== 'object') return null;

  const maskId = (meta as Record<string, unknown>).imageOcclusionMaskId;
  if (typeof maskId === 'string' && maskId.trim().length > 0) {
    return maskId.trim();
  }
  return null;
}

function resolveMaskIdFromPayloadMap(
  card: FSRSCard | undefined,
  maskToCardId: Record<string, string>,
): string | null {
  const cardId = card?.id?.trim();
  if (!cardId) {
    return null;
  }

  const entry = Object.entries(maskToCardId).find(([, mappedCardId]) => mappedCardId === cardId);
  if (!entry) {
    return null;
  }

  return entry[0];
}

function resolveMaskIdFromTrackedOrder(
  card: FSRSCard | undefined,
  trackedCardIds: string[],
  masks: OcclusionMask[],
): string | null {
  const cardId = card?.id?.trim();
  if (!cardId || trackedCardIds.length === 0 || masks.length === 0) {
    return null;
  }

  const index = trackedCardIds.findIndex((id) => id === cardId);
  if (index < 0 || index >= masks.length) {
    return null;
  }

  return masks[index]?.id || null;
}

function resolveMaskIndexFromCard(
  card: FSRSCard | undefined,
  trackedCardIds: string[],
): number | null {
  const meta = card?.meta;
  if (meta && typeof meta === 'object') {
    const maskIndex = (meta as Record<string, unknown>).imageOcclusionMaskIndex;
    if (typeof maskIndex === 'number' && Number.isInteger(maskIndex) && maskIndex >= 0) {
      return maskIndex;
    }
    if (typeof maskIndex === 'string' && /^\d+$/.test(maskIndex.trim())) {
      return Number.parseInt(maskIndex, 10);
    }

    const faceIndex = (meta as Record<string, unknown>).faceIndex;
    if (typeof faceIndex === 'number' && Number.isInteger(faceIndex) && faceIndex >= 0) {
      return faceIndex;
    }
  }

  const cardId = card?.id?.trim();
  if (cardId && trackedCardIds.length > 0) {
    const trackedIndex = trackedCardIds.findIndex((id) => id === cardId);
    if (trackedIndex >= 0) {
      return trackedIndex;
    }
  }

  return null;
}

function toViewMasks(
  masks: OcclusionMask[],
  targetMaskId: string | null,
  maskIndex: number | null,
): ViewMask[] {
  const allMasks = masks.map((mask, index) => ({
    ...mask,
    displayIndex: index + 1,
    label: mask.prompt?.trim() || String(index + 1),
  }));

  if (allMasks.length === 0) return [];

  if (targetMaskId) {
    const exactMask = allMasks.find((mask) => mask.id === targetMaskId);
    if (exactMask) return [exactMask];
  }

  if (maskIndex !== null && maskIndex >= 0 && maskIndex < allMasks.length) {
    return [allMasks[maskIndex]];
  }

  return [];
}

function maskStyle(mask: ViewMask): Record<string, string> {
  return toPercentMaskStyle(mask);
}

function clampZoomPercent(value: number): number {
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, value));
}

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function updateViewportInnerWidth(): void {
  const viewport = viewportRef.value;
  if (!viewport) {
    viewportInnerWidth.value = 0;
    return;
  }

  const style = window.getComputedStyle(viewport);
  const horizontalPadding = parsePixelValue(style.paddingLeft) + parsePixelValue(style.paddingRight);
  viewportInnerWidth.value = Math.max(0, viewport.clientWidth - horizontalPadding);
}

function teardownViewportMetricsObserver(): void {
  if (viewportResizeObserver) {
    viewportResizeObserver.disconnect();
    viewportResizeObserver = null;
  }
  if (hasWindowResizeListener) {
    window.removeEventListener('resize', updateViewportInnerWidth);
    hasWindowResizeListener = false;
  }
}

function setupViewportMetricsObserver(): void {
  teardownViewportMetricsObserver();
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }

  updateViewportInnerWidth();

  if (typeof ResizeObserver !== 'undefined') {
    viewportResizeObserver = new ResizeObserver(() => {
      updateViewportInnerWidth();
    });
    viewportResizeObserver.observe(viewport);
    return;
  }

  window.addEventListener('resize', updateViewportInnerWidth);
  hasWindowResizeListener = true;
}

function handleImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement | null;
  if (!image) {
    return;
  }
  imageNaturalWidth.value = image.naturalWidth || image.width || 0;
  imageNaturalHeight.value = image.naturalHeight || image.height || 0;
  updateViewportInnerWidth();
}

function resetViewportScrollToOrigin(): void {
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
}

function applyZoomPercent(value: number, anchorEvent?: WheelEvent): void {
  const next = clampZoomPercent(value);
  const previous = zoomPercent.value;
  if (next === previous) {
    return;
  }

  const viewport = viewportRef.value;
  if (!viewport || !isImageFullscreen.value) {
    zoomPercent.value = next;
    return;
  }

  const prevScale = previous / 100;
  const nextScale = next / 100;
  if (prevScale <= 0 || nextScale <= 0) {
    zoomPercent.value = next;
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const viewportOffsetX = anchorEvent ? anchorEvent.clientX - rect.left : rect.width / 2;
  const viewportOffsetY = anchorEvent ? anchorEvent.clientY - rect.top : rect.height / 2;
  const anchorContentX = viewport.scrollLeft + viewportOffsetX;
  const anchorContentY = viewport.scrollTop + viewportOffsetY;
  const ratio = nextScale / prevScale;
  const compensationVersion = ++zoomCompensationVersion;

  zoomPercent.value = next;

  void nextTick(() => {
    if (compensationVersion !== zoomCompensationVersion) {
      return;
    }

    const latestViewport = viewportRef.value;
    if (!latestViewport || !isImageFullscreen.value) {
      return;
    }

    latestViewport.scrollLeft = Math.max(0, anchorContentX * ratio - viewportOffsetX);
    latestViewport.scrollTop = Math.max(0, anchorContentY * ratio - viewportOffsetY);
  });
}

function resetImageFullscreenState(): void {
  zoomCompensationVersion += 1;
  isImageFullscreen.value = false;
  zoomPercent.value = 100;
}

function enterImageFullscreen(): void {
  const image = imageRef.value;
  if (image && imageNaturalWidth.value <= 0 && imageNaturalHeight.value <= 0) {
    imageNaturalWidth.value = image.naturalWidth || image.width || 0;
    imageNaturalHeight.value = image.naturalHeight || image.height || 0;
  }

  isImageFullscreen.value = true;
  zoomPercent.value = 100;
  void nextTick(() => {
    resetViewportScrollToOrigin();
  });
}

function exitImageFullscreen(): void {
  resetImageFullscreenState();
}

function toggleImageFullscreen(): void {
  if (!viewModel.value || loading.value || error.value) {
    return;
  }

  if (isImageFullscreen.value) {
    exitImageFullscreen();
    return;
  }

  enterImageFullscreen();
}

function adjustZoom(delta: number, anchorEvent?: WheelEvent): void {
  applyZoomPercent(zoomPercent.value + delta, anchorEvent);
}

function handleZoomOutClick(): void {
  adjustZoom(-ZOOM_STEP_PERCENT);
}

function handleZoomInClick(): void {
  adjustZoom(ZOOM_STEP_PERCENT);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

function isPlusToggleKey(event: KeyboardEvent): boolean {
  const key = event.key;
  if (key === '+') {
    return true;
  }
  if (key === '=' && event.shiftKey) {
    return true;
  }
  const normalized = key.toLowerCase();
  return normalized === 'add' || normalized === 'numpadadd';
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) {
    return;
  }

  if (isPlusToggleKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    toggleImageFullscreen();
    return;
  }

  if (event.key === 'Escape' && isImageFullscreen.value) {
    event.preventDefault();
    event.stopPropagation();
    exitImageFullscreen();
  }
}

function handleStageWheel(event: WheelEvent): void {
  if (!isImageFullscreen.value) {
    return;
  }

  if (event.ctrlKey) {
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? ZOOM_STEP_PERCENT : -ZOOM_STEP_PERCENT, event);
    return;
  }

  if (!event.shiftKey) {
    return;
  }

  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }

  const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
  event.preventDefault();
  viewport.scrollLeft += horizontalDelta;
}

async function loadViewModel(): Promise<void> {
  const seq = ++loadSeq;
  const breadcrumbsPromise = loadBreadcrumbTrail(props.blockId, {
    trimTrailingCount: 1,
    clipAtLastDocument: true,
  }).catch((breadcrumbError) => {
    logger.warn('[ImageOcclusionCardRenderer] Failed to load breadcrumbs:', breadcrumbError);
    return [];
  });

  try {
    loading.value = true;
    error.value = null;
    viewportInnerWidth.value = 0;
    imageNaturalWidth.value = 0;
    imageNaturalHeight.value = 0;

    const attrs = await getBlockAttrs(props.blockId);
    if (seq !== loadSeq) {
      return;
    }
    const rawPayload = attrs[ATTR_IMAGE_OCCLUSION];
    const trackedCardIds = parseTrackedCardIds(attrs[ATTR_IMAGE_OCCLUSION_CARD_IDS]);
    let payload: OcclusionPayload = {};

    if (typeof rawPayload === 'string' && rawPayload.trim()) {
      try {
        payload = JSON.parse(rawPayload) as OcclusionPayload;
      } catch (parseError) {
        logger.warn('[ImageOcclusionCardRenderer] Invalid occlusion payload, fallback to block image parse', parseError);
      }
    }

    let imageSrc = typeof payload.imageSrc === 'string' ? payload.imageSrc.trim() : '';
    if (!imageSrc) {
      const { kramdown } = await getBlockKramdown(props.blockId);
      if (seq !== loadSeq) {
        return;
      }
      imageSrc = parseImageSourceFromKramdown(kramdown);
    }

    if (!imageSrc) {
      throw new Error(t('imageOcclusionNoImage', 'No image found in current block'));
    }

    const masks = normalizeMasks(payload.masks);
    const maskToCardId = parseMaskToCardId(payload.maskToCardId);
    const fromPayloadMap = resolveMaskIdFromPayloadMap(props.card, maskToCardId);
    const fromTrackedOrder = resolveMaskIdFromTrackedOrder(props.card, trackedCardIds, masks);
    const fromCardMeta = resolveMaskIdFromCard(props.card);
    const targetMaskId = fromPayloadMap || fromTrackedOrder || fromCardMeta;
    const targetSource = fromPayloadMap
      ? 'payload.maskToCardId'
      : fromTrackedOrder
        ? 'trackedCardIds'
        : fromCardMeta
          ? 'card.meta.maskId'
          : 'none';
    const maskIndex = targetMaskId ? null : resolveMaskIndexFromCard(props.card, trackedCardIds);
    const viewMasks = toViewMasks(masks, targetMaskId, maskIndex);

    const cardMeta = props.card?.meta && typeof props.card.meta === 'object'
      ? props.card.meta as Record<string, unknown>
      : {};

    traceImageOcclusion('loadViewModel.resolve', {
      blockId: props.blockId,
      cardId: props.card?.id || '',
      payloadVersion: typeof payload.version === 'number' ? payload.version : -1,
      masks: masks.map((mask, index) => ({ index, id: mask.id })),
      maskToCardId,
      trackedCardIds,
      cardMetaMaskId: String(cardMeta.imageOcclusionMaskId || ''),
      cardMetaMaskIndex: cardMeta.imageOcclusionMaskIndex ?? '',
      resolvedMaskId: targetMaskId || '',
      resolvedBy: targetSource,
      fallbackMaskIndex: maskIndex ?? '',
      viewMaskIds: viewMasks.map((mask) => mask.id),
    });

    if (masks.length > 0 && viewMasks.length === 0) {
      traceImageOcclusion('loadViewModel.maskNotFound', {
        blockId: props.blockId,
        cardId: props.card?.id || '',
        payloadVersion: typeof payload.version === 'number' ? payload.version : -1,
        maskToCardId,
        trackedCardIds,
        resolvedMaskId: targetMaskId || '',
        fallbackMaskIndex: maskIndex ?? '',
      });
      throw new Error(t('imageOcclusionMaskNotFound', 'Failed to locate this card\'s occlusion area. Please resave the image occlusion.'));
    }

    const breadcrumbs = await breadcrumbsPromise;
    if (seq !== loadSeq) {
      return;
    }

    const nextViewModel: ViewModel = {
      breadcrumbs,
      imageSrc,
      masks: viewMasks,
      prompt: viewMasks[0]?.prompt?.trim() || '',
    };
    if (seq !== loadSeq) {
      return;
    }
    viewModel.value = nextViewModel;
    void nextTick(() => {
      updateViewportInnerWidth();
    });
    emit('loaded', nextViewModel);
  } catch (err) {
    if (seq !== loadSeq) {
      return;
    }
    const nextError = err instanceof Error ? err : new Error(String(err));
    error.value = nextError.message;
    emit('error', nextError);
    logger.error('[ImageOcclusionCardRenderer] Failed to load view model:', err);
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

watch(
  () => `${props.blockId}:${props.card?.id || ''}:${resolveMaskIdFromCard(props.card) || ''}:${resolveMaskIndexFromCard(props.card, []) ?? ''}`,
  () => {
    resetImageFullscreenState();
    traceImageOcclusion('watch.triggered', {
      blockId: props.blockId,
      cardId: props.card?.id || '',
    });
    void loadViewModel();
  },
);

watch(viewportRef, () => {
  setupViewportMetricsObserver();
  void nextTick(() => {
    updateViewportInnerWidth();
  });
});

watch(isImageFullscreen, () => {
  void nextTick(() => {
    updateViewportInnerWidth();
  });
});

onMounted(() => {
  setupViewportMetricsObserver();
  document.addEventListener('keydown', handleGlobalKeyDown);
  void loadViewModel();
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeyDown);
  teardownViewportMetricsObserver();
  resetImageFullscreenState();
});
</script>

<style scoped>
.image-occlusion-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.image-occlusion-card-renderer__content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.image-occlusion-card-renderer__question {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface-lighter, var(--b3-theme-surface));
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  line-height: 1.45;
}

.image-occlusion-card-renderer__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 180px;
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--b3-theme-surface);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.image-occlusion-card-renderer__stage.is-image-fullscreen {
  position: absolute;
  inset: 0;
  z-index: 20;
  border-color: color-mix(in srgb, var(--b3-theme-primary) 34%, var(--b3-border-color));
  box-shadow: 0 14px 36px rgba(7, 19, 53, 0.3);
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--b3-theme-surface) 88%, #0f2a73 12%),
    color-mix(in srgb, var(--b3-theme-background) 86%, #172554 14%)
  );
}

.image-occlusion-card-renderer__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 14px;
  overflow: auto;
}

.image-occlusion-card-renderer__stage.is-image-fullscreen .image-occlusion-card-renderer__viewport {
  padding: 70px 16px 16px;
  align-items: flex-start;
  justify-content: flex-start;
}

.image-occlusion-card-renderer__fullscreen-toggle {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 4;
  width: 36px;
  min-width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 42%, var(--b3-border-color));
  border-radius: 10px;
  background: color-mix(in srgb, var(--b3-theme-surface) 74%, #dbeafe 26%);
  color: color-mix(in srgb, var(--b3-theme-primary) 88%, #1e3a8a 12%);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.image-occlusion-card-renderer__fullscreen-toggle:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--b3-theme-primary) 62%, var(--b3-border-color));
  background: color-mix(in srgb, var(--b3-theme-surface) 62%, #bfdbfe 38%);
}

.image-occlusion-card-renderer__fullscreen-toggle svg {
  width: 16px;
  height: 16px;
}

.image-occlusion-card-renderer__zoom-controls {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 38%, var(--b3-border-color));
  background: color-mix(in srgb, var(--b3-theme-surface) 70%, #dbeafe 30%);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.18);
}

.image-occlusion-card-renderer__zoom-button {
  width: 30px;
  min-width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 40%, var(--b3-border-color));
  border-radius: 8px;
  background: color-mix(in srgb, var(--b3-theme-surface) 84%, #eff6ff 16%);
  color: color-mix(in srgb, var(--b3-theme-primary) 86%, #1e3a8a 14%);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.image-occlusion-card-renderer__zoom-button svg {
  width: 16px;
  height: 16px;
}

.image-occlusion-card-renderer__zoom-value {
  min-width: 54px;
  text-align: center;
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  font-weight: 600;
}

.image-occlusion-card-renderer__zoom-wheel-tip {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  white-space: nowrap;
}

.image-occlusion-card-renderer__frame {
  position: relative;
  display: block;
  max-width: none;
  max-height: none;
  flex: 0 0 auto;
  transition: width 0.15s ease, height 0.15s ease;
}

.image-occlusion-card-renderer__stage.is-image-fullscreen .image-occlusion-card-renderer__frame {
  max-width: none;
  max-height: none;
  transition: none;
}

.image-occlusion-card-renderer__image {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  pointer-events: none;
  user-select: none;
  background: var(--b3-theme-background);
}

.image-occlusion-card-renderer__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.image-occlusion-card-renderer__mask {
  position: absolute;
  border: 2px solid #000;
  background: #1e3a8a;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.image-occlusion-card-renderer__mask.is-revealed {
  background: transparent;
  border-color: #000;
}

.image-occlusion-card-renderer__mask-label {
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  opacity: 0.85;
  padding: 0 4px;
  text-align: center;
  word-break: break-word;
  max-width: 100%;
}

.image-occlusion-card-renderer__hint {
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
  text-align: center;
}

@media (pointer: coarse) {
  .image-occlusion-card-renderer__fullscreen-toggle {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }

  .image-occlusion-card-renderer__zoom-controls {
    gap: 10px;
    padding: 8px 12px;
  }

  .image-occlusion-card-renderer__zoom-button {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }

  .image-occlusion-card-renderer__zoom-wheel-tip {
    display: none;
  }
}
</style>
