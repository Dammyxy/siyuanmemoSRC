<template>
  <div class="card__action fn__flex" :class="{ 'card__action--mobile': props.isMobile }">
    <button
      class="b3-button b3-button--cancel card__action-back"
      :disabled="!canBack"
      @click="emit('back')"
    >
      <svg><use xlink:href="#iconLeft"></use></svg>
      <span v-if="props.isMobile">{{ t('backToPractice', '返回') }}</span>
      <span v-else>(p / q)</span>
    </button>

    <div class="card__action-center" :style="actionCenterStyle">
      <button
        v-if="(actions.showAnswer || actions.grades.length === 0) && !isTopicCard"
        data-type="-1"
        aria-label="Space/Enter"
        class="b3-button b3-tooltips__n b3-tooltips card__action-main card__action-main--reveal"
        @click="emit('reveal')"
      >
        <div class="card__icon">👀</div>
        {{ t('showAnswer', '显示答案') }}
      </button>

      <template v-else-if="isTopicCard">
        <div class="card__action-column">
          <span v-if="!props.isMobile"></span>
          <button
            data-type="3"
            aria-label="Space/Enter"
            class="b3-button b3-button--info b3-tooltips__n b3-tooltips card__action-main"
            @click="emit('grade', 3)"
          >
            <div class="card__icon">📖</div>
            {{ t('nextCard', '下一张') }}
            <template v-if="!props.isMobile"> ({{ t('space', '空格') }} / {{ t('enterKey', '回车') }}) </template>
          </button>
        </div>
      </template>

      <template v-else>
        <div v-for="g in actions.grades" :key="g.value" class="card__action-column">
          <span v-if="!props.isMobile">{{ g.nextDue || '' }}</span>
          <button
            :data-type="g.value"
            :aria-label="getRatingButtonAriaLabel(g.value, g.kb)"
            class="b3-button b3-tooltips__n b3-tooltips card__action-main"
            :class="getButtonVariant(g.value)"
            @click="emit('grade', g.value)"
          >
            <div class="card__icon">{{ g.emoji }}</div>
            {{ g.label }}
            <template v-if="!props.isMobile"> ({{ g.kb }}) </template>
          </button>
        </div>
      </template>
    </div>

    <div class="card__action-right">
      <SkipMenuButton
        :i18n="i18n"
        :queue-size="remainingSize"
        :is-mobile="props.isMobile"
        :can-schedule-date="canScheduleDate"
        @skip="emit('skip')"
        @insert="handleInsert"
        @schedule="handleSchedule"
      />
    </div>
  </div>
  
  <!-- 插入位置对话框 -->
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
  
  <!-- 安排日期对话框 -->
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
import { computed, ref, watch } from 'vue';
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

// 卡片类型检测 - Topic 和 Concept 卡片都使用"下一张"模式
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

// 卡片类型（用于对话框）- Concept 卡片也视为 topic 类型
const cardType = computed<'item' | 'topic'>(() => {
  return isTopicCard.value ? 'topic' : 'item';
});

const canScheduleDate = computed(() => !isNeuralRoamNonFlashcard(props.currentCard));

// 剩余卡片数量
const remainingSize = computed(() => {
  return props.meta?.remainingSize || 0;
});

// 是否可后退
const canBack = computed(() => props.meta?.canBack === true);

const actionCenterColumns = computed(() => {
  if (isTopicCard.value) {
    return 1;
  }
  return Math.max(props.actions.grades.length, 1);
});

const actionCenterStyle = computed(() => ({
  '--review-action-columns': String(actionCenterColumns.value),
}));

// 对话框状态
const showInsertDialog = ref(false);
const showScheduleDialog = ref(false);
const insertDialogContainerStyle = computed(() => ({
  maxWidth: props.isMobile ? '92vw' : '400px',
}));
const scheduleDialogContainerStyle = computed(() => ({
  maxWidth: props.isMobile ? '92vw' : '540px',
}));

// 防止鼠标拖动关闭对话框
function handleDialogMouseDown(ev: MouseEvent) {
  // 只在点击遮罩层时关闭，拖动不关闭
  ev.stopPropagation();
}

// 调试：监控 grades 变化
watch(() => props.actions.grades, (grades) => {
  logger.debug('grades changed', { grades });
}, { immediate: true, deep: true });

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

// 插入位置逻辑
function handleInsert() {
  logger.debug('handleInsert called', {
    remainingSize: remainingSize.value,
    metaRemainingSize: props.meta?.remainingSize,
    hasQueue: !!props.queue,
    queueType: props.queue?.constructor?.name,
  });
  
  // 修复：插入功能应该在有队列的情况下就可以使用
  // remainingSize 为 0 可能是因为 Adapter 没有正确设置这个字段
  // 我们应该尝试从队列获取实际的剩余数量
  if (!props.queue) {
    logger.warn('No queue available');
    return;
  }
  
  // 尝试从队列获取剩余数量
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
    // 🔧 修复：使用 Adapter 提供的字段名（大写）
    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      logger.error('No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }
    
    // 详细的调试日志
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
    
    // 继续复习下一张
    emit('skip');
  } catch (error) {
    logger.error('Failed to insert card', error);
    // TODO: 显示错误提示
  }
}

// 安排日期逻辑
function handleSchedule() {
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

    // 🔧 修复：使用 Adapter 提供的字段名（大写）
    const cardId = props.actions.cardMeta?.cardID || props.actions.cardMeta?.blockID;
    if (!cardId) {
      logger.error('No card ID found', {
        cardMeta: props.actions.cardMeta,
      });
      return;
    }
    
    // 🔧 修复：通过 props.plugin 获取服务，而不是全局变量
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
    // TODO: 显示错误提示
  }
}
</script>

<style scoped>
.card__action {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch;
  column-gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  user-select: none;
  flex-shrink: 0;
  background: var(--b3-theme-background);
}

.card__action-back {
  min-width: 96px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
}

.card__action-center {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--review-action-columns, 1), minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
}

.card__action-right {
  width: 132px;
  display: flex;
  height: 100%;
}

.card__action-right :deep(.skip-menu-button) {
  width: 100%;
  height: 100%;
}

.card__action-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.card__action-column > span {
  display: flex;
  color: var(--b3-theme-on-surface);
  text-align: center;
  font-size: 12px;
  margin-bottom: 8px;
  height: 28px;
  line-height: 14px;
  justify-content: center;
  align-items: center;
}

.card__action-main {
  width: 100%;
  min-width: 0;
  min-height: 44px;
}

.card__action-main--reveal {
  grid-column: 1 / -1;
}

.card__icon {
  font-size: 32px;
  display: block;
  line-height: 46px;
  margin-bottom: 4px;
}

.card__action--mobile {
  position: sticky;
  bottom: 0;
  z-index: 5;
  gap: 6px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
}

.card__action--mobile .card__action-back {
  min-width: 78px;
}

.card__action--mobile .card__action-right {
  width: 118px;
}

.card__action--mobile .card__action-column > span {
  display: none;
}

.card__action--mobile .card__action-main,
.card__action--mobile .card__action-back {
  min-height: 44px;
}

.card__action--mobile .card__icon {
  font-size: 22px;
  line-height: 26px;
  margin-bottom: 2px;
}

/* 对话框样式 - 只影响插件自己的对话框 */
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
  background-color: rgba(0, 0, 0, 0.32);
}

.siyuanmemo-dialog .b3-dialog__container {
  position: relative;
  background-color: var(--b3-theme-background);
  border-radius: var(--b3-border-radius);
  box-shadow: var(--b3-dialog-shadow);
  max-height: 80vh;
  overflow: auto;
}
</style>
