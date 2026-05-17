<template>
  <section class="semantic-review-sidebar" :aria-label="t('semanticExploration', 'Semantic Exploration')">
    <header class="semantic-review-sidebar__header">
      <div>
        <div class="semantic-review-sidebar__eyebrow">{{ t('semanticExploration', 'Semantic Exploration') }}</div>
        <h2 class="semantic-review-sidebar__title">{{ bindingTitle }}</h2>
      </div>
      <button
        v-if="pinnedSessionId"
        type="button"
        class="b3-button b3-button--outline semantic-review-sidebar__unpin"
        @click="emit('unpin')"
      >
        {{ t('semanticUnpin', 'Unpin') }}
      </button>
    </header>

    <div v-if="loading" class="semantic-review-sidebar__state">
      {{ t('loading', 'Loading...') }}
    </div>

    <div v-else-if="unavailableMessage" class="semantic-review-sidebar__state semantic-review-sidebar__state--unavailable">
      {{ unavailableMessage }}
    </div>

    <div v-else-if="model" class="semantic-review-sidebar__body">
      <div v-if="actionError" class="semantic-review-sidebar__state semantic-review-sidebar__state--unavailable">
        {{ actionError }}
      </div>

      <div class="semantic-review-sidebar__binding" :data-binding-state="model.bindingState.type">
        {{ bindingDescription }}
      </div>

      <div v-if="model.currentNode" class="semantic-review-sidebar__node">
        <div class="semantic-review-sidebar__node-title">{{ displayNodeTitle(model.currentNode) }}</div>
        <div v-if="displayNodeSummary(model.currentNode)" class="semantic-review-sidebar__node-summary">
          {{ displayNodeSummary(model.currentNode) }}
        </div>
      </div>

      <div v-if="model.session" class="semantic-review-sidebar__session">
        <div class="semantic-review-sidebar__actions">
          <button type="button" class="b3-button b3-button--text" :disabled="!model.activePathNodes.length" @click="analyzePath">
            {{ t('semanticAnalyzePath', 'Analyze Path') }}
          </button>
          <button type="button" class="b3-button b3-button--outline" :disabled="!canUndo" @click="undoLastStep">
            {{ t('semanticUndoStep', 'Undo step') }}
          </button>
          <button type="button" class="b3-button b3-button--outline" :disabled="!activeBranch" @click="archiveActiveBranch">
            {{ t('semanticArchiveBranch', 'Archive branch') }}
          </button>
        </div>

        <section class="semantic-review-sidebar__section">
          <h3>{{ t('semanticActivePathCount', 'Active path') }}</h3>
          <ol class="semantic-review-sidebar__path">
            <li v-for="node in model.activePathNodes" :key="node.nodeId">
              <button
                type="button"
                class="semantic-review-sidebar__text-button"
                @click="handlePathNodeClick(node)"
                @dblclick="handlePathNodeDoubleClick(node)"
              >
                {{ displayNodeTitle(node) }}
              </button>
            </li>
          </ol>
        </section>

        <section class="semantic-review-sidebar__section">
          <h3>{{ t('semanticBranches', 'Branches') }}</h3>
          <div class="semantic-review-sidebar__compact-row">
            {{ t('semanticBranchCount', 'Active branches') }} · {{ model.branches.length }}
          </div>
        </section>

        <section class="semantic-review-sidebar__section">
          <h3>{{ t('semanticCandidates', 'Candidates') }}</h3>
          <div class="semantic-review-sidebar__segments" role="tablist">
            <button
              v-for="lens in lenses"
              :key="lens"
              type="button"
              class="semantic-review-sidebar__segment"
              :class="{ 'semantic-review-sidebar__segment--active': activeLens === lens }"
              @click="activeLens = lens"
            >
              {{ lensLabel(lens) }} · {{ model.candidates[lens]?.length ?? 0 }}
            </button>
          </div>
          <div class="semantic-review-sidebar__list">
            <div
              v-for="candidate in model.candidates[activeLens] ?? []"
              :key="candidate.candidateId"
              class="semantic-review-sidebar__list-item"
            >
              <button
                type="button"
                class="semantic-review-sidebar__text-button"
                @click="handleCandidateClick(candidate)"
                @dblclick="handleCandidateDoubleClick(candidate)"
              >
                {{ displayNodeTitle(candidate.node) }}
              </button>
              <button type="button" class="b3-button b3-button--text semantic-review-sidebar__inline-action" @click="createBranchFromCandidate(candidate)">
                {{ t('semanticNewPath', 'New path') }}
              </button>
            </div>
            <div v-if="(model.candidates[activeLens]?.length ?? 0) === 0" class="semantic-review-sidebar__empty">
              {{ t('semanticNoCandidates', 'No candidates') }}
            </div>
          </div>
        </section>

        <section class="semantic-review-sidebar__section">
          <h3>{{ t('semanticLater', 'Later') }}</h3>
          <div class="semantic-review-sidebar__list">
            <div v-for="entry in model.later" :key="entry.entryId" class="semantic-review-sidebar__list-item">
              {{ nodeTitleById(entry.nodeId) }}
            </div>
            <div v-if="model.later.length === 0" class="semantic-review-sidebar__empty">
              {{ t('semanticNone', 'None') }}
            </div>
          </div>
        </section>

        <section class="semantic-review-sidebar__section">
          <h3>{{ t('semanticSuggestions', 'Suggestions') }}</h3>
          <div class="semantic-review-sidebar__list">
            <div v-for="suggestion in model.suggestions" :key="suggestion.suggestionId" class="semantic-review-sidebar__list-item">
              <span>{{ suggestion.summary || t('semanticSuggestionUnavailable', 'Suggestion unavailable') }}</span>
              <button type="button" class="b3-button b3-button--text semantic-review-sidebar__inline-action" @click="ignoreSuggestion(suggestion.suggestionId)">
                {{ t('semanticSuggestionIgnore', 'Ignore') }}
              </button>
              <button type="button" class="b3-button b3-button--text semantic-review-sidebar__inline-action" :disabled="!currentCommandNodeId()" @click="bindSuggestionToCurrent(suggestion.suggestionId)">
                {{ t('semanticSuggestionBindCurrent', 'Bind current') }}
              </button>
              <button type="button" class="b3-button b3-button--text semantic-review-sidebar__inline-action" :disabled="!currentMaterializeBlockId()" @click="materializeSuggestionToCurrent(suggestion.suggestionId)">
                {{ t('semanticSuggestionMaterializeCurrent', 'Materialize current') }}
              </button>
            </div>
            <div v-if="model.suggestions.length === 0" class="semantic-review-sidebar__empty">
              {{ t('semanticNone', 'None') }}
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="model.recentEndedSession" class="semantic-review-sidebar__session">
        <div>{{ t('semanticEndedSessionReady', 'Ended session available') }}</div>
        <div class="semantic-review-sidebar__actions">
          <button type="button" class="b3-button b3-button--outline" @click="emit('view-ended-session', model.recentEndedSession.sessionId)">
            {{ t('semanticViewReview', 'View Review') }}
          </button>
          <button type="button" class="b3-button b3-button--text" @click="emit('continue-ended-session', model.recentEndedSession.sessionId)">
            {{ t('semanticContinueFromHere', 'Continue From Here') }}
          </button>
        </div>
      </div>

      <div v-else class="semantic-review-sidebar__session">
        <div>{{ t('semanticNoSessionForRoot', 'No Semantic session for this Review item yet.') }}</div>
        <button type="button" class="b3-button b3-button--text semantic-review-sidebar__start" @click="emit('start-exploration')">
          {{ t('semanticStartExploration', 'Start Exploration') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import type { SemanticActivationBrowserReadClient } from '@/application/clients/SemanticActivationBrowserReadClient';
import type {
  BackendSemanticCandidate,
  BackendSemanticCommandRequest,
  BackendSemanticLens,
  BackendSemanticNode,
  BackendSemanticSidebarBindingState,
  BackendSemanticSidebarReadModel,
} from '../../../../../packages/contracts/src/backend-rpc';
import {
  buildSemanticSuggestionSummary,
  type SemanticPathAnalysisPayload,
} from './semanticReviewAIHandoff';

const props = defineProps<{
  readClient?: Pick<SemanticActivationBrowserReadClient, 'readSidebar'> | null;
  commandClient?: Pick<SemanticActivationCommandClient, 'execute'> | null;
  currentNodeId?: string | null;
  pinnedSessionId?: string | null;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'unpin'): void;
  (e: 'start-exploration'): void;
  (e: 'view-ended-session', sessionId: string): void;
  (e: 'continue-ended-session', sessionId: string): void;
  (e: 'view-node', nodeId: string, title: string, sourceBlockId: string): void;
  (e: 'analyze-path', payload: SemanticPathAnalysisPayload): void;
}>();

const loading = ref(false);
const model = ref<BackendSemanticSidebarReadModel | null>(null);
const unavailableMessage = ref('');
const actionError = ref('');
const activeLens = ref<BackendSemanticLens>('assimilation');
let requestSeq = 0;
let commandSeq = 0;
let clickTimer: ReturnType<typeof window.setTimeout> | null = null;
const lenses: BackendSemanticLens[] = ['assimilation', 'accommodation', 'free'];

const bindingTitle = computed(() => {
  const state = model.value?.bindingState;
  if (!state && props.pinnedSessionId) {
    return t('semanticPinnedSession', 'Pinned session');
  }
  if (!state) {
    return t('semanticFollowCurrent', 'Follow current node');
  }
  if (state.type === 'pinned-session') {
    return t('semanticPinnedSession', 'Pinned session');
  }
  if (state.type === 'current-node-unavailable') {
    return t('semanticCurrentNodeUnavailable', 'Current node unavailable');
  }
  return t('semanticFollowCurrent', 'Follow current node');
});

const bindingDescription = computed(() => {
  const state = model.value?.bindingState;
  if (!state) {
    return '';
  }
  return bindingStateLabel(state);
});

const activeBranch = computed(() => model.value?.branches[0] ?? null);

const canUndo = computed(() => {
  const nodes = model.value?.activePathNodes ?? [];
  return nodes.length > 1;
});

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function bindingStateLabel(state: BackendSemanticSidebarBindingState): string {
  if (state.type === 'pinned-session') {
    return t('semanticPinnedSessionDescription', 'This sidebar stays on the pinned Semantic session.');
  }
  if (state.type === 'current-node-unavailable') {
    return t('semanticCurrentNodeUnavailableDescription', 'The current Review item cannot be used as a Semantic root.');
  }
  return t('semanticFollowCurrentDescription', 'This sidebar follows the current Review item.');
}

function displayNodeTitle(node: BackendSemanticNode): string {
  return node.presentation?.displayTitle || node.title || t('semanticNodeUnavailable', 'Content unavailable');
}

function displayNodeSummary(node: BackendSemanticNode): string {
  return node.presentation?.summary || node.preview || '';
}

function nodeViewBlockId(node: BackendSemanticNode): string {
  return String(node.presentation?.sourceBlockId || node.location?.blockId || node.nodeId || '').trim();
}

function lensLabel(lens: BackendSemanticLens): string {
  if (lens === 'accommodation') {
    return t('semanticLensAccommodationShort', 'Restructure');
  }
  if (lens === 'free') {
    return t('semanticLensFreeShort', 'Free link');
  }
  return t('semanticLensAssimilationShort', 'Assimilate');
}

function nodeTitleById(nodeId: string): string {
  const nodes = model.value?.nodes ?? [];
  const node = nodes.find((candidate) => candidate.nodeId === nodeId);
  return node ? displayNodeTitle(node) : t('semanticNodeUnavailable', 'Content unavailable');
}

function sessionId(): string | null {
  return model.value?.session?.sessionId ?? null;
}

function currentCommandNodeId(): string | null {
  return model.value?.currentNode?.nodeId ?? model.value?.session?.currentNodeId ?? null;
}

function currentMaterializeBlockId(): string | null {
  const current = model.value?.currentNode ?? null;
  return nodeViewBlockId(current) || null;
}

function scheduleSingleClick(action: () => Promise<void>): void {
  clearClickTimer();
  clickTimer = window.setTimeout(() => {
    clickTimer = null;
    void action();
  }, 180);
}

function clearClickTimer(): void {
  if (clickTimer) {
    window.clearTimeout(clickTimer);
    clickTimer = null;
  }
}

async function executeSemanticCommand(
  callerIntent: string,
  command: BackendSemanticCommandRequest['command'],
): Promise<boolean> {
  const commandClient = props.commandClient;
  const activeSessionId = sessionId();
  actionError.value = '';
  if (!commandClient) {
    actionError.value = t('semanticCommandUnavailable', 'Semantic command is unavailable.');
    return false;
  }
  if (!activeSessionId) {
    actionError.value = t('semanticSessionUnavailable', 'Semantic session is unavailable.');
    return false;
  }
  const requestId = `${callerIntent}:${Date.now()}:${++commandSeq}`;
  const result = await commandClient.execute({
    requestId,
    method: 'semantic.command.execute',
    callerIntent,
    idempotencyKey: requestId,
    command,
  });
  if (result.status !== 'ok') {
    actionError.value = result.message || t('semanticCommandUnavailable', 'Semantic command is unavailable.');
    return false;
  }
  await readSidebar();
  return true;
}

async function followCandidate(candidate: BackendSemanticCandidate, viewAfterFollow: boolean): Promise<void> {
  const activeSessionId = sessionId();
  if (!activeSessionId) {
    return;
  }
  const ok = await executeSemanticCommand('semantic.review-sidebar.follow-candidate', {
    type: 'follow-candidate',
    sessionId: activeSessionId,
    candidateId: candidate.candidateId,
    lens: activeLens.value,
  });
  if (ok && viewAfterFollow) {
    emit('view-node', candidate.node.nodeId, displayNodeTitle(candidate.node), nodeViewBlockId(candidate.node));
  }
}

function handleCandidateClick(candidate: BackendSemanticCandidate): void {
  scheduleSingleClick(() => followCandidate(candidate, false));
}

function handleCandidateDoubleClick(candidate: BackendSemanticCandidate): void {
  clearClickTimer();
  void followCandidate(candidate, true);
}

async function moveCursorToNode(node: BackendSemanticNode, viewAfterMove: boolean): Promise<void> {
  const activeSessionId = sessionId();
  if (!activeSessionId) {
    return;
  }
  const ok = await executeSemanticCommand('semantic.review-sidebar.move-active-cursor', {
    type: 'move-active-cursor',
    sessionId: activeSessionId,
    nodeId: node.nodeId,
  });
  if (ok && viewAfterMove) {
    emit('view-node', node.nodeId, displayNodeTitle(node), nodeViewBlockId(node));
  }
}

function handlePathNodeClick(node: BackendSemanticNode): void {
  scheduleSingleClick(() => moveCursorToNode(node, false));
}

function handlePathNodeDoubleClick(node: BackendSemanticNode): void {
  clearClickTimer();
  void moveCursorToNode(node, true);
}

async function undoLastStep(): Promise<void> {
  const activeSessionId = sessionId();
  const nodes = model.value?.activePathNodes ?? [];
  const currentNodeId = currentCommandNodeId();
  const currentIndex = nodes.findIndex((node) => node.nodeId === currentNodeId);
  const previous = currentIndex > 0 ? nodes[currentIndex - 1] : nodes[nodes.length - 2];
  if (!activeSessionId || !previous) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.undo-step', {
    type: 'move-active-cursor',
    sessionId: activeSessionId,
    nodeId: previous.nodeId,
  });
}

