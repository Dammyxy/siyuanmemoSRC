<template>
  <div class="priority-dialog">
    <div class="dialog__content">
      <div class="dialog__info">
        <span>为 <strong>{{ count }}</strong> 张卡片设置优先级</span>
      </div>
      
      <!-- 快速选择 -->
      <div class="quick-buttons">
        <button 
          v-for="preset in presets" 
          :key="preset.value"
          class="btn-preset"
          :class="{ 'btn-preset--active': priority === preset.value }"
          @click="priority = preset.value"
        >
          <span class="preset-emoji">{{ preset.emoji }}</span>
          <span class="preset-label">{{ preset.label }}</span>
          <span class="preset-value">{{ preset.value }}</span>
        </button>
      </div>
      
      <!-- 滑块 -->
      <div class="slider-section">
        <label>自定义优先级</label>
        <div class="slider-wrapper">
          <input 
            type="range" 
            v-model.number="priority" 
            min="0" 
            max="100"
            class="priority-slider"
          />
          <input 
            type="number" 
            v-model.number="priority" 
            min="0" 
            max="100"
            class="priority-input"
          />
        </div>
        <div class="slider-labels">
          <span>低</span>
          <span>中</span>
          <span>高</span>
        </div>
      </div>
      
      <div class="priority-hint">
        <span :style="{ color: priorityColor }">{{ priorityDescription }}</span>
      </div>
    </div>
    
    <div class="dialog__actions">
      <button class="b3-button b3-button--cancel" @click="handleCancel">取消</button>
      <button class="b3-button b3-button--text" @click="handleConfirm">
        确认设置
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  count: number;
  initialPriority?: number;
}>();

const emit = defineEmits<{
  (e: 'confirm', priority: number): void;
  (e: 'cancel'): void;
}>();

const priority = ref(props.initialPriority ?? 50);

const presets = [
  { value: 0, label: '最低', emoji: '🔽' },
  { value: 25, label: '较低', emoji: '⬇️' },
  { value: 50, label: '普通', emoji: '➡️' },
  { value: 75, label: '较高', emoji: '⬆️' },
  { value: 100, label: '最高', emoji: '🔼' },
];

const priorityColor = computed(() => {
  if (priority.value <= 25) return 'var(--b3-theme-on-surface-light)';
  if (priority.value <= 50) return 'var(--b3-card-info-color)';
  if (priority.value <= 75) return 'var(--b3-card-warning-color)';
  return 'var(--b3-card-error-color)';
});

const priorityDescription = computed(() => {
  if (priority.value <= 10) return '优先级极低，将排到最后复习';
  if (priority.value <= 25) return '优先级较低';
  if (priority.value <= 50) return '标准优先级';
  if (priority.value <= 75) return '优先级较高，将优先复习';
  if (priority.value <= 90) return '优先级很高';
  return '最高优先级，将最先复习';
});

function handleConfirm() {
  emit('confirm', priority.value);
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.priority-dialog {
  padding: 16px;
}

.dialog__info {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  text-align: center;
}

.quick-buttons {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.btn-preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-preset:hover {
  background: var(--b3-list-hover);
}

.btn-preset--active {
  background: var(--b3-theme-primary-lightest);
  border-color: var(--b3-theme-primary);
}

.preset-emoji {
  font-size: 20px;
  margin-bottom: 4px;
}

.preset-label {
  font-size: 12px;
  color: var(--b3-theme-on-background);
}

.preset-value {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
}

.slider-section {
  margin-bottom: 16px;
}

.slider-section label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.priority-slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  -webkit-appearance: none;
  background: linear-gradient(to right, 
    var(--b3-theme-on-surface-light) 0%, 
    var(--b3-theme-primary) 50%, 
    var(--b3-card-error-color) 100%
  );
}

.priority-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--b3-theme-primary);
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  cursor: pointer;
}

.priority-input {
  width: 60px;
  padding: 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
  text-align: center;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
}

.priority-hint {
  padding: 10px 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
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
