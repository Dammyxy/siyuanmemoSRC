<template>
  <div
    ref="rootRef"
    class="fsrs-review-v2"
    data-key="dialog-opencard"
    @click="handleRootClick"
  >
    <!-- 📝 复习内容区 -->
    <div class="fsrs-review-v2__content-wrapper">
      <ReviewHeader
        :header="state.header"
        :is-tab-mode="!!props.reviewUI"
        :title="props.title"
        :mode="props.mode"
        :navigation-state="state.header.navigationState"
        @toolbar-action="handleToolbarAction"
        @action="hook.executeCommand"
        @context="handleContext"
        @breadcrumb-click="handleBreadcrumbClick"
      />

      <ReviewContent :app="app" :plugin="props.plugin" :content="state.content" :overlay="state.overlay" :has-hidden-content="state.meta.hasHiddenContent" :show-answer="state.actions.showAnswer" :meta="state.meta" :i18n="i18n" />

      <ReviewActions
        :actions="state.actions"
        :meta="state.meta"
        :i18n="i18n"
        :queue="providerQueue || props.queue"
        :plugin="props.plugin"
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
  </div>
</template>

<script setup lang="ts">
import { Menu, openTab, openWindow, showMessage } from 'siyuan';
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import ReviewActions from './ReviewActions.vue';
import ReviewContent from './ReviewContent.vue';
import ReviewHeader from './ReviewHeader.vue';
import { useReviewSession } from './useReviewSession';
import type { IQueueCommand } from '@/core/queue/abstraction/Command';
import { ProviderBackedQueueStrategy } from '@/core/extensions';
import { createVueDialog } from '@/utils/dialog';
import { createLogger } from '@/utils/logger';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { riff } from '@/core/siyuan';
import type { NeuralRoamQueue } from '@/queues/NeuralRoamQueue';

const logger = createLogger('ReviewView');

const props = defineProps<{
  app: any;
  i18n?: Record<string, string>;
  queue?: any;
  adapter?: any;
  provider?: any;
  reviewUI?: any;
  title?: string; // 队列标题（如"提取练习"）
  mode?: 'dialog' | 'tab'; // 🆕 打开模式（对话框/Tab）
  plugin?: any; // 🆕 插件实例，用于访问 hybridSyncService
  onReview?: (cardId: string, rating: number) => void; // 🆕 复习回调（用于刻意练习黑名单）
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
  (e: 'close'): void; // 添加关闭事件
  (e: 'convert-to-tab'): void; // 🆕 转换为 Tab 模式（kebab-case）
}>();

const rootRef = ref<HTMLDivElement | null>(null);

// 🆕 防重复触发机制 - 使用更智能的策略
let lastKeyPressTime = 0;
let lastKeyPressed = '';
let isProcessingKey = false; // 标记是否正在处理按键
const KEY_PRESS_DEBOUNCE = 30; // 30ms 内的重复按键视为同一次（进一步降低延迟）

function shouldIgnoreDuplicateKey(key: string): boolean {
  const now = Date.now();
  const timeSinceLastPress = now - lastKeyPressTime;
  
  // 如果正在处理同一个按键，直接忽略
  if (isProcessingKey && key === lastKeyPressed) {
    logger.debug('[SiYuanMemo][ReviewView] Key is being processed, ignoring:', key);
    return true;
  }
  
  // 如果是相同按键且在防抖时间内，忽略
  if (key === lastKeyPressed && timeSinceLastPress < KEY_PRESS_DEBOUNCE) {
    logger.debug('[SiYuanMemo][ReviewView] Ignoring duplicate key press:', key, 'timeSince:', timeSinceLastPress);
    return true;
  }
  
  lastKeyPressTime = now;
  lastKeyPressed = key;
  isProcessingKey = true;
  
  // 30ms 后重置处理标记
  setTimeout(() => {
    isProcessingKey = false;
  }, KEY_PRESS_DEBOUNCE);
  
  return false;
}

// 判断是否为神经漫游模式
const isNeuralRoamMode = computed(() => {
  // 检查底层队列是否为神经漫游
  const queueStrategy = hook.getQueueStrategy();
  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();
  return underlyingQueue?.name === 'NeuralRoamQueue';
});

