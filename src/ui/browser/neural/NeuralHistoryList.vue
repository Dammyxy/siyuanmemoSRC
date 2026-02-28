<template>
  <div class="neural-list neural-history-list">
    <div class="neural-list__toolbar neural-history-list__toolbar">
      <div class="neural-history-list__scope">
        <button
          type="button"
          class="b3-button b3-button--outline"
          :class="{ 'neural-history-list__scope-btn--active': scope === 'current' }"
          @click="$emit('update:scope', 'current')"
        >
          {{ t('currentSession', 'Current Session') }}
        </button>
        <button
          type="button"
          class="b3-button b3-button--outline"
          :class="{ 'neural-history-list__scope-btn--active': scope === 'all' }"
          @click="$emit('update:scope', 'all')"
        >
          {{ t('allHistory', 'All History') }}
        </button>
      </div>
      <input
        v-model="search"
        class="b3-text-field"
        :placeholder="t('searchPlaceholderAdvanced', 'Search...')"
      >
    </div>

    <div v-if="scope === 'current'" class="neural-history-list__flat">
      <div v-if="currentEntries.length === 0" class="neural-list__empty">
        {{ t('noHistory', 'No history') }}
      </div>
      <ul v-else class="neural-list__items">
        <li
          v-for="entry in currentEntries"
          :key="`current-${entry.nodeId}-${entry.visitedAt}`"
          class="neural-list__item"
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
        </li>
      </ul>
    </div>

    <div v-else class="neural-history-list__groups">
      <div v-if="groupedEntries.length === 0" class="neural-list__empty">
        {{ t('noHistory', 'No history') }}
      </div>
      <section
        v-for="group in groupedEntries"
        :key="group.sessionId"
        class="neural-list__section"
      >
        <header class="neural-list__section-header neural-history-list__session-header">
          <button
            type="button"
            class="neural-history-list__collapse b3-button b3-button--outline"
            @click="toggleSession(group.sessionId)"
          >
            {{ isCollapsed(group.sessionId) ? '+' : '-' }}
          </button>
          <span>{{ t('sessionId', 'Session') }} {{ shortenSessionId(group.sessionId) }}</span>
          <span class="ft__secondary">{{ group.entries.length }}</span>
        </header>
        <ul v-if="!isCollapsed(group.sessionId)" class="neural-list__items">
          <li
            v-for="entry in group.entries"
            :key="`${group.sessionId}-${entry.nodeId}-${entry.visitedAt}`"
            class="neural-list__item"
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
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HistoryScope, NeuralListEntry } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  entries: NeuralListEntry[];
  currentSessionId?: string | null;
  scope: HistoryScope;
}>();

defineEmits<{
  (e: 'update:scope', value: HistoryScope): void;
  (e: 'preview', nodeId: string): void;
  (e: 'jump', nodeId: string): void;
}>();

const search = ref('');
const collapsedSessionIds = ref<Set<string>>(new Set());

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
);

const currentEntries = computed(() => {
  if (!props.currentSessionId) {
    return [];
  }
  return filteredEntries.value.filter((entry) => entry.sessionId === props.currentSessionId);
});

const groupedEntries = computed(() => {
  const map = new Map<string, NeuralListEntry[]>();
  for (const entry of filteredEntries.value) {
    if (!map.has(entry.sessionId)) {
      map.set(entry.sessionId, []);
    }
    map.get(entry.sessionId)!.push(entry);
  }

  return Array.from(map.entries())
    .map(([sessionId, entries]) => ({
      sessionId,
      entries,
      latestVisitedAt: entries[0]?.visitedAt || 0,
    }))
    .sort((a, b) => b.latestVisitedAt - a.latestVisitedAt);
});

function toggleSession(sessionId: string): void {
  const next = new Set(collapsedSessionIds.value);
  if (next.has(sessionId)) {
    next.delete(sessionId);
  } else {
    next.add(sessionId);
  }
  collapsedSessionIds.value = next;
}

function isCollapsed(sessionId: string): boolean {
  return collapsedSessionIds.value.has(sessionId);
}

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function shortenSessionId(sessionId: string): string {
  if (sessionId.length <= 12) {
    return sessionId;
  }
  return `${sessionId.slice(0, 12)}...`;
}
</script>
