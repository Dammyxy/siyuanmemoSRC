<template>
  <div ref="rootRef" class="fsrs-review-v2" data-key="dialog-opencard" @click="handleRootClick">
    <ReviewHeader :header="state.header" :is-tab-mode="!!props.reviewUI" @toolbar-action="handleToolbarAction" @action="hook.executeCommand" @context="handleContext" @breadcrumb-click="handleBreadcrumbClick" />

    <ReviewContent :app="app" :content="state.content" :overlay="state.overlay" :has-hidden-content="state.meta.hasHiddenContent" :show-answer="state.actions.showAnswer" :meta="state.meta" :i18n="i18n" />

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
import { Menu, openTab } from 'siyuan';
import { onMounted, onUnmounted, ref } from 'vue';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import { useReviewSession } from './useReviewSession';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { ProviderBackedQueueStrategy } from '@/core/extensions';
import { createVueDialog } from '@/utils/dialog';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';

const props = defineProps<{
  app: any;
  i18n?: Record<string, string>;
  queue?: any;
  adapter?: any;
  provider?: any;
  reviewUI?: any;
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
}>();

const rootRef = ref<HTMLDivElement | null>(null);

// 检查环境
onMounted(() => {
  console.log('[FSRS ReviewView] Component mounted');
  console.log('[FSRS ReviewView] Checking environment:', {
    hasRootRef: !!rootRef.value,
    rootElement: rootRef.value,
    rootDataKey: rootRef.value?.getAttribute('data-key'),
    inDialog: !!document.querySelector('.b3-dialog__container'),
    dialogElements: document.querySelectorAll('.b3-dialog__container').length,
    ourDialog: document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]'),
  });
});

const providerAdapter = props.reviewUI?.adapter;
const providerAny = props.provider as any;
const providerQueue = props.provider && providerAdapter
  ? new ProviderBackedQueueStrategy(props.provider, {
      providerOptions: props.reviewUI?.context?.queue || {},
      uiConfig: props.reviewUI?.context?.uiConfig || { statsType: 'queue-size', showRatingButtons: true, allowSkip: true },
      statsLabel: String(props.provider?.displayName || props.provider?.id || ''),
      skipBehavior: providerAny?.skipBehavior === 'rotate' || String(props.provider?.id || '') === 'final-drill' ? 'rotate' : 'drop',
      getProgress: typeof providerAny?.getProgress === 'function' ? () => providerAny.getProgress() : undefined,
      getResumePrompt: typeof providerAny?.getResumePrompt === 'function' ? () => providerAny.getResumePrompt() : undefined,
    })
  : null;

const bridgedAdapter = props.provider && providerAdapter
  ? {
      toUIState: (queue: any, item: any, context: any) => providerAdapter.toUIState(props.provider, item, context),
      fetchAuxiliaryData: providerAdapter.fetchAuxiliaryData
        ? (item: any) => providerAdapter.fetchAuxiliaryData(item)
        : undefined,
    }
  : null;

const hook = useReviewSession(providerQueue || props.queue, bridgedAdapter || props.adapter);
const state = hook.state;
const app = props.app;
const i18n = props.i18n;

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

// 处理来自思源热键系统的 CustomEvent
function handleRootClick(e: MouseEvent) {
  console.log('[FSRS ReviewView] handleRootClick triggered:', {
    detail: e.detail,
    detailType: typeof e.detail,
    target: e.target,
    currentTarget: e.currentTarget,
  });

  // 只处理来自思源热键系统的 CustomEvent（event.detail 为字符串）
  if (typeof e.detail !== 'string') return;

  const key = e.detail.toLowerCase();
  console.log('[FSRS ReviewView] Hotkey detected:', key, 'showAnswer:', state.value.actions.showAnswer);

  // 显示答案（空格/回车） - 只在答案未显示时工作
  if ((key === ' ' || key === 'enter') && !state.value.actions.showAnswer) {
    e.preventDefault();
    e.stopPropagation();
    console.log('[FSRS ReviewView] Revealing answer...');
    hook.reveal();
    return;
  }

  // 评分（1/2/3/4） - 只在答案已显示后才能评分
  if (['1', '2', '3', '4'].includes(key)) {
    if (state.value.actions.showAnswer) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[FSRS ReviewView] Grading with rating:', key);
      void hook.grade(Number(key));
    } else {
      console.log('[FSRS ReviewView] Rating key pressed but answer not shown, ignoring');
    }
    return;
  }

  // 跳过（S键） - 任何时候都能工作
  if (key === 's') {
    e.preventDefault();
    e.stopPropagation();
    console.log('[FSRS ReviewView] Skipping card...');
    void hook.skip();
  }
}

