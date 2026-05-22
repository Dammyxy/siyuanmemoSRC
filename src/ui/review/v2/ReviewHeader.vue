<template>
  <div
    class="siyuanmemo-review-header-shell"
    :class="{
      'siyuanmemo-review-header-shell--with-nav': !!neuralEngineIntro,
      'siyuanmemo-review-header-shell--mobile': props.isMobile,
    }"
  >
    <div
      class="block__icons siyuanmemo-review-header"
      :class="{
        'siyuanmemo-review-header--mobile': props.isMobile,
        'siyuanmemo-review-header--native-dialog': usesNativeDialogTitlebar,
      }"
    >
      <span
        v-if="showDragSurface"
        class="siyuanmemo-review-header__drag-surface siyuanmemo-review-header__drag-zone resize__move"
        aria-hidden="true"
      ></span>

      <button
        v-if="showInlineQueueSwitchTrigger"
        type="button"
        class="siyuanmemo-review-header__queue-switch"
        :title="displayTitle"
        :aria-label="interpolate(t('switchReviewQueueAriaLabel', '切换复习队列：{title}'), { title: displayTitle })"
        @click="handleQueueSwitchClick"
      >
        <span class="siyuanmemo-review-header__queue-switch-text">{{ displayTitle }}</span>
      </button>

      <div v-if="props.routeControl" class="siyuanmemo-review-header__route-counter-group">
        <button
          type="button"
          class="siyuanmemo-review-header__route"
          :class="{ 'siyuanmemo-review-header__route--temporary': props.routeControl.temporary }"
          :title="routeControlTitle"
          :aria-label="routeControlAriaLabel"
          :disabled="props.routeControl.disabled"
          @click="handleRouteClick"
        >
          <span class="siyuanmemo-review-header__route-label">{{ props.routeControl.label }}</span>
          <span class="siyuanmemo-review-header__route-name">{{ props.routeControl.name }}</span>
          <svg class="siyuanmemo-review-header__route-icon"><use xlink:href="#iconDown"></use></svg>
        </button>

        <div
          ref="counterAreaRef"
          class="siyuanmemo-review-header__summary-wrap siyuanmemo-review-header__summary-wrap--grouped"
          @mouseenter="handleCounterMouseEnter"
          @mouseleave="handleCounterMouseLeave"
          @focusin="handleCounterFocusIn"
          @focusout="handleCounterFocusOut"
        >
          <button
            ref="counterTriggerRef"
            type="button"
            class="siyuanmemo-review-header__summary"
            :class="{ 'siyuanmemo-review-header__summary--count-hidden': isDesktopCounterValueHidden }"
            :aria-label="summaryButtonAriaLabel"
            :title="summaryButtonTitle"
            @pointerdown="handleCounterPointerDown"
            @click.stop="handleCounterClick"
          >
            <svg class="siyuanmemo-review-header__summary-icon"><use xlink:href="#iconRiffCard"></use></svg>
            <span v-if="!isDesktopCounterValueHidden" class="siyuanmemo-review-header__summary-count">{{ visibleCounterText }}</span>
          </button>

          <div
            v-if="isCounterPopoverOpen"
            ref="counterPopoverRef"
            class="siyuanmemo-review-header__popover"
            @click.stop
          >
            <div class="siyuanmemo-review-header__popover-header">
              <span class="siyuanmemo-review-header__popover-title">{{ displayTitle }}</span>
              <span class="siyuanmemo-review-header__popover-subtitle">{{ t('reviewCounterDetails', '复习详情') }}</span>
            </div>

            <section class="siyuanmemo-review-header__popover-section">
              <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewQueueProgress', '队列进度') }}</div>
              <div class="siyuanmemo-review-header__popover-grid">
                <div
                  v-for="metric in progressMetrics"
                  :key="metric.id"
                  class="siyuanmemo-review-header__popover-stat"
                >
                  <span class="siyuanmemo-review-header__popover-stat-label">{{ metric.label }}</span>
                  <span class="siyuanmemo-review-header__popover-stat-value">{{ metric.value }}</span>
                </div>
              </div>
              <div
                v-if="summaryDescription"
                class="siyuanmemo-review-header__popover-note"
                :title="summaryDescription"
              >
                {{ summaryDescription }}
              </div>
            </section>

            <section v-if="popoverCounters.length > 0" class="siyuanmemo-review-header__popover-section">
              <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewCounterBreakdown', '卡片构成') }}</div>
              <div class="siyuanmemo-review-header__popover-counter-list">
                <div
                  v-for="counter in popoverCounters"
                  :key="counter.id"
                  class="siyuanmemo-review-header__popover-counter"
                  :style="getPopoverCounterStyle(counter.tone)"
                >
                  <span class="siyuanmemo-review-header__popover-counter-label">{{ counter.label }}</span>
                  <span class="siyuanmemo-review-header__popover-counter-value">{{ counter.text }}</span>
                </div>
              </div>
            </section>

            <section class="siyuanmemo-review-header__popover-section">
              <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewCurrentCard', '当前卡片') }}</div>
              <div
                class="siyuanmemo-review-header__priority"
                :style="priorityBadgeStyle"
                :aria-label="header.priorityBadge.ariaLabel"
                :title="header.priorityBadge.ariaLabel"
              >
                <span class="siyuanmemo-review-header__priority-label">{{ t('headerPriority', 'Priority') }}</span>
                <span class="siyuanmemo-review-header__priority-value">{{ header.priorityBadge.value }}</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div
        v-else
        ref="counterAreaRef"
        class="siyuanmemo-review-header__summary-wrap"
        @mouseenter="handleCounterMouseEnter"
        @mouseleave="handleCounterMouseLeave"
        @focusin="handleCounterFocusIn"
        @focusout="handleCounterFocusOut"
      >
        <button
          ref="counterTriggerRef"
          type="button"
          class="siyuanmemo-review-header__summary"
          :class="{ 'siyuanmemo-review-header__summary--count-hidden': isDesktopCounterValueHidden }"
          :aria-label="summaryButtonAriaLabel"
          :title="summaryButtonTitle"
          @pointerdown="handleCounterPointerDown"
          @click.stop="handleCounterClick"
        >
          <svg class="siyuanmemo-review-header__summary-icon"><use xlink:href="#iconRiffCard"></use></svg>
          <span v-if="!isDesktopCounterValueHidden" class="siyuanmemo-review-header__summary-count">{{ visibleCounterText }}</span>
        </button>

        <div
          v-if="isCounterPopoverOpen"
          ref="counterPopoverRef"
          class="siyuanmemo-review-header__popover"
          @click.stop
        >
          <div class="siyuanmemo-review-header__popover-header">
            <span class="siyuanmemo-review-header__popover-title">{{ displayTitle }}</span>
            <span class="siyuanmemo-review-header__popover-subtitle">{{ t('reviewCounterDetails', '复习详情') }}</span>
          </div>

          <section class="siyuanmemo-review-header__popover-section">
            <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewQueueProgress', '队列进度') }}</div>
            <div class="siyuanmemo-review-header__popover-grid">
              <div
                v-for="metric in progressMetrics"
                :key="metric.id"
                class="siyuanmemo-review-header__popover-stat"
              >
                <span class="siyuanmemo-review-header__popover-stat-label">{{ metric.label }}</span>
                <span class="siyuanmemo-review-header__popover-stat-value">{{ metric.value }}</span>
              </div>
            </div>
            <div
              v-if="summaryDescription"
              class="siyuanmemo-review-header__popover-note"
              :title="summaryDescription"
            >
              {{ summaryDescription }}
            </div>
          </section>

          <section v-if="popoverCounters.length > 0" class="siyuanmemo-review-header__popover-section">
            <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewCounterBreakdown', '卡片构成') }}</div>
            <div class="siyuanmemo-review-header__popover-counter-list">
              <div
                v-for="counter in popoverCounters"
                :key="counter.id"
                class="siyuanmemo-review-header__popover-counter"
                :style="getPopoverCounterStyle(counter.tone)"
              >
                <span class="siyuanmemo-review-header__popover-counter-label">{{ counter.label }}</span>
                <span class="siyuanmemo-review-header__popover-counter-value">{{ counter.text }}</span>
              </div>
            </div>
          </section>

          <section class="siyuanmemo-review-header__popover-section">
            <div class="siyuanmemo-review-header__popover-section-title">{{ t('reviewCurrentCard', '当前卡片') }}</div>
            <div
              class="siyuanmemo-review-header__priority"
              :style="priorityBadgeStyle"
              :aria-label="header.priorityBadge.ariaLabel"
              :title="header.priorityBadge.ariaLabel"
            >
              <span class="siyuanmemo-review-header__priority-label">{{ t('headerPriority', 'Priority') }}</span>
              <span class="siyuanmemo-review-header__priority-value">{{ header.priorityBadge.value }}</span>
            </div>
          </section>
        </div>
      </div>

      <div v-if="filteredToolbar.length > 0" class="siyuanmemo-review-header__toolbar">
        <button
          v-for="btn in filteredToolbar"
          :key="btn.type"
          :data-type="btn.type"
          class="b3-tooltips b3-tooltips__sw block__icon block__icon--show siyuanmemo-review-header__toolbar-button"
          :class="{ 'siyuanmemo-review-header__toolbar-button--with-label': !!btn.label }"
          :aria-label="btn.ariaLabel"
          :title="btn.tooltip || btn.ariaLabel"
          :disabled="btn.disabled"
          @click="handleToolbarClick(btn, $event)"
        >
          <svg v-if="btn.icon"><use :xlink:href="btn.icon"></use></svg>
          <span v-if="btn.label" class="siyuanmemo-review-header__toolbar-label">{{ btn.label }}</span>
        </button>
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

    <div v-if="neuralEngineIntro" class="siyuanmemo-review-header__nav-strip">
      <span class="siyuanmemo-review-header__nav-strip-text">{{ neuralEngineIntro }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showMessage } from 'siyuan';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getHeaderToneColor, getPriorityVisualToken } from '@/ui/shared/cardVisualTokens';
