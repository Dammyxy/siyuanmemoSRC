<template>
  <section class="semantic-activation-surface" aria-label="Semantic Activation">
    <header class="semantic-activation-surface__header">
      <div>
        <div class="semantic-activation-surface__eyebrow">{{ t('semanticActivation', 'Semantic Activation') }}</div>
        <h2 class="semantic-activation-surface__title">{{ model.currentNode.title }}</h2>
      </div>
      <div class="semantic-activation-surface__node-type">{{ nodeTypeLabel(model.currentNode.nodeType) }}</div>
    </header>

    <div class="semantic-activation-surface__current">
      <p class="semantic-activation-surface__preview">{{ model.currentNode.preview }}</p>
      <div v-if="model.currentNode.breadcrumb.length" class="semantic-activation-surface__breadcrumb">
        {{ model.currentNode.breadcrumb.join(' / ') }}
      </div>
      <div class="semantic-activation-surface__actions">
        <button type="button" class="b3-button b3-button--text" @click="emit('follow', model.currentNode.nodeId, activeLens)">
          {{ t('semanticFollow', 'Follow') }}
        </button>
        <button
          v-if="model.currentNode.isImplicitKnowledge"
          type="button"
          class="b3-button b3-button--outline"
          @click="emit('implicit-action', model.currentNode.nodeId, 'expand', activeLens)"
        >
          {{ t('semanticExpandImplicit', 'Expand') }}
        </button>
        <button type="button" class="b3-button b3-button--outline" @click="emit('create-station', 'node')">
          {{ t('semanticNodeStation', 'Node Station') }}
        </button>
        <button type="button" class="b3-button b3-button--outline" @click="emit('create-station', 'path')">
          {{ t('semanticPathStation', 'Path Station') }}
        </button>
        <button
          v-if="model.currentNode.isImplicitKnowledge"
          type="button"
          class="b3-button b3-button--cancel"
          @click="emit('implicit-action', model.currentNode.nodeId, 'mark-irrelevant', activeLens)"
        >
          {{ t('semanticMarkIrrelevant', 'Mark Irrelevant') }}
        </button>
      </div>
      <p v-if="model.currentNode.isImplicitKnowledge" class="semantic-activation-surface__guard">
        {{ t('semanticImplicitReadOnlyGuard', 'Implicit knowledge is read-only here: no reveal, grading, scheduling, or automatic card creation.') }}
      </p>
    </div>

    <div class="semantic-activation-surface__columns">
      <section
        v-for="lens in lenses"
        :key="lens"
        class="semantic-activation-surface__column"
        :class="{ 'semantic-activation-surface__column--active': lens === activeLens }"
      >
        <header class="semantic-activation-surface__column-header">
          <h3>{{ lensLabel(lens) }}</h3>
          <span>{{ model.candidates[lens]?.length ?? 0 }}</span>
        </header>
        <button
          v-for="candidate in model.candidates[lens] ?? []"
          :key="`${lens}:${candidate.candidateId}`"
          type="button"
          class="semantic-activation-surface__candidate"
          @click="emit('follow', candidate.node.nodeId, lens)"
        >
          <span class="semantic-activation-surface__candidate-type">{{ nodeTypeLabel(candidate.node.nodeType) }}</span>
          <span class="semantic-activation-surface__candidate-title">{{ candidate.node.title }}</span>
          <span class="semantic-activation-surface__reason-row">
            <span
              v-for="reason in candidate.reasons.slice(0, 3)"
              :key="`${candidate.candidateId}:${reason.code}`"
              class="semantic-activation-surface__reason"
            >
              {{ reasonLabel(reason.code) }}
            </span>
          </span>
          <details v-if="candidate.explanation" class="semantic-activation-surface__explanation" @click.stop>
            <summary>{{ t('semanticExplanation', 'Explanation') }}</summary>
            <pre>{{ formatExplanation(candidate.explanation) }}</pre>
          </details>
        </button>
        <div v-if="(model.candidates[lens]?.length ?? 0) === 0" class="semantic-activation-surface__empty">
          {{ t('semanticNoCandidates', 'No candidates') }}
        </div>
      </section>
    </div>

    <section class="semantic-activation-surface__ai">
      <button type="button" class="b3-button b3-button--text" @click="emit('analyze-path')">
        {{ t('semanticAnalyzeCurrentPath', 'Analyze Current Path') }}
      </button>
      <div v-if="aiRelations.length" class="semantic-activation-surface__ai-list">
        <article v-for="relation in aiRelations" :key="relation.relationId" class="semantic-activation-surface__ai-relation">
          <span>{{ relation.fromNodeId }} -> {{ relation.toNodeId }}</span>
          <small>{{ relation.reason }}</small>
          <button type="button" class="b3-button b3-button--text" @click="emit('relation-decision', relation.relationId, 'accepted')">
            {{ t('semanticAcceptRelation', 'Accept') }}
          </button>
          <button type="button" class="b3-button b3-button--outline" @click="emit('relation-decision', relation.relationId, 'rejected')">
            {{ t('semanticRejectRelation', 'Reject') }}
          </button>
          <button type="button" class="b3-button b3-button--cancel" @click="emit('relation-decision', relation.relationId, 'ignored')">
            {{ t('semanticIgnoreRelation', 'Ignore') }}
          </button>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  SemanticAiRelationCandidate,
  SemanticSurfaceModel,
} from '@/core/semantic/SemanticActivationPresentation';
import type {
  SemanticLens,
  SemanticNodeType,
  SemanticReasonCode,
  SemanticStationType,
} from '@/core/semantic/semanticActivationTypes';

