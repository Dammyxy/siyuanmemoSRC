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
        {{ t('clearHistory', 'Clear Path History') }}
      </button>
    </div>
    <div class="neural-history-list__hint">
      {{ t('historyTimelineHint', 'Timeline from latest to earliest. Click to preview, double-click to jump.') }}
    </div>

    <div class="neural-history-list__content">
      <div v-if="filteredEntries.length === 0" class="neural-list__empty">
        {{ t('noHistory', 'No path history') }}
      </div>
      <div v-else class="neural-history-list__timeline-wrap">
        <div class="neural-history-list__direction" aria-hidden="true">
          <span class="neural-history-list__direction-arrow"></span>
        </div>
        <ol class="neural-history-list__timeline">
          <li
            v-for="entry in filteredEntries"
            :key="entry.eventId"
            class="neural-history-list__timeline-item"
            :class="{
              'neural-history-list__timeline-item--current': entry.isCurrent,
              'neural-history-list__timeline-item--anchored': entry.isAnchored,
              'neural-history-list__timeline-item--selected': entry.isSelected,
            }"
          >
            <span class="neural-history-list__timeline-line" aria-hidden="true"></span>
            <span class="neural-history-list__timeline-dot" aria-hidden="true"></span>
            <div class="neural-list__item">
              <button
                type="button"
                class="neural-list__item-main"
                @click="handleSelect(entry)"
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
                  :title="focusActionLabel"
                  :aria-label="focusActionLabel"
                  @click.stop="$emit('set-current-focus', entry.nodeId)"
                >
                  &#x2387;
                </button>
                <button
                  type="button"
                  class="b3-button b3-button--outline neural-list__action neural-list__action--icon"
                  :title="entry.isAnchored ? t('removeAnchor', 'Remove Anchor') : t('addAnchor', 'Add Anchor')"
                  :aria-label="entry.isAnchored ? t('removeAnchor', 'Remove Anchor') : t('addAnchor', 'Add Anchor')"
                  @click.stop="$emit('toggle-anchor', entry.nodeId, !entry.isAnchored)"
                >
                  {{ entry.isAnchored ? '\u2605' : '\u2606' }}
                </button>
              </div>
            </div>
          </li>
        </ol>
      </div>
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
  selectedEventId?: string | null;
  engineMode?: 'orbit' | 'hyperspace';
}>();

const emit = defineEmits<{
  (e: 'select', entry: NeuralListEntry): void;
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
      isSelected: entry.isSelected ?? (props.selectedEventId ? entry.eventId === props.selectedEventId : false),
    }))
);

const canClearHistory = computed(() => filteredEntries.value.length > 0);
const focusActionLabel = computed(() =>
  props.engineMode === 'hyperspace'
    ? t('setPrimaryActivationSource', 'Set as Primary Activation Source')
    : t('setCurrentFocus', 'Set as Orbit Center')
);

function formatMeta(entry: NeuralListEntry): string {
  const relationMap: Record<string, string> = {
    backlink: t('relationBacklink', 'Backlink'),
    'outgoing-direct': t('relationOutgoingDirect', 'Direct Outgoing Link'),
    'outgoing-indirect': t('relationOutgoingIndirect', 'Indirect Outgoing Link'),
    descriptor: t('relationDescriptor', 'Descriptor'),
    focus: t('activationKindFocusRoot', 'Orbit Center Node'),
    path: t('activationKindManualJump', 'Manual Jump'),
    source: t('activationKindSourceRoot', 'Activation Source'),
    'concept-link': t('relationConceptLink', 'Concept Link'),
    'element-link': t('relationElementLink', 'Block Link'),
    'tree-child': t('relationTreeChild', 'Tree Child'),
    'tree-sibling': t('relationTreeSibling', 'Tree Sibling'),
    'tree-parent': t('relationTreeParent', 'Tree Parent'),
  };
  const originMap: Record<string, string> = {
    backlink: t('relationOriginBacklink', 'Backlink'),
    'direct-ref': t('relationOriginDirectRef', 'Direct Reference'),
    'indirect-ref': t('relationOriginIndirectRef', 'Indirect Reference'),
    descriptor: t('relationDescriptor', 'Descriptor'),
    'block-tree': t('relationOriginBlockTree', 'Block Tree'),
    'document-tree': t('relationOriginDocumentTree', 'Document Tree'),
  };
  const activationMap: Record<string, string> = {
    'focus-root': t('activationKindFocusRoot', 'Orbit Center Node'),
    'source-root': t('activationKindSourceRoot', 'Activation Source'),
    'follow-path': t('activationKindFollowPath', 'Follow Current Path'),
    'manual-jump': t('activationKindManualJump', 'Manual Jump'),
  };
  const base = relationMap[entry.associationType] || entry.reason || t('routeMetaWorldline', 'Anchor');
  const supportsOriginDetail = entry.associationType === 'concept-link'
    || entry.associationType === 'element-link'
    || entry.associationType === 'tree-child'
    || entry.associationType === 'tree-sibling'
    || entry.associationType === 'tree-parent';
  const origin = supportsOriginDetail && entry.origin ? originMap[entry.origin] || '' : '';
  const activation = activationMap[entry.activationKind] || '';
  const timestamp = formatTime(entry.visitedAt);
  const parts = [base];
  if (origin && origin !== base) {
    parts.push(origin);
  }
  if (activation && activation !== base) {
    parts.push(activation);
  }
  if (timestamp !== '-') {
    parts.push(timestamp);
  }
  return parts.join(' | ');
}

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function handleSelect(entry: NeuralListEntry): void {
  emit('select', entry);
  emit('preview', entry.nodeId);
}
</script>
