<template>
  <div class="srs-editor fn__flex-column">
    <div class="srs-editor__header fn__flex">
      <svg class="srs-editor__icon"><use xlink:href="#iconInfo"></use></svg>
      <span class="fn__flex-1">{{ t('srsEditorTitle', 'Edit SRS Data') }}</span>
      <div class="srs-editor__controls fn__flex">
        <button class="b3-button srs-btn" :class="buttonState(metadataVisible, false)" @click="toggleMetadata">
          {{ t('toggleMeta', 'Card Metadata') }}
        </button>
      </div>
    </div>
    <div class="fn__hr"></div>

    <!-- 核心状态概览（始终显示） -->
    <div class="srs-section srs-section--overview">
      <div class="srs-section__title">{{ t('cardOverview', 'Card Status') }}</div>
      <div class="srs-grid srs-grid--overview">
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('cardType', 'Card Type') }}</div>
          <div class="srs-overview-item__value">{{ cardTypeText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('state', 'State') }}</div>
          <div class="srs-overview-item__value srs-overview-item__value--state">{{ stateText }}</div>
        </div>
        <div class="srs-overview-item srs-overview-item--highlight">
          <div class="srs-overview-item__label">{{ t('nextReview', 'Next Review') }}</div>
          <div class="srs-overview-item__value">{{ nextReviewText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('reps', 'Reviews') }}</div>
          <div class="srs-overview-item__value">{{ repsText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('lapses', 'Lapses') }}</div>
          <div class="srs-overview-item__value">{{ lapsesText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('stability', 'Stability') }}</div>
          <div class="srs-overview-item__value">{{ stabilityText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('difficulty', 'Difficulty') }}</div>
          <div class="srs-overview-item__value">{{ difficultyText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('priority', 'Priority') }}</div>
          <div class="srs-overview-item__value">{{ priorityText }}</div>
        </div>
        <div v-if="cardTypeText.includes('Topic')" class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('aFactor', 'A-Factor') }}</div>
          <div class="srs-overview-item__value">{{ aFactorText }}</div>
        </div>
      </div>
    </div>

    <div v-show="metadataVisible" class="srs-section srs-section--collapsible">
      <div class="srs-section__title">{{ t('cardMeta', 'Card Metadata') }}</div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('cardId', 'Card ID') }}</div>
          <div class="srs-field__value srs-field__mono">{{ cardIdText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('blockId', 'Block ID') }}</div>
          <div class="srs-field__value srs-field__mono">{{ blockIdText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('createdAt', 'Created') }}</div>
          <div class="srs-field__value">{{ createdAtText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('updatedAt', 'Updated') }}</div>
          <div class="srs-field__value">{{ updatedAtText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('lastReview', 'Last Review') }}</div>
          <div class="srs-field__value srs-field__value--status">
            <span v-if="lastReviewState !== 'date'" class="srs-status" :class="statusClass(lastReviewState)" :title="statusTitle(lastReviewState)">
              <svg class="srs-status__icon"><use :xlink:href="statusIcon(lastReviewState)"></use></svg>
              <span class="srs-status__text">{{ statusLabel(lastReviewState) }}</span>
            </span>
            <span v-else>{{ lastReviewText }}</span>
          </div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('nextReview', 'Next Review') }}</div>
          <div class="srs-field__value srs-field__value--status">
            <span v-if="nextReviewState !== 'date'" class="srs-status" :class="statusClass(nextReviewState)" :title="statusTitle(nextReviewState)">
              <svg class="srs-status__icon"><use :xlink:href="statusIcon(nextReviewState)"></use></svg>
              <span class="srs-status__text">{{ statusLabel(nextReviewState) }}</span>
            </span>
            <span v-else>{{ nextReviewText }}</span>
          </div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('reps', 'Reviews') }}</div>
          <div class="srs-field__value">{{ repsText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('lapses', 'Lapses') }}</div>
          <div class="srs-field__value">{{ lapsesText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('stability', 'Stability') }}</div>
          <div class="srs-field__value">{{ stabilityText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('difficulty', 'Difficulty') }}</div>
          <div class="srs-field__value">{{ difficultyText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('state', 'State') }}</div>
          <div class="srs-field__value">{{ stateText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('elapsedDays', 'Elapsed Days') }}</div>
          <div class="srs-field__value">{{ elapsedDaysText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('scheduledDays', 'Scheduled Days') }}</div>
          <div class="srs-field__value">{{ scheduledDaysText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('priority', 'Priority') }}</div>
          <div class="srs-field__value">{{ priorityText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('cardType', 'Card Type') }}</div>
          <div class="srs-field__value">{{ cardTypeText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('schedulerType', 'Scheduler Type') }}</div>
          <div class="srs-field__value">{{ schedulerTypeText }}</div>
        </div>
      </div>
      <div v-if="cardTypeText.includes('Topic')" class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('aFactor', 'A-Factor') }}</div>
          <div class="srs-field__value">{{ aFactorText }}</div>
        </div>
        <div></div>
      </div>
      <div v-if="leechCountText !== '0'" class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('leechCount', 'Leech Count') }}</div>
          <div class="srs-field__value">{{ leechCountText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('isLeech', 'Is Leech') }}</div>
          <div class="srs-field__value">{{ isLeechText }}</div>
        </div>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('resetProgress', 'Reset Progress') }}</div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn" @click="handleReset">{{ t('reset', 'Reset Card') }}</button>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('scheduleDate', 'Schedule Review Date') }}</div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn srs-btn--active" @click="openScheduleDateDialog">
          <svg class="srs-btn__icon"><use xlink:href="#iconCalendar"></use></svg>
          {{ t('scheduleDate', 'Schedule Review Date') }}
        </button>
      </div>
    </div>
    
    <!-- 底部占位空间 -->
    <div style="height: 32px;"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Dialog } from 'siyuan';
