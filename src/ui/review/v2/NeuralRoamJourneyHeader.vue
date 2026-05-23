<template>
  <div
    class="siyuanmemo-neural-journey"
    :class="{
      'siyuanmemo-neural-journey--mobile': props.isMobile,
      'siyuanmemo-neural-journey--expanded': isExpanded,
    }"
    @click="handleRootClick"
  >
    <div class="siyuanmemo-neural-journey__bar">
      <button
        type="button"
        class="siyuanmemo-neural-journey__route"
        :class="{ 'siyuanmemo-neural-journey__route--temporary': props.routeControl?.temporary }"
        :disabled="props.routeControl?.disabled"
        :title="routeTitle"
        :aria-label="routeAriaLabel"
        @click="handleRouteClick"
      >
        <span class="siyuanmemo-neural-journey__route-main">
          <span class="siyuanmemo-neural-journey__route-label">{{ routeLabel }}</span>
          <span class="siyuanmemo-neural-journey__route-name">{{ routeName }}</span>
          <svg class="siyuanmemo-neural-journey__route-icon"><use xlink:href="#iconDown"></use></svg>
        </span>
        <span v-if="routeDetail" class="siyuanmemo-neural-journey__route-detail">{{ routeDetail }}</span>
      </button>

      <div
        class="siyuanmemo-neural-journey__segment"
        role="tablist"
        :aria-label="t('engine', '引擎')"
      >
        <button
          type="button"
          class="siyuanmemo-neural-journey__segment-item"
          :class="{ 'siyuanmemo-neural-journey__segment-item--active': engineMode === 'orbit' }"
          :aria-selected="String(engineMode === 'orbit')"
          data-type="neural-engine-mode"
          role="tab"
          @click="selectEngineMode('orbit', $event)"
        >
          {{ orbitLabel }}
        </button>
        <button
          type="button"
          class="siyuanmemo-neural-journey__segment-item"
          :class="{ 'siyuanmemo-neural-journey__segment-item--active': engineMode === 'hyperspace' }"
          :aria-selected="String(engineMode === 'hyperspace')"
          data-type="neural-engine-mode"
          role="tab"
          @click="selectEngineMode('hyperspace', $event)"
        >
          {{ hyperspaceLabel }}
        </button>
      </div>

      <div class="siyuanmemo-neural-journey__tools">
        <button
          type="button"
          class="siyuanmemo-neural-journey__mode"
          data-type="neural-nav-mode"
          :aria-label="navigationStatusLabel"
          :title="navigationStatusLabel"
          @click="emitToolbarAction('neural-nav-mode', $event)"
        >
          {{ navigationModeLabel }} ▾
        </button>

        <button
          v-for="button in actionButtons"
          :key="button.type"
          type="button"
          class="siyuanmemo-neural-journey__icon-button"
          :data-type="button.type"
          :aria-label="button.ariaLabel"
          :title="button.tooltip || button.ariaLabel"
          :disabled="button.disabled"
          @click="emitToolbarAction(button.type, $event)"
        >
          <svg v-if="button.icon"><use :xlink:href="button.icon"></use></svg>
        </button>

        <button
          type="button"
          class="siyuanmemo-neural-journey__toggle"
          :aria-label="toggleLabel"
          :title="toggleLabel"
          @click.stop="toggleExpanded"
        >
          <svg viewBox="0 0 24 24">
            <path v-if="isExpanded" d="M6 14l6-6 6 6" />
            <path v-else d="M6 10l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="siyuanmemo-neural-journey__compact">
      <div class="siyuanmemo-neural-journey__engine">
        <span class="siyuanmemo-neural-journey__engine-mark"></span>
        <span>{{ engineShortLabel }}</span>
      </div>

      <div class="siyuanmemo-neural-journey__focus">
        <span class="siyuanmemo-neural-journey__focus-label">{{ focusLabel }}</span>
        <span class="siyuanmemo-neural-journey__focus-node">{{ focusText }}</span>
      </div>

      <div class="siyuanmemo-neural-journey__visual">
        <div
          v-if="engineMode === 'hyperspace'"
          class="siyuanmemo-neural-journey__depth"
          :aria-label="depthAriaLabel"
        >
          <template v-for="(step, index) in depthSteps" :key="step.value">
            <span
              v-if="index > 0"
              class="siyuanmemo-neural-journey__depth-line"
              :class="{ 'siyuanmemo-neural-journey__depth-line--done': step.value <= progressValue }"
            ></span>
            <span
              class="siyuanmemo-neural-journey__depth-node"
              :class="{
                'siyuanmemo-neural-journey__depth-node--done': step.value <= progressValue,
                'siyuanmemo-neural-journey__depth-node--current': step.value === progressValue,
              }"
            >
              {{ step.label }}
            </span>
          </template>
        </div>

        <div
          v-else
          class="siyuanmemo-neural-journey__dots"
          :aria-label="orbitAriaLabel"
        >
          <span
            v-for="step in orbitSteps"
            :key="step"
            class="siyuanmemo-neural-journey__dot"
            :class="{ 'siyuanmemo-neural-journey__dot--filled': step <= progressValue }"
          ></span>
        </div>
      </div>

      <div class="siyuanmemo-neural-journey__stat">
        <strong>{{ progressValue }}</strong> / {{ totalValue }}
      </div>
    </div>

    <div v-if="isExpanded" class="siyuanmemo-neural-journey__popover">
      <div class="siyuanmemo-neural-journey__popover-grid">
        <div
          v-for="card in detailCards"
          :key="card.label"
          class="siyuanmemo-neural-journey__popover-stat"
        >
          <span class="siyuanmemo-neural-journey__popover-label">{{ card.label }}</span>
          <span class="siyuanmemo-neural-journey__popover-value">{{ card.value }}</span>
        </div>
      </div>

      <div v-if="trackEntries.length" class="siyuanmemo-neural-journey__track">
        <div class="siyuanmemo-neural-journey__track-title">
          {{ trackTitle }}
        </div>
        <div class="siyuanmemo-neural-journey__track-list">
          <div
            v-for="entry in trackEntries"
            :key="entry.key"
            class="siyuanmemo-neural-journey__track-item"
          >
            <div class="siyuanmemo-neural-journey__track-index">{{ entry.index }}</div>
            <div class="siyuanmemo-neural-journey__track-body">
              <div class="siyuanmemo-neural-journey__track-headline">{{ entry.label }}</div>
              <div v-if="entry.meta" class="siyuanmemo-neural-journey__track-meta">{{ entry.meta }}</div>
            </div>
            <div class="siyuanmemo-neural-journey__track-stamp">{{ entry.stamp }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getNeuralEngineLabel } from '@/ui/shared/neuralRoamLabels';
