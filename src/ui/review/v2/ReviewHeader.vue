<template>
  <div class="fsrs-review-v2-header block__icons">
    <!-- Logo + 队列名称 -->
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>{{ header.stats.queueName || '闪卡' }}</span>
    </div>

    <!-- Part 6: 面包屑导航 -->
    <div v-if="header.breadcrumbs && header.breadcrumbs.length > 0" class="fsrs-review-breadcrumbs">
      <template v-for="(crumb, index) in header.breadcrumbs" :key="index">
        <span
          v-if="crumb.action"
          class="fsrs-review-breadcrumb__item ft__primary"
          :data-action="crumb.action"
          @click="$emit('breadcrumb-click', crumb, index)"
        >
          <svg v-if="crumb.icon" class="fsrs-review-breadcrumb__icon"><use :xlink:href="crumb.icon"></use></svg>
          <span>{{ crumb.text }}</span>
        </span>
        <span v-else class="fsrs-review-breadcrumb__item ft__on-surface">
          <svg v-if="crumb.icon" class="fsrs-review-breadcrumb__icon"><use :xlink:href="crumb.icon"></use></svg>
          <span>{{ crumb.text }}</span>
        </span>
        <span v-if="index < header.breadcrumbs.length - 1" class="fsrs-review-breadcrumb__separator">/</span>
      </template>
    </div>

    <div class="fn__flex-1 resize__move" style="min-height: 100%"></div>

    <!-- 计数器: NO + 新卡 + 复习卡 -->
    <div
      data-type="count"
      class="ft__on-surface ft__smaller fn__flex-center"
      v-if="hasCards"
    >
      <!-- NO (当前卡片序号) -->
      <span class="ariaLabel" style="font-weight: bold; margin-right: 8px;">
        NO {{ header.stats.current || 0 }}
      </span>
      <span class="fn__space"></span>
      <!-- 新卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardNewCard', '新卡')">
        <span class="ft__primary">{{ header.stats.newCards || 0 }}</span>
      </span>
      <span class="fn__space"></span>
      <span class="fn__space"></span>
      <!-- 复习卡计数 -->
      <span class="ariaLabel" :aria-label="t('flashcardReviewCard', '复习卡')">
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
import { computed } from 'vue';
import type { ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
  isTabMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'action', actionId: string): void;
  (e: 'context', payload: { id: string; openNewTab: boolean }): void;
  (e: 'breadcrumb-click', crumb: { icon?: string; text: string; id?: string; action?: string }, index: number): void;
}>();

function t(key: string, fallback: string): string {
  const i18n = (window as any)?.siyuan?.languages?.flashcard || {};
  return (i18n as any)?.[key] || fallback;
}

const hasCards = computed(() => {
  // 始终显示计数器（即使没有卡片），确保 NO 始终可见
  return true;
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

/* Part 6: 面包屑导航样式 */
.fsrs-review-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
  padding: 4px 8px;
  background: var(--b3-theme-background);
  border-radius: 4px;
  font-size: 12px;
}

.fsrs-review-breadcrumb__item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: default;
  user-select: none;
}

.fsrs-review-breadcrumb__item.ft__primary {
  cursor: pointer;
  transition: opacity 0.15s;
}

.fsrs-review-breadcrumb__item.ft__primary:hover {
  opacity: 0.7;
}

.fsrs-review-breadcrumb__icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.fsrs-review-breadcrumb__separator {
  color: var(--b3-theme-surface-variant);
  margin: 0 2px;
}
</style>