import { getNeuralEngineLabel } from '@/ui/shared/neuralRoamLabels';
import type { NeuralNavigationState } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type { ReviewHeaderCounterBadge, ReviewHeaderRouteControl, ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
  meta?: ReviewUIState['meta'];
  i18n?: Record<string, string>;
  isTabMode?: boolean;
  title?: string;
  mode?: 'dialog' | 'tab';
  showSidebarToggle?: boolean;
  sidebarCollapsed?: boolean;
  isMobile?: boolean;
  nativeDialogTitlebar?: boolean;
  navigationState?: NeuralNavigationState | null;
  routeControl?: ReviewHeaderRouteControl | null;
}>();

const emit = defineEmits<{
  (e: 'toolbar-action', actionType: string, event: MouseEvent): void;
  (e: 'action', actionId: string): void;
  (e: 'context', payload: { id: string; openNewTab: boolean }): void;
  (e: 'breadcrumb-click', crumb: { icon?: string; text: string; id?: string; action?: string }, index: number): void;
  (e: 'queue-switch', event: MouseEvent): void;
  (e: 'route-menu', event: MouseEvent): void;
}>();

const logger = createLogger('ReviewHeader');
type ReviewToolbarButton = NonNullable<ReviewUIState['header']['toolbar']>[number];