import type {
  NeuralEngineMode,
  NeuralNavigationState,
  NeuralRoamBatchSnapshot,
} from '@/types/unified-data-source';
import type { ReviewHeaderRouteControl, ReviewNeuralRoamJourneyProgress, ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
  routeControl: ReviewHeaderRouteControl | null;
  navigationState: NeuralNavigationState | null;
  batch?: NeuralRoamBatchSnapshot | null;
  progress?: ReviewNeuralRoamJourneyProgress | null;
  i18n?: Record<string, string>;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'route-menu', event: MouseEvent): void;
  (e: 'engine-mode-select', mode: NeuralEngineMode): void;
}>();

type ToolbarButton = NonNullable<ReviewUIState['header']['toolbar']>[number];

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return output;
}

function emitToolbarAction(actionType: string, event: MouseEvent): void {
  if ((event.currentTarget as HTMLButtonElement | null)?.disabled) {
    return;
  }
  event.stopPropagation();
  emit('toolbar-action', actionType, event);
}

function handleRouteClick(event: MouseEvent): void {
  if (!props.routeControl || props.routeControl.disabled) {
    return;
  }
  event.stopPropagation();
  emit('route-menu', event);
}

function handleRootClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.siyuanmemo-neural-journey__route, .siyuanmemo-neural-journey__segment, .siyuanmemo-neural-journey__tools')) {
    return;
  }
  toggleExpanded();
}

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
}

