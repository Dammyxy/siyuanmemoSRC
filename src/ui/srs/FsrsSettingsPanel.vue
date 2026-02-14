<template>
  <div class="fsrs-settings">
    <!-- 计划预览 -->
    <div class="fsrs-section">
      <div class="fsrs-section__title">{{ t('schedulePreview', '计划预览') }}</div>
      <div class="fsrs-preview">
        <div class="fsrs-preview-row" v-for="(row, rowIdx) in previewSteps" :key="rowIdx">
          <span class="fsrs-preview-num">{{ rowIdx + 1 }}.</span>
          <div class="fsrs-preview-steps">
            <template v-for="(step, stepIdx) in row" :key="stepIdx">
              <span class="fsrs-pill" :class="'fsrs-pill--' + step.rating">
                {{ ratingLabels[step.rating] }}
              </span>
              <span class="fsrs-interval">{{ step.interval }}</span>
              <span class="fsrs-arrow" v-if="stepIdx < row.length - 1">→</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- FSRS 设置 -->
    <div class="fsrs-section">
      <div class="fsrs-section__title">{{ t('fsrsSettings', '免费间隔重复调度器 (FSRS v6) 设置') }}</div>
      
      <!-- 目标记忆率 -->
      <div class="fsrs-field">
        <div class="fsrs-field__label">{{ t('targetRetention', '目标记忆率') }}</div>
        <p class="fsrs-field__desc">{{ t('retentionDesc', '随着时间的推移，你回忆起某张卡片的概率会下降，其速度取决于该知识点的难度以及距离上次回忆的时间。当 RemNote 认为你记起这张卡片的概率已降至此百分比时，便会将其放入你的练习队列中。') }}</p>
        <div class="fsrs-slider-row">
          <input type="range" class="b3-slider" v-model.number="retention" min="70" max="99" step="1"/>
          <input type="number" class="b3-text-field fsrs-num-input" v-model.number="retention" min="70" max="99"/>
          <span>%</span>
        </div>
      </div>

      <!-- 权重 -->
      <div class="fsrs-field">
        <div class="fsrs-field__label">{{ t('weights', '权重') }}</div>
        <p class="fsrs-field__desc">{{ t('weightsDesc', '这些参数控制着 FSRS 再次向您展示记忆卡片的间隔时间。我们不建议您手动编辑这些参数；相反，您可以使用下方的按钮，根据您的学习记录自动选择合适的值（您需要至少完成 1000 次记忆卡片练习）。') }}</p>
        <div class="fsrs-link" @click="resetWeights">{{ t('useDefaultWeights', '使用默认权重') }}</div>
        <textarea class="b3-text-field fn__block fsrs-weights-input" v-model="weightsText" rows="3"></textarea>

      </div>

      <!-- 最大间隔 -->
      <div class="fsrs-field">
        <div class="fsrs-field__label">{{ t('maxInterval', '最大间隔') }}</div>
        <p class="fsrs-field__desc">{{ t('maxIntervalDesc', '如果卡片的复习间隔超过此天数，则该间隔将被限制在此值。例如，如果您输入 365，则每张卡片每年至少会复习一次。') }}</p>
        <div class="fsrs-slider-row">
          <input type="number" class="b3-text-field fsrs-num-input" v-model.number="maxInterval" min="1"/>
          <span>{{ t('days', '天') }}</span>
        </div>
      </div>
    </div>

    <!-- 计划重置 -->
    <div class="fsrs-section">
      <div class="fsrs-section__title">{{ t('schedulerReset', '计划重置') }}</div>
      <p class="fsrs-field__desc">{{ t('resetDesc', '重置计划会恢复默认设置。') }}</p>
      <div class="fsrs-btn-row">
        <button class="b3-button b3-button--outline" @click="resetToDefaults">
          <svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>
          {{ t('resetDefaults', '重置默认值') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef } from 'vue';
import { FSRS, createEmptyCard, Rating, type FSRSParameters } from 'ts-fsrs';

const props = defineProps<{
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'change', config: any): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}



const ratingLabels: Record<number, string> = {
  [Rating.Again]: '忘记',
  [Rating.Hard]: '困难',
  [Rating.Good]: '良好',
  [Rating.Easy]: '简单',
};

// 状态
const retention = ref(90);
const maxInterval = ref(365);
const weightsText = ref('');

// 默认权重
const defaultWeights = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
];

