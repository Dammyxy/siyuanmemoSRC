<template>
  <div class="filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title">
    <div class="dialog__header">
      <h3 id="filter-dialog-title" class="dialog__title">卡片筛选</h3>
    </div>

    <div class="dialog__content">
      <!-- 🆕 关键词搜索区（独立区域） -->
      <div class="filter-section keyword-section">
        <h4 class="section-title">
          <svg class="section-icon"><use xlink:href="#iconSearch"></use></svg>
          关键词搜索
        </h4>
        <input
          type="text"
          class="b3-text-field keyword-input-large"
          v-model="filterState.values.keyword"
          placeholder="输入关键词筛选卡片内容..."
        />
      </div>

      <!-- 主过滤区域：表格布局 -->
      <div class="filter-main">
        <table class="filter-table">
          <thead>
            <tr>
              <th class="field-column"></th>
              <th class="input-column">Minimum</th>
              <th class="input-column">Maximum</th>
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
                  <span>{{ field.label }}</span>
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
                  <span>{{ field.label }}</span>
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
          <h4 class="section-title">Type</h4>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('item')"
                @change="toggleCardType('item')"
              />
              <span>Item</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardType.has('topic')"
                @change="toggleCardType('topic')"
              />
              <span>Topic</span>
            </label>
          </div>
        </div>

        <div class="filter-bottom-section">
          <h4 class="section-title">Status</h4>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('new')"
                @change="toggleCardStatus('new')"
              />
              <span>新卡</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('learning')"
                @change="toggleCardStatus('learning')"
              />
              <span>学习中</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('review')"
                @change="toggleCardStatus('review')"
              />
              <span>复习</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="filterState.values.cardStatus.has('relearning')"
                @change="toggleCardStatus('relearning')"
              />
              <span>重学</span>
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { CardFilter } from '@/types/unified-data-source';
import { filterService } from '../services/FilterService';

const props = defineProps<{
  isOpen: boolean;
  initialFilter?: CardFilter | null;
}>();

const emit = defineEmits<{
  (e: 'apply', filter: CardFilter): void;
  (e: 'cancel'): void;
  (e: 'clear'): void;
}>();

interface NumericFieldConfig {
  key: string;
  label: string;
  range: { min: number; max: number };
  allowDecimal?: boolean;
}

interface DateFieldConfig {
  key: string;
  label: string;
}

const numericFields: NumericFieldConfig[] = [
  { key: 'priority', label: 'Priority', range: { min: 0, max: 100 } },
  { key: 'repetitions', label: 'Repetitions', range: { min: 0, max: 999 } },
  { key: 'lapses', label: 'Lapses', range: { min: 0, max: 999 } },
  { key: 'interval', label: 'Interval', range: { min: 0, max: 9999 } },
  { key: 'difficulty', label: 'A-Factor', range: { min: 0, max: 10 }, allowDecimal: true },
  { key: 'stability', label: 'Forgetting Index', range: { min: 0, max: 100 }, allowDecimal: true },
  { key: 'retrievability', label: 'Ordinal number', range: { min: 0, max: 9999 } },
  { key: 'postpones', label: 'U-Factor', range: { min: 0, max: 100 }, allowDecimal: true },
];

const dateFields: DateFieldConfig[] = [
  { key: 'lastReview', label: 'Last repetition' },
  { key: 'nextReview', label: 'Next repetition' },
];

interface FilterState {
  enabled: Record<string, boolean>;
  values: Record<string, any>;
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
    retrievability: { min: 0, max: 9999 },
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

function updateEnabled(key: string, enabled: boolean) {
  filterState.value.enabled[key] = enabled;
  validate();
}

function updateNumericMin(key: string, value: number) {
  if (isNaN(value)) return;
  filterState.value.values[key].min = value;
  validate();
}

function updateNumericMax(key: string, value: number) {
  if (isNaN(value)) return;
  filterState.value.values[key].max = value;
  validate();
}

function updateDateMin(key: string, value: Date) {
  filterState.value.values[key].min = value;
  validate();
}

function updateDateMax(key: string, value: Date) {
  filterState.value.values[key].max = value;
  validate();
}

function toggleCardType(type: string) {
  console.log('[FilterDialog] toggleCardType called with:', type);
  console.log('[FilterDialog] Current cardType set:', filterState.value.values.cardType);
  
  const set = filterState.value.values.cardType;
  if (set.has(type)) {
    set.delete(type);
    console.log('[FilterDialog] Removed', type, 'from cardType');
  } else {
    set.add(type);
    console.log('[FilterDialog] Added', type, 'to cardType');
  }
  
  console.log('[FilterDialog] Updated cardType set:', filterState.value.values.cardType);
}

function toggleCardStatus(status: string) {
  console.log('[FilterDialog] toggleCardStatus called with:', status);
  console.log('[FilterDialog] Current cardStatus set:', filterState.value.values.cardStatus);
  
  const set = filterState.value.values.cardStatus;
  if (set.has(status)) {
    set.delete(status);
    console.log('[FilterDialog] Removed', status, 'from cardStatus');
  } else {
    set.add(status);
    console.log('[FilterDialog] Added', status, 'to cardStatus');
  }
  
  console.log('[FilterDialog] Updated cardStatus set:', filterState.value.values.cardStatus);
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
  
  const filter = filterService.toCardFilter(filterState.value);
  filterService.saveFilter(filter);
  emit('apply', filter);
}

function handleCancel() {
  emit('cancel');
}

function handleClear() {
  for (const key in filterState.value.enabled) {
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
      filterState.value = filterService.fromCardFilter(lastUsed);
    }
    return;
  }
  
