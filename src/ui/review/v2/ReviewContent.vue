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
            :key="`list-template-${specialRendererKey}`"
            :meta="content.xiuyuanMeta"
            :show-answer="!showAnswer"
            :question-block-id="content.id"
            :siyuan-api="reviewSiyuanApi"
            :display-mode="resolvedRenderProfile === 'cdf-multiline' ? 'direct' : 'semantic'"
          />
        </div>

        <!-- 🆕 Xiuyuan 多挖空卡：自定义渲染 -->
        <div v-else-if="shouldUseMultiClozeRenderer" class="fsrs-review-v2-content__multi-cloze">
          <MultiClozeCardRenderer
            :card="content.card"
            :show-answer="!showAnswer"
            :render-service="multiClozeCardRenderService"
            :i18n="i18n"
            :prepared-view-model="preparedMultiClozeViewModel"
            :prepared-identity="preparedMultiClozeIdentity"
            :refresh-epoch="specialRendererRefreshEpoch"
          />
        </div>

        <div v-else-if="shouldUseImageOcclusionRenderer" class="fsrs-review-v2-content__image-occlusion-card">
          <ImageOcclusionCardRenderer
            :key="`image-occlusion-${specialRendererKey}`"
            :block-id="content.id"
            :card="content.card"
            :show-answer="!showAnswer"
            :i18n="i18n"
            :siyuan-api="reviewSiyuanApi"
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
            :display-mode="shouldUseDirectCdfDisplay ? 'direct' : 'semantic'"
            :i18n="i18n"
            :render-service="conceptDefinitionCardRenderService"
            :prepared-view-model="preparedConceptDefinitionViewModel"
            :prepared-identity="preparedConceptDefinitionIdentity"
            :refresh-epoch="specialRendererRefreshEpoch"
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
            :render-service="conceptCardRenderService"
            :prepared-view-model="preparedConceptViewModel"
            :prepared-identity="preparedConceptIdentity"
            :refresh-epoch="specialRendererRefreshEpoch"
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
            :display-mode="shouldUseDirectCdfDisplay ? 'direct' : 'semantic'"
            :i18n="i18n"
            :prepared-view-model="preparedDescriptorViewModel"
            :prepared-identity="preparedDescriptorIdentity"
            :refresh-epoch="specialRendererRefreshEpoch"
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
            :prepared-view-model="preparedQuickViewModel"
            :prepared-identity="preparedQuickIdentity"
            :refresh-epoch="specialRendererRefreshEpoch"
            @loaded="handleQuickCardLoaded"
            @error="handleQuickCardError"
          />
        </div>

        <div v-else-if="renderError" class="fsrs-review-v2-content__render-error">
          {{ renderError }}
        </div>

        <div v-else class="fsrs-review-v2-content__protyle">
          <!-- 正面：问题块 -->
          <div
            v-show="!shouldHideQuestionHostOnReveal"
            ref="hostRef"
            class="fsrs-review-v2-content__protyle-host"
          ></div>
          
          <!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
          <!-- 注意：showAnswer 语义已反转，showAnswer=false 表示答案已显示 -->
          <div v-if="!showAnswer && shouldRenderSeparateAnswerPane" class="fsrs-review-v2-content__answer-divider">
            <span>{{ t('answerDivider', '--- Answer ---') }}</span>
          </div>
          <div
            v-if="!showAnswer && shouldRenderSeparateAnswerPane"
            ref="answerHostRef"
            class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"
          ></div>
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
import type { ReviewEditableSource, ReviewNativeSplitGuardState, ReviewUIState } from './types';
import { createReviewEditorState, type ReviewEditorState } from './reviewEditorState';
import { OVERLAY_REGISTRY } from './overlays/index';
import XiuyuanListTemplateCard from './components/XiuyuanListTemplateCard.vue';
import MultiClozeCardRenderer from '../components/MultiClozeCardRenderer.vue';
import ImageOcclusionCardRenderer from '../components/ImageOcclusionCardRenderer.vue';
import QuickCardRenderer from '../components/QuickCardRenderer.vue';
import DescriptorCardRenderer from '../components/DescriptorCardRenderer.vue';
import ConceptDefinitionCardRenderer from '../components/ConceptDefinitionCardRenderer.vue';
import ConceptCardRenderer from '../components/ConceptCardRenderer.vue';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import { 
  type XiuyuanCardMeta,
  isConceptDefinitionCard as checkIsConceptDefinitionCard, 
  isConceptCard as checkIsConceptCard,
  isDescriptorSemanticCard as checkIsDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
// 🆕 性能优化：导入 Composables
import {
  LEGACY_NATIVE_HIDE_CLASSES,
  REVIEW_HIDE_CLASSES,
  useCssClassOptimizer,
} from './composables/useCssClassOptimizer';
import { useCardTypeCache } from './composables/useCardTypeCache';
import {
  buildReviewRenderCacheKey,
  buildReviewRenderWatchKey,
  isProgressiveDerivedItemCard,
  isNeuralRoamNonFlashcard,
  isOrdinaryMultiClozeReviewCard,
  resolveReviewSpecialRendererKind,
  shouldPreferStableQuickForcePath,
  shouldBypassSemanticFallback,
  shouldVerifyQuickDefaultProfile,
} from './reviewRenderPolicy';
import { createLogger } from '@/utils/logger';
import { resolveRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';

const props = defineProps<{
  app: siyuan.App;
  plugin?: unknown;
  content: ReviewUIState['content'];
  overlay?: ReviewUIState['overlay'];
  i18n?: Record<string, string>;
  hasHiddenContent?: boolean;
  showAnswer?: boolean;
  meta?: ReviewUIState['meta'];
  renderEpoch?: number;
  renderServices?: ReviewRenderServices;
}>();
const emit = defineEmits<{
  (e: 'editor-state-change', state: ReviewEditorState): void;
}>();

const logger = createLogger('ReviewContent');

type OverlayRegistry = typeof OVERLAY_REGISTRY;
type OverlayKey = keyof OverlayRegistry;

type ProtyleAction = typeof siyuan.Constants.CB_GET_ALL;
type ReviewContentSiyuanApi = Pick<
  ReviewSiyuanPort,
  'getBlockAttrs' | 'getBlockKramdown' | 'getBlockDOM' | 'getBlockBreadcrumb'
>;
type ReviewContentReviewServiceLike = {
  getSiyuanApi?: () => ReviewContentSiyuanApi | undefined;
};
type ReviewContentPluginContextLike = {
  getReviewService?: () => ReviewContentReviewServiceLike | undefined;
};
type ReviewContentPluginLike = {
  getContext?: () => ReviewContentPluginContextLike | undefined;
};

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getReviewSiyuanApi(): ReviewContentSiyuanApi | undefined {
  const plugin = props.plugin as ReviewContentPluginLike | undefined;
  return plugin?.getContext?.()?.getReviewService?.()?.getSiyuanApi?.();
}

function normalizeDependencyBlockIds(values: Iterable<unknown>): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length > 0) {
      result.add(normalized);
    }
  }
  return Array.from(result);
}

function collectFieldMappingDependencyBlockIds(fieldMapping: unknown): string[] {
  if (!fieldMapping || typeof fieldMapping !== 'object') {
    return [];
  }

  return normalizeDependencyBlockIds(Object.values(fieldMapping as Record<string, unknown>));
}

