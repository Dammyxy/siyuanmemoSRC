<template>
  <!-- 完全复制思源原生闪卡 HTML 结构 -->
  <div class="card__main" 
       ref="mainRef" 
       :class="{ 
         'fsrs-drill-mode': isDrillMode,
         'fsrs-cloze-card': isClozeCard,
         'fsrs-hide-answer': hideAnswer 
       }">
    <!-- 顶部工具栏 - 与思源原生一致 -->
    <div class="block__icons">
      <div class="block__logo">
        <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>{{ t('flashcard', '闪卡') }}
      </div>
      <span v-if="topBarTitle" class="ft__secondary ft__smaller">{{ topBarTitle }}</span>
      <span class="fn__flex-1 resize__move" style="min-height: 100%"></span>
      <div data-type="count" class="ft__on-surface ft__smaller fn__flex-center" :class="showCountBar ? 'fn__flex' : 'fn__none'" v-html="countHTML"></div>
      <div :class="showCountBar ? 'fn__space' : 'fn__none'"></div>
      <button data-type="filter" :data-id="filterId" :data-cardtype="filterCardType" class="block__icon block__icon--show" @click="handleFilter">
        <svg><use xlink:href="#iconFilter"></use></svg>
      </button>
      <div class="fn__space"></div>
      <div data-type="fullscreen" class="b3-tooltips b3-tooltips__sw block__icon block__icon--show" :aria-label="t('fullscreen', '全屏')" @click="handleFullscreen">
        <svg><use xlink:href="#iconFullscreen"></use></svg>
      </div>
      <div class="fn__space" :class="{'fn__none': totalCards === 0}"></div>
      <div data-type="more" class="b3-tooltips b3-tooltips__sw block__icon block__icon--show" :class="{'fn__none': totalCards === 0}" :aria-label="t('more', '更多')" @click.stop.prevent="handleMore">
        <svg><use xlink:href="#iconMore"></use></svg>
      </div>
      <div class="fn__space"></div>
      <button data-type="sticktab" class="b3-tooltips b3-tooltips__sw block__icon block__icon--show" :aria-label="t('openBy', '打开方式')" type="button" @click.stop.prevent="handleOpenBy">
        <svg><use xlink:href="#iconOpen"></use></svg>
      </button>
    </div>
    <component :is="topAreaComponent" />
    <component :is="overlayComponent" />

    <!-- 内容区 - 使用 Protyle 渲染 -->
    <div class="card__block fn__flex-1 fsrs-card-container" data-type="render" v-show="totalCards > 0" ref="blockScrollRef">
      <div class="fsrs-protyle-host" ref="blockRef"></div>
      <div v-if="cardTransition.active" class="fsrs-card-transition" :class="{ 'is-fading': cardTransition.fading }" aria-hidden="true">
        <div
          class="fsrs-card-transition__content"
          :style="{ transform: `translate3d(0, ${-cardTransition.scrollTop}px, 0)` }"
          v-html="cardTransition.html"
        ></div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="card__empty card__empty--space" :class="{'fn__none': totalCards > 0}" data-type="empty">
      <div>🔮</div>
      <span v-if="pendingUnreviewedCount === 0" class="empty-text">{{ emptyText }}</span>
      <div v-else>
        <span>{{ format('pendingReviewCount', '还有 {n} 张卡片待复习', { n: pendingUnreviewedCount }) }}</span>
        <div class="fn__hr"></div>
        <button data-type="newround" class="b3-button fn__size200" @click="fetchNewRound">{{ t('continueReview', '继续复习') }}</button>
      </div>
    </div>

    <!-- ... (rest of template) ... -->


    <!-- 显示答案按钮 - 第一个 action -->
    <div class="fn__flex card__action" :class="{'fn__none': !showFirstAction}">
      <button class="b3-button b3-button--cancel" :disabled="currentIndex === 0" data-type="-2" style="width: 25%;min-width: 86px;display: flex" @click="handlePrev">
        <svg><use xlink:href="#iconLeft"></use></svg>
        (p / q)
      </button>
      <span class="fn__space"></span>
      <button data-type="-1" class="b3-button fn__flex-1" @click="handleShowAnswer">
        {{ t('showAnswer', '显示答案') }} ({{ t('answerShortcut', '空格 / 回车') }})
      </button>
    </div>

    <!-- 评分按钮 - 第二个 action -->
    <div class="fn__flex card__action" :class="{'fn__none': !showSecondAction}">
      <div>
        <button class="b3-button b3-button--cancel" :disabled="currentIndex === 0" style="display: flex;margin-bottom: 8px;height: 28px;padding: 0;" data-type="-2" @click="handlePrev">
          <svg><use xlink:href="#iconLeft"></use></svg>(p / q)
        </button>
        <button v-if="queueUiConfig.allowSkip" data-type="-3" aria-label="0 / x" class="b3-button b3-button--cancel b3-tooltips__n b3-tooltips" @click="handleSkip">
          <div class="card__icon">💤</div>
          {{ t('skip', '跳过') }} (0)
        </button>
      </div>
      <div>
        <span>{{ nextDues[1] }}</span>
        <button data-type="1" aria-label="1 / j / a" class="b3-button b3-button--error b3-tooltips__n b3-tooltips" @click="handleRating(1)">
          <div class="card__icon">🙈</div>
          {{ t('again', '忘记') }} (1)
        </button>
      </div>
      <div>
        <span>{{ nextDues[2] }}</span>
        <button data-type="2" aria-label="2 / k / s" class="b3-button b3-button--warning b3-tooltips__n b3-tooltips" @click="handleRating(2)">
          <div class="card__icon">😬</div>
          {{ t('hard', '困难') }} (2)
        </button>
      </div>
      <div>
        <span>{{ nextDues[3] }}</span>
        <button data-type="3" :aria-label="`3 / l / d / ${t('answerShortcut', '空格 / 回车')}`" class="b3-button b3-button--info b3-tooltips__n b3-tooltips" @click="handleRating(3)">
          <div class="card__icon">😊</div>
          {{ t('good', '一般') }} (3)
        </button>
      </div>
      <div>
        <span>{{ nextDues[4] }}</span>
        <button data-type="4" aria-label="4 / ; / f" class="b3-button b3-button--success b3-tooltips__n b3-tooltips" @click="handleRating(4)">
          <div class="card__icon">🌈</div>
          {{ t('easy', '简单') }} (4)
        </button>
      </div>
    </div>

    <!-- 主题模式按钮 - Topic Mode Action -->
    <div class="fn__flex card__action" :class="{'fn__none': !showTopicAction}">
      <button class="b3-button b3-button--cancel" :disabled="currentIndex === 0" style="width: 25%;min-width: 86px;display: flex" data-type="-2" @click="handlePrev">
        <svg><use xlink:href="#iconLeft"></use></svg>
        (p / q)
      </button>
      <span class="fn__space"></span>
      <button data-type="topic-next" class="b3-button b3-button--info fn__flex-1" @click="handleTopicNext">
        <div class="card__icon">📖</div>
        {{ t('topicContinue', '继续漫游') }} ({{ t('answerShortcut', '空格 / 回车') }})
      </button>
    </div>

    <div class="fn__flex card__action" :class="{'fn__none': !showCustomAction}">
      <button class="b3-button b3-button--cancel" :disabled="currentIndex === 0" style="width: 25%;min-width: 86px;display: flex" data-type="-2" @click="handlePrev">
        <svg><use xlink:href="#iconLeft"></use></svg>
        (p / q)
      </button>
      <span class="fn__space"></span>
      <button
        v-for="btn in (queueUiConfig.customButtons || [])"
        :key="btn.actionId"
        data-type="custom"
        class="b3-button fn__flex-1"
        :class="btn.variant === 'ghost' ? 'b3-button--cancel' : 'b3-button--info'"
        @click="handleCustom(btn.actionId)"
      >
        {{ btn.label }}
      </button>
    </div>

    <div v-if="showResumePrompt" class="fsrs-resume-mask" role="dialog" aria-modal="true" :aria-label="t('resumePromptTitle', '发现未完成的练习')">
      <div class="b3-dialog__container fsrs-resume-container">
        <div class="b3-dialog__header">
          <div class="b3-dialog__title">{{ t('resumePromptTitle', '发现未完成的练习') }}</div>
        </div>
        <div class="b3-dialog__content">
          <div class="ft__secondary">{{ t('resumePromptDesc', '检测到未完成的块练习，是否继续？') }}</div>
          <div class="fn__hr"></div>
          <div class="fn__flex fsrs-resume-stats">
            <span>{{ t('resumeProgress', '进度') }}: {{ resumeCompleted }}/{{ resumeTotal }}</span>
            <span>{{ t('resumeLastTime', '上次练习') }}: {{ resumeLastTimeText }}</span>
          </div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" @click="handleResumeStartOver">{{ t('resumeStartOver', '从头开始') }}</button>
          <button ref="resumeContinueRef" class="b3-button b3-button--text" @click="handleResumeContinue">{{ t('resumeContinue', '继续练习') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, reactive, watchEffect, onMounted, onUnmounted, nextTick, provide, toRaw, isProxy } from 'vue';
import { isWebpageCard, type WebpageCard } from '../../types/card';
import SrsEditorDialog from '../srs/SrsEditorDialog.vue';
import { getBlockDOM, getBlockDocInfo, getDocContent, riff } from '../../core/siyuan';
import { Menu, Protyle, Constants, openTab, type App, type IProtyle } from 'siyuan';
import { createVueDialog, inputDialog } from '../../utils/dialog';
import { clearBlockPracticeProgress, readBlockPracticeProgress, writeBlockPracticeProgress } from '../../core/queue/adapters/blockPracticeProgress';
import type { NeuralContext } from '../../core/queue/neural/types';
import type { FsrsEventBus, FsrsReviewMode } from '../../core/events';
import type { QueueStats, QueueUIConfig } from '../../core/queue/types';
import type { ReviewSessionSnapshot, ReviewSessionState, ReviewSessionStateContext } from './states/types';
import { StandardReviewState } from './states/StandardReviewState';
import { DrillReviewState } from './states/DrillReviewState';
import { NeuralReviewState } from './states/NeuralReviewState';
import { DRILL_BREADCRUMB_UI_CONTEXT_KEY, NEURAL_TOP_AREA_CONTEXT_KEY } from './components/contexts';

const props = defineProps<{
  cards: any[];
  deckID: string;
  app?: App;
  i18n?: Record<string, string>;
  drillMode?: boolean;
  practiceMode?: 'queue' | 'block' | 'neural' | 'neural-wandering' | 'retrieval-practice' | 'final-drill' | 'filter-group' | 'leech';
  eventBus?: FsrsEventBus;
  queueSession?: {
    getUIConfig: (currentItem: any | null) => QueueUIConfig;
    getStats: () => Promise<QueueStats>;
    onFeedback: (currentItem: any | null, feedback: { action: 'rate' | 'skip' | 'custom'; rating?: 1 | 2 | 3 | 4; customActionId?: string; durationMs?: number }) => Promise<void>;
    next: () => Promise<any | null>;
  };
  getNextDrillCard?: (current: any | null, action: 'rate' | 'skip' | 'custom', rating?: 1 | 2 | 3 | 4, customActionId?: string) => Promise<any | null>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Refs
const mainRef = ref<HTMLElement | null>(null);
const blockRef = ref<HTMLElement | null>(null);
const blockScrollRef = ref<HTMLElement | null>(null);
const breadcrumbListRef = ref<HTMLElement | null>(null);
const breadcrumbContentRef = ref<HTMLElement | null>(null);
const editorRef = ref<Protyle | null>(null);
const resumeContinueRef = ref<HTMLButtonElement | null>(null);
let srsDialog: ReturnType<typeof createVueDialog> | null = null;

// 卡片数据
const cardsData = ref({
  cards: [...props.cards],
  unreviewedNewCardCount: 0,
  unreviewedOldCardCount: 0,
});

// 状态
const currentIndex = ref(0);
const showAnswer = ref(false);
const hideAnswer = ref(true);
const emptyText = ref('');
const pendingUnreviewedCount = ref(0);
const filterCardType = ref<'all' | 'doc' | 'notebook'>('all');
const filterId = ref<string>('');
const pinnedBreadcrumbId = ref<string>('');
const showResumePrompt = ref(false);
const resumeData = ref<any | null>(null);
const resumeCompleted = ref(0);
const resumeTotal = ref(0);
const resumeLastTimeText = ref('');
const drillStartAt = ref<number | null>(null);
const drillAnsweredCount = ref(0);
const drillCorrectCount = ref(0);
const drillDurationMs = ref(0);
const cardStartAt = ref<number | null>(null);
const standardCardStartAt = ref<number | null>(null);
const drillSessionId = ref<string>('');
const initialDrillTotal = ref(0);

interface IBreadcrumbItem {
  id: string;
  name: string;
  type: string;
  subType: string;
  children: [];
}
const breadcrumbs = ref<IBreadcrumbItem[]>([]);
const breadcrumbLoading = ref(false);
let breadcrumbHighlightTimer: number | null = null;
const lockedBreadcrumbs = ref<IBreadcrumbItem[]>([]);
const lockedBreadcrumbForId = ref<string>('');
const isBreadcrumbLocked = ref(true);
const breadcrumbContextId = ref<string>('');
const isBreadcrumbContext = computed(() => breadcrumbContextId.value.length > 0);
const breadcrumbScrollPositions = new Map<string, number>();
const CARD_SCROLL_KEY = '__fsrs_card__';
let breadcrumbRequestSeq = 0;
const cardTransition = reactive({
  pending: false,
  active: false,
  fading: false,
  html: '',
  scrollTop: 0,
  token: 0,
});
let cardTransitionTimer: number | null = null;
let cardTransitionActivateTimer: number | null = null;
const breadcrumbTransition = reactive({
  active: false,
  fading: false,
  html: '',
  scrollTop: 0,
  token: 0,
});
let breadcrumbTransitionTimer: number | null = null;

function debugLog(...args: any[]) {
  if ((process.env as any)?.DEV_MODE === 'true') {
    console.debug('[FSRS][Breadcrumb]', ...args);
  }
}

function beginCardTransition() {
  const wysiwyg = editorRef.value?.protyle?.wysiwyg?.element;
  const scrollContainer = blockScrollRef.value;
  const html = (wysiwyg as HTMLElement | undefined | null)?.outerHTML || '';
  if (!html && !cardTransition.html) return;
  if (cardTransitionTimer) {
    window.clearTimeout(cardTransitionTimer);
    cardTransitionTimer = null;
  }
  if (cardTransitionActivateTimer) {
    window.clearTimeout(cardTransitionActivateTimer);
    cardTransitionActivateTimer = null;
  }
  cardTransition.token += 1;
  cardTransition.pending = true;
  cardTransition.active = false;
  cardTransition.fading = false;
  if (html) {
    cardTransition.html = html;
  }
  cardTransition.scrollTop = scrollContainer?.scrollTop || 0;
  const token = cardTransition.token;
  cardTransitionActivateTimer = window.setTimeout(() => {
    if (cardTransition.token !== token) return;
    if (!cardTransition.pending) return;
    cardTransition.active = true;
    cardTransition.pending = false;
    cardTransitionActivateTimer = null;
  }, 32);
}

function finishCardTransition() {
  if (cardTransitionActivateTimer) {
    window.clearTimeout(cardTransitionActivateTimer);
    cardTransitionActivateTimer = null;
  }
  cardTransition.pending = false;
  if (!cardTransition.active || cardTransition.fading) {
    cardTransition.html = '';
    cardTransition.scrollTop = 0;
    return;
  }
  const token = cardTransition.token;
  requestAnimationFrame(() => {
    if (!cardTransition.active || cardTransition.token !== token) return;
    cardTransition.fading = true;
    cardTransitionTimer = window.setTimeout(() => {
      if (cardTransition.token !== token) return;
      cardTransition.active = false;
      cardTransition.fading = false;
      cardTransition.html = '';
      cardTransition.scrollTop = 0;
      cardTransitionTimer = null;
    }, 160);
  });
}

function cancelCardTransition() {
  if (cardTransitionTimer) {
    window.clearTimeout(cardTransitionTimer);
    cardTransitionTimer = null;
  }
  if (cardTransitionActivateTimer) {
    window.clearTimeout(cardTransitionActivateTimer);
    cardTransitionActivateTimer = null;
  }
  cardTransition.pending = false;
  cardTransition.active = false;
  cardTransition.fading = false;
  cardTransition.html = '';
  cardTransition.scrollTop = 0;
}

function beginBreadcrumbTransition() {
  const content = breadcrumbContentRef.value;
  const container = breadcrumbListRef.value;
  const html = content?.innerHTML || '';
  if (!html && !breadcrumbTransition.html) return;
  if (breadcrumbTransitionTimer) {
    window.clearTimeout(breadcrumbTransitionTimer);
    breadcrumbTransitionTimer = null;
  }
  breadcrumbTransition.token += 1;
  breadcrumbTransition.active = true;
  breadcrumbTransition.fading = false;
  if (html) {
    breadcrumbTransition.html = html;
  }
  breadcrumbTransition.scrollTop = container?.scrollTop || 0;
}

function finishBreadcrumbTransition() {
  if (!breadcrumbTransition.active || breadcrumbTransition.fading) return;
  const token = breadcrumbTransition.token;
  requestAnimationFrame(() => {
    if (!breadcrumbTransition.active || breadcrumbTransition.token !== token) return;
    breadcrumbTransition.fading = true;
    breadcrumbTransitionTimer = window.setTimeout(() => {
      if (breadcrumbTransition.token !== token) return;
      breadcrumbTransition.active = false;
      breadcrumbTransition.fading = false;
      breadcrumbTransition.html = '';
      breadcrumbTransition.scrollTop = 0;
      breadcrumbTransitionTimer = null;
    }, 140);
  });
}

function cancelBreadcrumbTransition() {
  if (breadcrumbTransitionTimer) {
    window.clearTimeout(breadcrumbTransitionTimer);
    breadcrumbTransitionTimer = null;
  }
  breadcrumbTransition.active = false;
  breadcrumbTransition.fading = false;
  breadcrumbTransition.html = '';
  breadcrumbTransition.scrollTop = 0;
}

// Computed
const totalCards = computed(() => cardsData.value.cards.length);
const currentCard = computed(() => cardsData.value.cards[currentIndex.value]);
const isDrillMode = computed(() => props.drillMode === true);
const isStrategySession = computed(() => {
  if (!isDrillMode.value) return false;
  const mode = props.practiceMode;
  if (
    mode !== 'retrieval-practice'
    && mode !== 'final-drill'
    && mode !== 'filter-group'
    && mode !== 'neural-wandering'
    && mode !== 'leech'
  ) return false;
  const q = props.queueSession;
  return Boolean(q && typeof q.onFeedback === 'function' && typeof q.next === 'function');
});
const queueUiConfig = computed<QueueUIConfig>(() => {
  const q = props.queueSession;
  if (q && typeof q.getUIConfig === 'function') {
    try {
      return q.getUIConfig(currentCard.value || null);
    } catch {}
  }
  return { statsType: 'infinite', showRatingButtons: true, allowSkip: true };
});
const queueStats = ref<QueueStats | null>(null);
let queueStatsSeq = 0;
async function refreshQueueStats(): Promise<void> {
  const q = props.queueSession;
  if (!q || typeof q.getStats !== 'function') {
    queueStats.value = null;
    return;
  }
  const seq = ++queueStatsSeq;
  try {
    const s = await q.getStats();
    if (seq === queueStatsSeq) {
      queueStats.value = s;
    }
  } catch {}
}
watchEffect(() => {
  if (!isStrategySession.value) return;
  if (queueUiConfig.value.statsType === 'infinite') return;
  void refreshQueueStats();
});
const showCountBar = computed(() => {
  if (totalCards.value <= 0) return false;
  if (!isDrillMode.value) return true;
  if (!isStrategySession.value) return false;
  return queueUiConfig.value.statsType !== 'infinite';
});
const isNeuralPractice = computed(() => isDrillMode.value && (props.practiceMode === 'neural' || props.practiceMode === 'neural-wandering'));

// 判断当前是否为主题模式（Topic Mode）
const isTopicMode = computed(() => {
  if (!isNeuralPractice.value) return false;
  const meta = (currentCard.value as any)?.meta;
  const neuralCtx = meta?.neuralContext as NeuralContext | undefined;
  return neuralCtx?.isFlashcard === false;
});

const neuralReasonLabel = computed(() => {
  if (!isNeuralPractice.value) return '';
  const meta = (currentCard.value as any)?.meta;
  const neuralCtx = meta?.neuralContext as NeuralContext | undefined;
  const reason = String(neuralCtx?.associationType || meta?.neuralReason || '');
  if (reason === 'ref') return t('neuralReasonRef', '双链');
  if (reason === 'context') return t('neuralReasonContext', '同文档');
  if (reason === 'tag') return t('neuralReasonTag', '标签');
  if (reason === 'sibling') return t('neuralReasonSibling', '兄弟块');
  return '';
});
const neuralFromShort = computed(() => {
  if (!isNeuralPractice.value) return '';
  const meta = (currentCard.value as any)?.meta;
  const neuralCtx = meta?.neuralContext as NeuralContext | undefined;
  const from = String(neuralCtx?.previousCardId || meta?.neuralFrom || '');
  if (!from) return '';
  return from.length > 10 ? `${from.slice(0, 4)}…${from.slice(-4)}` : from;
});
const practiceModeLabel = computed(() => {
  if (!isDrillMode.value) return '';
  if (props.practiceMode === 'queue') {
    return t('queueModeLabel', '队列练习');
  }
  if (props.practiceMode === 'retrieval-practice') {
    return t('retrievalPracticeModeLabel', '提取练习');
  }
  if (props.practiceMode === 'block') {
    return t('blockModeLabel', '块练习');
  }
  if (props.practiceMode === 'neural' || props.practiceMode === 'neural-wandering') {
    return t('neuralModeLabel', '神经复习');
  }
  if (props.practiceMode === 'final-drill') {
    return t('deliberateModeLabel', '刻意练习');
  }
  if (props.practiceMode === 'filter-group') {
    return t('filterGroupModeLabel', '分组队列');
  }
  if (props.practiceMode === 'leech') {
    return t('leechModeLabel', '难点攻坚');
  }
  return t('drillModeLabel', '机械练习');
});
const isBlockPractice = computed(() => isDrillMode.value && props.practiceMode === 'block');
const history = ref<ReviewSessionSnapshot[]>([]);

const stateCtx: ReviewSessionStateContext = {
  totalCards,
  hideAnswer,
  isTopicMode,
  practiceModeLabel,
  history,
  rateStandard,
  skipStandard,
  rateDrill,
  skipDrill,
  undoStandard,
  undoDrill,
};

const currentState = shallowRef<ReviewSessionState>(new StandardReviewState(stateCtx));

watchEffect(() => {
  if (isNeuralPractice.value) {
    currentState.value = new NeuralReviewState(stateCtx);
    return;
  }
  if (isDrillMode.value) {
    currentState.value = new DrillReviewState(stateCtx);
    return;
  }
  currentState.value = new StandardReviewState(stateCtx);
});

const topBarTitle = computed(() => currentState.value.getTopBarTitle());
const topAreaComponent = computed(() => currentState.value.getTopAreaComponent());
const overlayComponent = computed(() => currentState.value.getOverlayComponent());

// 神经上下文信息
const neuralContext = computed(() => {
  if (!isNeuralPractice.value || !currentCard.value) return null;
  
  const meta = (currentCard.value as any)?.meta;
  const neuralCtx = meta?.neuralContext as NeuralContext | undefined;
  
  if (!neuralCtx) return null;
  
  return {
    previousCardTitle: neuralCtx.previousCardId ? '前一张卡片' : '', // TODO: 获取实际标题
    associationType: neuralCtx.associationType,
    currentCardTitle: '当前卡片', // TODO: 获取实际标题
  };
});

// 当前语言环境
const currentLocale = computed(() => {
  // 从 i18n 对象推断语言，或使用默认值
  return 'zh-CN' as any; // TODO: 从插件配置获取
});

// 判断当前卡片是否为网页卡片
const isCurrentWebpage = computed(() => {
  const card = currentCard.value;
  return card && isWebpageCard(card);
});

// 判断是否为挖空卡片
const isClozeCard = computed(() => {
  const card = currentCard.value;
  return (card as any)?.type === 'item' && (card as any)?.meta?.cardType === 'cloze';
});

// 当前网页卡片（类型安全）
const currentWebpageCard = computed(() => {
  if (isCurrentWebpage.value) {
    return currentCard.value as WebpageCard;
  }
  return null;
});

// 计数 HTML (与思源原生一致)
const countHTML = computed(() => {
  if (isStrategySession.value && showCountBar.value && queueStats.value) {
    if (queueUiConfig.value.statsType === 'queue-size') {
      return `
        <span class="ariaLabel" aria-label="${t('practiceQueueCount', '队列数量')}">
          <span class="ft__primary">${queueStats.value.size}</span>
        </span>
      `;
    }
    if (queueUiConfig.value.statsType === 'riff-counts') {
      const label = String(queueStats.value.label || '');
      const parts = label.split('/');
      const newC = Number(parts[0] || 0);
      const oldC = Number(parts[1] || 0);
      return `
        <span class="ariaLabel" aria-label="${t('newCard', '新卡')}">
          <span class="ft__primary">${newC}</span>
        </span>
        <span class="fn__space"></span>+<span class="fn__space"></span>
        <span class="ariaLabel" aria-label="${t('reviewCard', '复习卡')}">
          <span class="ft__success">${oldC}</span>
        </span>
      `;
    }
  }
  let newIdx = 0, oldIdx = 0;
  for (let i = 0; i <= currentIndex.value && i < cardsData.value.cards.length; i++) {
    if (cardsData.value.cards[i].state === 0) newIdx++;
    else oldIdx++;
  }
  return `
    <span class="ariaLabel" aria-label="${t('newCard', '新卡')}">
      <span class="ft__error">${newIdx}</span> /
      <span class="ft__primary">${cardsData.value.unreviewedNewCardCount}</span>
    </span>
    <span class="fn__space"></span>+<span class="fn__space"></span>
    <span class="ariaLabel" aria-label="${t('reviewCard', '复习卡')}">
      <span class="ft__error">${oldIdx}</span> /
      <span class="ft__success">${cardsData.value.unreviewedOldCardCount}</span>
    </span>
  `;
});

// 下次复习时间
const nextDues = computed(() => {
  const card = currentCard.value;
  if (!card?.nextDues) return { 1: '', 2: '', 3: '', 4: '' };
  return card.nextDues;
});

// 是否显示第一个 action（显示答案按钮）
const showFirstAction = computed(() => {
  if (isStrategySession.value && !queueUiConfig.value.showRatingButtons) return false;
  return currentState.value.shouldShowAnswerBtn();
});

// 是否显示第二个 action（评分按钮）
const showSecondAction = computed(() => {
  if (isStrategySession.value && !queueUiConfig.value.showRatingButtons) return false;
  return currentState.value.shouldShowRatingBtns();
});

// 是否显示主题模式的"继续漫游"按钮
const showTopicAction = computed(() => {
  if (isStrategySession.value) return false;
  return isTopicMode.value && totalCards.value > 0;
});
const showCustomAction = computed(() => {
  if (!isStrategySession.value) return false;
  const buttons = queueUiConfig.value.customButtons || [];
  if (buttons.length === 0) return false;
  if (showFirstAction.value) return false;
  if (showSecondAction.value) return false;
  return totalCards.value > 0;
});
const drillTotal = computed(() => {
  if (!isDrillMode.value) return 0;
  return initialDrillTotal.value || cardsData.value.cards.length;
});
const drillCompleted = computed(() => {
  if (!isDrillMode.value) return 0;
  return Math.max(0, drillTotal.value - cardsData.value.cards.length);
});
const progressPercent = computed(() => {
  if (!isDrillMode.value) return 0;
  if (drillTotal.value <= 0) return 0;
  const percent = Math.round((drillCompleted.value / drillTotal.value) * 100);
  return Math.min(100, Math.max(0, percent));
});


function ensureEditor() {
  if (editorRef.value || !blockRef.value || !props.app) return;
  editorRef.value = new Protyle(props.app, blockRef.value, {
    blockId: '',
    action: [Constants.CB_GET_ALL],
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: !isDrillMode.value,
      breadcrumb: !isDrillMode.value,
      title: false,
      // hideTitleOnZoom 属性不存在，已移除
    },
    typewriterMode: false,
  });
}

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function format(key: string, fallback: string, vars: Record<string, string | number>): string {
  let text = t(key, fallback);
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
  }
  return text;
}

