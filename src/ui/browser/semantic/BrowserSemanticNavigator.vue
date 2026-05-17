<template>
  <section
    class="browser-semantic-navigator"
    :class="{ 'browser-semantic-navigator--pending': pending }"
    aria-label="Browser Semantic Review"
  >
    <header class="browser-semantic-navigator__header">
      <div class="browser-semantic-navigator__identity">
        <span class="browser-semantic-navigator__eyebrow">{{ t('browserSemanticReview', 'Browser Semantic Review') }}</span>
        <h2>{{ model.session.sessionId }}</h2>
        <p>{{ t('browserSemanticReviewDescription', 'Review Semantic session history without changing active exploration.') }}</p>
      </div>
      <div class="browser-semantic-navigator__actions">
        <button type="button" class="b3-button b3-button--text" :disabled="pending" @click="emit('open-review')">
          {{ t('semanticContinueExploration', 'Continue Exploration') }}
        </button>
        <button type="button" class="b3-button b3-button--cancel" :disabled="pending" @click="emit('end-session')">
          {{ t('semanticEndSession', 'End Session') }}
        </button>
      </div>
    </header>

    <div class="browser-semantic-navigator__meta">
      <span>{{ t('semanticRoot', 'Root') }}: {{ model.rootNode.title }}</span>
      <span>{{ t('semanticCurrent', 'Current') }}: {{ model.currentNode.title }}</span>
      <span>{{ t('semanticPath', 'Path') }}: {{ timelineNodes.length }}</span>
    </div>

    <div v-if="unavailable" class="browser-semantic-navigator__unavailable" role="alert">
      <strong>{{ unavailable.reason }}</strong>
      <span>{{ unavailable.message }}</span>
    </div>

    <div class="browser-semantic-navigator__grid">
      <aside class="browser-semantic-navigator__rail">
        <section>
          <h3>{{ t('semanticTimeline', 'Timeline') }}</h3>
          <ol class="browser-semantic-navigator__path">
            <li
              v-for="node in timelineNodes"
              :key="node.nodeId"
              :class="{ 'browser-semantic-navigator__path-item--current': node.nodeId === selectedNode.nodeId }"
            >
              <button type="button" class="browser-semantic-navigator__node-select" @click="selectedNodeId = node.nodeId" @dblclick="selectedNodeId = node.nodeId">
                <span>{{ node.title || t('semanticNodeUnavailable', 'Content unavailable') }}</span>
                <small>{{ node.preview }}</small>
              </button>
            </li>
          </ol>
        </section>

        <section>
          <h3>{{ t('semanticEdgeExplanations', 'Edge explanations') }}</h3>
          <div v-if="edgeExplanations.length === 0" class="browser-semantic-navigator__empty">
            {{ t('semanticNone', 'None') }}
          </div>
          <article
            v-for="edge in edgeExplanations"
            :key="`${edge.fromNodeId}:${edge.toNodeId}:${edge.createdAt}`"
            class="browser-semantic-navigator__station"
          >
            <span>{{ edge.primaryExplanation || lensLabel(edge.lens) }}</span>
            <small>{{ edge.reasonTags.join(' · ') }}</small>
          </article>
        </section>
      </aside>

      <main class="browser-semantic-navigator__candidates">
        <section class="browser-semantic-navigator__lens browser-semantic-navigator__lens--active">
          <header>
            <h3>{{ t('semanticSelectedNode', 'Selected node') }}</h3>
            <span>{{ nodeTypeLabel(selectedNode.nodeType) }}</span>
          </header>
          <div class="browser-semantic-navigator__detail">
            <h4>{{ selectedNode.title || t('semanticNodeUnavailable', 'Content unavailable') }}</h4>
            <p>{{ selectedNode.preview || t('semanticNoPreview', 'No preview') }}</p>
            <dl>
              <div>
                <dt>{{ t('semanticBreadcrumb', 'Breadcrumb') }}</dt>
                <dd>{{ selectedNode.breadcrumb.join(' / ') || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('semanticSourceAvailability', 'Availability') }}</dt>
                <dd>{{ selectedNode.blockId ? t('semanticAvailable', 'Available') : t('semanticNodeUnavailable', 'Content unavailable') }}</dd>
              </div>
              <div>
                <dt>{{ t('semanticDebugId', 'Debug ID') }}</dt>
                <dd>{{ selectedNode.nodeId }}</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <aside class="browser-semantic-navigator__preview">
        <h3>{{ t('semanticReviewSections', 'Review sections') }}</h3>
        <details>
          <summary>{{ t('semanticLater', 'Later') }} · {{ later.length }}</summary>
          <p v-if="later.length === 0" class="browser-semantic-navigator__empty">{{ t('semanticNone', 'None') }}</p>
        </details>
        <details>
          <summary>{{ t('semanticSuggestions', 'Suggestions') }} · {{ suggestions.length }}</summary>
          <p v-if="suggestions.length === 0" class="browser-semantic-navigator__empty">{{ t('semanticNone', 'None') }}</p>
          <p v-for="suggestion in suggestions" :key="suggestion.suggestionId">{{ suggestion.summary }}</p>
        </details>
        <details>
          <summary>{{ t('semanticArchivedBranches', 'Archived branches') }} · {{ archivedBranches.length }}</summary>
          <p v-if="archivedBranches.length === 0" class="browser-semantic-navigator__empty">{{ t('semanticNone', 'None') }}</p>
        </details>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SemanticLens, SemanticNodeType, SemanticStationType } from '@/core/semantic/semanticActivationTypes';
