<script setup lang="ts">
import { ref, onMounted, markRaw, computed } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

import { OrbitService } from '@/application/orbit/OrbitService';
import { OrbitDataAdapter } from '@/infrastructure/orbit/OrbitDataAdapter';
import type { AssociationType } from '@/core/queue/neural/types';

// 自定义节点组件
import CurrentNode from './nodes/CurrentNode.vue';
import SeedNode from './nodes/SeedNode.vue';
import HistoryNode from './nodes/HistoryNode.vue';
import MissedNode from './nodes/MissedNode.vue';
import DirectionGroupNode from './nodes/DirectionGroupNode.vue';
import CandidateNode from './nodes/CandidateNode.vue';

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
};

const nodes = ref([]);
const edges = ref([]);
const currentDirection = ref<DirectionMode>('AUTO');
const { fitView } = useVueFlow();

// 方向按钮配置
const directionButtons = [
  { key: 'AUTO' as const, label: '🤖 自动', color: '#999' },
  { key: 'REF_LINK' as const, label: '🔗 引用', color: '#2196F3' },
  { key: 'HIERARCHY' as const, label: '📂 同文档', color: '#FF9800' },
  { key: 'TAG' as const, label: '🏷️ 标签', color: '#9C27B0' },
  { key: 'SIBLING' as const, label: '👥 兄弟', color: '#00BCD4' },
];

const isActiveDirection = (dir: DirectionMode) => currentDirection.value === dir;

async function refresh() {
  if (!props.neuralQueue) {
    console.warn('[OrbitView] neuralQueue is not provided');
    return;
  }

  try {
    const adapter = new OrbitDataAdapter(props.neuralQueue);
    const service = new OrbitService(adapter);
    const result = await service.getOrbitVisualization(currentDirection.value);

    // 过滤掉无效坐标的节点
    nodes.value = result.nodes.filter(n =>
      !isNaN(n.position.x) && !isNaN(n.position.y)
    );
    edges.value = result.edges;

    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
  } catch (error) {
    console.error('[OrbitView] Failed to refresh:', error);
  }
}

async function handleSwitchDirection(newDirection: DirectionMode) {
  const adapter = new OrbitDataAdapter(props.neuralQueue);
  const service = new OrbitService(adapter);

  await service.switchDirection(currentDirection.value, newDirection);
  currentDirection.value = newDirection;
  await refresh();
}

function handleNodeClick(event: { node: any }) {
  const { id, type } = event.node;

  // 发射节点点击事件
  emit('node-click', { nodeId: id, nodeType: type });

  // 如果点击候选节点或关系大节点，导航到该块
  if (type === 'candidate' || type === 'history' || type === 'seed') {
    emit('navigate-to-block', id);
  }

  // 如果点击关系大节点，切换到该方向
  if (type === 'directionGroup' && event.node.data?.direction) {
    handleSwitchDirection(event.node.data.direction);
  }
}

onMounted(refresh);

defineExpose({ refresh, fitView: () => fitView({ padding: 0.2 }) });
</script>

<template>
  <div class="orbit-view">
    <!-- 方向控制面板 -->
    <div class="direction-toolbar">
      <button
        v-for="btn in directionButtons"
        :key="btn.key"
        class="direction-btn"
        :class="{ active: isActiveDirection(btn.key) }"
        :style="{ '--btn-color': btn.color }"
        @click="handleSwitchDirection(btn.key)"
      >
        {{ btn.label }}
      </button>
    </div>

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
      @node-click="handleNodeClick"
    >
      <Background variant="dots" :gap="20" :size="1" pattern-color="rgba(100,149,237,0.15)" />
    </VueFlow>
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

.direction-btn.active {
  background: var(--btn-color);
  color: white;
  box-shadow: 0 0 16px var(--btn-color);
}
</style>