provide(DRILL_BREADCRUMB_UI_CONTEXT_KEY, {
  t,
  totalCards,
  drillTotal,
  breadcrumbs,
  breadcrumbContextId,
  breadcrumbTransition,
  breadcrumbListRef,
  breadcrumbContentRef,
  isBreadcrumbLocked,
  toggleBreadcrumbLock,
  isBreadcrumbContext,
  exitBreadcrumbContext,
  handleBreadcrumbClick,
});

provide(NEURAL_TOP_AREA_CONTEXT_KEY, {
  t,
  isTopicMode,
  isNeuralPractice,
  neuralContext,
  neuralReasonLabel,
  neuralFromShort,
  currentLocale,
});

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatLastTime(ts?: number) {
  if (!ts) return t('resumeUnknownTime', '未知');
  return new Date(ts).toLocaleString();
}

function resetDrillStats(total: number) {
  initialDrillTotal.value = total;
  drillAnsweredCount.value = 0;
  drillCorrectCount.value = 0;
  drillDurationMs.value = 0;
  drillStartAt.value = Date.now();
  drillSessionId.value = createSessionId();
}

function applyStoredStats(stored: any) {
  drillStartAt.value = stored?.startAt || Date.now();
  drillAnsweredCount.value = stored?.stats?.answered || 0;
  drillCorrectCount.value = stored?.stats?.correct || 0;
  drillDurationMs.value = stored?.stats?.durationMs || 0;
  drillSessionId.value = stored?.sessionId || createSessionId();
}