import type { BrowserSemanticReadModel, BrowserSemanticUnavailable } from './types';

const props = defineProps<{
  model: BrowserSemanticReadModel;
  i18n?: Record<string, string>;
  pending?: boolean;
  unavailable?: BrowserSemanticUnavailable | null;
}>();

const emit = defineEmits<{
  (e: 'follow', candidateId: string, lens: SemanticLens): void;
  (e: 'create-station', stationType: SemanticStationType): void;
  (e: 'archive-station', stationId: string): void;
  (e: 'open-node-station', nodeId: string): void;
  (e: 'restore-path-station', stationId: string): void;
  (e: 'open-review'): void;
  (e: 'end-session'): void;
}>();

const stationSummaries = computed(() => [...props.model.nodeStations, ...props.model.pathStations]);
void stationSummaries;
const selectedNodeId = ref(props.model.currentNode.nodeId);
const timelineNodes = computed(() => (
  props.model.timelineNodes && props.model.timelineNodes.length > 0
    ? props.model.timelineNodes
    : [props.model.rootNode, props.model.currentNode]
));
const selectedNode = computed(() => (
  timelineNodes.value.find((node) => node.nodeId === selectedNodeId.value)
  ?? props.model.currentNode
  ?? props.model.rootNode
));
const edgeExplanations = computed(() => props.model.edgeExplanations ?? []);
const later = computed(() => props.model.later ?? []);
const suggestions = computed(() => props.model.suggestions ?? []);
const archivedBranches = computed(() => props.model.archivedBranches ?? []);

watch(
  () => props.model.session.sessionId,
  () => {
    selectedNodeId.value = props.model.currentNode.nodeId;
  },
);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function lensLabel(lens: SemanticLens): string {
  if (lens === 'accommodation') {
    return t('semanticLensAccommodation', 'New Knowledge Reinterprets Old');
  }
  if (lens === 'free') {
    return t('semanticLensFree', 'Free Association');
  }
  return t('semanticLensAssimilation', 'Old Knowledge Explains New');
}

function nodeTypeLabel(nodeType: SemanticNodeType): string {
  if (nodeType === 'real-review-card') {
    return t('semanticNodeRealCard', 'Review Card');
  }
  if (nodeType === 'concept') {
    return t('semanticNodeConcept', 'Concept');
  }
  return t('semanticNodeImplicit', 'Implicit Knowledge');
}

