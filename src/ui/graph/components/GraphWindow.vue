<template>
  <div v-if="visible" class="graph-window" :style="windowStyle">
    <!-- 窗口头部 -->
    <div class="window-header" @mousedown="startDrag">
      <span class="window-title">🌌 {{ t('orbitTitle', 'Orbit 轨道图谱') }}</span>
      <div class="window-actions">
        <!-- 🆕 回到当前按钮 -->
        <button class="btn-action" @click="focusCurrentNode" :title="t('focusCurrent', '回到当前节点')">
          <span class="icon">🎯</span>
        </button>
        <!-- 🆕 全览按钮 -->
        <button class="btn-action" @click="showOverview" :title="t('overview', '显示全部图谱')">
          <span class="icon">🔭</span>
        </button>
        <button class="btn-refresh" @click="handleRefresh" :title="t('refresh', '刷新')">
          <span class="icon">🔄</span>
        </button>
        <button class="btn-close" @click="handleClose" :title="t('close', '关闭')">
          <span class="icon">✕</span>
        </button>
      </div>
    </div>
    
    <!-- 窗口内容 -->
    <div class="window-content">
      <!-- 左侧：方向控制面板 -->
      <div class="sidebar" :class="{ collapsed: panelCollapsed }">
        <DirectionControlPanel
          :available-directions="availableDirections"
          :selected-directions="selectedDirections"
          :collapsed="panelCollapsed"
          :direction-counts="directionCounts"
          :i18n="i18n"
          @direction-change="handleDirectionChange"
          @toggle-collapse="togglePanel"
        />
      </div>
      
      <!-- 右侧：图谱画布 -->
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
        />
        
        <!-- 悬停提示 -->
        <div v-if="hoveredNode" class="node-tooltip" :style="tooltipStyle">
          <div class="tooltip-title">{{ hoveredNode.title }}</div>
          <div v-if="hoveredNode.associationType" class="tooltip-meta">
            关联类型：{{ getAssociationLabel(hoveredNode.associationType) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- 窗口调整大小手柄 -->
    <div class="resize-handle" @mousedown="startResize"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { NeuralRoamQueue } from '../../../queues/NeuralRoamQueue';
import type { GraphNode, GraphEdge, VisNetworkOptions, WindowConfig } from '../types/graph';
import { AssociationType } from '../types/graph';
import { GraphDataService } from '../services/GraphDataService';
import { GraphStorageService } from '../services/GraphStorageService';
import GraphCanvas from './GraphCanvas.vue';
import DirectionControlPanel from './DirectionControlPanel.vue';

/**
 * Props 定义
 */
const props = defineProps<{
  /** 神经漫游队列实例 */
  queueInstance: NeuralRoamQueue;
  /** 窗口可见性 */
  visible: boolean;
  /** 初始位置 */
  initialPosition?: { x: number; y: number };
  /** 初始大小 */
  initialSize?: { width: number; height: number };
  /** 国际化文本 */
  i18n?: Record<string, string>;
}>();

/**
 * Emits 定义
 */
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'node-click', nodeId: string): void;
  (e: 'resize', size: { width: number; height: number }): void;
}>();

// ========================================================================
// 响应式状态
// ========================================================================

/** Canvas 组件引用 */
const canvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null);

/** 数据服务实例 */
let dataService: GraphDataService | null = null;

/** 存储服务实例 */
const storageService = new GraphStorageService();

/** 可用的方向列表 */
const availableDirections = ref<AssociationType[]>([
  AssociationType.REF_LINK,
  AssociationType.HIERARCHY,
  AssociationType.TAG,
  AssociationType.SIBLING,
]);

/** 选中的方向集合 */
const selectedDirections = ref<Set<AssociationType>>(new Set());

/** 方向候选节点数量 */
const directionCounts = ref<Record<AssociationType, number>>({} as any);

/** 图谱节点数据 */
const graphNodes = ref<GraphNode[]>([]);

/** 图谱边数据 */
const graphEdges = ref<GraphEdge[]>([]);

/** 🆕 Orbit 布局位置映射 */
const orbitPositions = ref<Map<string, { x: number; y: number }>>(new Map());