function buildProgressPayload() {
  const total = initialDrillTotal.value || cardsData.value.cards.length;
  const remaining = cardsData.value.cards.length;
  const completed = Math.max(0, total - remaining);
  const accuracy = drillAnsweredCount.value > 0 ? drillCorrectCount.value / drillAnsweredCount.value : 0;
  return {
    sessionId: drillSessionId.value,
    startAt: drillStartAt.value || Date.now(),
    total,
    completed,
    remainingCards: cardsData.value.cards,
    stats: {
      answered: drillAnsweredCount.value,
      correct: drillCorrectCount.value,
      durationMs: drillDurationMs.value,
      accuracy,
    },
  };
}

async function saveBlockPracticeProgress() {
  if (!isBlockPractice.value) return;
  const payload = buildProgressPayload();
  await writeBlockPracticeProgress(payload);
}

async function clearExpiredOrInvalidProgress() {
  const stored = await readBlockPracticeProgress();
  if (!stored) return null;
  if (!stored.remainingCards || stored.remainingCards.length === 0) {
    clearBlockPracticeProgress();
    return null;
  }
  return stored;
}



async function fetchBreadcrumbs(blockId: string) {
  if (!blockId) return;
  if (isBreadcrumbLocked.value && lockedBreadcrumbs.value.length > 0 && lockedBreadcrumbForId.value === blockId) {
    breadcrumbLoading.value = false;
    breadcrumbs.value = lockedBreadcrumbs.value;
    return;
  }
  if (isBreadcrumbLocked.value && lockedBreadcrumbForId.value !== blockId) {
    lockedBreadcrumbs.value = [];
    lockedBreadcrumbForId.value = '';
  }
  const seq = ++breadcrumbRequestSeq;
  breadcrumbLoading.value = true;
  try {
    debugLog('fetch start', { seq, blockId, locked: isBreadcrumbLocked.value, contextId: breadcrumbContextId.value });
    const response = await fetch('/api/block/getBlockBreadcrumb', {
      method: 'POST',
      body: JSON.stringify({ id: blockId }),
    });
    const data = await response.json();
    if (seq !== breadcrumbRequestSeq) {
      debugLog('fetch drop (stale)', { seq, latest: breadcrumbRequestSeq, blockId });
      return;
    }
    if (data.code === 0 && data.data) {
      let items = data.data as IBreadcrumbItem[];
      // 优化：如果最后一个面包屑是列表项，且当前卡片是该列表项的子块，则隐藏列表项以免重复
      // 这里的逻辑是：如果面包屑最后一项是 NodeListItem，我们通常认为它不仅是容器，也是“标题”
      // 但如果卡片本身是列表项下的第一个 Paragraph，内容往往重复。
      // 简单策略：如果倒数第二项是 List Item，且最后一项（当前卡片，通常已被过滤掉？）
      // 注意：getBlockBreadcrumb 返回的是路径，*不包含* 请求的 blockId 本身吗？
      // 经测试通常不包含。所以 breadcrumbs 的最后一项是 Parent。
      // 如果 Parent 是 ListItem，且 Card 是 Paragraph ??
      // 我们的目标是：隐藏 ListItem 类型的面包屑，如果我们觉得它是多余的。
      // 用户反馈：“列表项块和段落块重复...闪卡在面包屑里隐藏...只隐藏了段落块...列表项没隐藏”
      // 这里的逻辑是：如果面包屑最后一项是 NodeListItem，我们通常认为它不仅是容器，也是“标题”
      // 如果卡片是列表项子块，由于 Drill 模式下直接渲染子块，该 ListItem 面包屑其实是“标题”作用
      // 但如果内容完全重复（即该列表项只有这个子块），则隐藏。
      // 因为没法简单判断“是否唯一子块”，我们简单粗暴地移除这一层级，
      // 因为用户如果是在列表中学习，上下文通常足够，或者 ListItem 内容本来就和 Paragraph 差不多。
      
      // 我们移除所有尾部的 NodeListItem，甚至包括 NodeList (容器)
      while (items.length > 0) {
        const last = items[items.length - 1];
        if (last.type === 'NodeListItem' || last.type === 'NodeList') {
           items.pop();
        } else {
           break;
        }
      }
      if (isBreadcrumbLocked.value) {
        lockedBreadcrumbForId.value = blockId;
        lockedBreadcrumbs.value = items;
        beginBreadcrumbTransition();
        breadcrumbs.value = lockedBreadcrumbs.value;
      } else {
        beginBreadcrumbTransition();
        breadcrumbs.value = items;
      }
      await nextTick();
      finishBreadcrumbTransition();
      debugLog('fetch success', { seq, blockId, count: items.length, locked: isBreadcrumbLocked.value });
    }
  } catch (err) {
    console.error('Fetch breadcrumb error:', err);
    debugLog('fetch error', { seq, blockId, err });
  } finally {
    if (seq === breadcrumbRequestSeq) {
      breadcrumbLoading.value = false;
    }
  }
}

