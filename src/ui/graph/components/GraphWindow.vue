<template>
  <div v-if="visible" class="graph-window" :style="windowStyle">
    <div class="window-header" @mousedown="startDrag">
      <div class="window-title-wrap">
        <span class="window-title">{{ t('orbitTitle', '漫游图谱') }}</span>
        <span class="window-subtitle">{{ t('orbitSubtitle', '神经漫游') }}</span>
      </div>
      <div class="window-actions">
        <div class="direction-menu-wrap" @mousedown.stop>
          <button
            ref="directionMenuButtonRef"
            class="btn-action btn-menu"
            @click="toggleDirectionMenu"
            :title="t('directions', '漫游方向')"
          >
            <span class="icon">方向</span>
            <span class="btn-label">{{ t('directions', '方向') }}</span>
          </button>
          <div
            v-if="directionMenuOpen"
            ref="directionMenuRef"
            class="direction-menu"
            @click.stop
          >
            <div class="direction-menu__header">
              <span>{{ t('directions', '漫游方向') }}</span>
              <button class="btn-ghost" @click="directionMenuOpen = false">关闭</button>
            </div>
            <DirectionControlPanel
              :available-directions="availableDirections"
              :selected-directions="selectedDirections"
              :collapsed="false"
              :direction-counts="directionCounts"
              :i18n="i18n"
              @direction-change="handleDirectionChange"
              @toggle-collapse="noop"
            />
          </div>
        </div>
        <button class="btn-action" @click="focusCurrentNode" :title="t('focusCurrent', '回到当前节点')">
          <span class="icon">回到</span>
        </button>
        <button class="btn-action" @click="showOverview" :title="t('overview', '显示全部图谱')">
          <span class="icon">全览</span>
        </button>
        <button class="btn-refresh" @click="handleRefresh" :title="t('refresh', '刷新')">
          <span class="icon">刷新</span>
        </button>
        <button class="btn-close" @click="handleClose" :title="t('close', '关闭')">
          <span class="icon">关闭</span>
        </button>
      </div>
    </div>

    <div class="window-content">
      <div class="canvas-area">
        <GraphCanvas
          ref="canvasRef"
          :nodes="graphNodes"
          :edges="graphEdges"
          :options="graphOptions"
          :highlighted-nodes="highlightedNodes"
          :current-node="currentNodeId"
          :orbit-positions="orbitPositions"
          :i18n="i18n"
          @node-click="handleNodeClick"
          @node-hover="handleNodeHover"
          @canvas-click="handleCanvasClick"
          @set-seed="handleSetSeed"
          @navigate-to-block="handleNavigateToBlock"
        />

        <div v-if="hoveredNode" class="node-tooltip" :style="tooltipStyle">
          <div class="tooltip-title">{{ hoveredNode.title }}</div>
          <div v-if="hoveredNode.associationType" class="tooltip-meta">
            关联类型：{{ getAssociationLabel(hoveredNode.associationType) }}
          </div>
        </div>
      </div>
    </div>

    <div class="resize-handle" @mousedown="startResize"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { NeuralRoamQueue } from '../../../queues/NeuralRoamQueue';
import type { GraphNode, GraphEdge, VisNetworkOptions, WindowConfig } from '../types/graph';
import { AssociationType } from '../types/graph';
import { OrbitGraphUseCase } from '@/application/graph/OrbitGraphUseCase';
import GraphCanvas from './GraphCanvas.vue';
import DirectionControlPanel from './DirectionControlPanel.vue';

const props = defineProps<{
  queueInstance: NeuralRoamQueue;
  visible: boolean;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'node-click', nodeId: string): void;
  (e: 'navigate-to-block', nodeId: string): void;
  (e: 'resize', size: { width: number; height: number }): void;
}>();

const canvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null);

const directionMenuOpen = ref(false);
const directionMenuRef = ref<HTMLDivElement | null>(null);
const directionMenuButtonRef = ref<HTMLButtonElement | null>(null);

let orbitUseCase: OrbitGraphUseCase | null = null;

