<template>
  <div class="block__icons siyuanmemo-review-header" :class="{ 'siyuanmemo-review-header--mobile': props.isMobile }">
    <div class="block__logo">
      <svg class="block__logoicon"><use xlink:href="#iconRiffCard"></use></svg>
      <span>{{ title || header.stats.queueName || '\u95ea\u5361' }}</span>
    </div>

    <span v-if="!props.isMobile" class="fn__flex-1 resize__move" style="min-height: 100%"></span>

    <div data-type="count" class="siyuanmemo-review-header__metrics">
      <span
        v-if="counterSummary"
        class="b3-tooltips b3-tooltips__sw siyuanmemo-review-header__summary"
        :class="{ 'siyuanmemo-review-header__summary--value': counterSummary.kind === 'value' }"
        :aria-label="counterSummary.ariaLabel"
        :title="counterSummary.tooltip"
      >
        {{ counterSummary.text }}
      </span>

      <div
        v-for="badge in counterBadges"
        :key="badge.id"
        class="siyuanmemo-review-header__badge"
        :style="getBadgeStyle(badge.tone)"
        :aria-label="badge.ariaLabel"
        :title="badge.ariaLabel"
      >
        <span class="siyuanmemo-review-header__badge-label">{{ badge.label }}</span>
        <span class="siyuanmemo-review-header__badge-text">{{ badge.text }}</span>
      </div>
    </div>

    <span class="fn__flex-1"></span>

    <div
      class="siyuanmemo-review-header__priority"
      :style="priorityBadgeStyle"
      :aria-label="header.priorityBadge.ariaLabel"
      :title="header.priorityBadge.ariaLabel"
    >
      <span class="siyuanmemo-review-header__priority-label">{{ header.priorityBadge.label }}</span>
      <span class="siyuanmemo-review-header__priority-value">{{ header.priorityBadge.value }}</span>
    </div>

    <div v-if="filteredToolbar.length > 0" class="siyuanmemo-review-header__toolbar">
      <template v-for="btn in filteredToolbar" :key="btn.type">
        <button
          v-if="!btn.disabled"
          :data-type="btn.type"
          class="b3-tooltips b3-tooltips__sw block__icon block__icon--show siyuanmemo-review-header__toolbar-button"
          :class="{ 'siyuanmemo-review-header__toolbar-button--with-label': !!btn.label }"
          :aria-label="btn.ariaLabel"
          :title="btn.tooltip || btn.ariaLabel"
          @click="handleToolbarClick(btn, $event)"
        >
          <svg v-if="btn.icon"><use :xlink:href="btn.icon"></use></svg>
          <span v-if="btn.label" class="siyuanmemo-review-header__toolbar-label">{{ btn.label }}</span>
        </button>
      </template>
    </div>

    <button
      v-if="showMobileClose"
      data-type="close-review"
      class="b3-tooltips b3-tooltips__sw block__icon block__icon--show siyuanmemo-review-header__mobile-close"
      :aria-label="t('mobileClose', 'Close')"
      @click="handleCloseClick"
    >
      <svg><use xlink:href="#iconCloseRound"></use></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getHeaderToneColor, getPriorityVisualToken } from '@/ui/shared/cardVisualTokens';
import type { NeuralNavigationState } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type { ReviewHeaderCounterBadge, ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
  i18n?: Record<string, string>;
  isTabMode?: boolean;
  title?: string;
  mode?: 'dialog' | 'tab';
  showSidebarToggle?: boolean;
  sidebarCollapsed?: boolean;
  isMobile?: boolean;
  navigationState?: NeuralNavigationState | null;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'action', actionId: string): void;
  (e: 'context', payload: { id: string; openNewTab: boolean }): void;
  (e: 'breadcrumb-click', crumb: { icon?: string; text: string; id?: string; action?: string }, index: number): void;
}>();

const logger = createLogger('ReviewHeader');

type WindowWithSiyuanLanguages = Window & {
  siyuan?: {
    languages?: {
      flashcard?: Record<string, string>;
    };
  };
};

const counterSummary = computed(() => props.header?.counterSummary || null);
const counterBadges = computed(() => props.header?.counterBadges || []);

