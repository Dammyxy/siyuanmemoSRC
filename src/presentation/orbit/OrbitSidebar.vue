<script setup lang="ts">
import { ref } from 'vue';
import OrbitView from './OrbitView.vue';

const props = defineProps<{
  neuralQueue: any;
  width: number;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'node-click', data: { nodeId: string; nodeType: string }): void;
  (e: 'navigate-to-block', blockId: string): void;
}>();

const orbitViewRef = ref<InstanceType<typeof OrbitView> | null>(null);

// 暴露方法给父组件
function refresh() {
  orbitViewRef.value?.refresh();
}

function focusNode(nodeId: string) {
  // 可选：实现节点聚焦功能
  console.log('[OrbitSidebar] Focus node:', nodeId);
}

defineExpose({ refresh, focusNode });
</script>

<template>
  <aside class="orbit-sidebar" :style="{ width: `${width}px` }">
    <!-- 标题栏 -->
    <div class="orbit-sidebar__header">
      <span class="orbit-sidebar__icon">🌌</span>
      <span class="orbit-sidebar__title">轨道图 Orbit</span>
    </div>

    <!-- 图谱内容 -->
    <div class="orbit-sidebar__content">
      <OrbitView
        ref="orbitViewRef"
        :neural-queue="neuralQueue"
        :i18n="i18n"
        @node-click="(data) => emit('node-click', data)"
        @navigate-to-block="(blockId) => emit('navigate-to-block', blockId)"
      />
    </div>
  </aside>
</template>

<style scoped>
.orbit-sidebar {
  display: flex;
  flex-direction: column;
  background: var(--b3-theme-surface);
  border-right: 1px solid var(--b3-theme-surface-lighter);
  flex-shrink: 0;
  overflow: hidden;
}

.orbit-sidebar__header {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  background: var(--b3-theme-background);
  border-bottom: 1px solid var(--b3-theme-surface-lighter);
  flex-shrink: 0;
}

.orbit-sidebar__icon {
  font-size: 20px;
}

.orbit-sidebar__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.orbit-sidebar__content {
  flex: 1;
  overflow: hidden;
  position: relative;
}
</style>
