<template>
  <section class="neural-trace-panel">
    <header class="neural-trace-panel__header">
      <div>
        <h3 class="neural-trace-panel__title">
          {{ t('activationTrace', 'Wake') }}
        </h3>
        <p class="neural-trace-panel__subtitle">
          {{
            trace
              ? trace.engineMode === 'hyperspace'
                ? t('wakeHyperspaceSubtitle', 'Shows how the current node was activated by spreading links.')
                : t('wakeOrbitSubtitle', 'Shows how the current node was activated around the current orbit center.')
              : t('activationTraceEmpty', 'No wake is available.')
          }}
        </p>
      </div>
    </header>

    <div v-if="!trace" class="neural-trace-panel__empty">
      {{ t('activationTraceEmpty', 'No wake is available.') }}
    </div>
    <div v-else class="neural-trace-panel__content">
      <div class="neural-trace-panel__summary-pane">
        <div
          v-if="!trace.isExact"
          class="neural-trace-panel__banner neural-trace-panel__banner--warning"
        >
          {{
            t(
              'activationTraceLegacy',
              'This history entry was generated before wake upgrades, so the route may be incomplete.',
            )
          }}
        </div>

        <div class="neural-trace-panel__summary">
          <article
            class="neural-trace-panel__card neural-trace-panel__card--target neural-trace-panel__card--interactive"
            tabindex="0"
            @click="handlePreview(trace.targetNodeId, trace.targetEventId)"
            @dblclick="handleJump(trace.targetNodeId, trace.targetEventId)"
            @keydown.enter.prevent="handleJump(trace.targetNodeId, trace.targetEventId)"
          >
            <div class="neural-trace-panel__card-label">{{ t('currentNodeTag', 'Current') }}</div>
            <div class="neural-trace-panel__card-title">{{ trace.targetTitle }}</div>
            <div class="neural-trace-panel__card-meta">
              <span
                v-if="isCurrentTarget"
                class="neural-trace-panel__pill neural-trace-panel__pill--current"
              >
                {{ t('currentNodeTag', 'Current') }}
              </span>
              <span
                v-if="isAnchoredTarget"
                class="neural-trace-panel__pill neural-trace-panel__pill--anchor"
              >
                {{ t('anchoredTag', 'Anchored') }}
              </span>
              <span v-if="lastStep?.isVirtual" class="neural-trace-panel__pill">
                {{ t('virtualNode', 'Virtual Node') }}
              </span>
              <span
                v-if="targetConvergenceLabel"
                class="neural-trace-panel__pill neural-trace-panel__pill--soft"
              >
                {{ targetConvergenceLabel }}
              </span>
              <span v-if="targetConvergenceSummary" class="neural-trace-panel__convergence-summary">
                {{ targetConvergenceSummary }}
              </span>
              <span class="neural-trace-panel__time">{{ formatTime(lastStep?.visitedAt ?? 0) }}</span>
            </div>
          </article>

          <article
            class="neural-trace-panel__card neural-trace-panel__card--interactive"
            :class="{ 'neural-trace-panel__card--disabled': !directActivatorStep }"
            :tabindex="directActivatorStep ? 0 : -1"
            @click="directActivatorStep && handlePreview(directActivatorStep.nodeId, directActivatorStep.eventId)"
            @dblclick="directActivatorStep && handleJump(directActivatorStep.nodeId, directActivatorStep.eventId)"
            @keydown.enter.prevent="directActivatorStep && handleJump(directActivatorStep.nodeId, directActivatorStep.eventId)"
          >
            <div class="neural-trace-panel__card-label">{{ directActivatorLabel }}</div>
            <div class="neural-trace-panel__card-title">
              {{ trace.directActivatorTitle || t('traceUnavailableForLegacy', 'Unavailable') }}
            </div>
            <div class="neural-trace-panel__card-meta">
              <span
                v-for="badge in trace.directRelationBadges?.length ? trace.directRelationBadges : [{ key: 'direct-relation', label: trace.directRelationLabel }]"
                :key="badge.key"
                class="neural-trace-panel__pill"
                :class="{
                  'neural-trace-panel__pill--current': badge.tone === 'current',
                  'neural-trace-panel__pill--root': badge.tone === 'root',
                }"
              >
                {{ badge.label }}
              </span>
              <span v-if="directActivatorInferredBadge" class="neural-trace-panel__pill">
                {{ directActivatorInferredBadge.label }}
              </span>
            </div>
          </article>

          <article
            class="neural-trace-panel__card neural-trace-panel__card--interactive"
            :class="{ 'neural-trace-panel__card--disabled': !branchRootStep }"
            :tabindex="branchRootStep ? 0 : -1"
            @click="branchRootStep && handlePreview(branchRootStep.nodeId, branchRootStep.eventId)"
            @dblclick="branchRootStep && handleJump(branchRootStep.nodeId, branchRootStep.eventId)"
            @keydown.enter.prevent="branchRootStep && handleJump(branchRootStep.nodeId, branchRootStep.eventId)"
          >
            <div class="neural-trace-panel__card-label">{{ branchRootLabel }}</div>
            <div class="neural-trace-panel__card-title">
              {{ trace.branchRootTitle || t('traceUnavailableForLegacy', 'Unavailable') }}
            </div>
            <div v-if="branchRootInferredBadge" class="neural-trace-panel__card-meta">
              <span class="neural-trace-panel__pill">
                {{ branchRootInferredBadge.label }}
              </span>
            </div>
          </article>
        </div>
      </div>

      <div ref="stepsWrapRef" class="neural-trace-panel__steps-wrap">
        <ol class="neural-trace-panel__steps">
          <li
            v-for="step in trace.steps"
            :key="step.eventId"
            class="neural-trace-panel__step"
            :class="{
              'neural-trace-panel__step--root': step.isRoot,
              'neural-trace-panel__step--target': step.isTarget,
              'neural-trace-panel__step--current': step.isCurrent,
              'neural-trace-panel__step--selected': step.isSelected,
            }"
          >
            <span class="neural-trace-panel__step-line" aria-hidden="true"></span>
            <span class="neural-trace-panel__step-dot" aria-hidden="true"></span>
            <div
              class="neural-trace-panel__step-card neural-trace-panel__step-card--interactive"
              tabindex="0"
              @click="handlePreview(step.nodeId, step.eventId)"
              @dblclick="handleJump(step.nodeId, step.eventId)"
              @keydown.enter.prevent="handleJump(step.nodeId, step.eventId)"
            >
              <div class="neural-trace-panel__step-topline">
                <span class="neural-trace-panel__step-title">
                  {{ step.nodePreview || step.nodeId }}
                </span>
              </div>
              <div class="neural-trace-panel__step-meta">
                <span
                  v-for="badge in getStepBadges(step)"
                  :key="badge.key"
                  class="neural-trace-panel__pill neural-trace-panel__pill--soft"
                  :class="{
                    'neural-trace-panel__pill--current': badge.tone === 'current',
                    'neural-trace-panel__pill--root': badge.tone === 'root',
                  }"
                >
                  {{ badge.label }}
                </span>
              </div>
              <div class="neural-trace-panel__step-reason">{{ step.reason }}</div>
              <div v-if="shouldShowConvergence(step)" class="neural-trace-panel__convergence">
                <div class="neural-trace-panel__convergence-head">
                  <span
                    v-if="step.convergenceStatus === 'ready' && step.convergence"
                    class="neural-trace-panel__pill neural-trace-panel__pill--soft"
                  >
                    {{ resolveConvergenceLabel(step.convergence.kind) }}
                  </span>
                  <span v-if="resolveStepConvergenceSummary(step)" class="neural-trace-panel__convergence-summary">
                    {{ resolveStepConvergenceSummary(step) }}
                  </span>
                  <button
                    type="button"
                    class="b3-button b3-button--outline neural-trace-panel__convergence-toggle"
                    @click.stop="toggleConvergence(step)"
                  >
                    {{
                      isConvergenceExpanded(step.eventId)
                        ? t('hideWakeDetails', 'Hide details')
                        : t('viewWakeDetails', 'Route details')
                    }}
                  </button>
                </div>
                <div
                  v-if="isConvergenceExpanded(step.eventId)"
                  class="neural-trace-panel__convergence-details"
                >
                  <div
                    v-if="step.convergenceStatus !== 'ready' || !step.convergence"
                    class="neural-trace-panel__convergence-label"
                  >
                    {{ t('loadingWakeDetails', 'Loading route details...') }}
                  </div>
                  <template v-else>
                    <div class="neural-trace-panel__convergence-label">
                      {{ resolveConvergenceDetailsTitle(step.convergence) }}
                    </div>
                    <div class="neural-trace-panel__route-list">
                      <button
                        v-for="variant in step.convergence.variants"
                        :key="variant.representativeEventId"
                        type="button"
                        class="neural-trace-panel__route-card"
                        :class="{ 'neural-trace-panel__route-card--disabled': variant.isPrimary }"
                        :disabled="variant.isPrimary"
                        @click.stop="handleSwitchTraceEvent(variant.representativeEventId)"
                      >
                        <div class="neural-trace-panel__route-topline">
                          <span class="neural-trace-panel__pill neural-trace-panel__pill--soft">
                            {{ variant.isPrimary ? t('currentRoute', 'Current Route') : t('otherSources', 'Other Sources') }}
                          </span>
                          <span class="neural-trace-panel__time">{{ formatTime(variant.latestVisitedAt) }}</span>
                        </div>
                        <div class="neural-trace-panel__route-field">
                          <span class="neural-trace-panel__route-field-label">{{ branchRootLabel }}</span>
                          <span class="neural-trace-panel__route-field-value">
                            {{ variant.branchRootTitle || t('traceUnavailableForLegacy', 'Unavailable') }}
                          </span>
                        </div>
                        <div
                          v-if="variant.directActivatorTitle || trace.engineMode === 'hyperspace'"
                          class="neural-trace-panel__route-field"
                        >
                          <span class="neural-trace-panel__route-field-label">{{ directActivatorLabel }}</span>
                          <span class="neural-trace-panel__route-field-value">
                            {{ variant.directActivatorTitle || t('traceUnavailableForLegacy', 'Unavailable') }}
                          </span>
                        </div>
                        <div class="neural-trace-panel__route-meta">
                          <span
                            v-for="badge in variant.directRelationBadges?.length ? variant.directRelationBadges : [{ key: 'direct-relation', label: variant.directRelationLabel }]"
                            :key="badge.key"
                            class="neural-trace-panel__pill neural-trace-panel__pill--soft"
                            :class="{
                              'neural-trace-panel__pill--current': badge.tone === 'current',
                              'neural-trace-panel__pill--root': badge.tone === 'root',
                            }"
                          >
                            {{ badge.label }}
                          </span>
                          <span
                            v-if="variant.hitCount > 1"
                            class="neural-trace-panel__pill neural-trace-panel__pill--soft"
                          >
                            {{ formatCountLabel('hitCount', 'Hit {count} times', variant.hitCount) }}
                          </span>
                          <span
                            v-if="variant.inferred"
                            class="neural-trace-panel__pill neural-trace-panel__pill--soft"
                          >
                            {{ t('traceStepSyntheticRoot', 'Inferred') }}
                          </span>
                        </div>
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { NeuralActivationTraceStepViewModel, NeuralActivationTraceViewModel } from './types';