async function archiveActiveBranch(): Promise<void> {
  const activeSessionId = sessionId();
  const branch = activeBranch.value;
  if (!activeSessionId || !branch) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.archive-branch', {
    type: 'archive-branch',
    sessionId: activeSessionId,
    branchId: branch.branchId,
  });
}

async function createBranchFromCandidate(candidate: BackendSemanticCandidate): Promise<void> {
  const activeSessionId = sessionId();
  const fromNodeId = currentCommandNodeId();
  if (!activeSessionId || !fromNodeId) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.create-branch-edge', {
    type: 'create-branch-edge',
    sessionId: activeSessionId,
    fromNodeId,
    toNodeId: candidate.node.nodeId,
    lens: activeLens.value,
  });
}

async function analyzePath(): Promise<void> {
  const activeSessionId = sessionId();
  const sidebarModel = model.value;
  if (!activeSessionId || !sidebarModel?.session) {
    return;
  }
  const payload: SemanticPathAnalysisPayload = {
    session: sidebarModel.session,
    currentNode: sidebarModel.currentNode,
    activePathNodes: sidebarModel.activePathNodes,
    edgeExplanations: sidebarModel.edgeExplanations,
    later: sidebarModel.later,
  };
  const ok = await executeSemanticCommand('semantic.review-sidebar.analyze-path-suggestion', {
    type: 'create-suggestion',
    sessionId: activeSessionId,
    suggestionId: `semantic-ai-suggestion:${activeSessionId}:${Date.now()}:${++commandSeq}`,
    source: 'ai',
    summary: buildSemanticSuggestionSummary(payload),
    targetNodeId: sidebarModel.currentNode?.nodeId ?? sidebarModel.session.currentNodeId,
  });
  if (ok) {
    emit('analyze-path', payload);
  }
}

