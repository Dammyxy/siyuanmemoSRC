<template>
  <div class="card-error-state">
    <div class="card-error-state__icon">⚠️</div>
    <div class="card-error-state__text">{{ message }}</div>
    <button 
      v-if="showRetry"
      class="card-error-state__retry"
      @click="$emit('retry')"
    >
      重试
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message: string;
  showRetry?: boolean;
}>(), {
  showRetry: false
});

defineEmits<{
  (e: 'retry'): void;
}>();
</script>

<style scoped>
.card-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.card-error-state__icon {
  font-size: 48px;
}

.card-error-state__text {
  font-size: 14px;
  color: var(--b3-theme-error);
  text-align: center;
  max-width: 400px;
}

.card-error-state__retry {
  margin-top: 8px;
  padding: 8px 16px;
  background: var(--b3-theme-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.card-error-state__retry:hover {
  background: var(--b3-theme-primary-light);
}
</style>
