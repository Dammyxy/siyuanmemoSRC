<template>
  <div class="neural-list neural-focus-list">
    <div class="neural-list__toolbar">
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
    </div>

    <section class="neural-list__section">
      <header class="neural-list__section-header">
        <span>{{ t('sessionFocusStack', 'Session Focus Stack') }}</span>
        <span class="ft__secondary">{{ filteredSessionEntries.length }}</span>
      </header>
      <div v-if="filteredSessionEntries.length === 0" class="neural-list__empty">
        {{ t('noData', 'No data') }}
      </div>
      <ul v-else class="neural-list__items">
        <li
          v-for="entry in filteredSessionEntries"
          :key="`session-${entry.nodeId}-${entry.visitedAt}`"
          class="neural-list__item"
          :class="{ 'neural-list__item--active': entry.nodeId === currentNodeId }"
        >
          <button
            type="button"
            class="neural-list__item-main"
            @click="$emit('preview', entry.nodeId)"
            @dblclick="$emit('jump', entry.nodeId)"
            @keydown.enter.prevent="$emit('jump', entry.nodeId)"
          >
            <span class="neural-list__title">{{ entry.nodePreview || entry.nodeId }}</span>
            <span class="neural-list__meta">
              {{ entry.associationType }} · {{ formatTime(entry.visitedAt) }}
              <span v-if="entry.isVirtual" class="neural-list__tag">{{ t('virtualNode', 'Virtual') }}</span>
            </span>
          </button>
          <button
            v-if="!entry.isVirtual"
            type="button"
            class="neural-list__pin b3-button b3-button--outline"
            @click="$emit('toggle-pin', entry.nodeId, !entry.pinned)"
          >
            {{ entry.pinned ? t('unpinFocus', 'Unpin') : t('pinFocus', 'Pin') }}
          </button>
        </li>
      </ul>
    </section>

    <section class="neural-list__section">
      <header class="neural-list__section-header">
        <span>{{ t('pinnedFocusPool', 'Pinned Focus Pool') }}</span>
        <span class="ft__secondary">{{ filteredPinnedEntries.length }}</span>
      </header>
      <div v-if="filteredPinnedEntries.length === 0" class="neural-list__empty">
        {{ t('noData', 'No data') }}
      </div>
      <ul v-else class="neural-list__items">
        <li
          v-for="entry in filteredPinnedEntries"
          :key="`pinned-${entry.nodeId}`"
          class="neural-list__item"
          :class="{ 'neural-list__item--active': entry.nodeId === currentNodeId }"
        >
          <button
            type="button"
            class="neural-list__item-main"
            @click="$emit('preview', entry.nodeId)"
            @dblclick="$emit('jump', entry.nodeId)"
            @keydown.enter.prevent="$emit('jump', entry.nodeId)"
          >
            <span class="neural-list__title">{{ entry.nodePreview || entry.nodeId }}</span>
            <span class="neural-list__meta">{{ formatTime(entry.visitedAt) }}</span>
          </button>
          <button
            type="button"
            class="neural-list__pin b3-button b3-button--outline"
            @click="$emit('toggle-pin', entry.nodeId, false)"
          >
            {{ t('unpinFocus', 'Unpin') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NeuralListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  sessionEntries: NeuralListEntry[];
  pinnedEntries: NeuralListEntry[];
  currentNodeId?: string | null;
}>();

defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'jump', nodeId: string): void;
  (e: 'toggle-pin', nodeId: string, pinned: boolean): void;
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

const filteredSessionEntries = computed(() => props.sessionEntries.filter(matchesQuery));
const filteredPinnedEntries = computed(() => props.pinnedEntries.filter(matchesQuery));

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}
</script>
