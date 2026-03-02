<template>
  <div class="spread-dialog">
    <div class="dialog__content">
      <div class="dialog__info">
        <span>{{ t('spreadDialogInfo', '将为 {n} 张卡片执行分摊复习压力操作').replace('{n}', String(collectedCount)) }}</span>
      </div>
      
      <!-- 基础参数 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('spreadBasicParams', '基础参数') }}</h4>

        <!-- 🆕 队列模式下隐藏"考虑未来复习"选项 -->
        <div v-if="!queueMode" class="form-field">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="config.considerFutureRepetitions"
            />
            <span>{{ t('spreadConsiderFuture', '考虑未来复习') }}</span>
          </label>
          <p class="field-hint">
            {{ config.considerFutureRepetitions
              ? t('spreadConsiderFutureHintYes', '包括未到期的卡片（用于假期前提前复习）')
              : t('spreadConsiderFutureHintNo', '仅包括已到期的卡片（用于减轻积压）')
            }}
          </p>
        </div>

        <!-- 🆕 队列模式下隐藏收集期 -->
        <div v-if="!queueMode" class="form-field collecting-period-field" :class="{ 'is-disabled': !isCollectingPeriodEnabled }">
          <label>{{ t('spreadCollectingPeriod', '收集期（天）') }}</label>
          <div class="input-with-buttons">
            <div class="quick-buttons">
              <button class="btn-quick" :class="{ 'btn-quick--active': config.collectingPeriod === 7 }" :disabled="!isCollectingPeriodEnabled" @click="config.collectingPeriod = 7">{{ t('days7', '7天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.collectingPeriod === 14 }" :disabled="!isCollectingPeriodEnabled" @click="config.collectingPeriod = 14">{{ t('days14', '14天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.collectingPeriod === 30 }" :disabled="!isCollectingPeriodEnabled" @click="config.collectingPeriod = 30">{{ t('days30', '30天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.collectingPeriod === 60 }" :disabled="!isCollectingPeriodEnabled" @click="config.collectingPeriod = 60">{{ t('days60', '60天') }}</button>
            </div>
            <input
              type="number"
              v-model.number="config.collectingPeriod"
              min="1"
              max="365"
              class="form-input"
              :placeholder="t('daysPlaceholder', '输入天数')"
              :disabled="!isCollectingPeriodEnabled"
            />
          </div>
          <p class="field-hint">
            {{
              isCollectingPeriodEnabled
                ? t('spreadCollectingPeriodHint', '收集从现在到未来 {n} 天内的卡片').replace('{n}', String(config.collectingPeriod))
                : t('spreadCollectingRangeDueOnly', '仅到期卡片（<=现在）')
            }}
          </p>
        </div>
        
        <!-- 🆕 队列模式下显示提示信息 -->
        <div v-if="queueMode" class="form-field">
          <div class="queue-mode-hint">
            <svg><use xlink:href="#iconInfo"></use></svg>
            <span>{{ t('spreadQueueModeHint', '队列模式：将分散当前队列中的所有卡片（{n} 张）').replace('{n}', String(collectedCount)) }}</span>
          </div>
        </div>
        
        <div class="form-field">
          <label>{{ t('spreadReschedulingPeriod', '重新调度期（天）') }}</label>
          <div class="input-with-buttons">
            <div class="quick-buttons">
              <button class="btn-quick" :class="{ 'btn-quick--active': config.reschedulingPeriod === 7 }" @click="config.reschedulingPeriod = 7">{{ t('days7', '7天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.reschedulingPeriod === 14 }" @click="config.reschedulingPeriod = 14">{{ t('days14', '14天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.reschedulingPeriod === 30 }" @click="config.reschedulingPeriod = 30">{{ t('days30', '30天') }}</button>
              <button class="btn-quick" :class="{ 'btn-quick--active': config.reschedulingPeriod === 60 }" @click="config.reschedulingPeriod = 60">{{ t('days60', '60天') }}</button>
            </div>
            <input 
              type="number" 
              v-model.number="config.reschedulingPeriod" 
              min="1" 
              max="365"
              class="form-input"
              :placeholder="t('daysPlaceholder', '输入天数')"
            />
          </div>
          <p class="field-hint">
            {{ t('spreadReschedulingPeriodHint', '将收集的卡片均匀分散到未来 {n} 天内').replace('{n}', String(config.reschedulingPeriod)) }}
          </p>
        </div>
      </div>
      
      <!-- 排序标准 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('spreadSortingCriterion', '排序标准') }}</h4>
        <p class="section-desc">{{ t('spreadSortingCriterionDesc', '决定卡片的重新调度顺序') }}</p>
        
        <div class="sorting-options">
          <label 
            v-for="option in sortingOptions" 
            :key="option.value"
            class="sorting-option"
            :class="{ 'sorting-option--active': config.sortingCriterion === option.value }"
          >
            <input 
              type="radio" 
              :value="option.value"
              v-model="config.sortingCriterion"
            />
            <div class="option-content">
              <span class="option-icon">{{ option.icon }}</span>
              <div class="option-text">
                <span class="option-label">{{ option.label }}</span>
                <span class="option-desc">{{ option.description }}</span>
              </div>
            </div>
          </label>
        </div>
      </div>
      
      <!-- 高级选项 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('spreadAdvancedOptions', '高级选项') }}</h4>
        
        <div class="form-field">
          <label>{{ t('spreadMaxCardsPerDay', '每日卡片数量限制（可选）') }}</label>
          <input 
            type="number" 
            v-model.number="config.maxCardsPerDay" 
            min="1" 
            max="1000"
            class="form-input"
            :placeholder="t('spreadMaxCardsPerDayPlaceholder', '留空表示不限制')"
          />
          <p class="field-hint">
            {{ t('spreadMaxCardsPerDayHint', '限制每天分配的最大卡片数量，超出部分将延后') }}
          </p>
        </div>
      </div>
      
      <!-- 预览效果 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('spreadPreview', '预览效果') }}</h4>
        <div class="preview-box">
          <div class="preview-item">
            <span class="preview-label">{{ t('spreadOperationType', '操作类型：') }}</span>
            <span class="preview-value">{{ operationType }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">{{ t('spreadCollectingRange', '收集范围：') }}</span>
            <span class="preview-value">{{ collectingRange }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">{{ t('spreadReschedulingRange', '分散范围：') }}</span>
            <span class="preview-value">{{ reschedulingRange }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">{{ t('spreadSortingMethod', '排序方式：') }}</span>
            <span class="preview-value">{{ sortingLabel }}</span>
          </div>
        </div>
      </div>
      
      <!-- 配置管理 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('spreadConfigManagement', '配置管理') }}</h4>
        
        <div class="config-actions">
          <div class="config-select">
            <select v-model="selectedConfigName" class="form-select">
              <option value="">{{ t('spreadSelectConfig', '选择预设配置...') }}</option>
              <option v-for="name in configNames" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <button 
              class="btn-action" 
              @click="loadSelectedConfig"
              :disabled="!selectedConfigName"
            >
              {{ t('spreadLoadConfig', '加载') }}
            </button>
          </div>
          
          <div class="config-save">
            <input 
              type="text" 
              v-model="newConfigName" 
              :placeholder="t('spreadConfigNamePlaceholder', '输入配置名称...')"
              class="form-input"
            />
            <button 
              class="btn-action" 
              @click="saveCurrentConfig"
              :disabled="!newConfigName.trim()"
            >
              {{ t('spreadSaveConfig', '保存') }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- 验证错误 -->
      <div v-if="validationError" class="validation-error">
        {{ validationError }}
      </div>
    </div>
    
    <div class="dialog__actions">
      <button class="b3-button b3-button--cancel" @click="handleCancel">{{ t('cancel', '取消') }}</button>
      <button 
        class="b3-button b3-button--text" 
        @click="handleConfirm" 
        :disabled="!isValid"
      >
        {{ t('spreadConfirmButton', '确认分散') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { SpreadConfig } from '@/types/reschedule';
import { SortingCriterion } from '@/types/reschedule';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { BrowserCard } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SpreadDialog');

const props = defineProps<{
  count: number;
  configManager: ConfigManager;
  allCards?: BrowserCard[];  // 🆕 直接接收已加载的卡片数据，避免触发缓存更新回调
  queueMode?: boolean;  // 🆕 是否为队列模式（提取练习/渐进学习）
  i18n?: Record<string, string>;  // 🆕 i18n 字典
}>();

const emit = defineEmits<{
  (e: 'confirm', config: SpreadConfig): void;
  (e: 'cancel'): void;
}>();

// 🆕 i18n 辅助函数
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const spreadDefaults = props.configManager.getDefaultSpreadConfig();

function normalizePeriodDays(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const parsed = Math.floor(value);
  if (parsed < 1 || parsed > 365) {
    return fallback;
  }

  return parsed;
}

function normalizeConfigForSubmit(config: SpreadConfig): SpreadConfig {
  return {
    ...config,
    collectingPeriod: normalizePeriodDays(config.collectingPeriod, spreadDefaults.collectingPeriod),
    reschedulingPeriod: normalizePeriodDays(config.reschedulingPeriod, spreadDefaults.reschedulingPeriod),
    maxCardsPerDay: normalizeMaxCardsPerDay(config.maxCardsPerDay),
  };
}

function normalizeSpreadConfig(config: Partial<SpreadConfig> | null | undefined): SpreadConfig {
  const input = config ?? {};

  return {
    ...spreadDefaults,
    ...input,
    collectingPeriod: normalizePeriodDays(input.collectingPeriod, spreadDefaults.collectingPeriod),
    reschedulingPeriod: normalizePeriodDays(input.reschedulingPeriod, spreadDefaults.reschedulingPeriod),
    collectAllCards: input.collectAllCards ?? false,
    considerFutureRepetitions: input.considerFutureRepetitions ?? spreadDefaults.considerFutureRepetitions,
    sortingCriterion: input.sortingCriterion ?? spreadDefaults.sortingCriterion,
    maxCardsPerDay: normalizeMaxCardsPerDay(input.maxCardsPerDay),
  };
}

function normalizeMaxCardsPerDay(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

// 配置状态
const config = ref<SpreadConfig>(normalizeSpreadConfig(undefined));
const selectedConfigName = ref('');
const newConfigName = ref('');
const configNames = ref<string[]>([]);

// 验证错误
const operationError = ref('');
const isCollectingPeriodEnabled = computed(() => !props.queueMode && config.value.considerFutureRepetitions);

const dueTimestamps = computed(() => {
  if (!props.allCards || props.allCards.length === 0) {
    return [];
  }

  return props.allCards.map((card) =>
    card.due instanceof Date ? card.due.getTime() : Number(card.due)
  );
});

// 🆕 计算收集的卡片数量（基于传入的 allCards，使用 computed 避免异步调用）
const collectedCount = computed(() => {
  if (!props.allCards || props.allCards.length === 0) {
    return props.count;
  }
  
  // 🆕 队列模式：直接返回所有队列卡片数量（不需要按 due 筛选）
  if (props.queueMode) {
    return props.allCards.length;
  }
  
  // 全部闪卡模式：根据配置筛选卡片
  const now = Date.now();
  const collectingPeriodMs = config.value.collectingPeriod * 24 * 60 * 60 * 1000;
  const maxDue = now + collectingPeriodMs;

  let total = 0;
  for (const dueTime of dueTimestamps.value) {
    if (!Number.isFinite(dueTime)) {
      continue;
    }

    if (config.value.considerFutureRepetitions ? dueTime <= maxDue : dueTime <= now) {
      total++;
    }
  }

  return total;
});

// 排序选项
const sortingOptions = computed(() => [
  {
    value: SortingCriterion.Random,
    label: t('spreadSortRandom', '随机'),
    icon: '🎲',
    description: t('spreadSortRandomDesc', '随机打乱顺序')
  },
  {
    value: SortingCriterion.ByPriority,
    label: t('spreadSortPriority', '按优先级'),
    icon: '⭐',
    description: t('spreadSortPriorityDesc', '高优先级优先')
  },
  {
    value: SortingCriterion.ByInterval,
    label: t('spreadSortInterval', '按间隔'),
    icon: '📅',
    description: t('spreadSortIntervalDesc', '短间隔优先')
  },
  {
    value: SortingCriterion.ByLateness,
    label: t('spreadSortLateness', '按延迟程度'),
    icon: '⏰',
    description: t('spreadSortLatenessDesc', '越晚的越优先')
  },
  {
    value: SortingCriterion.ByEasiness,
    label: t('spreadSortEasiness', '按难度'),
    icon: '📊',
    description: t('spreadSortEasinessDesc', '简单的优先')
  },
  {
    value: SortingCriterion.ByRecency,
    label: t('spreadSortRecency', '按添加时间'),
    icon: '🆕',
    description: t('spreadSortRecencyDesc', '新添加的优先')
  }
]);

// 操作类型
const operationType = computed(() => {
  if (props.queueMode) {
    return t('spreadOperationEven', '均匀分散');
  }

  if (!config.value.considerFutureRepetitions) {
    return t('spreadOperationEvenDueOnly', '均匀分散（仅到期）');
  }

  if (config.value.collectingPeriod > config.value.reschedulingPeriod) {
    return t('spreadOperationAdvance', '提前复习（考试前）');
  } else if (config.value.collectingPeriod < config.value.reschedulingPeriod) {
    return t('spreadOperationPostpone', '延后复习（减轻负担）');
  } else {
    return t('spreadOperationEven', '均匀分散');
  }
});

// 收集范围
const collectingRange = computed(() => {
  if (props.queueMode) {
    return t('spreadQueueModeHint', '队列模式：将分散当前队列中的所有卡片（{n} 张）')
      .replace('{n}', String(collectedCount.value));
  }

  if (!config.value.considerFutureRepetitions) {
    return t('spreadCollectingRangeDueOnly', '仅到期卡片（<=现在）');
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + config.value.collectingPeriod);
  return `${t('now', '现在')} ${t('to', '到')} ${formatDate(endDate)}`;
});

// 分散范围
const reschedulingRange = computed(() => {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + config.value.reschedulingPeriod);
  return `${t('now', '现在')} ${t('to', '到')} ${formatDate(endDate)}`;
});

// 排序标签
const sortingLabel = computed(() => {
  const option = sortingOptions.value.find(o => o.value === config.value.sortingCriterion);
  return option ? option.label : t('unknown', '未知');
});

function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', { 
    month: 'long', 
    day: 'numeric'
  });
}

// 验证配置
const formError = computed(() => {
  if (!props.queueMode && config.value.considerFutureRepetitions && (config.value.collectingPeriod < 1 || config.value.collectingPeriod > 365)) {
    return t('spreadValidationCollectingPeriod', '收集期必须在 1 到 365 天之间');
  }
  
  if (config.value.reschedulingPeriod < 1 || config.value.reschedulingPeriod > 365) {
    return t('spreadValidationReschedulingPeriod', '重新调度期必须在 1 到 365 天之间');
  }

  const rawMaxCardsPerDay = config.value.maxCardsPerDay;
  const maxCardsPerDay = normalizeMaxCardsPerDay(rawMaxCardsPerDay);
  const hasRawMaxCards =
    rawMaxCardsPerDay !== undefined
    && rawMaxCardsPerDay !== null
    && rawMaxCardsPerDay !== '';

  if (hasRawMaxCards && maxCardsPerDay === undefined) {
    return t('spreadValidationMaxCards', '每日卡片数量限制必须在 1 到 1000 之间');
  }

  if (maxCardsPerDay !== undefined && (maxCardsPerDay < 1 || maxCardsPerDay > 1000)) {
    return t('spreadValidationMaxCards', '每日卡片数量限制必须在 1 到 1000 之间');
  }

  return '';
});
const validationError = computed(() => operationError.value || formError.value);
const isValid = computed(() => formError.value.length === 0);

// 加载配置列表
onMounted(async () => {
  try {
    configNames.value = await props.configManager.listConfigNames('spread');
  } catch (error) {
    logger.error('Failed to load config names:', error);
  }
});

// 加载选中的配置
async function loadSelectedConfig() {
  if (!selectedConfigName.value) return;
  
  try {
    const loaded = await props.configManager.loadConfig(selectedConfigName.value, 'spread');
    if (loaded) {
      config.value = normalizeSpreadConfig(loaded as SpreadConfig);
      operationError.value = '';
    }
  } catch (error) {
    logger.error('Failed to load config:', error);
    operationError.value = t('spreadLoadConfigFailed', '加载配置失败');
  }
}

// 保存当前配置
async function saveCurrentConfig() {
  if (!newConfigName.value.trim()) return;
  
  try {
    const normalizedConfig = normalizeConfigForSubmit(config.value);

    await props.configManager.saveConfig(newConfigName.value.trim(), {
      ...normalizedConfig,
      collectAllCards: false,
    }, 'spread');
    configNames.value = Array.from(new Set([...configNames.value, newConfigName.value.trim()]));
    newConfigName.value = '';
    operationError.value = '';
  } catch (error) {
    logger.error('Failed to save config:', error);
    operationError.value = t('spreadSaveConfigFailed', '保存配置失败');
  }
}

function handleConfirm() {
  if (!isValid.value) return;
  emit('confirm', normalizeConfigForSubmit(config.value));
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.spread-dialog {
  padding: 18px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog__info {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: linear-gradient(135deg, var(--b3-theme-primary-lightest), color-mix(in srgb, var(--b3-theme-primary-lightest) 70%, var(--b3-theme-background)));
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
  border-radius: 10px;
  text-align: center;
  font-weight: 500;
}

.form-section {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--b3-theme-surface) 78%, transparent);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--b3-theme-on-background) 6%, transparent);
}