const props = defineProps<{
  model: SemanticSurfaceModel;
  i18n?: Record<string, string>;
  aiRelations?: SemanticAiRelationCandidate[];
}>();

const emit = defineEmits<{
  (e: 'follow', nodeId: string, lens: SemanticLens): void;
  (e: 'implicit-action', nodeId: string, action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant', lens: SemanticLens): void;
  (e: 'create-station', stationType: SemanticStationType): void;
  (e: 'analyze-path'): void;
  (e: 'relation-decision', relationId: string, decision: 'accepted' | 'rejected' | 'ignored'): void;
}>();

const lenses: SemanticLens[] = ['assimilation', 'accommodation', 'free'];
const activeLens = computed(() => props.model.session.activeLens);
const aiRelations = computed(() => props.aiRelations ?? []);

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
  const map: Record<SemanticReasonCode, string> = {
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
  return map[reason];
}

function formatExplanation(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}
</script>

<style scoped>
.semantic-activation-surface {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  color: var(--b3-theme-on-background);
}

.semantic-activation-surface__header,
.semantic-activation-surface__current,
.semantic-activation-surface__column,
.semantic-activation-surface__ai {
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.semantic-activation-surface__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}

.semantic-activation-surface__eyebrow,
.semantic-activation-surface__node-type,
.semantic-activation-surface__candidate-type,
.semantic-activation-surface__reason,
.semantic-activation-surface__guard {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.semantic-activation-surface__title {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.semantic-activation-surface__current,
.semantic-activation-surface__ai {
  padding: 10px 12px;
}

.semantic-activation-surface__preview {
  margin: 0 0 8px;
  line-height: 1.5;
}

.semantic-activation-surface__breadcrumb {
  margin-bottom: 8px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.semantic-activation-surface__actions,
.semantic-activation-surface__ai-relation {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.semantic-activation-surface__columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.semantic-activation-surface__column {
  min-width: 0;
  padding: 8px;
}

.semantic-activation-surface__column--active {
  border-color: var(--b3-theme-primary);
}

.semantic-activation-surface__column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.semantic-activation-surface__column-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.semantic-activation-surface__candidate {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
  padding: 8px;
  text-align: left;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.semantic-activation-surface__candidate-title {
  font-weight: 600;
}

.semantic-activation-surface__reason-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.semantic-activation-surface__reason {
  padding: 1px 5px;
  border: 1px solid var(--b3-border-color);
  border-radius: 999px;
}

.semantic-activation-surface__explanation pre {
  overflow: auto;
  max-height: 120px;
  margin: 6px 0 0;
  font-size: 11px;
}

.semantic-activation-surface__empty {
  padding: 12px;
  color: var(--b3-theme-on-surface-light);
  text-align: center;
}

.semantic-activation-surface__ai-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

@media (max-width: 760px) {
  .semantic-activation-surface__columns {
    grid-template-columns: 1fr;
  }
}
</style>