</script>

<style scoped>
.browser-semantic-navigator {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  color: var(--b3-theme-on-background);
}

.browser-semantic-navigator__header,
.browser-semantic-navigator__meta,
.browser-semantic-navigator__unavailable,
.browser-semantic-navigator__rail,
.browser-semantic-navigator__lens,
.browser-semantic-navigator__preview {
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.browser-semantic-navigator__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px;
}

.browser-semantic-navigator__identity {
  min-width: 0;
}

.browser-semantic-navigator__eyebrow,
.browser-semantic-navigator__identity p,
.browser-semantic-navigator__path small,
.browser-semantic-navigator__station small,
.browser-semantic-navigator__candidate-preview,
.browser-semantic-navigator__empty,
.browser-semantic-navigator__guard,
.browser-semantic-navigator__preview dt {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.browser-semantic-navigator__identity h2 {
  margin: 2px 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.browser-semantic-navigator__identity p {
  margin: 0;
  line-height: 1.45;
}

.browser-semantic-navigator__actions,
.browser-semantic-navigator__meta,
.browser-semantic-navigator__candidate-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.browser-semantic-navigator__meta {
  padding: 7px 10px;
  font-size: 12px;
}

.browser-semantic-navigator__unavailable {
  display: flex;
  gap: 8px;
  align-items: center;
  border-color: var(--b3-theme-error);
  padding: 7px 10px;
  color: var(--b3-theme-error);
  font-size: 12px;
}

.browser-semantic-navigator__grid {
  display: grid;
  min-height: 360px;
  grid-template-columns: minmax(180px, 0.72fr) minmax(360px, 1.7fr) minmax(220px, 0.9fr);
  gap: 8px;
}

.browser-semantic-navigator__rail,
.browser-semantic-navigator__preview {
  min-width: 0;
  padding: 10px;
  overflow: auto;
}

.browser-semantic-navigator h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.browser-semantic-navigator__path {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.browser-semantic-navigator__path li,
.browser-semantic-navigator__station,
.browser-semantic-navigator__candidate {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  text-align: left;
}

.browser-semantic-navigator__path li {
  padding: 7px 8px;
}

.browser-semantic-navigator__path-item--current,
.browser-semantic-navigator__station--current,
.browser-semantic-navigator__lens--active {
  border-color: var(--b3-theme-primary-light);
}

.browser-semantic-navigator__station,
.browser-semantic-navigator__station-open,
.browser-semantic-navigator__candidate {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
  padding: 8px;
  cursor: pointer;
}

.browser-semantic-navigator__station {
  cursor: default;
}

.browser-semantic-navigator__station-open {
  margin: 0;
  border: 0;
  background: transparent;
  padding: 0;
}

.browser-semantic-navigator__station-archive {
  align-self: flex-start;
  padding-left: 0;
}

.browser-semantic-navigator__candidates {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.browser-semantic-navigator__lens {
  min-width: 0;
  padding: 10px;
  overflow: auto;
}

.browser-semantic-navigator__lens header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.browser-semantic-navigator__candidate-title {
  font-weight: 600;
}

.browser-semantic-navigator__candidate-reasons span {
  border: 1px solid var(--b3-border-color);
  border-radius: 999px;
  padding: 1px 6px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.browser-semantic-navigator__preview dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.browser-semantic-navigator__preview dt,
.browser-semantic-navigator__preview dd {
  margin: 0;
}

.browser-semantic-navigator__guard {
  margin: 12px 0 0;
  border-top: 1px solid var(--b3-border-color);
  padding-top: 8px;
}

.browser-semantic-navigator--pending {
  opacity: 0.72;
}

@media (max-width: 960px) {
  .browser-semantic-navigator__grid,
  .browser-semantic-navigator__candidates {
    grid-template-columns: 1fr;
  }
}
</style>
