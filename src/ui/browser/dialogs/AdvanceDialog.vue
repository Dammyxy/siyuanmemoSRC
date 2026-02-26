<template>
  <div class="advance-dialog">
    <div class="dialog__content">
      <div class="dialog__info">
        <span>{{ t('advanceDialogInfo', '将为 {n} 张卡片执行提前操作').replace('{n}', String(count)) }}</span>
      </div>
      
      <!-- 基础参数 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('advanceBasicParams', '基础参数') }}</h4>
        
        <div class="form-field">
          <label>{{ t('advanceMaxDays', '最大提前天数') }}</label>
          <div class="input-with-buttons">
            <div class="quick-buttons">
              <button class="btn-quick" @click="config.maxDays = 7">{{ t('days7', '7天') }}</button>
              <button class="btn-quick" @click="config.maxDays = 14">{{ t('days14', '14天') }}</button>
              <button class="btn-quick" @click="config.maxDays = 30">{{ t('days30', '30天') }}</button>
              <button class="btn-quick" @click="config.maxDays = 60">{{ t('days60', '60天') }}</button>
            </div>
            <input 
              type="number" 
              v-model.number="config.maxDays" 
              min="1" 
              max="365"
              class="form-input"
              :placeholder="t('advanceDaysPlaceholder', '输入天数')"
            />
          </div>
          <p class="field-hint">
            {{ t('advanceMaxDaysHint', '卡片将被随机分散到今天后的 1 到 {n} 天内').replace('{n}', String(config.maxDays)) }}
          </p>
        </div>
        
        <div class="form-field">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.randomize"
            />
            <span>{{ t('advanceRandomize', '随机分散到期时间') }}</span>
          </label>
          <p class="field-hint">
            {{ config.randomize 
              ? t('advanceRandomizeHintYes', '每张卡片将获得随机的到期时间，避免集中在同一天') 
              : t('advanceRandomizeHintNo', '所有卡片将使用相同的到期时间') 
            }}
          </p>
        </div>
        
        <div class="form-field">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.handleOverdueCards"
            />
            <span>{{ t('advanceHandleOverdue', '特殊处理极度过期的卡片') }}</span>
          </label>
          <p class="field-hint">
            {{ config.handleOverdueCards 
              ? t('advanceHandleOverdueHintYes', '上次复习距今超过最大提前天数的卡片将被安排到今天') 
              : t('advanceHandleOverdueHintNo', '所有卡片使用相同的提前逻辑') 
            }}
          </p>
        </div>
      </div>
      
      <!-- 预览效果 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('advancePreview', '预览效果') }}</h4>
        <div class="preview-box">
          <div class="preview-item">
            <span class="preview-label">{{ t('advancePreviewRange', '提前范围：') }}</span>
            <span class="preview-value">{{ previewDateRange }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">{{ t('advancePreviewMethod', '分散方式：') }}</span>
            <span class="preview-value">{{ config.randomize ? t('advanceRandomSpread', '随机分散') : t('advanceUniformTime', '统一时间') }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">{{ t('advancePreviewOverdue', '过期卡片：') }}</span>
            <span class="preview-value">{{ config.handleOverdueCards ? t('advanceScheduleToday', '安排到今天') : t('advanceNormalAdvance', '正常提前') }}</span>
          </div>
        </div>
      </div>
      
      <!-- 配置管理 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('advanceConfigManagement', '配置管理') }}</h4>
        
        <div class="config-actions">
          <div class="config-select">
            <select v-model="selectedConfigName" class="form-select">
              <option value="">{{ t('advanceSelectConfig', '选择预设配置...') }}</option>
              <option v-for="name in configNames" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <button 
              class="btn-action" 
              @click="loadSelectedConfig"
              :disabled="!selectedConfigName"
            >
              {{ t('advanceLoadConfig', '加载') }}
            </button>
          </div>
          
          <div class="config-save">
            <input 
              type="text" 
              v-model="newConfigName" 
              :placeholder="t('advanceConfigNamePlaceholder', '输入配置名称...')"
              class="form-input"
            />
            <button 
              class="btn-action" 
              @click="saveCurrentConfig"
              :disabled="!newConfigName.trim()"
            >
              {{ t('advanceSaveConfig', '保存') }}
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
        {{ t('advanceConfirmButton', '确认提前') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { AdvanceConfig } from '@/types/reschedule';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdvanceDialog');

const props = defineProps<{
  count: number;
  configManager: ConfigManager;
  i18n?: Record<string, string>;
}>();

// i18n helper
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const emit = defineEmits<{
  (e: 'confirm', config: AdvanceConfig): void;
  (e: 'cancel'): void;
}>();

// 配置状态
const config = ref<AdvanceConfig>(props.configManager.getDefaultAdvanceConfig());
const selectedConfigName = ref('');
const newConfigName = ref('');
const configNames = ref<string[]>([]);

// 验证错误
const validationError = ref('');

// 预览日期范围
const previewDateRange = computed(() => {
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + config.value.maxDays);
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', { 
      month: 'long', 
      day: 'numeric'
    });
  };
  
  return `${t('tomorrow', '明天')} ${t('to', '到')} ${formatDate(endDate)}`;
});

// 验证配置
const isValid = computed(() => {
  validationError.value = '';
  
  if (config.value.maxDays < 1 || config.value.maxDays > 365) {
    validationError.value = t('advanceValidationMaxDays', '最大提前天数必须在 1 到 365 天之间');
    return false;
  }
  
  return true;
});

// 加载配置列表
onMounted(async () => {
  try {
    configNames.value = await props.configManager.listConfigNames('advance');
  } catch (error) {
    logger.error('Failed to load config names:', error);
  }
});

// 加载选中的配置
async function loadSelectedConfig() {
  if (!selectedConfigName.value) return;
  
  try {
    const loaded = await props.configManager.loadConfig(selectedConfigName.value, 'advance');
    if (loaded) {
      config.value = loaded as AdvanceConfig;
    }
  } catch (error) {
    logger.error('Failed to load config:', error);
    validationError.value = t('advanceLoadConfigFailed', '加载配置失败');
  }
}

// 保存当前配置
async function saveCurrentConfig() {
  if (!newConfigName.value.trim()) return;
  
  try {
    await props.configManager.saveConfig(newConfigName.value.trim(), config.value, 'advance');
    configNames.value.push(newConfigName.value.trim());
    newConfigName.value = '';
  } catch (error) {
    logger.error('Failed to save config:', error);
    validationError.value = t('advanceSaveConfigFailed', '保存配置失败');
  }
}

function handleConfirm() {
  if (!isValid.value) return;
  emit('confirm', config.value);
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.advance-dialog {
  padding: 16px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog__info {
  margin-bottom: 20px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  text-align: center;
}

.form-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--b3-border-color);
}

.form-section:last-of-type {
  border-bottom: none;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
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

.preview-box {
  padding: 16px;
  background: var(--b3-theme-primary-lightest);
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
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--b3-border-color);
}
</style>
