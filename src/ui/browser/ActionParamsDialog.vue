<template>
  <div class="fn__flex-column" style="height: 100%; gap: 12px; padding: 12px;">
    <div v-if="description" class="ft__breakword">{{ description }}</div>

    <div class="fn__flex" style="align-items: center; gap: 8px;">
      <label class="ft__nowrap">{{ label }}</label>
      <input
        ref="inputRef"
        class="b3-text-field fn__block"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        v-model="rawValue"
        @click.stop
        @keydown.stop="handleKeydown"
      />
      <span v-if="unit" class="ft__nowrap">{{ unit }}</span>
    </div>

    <div v-if="errorText" class="ft__error">{{ errorText }}</div>

    <div class="b3-dialog__action">
      <button class="b3-button b3-button--cancel" @click="emitCancel">{{ cancelText }}</button>
      <div class="fn__space"></div>
      <button class="b3-button b3-button--text" @click="emitConfirm">{{ confirmText }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

const props = defineProps<{
  label: string;
  description?: string;
  unit?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  confirmText?: string;
  cancelText?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm', value: number): void;
  (e: 'cancel'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const rawValue = ref<string>(String(props.defaultValue ?? ''));

const confirmText = computed(() => props.confirmText || 'Confirm');
const cancelText = computed(() => props.cancelText || 'Cancel');

const errorText = ref('');

function validate(): number | null {
  const n = Number(rawValue.value);
  if (!Number.isFinite(n)) {
    errorText.value = '请输入有效数字';
    return null;
  }
  let v = n;
  if (props.integer !== false) {
    v = Math.round(v);
  }
  if (typeof props.min === 'number' && v < props.min) v = props.min;
  if (typeof props.max === 'number' && v > props.max) v = props.max;
  errorText.value = '';
  return v;
}

function emitConfirm() {
  const v = validate();
  if (v == null) return;
  emit('confirm', v);
}

function emitCancel() {
  emit('cancel');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    emitConfirm();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    emitCancel();
  }
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      try {
        inputRef.value?.focus();
        inputRef.value?.select?.();
      } catch {}
    }, 0);
  });
});
</script>
