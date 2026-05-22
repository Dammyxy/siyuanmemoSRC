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
          @skip="emit('skip')"
          @insert="handleInsert"
          @schedule="handleSchedule"
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
          @skip="emit('skip')"
          @insert="handleInsert"
          @schedule="handleSchedule"
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
            @skip="emit('skip')"
            @insert="handleInsert"
            @schedule="handleSchedule"
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
            @skip="emit('skip')"
            @insert="handleInsert"
            @schedule="handleSchedule"
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

  <teleport to="body">
    <div v-if="showInsertDialog" class="b3-dialog b3-dialog--open siyuanmemo-dialog" @mousedown.self="handleDialogMouseDown">
      <div class="b3-dialog__scrim" @click="closeInsertDialog"></div>
      <div class="b3-dialog__container" :style="insertDialogContainerStyle">
        <InsertPositionDialog
          :queue-size="remainingSize"
          :i18n="i18n"
          @confirm="onInsertConfirm"
          @cancel="closeInsertDialog"
        />
      </div>
    </div>
  </teleport>

  <teleport to="body">
    <div v-if="showScheduleDialog" class="b3-dialog b3-dialog--open siyuanmemo-dialog" @mousedown.self="handleDialogMouseDown">
      <div class="b3-dialog__scrim" @click="closeScheduleDialog"></div>
      <div class="b3-dialog__container" :style="scheduleDialogContainerStyle">
        <ScheduleDateDialog
          :card-type="cardType"
          :i18n="i18n"
          @confirm="onScheduleConfirm"
          @cancel="closeScheduleDialog"
        />
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import type { ReviewUIState } from './types';
import SkipMenuButton from './components/SkipMenuButton.vue';
import InsertPositionDialog from './dialogs/InsertPositionDialog.vue';
import ScheduleDateDialog, { type ScheduleOptions } from './dialogs/ScheduleDateDialog.vue';
import { createLogger } from '@/utils/logger';
import type FSRSPlugin from '@/index';
import type { IReviewQueue } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { isTopicLikeCard } from './reviewCardSemantics';
import { isNeuralRoamNonFlashcard } from './reviewRenderPolicy';
import { buildRatingAriaLabel, type ReviewRatingValue } from './reviewHotkeys';

const logger = createLogger('ReviewActions');

type ReviewQueueLike = IReviewQueue & {
  getRemainingSize?: () => number;
  insertAt?: (cardId: string, position: number) => Promise<void>;
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

const cardType = computed<'item' | 'topic'>(() => (isTopicCard.value ? 'topic' : 'item'));
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

const showInsertDialog = ref(false);
const showScheduleDialog = ref(false);

const insertDialogContainerStyle = computed(() => ({
  maxWidth: props.isMobile ? '92vw' : '400px',
}));

const scheduleDialogContainerStyle = computed(() => ({
  maxWidth: props.isMobile ? '92vw' : '540px',
}));

function handleDialogMouseDown(ev: MouseEvent) {
  ev.stopPropagation();
}

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

function handleInsert() {
  if (isAdvancing.value) {
    return;
  }
  logger.debug('handleInsert called', {
    remainingSize: remainingSize.value,
    metaRemainingSize: props.meta?.remainingSize,
    hasQueue: !!props.queue,
    queueType: props.queue?.constructor?.name,
  });

  if (!props.queue) {
    logger.warn('No queue available');
    return;
  }

  let actualRemainingSize = remainingSize.value;
  if (actualRemainingSize === 0 && typeof props.queue.getRemainingSize === 'function') {
    actualRemainingSize = props.queue.getRemainingSize();
    logger.debug('Got remaining size from queue', { actualRemainingSize });
  }

  if (actualRemainingSize === 0) {
    logger.warn('Queue is empty, cannot insert');
    return;
  }

  showInsertDialog.value = true;
}

function closeInsertDialog() {
  showInsertDialog.value = false;
}

async function onInsertConfirm(position: number) {
  try {
    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      logger.error('No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }

    logger.debug('onInsertConfirm - Queue inspection', {
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
    logger.debug('Card inserted at position', { cardId, position });

    closeInsertDialog();
    emit('skip');
  } catch (error) {
    logger.error('Failed to insert card', error);
  }
}

function handleSchedule() {
  if (isAdvancing.value) {
    return;
  }
  if (!canScheduleDate.value) {
    logger.info('Schedule date disabled for neural roam virtual card');
    return;
  }
  showScheduleDialog.value = true;
}

function closeScheduleDialog() {
  showScheduleDialog.value = false;
}

async function onScheduleConfirm(options: ScheduleOptions) {
  try {
    if (!canScheduleDate.value) {
      logger.warn('Blocked schedule confirm for neural roam virtual card');
      closeScheduleDialog();
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

    let targetDate: number;
    if (options.dueDate) {
      targetDate = new Date(options.dueDate).getTime();
    } else if (options.days) {
      targetDate = Date.now() + options.days * 24 * 60 * 60 * 1000;
    } else {
      targetDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
    }

    if (options.mode === 'rating') {
      await reviewService.rescheduleCard(cardId, {
        mode: 'rating',
        rating: options.rating || 3,
        dueTimestamp: targetDate,
      });

      logger.debug('Card scheduled with rating to target date', {
        cardId,
        rating: options.rating || 3,
        targetDate,
      });
    } else {
      await reviewService.rescheduleCard(cardId, {
        mode: 'direct',
        dueTimestamp: targetDate,
      });

      logger.debug('Card due date updated', { cardId, targetDate });
    }

    if (props.queue && typeof props.queue.removeCard === 'function') {
      await props.queue.removeCard(cardId);
    }

    closeScheduleDialog();
    emit('skip');
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

.siyuanmemo-dialog.b3-dialog {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.siyuanmemo-dialog .b3-dialog__scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.18);
}

.siyuanmemo-dialog .b3-dialog__container {
  position: relative;
  background-color: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 80vh;
  overflow: auto;
}
</style>
