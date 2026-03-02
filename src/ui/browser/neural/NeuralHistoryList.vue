<template>
  <div class="neural-list neural-history-list">
    <div class="neural-list__toolbar neural-history-list__toolbar">
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
      <button
        type="button"
        class="b3-button b3-button--outline neural-list__toolbar-action"
        :disabled="!canClearHistory"
        @click="$emit('clear-history')"
      >
        {{ t('clearHistory', 'Clear History') }}
      </button>
    </div>
    <div class="neural-history-list__hint">
      {{ t('historyTimelineHint', 'Timeline from latest to earliest. Click to preview, double-click to jump.') }}
    </div>

    <div v-if="filteredEntries.length === 0" class="neural-list__empty">
      {{ t('noHistory', 'No history') }}
    </div>
    <div v-else class="neural-history-list__timeline-wrap">
      <div class="neural-history-list__direction" aria-hidden="true">
        <span class="neural-history-list__direction-arrow"></span>
      </div>
      <ol class="neural-history-list__timeline">
        <li
          v-for="entry in filteredEntries"
          :key="`${entry.sessionId}-${entry.nodeId}-${entry.visitedAt}`"
          class="neural-history-list__timeline-item"
          :class="{
            'neural-history-list__timeline-item--current': entry.isCurrent,
            'neural-history-list__timeline-item--anchored': entry.isAnchored,
          }"
        >
          <span class="neural-history-list__timeline-line" aria-hidden="true"></span>
          <span class="neural-history-list__timeline-dot" aria-hidden="true"></span>
          <div class="neural-list__item">
            <button
              type="button"
              class="neural-list__item-main"
              @click="$emit('preview', entry.nodeId)"
              @dblclick="$emit('jump', entry.nodeId)"
              @keydown.enter.prevent="$emit('jump', entry.nodeId)"
            >
              <span class="neural-list__title">
                {{ entry.nodePreview || entry.nodeId }}
                <span v-if="entry.isCurrent" class="neural-list__tag neural-list__tag--current">
                  {{ t('currentNodeTag', 'Current') }}
                </span>
                <span v-if="entry.isAnchored" class="neural-list__tag neural-list__tag--anchored">
                  {{ t('anchoredTag', 'Anchored') }}
                </span>
                <span v-if="entry.isVirtual" class="neural-list__tag">{{ t('virtualNode', 'Virtual') }}</span>
              </span>
              <span class="neural-list__meta">{{ formatMeta(entry) }}</span>
            </button>
            <div class="neural-list__actions neural-list__actions--compact">
              <button
                type="button"
                class="b3-button b3-button--outline neural-list__action neural-list__action--icon neural-list__action--primary"
                :title="t('startNewWorldline', 'Start New Worldline')"
                :aria-label="t('startNewWorldline', 'Start New Worldline')"
                @click.stop="$emit('set-current-focus', entry.nodeId)"
              >
                ⎇
              </button>
              <button
                type="button"
                class="b3-button b3-button--outline neural-list__action neural-list__action--icon"
                :title="entry.isAnchored ? t('unanchorNode', 'Unstar') : t('anchorNode', 'Star')"
                :aria-label="entry.isAnchored ? t('unanchorNode', 'Unstar') : t('anchorNode', 'Star')"
                @click.stop="$emit('toggle-anchor', entry.nodeId, !entry.isAnchored)"
              >
                {{ entry.isAnchored ? '★' : '☆' }}
              </button>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NeuralListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  entries: NeuralListEntry[];
  currentNodeId?: string | null;
}>();

defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'jump', nodeId: string): void;
  (e: 'clear-history'): void;
  (e: 'set-current-focus', nodeId: string): void;
  (e: 'toggle-anchor', nodeId: string, enabled: boolean): void;
}>();

const search = ref('');

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function normalize(text: string): string {
  return String(text || '').toLowerCase();
}

function matchesQuery(entry: NeuralListEntry): boolean {
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

const canClearHistory = computed(() => filteredEntries.value.length > 0);

function formatMeta(entry: NeuralListEntry): string {
  const base = entry.associationType === 'path' || entry.associationType === 'focus'
    ? t('routeMetaMainline', 'Mainline pass')
    : t('routeMetaWorldline', 'Node updated');
  const timestamp = formatTime(entry.visitedAt);
  return timestamp === '-' ? base : `${base} · ${timestamp}`;
}

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}
</script>

