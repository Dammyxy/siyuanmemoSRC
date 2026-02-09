<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { computed } from 'vue';
import { DIRECTION_COLORS, DIRECTION_LABELS } from '@/domain/orbit/constants';

const props = defineProps<{
  data: { direction: string; count: number };
}>();

const color = computed(() => DIRECTION_COLORS[props.data.direction as keyof typeof DIRECTION_COLORS] || '#666');
const label = computed(() => DIRECTION_LABELS[props.data.direction as keyof typeof DIRECTION_LABELS] || props.data.direction);
</script>

<template>
  <div class="direction-group-node" :style="{ '--direction-color': color }">
    <div class="group-header">
      <span class="direction-label">{{ label }}</span>
      <span class="count-badge">{{ data.count }}</span>
    </div>
    <Handle type="target" :position="Position.Top" />
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.direction-group-node {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--direction-color);
  opacity: 0.9;
  border: 3px solid var(--direction-color);
  box-shadow: 0 0 15px var(--direction-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.direction-group-node:hover {
  transform: scale(1.1);
  box-shadow: 0 0 25px var(--direction-color);
}

.group-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.direction-label {
  font-size: 13px;
  font-weight: 600;
  color: white;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.count-badge {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}
</style>
