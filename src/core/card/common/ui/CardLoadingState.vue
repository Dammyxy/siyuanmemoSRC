<template>
  <div class="card-loading-state">
    <div class="card-loading-state__spinner"></div>
    <div class="card-loading-state__text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  text?: string;
}>(), {
  text: '加载中...'
});
</script>

<style scoped>
.card-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.card-loading-state__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--b3-border-color);
  border-top-color: var(--b3-theme-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.card-loading-state__text {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}
</style>
