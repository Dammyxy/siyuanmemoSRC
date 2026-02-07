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
  padding: 16px;
  min-width: 360px;
}

.insert-position-dialog__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 16px;
}

.insert-position-dialog__header svg {
  width: 16px;
  height: 16px;
}

.insert-position-dialog__content {
  margin-bottom: 16px;
}

.insert-position-dialog__hint {
  color: var(--b3-theme-on-surface);
  font-size: 14px;
  margin-bottom: 12px;
}

.insert-position-dialog__field label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.insert-position-dialog__field input {
  width: 100%;
}

.insert-position-dialog__error {
  color: var(--b3-theme-error);
  font-size: 12px;
  margin-top: 4px;
}

.insert-position-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
