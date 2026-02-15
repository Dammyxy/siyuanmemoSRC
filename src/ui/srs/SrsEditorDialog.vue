<template>
  <div class="srs-editor fn__flex-column">
    <div class="srs-editor__header fn__flex">
      <svg class="srs-editor__icon"><use xlink:href="#iconInfo"></use></svg>
      <span class="fn__flex-1">{{ t('srsEditorTitle', '编辑间隔重复数据') }}</span>
      <div class="srs-editor__controls fn__flex">
        <div class="srs-button-group">
          <button class="b3-button srs-btn srs-select-toggle" :class="!selectDocAll ? 'srs-btn--active' : 'srs-btn--inactive'" @click="setSelection(false)">
            <span class="srs-check" :class="{ 'srs-check--checked': !selectDocAll }"></span>
            {{ t('selectCurrent', '当前闪卡') }}
          </button>
          <button class="b3-button srs-btn srs-select-toggle" :class="selectDocAll ? 'srs-btn--active' : 'srs-btn--inactive'" @click="setSelection(true)">
            <span class="srs-check" :class="{ 'srs-check--checked': selectDocAll }"></span>
            {{ t('selectDocAll', '文档块内所有闪卡') }}
          </button>
        </div>
        <button class="b3-button srs-btn" :class="buttonState(metadataVisible, false)" @click="toggleMetadata">
          {{ t('toggleMeta', '卡片元数据') }}
        </button>
      </div>
    </div>
    <div class="fn__hr"></div>

    <!-- 核心状态概览（始终显示） -->
    <div class="srs-section srs-section--overview">
      <div class="srs-section__title">{{ t('cardOverview', '卡片状态') }}</div>
      <div class="srs-grid srs-grid--overview">
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('state', '状态') }}</div>
          <div class="srs-overview-item__value srs-overview-item__value--state">{{ stateText }}</div>
        </div>
        <div class="srs-overview-item srs-overview-item--highlight">
          <div class="srs-overview-item__label">{{ t('nextReview', '下次复习') }}</div>
          <div class="srs-overview-item__value">{{ nextReviewText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('reps', '复习次数') }}</div>
          <div class="srs-overview-item__value">{{ repsText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('lapses', '遗忘次数') }}</div>
          <div class="srs-overview-item__value">{{ lapsesText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('stability', '稳定性') }}</div>
          <div class="srs-overview-item__value">{{ stabilityText }}</div>
        </div>
        <div class="srs-overview-item">
          <div class="srs-overview-item__label">{{ t('difficulty', '难度') }}</div>
          <div class="srs-overview-item__value">{{ difficultyText }}</div>
        </div>
      </div>
    </div>

    <div v-show="metadataVisible" class="srs-section srs-section--collapsible">
      <div class="srs-section__title">{{ t('cardMeta', '卡片元数据') }}</div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('question', '问题内容') }}</div>
          <div class="srs-field__value srs-field__mono">{{ frontText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('answer', '答案内容') }}</div>
          <div class="srs-field__value srs-field__mono">{{ backText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('createdAt', '创建时间') }}</div>
          <div class="srs-field__value">{{ createdAtText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('updatedAt', '修改时间') }}</div>
          <div class="srs-field__value">{{ updatedAtText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('lastReview', '上次复习时间') }}</div>
          <div class="srs-field__value srs-field__value--status">
            <span v-if="lastReviewState !== 'date'" class="srs-status" :class="statusClass(lastReviewState)" :title="statusTitle(lastReviewState)">
              <svg class="srs-status__icon"><use :xlink:href="statusIcon(lastReviewState)"></use></svg>
              <span class="srs-status__text">{{ statusLabel(lastReviewState) }}</span>
            </span>
            <span v-else>{{ lastReviewText }}</span>
          </div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('nextReview', '下次复习时间') }}</div>
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
          <div class="srs-field__label">{{ t('reps', '复习次数') }}</div>
          <div class="srs-field__value">{{ repsText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('lapses', '遗忘次数') }}</div>
          <div class="srs-field__value">{{ lapsesText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('stability', '记忆强度') }}</div>
          <div class="srs-field__value">{{ stabilityText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('difficulty', '难度') }}</div>
          <div class="srs-field__value">{{ difficultyText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('state', '卡片状态') }}</div>
          <div class="srs-field__value">{{ stateText }}</div>
        </div>
        <div>
          <div class="srs-field__label">{{ t('elapsedDays', '经过天数') }}</div>
          <div class="srs-field__value">{{ elapsedDaysText }}</div>
        </div>
      </div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('scheduledDays', '预定间隔') }}</div>
          <div class="srs-field__value">{{ scheduledDaysText }}</div>
        </div>
        <div></div>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('resetProgress', '重置学习进度') }}</div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn" :class="buttonState(hasSelection, !hasSelection)" :disabled="!hasSelection" @click="handleReset">{{ t('reset', '重置所选卡片') }}</button>
        <span class="fn__space"></span>
        <span class="ft__secondary">{{ t('resetHint', '将清除复习记录并恢复默认参数') }}</span>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('reschedule', '安排日期') }}</div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('postponeDays', '推迟天数') }}</div>
          <input class="b3-text-field" type="number" min="1" v-model.number="postponeDays" placeholder="7" @input="onPostponeDaysChange"/>
        </div>
        <div>
          <div class="srs-field__label">{{ t('chooseDate', '选择日期') }}</div>
          <input class="b3-text-field" type="date" v-model="dueDate" @change="onDueDateChange"/>
        </div>
      </div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn srs-btn--active" @click="applyReschedule" title="Ctrl+J">Ctrl+J {{ t('apply', '重新排期') }}</button>
        <span class="fn__space"></span>
        <span class="ft__secondary">{{ t('rescheduleHint', '仅更新到期时间，不记录为复习') }}</span>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('executeReview', '执行复习') }}</div>
      <div class="srs-grid">
        <div>
          <div class="srs-field__label">{{ t('rating', '评分') }}</div>
          <select class="b3-select" v-model="reviewRating" style="width: 100%;">
            <option :value="3">{{ t('good', '一般 (Good)') }}</option>
            <option :value="4">{{ t('easy', '简单 (Easy)') }}</option>
            <option :value="2">{{ t('hard', '困难 (Hard)') }}</option>
            <option :value="1">{{ t('again', '忘记 (Again)') }}</option>
          </select>
        </div>
        <div>
          <div class="srs-field__label">{{ t('reviewPostponeDays', '复习后推迟天数（可选）') }}</div>
          <input class="b3-text-field" type="number" min="0" v-model.number="reviewPostponeDays" placeholder="0" @input="onReviewPostponeDaysChange"/>
        </div>
      </div>
      <div class="srs-grid" style="margin-top: 8px;">
        <div>
          <div class="srs-field__label">{{ t('reviewDueDate', '或选择日期') }}</div>
          <input class="b3-text-field" type="date" v-model="reviewDueDate" @change="onReviewDueDateChange"/>
        </div>
        <div></div>
      </div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn srs-btn--active" @click="applyReview" title="Ctrl+Shift+R">Ctrl+Shift+R {{ t('execute', '执行复习') }}</button>
        <span class="fn__space"></span>
        <span class="ft__secondary">{{ reviewPostponeDays > 0 || reviewDueDate ? t('reviewWithRescheduleHint', '执行复习后将推迟到指定日期') : t('reviewHint', '执行复习并更新 SRS 数据') }}</span>
      </div>
    </div>

    <div class="srs-section">
      <div class="srs-section__title">{{ t('advancedSettings', '高级设置') }}</div>
      <div class="fn__flex srs-action-row">
        <button class="b3-button srs-btn b3-button--outline" @click="openFsrsSettings">
          {{ t('openFsrsSettings', '打开自定义算法计划') }}
        </button>
        <span class="fn__space"></span>
        <span class="ft__secondary">{{ t('fsrsSettingsHint', '配置 FSRS 参数、目标记忆率和计划预览') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Dialog } from 'siyuan';
import { getBlockInfo, getBlockDOM } from '@/core/siyuan/api';
import { getCardBlockIds } from '@/core/siyuan/block';
import { DEFAULT_SETTINGS, CardState } from '@/types';
import { createScheduler } from '@/core/scheduler';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import FsrsSettingsPanel from './FsrsSettingsPanel.vue';
import type FSRSPlugin from '@/index';

const props = defineProps<{
  card: { id: string; blockId: string; deckId: string };
  deckId: string;
  i18n?: Record<string, string>;
  plugin?: FSRSPlugin;  // ✅ 添加 plugin prop
}>();

const selectDocAll = ref(false);
const selectedBlocks = ref<string[]>([]);
const selectedCards = ref<string[]>([]);
const firstBlock = ref<string>(props.card.blockId);
const firstCardId = ref<string>(props.card.id);

const frontText = ref('');
const backText = ref('');
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

const postponeDays = ref<number>(7);
const dueDate = ref<string>('');
const reviewRating = ref<1 | 2 | 3 | 4>(3);
const reviewPostponeDays = ref<number>(0);
const reviewDueDate = ref<string>('');

const algo = ref<'fsrs' | 'sm2'>('fsrs');
const intensity = ref<'dense' | 'normal' | 'loose'>('normal');
const planStart = ref<string>('');
const planEnd = ref<string>('');
const metadataVisible = ref(false);
const rescheduleTouched = ref(false);
const reviewTouched = ref(false);
const planTouched = ref(false);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const paramsText = computed(() => {
  if (algo.value === 'sm2') {
    return 'EF=2.50, I1=1d, I2=6d, minI=1d';
  }
  const p = DEFAULT_SETTINGS.fsrs;
  return `ret=${p.requestRetention}, maxInt=${p.maximumInterval}, w[0]=${p.weights[0].toFixed(2)}...`;
});

const hasSelection = computed(() => selectedCards.value.length > 0);
const rescheduleValid = computed(() => {
  if (dueDate.value) {
    const due = new Date(dueDate.value);
    return !isNaN(due.getTime()) && due.getTime() > Date.now();
  }
  return Number.isFinite(postponeDays.value) && postponeDays.value >= 1;
});
const rescheduleEnabled = computed(() => hasSelection.value && rescheduleTouched.value && rescheduleValid.value);
const reviewEnabled = computed(() => hasSelection.value && reviewTouched.value);
const planValid = computed(() => {
  if (!planStart.value || !planEnd.value) return false;
  const start = new Date(planStart.value).getTime();
  const end = new Date(planEnd.value).getTime();
  const now = Date.now();
  if (isNaN(start) || isNaN(end)) return false;
  return end > start && start > now;
});
const planEnabled = computed(() => hasSelection.value && planTouched.value && planValid.value);

const algoInfo = computed(() => {
  if (algo.value === 'sm2') {
    return {
      name: 'SM2',
      description: t('sm2Desc', '经典间隔重复算法，节奏稳定、易于掌控'),
      scene: t('sm2Scene', '适合固定节奏或复习频率较低的卡片'),
    };
  }
  return {
    name: 'FSRS v6 (ts-fsrs)',
    description: t('fsrsDesc', '基于遗忘曲线的自适应算法，安排更精细'),
    scene: t('fsrsScene', '适合长期记忆与大量卡片的动态管理'),
  };
});

const curvePoints = computed(() => {
  const now = new Date();
  const points: string[] = [];
  for (let d = 0; d <= 30; d += 3) {
    let r = 0.5;
    if (algo.value === 'sm2') {
      r = Math.exp(-d / 18);
    } else {
      const scheduler = createScheduler(DEFAULT_SETTINGS.fsrs);
      const fakeCard = {
        due: now.getTime(),
        stability: 20,
        difficulty: 5,
        elapsedDays: d,
        scheduledDays: d,
        reps: 5,
        lapses: 1,
        state: 2,
        lastReview: now.getTime() - d * 24 * 60 * 60 * 1000,
      } as any;
      r = scheduler.getRetrievability(fakeCard, now);
    }
    const x = Math.round((d / 30) * 100);
    const y = Math.round((1 - r) * 28) + 1;
    points.push(`${x},${y}`);
  }
  return points.join(' ');
});

async function loadSelection() {
  if (!selectDocAll.value) {
    selectedBlocks.value = [props.card.blockId];
    
    // ✅ 新架构：从本地存储查询卡片
    try {
      const card = props.plugin?.storage.getCardByBlockId(props.card.blockId);
      
      if (card) {
        selectedCards.value = [card.id];
        console.log('[SrsEditor] loadSelection: resolved id from storage:', card.id);
      } else {
        selectedCards.value = [props.card.id];
        console.log('[SrsEditor] loadSelection: fallback to props id:', props.card.id);
      }
    } catch (err) {
      console.warn('[SrsEditor] Failed to query local storage:', err);
      selectedCards.value = [props.card.id];
    }
    
    await loadMeta(props.card.blockId, selectedCards.value[0]);
    return;
  }
  try {
    const info = await getBlockInfo(props.card.blockId);
    const rootId = info?.root_id || info?.rootId || info?.root;
    if (!rootId) {
      selectedBlocks.value = [props.card.blockId];
      selectedCards.value = [props.card.id];
      await loadMeta(props.card.blockId, props.card.id);
      return;
    }
    const blocks = await getCardBlockIds({ type: 'doc', value: rootId });
    selectedBlocks.value = blocks.length ? blocks : [props.card.blockId];
    
    // ✅ 新架构：从本地存储批量查询卡片
    const cardIds: string[] = [];
    for (const blockId of selectedBlocks.value) {
      const card = props.plugin?.storage.getCardByBlockId(blockId);
      if (card) {
        cardIds.push(card.id);
      }
    }
    selectedCards.value = cardIds.length ? cardIds : [props.card.id];
    console.log('[SrsEditor] loadSelection doc cards:', selectedCards.value);
    await loadMeta(selectedBlocks.value[0], selectedCards.value[0]);
  } catch {
    selectedBlocks.value = [props.card.blockId];
    selectedCards.value = [props.card.id];
  }
}

async function loadMeta(blockId: string, cardId: string) {
  try {
    const dom = await getBlockDOM(blockId);
    const tmp = document.createElement('div');
    tmp.innerHTML = dom.dom;
    const txt = tmp.textContent || '';
    frontText.value = txt.trim();
    backText.value = '';
  } catch {
    frontText.value = '';
    backText.value = '';
  }
  try {
    const info = await getBlockInfo(blockId);
    
    // ✅ 新架构：从本地存储获取卡片数据
    const card = props.plugin?.storage.getCardByBlockId(blockId);
    
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
    
    console.log('[SrsEditor] Loaded card data:', card);
    
    const lastReviewDate = card?.lastReview ? new Date(card.lastReview) : null;
    const nextReviewDate = card?.due ? new Date(card.due) : null;
    lastReviewText.value = lastReviewDate ? lastReviewDate.toLocaleString() : t('pending', '待首次复习');
    nextReviewText.value = nextReviewDate ? nextReviewDate.toLocaleString() : t('pending', '待安排');
    lastReviewState.value = lastReviewDate ? 'date' : card ? 'pending' : 'unknown';
    nextReviewState.value = nextReviewDate ? 'date' : card ? 'pending' : 'unknown';
    repsText.value = formatNumber(card?.reps);
    lapsesText.value = formatNumber(card?.lapses);
    stabilityText.value = card?.stability ? `${card.stability.toFixed(1)} 天` : t('notLearned', '未学习');
    difficultyText.value = card?.difficulty ? card.difficulty.toFixed(2) : '-';
    elapsedDaysText.value = formatNumber(card?.elapsedDays);
    scheduledDaysText.value = formatNumber(card?.scheduledDays);
    if (card?.state === 0) stateText.value = t('newCard', '新卡');
    else if (card?.state === 1) stateText.value = t('learning', '学习中');
    else if (card?.state === 2) stateText.value = t('reviewCard', '复习');
    else if (card?.state === 3) stateText.value = t('relearning', '重新学习');
    else stateText.value = t('unknown', '未知');
  } catch {
    createdAtText.value = t('unknown', '未知');
    updatedAtText.value = t('unknown', '未知');
    lastReviewText.value = t('unknown', '未知');
    nextReviewText.value = t('unknown', '未知');
    lastReviewState.value = 'unknown';
    nextReviewState.value = 'unknown';
    repsText.value = t('unknown', '未知');
    lapsesText.value = t('unknown', '未知');
    stabilityText.value = t('unknown', '未知');
    difficultyText.value = t('unknown', '未知');
    elapsedDaysText.value = t('unknown', '未知');
    scheduledDaysText.value = t('unknown', '未知');
    stateText.value = t('unknown', '未知');
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
    // 先尝试直接解析 ISO 格式（如 "2026-01-21T05:03:49.7733728+08:00"）
    const directParsed = new Date(raw);
    if (!isNaN(directParsed.getTime())) return directParsed;
    // 兼容旧格式：替换 - 为 /
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

function resolveTimeText(candidates: unknown[], fallbackToNow: boolean): string {
  const date = resolveTimeDate(candidates, fallbackToNow);
  if (!date) return t('unknown', '未知');
  return date.toLocaleString();
}

function formatNumber(value: unknown, digits?: number): string {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (num === null || num === undefined || Number.isNaN(num)) return t('unknown', '未知');
  return digits !== undefined ? num.toFixed(digits) : String(num);
}

function statusClass(state: 'date' | 'pending' | 'unknown') {
  return {
    'srs-status--pending': state === 'pending',
    'srs-status--unknown': state === 'unknown',
  };
}

function statusLabel(state: 'date' | 'pending' | 'unknown') {
  if (state === 'pending') return t('unreviewed', '未复习');
  if (state === 'unknown') return t('unknown', '未知');
  return '';
}

function statusTitle(state: 'date' | 'pending' | 'unknown') {
  if (state === 'pending') return t('unreviewedHint', '未复习：表示已学习但尚未进行复习的内容');
  if (state === 'unknown') return t('unknownHint', '未知：表示尚未接触或学习的内容');
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
        <button class="b3-button b3-button--text">${t('ok', '确定')}</button>
      </div>
    `,
    width: '360px',
  });
  const button = dialog.element.querySelector('.b3-button') as HTMLButtonElement | null;
  if (button) {
    button.addEventListener('click', () => dialog.destroy());
  }
}

function setSelection(value: boolean) {
  if (selectDocAll.value === value) return;
  selectDocAll.value = value;
  loadSelection();
}

function toggleMetadata() {
  metadataVisible.value = !metadataVisible.value;
}

function markRescheduleTouched() {
  rescheduleTouched.value = true;
}

function markReviewTouched() {
  reviewTouched.value = true;
}

// 安排日期：当选择日期时，自动计算天数
function onDueDateChange() {
  if (!dueDate.value) return;
  const selected = new Date(dueDate.value);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = selected.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    postponeDays.value = diffDays;
  }
}

// 安排日期：当输入天数时，清空日期选择
function onPostponeDaysChange() {
  dueDate.value = '';
}

// 执行复习：当选择日期时，自动计算天数
function onReviewDueDateChange() {
  if (!reviewDueDate.value) return;
  const selected = new Date(reviewDueDate.value);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = selected.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    reviewPostponeDays.value = diffDays;
  }
}

// 执行复习：当输入天数时，清空日期选择
function onReviewPostponeDaysChange() {
  reviewDueDate.value = '';
}

function markPlanTouched() {
  planTouched.value = true;
}

function openFsrsSettings() {
  createVueDialog({
    title: t('fsrsSettingsTitle', '自定义算法计划'),
    component: FsrsSettingsPanel,
    props: {
      i18n: props.i18n || {},
    },
    width: '800px',
  });
}

async function handleReset() {
  if (!hasSelection.value) return;
  const confirmed = await confirmDialog({
    title: t('resetConfirmTitle', '确认重置学习进度'),
    content: t('resetConfirmContent', '该操作将清除所选卡片的复习记录，且不可撤销。是否继续？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!confirmed) return;
  
  try {
    // ✅ 新架构：使用 StorageManager 重置卡片
    for (const blockId of selectedBlocks.value) {
      const card = props.plugin?.storage.getCardByBlockId(blockId);
      if (card) {
        // 重置卡片状态
        card.state = CardState.New;
        card.due = Date.now();
        card.stability = 0;
        card.difficulty = 0;
        card.reps = 0;
        lapses = 0;
        card.elapsedDays = 0;
        card.scheduledDays = 0;
        card.lastReview = 0;
        
        props.plugin?.storage.setCard(card);
      }
    }
    
    await props.plugin?.storage.saveCards();
    await loadSelection();
    alert(t('resetDone', '已重置所选卡片'));
  } catch (err) {
    console.error('[SiyuanMemo] reset error', err);
    alert(t('resetFailed', '重置失败'));
  }
}

async function applyReschedule() {
  console.log('[SrsEditor] applyReschedule called, hasSelection:', hasSelection.value, 'selectedCards:', selectedCards.value);
  if (!hasSelection.value) {
    console.log('[SrsEditor] No selection, returning');
    return;
  }
  
  // 计算新的到期时间（时间戳）
  let dueTimestamp: number;
  if (dueDate.value) {
    const due = new Date(dueDate.value);
    const now = new Date();
    if (due.getTime() <= now.getTime()) {
      showResultDialog({
        title: t('reschedule', '安排日期'),
        content: t('dateInvalid', '请选择晚于当前的日期'),
        type: 'error',
      });
      return;
    }
    dueTimestamp = due.getTime();
  } else {
    const due = new Date();
    due.setDate(due.getDate() + Math.max(1, postponeDays.value || 1));
    dueTimestamp = due.getTime();
  }
  
  console.log('[SrsEditor] Rescheduling to timestamp:', dueTimestamp);
  
  try {
    // ✅ 新架构：使用 StorageManager 批量更新卡片
    for (const blockId of selectedBlocks.value) {
      const card = props.plugin?.storage.getCardByBlockId(blockId);
      if (card) {
        card.due = dueTimestamp;
        card.updatedAt = Date.now();
        props.plugin?.storage.setCard(card);
      }
    }
    
    await props.plugin?.storage.saveCards();
    await loadSelection();
    showResultDialog({
      title: t('reschedule', '安排日期'),
      content: t('rescheduleDone', '已更新到期时间'),
      type: 'success',
    });
  } catch (err) {
    console.error('[SiyuanMemo] reschedule error', err);
    showResultDialog({
      title: t('reschedule', '安排日期'),
      content: t('rescheduleFailed', '更新到期时间失败'),
      type: 'error',
    });
  }
}

async function applyReview() {
  if (!hasSelection.value) return;
  
  try {
    // ✅ 新架构：使用 SchedulerRouter 执行复习
    for (const blockId of selectedBlocks.value) {
      const card = props.plugin?.storage.getCardByBlockId(blockId);
      if (card && props.plugin?.schedulerRouter) {
        // 1. 执行复习（使用调度器计算新的复习时间）
        const updatedCard = props.plugin.schedulerRouter.route(card, reviewRating.value);
        
        // 2. 如果指定了推迟天数或日期，则在复习后重新排期
        if (reviewPostponeDays.value > 0 || reviewDueDate.value) {
          let dueTimestamp: number;
          if (reviewDueDate.value) {
            const due = new Date(reviewDueDate.value);
            dueTimestamp = due.getTime();
          } else {
            const due = new Date();
            due.setDate(due.getDate() + reviewPostponeDays.value);
            dueTimestamp = due.getTime();
          }
          updatedCard.due = dueTimestamp;
          console.log('[SrsEditor] Review + reschedule to timestamp:', dueTimestamp);
        }
        
        updatedCard.updatedAt = Date.now();
        props.plugin.storage.setCard(updatedCard);
      }
    }
    
    await props.plugin?.storage.saveCards();
    await loadSelection();
    
    const message = reviewPostponeDays.value > 0 || reviewDueDate.value
      ? t('reviewWithRescheduleDone', '已执行复习并推迟到指定日期')
      : t('reviewDone', '已执行复习并更新 SRS 数据');
    
    showResultDialog({
      title: t('executeReview', '执行复习'),
      content: message,
      type: 'success',
    });
  } catch (err) {
    console.error('[SiyuanMemo] review error', err);
    showResultDialog({
      title: t('executeReview', '执行复习'),
      content: t('reviewFailed', '复习操作失败'),
      type: 'error',
    });
  }
}

async function applyPlan() {
  if (!hasSelection.value) return;
  if (!planStart.value || !planEnd.value) {
    alert(t('planDateMissing', '请设置开始与结束日期'));
    return;
  }
  const start = new Date(planStart.value).getTime();
  const end = new Date(planEnd.value).getTime();
  const now = Date.now();
  if (isNaN(start) || isNaN(end) || end <= start || start <= now) {
    alert(t('planDateInvalid', '计划日期区间不合法'));
    return;
  }
  const count = selectedBlocks.value.length;
  if (count === 0) return;
  const span = end - start;
  let factor = algo.value === 'sm2' ? 0.65 : 0.5;
  if (intensity.value === 'dense') factor *= 0.8;
  if (intensity.value === 'loose') factor *= 1.2;
  factor = Math.min(1.2, Math.max(0.2, factor));
  
  try {
    // ✅ 新架构：使用 StorageManager 批量更新卡片
    for (let i = 0; i < count; i++) {
      const blockId = selectedBlocks.value[i];
      const card = props.plugin?.storage.getCardByBlockId(blockId);
      if (card) {
        const pos = (i + 1) / (count + 1);
        const dueTimestamp = start + Math.floor(span * Math.pow(pos, factor));
        card.due = dueTimestamp;
        card.updatedAt = Date.now();
        props.plugin?.storage.setCard(card);
      }
    }
    
    await props.plugin?.storage.saveCards();
    await loadSelection();
    alert(t('planApplied', '已应用复习计划'));
  } catch (err) {
    console.error('[SiyuanMemo] plan error', err);
    alert(t('planFailed', '复习计划应用失败'));
  }
}

onMounted(async () => {
  await loadSelection();
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      applyReschedule();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      applyReview();
    }
  }, { once: true });
});
</script>

<style>
.srs-editor {
  padding: 12px;
  padding-bottom: 48px;
  gap: 12px;
  overflow-y: auto;
  max-height: 100%;
}

/* 核心状态概览区域 */
.srs-section--overview {
  background: var(--b3-theme-surface);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.srs-grid--overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px 16px;
}

.srs-overview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.srs-overview-item__label {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.srs-overview-item__value {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.srs-overview-item--highlight {
  background: var(--b3-theme-primary-lightest);
  padding: 8px 12px;
  border-radius: 6px;
  margin: -4px;
}

.srs-overview-item--highlight .srs-overview-item__value {
  color: var(--b3-theme-primary);
  font-size: 15px;
}
.srs-editor__header {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.srs-button-group {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.srs-btn {
  border: 1px solid var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  background: transparent;
}
.srs-btn--active {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary);
}
.srs-btn--inactive {
  background: var(--b3-theme-surface);
  border-color: var(--b3-border-color);
  color: var(--b3-theme-on-surface-light);
}
.srs-btn--disabled {
  background: var(--b3-border-color);
  border-color: var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  opacity: 0.5;
  cursor: not-allowed;
}
.srs-select-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.srs-check {
  width: 14px;
  height: 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 3px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.srs-check--checked {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
}
.srs-check--checked::after {
  content: '';
  width: 6px;
  height: 3px;
  border-left: 2px solid var(--b3-theme-on-primary);
  border-bottom: 2px solid var(--b3-theme-on-primary);
  transform: rotate(-45deg);
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
  padding: 10px;
  background: var(--b3-theme-surface);
}
.srs-action-row {
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.srs-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.srs-section__title {
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}
.srs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.srs-field__label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 4px;
}
.srs-field__value {
  font-size: 13px;
  color: var(--b3-theme-on-surface);
  background: var(--b3-theme-surface);
  border-radius: 6px;
  padding: 6px;
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
}
.srs-chart {
  display: flex;
  align-items: center;
  gap: 8px;
}
.srs-chart svg {
  width: 260px;
  height: 80px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
}
.srs-chart__legend {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}
</style>
