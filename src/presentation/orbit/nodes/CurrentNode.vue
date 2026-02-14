<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { Zap } from 'lucide-vue-next';

defineProps<{ data: { label: string } }>();
</script>

<template>
  <div class="node-current">
    <div class="ring ring-outer"></div>
    <div class="ring ring-inner"></div>
    <Zap class="icon" :size="32" />
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Bottom" />
  </div>
  <div class="label">{{ data.label }}</div>
</template>

<style scoped>
.node-current {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffe066 0%, #ffb700 50%, #ff8c00 100%);
  border: 3px solid rgba(255, 215, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 20px rgba(255, 215, 0, 0.8),
    0 0 40px rgba(255, 215, 0, 0.5),
    0 0 60px rgba(255, 215, 0, 0.3);
  animation: pulse 2s ease-in-out infinite;
}

.icon {
  color: #1a1a2e;
  z-index: 1;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
    box-shadow: 0 0 30px #ffd700, 0 0 60px #ffd700;
  }
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid rgba(255, 215, 0, 0.6);  /* 增强可见度: 0.3 → 0.6 */
  animation: rotate 4s linear infinite;
}

.ring-outer {
  width: 110px;
  height: 110px;
}

.ring-inner {
  width: 130px;
  height: 130px;
  animation-direction: reverse;
  animation-duration: 6s;
}

/* 增加第三层光环 - 更强的视觉效果 */
.node-current::after {
  content: '';
  position: absolute;
  width: 140px;
  height: 140px;
  border: 1px solid rgba(255, 215, 0, 0.25);
  border-radius: 50%;
  animation: rotate 8s linear infinite;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

.label {
  position: absolute;
  bottom: -26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 500;
  color: #ffd700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