function selectEngineMode(mode: NeuralEngineMode, event: MouseEvent): void {
  if (mode === engineMode.value) {
    event.stopPropagation();
    return;
  }
  event.stopPropagation();
  emit('engine-mode-select', mode);
}

const engineMode = computed<NeuralEngineMode>(() => (
  props.navigationState?.engineMode === 'hyperspace' || props.batch?.engineMode === 'hyperspace'
    ? 'hyperspace'
    : 'orbit'
));

const isExpanded = ref(false);

const orbitLabel = computed(() => getNeuralEngineLabel('orbit', t, 'short'));
const hyperspaceLabel = computed(() => getNeuralEngineLabel('hyperspace', t, 'short'));
const engineShortLabel = computed(() => (engineMode.value === 'hyperspace' ? 'Hyperspace' : 'Orbit'));

const routeLabel = computed(() => props.routeControl?.label || t('route', '航线'));
const routeName = computed(() => props.routeControl?.name || props.header.title || t('neuralRoam', '神经漫游'));
const routeDetail = computed(() => props.routeControl?.detail || '');
const routeTitle = computed(() => [routeName.value, routeDetail.value].filter(Boolean).join(' · '));
const routeAriaLabel = computed(() => interpolate(
  t('switchNeuralRoamRouteAriaLabel', '切换航线：{name}'),
  { name: routeName.value },
));

function toCount(value: number | string | null | undefined): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.trunc(numeric);
}

const headerProgressValue = computed(() => toCount(props.header.counterSummary?.value));
const hasHeaderCounter = computed(() => headerProgressValue.value !== null);
const headerTotalValue = computed(() => toCount(props.header.stats.total));
const headerRemainingValue = computed(() => toCount(props.header.stats.current));
const batchProgressValue = computed(() => toCount(props.batch?.viewedCount));
const batchTotalValue = computed(() => toCount(props.batch?.roundSize));
const batchRemainingValue = computed(() => toCount(props.batch?.remainingCount));

const resolvedProgressValue = computed(() => toCount(props.progress?.viewedCount));
const resolvedTotalValue = computed(() => toCount(props.progress?.totalCount));
const resolvedRemainingValue = computed(() => toCount(props.progress?.remainingCount));

const progressValue = computed(() => resolvedProgressValue.value ?? headerProgressValue.value ?? batchProgressValue.value ?? 0);
const totalValue = computed(() => (
  resolvedTotalValue.value ?? (
  hasHeaderCounter.value
    ? headerTotalValue.value ?? batchTotalValue.value ?? 0
    : batchTotalValue.value ?? headerTotalValue.value ?? 0
  )
));
const remainingValue = computed(() => (
  resolvedRemainingValue.value ?? (
  hasHeaderCounter.value
    ? headerRemainingValue.value ?? Math.max(0, totalValue.value - progressValue.value)
    : batchRemainingValue.value ?? headerRemainingValue.value ?? 0
  )
));
const sourceCount = computed(() => Math.max(0, Math.trunc(Number(props.batch?.sourceSnapshot?.length) || 0)));

const navigationModeLabel = computed(() => {
  const mode = props.navigationState?.navigationMode;
  return mode === 'follow'
    ? t('navModeFollow', 'Follow Path')
    : t('navModeExplore', 'Free Roam');
});

const navigationStatusLabel = computed(() => {
  const nav = props.navigationState;
  if (!nav) {
    return navigationModeLabel.value;
  }
  if (nav.navigationMode === 'follow') {
    return interpolate(t('navStatusFollow', 'Current: {mode} ({current}/{total})'), {
      mode: navigationModeLabel.value,
      current: nav.currentPathIndex + 1,
      total: nav.pathLength,
    });
  }
  return interpolate(t('navStatusExplore', 'Current: {mode}'), { mode: navigationModeLabel.value });
});

const toggleLabel = computed(() => (
  isExpanded.value
    ? t('collapse', '收起')
    : t('expand', '展开')
));

