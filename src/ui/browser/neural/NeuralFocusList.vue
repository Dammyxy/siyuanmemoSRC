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
        {{ labels.emptyState }}
      </div>

      <ul v-else class="neural-list__items">
        <li
          v-for="entry in filteredEntries"
          :key="`${entry.nodeId}-${entry.addedAt}`"
          class="neural-list__item"
          :class="{
            'neural-list__item--active': entry.isCurrent,
            'neural-list__item--selected': entry.nodeId === props.selectedNodeId,
          }"
        >
          <button
            type="button"
            class="neural-list__item-main"
            @click="$emit('preview', entry.nodeId)"
            @dblclick="handlePromote(entry.nodeId, entry.isCurrent)"
            @keydown.enter.prevent="handlePromote(entry.nodeId, entry.isCurrent)"
          >
            <span class="neural-list__title">
              {{ entry.nodePreview || entry.nodeId }}
              <span v-if="entry.isCurrent" class="neural-list__tag neural-list__tag--current">
                {{ t('currentNodeTag', 'Current') }}
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
              :disabled="entry.isCurrent"
              @click="handlePromote(entry.nodeId, entry.isCurrent)"
            >
              {{ entry.isCurrent ? labels.currentAction : labels.primaryAction }}
            </button>
            <button
              type="button"
              class="neural-list__action b3-button b3-button--outline"
              @click="$emit('toggle-source', entry.nodeId, false)"
            >
              {{ labels.removeItem }}
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
import { getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import type { NeuralSourceListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  entries: NeuralSourceListEntry[];
  selectedNodeId?: string | null;
  engineMode: NeuralEngineMode;
}>();

const emit = defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'set-current-focus', nodeId: string): void;
  (e: 'toggle-source', nodeId: string, enabled: boolean): void;
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

function handlePromote(nodeId: string, isCurrent?: boolean): void {
  if (isCurrent) {
    return;
  }
  emit('set-current-focus', nodeId);
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

const labels = computed(() => getNeuralSourceLabelSet(props.engineMode, t));
const sectionTitle = computed(() => labels.value.sectionTitle);
const modeHint = computed(() => labels.value.modeHint);
</script>
