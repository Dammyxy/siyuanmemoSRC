<template>
  <div class="insert-position-dialog">
    <div class="insert-position-dialog__header">
      <svg><use xlink:href="#iconPin"></use></svg>
      <span>{{ t('insertToPosition', '插入到队列指定位置') }}</span>
    </div>
    
    <div class="insert-position-dialog__content">
      <div class="insert-position-dialog__hint">
        {{ t('remainingCards', '剩余 {n} 张卡片').replace('{n}', String(queueSize)) }}
      </div>
      
      <div class="insert-position-dialog__field">
        <label>{{ t('position', '位置') }}</label>
        <input
          ref="inputRef"
          v-model.number="position"
          type="number"
          :min="1"
          :max="queueSize"
          :placeholder="`${t('input', '输入')} 1 ${t('to', '到')} ${queueSize}`"
          class="b3-text-field"
          @keyup.enter="handleConfirm"
          @keyup.esc="handleCancel"
        />
        <div v-if="error" class="insert-position-dialog__error">
          {{ error }}
        </div>
      </div>
    </div>
    
    <div class="insert-position-dialog__actions">
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
import { ref, onMounted } from 'vue';

interface Props {
  queueSize: number; // 剩余卡片数量
  i18n?: Record<string, string>;
}

interface Emits {
  (e: 'confirm', position: number): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const position = ref<number>(1);
const error = ref<string>('');
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function handleConfirm() {
  const pos = position.value;
  
  // 验证
  if (!Number.isInteger(pos) || pos < 1 || pos > props.queueSize) {
    error.value = t('invalidPosition', '请输入 1 到 {n} 的整数').replace('{n}', String(props.queueSize));
    return;
  }
  
  error.value = '';
  emit('confirm', pos);
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.insert-position-dialog {
  background-color: var(--b3-theme-background);
  border-radius: var(--b3-border-radius);
  padding: 16px;
  min-width: 360px;
  box-shadow: var(--b3-dialog-shadow);
}

.insert-position-dialog__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 16px;
  color: var(--b3-theme-on-background);
}

.insert-position-dialog__header svg {
  width: 18px;
  height: 18px;
  color: var(--b3-theme-primary);
}

.insert-position-dialog__content {
  margin-bottom: 20px;
}

.insert-position-dialog__hint {
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background-color: var(--b3-theme-surface);
  border-radius: var(--b3-border-radius-b);
  border-left: 3px solid var(--b3-theme-primary);
}

.insert-position-dialog__field label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--b3-theme-on-background);
}

.insert-position-dialog__field input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border-radius: var(--b3-border-radius);
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.insert-position-dialog__field input:focus {
  outline: none;
  border-color: var(--b3-theme-primary);
  box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
}

.insert-position-dialog__error {
  color: var(--b3-theme-error);
  font-size: 12px;
  margin-top: 6px;
  padding: 4px 8px;
  background-color: var(--b3-theme-error-lighter);
  border-radius: var(--b3-border-radius-b);
}

.insert-position-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--b3-theme-surface);
}

.insert-position-dialog__actions .b3-button {
  min-width: 80px;
}
</style>
