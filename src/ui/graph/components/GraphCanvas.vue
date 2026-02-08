<template>
  <div class="graph-canvas-container" @contextmenu.prevent="handleContextMenu">
    <!-- vis-network 瀹瑰櫒 -->
    <div ref="canvasRef" class="graph-canvas"></div>
    
    <!-- 鍔犺浇鎸囩ず鍣?-->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ t('loading', '鍔犺浇涓?..') }}</span>
    </div>
    
    <!-- 閿欒鎻愮ず -->
    <div v-if="error" class="error-overlay">
      <span class="error-icon">鈿狅笍</span>
      <span>{{ error }}</span>
      <button class="btn-retry" @click="handleRetry">{{ t('retry', '閲嶈瘯') }}</button>
    </div>

        <!-- Context menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="handleSetSeed">
        {{ t('setSeed', '设为种子') }}
      </div>
      <div class="menu-item" @click="handleNavigateToBlock">
        {{ t('navigateTo', '跳转到此块') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { GraphNode, GraphEdge, VisNetworkOptions } from '../types/graph';
import { CytoscapeOrbitRenderer, type OrbitGraphData } from '../services/CytoscapeOrbitRenderer';

/**
 * Props 瀹氫箟
 */
const props = defineProps<{
  /** 鑺傜偣鏁版嵁 */
  nodes: GraphNode[];
  /** 杈规暟鎹?*/
  edges: GraphEdge[];
  /** vis-network 閰嶇疆閫夐」 */
  options?: VisNetworkOptions;
  /** 楂樹寒鑺傜偣闆嗗悎 */
  highlightedNodes?: Set<string>;
  /** 褰撳墠鑺傜偣 ID */
  currentNode?: string | null;
  /** 鍥介檯鍖栨枃鏈?*/
  i18n?: Record<string, string>;
  /** 馃啎 Orbit 甯冨眬浣嶇疆鏄犲皠锛堣妭鐐笽D -> {x, y}锛?*/
  orbitPositions?: Map<string, { x: number; y: number }>;
}>();

/**
 * Emits 瀹氫箟
 */
const emit = defineEmits<{
  (e: 'node-click', nodeId: string): void;
  (e: 'node-hover', nodeId: string | null): void;
  (e: 'canvas-click'): void;
  (e: 'set-seed', nodeId: string): void;  // 馃啎 璁剧疆绉嶅瓙鍧椾簨浠?
  (e: 'navigate-to-block', nodeId: string): void;  // 馃啎 瀵艰埅鍒板潡浜嬩欢
}>();

// ========================================================================
// 鍝嶅簲寮忕姸鎬?
// ========================================================================

/** Canvas 瀹瑰櫒寮曠敤 */
const canvasRef = ref<HTMLElement | null>(null);

/** Renderer instance (Cytoscape) */
let renderer: CytoscapeOrbitRenderer | null = null;
let pendingUpdate: number | null = null;

/** 鍔犺浇鐘舵€?*/
const loading = ref(false);

/** 閿欒淇℃伅 */
const error = ref<string | null>(null);

/** 馃啎 鍙抽敭鑿滃崟鐘舵€?*/
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  nodeId: null as string | null,
});

// ========================================================================
// 杈呭姪鍑芥暟
// ========================================================================

/**
 * 鍥介檯鍖栨枃鏈?
 */
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 鍒濆鍖栧浘璋?
 */
function scheduleUpdate() {
  if (pendingUpdate !== null) return;
  pendingUpdate = requestAnimationFrame(() => {
    pendingUpdate = null;
    updateGraphData();
  });
}