async function ignoreSuggestion(suggestionId: string): Promise<void> {
  const activeSessionId = sessionId();
  if (!activeSessionId) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.ignore-suggestion', {
    type: 'ignore-suggestion',
    sessionId: activeSessionId,
    suggestionId,
  });
}

async function bindSuggestionToCurrent(suggestionId: string): Promise<void> {
  const activeSessionId = sessionId();
  const nodeId = currentCommandNodeId();
  if (!activeSessionId || !nodeId) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.bind-suggestion', {
    type: 'bind-suggestion',
    sessionId: activeSessionId,
    suggestionId,
    nodeId,
  });
}

async function materializeSuggestionToCurrent(suggestionId: string): Promise<void> {
  const activeSessionId = sessionId();
  const current = model.value?.currentNode ?? null;
  const blockId = currentMaterializeBlockId();
  if (!activeSessionId || !blockId) {
    return;
  }
  await executeSemanticCommand('semantic.review-sidebar.materialize-suggestion', {
    type: 'materialize-suggestion',
    sessionId: activeSessionId,
    suggestionId,
    blockId,
    cardId: current?.presentation?.cardId ?? current?.location?.cardId ?? null,
  });
}

async function readSidebar(): Promise<void> {
  const readClient = props.readClient;
  const seq = ++requestSeq;
  model.value = null;
  unavailableMessage.value = '';

  if (!readClient) {
    unavailableMessage.value = t('semanticSidebarUnavailable', 'Semantic sidebar is unavailable.');
    return;
  }

  loading.value = true;
  const pinnedSessionId = String(props.pinnedSessionId || '').trim();
  const currentNodeId = String(props.currentNodeId || '').trim();
  try {
    const result = await readClient.readSidebar({
      requestId: `semantic-review-sidebar-${Date.now()}-${seq}`,
      method: 'semantic.sidebar.read',
      callerIntent: 'semantic.review-sidebar.read',
      sessionId: pinnedSessionId || null,
      currentNodeId: currentNodeId || null,
      rootFocusNodeId: currentNodeId || null,
      bindingMode: pinnedSessionId ? 'pinned-session' : 'follow-current',
    });
    if (seq !== requestSeq) {
      return;
    }
    if (result.status !== 'ok') {
      unavailableMessage.value = result.message || t('semanticSidebarUnavailable', 'Semantic sidebar is unavailable.');
      return;
    }
    model.value = result.model;
    activeLens.value = result.model.session?.activeLens ?? activeLens.value;
  } catch (error) {
    if (seq === requestSeq) {
      unavailableMessage.value = error instanceof Error
        ? error.message
        : t('semanticSidebarUnavailable', 'Semantic sidebar is unavailable.');
    }
  } finally {
    if (seq === requestSeq) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void readSidebar();
});