function cssEscape(value: string) {
  const esc = (globalThis as any)?.CSS?.escape;
  if (typeof esc === 'function') return esc(value);
  return value.replace(/["\\]/g, '\\$&');
}

function clearBreadcrumbHighlight() {
  if (breadcrumbHighlightTimer) {
    window.clearTimeout(breadcrumbHighlightTimer);
    breadcrumbHighlightTimer = null;
  }
  const wysiwyg = editorRef.value?.protyle?.wysiwyg?.element;
  if (!wysiwyg) return;
  wysiwyg.querySelectorAll('.fsrs-breadcrumb-target').forEach((el) => {
    el.classList.remove('fsrs-breadcrumb-target');
  });
}

function saveCurrentScrollPosition() {
  const container = blockScrollRef.value;
  if (!container) return;
  const key = breadcrumbContextId.value || CARD_SCROLL_KEY;
  breadcrumbScrollPositions.set(key, container.scrollTop);
}

function scrollToTop(value: number) {
  const container = blockScrollRef.value;
  if (!container) return;
  try {
    container.scrollTo({ top: value, behavior: 'smooth' });
  } catch {
    container.scrollTop = value;
  }
}

function scrollToBlockElement(blockId: string) {
  const container = blockScrollRef.value;
  const wysiwyg = editorRef.value?.protyle?.wysiwyg?.element;
  if (!container || !wysiwyg) return false;
  const target = wysiwyg.querySelector(`[data-node-id="${cssEscape(blockId)}"]`) as HTMLElement | null;
  if (!target) return false;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const delta = targetRect.top - containerRect.top;
  const top = Math.max(0, container.scrollTop + delta - container.clientHeight * 0.25);
  scrollToTop(top);
  clearBreadcrumbHighlight();
  target.classList.add('fsrs-breadcrumb-target');
  breadcrumbHighlightTimer = window.setTimeout(() => {
    target.classList.remove('fsrs-breadcrumb-target');
    breadcrumbHighlightTimer = null;
  }, 900);
  return true;
}

async function enterBreadcrumbContext(blockId: string) {
  saveCurrentScrollPosition();
  breadcrumbContextId.value = blockId;
  await loadEditor({ updateAnswerState: false });
  await nextTick();
  const saved = breadcrumbScrollPositions.get(blockId);
  if (typeof saved === 'number') {
    scrollToTop(saved);
    return;
  }
  if (!scrollToBlockElement(blockId)) {
    scrollToTop(0);
  }
}

async function exitBreadcrumbContext() {
  if (!breadcrumbContextId.value) return;
  saveCurrentScrollPosition();
  breadcrumbContextId.value = '';
  await loadEditor({ updateAnswerState: false });
  await nextTick();
  const saved = breadcrumbScrollPositions.get(CARD_SCROLL_KEY);
  if (typeof saved === 'number') {
    scrollToTop(saved);
    return;
  }
  const currentBlockId = currentCard.value?.blockID;
  if (currentBlockId) {
    scrollToBlockElement(currentBlockId);
  } else {
    scrollToTop(0);
  }
}

function handleBreadcrumbClick(item: IBreadcrumbItem) {
  if (!isDrillMode.value) return;
  enterBreadcrumbContext(item.id);
}

function toggleBreadcrumbLock() {
  if (!isDrillMode.value) return;
  isBreadcrumbLocked.value = !isBreadcrumbLocked.value;
  debugLog('toggle lock', { locked: isBreadcrumbLocked.value });
  if (!isBreadcrumbLocked.value) {
    lockedBreadcrumbs.value = [];
    lockedBreadcrumbForId.value = '';
    return;
  }
  const blockId = getViewBlockId();
  lockedBreadcrumbForId.value = blockId;
  lockedBreadcrumbs.value = [...breadcrumbs.value];
}

function applyDrillCards(cards: any[], total?: number) {
  cardsData.value.cards = [...cards];
  currentIndex.value = 0;
  pendingUnreviewedCount.value = 0;
  initialDrillTotal.value = total || cardsData.value.cards.length;
  initStats();
  if (cardsData.value.cards.length > 0) {
    nextCard();
  } else {
    allDone();
  }
}

async function startNewBlockPractice() {
  breadcrumbContextId.value = '';
  lockedBreadcrumbs.value = [];
  lockedBreadcrumbForId.value = '';
  breadcrumbs.value = [];
  isBreadcrumbLocked.value = true;
  breadcrumbScrollPositions.clear();
  resetDrillStats(props.cards.length);
  applyDrillCards(props.cards, props.cards.length);
  await saveBlockPracticeProgress();
}

async function handleResumeContinue() {
  const stored = resumeData.value;
  showResumePrompt.value = false;
  if (!stored) {
    await startNewBlockPractice();
    return;
  }
  breadcrumbContextId.value = '';
  lockedBreadcrumbs.value = [];
  lockedBreadcrumbForId.value = '';
  breadcrumbs.value = [];
  isBreadcrumbLocked.value = true;
  breadcrumbScrollPositions.clear();
  applyStoredStats(stored);
  resumeCompleted.value = stored.completed || 0;
  resumeTotal.value = stored.total || stored.remainingCards?.length || 0;
  applyDrillCards(stored.remainingCards || [], resumeTotal.value);
  await saveBlockPracticeProgress();
}

async function handleResumeStartOver() {
  showResumePrompt.value = false;
  clearBlockPracticeProgress();
  await startNewBlockPractice();
}

function flipElement(queue: any[], lowestPick = 5, lowestInsert = 3, highestInsert = 6) {
  if (queue.length < lowestPick) return;
  const pickMinIndex = lowestPick - 1;
  const pickIndex = pickMinIndex + Math.floor(Math.random() * (queue.length - pickMinIndex));
  const insertMinIndex = lowestInsert - 1;
  const insertMaxIndex = Math.min(highestInsert, queue.length) - 1;
  const insertIndex = insertMinIndex + Math.floor(Math.random() * (insertMaxIndex - insertMinIndex + 1));
  let adjustedPickIndex = pickIndex;
  if (adjustedPickIndex === insertIndex) {
    adjustedPickIndex += 1;
    if (adjustedPickIndex >= queue.length) return;
  }
  const [item] = queue.splice(adjustedPickIndex, 1);
  queue.splice(insertIndex, 0, item);
}

function prepareDrillQueue() {
  flipElement(cardsData.value.cards, 5, 3, 6);
}

function getViewBlockId() {
  return breadcrumbContextId.value || currentCard.value?.blockID || '';
}

function hideBreadcrumbLastText(breadcrumb: any) {
  const texts = breadcrumb?.element?.querySelectorAll('.protyle-breadcrumb__text');
  if (!texts || texts.length === 0) return;
  const last = texts[texts.length - 1] as HTMLElement | null;
  if (last) {
    last.style.display = 'none';
  }
}

function renderPinnedBreadcrumb(protyle: IProtyle, blockId: string) {
  const breadcrumb = protyle.breadcrumb as any;
  if (!breadcrumb) return;
  const temp = document.createElement('div');
  temp.setAttribute('data-node-id', blockId);
  breadcrumb.render(protyle, true, temp);
  hideBreadcrumbLastText(breadcrumb);
}

function ensurePinnedBreadcrumbHook(protyle: IProtyle) {
  const breadcrumb = protyle.breadcrumb as any;
  if (!breadcrumb || breadcrumb._fsrsPinnedHook) return;
  breadcrumb._fsrsPinnedHook = true;
  breadcrumb._fsrsRender = breadcrumb.render.bind(breadcrumb);
  breadcrumb.render = (p: any, update = false, nodeElement?: Element | false) => {
    const pinnedId = pinnedBreadcrumbId.value;
    if (!pinnedId) {
      return breadcrumb._fsrsRender(p, update, nodeElement);
    }
    p.block.id = pinnedId;
    p.block.showAll = true;
    const temp = document.createElement('div');
    temp.setAttribute('data-node-id', pinnedId);
    return breadcrumb._fsrsRender(p, true, temp);
  };
}

// 加载内容 - 使用 Protyle 渲染
async function loadEditor(options: { updateAnswerState?: boolean } = {}) {
  if (!currentCard.value) return;
  const updateAnswerState = options.updateAnswerState !== false;

  if (!breadcrumbContextId.value && isCurrentWebpage.value) {
    if (editorRef.value) {
      editorRef.value.destroy();
      editorRef.value = null;
    }
    if (blockRef.value) {
      blockRef.value.innerHTML = '';
    }
    cancelCardTransition();
    if (updateAnswerState) {
      hideAnswer.value = false;
      showAnswer.value = true;
    }
    return;
  }

  const blockID = getViewBlockId();
  if (!blockID) return;
  debugLog('loadEditor', { blockID, cardBlockId: currentCard.value?.blockID, contextId: breadcrumbContextId.value });
  ensureEditor();
  const protyle = editorRef.value?.protyle;
  const wysiwyg = protyle?.wysiwyg?.element;
  if (!protyle || !wysiwyg) return;

  try {
    const docInfo = await getBlockDocInfo(blockID);
    const ial = docInfo?.ial || docInfo?.data?.ial;
    if (ial) {
      protyle.wysiwyg?.renderCustom(ial);
    }

    const docData = await getDocContent(blockID, 102400, 0);
    const html = docData?.content;
    if (html) {
      wysiwyg.innerHTML = html;
    } else {
      const domData = await getBlockDOM(blockID);
      wysiwyg.innerHTML = domData?.dom || `<p>${t('blockLabel', '块')} ${blockID}</p>`;
    }

    await nextTick();
    
    // FSRS Custom Rendering: Force parse == as mark if not rendered
    renderFSRSCloze(wysiwyg);

    protyle.block.id = blockID;
    protyle.block.showAll = true;
    protyle.block.showAll = true;
    finishCardTransition();
    
    if (isDrillMode.value) {
        // 刻意练习模式：使用自定义层级面包屑
        fetchBreadcrumbs(blockID);
    } else {
        // 普通模式：使用 Pinned Hook
        pinnedBreadcrumbId.value = blockID;
        ensurePinnedBreadcrumbHook(protyle);
        renderPinnedBreadcrumb(protyle, blockID);
    }

    if (updateAnswerState) {
      checkHideAnswer();
    }
  } catch (err) {
    console.error('Load error:', err);
    cancelCardTransition();
    wysiwyg.innerHTML = `<p class="ft__error">${t('loadFailed', '加载失败')}</p>`;
  }
}

function renderFSRSCloze(element: HTMLElement) {
    if (!isClozeCard.value) return;
    
    // Manual parsing for unrendered marks (==text==)
    // Walk through text nodes to find ==...== pattern
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const nodesToReplace: { node: Text, fragments: DocumentFragment }[] = [];
    
    let currentNode: Node | null;
    while (currentNode = walker.nextNode()) {
        const textNode = currentNode as Text;
        const text = textNode.textContent || '';
        const regex = /==(.+?)==/g;
        
        if (regex.test(text)) {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;
            
            // Reset regex
            regex.lastIndex = 0;
            
            let hasMatch = false;
            while ((match = regex.exec(text)) !== null) {
                hasMatch = true;
                // Text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                }
                
                // Match content -> styled span
                const span = document.createElement('span');
                span.setAttribute('data-type', 'mark');
                span.textContent = match[1]; // The content inside ==
                fragment.appendChild(span);
                
                lastIndex = regex.lastIndex;
            }
            
            if (hasMatch) {
                // Remaining text
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
                }
                nodesToReplace.push({ node: textNode, fragments: fragment });
            }
        }
    }
    
    // Perform replacements
    nodesToReplace.forEach(({ node, fragments }) => {
        node.parentNode?.replaceChild(fragments, node);
    });
}

function applyHideClasses(hasHide: boolean) {
  const el = editorRef.value?.protyle?.element;
  if (!el) return;

  el.classList.remove('card__block--hidemark', 'card__block--hideli', 'card__block--hidesb', 'card__block--hideh');

  if (!hasHide) return;

  const config = (window as any)?.siyuan?.config?.flashcard;
  if (!config) return;

  if (config.superBlock) el.classList.add('card__block--hidesb');
  if (config.heading) el.classList.add('card__block--hideh');
  if (config.list) el.classList.add('card__block--hideli');
  
  // FSRS Enforced Cloze: If strictly a cloze card, always hide marks
  if (isClozeCard.value || config.mark) {
      el.classList.add('card__block--hidemark');
  }
}

// 检查是否有需要遮挡的内容
function checkHideAnswer() {
  // Topic 模式：直接显示全部内容，不遮挡
  if (isTopicMode.value) {
    hideAnswer.value = false;
    showAnswer.value = true;
    applyHideClasses(false);
    return;
  }

  const wysiwyg = editorRef.value?.protyle?.wysiwyg?.element;
  if (!wysiwyg) {
    hideAnswer.value = false;
    return;
  }

  const config = (window as any)?.siyuan?.config?.flashcard;
  let hasHide = false;

  if (!config || (!config.superBlock && !config.heading && !config.list && !config.mark && !isClozeCard.value)) {
    hasHide = false;
  } else {
    if (config?.superBlock && wysiwyg.querySelector(':scope > .sb')) hasHide = true;
    if (config?.heading && wysiwyg.querySelector(':scope > [data-type="NodeHeading"]')) hasHide = true;
    if (config?.list && wysiwyg.querySelector('.list, .li')) hasHide = true;
    // FSRS Enforced Cloze: If strictly a cloze card or config enabled, check for marks
    if ((isClozeCard.value || config?.mark) && wysiwyg.querySelector('span[data-type~="mark"]')) hasHide = true;
  }

  hideAnswer.value = hasHide;
  applyHideClasses(hasHide);

  if (!hasHide) {
    showAnswer.value = true;
  }
}

function updateDrillTiming() {
  if (!cardStartAt.value) return;
  drillDurationMs.value += Date.now() - cardStartAt.value;
  cardStartAt.value = null;
}

function recordDrillAnswer(isCorrect: boolean) {
  drillAnsweredCount.value += 1;
  if (isCorrect) {
    drillCorrectCount.value += 1;
  }
  updateDrillTiming();
}

// 显示答案
function handleShowAnswer() {
  hideAnswer.value = false;
  showAnswer.value = true;
  applyHideClasses(false);
}

// Topic 模式：继续漫游
async function handleTopicNext() {
  if (!currentCard.value) return;
  if (isNeuralPractice.value && props.getNextDrillCard) {
    // 获取下一个节点（不评分，直接跳过）
    const next = await props.getNextDrillCard(currentCard.value, 'skip');
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    if (isStrategySession.value) {
      void refreshQueueStats();
    }
  }
}

async function handleCustom(actionId: string) {
  if (!currentCard.value) return;
  if (isStrategySession.value && props.queueSession) {
    await props.queueSession.onFeedback(currentCard.value, { action: 'custom', customActionId: actionId });
    const next = await props.queueSession.next();
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    void refreshQueueStats();
    return;
  }
  if (!props.getNextDrillCard) return;
  const next = await props.getNextDrillCard(currentCard.value, 'custom', undefined, actionId);
  if (!next) {
    allDone();
    return;
  }
  cardsData.value.cards = [next];
  currentIndex.value = 0;
  nextCard();
}

async function rateDrill(rating: 1 | 2 | 3 | 4) {
  if (!currentCard.value) return;
  if (isStrategySession.value && props.queueSession) {
    await props.queueSession.onFeedback(currentCard.value, { action: 'rate', rating });
    const next = await props.queueSession.next();
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    return;
  }
  if (props.getNextDrillCard) {
    const next = await props.getNextDrillCard(currentCard.value, 'rate', rating);
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    return;
  }
  const queue = cardsData.value.cards;
  if (isBlockPractice.value) {
    recordDrillAnswer(rating >= 4);
  }
  if (rating >= 4) {
    queue.splice(currentIndex.value, 1);
  } else {
    const [item] = queue.splice(currentIndex.value, 1);
    queue.push(item);
  }
  if (queue.length === 0) {
    allDone();
    return;
  }
  currentIndex.value = 0;
  nextCard();
  if (isBlockPractice.value) {
    await saveBlockPracticeProgress();
  }
}

async function rateStandard(rating: 1 | 2 | 3 | 4) {
  if (!currentCard.value) return;
  const durationMs = standardCardStartAt.value ? Date.now() - standardCardStartAt.value : undefined;
  standardCardStartAt.value = null;
  if (props.eventBus) {
    try {
      await props.eventBus.emit('CARD_RATED', {
        deckId: currentCard.value.deckID || props.deckID,
        cardId: currentCard.value.cardID,
        rating,
        durationMs,
        reviewedCards: cardsData.value.cards,
      });
    } catch (err) {
      console.error('CARD_RATED error:', err);
    }
    goNext();
    return;
  }
  try {
    await riff.reviewRiffCard(
      currentCard.value.deckID || props.deckID,
      currentCard.value.cardID,
      rating,
      cardsData.value.cards
    );
  } catch (err) {
    console.error('Rating error:', err);
  }
  goNext();
}

async function skipDrill() {
  if (!currentCard.value) return;
  if (isStrategySession.value && props.queueSession) {
    await props.queueSession.onFeedback(currentCard.value, { action: 'skip' });
    const next = await props.queueSession.next();
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    return;
  }
  if (props.getNextDrillCard) {
    const next = await props.getNextDrillCard(currentCard.value, 'skip');
    if (!next) {
      allDone();
      return;
    }
    cardsData.value.cards = [next];
    currentIndex.value = 0;
    nextCard();
    return;
  }
  const queue = cardsData.value.cards;
  if (isBlockPractice.value) {
    recordDrillAnswer(false);
  }
  const [item] = queue.splice(currentIndex.value, 1);
  queue.push(item);
  currentIndex.value = 0;
  nextCard();
  if (isBlockPractice.value) {
    await saveBlockPracticeProgress();
  }
}

async function skipStandard() {
  if (!currentCard.value) return;
  const durationMs = standardCardStartAt.value ? Date.now() - standardCardStartAt.value : undefined;
  standardCardStartAt.value = null;
  if (props.eventBus) {
    try {
      await props.eventBus.emit('CARD_SKIPPED', {
        deckId: currentCard.value.deckID || props.deckID,
        cardId: currentCard.value.cardID,
        durationMs,
      });
    } catch (err) {
      console.error('CARD_SKIPPED error:', err);
    }
  } else {
  try {
    await riff.skipReviewRiffCard(
      currentCard.value.deckID || props.deckID,
      currentCard.value.cardID
    );
  } catch (err) {
    console.error('Skip error:', err);
  }
  }
  
  // 更新计数
  if (currentCard.value.state === 0) {
    cardsData.value.unreviewedNewCardCount--;
  } else {
    cardsData.value.unreviewedOldCardCount--;
  }
  
  cardsData.value.cards.splice(currentIndex.value, 1);
  
  if (cardsData.value.cards.length === 0) {
    allDone();
  } else {
    if (currentIndex.value >= cardsData.value.cards.length) {
      currentIndex.value--;
    }
    nextCard();
  }
}

function cloneValue<T>(value: T): T {
  const deproxy = (v: any): any => {
    const raw = isProxy(v) ? toRaw(v) : v;
    if (!raw) return raw;
    if (Array.isArray(raw)) return raw.map((x) => deproxy(x));
    if (typeof raw === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(raw)) out[k] = deproxy(raw[k]);
      return out;
    }
    return raw;
  };

  const plain = deproxy(value);
  const cloner = (globalThis as any)?.structuredClone;
  if (typeof cloner === 'function') {
    try {
      return cloner(plain);
    } catch {
      return JSON.parse(JSON.stringify(plain));
    }
  }
  return JSON.parse(JSON.stringify(plain));
}

