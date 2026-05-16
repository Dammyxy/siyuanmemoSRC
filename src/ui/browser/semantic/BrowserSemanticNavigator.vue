<template>
  <section
    class="browser-semantic-navigator"
    :class="{ 'browser-semantic-navigator--pending': pending }"
    aria-label="Browser Semantic Workbench"
  >
    <header class="browser-semantic-navigator__header">
      <div class="browser-semantic-navigator__identity">
        <span class="browser-semantic-navigator__eyebrow">{{ t('browserSemanticWorkbench', 'Browser Semantic Workbench') }}</span>
        <h2>{{ model.currentNode.title }}</h2>
        <p>{{ model.currentNode.preview }}</p>
      </div>
      <div class="browser-semantic-navigator__actions">
        <button type="button" class="b3-button b3-button--outline" :disabled="pending" @click="emit('create-station', 'node')">
          {{ t('semanticNodeStation', 'Node Station') }}
        </button>
        <button type="button" class="b3-button b3-button--outline" :disabled="pending" @click="emit('create-station', 'path')">
          {{ t('semanticPathStation', 'Path Station') }}
        </button>
        <button type="button" class="b3-button b3-button--outline" :disabled="pending" @click="emit('open-review')">
          {{ t('semanticOpenInReview', 'Open in Review') }}
        </button>
        <button type="button" class="b3-button b3-button--cancel" :disabled="pending" @click="emit('end-session')">
          {{ t('semanticEndSession', 'End Session') }}
        </button>
      </div>
    </header>

    <div class="browser-semantic-navigator__meta">
      <span>{{ t('semanticRoot', 'Root') }}: {{ model.rootNode.title }}</span>
      <span>{{ t('semanticCurrent', 'Current') }}: {{ model.currentNode.title }}</span>
      <span>{{ t('semanticLens', 'Lens') }}: {{ lensLabel(model.session.activeLens) }}</span>
    </div>

    <div v-if="unavailable" class="browser-semantic-navigator__unavailable" role="alert">
      <strong>{{ unavailable.reason }}</strong>
      <span>{{ unavailable.message }}</span>
    </div>

    <div class="browser-semantic-navigator__grid">
      <aside class="browser-semantic-navigator__rail">
        <section>
          <h3>{{ t('semanticPath', 'Path') }}</h3>
          <ol class="browser-semantic-navigator__path">
            <li
              v-for="entry in model.path"
              :key="entry.eventId"
              :class="{ 'browser-semantic-navigator__path-item--current': entry.nodeId === model.session.currentNodeId }"
            >
              <span>{{ titleForPathNode(entry.nodeId) }}</span>
              <small>{{ lensLabel(entry.lens) }}</small>
            </li>
          </ol>
        </section>

        <section>
          <h3>{{ t('semanticStations', 'Stations') }}</h3>
          <div v-if="stationSummaries.length === 0" class="browser-semantic-navigator__empty">
            {{ t('semanticNoStations', 'No stations') }}
          </div>
          <article
            v-for="summary in stationSummaries"
            :key="summary.station.stationId"
            class="browser-semantic-navigator__station"
            :class="{
              'browser-semantic-navigator__station--current': summary.isCurrentNode || summary.isCurrentPath,
            }"
          >
            <button
              type="button"
              class="browser-semantic-navigator__station-open"
              :disabled="pending"
              @click="openStation(summary)"
            >
              <span>{{ summary.title }}</span>
              <small>{{ summary.station.type === 'path' ? t('semanticPathStation', 'Path Station') : t('semanticNodeStation', 'Node Station') }}</small>
            </button>
            <button
              type="button"
              class="b3-button b3-button--text browser-semantic-navigator__station-archive"
              :disabled="pending"
              @click="emit('archive-station', summary.station.stationId)"
            >
              {{ t('semanticArchiveStation', 'Archive') }}
            </button>
          </article>
        </section>
      </aside>

      <main class="browser-semantic-navigator__candidates">
        <div
          v-for="lens in lenses"
          :key="lens"
          class="browser-semantic-navigator__lens"
          :class="{ 'browser-semantic-navigator__lens--active': lens === model.session.activeLens }"
        >
          <header>
            <h3>{{ lensLabel(lens) }}</h3>
            <span>{{ model.candidates[lens]?.length ?? 0 }}</span>
          </header>
          <button
            v-for="candidate in model.candidates[lens] ?? []"
            :key="candidate.candidateId"
            type="button"
            class="browser-semantic-navigator__candidate"
            :disabled="pending"
            @click="emit('follow', candidate.candidateId, lens)"
          >
            <span class="browser-semantic-navigator__candidate-title">{{ candidate.node.title }}</span>
            <span class="browser-semantic-navigator__candidate-preview">{{ candidate.node.preview }}</span>
            <span class="browser-semantic-navigator__candidate-reasons">
              <span v-for="reason in candidate.reasons.slice(0, 3)" :key="reason.code">
                {{ reasonLabel(reason.code) }}
              </span>
            </span>
          </button>
          <div v-if="(model.candidates[lens]?.length ?? 0) === 0" class="browser-semantic-navigator__empty">
            {{ model.emptyReason || t('semanticNoCandidates', 'No candidates') }}
          </div>
        </div>
      </main>

      <aside class="browser-semantic-navigator__preview">
        <h3>{{ t('semanticPreviewEvidence', 'Preview / Evidence') }}</h3>
        <dl>
          <div>
            <dt>{{ t('semanticNodeType', 'Type') }}</dt>
            <dd>{{ nodeTypeLabel(model.currentNode.nodeType) }}</dd>
          </div>
          <div>
            <dt>{{ t('semanticBreadcrumb', 'Breadcrumb') }}</dt>
            <dd>{{ model.currentNode.breadcrumb.join(' / ') || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('semanticActivationReason', 'Activation') }}</dt>
            <dd>{{ activationReason }}</dd>
          </div>
        </dl>
        <p v-if="model.currentNode.isImplicitKnowledge" class="browser-semantic-navigator__guard">
          {{ t('semanticImplicitReadOnlyGuard', 'Implicit knowledge is read-only here: no reveal, grading, scheduling, or automatic card creation.') }}
        </p>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SemanticLens, SemanticNodeType, SemanticReasonCode, SemanticStationType } from '@/core/semantic/semanticActivationTypes';
