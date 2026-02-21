<template>
  <div v-if="items.length > 0" class="card-breadcrumb">
    <div 
      v-for="(item, index) in items" 
      :key="item.id"
      class="card-breadcrumb__item"
      :style="{ paddingLeft: `${index * 16 + 8}px` }"
    >
      <span class="card-breadcrumb__text">
        <svg class="card-breadcrumb__icon">
          <use :xlink:href="getIcon(item.type)"></use>
        </svg>
        {{ item.name || '...' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BreadcrumbItem } from '../application/types';

defineProps<{
  items: BreadcrumbItem[];
}>();

function getIcon(type: string): string {
  return type === 'NodeDocument' ? '#iconFile' : '#iconALIGN';
}
</script>

<style scoped>
.card-breadcrumb {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  margin-bottom: 0;
  background: transparent;
}

.card-breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--b3-theme-on-surface);
  line-height: 1.6;
  border-radius: 4px;
  transition: all 0.2s;
}

.card-breadcrumb__item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary);
  background-color: var(--b3-list-hover);
}

.card-breadcrumb__text {
  display: flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--b3-font-family);
  opacity: 0.86;
  flex: 1;
  min-width: 0;
}

.card-breadcrumb__icon {
  width: 12px;
  height: 12px;
  margin-right: 6px;
  opacity: 0.6;
  fill: var(--b3-theme-on-surface);
  flex-shrink: 0;
}
</style>
