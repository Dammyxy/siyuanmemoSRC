<template>
  <div class="neural-list neural-focus-list">
    <div class="neural-list__toolbar neural-focus-list__toolbar">
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
    </div>

    <div class="neural-focus-list__hint">
      {{ modeHint }}
    </div>

    <section class="neural-list__section">
      <header class="neural-list__section-header">
        <span>{{ sectionTitle }}</span>
        <span class="ft__secondary">{{ filteredEntries.length }}</span>
      </header>

      <div v-if="filteredEntries.length === 0" class="neural-list__empty">
        {{ t('noStartPoints', 'No start points') }}
      </div>

      <ul v-else class="neural-list__items">
        <li
          v-for="entry in filteredEntries"
          :key="`${entry.nodeId}-${entry.addedAt}`"
          class="neural-list__item"
          :class="{ 'neural-list__item--active': entry.isCurrent }"
        >
          <button
            type="button"
            class="neural-list__item-main"
            @click="$emit('preview', entry.nodeId)"
            @dblclick="$emit('set-current-focus', entry.nodeId)"
            @keydown.enter.prevent="$emit('set-current-focus', entry.nodeId)"
          >
            <span class="neural-list__title">
              {{ entry.nodePreview || entry.nodeId }}
              <span v-if="entry.isCurrent" class="neural-list__tag neural-list__tag--current">
                {{ t('currentNodeTag', 'Current') }}
              </span>
              <span v-if="entry.isAnchored" class="neural-list__tag neural-list__tag--anchored">
                {{ t('anchoredTag', 'Anchored') }}
              </span>
            </span>
            <span class="neural-list__meta">
              {{ formatTime(entry.visitedAt) }}
            </span>
          </button>

          <div class="neural-list__actions">
            <button
              type="button"
              class="neural-list__action neural-list__action--primary b3-button"
              @click="$emit('set-current-focus', entry.nodeId)"
            >
              {{ primaryActionLabel }}
            </button>
            <button
              type="button"
              class="neural-list__action b3-button b3-button--outline"
              @click="$emit('toggle-anchor', entry.nodeId, !entry.isAnchored)"
            >
              {{
                entry.isAnchored
                  ? t('removeAnchor', 'Remove Anchor')
                  : t('addAnchor', 'Add Anchor')
              }}
            </button>
            <button
              type="button"
              class="neural-list__action b3-button b3-button--outline"
              @click="$emit('toggle-source', entry.nodeId, false)"
            >
              {{ t('removeStartPoint', 'Remove Start Point') }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NeuralEngineMode } from '@/types/unified-data-source';
import type { NeuralSourceListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  entries: NeuralSourceListEntry[];
  engineMode: NeuralEngineMode;
}>();

defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'set-current-focus', nodeId: string): void;
  (e: 'toggle-source', nodeId: string, enabled: boolean): void;
  (e: 'toggle-anchor', nodeId: string, enabled: boolean): void;
}>();

const search = ref('');

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function normalize(text: string): string {
  return String(text || '').toLowerCase();
}

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

const filteredEntries = computed(() => {
  const query = normalize(search.value).trim();
  return [...props.entries]
    .filter((entry) => {
      if (!query) {
        return true;
      }
      return normalize(entry.nodePreview).includes(query) || normalize(entry.nodeId).includes(query);
    })
    .sort((a, b) => b.visitedAt - a.visitedAt);
});

const sectionTitle = computed(() =>
  props.engineMode === 'hyperspace'
    ? t('activationSources', 'Activation Sources')
    : t('orbitCenters', 'Orbit Centers')
);

const primaryActionLabel = computed(() =>
  props.engineMode === 'hyperspace'
    ? t('setPrimaryActivationSource', 'Set as Primary Activation Source')
    : t('setCurrentFocus', 'Set as Orbit Center')
);

const modeHint = computed(() =>
  props.engineMode === 'hyperspace'
    ? t('sourceModeHintHyperspace', 'Start points work as activation sources in this mode.')
    : t('sourceModeHintOrbit', 'Start points work as orbit centers in this mode.')
);
</script>