function createGhostStyle(color: string) {
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 18%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`,
  };
}

const priorityBadgeStyle = computed(() => {
  const token = getPriorityVisualToken(props.header?.priorityBadge?.priority ?? null);
  return createGhostStyle(token.color);
});

const filteredToolbar = computed(() => {
  let toolbar = props.header?.toolbar || [];
  logger.debug('[SiYuanMemo][ReviewHeader] filteredToolbar computed:', {
    hasHeader: !!props.header,
    hasToolbar: !!props.header?.toolbar,
    toolbarLength: toolbar.length,
    toolbar,
    mode: props.mode,
    navigationState: props.navigationState,
  });

  const navState = props.navigationState;
  if (navState) {
    const navButtons: typeof toolbar = [];
    const engineText = navState.engineMode === 'hyperspace'
      ? t('engineHyperspace', 'Hyperspace Expedition / 超空间远征')
      : t('engineOrbit', 'Orbit / 轨道');
    const engineIntroLong = navState.engineMode === 'hyperspace'
      ? t(
          'engineHyperspaceIntroLong',
          '从一个或多个激活源出发，沿概念链接、块链接和可选树关系逐层向外传导，不围绕单一中心打转。',
        )
      : t(
          'engineOrbitIntroLong',
          '围绕轨道中心，在概念卡与锚点周围的反向链接、直接引用、间接引用与描述符之间做局部航行。',
        );
    const modeText = navState.navigationMode === 'follow'
      ? t('navModeFollow', 'Follow Path')
      : t('navModeExplore', 'Free Explore');
    const navStatusLabel = navState.navigationMode === 'follow'
      ? interpolate(
          t('navStatusFollow', 'Current: {mode} ({current}/{total})'),
          {
            mode: modeText,
            current: navState.currentPathIndex + 1,
            total: navState.pathLength,
          },
        )
      : interpolate(
          t('navStatusExplore', 'Current: {mode}'),
          { mode: modeText },
        );

    navButtons.push({
      type: 'neural-engine-mode',
      icon: '#iconRefresh',
      ariaLabel: `${interpolate(
        t('switchEngineMode', 'Switch Engine: {mode}'),
        { mode: engineText },
      )} ${engineIntroLong}`.trim(),
      tooltip: `${interpolate(
        t('switchEngineMode', 'Switch Engine: {mode}'),
        { mode: engineText },
      )}\n${engineIntroLong}`.trim(),
      disabled: false,
    });

    navButtons.push({
      type: 'neural-nav-mode',
      icon: '#iconMove',
      ariaLabel: navStatusLabel,
      disabled: false,
    });

    navButtons.push({
      type: 'neural-return-bookmark',
      icon: '#iconBookmark',
      ariaLabel: t('returnToBookmark', 'Return to Anchor'),
      disabled: !navState.hasBookmark,
    });

    toolbar = [
      ...navButtons,
      ...toolbar,
    ];
  }

  if (props.isMobile) {
    toolbar = toolbar.filter(btn => btn.type !== 'fullscreen' && btn.type !== 'close-review');
  }
  return toolbar;
});

const showMobileClose = computed(() => Boolean(props.isMobile && props.mode !== 'tab'));

function t(key: string, fallback: string): string {
  if (props.i18n?.[key]) {
    return props.i18n[key];
  }
  const i18nFromWindow = (window as WindowWithSiyuanLanguages).siyuan?.languages?.flashcard;
  return i18nFromWindow?.[key] || fallback;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return output;
}

function getBadgeStyle(tone: ReviewHeaderCounterBadge['tone']) {
  return createGhostStyle(getHeaderToneColor(tone));
}

function handleToolbarClick(
  btn: { type: string; icon?: string; label?: string; ariaLabel?: string; disabled?: boolean },
  event: MouseEvent,
) {
  if (btn.disabled) return;
  event.stopPropagation();
  emit('toolbar-action', btn.type, event);
}

function handleCloseClick(event: MouseEvent): void {
  event.stopPropagation();
  emit('toolbar-action', 'close-review', event);
}
</script>

<style scoped>
.block__icons.siyuanmemo-review-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  background-color: var(--b3-theme-surface) !important;
  border-bottom: 1px solid var(--b3-theme-background);
}

.block__logo {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: 500;
}

.block__logo span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.siyuanmemo-review-header__metrics {
  display: flex;
  align-items: center;
  gap: 6px;
  row-gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.siyuanmemo-review-header__summary,
.siyuanmemo-review-header__badge,
.siyuanmemo-review-header__priority {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-review-header__summary {
  color: var(--b3-theme-on-surface-light);
  border-color: color-mix(in srgb, var(--b3-theme-on-surface-light) 18%, transparent);
  background-color: color-mix(in srgb, var(--b3-theme-on-surface-light) 6%, transparent);
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: help;
}

.siyuanmemo-review-header__summary:hover {
  border-color: color-mix(in srgb, var(--b3-theme-on-surface-light) 28%, transparent);
  background-color: color-mix(in srgb, var(--b3-theme-on-surface-light) 10%, transparent);
}

.siyuanmemo-review-header__summary--value {
  justify-content: center;
  min-width: 34px;
}

.siyuanmemo-review-header__badge,
.siyuanmemo-review-header__priority {
  flex-shrink: 0;
}

.siyuanmemo-review-header__badge-label,
.siyuanmemo-review-header__priority-label {
  opacity: 0.8;
}

.siyuanmemo-review-header__badge-text,
.siyuanmemo-review-header__priority-value {
  font-weight: 600;
}

.siyuanmemo-review-header__priority-value {
  font-weight: 700;
}

.siyuanmemo-review-header__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.siyuanmemo-review-header__toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.siyuanmemo-review-header__toolbar-button--with-label {
  width: auto;
  padding: 0 10px;
}

.siyuanmemo-review-header__toolbar-label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.siyuanmemo-review-header__mobile-close {
  margin-left: 2px;
  flex-shrink: 0;
}

.protyle-breadcrumb {
  display: flex;
  padding: 0 8px;
  background-color: var(--b3-theme-background);
  flex-shrink: 0;
  box-sizing: border-box;
  min-height: 30px;
  z-index: 1;
  font-size: 14px;
  margin-left: 12px;
  border-radius: 4px;
}

.protyle-breadcrumb__bar {
  align-items: center;
  flex-wrap: wrap;
  display: flex;
  transition: var(--b3-transition);
  overflow: auto;
  min-height: 30px;
}

.protyle-breadcrumb__arrow {
  height: 10px;
  width: 10px;
  color: var(--b3-theme-on-surface-light);
  margin: 0 4px;
  flex-shrink: 0;
}

.protyle-breadcrumb__text {
  margin-left: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.protyle-breadcrumb__item {
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 4px;
  line-height: 24px;
  height: 24px;
  border-radius: var(--b3-border-radius);
  margin: 3px 0;
  color: var(--b3-theme-on-surface);
  border: 0;
  background-color: transparent;
  box-sizing: inherit;

  svg {
    height: 14px;
    width: 14px;
    flex-shrink: 0;
    color: var(--b3-theme-on-surface);

    &:hover {
      color: var(--b3-theme-on-background);
    }
  }

  &:hover {
    color: var(--b3-theme-on-background);
    background-color: var(--b3-list-hover);
  }

  &.protyle-breadcrumb__item--active {
    color: var(--b3-theme-on-background);
    background-color: var(--b3-list-hover);
  }
}

.popover__block {
  cursor: pointer;
}

.fn__grab {
  cursor: grab;
}

.siyuanmemo-review-header--mobile {
  gap: 4px;
  padding: 0 6px;

  .block__logo {
    min-width: 0;
    flex: 1 1 auto;

    span {
      max-width: 112px;
    }
  }

  .siyuanmemo-review-header__metrics {
    flex: 1 1 0;
    justify-content: flex-start;
  }

  .siyuanmemo-review-header__summary,
  .siyuanmemo-review-header__badge,
  .siyuanmemo-review-header__priority {
    padding: 0 7px;
  }

  .siyuanmemo-review-header__toolbar {
    gap: 4px;
  }

  .siyuanmemo-review-header__toolbar-button--with-label {
    padding: 0 8px;
    max-width: 160px;
  }

  .siyuanmemo-review-header__toolbar-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