watch(
  () => [props.currentNodeId, props.pinnedSessionId, props.readClient] as const,
  () => {
    void readSidebar();
  },
);
</script>

<style scoped>
.semantic-review-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  color: var(--b3-theme-on-background);
}

.semantic-review-sidebar__header,
.semantic-review-sidebar__state,
.semantic-review-sidebar__node,
.semantic-review-sidebar__session {
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.semantic-review-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
}

.semantic-review-sidebar__eyebrow,
.semantic-review-sidebar__state,
.semantic-review-sidebar__node-summary,
.semantic-review-sidebar__binding,
.semantic-review-sidebar__session {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.5;
}

.semantic-review-sidebar__title {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.semantic-review-sidebar__unpin {
  flex: 0 0 auto;
}

.semantic-review-sidebar__state,
.semantic-review-sidebar__node,
.semantic-review-sidebar__session,
.semantic-review-sidebar__binding {
  padding: 10px;
}

.semantic-review-sidebar__state--unavailable {
  color: var(--b3-theme-error);
}

.semantic-review-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.semantic-review-sidebar__binding {
  border-left: 2px solid var(--b3-theme-primary);
  background: var(--b3-theme-surface);
}

.semantic-review-sidebar__node-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.semantic-review-sidebar__node-summary {
  margin-top: 4px;
}

.semantic-review-sidebar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.semantic-review-sidebar__start {
  margin-top: 8px;
}

.semantic-review-sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.semantic-review-sidebar__section h3 {
  margin: 0;
  color: var(--b3-theme-on-background);
  font-size: 12px;
  font-weight: 600;
}

.semantic-review-sidebar__path,
.semantic-review-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.semantic-review-sidebar__path li,
.semantic-review-sidebar__list-item,
.semantic-review-sidebar__compact-row,
.semantic-review-sidebar__empty {
  padding: 6px 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  font-size: 12px;
  line-height: 1.4;
}

.semantic-review-sidebar__list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.semantic-review-sidebar__text-button {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.semantic-review-sidebar__inline-action {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 0 6px;
}

.semantic-review-sidebar__empty,
.semantic-review-sidebar__compact-row {
  color: var(--b3-theme-on-surface-light);
}

.semantic-review-sidebar__segments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.semantic-review-sidebar__segment {
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  cursor: pointer;
}

.semantic-review-sidebar__segment--active {
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-primary);
  font-weight: 600;
}
</style>