type WindowWithSiyuanLanguages = Window & {
  siyuan?: {
    languages?: {
      flashcard?: Record<string, string>;
    };
  };
};

const counterAreaRef = ref<HTMLElement | null>(null);
const counterTriggerRef = ref<HTMLButtonElement | null>(null);
const counterPopoverRef = ref<HTMLElement | null>(null);
const isCounterPopoverOpen = ref(false);
const isCounterValueHidden = ref(false);
const isDesktopCounterValueHidden = computed(() => !props.isMobile && isCounterValueHidden.value);
const shouldIgnoreNextDesktopFocusOpen = ref(false);
const usesNativeDialogTitlebar = computed(() => (
  props.nativeDialogTitlebar === true
  && props.mode === 'dialog'
  && props.isMobile !== true
));
const showDragSurface = computed(() => !props.isMobile && !usesNativeDialogTitlebar.value);
const showInlineQueueSwitchTrigger = computed(() => !props.isMobile && props.mode === 'tab');

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

const displayTitle = computed(() => (
  String(props.title || props.header?.title || props.header?.stats?.queueName || t('reviewTitle', 'Review')).trim()
    || t('reviewTitle', 'Review')
));

const routeControlTitle = computed(() => {
  const route = props.routeControl;
  if (!route) {
    return '';
  }
  return [route.name, route.detail].filter(Boolean).join(' · ');
});

const routeControlAriaLabel = computed(() => {
  const route = props.routeControl;
  if (!route) {
    return '';
  }
  return interpolate(t('switchNeuralRoamRouteAriaLabel', '切换航线：{name}'), { name: route.name });
});

