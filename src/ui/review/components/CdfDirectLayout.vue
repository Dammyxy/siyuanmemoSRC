<template>
  <div class="cdf-direct-layout">
    <CardBreadcrumb v-if="breadcrumbs.length > 0" :items="breadcrumbs" variant="preview" />

    <div class="cdf-direct-layout__body">
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
  showAnswer?: boolean;
  answerDividerLabel?: string;
}>(), {
  breadcrumbs: () => [],
  promptSections: () => [],
  answerSections: () => [],
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

.cdf-direct-layout__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 18px;
}

.cdf-direct-layout__section {
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  padding: 12px 14px;
}

.cdf-direct-layout__section--answer {
  background: color-mix(in srgb, var(--b3-theme-primary-lightest) 20%, var(--b3-theme-background));
}

.cdf-direct-layout__label {
  margin-bottom: 8px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
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
