<template>
  <div class="srs-arena-conflict-dialog">
    <p class="srs-arena-conflict-dialog__desc">
      {{ t('srsArenaConflictDesc', 'Arena 发现本次评分后的排期分歧较大。只在你手动采用时改下一次排期，不回滚本次评分。') }}
    </p>

    <div class="srs-arena-conflict-dialog__meta">
      <span>{{ t('srsArenaContext', '上下文') }}：{{ recommendation.schedulingContextLabel || '-' }}</span>
      <span>{{ t('srsArenaRatingBasis', '本次评分') }}：{{ ratingLabel }}</span>
    </div>

    <div class="srs-arena-conflict-dialog__section">
      <div class="srs-arena-conflict-dialog__row srs-arena-conflict-dialog__row--official">
        <div>
          <div class="srs-arena-conflict-dialog__label">{{ t('srsArenaFormalSchedule', '正式调度') }}</div>
          <div class="srs-arena-conflict-dialog__sub">{{ t('srsArenaCurrentStoredPath', '当前评分写入后的正式排期') }}</div>
        </div>
        <div class="srs-arena-conflict-dialog__value">
          {{ formatDays(recommendation.currentSchedulerIntervalDays) }}
        </div>
      </div>
      <button type="button" class="b3-button b3-button--cancel" @click="emit('keep')">
        {{ t('srsArenaKeepOfficial', '保留正式排期') }}
      </button>
    </div>

    <div class="srs-arena-conflict-dialog__section">
      <div class="srs-arena-conflict-dialog__row">
        <div>
          <div class="srs-arena-conflict-dialog__label">{{ t('srsArenaWeightedSchedule', 'Arena 综合排期') }}</div>
          <div class="srs-arena-conflict-dialog__sub">
            {{ formatDue(recommendation.weightedDue) }} · {{ t('srsArenaDeviation', '偏差') }} {{ formatDeviation(recommendation.weightedIntervalDays) }}
          </div>
        </div>
        <div class="srs-arena-conflict-dialog__value">
          {{ formatDays(recommendation.weightedIntervalDays) }}
        </div>
      </div>
      <button type="button" class="b3-button b3-button--text" @click="adoptWeighted">
        {{ t('srsArenaAdoptWeighted', '采用 Arena 综合排期') }}
      </button>
    </div>

    <div class="srs-arena-conflict-dialog__section">
      <div class="srs-arena-conflict-dialog__section-title">{{ t('srsArenaContestants', '挑战者排期') }}</div>
      <div
        v-for="contestant in contestantRows"
        :key="contestant.contestantId"
        class="srs-arena-conflict-dialog__candidate"
      >
        <div class="srs-arena-conflict-dialog__candidate-main">
          <div class="srs-arena-conflict-dialog__label">{{ contestant.label }}</div>
          <div class="srs-arena-conflict-dialog__sub">
            {{ formatDue(contestant.due) }} · {{ t('srsArenaDeviation', '偏差') }} {{ formatDeviation(contestant.intervalDays) }}
          </div>
        </div>
        <div class="srs-arena-conflict-dialog__candidate-side">
          <span class="srs-arena-conflict-dialog__value">{{ formatDays(contestant.intervalDays) }}</span>
          <button type="button" class="b3-button b3-button--outline" @click="adoptContestant(contestant)">
            {{ t('srsArenaAdoptContestant', '采用') }}
          </button>
        </div>
      </div>
    </div>

    <div class="srs-arena-conflict-dialog__footer">
      <button type="button" class="b3-button b3-button--cancel" @click="emit('close')">
        {{ t('close', '关闭') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SrsArenaContestantPrediction, SrsArenaRecommendation } from '@/types/arena';

type AdoptPayload = {
  kind: 'weighted' | 'contestant';
  contestantId?: string;
  dueTimestamp: number;
  scheduledDays: number;
};

type ContestantRow = {
  contestantId: string;
  label: string;
  due: number;
  intervalDays: number;
};

const props = defineProps<{
  recommendation: SrsArenaRecommendation;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'keep'): void;
  (e: 'adopt', payload: AdoptPayload): void;
  (e: 'close'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function ratingToLabel(value: number): string {
  switch (Math.floor(Number(value))) {
    case 1:
      return t('ratingAgain', '重来');
    case 2:
      return t('ratingHard', '困难');
    case 4:
      return t('ratingEasy', '简单');
    case 3:
    default:
      return t('ratingGood', '良好');
  }
}

function formatDays(value: number): string {
  const days = Math.max(0, Number(value) || 0);
  if (days < 1) {
    return `${Math.round(days * 24 * 60)} min`;
  }
  return days >= 10 ? `${Math.round(days)} d` : `${days.toFixed(1)} d`;
}

function formatDue(value: number): string {
  const due = Number(value);
  if (!Number.isFinite(due) || due <= 0) {
    return '-';
  }
  return new Date(due).toLocaleString();
}

function formatDeviation(intervalDays: number): string {
  const official = Math.max(0, Number(props.recommendation.currentSchedulerIntervalDays) || 0);
  if (official <= 0) {
    return '0%';
  }
  const ratio = Math.abs((Number(intervalDays) || 0) - official) / Math.max(1, official);
  return `${Math.round(ratio * 100)}%`;
}

function resolveChoice(contestant: SrsArenaContestantPrediction): ContestantRow {
  const rating = Math.floor(Number(props.recommendation.ratingBasis) || 3);
  const choice = contestant.choices.find((entry) => entry.rating === rating)
    || contestant.choices.find((entry) => entry.rating === 3)
    || contestant.choices[0];
  const due = Number(choice?.due);
  const intervalDays = Number(choice?.intervalDays);
  return {
    contestantId: contestant.contestantId,
    label: contestant.label,
    due: Number.isFinite(due) && due > 0 ? due : contestant.due,
    intervalDays: Number.isFinite(intervalDays) && intervalDays >= 0 ? intervalDays : contestant.intervalDays,
  };
}

const ratingLabel = computed(() => ratingToLabel(props.recommendation.ratingBasis));
const contestantRows = computed(() => props.recommendation.contestants.map(resolveChoice));

function adoptWeighted(): void {
  emit('adopt', {
    kind: 'weighted',
    dueTimestamp: props.recommendation.weightedDue,
    scheduledDays: Math.max(0, Number(props.recommendation.weightedIntervalDays) || 0),
  });
}

function adoptContestant(contestant: ContestantRow): void {
  emit('adopt', {
    kind: 'contestant',
    contestantId: contestant.contestantId,
    dueTimestamp: contestant.due,
    scheduledDays: Math.max(0, Number(contestant.intervalDays) || 0),
  });
}
</script>

<style scoped>
.srs-arena-conflict-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: auto;
  padding: 16px;
}

.srs-arena-conflict-dialog__desc {
  margin: 0;
  color: var(--b3-theme-on-surface-light);
  line-height: 1.6;
}

.srs-arena-conflict-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.srs-arena-conflict-dialog__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--b3-theme-surface-lighter);
  border-radius: 6px;
  padding: 10px;
}

.srs-arena-conflict-dialog__section-title,
.srs-arena-conflict-dialog__label {
  color: var(--b3-theme-on-background);
  font-weight: 600;
}

.srs-arena-conflict-dialog__row,
.srs-arena-conflict-dialog__candidate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.srs-arena-conflict-dialog__row--official {
  color: var(--b3-theme-on-surface);
}

.srs-arena-conflict-dialog__sub {
  margin-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.4;
}

.srs-arena-conflict-dialog__value {
  color: var(--b3-theme-primary);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.srs-arena-conflict-dialog__candidate-main {
  min-width: 0;
}

.srs-arena-conflict-dialog__candidate-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.srs-arena-conflict-dialog__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

@media (max-width: 520px) {
  .srs-arena-conflict-dialog__row,
  .srs-arena-conflict-dialog__candidate,
  .srs-arena-conflict-dialog__candidate-side {
    align-items: stretch;
    flex-direction: column;
  }

  .srs-arena-conflict-dialog__candidate-side {
    gap: 6px;
  }
}
</style>