const focusLabel = computed(() => (
  engineMode.value === 'hyperspace'
    ? t('activationSource', '激活源')
    : t('currentOrbitCenter', '当前中心')
));

const focusText = computed(() => {
  const preview = String(props.batch?.focusNodePreview || '').trim();
  const nodeId = String(props.batch?.focusNodeId || props.navigationState?.currentNodeId || '').trim();
  const base = preview || nodeId || '-';
  if (engineMode.value !== 'hyperspace') {
    return base;
  }
  const extra = Math.max(0, (props.batch?.sourceSnapshot?.length || 0) - 1);
  return extra > 0 ? `${base} +${extra}` : base;
});

const orbitSteps = computed(() => {
  const count = Math.max(1, Math.min(totalValue.value || 5, 12));
  return Array.from({ length: count }, (_, index) => index + 1);
});

const depthSteps = computed(() => {
  const maxDepth = Math.max(0, Math.min(totalValue.value || 0, 8));
  return Array.from({ length: maxDepth + 1 }, (_, value) => ({
    value,
    label: String(value),
  }));
});

const orbitAriaLabel = computed(() => `${t('currentOrbitRound', '当前轨道轮次')} ${progressValue.value}/${totalValue.value}`);
const depthAriaLabel = computed(() => `${t('currentDepth', '当前深度')} ${progressValue.value}/${totalValue.value}`);

const detailCards = computed(() => (
  engineMode.value === 'hyperspace'
    ? [
        { label: t('activationSource', '激活源'), value: focusText.value },
        { label: t('activationSources', '概念卡：激活源'), value: String(sourceCount.value) },
        { label: t('currentDepth', '当前深度'), value: String(progressValue.value) },
        { label: t('headerMaxDepth', '最大深度'), value: String(totalValue.value) },
      ]
    : [
        { label: t('currentOrbitCenter', '当前中心'), value: focusText.value },
        { label: t('round', '本轮'), value: String(totalValue.value) },
        { label: t('headerViewed', '已看'), value: String(progressValue.value) },
        { label: t('headerRemaining', '剩余'), value: String(remainingValue.value) },
      ]
));

type TrackEntry = {
  key: string;
  index: number;
  label: string;
  meta: string;
  stamp: string;
};

const trackTitle = computed(() => (
  engineMode.value === 'hyperspace'
    ? t('propagationPath', '传播链路')
    : t('orbitTrack', '轨道轮次')
));

const trackEntries = computed<TrackEntry[]>(() => {
  const orbitEntries = props.batch?.roundNodes ?? [];
  const pathEntries = props.batch?.recentPath ?? [];
  if (engineMode.value === 'hyperspace') {
    return pathEntries.map((entry, index) => ({
      key: entry.eventId,
      index: index + 1,
      label: entry.nodePreview || entry.nodeId,
      meta: [
        entry.sourceRole ? `${t('sourceRole', '来源角色')}: ${entry.sourceRole}` : '',
        entry.origin ? `${t('origin', '来源')}: ${entry.origin}` : '',
        entry.traceQuality ? `${t('traceQuality', '链路质量')}: ${entry.traceQuality}` : '',
      ].filter(Boolean).join(' · '),
      stamp: [
        entry.depth !== undefined && entry.depth !== null ? `${t('depth', '深度')} ${entry.depth}` : '',
        entry.conductionScore !== undefined && entry.conductionScore !== null ? `${t('conductionScore', '传播值')} ${entry.conductionScore}` : '',
      ].filter(Boolean).join(' · '),
    }));
  }

  return orbitEntries.map((entry, index) => ({
    key: entry.eventId,
    index: index + 1,
    label: entry.nodePreview || entry.nodeId,
    meta: [
      entry.associationType ? `${t('associationType', '关联')} ${entry.associationType}` : '',
      entry.reason ? entry.reason : '',
    ].filter(Boolean).join(' · '),
    stamp: [
      entry.sourceNodeId ? `${t('sourceNode', '来源节点')} ${entry.sourceNodeId}` : '',
      entry.sourceEventId ? `${t('sourceEvent', '来源事件')} ${entry.sourceEventId}` : '',
    ].filter(Boolean).join(' · '),
  }));
});