const visibleCounterValue = computed(() => {
  const summaryValue = Number(counterSummary.value?.value);
  if (Number.isFinite(summaryValue) && summaryValue >= 0) {
    return Math.max(0, Math.trunc(summaryValue));
  }

  const metaRemaining = Number(props.meta?.queueProgress?.remaining);
  if (Number.isFinite(metaRemaining) && metaRemaining >= 0) {
    return Math.max(0, Math.trunc(metaRemaining));
  }

  const headerRemaining = Number(props.header?.stats?.current);
  if (Number.isFinite(headerRemaining) && headerRemaining >= 0) {
    return Math.max(0, Math.trunc(headerRemaining));
  }

  return 0;
});

const visibleCounterText = computed(() => String(visibleCounterValue.value));

const queueProgress = computed(() => props.meta?.queueProgress || null);

const summaryMetricText = computed(() => {
  const progress = queueProgress.value;
  const remaining = Math.max(0, Number(progress?.remaining) || visibleCounterValue.value);
  const total = Number(progress?.total);

  return Number.isFinite(total) && total > 0
    ? `${t('headerRemaining', '剩余')} ${remaining} · ${t('reviewTotalCards', '总数')} ${Math.max(remaining, Math.trunc(total))}`
    : `${t('headerRemaining', '剩余')} ${remaining}`;
});

const progressMetrics = computed(() => {
  const progress = queueProgress.value;
  const completed = Math.max(0, Number(progress?.completed) || 0);
  const remaining = Math.max(0, Number(progress?.remaining) || visibleCounterValue.value);
  const total = Number(progress?.total);

  return [
    {
      id: 'completed',
      label: t('reviewCompletedCards', '已学'),
      value: String(completed),
    },
    {
      id: 'remaining',
      label: t('headerRemaining', '剩余'),
      value: String(remaining),
    },
    ...(Number.isFinite(total) && total > 0
      ? [{
          id: 'total',
          label: t('reviewTotalCards', '总数'),
          value: String(Math.max(remaining, Math.trunc(total))),
        }]
      : []),
  ];
});

const summaryDescription = computed(() => {
  const description = String(counterSummary.value?.ariaLabel || counterSummary.value?.tooltip || '').trim();
  return description;
});

const popoverCounters = computed(() => {
  if (counterBadges.value.length > 0) {
    return counterBadges.value;
  }

  const parts = counterSummary.value?.parts || [];
  return parts.map((part) => ({
    id: part.id,
    label: part.label,
    kind: 'ratio' as const,
    tone: part.tone,
    text: `${Math.max(0, Number(part.remaining) || 0)}/${Math.max(0, Number(part.total) || 0)}`,
    ariaLabel: `${part.label} ${Math.max(0, Number(part.remaining) || 0)}/${Math.max(0, Number(part.total) || 0)}`,
  }));
});

const summaryButtonTitle = computed(() => {
  if (props.isMobile) {
    return `${summaryMetricText.value} · ${t('reviewCounterTapDetailsHint', '点击查看复习详情')}`;
  }

  if (isDesktopCounterValueHidden.value) {
    return [
      t('reviewCounterHiddenState', '卡片计数已隐藏'),
      t('reviewCounterHoverDetailsHint', '悬停查看复习详情'),
      t('reviewCounterShowCountAction', '点击显示卡片数量'),
    ].join(' · ');
  }

  return [
    summaryMetricText.value,
    t('reviewCounterHoverDetailsHint', '悬停查看复习详情'),
    t('reviewCounterHideCountAction', '点击隐藏卡片数量'),
  ].join(' · ');
});

const summaryButtonAriaLabel = computed(() => {
  if (props.isMobile) {
    return `${t('headerRemaining', '剩余')} ${visibleCounterText.value}，${t('reviewCounterTapDetailsHint', '点击查看复习详情')}`;
  }

  if (isDesktopCounterValueHidden.value) {
    return `${t('reviewCounterHiddenState', '卡片计数已隐藏')}，${t('reviewCounterShowCountAction', '点击显示卡片数量')}`;
  }

  return `${t('headerRemaining', '剩余')} ${visibleCounterText.value}，${t('reviewCounterHideCountAction', '点击隐藏卡片数量')}`;
});

