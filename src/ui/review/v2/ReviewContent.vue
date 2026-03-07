<template>
  <div class="fsrs-review-v2-content">
    <Transition :name="transitionName">
      <div :key="contentKey" class="fsrs-review-v2-content__inner">
        <div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty">
          <div class="fsrs-review-v2-content__empty-icon">No Card</div>
          <div class="fsrs-review-v2-content__empty-title">{{ t('noDueCard', 'No due cards') }}</div>
        </div>

        <div v-else-if="content.type === 'html'" class="fsrs-review-v2-content__html" v-html="content.data"></div>

        <!-- Xiuyuan 列表模版卡：自定义渲染 -->
        <div v-else-if="content.isXiuyuanListTemplate && content.xiuyuanMeta" class="fsrs-review-v2-content__xiuyuan">
          <XiuyuanListTemplateCard
            :meta="content.xiuyuanMeta"
            :show-answer="!showAnswer"
            :question-block-id="content.id"
            :plugin="plugin"
          />
        </div>

        <!-- 🆕 Xiuyuan 多挖空卡：自定义渲染 -->
        <div v-else-if="shouldUseMultiClozeRenderer" class="fsrs-review-v2-content__multi-cloze">
          <MultiClozeCardRenderer
            :card="content.card"
            :show-answer="!showAnswer"
          />
        </div>

        <div v-else-if="shouldUseImageOcclusionRenderer" class="fsrs-review-v2-content__image-occlusion-card">
          <ImageOcclusionCardRenderer
            :block-id="content.id"
            :card="content.card"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleImageOcclusionLoaded"
            @error="handleImageOcclusionError"
          />
        </div>

        <!-- 概念定义卡渲染 -->
        <div v-else-if="shouldUseConceptDefinitionRenderer" class="fsrs-review-v2-content__concept-definition-card">
          <ConceptDefinitionCardRenderer
            :block-id="content.id"
            :card-id="content.card?.id"
            :card="content.card"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleConceptDefinitionCardLoaded"
            @error="handleConceptDefinitionCardError"
          />
        </div>

        <!-- 概念卡渲染 -->
        <div v-else-if="shouldUseConceptCardRenderer" class="fsrs-review-v2-content__concept-card">
          <ConceptCardRenderer
            :block-id="content.id"
            :card-id="content.card?.id"
            :card="content.card"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleConceptCardLoaded"
            @error="handleConceptCardError"
          />
        </div>

        <!-- 描述符卡渲染 -->
        <div v-else-if="shouldUseDescriptorCardRenderer" class="fsrs-review-v2-content__descriptor-card">
          <DescriptorCardRenderer
            :block-id="content.id"
            :card-id="content.card?.id"
            :card="content.card"
            :render-service="descriptorCardRenderService"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleDescriptorCardLoaded"
            @error="handleDescriptorCardError"
          />
        </div>

        <!-- 快速卡片渲染 -->
        <div v-else-if="shouldUseQuickCardRenderer" class="fsrs-review-v2-content__quick-card">
          <QuickCardRenderer
            :block-id="content.id"
            :card-id="quickRenderCardId"
            :render-service="quickCardRenderService"
            :show-answer="!showAnswer"
            :i18n="i18n"
            @loaded="handleQuickCardLoaded"
            @error="handleQuickCardError"
          />
        </div>

        <div v-else-if="renderError" class="fsrs-review-v2-content__render-error">
          {{ renderError }}
        </div>

        <div v-else class="fsrs-review-v2-content__protyle">
          <!-- 正面：问题块 -->
          <div ref="hostRef" class="fsrs-review-v2-content__protyle-host"></div>
          
          <!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
          <!-- 注意：showAnswer 语义已反转，showAnswer=false 表示答案已显示 -->
          <div v-if="!showAnswer && answerBlockID" class="fsrs-review-v2-content__answer-divider">
            <span>{{ t('answerDivider', '--- Answer ---') }}</span>
          </div>
          <div v-if="!showAnswer && answerBlockID" ref="answerHostRef" class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"></div>
        </div>

        <div v-if="overlay && overlayComponent" class="fsrs-review-v2-content__overlay" :data-layout="overlay.layout">
          <component :is="overlayComponent" v-bind="overlay.props"></component>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import * as siyuan from 'siyuan';
