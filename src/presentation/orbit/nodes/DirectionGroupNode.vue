<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { computed } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { DIRECTION_COLORS, DIRECTION_LABELS } from '@/domain/orbit/constants';

const props = defineProps<{
  data: { direction: string; count: number; isExpanded?: boolean };
}>();

const color = computed(() => DIRECTION_COLORS[props.data.direction as keyof typeof DIRECTION_COLORS] || '#666');
const label = computed(() => DIRECTION_LABELS[props.data.direction as keyof typeof DIRECTION_LABELS] || props.data.direction);
const isExpanded = computed(() => props.data.isExpanded === true);
</script>

<template>
  <div
    class="direction-group-node"
    :class="{ 'is-expanded': isExpanded }"
    :style="{ '--direction-color': color }"
  >
    <div class="group-header">
      <span class="direction-label">{{ label }}</span>
      <span class="count-badge">{{ data.count }}</span>
    </div>

    <!-- 展开状态指示器 -->
    <ChevronDown
      v-if="isExpanded"
      class="expand-indicator"
      :size="14"
      :stroke-width="3"
    />

    <Handle type="target" :position="Position.Top" class="node-handle" />
    <Handle type="source" :position="Position.Bottom" class="node-handle" />
  </div>
</template>

<style scoped>
.direction-group-node {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--direction-color);
  box-shadow: 0 0 10px var(--direction-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
  position: relative;
  pointer-events: auto;  /* 🔧 确保节点能接收点击事件 */
}

.direction-group-node:hover {
  transform: scale(1.08);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 15px var(--direction-color);
}

/* 展开状态：更强的视觉反馈 */
.direction-group-node.is-expanded {
  border-width: 3px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow:
    0 0 20px var(--direction-color),
    0 0 30px var(--direction-color),
    inset 0 0 15px rgba(255, 255, 255, 0.1);
}

.direction-group-node.is-expanded:hover {
  box-shadow:
    0 0 25px var(--direction-color),
    0 0 40px var(--direction-color),
    inset 0 0 20px rgba(255, 255, 255, 0.15);
}

.group-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: 1;
  pointer-events: none;  /* 🔧 让点击穿透到父节点 */
}

.direction-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--direction-color);
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}

.count-badge {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
}

/* Handle 不拦截点击事件 - 让点击穿透到节点 */
.node-handle {
  pointer-events: none;
}

/* 展开指示器 */
.expand-indicator {
  position: absolute;
  bottom: 4px;
  color: var(--direction-color);
  animation: bounce 1.5s ease-in-out infinite;
  filter: drop-shadow(0 0 3px var(--direction-color));
  pointer-events: none;  /* 不拦截点击 */
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(3px);
  }
}
</style>
