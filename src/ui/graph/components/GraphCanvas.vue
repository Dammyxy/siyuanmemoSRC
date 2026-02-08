<template>
  <div class="graph-canvas-container" @contextmenu.prevent="handleContextMenu">
    <!-- vis-network 容器 -->
    <div ref="canvasRef" class="graph-canvas"></div>
    
    <!-- 加载指示器 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ t('loading', '加载中...') }}</span>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="error" class="error-overlay">
      <span class="error-icon">⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-retry" @click="handleRetry">{{ t('retry', '重试') }}</button>
    </div>

    <!-- 🆕 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="handleSetSeed">
        🌱 {{ t('setSeed', '设为种子块') }}
      </div>
      <div class="menu-item" @click="handleNavigateToBlock">
        🔗 {{ t('navigateTo', '跳转到此块') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { GraphNode, GraphEdge, VisNetworkOptions } from '../types/graph';
import { CytoscapeOrbitRenderer, type OrbitGraphData } from '../services/CytoscapeOrbitRenderer';

/**
 * Props 定义
 */
const props = defineProps<{
  /** 节点数据 */
  nodes: GraphNode[];
  /** 边数据 */
  edges: GraphEdge[];
  /** vis-network 配置选项 */
  options?: VisNetworkOptions;
  /** 高亮节点集合 */
  highlightedNodes?: Set<string>;
  /** 当前节点 ID */
  currentNode?: string | null;
  /** 国际化文本 */
  i18n?: Record<string, string>;
  /** 🆕 Orbit 布局位置映射（节点ID -> {x, y}） */
  orbitPositions?: Map<string, { x: number; y: number }>;
}>();

/**
 * Emits 定义
 */
const emit = defineEmits<{
  (e: 'node-click', nodeId: string): void;
  (e: 'node-hover', nodeId: string | null): void;
  (e: 'canvas-click'): void;
  (e: 'set-seed', nodeId: string): void;  // 🆕 设置种子块事件
  (e: 'navigate-to-block', nodeId: string): void;  // 🆕 导航到块事件
}>();

// ========================================================================
// 响应式状态
// ========================================================================

/** Canvas 容器引用 */
const canvasRef = ref<HTMLElement | null>(null);

/** 🔧 渲染器实例（使用 Cytoscape）*/
let renderer: CytoscapeOrbitRenderer | null = null;

/** 加载状态 */
const loading = ref(false);

/** 错误信息 */
const error = ref<string | null>(null);

/** 🆕 右键菜单状态 */
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  nodeId: null as string | null,
});

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
 * 初始化图谱
 */
function initializeGraph() {
  if (!canvasRef.value) {
    console.warn('[GraphCanvas] Canvas ref not available');
    return;
  }
  
  try {
    loading.value = true;
    error.value = null;
    
    // 🔧 创建 Cytoscape 渲染器
    renderer = new CytoscapeOrbitRenderer();
    
    // 渲染图谱
    updateGraphData();
    
    // 绑定事件
    bindEvents();
    
    loading.value = false;
    
    console.log('[GraphCanvas] Graph initialized with Cytoscape');
  } catch (err) {
    console.error('[GraphCanvas] Failed to initialize graph:', err);
    error.value = err instanceof Error ? err.message : '图谱初始化失败';
    loading.value = false;
  }
}

/**
 * 更新图谱数据
 */
function updateGraphData() {
  if (!renderer || !canvasRef.value) {
    console.warn('[GraphCanvas] Renderer or canvas not available');
    return;
  }
  
  try {
    // 🔧 构建 Orbit 图谱数据
    const graphData: OrbitGraphData = {
      nodes: props.nodes,
      edges: props.edges,
      positions: props.orbitPositions || new Map(),
    };
    
    // 🔧 使用 Cytoscape 渲染
    renderer.render(canvasRef.value, graphData, props.currentNode || undefined);
  } catch (err) {
    console.error('[GraphCanvas] Failed to update graph data:', err);
    error.value = err instanceof Error ? err.message : '图谱更新失败';
  }
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
  if (!canvasRef.value) return;
  
  // 🔧 监听 Cytoscape 自定义事件
  canvasRef.value.addEventListener('orbit-node-click', ((event: CustomEvent) => {
    handleNodeClick(event.detail.nodeId, event.detail.nodeType);
  }) as EventListener);

  canvasRef.value.addEventListener('orbit-node-contextmenu', ((event: CustomEvent) => {
    handleContextMenu(event.detail);
  }) as EventListener);

  canvasRef.value.addEventListener('orbit-canvas-click', (() => {
    emit('canvas-click');
    contextMenu.value.visible = false;
  }) as EventListener);
}

