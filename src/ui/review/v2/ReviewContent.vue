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
            :card-id="content.card?.id"
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import * as siyuan from 'siyuan';
import type { ReviewUIState } from './types';
import { OVERLAY_REGISTRY } from './overlays/index';
import XiuyuanListTemplateCard from './components/XiuyuanListTemplateCard.vue';
import MultiClozeCardRenderer from '../components/MultiClozeCardRenderer.vue';
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
import { createLogger } from '@/utils/logger';
import type { ICardStorage } from '@/application/interfaces/ICardStorage';

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

// 🆕 判断是否应该使用多挖空卡渲染器
const shouldUseMultiClozeRenderer = computed(() => {
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
const shouldUseConceptDefinitionRenderer = computed(() => {
  // 只有在 protyle 类型时才检测
  if (props.content.type !== 'protyle') return false;
  
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
  
  // 使用领域层的辅助函数检测
  const result = checkIsConceptCard(props.content.card);
  
  logger.debug('[SiYuanMemo][ReviewContent] shouldUseConceptCardRenderer:', {
    contentType: props.content.type,
    result
  });
  
  return result;
});

// 判断是否应该使用描述符卡渲染器
const shouldUseDescriptorCardRenderer = computed(() => {
  // 只有在 protyle 类型且检测到描述符卡时才使用
  // 概念定义卡和概念卡优先级更高
  return props.content.type === 'protyle' && !isConceptDefinitionCard.value && !isConceptCard.value && isDescriptorCard.value;
});

// 判断是否应该使用快速卡片渲染器
const shouldUseQuickCardRenderer = computed(() => {
  // 只有在 protyle 类型且检测到快速卡片时才使用
  // 概念定义卡、概念卡和描述符卡优先级更高
  return props.content.type === 'protyle' && !isConceptDefinitionCard.value && !isConceptCard.value && !isDescriptorCard.value && isQuickCard.value;
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

// 快速卡片加载失败，显示错误提示
function handleQuickCardError(error: Error) {
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

// 等待 DOM 准备好
async function ensureHostRef(): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (hostRef.value) return true;
    await nextTick();
    await sleep(10);
  }
  return false;
}

/**
 * 应用答案显示/隐藏逻辑
 * 
 * 🆕 性能优化：使用 CSS 类优化器，避免重复应用
 */
function applyAnswerVisibility(): void {
  const element = hostRef.value;
  if (!element) {
    logger.warn('[SiYuanMemo][ReviewContent] Cannot apply answer visibility: hostRef.value is null');
    return;
  }
  
  const hasHidden = props.hasHiddenContent;
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

  logger.debug('[SiYuanMemo][ReviewContent] renderProtyle called with blockId:', blockId);

  // 🆕 性能优化：检查卡片类型缓存
  const cachedType = getCardType(blockId);
  if (cachedType) {
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
        isDescriptorCard.value = cachedType.isDescriptor;
        isQuickCard.value = cachedType.isQuick;
        return;
      }
    } else {
      isConceptDefinitionCard.value = cachedType.isConcept;
      isDescriptorCard.value = cachedType.isDescriptor;
      isQuickCard.value = cachedType.isQuick;
      
      // 如果是特殊卡片类型，直接返回
      if (cachedType.isDescriptor || cachedType.isQuick) {
        return;
      }
    }
  }

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
      setCardType(blockId, result);
      isConceptDefinitionCard.value = true;
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
      setCardType(blockId, result);
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
    const isDescriptor = await descriptorCardRenderService.value.isDescriptorCard(blockId);
    if (isDescriptor) {
      logger.debug('[SiYuanMemo][ReviewContent] Detected descriptor card');
      const result = { isConcept: false, isDescriptor: true, isQuick: false };
      setCardType(blockId, result);
      isConceptDefinitionCard.value = false;
      isDescriptorCard.value = true;
      isQuickCard.value = false;
      return;
    }
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewContent] Descriptor card detection failed:', error);
  }

  // 🆕 检测是否为快速卡片
  try {
    const isQuick = await quickCardRenderService.value.isQuickCard(blockId);
    if (isQuick) {
      logger.debug('[SiYuanMemo][ReviewContent] Detected quick card');
      const result = { isConcept: false, isDescriptor: false, isQuick: true };
      setCardType(blockId, result);
      isConceptDefinitionCard.value = false;
      isQuickCard.value = true;
      isDescriptorCard.value = false;
      return;
    }
  } catch (error) {
    logger.warn('[SiYuanMemo][ReviewContent] Quick card detection failed:', error);
  }
  
  // 🆕 缓存普通卡片类型
  const result = { isConcept: false, isDescriptor: false, isQuick: false };
  setCardType(blockId, result);
  
  // Use standard Protyle rendering for non-special cards.
  isConceptDefinitionCard.value = false;
  isQuickCard.value = false;
  isDescriptorCard.value = false;

  logger.debug('[SiYuanMemo][ReviewContent] renderProtyle called:', { blockId, seq });

  // 等待 DOM 准备
  const ready = await ensureHostRef();
  if (!ready) {
    logger.debug('[SiYuanMemo][ReviewContent] hostRef not ready after waiting');
    return;
  }

  if (seq !== renderSeq) {
    logger.debug('[SiYuanMemo][ReviewContent] Render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = siyuan.Protyle;
  const Constants = siyuan.Constants;
  const cbGetAll: ProtyleAction = Constants.CB_GET_ALL;

  if (!ProtyleCtor) {
    hostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', 'Load failed')}</div>`;
    return;
  }

  logger.debug('[SiYuanMemo][ReviewContent] Destroying old Protyle instance');

  // Destroy old instance
  try {
    editorRef.value?.destroy?.();
  } catch {}

  // Clear host
  hostRef.value.innerHTML = '';
  
  // 🆕 重置 Protyle 初始化标志和 CSS 状态
  protyleInitialized = false;
  resetCssState();
  
  // 🆕 预先应用隐藏类，避免闪烁
  if (props.hasHiddenContent && props.showAnswer) {
    logger.debug('[SiYuanMemo][ReviewContent] Pre-applying hide classes to prevent flash');
    hostRef.value.classList.add(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  } else {
    hostRef.value.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  }

  logger.debug('[SiYuanMemo][ReviewContent] Creating new Protyle with blockId:', blockId);

  // Create new instance with blockId - Protyle will auto-load content
  editorRef.value = new ProtyleCtor(props.app, hostRef.value, {
    blockId: blockId,
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
      logger.debug('[SiYuanMemo][ReviewContent] Protyle after callback called');

      // 锁定编辑器
      if (typeof protyle.disable === 'function') {
        protyle.disable();

        // 添加双击解锁功能
        const wysiwygElement = protyle.protyle?.wysiwyg?.element;
        if (wysiwygElement) {
          const handleDoubleClick = () => {
            if (typeof protyle.enable === 'function') {
              protyle.enable();
            }
            wysiwygElement.removeEventListener('dblclick', handleDoubleClick);
          };
          wysiwygElement.addEventListener('dblclick', handleDoubleClick);
        }
      }
      
      // 🆕 标记 Protyle 已初始化
      nextTick(() => {
        setTimeout(() => {
          protyleInitialized = true;
          logger.debug('[SiYuanMemo][ReviewContent] Protyle initialized, applying answer visibility');
          
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
  for (let i = 0; i < 20; i++) {
    if (answerHostRef.value) break;
    await nextTick();
    await sleep(10);
  }

  if (!answerHostRef.value) {
    logger.debug('[SiYuanMemo][ReviewContent] answerHostRef not ready after waiting');
    return;
  }

  if (seq !== answerRenderSeq) {
    logger.debug('[SiYuanMemo][ReviewContent] Answer render cancelled, newer render pending');
    return;
  }

  const ProtyleCtor = siyuan.Protyle;
  const Constants = siyuan.Constants;
  const cbGetAll: ProtyleAction = Constants.CB_GET_ALL;

  if (!ProtyleCtor) {
    answerHostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', 'Load failed')}</div>`;
    return;
  }

  logger.debug('[SiYuanMemo][ReviewContent] Destroying old Answer Protyle instance');

  // Destroy old instance
  try {
    answerEditorRef.value?.destroy?.();
  } catch {}

  // Clear host
  answerHostRef.value.innerHTML = '';

  logger.debug('[SiYuanMemo][ReviewContent] Creating new Answer Protyle with blockId:', blockId);

  // Create new instance with blockId
  answerEditorRef.value = new ProtyleCtor(props.app, answerHostRef.value, {
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
      logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle after callback called');
      if (typeof protyle.disable === 'function') {
        protyle.disable();
      }
    },
  });

  logger.debug('[SiYuanMemo][ReviewContent] Answer Protyle instance created');
}

watch(
  () => props.content.id,  // 改为监听 content.id 而不是 content.data
  (id) => {
    if (props.content.type !== 'protyle') return;
    const blockId = String(id || '');
    if (!blockId) return;
    logger.debug('[SiYuanMemo][ReviewContent] Watch triggered, blockId:', blockId);
    void renderProtyle(blockId);
  },
  { immediate: true },
);

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    logger.debug('[SiYuanMemo][ReviewContent] Watch triggered:', { hidden, show, protyleInitialized });
    
    // 🆕 只有在 Protyle 初始化后才应用 CSS 类
    if (!protyleInitialized) {
      logger.debug('[SiYuanMemo][ReviewContent] Protyle not initialized yet, skipping');
      return;
    }
    
    if (!hostRef.value) {
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
      try {
        answerEditorRef.value?.destroy?.();
        answerEditorRef.value = null;
      } catch {}
    }
  },
  { immediate: true },
);

onMounted(() => {
  const { type, id } = props.content;
  if (type !== 'protyle') return;
  const blockId = String(id || '');
  if (!blockId) return;
  void renderProtyle(blockId);
});

onUnmounted(() => {
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

