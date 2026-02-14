<script setup lang="ts">
import { DIRECTION_COLORS } from '@/domain/orbit/constants';

const props = defineProps<{
  data: { count: number; direction: string; isExpanded?: boolean };
}>();

const color = DIRECTION_COLORS[props.data.direction as keyof typeof DIRECTION_COLORS] || '#999';
</script>

<template>
  <div class="node-more" :style="{ '--more-color': color }">
    <span class="more-text">{{ data.isExpanded ? '收起' : `展开 +${data.count}` }}</span>
  </div>
</template>

<style scoped>
.node-more {
  min-width: 70px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed var(--more-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.node-more:hover {
  background: rgba(255, 255, 255, 0.08);
  border-style: solid;
  transform: scale(1.05);
}

.more-text {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}
</style>