const props = defineProps<{
  i18n?: Record<string, string>;
  trace: NeuralActivationTraceViewModel | null;
  currentNodeId?: string | null;
  anchorNodeIds?: string[];
}>();

const emit = defineEmits<{
  (e: 'preview', nodeId: string): void;
  (e: 'jump', nodeId: string): void;
  (e: 'select-step', eventId: string): void;
  (e: 'request-convergence-details', eventId: string): void;
  (e: 'switch-trace-event', eventId: string): void;
}>();

const stepsWrapRef = ref<HTMLDivElement | null>(null);
const expandedConvergenceEventIds = ref<string[]>([]);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function formatTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function formatCountLabel(key: string, fallback: string, count: number): string {
  return t(key, fallback).replace('{count}', String(Math.max(0, Math.floor(count))));
}

function handlePreview(nodeId: string, eventId: string): void {
  emit('select-step', eventId);
  emit('preview', nodeId);
}

function handleJump(nodeId: string, eventId: string): void {
  emit('select-step', eventId);
  emit('jump', nodeId);
}

function handleSwitchTraceEvent(eventId: string): void {
  emit('switch-trace-event', eventId);
}

function findStepBadge(step: NeuralActivationTraceViewModel['steps'][number] | null, key: string) {
  return step?.displayBadges.find((badge) => badge.key === key) ?? null;
}