function handleOpenMenu(menuCommands: IQueueCommand<unknown>[], ev: MouseEvent) {
  console.log('[FSRS ReviewView] handleOpenMenu called:', {
    currentTarget: ev.currentTarget,
    clientX: ev.clientX,
    clientY: ev.clientY,
    target: ev.target,
  });

  const cmds = Array.isArray(menuCommands) ? menuCommands : [];
  const cardMeta = state.value.actions.cardMeta;
  const currentCard = state.value.content.card;

  const menu = new Menu();

  // 添加卡片统计(只读项)
  if (cardMeta) {
    menu.addItem({
      id: 'card-stats',
      type: 'readonly',
      labelHTML: buildCardStatsHTML(cardMeta),
    });
    menu.addSeparator();
  }

  // Part 5: 添加"打开"子菜单
  if (currentCard?.blockId) {
    menu.addItem({
      icon: 'iconOpen',
      label: t('openCard', '打开'),
      submenu: [
        {
          icon: 'iconTab',
          label: t('openInNewTab', '新标签页'),
          click: () => openCardInTab(currentCard.blockId, false),
        },
        {
          icon: 'iconLayoutRight',
          label: t('openInRight', '右侧'),
          click: () => openCardInTab(currentCard.blockId, true),
        },
        {
          icon: 'iconExport',
          label: t('openInNewWindow', '新窗口'),
          click: () => openCardInNewWindow(currentCard.blockId),
        },
      ],
    });
    menu.addSeparator();
  }

  // Part 4: 添加"编辑 SRS 数据"菜单项
  if (currentCard?.blockId) {
    menu.addItem({
      icon: 'iconEdit',
      label: t('editSrsData', '编辑 SRS 数据'),
      click: () => {
        void openSrsEditorDialog(currentCard.blockId);
      },
    });
    menu.addSeparator();
  }

  // 标准菜单项
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

  // 使用按钮位置定位菜单（与思源原生闪卡一致）
  const target = ev.currentTarget as HTMLElement;
  if (target) {
    const rect = target.getBoundingClientRect();
    console.log('[FSRS ReviewView] Opening menu at button position:', {
      rectLeft: rect.left,
      rectBottom: rect.bottom,
      rectTop: rect.top,
      rectRight: rect.right,
    });
    menu.open({ x: rect.left, y: rect.bottom });
  } else {
    // 降级：使用鼠标位置
    console.log('[FSRS ReviewView] currentTarget is null, using mouse position');
    menu.open({ x: ev.clientX, y: ev.clientY });
  }
}

function buildCardStatsHTML(meta: NonNullable<ReviewUIState['actions']['cardMeta']>): string {
  const stateText = meta.isReviewCard
    ? t('reviewCard', '复习卡')
    : t('newCard', '新卡');

  const lastReview = meta.lastReview && meta.lastReview > 0
    ? new Date(meta.lastReview).toISOString().split('T')[0]
    : '';

  return `
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('lapses', '遗忘次数')}</div>
      <div class="fn__space"></div>
      <div>${meta.lapses ?? 0}</div>
    </div>
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('reps', '复习次数')}</div>
      <div class="fn__space"></div>
      <div>${meta.reps ?? 0}</div>
    </div>
    <div class="fn__flex">
      <div class="fn__flex-1 ft__breakword">${t('cardState', '卡片状态')}</div>
      <div class="fn__space"></div>
      <div class="${meta.isReviewCard ? 'ft__success' : 'ft__primary'}">
        ${stateText}
      </div>
    </div>
    <div class="fn__flex ${!lastReview ? 'fn__none' : ''}">
      <div class="fn__flex-1 ft__breakword" style="width: 170px;">
        ${t('lastReview', '上次复习')}
      </div>
      <div class="fn__space"></div>
      <div>${lastReview}</div>
    </div>
  `;
}

function handleContext(payload: { id: string; openNewTab: boolean }) {
  const id = String(payload?.id || '');
  if (!id || !props.app) return;
  void openTab({
    app: props.app,
    doc: { id },
    openNewTab: Boolean(payload?.openNewTab),
  });
}

function handleToolbarAction(actionType: string, ev: MouseEvent) {
  if (actionType === 'fullscreen') {
    const container = document.querySelector('.b3-dialog__container');
    if (container) {
      container.classList.toggle('b3-dialog--fullscreen');
    }
  } else if (actionType === 'more') {
    handleOpenMenu(state.value.actions.menu, ev);
  }
}

// Part 4: 打开 SRS 编辑器对话框
function openSrsEditorDialog(blockId: string) {
  if (!props.app) return;

  createVueDialog({
    title: t('editSrsData', '编辑 SRS 数据'),
    component: SrsEditorDialog,
    props: {
      app: props.app,
      blockId,
      i18n: props.i18n || {},
    },
    width: 'min(700px, 90vw)',
    height: 'min(600px, 80vh)',
  });
}

// Part 5: 在标签页中打开卡片
function openCardInTab(blockId: string, openInRight: boolean) {
  if (!props.app) return;

  openTab({
    app: props.app,
    doc: { id: blockId },
    position: openInRight ? 'right' : undefined,
  });
}

// Part 5: 在新窗口中打开卡片
function openCardInNewWindow(blockId: string) {
  if (!props.app) return;

  openTab({
    app: props.app,
    doc: { id: blockId },
    openInNewWindow: true,
  });
}

// Part 6: 处理面包屑点击
function handleBreadcrumbClick(crumb: { icon?: string; text: string; id?: string; action?: string }, index: number) {
  const action = crumb.action || crumb.id;
  if (action) {
    void hook.executeCommand(action);
  }
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
