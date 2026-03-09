<template>
  <section class="neural-trace-panel">
    <header class="neural-trace-panel__header">
      <div>
        <h3 class="neural-trace-panel__title">
          {{ t('activationTrace', 'Wake / 航迹') }}
        </h3>
        <p class="neural-trace-panel__subtitle">
          {{
            trace
              ? trace.engineMode === 'hyperspace'
                ? t('wakeHyperspaceSubtitle', '显示当前节点如何沿扩散链路被激活。')
                : t('wakeOrbitSubtitle', '显示当前节点如何围绕当前轨道中心被激活。')
              : t('activationTraceEmpty', '暂无可展示的航迹。')
          }}
        </p>
      </div>
    </header>

    <div v-if="!trace" class="neural-trace-panel__empty">
      {{ t('activationTraceEmpty', '暂无可展示的航迹。') }}
    </div>
    <div v-else class="neural-trace-panel__content">
      <div class="neural-trace-panel__summary-pane">
        <div
          v-if="!trace.isExact"
          class="neural-trace-panel__banner neural-trace-panel__banner--warning"
        >
          {{ t('activationTraceLegacy', '该历史记录生成于追踪升级前，轨迹链路可能不完整。') }}
        </div>

        <div class="neural-trace-panel__summary">
          <article
            class="neural-trace-panel__card neural-trace-panel__card--target neural-trace-panel__card--interactive"
            tabindex="0"
            @click="handlePreview(trace.targetNodeId, trace.targetEventId)"
            @dblclick="handleJump(trace.targetNodeId, trace.targetEventId)"
            @keydown.enter.prevent="handleJump(trace.targetNodeId, trace.targetEventId)"
          >
            <div class="neural-trace-panel__card-label">{{ t('currentNodeTag', '当前') }}</div>
            <div class="neural-trace-panel__card-title">{{ trace.targetTitle }}</div>
            <div class="neural-trace-panel__card-meta">
              <span v-if="isCurrentTarget" class="neural-trace-panel__pill neural-trace-panel__pill--current">{{ t('currentNodeTag', '当前') }}</span>
              <span v-if="isAnchoredTarget" class="neural-trace-panel__pill neural-trace-panel__pill--anchor">{{ t('anchoredTag', '空间站') }}</span>
              <span v-if="lastStep?.isVirtual" class="neural-trace-panel__pill">{{ t('virtualNode', '虚拟节点') }}</span>
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
              {{ trace.directActivatorTitle || t('traceUnavailableForLegacy', '旧历史无法精确回溯激活来源。') }}
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
              {{ trace.branchRootTitle || t('traceUnavailableForLegacy', '旧历史无法精确回溯激活来源。') }}
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
                  v-for="badge in step.displayBadges"
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
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { NeuralActivationTraceViewModel } from './types';

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
}>();

const stepsWrapRef = ref<HTMLDivElement | null>(null);

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

function handlePreview(nodeId: string, eventId: string): void {
  emit('select-step', eventId);
  emit('preview', nodeId);
}

function handleJump(nodeId: string, eventId: string): void {
  emit('select-step', eventId);
  emit('jump', nodeId);
}

const anchorNodeIdSet = computed(() => new Set(props.anchorNodeIds ?? []));
const lastStep = computed(() => props.trace?.steps[props.trace.steps.length - 1] ?? null);
const directActivatorStep = computed(() => props.trace && props.trace.steps.length > 1 ? props.trace.steps[props.trace.steps.length - 2] : null);
const branchRootStep = computed(() => props.trace?.steps[0] ?? null);
const isCurrentTarget = computed(() => Boolean(props.trace && props.currentNodeId && props.trace.targetNodeId === props.currentNodeId));
const isAnchoredTarget = computed(() => Boolean(props.trace && anchorNodeIdSet.value.has(props.trace.targetNodeId)));
const directActivatorLabel = computed(() =>
  props.trace?.engineMode === 'hyperspace'
    ? t('directConductor', '直接传导者')
    : t('directActivator', '直接激活者')
);
const branchRootLabel = computed(() =>
  props.trace?.engineMode === 'hyperspace'
    ? t('primaryActivationSource', '主激活源')
    : t('branchRoot', '当前轨道中心')
);

watch(
  () => props.trace?.targetEventId ?? null,
  async () => {
    await nextTick();
    if (stepsWrapRef.value) {
      stepsWrapRef.value.scrollTop = 0;
    }
  },
  { flush: 'post' },
);
</script>