// 解析权重
const weights = computed<number[]>(() => {
  try {
    const parsed = weightsText.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    return parsed.length === 19 ? parsed : defaultWeights;
  } catch {
    return defaultWeights;
  }
});

// FSRS 实例
const fsrsInstance = shallowRef<FSRS | null>(null);

watch([retention, weights], () => {
  const params: Partial<FSRSParameters> = {
    request_retention: retention.value / 100,
    maximum_interval: maxInterval.value,
    w: weights.value,
  };
  fsrsInstance.value = new FSRS(params);
}, { immediate: true });

// 格式化间隔
function formatInterval(days: number): string {
  if (days < 1) {
    const mins = Math.round(days * 24 * 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.round(mins / 60)} hours`;
  }
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

// 预览步骤 - 模拟 RemNote 风格的连续路径
// 每行显示一条不同的复习路径（不同起始评分）
const previewSteps = computed(() => {
  const fsrs = fsrsInstance.value;
  if (!fsrs) return [];

  const rows: Array<Array<{ rating: Rating; interval: string }>> = [];
  
  // 5条路径，每条使用不同的主要评分
  const pathPatterns = [
    [Rating.Good, Rating.Easy, Rating.Good, Rating.Good, Rating.Again, Rating.Good, Rating.Easy, Rating.Good, Rating.Good, Rating.Good],
    [Rating.Easy, Rating.Good, Rating.Hard, Rating.Hard, Rating.Good, Rating.Easy, Rating.Good, Rating.Good, Rating.Good, Rating.Good],
    [Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good],
    [Rating.Hard, Rating.Again, Rating.Good, Rating.Good, Rating.Hard, Rating.Good, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy],
    [Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy],
  ];

  for (const pattern of pathPatterns) {
    let card = createEmptyCard();
    let time = new Date();
    const row: Array<{ rating: Rating; interval: string }> = [];

    for (const rating of pattern) {
      const result = fsrs.repeat(card, time)[rating];
      const intervalDays = result.card.scheduled_days;
      
      row.push({
        rating,
        interval: formatInterval(intervalDays),
      });

      // 前进到下一次复习时间
      card = result.card;
      time = new Date(time.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }

    rows.push(row);
  }

  return rows;
});

// 初始化权重文本
function initWeightsText() {
  weightsText.value = defaultWeights.map(w => w.toFixed(4)).join(', ');
}
initWeightsText();

// 操作函数
function resetWeights() {
  initWeightsText();
}

function resetToDefaults() {
  retention.value = 90;
  maxInterval.value = 365;
  initWeightsText();
  emitChange();
}

function emitChange() {
  emit('change', {
    fsrsParams: {
      request_retention: retention.value / 100,
      maximum_interval: maxInterval.value,
      w: weights.value,
    },
  });
}

// 监听变化并通知父组件
watch([retention, maxInterval, weightsText], emitChange);
</script>

<style scoped>
.fsrs-settings {
  padding: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

.fsrs-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
}

.fsrs-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
  margin-bottom: 12px;
}

.fsrs-field {
  margin-bottom: 16px;
}

.fsrs-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--b3-theme-on-background);
  margin-bottom: 4px;
}

.fsrs-field__desc {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
  line-height: 1.5;
}

.fsrs-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fsrs-slider-row .b3-slider {
  flex: 1;
}

.fsrs-num-input {
  width: 80px;
  text-align: center;
}

.fsrs-link {
  color: var(--b3-theme-primary);
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 8px;
}

.fsrs-link:hover {
  text-decoration: underline;
}

.fsrs-weights-input {
  font-family: var(--b3-font-family-code);
  font-size: 12px;
}

/* 计划预览样式 */
.fsrs-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--b3-theme-background);
  border-radius: 6px;
}

.fsrs-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fsrs-preview-num {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  min-width: 20px;
}

.fsrs-preview-steps {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.fsrs-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.fsrs-pill--1 { /* Again */
  background: rgba(255, 82, 82, 0.2);
  color: #ff5252;
}

.fsrs-pill--2 { /* Hard */
  background: rgba(255, 167, 38, 0.2);
  color: #ffa726;
}

.fsrs-pill--3 { /* Good */
  background: rgba(102, 187, 106, 0.2);
  color: #66bb6a;
}

.fsrs-pill--4 { /* Easy */
  background: rgba(66, 165, 245, 0.2);
  color: #42a5f5;
}

.fsrs-interval {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
  margin: 0 4px;
}

.fsrs-arrow {
  color: var(--b3-theme-on-surface-light);
  font-size: 10px;
}
</style>