import { getBlockInfo } from '@/core/siyuan/api';
import { CardState, CardType } from '@/types';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import ScheduleDateDialog from '@/ui/review/v2/dialogs/ScheduleDateDialog.vue';
import type { ScheduleOptions } from '@/ui/review/v2/dialogs/ScheduleDateDialog.vue';
import type FSRSPlugin from '@/index';

const props = defineProps<{
  card: { 
    id?: string;
    cardID?: string;
    blockId?: string;
    blockID?: string;
    deckId?: string;
    deckID?: string;
  };
  deckId?: string;
  deckID?: string;
  i18n?: Record<string, string>;
  plugin?: FSRSPlugin;
  reviewService?: any;  // ✅ DDD 架构：复习应用服务
}>();

// 标准化 props 数据
const cardId = props.card.id || props.card.cardID || '';
const blockId = props.card.blockId || props.card.blockID || '';
const deckId = props.deckId || props.deckID || props.card.deckId || props.card.deckID || '';

const cardIdText = ref<string>('');
const blockIdText = ref<string>('');
const cardTypeText = ref<string>('');
const schedulerTypeText = ref<string>('');
const priorityText = ref<string>('');
const leechCountText = ref<string>('');
const isLeechText = ref<string>('');
const createdAtText = ref('');
const updatedAtText = ref('');
const lastReviewText = ref('');
const nextReviewText = ref('');
const lastReviewState = ref<'date' | 'pending' | 'unknown'>('unknown');
const nextReviewState = ref<'date' | 'pending' | 'unknown'>('unknown');
const repsText = ref('');
const lapsesText = ref('');
const stabilityText = ref('');
const difficultyText = ref('');
const elapsedDaysText = ref('');
const scheduledDaysText = ref('');
const stateText = ref('');
const aFactorText = ref('');

const metadataVisible = ref(false);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getContext() {
  return props.plugin?.getContext?.();
}

function getStorage() {
  return getContext()?.getStorage?.();
}

function getSchedulerRouter() {
  return getContext()?.getScheduler?.() || getContext()?.getSchedulerRouter?.();
}