function pushSnapshot(action: 'rate' | 'skip', options: { standardRated?: ReviewSessionSnapshot['standardRated'] } = {}) {
  const snapshot: ReviewSessionSnapshot = {
    mode: getReviewMode(),
    action,
    timestamp: Date.now(),
    cards: cloneValue(cardsData.value.cards),
    currentIndex: currentIndex.value,
    unreviewedNewCardCount: cardsData.value.unreviewedNewCardCount,
    unreviewedOldCardCount: cardsData.value.unreviewedOldCardCount,
    drillAnsweredCount: drillAnsweredCount.value,
    drillCorrectCount: drillCorrectCount.value,
    drillDurationMs: drillDurationMs.value,
    breadcrumbContextId: breadcrumbContextId.value,
    isBreadcrumbLocked: isBreadcrumbLocked.value,
    lockedBreadcrumbForId: lockedBreadcrumbForId.value,
    lockedBreadcrumbs: cloneValue(lockedBreadcrumbs.value),
    breadcrumbs: cloneValue(breadcrumbs.value),
    pinnedBreadcrumbId: pinnedBreadcrumbId.value,
    standardRated: options.standardRated,
  };
  history.value.push(snapshot);
  if (history.value.length > 30) {
    history.value.splice(0, history.value.length - 30);
  }
}

