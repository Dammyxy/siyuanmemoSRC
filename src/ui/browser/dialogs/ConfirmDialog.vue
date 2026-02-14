<template>
  <div class="confirm-dialog">
    <div class="dialog__content">
      <div class="dialog__icon" :class="`dialog__icon--${type}`">
        {{ iconEmoji }}
      </div>
      <div class="dialog__title">{{ title }}</div>
      <div class="dialog__message">{{ message }}</div>
    </div>
    
    <div class="dialog__actions">
      <button class="b3-button b3-button--cancel" @click="handleCancel">
        {{ cancelText }}
      </button>
      <button 
        class="b3-button" 
        :class="confirmButtonClass"
        @click="handleConfirm"
      >
        {{ confirmText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  type?: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}>(), {
  type: 'info',
  confirmText: '确认',
  cancelText: '取消',
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const iconEmoji = computed(() => {
  switch (props.type) {
    case 'warning': return '⚠️';
    case 'danger': return '🗑️';
    default: return 'ℹ️';
  }
});

const confirmButtonClass = computed(() => {
  switch (props.type) {
    case 'danger': return 'b3-button--error';
    case 'warning': return 'b3-button--warning';
    default: return 'b3-button--text';
  }
});

function handleConfirm() {
  emit('confirm');
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.confirm-dialog {
  padding: 24px;
  text-align: center;
}

.dialog__icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.dialog__title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--b3-theme-on-background);
}

.dialog__message {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
  line-height: 1.5;
}

.dialog__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.dialog__actions button {
  min-width: 80px;
}
</style>