const neuralEngineIntro = computed(() => {
  if (!props.navigationState) {
    return '';
  }
  return props.navigationState.engineMode === 'hyperspace'
    ? t(
        'engineHyperspaceIntro',
        'Propagate outward layer by layer from activation sources through links and optional tree relations.',
      )
    : t(
        'engineOrbitIntro',
        'Roam locally around orbit centers, concept cards, and nearby stations.',
      );
});

function getReviewSourceListButtonLabel(engineMode: NonNullable<NeuralNavigationState>['engineMode']): string {
  return engineMode === 'hyperspace'
    ? t('viewActivationSourceList', 'View Activation Source List')
    : t('viewOrbitCenterList', 'View Orbit Center List');
}

function overrideReviewToolbarButton(btn: ReviewToolbarButton, navState: NeuralNavigationState): ReviewToolbarButton {
  if (btn.type === 'lock-focus') {
    const ariaLabel = t('addAnchor', 'Build Station');
    return {
      ...btn,
      icon: '#iconPin',
      ariaLabel,
      tooltip: ariaLabel,
    };
  }

  if (btn.type === 'neural-focuses') {
    const ariaLabel = getReviewSourceListButtonLabel(navState.engineMode);
    return {
      ...btn,
      ariaLabel,
      tooltip: ariaLabel,
    };
  }

  return btn;
}

function getToolbarSortWeight(btn: ReviewToolbarButton): number {
  if (btn.type === 'ai-sidebar') {
    return 20;
  }
  if (btn.type === 'more') {
    return 30;
  }
  return 10;
}

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
    const engineFullText = getNeuralEngineLabel(navState.engineMode, t, 'full');
    const modeText = navState.navigationMode === 'follow'
      ? t('navModeFollow', 'Follow Path')
      : t('navModeExplore', 'Free Roam');
    const switchEngineLabel = interpolate(
      t('switchEngineMode', 'Switch Engine: {mode}'),
      { mode: engineFullText },
    );
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
      ariaLabel: switchEngineLabel,
      tooltip: switchEngineLabel,
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
      ariaLabel: t('returnToBookmark', 'Return to Station'),
      disabled: !navState.hasBookmark,
    });

    toolbar = [
      ...navButtons,
      ...toolbar,
    ].map(btn => overrideReviewToolbarButton(btn, navState));
  }

  const ordered = toolbar
    .map((btn, index) => ({ btn, index }))
    .sort((left, right) => {
      const weightDiff = getToolbarSortWeight(left.btn) - getToolbarSortWeight(right.btn);
      return weightDiff !== 0 ? weightDiff : left.index - right.index;
    })
    .map(({ btn }) => btn);

  return props.isMobile
    ? ordered.filter(btn => btn.type !== 'fullscreen' && btn.type !== 'close-review')
    : ordered;
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

function getPopoverCounterStyle(tone: ReviewHeaderCounterBadge['tone']) {
  return createGhostStyle(getHeaderToneColor(tone));
}

function showCounterNotice(message: string): void {
  showMessage(message, 2800, 'info');
}

function openCounterPopover(): void {
  isCounterPopoverOpen.value = true;
}

function closeCounterPopover(): void {
  isCounterPopoverOpen.value = false;
}

function toggleCounterPopover(): void {
  isCounterPopoverOpen.value = !isCounterPopoverOpen.value;
}

function handleCounterPointerDown(): void {
  if (props.isMobile) {
    return;
  }
  shouldIgnoreNextDesktopFocusOpen.value = true;
}

function handleCounterMouseEnter(): void {
  if (props.isMobile) {
    return;
  }
  openCounterPopover();
}

function handleCounterMouseLeave(): void {
  if (props.isMobile) {
    return;
  }
  shouldIgnoreNextDesktopFocusOpen.value = false;
  closeCounterPopover();
}

function handleCounterFocusIn(): void {
  if (props.isMobile) {
    return;
  }
  if (shouldIgnoreNextDesktopFocusOpen.value) {
    shouldIgnoreNextDesktopFocusOpen.value = false;
    return;
  }
  openCounterPopover();
}

function handleCounterFocusOut(event: FocusEvent): void {
  if (props.isMobile) {
    return;
  }
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && counterAreaRef.value?.contains(nextTarget)) {
    return;
  }
  shouldIgnoreNextDesktopFocusOpen.value = false;
  closeCounterPopover();
}