async function handleUndo() {
  await currentState.value.undo();
}

async function undoStandard() {
  const snapshot = history.value[history.value.length - 1];
  if (!snapshot || snapshot.mode !== 'standard' || snapshot.action !== 'rate' || !snapshot.standardRated) {
    return;
  }
  history.value.pop();

  const filterType = snapshot.standardRated.filterType;
  const filterId = snapshot.standardRated.filterId;
  const type = filterType === 'doc' ? 'tree' : (filterType === 'notebook' ? 'notebook' : 'deck');
  const id = filterType === 'all' ? (filterId || snapshot.standardRated.deckID) : filterId;

  if (props.eventBus) {
    await props.eventBus.emit('REVOKE_RATING', {
      type,
      id,
      deckId: snapshot.standardRated.deckID,
      blockId: snapshot.standardRated.blockID,
    });
  } else {
    await riff.resetRiffCards(type, id, snapshot.standardRated.deckID, [snapshot.standardRated.blockID]);
  }

  cardsData.value.cards = cloneValue(snapshot.cards);
  cardsData.value.unreviewedNewCardCount = snapshot.unreviewedNewCardCount;
  cardsData.value.unreviewedOldCardCount = snapshot.unreviewedOldCardCount;
  currentIndex.value = snapshot.currentIndex;
  showAnswer.value = false;
  hideAnswer.value = true;
  pendingUnreviewedCount.value = 0;
  loadEditor();
}

async function undoDrill() {
  if (isStrategySession.value || typeof props.getNextDrillCard === 'function') {
    return;
  }
  const snapshot = history.value[history.value.length - 1];
  if (!snapshot || snapshot.mode === 'standard' || snapshot.action !== 'rate') {
    return;
  }
  history.value.pop();

  cardsData.value.cards = cloneValue(snapshot.cards);
  currentIndex.value = snapshot.currentIndex;
  drillAnsweredCount.value = snapshot.drillAnsweredCount;
  drillCorrectCount.value = snapshot.drillCorrectCount;
  drillDurationMs.value = snapshot.drillDurationMs;

  breadcrumbContextId.value = snapshot.breadcrumbContextId;
  isBreadcrumbLocked.value = snapshot.isBreadcrumbLocked;
  lockedBreadcrumbForId.value = snapshot.lockedBreadcrumbForId;
  lockedBreadcrumbs.value = cloneValue(snapshot.lockedBreadcrumbs);
  breadcrumbs.value = cloneValue(snapshot.breadcrumbs);
  pinnedBreadcrumbId.value = snapshot.pinnedBreadcrumbId;

  showAnswer.value = false;
  hideAnswer.value = true;
  loadEditor();
}

// 评分
async function handleRating(rating: 1 | 2 | 3 | 4) {
  if (currentCard.value && currentState.value.shouldShowRatingBtns()) {
    if (!isDrillMode.value) {
      pushSnapshot('rate', {
        standardRated: {
          deckID: String(currentCard.value.deckID || props.deckID),
          blockID: String(currentCard.value.blockID),
          filterType: filterCardType.value,
          filterId: filterId.value,
        },
      });
    } else {
      pushSnapshot('rate');
    }
  }
  await currentState.value.onRating(rating);
}

// 跳过
async function handleSkip() {
  await currentState.value.onSkip();
}

// 上一张
function handlePrev() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    nextCard();
  }
}

// 下一张
function goNext() {
  if (isDrillMode.value) {
    nextCard();
    return;
  }
  currentIndex.value++;
  
  if (currentIndex.value >= cardsData.value.cards.length) {
    fetchNewRound();
  } else {
    nextCard();
  }
}

// 加载下一张卡片
function nextCard() {
  beginCardTransition();
  saveCurrentScrollPosition();
  breadcrumbContextId.value = '';
  if (blockScrollRef.value) {
    blockScrollRef.value.scrollTop = 0;
  }
  clearBreadcrumbHighlight();
  showAnswer.value = false;
  hideAnswer.value = true;
  if (isDrillMode.value) {
    currentIndex.value = 0;
    prepareDrillQueue();
    standardCardStartAt.value = null;
  }
  if (isBlockPractice.value) {
    cardStartAt.value = Date.now();
  } else if (!isDrillMode.value) {
    standardCardStartAt.value = Date.now();
  }
  debugLog('nextCard', { blockId: currentCard.value?.blockID, locked: isBreadcrumbLocked.value });
  loadEditor();
}

// 获取新一轮
async function fetchNewRound() {
  try {
    const type = filterCardType.value;
    const id = filterId.value;
    const reviewedCards = cardsData.value.cards && cardsData.value.cards.length > 0
      ? cardsData.value.cards
      : [];
    let data: any;
    if (type === 'doc') {
      data = await riff.getTreeRiffDueCards(id, reviewedCards);
    } else if (type === 'notebook') {
      data = await riff.getNotebookRiffDueCards(id, reviewedCards);
    } else {
      const deckId = id || props.deckID;
      data = await riff.getRiffDueCards(deckId, '', '', reviewedCards);
    }
    if (data?.cards?.length > 0) {
      cardsData.value = data;
      currentIndex.value = 0;
      pendingUnreviewedCount.value = 0;
      nextCard();
    } else if (data?.unreviewedCount > 0) {
      pendingUnreviewedCount.value = data.unreviewedCount;
      cardsData.value.cards = [];
    } else {
      allDone();
    }
  } catch {
    allDone();
  }
}



