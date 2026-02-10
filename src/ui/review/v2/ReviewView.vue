<template>
  <div
    ref="rootRef"
    class="fsrs-review-v2"
    :class="{ 'fsrs-review-v2--with-sidebar': isNeuralRoamMode && !sidebarCollapsed }"
    data-key="dialog-opencard"
    @click="handleRootClick"
  >
    <!-- 🌌 Orbit 侧边栏（仅神经漫游模式 + 展开状态） -->
    <OrbitSidebar
      v-if="isNeuralRoamMode && !sidebarCollapsed"
      ref="orbitSidebarRef"
      :neural-queue="neuralQueueInstance"
      :width="sidebarWidth"
      :i18n="i18n"
      @node-click="handleGraphNodeClick"
      @navigate-to-block="handleGraphNavigateToBlock"
    />

    <!-- 🖱️ 拖拽分隔条（仅侧边栏展开时显示） -->
    <div
      v-if="isNeuralRoamMode && !sidebarCollapsed"
      class="fsrs-review-v2__resizer"
      :class="{ 'fsrs-review-v2__resizer--dragging': isResizingSidebar }"
      @mousedown="startResizeSidebar"
    ></div>

    <!-- 📝 复习内容区 -->
    <div class="fsrs-review-v2__content-wrapper">
      <ReviewHeader
        :header="state.header"
        :is-tab-mode="!!props.reviewUI"
        :title="props.title"
        :mode="props.mode"
        :show-sidebar-toggle="isNeuralRoamMode"
        :sidebar-collapsed="sidebarCollapsed"
        :navigation-state="state.header.navigationState"
        @toolbar-action="handleToolbarAction"
        @action="hook.executeCommand"
        @context="handleContext"
        @breadcrumb-click="handleBreadcrumbClick"
      />

      <ReviewContent :app="app" :content="state.content" :overlay="state.overlay" :has-hidden-content="state.meta.hasHiddenContent" :show-answer="state.actions.showAnswer" :meta="state.meta" :i18n="i18n" />

      <ReviewActions
        :actions="state.actions"
        :meta="state.meta"
        :i18n="i18n"
        :queue="providerQueue || props.queue"
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
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import * as riff from '@/core/siyuan/riff';
// 🌌 Orbit 侧边栏 v2.0
import OrbitSidebar from '@/presentation/orbit/OrbitSidebar.vue';
import type { NeuralRoamQueue } from '@/queues/NeuralRoamQueue';

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
}>();

const emit = defineEmits<{
  (e: 'openMenu', menu: IQueueCommand<unknown>[]): void;
  (e: 'close'): void; // 添加关闭事件
  (e: 'convert-to-tab'): void; // 🆕 转换为 Tab 模式（kebab-case）
}>();

const rootRef = ref<HTMLDivElement | null>(null);