import type { ReviewUIState } from './types';
import { createReviewEditorState, type ReviewEditorState } from './reviewEditorState';
import { OVERLAY_REGISTRY } from './overlays/index';
import XiuyuanListTemplateCard from './components/XiuyuanListTemplateCard.vue';
import MultiClozeCardRenderer from '../components/MultiClozeCardRenderer.vue';
import ImageOcclusionCardRenderer from '../components/ImageOcclusionCardRenderer.vue';
import QuickCardRenderer from '../components/QuickCardRenderer.vue';
import DescriptorCardRenderer from '../components/DescriptorCardRenderer.vue';
import ConceptDefinitionCardRenderer from '../components/ConceptDefinitionCardRenderer.vue';
import ConceptCardRenderer from '../components/ConceptCardRenderer.vue';
import { SiyuanBlockAdapter } from '@/core/card/quick-card/infrastructure/SiyuanBlockAdapter';
import { QuickCardRepository } from '@/core/card/quick-card/infrastructure/QuickCardRepository';
import { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import { SiyuanBlockAdapter as DescriptorBlockAdapter } from '@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter';
import { DescriptorCardRepository } from '@/core/card/descriptor-card/infrastructure/DescriptorCardRepository';
import { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import { 
  isConceptDefinitionCard as checkIsConceptDefinitionCard, 
  isConceptCard as checkIsConceptCard 
} from '@/core/xiuyuan/cardMeta';
// 🆕 性能优化：导入 Composables
import { useCssClassOptimizer } from './composables/useCssClassOptimizer';
import { useCardTypeCache } from './composables/useCardTypeCache';
import {
  buildReviewRenderCacheKey,
  buildReviewRenderWatchKey,
  isNeuralRoamNonFlashcard,
  shouldBypassSemanticFallback,
  shouldVerifyQuickDefaultProfile,
} from './reviewRenderPolicy';
import { createLogger } from '@/utils/logger';
import type { ICardStorage } from '@/application/interfaces/ICardStorage';
import { resolveRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';
import { getBlockDocInfo, getDocContent } from '@/infrastructure/siyuan/api';

const props = defineProps<{
  app: siyuan.App;
  plugin?: ReviewPluginLike;
  content: ReviewUIState['content'];
  overlay?: ReviewUIState['overlay'];
  i18n?: Record<string, string>;
  hasHiddenContent?: boolean;
  showAnswer?: boolean;
  meta?: ReviewUIState['meta'];
}>();
const emit = defineEmits<{
  (e: 'editor-state-change', state: ReviewEditorState): void;
}>();

const logger = createLogger('ReviewContent');

type PluginContextLike = {
  getCardStorage?: () => ICardStorage | null;
};

type ReviewPluginLike = {
  getContext?: () => PluginContextLike | null;
};

type OverlayRegistry = typeof OVERLAY_REGISTRY;
type OverlayKey = keyof OverlayRegistry;

type ProtyleAction = typeof siyuan.Constants.CB_GET_ALL;

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 🆕 性能优化：CSS 类优化器
const { applyAnswerVisibility: applyAnswerVisibilityOptimized, resetState: resetCssState, getStats: getCssStats } = useCssClassOptimizer({
  debugMode: false,  // 生产环境关闭调试
});

// 🆕 性能优化：卡片类型缓存
const { getCardType, setCardType, getCacheStats: getCardTypeCacheStats } = useCardTypeCache({
  maxSize: 50,
  debugMode: false,  // 生产环境关闭调试
});

// 计算卡片切换动画名称
const transitionName = computed(() => {
  const transition = props.meta?.transition || 'none';
  return `fsrs-review-transition-${transition}`;
});

// 计算内容 key，用于触发过渡动画
const contentKey = computed(() => {
  // 对于有 card 的情况，使用 card.id 确保唯一性（特别是多挖空卡片）
  const cardId = props.content.card?.id || '';
  return `${props.content.type}-${props.content.id}-${props.content.data}-${cardId}`;
});

const hostRef = ref<HTMLDivElement | null>(null);
const answerHostRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<siyuan.Protyle | null>(null);
const answerEditorRef = ref<siyuan.Protyle | null>(null);
const renderError = ref<string | null>(null);
let renderSeq = 0;
let answerRenderSeq = 0;
let protyleInitialized = false;  // 🆕 跟踪 Protyle 是否已初始化
let protyleInitTimer: ReturnType<typeof setTimeout> | null = null;
let currentEditorState = createReviewEditorState();
let unlockOnDoubleClickCleanup: (() => void) | null = null;
const invalidForcedQuickRenderVersion = ref(0);
const invalidForcedQuickRenderKeys = new Set<string>();

// 快速卡片渲染服务
const quickCardRenderService = ref(
  new QuickCardRenderService(
    new QuickCardRepository(
      new SiyuanBlockAdapter(),
      props.plugin?.getContext?.()?.getCardStorage?.() || null
    )
  )
);
const isQuickCard = ref(false);

// 描述符卡渲染服务
const descriptorCardRenderService = ref(
  new DescriptorCardRenderService(
    new DescriptorCardRepository(
      new DescriptorBlockAdapter()
    ),
    props.i18n || {}
  )
);
const isDescriptorCard = ref(false);

// 概念定义卡状态
const isConceptDefinitionCard = ref(false);

// 概念卡状态
const isConceptCard = ref(false);

function resolveTypeMarker(card: ReviewUIState['content']['card']): string {
  const marker = card?.meta?.typeMarker;
  return typeof marker === 'string' ? marker : '';
}

function resolveNeuralIsFlashcard(card: ReviewUIState['content']['card']): boolean | null {
  const neuralContext = card?.meta?.neuralContext;
  if (!neuralContext || typeof neuralContext !== 'object') {
    return null;
  }

  const isFlashcard = (neuralContext as Record<string, unknown>).isFlashcard;
  if (isFlashcard === true) return true;
  if (isFlashcard === false) return false;
  return null;
}

const forceProtyleRender = computed(() => props.content.card?.meta?.forceProtyleRender === true);
const isTopicReadModeCard = computed(() => String(props.content.card?.type || '') === 'topic');
const forceQuickRenderRaw = computed(() => props.content.card?.meta?.forceQuickRender === true);
const neuralIsFlashcard = computed(() => resolveNeuralIsFlashcard(props.content.card));
const isNeuralRoamNonFlashcardCard = computed(() => isNeuralRoamNonFlashcard(props.content.card));
const quickRenderCardId = computed(() => String(props.content.card?.id || props.content.id || ''));
const quickRenderCardIdArg = computed(() => quickRenderCardId.value || undefined);
const forceQuickRenderSuppressionKey = computed(() => {
  const cardId = String(props.content.card?.id || '').trim();
  const blockId = String(props.content.id || '').trim();
  return cardId || blockId || '';
});
const quickRenderFallbackReason = computed(() => {
  if (props.content.card?.id) return 'fsrs-card-id';
  if (props.content.id) return 'content-id-fallback';
  return 'missing-card-id';
});
const quickDetectReason = computed(() => {
  const reason = props.content.card?.meta?.quickDetectReason;
  return typeof reason === 'string' ? reason : '';
});
const resolvedRenderProfile = computed(() => resolveRenderProfile(props.content.card));
const isLatexNumberedQuickHint = computed(() => quickDetectReason.value === 'cloze-latex-numbered');
const forceQuickRender = computed(() => {
  invalidForcedQuickRenderVersion.value;
  if (forceProtyleRender.value) return false;
  if (isTopicReadModeCard.value) return false;
  if (isNeuralRoamNonFlashcardCard.value) return false;
  const suppressionKey = forceQuickRenderSuppressionKey.value;
  if (suppressionKey && invalidForcedQuickRenderKeys.has(suppressionKey)) {
    return false;
  }
  return forceQuickRenderRaw.value;
});

const renderCacheKey = computed(() =>
  buildReviewRenderCacheKey({
    blockId: String(props.content.id || ''),
    cardId: String(props.content.card?.id || ''),
    cardType: String(props.content.card?.type || ''),
    typeMarker: resolveTypeMarker(props.content.card),
    neuralIsFlashcard: neuralIsFlashcard.value,
    forceProtyleRender: forceProtyleRender.value,
    forceQuickRender: forceQuickRender.value,
  }),
);

const renderWatchKey = computed(() =>
  buildReviewRenderWatchKey({
    contentType: String(props.content.type || ''),
    blockId: String(props.content.id || ''),
    cardId: String(props.content.card?.id || ''),
    cardType: String(props.content.card?.type || ''),
    typeMarker: resolveTypeMarker(props.content.card),
    neuralIsFlashcard: neuralIsFlashcard.value,
    forceProtyleRender: forceProtyleRender.value,
    forceQuickRender: forceQuickRender.value,
  }),
);

// 🆕 判断是否应该使用多挖空卡渲染器
const shouldUseMultiClozeRenderer = computed(() => {
  if (props.content.type !== 'protyle') return false;
  if (isTopicReadModeCard.value) return false;
  if (isNeuralRoamNonFlashcardCard.value) return false;
  if (forceProtyleRender.value) return false;
  if (resolvedRenderProfile.value === 'quick-inline-formula') return true;

  // 检查是否为 Xiuyuan 多挖空卡
  const card = props.content.card;
  if (!card || !card.meta) return false;
  
  const templateID = card.meta.templateID;
  const faces = card.meta.faces;
  const faceIndex = card.meta.faceIndex;
  
  // 必须是 builtin-multi-cloze 模板，且有 faces 信息
  return templateID === 'builtin-multi-cloze' && Array.isArray(faces) && faces.length > 0 && faceIndex !== undefined;
});

// 判断是否应该使用概念定义卡渲染器
const isImageOcclusionCard = computed(() => {
  const cardMeta = props.content.card?.meta;
  if (!cardMeta || typeof cardMeta !== 'object') return false;
  const source = (cardMeta as Record<string, unknown>).source;
  const imageOcclusion = (cardMeta as Record<string, unknown>).imageOcclusion;
  return imageOcclusion === true || source === 'image-occlusion';
});

const shouldUseImageOcclusionRenderer = computed(() => {
  return props.content.type === 'protyle'
    && !isTopicReadModeCard.value
    && !isNeuralRoamNonFlashcardCard.value
    && isImageOcclusionCard.value;
});

const shouldUseConceptDefinitionRenderer = computed(() => {
  // 只有在 protyle 类型时才检测
  if (props.content.type !== 'protyle') return false;
  if (isTopicReadModeCard.value) return false;
  if (isNeuralRoamNonFlashcardCard.value) return false;
  if (isImageOcclusionCard.value) return false;
  if (forceProtyleRender.value || forceQuickRender.value) return false;
  if (resolvedRenderProfile.value === 'concept-definition') return true;
  
  // 使用领域层的辅助函数检测
  const card = props.content.card;
  const result = checkIsConceptDefinitionCard(card);
  
  logger.debug('[SiYuanMemo][ReviewContent] shouldUseConceptDefinitionRenderer:', {
    contentType: props.content.type,
    hasCard: !!card,
    cardId: card?.id,
    xiuyuanID: card?.xiuyuanID,
    metaXiuyuanID: card?.meta?.xiuyuanID,
    typeMarker: card?.meta?.typeMarker,
    result
  });
  
  return result;
});

// 判断是否应该使用概念卡渲染器
const shouldUseConceptCardRenderer = computed(() => {
  // 只有在 protyle 类型时才检测
  if (props.content.type !== 'protyle') return false;
  if (isNeuralRoamNonFlashcardCard.value) return false;
  if (isImageOcclusionCard.value) return false;
  
  // 使用领域层的辅助函数检测
  if (forceProtyleRender.value || forceQuickRender.value) return false;
  if (resolvedRenderProfile.value === 'concept') return true;
  const result = checkIsConceptCard(props.content.card);
  
  logger.debug('[SiYuanMemo][ReviewContent] shouldUseConceptCardRenderer:', {
    contentType: props.content.type,
    result
  });
  
  return result;
});

// 判断是否应该使用描述符卡渲染器
const shouldUseDescriptorCardRenderer = computed(() => {
  if (resolvedRenderProfile.value === 'descriptor') {
    return props.content.type === 'protyle'
      && !isTopicReadModeCard.value
      && !forceProtyleRender.value
      && !forceQuickRender.value
      && !isNeuralRoamNonFlashcardCard.value
      && !isImageOcclusionCard.value;
  }

  // 只有在 protyle 类型且检测到描述符卡时才使用
  // 概念定义卡和概念卡优先级更高
  return props.content.type === 'protyle'
    && !isTopicReadModeCard.value
    && !forceProtyleRender.value
    && !forceQuickRender.value
    && !isNeuralRoamNonFlashcardCard.value
    && !isImageOcclusionCard.value
    && !isConceptDefinitionCard.value
    && !isConceptCard.value
    && isDescriptorCard.value;
});

// 判断是否应该使用快速卡片渲染器
const shouldUseQuickCardRenderer = computed(() => {
  if (resolvedRenderProfile.value === 'quick-default') {
    return props.content.type === 'protyle'
      && !isTopicReadModeCard.value
      && !forceProtyleRender.value
      && !isNeuralRoamNonFlashcardCard.value
      && !isImageOcclusionCard.value
      && isQuickCard.value;
  }

  // 只有在 protyle 类型且检测到快速卡片时才使用
  // 概念定义卡、概念卡和描述符卡优先级更高
  return props.content.type === 'protyle'
    && !isTopicReadModeCard.value
    && !forceProtyleRender.value
    && !isNeuralRoamNonFlashcardCard.value
    && !isImageOcclusionCard.value
    && !isConceptDefinitionCard.value
    && !isConceptCard.value
    && !isDescriptorCard.value
    && isQuickCard.value;
});

const currentRendererKind = computed<ReviewEditorState['renderer']>(() => {
  if (props.content.type === 'empty') {
    return 'empty';
  }
  if (props.content.type === 'html') {
    return 'html';
  }
  if (
    (props.content.isXiuyuanListTemplate && !!props.content.xiuyuanMeta)
    || shouldUseMultiClozeRenderer.value
    || shouldUseImageOcclusionRenderer.value
    || shouldUseConceptDefinitionRenderer.value
    || shouldUseConceptCardRenderer.value
    || shouldUseDescriptorCardRenderer.value
    || shouldUseQuickCardRenderer.value
    || !!renderError.value
  ) {
    return 'special';
  }
  if (props.content.type === 'protyle') {
    return 'main-protyle';
  }
  return 'empty';
});

function emitEditorState(state: ReviewEditorState): void {
  if (
    currentEditorState.renderer === state.renderer
    && currentEditorState.supportsNativeEdit === state.supportsNativeEdit
    && currentEditorState.isEditing === state.isEditing
  ) {
    return;
  }

  currentEditorState = state;
  emit('editor-state-change', state);
}

function removeUnlockOnDoubleClick(): void {
  unlockOnDoubleClickCleanup?.();
  unlockOnDoubleClickCleanup = null;
}

function clearProtyleInitTimer(): void {
  if (protyleInitTimer !== null) {
    clearTimeout(protyleInitTimer);
    protyleInitTimer = null;
  }
}

function focusFirstReviewActionButton(): void {
  const reviewRoot = hostRef.value?.closest('.fsrs-review-v2') as HTMLElement | null;
  const actionButton = reviewRoot?.querySelector('.card__action button:not([disabled])') as HTMLButtonElement | null;
  actionButton?.focus();
}

function attachUnlockOnDoubleClick(protyle: siyuan.Protyle): void {
  const wysiwygElement = protyle.protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!wysiwygElement || typeof protyle.enable !== 'function') {
    return;
  }

  removeUnlockOnDoubleClick();
  const handleDoubleClick = () => {
    protyle.enable?.();
    emitEditorState(createReviewEditorState('main-protyle', {
      supportsNativeEdit: true,
      isEditing: true,
    }));
    removeUnlockOnDoubleClick();
  };

  wysiwygElement.addEventListener('dblclick', handleDoubleClick);
  unlockOnDoubleClickCleanup = () => {
    wysiwygElement.removeEventListener('dblclick', handleDoubleClick);
  };
}

function setMainProtyleReadOnly(protyle: siyuan.Protyle): void {
  protyle.disable?.();
  attachUnlockOnDoubleClick(protyle);
  emitEditorState(createReviewEditorState('main-protyle', {
    supportsNativeEdit: true,
    isEditing: false,
  }));
}

function exitEditorByEscape(): boolean {
  if (
    currentEditorState.renderer !== 'main-protyle'
    || !currentEditorState.supportsNativeEdit
    || !currentEditorState.isEditing
    || !editorRef.value
  ) {
    return false;
  }

  setMainProtyleReadOnly(editorRef.value);
  focusFirstReviewActionButton();
  return true;
}

defineExpose({
  exitEditorByEscape,
});

// 概念定义卡加载成功
function clearRendererError(): void {
  renderError.value = null;
}

function handleRendererError(rendererName: string, error: Error): void {
  logger.error(`[SiYuanMemo][ReviewContent] ${rendererName} render failed:`, error);
  renderError.value = t('cardRenderFailed', 'Failed to render this card');
}

function handleConceptDefinitionCardLoaded(result: unknown) {
  clearRendererError();
  logger.debug('[SiYuanMemo][ReviewContent] Concept definition card loaded:', result);
}

// 概念定义卡加载失败，显示错误提示
function handleConceptDefinitionCardError(error: Error) {
  handleRendererError('Concept definition', error);
}

function handleImageOcclusionLoaded(result: unknown) {
  clearRendererError();
  logger.debug('[SiYuanMemo][ReviewContent] Image occlusion card loaded:', result);
}

function handleImageOcclusionError(error: Error) {
  handleRendererError('Image occlusion', error);
}

// 概念卡加载成功
function handleConceptCardLoaded(result: unknown) {
  clearRendererError();
  logger.debug('[SiYuanMemo][ReviewContent] Concept card loaded:', result);
}

// 概念卡加载失败，显示错误提示
function handleConceptCardError(error: Error) {
  handleRendererError('Concept', error);
}

// 描述符卡加载成功
function handleDescriptorCardLoaded(result: unknown) {
  clearRendererError();
  logger.debug('[SiYuanMemo][ReviewContent] Descriptor card loaded:', result);
}

// 描述符卡加载失败，显示错误提示
function handleDescriptorCardError(error: Error) {
  handleRendererError('Descriptor', error);
}

// 快速卡片加载成功
function handleQuickCardLoaded(result: unknown) {
  clearRendererError();
  logger.debug('[SiYuanMemo][ReviewContent] Quick card loaded:', result);
}

function markInvalidForcedQuickRender(
  reason: string,
  details?: Record<string, unknown>,
): void {
  const suppressionKey = forceQuickRenderSuppressionKey.value;
  if (!suppressionKey) {
    return;
  }

  const isNew = !invalidForcedQuickRenderKeys.has(suppressionKey);
  if (isNew) {
    invalidForcedQuickRenderKeys.add(suppressionKey);
    invalidForcedQuickRenderVersion.value += 1;
  }

  setCardType(renderCacheKey.value, {
    isConcept: false,
    isDescriptor: false,
    isQuick: false,
  });
  isQuickCard.value = false;
  clearRendererError();

  if (!isNew) {
    return;
  }

  logger.warn('[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session', {
    blockId: props.content.id,
    cardId: quickRenderCardId.value,
    cardType: props.content.card?.type,
    quickDetectReason: quickDetectReason.value,
    fallbackReason: quickRenderFallbackReason.value,
    reason,
    suppressionKey,
    ...details,
  });
}

// 快速卡片加载失败，显示错误提示
function handleQuickCardError(error: Error) {
  const message = String(error?.message || '');
  const isQuickMiss = message.includes('not a quick card');
  if (isQuickMiss) {
    markInvalidForcedQuickRender('quick-renderer-not-quick-card', {
      errorMessage: message,
    });
    void renderProtyle(String(props.content.id || ''));
    return;
  }
  logger.warn('[SiYuanMemo][ReviewContent] Quick renderer failed', {
    blockId: props.content.id,
    cardId: quickRenderCardId.value,
    cardType: props.content.card?.type,
    forceQuickRender: forceQuickRender.value,
    quickDetectReason: quickDetectReason.value,
    isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
    quickDetectionResult: isQuickCard.value,
    fallbackReason: quickRenderFallbackReason.value,
    isQuickMiss,
  });
  handleRendererError('Quick card', error);
}

// 计算答案块 ID（Xiuyuan 模板卡片）
const answerBlockID = computed(() => props.content.answerBlockID || '');

const overlayComponent = computed<OverlayRegistry[OverlayKey] | null>(() => {
  const key = String(props.overlay?.component || '');
  if (!key) return null;
  if (!(key in OVERLAY_REGISTRY)) return null;
  return OVERLAY_REGISTRY[key as OverlayKey];
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

type NativeFlashcardConfig = {
  superBlock?: boolean;
  heading?: boolean;
  list?: boolean;
  mark?: boolean;
};

function getNativeFlashcardConfig(): NativeFlashcardConfig {
  if (typeof window === 'undefined') {
    return {};
  }

  const config = (window as Window & {
    siyuan?: {
      config?: {
        flashcard?: NativeFlashcardConfig;
      };
    };
  }).siyuan?.config?.flashcard;

  return config && typeof config === 'object' ? config : {};
}

function shouldApplyNativeHideClasses(host: HTMLElement): boolean {
  if (!host.isConnected) {
    return false;
  }

  const flashcardConfig = getNativeFlashcardConfig();
  if (
    flashcardConfig.superBlock !== true
    && flashcardConfig.heading !== true
    && flashcardConfig.list !== true
    && flashcardConfig.mark !== true
  ) {
    return false;
  }

  const wysiwygElement = host.querySelector('.protyle-wysiwyg');
  if (!(wysiwygElement instanceof HTMLElement)) {
    return false;
  }

  if (
    flashcardConfig.superBlock === true
    && wysiwygElement.querySelector(':scope > .sb')
  ) {
    return true;
  }

  if (
    flashcardConfig.heading === true
    && wysiwygElement.querySelector(':scope > [data-type="NodeHeading"]')
  ) {
    return true;
  }

  if (
    flashcardConfig.list === true
    && wysiwygElement.querySelector('.list, .li')
  ) {
    return true;
  }

  if (
    flashcardConfig.mark === true
    && wysiwygElement.querySelector('span[data-type~="mark"]')
  ) {
    return true;
  }

  return false;
}

function shouldUseNativeDocLoader(blockId: string): boolean {
  if (!blockId || !props.hasHiddenContent) {
    return false;
  }

  const templateID = props.content.card?.meta?.templateID;
  return typeof templateID === 'string' && templateID === 'builtin-riff-sync';
}

async function loadNativeDocContentIntoProtyle(
  protyle: siyuan.Protyle,
  blockId: string,
  seq: number,
  hostElement: HTMLDivElement,
): Promise<void> {
  try {
    const [docInfo, docContent] = await Promise.all([
      getBlockDocInfo(blockId),
      getDocContent(blockId),
    ]);

    if (
      seq !== renderSeq
      || currentRendererKind.value !== 'main-protyle'
      || !hostElement.isConnected
      || editorRef.value !== protyle
    ) {
      return;
    }

    const internalProtyle = (protyle as unknown as {
      protyle?: {
        notebookId?: string;
        path?: string;
        block?: {
          id?: string;
          rootID?: string;
          parentID?: string;
          parent2ID?: string;
        };
        wysiwyg?: {
          element?: HTMLElement;
          renderCustom?: (ial: Record<string, unknown>) => void;
        };
      };
    }).protyle;

    const wysiwygElement = internalProtyle?.wysiwyg?.element;
    const content = typeof docContent?.content === 'string' ? docContent.content : '';
    if (!wysiwygElement || !content) {
      logger.warn('[SiYuanMemo][ReviewContent] Native doc loader returned empty content', {
        blockId,
        hasWysiwygElement: Boolean(wysiwygElement),
      });
      return;
    }

    const ial = docInfo?.ial;
    if (ial && typeof ial === 'object' && typeof internalProtyle?.wysiwyg?.renderCustom === 'function') {
      internalProtyle.wysiwyg.renderCustom(ial as Record<string, unknown>);
    }

    if (internalProtyle) {
      internalProtyle.notebookId = typeof docContent?.box === 'string' ? docContent.box : internalProtyle.notebookId;
      internalProtyle.path = typeof docContent?.path === 'string' ? docContent.path : internalProtyle.path;
      if (internalProtyle.block) {
        internalProtyle.block.id = typeof docContent?.id === 'string' ? docContent.id : internalProtyle.block.id;
        internalProtyle.block.rootID = typeof docContent?.rootID === 'string' ? docContent.rootID : internalProtyle.block.rootID;
        internalProtyle.block.parentID = typeof docContent?.parentID === 'string' ? docContent.parentID : internalProtyle.block.parentID;
        internalProtyle.block.parent2ID = typeof docContent?.parent2ID === 'string' ? docContent.parent2ID : internalProtyle.block.parent2ID;
      }
    }

    wysiwygElement.innerHTML = content;
    if (typeof docContent?.type === 'string') {
      wysiwygElement.setAttribute('data-doc-type', docContent.type);
    }

    resetCssState();
    applyAnswerVisibility();
  }
  catch (error) {
    logger.error('[SiYuanMemo][ReviewContent] Native doc loader failed', {
      blockId,
      error,
    });
  }
}

function destroyMainProtyle(options?: { invalidatePending?: boolean }): void {
  if (options?.invalidatePending) {
    renderSeq += 1;
  }
  clearProtyleInitTimer();
  removeUnlockOnDoubleClick();
  protyleInitialized = false;
  resetCssState();
  try {
    editorRef.value?.destroy?.();
  } catch {}
  editorRef.value = null;
  hostRef.value?.replaceChildren();
}

function destroyAnswerProtyle(options?: { invalidatePending?: boolean }): void {
  if (options?.invalidatePending) {
    answerRenderSeq += 1;
  }
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}
  answerEditorRef.value = null;
  answerHostRef.value?.replaceChildren();
}

// 等待 DOM 准备好
async function ensureHostRef(seq: number): Promise<HTMLDivElement | null> {
  for (let i = 0; i < 20; i++) {
    if (seq !== renderSeq || currentRendererKind.value !== 'main-protyle') {
      return null;
    }
    if (hostRef.value?.isConnected) return hostRef.value;
    await nextTick();
    await sleep(10);
  }
  return null;
}

async function ensureAnswerHostRef(seq: number): Promise<HTMLDivElement | null> {
  for (let i = 0; i < 20; i++) {
    if (seq !== answerRenderSeq || props.showAnswer || !answerBlockID.value) {
      return null;
    }
    if (answerHostRef.value?.isConnected) return answerHostRef.value;
    await nextTick();
    await sleep(10);
  }
  return null;
}

/**
 * 应用答案显示/隐藏逻辑
 * 
 * 🆕 性能优化：使用 CSS 类优化器，避免重复应用
 */
function applyAnswerVisibility(): void {
  const element = hostRef.value;
  if (!element || !element.isConnected || currentRendererKind.value !== 'main-protyle') {
    return;
  }
  
  const hasHidden = props.hasHiddenContent && shouldApplyNativeHideClasses(element);
  const showAnswerButton = props.showAnswer;
  
  // 🆕 使用优化器应用 CSS 类（只在状态改变时才会真正应用）
  applyAnswerVisibilityOptimized(element, {
    hasHidden: hasHidden ?? false,
    showAnswer: showAnswerButton ?? false,
  });
}

async function renderProtyle(blockId: string): Promise<void> {
  const seq = ++renderSeq;
  clearRendererError();
  destroyMainProtyle();
  emitEditorState(createReviewEditorState('main-protyle'));

  // Reset renderer flags early to prevent stale card type leaking between cards.
  isConceptDefinitionCard.value = false;
  isConceptCard.value = false;
  isDescriptorCard.value = false;
  isQuickCard.value = false;
  const forceProtyleRenderFromMeta = forceProtyleRender.value;
  let forceQuickRenderFromMeta = forceQuickRender.value;
  const forceQuickRenderRawFromMeta = forceQuickRenderRaw.value;
  const shouldForceProtyleOnly = isNeuralRoamNonFlashcardCard.value || isTopicReadModeCard.value;
  const cacheKey = renderCacheKey.value;

  logger.debug('[SiYuanMemo][ReviewContent] renderProtyle called with blockId:', blockId);

  // 🆕 性能优化：检查卡片类型缓存
  const cachedType = getCardType(cacheKey);
  if (!shouldForceProtyleOnly && cachedType && !forceProtyleRenderFromMeta && !forceQuickRenderFromMeta) {
    logger.debug('[SiYuanMemo][ReviewContent] Using cached card type:', cachedType);
    
    // ⚠️ 验证缓存：如果缓存说是概念定义卡，但卡片没有 xiuyuanID，则忽略缓存
    if (cachedType.isConcept) {
      const card = props.content.card;
      const xiuyuanID = card?.xiuyuanID;
      if (!xiuyuanID) {
        logger.warn('[SiYuanMemo][ReviewContent] Cached as concept card but no xiuyuanID, ignoring cache');
        // 不使用缓存，继续检测
      } else {
        isConceptDefinitionCard.value = cachedType.isConcept;
        isConceptCard.value = false;
        isDescriptorCard.value = cachedType.isDescriptor;
        isQuickCard.value = cachedType.isQuick;
        return;
      }
    } else {
      isConceptDefinitionCard.value = cachedType.isConcept;
      isConceptCard.value = false;
      isDescriptorCard.value = cachedType.isDescriptor;
      isQuickCard.value = cachedType.isQuick;
      
      // 如果是特殊卡片类型，直接返回
      if (cachedType.isDescriptor || cachedType.isQuick) {
        return;
      }
    }
  }

  const renderProfile = resolvedRenderProfile.value;
  if (!shouldForceProtyleOnly && !forceProtyleRenderFromMeta && renderProfile) {
    if (renderProfile === 'concept-definition') {
      const result = { isConcept: true, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = true;
      isConceptCard.value = false;
      isDescriptorCard.value = false;
      isQuickCard.value = false;
      return;
    }

    if (renderProfile === 'concept') {
      const result = { isConcept: false, isConceptCard: true, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = false;
      isConceptCard.value = true;
      isDescriptorCard.value = false;
      isQuickCard.value = false;
      return;
    }

    if (renderProfile === 'descriptor') {
      const result = { isConcept: false, isDescriptor: true, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = false;
      isConceptCard.value = false;
      isDescriptorCard.value = true;
      isQuickCard.value = false;
      return;
    }

    if (shouldVerifyQuickDefaultProfile(renderProfile)) {
      try {
        const isQuick = await quickCardRenderService.value.isQuickCard(blockId, quickRenderCardIdArg.value);
        if (seq !== renderSeq) {
          logger.debug('[SiYuanMemo][ReviewContent] Quick-default verification cancelled, newer render pending');
          return;
        }

        const result = { isConcept: false, isDescriptor: false, isQuick };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isDescriptorCard.value = false;
        isQuickCard.value = isQuick;

        if (!isQuick) {
          logger.info('[SiYuanMemo][ReviewContent] quick-default renderProfile fallback to Protyle after verification', {
            blockId,
            cardId: quickRenderCardId.value,
            renderProfile,
            quickDetectReason: quickDetectReason.value,
            fallbackReason: 'quick-default-not-quick-card',
          });
        }
        return;
      } catch (error) {
        if (seq !== renderSeq) {
          return;
        }
        logger.warn('[SiYuanMemo][ReviewContent] quick-default verification failed, fallback to Protyle', {
          blockId,
          cardId: quickRenderCardId.value,
          renderProfile,
          error,
        });
        const result = { isConcept: false, isDescriptor: false, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isDescriptorCard.value = false;
        isQuickCard.value = false;
        return;
      }
    }

    if (renderProfile === 'quick-inline-formula') {
      const result = { isConcept: false, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      return;
    }
  }

  if (shouldForceProtyleOnly) {
    logger.debug('[SiYuanMemo][ReviewContent] Force Protyle renderer by card policy', {
      blockId,
      cardId: props.content.card?.id,
      cardType: props.content.card?.type,
      forceTopicReadMode: isTopicReadModeCard.value,
      neuralNonFlashcard: isNeuralRoamNonFlashcardCard.value,
      forceQuickRenderRaw: forceQuickRenderRawFromMeta,
    });
  } else if (forceQuickRenderFromMeta) {
    logger.debug('[SiYuanMemo][ReviewContent] Force quick render enabled by card meta', {
      blockId,
      cardId: quickRenderCardId.value,
      cardType: props.content.card?.type,
      forceQuickRender: forceQuickRenderFromMeta,
      quickDetectReason: quickDetectReason.value,
      isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
      fallbackReason: quickRenderFallbackReason.value,
    });
    try {
      const isQuick = await quickCardRenderService.value.isQuickCard(blockId, quickRenderCardIdArg.value);
      if (seq !== renderSeq) {
        logger.debug('[SiYuanMemo][ReviewContent] Quick detection cancelled, newer render pending');
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Force quick detection result', {
        blockId,
        cardId: quickRenderCardId.value,
        cardType: props.content.card?.type,
        forceQuickRender: forceQuickRenderFromMeta,
        quickDetectReason: quickDetectReason.value,
        isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
        quickDetectionResult: isQuick,
        fallbackReason: quickRenderFallbackReason.value,
      });
      if (isQuick) {
        logger.debug('[SiYuanMemo][ReviewContent] Detected quick card by forceQuickRender', {
          blockId,
          cardId: quickRenderCardId.value,
          cardType: props.content.card?.type,
          forceQuickRender: forceQuickRenderFromMeta,
          quickDetectReason: quickDetectReason.value,
          isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
          quickDetectionResult: isQuick,
          fallbackReason: quickRenderFallbackReason.value,
        });
        const result = { isConcept: false, isDescriptor: false, isQuick: true };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isQuickCard.value = true;
        isDescriptorCard.value = false;
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] forceQuickRender fallback to standard renderer after quick miss', {
        blockId,
        cardId: quickRenderCardId.value,
        cardType: props.content.card?.type,
        forceQuickRender: forceQuickRenderFromMeta,
        quickDetectReason: quickDetectReason.value,
        isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
        quickDetectionResult: isQuick,
        fallbackReason: quickRenderFallbackReason.value,
      });
      markInvalidForcedQuickRender('forced-quick-detection-returned-false', {
        quickDetectionResult: isQuick,
      });
      forceQuickRenderFromMeta = false;
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewContent] Forced quick detection failed, use standard renderer path:', {
        blockId,
        cardId: quickRenderCardId.value,
        cardType: props.content.card?.type,
        forceQuickRender: forceQuickRenderFromMeta,
        quickDetectReason: quickDetectReason.value,
        isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
        fallbackReason: quickRenderFallbackReason.value,
        error,
      });
    }
  }

  if (!shouldForceProtyleOnly && !forceQuickRenderFromMeta && !forceProtyleRenderFromMeta) {
    const bypassSemanticFallbackDetection = shouldBypassSemanticFallback(
      props.content.card,
      resolvedRenderProfile.value
    );

    if (bypassSemanticFallbackDetection) {
      logger.debug('[SiYuanMemo][ReviewContent] Bypassing semantic fallback detection for explicit item auto-render');
    } else {
    // 🆕 检测是否为概念定义卡（优先级最高）
    try {
      const card = props.content.card;
      const xiuyuanID = card?.xiuyuanID;
      const typeMarker = card?.meta?.typeMarker;
      
      logger.debug('[SiYuanMemo][ReviewContent] Checking concept definition card:', {
        hasCard: !!card,
        xiuyuanID,
        typeMarker,
        hasXiuyuanID: !!xiuyuanID,
        hasTypeMarker: !!typeMarker
      });
      
      // 支持新的双向卡片格式：concept-definition-forward/reverse 和 concept-definition-cloze-{index}-forward/reverse
      // 必须同时有 xiuyuanID 和 typeMarker
      if (xiuyuanID && typeMarker && (
        typeMarker === 'concept-definition-forward' || 
        typeMarker === 'concept-definition-reverse' ||
        typeMarker.startsWith('concept-definition-cloze-')
      )) {
        logger.debug('[SiYuanMemo][ReviewContent] Detected concept definition card (bidirectional)');
        const result = { isConcept: true, isDescriptor: false, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = true;
        isConceptCard.value = false;
        isDescriptorCard.value = false;
        isQuickCard.value = false;
        return;
      } else if (typeMarker && typeMarker.includes('concept-definition')) {
        // 如果有 concept-definition 相关的 typeMarker 但没有 xiuyuanID，说明是旧卡片
        logger.warn('[SiYuanMemo][ReviewContent] Found old concept definition card without xiuyuanID, will use normal render');
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewContent] Concept definition card detection failed:', error);
    }

    // 🆕 检测是否为概念卡（builtin-concept-simple）
    try {
      const card = props.content.card;
      const xiuyuanID = card?.xiuyuanID;
      const typeMarker = card?.meta?.typeMarker;
      
      logger.debug('[SiYuanMemo][ReviewContent] Checking concept card:', {
        hasCard: !!card,
        xiuyuanID,
        typeMarker,
        hasXiuyuanID: !!xiuyuanID,
        hasTypeMarker: !!typeMarker
      });
      
      // 概念卡的 typeMarker 是 'C'
      if (xiuyuanID && typeMarker === 'C') {
        logger.debug('[SiYuanMemo][ReviewContent] Detected concept card');
        const result = { isConcept: false, isConceptCard: true, isDescriptor: false, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = true;
        isDescriptorCard.value = false;
        isQuickCard.value = false;
        return;
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewContent] Concept card detection failed:', error);
    }

    // 🆕 检测是否为描述符卡
    try {
      const descriptorTypeMarker = props.content.card?.meta?.typeMarker;
      if (typeof descriptorTypeMarker === 'string' && descriptorTypeMarker.startsWith('concept-descriptor')) {
        logger.debug('[SiYuanMemo][ReviewContent] Detected descriptor card by typeMarker:', {
          typeMarker: descriptorTypeMarker,
        });
        const result = { isConcept: false, isDescriptor: true, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isDescriptorCard.value = true;
        isQuickCard.value = false;
        return;
      }

      const isDescriptor = await descriptorCardRenderService.value.isDescriptorCard(blockId);
      if (seq !== renderSeq) {
        logger.debug('[SiYuanMemo][ReviewContent] Descriptor detection cancelled, newer render pending');
        return;
      }
      if (isDescriptor) {
        logger.debug('[SiYuanMemo][ReviewContent] Detected descriptor card');
        const result = { isConcept: false, isDescriptor: true, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isDescriptorCard.value = true;
        isQuickCard.value = false;
        return;
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewContent] Descriptor card detection failed:', error);
    }
    }

    // 🆕 检测是否为快速卡片
    try {
      const isQuick = await quickCardRenderService.value.isQuickCard(blockId, quickRenderCardIdArg.value);
      if (seq !== renderSeq) {
        logger.debug('[SiYuanMemo][ReviewContent] Quick detection cancelled, newer render pending');
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Quick detection result', {
        blockId,
        cardId: quickRenderCardId.value,
        cardType: props.content.card?.type,
        forceQuickRender: forceQuickRenderFromMeta,
        quickDetectReason: quickDetectReason.value,
        isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
        quickDetectionResult: isQuick,
        fallbackReason: quickRenderFallbackReason.value,
      });
      if (isQuick) {
        logger.debug('[SiYuanMemo][ReviewContent] Detected quick card', {
          blockId,
          cardId: quickRenderCardId.value,
          cardType: props.content.card?.type,
          forceQuickRender: forceQuickRenderFromMeta,
          quickDetectReason: quickDetectReason.value,
          isLatexNumberedQuickHint: isLatexNumberedQuickHint.value,
          quickDetectionResult: isQuick,
          fallbackReason: quickRenderFallbackReason.value,
        });
        const result = { isConcept: false, isDescriptor: false, isQuick: true };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isQuickCard.value = true;
        isDescriptorCard.value = false;
        return;
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][ReviewContent] Quick card detection failed:', error);
    }
  } else if (forceProtyleRenderFromMeta) {
    logger.debug('[SiYuanMemo][ReviewContent] Force Protyle render enabled by card meta', {
      blockId,
      cardId: props.content.card?.id,
      cardType: props.content.card?.type,
    });
  }
  
  // 🆕 缓存普通卡片类型
  const result = { isConcept: false, isDescriptor: false, isQuick: false };
  setCardType(cacheKey, result);
  
  // Use standard Protyle rendering for non-special cards.
  isConceptDefinitionCard.value = false;
  isConceptCard.value = false;
  isQuickCard.value = false;
  isDescriptorCard.value = false;

  logger.debug('[SiYuanMemo][ReviewContent] renderProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  const hostElement = await ensureHostRef(seq);
  if (!hostElement) {
    logger.debug('[SiYuanMemo][ReviewContent] hostRef not ready after waiting');
    return;
  }

  if (seq !== renderSeq || currentRendererKind.value !== 'main-protyle' || !hostElement.isConnected) {
    logger.debug('[SiYuanMemo][ReviewContent] Render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = siyuan.Protyle;
  const Constants = siyuan.Constants;
  const cbGetAll: ProtyleAction = Constants.CB_GET_ALL;

  if (!ProtyleCtor) {
    hostElement.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', 'Load failed')}</div>`;
    return;
  }

  logger.debug('[SiYuanMemo][ReviewContent] Destroying old Protyle instance');

  // Destroy old instance
  try {
    editorRef.value?.destroy?.();
  } catch {}

  // Clear host
  hostElement.innerHTML = '';
  
  // 🆕 重置 Protyle 初始化标志和 CSS 状态
  protyleInitialized = false;
  resetCssState();
  
  // 🆕 预先应用隐藏类，避免闪烁
  hostElement.classList.remove(
    'card__block--hidemark',
    'card__block--hideli',
    'card__block--hidesb',
    'card__block--hideh'
  );
  const useNativeDocLoader = shouldUseNativeDocLoader(blockId);

  logger.debug('[SiYuanMemo][ReviewContent] Creating new Protyle with blockId:', blockId);

  // Create new instance with blockId - Protyle will auto-load content
  editorRef.value = new ProtyleCtor(props.app, hostElement, {
    blockId: useNativeDocLoader ? '' : blockId,
    action: [cbGetAll],
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: true,
      title: true,
      hideTitleOnZoom: true,
    },
    typewriterMode: false,
    after: (protyle: siyuan.Protyle) => {
      if (seq !== renderSeq || currentRendererKind.value !== 'main-protyle' || !hostElement.isConnected) {
        try {
          protyle.destroy?.();
        } catch {}
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Protyle after callback called');
      setMainProtyleReadOnly(protyle);
      if (useNativeDocLoader) {
        void loadNativeDocContentIntoProtyle(protyle, blockId, seq, hostElement);
      }
      applyAnswerVisibility();
      
      // 🆕 标记 Protyle 已初始化
      nextTick(() => {
        clearProtyleInitTimer();
        protyleInitTimer = setTimeout(() => {
          protyleInitTimer = null;
          if (
            seq !== renderSeq
            || currentRendererKind.value !== 'main-protyle'
            || !hostRef.value
            || !hostRef.value.isConnected
            || editorRef.value !== protyle
          ) {
            return;
          }
          protyleInitialized = true;
          logger.debug('[SiYuanMemo][ReviewContent] Protyle initialized, applying answer visibility');
          applyAnswerVisibility();
          
          // 🆕 使用优化的 CSS 类应用
          applyAnswerVisibility();
        }, 100);
      });
    },
  });

  logger.debug('[SiYuanMemo][ReviewContent] Protyle instance created');
}

// 渲染答案块（Xiuyuan 模板卡片）
async function renderAnswerProtyle(blockId: string): Promise<void> {
  const seq = ++answerRenderSeq;

  logger.debug('[SiYuanMemo][ReviewContent] renderAnswerProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  const answerHost = await ensureAnswerHostRef(seq);
  if (!answerHost) {
    logger.debug('[SiYuanMemo][ReviewContent] answerHostRef not ready after waiting');
    return;
  }

  if (seq !== answerRenderSeq || !answerHost.isConnected) {
    logger.debug('[SiYuanMemo][ReviewContent] Answer render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = siyuan.Protyle;
  const Constants = siyuan.Constants;
  const cbGetAll: ProtyleAction = Constants.CB_GET_ALL;

  if (!ProtyleCtor) {
    answerHost.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', 'Load failed')}</div>`;
    return;
  }

  destroyAnswerProtyle();

  logger.debug('[SiYuanMemo][ReviewContent] Creating new Answer Protyle with blockId:', blockId);

  // Create new instance with blockId
  answerEditorRef.value = new ProtyleCtor(props.app, answerHost, {
    blockId: blockId,
    action: [cbGetAll],
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: false,
      title: false,
    },
    typewriterMode: false,
    after: (protyle: siyuan.Protyle) => {
      if (seq !== answerRenderSeq || props.showAnswer || !answerHost.isConnected) {
        try {
          protyle.destroy?.();
        } catch {}
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle after callback called');
      if (typeof protyle.disable === 'function') {
        protyle.disable();
      }
    },
  });

  logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle instance created');
}

watch(
  () => renderWatchKey.value,
  () => {
    if (props.content.type !== 'protyle') return;
    const blockId = String(props.content.id || '');
    if (!blockId) return;
    logger.debug('[SiYuanMemo][ReviewContent] Watch triggered, blockId:', blockId);
    void renderProtyle(blockId);
  },
  { immediate: true },
);

watch(
  () => contentKey.value,
  (nextKey, previousKey) => {
    if (!previousKey || nextKey === previousKey) {
      return;
    }
    destroyMainProtyle({ invalidatePending: true });
    destroyAnswerProtyle({ invalidatePending: true });
  },
);

watch(
  currentRendererKind,
  (renderer) => {
    if (renderer === 'main-protyle') {
      return;
    }

    destroyMainProtyle({ invalidatePending: true });
    destroyAnswerProtyle({ invalidatePending: true });
    emitEditorState(createReviewEditorState(renderer));
  },
  { immediate: true },
);

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    logger.debug('[SiYuanMemo][ReviewContent] Watch triggered:', { hidden, show, protyleInitialized });
    
    // 🆕 只有在 Protyle 初始化后才应用 CSS 类
    if (!hostRef.value?.isConnected || currentRendererKind.value !== 'main-protyle') {
      logger.debug('[SiYuanMemo][ReviewContent] No hostRef.value');
      return;
    }
    
    logger.debug('[SiYuanMemo][ReviewContent] Applying answer visibility from watch');
    // 调用统一的答案显示/隐藏逻辑
    applyAnswerVisibility();
  },
  { immediate: false, deep: true },  // 🆕 改为 immediate: false，因为初始化时在 after 回调中处理
);

// Xiuyuan 模板卡片：监听 showAnswer 变化，渲染答案块
// 注意：showAnswer 语义已反转，showAnswer=false 表示答案已显示
watch(
  () => [props.showAnswer, answerBlockID.value],
  ([show, ansBlockID]) => {
    logger.debug('[SiYuanMemo][ReviewContent] Answer watch triggered:', { show, ansBlockID });
    
    // showAnswer=false 表示答案已显示，此时渲染答案块
    if (!show && ansBlockID) {
      logger.debug('[SiYuanMemo][ReviewContent] Rendering answer block:', ansBlockID);
      void renderAnswerProtyle(ansBlockID);
    } else {
      // showAnswer=true 表示答案未显示，销毁答案 Protyle
      destroyAnswerProtyle({ invalidatePending: true });
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  destroyMainProtyle({ invalidatePending: true });
  destroyAnswerProtyle({ invalidatePending: true });
  emitEditorState(createReviewEditorState('empty'));
  try {
    editorRef.value?.destroy?.();
  } catch {}
  editorRef.value = null;
  
  // 清理答案 Protyle
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}
  answerEditorRef.value = null;
});

const overlay = computed(() => props.overlay);
const content = computed(() => props.content);
</script>

<style scoped>
.fsrs-review-v2-content {
  position: relative;
  min-height: 240px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.fsrs-review-v2-content__inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.fsrs-review-v2-content__empty {
  padding: 48px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.fsrs-review-v2-content__empty-icon {
  font-size: 48px;
  line-height: 1;
}

.fsrs-review-v2-content__empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}

.fsrs-review-v2-content__empty-subtitle {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-review-v2-content__render-error {
  margin: 16px;
  padding: 12px;
  border: 1px solid var(--b3-theme-error);
  border-radius: 8px;
  color: var(--b3-theme-error);
  background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
  text-align: center;
}

.fsrs-review-v2-content__html {
  padding: 8px;
}

.fsrs-review-v2-content__protyle {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__xiuyuan {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__quick-card {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__descriptor-card {
  flex: 1;
  overflow: auto;
}

.fsrs-review-v2-content__image-occlusion-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.fsrs-review-v2-content__protyle-host {
  padding: 0;
}

/* Xiuyuan 模板卡片答案分隔线 */
.fsrs-review-v2-content__answer-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.fsrs-review-v2-content__answer-divider span {
  background: var(--b3-theme-background);
  padding: 0 12px;
}

/* 答案块样式 */
.fsrs-review-v2-content__answer {
  border-top: 1px dashed var(--b3-border-color);
  margin-top: 8px;
  padding-top: 8px;
}

.fsrs-review-v2-content__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fsrs-review-v2-content__overlay[data-layout='top'] {
  inset: 0 0 auto 0;
}

.fsrs-review-v2-content__overlay[data-layout='bottom'] {
  inset: auto 0 0 0;
}

.fsrs-review-v2-content__overlay[data-layout='cover'] {
  inset: 0;
}

/* 卡片切换动画 - 淡入淡出 */
.fsrs-review-transition-fade-enter-active,
.fsrs-review-transition-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fsrs-review-transition-fade-enter-from,
.fsrs-review-transition-fade-leave-to {
  opacity: 0;
}

/* 卡片切换动画 - 左滑 */
.fsrs-review-transition-slide-left-enter-active,
.fsrs-review-transition-slide-left-leave-active {
  transition: all 0.3s ease;
}

.fsrs-review-transition-slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.fsrs-review-transition-slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 卡片切换动画 - 右滑 */
.fsrs-review-transition-slide-right-enter-active,
.fsrs-review-transition-slide-right-leave-active {
  transition: all 0.3s ease;
}

.fsrs-review-transition-slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.fsrs-review-transition-slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>

