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
    <span class="content-label">{{ data.label }}</span>
    <Handle type="target" :position="Position.Top" />
  </div>
  <div class="type-badge" :style="{ backgroundColor: color }">{{ typeLabel }}</div>
</template>

<style scoped>
.node-candidate {
  position: relative;
  min-width: 80px;
  max-width: 120px;
  height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--candidate-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.node-candidate:hover {
  transform: scale(1.05);
  box-shadow: 0 0 12px var(--candidate-color);
  background: rgba(255, 255, 255, 0.1);
}

.content-label {
  font-size: 12px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.type-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 600;
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>
