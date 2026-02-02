<template>
  <!-- 阶段1: 答案隐藏 - showAnswer 为 true 时显示"显示答案"按钮 -->
  <div v-if="actions.showAnswer" class="card__action fn__flex">
    <button
      class="b3-button b3-button--cancel"
      disabled="disabled"
      style="width: 25%; min-width: 86px; display: flex"
      @click="emit('reveal')"
    >
      <svg><use xlink:href="#iconLeft"></use></svg>
      (p / q)
    </button>
    <span class="fn__space"></span>
    <button
      data-type="-1"
      class="b3-button fn__flex-1"
      @click="emit('reveal')"
    >
      {{ t('showAnswer', '显示答案') }}
      ({{ t('space', '空格') }} / {{ t('enterKey', '回车') }})
    </button>
  </div>

  <!-- 阶段2: 答案显示 - showAnswer 为 false 时显示评分按钮 -->
  <div v-else class="card__action fn__flex">
    <!-- 左列: 后退 + 跳过 -->
    <div>
      <button
        class="b3-button b3-button--cancel"
        disabled="disabled"
        style="display: flex; margin-bottom: 8px; height: 28px; padding: 0;"
        @click="emit('back')"
      >
        <svg><use xlink:href="#iconLeft"></use></svg>
        (p / q)
      </button>
      <button
        data-type="-3"
        aria-label="0 / x"
        class="b3-button b3-button--cancel b3-tooltips__n b3-tooltips"
        @click="emit('skip')"
      >
        <div class="card__icon">💤</div>
        {{ t('skip', '跳过') }} (0)
      </button>
    </div>

    <!-- 评分按钮列 -->
    <div v-for="g in actions.grades" :key="g.value">
      <span>{{ g.nextDue || '' }}</span>
      <button
        :data-type="g.value"
        :aria-label="`${g.value} / ${g.kb}`"
        class="b3-button"
        :class="getButtonVariant(g.value)"
        @click="emit('grade', g.value)"
      >
        <div class="card__icon">{{ g.emoji }}</div>
        {{ g.label }} ({{ g.kb }})
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReviewUIState } from './types';

const props = defineProps<{
  actions: ReviewUIState['actions'];
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'reveal'): void;
  (e: 'grade', rating: number): void;
  (e: 'skip'): void;
  (e: 'back'): void;
  (e: 'command', cmdId: string): void;
  (e: 'openMenu', menu: any[], ev: MouseEvent): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getButtonVariant(value: number): string {
  const variants = {
    1: 'b3-button--error',
    2: 'b3-button--warning',
    3: 'b3-button--info',
    4: 'b3-button--success',
  };
  return variants[value as keyof typeof variants] || 'b3-button--info';
}
</script>

<style scoped>
.card__action {
  padding: 8px;
  user-select: none;
}

.card__action > div {
  flex: 1;
  margin-right: 8px;

  &:last-child {
    margin-right: 0;
  }

  > span {
    display: flex;
    color: var(--b3-theme-on-surface);
    text-align: center;
    font-size: 12px;
    margin-bottom: 8px;
    height: 28px;
    line-height: 14px;
    justify-content: center;
    align-items: center;
  }
}

.card__icon {
  font-size: 32px;
  display: block;
  line-height: 46px;
  margin-bottom: 4px;
}
</style>
