<template>
  <div class="filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title">
    <div class="dialog__header">
      <h3 id="filter-dialog-title" class="dialog__title">{{ t('filterDialogTitle', '卡片筛选') }}</h3>
    </div>

    <div class="dialog__content">
      <!-- 🆕 关键词搜索区（独立区域） -->
      <div class="filter-section keyword-section">
        <h4 class="section-title">
          <svg class="section-icon"><use xlink:href="#iconSearch"></use></svg>
          {{ t('keywordSearch', '关键词搜索') }}
        </h4>
        <input
          type="text"
          class="b3-text-field keyword-input-large"
          v-model="filterState.values.keyword"
          :placeholder="t('keywordSearchPlaceholder', '输入关键词筛选卡片内容...')"
        />
      </div>

      <!-- 主过滤区域：表格布局 -->
      <div class="filter-main">
        <table class="filter-table">
          <thead>
            <tr>
              <th class="field-column"></th>
              <th class="input-column">{{ t('filterMinimum', 'Minimum') }}</th>
              <th class="input-column">{{ t('filterMaximum', 'Maximum') }}</th>
            </tr>
          </thead>
          <tbody>
            <!-- 数值范围字段 -->
            <tr
              v-for="field in numericFields"
              :key="field.key"
              :class="{ 'row-enabled': filterState.enabled[field.key] }"
            >
              <td class="field-cell">
                <label class="field-label">
                  <input
                    type="checkbox"
                    :checked="filterState.enabled[field.key]"
                    @change="updateEnabled(field.key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ t(field.labelKey, field.labelKey) }}</span>
                </label>
              </td>
              <td class="input-cell">
                <input
                  type="number"
                  class="b3-text-field input-field"
                  :value="filterState.values[field.key]?.min ?? 0"
                  :disabled="!filterState.enabled[field.key]"
                  :min="field.range?.min ?? 0"
                  :max="field.range?.max ?? 9999"
                  :step="field.allowDecimal ? '0.1' : '1'"
                  @input="updateNumericMin(field.key, parseFloat(($event.target as HTMLInputElement).value))"
                />
              </td>
              <td class="input-cell">
                <input
                  type="number"
                  class="b3-text-field input-field"
                  :value="filterState.values[field.key]?.max ?? 0"
                  :disabled="!filterState.enabled[field.key]"
                  :min="field.range?.min ?? 0"
                  :max="field.range?.max ?? 9999"
                  :step="field.allowDecimal ? '0.1' : '1'"
                  @input="updateNumericMax(field.key, parseFloat(($event.target as HTMLInputElement).value))"
                />
              </td>
            </tr>

            <!-- 日期范围字段 -->
            <tr
              v-for="field in dateFields"
              :key="field.key"
              :class="{ 'row-enabled': filterState.enabled[field.key] }"
            >
              <td class="field-cell">
                <label class="field-label">
                  <input
                    type="checkbox"
                    :checked="filterState.enabled[field.key]"
                    @change="updateEnabled(field.key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ t(field.labelKey, field.labelKey) }}</span>
                </label>
              </td>
              <td class="input-cell">
                <input
                  type="date"
                  class="b3-text-field input-field"
                  :value="formatDateForInput(filterState.values[field.key].min)"
                  :disabled="!filterState.enabled[field.key]"
                  @input="updateDateMin(field.key, new Date(($event.target as HTMLInputElement).value))"
                />
              </td>
              <td class="input-cell">
                <input
                  type="date"
                  class="b3-text-field input-field"
                  :value="formatDateForInput(filterState.values[field.key].max)"
                  :disabled="!filterState.enabled[field.key]"
                  @input="updateDateMax(field.key, new Date(($event.target as HTMLInputElement).value))"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部：Type 和 Status -->
      <div class="filter-bottom">
        <div class="filter-bottom-section">
          <h4 class="section-title">{{ t('filterType', 'Type') }}</h4>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('item')"
                @change="toggleCardType('item')"
              />
              <span>{{ t('cardTypeItem', 'Item') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('topic')"
                @change="toggleCardType('topic')"
              />
              <span>{{ t('cardTypeTopic', 'Topic') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('concept')"
                @change="toggleCardType('concept')"
              />
              <span>{{ t('cardTypeConcept', 'Concept') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('descriptor')"
                @change="toggleCardType('descriptor')"
              />
              <span>{{ t('cardTypeDescriptor', 'Descriptor') }}</span>
            </label>
          </div>
        </div>

        <div class="filter-bottom-section">
          <h4 class="section-title">{{ t('filterStatus', 'Status') }}</h4>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('new')"
                @change="toggleCardStatus('new')"
              />
              <span>{{ t('stateNew', 'New') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('learning')"
                @change="toggleCardStatus('learning')"
              />
              <span>{{ t('stateLearning', 'Learning') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('review')"
                @change="toggleCardStatus('review')"
              />
              <span>{{ t('stateReview', 'Review') }}</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('relearning')"
                @change="toggleCardStatus('relearning')"
              />
              <span>{{ t('stateRelearning', 'Relearning') }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 配置管理区域 -->
      <div class="filter-presets">
        <select
          v-model="selectedPreset"
          class="b3-select preset-select"
          @change="loadPreset"
        >
          <option value="">Last used</option>
          <option
            v-for="preset in savedPresets"
            :key="preset.name"
            :value="preset.name"
          >
            {{ preset.name }}
          </option>
        </select>
        <button
          class="b3-button b3-button--outline preset-button"
          @click="showSavePresetDialog"
          title="Save current filter as preset"
        >
          <svg><use xlink:href="#iconSave"></use></svg>
        </button>
        <button
          class="b3-button b3-button--outline preset-button"
          :disabled="!selectedPreset"
          @click="deletePreset"
          title="Delete selected preset"
        >
          <svg><use xlink:href="#iconTrashcan"></use></svg>
        </button>
      </div>
    </div>

    <div class="dialog__footer">
      <div class="footer__left">
        <!-- Rebuild 按钮（类似 Anki 的设计） -->
        <button
          class="b3-button b3-button--outline"
          @click="handleRebuild"
          :title="t('filterRebuildTitle', 'Clear temporarily hidden cards and reload with current filter conditions')"
        >
          <svg><use xlink:href="#iconRefresh"></use></svg>
          Rebuild
        </button>
      </div>
      <div class="footer__right">
        <button class="b3-button b3-button--cancel" @click="handleCancel">
          Cancel
        </button>
        <button
          class="b3-button b3-button--text"
          :disabled="!hasAnyFilter"
          @click="handleClear"
        >
          Clear
        </button>
        <button
          class="b3-button b3-button--text"
          :disabled="!isValid"
          @click="handleApply"
        >
          OK
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { CardFilter } from '@/types/unified-data-source';
import { filterService } from '../services/FilterService';
import { createLogger } from '@/utils/logger';
import { inputDialog } from '@/utils/dialog';

const logger = createLogger('FilterDialog');

const props = defineProps<{
  isOpen: boolean;
  initialFilter?: CardFilter | null;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'apply', filter: CardFilter): void;
  (e: 'cancel'): void;
  (e: 'clear'): void;
  (e: 'rebuild'): void;
}>();

// 国际化函数
const t = (key: string, fallback: string): string => {
  return props.i18n?.[key] || fallback;
};

interface NumericFieldConfig {
  key: NumericFieldKey;
  labelKey: string;
  range: { min: number; max: number };
  allowDecimal?: boolean;
}

interface DateFieldConfig {
  key: DateFieldKey;
  labelKey: string;
}

type NumericFieldKey =
  | 'priority'
  | 'repetitions'
  | 'lapses'
  | 'interval'
  | 'difficulty'
  | 'stability'
  | 'retrievability'
  | 'postpones';
type DateFieldKey = 'lastReview' | 'nextReview';
type FilterStateKey = NumericFieldKey | DateFieldKey | 'cardType' | 'cardStatus' | 'keyword';

type NumericRangeValue = { min: number; max: number };
type DateRangeValue = { min: Date; max: Date };

interface FilterStateValues {
  priority: NumericRangeValue;
  repetitions: NumericRangeValue;
  lapses: NumericRangeValue;
  interval: NumericRangeValue;
  lastReview: DateRangeValue;
  nextReview: DateRangeValue;
  difficulty: NumericRangeValue;
  stability: NumericRangeValue;
  retrievability: NumericRangeValue;
  postpones: NumericRangeValue;
  cardType: Set<string>;
  cardStatus: Set<string>;
  keyword: string;
}

const numericFields: NumericFieldConfig[] = [
  { key: 'priority', labelKey: 'filterPriority', range: { min: 0, max: 100 } },
  { key: 'repetitions', labelKey: 'filterRepetitions', range: { min: 0, max: 999 } },
  { key: 'lapses', labelKey: 'filterLapses', range: { min: 0, max: 999 } },
  { key: 'interval', labelKey: 'filterInterval', range: { min: 0, max: 9999 } },
  { key: 'difficulty', labelKey: 'filterDifficulty', range: { min: 0, max: 10 }, allowDecimal: true },
  { key: 'stability', labelKey: 'filterStability', range: { min: 0, max: 9999 }, allowDecimal: true },
  { key: 'retrievability', labelKey: 'filterRetrievability', range: { min: 0, max: 1 }, allowDecimal: true },
  { key: 'postpones', labelKey: 'filterPostpones', range: { min: 0, max: 100 }, allowDecimal: true },
];

const dateFields: DateFieldConfig[] = [
  { key: 'lastReview', labelKey: 'filterLastReview' },
  { key: 'nextReview', labelKey: 'filterNextReview' },
];

interface FilterState {
  enabled: Record<FilterStateKey, boolean>;
  values: FilterStateValues;
}

const filterState = ref<FilterState>({
  enabled: {
    priority: false,
    repetitions: false,
    lapses: false,
    interval: false,
    lastReview: false,
    nextReview: false,
    difficulty: false,
    stability: false,
    retrievability: false,
    postpones: false,
    cardType: true,
    cardStatus: true,
    keyword: false,
  },
  values: {
    priority: { min: 0, max: 100 },
    repetitions: { min: 0, max: 999 },
    lapses: { min: 0, max: 999 },
    interval: { min: 0, max: 9999 },
    lastReview: { min: new Date(), max: new Date() },
    nextReview: { min: new Date(), max: new Date() },
    difficulty: { min: 0, max: 10 },
    stability: { min: 0, max: 100 },
    retrievability: { min: 0, max: 1 },
    postpones: { min: 0, max: 100 },
    cardType: new Set<string>(['item']),
    cardStatus: new Set<string>(['new', 'learning', 'review', 'relearning']),
    keyword: '',
  },
});

const validationErrors = ref<Map<string, string>>(new Map());
const selectedPreset = ref<string>('');
const savedPresets = ref<Array<{ name: string; filter: CardFilter }>>([]);

const isValid = computed(() => validationErrors.value.size === 0);
const hasAnyFilter = computed(() => Object.values(filterState.value.enabled).some(v => v));

function updateEnabled(key: FilterStateKey, enabled: boolean) {
  filterState.value.enabled[key] = enabled;
  validate();
}

function updateNumericMin(key: NumericFieldKey, value: number) {
  if (isNaN(value)) return;
  filterState.value.values[key].min = value;
  validate();
}

function updateNumericMax(key: NumericFieldKey, value: number) {
  if (isNaN(value)) return;
  filterState.value.values[key].max = value;
  validate();
}

function updateDateMin(key: DateFieldKey, value: Date) {
  filterState.value.values[key].min = value;
  validate();
}

function updateDateMax(key: DateFieldKey, value: Date) {
  filterState.value.values[key].max = value;
  validate();
}

function toggleCardType(type: string) {
  logger.info('[FilterDialog] toggleCardType called with:', type);
  logger.info('[FilterDialog] Current cardType set:', filterState.value.values.cardType);
  
  const set = filterState.value.values.cardType;
  if (set.has(type)) {
    set.delete(type);
    logger.info('[FilterDialog] Removed', type, 'from cardType');
  } else {
    set.add(type);
    logger.info('[FilterDialog] Added', type, 'to cardType');
  }
  
  logger.info('[FilterDialog] Updated cardType set:', filterState.value.values.cardType);
}

function toggleCardStatus(status: string) {
  logger.info('[FilterDialog] toggleCardStatus called with:', status);
  logger.info('[FilterDialog] Current cardStatus set:', filterState.value.values.cardStatus);
  
  const set = filterState.value.values.cardStatus;
  if (set.has(status)) {
    set.delete(status);
    logger.info('[FilterDialog] Removed', status, 'from cardStatus');
  } else {
    set.add(status);
    logger.info('[FilterDialog] Added', status, 'to cardStatus');
  }
  
  logger.info('[FilterDialog] Updated cardStatus set:', filterState.value.values.cardStatus);
}

function validate() {
  validationErrors.value.clear();
  
  for (const field of numericFields) {
    if (!filterState.value.enabled[field.key]) continue;
    
    const min = filterState.value.values[field.key].min;
    const max = filterState.value.values[field.key].max;
    
    if (min > max) {
      validationErrors.value.set(field.key, 'Minimum cannot be greater than maximum');
    }
    if (min < field.range.min || max > field.range.max) {
      validationErrors.value.set(field.key, 'Value out of range');
    }
  }
  
  for (const field of dateFields) {
    if (!filterState.value.enabled[field.key]) continue;
    
    const min = filterState.value.values[field.key].min;
    const max = filterState.value.values[field.key].max;
    
    if (min > max) {
      validationErrors.value.set(field.key, 'Minimum date cannot be later than maximum date');
    }
  }
}

function formatDateForInput(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().split('T')[0];
}

function handleApply() {
  if (!isValid.value) return;
  
  const filter = filterService.toCardFilter(filterState.value as unknown as Parameters<typeof filterService.toCardFilter>[0]);
  filterService.saveFilter(filter);
  emit('apply', filter);
}

function handleCancel() {
  emit('cancel');
}

function handleClear() {
  for (const key of Object.keys(filterState.value.enabled) as FilterStateKey[]) {
    filterState.value.enabled[key] = false;
  }
  
  filterState.value.values.cardType.clear();
  filterState.value.values.cardStatus.clear();
  filterState.value.values.keyword = '';
  
  emit('clear');
}

function loadPreset() {
  if (!selectedPreset.value) {
    const lastUsed = filterService.loadFilter();
    if (lastUsed) {
      filterState.value = filterService.fromCardFilter(lastUsed) as unknown as FilterState;
    }
    return;
  }
  
  const preset = savedPresets.value.find(p => p.name === selectedPreset.value);
  if (preset) {
    filterState.value = filterService.fromCardFilter(preset.filter) as unknown as FilterState;
  }
}

async function showSavePresetDialog() {
  logger.info('[FilterDialog] showSavePresetDialog called');
  
  try {
    // 使用自定义对话框替代 prompt()
    const name = await showInputDialog('Enter preset name:');
    logger.info('[FilterDialog] Preset name entered:', name);
    
    if (!name) {
      logger.info('[FilterDialog] No name entered, aborting');
      return;
    }
    
    const filter = filterService.toCardFilter(filterState.value as unknown as Parameters<typeof filterService.toCardFilter>[0]);
    logger.info('[FilterDialog] Filter to save:', filter);
    
    savedPresets.value.push({ name, filter });
    logger.info('[FilterDialog] Presets after push:', savedPresets.value);
    
    filterService.savePresets(savedPresets.value);
    logger.info('[FilterDialog] Presets saved to localStorage');
    
    selectedPreset.value = name;
    logger.info('[FilterDialog] Selected preset set to:', name);
  } catch (error) {
    logger.error('[FilterDialog] Error in showSavePresetDialog:', error);
  }
}

// 简单的输入对话框实现
function showInputDialog(message: string): Promise<string | null> {
  logger.info('[FilterDialog] showInputDialog called with message:', message);
  return inputDialog({
    title: message,
    confirmText: 'OK',
    cancelText: 'Cancel',
    visualVariant: 'form',
  });
}

function deletePreset() {
  if (!selectedPreset.value) return;
  
  savedPresets.value = savedPresets.value.filter(p => p.name !== selectedPreset.value);
  filterService.savePresets(savedPresets.value);
  selectedPreset.value = '';
}

function handleRebuild() {
  // 先应用当前过滤条件
  if (isValid.value) {
    const filter = filterService.toCardFilter(filterState.value as unknown as Parameters<typeof filterService.toCardFilter>[0]);
    filterService.saveFilter(filter);
  }
  
  // 触发 rebuild 事件
  emit('rebuild');
  
  // 关闭对话框
  emit('cancel');
}



onMounted(() => {
  savedPresets.value = filterService.loadPresets();
  
  if (props.initialFilter) {
    filterState.value = filterService.fromCardFilter(props.initialFilter) as unknown as FilterState;
  } else {
    const lastUsed = filterService.loadFilter();
    if (lastUsed) {
      filterState.value = filterService.fromCardFilter(lastUsed) as unknown as FilterState;
    }
  }
  
  validate();
});

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    validate();
  }
});
</script>

<style scoped lang="scss">
.filter-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 900px;
  max-height: 80vh;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  box-shadow: var(--b3-dialog-shadow);
}

.dialog__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--b3-border-color);
  
  .dialog__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.dialog__content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.filter-section {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
}

.keyword-section {
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    
    .section-icon {
      width: 16px;
      height: 16px;
      opacity: 0.7;
    }
  }
  
  .keyword-input-large {
    width: 100%;
    height: 36px;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--b3-border-color);
    border-radius: 3px;
    transition: border-color 0.15s;
    
    &:focus {
      outline: none;
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
    }
    
    &::placeholder {
      color: var(--b3-theme-on-surface-light);
      opacity: 0.6;
    }
  }
}

.filter-main {
  margin-bottom: 24px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
}

.filter-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  
  th {
    padding: 8px;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    border-bottom: 1px solid var(--b3-border-color);
  }
  
  .field-column {
    width: 200px;
  }
  
  .input-column {
    width: calc((100% - 200px) / 2);
    text-align: center;
  }
  
  tr {
    transition: background 0.15s;
    
    &.row-enabled {
      background: var(--b3-theme-primary-lightest);
    }
  }
  
  td {
    padding: 4px 8px;
    vertical-align: middle;
  }
  
  .field-cell {
    width: 200px;
  }
  
  .input-cell {
    width: calc((100% - 200px) / 2);
  }
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  
  input[type="checkbox"] {
    margin: 0;
  }
  
  span {
    font-size: 13px;
  }
}

.input-field {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  font-size: 13px;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.filter-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
}

.filter-bottom-section {
  .section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
  }
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  
  input[type="checkbox"] {
    margin: 0;
  }
  
  span {
    font-size: 13px;
  }
}

.filter-presets {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
}

.preset-select {
  flex: 1;
  height: 32px;
}

.preset-button {
  height: 32px;
  width: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  
  svg {
    width: 14px;
    height: 14px;
  }
}

.dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--b3-border-color);
  
  .footer__left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .footer__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
