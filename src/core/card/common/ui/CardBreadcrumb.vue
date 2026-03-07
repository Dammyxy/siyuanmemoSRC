<template>
  <div
    v-if="items.length > 0"
    class="card-breadcrumb"
    :class="[`card-breadcrumb--${variant}`]"
  >
    <component
      :is="interactive ? 'button' : 'div'"
      v-for="(item, index) in items"
      :key="item.id"
      class="card-breadcrumb__item"
      :class="{
        'card-breadcrumb__item--interactive': interactive,
        'card-breadcrumb__item--active': variant === 'preview' && activeId === item.id,
      }"
      :style="{ paddingLeft: `${index * 16 + 8}px` }"
      v-bind="interactive ? { type: 'button' } : {}"
      @click="handleSelect(item, index)"
    >
      <span class="card-breadcrumb__text">
        <svg class="card-breadcrumb__icon">
          <use :xlink:href="getIcon(item.type)"></use>
        </svg>
        {{ item.name || '...' }}
      </span>
    </component>
  </div>
</template>

<script setup lang="ts">
import type { BreadcrumbItem } from '../application/types';

const props = withDefaults(defineProps<{
  items: BreadcrumbItem[];
  variant?: 'card' | 'preview';
  interactive?: boolean;
  activeId?: string;
}>(), {
  variant: 'card',
  interactive: false,
  activeId: '',
});

const emit = defineEmits<{
  (e: 'select', item: BreadcrumbItem, index: number): void;
}>();

function getIcon(type: string): string {
  return type === 'NodeDocument' ? '#iconFile' : '#iconALIGN';
}

function handleSelect(item: BreadcrumbItem, index: number): void {
  if (!props.interactive) {
    return;
  }

  emit('select', item, index);
}
</script>

<style scoped>
.card-breadcrumb {
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
  background: transparent;
}

.card-breadcrumb--card {
  padding: 8px 16px;
}

.card-breadcrumb--preview {
  padding: 8px 0;
}

.card-breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  color: var(--b3-theme-on-surface);
  line-height: 1.6;
  border-radius: 4px;
  border: 0;
  background: transparent;
  text-align: left;
  width: 100%;
}

.card-breadcrumb__item--interactive {
  cursor: pointer;
  transition: all 0.2s;
}

.card-breadcrumb__item--interactive:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary);
  background-color: var(--b3-list-hover);
}

.card-breadcrumb__item--active {
  background: rgba(var(--b3-theme-primary-rgb), 0.12);
  color: var(--b3-theme-primary);
}

.card-breadcrumb__item--active .card-breadcrumb__icon {
  opacity: 0.9;
  fill: var(--b3-theme-primary);
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
