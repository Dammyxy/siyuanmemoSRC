<template>
  <div class="postpone-dialog">
    <div class="dialog__content">
      <div class="dialog__info">
        <span>{{ t('postponeDialogInfo', '将为 {n} 张卡片执行推迟操作').replace('{n}', String(count)) }}</span>
      </div>
      
      <!-- 基础参数 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('postponeBasicParams', '基础参数') }}</h4>
        
        <div class="form-field">
          <label>{{ t('postponeDelayFactor', '延迟因子') }}</label>
          <div class="input-with-hint">
            <input 
              type="number" 
              v-model.number="config.delayFactor" 
              min="1.0" 
              max="10.0"
              step="0.1"
              class="form-input"
            />
            <span class="field-hint">{{ t('postponeDelayFactorHint', '新间隔 = 当前间隔 × 延迟因子') }}</span>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-field">
            <label>{{ t('postponeMinInterval', '最小间隔（天）') }}</label>
            <input 
              type="number" 
              v-model.number="config.minInterval" 
              min="1" 
              max="365"
              class="form-input"
            />
          </div>
          <div class="form-field">
            <label>{{ t('postponeMaxInterval', '最大间隔（天）') }}</label>
            <input 
              type="number" 
              v-model.number="config.maxInterval" 
              min="1" 
              max="3650"
              class="form-input"
            />
          </div>
        </div>
      </div>
      
      <!-- 跳过条件 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('postponeSkipConditions', '跳过条件') }}</h4>
        <p class="section-desc">{{ t('postponeSkipConditionsDesc', '满足以下任一条件的卡片将不被推迟') }}</p>
        
        <div class="skip-condition">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.skipConditions.skipByPriority!.enabled"
            />
            <span>{{ t('postponeSkipByPriority', '跳过高优先级卡片') }}</span>
          </label>
          <div v-if="config.skipConditions.skipByPriority!.enabled" class="condition-input">
            <span class="condition-label">{{ t('postponePriorityLowerThan', '优先级低于') }}</span>
            <input 
              type="number" 
              v-model.number="config.skipConditions.skipByPriority!.threshold" 
              min="0" 
              max="100"
              class="form-input-small"
            />
            <span class="condition-hint">{{ t('postponePriorityHint', '（数值越小优先级越高）') }}</span>
          </div>
        </div>
        
        <div class="skip-condition">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.skipConditions.skipByInterval!.enabled"
            />
            <span>{{ t('postponeSkipByInterval', '跳过长间隔卡片') }}</span>
          </label>
          <div v-if="config.skipConditions.skipByInterval!.enabled" class="condition-input">
            <span class="condition-label">{{ t('postponeIntervalExceeds', '间隔超过') }}</span>
            <input 
              type="number" 
              v-model.number="config.skipConditions.skipByInterval!.threshold" 
              min="1" 
              max="3650"
              class="form-input-small"
            />
            <span class="condition-hint">{{ t('days', '天') }}</span>
          </div>
        </div>
        
        <div class="skip-condition">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.skipConditions.skipByRetrievability!.enabled"
            />
            <span>{{ t('postponeSkipByRetrievability', '跳过高记忆强度卡片') }}</span>
          </label>
          <div v-if="config.skipConditions.skipByRetrievability!.enabled" class="condition-input">
            <span class="condition-label">{{ t('postponeRetrievabilityHigherThan', '可提取性高于') }}</span>
            <input 
              type="number" 
              v-model.number="config.skipConditions.skipByRetrievability!.threshold" 
              min="0" 
              max="1"
              step="0.1"
              class="form-input-small"
            />
          </div>
        </div>
        
        <div class="skip-condition">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.skipConditions.skipByAFactor!.enabled"
            />
            <span>{{ t('postponeSkipByAFactor', '跳过低 A-Factor 卡片') }}</span>
          </label>
          <div v-if="config.skipConditions.skipByAFactor!.enabled" class="condition-input">
            <span class="condition-label">{{ t('postponeAFactorLowerThan', 'A-Factor 低于') }}</span>
            <input 
              type="number" 
              v-model.number="config.skipConditions.skipByAFactor!.threshold" 
              min="1.2" 
              max="6.0"
              step="0.1"
              class="form-input-small"
            />
            <span class="condition-hint">{{ t('postponeTopicCardsOnly', '（仅 Topic 卡片）') }}</span>
          </div>
        </div>
        
        <div class="skip-condition">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="config.skipConditions.skipByPostponeCount!.enabled"
            />
            <span>{{ t('postponeSkipByPostponeCount', '跳过已多次推迟的卡片') }}</span>
          </label>
          <div v-if="config.skipConditions.skipByPostponeCount!.enabled" class="condition-input">
            <span class="condition-label">{{ t('postponeCountExceeds', '推迟次数超过') }}</span>
            <input 
              type="number" 
              v-model.number="config.skipConditions.skipByPostponeCount!.threshold" 
              min="1" 
              max="100"
              class="form-input-small"
            />
            <span class="condition-hint">{{ t('times', '次') }}</span>
          </div>
        </div>
      </div>
      
      <!-- 高级参数 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('postponeAdvancedParams', '高级参数') }}</h4>
        
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="config.includeNonOutstanding"
          />
          <span>{{ t('postponeIncludeNonOutstanding', '包含未到期卡片 (Dilute 模式)') }}</span>
        </label>
        <p v-if="config.includeNonOutstanding" class="field-hint">
          {{ t('postponeIncludeNonOutstandingHint', '启用后将处理所有选中的卡片，包括未到期的卡片（类似 SuperMemo 的 Dilute 操作）') }}
        </p>
        
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="config.modifyDelayByRetrievability"
          />
          <span>{{ t('postponeModifyByRetrievability', '根据记忆强度动态调整延迟因子') }}</span>
        </label>
        <p v-if="config.modifyDelayByRetrievability" class="field-hint">
          {{ t('postponeModifyByRetrievabilityHint', '记忆越不牢固的卡片将使用更大的延迟因子') }}
        </p>
        
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="config.modifyDelayByPriority"
          />
          <span>{{ t('postponeModifyByPriority', '根据优先级动态调整延迟因子') }}</span>
        </label>
        <p v-if="config.modifyDelayByPriority" class="field-hint">
          {{ t('postponeModifyByPriorityHint', '优先级越低的卡片将使用更大的延迟因子') }}
        </p>
      </div>
      
      <!-- 配置管理 -->
      <div class="form-section">
        <h4 class="section-title">{{ t('postponeConfigManagement', '配置管理') }}</h4>
        
        <div class="config-actions">
          <div class="config-select">
            <select v-model="selectedConfigName" class="form-select">
              <option value="">{{ t('postponeSelectConfig', '选择预设配置...') }}</option>
              <option v-for="name in configNames" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <button 
              class="btn-action" 
              @click="loadSelectedConfig"
              :disabled="!selectedConfigName"
            >
              {{ t('postponeLoadConfig', '加载') }}
            </button>
          </div>
          
          <div class="config-save">
            <input 
              type="text" 
              v-model="newConfigName" 
              :placeholder="t('postponeConfigNamePlaceholder', '输入配置名称...')"
              class="form-input"
            />
            <button 
              class="btn-action" 
              @click="saveCurrentConfig"
              :disabled="!newConfigName.trim()"
            >
              {{ t('postponeSaveConfig', '保存') }}
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
        {{ t('postponeConfirmButton', '确认推迟') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { PostponeConfig } from '@/types/reschedule';
import { ConfigManager } from '@/core/scheduler/ConfigManager';

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
  (e: 'confirm', config: PostponeConfig): void;
  (e: 'cancel'): void;
}>();

// 配置状态
const config = ref<PostponeConfig>(props.configManager.getDefaultPostponeConfig());
const selectedConfigName = ref('');
const newConfigName = ref('');
const configNames = ref<string[]>([]);

// 验证错误
const validationError = ref('');

// 验证配置
const isValid = computed(() => {
  validationError.value = '';
  
  if (config.value.delayFactor < 1.0 || config.value.delayFactor > 10.0) {
    validationError.value = t('postponeValidationDelayFactor', '延迟因子必须在 1.0 到 10.0 之间');
    return false;
  }
  
  if (config.value.minInterval < 1 || config.value.minInterval > 365) {
    validationError.value = t('postponeValidationMinInterval', '最小间隔必须在 1 到 365 天之间');
    return false;
  }
  
  if (config.value.maxInterval < 1 || config.value.maxInterval > 3650) {
    validationError.value = t('postponeValidationMaxInterval', '最大间隔必须在 1 到 3650 天之间');
    return false;
  }
  
  if (config.value.minInterval > config.value.maxInterval) {
    validationError.value = t('postponeValidationIntervalRange', '最小间隔不能大于最大间隔');
    return false;
  }
  
  return true;
});

// 加载配置列表
onMounted(async () => {
  try {
    const allConfigs = await (props.configManager as any).loadAllConfigs();
    configNames.value = Object.keys(allConfigs.postpone || {});
  } catch (error) {
    console.error('Failed to load config names:', error);
  }
});

// 加载选中的配置
async function loadSelectedConfig() {
  if (!selectedConfigName.value) return;
  
  try {
    const loaded = await props.configManager.loadConfig(selectedConfigName.value, 'postpone');
    if (loaded) {
      config.value = loaded as PostponeConfig;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    validationError.value = t('postponeLoadConfigFailed', '加载配置失败');
  }
}

// 保存当前配置
async function saveCurrentConfig() {
  if (!newConfigName.value.trim()) return;
  
  try {
    await props.configManager.saveConfig(newConfigName.value.trim(), config.value, 'postpone');
    configNames.value.push(newConfigName.value.trim());
    newConfigName.value = '';
  } catch (error) {
    console.error('Failed to save config:', error);
    validationError.value = t('postponeSaveConfigFailed', '保存配置失败');
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
.postpone-dialog {
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

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

.form-input-small {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 13px;
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

.input-with-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-hint {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  font-size: 13px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.skip-condition {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
}

.condition-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-left: 24px;
}

.condition-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.condition-hint {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
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