function handleCounterClick(): void {
  if (props.isMobile) {
    toggleCounterPopover();
    return;
  }

  isCounterValueHidden.value = !isCounterValueHidden.value;
  showCounterNotice(
    isCounterValueHidden.value
      ? t('reviewCounterHiddenToast', '队列卡片进度已隐藏')
      : t('reviewCounterVisibleToast', '队列卡片进度已显示'),
  );
}

function handleDocumentPointerDown(event: Event): void {
  if (!isCounterPopoverOpen.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (counterAreaRef.value?.contains(target)) {
    return;
  }

  closeCounterPopover();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isCounterPopoverOpen.value) {
    return;
  }
  closeCounterPopover();
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

function handleQueueSwitchClick(event: MouseEvent): void {
  event.stopPropagation();
  emit('queue-switch', event);
}

function handleRouteClick(event: MouseEvent): void {
  event.stopPropagation();
  emit('route-menu', event);
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<style scoped>
.siyuanmemo-review-header-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.block__icons.siyuanmemo-review-header {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 42px;
  padding: 0 8px;
  background: var(--b3-theme-surface);
  border-bottom: 1px solid var(--b3-border-color);
}

.block__icons.siyuanmemo-review-header.siyuanmemo-review-header--native-dialog {
  display: flex;
  justify-content: flex-end;
  min-height: 38px;
  gap: 6px;
  padding: 0 10px 0 8px;
}

.siyuanmemo-review-header-shell--with-nav .block__icons.siyuanmemo-review-header {
  border-bottom: none;
}

.siyuanmemo-review-header__drag-surface {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  border-radius: inherit;
}

.siyuanmemo-review-header__queue-switch {
  position: relative;
  z-index: 2;
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-width: 0;
  max-width: min(260px, 100%);
  padding: 0 4px;
  min-height: 30px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  cursor: pointer;
  text-align: left;
}

.siyuanmemo-review-header__queue-switch-text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.siyuanmemo-review-header__drag-zone {
  user-select: none;
  -webkit-app-region: drag;
}

.siyuanmemo-review-header__queue-switch:hover,
.siyuanmemo-review-header__queue-switch:focus-visible,
.siyuanmemo-review-header__drag-surface:hover {
  background: color-mix(in srgb, var(--b3-theme-on-surface-light) 6%, transparent);
}

.siyuanmemo-review-header__route {
  position: relative;
  z-index: 3;
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(220px, 100%);
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  cursor: pointer;
}

.siyuanmemo-review-header__route:hover,
.siyuanmemo-review-header__route:focus-visible {
  border-color: var(--b3-theme-primary);
  background: var(--b3-list-hover);
}

.siyuanmemo-review-header__route--temporary {
  border-color: color-mix(in srgb, var(--b3-theme-primary) 36%, var(--b3-border-color));
}

.siyuanmemo-review-header__route-label {
  flex: 0 0 auto;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.siyuanmemo-review-header__route-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.siyuanmemo-review-header__route-icon {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  color: var(--b3-theme-on-surface-light);
}

.siyuanmemo-review-header__summary-wrap {
  position: relative;
  z-index: 3;
  grid-column: 3;
  display: inline-flex;
  align-items: center;
  justify-self: center;
  min-width: 0;
  flex-shrink: 0;
}

.siyuanmemo-review-header__route-counter-group {
  position: relative;
  z-index: 3;
  grid-column: 2 / 4;
  display: inline-flex;
  align-items: stretch;
  justify-self: end;
  min-width: 0;
  flex-shrink: 0;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  overflow: hidden;
}

.siyuanmemo-review-header__route-counter-group:hover,
.siyuanmemo-review-header__route-counter-group:focus-within {
  border-color: var(--b3-theme-primary);
  background: var(--b3-list-hover);
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__route {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__route:hover,
.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__route:focus-visible {
  border-color: transparent;
  background: transparent;
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__summary-wrap {
  border-left: 1px solid var(--b3-border-color);
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__summary-wrap:hover,
.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__summary-wrap:focus-within {
  background: transparent;
}

.siyuanmemo-review-header__summary-wrap--grouped {
  position: relative;
  justify-self: auto;
}

.siyuanmemo-review-header__queue-switch,
.siyuanmemo-review-header__route,
.siyuanmemo-review-header__summary-wrap,
.siyuanmemo-review-header__summary,
.siyuanmemo-review-header__toolbar,
.siyuanmemo-review-header__toolbar-button,
.siyuanmemo-review-header__mobile-close {
  -webkit-app-region: no-drag;
}

.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  grid-column: auto;
  justify-self: auto;
  transform: translate(-50%, -50%);
}

.siyuanmemo-review-header__summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 34px;
  min-width: 82px;
  padding: 0 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  box-shadow: none;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary {
  min-height: 30px;
  min-width: 76px;
  padding: 0 10px;
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__summary {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.siyuanmemo-review-header__route-counter-group .siyuanmemo-review-header__summary:hover {
  transform: none;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.siyuanmemo-review-header__summary:hover {
  transform: none;
  border-color: var(--b3-theme-primary);
  background: var(--b3-list-hover);
  box-shadow: none;
}

.siyuanmemo-review-header__summary-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--b3-theme-primary);
}

.siyuanmemo-review-header__summary--count-hidden {
  gap: 0;
}

.siyuanmemo-review-header__summary-count {
  font-size: 16px;
  line-height: 1;
  min-width: 1ch;
}

.siyuanmemo-review-header__popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(320px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateX(-50%);
}

.siyuanmemo-review-header__popover-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.siyuanmemo-review-header__popover-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--b3-theme-on-surface);
  font-size: 14px;
  font-weight: 700;
}

.siyuanmemo-review-header__popover-subtitle {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.siyuanmemo-review-header__popover-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.siyuanmemo-review-header__popover-section-title {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.siyuanmemo-review-header__popover-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.siyuanmemo-review-header__popover-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-surface);
}

.siyuanmemo-review-header__popover-stat-label {
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
}

.siyuanmemo-review-header__popover-stat-value {
  color: var(--b3-theme-on-background);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-review-header__popover-note {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.45;
}

.siyuanmemo-review-header__popover-counter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.siyuanmemo-review-header__popover-counter,
.siyuanmemo-review-header__priority {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 3px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.siyuanmemo-review-header__popover-counter-label,
.siyuanmemo-review-header__priority-label {
  opacity: 0.78;
}

.siyuanmemo-review-header__popover-counter-value,
.siyuanmemo-review-header__priority-value {
  font-weight: 700;
}

.siyuanmemo-review-header__toolbar {
  position: relative;
  z-index: 3;
  grid-column: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
  flex-shrink: 0;
}

.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__toolbar {
  grid-column: auto;
  gap: 4px;
  margin-left: auto;
}

.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__mobile-close {
  z-index: 3;
}

.siyuanmemo-review-header__toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.siyuanmemo-review-header__toolbar-button:disabled {
  opacity: 0.46;
  cursor: not-allowed;
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
  position: relative;
  z-index: 3;
  grid-column: 6;
  margin-left: 2px;
  justify-self: end;
  flex-shrink: 0;
}

.siyuanmemo-review-header__nav-strip {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 4px 12px 6px;
  color: var(--b3-theme-on-surface-light);
  background-color: var(--b3-theme-surface);
  border-bottom: 1px solid var(--b3-border-color);
  font-size: 12px;
  line-height: 1.35;
}

.siyuanmemo-review-header__nav-strip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.siyuanmemo-review-header--mobile {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 8px;
  padding: 8px;
  min-height: 0;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__summary-wrap {
  grid-column: 2;
  justify-self: stretch;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__summary {
  min-height: 32px;
  min-width: 72px;
  padding: 0 12px;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__summary-count {
  font-size: 16px;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__toolbar {
  grid-column: 3;
  gap: 4px;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__toolbar-button--with-label {
  padding: 0 8px;
  max-width: 160px;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__toolbar-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.siyuanmemo-review-header-shell--mobile .siyuanmemo-review-header__nav-strip {
  padding: 4px 8px 6px;
}

.siyuanmemo-review-header--mobile .siyuanmemo-review-header__mobile-close {
  grid-column: 4;
}

@media (max-width: 640px) {
  .siyuanmemo-review-header__popover {
    width: min(320px, calc(100vw - 16px));
  }

  .siyuanmemo-review-header__popover-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .siyuanmemo-review-header__notice {
    top: 8px;
    right: 8px;
    width: min(320px, calc(100vw - 16px));
  }
}
</style>
