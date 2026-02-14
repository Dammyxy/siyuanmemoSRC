<script setup lang="ts">
import { ref, onMounted, markRaw, computed, nextTick } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

import { OrbitService } from '@/application/orbit/OrbitService';
import { OrbitDataAdapter } from '@/infrastructure/orbit/OrbitDataAdapter';
import type { AssociationType } from '@/core/queue/neural/types';
import { DIRECTION_LABELS } from '@/domain/orbit/constants';

// 自定义节点组件
import CurrentNode from './nodes/CurrentNode.vue';
import SeedNode from './nodes/SeedNode.vue';
import HistoryNode from './nodes/HistoryNode.vue';
import MissedNode from './nodes/MissedNode.vue';
import DirectionGroupNode from './nodes/DirectionGroupNode.vue';
import CandidateNode from './nodes/CandidateNode.vue';
// 🔧 移除 MoreNode import，不再需要展开/收起按钮

type DirectionMode = 'AUTO' | AssociationType;

const props = defineProps<{
  neuralQueue: any;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'node-click', data: { nodeId: string; nodeType: string }): void;
  (e: 'navigate-to-block', blockId: string): void;
}>();

// Vue Flow 节点类型注册
const nodeTypes = {
  current: markRaw(CurrentNode),
  seed: markRaw(SeedNode),
  history: markRaw(HistoryNode),
  missed: markRaw(MissedNode),
  directionGroup: markRaw(DirectionGroupNode),
  candidate: markRaw(CandidateNode),
  // 🔧 移除 more 节点类型，不再需要 MoreNode 按钮
};

const nodes = ref([]);
const edges = ref([]);
const currentDirection = ref<DirectionMode>('AUTO');
const { fitView, setCenter, getViewport, setViewport } = useVueFlow();

// 展开状态：记录哪些方向已经展开显示更多节点
const expandedDirections = ref<Set<AssociationType>>(new Set());

// 🆕 漫游方向状态管理
// 独占模式：只在此方向漫游（单选，互斥）
const exclusiveDirection = ref<AssociationType | null>(null);

// 包含模式：AUTO + 包含的方向（多选）
const includedDirections = ref<Set<AssociationType>>(new Set());

// 右键菜单状态
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  direction: null as AssociationType | null,
  candidateCount: 0,
});

/**
 * 刷新图谱数据
 *
 * 🔧 修复焦点乱跳：默认不自动调整视野，保持用户当前的缩放和位置
 *
 * @param autoFitView 是否自动调整视野(默认 false)
 */
async function refresh(autoFitView = false) {
  if (!props.neuralQueue) {
    console.warn('[OrbitView] neuralQueue is not provided');
    return;
  }

  try {
    // 🔑 保存当前视野状态（zoom + position）- 在数据请求前保存
    const savedViewport = getViewport();

    const adapter = new OrbitDataAdapter(props.neuralQueue);
    const service = new OrbitService(adapter);

    // 🆕 传递展开状态给服务
    const result = await service.getOrbitVisualization(
      currentDirection.value,
      Array.from(expandedDirections.value)
    );

    // 🔧 为 DirectionGroupNode 添加展开状态标记
    result.nodes = result.nodes.map(node => {
      if (node.type === 'directionGroup' && node.data?.direction) {
        const isExpanded = expandedDirections.value.has(node.data.direction as AssociationType);
        return {
          ...node,
          data: {
            ...node.data,
            isExpanded,
          },
        };
      }
      return node;
    });

    // 过滤掉无效坐标的节点
    const validNodes = result.nodes.filter(n =>
      !isNaN(n.position.x) && !isNaN(n.position.y)
    );

    // 同步过滤边，移除悬空连线
    const validNodeIds = new Set(validNodes.map(n => n.id));
    const validEdges = result.edges.filter(e =>
      validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );

    nodes.value = validNodes;
    edges.value = validEdges;

    // 🔧 使用 nextTick 替代 setTimeout，减少视觉跳变
    await nextTick();

    if (autoFitView) {
      // 自动调整视野（仅在首次加载或用户明确请求时）
      fitView({ padding: 0.2, duration: 300 });
    } else {
      // 🔑 立即恢复视口，不使用延迟
      setViewport(savedViewport, { duration: 0 });
    }
  } catch (error) {
    console.error('[OrbitView] Failed to refresh:', error);
  }
}

