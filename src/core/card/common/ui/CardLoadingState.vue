<template>
  <div class="card-loading-state">
    <div class="card-loading-state__skeleton" aria-hidden="true">
      <div class="card-loading-state__bar card-loading-state__bar--lg"></div>
      <div class="card-loading-state__bar card-loading-state__bar--md"></div>
      <div class="card-loading-state__bar card-loading-state__bar--sm"></div>
    </div>
    <div v-if="text" class="card-loading-state__text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  text?: string;
}>(), {
  text: ''
});
</script>

<style scoped>
.card-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
}

.card-loading-state__skeleton {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-loading-state__bar {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--b3-theme-surface-light) 88%, transparent),
    color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-theme-surface-light) 76%),
    color-mix(in srgb, var(--b3-theme-surface-light) 88%, transparent)
  );
  background-size: 220% 100%;
  animation: pulse-shimmer 1.25s ease-in-out infinite;
}

.card-loading-state__bar--lg {
  width: 92%;
}

.card-loading-state__bar--md {
  width: 74%;
}

.card-loading-state__bar--sm {
  width: 58%;
}

@keyframes pulse-shimmer {
  0% {
    opacity: 0.55;
    background-position: 0% 50%;
  }

  50% {
    opacity: 0.95;
    background-position: 100% 50%;
  }

  100% {
    opacity: 0.55;
    background-position: 0% 50%;
  }
}

.card-loading-state__text {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}
</style>