// 获取神经漫游队列实例
const neuralQueueInstance = computed<NeuralRoamQueue | null>(() => {
  if (!isNeuralRoamMode.value) return null;
  const queueStrategy = hook.getQueueStrategy();
  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();
  return underlyingQueue as NeuralRoamQueue;
});

// 组件挂载
onMounted(() => {
  logger.debug('[SiYuanMemo][ReviewView] Component mounted');
  logger.debug('[SiYuanMemo][ReviewView] Checking environment:', {
    hasRootRef: !!rootRef.value,
    rootElement: rootRef.value,
    rootDataKey: rootRef.value?.getAttribute('data-key'),
    inDialog: !!document.querySelector('.b3-dialog__container'),
    dialogElements: document.querySelectorAll('.b3-dialog__container').length,
    ourDialog: document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]'),
  });

  // 🆕 添加键盘事件监听器
  document.addEventListener('keydown', handleKeyDown);
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener added');

  // 🌌 恢复侧边栏状态（已删除）

  // 🆕 触发增量同步（如果启用）
  const plugin = props.plugin as any;
  const context = plugin?.getContext?.();
  const hybridSyncService = context?.getHybridSyncService?.();
  if (hybridSyncService) {
    const storage = context?.getStorage?.();
    const riffConfig = storage?.getSettings?.()?.riffIntegration;
    if (riffConfig?.mode === 'advanced' &&
        riffConfig?.incrementalSync?.enabled &&
        riffConfig?.incrementalSync?.triggers?.includes('review-open')) {
      // 后台执行增量同步，不阻塞 UI
      void hybridSyncService.incrementalSync().catch((err: Error) => {
        logger.error('[ReviewView] Incremental sync failed:', err);
      });
    }
  }

  // 🆕 初始化导航状态（Phase 3: UI 控件）
  refreshNavigationState();
});

// 🆕 组件卸载时移除键盘事件监听器
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
  logger.debug('[SiYuanMemo][ReviewView] Keyboard event listener removed');
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

const hook = useReviewSession(
  providerQueue || props.queue, 
  bridgedAdapter || props.adapter,
  {
    onReview: props.onReview, // 🆕 传递 onReview 回调
  }
);
const state = hook.state;
const app = props.app;
const i18n = props.i18n;

function t(key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

// 处理来自思源热键系统的 CustomEvent
function handleRootClick(e: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleRootClick triggered:', {
    detail: e.detail,
    detailType: typeof e.detail,
    target: e.target,
    currentTarget: e.currentTarget,
  });

  // 只处理来自思源热键系统的 CustomEvent（event.detail 为字符串）
  if (typeof e.detail !== 'string') return;

  const key = e.detail.toLowerCase();
  
  // 🆕 防重复触发检查
  if (shouldIgnoreDuplicateKey(key)) {
    return;
  }
  
  logger.debug('[SiYuanMemo][ReviewView] Hotkey detected:', key, 'answerShown:', hook.context.value.showAnswer);

  // 检查是否为 Topic 卡片
  const cardMeta = state.value.actions.cardMeta;
  const isTopicCard = cardMeta?.type === 'topic' || cardMeta?.cardType === 'topic';

  // 显示答案或评分（空格/回车）
  if (key === ' ' || key === 'enter') {
    e.preventDefault();
    e.stopPropagation();
    
    if (!hook.context.value.showAnswer) {
      // 答案未显示：显示答案或直接评分（Topic卡片）
      if (isTopicCard) {
        logger.debug('[SiYuanMemo][ReviewView] Topic card - grading with 3 (Good)');
        void hook.grade(3);
      } else {
        logger.debug('[SiYuanMemo][ReviewView] Revealing answer...');
        hook.reveal();
      }
    } else {
      // 答案已显示：评分为 Good (3)
      logger.debug('[SiYuanMemo][ReviewView] Answer shown - grading with 3 (Good)');
      void hook.grade(3);
    }
    return;
  }

  // 评分（1/2/3/4） - 只在答案已显示后才能评分
  if (['1', '2', '3', '4'].includes(key)) {
    if (hook.context.value.showAnswer) {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('[SiYuanMemo][ReviewView] Grading with rating:', key);
      void hook.grade(Number(key));
    } else {
      logger.debug('[SiYuanMemo][ReviewView] Rating key pressed but answer not shown, ignoring');
    }
    return;
  }

  // 跳过（0/x/s键） - 任何时候都能工作（与思源保持一致）
  if (key === '0' || key === 'x' || key === 's') {
    e.preventDefault();
    e.stopPropagation();
    logger.debug('[SiYuanMemo][ReviewView] Skipping card...');
    void hook.skip();
  }
}

