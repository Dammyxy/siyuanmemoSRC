<template>
  <div class="neural-list neural-anchor-list">
    <div class="neural-list__toolbar neural-anchor-list__toolbar">
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
    </div>
    <div class="neural-anchor-list__hint">
      {{ t('worldlineNodeLongDesc', 'Reusable stations') }}
    </div>

    <div v-if="filteredEntries.length === 0" class="neural-list__empty">
      {{ t('noWorldlineAnchors', 'No stations') }}
    </div>

    <div v-else class="neural-anchor-list__items">
      <div
        v-for="entry in filteredEntries"
        :key="`${entry.nodeId}-${entry.addedAt}`"
        class="neural-list__item neural-anchor-list__item"
        :class="{ 'neural-anchor-list__item--current': entry.isCurrent }"
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
            <span v-if="entry.isVirtual" class="neural-list__tag">{{ t('virtualNode', 'Virtual') }}</span>
          </span>
          <span class="neural-list__meta">{{ formatMeta(entry) }}</span>
        </button>

        <div class="neural-list__actions neural-list__actions--compact">
          <button
            type="button"
            class="b3-button b3-button--outline neural-list__action neural-list__action--icon neural-list__action--primary"
            :disabled="entry.isCurrent"
            :title="entry.isCurrent ? labels.currentAction : labels.primaryAction"
            :aria-label="entry.isCurrent ? labels.currentAction : labels.primaryAction"
            @click.stop="handlePromote(entry.nodeId, entry.isCurrent)"
          >
            &#x2387;
          </button>
          <button
            type="button"
            class="b3-button b3-button--outline neural-list__action neural-list__action--icon"
            :disabled="!entry.inHistory"
            :title="entry.inHistory ? t('jumpAnchorInPath', 'Jump in current path') : t('anchorNotInPath', 'Station is not in the current path')"
            :aria-label="entry.inHistory ? t('jumpAnchorInPath', 'Jump in current path') : t('anchorNotInPath', 'Station is not in the current path')"
            @click.stop="$emit('jump-anchor', entry.nodeId)"
          >
            &#x21AA;
          </button>
          <button
            type="button"
            class="b3-button b3-button--outline neural-list__action neural-list__action--icon"
            :title="t('removeAnchor', 'Remove Station')"
            :aria-label="t('removeAnchor', 'Remove Station')"
            @click.stop="$emit('toggle-anchor', entry.nodeId, false)"
          >
            &#x2715;
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import type { NeuralAnchorListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  entries: NeuralAnchorListEntry[];
  currentNodeId?: string | null;
  engineMode?: 'orbit' | 'hyperspace';
}>();

const emit = defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'set-current-focus', nodeId: string): void;
  (e: 'jump-anchor', nodeId: string): void;
  (e: 'toggle-anchor', nodeId: string, enabled: boolean): void;
}>();

const search = ref('');

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function normalize(text: string): string {
  return String(text || '').toLowerCase();
}

function matchesQuery(entry: NeuralAnchorListEntry): boolean {
  const query = normalize(search.value).trim();
  if (!query) {
    return true;
  }
  return normalize(entry.nodePreview).includes(query) || normalize(entry.nodeId).includes(query);
}

const filteredEntries = computed(() =>
  [...props.entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .filter(matchesQuery)
    .map((entry) => ({
      ...entry,
      isCurrent: entry.isCurrent ?? (props.currentNodeId ? entry.nodeId === props.currentNodeId : false),
    }))
);

const labels = computed(() => getNeuralSourceLabelSet(props.engineMode || 'orbit', t));

function formatMeta(entry: NeuralAnchorListEntry): string {
  const base = entry.inHistory
    ? t('routeMetaMainline', 'Current Path')
    : t('routeMetaWorldline', 'Station');
  const timestamp = formatTime(entry.visitedAt);
  return timestamp === '-' ? base : `${base} | ${timestamp}`;
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
</script>
