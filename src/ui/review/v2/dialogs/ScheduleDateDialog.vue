<template>
  <div class="schedule-date-dialog">
    <div class="schedule-date-dialog__header">
      <svg><use xlink:href="#iconCalendar"></use></svg>
      <span>{{ t('scheduleDate', '安排复习日期') }}</span>
    </div>
    
    <div class="schedule-date-dialog__content">
      <!-- 日期选择 -->
      <div class="schedule-date-dialog__section">
        <div class="schedule-date-dialog__field">
          <label>{{ t('chooseDate', '选择日期') }}</label>
          <input
            v-model="dueDate"
            type="date"
            class="b3-text-field"
            @change="onDateChange"
          />
        </div>
        
        <div class="schedule-date-dialog__field">
          <label>{{ t('orInputDays', '或输入天数') }}</label>
          <input
            v-model.number="days"
            type="number"
            :min="1"
            :placeholder="t('daysPlaceholder', '例如输入 7 表示 7 天后')"
            class="b3-text-field"
            @input="onDaysChange"
          />
        </div>
      </div>
      
      <!-- 修改方式 -->
      <div class="schedule-date-dialog__section">
        <div class="schedule-date-dialog__field">
          <label>{{ t('modifyMode', '修改方式') }}</label>
          <select v-model="mode" class="b3-select">
            <option value="rating">{{ t('ratingMode', '评分模式') }}</option>
            <option value="direct">{{ t('directMode', '仅修改日期') }}</option>
          </select>
        </div>
        
        <!-- 评分选择 (仅 Item 卡片 + 评分模式) -->
        <div v-if="mode === 'rating' && cardType === 'item'" class="schedule-date-dialog__field">
          <label>{{ t('selectRating', '选择评分') }}</label>
          <div class="schedule-date-dialog__ratings">
            <label v-for="r in [1, 2, 3, 4]" :key="r" class="schedule-date-dialog__rating">
              <input
                v-model.number="rating"
                type="radio"
                :value="r"
                name="rating"
              />
              <span>{{ getRatingLabel(r) }}</span>
            </label>
          </div>
        </div>
        
        <!-- Topic 卡片提示 -->
        <div v-if="mode === 'rating' && cardType === 'topic'" class="schedule-date-dialog__hint">
          {{ t('topicRatingHint', 'Topic 卡片将使用 Good 评分') }}
        </div>
      </div>
    </div>
    
    <div class="schedule-date-dialog__actions">
      <button class="b3-button b3-button--cancel" @click="handleCancel">
        {{ t('cancel', '取消') }}
      </button>
      <button class="b3-button b3-button--text" @click="handleConfirm">
        {{ t('confirm', '确认') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  cardType: 'item' | 'topic'; // 卡片类型
  i18n?: Record<string, string>;
}

export interface ScheduleOptions {
  mode: 'rating' | 'direct'; // 修改方式
  rating?: 1 | 2 | 3 | 4; // 评分 (仅 rating 模式)
  dueDate?: string; // 日期 (YYYY-MM-DD)
  days?: number; // 天数
}

interface Emits {
  (e: 'confirm', options: ScheduleOptions): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const mode = ref<'rating' | 'direct'>('rating');
const rating = ref<1 | 2 | 3 | 4>(3);
const dueDate = ref<string>('');
const days = ref<number>(7);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function onDateChange() {
  if (dueDate.value) {
    // 计算天数
    const selected = new Date(dueDate.value);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffMs = selected.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      days.value = diffDays;
    }
  }
}

function onDaysChange() {
  // 清空日期选择
  dueDate.value = '';
}

function getRatingLabel(r: number): string {
  const labels = {
    1: t('again', 'Again'),
    2: t('hard', 'Hard'),
    3: t('good', 'Good'),
    4: t('easy', 'Easy'),
  };
  return labels[r as keyof typeof labels] || '';
}

function handleConfirm() {
  const options: ScheduleOptions = {
    mode: mode.value,
  };
  
  // 日期优先
  if (dueDate.value) {
    options.dueDate = dueDate.value;
  } else if (days.value > 0) {
    options.days = days.value;
  } else {
    // 默认 7 天
    options.days = 7;
  }
  
  // 评分模式
  if (mode.value === 'rating') {
    options.rating = props.cardType === 'topic' ? 3 : rating.value;
  }
  
  emit('confirm', options);
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.schedule-date-dialog {
  background-color: var(--b3-theme-background);
  border-radius: var(--b3-border-radius);
  padding: 16px;
  min-width: 480px;
  min-height: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--b3-dialog-shadow);
  display: flex;
  flex-direction: column;
}

.schedule-date-dialog__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 16px;
  color: var(--b3-theme-on-background);
  flex-shrink: 0;
}

.schedule-date-dialog__header svg {
  width: 18px;
  height: 18px;
  color: var(--b3-theme-primary);
}

.schedule-date-dialog__content {
  margin-bottom: 20px;
  flex: 1 1 auto;
  min-height: 0;
}

.schedule-date-dialog__section {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--b3-theme-surface);
  border-radius: var(--b3-border-radius);
}

.schedule-date-dialog__section:last-child {
  margin-bottom: 0;
}

.schedule-date-dialog__field {
  margin-bottom: 14px;
}

.schedule-date-dialog__field:last-child {
  margin-bottom: 0;
}

.schedule-date-dialog__field label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--b3-theme-on-background);
}

.schedule-date-dialog__field input,
.schedule-date-dialog__field select {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border-radius: var(--b3-border-radius);
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  line-height: 1.5;
  min-height: 38px;
}

.schedule-date-dialog__field select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px;
  padding-right: 36px;
}

.schedule-date-dialog__field input:focus,
.schedule-date-dialog__field select:focus {
  outline: none;
  border-color: var(--b3-theme-primary);
  box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
}

.schedule-date-dialog__ratings {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  min-height: 180px;
}

.schedule-date-dialog__rating {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--b3-border-radius);
  transition: background-color 0.15s ease-in-out;
}

.schedule-date-dialog__rating:hover {
  background-color: var(--b3-list-hover);
}

.schedule-date-dialog__rating input[type="radio"] {
  width: auto;
  cursor: pointer;
  margin: 0;
}

.schedule-date-dialog__rating span {
  font-size: 14px;
  color: var(--b3-theme-on-background);
}

.schedule-date-dialog__hint {
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  padding: 10px 12px;
  background-color: var(--b3-theme-primary-lightest);
  border-radius: var(--b3-border-radius-b);
  border-left: 3px solid var(--b3-theme-primary);
}

.schedule-date-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-theme-surface);
  flex-shrink: 0;
}

.schedule-date-dialog__actions .b3-button {
  min-width: 80px;
}
</style>
