<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { Circle } from 'lucide-vue-next';

defineProps<{ data: { label: string } }>();
</script>

<template>
  <div class="node-history">
    <Circle class="icon" :size="16" :fill="'currentColor'" />
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
  <div class="label">{{ data.label }}</div>
</template>

<style scoped>
.node-history {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4a90d9 0%, #7c4dff 100%);
  border: 2px solid #00bcd4;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 8px rgba(0, 188, 212, 0.6),
    0 0 16px rgba(0, 188, 212, 0.3);
  transition: transform 0.2s;
  cursor: pointer;
}

.node-history:hover {
  transform: scale(1.2);
}

.icon {
  color: white;
}

.label {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
