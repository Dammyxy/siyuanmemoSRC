<template>
  <div class="fsrs-review-v2-actions">
    <div class="fsrs-review-v2-actions__toolbar">
      <button
        v-for="(b, idx) in actions.toolbar"
        :key="`${idx}-${b.command}`"
        class="b3-button b3-button--small b3-button--text"
        type="button"
        @click="emit('command', b.command)"
      >
        <span v-if="b.icon" :class="`b3-button__icon ${b.icon}`"></span>
        <span class="b3-button__text">{{ b.label }}</span>
      </button>

      <button
        v-if="actions.menu.length"
        class="b3-button b3-button--small b3-button--text"
        type="button"
        @click="emit('openMenu', actions.menu, $event)"
      >
        <span class="b3-button__icon iconMore"></span>
        <span class="b3-button__text">{{ t('more', '更多') }}</span>
      </button>
    </div>

    <div class="fsrs-review-v2-actions__main">
      <button
        v-if="actions.showAnswer"
        class="b3-button b3-button--outline b3-button--big"
        type="button"
        @click="emit('reveal')"
      >
        {{ t('showAnswer', '显示答案') }}
      </button>

      <div v-else class="fsrs-review-v2-actions__grades">
        <button
          v-for="g in actions.grades"
          :key="g.value"
          class="b3-button b3-button--big"
          type="button"
          :style="{ background: g.color }"
          @click="emit('grade', g.value)"
        >
          <span class="fsrs-review-v2-actions__grade-label">{{ g.label }}</span>
          <span class="fn__space"></span>
          <span class="ft__secondary fsrs-review-v2-actions__grade-kb">{{ g.kb }}</span>
        </button>
      </div>
    </div>

    <div class="fsrs-review-v2-actions__aux">
      <button class="b3-button b3-button--text" type="button" @click="emit('skip')">
        {{ t('skip', '跳过') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import type { ReviewUIState } from './types';

const props = defineProps<{
  actions: ReviewUIState['actions'];
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'reveal'): void;
  (e: 'grade', rating: number): void;
  (e: 'skip'): void;
  (e: 'command', cmdId: string): void;
  (e: 'openMenu', menu: IQueueCommand<unknown>[], ev: MouseEvent): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
</script>

<style scoped>
.fsrs-review-v2-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--b3-border-color);
}

.fsrs-review-v2-actions__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.fsrs-review-v2-actions__main {
  display: flex;
  justify-content: center;
}

.fsrs-review-v2-actions__grades {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.fsrs-review-v2-actions__aux {
  display: flex;
  justify-content: center;
}
</style>