async function loadMeta() {
  try {
    const storage = getStorage();
    const card = storage?.getCardByBlockId(blockId);
    
    if (!card) {
      console.warn('[SiYuanMemo][SrsEditor] Card not found in storage, blockId:', blockId);
      return;
    }
    
    console.log('[SiYuanMemo][SrsEditor] Loaded card data:', card);
    
    // 卡片 ID 和块 ID
    cardIdText.value = card.id;
    blockIdText.value = card.blockId;
    
    // 卡片类型
    const typeLabels: Record<CardType, string> = {
      [CardType.Item]: t('itemCard', 'Item Card'),
      [CardType.Topic]: t('topicCard', 'Topic Card'),
      [CardType.Concept]: t('conceptCard', 'Concept Card'),
      [CardType.Descriptor]: t('descriptorCard', 'Descriptor Card'),
      [CardType.Incremental]: t('incrementalCard', 'Incremental Content'),
      [CardType.Webpage]: t('webpageCard', 'Webpage Card'),
    };
    cardTypeText.value = typeLabels[card.type] || card.type;
    
    // 调度器类型
    const schedulerTypeLabels: Record<string, string> = {
      'fsrs-v5': 'FSRS v6 (ts-fsrs 5.2.3)',
      'fsrs-v6': 'FSRS v6 (ts-fsrs 5.2.3)',
      'sm2': 'SM-2',
      'sm15': 'SM-15',
      'a-factor': 'A-Factor',
      'a-factor-v2': 'A-Factor v2',
      'riff': 'Riff',
    };
    schedulerTypeText.value = schedulerTypeLabels[card.schedulerType || 'fsrs-v5'] || card.schedulerType || 'FSRS v6 (ts-fsrs 5.2.3)';
    
    // 优先级
    priorityText.value = String(card.priority || 50);
    
    // 水蛭卡信息
    leechCountText.value = String(card.leechCount || 0);
    isLeechText.value = card.isLeech ? t('yes', 'Yes') : t('no', 'No');
    
    // 时间信息
    const info = await getBlockInfo(blockId);
    const createdAt = resolveTimeDate(
      [info?.created_time, info?.created, info?.createdAt, info?.created_at, card?.createdAt],
      true
    ) || new Date();
    let updatedAt = resolveTimeDate(
      [info?.last_edited_time, info?.updated, info?.updatedAt, info?.updated_at, card?.updatedAt],
      true
    ) || createdAt;
    if (updatedAt.getTime() < createdAt.getTime()) {
      updatedAt = createdAt;
    }
    createdAtText.value = createdAt.toLocaleString();
    updatedAtText.value = updatedAt.toLocaleString();
    
    const lastReviewDate = card?.lastReview ? new Date(card.lastReview) : null;
    const nextReviewDate = card?.due ? new Date(card.due) : null;
    lastReviewText.value = lastReviewDate ? lastReviewDate.toLocaleString() : t('pending', 'Pending');
    nextReviewText.value = nextReviewDate ? nextReviewDate.toLocaleString() : t('pending', 'Pending');
    lastReviewState.value = lastReviewDate ? 'date' : card ? 'pending' : 'unknown';
    nextReviewState.value = nextReviewDate ? 'date' : card ? 'pending' : 'unknown';
    
    // 复习统计
    repsText.value = formatNumber(card?.reps);
    lapsesText.value = formatNumber(card?.lapses);
    stabilityText.value = card?.stability ? `${card.stability.toFixed(1)} ${t('days', 'days')}` : t('notLearned', 'Not learned');
    difficultyText.value = card?.difficulty ? card.difficulty.toFixed(2) : '-';
    elapsedDaysText.value = formatNumber(card?.elapsedDays);
    scheduledDaysText.value = formatNumber(card?.scheduledDays);
    
    // 卡片状态
    if (card?.state === CardState.New) stateText.value = t('newCard', 'New');
    else if (card?.state === CardState.Learning) stateText.value = t('learning', 'Learning');
    else if (card?.state === CardState.Review) stateText.value = t('reviewCard', 'Review');
    else if (card?.state === CardState.Relearning) stateText.value = t('relearning', 'Relearning');
    else stateText.value = t('unknown', 'Unknown');
    
    // A-Factor（仅 Topic 卡片）
    if (card?.type === CardType.Topic) {
      // 优先从 card.aFactor 读取，如果没有则显示 "-"
      if (card.aFactor !== undefined && card.aFactor !== null && !isNaN(card.aFactor)) {
        aFactorText.value = card.aFactor.toFixed(2);
      } else {
        aFactorText.value = '-';
      }
    } else {
      aFactorText.value = '-';
    }
  } catch (err) {
    console.error('[SiYuanMemo][SrsEditor] Failed to load card meta:', err);
    createdAtText.value = t('unknown', 'Unknown');
    updatedAtText.value = t('unknown', 'Unknown');
    lastReviewText.value = t('unknown', 'Unknown');
    nextReviewText.value = t('unknown', 'Unknown');
    lastReviewState.value = 'unknown';
    nextReviewState.value = 'unknown';
    repsText.value = t('unknown', 'Unknown');
    lapsesText.value = t('unknown', 'Unknown');
    stabilityText.value = t('unknown', 'Unknown');
    difficultyText.value = t('unknown', 'Unknown');
    elapsedDaysText.value = t('unknown', 'Unknown');
    scheduledDaysText.value = t('unknown', 'Unknown');
    stateText.value = t('unknown', 'Unknown');
  }
}