/** 高亮节点集合 */
const highlightedNodes = ref<Set<string>>(new Set());

/** 当前节点 ID */
const currentNodeId = ref<string | null>(null);

/** 悬停的节点 */
const hoveredNode = ref<GraphNode | null>(null);

/** 控制面板折叠状态 */
const panelCollapsed = ref(false);

/** 窗口位置 */
const windowPosition = ref({ x: 100, y: 100 });

/** 窗口大小 */
const windowSize = ref({ width: 800, height: 600 });

/** 拖拽状态 */
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

/** 调整大小状态 */
const resizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });

// ========================================================================
// 计算属性
// ========================================================================

/** 窗口样式 */
const windowStyle = computed(() => ({
  left: `${windowPosition.value.x}px`,
  top: `${windowPosition.value.y}px`,
  width: `${windowSize.value.width}px`,
  height: `${windowSize.value.height}px`,
}));

/** 提示框样式 */
const tooltipStyle = computed(() => ({
  // 简单实现，实际应该根据鼠标位置动态调整
  bottom: '20px',
  right: '20px',
}));

/** vis-network 配置选项 */
const graphOptions = computed<VisNetworkOptions>(() => ({
  // 可以在这里添加自定义配置
}));

// ========================================================================
// 辅助函数
// ========================================================================

/**
 * 国际化文本
 */
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 获取关联类型标签
 */
function getAssociationLabel(type: AssociationType): string {
  const labels: Record<AssociationType, string> = {
    [AssociationType.REF_LINK]: t('refLink', '链接关系'),
    [AssociationType.HIERARCHY]: t('hierarchy', '层级关系'),
    [AssociationType.TAG]: t('tag', '标签关系'),
    [AssociationType.SIBLING]: t('sibling', '兄弟块'),
  };
  return labels[type] || type;
}

/**
 * 初始化数据服务
 */
function initializeDataService() {
  dataService = new GraphDataService(props.queueInstance);
  console.log('[GraphWindow] Data service initialized');
}

/**
 * 加载图谱数据
 */
async function loadGraphData() {
  if (!dataService) {
    console.warn('[GraphWindow] Data service not initialized');
    return;
  }
  
  try {
    // 🔧 使用 Orbit 图谱数据
    const orbitData = await dataService.getOrbitGraphData();
    
    graphNodes.value = orbitData.nodes;
    graphEdges.value = orbitData.edges;
    orbitPositions.value = orbitData.positions;
    
    // 更新当前节点
    currentNodeId.value = dataService.getCurrentNode();
    
    // 更新高亮节点（历史路径）
    const historyPath = dataService.getHistoryPath();
    highlightedNodes.value = new Set(historyPath);
    
    console.log(`[GraphWindow] Orbit graph data loaded: ${orbitData.nodes.length} nodes, ${orbitData.edges.length} edges, ${orbitData.positions.size} positions`);
  } catch (error) {
    console.error('[GraphWindow] Failed to load graph data:', error);
  }
}

/**
 * 加载配置
 */
function loadConfig() {
  // 加载方向选择
  const savedDirections = storageService.loadDirections();
  selectedDirections.value = savedDirections as Set<AssociationType>;
  
  // 加载窗口配置
  const savedConfig = storageService.loadWindowConfig();
  if (savedConfig) {
    windowPosition.value = savedConfig.position;
    windowSize.value = savedConfig.size;
  } else if (props.initialPosition && props.initialSize) {
    windowPosition.value = props.initialPosition;
    windowSize.value = props.initialSize;
  }
  
  console.log('[GraphWindow] Config loaded');
}

/**
 * 保存配置
 */
function saveConfig() {
  // 保存方向选择
  storageService.saveDirections(selectedDirections.value as Set<string>);
  
  // 保存窗口配置
  const config: WindowConfig = {
    position: windowPosition.value,
    size: windowSize.value,
    visible: props.visible,
  };
  storageService.saveWindowConfig(config);
  
  console.log('[GraphWindow] Config saved');
}

// ========================================================================
// 事件处理
// ========================================================================

/**
 * 处理方向变化
 */
