<template>
  <div v-if="navigationState" class="neural-nav-bar">
    <div class="neural-nav-bar__status">
      <div class="neural-nav-bar__status-main">
        <span class="neural-nav-bar__engine">{{ engineText }}</span>
        <span class="neural-nav-bar__divider" aria-hidden="true">&middot;</span>
        <span>{{ statusText }}</span>
      </div>
      <div class="neural-nav-bar__intro" :title="engineIntroLongText">
        {{ engineIntroText }}
      </div>
    </div>
    <div class="neural-nav-bar__actions">
      <button
        type="button"
        class="b3-button b3-button--outline neural-nav-bar__button"
        :aria-label="engineButtonAriaLabel"
        :title="engineButtonAriaLabel"
        @click="$emit('toggle-engine-mode')"
      >
        {{ engineText }}
      </button>
      <button
        type="button"
        class="b3-button b3-button--outline neural-nav-bar__button"
        :aria-label="statusText"
        :title="statusText"
        @click="$emit('toggle-nav-mode')"
      >
        {{ navigationModeText }}
      </button>
      <button
        type="button"
        class="b3-button b3-button--outline neural-nav-bar__button"
        :disabled="!navigationState.hasBookmark"
        :aria-label="bookmarkLabel"
        :title="bookmarkLabel"
        @click="$emit('return-bookmark')"
      >
        {{ bookmarkLabel }}
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
  (e: 'toggle-engine-mode'): void;
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

const engineText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.engineMode === 'hyperspace'
    ? t('engineHyperspace', 'Hyperspace Expedition')
    : t('engineOrbit', 'Orbit');
});

const navigationModeText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.navigationMode === 'follow'
    ? t('navModeFollow', 'Follow Path')
    : t('navModeExplore', 'Free Explore');
});

const engineIntroText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.engineMode === 'hyperspace'
    ? t('engineHyperspaceIntro', 'Propagate outward layer by layer from activation sources through links and optional tree relations.')
    : t('engineOrbitIntro', 'Roam locally around orbit centers, concept cards, and nearby anchors.');
});

const engineIntroLongText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.engineMode === 'hyperspace'
    ? t(
        'engineHyperspaceIntroLong',
        'Propagate outward from one or more activation sources through concept links, block links, and optional tree relations instead of orbiting a single center.',
      )
    : t(
        'engineOrbitIntroLong',
        'Roam locally around an orbit center through backlinks, direct references, indirect references, and descriptors near concept cards and anchors.',
      );
});

const statusText = computed(() => {
  if (!props.navigationState) {
    return '';
  }

  if (props.navigationState.navigationMode === 'follow') {
    return interpolate(
      t('navStatusFollow', 'Current: {mode} ({current}/{total})'),
      {
        mode: navigationModeText.value,
        current: props.navigationState.currentPathIndex + 1,
        total: props.navigationState.pathLength,
      },
    );
  }

  return interpolate(
    t('navStatusExplore', 'Current: {mode}'),
    { mode: navigationModeText.value },
  );
});

const engineButtonAriaLabel = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return `${interpolate(
    t('switchEngineMode', 'Switch Engine: {mode}'),
    { mode: engineText.value },
  )} ${engineIntroLongText.value}`.trim();
});

const bookmarkLabel = computed(() => t('returnToBookmark', 'Return to Anchor'));
</script>