function parseTimeValue(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && !Number.isNaN(value)) {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{14}$/.test(raw)) {
      const y = Number(raw.slice(0, 4));
      const m = Number(raw.slice(4, 6)) - 1;
      const d = Number(raw.slice(6, 8));
      const hh = Number(raw.slice(8, 10));
      const mm = Number(raw.slice(10, 12));
      const ss = Number(raw.slice(12, 14));
      return new Date(y, m, d, hh, mm, ss);
    }
    if (/^\d{13}$/.test(raw)) return new Date(Number(raw));
    if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
    const directParsed = new Date(raw);
    if (!isNaN(directParsed.getTime())) return directParsed;
    const fallbackParsed = new Date(raw.replace(/-/g, '/'));
    if (!isNaN(fallbackParsed.getTime())) return fallbackParsed;
  }
  return null;
}

function resolveTimeDate(candidates: unknown[], fallbackToNow: boolean): Date | null {
  for (const item of candidates) {
    const parsed = parseTimeValue(item);
    if (parsed) return parsed;
  }
  if (fallbackToNow) return new Date();
  return null;
}

function formatNumber(value: unknown, digits?: number): string {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (num === null || num === undefined || Number.isNaN(num)) return t('unknown', 'Unknown');
  return digits !== undefined ? num.toFixed(digits) : String(num);
}

function statusClass(state: 'date' | 'pending' | 'unknown') {
  return {
    'srs-status--pending': state === 'pending',
    'srs-status--unknown': state === 'unknown',
  };
}

function statusLabel(state: 'date' | 'pending' | 'unknown') {
  if (state === 'pending') return t('unreviewed', 'Unreviewed');
  if (state === 'unknown') return t('unknown', 'Unknown');
  return '';
}

function statusTitle(state: 'date' | 'pending' | 'unknown') {
  if (state === 'pending') return t('unreviewedHint', 'Unreviewed: Content that has been learned but not yet reviewed');
  if (state === 'unknown') return t('unknownHint', 'Unknown: Content that has not been encountered or learned');
  return '';
}

function statusIcon(state: 'date' | 'pending' | 'unknown') {
  if (state === 'pending') return '#iconClock';
  return '#iconInfo';
}

function buttonState(active: boolean, disabled: boolean) {
  return {
    'srs-btn--active': active,
    'srs-btn--disabled': disabled,
  };
}

function showResultDialog(options: { title: string; content: string; type?: 'success' | 'error' | 'info' }) {
  const type = options.type || 'info';
  const icon = type === 'success' ? '#iconCheck' : type === 'error' ? '#iconClose' : '#iconInfo';
  const dialog = new Dialog({
    title: options.title,
    content: `
      <div class="b3-dialog__content srs-dialog__content srs-dialog__content--${type}">
        <div class="srs-dialog__row">
          <svg class="srs-dialog__icon"><use xlink:href="${icon}"></use></svg>
          <div class="ft__breakword">${options.content}</div>
        </div>
      </div>
      <div class="b3-dialog__action">
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text">${t('ok', 'OK')}</button>
      </div>
    `,
    width: '360px',
  });
  const button = dialog.element.querySelector('.b3-button') as HTMLButtonElement | null;
  if (button) {
    button.addEventListener('click', () => dialog.destroy());
  }
}

function toggleMetadata() {
  metadataVisible.value = !metadataVisible.value;
}

