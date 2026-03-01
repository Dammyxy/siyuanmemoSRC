<template>
  <div class="image-occlusion-card-renderer">
    <CardLoadingState v-if="loading" :text="t('loading', 'Loading...')" />
    <CardErrorState v-else-if="error" :message="error" />

    <div v-else-if="viewModel" class="image-occlusion-card-renderer__content">
      <div v-if="viewModel.prompt" class="image-occlusion-card-renderer__question">
        {{ viewModel.prompt }}
      </div>

      <div class="image-occlusion-card-renderer__stage">
        <div class="image-occlusion-card-renderer__frame">
          <img
            class="image-occlusion-card-renderer__image"
            :src="viewModel.imageSrc"
            alt="image-occlusion-source"
            draggable="false"
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

      <div v-if="!showAnswer" class="image-occlusion-card-renderer__hint">
        {{ t('imageOcclusionReviewFrontHint', 'Recall the hidden area, then reveal answer') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import { getBlockAttrs, getBlockKramdown } from '@/infrastructure/siyuan/api';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  return {
    left: `${mask.x * 100}%`,
    top: `${mask.y * 100}%`,
    width: `${mask.w * 100}%`,
    height: `${mask.h * 100}%`,
  };
}

async function loadViewModel(): Promise<void> {
  try {
    loading.value = true;
    error.value = null;

    const attrs = await getBlockAttrs(props.blockId);
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

    const nextViewModel: ViewModel = {
      imageSrc,
      masks: viewMasks,
      prompt: viewMasks[0]?.prompt?.trim() || '',
    };
    viewModel.value = nextViewModel;
    emit('loaded', nextViewModel);
  } catch (err) {
    const nextError = err instanceof Error ? err : new Error(String(err));
    error.value = nextError.message;
    emit('error', nextError);
    logger.error('[ImageOcclusionCardRenderer] Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => `${props.blockId}:${props.card?.id || ''}:${resolveMaskIdFromCard(props.card) || ''}:${resolveMaskIndexFromCard(props.card, []) ?? ''}`,
  () => {
    traceImageOcclusion('watch.triggered', {
      blockId: props.blockId,
      cardId: props.card?.id || '',
    });
    void loadViewModel();
  },
);

onMounted(() => {
  void loadViewModel();
});
</script>

<style scoped>
.image-occlusion-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.image-occlusion-card-renderer__content {
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
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 180px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--b3-theme-surface);
}

.image-occlusion-card-renderer__frame {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
}

.image-occlusion-card-renderer__image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
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
  background: #1d4ed8;
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
</style>
