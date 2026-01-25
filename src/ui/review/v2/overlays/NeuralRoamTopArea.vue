<template>
  <div class="fsrs-neural-top-area" v-if="!isTopicMode">
    <div class="fsrs-neural-top-area__row">
      <span class="ft__secondary">{{ t('neuralReasonLabel', '关联') }}：</span>
      <span class="ft__primary">{{ reasonLabel }}</span>
      <span class="fn__space"></span>
      <span class="ft__secondary">{{ t('from', '来自') }}：</span>
      <span class="ft__secondary">{{ fromShort }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  i18n?: Record<string, string>;
  isTopicMode: boolean;
  reasonLabel: string;
  fromShort: string;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
</script>

<style scoped>
.fsrs-neural-top-area {
  padding: 6px 8px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.fsrs-neural-top-area__row {
  display: flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

