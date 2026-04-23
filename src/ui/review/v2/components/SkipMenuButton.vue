<template>
  <div
    ref="rootRef"
    class="skip-menu-button"
    :class="{
      'skip-menu-button--mobile': props.isMobile,
      'skip-menu-button--desktop-stacked': props.desktopStacked,
      'skip-menu-button--open': menuOpen,
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
      :aria-expanded="menuOpen ? 'true' : 'false'"
      :aria-label="t('moreSkipActions', '更多跳过操作')"
      @click="toggleMenu"
    >
      <svg class="skip-menu-button__chevron"><use xlink:href="#iconUp"></use></svg>
    </button>

    <div
      v-if="menuOpen"
      class="skip-menu-button__panel"
      role="menu"
      @click.stop
    >
      <button
        class="skip-menu-button__menu-item"
        role="menuitem"
        type="button"
        @click="runMenuAction('insert')"
      >
        <svg class="skip-menu-button__menu-icon"><use xlink:href="#iconPin"></use></svg>
        <span class="skip-menu-button__menu-copy">
          <span class="skip-menu-button__menu-label">{{ t('insertToPosition', '插入到队列指定位置') }}</span>
        </span>
      </button>

      <button
        v-if="props.canScheduleDate"
        class="skip-menu-button__menu-item"
        role="menuitem"
        type="button"
        @click="runMenuAction('schedule')"
      >
        <svg class="skip-menu-button__menu-icon"><use xlink:href="#iconCalendar"></use></svg>
        <span class="skip-menu-button__menu-copy">
          <span class="skip-menu-button__menu-label">{{ t('scheduleDate', '安排复习日期') }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  i18n?: Record<string, string>;
  queueSize?: number;
  isMobile?: boolean;
  canScheduleDate?: boolean;
  desktopStacked?: boolean;
}

interface Emits {
  (e: 'skip'): void;
  (e: 'insert'): void;
  (e: 'schedule'): void;
}

const props = withDefaults(defineProps<Props>(), {
  canScheduleDate: true,
  desktopStacked: false,
});
const emit = defineEmits<Emits>();

const rootRef = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const skipHotkeyHint = '0 / x';

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function handleSkip(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();
  closeMenu();
  emit('skip');
}

function toggleMenu(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();
  menuOpen.value = !menuOpen.value;
}

function runMenuAction(action: 'insert' | 'schedule'): void {
  closeMenu();
  emit(action);
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!menuOpen.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    closeMenu();
    return;
  }

  if (rootRef.value?.contains(target)) {
    return;
  }

  closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !menuOpen.value) {
    return;
  }

  event.stopPropagation();
  closeMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
});
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
.skip-menu-button:focus-within,
.skip-menu-button--open {
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
  transition: transform 0.12s ease;
}

.skip-menu-button--open .skip-menu-button__chevron {
  transform: rotate(180deg);
}

.skip-menu-button__panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 20;
  min-width: 200px;
  padding: 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.skip-menu-button__menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--b3-theme-on-surface);
  text-align: left;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.skip-menu-button__menu-item:hover {
  background: color-mix(in srgb, var(--b3-theme-primary-lightest) 78%, var(--b3-theme-background));
  color: var(--b3-theme-primary);
}

.skip-menu-button__menu-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.skip-menu-button__menu-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skip-menu-button__menu-label {
  font-size: 13px;
  font-weight: 500;
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

.skip-menu-button--mobile .skip-menu-button__panel {
  min-width: 184px;
}

.skip-menu-button--desktop-stacked {
  grid-template-columns: minmax(0, 1fr) 32px;
  min-height: 44px;
  border-radius: 6px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__main,
.skip-menu-button--desktop-stacked .skip-menu-button__trigger {
  min-height: 44px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__main {
  gap: 8px;
  padding-inline: 10px;
  border-radius: 6px 0 0 6px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__trigger {
  border-radius: 0 6px 6px 0;
}

.skip-menu-button--desktop-stacked .skip-menu-button__trigger::before {
  top: 8px;
  bottom: 8px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__icon {
  width: 24px;
  font-size: 20px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__label {
  font-size: 13px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__hint {
  font-size: 10px;
}

.skip-menu-button--desktop-stacked .skip-menu-button__panel {
  bottom: calc(100% + 8px);
}
</style>
