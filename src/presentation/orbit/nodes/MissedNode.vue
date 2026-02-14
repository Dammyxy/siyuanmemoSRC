<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

defineProps<{ data: { label: string; assocType: string; reason: string } }>();
</script>

<template>
  <div class="node-missed">
    <Handle type="target" :position="Position.Bottom" />
  </div>
  <div class="label">{{ data.label }}</div>
</template>

<style scoped>
.node-missed {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.6);
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.node-missed:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.8);
}

.label {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
