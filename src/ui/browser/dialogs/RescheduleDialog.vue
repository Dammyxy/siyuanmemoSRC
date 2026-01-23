<template>
  <div class="reschedule-dialog">
    <div class="dialog__content">
      <div class="dialog__info">
        <span>将为 <strong>{{ count }}</strong> 张卡片重新设置到期时间</span>
      </div>
      
      <!-- 模式选择 -->
      <div class="mode-tabs">
        <button 
          class="mode-tab" 
          :class="{ 'mode-tab--active': mode === 'relative' }"
          @click="mode = 'relative'"
        >
          相对时间
        </button>
        <button 
          class="mode-tab" 
          :class="{ 'mode-tab--active': mode === 'absolute' }"
          @click="mode = 'absolute'"
        >
          绝对日期
        </button>
      </div>
      
      <!-- 相对时间模式 -->
      <div v-if="mode === 'relative'" class="form-section">
        <label>延迟天数</label>
        <div class="relative-input">
          <button class="btn-quick" @click="relativeDays = 1">+1天</button>
          <button class="btn-quick" @click="relativeDays = 3">+3天</button>
          <button class="btn-quick" @click="relativeDays = 7">+7天</button>
          <button class="btn-quick" @click="relativeDays = 30">+30天</button>
        </div>
        <div class="custom-input">
          <input 
            type="number" 
            v-model.number="relativeDays" 
            min="1" 
            max="365"
            placeholder="输入天数"
          />
          <span class="input-suffix">天后到期</span>
        </div>
        <div class="preview-date">
          预计到期: {{ previewRelativeDate }}
        </div>
      </div>
      
      <!-- 绝对日期模式 -->
      <div v-if="mode === 'absolute'" class="form-section">
        <label>选择日期时间</label>
        <input 
          type="datetime-local" 
          v-model="absoluteDateStr"
          class="datetime-input"
        />
      </div>
    </div>
    
    <div class="dialog__actions">
      <button class="b3-button b3-button--cancel" @click="handleCancel">取消</button>
      <button class="b3-button b3-button--text" @click="handleConfirm" :disabled="!isValid">
        确认调度
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  count: number;
}>();

const emit = defineEmits<{
  (e: 'confirm', mode: 'absolute' | 'relative', value: Date | number): void;
  (e: 'cancel'): void;
}>();

const mode = ref<'absolute' | 'relative'>('relative');
const relativeDays = ref(1);
const absoluteDateStr = ref('');

// 初始化默认绝对日期为明天
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0);
absoluteDateStr.value = formatDateTimeLocal(tomorrow);

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const previewRelativeDate = computed(() => {
  const date = new Date();
  date.setDate(date.getDate() + relativeDays.value);
  return date.toLocaleDateString('zh-CN', { 
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });
});

const isValid = computed(() => {
  if (mode.value === 'relative') {
    return relativeDays.value >= 1 && relativeDays.value <= 365;
  } else {
    return absoluteDateStr.value !== '';
  }
});

function handleConfirm() {
  if (!isValid.value) return;
  
  if (mode.value === 'relative') {
    emit('confirm', 'relative', relativeDays.value);
  } else {
    emit('confirm', 'absolute', new Date(absoluteDateStr.value));
  }
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.reschedule-dialog {
  padding: 16px;
}

.dialog__info {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  text-align: center;
}

.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-tab {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  cursor: pointer;
  transition: all 0.15s;
}

.mode-tab:hover {
  background: var(--b3-list-hover);
}

.mode-tab--active {
  background: var(--b3-theme-primary);
  color: white;
  border-color: var(--b3-theme-primary);
}

.form-section {
  margin-bottom: 16px;
}

.form-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
}

.relative-input {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.btn-quick {
  padding: 6px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  font-size: 13px;
}

.btn-quick:hover {
  background: var(--b3-theme-primary-lightest);
  border-color: var(--b3-theme-primary);
}

.custom-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-input input {
  width: 100px;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
}

.input-suffix {
  font-size: 13px;
  color: var(--b3-theme-on-surface-light);
}

.preview-date {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--b3-theme-primary-lightest);
  border-radius: 4px;
  font-size: 13px;
  color: var(--b3-theme-primary);
}

.datetime-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
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
