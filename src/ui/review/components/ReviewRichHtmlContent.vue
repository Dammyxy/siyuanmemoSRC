<template>
  <div
    ref="rootRef"
    class="review-rich-html-content b3-typography"
    :class="{ 'review-rich-html-content--selectable': selectable !== false }"
    v-html="content.html"
    @click="handleClick"
  ></div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { enhanceRenderedMarkdown } from '@/ui/shared/rich-content';
import type { RichContentResult } from '@/core/card/common/application/richContent';
import { routeReviewRichContentClick } from '@/ui/review/shared/reviewRichContentNavigation';

const props = defineProps<{
  content: RichContentResult;
  selectable?: boolean;
  onOpenBlock?: (blockId: string) => void | Promise<void>;
  onOpenExternal?: (href: string) => void | Promise<void>;
  onOpenAsset?: (href: string) => void | Promise<void>;
  onUnsafeTarget?: (href: string) => void;
}>();

const rootRef = ref<HTMLElement | null>(null);

function handleClick(event: MouseEvent): void {
  routeReviewRichContentClick(event, {
    openBlock: props.onOpenBlock,
    openExternal: props.onOpenExternal,
    openAsset: props.onOpenAsset,
    onUnsafeTarget: target => props.onUnsafeTarget?.(target.href || ''),
  });
}

function addMediaFailureHandlers(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement | HTMLAudioElement | HTMLVideoElement>('img, audio, video').forEach((element) => {
    if (element.dataset.siyuanmemoFailureHandler === 'true') {
      return;
    }
    element.dataset.siyuanmemoFailureHandler = 'true';
    element.addEventListener('error', () => {
      if (element.nextElementSibling?.classList.contains('review-rich-html-content__media-error')) {
        return;
      }
      const placeholder = document.createElement('span');
      placeholder.className = 'review-rich-html-content__media-error';
      placeholder.textContent = element.getAttribute('src') || element.getAttribute('alt') || 'media';
      element.insertAdjacentElement('afterend', placeholder);
    });
  });
}

async function postRender(): Promise<void> {
  await nextTick();
  if (!rootRef.value) {
    return;
  }
  await enhanceRenderedMarkdown(rootRef.value);
  addMediaFailureHandlers(rootRef.value);
}

onMounted(() => {
  void postRender();
});

watch(
  () => props.content.html,
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

.review-rich-html-content__media-error {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 6px 0;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-error) 28%, var(--b3-border-color));
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-xs, 0.75em);
  overflow-wrap: anywhere;
}

.review-rich-html-content :deep(*) {
  user-select: text;
}

.review-rich-html-content :deep(a[href]),
.review-rich-html-content :deep([data-type~="a"][data-href]),
.review-rich-html-content :deep([data-type~="block-ref"][data-id]) {
  color: var(--b3-theme-primary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.review-rich-html-content :deep(a[href]:hover),
.review-rich-html-content :deep([data-type~="a"][data-href]:hover),
.review-rich-html-content :deep([data-type~="block-ref"][data-id]:hover) {
  color: var(--b3-theme-primary-light);
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