const availableDirections = ref<AssociationType[]>([]);

const selectedDirections = ref<Set<AssociationType>>(new Set());
const directionCounts = ref<Record<AssociationType, number>>({} as any);

const graphNodes = ref<GraphNode[]>([]);
const graphEdges = ref<GraphEdge[]>([]);
const orbitPositions = ref<Map<string, { x: number; y: number }>>(new Map());
const highlightedNodes = ref<Set<string>>(new Set());
const currentNodeId = ref<string | null>(null);
const hoveredNode = ref<GraphNode | null>(null);

const windowPosition = ref({ x: 100, y: 100 });
const windowSize = ref({ width: 860, height: 560 });

const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const resizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });

const windowStyle = computed(() => ({
  left: `${windowPosition.value.x}px`,
  top: `${windowPosition.value.y}px`,
  width: `${windowSize.value.width}px`,
  height: `${windowSize.value.height}px`,
}));

const tooltipStyle = computed(() => ({
  bottom: '20px',
  right: '20px',
}));

const graphOptions = computed<VisNetworkOptions>(() => ({}));

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const noop = () => {};

function toggleDirectionMenu() {
  directionMenuOpen.value = !directionMenuOpen.value;
}

function handleDocumentClick(event: MouseEvent) {
  if (!directionMenuOpen.value) return;
  const target = event.target as Node | null;
  if (target && directionMenuRef.value?.contains(target)) return;
  if (target && directionMenuButtonRef.value?.contains(target)) return;
  directionMenuOpen.value = false;
}

function getAssociationLabel(type: AssociationType): string {
  const labels: Record<AssociationType, string> = {
    [AssociationType.REF_LINK]: t('refLink', '链接关系'),
    [AssociationType.HIERARCHY]: t('hierarchy', '层级关系'),
    [AssociationType.TAG]: t('tag', '标签关系'),
    [AssociationType.SIBLING]: t('sibling', '兄弟块'),
  };
  return labels[type] || type;
}

function initializeUseCase() {
  orbitUseCase = new OrbitGraphUseCase(props.queueInstance);
  availableDirections.value = orbitUseCase.getDefaultDirections();
}

async function loadGraphData() {
  if (!orbitUseCase) return;

  try {
    const orbitData = await orbitUseCase.loadOrbitGraph(selectedDirections.value);
    graphNodes.value = orbitData.nodes;
    graphEdges.value = orbitData.edges;
    orbitPositions.value = orbitData.positions;
    currentNodeId.value = orbitData.currentNodeId;
    highlightedNodes.value = orbitData.highlightedNodes;
    directionCounts.value = orbitData.directionCounts;
  } catch (error) {
    console.error('[GraphWindow] Failed to load graph data:', error);
  }
}

function loadConfig() {
  if (!orbitUseCase) return;
  selectedDirections.value = orbitUseCase.loadDirections(availableDirections.value);

  const savedConfig = orbitUseCase.loadWindowConfig();
  if (savedConfig) {
    windowPosition.value = savedConfig.position;
    windowSize.value = savedConfig.size;
  } else if (props.initialPosition && props.initialSize) {
    windowPosition.value = props.initialPosition;
    windowSize.value = props.initialSize;
  }
}

function saveConfig() {
  if (!orbitUseCase) return;
  orbitUseCase.saveDirections(selectedDirections.value);

  const config: WindowConfig = {
    position: windowPosition.value,
    size: windowSize.value,
    visible: props.visible,
  };
  orbitUseCase.saveWindowConfig(config);
}

async function handleDirectionChange(directions: Set<AssociationType>) {
  selectedDirections.value = directions;
  await loadGraphData();
  saveConfig();
}

function handleNodeClick(nodeId: string) {
  emit('node-click', nodeId);
}