function collectXiuyuanDependencyBlockIds(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') {
    return [];
  }

  const metaRecord = meta as Record<string, unknown>;
  const frontBlockIDs = Array.isArray(metaRecord.frontBlockIDs) ? metaRecord.frontBlockIDs : [];
  const backBlockIDs = Array.isArray(metaRecord.backBlockIDs) ? metaRecord.backBlockIDs : [];

  return normalizeDependencyBlockIds([
    ...frontBlockIDs,
    ...backBlockIDs,
    ...collectFieldMappingDependencyBlockIds(metaRecord.fieldMapping),
  ]);
}

function readDependencyBlockIdsFromViewModelCandidate(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object') {
    return [];
  }

  const dependencyBlockIds = (candidate as { dependencyBlockIds?: unknown }).dependencyBlockIds;
  if (!Array.isArray(dependencyBlockIds)) {
    return [];
  }

  return normalizeDependencyBlockIds(dependencyBlockIds);
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
  if (props.content.type === 'protyle') {
    return 'fsrs-review-transition-none';
  }
  const transition = props.meta?.transition || 'none';
  return `fsrs-review-transition-${transition}`;
});
const renderEpoch = computed(() => Math.max(0, Number(props.renderEpoch) || 0));
const specialRendererRefreshEpoch = ref(0);

const renderIdentityKey = computed(() => {
  const cardId = props.content.card?.id || '';
  return `${props.content.type}-${props.content.id}-${props.content.data}-${cardId}`;
});

// Keep the Protyle subtree mounted while card content changes. The native
// review UI keeps one editor surface alive, and this stable key prevents Vue's
// transition wrapper from tearing down the whole content area before Protyle is
// ready to show the next card.
const contentKey = computed(() => {
  if (props.content.type === 'protyle') {
    return 'protyle-stable';
  }
  return renderIdentityKey.value;
});

const specialRendererKey = computed(() => `${renderIdentityKey.value}-${renderEpoch.value}-${specialRendererRefreshEpoch.value}`);
const preparedPresentation = computed(() => props.content.prepared ?? null);

function isPreparedRenderer(kind: NonNullable<ReviewUIState['content']['prepared']>['rendererKind']): boolean {
  return preparedPresentation.value?.rendererKind === kind;
}

function preparedViewModelFor(kind: NonNullable<ReviewUIState['content']['prepared']>['rendererKind']): unknown | null {
  return isPreparedRenderer(kind) ? preparedPresentation.value?.viewModel ?? null : null;
}

function preparedIdentityFor(kind: NonNullable<ReviewUIState['content']['prepared']>['rendererKind']): string {
  return isPreparedRenderer(kind) ? preparedPresentation.value?.identityKey ?? '' : '';
}

const preparedDescriptorViewModel = computed(() => preparedViewModelFor('descriptor'));
const preparedDescriptorIdentity = computed(() => preparedIdentityFor('descriptor'));
const preparedConceptDefinitionViewModel = computed(() => preparedViewModelFor('concept-definition'));
const preparedConceptDefinitionIdentity = computed(() => preparedIdentityFor('concept-definition'));
const preparedConceptViewModel = computed(() => preparedViewModelFor('concept'));
const preparedConceptIdentity = computed(() => preparedIdentityFor('concept'));
const preparedQuickViewModel = computed(() => preparedViewModelFor('quick'));
const preparedQuickIdentity = computed(() => preparedIdentityFor('quick'));
const preparedMultiClozeViewModel = computed(() => preparedViewModelFor('multi-cloze'));
const preparedMultiClozeIdentity = computed(() => preparedIdentityFor('multi-cloze'));

const hostRef = ref<HTMLDivElement | null>(null);
const answerHostRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<siyuan.Protyle | null>(null);
const answerEditorRef = ref<siyuan.Protyle | null>(null);
const renderError = ref<string | null>(null);
const preciseDependencyBlockIds = ref<string[]>([]);
let renderSeq = 0;
let answerRenderSeq = 0;
let mainRenderRetryTimer: ReturnType<typeof setTimeout> | null = null;
let mainRenderRetryAttempts = 0;
let protyleInitialized = false;  // 🆕 跟踪 Protyle 是否已初始化
let protyleInitTimer: ReturnType<typeof setTimeout> | null = null;
let currentEditorState = createReviewEditorState();
let activeMainProtyleHost: HTMLElement | null = null;
let activeMainProtyleBlockId = '';
let pendingMainProtyle: siyuan.Protyle | null = null;
let pendingMainProtyleHost: HTMLElement | null = null;
let mainProtyleFocusCleanup: (() => void) | null = null;
let mainProtyleFocusTimer: ReturnType<typeof setTimeout> | null = null;
const invalidForcedQuickRenderVersion = ref(0);
const invalidForcedQuickRenderKeys = new Set<string>();
const MAX_MAIN_RENDER_RETRIES = 6;

function requireRenderServices(): ReviewRenderServices {
  if (!props.renderServices) {
    throw new Error('[ReviewContent] renderServices are required');
  }
  return props.renderServices;
}

const resolvedRenderServices = computed(requireRenderServices);
const reviewSiyuanApi = computed(() => getReviewSiyuanApi());

// 快速卡片渲染服务
const quickCardRenderService = computed(() => resolvedRenderServices.value.quickCardRenderService);
const isQuickCard = ref(false);

// 描述符卡渲染服务
const descriptorCardRenderService = computed(() => resolvedRenderServices.value.descriptorCardRenderService);
const isDescriptorCard = ref(false);

const conceptDefinitionCardRenderService = computed(() => resolvedRenderServices.value.conceptDefinitionCardRenderService);
const conceptCardRenderService = computed(() => resolvedRenderServices.value.conceptCardRenderService);
const multiClozeCardRenderService = computed(() => resolvedRenderServices.value.multiClozeCardRenderService);

// 概念定义卡状态
const isConceptDefinitionCard = ref(false);

// 概念卡状态
const isConceptCard = ref(false);

function resolveTypeMarker(card: ReviewUIState['content']['card']): string {
  const marker = card?.meta?.typeMarker;
  return typeof marker === 'string' ? marker : '';
}

function resolveTemplateID(card: ReviewUIState['content']['card']): string {
  const templateID = card?.meta?.templateID;
  return typeof templateID === 'string' ? templateID : '';
}