// 🌌 侧边栏状态
const sidebarCollapsed = ref(true);  // 默认折叠
const sidebarWidth = ref(1024);      // 默认宽度 1024px (与复习区域等宽)
const isResizingSidebar = ref(false);
const orbitSidebarRef = ref<InstanceType<typeof OrbitSidebar> | null>(null);

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
  console.log('[FSRS ReviewView] Component mounted');
  console.log('[FSRS ReviewView] Checking environment:', {
    hasRootRef: !!rootRef.value,
    rootElement: rootRef.value,
    rootDataKey: rootRef.value?.getAttribute('data-key'),
    inDialog: !!document.querySelector('.b3-dialog__container'),
    dialogElements: document.querySelectorAll('.b3-dialog__container').length,
    ourDialog: document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]'),
  });

  // 🌌 恢复侧边栏状态
  try {
    const savedState = localStorage.getItem('fsrs-orbit-sidebar-state');
    if (savedState) {
      const state = JSON.parse(savedState);
      sidebarCollapsed.value = state.collapsed ?? true;
      sidebarWidth.value = state.width ?? 600;

      // 🆕 只在神经漫游模式下调整对话框宽度
      if (isNeuralRoamMode.value && !state.collapsed) {
        setTimeout(() => {
          const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]') as HTMLElement;
          if (dialogContainer) {
            // 复习区域固定 1024px + 侧边栏宽度
            const totalWidth = 1024 + sidebarWidth.value;
            dialogContainer.style.maxWidth = `${totalWidth}px`;
            dialogContainer.style.width = `${totalWidth}px`;
          }
        }, 100);
      }
    }
  } catch (error) {
    console.warn('[ReviewView] Failed to load sidebar state:', error);
  }

  // 🆕 触发增量同步（如果启用）
  const plugin = props.plugin as any;
  if (plugin?.hybridSyncService) {
    const riffConfig = plugin.storage?.getSettings?.()?.riffIntegration;
    if (riffConfig?.mode === 'advanced' &&
        riffConfig?.incrementalSync?.enabled &&
        riffConfig?.incrementalSync?.triggers?.includes('review-open')) {
      // 后台执行增量同步，不阻塞 UI
      void plugin.hybridSyncService.incrementalSync().catch((err: Error) => {
        console.error('[ReviewView] Incremental sync failed:', err);
      });
    }
  }

  // 🆕 初始化导航状态（Phase 3: UI 控件）
  refreshNavigationState();
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
  console.log('[FSRS ReviewView] Hotkey detected:', key, 'answerShown:', hook.context.value.showAnswer);

  // 显示答案（空格/回车） - 只在答案未显示时工作
  if ((key === ' ' || key === 'enter') && !hook.context.value.showAnswer) {
    e.preventDefault();
    e.stopPropagation();
    console.log('[FSRS ReviewView] Revealing answer...');
    hook.reveal();
    return;
  }

  // 评分（1/2/3/4） - 只在答案已显示后才能评分
  if (['1', '2', '3', '4'].includes(key)) {
    if (hook.context.value.showAnswer) {
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
  console.log('[FSRS ReviewView] handleToolbarAction called:', actionType);

  if (actionType === 'fullscreen') {
    // 实现全屏功能（参考思源原生实现）
    console.log('[FSRS ReviewView] Fullscreen button clicked');

    // 查找对话框容器
    const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]');
    // 使用自定义类名查找内容区域
    const contentMain = rootRef.value?.querySelector('.fsrs-review-v2-content') || document.querySelector('.fsrs-review-v2-content');
    console.log('[FSRS ReviewView] dialogContainer found:', !!dialogContainer);
    console.log('[FSRS ReviewView] contentMain found:', !!contentMain);

    if (contentMain && dialogContainer) {
      const isFullscreen = contentMain.classList.contains('fullscreen');
      console.log('[FSRS ReviewView] Current fullscreen state:', isFullscreen);

      if (isFullscreen) {
        // 退出全屏
        contentMain.classList.remove('fullscreen');
        dialogContainer.classList.remove('fullscreen');
        // 恢复 maxWidth
        (dialogContainer as HTMLElement).style.maxWidth = '1024px';
        document.getElementById('drag')?.classList.remove('fn__hidden');
        console.log('[FSRS ReviewView] Exited fullscreen');
      } else {
        // 进入全屏
        contentMain.classList.add('fullscreen');
        dialogContainer.classList.add('fullscreen');
        // 设置为 100vw 以确保全屏效果(覆盖内联样式)
        (dialogContainer as HTMLElement).style.maxWidth = '100vw';
        document.getElementById('drag')?.classList.add('fn__hidden');
        console.log('[FSRS ReviewView] Entered fullscreen');
      }

      // 调整 protyle 尺寸
      setTimeout(() => {
        const protyleHost = contentMain.querySelector('.fsrs-review-v2-content__protyle-host');
        console.log('[FSRS ReviewView] protyleHost:', protyleHost);

        if (protyleHost) {
          // 查找 protyle 实例
          const protyle = (protyleHost as any)?.['__vnode__']?.['ctx']?.['protyle']
                         || (protyleHost as any)?.['__vueParentComponent']?.['protyle'];
          console.log('[FSRS ReviewView] protyle instance:', protyle);

          if (protyle && typeof protyle.resize === 'function') {
            protyle.resize();
            console.log('[FSRS ReviewView] Protyle resized');
          }
        }
      }, 0);
    } else {
      console.log('[FSRS ReviewView] ERROR: contentMain or dialogContainer not found!');
    }
  } else if (actionType === 'edit-srs') {
    // 打开SRS编辑器
    console.log('[FSRS ReviewView] Edit SRS button clicked');
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;
    console.log('[FSRS ReviewView] cardMeta:', cardMeta);
    console.log('[FSRS ReviewView] blockId:', blockId);
    if (blockId) {
      openSrsEditorDialog(blockId);
    } else {
      console.error('[FSRS ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'sticktab') {
    // 打开为菜单
    handleOpenAsMenu(ev);
  } else if (actionType === 'lock-seed') {
    // Lock current block as seed (Neural Roam) - uses SeedService
    console.log('[FSRS ReviewView] Lock seed button clicked');
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
              console.log('[FSRS ReviewView] Block locked as seed:', blockId);
              showMessage('Locked as seed', 3000, 'info');
            })
            .catch((error: Error) => {
              console.error('[FSRS ReviewView] Failed to lock seed:', error);
              showMessage('Failed to lock seed', 3000, 'error');
            });
        });
      } else {
        console.error('[FSRS ReviewView] Queue does not support seed locking');
        showMessage('Queue does not support seed locking', 3000, 'error');
      }
    } else {
      console.error('[FSRS ReviewView] ERROR: blockId is undefined!');
    }
  } else if (actionType === 'neural-menu') {
    // 🧠 神经漫游菜单
    console.log('[FSRS ReviewView] Neural menu button clicked');
    // 阻止事件冒泡，防止菜单打开后又立即关闭菜单
    ev.stopPropagation();
    ev.preventDefault();
    handleNeuralMenu(ev);
  } else if (actionType === 'toggle-sidebar') {
    // 🌌 切换侧边栏
    console.log('[FSRS ReviewView] Toggle sidebar button clicked');
    toggleSidebar();
  } else if (actionType === 'nav-toggle-mode') {
    // 🆕 导航模式切换（Phase 3: UI 控件）
    console.log('[FSRS ReviewView] Navigation mode toggle button clicked');
    const queueStrategy = hook.getQueueStrategy();
    const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

    if (underlyingQueue?.name === 'NeuralRoamQueue') {
      const neuralQueue = underlyingQueue.neuralQueue;
      const currentMode = neuralQueue.getNavigationState().navigationMode;

      // 切换模式：follow <-> explore
      const newMode = currentMode === 'follow' ? 'explore' : 'follow';
      neuralQueue.setNavigationMode(newMode);

      // 刷新 UI
      refreshNavigationState();

      // 显示提示
      const modeText = newMode === 'follow' ? '🛤️ 沿路径前进' : '🧭 探索新分支';
      showMessage(`已切换为: ${modeText}`, 2000, 'info');
    }
  } else if (actionType === 'nav-return-bookmark') {
    // 🆕 返回书签（Phase 3: UI 控件）
    console.log('[FSRS ReviewView] Return to bookmark button clicked');
    const queueStrategy = hook.getQueueStrategy();
    const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

    if (underlyingQueue?.name === 'NeuralRoamQueue') {
      const neuralQueue = underlyingQueue.neuralQueue;
      const success = neuralQueue.returnToBookmark();

      if (success) {
        const navState = neuralQueue.getNavigationState();
        const targetBlockId = neuralQueue.displayPath[navState.currentPathIndex];

        // 加载书签位置的卡片
        void hook.loadCardByBlockId(targetBlockId);

        // 刷新图谱
        orbitSidebarRef.value?.refresh(false);

        // 刷新导航状态
        refreshNavigationState();

        showMessage('已返回最新位置', 2000, 'info');
      }
    }
  }
}