function handleSetSeed(nodeId: string) {
  const queue = props.queueInstance as any;
  if (!queue || typeof queue.lockCurrentAsSeed !== 'function') {
    console.warn('[GraphWindow] Queue does not support lockCurrentAsSeed');
    return;
  }
  void queue.lockCurrentAsSeed(nodeId)
    .then(() => loadGraphData())
    .catch((err: Error) => {
      console.error('[GraphWindow] Failed to lock seed:', err);
    });
}

function handleNavigateToBlock(nodeId: string) {
  emit('navigate-to-block', nodeId);
}

function handleNodeHover(nodeId: string | null) {
  if (nodeId) {
    const node = graphNodes.value.find(n => n.id === nodeId);
    hoveredNode.value = node || null;
  } else {
    hoveredNode.value = null;
  }
}

function handleCanvasClick() {
  hoveredNode.value = null;
}

async function handleRefresh() {
  await loadGraphData();
}

function handleClose() {
  saveConfig();
  emit('close');
}

function focusCurrentNode() {
  if (!canvasRef.value) return;
  if (currentNodeId.value) {
    canvasRef.value.focusNode(currentNodeId.value);
  }
}

function showOverview() {
  if (!canvasRef.value) return;
  const cy = canvasRef.value.getInstance();
  if (!cy) return;
  cy.animate({
    fit: { padding: 50 },
    duration: 800,
    easing: 'ease-in-out-cubic',
  });
}

function startDrag(e: MouseEvent) {
  dragging.value = true;
  dragStart.value = {
    x: e.clientX - windowPosition.value.x,
    y: e.clientY - windowPosition.value.y,
  };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent) {
  if (!dragging.value) return;
  windowPosition.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y,
  };
}

function stopDrag() {
  dragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  saveConfig();
}

function startResize(e: MouseEvent) {
  resizing.value = true;
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: windowSize.value.width,
    height: windowSize.value.height,
  };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
}

function onResize(e: MouseEvent) {
  if (!resizing.value) return;
  const deltaX = e.clientX - resizeStart.value.x;
  const deltaY = e.clientY - resizeStart.value.y;
  windowSize.value = {
    width: Math.max(400, resizeStart.value.width + deltaX),
    height: Math.max(300, resizeStart.value.height + deltaY),
  };
  emit('resize', windowSize.value);
}

function stopResize() {
  resizing.value = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  saveConfig();
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick);
  initializeUseCase();
  loadConfig();
  loadGraphData();
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
});

watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadGraphData();
    }
  }
);

watch(
  () => props.queueInstance,
  () => {
    initializeUseCase();
    loadGraphData();
  }
);

defineExpose({
  refresh: () => {
    loadGraphData();
  },
  focusNode: (nodeId: string) => {
    canvasRef.value?.focusNode(nodeId);
  },
});
</script>

<style scoped>
.graph-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.08));
  border-bottom: 1px solid var(--b3-border-color);
  cursor: move;
  user-select: none;
}

.window-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.window-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.window-subtitle {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--b3-theme-on-surface-light);
  opacity: 0.7;
}

.window-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn-action,
.btn-refresh,
.btn-close {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s ease, color 0.15s ease;
}

.btn-action:hover,
.btn-refresh:hover,
.btn-close:hover {
  background: var(--b3-list-hover);
}

.btn-close:hover {
  background: var(--b3-theme-error);
  color: white;
}

.btn-menu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-label {
  font-size: 12px;
}

.window-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvas-area {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.node-tooltip {
  position: absolute;
  padding: 8px 12px;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  z-index: 10;
  max-width: 300px;
}

.tooltip-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
  margin-bottom: 4px;
}

.tooltip-meta {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 50%,
    var(--b3-border-color) 50%,
    var(--b3-border-color) 100%
  );
}

.resize-handle:hover {
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 50%,
    var(--b3-theme-primary) 50%,
    var(--b3-theme-primary) 100%
  );
}

.direction-menu-wrap {
  position: relative;
}

.direction-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 220px;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  padding: 8px;
  z-index: 20;
}

.direction-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 6px 8px;
  color: var(--b3-theme-on-surface);
}

.btn-ghost {
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  cursor: pointer;
}
</style>
