<template>
  <div
    v-if="showRevealStage"
    class="card__action card__action--reveal fn__flex"
    :class="{
      'card__action--mobile': props.isMobile,
      'card__action--desktop': !props.isMobile,
      'card__action--advancing': isAdvancing,
    }"
  >
    <template v-if="props.isMobile">
      <button
        class="b3-button b3-button--cancel card__action-button card__action-back"
        :disabled="isAdvancing || !canBack"
        @click="handleBackClick"
      >
        <svg><use xlink:href="#iconLeft"></use></svg>
        <span>{{ t('backToPractice', '返回') }}</span>
      </button>

      <button
        data-type="-1"
        aria-label="Space/Enter"
        class="b3-button b3-tooltips__n b3-tooltips card__action-button card__action-main card__action-main--reveal"
        :disabled="isAdvancing"
        @click="handleRevealClick"
      >
        {{ t('showAnswer', '显示答案') }}
      </button>

      <div class="card__action-skip">
        <SkipMenuButton
          :i18n="i18n"
          :queue-size="remainingSize"
          :is-mobile="props.isMobile"
          :can-schedule-date="canScheduleDate"
          :disabled="isAdvancing"
          :expanded="showSkipPanel"
          @skip="emit('skip')"
          @toggle-panel="toggleSkipPanel"
        />
      </div>
    </template>

    <template v-else>
      <button
        class="b3-button b3-button--cancel card__action-button card__action-back card__action-back--desktop-reveal"
        :disabled="isAdvancing || !canBack"
        @click="handleBackClick"
      >
        <svg><use xlink:href="#iconLeft"></use></svg>
        <span>(p / q)</span>
      </button>

      <button
        data-type="-1"
        aria-label="Space/Enter"
        class="b3-button b3-tooltips__n b3-tooltips card__action-button card__action-main card__action-main--reveal card__action-main--reveal-stacked"
        :disabled="isAdvancing"
        @click="handleRevealClick"
        >
        <div class="card__icon">👀</div>
        <span class="card__action-copy">
          <span class="card__action-label">{{ t('showAnswer', '显示答案') }}</span>
          <span class="card__action-hint">({{ t('space', '空格') }} / {{ t('enterKey', '回车') }})</span>
        </span>
      </button>

      <div class="card__action-skip card__action-skip--desktop-reveal">
        <SkipMenuButton
          :i18n="i18n"
          :queue-size="remainingSize"
          :is-mobile="props.isMobile"
          :can-schedule-date="canScheduleDate"
          :disabled="isAdvancing"
          :expanded="showSkipPanel"
          @skip="emit('skip')"
          @toggle-panel="toggleSkipPanel"
        />
      </div>
    </template>
    <span v-if="showAdvanceHint" class="card__action-advance-hint">
      {{ t('nextCardLoading', '下一张...') }}
    </span>
  </div>

  <div
    v-else
    class="card__action card__action--rating fn__flex"
    :class="{
      'card__action--mobile': props.isMobile,
      'card__action--desktop': !props.isMobile,
      'card__action--advancing': isAdvancing,
    }"
  >
    <template v-if="props.isMobile">
      <div class="card__action-column card__action-column--stack">
        <span
          class="card__action-meta card__action-meta--placeholder"
          aria-hidden="true"
        ></span>
        <button
          class="b3-button b3-button--cancel card__action-button card__action-back card__action-back--stacked"
          :disabled="isAdvancing || !canBack"
          @click="handleBackClick"
        >
          <svg><use xlink:href="#iconLeft"></use></svg>
          <span>{{ t('backToPractice', '返回') }}</span>
        </button>
        <div class="card__action-skip card__action-skip--stacked">
          <SkipMenuButton
            :i18n="i18n"
            :queue-size="remainingSize"
            :is-mobile="props.isMobile"
            :can-schedule-date="canScheduleDate"
            :disabled="isAdvancing"
            :expanded="showSkipPanel"
            @skip="emit('skip')"
            @toggle-panel="toggleSkipPanel"
          />
        </div>
      </div>

      <template v-if="isTopicCard">
        <div class="card__action-column card__action-column--topic-next">
          <span
            class="card__action-meta card__action-meta--placeholder"
            aria-hidden="true"
          ></span>
          <button
            data-type="3"
            aria-label="Space/Enter"
            class="b3-button b3-button--info b3-tooltips__n b3-tooltips card__action-button card__action-main"
            :disabled="isAdvancing"
            @click="handleTopicNextClick"
          >
            <div class="card__icon">📖</div>
            {{ t('nextCard', '下一张') }}
          </button>
        </div>
      </template>

      <template v-else>
        <div v-for="g in actions.grades" :key="g.value" class="card__action-column">
          <span
            class="card__action-meta"
            :class="getDueMetaClass(g.value)"
          >{{ g.nextDue || '' }}</span>
          <button
            :data-type="g.value"
            :aria-label="getRatingButtonAriaLabel(g.value, g.kb)"
            class="b3-button b3-tooltips__n b3-tooltips card__action-button card__action-main"
            :class="getButtonVariant(g.value)"
            :disabled="isAdvancing"
            @click="handleGradeClick(g.value, $event)"
          >
            <div class="card__icon">{{ g.emoji }}</div>
            {{ g.label }}
          </button>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="card__action-column card__action-column--stack card__action-column--stack-desktop">
        <button
          class="b3-button b3-button--cancel card__action-button card__action-back card__action-back--stacked"
          :disabled="isAdvancing || !canBack"
          @click="handleBackClick"
        >
          <svg><use xlink:href="#iconLeft"></use></svg>
          <span>(p / q)</span>
        </button>
        <div class="card__action-skip card__action-skip--stacked card__action-skip--stacked-desktop">
          <SkipMenuButton
            :i18n="i18n"
            :queue-size="remainingSize"
            :is-mobile="props.isMobile"
            :can-schedule-date="canScheduleDate"
            :disabled="isAdvancing"
            :expanded="showSkipPanel"
            @skip="emit('skip')"
            @toggle-panel="toggleSkipPanel"
          />
        </div>
      </div>

      <template v-if="isTopicCard">
        <div class="card__action-column card__action-column--topic-next">
          <span
            class="card__action-meta card__action-meta--placeholder"
            aria-hidden="true"
          ></span>
          <button
            data-type="3"
            aria-label="Space/Enter"
            class="b3-button b3-button--info b3-tooltips__n b3-tooltips card__action-button card__action-main"
            :disabled="isAdvancing"
            @click="handleTopicNextClick"
          >
            <div class="card__icon">📖</div>
            {{ t('nextCard', '下一张') }}
            <template> ({{ t('space', '空格') }} / {{ t('enterKey', '回车') }}) </template>
          </button>
        </div>
      </template>

      <template v-else>
        <div v-for="g in actions.grades" :key="g.value" class="card__action-column">
          <span
            class="card__action-meta"
            :class="getDueMetaClass(g.value)"
          >{{ g.nextDue || '' }}</span>
          <button
            :data-type="g.value"
            :aria-label="getRatingButtonAriaLabel(g.value, g.kb)"
            class="b3-button b3-tooltips__n b3-tooltips card__action-button card__action-main"
            :class="getButtonVariant(g.value)"
            :disabled="isAdvancing"
            @click="handleGradeClick(g.value, $event)"
          >
            <div class="card__icon">{{ g.emoji }}</div>
            {{ g.label }}
            <template>({{ g.kb }})</template>
          </button>
        </div>
      </template>
    </template>
    <span v-if="showAdvanceHint" class="card__action-advance-hint">
      {{ t('nextCardLoading', '下一张...') }}
    </span>
  </div>

  <section
    v-if="showSkipPanel"
    class="review-skip-panel"
    :class="{ 'review-skip-panel--mobile': props.isMobile }"
    role="region"
    :aria-label="t('skipLaterPanel', '跳过和稍后操作')"
  >
    <div class="review-skip-panel__card review-skip-panel__card--later">
      <div class="review-skip-panel__head">
        <strong>{{ t('reviewLaterTitle', '稍后再看') }}</strong>
        <span>{{ laterPanelMeta }}</span>
      </div>

      <div class="review-skip-panel__presets">
        <button
          v-for="preset in laterPresets"
          :key="preset.key"
          type="button"
          class="review-skip-panel__preset"
          :class="{ 'is-active': selectedLaterPresetKey === preset.key }"
          :disabled="!canInsertLater || isAdvancing"
          @click="selectLaterPosition(preset)"
        >
          {{ preset.label }}
        </button>
      </div>

      <label class="review-skip-panel__slider">
        <span>{{ t('currentPositionStart', '当前') }}</span>
        <input
          v-model.number="laterPosition"
          type="range"
          :min="1"
          :max="laterPositionMax"
          :disabled="!canInsertLater || isAdvancing"
          :aria-label="t('reviewLaterSlider', '稍后位置')"
          @input="handleLaterSliderInput"
        />
        <span>{{ laterPosition }} {{ t('cardsLaterUnit', '张后') }}</span>
      </label>

      <div class="review-skip-panel__commit">
        <div class="review-skip-panel__state">
          {{ laterSummary }}
        </div>
        <button
          type="button"
          class="b3-button b3-button--text review-skip-panel__commit-button"
          :disabled="!canInsertLater || isAdvancing"
          @click="confirmLaterPosition"
        >
          {{ t('placeCardLater', '放到稍后') }}
        </button>
      </div>
    </div>

    <div v-if="canScheduleDate" class="review-skip-panel__card review-skip-panel__card--schedule">
      <div class="review-skip-panel__head">
        <strong>{{ t('scheduleDate', '安排复习日期') }}</strong>
        <span>{{ t('scheduleLeavesCurrentQueue', '移出当前队列') }}</span>
      </div>

      <div class="review-skip-panel__date-presets">
        <button
          v-for="preset in schedulePresets"
          :key="preset.days"
          type="button"
          class="review-skip-panel__preset"
          :disabled="isAdvancing"
          @click="selectSchedulePreset(preset.days)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div class="review-skip-panel__date-custom">
        <input
          v-model="customScheduleDate"
          type="date"
          class="b3-text-field"
          :disabled="isAdvancing"
          :aria-label="t('chooseDate', '选择日期')"
        />
        <button
          type="button"
          class="b3-button"
          :disabled="!customScheduleDate || isAdvancing"
          @click="scheduleCustomDate"
        >
          {{ t('confirm', '确认') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import type { ReviewUIState } from './types';
import SkipMenuButton from './components/SkipMenuButton.vue';
import { createLogger } from '@/utils/logger';
import type FSRSPlugin from '@/index';
import type { IReviewQueue } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { isTopicLikeCard } from './reviewCardSemantics';
import { isNeuralRoamNonFlashcard } from './reviewRenderPolicy';
import { buildRatingAriaLabel, type ReviewRatingValue } from './reviewHotkeys';

const logger = createLogger('ReviewActions');

type ReviewQueueLike = IReviewQueue & {
  getRemainingSize?: () => number | Promise<number>;
  insertAt?: (cardId: string, position: number) => Promise<void>;
};

type ScheduleOptions = {
  mode: 'direct';
  dueDate: string;
};

type ScheduledReviewCardPayload = {
  cardId: string;
  blockId: string;
  dueTimestamp: number;
};

type LaterPresetKey = 'plus-5' | 'plus-10' | 'middle' | 'tail';

type LaterPreset = {
  key: LaterPresetKey;
  label: string;
  position: number;
};

const props = defineProps<{
  actions: ReviewUIState['actions'];
  i18n?: Record<string, string>;
  meta?: ReviewUIState['meta'];
  currentCard?: FSRSCard | null;
  queue?: ReviewQueueLike;
  queueType?: string;
  plugin?: FSRSPlugin;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: 'reveal'): void;
  (e: 'grade', rating: number): void;
  (e: 'skip'): void;
  (e: 'scheduled', payload: ScheduledReviewCardPayload): void;
  (e: 'back'): void;
  (e: 'command', cmdId: string): void;
  (e: 'openMenu', menu: ReviewUIState['actions']['menu'], ev: MouseEvent): void;
}>();

const isTopicCard = computed(() => {
  const card = props.actions.cardMeta;
  const result = isTopicLikeCard(card);
  logger.debug('isTopicCard computed', {
    cardMeta: card,
    type: card?.type,
    cardType: card?.cardType,
    isTopicCard: result,
  });
  return result;
});

const canScheduleDate = computed(() => !isNeuralRoamNonFlashcard(props.currentCard));
const isFilterGroupReview = computed(() => props.queueType === 'filter-group');

const showRevealStage = computed(() => (
  !isTopicCard.value
  && (props.actions.showAnswer || props.actions.grades.length === 0)
));

const remainingSize = computed(() => props.meta?.remainingSize || 0);
const canBack = computed(() => props.meta?.canBack === true);
const isAdvancing = computed(() => props.meta?.advancePending?.active === true);
const showAdvanceHint = ref(false);
let advanceHintTimer: ReturnType<typeof setTimeout> | null = null;

const showSkipPanel = ref(false);
const rememberedLaterPosition = ref(10);
const laterPosition = ref(10);
const customScheduleDate = ref('');
const selectedLaterPresetKey = ref<LaterPresetKey | null>(null);
const insertableQueueSize = computed(() => Math.max(0, remainingSize.value - 1));
const laterPositionMax = computed(() => Math.max(1, insertableQueueSize.value));
const canInsertLater = computed(() => (
  insertableQueueSize.value > 0
  && !!props.queue
  && typeof props.queue.insertAt === 'function'
));

const laterPresets = computed<LaterPreset[]>(() => {
  const max = laterPositionMax.value;
  return [
    { key: 'plus-5', label: t('reviewLaterFiveCards', '5 张后'), position: clampPosition(5) },
    { key: 'plus-10', label: t('reviewLaterTenCards', '10 张后'), position: clampPosition(10) },
    { key: 'middle', label: t('reviewLaterMiddle', '中段'), position: clampPosition(Math.ceil(max / 2)) },
    { key: 'tail', label: t('reviewLaterTail', '队尾'), position: max },
  ];
});

const schedulePresets = computed(() => [
  { days: 1, label: t('tomorrow', '明天') },
  { days: 3, label: t('threeDaysLater', '3 天后') },
  { days: 7, label: t('sevenDaysLater', '7 天后') },
]);

const laterPanelMeta = computed(() => {
  if (!canInsertLater.value) {
    return t('reviewLaterUnavailable', '当前队列不支持稍后插入');
  }

  return t('reviewLaterMeta', '剩余 {remaining} 张 · 记住上次：{position} 张后')
    .replace('{remaining}', String(remainingSize.value))
    .replace('{position}', String(clampPosition(rememberedLaterPosition.value)));
});

const laterSummary = computed(() => {
  if (!canInsertLater.value) {
    return t('reviewLaterUnavailableSummary', '没有可插入的后续队列位置。');
  }

  return t('reviewLaterSummary', '将当前卡放到第 {position} 张后，不改变复习日期。')
    .replace('{position}', String(clampPosition(laterPosition.value)));
});

watch(() => props.actions.grades, (grades) => {
  logger.debug('grades changed', { grades });
}, { immediate: true, deep: true });

watch(
  isAdvancing,
  (advancing) => {
    if (advanceHintTimer) {
      clearTimeout(advanceHintTimer);
      advanceHintTimer = null;
    }
    showAdvanceHint.value = false;
    if (!advancing) {
      return;
    }
    advanceHintTimer = setTimeout(() => {
      advanceHintTimer = null;
      if (isAdvancing.value) {
        showAdvanceHint.value = true;
      }
    }, 150);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (advanceHintTimer) {
    clearTimeout(advanceHintTimer);
    advanceHintTimer = null;
  }
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getButtonVariant(value: number): string {
  const variants = {
    1: 'b3-button--error',
    2: 'b3-button--warning',
    3: 'b3-button--info',
    4: 'b3-button--success',
  };
  return variants[value as keyof typeof variants] || 'b3-button--info';
}

function getRatingButtonAriaLabel(rating: number, kb: string): string {
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
    return kb ? `${rating} / ${kb}` : String(rating);
  }
  return buildRatingAriaLabel(rating as ReviewRatingValue, kb, {
    includeSpaceEnterForGood: true,
  });
}

function getDueMetaClass(value: number): string {
  const variants = {
    1: 'card__action-meta--error',
    2: 'card__action-meta--warning',
    3: 'card__action-meta--info',
    4: 'card__action-meta--success',
  };

  return variants[value as keyof typeof variants] || '';
}

function blurActionButtonAfterPointerClick(event: MouseEvent): void {
  if (event.detail <= 0) {
    return;
  }

  const button = event.currentTarget;
  if (button instanceof HTMLButtonElement) {
    button.blur();
  }
}

function handleBackClick(event: MouseEvent): void {
  if (isAdvancing.value) {
    return;
  }
  blurActionButtonAfterPointerClick(event);
  emit('back');
}

function handleRevealClick(event: MouseEvent): void {
  if (isAdvancing.value) {
    return;
  }
  blurActionButtonAfterPointerClick(event);
  emit('reveal');
}

function handleGradeClick(rating: number, event: MouseEvent): void {
  if (isAdvancing.value) {
    return;
  }
  blurActionButtonAfterPointerClick(event);
  emit('grade', rating);
}

function handleTopicNextClick(event: MouseEvent): void {
  if (isAdvancing.value) {
    return;
  }
  blurActionButtonAfterPointerClick(event);
  if (isFilterGroupReview.value) {
    emit('command', HIDE_CURRENT_IN_SCOPE_COMMAND_ID);
    return;
  }
  emit('grade', 3);
}

function clampPosition(position: number): number {
  const finite = Number.isFinite(position) ? Math.round(position) : rememberedLaterPosition.value;
  return Math.min(Math.max(finite, 1), laterPositionMax.value);
}

function toggleSkipPanel() {
  if (isAdvancing.value) {
    return;
  }

  showSkipPanel.value = !showSkipPanel.value;
  if (!showSkipPanel.value) {
    return;
  }

  laterPosition.value = clampPosition(rememberedLaterPosition.value);
  selectedLaterPresetKey.value = null;
}

function selectLaterPosition(preset: LaterPreset) {
  selectedLaterPresetKey.value = preset.key;
  laterPosition.value = clampPosition(preset.position);
}

function handleLaterSliderInput() {
  selectedLaterPresetKey.value = null;
}

async function confirmLaterPosition() {
  try {
    if (!canInsertLater.value) {
      logger.warn('Queue does not support later insertion', {
        remainingSize: remainingSize.value,
        hasQueue: !!props.queue,
        hasInsertAt: typeof props.queue?.insertAt,
      });
      return;
    }

    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      logger.error('No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }

    const position = clampPosition(laterPosition.value);
    logger.debug('confirmLaterPosition - Queue inspection', {
      hasQueue: !!props.queue,
      queueType: props.queue?.constructor?.name,
      queueKeys: props.queue ? Object.keys(props.queue) : [],
      hasInsertAt: typeof props.queue?.insertAt,
      insertAtType: props.queue?.insertAt ? typeof props.queue.insertAt : 'undefined',
      queueProto: props.queue ? Object.getPrototypeOf(props.queue) : null,
      protoKeys: props.queue ? Object.keys(Object.getPrototypeOf(props.queue)) : [],
    });

    if (!props.queue || typeof props.queue.insertAt !== 'function') {
      logger.error('Queue does not support insertAt', {
        queue: props.queue,
        hasInsertAt: !!props.queue?.insertAt,
        insertAtValue: props.queue?.insertAt,
      });
      return;
    }

    await props.queue.insertAt(cardId, position);
    rememberedLaterPosition.value = position;
    laterPosition.value = position;
    selectedLaterPresetKey.value = null;
    logger.debug('Card inserted later from skip panel', { cardId, position });

    showSkipPanel.value = false;
    emit('skip');
  } catch (error) {
    logger.error('Failed to insert card later', error);
  }
}

function scheduleCustomDate() {
  if (!customScheduleDate.value) {
    return;
  }

  void onScheduleConfirm({
    mode: 'direct',
    dueDate: customScheduleDate.value,
  });
}

function selectSchedulePreset(days: number) {
  customScheduleDate.value = formatLocalDate(addDaysFromToday(days));
}

function addDaysFromToday(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function onScheduleConfirm(options: ScheduleOptions) {
  try {
    if (!canScheduleDate.value) {
      logger.warn('Blocked schedule confirm for neural roam virtual card');
      return;
    }

    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      logger.error('No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }

    if (!props.plugin) {
      logger.error('Plugin instance not provided');
      return;
    }

    const context = props.plugin.getContext();
    const reviewService = context.getReviewService();

    if (!reviewService) {
      logger.error('Review service not available');
      return;
    }

    const targetDate = new Date(options.dueDate).getTime();
    if (!Number.isFinite(targetDate)) {
      logger.warn('Invalid schedule date selected', { cardId, dueDate: options.dueDate });
      return;
    }

    const updatedCard = await reviewService.rescheduleCard(cardId, {
      mode: options.mode,
      dueTimestamp: targetDate,
    });

    logger.debug('Card due date updated', { cardId, targetDate });

    showSkipPanel.value = false;
    emit('scheduled', {
      cardId: String(updatedCard?.id || updatedCard?.cardID || cardId),
      blockId: String(updatedCard?.blockId || updatedCard?.blockID || props.actions.cardMeta?.blockID || ''),
      dueTimestamp: targetDate,
    });
  } catch (error) {
    logger.error('Failed to schedule date', error);
  }
}
</script>

<style scoped>
.card__action {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  user-select: none;
  flex-shrink: 0;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.card__action--advancing {
  cursor: progress;
}

.card__action--advancing .card__action-button,
.card__action--advancing :deep(.skip-menu-button) {
  opacity: 0.72;
}

.card__action-advance-hint {
  position: absolute;
  right: 12px;
  top: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
}

.card__action--reveal {
  flex-wrap: nowrap;
}

.card__action--rating {
  flex-wrap: nowrap;
  align-items: stretch;
}

.card__action-button {
  width: 100%;
  white-space: nowrap;
  display: block;
  padding: 8px 0;
  text-align: center;
}

.card__action-back {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.card__action-back--desktop-reveal {
  width: 25%;
  min-width: 86px;
}

.card__action-back--stacked {
  display: flex;
  margin-bottom: 8px;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0;
}

.card__action-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
}

.card__action-column--stack {
  gap: 0;
}

.card__action-skip {
  min-width: 0;
  display: flex;
  width: 100%;
}

.card__action-skip :deep(.skip-menu-button) {
  width: 100%;
  border-radius: 4px;
}

.card__action-skip--stacked :deep(.skip-menu-button) {
  min-height: 0;
  height: 100%;
}

.card__action-column > span {
  display: flex;
  color: var(--b3-theme-on-surface);
  text-align: center;
  font-size: 12px;
  margin: 0 0 8px;
  height: 28px;
  line-height: 14px;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
}

.card__action-meta--placeholder {
  visibility: hidden;
}

.card__action-meta--error {
  color: var(--b3-theme-error, #ef4444);
}

.card__action-meta--warning {
  color: var(--b3-theme-warning, #f59e0b);
}

.card__action-meta--info {
  color: var(--b3-theme-info, var(--b3-theme-primary));
}

.card__action-meta--success {
  color: var(--b3-theme-success, #16a34a);
}

.card__action-main {
  width: 100%;
  min-width: 0;
  min-height: 0;
  box-shadow: none;
  line-height: inherit;
  text-align: center;
}

.card__action--reveal .card__action-main--reveal {
  flex: 1 1 auto;
}

.card__action-main--reveal-stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 92px;
  padding: 8px 0;
  line-height: 1.2;
  white-space: normal;
}

.card__action-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.card__action-label {
  display: block;
}

.card__action-hint {
  display: block;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.card__action-main--reveal-stacked .card__icon {
  margin-bottom: 0;
}

.card__action--desktop.card__action--reveal {
  display: grid;
  grid-template-columns: minmax(96px, 112px) minmax(0, 1fr) minmax(132px, 156px);
  gap: 8px;
  align-items: center;
}

.card__action--desktop .card__action-column--stack-desktop {
  align-self: stretch;
}

.card__action--desktop .card__action-skip--stacked-desktop {
  flex: 1 1 auto;
}

.card__action--desktop.card__action--reveal .card__action-main--reveal,
.card__action--desktop.card__action--reveal .card__action-skip--desktop-reveal {
  align-self: stretch;
}

.card__action-skip--desktop-reveal {
  height: 100%;
}

.card__action-skip--desktop-reveal :deep(.skip-menu-button) {
  height: 100%;
  min-height: 92px;
}

.card__action-back--desktop-reveal {
  width: 100%;
  min-width: 0;
}

.card__icon {
  font-size: 32px;
  display: block;
  line-height: 46px;
  margin-bottom: 4px;
  margin-inline: auto;
}

.card__action--mobile {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: grid;
  gap: 6px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.card__action--mobile.card__action--reveal {
  grid-template-columns: minmax(0, 76px) minmax(0, 1fr) minmax(0, 96px);
  padding-top: 30px;
}

.card__action--mobile.card__action--rating {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: stretch;
}

.card__action--mobile.card__action--rating .card__action-column {
  gap: 4px;
  min-width: 0;
}

.card__action--mobile.card__action--rating .card__action-column--topic-next {
  grid-column: span 4;
}

.card__action--mobile.card__action--rating .card__action-column > span {
  display: flex;
  height: 18px;
  margin: 0;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  line-height: 18px;
}

.card__action--mobile .card__action-main,
.card__action--mobile .card__action-back {
  min-width: 0;
  min-height: 64px;
  border-radius: 8px;
}

.card__action--mobile.card__action--rating .card__action-main {
  flex: 1 1 auto;
  min-height: 64px;
  padding: 5px 0;
  white-space: normal;
  line-height: 1.15;
}

.card__action--mobile .card__action-back--stacked {
  flex: initial;
  min-height: 20px;
  height: 20px;
  margin-bottom: 0;
  padding: 0;
  font-size: 12px;
}

.card__action--mobile .card__action-back,
.card__action--mobile .card__action-column--stack,
.card__action--mobile.card__action--reveal .card__action-skip {
  flex: initial;
}

.card__action--mobile .card__action-skip :deep(.skip-menu-button) {
  min-height: 64px;
  border-radius: 8px;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button) {
  min-height: 40px;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__main),
.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__trigger) {
  min-height: 40px;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__main) {
  padding-inline: 4px;
  gap: 0;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__icon),
.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__hint) {
  display: none;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__copy) {
  align-items: center;
}

.card__action--mobile.card__action--rating .card__action-skip :deep(.skip-menu-button__label) {
  font-size: 12px;
  font-weight: 500;
}

.card__action--mobile .card__icon {
  font-size: 18px;
  line-height: 20px;
  margin-bottom: 1px;
}

.review-skip-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 8px 8px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.review-skip-panel__card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-theme-surface) 92%, var(--b3-theme-background));
}

.review-skip-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.4;
}

.review-skip-panel__head strong {
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  font-weight: 600;
}

.review-skip-panel__presets,
.review-skip-panel__date-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.review-skip-panel__date-presets {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.review-skip-panel__preset {
  min-width: 0;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 5px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  cursor: pointer;
}

.review-skip-panel__preset:hover:not(:disabled),
.review-skip-panel__preset.is-active {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
  color: var(--b3-theme-primary);
}

.review-skip-panel__slider {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 58px;
  align-items: center;
  gap: 8px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.review-skip-panel__slider input[type="range"] {
  width: 100%;
  min-width: 0;
  accent-color: var(--b3-theme-primary);
}

.review-skip-panel__commit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  gap: 8px;
  margin-top: 10px;
}

.review-skip-panel__state {
  min-width: 0;
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.35;
}

.review-skip-panel__commit-button,
.review-skip-panel__date-custom .b3-button {
  min-height: 34px;
}

.review-skip-panel__date-custom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  gap: 8px;
}

.review-skip-panel__date-custom .b3-text-field {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  border-radius: 5px;
}

.review-skip-panel--mobile {
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 0 10px calc(10px + env(safe-area-inset-bottom));
}

.review-skip-panel--mobile .review-skip-panel__card {
  padding: 10px;
}

.review-skip-panel--mobile .review-skip-panel__head {
  margin-bottom: 8px;
}

.review-skip-panel--mobile .review-skip-panel__presets {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.review-skip-panel--mobile .review-skip-panel__date-presets {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.review-skip-panel--mobile .review-skip-panel__preset {
  min-height: 32px;
  padding-inline: 4px;
}

.review-skip-panel--mobile .review-skip-panel__commit {
  grid-template-columns: minmax(0, 1fr) 88px;
}

.review-skip-panel--mobile .review-skip-panel__date-custom {
  grid-template-columns: minmax(0, 1fr) 68px;
}

</style>