import type { BrowserSemanticReadModel, BrowserSemanticStationSummary, BrowserSemanticUnavailable } from './types';

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

const lenses: SemanticLens[] = ['assimilation', 'accommodation', 'free'];
const stationSummaries = computed(() => [...props.model.nodeStations, ...props.model.pathStations]);
const pathTitleByNodeId = computed(() => {
  const titles = new Map<string, string>();
  titles.set(props.model.rootNode.nodeId, props.model.rootNode.title);
  titles.set(props.model.currentNode.nodeId, props.model.currentNode.title);
  for (const summary of stationSummaries.value) {
    if (summary.station.nodeId) {
      titles.set(summary.station.nodeId, summary.title);
    }
  }
  return titles;
});
const activationReason = computed(() => {
  const lastEntry = props.model.path[props.model.path.length - 1];
  return lastEntry ? lensLabel(lastEntry.lens) : lensLabel(props.model.session.activeLens);
});

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

function reasonLabel(reason: SemanticReasonCode): string {
  const labels: Record<SemanticReasonCode, string> = {
    'current-node-relation': t('semanticReasonCurrentNode', 'Current'),
    'root-focus-relation': t('semanticReasonRootFocus', 'Root'),
    'memory-projection': t('semanticReasonMemory', 'Memory'),
    'station-boost': t('semanticReasonStation', 'Station'),
    'accepted-ai-relation': t('semanticReasonAiRelation', 'AI Relation'),
    'old-mode-manual-boost': t('semanticReasonOldModeBoost', 'Old Mode Boost'),
    'structural-relation': t('semanticReasonStructure', 'Structure'),
    novelty: t('semanticReasonNovelty', 'Novelty'),
    tension: t('semanticReasonTension', 'Tension'),
    'free-association': t('semanticReasonFreeAssociation', 'Free'),
  };
  return labels[reason];
}

function titleForPathNode(nodeId: string): string {
  return pathTitleByNodeId.value.get(nodeId) || nodeId;
}

function openStation(summary: BrowserSemanticStationSummary): void {
  if (summary.station.type === 'path') {
    emit('restore-path-station', summary.station.stationId);
    return;
  }
  const nodeId = String(summary.station.nodeId || '').trim();
  if (nodeId) {
    emit('open-node-station', nodeId);
  }
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