const toolbarByType = computed(() => {
  const map = new Map<string, ToolbarButton>();
  for (const button of props.header.toolbar || []) {
    if (!map.has(button.type)) {
      map.set(button.type, button);
    }
  }
  return map;
});

function resolveButton(type: string, fallback: Omit<ToolbarButton, 'type'>): ToolbarButton {
  const existing = toolbarByType.value.get(type);
  return {
    type,
    icon: existing?.icon || fallback.icon,
    ariaLabel: existing?.ariaLabel || fallback.ariaLabel,
    tooltip: existing?.tooltip || fallback.tooltip || existing?.ariaLabel || fallback.ariaLabel,
    disabled: existing?.disabled ?? fallback.disabled,
    label: existing?.label ?? fallback.label,
  };
}

const actionButtons = computed<ToolbarButton[]>(() => [
  resolveButton('lock-focus', {
    icon: '#iconPin',
    ariaLabel: t('addAnchor', '设为空间站'),
  }),
  resolveButton('neural-focuses', {
    icon: '#iconList',
    ariaLabel: engineMode.value === 'hyperspace'
      ? t('viewActivationSourceList', '查看激活源列表')
      : t('viewOrbitCenterList', '查看概念卡：轨道中心列表'),
  }),
  resolveButton('neural-history', {
    icon: '#iconHistory',
    ariaLabel: t('neuralHistoryMenu', '查看航线日志'),
  }),
  resolveButton('ai-sidebar', {
    icon: '#iconSparkles',
    ariaLabel: t('aiSidebar', 'AI Sidebar'),
  }),
  resolveButton('more', {
    icon: '#iconMore',
    ariaLabel: t('moreActions', 'More'),
  }),
]);
</script>

<style scoped>
.siyuanmemo-neural-journey {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--b3-theme-on-surface);
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
}

.siyuanmemo-neural-journey__bar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto minmax(240px, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__route {
  display: inline-flex;
  align-items: stretch;
  justify-self: start;
  min-width: 0;
  max-width: min(100%, 430px);
  min-height: 30px;
  padding: 0;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: inherit;
  cursor: pointer;
  overflow: hidden;
}

.siyuanmemo-neural-journey__route:hover,
.siyuanmemo-neural-journey__route:focus-visible,
.siyuanmemo-neural-journey__mode:hover,
.siyuanmemo-neural-journey__mode:focus-visible,
.siyuanmemo-neural-journey__icon-button:hover,
.siyuanmemo-neural-journey__icon-button:focus-visible {
  border-color: var(--b3-theme-primary);
  background: var(--b3-list-hover);
}

.siyuanmemo-neural-journey__route--temporary {
  border-color: color-mix(in srgb, var(--b3-theme-primary) 34%, var(--b3-border-color));
}

.siyuanmemo-neural-journey__route-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 8px;
  border-right: 1px solid var(--b3-border-color);
}