async function handleReset() {
  const confirmed = await confirmDialog({
    title: t('resetConfirmTitle', 'Confirm Reset Progress'),
    content: t('resetConfirmContent', 'This will clear the card\'s review history and cannot be undone. Continue?'),
    confirmText: t('confirm', 'Confirm'),
    cancelText: t('cancel', 'Cancel'),
  });
  if (!confirmed) return;
  
  try {
    const storage = getStorage();
    const card = storage?.getCardByBlockId(blockId);
    if (card && storage) {
      card.state = CardState.New;
      card.due = Date.now();
      card.stability = 0;
      card.difficulty = 0;
      card.reps = 0;
      card.lapses = 0;
      card.elapsedDays = 0;
      card.scheduledDays = 0;
      card.lastReview = 0;
      card.learning_step = 0;
      
      storage.setCard(card);
      await storage.saveCards();
      await loadMeta();
      
      showResultDialog({
        title: t('resetProgress', 'Reset Progress'),
        content: t('resetDone', 'Card reset'),
        type: 'success',
      });
    }
  } catch (err) {
    console.error('[SiYuanMemo] reset error', err);
    showResultDialog({
      title: t('resetProgress', 'Reset Progress'),
      content: t('resetFailed', 'Reset failed'),
      type: 'error',
    });
  }
}

function openScheduleDateDialog() {
  const card = getStorage()?.getCardByBlockId(blockId);
  if (!card) {
    showResultDialog({
      title: t('scheduleDate', 'Schedule Review Date'),
      content: t('cardNotFound', 'Card not found'),
      type: 'error',
    });
    return;
  }
  
  const cardType = card.type === CardType.Topic ? 'topic' : 'item';
  
  createVueDialog({
    title: t('scheduleDate', 'Schedule Review Date'),
    component: ScheduleDateDialog,
    props: {
      cardType,
      i18n: props.i18n || {},
    },
    width: '520px',
    height: '600px',
    onConfirm: async (options: ScheduleOptions) => {
      await handleScheduleDate(options);
    },
  });
}

async function handleScheduleDate(options: ScheduleOptions) {
  try {
    const storage = getStorage();
    const schedulerRouter = getSchedulerRouter();
    const card = storage?.getCardByBlockId(blockId);
    if (!card) {
      showResultDialog({
        title: t('scheduleDate', 'Schedule Review Date'),
        content: t('cardNotFound', 'Card not found'),
        type: 'error',
      });
      return;
    }
    
    // 计算新的到期时间
    let dueTimestamp: number;
    if (options.dueDate) {
      const due = new Date(options.dueDate);
      dueTimestamp = due.getTime();
    } else if (options.days) {
      const due = new Date();
      due.setDate(due.getDate() + options.days);
      dueTimestamp = due.getTime();
    } else {
      showResultDialog({
        title: t('scheduleDate', 'Schedule Review Date'),
        content: t('invalidDate', 'Please select a date or enter days'),
        type: 'error',
      });
      return;
    }
    
    // 评分模式：先执行复习，再修改日期
    if (options.mode === 'rating' && options.rating) {
      // ✅ 优先使用 reviewService（DDD 架构）
      if (props.reviewService) {
        try {
          await props.reviewService.rescheduleCard(card.id, {
            mode: 'rating',
            rating: options.rating,
            dueTimestamp: dueTimestamp
          });
          console.log('[SiYuanMemo][SrsEditor] Schedule with rating via reviewService:', options.rating, 'to:', dueTimestamp);
        } catch (error) {
          console.error('[SiYuanMemo][SrsEditor] Failed to reschedule via reviewService:', error);
          // 回退到旧方法
          if (schedulerRouter && storage) {
            const updatedCard = schedulerRouter.route(card, options.rating);
            updatedCard.due = dueTimestamp;
            updatedCard.updatedAt = Date.now();
            storage.setCard(updatedCard);
            await storage.saveCards();
          }
        }
      } else if (schedulerRouter && storage) {
        // 回退到旧方法（向后兼容）
        const updatedCard = schedulerRouter.route(card, options.rating);
        updatedCard.due = dueTimestamp;
        updatedCard.updatedAt = Date.now();
        storage.setCard(updatedCard);
        await storage.saveCards();
        console.log('[SiYuanMemo][SrsEditor] Schedule with rating (legacy):', options.rating, 'to:', dueTimestamp);
      }
    } else {
      // 仅修改日期模式
      // ✅ 优先使用 reviewService（DDD 架构）
      if (props.reviewService) {
        try {
          await props.reviewService.rescheduleCard(card.id, {
            mode: 'direct',
            dueTimestamp: dueTimestamp
          });
          console.log('[SiYuanMemo][SrsEditor] Schedule direct via reviewService to:', dueTimestamp);
        } catch (error) {
          console.error('[SiYuanMemo][SrsEditor] Failed to reschedule via reviewService:', error);
          // 回退到旧方法
          if (storage) {
            card.due = dueTimestamp;
            card.updatedAt = Date.now();
            storage.setCard(card);
            await storage.saveCards();
          }
        }
      } else if (storage) {
        // 回退到旧方法（向后兼容）
        card.due = dueTimestamp;
        card.updatedAt = Date.now();
        storage.setCard(card);
        await storage.saveCards();
        console.log('[SiYuanMemo][SrsEditor] Schedule direct (legacy) to:', dueTimestamp);
      }
    }
    await loadMeta();
    
    showResultDialog({
      title: t('scheduleDate', 'Schedule Review Date'),
      content: options.mode === 'rating' 
        ? t('scheduleWithRatingDone', 'Review executed and date scheduled')
        : t('scheduleDone', 'Review date scheduled'),
      type: 'success',
    });
  } catch (err) {
    console.error('[SiYuanMemo] schedule error', err);
    showResultDialog({
      title: t('scheduleDate', 'Schedule Review Date'),
      content: t('scheduleFailed', 'Failed to schedule date'),
      type: 'error',
    });
  }
}

