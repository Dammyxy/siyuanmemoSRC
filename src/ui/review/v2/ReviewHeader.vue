<template>
  <div class="fsrs-review-v2-header block__icons">
    <!-- Logo + 队列名称 -->
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>{{ header.stats.queueName || '闪卡' }}</span>
    </div>
    <div class="fn__flex-1 resize__move" style="min-height: 100%"></div>

    <!-- 计数器: 新卡 + 复习卡 -->
    <div
      data-type="count"
      class="ft__on-surface ft__smaller fn__flex-center"
      v-if="hasCards"
    >
      <!-- 新卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardNewCard', '新卡')">
        <span class="ft__error">{{ header.stats.current || 0 }}</span>
        /
        <span class="ariaLabel ft__primary" :aria-label="t('flashcardNewCard', '新卡')">
          {{ header.stats.newCards || header.stats.total }}
        </span>
      </span>
      <span class="fn__space"></span>
      <span class="fn__space"></span>
      <!-- 复习卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardReviewCard', '复习卡')">
        <span class="ft__error">{{ header.stats.current || 0 }}</span>
        /
        <span class="ft__success">{{ header.stats.reviewCards || 0 }}</span>
      </span>
    </div>

    <div class="fn__space"></div>

    <!-- 头部工具栏 -->
    <template v-if="header.toolbar">
      <div
        v-for="btn in header.toolbar"
        :key="btn.type"
        :data-type="btn.type"
        class="b3-tooltips b3-tooltips__sw block__icon block__icon--show"
        :class="{ 'fn__none': btn.disabled }"
        :aria-label="btn.ariaLabel"
        @click="$emit('toolbar-action', btn.type, $event)"
      >
        <svg v-if="btn.icon"><use :xlink:href="btn.icon"></use></svg>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
  isTabMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'action', actionId: string): void;
  (e: 'context', payload: { id: string; openNewTab: boolean }): void;
}>();

function t(key: string, fallback: string): string {
  const i18n = (window as any)?.siyuan?.languages?.flashcard || {};
  return (i18n as any)?.[key] || fallback;
}

const hasCards = computed(() => {
  return (props.header.stats.current || 0) > 0 ||
    (props.header.stats.newCards || 0) > 0 ||
    (props.header.stats.reviewCards || 0) > 0;
});
</script>

<style scoped>
.block__logo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--b3-theme-on-surface);
}

.block__logoicon {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.block__icon {
  width: 28px;
  height: 28px;
  padding: 4px;
  border-radius: 4px;
  color: var(--b3-theme-on-surface);

  &:hover {
    background: var(--b3-theme-background);
  }
}

.block__icon.fn__none {
  display: none;
}

.ariaLabel {
  display: flex;
  align-items: center;
}
</style>