/**
 * 🆕 处理节点点击
 * 
 * 根据节点类型执行不同的操作：
 * - history/seed: 直接跳转
 * - candidate/missed: 显示选项（跳转或设为种子）
 */
function handleNodeClick(nodeId: string, nodeType: string) {
  if (nodeType === 'history' || nodeType === 'seed') {
    // 历史节点和种子块：直接跳转
    emit('navigate-to-block', nodeId);
  } else if (nodeType === 'candidate' || nodeType === 'missed') {
    // 候选节点和遗落块：触发点击事件（由父组件决定行为）
    emit('node-click', nodeId);
  } else {
    // 其他节点：默认行为
    emit('node-click', nodeId);
  }
}

/**
 * 🆕 处理右键菜单
 */
function handleContextMenu(detail: { nodeId: string; nodeType: string; x: number; y: number }) {
  contextMenu.value = {
    visible: true,
    x: detail.x,
    y: detail.y,
    nodeId: detail.nodeId,
  };
}

/**
 * 🆕 设置种子块
 */
function handleSetSeed() {
  if (contextMenu.value.nodeId) {
    emit('set-seed', contextMenu.value.nodeId);
  }
  contextMenu.value.visible = false;
}

/**
 * 🆕 导航到块
 */
function handleNavigateToBlock() {
  if (contextMenu.value.nodeId) {
    emit('navigate-to-block', contextMenu.value.nodeId);
  }
  contextMenu.value.visible = false;
}

/**
 * 重试初始化
 */
function handleRetry() {
  error.value = null;
  initializeGraph();
}

// ========================================================================
// 生命周期钩子
// ========================================================================

onMounted(() => {
  // 延迟初始化，确保 DOM 已渲染
  setTimeout(() => {
    initializeGraph();
  }, 100);
});

onUnmounted(() => {
  // 清理资源
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
});

// ========================================================================
// 监听 Props 变化
// ========================================================================

watch(
  () => [props.nodes, props.edges, props.orbitPositions],
  () => {
    if (renderer) {
      updateGraphData();
    }
  },
  { deep: true }
);

watch(
  () => props.currentNode,
  (newNode) => {
    if (renderer && newNode) {
      renderer.focusNode(newNode);
    }
  }
);

// ========================================================================
// 暴露方法给父组件
// ========================================================================

defineExpose({
  /**
   * 聚焦节点
   */
  focusNode: (nodeId: string) => {
    renderer?.focusNode(nodeId);
  },
  
  /**
   * 获取渲染器实例
   */
  getInstance: () => {
    return renderer?.getInstance();
  },
});
</script>

<style scoped>
.graph-canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.graph-canvas {
  width: 100%;
  height: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(var(--b3-theme-background-rgb), 0.9);
  backdrop-filter: blur(4px);
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--b3-border-color);
  border-top-color: var(--b3-theme-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-overlay {
  color: var(--b3-theme-error);
}

.error-icon {
  font-size: 48px;
}

.btn-retry {
  padding: 6px 16px;
  border: 1px solid var(--b3-theme-error);
  border-radius: 4px;
  background: var(--b3-theme-error);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-retry:hover {
  filter: brightness(1.1);
}

/* 🆕 右键菜单样式 */
.context-menu {
  position: fixed;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 160px;
  z-index: 1000;
}

.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: var(--b3-theme-on-surface);
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--b3-list-hover);
}

.menu-item:active {
  background: var(--b3-list-active);
}
</style>