function resolveFieldMappingForLog(
  card: ReviewUIState['content']['card'],
): Record<string, unknown> | null {
  const fieldMapping = card?.meta?.fieldMapping;
  return fieldMapping && typeof fieldMapping === 'object'
    ? fieldMapping as Record<string, unknown>
    : null;
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

const rawAnswerPaneBlockId = computed(() => String(props.content.answerBlockID || ''));
const answerPaneTemplateForcesProtyle = computed(() => rawAnswerPaneBlockId.value.length > 0);
const forceProtyleRender = computed(() => (
  props.content.card?.meta?.forceProtyleRender === true
  || answerPaneTemplateForcesProtyle.value
));
const isTopicReadModeCard = computed(() => String(props.content.card?.type || '') === 'topic');
const isTopicDocumentCard = computed(() => (
  isTopicReadModeCard.value
  && (
    props.content.card?.meta?.isDocument === true
    || props.content.card?.meta?.blockType === 'd'
  )
));
const neuralIsFlashcard = computed(() => resolveNeuralIsFlashcard(props.content.card));
const isNeuralRoamNonFlashcardCard = computed(() => isNeuralRoamNonFlashcard(props.content.card));
const isProgressiveDerivedItem = computed(() => isProgressiveDerivedItemCard(props.content.card));
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
const hasConceptDefinitionSemanticSignal = computed(() => checkIsConceptDefinitionCard(props.content.card));
const hasConceptCardSemanticSignal = computed(() => checkIsConceptCard(props.content.card));
const hasDescriptorSemanticSignal = computed(() => checkIsDescriptorSemanticCard(props.content.card));
const preferStableQuickForcePath = computed(() => shouldPreferStableQuickForcePath(
  props.content.card,
  resolvedRenderProfile.value,
));
const isLatexNumberedQuickHint = computed(() => quickDetectReason.value === 'cloze-latex-numbered');
const quickIndicatorSource = computed(() => {
  const source = props.content.card?.meta?.source;
  return typeof source === 'string' ? source : '';
});
const quickIndicatorSymbolDetected = computed(() => props.content.card?.meta?.symbolDetected === true);
const quickIndicatorCardSource = computed(() => {
  const cardSource = props.content.card?.meta?.cardSource;
  return typeof cardSource === 'string' ? cardSource : '';
});
const quickIndicatorSymbolType = computed(() => {
  const symbolType = props.content.card?.meta?.symbolType;
  return typeof symbolType === 'string' ? symbolType : '';
});
const forceQuickRenderRaw = computed(() => (
  !isProgressiveDerivedItem.value
  && (
    props.content.card?.meta?.forceQuickRender === true
    || preferStableQuickForcePath.value
  )
));
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
  `${buildReviewRenderCacheKey({
    blockId: String(props.content.id || ''),
    cardId: String(props.content.card?.id || ''),
    cardType: String(props.content.card?.type || ''),
    typeMarker: resolveTypeMarker(props.content.card),
    neuralIsFlashcard: neuralIsFlashcard.value,
    forceProtyleRender: forceProtyleRender.value,
    forceQuickRender: forceQuickRender.value,
    source: quickIndicatorSource.value,
    symbolDetected: quickIndicatorSymbolDetected.value,
    cardSource: quickIndicatorCardSource.value,
    symbolType: quickIndicatorSymbolType.value,
    renderProfile: resolvedRenderProfile.value || '',
    quickDetectReason: quickDetectReason.value,
  })}::${renderEpoch.value}`,
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
    source: quickIndicatorSource.value,
    symbolDetected: quickIndicatorSymbolDetected.value,
    cardSource: quickIndicatorCardSource.value,
    symbolType: quickIndicatorSymbolType.value,
    renderProfile: resolvedRenderProfile.value || '',
    quickDetectReason: quickDetectReason.value,
  }),
);

const currentCachedCardType = computed(() => {
  isConceptDefinitionCard.value;
  isConceptCard.value;
  isDescriptorCard.value;
  isQuickCard.value;
  invalidForcedQuickRenderVersion.value;
  return getCardType(renderCacheKey.value) as (ReturnType<typeof getCardType> & Record<string, unknown>) | null;
});

const detectedConceptDefinitionForCurrentContent = computed(() => (
  hasConceptDefinitionSemanticSignal.value
  || (
    isConceptDefinitionCard.value
    && currentCachedCardType.value?.isConcept === true
  )
));
const detectedConceptForCurrentContent = computed(() => (
  hasConceptCardSemanticSignal.value
  || (
    isConceptCard.value
    && currentCachedCardType.value?.isConceptCard === true
  )
));
const detectedDescriptorForCurrentContent = computed(() => (
  hasDescriptorSemanticSignal.value
  || (
    isDescriptorCard.value
    && currentCachedCardType.value?.isDescriptor === true
  )
));
const detectedQuickForCurrentContent = computed(() => (
  preferStableQuickForcePath.value
  || (
    isQuickCard.value
    && currentCachedCardType.value?.isQuick === true
  )
));

const specialRendererKind = computed(() => resolveReviewSpecialRendererKind({
  card: props.content.card,
  contentType: props.content.type,
  renderProfile: resolvedRenderProfile.value,
  forceProtyleRender: forceProtyleRender.value,
  forceQuickRender: forceQuickRender.value,
  isTopicReadMode: isTopicReadModeCard.value,
  isNeuralRoamNonFlashcard: isNeuralRoamNonFlashcardCard.value,
  isConceptDefinitionCard: detectedConceptDefinitionForCurrentContent.value,
  isConceptCard: detectedConceptForCurrentContent.value,
  isDescriptorCard: detectedDescriptorForCurrentContent.value,
  isQuickCard: detectedQuickForCurrentContent.value,
}));

// Multi-cloze review is owned by the dedicated renderer so each generated card
// can focus exactly one cloze instead of hiding all source marks together.
const shouldUseMultiClozeRenderer = computed(() => (
  isPreparedRenderer('multi-cloze') || specialRendererKind.value === 'multi-cloze'
));

const shouldUseImageOcclusionRenderer = computed(() => specialRendererKind.value === 'image-occlusion');

const shouldUseConceptDefinitionRenderer = computed(() => {
  if (isPreparedRenderer('concept-definition')) return true;
  const result = specialRendererKind.value === 'concept-definition';
  if (result) {
    const card = props.content.card;
    logger.debug('[SiYuanMemo][ReviewContent] shouldUseConceptDefinitionRenderer:', {
      contentType: props.content.type,
      hasCard: !!card,
      cardId: card?.id,
      xiuyuanID: card?.xiuyuanID,
      metaXiuyuanID: card?.meta?.xiuyuanID,
      templateID: card?.meta?.templateID,
      typeMarker: card?.meta?.typeMarker,
      fieldMapping: resolveFieldMappingForLog(card),
      result,
    });
  }
  return result;
});

const shouldUseConceptCardRenderer = computed(() => {
  if (isPreparedRenderer('concept')) return true;
  const result = specialRendererKind.value === 'concept';
  if (result) {
    logger.debug('[SiYuanMemo][ReviewContent] shouldUseConceptCardRenderer:', {
      contentType: props.content.type,
      result,
    });
  }
  return result;
});

const shouldUseDescriptorCardRenderer = computed(() => (
  isPreparedRenderer('descriptor') || specialRendererKind.value === 'descriptor'
));

const shouldUseQuickCardRenderer = computed(() => (
  isPreparedRenderer('quick') || specialRendererKind.value === 'quick'
));

const shouldExposeOrdinaryMultiClozeEditorState = computed(() => (
  props.content.type === 'protyle'
  && shouldUseMultiClozeRenderer.value
  && isOrdinaryMultiClozeReviewCard(props.content.card, resolvedRenderProfile.value)
));

const shouldUseDirectCdfDisplay = computed(() => (
  resolvedRenderProfile.value === 'concept-definition'
  || resolvedRenderProfile.value === 'descriptor'
  || resolvedRenderProfile.value === 'cdf-multiline'
  || hasConceptDefinitionSemanticSignal.value
  || hasDescriptorSemanticSignal.value
));