async function handleSwitchDirection(newDirection: DirectionMode) {
  const adapter = new OrbitDataAdapter(props.neuralQueue);
  const service = new OrbitService(adapter);

  await service.switchDirection(currentDirection.value, newDirection);
  currentDirection.value = newDirection;
  await refresh(false); // ← 禁用自动 fitView，保持用户设置的缩放
}

/**
 * 切换方向展开/收起状态
 */
function toggleDirectionExpand(direction: AssociationType) {
  if (expandedDirections.value.has(direction)) {
    expandedDirections.value.delete(direction);
    console.log(`[OrbitView] Collapsed direction: ${direction}`);
  } else {
    expandedDirections.value.add(direction);
    console.log(`[OrbitView] Expanded direction: ${direction}`);
  }
  // 重新计算布局，不自动调整视野
  refresh(false);
}

/**
 * 左键点击事件处理
 * 🆕 新行为：左键点击 DirectionGroupNode → 展开/收起候选列表
 */
function handleNodeClick(event: { node: any }) {
  const { id, type, data } = event.node;

  // 🔧 调试日志
  console.log('[OrbitView] handleNodeClick called:', { id, type, data });

  // 关闭右键菜单（如果打开）
  closeContextMenu();

  // 🆕 如果点击关系大节点，展开/收起候选列表（而不是切换方向）
  if (type === 'directionGroup' && data?.direction) {
    console.log('[OrbitView] DirectionGroupNode clicked, direction:', data.direction);
    toggleDirectionExpand(data.direction as AssociationType);
    return; // ← 提前返回，不发射事件
  }

  // 🔧 移除 MoreNode 的处理逻辑，不再需要

  // 获取真实的块ID（历史/种子/当前节点使用 data.blockId，候选节点直接使用 id）
  const blockId = (type === 'history' || type === 'seed' || type === 'current')
    ? data?.blockId
    : id;

  // 发射节点点击事件（排除 directionGroup）
  if (type !== 'directionGroup') {
    emit('node-click', { nodeId: blockId, nodeType: type });
  }

  // 左键点击候选/种子/历史节点 → 导航到该块（跳转位置）
  if (type === 'candidate' || type === 'history' || type === 'seed') {
    emit('navigate-to-block', blockId);
  }
}

/**
 * 右键点击事件处理
 * 只对 DirectionGroupNode 显示上下文菜单
 */
function handleNodeContextMenu(event: { event: MouseEvent; node: any }) {
  const { node } = event;
  const { type, data } = node;

  // 🔧 调试日志
  console.log('[OrbitView] handleNodeContextMenu called:', { type, data });

  // 只对 DirectionGroupNode 显示右键菜单
  if (type === 'directionGroup' && data?.direction) {
    event.event.preventDefault();
    event.event.stopPropagation();

    const direction = data.direction as AssociationType;
    const isExpanded = expandedDirections.value.has(direction);

    contextMenu.value = {
      visible: true,
      x: event.event.clientX,
      y: event.event.clientY,
      direction,
      candidateCount: data.count || 0,
      nodeType: 'directionGroup',
      blockId: '',
    };

    console.log(`[OrbitView] Context menu opened for direction: ${direction}, expanded: ${isExpanded}`);
  }
}

/**
 * 关闭右键菜单
 */
function closeContextMenu() {
  if (contextMenu.value.visible) {
    contextMenu.value.visible = false;
    contextMenu.value.direction = null;
  }
}

/**
 * 处理右键菜单操作
 */
async function handleContextMenuAction(action: string) {
  const { direction } = contextMenu.value;
  if (!direction) return;

  switch (action) {
    case 'exclusive':
      // 只在此方向漫游（单选，互斥）
      exclusiveDirection.value = direction;
      includedDirections.value.clear();  // 清除包含模式
      await handleSwitchDirection(direction);
      console.log(`[OrbitView] Set exclusive direction: ${direction}`);
      break;

    case 'include':
      // 漫游包含此方向（复选，多选）
      if (includedDirections.value.has(direction)) {
        includedDirections.value.delete(direction);
      } else {
        includedDirections.value.add(direction);
      }
      exclusiveDirection.value = null;  // 清除独占模式

      // TODO: 通知 OrbitService 更新 autoModeDirections
      console.log(`[OrbitView] Toggle included direction: ${direction}, included:`, Array.from(includedDirections.value));

      // 如果有包含的方向，切换到 AUTO 模式
      if (includedDirections.value.size > 0) {
        await handleSwitchDirection('AUTO');
      }
      break;

    case 'toggle':
      // 展开/收起候选列表
      toggleDirectionExpand(direction);
      break;
  }

  closeContextMenu();
}

