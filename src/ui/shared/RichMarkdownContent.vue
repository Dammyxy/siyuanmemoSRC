<template>
  <div
    ref="rootRef"
    class="rich-markdown b3-typography"
    :class="{ 'rich-markdown--selectable': selectable !== false }"
    v-html="html"
  ></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { enhanceRenderedMarkdown, renderMarkdownToHtml } from '@/ui/shared/rich-content';

const props = defineProps<{
  content: string;
  selectable?: boolean;
}>();

const rootRef = ref<HTMLElement | null>(null);
const html = computed(() => renderMarkdownToHtml(props.content || ''));

async function postRender(): Promise<void> {
  await nextTick();
  if (!rootRef.value) {
    return;
  }
  await enhanceRenderedMarkdown(rootRef.value);
}

onMounted(() => {
  void postRender();
});

watch(html, () => {
  void postRender();
});
</script>

<style scoped>
.rich-markdown {
  line-height: 1.68;
}

.rich-markdown--selectable {
  user-select: text;
}

.rich-markdown :deep(*) {
  user-select: text;
}

.rich-markdown :deep(pre) {
  position: relative;
  overflow: auto;
  margin: 0;
  border-radius: 14px;
  background: rgba(44, 36, 27, 0.92);
}

.rich-markdown :deep(pre code) {
  display: block;
  padding: 40px 14px 14px;
  color: #f7f2ea;
}

.rich-markdown :deep(.rich-markdown__code-toolbar) {
  position: absolute;
  top: 8px;
  right: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.rich-markdown :deep(.rich-markdown__code-language),
.rich-markdown :deep(.rich-markdown__code-copy) {
  pointer-events: auto;
}

.rich-markdown :deep(.rich-markdown__code-language) {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #f7f2ea;
  font-size: 11px;
  padding: 4px 8px;
}

.rich-markdown :deep(.rich-markdown__code-copy) {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #f7f2ea;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.rich-markdown :deep(.rich-markdown__code-copy:hover) {
  background: rgba(255, 255, 255, 0.16);
}

.rich-markdown :deep(.rich-markdown__math-block) {
  margin: 12px 0;
  overflow-x: auto;
}

.rich-markdown :deep(.rich-markdown__mermaid) {
  overflow-x: auto;
}

.rich-markdown :deep(p:first-child),
.rich-markdown :deep(ul:first-child),
.rich-markdown :deep(ol:first-child),
.rich-markdown :deep(pre:first-child) {
  margin-top: 0;
}

.rich-markdown :deep(p:last-child),
.rich-markdown :deep(ul:last-child),
.rich-markdown :deep(ol:last-child),
.rich-markdown :deep(pre:last-child) {
  margin-bottom: 0;
}
</style>
