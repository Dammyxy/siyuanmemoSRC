<template>
  <div class="fsrs-action-params">
    <div class="b3-form">
      <div v-if="description" class="b3-form__desc">{{ description }}</div>
      <label class="b3-form__label">{{ label }}</label>
      <div class="fsrs-action-params__row">
        <input
          class="b3-text-field"
          type="number"
          v-model="rawValue"
          :min="min"
          :max="max"
          :step="step"
          @keydown.enter.prevent="handleConfirm"
        />
        <span v-if="unit" class="ft__secondary fsrs-action-params__unit">{{ unit }}</span>
      </div>
    </div>
    <div class="b3-dialog__action">
      <button class="b3-button b3-button--cancel" @click="emit('cancel')">{{ cancelText }}</button>
      <button class="b3-button b3-button--text" @click="handleConfirm">{{ confirmText }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  label: string;
  description?: string;
  unit?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  confirmText: string;
  cancelText: string;
}>();

const emit = defineEmits<{
  (e: 'confirm', value: number): void;
  (e: 'cancel'): void;
}>();

const rawValue = ref(String(props.defaultValue ?? ''));

function handleConfirm() {
  const n = Number(rawValue.value);
  if (!Number.isFinite(n)) return;
  let v = n;
  if (props.integer) v = Math.trunc(v);
  if (typeof props.min === 'number') v = Math.max(props.min, v);
  if (typeof props.max === 'number') v = Math.min(props.max, v);
  emit('confirm', v);
}
</script>

<style scoped>
.fsrs-action-params {
  padding: 16px;
}

.fsrs-action-params__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fsrs-action-params__unit {
  white-space: nowrap;
}
</style>