.siyuanmemo-neural-journey__route-label,
.siyuanmemo-neural-journey__route-detail,
.siyuanmemo-neural-journey__focus-label {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.siyuanmemo-neural-journey__route-name {
  min-width: 0;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.siyuanmemo-neural-journey__route-icon {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  color: var(--b3-theme-on-surface-light);
}

.siyuanmemo-neural-journey__route-detail {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-neural-journey__segment {
  display: inline-grid;
  grid-auto-flow: column;
  align-items: center;
  justify-self: center;
  padding: 2px;
  border: 1px solid var(--b3-border-color);
  border-radius: 5px;
  background: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__segment-item {
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.siyuanmemo-neural-journey__segment-item--active {
  color: var(--b3-theme-primary);
  background: var(--b3-theme-surface);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 34%, transparent);
  font-weight: 600;
}

.siyuanmemo-neural-journey__tools {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 5px;
  min-width: 0;
}

.siyuanmemo-neural-journey__toggle {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
}

.siyuanmemo-neural-journey__toggle svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.siyuanmemo-neural-journey__mode {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.siyuanmemo-neural-journey__icon-button {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  cursor: pointer;
}

.siyuanmemo-neural-journey__icon-button:disabled {
  opacity: 0.46;
  cursor: not-allowed;
}

.siyuanmemo-neural-journey__icon-button svg {
  width: 15px;
  height: 15px;
}

.siyuanmemo-neural-journey__compact {
  display: grid;
  grid-template-columns: minmax(180px, 1.1fr) minmax(0, 1fr) minmax(160px, auto) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px 10px;
  background: var(--b3-theme-surface);
}

.siyuanmemo-neural-journey__visual {
  display: inline-flex;
  align-items: center;
  justify-self: center;
  min-width: 0;
}

.siyuanmemo-neural-journey__popover {
  display: grid;
  gap: 10px;
  margin: 0 10px 10px;
  padding: 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
}

.siyuanmemo-neural-journey__popover-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.siyuanmemo-neural-journey__popover-stat {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__popover-label {
  display: block;
  margin-bottom: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.siyuanmemo-neural-journey__popover-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--b3-theme-on-surface);
  font-size: 13px;
  font-weight: 650;
}

.siyuanmemo-neural-journey__track {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.siyuanmemo-neural-journey__track-title {
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
}

.siyuanmemo-neural-journey__track-list {
  display: grid;
  gap: 6px;
}

.siyuanmemo-neural-journey__track-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__track-index {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
  color: var(--b3-theme-primary);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-neural-journey__track-body {
  min-width: 0;
}

.siyuanmemo-neural-journey__track-headline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  font-weight: 600;
}

.siyuanmemo-neural-journey__track-meta,
.siyuanmemo-neural-journey__track-stamp {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.siyuanmemo-neural-journey__instrument {
  display: grid;
  grid-template-columns: auto minmax(150px, 1fr) minmax(140px, auto) auto;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 6px 10px;
  background: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__engine {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 104px;
  font-size: 13px;
  font-weight: 700;
}

.siyuanmemo-neural-journey__engine-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--b3-theme-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
}

.siyuanmemo-neural-journey__focus {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
}

.siyuanmemo-neural-journey__focus-node {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}

.siyuanmemo-neural-journey__dots {
  display: inline-flex;
  align-items: center;
  justify-self: center;
  gap: 6px;
}

.siyuanmemo-neural-journey__dot {
  width: 10px;
  height: 10px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 40%, var(--b3-border-color));
  border-radius: 50%;
  background: var(--b3-theme-surface);
}

.siyuanmemo-neural-journey__dot--filled {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary);
}

.siyuanmemo-neural-journey__depth {
  display: inline-flex;
  align-items: center;
  justify-self: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-neural-journey__depth-node {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--b3-border-color);
  border-radius: 50%;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
  font-weight: 650;
}

.siyuanmemo-neural-journey__depth-node--done {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary);
  color: var(--b3-theme-background);
}

.siyuanmemo-neural-journey__depth-node--current {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
}

.siyuanmemo-neural-journey__depth-line {
  width: 18px;
  height: 2px;
  background: var(--b3-border-color);
}

.siyuanmemo-neural-journey__depth-line--done {
  background: var(--b3-theme-primary);
}

.siyuanmemo-neural-journey__stat {
  justify-self: end;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.siyuanmemo-neural-journey__stat strong {
  color: var(--b3-theme-on-surface);
  font-weight: 700;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__bar,
.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__instrument {
  grid-template-columns: 1fr;
  justify-items: stretch;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__compact {
  grid-template-columns: 1fr;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__segment,
.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__tools,
.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__route,
.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__stat {
  justify-self: stretch;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__tools {
  justify-content: space-between;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__popover {
  grid-template-columns: 1fr;
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__popover-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__track-item {
  grid-template-columns: auto minmax(0, 1fr);
}

.siyuanmemo-neural-journey--mobile .siyuanmemo-neural-journey__track-stamp {
  grid-column: 2 / -1;
}
</style>