function resolveConvergenceLabel(kind: 'repeat-hit' | 'multi-route'): string {
  return kind === 'multi-route'
    ? t('convergentNode', 'Convergent Node')
    : t('repeatedHit', 'Repeated Hit');
}

function getStepBadges(step: NeuralActivationTraceStepViewModel) {
  const inferredBadges = step.displayBadges.filter((badge) => badge.key === 'synthetic-root');
  const otherBadges = step.displayBadges.filter((badge) => badge.key !== 'synthetic-root');
  if (step.convergenceStatus !== 'ready' || !step.convergence) {
    return [...otherBadges, ...inferredBadges];
  }
  return [
    ...otherBadges,
    {
      key: `convergence:${step.eventId}`,
      label: resolveConvergenceLabel(step.convergence.kind),
      tone: 'soft' as const,
    },
    ...inferredBadges,
  ];
}

function shouldShowConvergence(step: NeuralActivationTraceStepViewModel): boolean {
  return step.convergenceStatus === 'ready'
    || step.convergenceStatus === 'loading'
    || ((step.repeatHitCount ?? 1) > 1 && Boolean(step.isSelected));
}

function resolveStepConvergenceSummary(step: NeuralActivationTraceStepViewModel): string {
  if (step.convergenceStatus === 'ready' && step.convergence) {
    return formatConvergenceSummary(step.convergence);
  }
  if ((step.repeatHitCount ?? 1) > 1) {
    return formatCountLabel('totalHitCount', 'Hit {count} times', step.repeatHitCount ?? 0);
  }
  return '';
}