onMounted(async () => {
  await loadMeta();
});
</script>

<style>
.srs-editor {
  padding: 16px;
  padding-bottom: 16px;
  gap: 16px;
  overflow-y: auto;
  max-height: 100%;
}

/* 核心状态概览区域 */
.srs-section--overview {
  background: var(--b3-theme-surface);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.srs-grid--overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.srs-overview-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.srs-overview-item__label {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.srs-overview-item__value {
  font-size: 15px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.srs-overview-item--highlight {
  background: var(--b3-theme-primary-lightest);
  padding: 10px 14px;
  border-radius: 6px;
  margin: -6px;
}

.srs-overview-item--highlight .srs-overview-item__value {
  color: var(--b3-theme-primary);
  font-size: 16px;
}

.srs-editor__header {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.srs-editor__icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
}

.srs-editor__controls {
  gap: 8px;
  flex-wrap: wrap;
}

.srs-btn {
  border: 1px solid var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
}

.srs-btn__icon {
  width: 14px;
  height: 14px;
}

.srs-btn--active {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary);
}

.srs-btn--disabled {
  background: var(--b3-border-color);
  border-color: var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  opacity: 0.5;
  cursor: not-allowed;
}

.srs-dialog__content {
  padding: 12px 16px;
}

.srs-dialog__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.6;
  font-size: 14px;
  color: var(--b3-theme-on-surface);
}

.srs-dialog__icon {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: var(--b3-theme-primary);
}

.srs-dialog__content--error .srs-dialog__icon {
  color: var(--b3-theme-error);
}

.srs-section--collapsible {
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  padding: 14px;
  background: var(--b3-theme-surface);
  margin-bottom: 16px;
}

.srs-action-row {
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.srs-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.srs-section__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--b3-theme-on-surface);
  margin-bottom: 4px;
}

.srs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
}

.srs-field__label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 6px;
  font-weight: 500;
}

.srs-field__value {
  font-size: 13px;
  color: var(--b3-theme-on-surface);
  background: var(--b3-theme-background);
  border-radius: 4px;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
}

.srs-field__value--status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.srs-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.srs-status__icon {
  width: 14px;
  height: 14px;
}

.srs-status__text {
  font-size: 12px;
}

.srs-status--pending {
  color: #FFA500;
}

.srs-status--unknown {
  color: #808080;
}

.srs-field__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
}
</style>