// 🆕 处理标准键盘事件
function handleKeyDown(e: KeyboardEvent) {
  // 忽略在输入框中的按键
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  const key = e.key.toLowerCase();
  
  // 🆕 防重复触发检查
  if (shouldIgnoreDuplicateKey(key)) {
    return;
  }
  
  logger.debug('[SiYuanMemo][ReviewView] KeyDown:', key, 'answerShown:', hook.context.value.showAnswer);

  // 检查是否为 Topic 卡片
  const cardMeta = state.value.actions.cardMeta;
  const isTopicCard = cardMeta?.type === 'topic' || cardMeta?.cardType === 'topic';

  // 显示答案或评分（空格/回车）
  if (key === ' ' || key === 'enter') {
    e.preventDefault();
    e.stopPropagation();
    
    if (!hook.context.value.showAnswer) {
      // 答案未显示：显示答案或直接评分（Topic卡片）
      if (isTopicCard) {
        logger.debug('[SiYuanMemo][ReviewView] Topic card - grading with 3 (Good)');
        void hook.grade(3);
      } else {
        logger.debug('[SiYuanMemo][ReviewView] Revealing answer...');
        hook.reveal();
      }
    } else {
      // 答案已显示：评分为 Good (3)
      logger.debug('[SiYuanMemo][ReviewView] Answer shown - grading with 3 (Good)');
      void hook.grade(3);
    }
    return;
  }

  // 评分（1/2/3/4） - 只在答案已显示后才能评分
  if (['1', '2', '3', '4'].includes(key)) {
    if (hook.context.value.showAnswer) {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('[SiYuanMemo][ReviewView] Grading with rating:', key);
      void hook.grade(Number(key));
    } else {
      logger.debug('[SiYuanMemo][ReviewView] Rating key pressed but answer not shown, ignoring');
    }
    return;
  }

  // 跳过（0/x/s键） - 任何时候都能工作（与思源保持一致）
  if (key === '0' || key === 'x' || key === 's') {
    e.preventDefault();
    e.stopPropagation();
    logger.debug('[SiYuanMemo][ReviewView] Skipping card...');
    void hook.skip();
  }
}

function handleOpenMenu(menuCommands: IQueueCommand<unknown>[], ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenMenu called:', {
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
      label: t('openCard', 'Open'),
      submenu: [
        {
          icon: 'iconTab',
          label: t('openInNewTab', 'New Tab'),
          click: () => openCardInTab(currentCard.blockId, false),
        },
        {
          icon: 'iconLayoutRight',
          label: t('openInRight', 'Right Side'),
          click: () => openCardInTab(currentCard.blockId, true),
        },
        // 注释掉"使用新窗口打开"选项
        // {
        //   icon: 'iconExport',
        //   label: t('openInNewWindow', 'New Window'),
        //   click: () => openCardInNewWindow(currentCard.blockId),
        // },
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
    logger.debug('[SiYuanMemo][ReviewView] Opening menu at button position:', {
      rectLeft: rect.left,
      rectBottom: rect.bottom,
      rectTop: rect.top,
      rectRight: rect.right,
    });
    menu.open({ x: rect.left, y: rect.bottom });
  } else {
    // 降级：使用鼠标位置
    logger.debug('[SiYuanMemo][ReviewView] currentTarget is null, using mouse position');
    menu.open({ x: ev.clientX, y: ev.clientY });
  }
}