function initializeGraph() {
  if (!canvasRef.value) {
    console.warn('[GraphCanvas] Canvas ref not available');
    return;
  }
  
  try {
    loading.value = true;
    error.value = null;
    
    // 馃敡 鍒涘缓 Cytoscape 娓叉煋鍣?
    renderer = new CytoscapeOrbitRenderer();
    
    // 娓叉煋鍥捐氨
    scheduleUpdate();
    
    // 缁戝畾浜嬩欢
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
 * 鏇存柊鍥捐氨鏁版嵁
 */
function updateGraphData() {
  if (!renderer || !canvasRef.value) {
    console.warn('[GraphCanvas] Renderer or canvas not available');
    return;
  }
  
  try {
    // 馃敡 鏋勫缓 Orbit 鍥捐氨鏁版嵁
    const graphData: OrbitGraphData = {
      nodes: props.nodes,
      edges: props.edges,
      positions: props.orbitPositions || new Map(),
    };
    
    // 馃敡 浣跨敤 Cytoscape 娓叉煋
    renderer.render(canvasRef.value, graphData, props.currentNode || undefined);
  } catch (err) {
    console.error('[GraphCanvas] Failed to update graph data:', err);
    error.value = err instanceof Error ? err.message : '图谱初始化失败';
  }
}

/**
 * 缁戝畾浜嬩欢鐩戝惉鍣?
 */
function bindEvents() {
  if (!canvasRef.value) return;
  
  // 馃敡 鐩戝惉 Cytoscape 鑷畾涔変簨浠?
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
 * 馃啎 澶勭悊鑺傜偣鐐瑰嚮
 * 
 * 鏍规嵁鑺傜偣绫诲瀷鎵ц涓嶅悓鐨勬搷浣滐細
 * - history/seed: 鐩存帴璺宠浆
 * - candidate/missed: 鏄剧ず閫夐」锛堣烦杞垨璁句负绉嶅瓙锛?
 */
function handleNodeClick(nodeId: string, nodeType: string) {
  if (nodeType === 'history' || nodeType === 'seed') {
    // 鍘嗗彶鑺傜偣鍜岀瀛愬潡锛氱洿鎺ヨ烦杞?
    emit('navigate-to-block', nodeId);
  } else if (nodeType === 'candidate' || nodeType === 'missed') {
    // 鍊欓€夎妭鐐瑰拰閬楄惤鍧楋細瑙﹀彂鐐瑰嚮浜嬩欢锛堢敱鐖剁粍浠跺喅瀹氳涓猴級
    emit('node-click', nodeId);
  } else {
    // 鍏朵粬鑺傜偣锛氶粯璁よ涓?
    emit('node-click', nodeId);
  }
}

/**
 * 馃啎 澶勭悊鍙抽敭鑿滃崟
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
 * 馃啎 璁剧疆绉嶅瓙鍧?
 */
function handleSetSeed() {
  if (contextMenu.value.nodeId) {
    emit('set-seed', contextMenu.value.nodeId);
  }
  contextMenu.value.visible = false;
}

/**
 * 馃啎 瀵艰埅鍒板潡
 */
function handleNavigateToBlock() {
  if (contextMenu.value.nodeId) {
    emit('navigate-to-block', contextMenu.value.nodeId);
  }
  contextMenu.value.visible = false;
}

/**
 * 閲嶈瘯鍒濆鍖?
 */
function handleRetry() {
  error.value = null;
  initializeGraph();
}

// ========================================================================
// 鐢熷懡鍛ㄦ湡閽╁瓙
// ========================================================================

onMounted(() => {
  // 寤惰繜鍒濆鍖栵紝纭繚 DOM 宸叉覆鏌?
  setTimeout(() => {
    initializeGraph();
  }, 100);
});

onUnmounted(() => {
  // 娓呯悊璧勬簮
  if (pendingUpdate !== null) {
    cancelAnimationFrame(pendingUpdate);
    pendingUpdate = null;
  }
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
});

// ========================================================================
// 鐩戝惉 Props 鍙樺寲
// ========================================================================

watch(
  () => [props.nodes, props.edges, props.orbitPositions],
  () => {
    if (renderer) {
      scheduleUpdate();
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
// 鏆撮湶鏂规硶缁欑埗缁勪欢
// ========================================================================

defineExpose({
  /**
   * 鑱氱劍鑺傜偣
   */
  focusNode: (nodeId: string) => {
    renderer?.focusNode(nodeId);
  },
  
  /**
   * 鑾峰彇娓叉煋鍣ㄥ疄渚?
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

/* 馃啎 鍙抽敭鑿滃崟鏍峰紡 */
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
