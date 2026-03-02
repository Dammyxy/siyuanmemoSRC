<template>
  <div class="neural-list neural-focus-list">
    <div class="neural-list__toolbar neural-focus-list__toolbar">
      <div class="neural-focus-list__view-switch" role="tablist" :aria-label="t('focusBlocks', 'Roam Routes')">
        <button
          type="button"
          class="b3-button b3-button--outline neural-focus-list__view-btn"
          :class="{ 'neural-focus-list__view-btn--active': routeViewMode === 'mainline' }"
          data-view="mainline"
          @click="routeViewMode = 'mainline'"
        >
          {{ t('routeViewMainline', 'Current Mainline') }}
        </button>
        <button
          type="button"
          class="b3-button b3-button--outline neural-focus-list__view-btn"
          :class="{ 'neural-focus-list__view-btn--active': routeViewMode === 'worldline' }"
          data-view="worldline"
          @click="routeViewMode = 'worldline'"
        >
          {{ t('routeViewWorldline', 'Worldline Nodes') }}
        </button>
      </div>
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
      <button
        v-if="routeViewMode === 'worldline'"
        type="button"
        class="b3-button b3-button--outline neural-list__toolbar-action"
        :disabled="focusPoolEntries.length === 0"
        data-action="clear-worldline"
        @click="$emit('clear-pool')"
      >
        {{ t('clearFocusPool', 'Clear Worldline Nodes') }}
      </button>
    </div>
    <div class="neural-focus-list__hint">
      {{
        routeViewMode === 'mainline'
          ? t('routeViewMainlineHint', 'Shows nodes on the current mainline so you can continue roaming.')
          : t('routeViewWorldlineHint', 'Save reusable branch anchors here (worldline branch nodes).')
      }}
    </div>

    <section class="neural-list__section">
      <header class="neural-list__section-header">
        <span>
          {{
            routeViewMode === 'mainline'
              ? t('sessionFocusStack', 'Current Mainline')
              : t('focusPool', 'Worldline Nodes')
          }}
        </span>
        <span class="ft__secondary">{{ visibleEntries.length }}</span>
      </header>
      <div
        v-if="routeViewMode === 'worldline'"
        class="neural-focus-list__section-note ft__secondary"
      >
        {{ t('worldlineNodeLongDesc', 'Reusable branch anchors (worldline branch nodes)') }}
      </div>
      <div v-if="visibleEntries.length === 0" class="neural-list__empty">
        {{ t('noData', 'No data') }}
      </div>
      <ul v-else class="neural-list__items">
        <li
          v-for="entry in visibleEntries"
          :key="entryKey(entry)"
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
              {{
                routeViewMode === 'mainline'
                  ? t('routeMetaMainline', 'Mainline pass')
                  : t('routeMetaWorldline', 'Node updated')
              }} · {{ formatTime(entry.visitedAt) }}
              <span
                v-if="entry.nodeId === currentNodeId"
                class="neural-list__tag neural-list__tag--current"
              >
                {{ t('currentNodeTag', 'Current') }}
              </span>
              <span v-if="entry.isVirtual" class="neural-list__tag">{{ t('virtualNode', 'Virtual') }}</span>
              <span
                v-if="routeViewMode === 'mainline' && entry.inPool"
                class="neural-list__tag"
              >
                {{ t('inWorldlineTag', 'In Worldline') }}
              </span>
            </span>
          </button>
          <div class="neural-list__actions">
            <button
              type="button"
              class="neural-list__action neural-list__action--primary b3-button"
              data-action="start-worldline"
              @click="$emit('set-current-focus', entry.nodeId)"
            >
              {{ t('setCurrentFocus', 'Start a New Worldline Here') }}
            </button>
            <button
              type="button"
              class="neural-list__action b3-button b3-button--outline"
              data-action="toggle-worldline"
              @click="$emit('toggle-pool', entry.nodeId, !entry.inPool)"
            >
              {{
                entry.inPool
                  ? t('removeFromFocusPool', 'Remove from Worldline Nodes')
                  : t('addToFocusPool', 'Add to Worldline Nodes')
              }}
            </button>
          </div>
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
  focusPoolEntries: NeuralListEntry[];
  currentNodeId?: string | null;
}>();

defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'jump', nodeId: string): void;
  (e: 'set-current-focus', nodeId: string): void;
  (e: 'toggle-pool', nodeId: string, enabled: boolean): void;
  (e: 'clear-pool'): void;
}>();

const search = ref('');
const routeViewMode = ref<'mainline' | 'worldline'>('mainline');

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
const filteredFocusPoolEntries = computed(() => props.focusPoolEntries.filter(matchesQuery));
const visibleEntries = computed(() =>
  routeViewMode.value === 'mainline'
    ? filteredSessionEntries.value
    : filteredFocusPoolEntries.value
);

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function entryKey(entry: NeuralListEntry): string {
  return routeViewMode.value === 'mainline'
    ? `mainline-${entry.nodeId}-${entry.visitedAt}`
    : `worldline-${entry.nodeId}`;
}
</script>