function hasOnlyLegacyAlternates(
  convergence: NeuralActivationTraceStepViewModel['convergence'] | null | undefined,
): boolean {
  const alternateVariants = convergence?.variants.filter((variant) => !variant.isPrimary) ?? [];
  return alternateVariants.length > 0 && alternateVariants.every((variant) => variant.traceQuality === 'legacy');
}

function formatConvergenceSummary(
  convergence: NeuralActivationTraceStepViewModel['convergence'] | null | undefined,
): string {
  if (!convergence) {
    return '';
  }
  if (hasOnlyLegacyAlternates(convergence)) {
    return formatCountLabel('nMoreHistoricalHits', '{count} more historical hits', convergence.totalEventCount - 1);
  }
  if (convergence.alternateRouteCount > 0) {
    return formatCountLabel('nMoreSources', '{count} more sources', convergence.alternateRouteCount);
  }
  return formatCountLabel('totalHitCount', 'Hit {count} times', convergence.totalEventCount);
}

function resolveConvergenceDetailsTitle(
  convergence: NeuralActivationTraceStepViewModel['convergence'] | null | undefined,
): string {
  if (!convergence) {
    return '';
  }
  if (hasOnlyLegacyAlternates(convergence)) {
    return t('historicalHitUnresolved', 'Historical hit (path not fully recoverable)');
  }
  return convergence.alternateRouteCount > 0
    ? t('otherSources', 'Other Sources')
    : t('repeatedHit', 'Repeated Hit');
}

function isConvergenceExpanded(eventId: string): boolean {
  return expandedConvergenceEventIds.value.includes(eventId);
}

function toggleConvergence(step: NeuralActivationTraceStepViewModel): void {
  const nextExpanded = !isConvergenceExpanded(step.eventId);
  expandedConvergenceEventIds.value = nextExpanded
    ? [...expandedConvergenceEventIds.value, step.eventId]
    : expandedConvergenceEventIds.value.filter((id) => id !== step.eventId);
  if (nextExpanded && (step.repeatHitCount ?? 1) > 1 && step.convergenceStatus === 'idle') {
    emit('request-convergence-details', step.eventId);
  }
}

const anchorNodeIdSet = computed(() => new Set(props.anchorNodeIds ?? []));
const lastStep = computed(() => props.trace?.steps[props.trace.steps.length - 1] ?? null);
const directActivatorStep = computed(
  () => props.trace?.steps.find((step) => step.eventId === props.trace?.directActivatorEventId) ?? null,
);
const branchRootStep = computed(
  () => props.trace?.steps.find((step) => step.eventId === props.trace?.branchRootEventId) ?? null,
);
const isCurrentTarget = computed(
  () => Boolean(props.trace && props.currentNodeId && props.trace.targetNodeId === props.currentNodeId),
);
const isAnchoredTarget = computed(
  () => Boolean(props.trace && anchorNodeIdSet.value.has(props.trace.targetNodeId)),
);
const targetConvergence = computed(() => lastStep.value?.convergence ?? null);
const targetConvergenceLabel = computed(
  () => (targetConvergence.value ? resolveConvergenceLabel(targetConvergence.value.kind) : ''),
);
const targetConvergenceSummary = computed(() => formatConvergenceSummary(targetConvergence.value));
const directActivatorInferredBadge = computed(
  () => findStepBadge(directActivatorStep.value, 'synthetic-root'),
);
const branchRootInferredBadge = computed(() => findStepBadge(branchRootStep.value, 'synthetic-root'));
const directActivatorLabel = computed(() =>
  props.trace?.engineMode === 'hyperspace'
    ? t('directConductor', 'Immediate Conductor')
    : t('directActivator', 'Direct Activator'),
);
const branchRootLabel = computed(() =>
  props.trace?.engineMode === 'hyperspace'
    ? t('primaryActivationSource', 'Primary Activation Source')
    : t('branchRoot', 'Current Orbit Center'),
);

watch(
  () => props.trace?.targetEventId ?? null,
  async () => {
    await nextTick();
    expandedConvergenceEventIds.value = [];
    if (stepsWrapRef.value) {
      stepsWrapRef.value.scrollTop = 0;
    }
  },
  { flush: 'post' },
);
</script>
