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
      <div
        class="neural-nav-bar__modes"
        role="tablist"
        :aria-label="t('workspaceMode', 'Workspace mode')"
      >
        <button
          v-for="mode in workspaceModeOptions"
          :key="mode.id"
          type="button"
          class="b3-button b3-button--outline neural-nav-bar__mode"
          :class="{ 'neural-nav-bar__mode--active': mode.id === activeWorkspaceMode }"
          role="tab"
          :aria-selected="String(mode.id === activeWorkspaceMode)"
          :title="mode.title"
          @click="$emit('select-workspace-mode', mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
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
import { getNeuralEngineLabel } from '@/ui/shared/neuralRoamLabels';
import type { BrowserNeuralWorkspaceMode } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  navigationState: NeuralNavigationState | null;
  workspaceMode?: BrowserNeuralWorkspaceMode;
}>();

defineEmits<{
  (e: 'toggle-engine-mode'): void;
  (e: 'toggle-nav-mode'): void;
  (e: 'return-bookmark'): void;
  (e: 'select-workspace-mode', mode: BrowserNeuralWorkspaceMode): void;
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
  return getNeuralEngineLabel(props.navigationState.engineMode, t, 'short');
});

const navigationModeText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.navigationMode === 'follow'
    ? t('navModeFollow', 'Follow Path')
    : t('navModeExplore', 'Free Roam');
});

const engineIntroText = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.engineMode === 'hyperspace'
    ? t('engineHyperspaceIntro', 'Propagate outward layer by layer from activation sources through links and optional tree relations.')
    : t('engineOrbitIntro', 'Roam locally around orbit centers, concept cards, and nearby stations.');
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
        'Roam locally around an orbit center through backlinks, direct references, indirect references, and descriptors near concept cards and stations.',
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

const activeWorkspaceMode = computed<BrowserNeuralWorkspaceMode>(() =>
  props.workspaceMode ?? props.navigationState?.engineMode ?? 'orbit'
);

const workspaceModeOptions = computed(() => [
  {
    id: 'orbit' as const,
    label: getNeuralEngineLabel('orbit', t, 'short'),
    title: t('engineOrbitIntroLong', 'Roam locally around an orbit center through backlinks, direct references, indirect references, and descriptors near concept cards and stations.'),
  },
  {
    id: 'hyperspace' as const,
    label: getNeuralEngineLabel('hyperspace', t, 'short'),
    title: t('engineHyperspaceIntroLong', 'Propagate outward from one or more activation sources through concept links, block links, and optional tree relations instead of orbiting a single center.'),
  },
]);

const bookmarkLabel = computed(() => t('returnToBookmark', 'Return to Station'));
</script>
