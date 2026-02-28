<template>
  <div class="neural-subview-tabs" role="tablist" aria-label="Neural subviews">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="neural-subview-tabs__tab b3-button b3-button--outline"
      :class="{ 'neural-subview-tabs__tab--active': modelValue === tab.id }"
      role="tab"
      :aria-selected="modelValue === tab.id"
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { NeuralSubview, NeuralSubviewTab } from './types';

defineProps<{
  modelValue: NeuralSubview;
  tabs: NeuralSubviewTab[];
}>();

defineEmits<{
  (e: 'update:modelValue', value: NeuralSubview): void;
}>();
</script>

