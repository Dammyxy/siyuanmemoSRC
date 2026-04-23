<template>
  <div
    class="skip-menu-button"
    :class="{
      'skip-menu-button--mobile': props.isMobile,
    }"
  >
    <button
      class="skip-menu-button__main b3-button b3-button--cancel b3-tooltips__n b3-tooltips"
      :aria-label="skipHotkeyHint"
      @click="handleSkip"
    >
      <span class="skip-menu-button__icon" aria-hidden="true">💤</span>
      <span class="skip-menu-button__copy">
        <span class="skip-menu-button__label">{{ t('skip', '跳过') }}</span>
        <span class="skip-menu-button__hint">{{ skipHotkeyHint }}</span>
      </span>
    </button>

    <button
      class="skip-menu-button__trigger b3-button b3-button--cancel"
      aria-haspopup="menu"
      aria-expanded="false"
      :aria-label="t('moreSkipActions', '更多跳过操作')"
      @click="openMenu"
    >
      <svg class="skip-menu-button__chevron"><use xlink:href="#iconUp"></use></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Menu } from 'siyuan';

interface Props {
  i18n?: Record<string, string>;
  queueSize?: number;
  isMobile?: boolean;
  canScheduleDate?: boolean;
}

interface Emits {
  (e: 'skip'): void;
  (e: 'insert'): void;
  (e: 'schedule'): void;
}

const props = withDefaults(defineProps<Props>(), {
  canScheduleDate: true,
});
const emit = defineEmits<Emits>();

const skipHotkeyHint = '0 / x';

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function handleSkip(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();
  emit('skip');
}

function resolveMenuAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function openMenu(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();

  const menu = new Menu('review-skip-menu');
  menu.addItem({
    icon: 'iconPin',
    label: t('insertToPosition', '插入到队列指定位置'),
    click: () => emit('insert'),
  });

  if (props.canScheduleDate) {
    menu.addItem({
      icon: 'iconCalendar',
      label: t('scheduleDate', '安排复习日期'),
      click: () => emit('schedule'),
    });
  }

  const anchor = resolveMenuAnchor(event.currentTarget) || resolveMenuAnchor(event.target);
  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    menu.open({
      x: rect.right,
      y: rect.top,
      isLeft: true,
    });
    return;
  }

  menu.open({
    x: event.clientX,
    y: event.clientY,
    isLeft: true,
  });
}
</script>

<style scoped>
.skip-menu-button {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: stretch;
  min-height: 56px;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--b3-border-color) 88%, var(--b3-theme-on-surface-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--b3-theme-surface) 88%, var(--b3-theme-background));
  box-shadow: none;
  transition: border-color 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease;
}

.skip-menu-button:hover,
.skip-menu-button:focus-within {
  border-color: color-mix(in srgb, var(--b3-theme-primary) 34%, var(--b3-border-color));
  background: color-mix(in srgb, var(--b3-theme-primary-lightest) 54%, var(--b3-theme-background));
}

.skip-menu-button__main,
.skip-menu-button__trigger {
  border: none;
  background: transparent;
  box-shadow: none;
  color: inherit;
}

.skip-menu-button__main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  min-width: 0;
  min-height: 56px;
  padding: 0 12px;
  border-radius: 8px 0 0 8px;
}

.skip-menu-button__trigger {
  position: relative;
  min-height: 56px;
  padding: 0;
  border-radius: 0 8px 8px 0;
}

.skip-menu-button__trigger::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: color-mix(in srgb, var(--b3-border-color) 82%, var(--b3-theme-on-surface-light));
}

.skip-menu-button__main:hover,
.skip-menu-button__trigger:hover {
  background: transparent;
}

.skip-menu-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
}

.skip-menu-button__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  line-height: 1.2;
}

.skip-menu-button__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.skip-menu-button__hint {
  font-size: 11px;
  color: var(--b3-theme-primary);
}

.skip-menu-button__chevron {
  width: 12px;
  height: 12px;
  color: var(--b3-theme-on-surface-light);
}

.skip-menu-button--mobile {
  grid-template-columns: minmax(0, 1fr) 40px;
}

.skip-menu-button--mobile .skip-menu-button__main,
.skip-menu-button--mobile .skip-menu-button__trigger {
  min-height: 48px;
}

.skip-menu-button--mobile .skip-menu-button__main {
  padding-inline: 10px;
  gap: 8px;
}

.skip-menu-button--mobile .skip-menu-button__icon {
  width: 24px;
  font-size: 20px;
}

.skip-menu-button--mobile .skip-menu-button__label {
  font-size: 13px;
}

.skip-menu-button--mobile .skip-menu-button__hint {
  font-size: 10px;
}
</style>
