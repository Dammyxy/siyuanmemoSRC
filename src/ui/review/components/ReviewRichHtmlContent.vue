<template>
  <div
    ref="rootRef"
    class="review-rich-html-content b3-typography"
    :class="{ 'review-rich-html-content--selectable': selectable !== false }"
    v-html="html"
  ></div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { enhanceRenderedMarkdown } from '@/ui/shared/rich-content';

const props = defineProps<{
  html: string;
  selectable?: boolean;
}>();

const rootRef = ref<HTMLElement | null>(null);

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

watch(
  () => props.html,
  () => {
    void postRender();
  },
);
</script>

<style scoped>
.review-rich-html-content {
  line-height: inherit;
  color: inherit;
}

.review-rich-html-content--selectable {
  user-select: text;
}

.review-rich-html-content :deep(*) {
  user-select: text;
}

.review-rich-html-content :deep(pre) {
  position: relative;
  overflow: auto;
  margin: 0;
  border-radius: 14px;
  background: rgba(44, 36, 27, 0.92);
}

.review-rich-html-content :deep(pre code) {
  display: block;
  padding: 40px 14px 14px;
  color: #f7f2ea;
}

.review-rich-html-content :deep(.rich-markdown__code-toolbar) {
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

.review-rich-html-content :deep(.rich-markdown__code-language),
.review-rich-html-content :deep(.rich-markdown__code-copy) {
  pointer-events: auto;
}

.review-rich-html-content :deep(.rich-markdown__code-language) {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #f7f2ea;
  font-size: 11px;
  padding: 4px 8px;
}

.review-rich-html-content :deep(.rich-markdown__code-copy) {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #f7f2ea;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.review-rich-html-content :deep(.rich-markdown__code-copy:hover) {
  background: rgba(255, 255, 255, 0.16);
}

.review-rich-html-content :deep(.rich-markdown__math-block) {
  margin: 12px 0;
  overflow-x: auto;
}

.review-rich-html-content :deep(.rich-markdown__mermaid) {
  overflow-x: auto;
}

.review-rich-html-content :deep(p:first-child),
.review-rich-html-content :deep(ul:first-child),
.review-rich-html-content :deep(ol:first-child),
.review-rich-html-content :deep(pre:first-child),
.review-rich-html-content :deep(blockquote:first-child) {
  margin-top: 0;
}

.review-rich-html-content :deep(p:last-child),
.review-rich-html-content :deep(ul:last-child),
.review-rich-html-content :deep(ol:last-child),
.review-rich-html-content :deep(pre:last-child),
.review-rich-html-content :deep(blockquote:last-child) {
  margin-bottom: 0;
}
</style>
