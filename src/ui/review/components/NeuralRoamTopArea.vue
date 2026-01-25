<template>
  <div v-if="show" class="fsrs-neural-header">
    <span v-if="reason" class="fsrs-neural-header__reason">{{ reason }}</span>
    <span v-if="from" class="fsrs-neural-header__from">
      <span v-if="reason">·</span>
      {{ from }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { NEURAL_TOP_AREA_CONTEXT_KEY } from './contexts';

type Ctx = {
  t: (key: string, fallback: string) => string;
  isTopicMode: { value: boolean };
  isNeuralPractice: { value: boolean };
  neuralReasonLabel: { value: string };
  neuralFromShort: { value: string };
};

const ctx = inject(NEURAL_TOP_AREA_CONTEXT_KEY, null as any as Ctx | null);

const show = computed(() => {
  if (!ctx) return false;
  return ctx.isNeuralPractice.value && !ctx.isTopicMode.value;
});

const reason = computed(() => {
  if (!ctx) return '';
  return String(ctx.neuralReasonLabel.value || ctx.t('neuralModeLabel', '神经复习'));
});

const from = computed(() => {
  if (!ctx) return '';
  return String(ctx.neuralFromShort.value || '');
});
</script>

