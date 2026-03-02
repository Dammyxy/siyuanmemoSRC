<template>
  <div v-if="navigationState" class="neural-nav-bar">
    <div class="neural-nav-bar__status">
      {{ statusText }}
    </div>
    <div class="neural-nav-bar__actions">
      <button
        type="button"
        class="b3-button b3-button--outline neural-nav-bar__button"
        @click="$emit('toggle-nav-mode')"
      >
        {{ t('switchNavMode', 'Switch Roam Direction') }}
      </button>
      <button
        type="button"
        class="b3-button b3-button--outline neural-nav-bar__button"
        :disabled="!navigationState.hasBookmark"
        @click="$emit('return-bookmark')"
      >
        {{ t('returnToBookmark', 'Return to Mainline Anchor') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NeuralNavigationState } from '@/types/unified-data-source';

const props = defineProps<{
  i18n?: Record<string, string>;
  navigationState: NeuralNavigationState | null;
}>();

defineEmits<{
  (e: 'toggle-nav-mode'): void;
  (e: 'return-bookmark'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return output;
}

const modeText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.navigationMode === 'follow'
    ? t('navModeFollow', 'Follow Mainline')
    : t('navModeExplore', 'Explore Worldline Branches');
});

const statusText = computed(() => {
  if (!props.navigationState) {
    return '';
  }

  if (props.navigationState.navigationMode === 'follow') {
    return interpolate(
      t('navStatusFollow', 'Current: {mode} ({current}/{total})'),
      {
        mode: modeText.value,
        current: props.navigationState.currentPathIndex + 1,
        total: props.navigationState.pathLength,
      }
    );
  }

  return interpolate(
    t('navStatusExplore', 'Current: {mode}'),
    { mode: modeText.value }
  );
});
</script>