// 筛选
async function handleFilter(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  let decks: any[] = [];
  try {
    decks = await riff.getRiffDecks();
  } catch {}
  const menu = new Menu();
  menu.addItem({
    icon: 'iconFilter',
    label: t('all', '全部'),
    click() {
      filterId.value = '';
      filterCardType.value = 'all';
      fetchNewRound();
    }
  });
  menu.addItem({
    icon: 'iconFile',
    label: t('specifyDocId', '指定文档ID'),
    click: async () => {
      const id = await inputDialog({ title: t('specifyDocId', '指定文档ID'), confirmText: t('confirm', '确认'), cancelText: t('cancel', '取消') });
      if (id) {
        filterId.value = id;
        filterCardType.value = 'doc';
        fetchNewRound();
      }
    }
  });
  menu.addItem({
    icon: 'iconNotebook',
    label: t('specifyNotebookId', '指定笔记本ID'),
    click: async () => {
      const id = await inputDialog({ title: t('specifyNotebookId', '指定笔记本ID'), confirmText: t('confirm', '确认'), cancelText: t('cancel', '取消') });
      if (id) {
        filterId.value = id;
        filterCardType.value = 'notebook';
        fetchNewRound();
      }
    }
  });
  if (decks && decks.length) {
    menu.addSeparator();
    decks.forEach((d: any) => {
      menu.addItem({
        label: d.name,
        click() {
          filterId.value = d.id;
          filterCardType.value = 'all';
          fetchNewRound();
        }
      });
    });
  }
  menu.open({ x: rect.left, y: rect.bottom });
}

function toggleFullscreen(element: HTMLElement, btnElement?: Element | null) {
  const isFullscreen = element.className.includes('fullscreen');
  if (isFullscreen) {
    element.classList.remove('fullscreen');
    // document.getElementById('drag')?.classList.remove('fn__hidden'); // Siyuan API change?
  } else {
    element.classList.add('fullscreen');
    // document.getElementById('drag')?.classList.add('fn__hidden');
  }
  if (btnElement) {
    const use = btnElement.querySelector('use');
    if (use) {
      use.setAttribute('xlink:href', isFullscreen ? '#iconFullscreen' : '#iconFullscreenExit');
    }
    const dockLayoutElement = element.closest('.layout--float') as HTMLElement | null;
    if (dockLayoutElement) {
      if (isFullscreen) {
        dockLayoutElement.setAttribute('data-temp', dockLayoutElement.style.transform);
        dockLayoutElement.style.transform = 'none';
      } else {
        dockLayoutElement.style.transform = dockLayoutElement.getAttribute('data-temp') || '';
        dockLayoutElement.removeAttribute('data-temp');
      }
    }
  }
}

function openCardTab(position?: 'right' | 'bottom') {
  const type = filterCardType.value;
  const id = type === 'all' ? '' : (filterId.value || '');
  if (!props.app) {
    alert(t('envNotInit', '当前环境未初始化，无法打开页签'));
    return;
  }
  openTab({
    app: props.app,
    custom: {
      icon: 'iconRiffCard',
      title: t('reviewTitle', 'FSRS 复习'),
      id: 'siyuan-card',
      data: {
        cardsData: cardsData.value,
        index: currentIndex.value,
        cardType: type,
        id,
      },
    },
    position,
    openNewTab: true,
  });
  emit('close');
}

function openSrsEditor() {
  const card = currentCard.value;
  if (!card) return;
  if (srsDialog) {
    srsDialog.destroy();
  }
  srsDialog = createVueDialog({
    title: t('editSrsData', '编辑SRS数据'),
    component: SrsEditorDialog,
    props: {
      card: {
        cardID: card.cardID,
        blockID: card.blockID,
        deckID: card.deckID,
      },
      deckID: props.deckID,
      i18n: props.i18n || {},
    },
    width: '760px',
    height: '70vh',
    onClose: () => {
      srsDialog = null;
    },
  });
}

function handleOpenBy(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const menu = new Menu();
  menu.addItem({
    icon: 'iconOpen',
    label: t('openInNewTab', '在新页签中打开'),
    click: () => openCardTab(),
  });
  menu.addItem({
    icon: 'iconLayoutRight',
    label: t('openOnRight', '在页签右侧打开'),
    click: () => openCardTab('right'),
  });
  menu.addItem({
    icon: 'iconOpenWindow',
    label: t('openInNewWindow', '使用新窗口打开'),
    click: () => alert(t('notSupportNewWindow', '暂不支持新窗口打开')),
  });
  menu.open({ x: rect.left, y: rect.bottom });
}

// 全屏
function handleFullscreen() {
  if (mainRef.value) {
    const button = mainRef.value.querySelector('[data-type="fullscreen"]');
    toggleFullscreen(mainRef.value, button || undefined);
    try {
      localStorage.setItem('fsrs.flashcard.fullscreen', String(mainRef.value.classList.contains('fullscreen')));
    } catch {}
    editorRef.value?.resize();
  }
}

// 更多
function handleMore(e: MouseEvent) {
  if (!currentCard.value) return;
  if (filterCardType.value === 'all' && filterId.value) {
    alert(t('filterNotSupported', '当前过滤条件不支持此操作'));
    return;
  }
  const card = currentCard.value;
  const target = e.currentTarget as HTMLElement | null;
  const rect = target ? target.getBoundingClientRect() : null;
  const x = rect && rect.width ? rect.left : e.clientX;
  const y = rect && rect.height ? rect.bottom : e.clientY;
  const menu = new Menu();
  menu.addItem({
    icon: 'iconClock',
    label: t('setDueTime', '设置到期时间'),
    click: async () => {
      const daysStr = await inputDialog({ title: t('setDueDaysPrompt', '设置几天后到期？'), defaultValue: '1', confirmText: t('confirm', '确认'), cancelText: t('cancel', '取消') });
      if (daysStr) {
        const days = parseInt(daysStr);
        const due = new Date();
        due.setDate(due.getDate() + days);
        const dueStr = due.toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
        const rawCardID = String((card as any)?.cardID || '');
        const blockID = String((card as any)?.blockID || '');
        let riffCardID = rawCardID;
        if (!/^\d{19}$/.test(riffCardID) && blockID) {
          try {
            const blocks = await riff.getRiffCardsByBlockIDs([blockID]);
            const resolved = String((blocks?.[0] as any)?.riffCard?.id || '');
            if (resolved) riffCardID = resolved;
          } catch {}
        }
        console.log('[FSRS] setDueTime cardID:', rawCardID, 'resolved:', riffCardID, 'blockID:', blockID, 'mode:', props.practiceMode);
        await riff.batchSetRiffCardsDueTime([{ id: riffCardID, due: dueStr }]);
        handleSkip();
      }
    }
  });
  if (card.state !== 0) {
    menu.addItem({
      icon: 'iconRefresh',
      label: t('reset', '重置'),
      click: async () => {
        const type = filterCardType.value === 'doc' ? 'tree' : (filterCardType.value === 'notebook' ? 'notebook' : 'deck');
        const id = filterCardType.value === 'all' ? (filterId.value || props.deckID) : filterId.value;
        await riff.resetRiffCards(type, id, props.deckID, [card.blockID]);
        loadEditor();
      }
    });
  }
  menu.addItem({
    icon: 'iconEdit',
    label: t('editSrsData', '编辑SRS数据'),
    click: () => openSrsEditor(),
  });
  menu.addItem({
    icon: 'iconTrashcan',
    label: t('removeCard', '移除闪卡'),
    click: async () => {
      await riff.removeRiffCards(props.deckID, [card.blockID]);
      handleSkip();
    }
  });
  menu.addSeparator();
  menu.addItem({
    type: 'readonly',
    label: `<div class="fn__flex"><span class="fn__flex-1">${t('lapses', '遗忘次数')}</span><span>${card.lapses || 0}</span></div>
<div class="fn__flex"><span class="fn__flex-1">${t('reps', '复习次数')}</span><span>${card.reps || 0}</span></div>
<div class="fn__flex"><span class="fn__flex-1">${t('cardState', '卡片状态')}</span><span class="${card.state === 0 ? 'ft__primary' : 'ft__success'}">${card.state === 0 ? t('newCard', '新卡') : t('reviewCard', '复习卡')}</span></div>`
  });
  menu.open({ x, y });
}


// 键盘事件
function handleKeydown(e: KeyboardEvent) {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    void handleUndo();
    return;
  }

  if (!currentCard.value) return;

  let type = '';
  
  if (['1', 'j', 'a'].includes(key)) type = '1';
  else if (['2', 'k', 's'].includes(key)) type = '2';
  else if (['3', 'l', 'd'].includes(key)) type = '3';
  else if (['4', ';', 'f'].includes(key)) type = '4';
  else if ([' ', 'enter'].includes(key)) type = '-1';
  else if (['p', 'q'].includes(key)) type = '-2';
  else if (['0', 'x'].includes(key)) type = '-3';
  
  if (!type) return;
  
  e.preventDefault();
  
  if (type === '-1') {
    if (isTopicMode.value) {
      handleTopicNext();
      return;
    }
    if (hideAnswer.value) {
      handleShowAnswer();
    } else {
      handleRating(3);
    }
  } else if (type === '-2') {
    handlePrev();
  } else if (type === '-3') {
    if (currentState.value.shouldShowRatingBtns()) handleSkip();
  } else if (currentState.value.shouldShowRatingBtns()) {
    handleRating(parseInt(type) as 1 | 2 | 3 | 4);
  }
}

// 初始化
function initStats() {
  let newC = 0, oldC = 0;
  cardsData.value.cards.forEach((card: any) => {
    if (card.state === 0) newC++;
    else oldC++;
  });
  cardsData.value.unreviewedNewCardCount = newC;
  cardsData.value.unreviewedOldCardCount = oldC;
}