.form-section:last-of-type {
  margin-bottom: 12px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.section-desc {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}

.input-with-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.btn-quick {
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.btn-quick:hover {
  background: var(--b3-theme-primary-lightest);
  border-color: var(--b3-theme-primary);
}

.btn-quick--active {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-on-primary);
}

.btn-quick:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
}

.form-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.collecting-period-field.is-disabled {
  opacity: 0.75;
}

.collecting-period-field.is-disabled .btn-quick:hover {
  background: var(--b3-theme-surface);
  border-color: var(--b3-border-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.sorting-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.sorting-option {
  display: flex;
  padding: 12px;
  border: 2px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  cursor: pointer;
  transition: all 0.15s;
}

.sorting-option:hover {
  background: var(--b3-list-hover);
}

.sorting-option--active {
  background: var(--b3-theme-primary-lightest);
  border-color: var(--b3-theme-primary);
}

.sorting-option input[type="radio"] {
  margin-right: 8px;
  cursor: pointer;
}

.option-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.option-icon {
  font-size: 24px;
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.option-desc {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
}

.preview-box {
  padding: 16px;
  background: linear-gradient(135deg, var(--b3-theme-primary-lightest), color-mix(in srgb, var(--b3-theme-primary-lightest) 68%, var(--b3-theme-background)));
  border-radius: 8px;
  border: 1px solid var(--b3-theme-primary-lighter);
}

.preview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--b3-theme-primary-lighter);
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-label {
  font-size: 13px;
  color: var(--b3-theme-on-surface);
  font-weight: 500;
}

.preview-value {
  font-size: 13px;
  color: var(--b3-theme-primary);
  font-weight: 600;
}

.config-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-select,
.config-save {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-action {
  padding: 8px 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-primary);
  color: white;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.btn-action:hover:not(:disabled) {
  background: var(--b3-theme-primary-light);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.validation-error {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--b3-card-error-background);
  color: var(--b3-card-error-color);
  border-radius: 6px;
  font-size: 13px;
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--b3-border-color);
  position: sticky;
  bottom: -18px;
  background: color-mix(in srgb, var(--b3-theme-background) 90%, transparent);
  backdrop-filter: blur(2px);
}

/* 🆕 队列模式提示样式 */
.queue-mode-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, var(--b3-theme-primary-lightest), color-mix(in srgb, var(--b3-theme-primary-lightest) 70%, var(--b3-theme-surface)));
  border: 1px solid var(--b3-theme-primary-lighter);
  border-radius: 6px;
  color: var(--b3-theme-on-surface);
  font-size: 13px;
}

.queue-mode-hint svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  fill: var(--b3-theme-primary);
}

@media (max-width: 900px) {
  .sorting-options {
    grid-template-columns: 1fr;
  }

  .quick-buttons {
    grid-template-columns: repeat(2, 1fr);
  }

  .config-select,
  .config-save {
    flex-direction: column;
    align-items: stretch;
  }

  .dialog__actions {
    flex-direction: column-reverse;
  }
}
</style>