function handleOpenAsMenu(ev: MouseEvent) {
  console.log('[FSRS ReviewView] handleOpenAsMenu called', ev);

  const menu = new Menu();

  // 获取插件实例
  const fsrsPlugin = (window as any).siyuanFsrsPlugin;

  if (!fsrsPlugin) {
    console.error('[FSRS ReviewView] FSRS plugin instance not found');
    // 降级方案：打开文档
    const cardMeta = state.value.actions.cardMeta;
    const blockId = cardMeta?.blockID || state.value.content.data;

    if (blockId) {
      menu.addItem({
        id: 'openByNewWindow',
        icon: 'iconOpenWindow',
        label: '使用新窗口打开',
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
  // 🆕 在 Tab 中打开
  menu.addItem({
    id: 'openByTab',
    icon: 'iconLayoutRight',
    label: '在 Tab 中打开',
    click() {
      console.log('[FSRS ReviewView] Opening in tab and closing dialog');

      // 获取插件实例
      const fsrsPlugin = (window as any).siyuanFsrsPlugin;
      if (!fsrsPlugin) {
        console.error('[FSRS ReviewView] Plugin instance not found');
        return;
      }

      // 打开 Tab
      fsrsPlugin.openReviewTab({
        provider: props.provider,
        queue: props.queue,
        adapter: props.adapter,
        title: props.title || '复习',
      });

      // 关闭当前对话框
      emit('close');
    },
  });

  // 使用新窗口打开（打开独立窗口）
  /// #if !BROWSER
  menu.addItem({
    id: 'openByNewWindow',
    icon: 'iconOpenWindow',
    label: '使用新窗口打开',
    click() {
      console.log('[FSRS ReviewView] Opening review in new window');
      try {
        // 获取插件实例
        const fsrsPlugin = (window as any).siyuanFsrsPlugin;
        if (!fsrsPlugin) {
          console.error('[FSRS ReviewView] Plugin instance not found');
          return;
        }

        // 调用优雅的新窗口打开方法
        fsrsPlugin.openReviewInNewWindow({
          provider: props.provider,
          queue: props.queue,
          adapter: props.adapter,
          title: props.title || '复习',
        });

        // 关闭当前对话框
        emit('close');
      } catch (err) {
        console.error('[FSRS ReviewView] Error opening review in new window:', err);
      }
    },
  });
  /// #endif

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
  console.log('[FSRS ReviewView] openSrsEditorDialog called with blockId:', blockId);

  if (!props.app) {
    console.error('[FSRS ReviewView] ERROR: props.app is undefined!');
    return;
  }

  if (!blockId) {
    console.error('[FSRS ReviewView] ERROR: blockId is required but got undefined!');
    return;
  }

  createVueDialog({
    title: t('editSrsData', '编辑 SRS 数据'),
    component: SrsEditorDialog,
    props: {
      card: {
        cardID: blockId,
        blockID: blockId,
        deckID: riff.BUILTIN_DECK_ID,
      },
      deckID: riff.BUILTIN_DECK_ID,
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

// Part 5: 神经漫游菜单
function handleNeuralMenu(ev: MouseEvent) {
  console.log('[FSRS ReviewView] handleNeuralMenu - start', { ev, target: ev.target });

  const queueStrategy = hook.getQueueStrategy();
  console.log('[FSRS ReviewView] queueStrategy:', queueStrategy);

  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();
  console.log('[FSRS ReviewView] underlyingQueue:', underlyingQueue);

  if (!underlyingQueue) {
    console.error('[FSRS ReviewView] Underlying queue not found');
    return;
  }

  console.log('[FSRS ReviewView] Creating menu...');
  const menu = new Menu('neural-roam-menu');
  console.log('[FSRS ReviewView] Menu created:', menu);

  // 1. 查看种子块列表
  console.log('[FSRS ReviewView] Adding menu item 1: 查看种子块列表');
  const viewSeedsItem = menu.addItem({
    icon: 'iconList',
    label: '查看种子块列表',
    click: () => {
      console.log('[FSRS ReviewView] 查看种子块列表 clicked');
      try {
        const seeds = underlyingQueue.getSeedBlocks?.();
        console.log('[FSRS ReviewView] Got seeds:', seeds);
        if (seeds && seeds.length > 0) {
          const seedList = seeds.map((id: string, index: number) => `${index + 1}. ${id}`).join('\n');
          console.log('[FSRS ReviewView] Showing message with seed list');
          showMessage(`种子块列表 (${seeds.length}个):\n${seedList}`, 5000, 'info');
        } else {
          console.log('[FSRS ReviewView] No seeds, showing empty message');
          showMessage('暂无种子块', 3000, 'info');
        }
      } catch (error) {
        console.error('[FSRS ReviewView] Failed to get seed blocks:', error);
      }
    }
  });
  console.log('[FSRS ReviewView] Menu item 1 added:', viewSeedsItem);

  // 2. 从种子块开始漫游（子菜单）
  console.log('[FSRS ReviewView] Getting seeds for submenu...');
  const seeds = underlyingQueue.getSeedBlocks?.() || [];
  console.log('[FSRS ReviewView] Seeds:', seeds);

  if (seeds.length > 0) {
    const seedSubmenuItems = seeds.map((seedId: string) => ({
      label: seedId.substring(0, 20) + '...',
      click: async () => {
        try {
          await underlyingQueue.startRoamingFromSeed?.(seedId);
          showMessage(`已从种子 ${seedId} 开始漫游`, 3000, 'info');
          // 刷新当前卡片
          await hook.executeCommand('next');
        } catch (error) {
          console.error('[FSRS ReviewView] Failed to start roaming from seed:', error);
          showMessage('开始漫游失败', 3000, 'error');
        }
      }
    }));

    console.log('[FSRS ReviewView] Adding menu item 2: 从种子块开始漫游 (with submenu)');
    menu.addItem({
      icon: 'iconPlay',
      label: '从种子块开始漫游',
      submenu: seedSubmenuItems
    });
  } else {
    console.log('[FSRS ReviewView] Adding menu item 2: 从种子块开始漫游 (disabled)');
    menu.addItem({
      icon: 'iconPlay',
      label: '从种子块开始漫游',
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
          showMessage(`已移除种子块 ${seedId}`, 3000, 'info');
        } catch (error) {
          console.error('[FSRS ReviewView] Failed to remove seed:', error);
          showMessage('移除种子块失败', 3000, 'error');
        }
      }
    }));

    console.log('[FSRS ReviewView] Adding menu item 3: 移除种子块 (with submenu)');
    menu.addItem({
      icon: 'iconTrashcan',
      label: '移除种子块',
      submenu: removeSubmenuItems
    });
  } else {
    console.log('[FSRS ReviewView] Adding menu item 3: 移除种子块 (disabled)');
    menu.addItem({
      icon: 'iconTrashcan',
      label: '移除种子块',
      disabled: true
    });
  }

  menu.addSeparator();

  // 4. 查看历史记录
  console.log('[FSRS ReviewView] Adding menu item 4: 查看历史记录');
  menu.addItem({
    icon: 'iconHistory',
    label: '查看历史记录',
    click: () => {
      console.log('[FSRS ReviewView] 查看历史记录 clicked');
      try {
        const history = underlyingQueue.getHistorySnapshot?.();
        if (history && history.length > 0) {
          const historyList = history.slice(-10).map((id: string, index: number) =>
            `${history.length - 10 + index + 1}. ${id}`
          ).join('\n');
          showMessage(`历史记录 (最近10条，共${history.length}条):\n${historyList}`, 5000, 'info');
        } else {
          showMessage('暂无历史记录', 3000, 'info');
        }
      } catch (error) {
        console.error('[FSRS ReviewView] Failed to get history:', error);
      }
    }
  });

  // 5. 清空历史记录
  console.log('[FSRS ReviewView] Adding menu item 5: 清空历史记录');
  menu.addItem({
    icon: 'iconClear',
    label: '清空历史记录',
    click: () => {
      console.log('[FSRS ReviewView] 清空历史记录 clicked');
      try {
        underlyingQueue.clearHistory?.();
        showMessage('历史记录已清空', 3000, 'info');
      } catch (error) {
        console.error('[FSRS ReviewView] Failed to clear history:', error);
        showMessage('清空历史记录失败', 3000, 'error');
      }
    }
  });

  // 显示菜单
  console.log('[FSRS ReviewView] Opening menu...');
  const target = ev.currentTarget as HTMLElement;
  console.log('[FSRS ReviewView] Target element:', target);

  if (target) {
    const rect = target.getBoundingClientRect();
    console.log('[FSRS ReviewView] Target rect:', rect);
    console.log('[FSRS ReviewView] Menu open position:', {
      x: rect.left,
      y: rect.bottom
    });

    menu.open({
      x: rect.left,
      y: rect.bottom
    });
    console.log('[FSRS ReviewView] Menu.open() called');
  } else {
    console.error('[FSRS ReviewView] Target element is null!');
  }
}

// Part 6: 处理面包屑点击
function handleBreadcrumbClick(crumb: { icon?: string; text: string; id?: string; action?: string }, index: number) {
  const action = crumb.action || crumb.id;
  if (action) {
    void hook.executeCommand(action);
  }
}

// 🌐 Part 7: 侧边栏处理函数
/**
 * 切换侧边栏显示/隐藏
 */
function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  console.log('[FSRS ReviewView] Sidebar toggled:', sidebarCollapsed.value ? 'collapsed' : 'expanded');

  // 🆕 只在神经漫游模式下调整对话框宽度
  if (!isNeuralRoamMode.value) {
    console.log('[FSRS ReviewView] Not neural roam mode, skipping dialog width adjustment');
    return;
  }

  // 动态调整对话框宽度
  const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]') as HTMLElement;
  if (dialogContainer) {
    if (sidebarCollapsed.value) {
      // 折叠:清除固定宽度，让对话框恢复响应式
      dialogContainer.style.maxWidth = '';
      dialogContainer.style.width = '';
    } else {
      // 展开:复习区域 1024px + 侧边栏宽度
      const totalWidth = 1024 + sidebarWidth.value;
      dialogContainer.style.maxWidth = `${totalWidth}px`;
      dialogContainer.style.width = `${totalWidth}px`;  // 强制固定宽度，避免被挤压
    }
  }

  // 持久化状态
  try {
    const state = {
      collapsed: sidebarCollapsed.value,
      width: sidebarWidth.value,
    };
    localStorage.setItem('fsrs-orbit-sidebar-state', JSON.stringify(state));
  } catch (error) {
    console.warn('[ReviewView] Failed to save sidebar state:', error);
  }
}

/**
 * 拖拽调整侧边栏宽度（参考 SRSBrowser）
 */
function startResizeSidebar(e: MouseEvent) {
  e.preventDefault();
  isResizingSidebar.value = true;

  // 🔑 防止拖拽时选中文字
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';

  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  // 🔑 使用全局监听，避免鼠标移出分隔条时停止
  const onMouseMove = (moveEvent: MouseEvent) => {
    moveEvent.preventDefault();
    const delta = moveEvent.clientX - startX;
    // 允许更大的侧边栏宽度（最大 1200px，最小 400px）
    const newWidth = Math.min(1200, Math.max(400, startWidth + delta));
    sidebarWidth.value = newWidth;

    // 实时调整对话框宽度
    const dialogContainer = document.querySelector('.b3-dialog__container[data-key="dialog-opencard"]') as HTMLElement;
    if (dialogContainer) {
      const totalWidth = 1024 + newWidth;
      dialogContainer.style.maxWidth = `${totalWidth}px`;
      dialogContainer.style.width = `${totalWidth}px`;  // 强制固定宽度
    }
  };

  const onMouseUp = () => {
    // 🔑 清理全局样式和监听器
    isResizingSidebar.value = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // 持久化宽度
    try {
      const state = {
        collapsed: sidebarCollapsed.value,
        width: sidebarWidth.value,
      };
      localStorage.setItem('fsrs-orbit-sidebar-state', JSON.stringify(state));
    } catch (error) {
      console.warn('[ReviewView] Failed to save sidebar width:', error);
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

/**
 * 处理图谱节点点击
 *
 * 当用户在图谱中点击节点时，跳转到该节点对应的卡。
 */
function handleGraphNodeClick(data: { nodeId: string; nodeType: string }) {
  console.log('[FSRS ReviewView] Graph node clicked:', data.nodeId);
  void handleGraphNavigateToBlock(data.nodeId);
}

/**
 * 🆕 处理图谱历史节点跳转（路径导航系统）
 *
 * 当用户在 Orbit 图谱中点击历史节点时，跳转到该节点对应的卡片。
 * 使用路径导航系统：保留完整路径，只改变当前位置。
 *
 * @param blockId 目标块 ID
 */
async function handleGraphNavigateToBlock(blockId: string) {
  console.log('[FSRS ReviewView] Navigating to history node:', blockId);

  try {
    const queueStrategy = hook.getQueueStrategy();
    const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

    // 🆕 神经漫游队列 - 使用路径导航系统
    if (underlyingQueue?.name === 'NeuralRoamQueue') {
      const neuralQueue = underlyingQueue.neuralQueue;

      // 1. 跳转到历史节点（保留完整路径）
      const success = neuralQueue.jumpToHistoryNode(blockId);

      if (success) {
        console.log('[FSRS ReviewView] Successfully jumped to history node:', blockId);

        // 2. 直接加载该卡片到 UI（不调用 queue.next()）
        await hook.loadCardByBlockId(blockId);

        // 3. 刷新图谱（保持视野，不自动 fitView）
        orbitSidebarRef.value?.refresh(false);

        // 4. 刷新导航状态到 UI
        refreshNavigationState();

        // 5. 显示导航模式提示
        const navState = neuralQueue.getNavigationState();
        const modeText = navState.navigationMode === 'follow' ? '沿路径前进' : '探索新分支';
        showMessage(`已跳转到历史节点 | 当前模式: ${modeText}`, 2000, 'info');

        return;
      } else {
        // 节点不在路径中，降级为设置种子
        console.warn('[FSRS ReviewView] Node not in path, fallback to setting seed');
        if (typeof underlyingQueue.startRoamingFromSeed === 'function') {
          await underlyingQueue.startRoamingFromSeed(blockId);
          showMessage(`已设置漫游起点: ${blockId}`, 2000, 'info');
        }
        return;
      }
    }

    // 其他队列类型 - 降级为打开新标签页
    if (props.app) {
      openTab({
        app: props.app,
        doc: { id: blockId },
        openNewTab: true,
      });
    } else {
      console.error('[FSRS ReviewView] app is not available');
    }
  } catch (error) {
    console.error('[FSRS ReviewView] Failed to navigate to block:', error);
    showMessage('切换失败', 3000, 'error');
  }
}

/**
 * 🆕 获取当前队列的导航状态（仅神经漫游队列）
 * Phase 3: UI 控件
 */
function getNavigationState() {
  const queueStrategy = hook.getQueueStrategy();
  const underlyingQueue = (queueStrategy as any)?.getUnderlyingQueue?.();

  if (underlyingQueue?.name === 'NeuralRoamQueue') {
    const neuralQueue = underlyingQueue.neuralQueue;
    return neuralQueue.getNavigationState();
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

// 🌐 监听当前卡片变化,同步到侧边栏图谱
watch(
  () => state.value.content.data,
  (newBlockId) => {
    if (!sidebarCollapsed.value && orbitSidebarRef.value && newBlockId) {
      // 🔑 只刷新图谱数据,保持用户设置的视野
      if (typeof orbitSidebarRef.value.refresh === 'function') {
        orbitSidebarRef.value.refresh(false);  // ← 禁用自动 fitView,不移动视野
      }
    }
  }
);
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

/* 🌌 带侧边栏时切换为横向布局 */
.fsrs-review-v2--with-sidebar {
  flex-direction: row;
}

/* 🌌 内容包装器（占据剩余空间） */
.fsrs-review-v2__content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止 flex 子元素溢出 */
}

/* 侧边栏展开时，内容区域固定宽度 */
.fsrs-review-v2--with-sidebar .fsrs-review-v2__content-wrapper {
  flex: 0 0 1024px; /* 固定宽度 1024px，不伸缩 */
  width: 1024px;
}

/* 🌌 拖拽分隔条 */
.fsrs-review-v2__resizer {
  width: 4px;
  background: var(--b3-theme-surface);
  cursor: col-resize;
  transition: background 0.2s;
  flex-shrink: 0;
  user-select: none;
}

.fsrs-review-v2__resizer:hover,
.fsrs-review-v2__resizer--dragging {
  background: var(--b3-theme-primary);
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

/* 全屏样式 - 当对话框容器有 fullscreen 类时 */
/* 参考思源原生实现：siyuan/app/src/assets/scss/main/_main.scss:28-56 */

/* 1. 对话框容器全屏 */
.b3-dialog__container.fullscreen {
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