function buildCardStatsHTML(meta: NonNullable<ReviewUIState['actions']['cardMeta']>): string {
  const stateText = meta.isReviewCard
    ? t('reviewCard', 'Review Card')
    : t('newCard', 'New Card');

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
  logger.debug('[SiYuanMemo][ReviewView] handleToolbarAction called:', actionType);

  if (actionType === 'fullscreen') {
    // 实现全屏功能（参考思源原生实现）
    logger.debug('[SiYuanMemo][ReviewView] Fullscreen button clicked');

    // 查找对话框容器
    const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]');
    // 使用自定义类名查找内容区域
    const contentMain = rootRef.value?.querySelector('.fsrs-review-v2-content') || document.querySelector('.fsrs-review-v2-content');
    logger.debug('[SiYuanMemo][ReviewView] dialogContainer found:', !!dialogContainer);
    logger.debug('[SiYuanMemo][ReviewView] contentMain found:', !!contentMain);

    if (contentMain && dialogContainer) {
      const isFullscreen = contentMain.classList.contains('fullscreen');
      logger.debug('[SiYuanMemo][ReviewView] Current fullscreen state:', isFullscreen);

      if (isFullscreen) {
        // 退出全屏
        contentMain.classList.remove('fullscreen');
        dialogContainer.classList.remove('fullscreen');
        // 恢复 maxWidth
        (dialogContainer as HTMLElement).style.maxWidth = '1024px';
        document.getElementById('drag')?.classList.remove('fn__hidden');
        logger.debug('[SiYuanMemo][ReviewView] Exited fullscreen');
      } else {
        // 进入全屏
        contentMain.classList.add('fullscreen');
        dialogContainer.classList.add('fullscreen');
        // 设置为 100vw 以确保全屏效果(覆盖内联样式)
        (dialogContainer as HTMLElement).style.maxWidth = '100vw';
        document.getElementById('drag')?.classList.add('fn__hidden');
        logger.debug('[SiYuanMemo][ReviewView] Entered fullscreen');
      }

      // 调整 protyle 尺寸
      setTimeout(() => {
        const protyleHost = contentMain.querySelector('.fsrs-review-v2-content__protyle-host');
        logger.debug('[SiYuanMemo][ReviewView] protyleHost:', protyleHost);

        if (protyleHost) {
          // 查找 protyle 实例
          const protyle = (protyleHost as any)?.['__vnode__']?.['ctx']?.['protyle']
                         || (protyleHost as any)?.['__vueParentComponent']?.['protyle'];
          logger.debug('[SiYuanMemo][ReviewView] protyle instance:', protyle);

          if (protyle && typeof protyle.resize === 'function') {
            protyle.resize();
            logger.debug('[SiYuanMemo][ReviewView] Protyle resized');
          }
        }
      }, 0);
    } else {
      logger.debug('[SiYuanMemo][ReviewView] ERROR: contentMain or dialogContainer not found!');
    }
  } else if (actionType === 'edit-srs') {
    // 打开SRS编辑器
    logger.debug('[SiYuanMemo][ReviewView] Edit SRS button clicked');
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;
    logger.debug('[SiYuanMemo][ReviewView] cardMeta:', cardMeta);
    logger.debug('[SiYuanMemo][ReviewView] blockId:', blockId);
    if (blockId) {
      openSrsEditorDialog(blockId);
    } else {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'sticktab') {
    // 打开为菜单
    handleOpenAsMenu(ev);
  } else if (actionType === 'lock-seed') {
    // Lock current block as seed (Neural Roam) - uses SeedService
    logger.debug('[SiYuanMemo][ReviewView] Lock seed button clicked');
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;

    if (blockId) {
      const queueStrategy = hook.getQueueStrategy();
      const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

      if (underlyingQueue) {
        import('@/core/neural/SeedService').then(({ SeedService }) => {
          const seedService = new SeedService(underlyingQueue);
          const currentCandidates = underlyingQueue.getCurrentCandidatesForSeed?.() || [];

          seedService.lockAsSeed(blockId, currentCandidates)
            .then(() => {
              logger.debug('[SiYuanMemo][ReviewView] Block locked as seed:', blockId);
              showMessage(t('lockedAsSeed', 'Locked as seed'), 3000, 'info');
            })
            .catch((error: Error) => {
              logger.error('[SiYuanMemo][ReviewView] Failed to lock seed:', error);
              showMessage(t('lockSeedFailed', 'Failed to lock seed'), 3000, 'error');
            });
        });
      } else {
        logger.error('[SiYuanMemo][ReviewView] Queue does not support seed locking');
        showMessage(t('queueNoSeedSupport', 'Queue does not support seed locking'), 3000, 'error');
      }
    } else {
      logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'neural-menu') {
    // 🧠 神经漫游菜单
    logger.debug('[SiYuanMemo][ReviewView] Neural menu button clicked');
    // 阻止事件冒泡，防止菜单打开后又立即关闭菜单
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralMenu(ev);
  } else if (actionType === 'nav-toggle-mode') {
    // 🆕 导航模式切换（Phase 3: UI 控件）
    logger.debug('[SiYuanMemo][ReviewView] Navigation mode toggle button clicked');
    const queueStrategy = hook.getQueueStrategy();
    const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

    if (underlyingQueue?.name === 'NeuralRoamQueue') {
      const neuralQueue = underlyingQueue.neuralQueue;
      // 添加空值检查
      if (neuralQueue && typeof neuralQueue.getNavigationState === 'function') {
        const currentMode = neuralQueue.getNavigationState().navigationMode;

        // 切换模式：follow <-> explore
        const newMode = currentMode === 'follow' ? 'explore' : 'follow';
        neuralQueue.setNavigationMode(newMode);

        // 刷新 UI
        refreshNavigationState();

        // 显示提示
        const modeText = newMode === 'follow' ? t('navModeFollow', '🛤️ 沿路径前进') : t('navModeExplore', '🧭 探索新分支');
        showMessage(t('navModeSwitched', '已切换为: {mode}').replace('{mode}', modeText), 2000, 'info');
      }
    }
  } else if (actionType === 'nav-return-bookmark') {
    // 🆕 返回书签（Phase 3: UI 控件）
    logger.debug('[SiYuanMemo][ReviewView] Return to bookmark button clicked');
    const queueStrategy = hook.getQueueStrategy();
    const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

    if (underlyingQueue?.name === 'NeuralRoamQueue') {
      const neuralQueue = underlyingQueue.neuralQueue;
      // 添加空值检查
      if (neuralQueue && typeof neuralQueue.getNavigationState === 'function') {
        const success = neuralQueue.returnToBookmark();

        if (success) {
          const navState = neuralQueue.getNavigationState();
          const targetBlockId = neuralQueue.displayPath[navState.currentPathIndex];

          // 加载书签位置的卡片
          void hook.loadCardByBlockId(targetBlockId);

          // 刷新导航状态
          refreshNavigationState();

          showMessage(t('navReturnedToBookmark', '已返回最新位置'), 2000, 'info');
        }
      }
    }
  }
}

function handleOpenAsMenu(ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleOpenAsMenu called', ev);

  const menu = new Menu();

  // 获取插件实例
  const fsrsPlugin = (window as any).siyuanMemoPlugin;

  if (!fsrsPlugin) {
    logger.error('[SiYuanMemo][ReviewView] FSRS plugin instance not found');
    // 降级方案：打开文档
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;

    if (blockId) {
      menu.addItem({
        id: 'openByNewWindow',
        icon: 'iconOpenWindow',
        label: t('openInNewWindow', 'Open in New Window'),
        click() {
          if (props.app) {
            openWindow({
              doc: { id: blockId },
            });
          }
        },
      });
    }

    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.open({
      x: rect.left,
      y: rect.bottom,
    });
    return;
  }

  // 🆕 在 Tab 中打开
  menu.addItem({
    id: 'openByTab',
    icon: 'iconLayoutRight',
    label: t('openInTab', 'Open in Tab'),
    click() {
      logger.debug('[SiYuanMemo][ReviewView] Opening in tab and closing dialog');

      // 获取插件实例
      const fsrsPlugin = (window as any).siyuanMemoPlugin;
      if (!fsrsPlugin) {
        logger.error('[SiYuanMemo][ReviewView] Plugin instance not found');
        return;
      }

      // 打开 Tab
      fsrsPlugin.openReviewTab({
        provider: props.provider,
        queue: props.queue,
        adapter: props.adapter,
        title: props.title || t('reviewTitle', 'Review'),
      });

      // 关闭当前对话框
      emit('close');
    },
  });

  // 注释掉"使用新窗口打开"选项
  // /// #if !BROWSER
  // menu.addItem({
  //   id: 'openByNewWindow',
  //   icon: 'iconOpenWindow',
  //   label: t('openInNewWindow', 'Open in New Window'),
  //   click() {
  //     logger.debug('[SiYuanMemo][ReviewView] Opening review in new window');
  //     try {
  //       // 获取插件实例
  //       const fsrsPlugin = (window as any).siyuanMemoPlugin;
  //       if (!fsrsPlugin) {
  //         logger.error('[SiYuanMemo][ReviewView] Plugin instance not found');
  //         return;
  //       }
  //
  //       // 调用优雅的新窗口打开方法
  //       fsrsPlugin.openReviewInNewWindow({
  //         provider: props.provider,
  //         queue: props.queue,
  //         adapter: props.adapter,
  //         title: props.title || t('reviewTitle', 'Review'),
  //       });
  //
  //       // 关闭当前对话框
  //       emit('close');
  //     } catch (err) {
  //       logger.error('[SiYuanMemo][ReviewView] Error opening review in new window:', err);
  //     }
  //   },
  // });
  // /// #endif

  // 打开菜单
  const target = ev.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  menu.open({
    x: rect.left,
    y: rect.bottom,
  });
}

// Part 4: 打开 SRS 编辑器对话框
function openSrsEditorDialog(blockId: string) {
  logger.debug('[SiYuanMemo][ReviewView] openSrsEditorDialog called with blockId:', blockId);

  if (!props.app) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: props.app is undefined!');
    return;
  }

  if (!blockId) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: blockId is required but got undefined!');
    return;
  }

  const context = (props.plugin as any)?.getContext?.();
  const card = context?.getStorage?.()?.getCardByBlockId(blockId);
  if (!card) {
    logger.error('[SiYuanMemo][ReviewView] ERROR: Card not found for blockId:', blockId);
    return;
  }

  createVueDialog({
    title: t('editSrsData', '编辑 SRS 数据'),
    component: SrsEditorDialog,
    props: {
      card: {
        id: card.id,
        blockId: blockId,
        deckId: riff.BUILTIN_DECK_ID,
      },
      deckId: riff.BUILTIN_DECK_ID,
      i18n: props.i18n || {},
      plugin: props.plugin,
      reviewService: context?.getReviewService?.(),
    },
    width: '860px',
    height: '80vh',
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

// Part 5: 神经漫游菜单
function handleNeuralMenu(ev: MouseEvent) {
  logger.debug('[SiYuanMemo][ReviewView] handleNeuralMenu - start', { ev, target: ev.target });

  const queueStrategy = hook.getQueueStrategy();
  logger.debug('[SiYuanMemo][ReviewView] queueStrategy:', queueStrategy);

  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();
  logger.debug('[SiYuanMemo][ReviewView] underlyingQueue:', underlyingQueue);

  if (!underlyingQueue) {
    logger.error('[SiYuanMemo][ReviewView] Underlying queue not found');
    return;
  }

  logger.debug('[SiYuanMemo][ReviewView] Creating menu...');
  const menu = new Menu('neural-roam-menu');
  logger.debug('[SiYuanMemo][ReviewView] Menu created:', menu);

  // 1. 查看种子块列表
  logger.debug('[SiYuanMemo][ReviewView] Adding menu item 1: 查看种子块列表');
  const viewSeedsItem = menu.addItem({
    icon: 'iconList',
    label: t('viewSeedList', '查看种子块列表'),
    click: () => {
      logger.debug('[SiYuanMemo][ReviewView] 查看种子块列表 clicked');
      try {
        const seeds = underlyingQueue.getSeedBlocks?.();
        logger.debug('[SiYuanMemo][ReviewView] Got seeds:', seeds);
        if (seeds && seeds.length > 0) {
          const seedList = seeds.map((id: string, index: number) => `${index + 1}. ${id}`).join('\n');
          logger.debug('[SiYuanMemo][ReviewView] Showing message with seed list');
          showMessage(t('seedListTitle', '种子块列表 ({n}个)').replace('{n}', String(seeds.length)) + ':\n' + seedList, 5000, 'info');
        } else {
          logger.debug('[SiYuanMemo][ReviewView] No seeds, showing empty message');
          showMessage(t('noSeeds', '暂无种子块'), 3000, 'info');
        }
      } catch (error) {
        logger.error('[SiYuanMemo][ReviewView] Failed to get seed blocks:', error);
      }
    }
  });
  logger.debug('[SiYuanMemo][ReviewView] Menu item 1 added:', viewSeedsItem);

  // 2. 从种子块开始漫游（子菜单）
  logger.debug('[SiYuanMemo][ReviewView] Getting seeds for submenu...');
  const seeds = underlyingQueue.getSeedBlocks?.() || [];
  logger.debug('[SiYuanMemo][ReviewView] Seeds:', seeds);

  if (seeds.length > 0) {
    const seedSubmenuItems = seeds.map((seedId: string) => ({
      label: seedId.substring(0, 20) + '...',
      click: async () => {
        try {
          await underlyingQueue.startRoamingFromSeed?.(seedId);
          showMessage(t('roamStartedFromSeed', '已从种子 {id} 开始漫游').replace('{id}', seedId), 3000, 'info');
          // 刷新当前卡片
          await hook.executeCommand('next');
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to start roaming from seed:', error);
          showMessage(t('roamStartFailed', '开始漫游失败'), 3000, 'error');
        }
      }
    }));

    logger.debug('[SiYuanMemo][ReviewView] Adding menu item 2: 从种子块开始漫游 (with submenu)');
    menu.addItem({
      icon: 'iconPlay',
      label: t('roamFromSeed', '从种子块开始漫游'),
      submenu: seedSubmenuItems
    });
  } else {
    logger.debug('[SiYuanMemo][ReviewView] Adding menu item 2: 从种子块开始漫游 (disabled)');
    menu.addItem({
      icon: 'iconPlay',
      label: t('roamFromSeed', '从种子块开始漫游'),
      disabled: true
    });
  }

  menu.addSeparator();

  // 3. 移除种子块（子菜单）
  if (seeds.length > 0) {
    const removeSubmenuItems = seeds.map((seedId: string) => ({
      label: seedId.substring(0, 20) + '...',
      click: async () => {
        try {
          await underlyingQueue.removeCard?.(seedId);
          showMessage(t('seedRemoved', '已移除种子块 {id}').replace('{id}', seedId), 3000, 'info');
        } catch (error) {
          logger.error('[SiYuanMemo][ReviewView] Failed to remove seed:', error);
          showMessage(t('removeSeedFailed', '移除种子块失败'), 3000, 'error');
        }
      }
    }));

    logger.debug('[SiYuanMemo][ReviewView] Adding menu item 3: 移除种子块 (with submenu)');
    menu.addItem({
      icon: 'iconTrashcan',
      label: t('removeSeed', '移除种子块'),
      submenu: removeSubmenuItems
    });
  } else {
    logger.debug('[SiYuanMemo][ReviewView] Adding menu item 3: 移除种子块 (disabled)');
    menu.addItem({
      icon: 'iconTrashcan',
      label: t('removeSeed', '移除种子块'),
      disabled: true
    });
  }

  menu.addSeparator();

  // 4. 查看历史记录
  logger.debug('[SiYuanMemo][ReviewView] Adding menu item 4: 查看历史记录');
  menu.addItem({
    icon: 'iconHistory',
    label: t('viewHistory', '查看历史记录'),
    click: () => {
      logger.debug('[SiYuanMemo][ReviewView] 查看历史记录 clicked');
      try {
        const history = underlyingQueue.getHistorySnapshot?.();
        if (history && history.length > 0) {
          const historyList = history.slice(-10).map((id: string, index: number) =>
            `${history.length - 10 + index + 1}. ${id}`
          ).join('\n');
          showMessage(t('historyListTitle', '历史记录 (最近10条，共{n}条)').replace('{n}', String(history.length)) + ':\n' + historyList, 5000, 'info');
        } else {
          showMessage(t('noHistory', '暂无历史记录'), 3000, 'info');
        }
      } catch (error) {
        logger.error('[SiYuanMemo][ReviewView] Failed to get history:', error);
      }
    }
  });

  // 5. 清空历史记录
  logger.debug('[SiYuanMemo][ReviewView] Adding menu item 5: 清空历史记录');
  menu.addItem({
    icon: 'iconClear',
    label: t('clearHistory', '清空历史记录'),
    click: () => {
      logger.debug('[SiYuanMemo][ReviewView] 清空历史记录 clicked');
      try {
        underlyingQueue.clearHistory?.();
        showMessage(t('historyClearedSuccess', '历史记录已清空'), 3000, 'info');
      } catch (error) {
        logger.error('[SiYuanMemo][ReviewView] Failed to clear history:', error);
        showMessage(t('clearHistoryFailed', '清空历史记录失败'), 3000, 'error');
      }
    }
  });

  // 显示菜单
  logger.debug('[SiYuanMemo][ReviewView] Opening menu...');
  const target = ev.currentTarget as HTMLElement;
  logger.debug('[SiYuanMemo][ReviewView] Target element:', target);

  if (target) {
    const rect = target.getBoundingClientRect();
    logger.debug('[SiYuanMemo][ReviewView] Target rect:', rect);
    logger.debug('[SiYuanMemo][ReviewView] Menu open position:', {
      x: rect.left,
      y: rect.bottom
    });

    menu.open({
      x: rect.left,
      y: rect.bottom
    });
    logger.debug('[SiYuanMemo][ReviewView] Menu.open() called');
  } else {
    logger.error('[SiYuanMemo][ReviewView] Target element is null!');
  }
}

// Part 6: 处理面包屑点击
function handleBreadcrumbClick(crumb: { icon?: string; text: string; id?: string; action?: string }, index: number) {
  const action = crumb.action || crumb.id;
  if (action) {
    void hook.executeCommand(action);
  }
}

// 🌐 Part 7: 侧边栏处理函数（已删除）

/**
 * 🆕 获取当前队列的导航状态（仅神经漫游队列）
 * Phase 3: UI 控件
 */
function getNavigationState() {
  const queueStrategy = hook.getQueueStrategy();
  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

  if (underlyingQueue?.name === 'NeuralRoamQueue') {
    const neuralQueue = underlyingQueue.neuralQueue;
    // 添加空值检查
    if (neuralQueue && typeof neuralQueue.getNavigationState === 'function') {
      return neuralQueue.getNavigationState();
    }
  }
  return null;
}

/**
 * 🆕 检查当前是否是神经漫游队列
 * Phase 3: UI 控件
 */
function isNeuralRoamQueue(): boolean {
  const queueStrategy = hook.getQueueStrategy();
  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();
  return underlyingQueue?.name === 'NeuralRoamQueue';
}

/**
 * 🆕 刷新导航状态到 UI
 * Phase 3: UI 控件
 */
function refreshNavigationState() {
  if (!isNeuralRoamQueue()) return;

  const navState = getNavigationState();
  if (navState) {
    // 更新 state.header.navigationState
    state.value = {
      ...state.value,
      header: {
        ...state.value.header,
        navigationState: navState,
      },
    };
  }
}

// 🌐 监听当前卡片变化（已删除图谱同步）
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

/* 🌌 内容包装器（占据剩余空间） */
.fsrs-review-v2__content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止 flex 子元素溢出 */
  height: 100%; /* 确保容器有明确的高度 */
  overflow: hidden; /* 防止整体滚动，只允许 ReviewContent 滚动 */
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

/* 全屏样式 - 只影响插件的复习对话框 */
/* 参考思源原生实现：siyuan/app/src/assets/scss/main/_main.scss:28-56 */

/* 1. 对话框容器全屏 */
.b3-dialog__container[data-key="dialog-opencard"].fullscreen {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  z-index: 8 !important;
  border-radius: 0 !important;

  /* 标题栏样式调整 */
  .block__icons {
    padding-left: var(--b3-toolbar-left-mac);
    height: 32px;
    min-height: 32px;
  }

  /* 拖拽区域样式 */
  .block__icons > .fn__flex-1 {
    -webkit-app-region: drag;
    min-width: 32px;
    height: 100%;
    box-sizing: border-box;
    border-radius: var(--b3-border-radius-b);

    &:hover {
      background-color: var(--b3-theme-surface-light);
    }
  }
}

/* 2. 内容区域全屏（填充父容器） */
.fsrs-review-v2-content.fullscreen {
  width: 100%;
  height: 100%;
}
</style>

<style>
/* 确保对话框有圆角 */
.b3-dialog__container[data-key="dialog-opencard"] {
  border-radius: var(--b3-border-radius-b) !important;
}
</style>