function hasSemanticTemplateSignal(): boolean {
  return resolvedRenderProfile.value === 'concept-definition'
    || resolvedRenderProfile.value === 'concept'
    || resolvedRenderProfile.value === 'descriptor'
    || hasConceptDefinitionSemanticSignal.value
    || hasConceptCardSemanticSignal.value
    || hasDescriptorSemanticSignal.value;
}

function logSemanticFallbackToMainProtyle(blockId: string): void {
  if (
    props.content.type !== 'protyle'
    || forceProtyleRender.value
    || isTopicReadModeCard.value
    || isNeuralRoamNonFlashcardCard.value
    || !hasSemanticTemplateSignal()
  ) {
    return;
  }

  const card = props.content.card;
  logger.warn('[SiYuanMemo][ReviewContent] Semantic card fell back to main Protyle', {
    cardId: card?.id,
    templateID: resolveTemplateID(card),
    renderProfile: resolvedRenderProfile.value || '',
    typeMarker: resolveTypeMarker(card),
    fieldMapping: resolveFieldMappingForLog(card),
    contentId: String(props.content.id || ''),
    blockId,
  });
}

const currentRendererKind = computed<ReviewEditorState['renderer']>(() => {
  if (props.content.type === 'empty') {
    return 'empty';
  }
  if (props.content.type === 'html') {
    return 'html';
  }
  if (shouldExposeOrdinaryMultiClozeEditorState.value) {
    return 'multi-cloze';
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

function resolveListTemplateCurrentChildBlockId(meta: unknown): string {
  if (!meta || typeof meta !== 'object') {
    return '';
  }

  const listMeta = meta as XiuyuanCardMeta;
  const currentIndex = typeof listMeta.currentIndex === 'number' ? listMeta.currentIndex : -1;
  const child = Array.isArray(listMeta.allChildren) && currentIndex >= 0
    ? listMeta.allChildren[currentIndex]
    : null;

  return typeof child?.id === 'string' ? child.id.trim() : '';
}

function buildEditableSource(
  blockId: string,
  title: string,
  rendererKind: ReviewEditableSource['rendererKind'],
): ReviewEditableSource | null {
  const trimmedBlockId = String(blockId || '').trim();
  if (!trimmedBlockId) {
    return null;
  }

  return {
    blockId: trimmedBlockId,
    title,
    sourceKind: 'block-markdown',
    rendererKind,
  };
}

const editableSource = computed<ReviewEditableSource | null>(() => {
  if (props.content.type !== 'protyle') {
    return null;
  }

  if (props.content.isXiuyuanListTemplate && props.content.xiuyuanMeta) {
    return buildEditableSource(
      resolveListTemplateCurrentChildBlockId(props.content.xiuyuanMeta),
      t('editCurrentListItem', '编辑当前列表项'),
      'list-template',
    );
  }

  if (shouldUseImageOcclusionRenderer.value) {
    return null;
  }

  if (shouldUseMultiClozeRenderer.value) {
    return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'multi-cloze');
  }

  if (shouldUseConceptDefinitionRenderer.value) {
    return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'concept-definition');
  }

  if (shouldUseConceptCardRenderer.value) {
    return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'concept');
  }

  if (shouldUseDescriptorCardRenderer.value) {
    return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'descriptor');
  }

  if (shouldUseQuickCardRenderer.value) {
    return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'quick');
  }

  return buildEditableSource(props.content.id, t('editCurrentContent', '编辑当前内容'), 'main-protyle');
});