  const preset = savedPresets.value.find(p => p.name === selectedPreset.value);
  if (preset) {
    filterState.value = filterService.fromCardFilter(preset.filter);
  }
}

async function showSavePresetDialog() {
  console.log('[FilterDialog] showSavePresetDialog called');
  
  try {
    // 使用自定义对话框替代 prompt()
    const name = await showInputDialog('Enter preset name:');
    console.log('[FilterDialog] Preset name entered:', name);
    
    if (!name) {
      console.log('[FilterDialog] No name entered, aborting');
      return;
    }
    
    const filter = filterService.toCardFilter(filterState.value);
    console.log('[FilterDialog] Filter to save:', filter);
    
    savedPresets.value.push({ name, filter });
    console.log('[FilterDialog] Presets after push:', savedPresets.value);
    
    filterService.savePresets(savedPresets.value);
    console.log('[FilterDialog] Presets saved to localStorage');
    
    selectedPreset.value = name;
    console.log('[FilterDialog] Selected preset set to:', name);
  } catch (error) {
    console.error('[FilterDialog] Error in showSavePresetDialog:', error);
  }
}

// 简单的输入对话框实现
function showInputDialog(message: string): Promise<string | null> {
  console.log('[FilterDialog] showInputDialog called with message:', message);
  
  return new Promise((resolve) => {
    try {
      const dialog = document.createElement('div');
      dialog.className = 'b3-dialog b3-dialog--open';
      dialog.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000;';
      
      dialog.innerHTML = `
        <div class="b3-dialog__scrim" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5);"></div>
        <div class="b3-dialog__container" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--b3-theme-background); border-radius: 4px; padding: 20px; min-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          <div class="b3-dialog__header" style="margin-bottom: 16px;">
            <div class="b3-dialog__title" style="font-size: 16px; font-weight: 600;">${message}</div>
          </div>
          <div class="b3-dialog__body" style="margin-bottom: 16px;">
            <input type="text" class="b3-text-field fn__block" id="preset-name-input" style="width: 100%; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 3px;" />
          </div>
          <div class="b3-dialog__action" style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="b3-button b3-button--cancel" style="padding: 6px 16px;">Cancel</button>
            <button class="b3-button b3-button--text" style="padding: 6px 16px;">OK</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(dialog);
      console.log('[FilterDialog] Dialog appended to body');
      
      const input = dialog.querySelector('#preset-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        console.log('[FilterDialog] Input focused');
      } else {
        console.error('[FilterDialog] Input element not found');
      }
      
      const cleanup = () => {
        console.log('[FilterDialog] Cleaning up dialog');
        if (dialog.parentNode) {
          document.body.removeChild(dialog);
        }
      };
      
      const cancelBtn = dialog.querySelector('.b3-button--cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          console.log('[FilterDialog] Cancel clicked');
          cleanup();
          resolve(null);
        });
      }
      
      const okBtn = dialog.querySelector('.b3-button--text');
      if (okBtn) {
        okBtn.addEventListener('click', () => {
          const value = input.value.trim();
          console.log('[FilterDialog] OK clicked, value:', value);
          cleanup();
          resolve(value || null);
        });
      }
      
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const value = input.value.trim();
            console.log('[FilterDialog] Enter pressed, value:', value);
            cleanup();
            resolve(value || null);
          } else if (e.key === 'Escape') {
            console.log('[FilterDialog] Escape pressed');
            cleanup();
            resolve(null);
          }
        });
      }
    } catch (error) {
      console.error('[FilterDialog] Error creating dialog:', error);
      resolve(null);
    }
  });
}

function deletePreset() {
  if (!selectedPreset.value) return;
  
  savedPresets.value = savedPresets.value.filter(p => p.name !== selectedPreset.value);
  filterService.savePresets(savedPresets.value);
  selectedPreset.value = '';
}



onMounted(() => {
  savedPresets.value = filterService.loadPresets();
  
  if (props.initialFilter) {
    filterState.value = filterService.fromCardFilter(props.initialFilter);
  } else {
    const lastUsed = filterService.loadFilter();
    if (lastUsed) {
      filterState.value = filterService.fromCardFilter(lastUsed);
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
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--b3-border-color);
}
</style>
