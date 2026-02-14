<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { Sprout } from 'lucide-vue-next';

defineProps<{ data: { label: string } }>();
</script>

<template>
  <div class="node-seed">
    <Sprout class="icon" :size="24" />
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
  <div class="label">{{ data.label }}</div>
</template>

<style scoped>
.node-seed {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
  border: 4px solid #00e5ff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 15px rgba(0, 229, 255, 0.6),
    0 0 30px rgba(0, 229, 255, 0.3);
}

.icon {
  color: white;
}

.label {
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 500;
  color: #4CAF50;
  text-shadow: 0 0 6px rgba(76, 175, 80, 0.6);
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