const nativeSplitGuardState = computed<ReviewNativeSplitGuardState>(() => {
  if (props.content.type === 'empty') {
    return {
      rendererKind: 'empty',
      blockNativeTabSplit: false,
    };
  }

  if (props.content.type === 'html') {
    return {
      rendererKind: 'html',
      blockNativeTabSplit: false,
    };
  }

  if (props.content.type !== 'protyle') {
    return {
      rendererKind: 'unsupported',
      blockNativeTabSplit: false,
    };
  }

  if (props.content.isXiuyuanListTemplate && props.content.xiuyuanMeta) {
    return {
      rendererKind: 'list-template',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseImageOcclusionRenderer.value) {
    return {
      rendererKind: 'image-occlusion',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseMultiClozeRenderer.value) {
    return {
      rendererKind: 'multi-cloze',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseConceptDefinitionRenderer.value) {
    return {
      rendererKind: 'concept-definition',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseConceptCardRenderer.value) {
    return {
      rendererKind: 'concept',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseDescriptorCardRenderer.value) {
    return {
      rendererKind: 'descriptor',
      blockNativeTabSplit: true,
    };
  }

  if (shouldUseQuickCardRenderer.value) {
    return {
      rendererKind: 'quick',
      blockNativeTabSplit: true,
    };
  }

  return {
    rendererKind: 'main-protyle',
    blockNativeTabSplit: false,
  };
});

const fallbackDependencyBlockIds = computed(() => normalizeDependencyBlockIds([
  props.content.id,
  props.content.answerBlockID,
  props.content.card?.blockId,
  ...collectXiuyuanDependencyBlockIds(props.content.card?.meta),
  ...collectXiuyuanDependencyBlockIds(props.content.xiuyuanMeta),
]));

const currentDependencyBlockIds = computed(() => (
  preciseDependencyBlockIds.value.length > 0
    ? preciseDependencyBlockIds.value
    : fallbackDependencyBlockIds.value
));

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
  // Main Protyle stays editable by default; unlock cleanup remains a no-op
  // so destroy paths can keep calling the same helper without branching.
}

function clearMainProtyleFocusTimer(): void {
  if (mainProtyleFocusTimer !== null) {
    clearTimeout(mainProtyleFocusTimer);
    mainProtyleFocusTimer = null;
  }
}

function removeMainProtyleFocusTracking(): void {
  clearMainProtyleFocusTimer();
  mainProtyleFocusCleanup?.();
  mainProtyleFocusCleanup = null;
}

function clearProtyleInitTimer(): void {
  if (protyleInitTimer !== null) {
    clearTimeout(protyleInitTimer);
    protyleInitTimer = null;
  }
}

function clearMainRenderRetryTimer(): void {
  if (mainRenderRetryTimer !== null) {
    clearTimeout(mainRenderRetryTimer);
    mainRenderRetryTimer = null;
  }
}

function resetMainRenderRetryState(): void {
  clearMainRenderRetryTimer();
  mainRenderRetryAttempts = 0;
}

function scheduleMainRenderRetry(blockId: string): void {
  if (!blockId || currentRendererKind.value !== 'main-protyle') {
    return;
  }
  if (mainRenderRetryAttempts >= MAX_MAIN_RENDER_RETRIES) {
    logger.warn('[SiYuanMemo][ReviewContent] Main Protyle host did not become ready after retry budget', {
      blockId,
      attempts: mainRenderRetryAttempts,
    });
    return;
  }
  if (mainRenderRetryTimer !== null) {
    return;
  }

  mainRenderRetryAttempts += 1;
  const retryAttempt = mainRenderRetryAttempts;
  mainRenderRetryTimer = setTimeout(() => {
    mainRenderRetryTimer = null;
    if (
      currentRendererKind.value !== 'main-protyle'
      || (editorRef.value && activeMainProtyleBlockId === blockId)
    ) {
      return;
    }
    logger.debug('[SiYuanMemo][ReviewContent] Retrying main Protyle render after host miss', {
      blockId,
      retryAttempt,
    });
    void renderProtyle(blockId);
  }, 50);
}

function emitMainProtyleEditingState(isEditing: boolean): void {
  emitEditorState(createReviewEditorState('main-protyle', {
    supportsNativeEdit: true,
    isEditing,
  }));
}

function isActiveElementInsideMainProtyle(wysiwygElement: HTMLElement): boolean {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement
    && (activeElement === wysiwygElement || wysiwygElement.contains(activeElement));
}

function attachMainProtyleFocusTracking(protyle: siyuan.Protyle): void {
  const wysiwygElement = protyle.protyle?.wysiwyg?.element as HTMLElement | undefined;
  removeMainProtyleFocusTracking();

  if (!(wysiwygElement instanceof HTMLElement)) {
    emitMainProtyleEditingState(false);
    return;
  }

  const syncEditingState = () => {
    emitMainProtyleEditingState(isActiveElementInsideMainProtyle(wysiwygElement));
  };

  const scheduleEditingStateSync = () => {
    clearMainProtyleFocusTimer();
    mainProtyleFocusTimer = setTimeout(() => {
      mainProtyleFocusTimer = null;
      syncEditingState();
    }, 0);
  };

  const handleFocusIn = () => {
    syncEditingState();
  };

  const handleFocusOut = () => {
    scheduleEditingStateSync();
  };

  wysiwygElement.addEventListener('focusin', handleFocusIn);
  wysiwygElement.addEventListener('focusout', handleFocusOut);
  mainProtyleFocusCleanup = () => {
    wysiwygElement.removeEventListener('focusin', handleFocusIn);
    wysiwygElement.removeEventListener('focusout', handleFocusOut);
  };

  syncEditingState();
}

function focusPrimaryReviewActionButton(): boolean {
  const reviewRoot = hostRef.value?.closest('.fsrs-review-v2') as HTMLElement | null;
  const selectors = [
    '.card__action-main--reveal:not([disabled])',
    '.card__action-main[data-type="3"]:not([disabled])',
    '.card__action-main:not([disabled])',
  ];
  const actionButton = selectors
    .map((selector) => reviewRoot?.querySelector(selector))
    .find((element): element is HTMLButtonElement => element instanceof HTMLButtonElement) || null;
  actionButton?.focus();
  collapseSelectionToElement(actionButton);
  return Boolean(actionButton);
}

function collapseSelectionToElement(element: HTMLElement | null): void {
  const selection = window.getSelection?.();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  if (!element) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection.addRange(range);
}

function clearMainProtyleSelectedBlocks(wysiwygElement: HTMLElement | undefined): void {
  wysiwygElement?.querySelectorAll('.protyle-wysiwyg--select').forEach((element) => {
    element.classList.remove('protyle-wysiwyg--select');
  });
}

function blurMainProtyleSurface(): boolean {
  const wysiwygElement = editorRef.value?.protyle?.wysiwyg?.element as HTMLElement | undefined;
  const activeElement = document.activeElement;
  let blurred = false;

  if (activeElement instanceof HTMLElement && wysiwygElement && (
    activeElement === wysiwygElement || wysiwygElement.contains(activeElement)
  )) {
    activeElement.blur();
    blurred = true;
  } else if (wysiwygElement instanceof HTMLElement) {
    wysiwygElement.blur();
    blurred = true;
  }

  clearMainProtyleSelectedBlocks(wysiwygElement);
  window.getSelection?.()?.removeAllRanges();
  return blurred;
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

  const didBlur = blurMainProtyleSurface();
  emitMainProtyleEditingState(false);
  const focusedAction = focusPrimaryReviewActionButton();
  return didBlur || focusedAction;
}

function getEditableSource(): ReviewEditableSource | null {
  return editableSource.value;
}

function getNativeSplitGuardState(): ReviewNativeSplitGuardState {
  return nativeSplitGuardState.value;
}

function getDependencyBlockIds(): string[] {
  return [...currentDependencyBlockIds.value];
}

async function refreshVisibleContent(reason?: string): Promise<boolean> {
  const renderer = currentRendererKind.value;
  logger.debug('[SiYuanMemo][ReviewContent] Soft-refresh visible content', {
    reason,
    renderer,
    blockId: props.content.id,
    cardId: props.content.card?.id,
  });

  if (renderer === 'main-protyle') {
    const blockId = String(props.content.id || '').trim();
    let refreshed = false;
    if (
      blockId
      && activeMainProtyleBlockId === blockId
      && typeof editorRef.value?.reload === 'function'
    ) {
      editorRef.value.reload(false);
      refreshed = true;
    }

    if (
      props.showAnswer === false
      && shouldRenderSeparateAnswerPane.value
      && typeof answerEditorRef.value?.reload === 'function'
    ) {
      answerEditorRef.value.reload(false);
      refreshed = true;
    }

    if (refreshed) {
      await nextTick();
      applyAnswerVisibility();
      return true;
    }

    if (!blockId) {
      return false;
    }
    await renderProtyle(blockId);
    return true;
  }

  if (renderer === 'special') {
    specialRendererRefreshEpoch.value += 1;
    await nextTick();
    return true;
  }

  return false;
}

defineExpose({
  exitEditorByEscape,
  getEditableSource,
  getNativeSplitGuardState,
  getDependencyBlockIds,
  refreshVisibleContent,
});

// 概念定义卡加载成功
function clearRendererError(): void {
  renderError.value = null;
}

function handleRendererError(rendererName: string, error: Error): void {
  logger.error(`[SiYuanMemo][ReviewContent] ${rendererName} render failed:`, error);
  renderError.value = t('cardRenderFailed', 'Failed to render this card');
}

function updatePreciseDependencyBlockIds(result: unknown): void {
  const directDependencyBlockIds = readDependencyBlockIdsFromViewModelCandidate(result);
  const nestedDependencyBlockIds = directDependencyBlockIds.length > 0
    ? []
    : readDependencyBlockIdsFromViewModelCandidate((result as { viewModel?: unknown } | null | undefined)?.viewModel);
  const nextDependencyBlockIds = normalizeDependencyBlockIds([
    ...fallbackDependencyBlockIds.value,
    ...directDependencyBlockIds,
    ...nestedDependencyBlockIds,
  ]);

  if (nextDependencyBlockIds.length === 0) {
    return;
  }

  preciseDependencyBlockIds.value = nextDependencyBlockIds;
}

function handleConceptDefinitionCardLoaded(result: unknown) {
  clearRendererError();
  updatePreciseDependencyBlockIds(result);
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
  updatePreciseDependencyBlockIds(result);
  logger.debug('[SiYuanMemo][ReviewContent] Concept card loaded:', result);
}

// 概念卡加载失败，显示错误提示
function handleConceptCardError(error: Error) {
  handleRendererError('Concept', error);
}

// 描述符卡加载成功
function handleDescriptorCardLoaded(result: unknown) {
  clearRendererError();
  updatePreciseDependencyBlockIds(result);
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
const answerBlockID = rawAnswerPaneBlockId;
const primaryBlockID = computed(() => String(props.content.id || ''));
const isNativeInlineRevealCard = computed(() => (
  props.hasHiddenContent === true
  && props.content.card?.meta?.templateID === 'builtin-riff-sync'
));
const resolvedAnswerBlockID = computed(() => {
  if (answerBlockID.value) {
    return answerBlockID.value;
  }

  const templateID = props.content.card?.meta?.templateID;
  if (props.hasHiddenContent && templateID === 'builtin-riff-sync') {
    return primaryBlockID.value;
  }

  return '';
});
const shouldRenderSeparateAnswerPane = computed(() => (
  !isTopicDocumentCard.value
  && !isNativeInlineRevealCard.value
  && resolvedAnswerBlockID.value.length > 0
));
const shouldHideQuestionHostOnReveal = computed(() => (
  props.showAnswer === false
  && shouldRenderSeparateAnswerPane.value
  && resolvedAnswerBlockID.value === primaryBlockID.value
));
const shouldUseCompactBlockRender = computed(() => (
  !isTopicDocumentCard.value
  && resolvedAnswerBlockID.value.length > 0
));
const shouldLogBidirectionalTemplateDiagnostic = computed(() => (
  false
));

function buildMainProtyleRenderOptions() {
  if (isTopicDocumentCard.value) {
    return {
      background: false,
      gutter: true,
      breadcrumbDocName: true,
      title: true,
      hideTitleOnZoom: true,
    };
  }

  if (shouldUseCompactBlockRender.value) {
    // Template/native answer-pane cards render as block content, not as doc views.
    return {
      background: false,
      gutter: true,
      breadcrumbDocName: false,
      title: false,
      hideTitleOnZoom: false,
    };
  }

  return {
    background: false,
    gutter: true,
    breadcrumbDocName: true,
    title: true,
    hideTitleOnZoom: true,
  };
}

function buildMainProtyleActions(cbGetAll: ProtyleAction): ProtyleAction[] {
  if (isTopicDocumentCard.value) {
    return [];
  }

  return [cbGetAll];
}

function logBidirectionalTemplateDiagnostic(stage: string, details?: Record<string, unknown>): void {
  void stage;
  void details;
  void shouldLogBidirectionalTemplateDiagnostic.value;
}

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

function hasMultipleDirectBlockChildren(element: Element): boolean {
  return element.querySelectorAll(':scope > [data-node-id]').length > 1;
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
    && Array.from(wysiwygElement.querySelectorAll(':scope > .sb[custom-riff-decks]'))
      .some(hasMultipleDirectBlockChildren)
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

function destroyPendingMainProtyle(): void {
  const pendingEditor = pendingMainProtyle;
  const pendingHost = pendingMainProtyleHost;
  pendingMainProtyle = null;
  pendingMainProtyleHost = null;

  try {
    pendingEditor?.destroy?.();
  } catch {}
  pendingHost?.remove();
}

function createMainProtyleHost(container: HTMLElement, blockId: string, pending: boolean): HTMLElement {
  const mount = document.createElement('div');
  mount.className = 'fsrs-review-v2-content__protyle-instance';
  mount.dataset.blockId = blockId;

  if (pending) {
    mount.dataset.pending = 'true';
    mount.setAttribute('aria-hidden', 'true');
  }

  container.appendChild(mount);
  return mount;
}

function prepareMainProtyleHost(container: HTMLElement, blockId: string): HTMLElement {
  if (!editorRef.value && !activeMainProtyleHost) {
    container.replaceChildren();
    return createMainProtyleHost(container, blockId, false);
  }

  return createMainProtyleHost(container, blockId, true);
}

function promoteMainProtyle(protyle: siyuan.Protyle, mount: HTMLElement, blockId: string): void {
  const previousEditor = editorRef.value;
  const previousHost = activeMainProtyleHost;

  if (pendingMainProtyle === protyle) {
    pendingMainProtyle = null;
  }
  if (pendingMainProtyleHost === mount) {
    pendingMainProtyleHost = null;
  }

  editorRef.value = protyle;
  activeMainProtyleHost = mount;
  activeMainProtyleBlockId = blockId;
  mount.removeAttribute('aria-hidden');
  delete mount.dataset.pending;

  if (previousEditor && previousEditor !== protyle) {
    try {
      previousEditor.destroy?.();
    } catch {}
  }

  if (previousHost && previousHost !== mount) {
    previousHost.remove();
  }
}

function destroyMainProtyle(options?: { invalidatePending?: boolean }): void {
  if (options?.invalidatePending) {
    renderSeq += 1;
  }
  destroyPendingMainProtyle();
  clearMainRenderRetryTimer();
  clearProtyleInitTimer();
  removeMainProtyleFocusTracking();
  removeUnlockOnDoubleClick();
  protyleInitialized = false;
  resetCssState();
  try {
    editorRef.value?.destroy?.();
  } catch {}
  editorRef.value = null;
  activeMainProtyleHost = null;
  activeMainProtyleBlockId = '';
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
    if (seq !== answerRenderSeq || props.showAnswer || !resolvedAnswerBlockID.value) {
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
  destroyPendingMainProtyle();
  clearMainRenderRetryTimer();
  clearProtyleInitTimer();
  emitEditorState(createReviewEditorState('main-protyle'));
  logBidirectionalTemplateDiagnostic('render-start', {
    blockId,
    seq,
  });

  if (editorRef.value && activeMainProtyleBlockId === blockId) {
    applyAnswerVisibility();
    logBidirectionalTemplateDiagnostic('main-protyle-reused', {
      blockId,
      seq,
    });
    return;
  }

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
        logBidirectionalTemplateDiagnostic('cached-special-renderer-return', {
          blockId,
          cachedType,
        });
        return;
      }
    }
  }

  const renderProfile = resolvedRenderProfile.value;
  const effectiveRenderProfile = isProgressiveDerivedItem.value
    && (renderProfile === 'quick-default' || renderProfile === 'quick-inline-formula')
    ? null
    : renderProfile;
  if (!shouldForceProtyleOnly && !forceProtyleRenderFromMeta && effectiveRenderProfile) {
    logBidirectionalTemplateDiagnostic('render-profile-branch', {
      blockId,
      renderProfile: effectiveRenderProfile,
    });
    if (effectiveRenderProfile === 'concept-definition') {
      const result = { isConcept: true, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = true;
      isConceptCard.value = false;
      isDescriptorCard.value = false;
      isQuickCard.value = false;
      logBidirectionalTemplateDiagnostic('render-profile-returned-concept-definition', {
        blockId,
      });
      return;
    }

    if (effectiveRenderProfile === 'concept') {
      const result = { isConcept: false, isConceptCard: true, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = false;
      isConceptCard.value = true;
      isDescriptorCard.value = false;
      isQuickCard.value = false;
      logBidirectionalTemplateDiagnostic('render-profile-returned-concept', {
        blockId,
      });
      return;
    }

    if (effectiveRenderProfile === 'descriptor') {
      const result = { isConcept: false, isDescriptor: true, isQuick: false };
      setCardType(cacheKey, result);
      isConceptDefinitionCard.value = false;
      isConceptCard.value = false;
      isDescriptorCard.value = true;
      isQuickCard.value = false;
      logBidirectionalTemplateDiagnostic('render-profile-returned-descriptor', {
        blockId,
      });
      return;
    }

    if (shouldVerifyQuickDefaultProfile(effectiveRenderProfile)) {
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
            renderProfile: effectiveRenderProfile,
            quickDetectReason: quickDetectReason.value,
            fallbackReason: 'quick-default-not-quick-card',
          });
        }
        logBidirectionalTemplateDiagnostic('render-profile-returned-quick-default', {
          blockId,
          quickDetectionResult: isQuick,
        });
        return;
      } catch (error) {
        if (seq !== renderSeq) {
          return;
        }
        logger.warn('[SiYuanMemo][ReviewContent] quick-default verification failed, fallback to Protyle', {
          blockId,
          cardId: quickRenderCardId.value,
          renderProfile: effectiveRenderProfile,
          error,
        });
        const result = { isConcept: false, isDescriptor: false, isQuick: false };
        setCardType(cacheKey, result);
        isConceptDefinitionCard.value = false;
        isConceptCard.value = false;
        isDescriptorCard.value = false;
        isQuickCard.value = false;
        logBidirectionalTemplateDiagnostic('render-profile-returned-quick-default-error', {
          blockId,
          error,
        });
        return;
      }
    }

    if (effectiveRenderProfile === 'quick-inline-formula') {
      const result = { isConcept: false, isDescriptor: false, isQuick: false };
      setCardType(cacheKey, result);
      logBidirectionalTemplateDiagnostic('render-profile-returned-quick-inline-formula', {
        blockId,
      });
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

  if (!shouldForceProtyleOnly && !forceQuickRenderFromMeta && !forceProtyleRenderFromMeta && !isProgressiveDerivedItem.value) {
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
        const conceptDefinitionSignal = hasConceptDefinitionSemanticSignal.value;

        logger.debug('[SiYuanMemo][ReviewContent] Checking concept definition card:', {
          hasCard: !!card,
          cardId: card?.id,
          templateID: resolveTemplateID(card),
          typeMarker: resolveTypeMarker(card),
          fieldMapping: resolveFieldMappingForLog(card),
          semanticSignal: conceptDefinitionSignal,
        });

        if (conceptDefinitionSignal) {
          logger.debug('[SiYuanMemo][ReviewContent] Detected concept definition card via semantic signals');
          const result = { isConcept: true, isDescriptor: false, isQuick: false };
          setCardType(cacheKey, result);
          isConceptDefinitionCard.value = true;
          isConceptCard.value = false;
          isDescriptorCard.value = false;
          isQuickCard.value = false;
          return;
        }
      } catch (error) {
        logger.warn('[SiYuanMemo][ReviewContent] Concept definition card detection failed:', error);
      }

      // 🆕 检测是否为概念卡（builtin-concept-simple）
      try {
        const card = props.content.card;
        const conceptSignal = hasConceptCardSemanticSignal.value;

        logger.debug('[SiYuanMemo][ReviewContent] Checking concept card:', {
          hasCard: !!card,
          cardId: card?.id,
          templateID: resolveTemplateID(card),
          typeMarker: resolveTypeMarker(card),
          semanticSignal: conceptSignal,
        });

        if (conceptSignal) {
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
        const card = props.content.card;
        const descriptorSignal = hasDescriptorSemanticSignal.value;
        logger.debug('[SiYuanMemo][ReviewContent] Checking descriptor card:', {
          hasCard: !!card,
          cardId: card?.id,
          templateID: resolveTemplateID(card),
          typeMarker: resolveTypeMarker(card),
          fieldMapping: resolveFieldMappingForLog(card),
          semanticSignal: descriptorSignal,
        });

        if (descriptorSignal) {
          logger.debug('[SiYuanMemo][ReviewContent] Detected descriptor card via semantic signals');
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
  } else if (isProgressiveDerivedItem.value) {
    logger.debug('[SiYuanMemo][ReviewContent] Skipping quick detection for progressive derived item', {
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
  logSemanticFallbackToMainProtyle(blockId);

  logger.debug('[SiYuanMemo][ReviewContent] renderProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  const hostElement = await ensureHostRef(seq);
  if (!hostElement) {
    logger.debug('[SiYuanMemo][ReviewContent] hostRef not ready after waiting');
    logBidirectionalTemplateDiagnostic('host-not-ready', {
      blockId,
      seq,
      retryAttempts: mainRenderRetryAttempts,
      hasHostRef: Boolean(hostRef.value),
      hostConnected: Boolean(hostRef.value?.isConnected),
    });
    scheduleMainRenderRetry(blockId);
    return;
  }

  if (seq !== renderSeq || currentRendererKind.value !== 'main-protyle' || !hostElement.isConnected) {
    logger.debug('[SiYuanMemo][ReviewContent] Render cancelled, newer render pending');
    logBidirectionalTemplateDiagnostic('render-cancelled-before-create', {
      blockId,
      seq,
      currentRenderer: currentRendererKind.value,
      hostConnected: hostElement.isConnected,
    });
    scheduleMainRenderRetry(blockId);
    return;
  }

  resetMainRenderRetryState();

  const ProtyleCtor = siyuan.Protyle;
  const Constants = siyuan.Constants;
  const cbGetAll: ProtyleAction = Constants.CB_GET_ALL;

  if (!ProtyleCtor) {
    hostElement.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', 'Load failed')}</div>`;
    return;
  }

  const nextHostElement = prepareMainProtyleHost(hostElement, blockId);
  
  // 🆕 重置 Protyle 初始化标志和 CSS 状态
  protyleInitialized = false;
  
  // 🆕 预先应用隐藏类，避免闪烁
  hostElement.classList.remove(...REVIEW_HIDE_CLASSES, ...LEGACY_NATIVE_HIDE_CLASSES);
  logger.debug('[SiYuanMemo][ReviewContent] Creating new Protyle with blockId:', blockId);
  logBidirectionalTemplateDiagnostic('creating-main-protyle', {
    blockId,
    seq,
    hostChildCount: hostElement.childElementCount,
    hostConnected: hostElement.isConnected,
    mountPending: nextHostElement.dataset.pending === 'true',
    actions: buildMainProtyleActions(cbGetAll),
    renderOptions: buildMainProtyleRenderOptions(),
  });

  // Create new instance with blockId - Protyle will auto-load content
  const nextEditor = new ProtyleCtor(props.app, nextHostElement, {
    blockId,
    action: buildMainProtyleActions(cbGetAll),
    render: buildMainProtyleRenderOptions(),
    typewriterMode: false,
    after: (protyle: siyuan.Protyle) => {
      if (
        seq !== renderSeq
        || currentRendererKind.value !== 'main-protyle'
        || !hostElement.isConnected
        || !nextHostElement.isConnected
      ) {
        if (pendingMainProtyle === protyle) {
          pendingMainProtyle = null;
        }
        if (pendingMainProtyleHost === nextHostElement) {
          pendingMainProtyleHost = null;
        }
        try {
          protyle.destroy?.();
        } catch {}
        nextHostElement.remove();
        logBidirectionalTemplateDiagnostic('main-after-cancelled', {
          blockId,
          seq,
          hostConnected: hostElement.isConnected,
          mountConnected: nextHostElement.isConnected,
          currentRenderer: currentRendererKind.value,
        });
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Protyle after callback called');
      promoteMainProtyle(protyle, nextHostElement, blockId);
      resetCssState();
      attachMainProtyleFocusTracking(protyle);
      applyAnswerVisibility();
      logBidirectionalTemplateDiagnostic('main-after', {
        blockId,
        seq,
        hasWysiwyg: Boolean(nextHostElement.querySelector('.protyle-wysiwyg')),
        hostChildCount: hostElement.childElementCount,
        hostHtmlPreview: nextHostElement.innerHTML.slice(0, 240),
      });
      
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
          logBidirectionalTemplateDiagnostic('main-initialized', {
            blockId,
            seq,
            hasWysiwyg: Boolean(hostRef.value?.querySelector('.protyle-wysiwyg')),
            hostChildCount: hostRef.value?.childElementCount ?? 0,
            hostHtmlPreview: hostRef.value?.innerHTML.slice(0, 240) ?? '',
          });
          
          // 🆕 使用优化的 CSS 类应用
          applyAnswerVisibility();
        }, 100);
      });
    },
  });

  if (editorRef.value !== nextEditor && activeMainProtyleHost !== nextHostElement) {
    pendingMainProtyle = nextEditor;
    pendingMainProtyleHost = nextHostElement;
  }

  logger.debug('[SiYuanMemo][ReviewContent] Protyle instance created');
}

// 渲染答案块（Xiuyuan 模板卡片）
async function renderAnswerProtyle(blockId: string): Promise<void> {
  const seq = ++answerRenderSeq;

  logger.debug('[SiYuanMemo][ReviewContent] renderAnswerProtyle called:', { blockId, seq });
  logBidirectionalTemplateDiagnostic('render-answer-start', {
    blockId,
    seq,
  });

  // 等待 DOM 准备
  const answerHost = await ensureAnswerHostRef(seq);
  if (!answerHost) {
    logger.debug('[SiYuanMemo][ReviewContent] answerHostRef not ready after waiting');
    logBidirectionalTemplateDiagnostic('answer-host-not-ready', {
      blockId,
      seq,
      hasAnswerHostRef: Boolean(answerHostRef.value),
      answerHostConnected: Boolean(answerHostRef.value?.isConnected),
    });
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
        logBidirectionalTemplateDiagnostic('answer-after-cancelled', {
          blockId,
          seq,
          answerHostConnected: answerHost.isConnected,
          showAnswer: props.showAnswer,
        });
        return;
      }
      logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle after callback called');
      if (typeof protyle.disable === 'function') {
        protyle.disable();
      }
      logBidirectionalTemplateDiagnostic('answer-after', {
        blockId,
        seq,
        hasWysiwyg: Boolean(answerHost.querySelector('.protyle-wysiwyg')),
        hostChildCount: answerHost.childElementCount,
        hostHtmlPreview: answerHost.innerHTML.slice(0, 240),
      });
    },
  });

  logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle instance created');
}

watch(
  () => renderWatchKey.value,
  () => {
    if (props.content.type !== 'protyle') return;
    if (currentRendererKind.value !== 'main-protyle') {
      return;
    }
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
  () => [props.content.id, props.content.card?.id, props.content.answerBlockID],
  () => {
    preciseDependencyBlockIds.value = [];
  },
  { immediate: true },
);

watch(
  currentRendererKind,
  (renderer) => {
    if (renderer === 'main-protyle') {
      return;
    }

    destroyMainProtyle({ invalidatePending: true });
    destroyAnswerProtyle({ invalidatePending: true });
    emitEditorState(createReviewEditorState(renderer, renderer === 'multi-cloze'
      ? { supportsNativeEdit: true, isEditing: false }
      : undefined));
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
  () => [props.showAnswer, resolvedAnswerBlockID.value, shouldRenderSeparateAnswerPane.value],
  ([show, ansBlockID, separatePane]) => {
    logger.debug('[SiYuanMemo][ReviewContent] Answer watch triggered:', { show, ansBlockID });
    
    // showAnswer=false 表示答案已显示，此时渲染答案块
    if (!show && separatePane && ansBlockID) {
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
  clearMainRenderRetryTimer();
  destroyMainProtyle({ invalidatePending: true });
  destroyAnswerProtyle({ invalidatePending: true });
  emitEditorState(createReviewEditorState('empty'));
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
  min-width: 0;
  min-height: 0;
  --siyuanmemo-review-font-base: var(--b3-font-size-editor);
  --siyuanmemo-review-font-body: var(--siyuanmemo-review-font-base);
  --siyuanmemo-review-font-small: calc(var(--siyuanmemo-review-font-base) * 0.875);
  --siyuanmemo-review-font-xs: calc(var(--siyuanmemo-review-font-base) * 0.75);
  --siyuanmemo-review-font-title: calc(var(--siyuanmemo-review-font-base) * 1.125);
  --siyuanmemo-review-font-title-lg: calc(var(--siyuanmemo-review-font-base) * 1.375);
  --siyuanmemo-review-font-display: calc(var(--siyuanmemo-review-font-base) * 2);
  font-size: var(--siyuanmemo-review-font-body);
  line-height: 1.7;
  overflow: hidden;
  overflow-x: hidden;
}

.fsrs-review-v2-content__empty {
  padding: 36px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.fsrs-review-v2-content__empty-icon {
  font-size: var(--siyuanmemo-review-font-display);
  line-height: 1;
}

.fsrs-review-v2-content__empty-title {
  font-size: var(--siyuanmemo-review-font-title);
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}

.fsrs-review-v2-content__empty-subtitle {
  font-size: var(--siyuanmemo-review-font-small);
  color: var(--b3-theme-on-surface-light);
}

.fsrs-review-v2-content__render-error {
  margin: 16px;
  padding: 12px;
  border: 1px solid var(--b3-theme-error);
  border-radius: 4px;
  color: var(--b3-theme-error);
  background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
  text-align: center;
}

.fsrs-review-v2-content__html,
.fsrs-review-v2-content__protyle,
.fsrs-review-v2-content__xiuyuan,
.fsrs-review-v2-content__multi-cloze,
.fsrs-review-v2-content__concept-definition-card,
.fsrs-review-v2-content__concept-card,
.fsrs-review-v2-content__quick-card,
.fsrs-review-v2-content__descriptor-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  font-size: var(--siyuanmemo-review-font-body);
  line-height: 1.7;
  overflow-x: hidden;
  overflow-y: auto;
}

.fsrs-review-v2-content__html {
  padding: 8px;
}

.fsrs-review-v2-content__image-occlusion-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.fsrs-review-v2-content__protyle-host {
  padding: 0;
  min-width: 0;
  overflow-x: hidden;
  position: relative;
}

.fsrs-review-v2-content__protyle-instance {
  min-width: 0;
}

.fsrs-review-v2-content__protyle-instance[data-pending='true'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

/* Xiuyuan 模板卡片答案分隔线 */
.fsrs-review-v2-content__answer-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-xs);
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

