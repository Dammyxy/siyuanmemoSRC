<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { computed } from 'vue';
import { DIRECTION_COLORS, DIRECTION_LABELS } from '@/domain/orbit/constants';

const props = defineProps<{
  data: { label: string; assocType: string; reason: string };
}>();

const color = computed(() => DIRECTION_COLORS[props.data.assocType as keyof typeof DIRECTION_COLORS] || '#666');
const typeLabel = computed(() => DIRECTION_LABELS[props.data.assocType as keyof typeof DIRECTION_LABELS] || props.data.assocType);
</script>

<template>
  <div class="node-candidate" :style="{ '--candidate-color': color }">
    <span class="type-label">{{ typeLabel }}</span>
    <Handle type="target" :position="Position.Top" />
  </div>
  <div class="label" :style="{ color }">{{ data.label }}</div>
</template>

<style scoped>
.node-candidate {
  position: relative;
  min-width: 60px;
  height: 28px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(var(--candidate-color), 0.15);
  border: 2px solid var(--candidate-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.node-candidate:hover {
  transform: scale(1.1);
  box-shadow: 0 0 12px var(--candidate-color);
  background: rgba(255, 255, 255, 0.05);
}

.type-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--candidate-color);
}

.label {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