async function handleDirectionChange(directions: Set<AssociationType>) {
  selectedDirections.value = directions;
  await loadGraphData();
  saveConfig();
}

/**
 * 处理节点点击
 */
function handleNodeClick(nodeId: string) {
  console.log('[GraphWindow] Node clicked:', nodeId);
  emit('node-click', nodeId);
}

/**
 * 处理节点悬停
 */
function handleNodeHover(nodeId: string | null) {
  if (nodeId) {
    const node = graphNodes.value.find(n => n.id === nodeId);
    hoveredNode.value = node || null;
  } else {
    hoveredNode.value = null;
  }
}

/**
 * 处理画布点击
 */
function handleCanvasClick() {
  hoveredNode.value = null;
}

/**
 * 处理刷新
 */
async function handleRefresh() {
  await loadGraphData();
}

/**
 * 处理关闭
 */
function handleClose() {
  saveConfig();
  emit('close');
}

/**
 * 🆕 聚焦到当前节点
 * 
 * Requirements: 7.3
 */
function focusCurrentNode() {
  if (!canvasRef.value) {
    console.warn('[GraphWindow] Canvas ref not available');
    return;
  }

  if (currentNodeId.value) {
    canvasRef.value.focusNode(currentNodeId.value);
    console.log('[GraphWindow] Focused on current node:', currentNodeId.value);
  } else {
    console.warn('[GraphWindow] No current node to focus');
  }
}

/**
 * 🆕 显示全览
 * 
 * Requirements: 7.4
 */
function showOverview() {
  if (!canvasRef.value) {
    console.warn('[GraphWindow] Canvas ref not available');
    return;
  }

  const cy = canvasRef.value.getInstance();
  if (!cy) {
    console.warn('[GraphWindow] Cytoscape instance not available');
    return;
  }

  cy.animate({
    fit: { padding: 50 },
    duration: 1000,
    easing: 'ease-in-out-cubic',
  });
  console.log('[GraphWindow] Showing overview');
}

/**
 * 切换面板折叠
 */
function togglePanel() {
  panelCollapsed.value = !panelCollapsed.value;
}

// ========================================================================
// 窗口拖拽
// ========================================================================

/**
 * 开始拖拽
 */
function startDrag(e: MouseEvent) {
  dragging.value = true;
  dragStart.value = {
    x: e.clientX - windowPosition.value.x,
    y: e.clientY - windowPosition.value.y,
  };
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

/**
 * 拖拽中
 */
function onDrag(e: MouseEvent) {
  if (!dragging.value) return;
  
  windowPosition.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y,
  };
}

/**
 * 停止拖拽
 */
function stopDrag() {
  dragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  saveConfig();
}

// ========================================================================
// 窗口调整大小
// ========================================================================

/**
 * 开始调整大小
 */
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

/**
 * 调整大小中
 */
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

/**
 * 停止调整大小
 */
function stopResize() {
  resizing.value = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  saveConfig();
}

// ========================================================================
// 生命周期钩子
// ========================================================================

onMounted(() => {
  // 初始化
  initializeDataService();
  loadConfig();
  loadGraphData();
});

onUnmounted(() => {
  // 清理事件监听器
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
});

// ========================================================================
// 监听 Props 变化
// ========================================================================

watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      // 窗口打开时重新加载数据
      loadGraphData();
    }
  }
);

watch(
  () => props.queueInstance,
  () => {
    // 队列实例变化时重新初始化
    initializeDataService();
    loadGraphData();
  }
);

// ========================================================================
// 暴露方法给父组件
// ========================================================================

defineExpose({
  /**
   * 刷新图谱
   */
  refresh: () => {
    loadGraphData();
  },
  
  /**
   * 聚焦节点
   */
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
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--b3-theme-surface);
  border-bottom: 1px solid var(--b3-border-color);
  cursor: move;
  user-select: none;
}

.window-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}

.window-actions {
  display: flex;
  gap: 4px;
}

.btn-action,
.btn-refresh,
.btn-close {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
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

.window-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 250px;
  border-right: 1px solid var(--b3-border-color);
  overflow-y: auto;
  transition: width 0.2s;
}

.sidebar.collapsed {
  width: 40px;
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
</style>
