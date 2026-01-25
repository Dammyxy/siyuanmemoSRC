<template>
  <div class="fsrs-review-v2">
    <ReviewHeader :header="state.header" @action="hook.executeCommand" @context="emit('context', $event)" />

    <ReviewContent :app="app" :content="state.content" :overlay="state.overlay" :i18n="i18n" />

    <ReviewActions
      :actions="state.actions"
      :i18n="i18n"
      @reveal="hook.reveal"
      @grade="hook.grade"
      @skip="hook.skip"
      @command="hook.executeCommand"
      @openMenu="handleOpenMenu"
    />

    <div v-if="state.meta.resumePrompt" class="fsrs-review-v2-resume">
      <div class="fsrs-review-v2-resume__panel b3-card">
        <div class="fsrs-review-v2-resume__title">{{ t('resumePromptTitle', '发现未完成的练习') }}</div>
        <div class="fsrs-review-v2-resume__desc ft__secondary">
          {{ state.meta.resumePrompt.message }}
        </div>
        <div class="fsrs-review-v2-resume__actions">
          <button class="b3-button b3-button--cancel" type="button" @click="hook.executeCommand('resume-start-over')">
            {{ t('resumeStartOver', '从头开始') }}
          </button>
          <button class="b3-button b3-button--text" type="button" @click="hook.executeCommand('resume-continue')">
            {{ t('resumeContinue', '继续练习') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Menu } from 'siyuan';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import { useReviewSession } from './useReviewSession';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';

const props = defineProps<{
  app: any;
  i18n?: Record<string, string>;
  queue: any;
  adapter: any;
}>();

const emit = defineEmits<{
  (e: 'context', contextId: string): void;
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
}>();

const hook = useReviewSession(props.queue, props.adapter);
const state = hook.state;
const app = props.app;
const i18n = props.i18n;

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function handleOpenMenu(menuCommands: IQueueCommand<unknown>[], ev: MouseEvent) {
  const cmds = Array.isArray(menuCommands) ? menuCommands : [];
  if (!cmds.length) return;

  const target = ev.currentTarget as HTMLElement | null;
  const rect = target ? target.getBoundingClientRect() : null;
  const x = rect && rect.width ? rect.left : ev.clientX;
  const y = rect && rect.height ? rect.bottom : ev.clientY;

  const menu = new Menu();
  for (const cmd of cmds) {
    const id = String((cmd as any)?.id || '');
    const label = String((cmd as any)?.label || '');
    if (!id || !label) continue;
    menu.addItem({
      icon: (cmd as any)?.icon,
      label,
      click: () => {
        void hook.executeCommand(id);
      },
    });
  }
  menu.open({ x, y });
}
</script>

<style scoped>
.fsrs-review-v2 {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--b3-theme-background);
}

.fsrs-review-v2-resume {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  padding: 16px;
}

.fsrs-review-v2-resume__panel {
  width: min(520px, 100%);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fsrs-review-v2-resume__title {
  font-weight: 600;
}

.fsrs-review-v2-resume__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