// 监听全局点击事件，关闭右键菜单
function handleGlobalClick(event: MouseEvent) {
  // 如果点击的不是右键菜单，则关闭
  const target = event.target as HTMLElement;
  if (!target.closest('.context-menu')) {
    closeContextMenu();
  }
}

onMounted(() => {
  refresh(false);
  // 添加全局点击监听
  document.addEventListener('click', handleGlobalClick);
});

// 组件卸载时移除监听
import { onUnmounted } from 'vue';
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});

defineExpose({
  refresh,
  fitView: (options?: any) => {
    // 支持自定义 fitView 选项（如聚焦特定节点）
    if (options) {
      fitView(options);
    } else {
      fitView({ padding: 0.2 });
    }
  },
  // 🆕 只移动视野中心，不改变缩放级别
  panToNode: (nodeId: string) => {
    const node = nodes.value.find(n => n.id === nodeId);
    if (node) {
      setCenter(node.position.x, node.position.y, { duration: 500 });
    }
  }
});
</script>

<template>
  <div class="orbit-view">
    <!-- 区域标注 -->
    <div class="region-label missed-label">Missed Blocks</div>
    <div class="region-label track-label">Orbit Track</div>

    <!-- Vue Flow 画布 -->
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :pan-on-scroll="true"
      :zoom-on-scroll="true"
      :min-zoom="0.2"
      :max-zoom="2"
      :fit-view-on-init="false"
      :prevent-scrolling="true"
      @node-click="handleNodeClick"
      @node-contextmenu="handleNodeContextMenu"
    >
      <Background variant="dots" :gap="20" :size="1" pattern-color="rgba(100,149,237,0.15)" />
    </VueFlow>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <!-- 只在此方向漫游（单选，互斥） -->
      <div
        class="menu-item"
        :class="{ 'menu-item-selected': exclusiveDirection === contextMenu.direction }"
        @click="handleContextMenuAction('exclusive')"
      >
        <span class="menu-radio">{{ exclusiveDirection === contextMenu.direction ? '●' : '○' }}</span>
        <span class="menu-text">只在此方向漫游</span>
      </div>

      <!-- 漫游包含此方向（复选，多选） -->
      <div
        class="menu-item"
        :class="{ 'menu-item-selected': includedDirections.has(contextMenu.direction) }"
        @click="handleContextMenuAction('include')"
      >
        <span class="menu-checkbox">{{ includedDirections.has(contextMenu.direction) ? '☑' : '☐' }}</span>
        <span class="menu-text">漫游包含此方向</span>
        <span class="menu-count">({{ contextMenu.candidateCount }}个)</span>
      </div>

      <div class="menu-divider"></div>

      <!-- 展开/收起候选 -->
      <div class="menu-item" @click="handleContextMenuAction('toggle')">
        <span class="menu-icon">
          {{ expandedDirections.has(contextMenu.direction) ? '📁' : '📂' }}
        </span>
        <span class="menu-text">
          {{ expandedDirections.has(contextMenu.direction) ? '收起候选' : '展开候选' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orbit-view {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: linear-gradient(180deg, #0d1521 0%, #1a2332 100%);
  position: relative;
}

.direction-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 400px;
}

.direction-btn {
  padding: 8px 16px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid var(--btn-color);
  color: var(--btn-color);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}

.direction-btn:hover {
  background: rgba(var(--btn-color), 0.2);
  box-shadow: 0 0 12px var(--btn-color);
}

/* 区域标注样式 - 固定在视口，不随画布移动 */
.region-label {
  position: fixed;  /* 改为 fixed，相对于视口定位 */
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 1px;
  pointer-events: none;
  z-index: 1000;  /* 提高层级，确保在 Vue Flow 之上 */
}

.missed-label {
  top: 60px;  /* 距离顶部一定距离 */
  left: 50%;
  transform: translateX(-50%);
}

.track-label {
  top: 50%;
  left: 20px;
  transform: translateY(-50%);
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: rgba(20, 25, 35, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  min-width: 200px;
  padding: 8px;
  animation: menuFadeIn 0.15s ease-out;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(2px);
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.menu-text {
  flex: 1;
}

.menu-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
}

.menu-shortcut {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

/* 单选和复选按钮样式 */
.menu-radio,
.menu-checkbox {
  font-size: 14px;
  width: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

/* 选中状态的菜单项 */
.menu-item-selected {
  background: rgba(100, 149, 237, 0.15);
}

.menu-item-selected .menu-radio,
.menu-item-selected .menu-checkbox {
  color: #6495ED;
}
</style>