async function initializeBlockPractice() {
  const stored = await clearExpiredOrInvalidProgress();
  if (stored && (stored.remainingCards?.length || 0) > 0) {
    resumeData.value = stored;
    const total = stored.total || stored.remainingCards.length;
    const completed = stored.completed ?? Math.max(0, total - stored.remainingCards.length);
    resumeCompleted.value = completed;
    resumeTotal.value = total;
    resumeLastTimeText.value = formatLastTime(stored.savedAt);
    showResumePrompt.value = true;
    await nextTick();
    resumeContinueRef.value?.focus();
    return;
  }
  await startNewBlockPractice();
}

function getReviewMode(): FsrsReviewMode {
  if (!isDrillMode.value) return 'standard';
  if (props.practiceMode === 'block') return 'block';
  if (props.practiceMode === 'retrieval-practice') return 'retrieval-practice';
  if (props.practiceMode === 'final-drill') return 'final-drill';
  if (props.practiceMode === 'filter-group') return 'filter-group';
  if (props.practiceMode === 'neural-wandering' || props.practiceMode === 'neural') return 'neural-wandering';
  if (props.practiceMode === 'leech') return 'leech';
  return 'queue';
}

onMounted(() => {
  console.log('[FSRS] ReviewPanel v2 mounted, cards:', props.cards?.length);
  emptyText.value = t('completeToday', '今日复习已完成');
  void props.eventBus?.emit('REVIEW_SESSION_STARTED', { mode: getReviewMode(), deckId: props.deckID });
  const fs = localStorage.getItem('fsrs.flashcard.fullscreen');
  if (fs === 'true' && mainRef.value) {
    const button = mainRef.value.querySelector('[data-type="fullscreen"]');
    toggleFullscreen(mainRef.value, button || undefined);
  }
  if (isBlockPractice.value) {
    initializeBlockPractice();
  } else {
    initStats();
    if (isStrategySession.value && cardsData.value.cards.length === 0 && props.queueSession) {
      props.queueSession.next().then((next) => {
        if (!next) return;
        cardsData.value.cards = [next];
        initialDrillTotal.value = 0;
        nextCard();
        void refreshQueueStats();
      }).catch(() => {});
    } else if (cardsData.value.cards.length === 0 && props.getNextDrillCard) {
      props.getNextDrillCard(null, 'skip').then((next) => {
        if (!next) return;
        cardsData.value.cards = [next];
        initialDrillTotal.value = 0;
        nextCard();
      }).catch(() => {});
    } else if (cardsData.value.cards.length > 0) {
      if (isDrillMode.value) {
        initialDrillTotal.value = cardsData.value.cards.length;
        nextCard();
      } else {
        loadEditor();
      }
    } else {
      fetchNewRound();
    }
  }
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  clearBreadcrumbHighlight();
  cancelCardTransition();
  cancelBreadcrumbTransition();
  if (isBlockPractice.value) {
    updateDrillTiming();
    if (!showResumePrompt.value && cardsData.value.cards.length > 0) {
      saveBlockPracticeProgress();
    }
  }
  try {
    editorRef.value?.destroy();
  } catch {}
});
// 完成
function allDone() {
  cardsData.value.cards = [];
  if (isDrillMode.value) {
    if (props.practiceMode === 'queue' || props.practiceMode === 'retrieval-practice' || props.practiceMode === 'final-drill' || props.practiceMode === 'filter-group') {
       emptyText.value = t('queuePracticeComplete', '祝贺你！连接已加固，回路强化完毕。');
    } else {
       emptyText.value = t('practiceComplete', '恭喜您，您距离无想神通更近一步。');
    }
  } else {
    emptyText.value = t('completeToday', '今日复习已完成');
  }
  if (isBlockPractice.value) {
    clearBlockPracticeProgress();
  }
  void props.eventBus?.emit('QUEUE_EMPTY', { queueId: isDrillMode.value ? (props.practiceMode || 'queue') : 'riff' });
}
</script>

<style>
/* 使用思源原生样式，不用 scoped */
/* 使用思源原生样式，不用 scoped */
.card__main {
  position: relative;
}

/* FSRS 自定义遮挡样式 - 强制覆盖 */
.card__block--hidemark span[data-type~="mark"] {
    color: transparent !important;
    background-color: var(--b3-theme-on-surface);
    opacity: 0.2;
    border-radius: 4px;
    padding: 2px 0;
    margin: 0 2px;
    transition: all 0.2s;
}

.card__block--hidemark span[data-type~="mark"]:hover {
    color: var(--b3-theme-on-surface) !important;
    background-color: var(--b3-theme-primary-lightest);
    opacity: 1;
}

.card__block--hideli .li > .list {
    display: none;
}

.card__block--hidesb .sb {
    display: none;
}

.card__block--hideh [data-type="NodeHeading"] {
    display: none;
}

.card__main.fullscreen {
  position: fixed !important;
  top: 0;
  left: 0;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 9999;
  background-color: var(--b3-theme-background);
  border-radius: 0;
  display: flex !important;
  flex-direction: column;
}

.fsrs-resume-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 5;
}

.fsrs-resume-container {
  width: min(480px, 92%);
}

.fsrs-resume-stats {
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}

.fsrs-progress {
  padding: 6px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fsrs-progress__bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--b3-theme-surface);
  overflow: hidden;
}

.fsrs-progress__fill {
  height: 100%;
  background: var(--b3-theme-primary);
  transition: width 0.3s ease;
}

.fsrs-progress__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-neural-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fsrs-neural-header__reason {
  color: var(--b3-theme-on-surface);
}

.fsrs-neural-header__from {
  opacity: 0.7;
}

/* 进度环样式 */
.fsrs-progress-ring {
  position: absolute;
  top: 6px; /* Center in ~40px header */
  left: 50%; /* Center horizontally */
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  z-index: 1;
  pointer-events: none; /* 防止遮挡点击 */
}

.ring-container {
  position: relative;
  width: 28px; /* Icon size */
  height: 28px;
}

.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(0deg); /* Start from top */
}

.ring-bg {
  fill: none;
  stroke: var(--b3-theme-surface);
  stroke-width: 3;
}

.ring-fill {
  fill: none;
  stroke: var(--b3-theme-primary);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}


.fsrs-drill-breadcrumb {
  padding: 16px 24px 8px; /* More padding */
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--b3-theme-background); /* Match editor bg */
}

.fsrs-breadcrumb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fsrs-breadcrumb-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.fsrs-breadcrumb-header__title {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-breadcrumb-header__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  min-width: 0;
  cursor: pointer;
  user-select: none;
  padding: 2px 6px;
  border-radius: 6px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.fsrs-breadcrumb-header__status--locked {
  color: var(--b3-theme-primary);
  background-color: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
}

.fsrs-breadcrumb-header__status-icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.fsrs-breadcrumb-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.fsrs-breadcrumb-list {
  position: relative;
  height: 120px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  contain: content;
  will-change: scroll-position;
}

.fsrs-breadcrumb-transition {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 1;
  transition: opacity 110ms cubic-bezier(0.2, 0, 0, 1);
  will-change: opacity;
}

.fsrs-breadcrumb-transition.is-fading {
  opacity: 0;
}

.fsrs-breadcrumb-transition__content {
  position: absolute;
  inset: 0;
  transform: translate3d(0, 0, 0);
}

.fsrs-drill-mode .card__block {
  scroll-behavior: smooth;
}

.fsrs-card-container {
  position: relative;
}

.fsrs-protyle-host {
  min-height: 100%;
}

.fsrs-card-transition {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
  opacity: 1;
  transition: opacity 130ms cubic-bezier(0.2, 0, 0, 1);
  will-change: opacity;
  background: var(--b3-theme-background);
}

.fsrs-card-transition.is-fading {
  opacity: 0;
}

.fsrs-card-transition__content {
  position: absolute;
  inset: 0;
  transform: translate3d(0, 0, 0);
}

.fsrs-breadcrumb-target {
  border-radius: 4px;
  box-shadow: 0 0 0 2px var(--b3-theme-primary);
  background-color: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
}

.fsrs-drill-breadcrumb {
  transition: padding 0.2s ease;
}

@media (max-width: 600px) {
  .fsrs-drill-breadcrumb {
    padding: 12px 14px 6px;
    gap: 6px;
  }
  .fsrs-breadcrumb-list {
    height: 96px;
  }
  .fsrs-breadcrumb-item {
    font-size: 14px;
  }
  .fsrs-breadcrumb-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .fsrs-breadcrumb-header__actions {
    gap: 6px;
  }
}

.fsrs-breadcrumb-item {
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  line-height: 1.5;
  font-size: 16px; /* Larger font */
  display: flex;
  align-items: center;
  transition: color 0.2s;
  font-weight: 500; /* Bolder */
}

.fsrs-breadcrumb-item--active {
  color: var(--b3-theme-primary);
}

.fsrs-breadcrumb-item--placeholder {
  color: var(--b3-theme-on-surface-light);
  cursor: default;
}

.fsrs-breadcrumb-item--placeholder:hover {
  text-decoration: none;
  color: var(--b3-theme-on-surface-light);
}

.fsrs-breadcrumb-item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary);
}

.fsrs-breadcrumb-text {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Remove overflow hidden to show full text like body */
  white-space: normal; 
  word-break: break-all;
}

.fsrs-breadcrumb-icon {
  display: none; /* Hide icon for body text look */
}

.fsrs-breadcrumb-arrow {
    display: none; /* Hide hierarchical arrow lines if looking lik body text */
}

/* Simulate Heading styles for breadcrumbs types? Optional */
.ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.ring-percent {
  font-size: 9px;
  font-weight: bold;
  color: var(--b3-theme-on-surface);
}

.ring-label {
  display: none;
}

.ring-meta {
  display: none; /* Hide count to avoid blocking header/breadcrumb */
}

.empty-text {
  font-size: 1.2em;
  font-weight: bold;
  opacity: 0.8;
  margin-top: 1em;
  display: block;
}

/* 隐藏旧进度条相关样式 (如果需要清理) */
.fsrs-progress,
.fsrs-progress__bar,
.fsrs-progress__fill,
.fsrs-progress__meta { 
  display: none !important; 
}

/* Topic 模式标识样式 */
.fsrs-topic-mode-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
  border-left: 3px solid var(--b3-theme-primary);
  margin: 8px 16px;
  border-radius: 4px;
}

.fsrs-topic-mode-badge__icon {
  font-size: 18px;
}

.fsrs-topic-mode-badge__text {
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}
</style>
