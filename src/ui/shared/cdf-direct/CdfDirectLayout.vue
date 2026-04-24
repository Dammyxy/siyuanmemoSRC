<template>
  <div class="cdf-direct-layout">
    <CardBreadcrumb v-if="breadcrumbs.length > 0" :items="breadcrumbs" variant="preview" />

    <div v-if="contentHtml" class="cdf-direct-layout__editor b3-typography" v-html="contentHtml"></div>

    <div v-else class="cdf-direct-layout__body">
      <section
        v-for="section in promptSections"
        :key="`prompt-${section.key}`"
        class="cdf-direct-layout__section cdf-direct-layout__section--prompt"
      >
        <div v-if="section.label" class="cdf-direct-layout__label">{{ section.label }}</div>
        <div class="cdf-direct-layout__content b3-typography" v-html="section.html"></div>
      </section>

      <div v-if="showAnswer && answerSections.length > 0" class="cdf-direct-layout__divider">
        <span>{{ answerDividerLabel }}</span>
      </div>

      <section
        v-for="section in visibleAnswerSections"
        :key="`answer-${section.key}`"
        class="cdf-direct-layout__section cdf-direct-layout__section--answer"
      >
        <div v-if="section.label" class="cdf-direct-layout__label">{{ section.label }}</div>
        <div class="cdf-direct-layout__content b3-typography" v-html="section.html"></div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import type { BreadcrumbItem } from '@/core/card/common/application/types';

export interface CdfDirectSection {
  key: string;
  html: string;
  label?: string;
}

const props = withDefaults(defineProps<{
  breadcrumbs?: BreadcrumbItem[];
  promptSections?: CdfDirectSection[];
  answerSections?: CdfDirectSection[];
  contentHtml?: string;
  showAnswer?: boolean;
  answerDividerLabel?: string;
}>(), {
  breadcrumbs: () => [],
  promptSections: () => [],
  answerSections: () => [],
  contentHtml: '',
  showAnswer: false,
  answerDividerLabel: '答案',
});

const visibleAnswerSections = computed(() => (props.showAnswer ? props.answerSections : []));
</script>

<style scoped>
.cdf-direct-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

.cdf-direct-layout__editor {
  padding: 10px 14px 18px;
  color: var(--b3-theme-on-surface);
}

.cdf-direct-layout__editor :deep(.cdf-editor) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cdf-direct-layout__editor :deep(.cdf-editor__row) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  color: var(--b3-theme-on-surface);
}

.cdf-direct-layout__editor :deep(.cdf-editor__row--level-1) {
  padding-left: 18px;
}

.cdf-direct-layout__editor :deep(.cdf-editor__row--level-2) {
  padding-left: 34px;
}

.cdf-direct-layout__editor :deep(.cdf-editor__row--primary .cdf-editor__node) {
  font-size: var(--siyuanmemo-review-font-title, 1.125em);
  font-weight: 600;
  line-height: 1.7;
}

.cdf-direct-layout__editor :deep(.cdf-editor__bullet) {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  margin-top: 0.8em;
  border-radius: 999px;
  background: color-mix(in srgb, var(--b3-theme-on-surface-light) 72%, transparent);
}

.cdf-direct-layout__editor :deep(.cdf-editor__row--level-1 .cdf-editor__bullet),
.cdf-direct-layout__editor :deep(.cdf-editor__row--level-2 .cdf-editor__bullet) {
  width: 6px;
  height: 6px;
  margin-top: 0.82em;
  background: color-mix(in srgb, var(--b3-theme-on-surface-light) 54%, transparent);
}

.cdf-direct-layout__editor :deep(.cdf-editor__node) {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  line-height: 1.72;
}

.cdf-direct-layout__editor :deep(.cdf-editor__standalone) {
  min-width: 0;
}

.cdf-direct-layout__editor :deep(.cdf-editor__segment) {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
}

.cdf-direct-layout__editor :deep(.cdf-editor__segment--ellipsis) {
  color: var(--b3-theme-on-surface-light);
}

.cdf-direct-layout__editor :deep(.cdf-editor__arrow) {
  color: var(--b3-theme-on-surface-light);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.cdf-direct-layout__editor :deep(.cdf-editor__ellipsis) {
  color: var(--b3-theme-on-surface-light);
  font-weight: 500;
  letter-spacing: 0.04em;
}

.cdf-direct-layout__editor :deep(.cdf-editor__node > p),
.cdf-direct-layout__editor :deep(.cdf-editor__node > ul),
.cdf-direct-layout__editor :deep(.cdf-editor__node > ol),
.cdf-direct-layout__editor :deep(.cdf-editor__node > blockquote),
.cdf-direct-layout__editor :deep(.cdf-editor__standalone > p),
.cdf-direct-layout__editor :deep(.cdf-editor__standalone > ul),
.cdf-direct-layout__editor :deep(.cdf-editor__standalone > ol),
.cdf-direct-layout__editor :deep(.cdf-editor__standalone > blockquote) {
  margin: 0;
}

.cdf-direct-layout__editor :deep(.cdf-editor__segment--right > p),
.cdf-direct-layout__editor :deep(.cdf-editor__segment--left > p) {
  margin: 0;
}

.cdf-direct-layout__editor :deep(.cdf-editor__standalone strong),
.cdf-direct-layout__editor :deep(.cdf-editor__segment strong) {
  font-weight: 700;
}

.cdf-direct-layout__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 18px;
}

.cdf-direct-layout__section {
  padding: 0;
  border: none;
  background: transparent;
}

.cdf-direct-layout__label {
  margin-bottom: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-xs, 0.75em);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.cdf-direct-layout__content {
  color: var(--b3-theme-on-surface);
  line-height: 1.7;
}

.cdf-direct-layout__content :deep(p:first-child),
.cdf-direct-layout__content :deep(ul:first-child),
.cdf-direct-layout__content :deep(ol:first-child),
.cdf-direct-layout__content :deep(blockquote:first-child) {
  margin-top: 0;
}

.cdf-direct-layout__content :deep(p:last-child),
.cdf-direct-layout__content :deep(ul:last-child),
.cdf-direct-layout__content :deep(ol:last-child),
.cdf-direct-layout__content :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.cdf-direct-layout__divider {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--b3-theme-on-surface-light);
  font-size: var(--siyuanmemo-review-font-xs, 0.75em);
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 2px 0;
}

.cdf-direct-layout__divider::before,
.cdf-direct-layout__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
}

.cdf-direct-layout__divider span {
  padding: 0 10px;
}
</style>
