<template>
  <div class="ai-draggable-list">
    <div
      v-for="(item, index) in items"
      :key="`${item.id}-${index}`"
      class="ai-draggable-list__item"
      :class="{
        'ai-draggable-list__item--dragging': draggedIndex === index,
        'ai-draggable-list__item--drag-over': dragOverIndex === index,
      }"
      :draggable="disabled ? undefined : true"
      @dragstart="handleDragStart(index, $event)"
      @dragenter.prevent="handleDragEnter(index)"
      @dragover.prevent="handleDragOver(index)"
      @drop.prevent="handleDrop(index)"
      @dragend="handleDragEnd"
    >
      <slot
        name="item"
        :item="item"
        :index="index"
        :is-dragging="draggedIndex === index"
        :is-drag-over="dragOverIndex === index"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface AiDraggableItemLike {
  id: string;
}

const props = defineProps<{
  items: AiDraggableItemLike[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'reorder', items: AiDraggableItemLike[]): void;
}>();

const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function handleDragStart(index: number, event: DragEvent): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  draggedIndex.value = index;
  dragOverIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleDragEnter(index: number): void {
  if (props.disabled || draggedIndex.value === null) {
    return;
  }
  dragOverIndex.value = index;
}

function handleDragOver(index: number): void {
  if (props.disabled || draggedIndex.value === null) {
    return;
  }
  dragOverIndex.value = index;
}

function handleDrop(index: number): void {
  if (props.disabled || draggedIndex.value === null) {
    handleDragEnd();
    return;
  }

  const from = draggedIndex.value;
  if (from === index) {
    handleDragEnd();
    return;
  }

  const next = [...props.items];
  const [moved] = next.splice(from, 1);
  if (!moved) {
    handleDragEnd();
    return;
  }
  next.splice(index, 0, moved);
  emit('reorder', next);
  handleDragEnd();
}

function handleDragEnd(): void {
  draggedIndex.value = null;
  dragOverIndex.value = null;
}
</script>

<style scoped>
.ai-draggable-list {
  display: grid;
  gap: 10px;
}

.ai-draggable-list__item {
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
}

.ai-draggable-list__item--dragging {
  opacity: 0.48;
}

.ai-draggable-list__item--drag-over {
  transform: translateY(-2px);
}
</style>
