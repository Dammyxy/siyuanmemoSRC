<template>
  <div class="card-browser__preview" :style="previewStyle">
    <div v-if="card" class="preview__content">
      <div class="preview__header">
        <span class="preview__title">{{ t('preview', '预览') }}</span>
        <div class="preview__actions">
          <button
            class="b3-button b3-button--outline"
            :class="{ 'preview__lock--active': isLocked }"
            @click="toggleLock"
            :title="isLocked ? t('unlockPreview', '双击内容区也可解锁') : t('lockPreview', '锁定编辑')"
          >
            <svg><use :xlink:href="isLocked ? '#iconLock' : '#iconUnlock'"></use></svg>
          </button>
          <button
            class="b3-button b3-button--outline"
            @click="emitJump"
            :title="t('jumpToBlock', '跳转')"
          >
            <svg><use xlink:href="#iconOpen"></use></svg>
          </button>
        </div>
      </div>

      <CardBreadcrumb
        v-if="breadcrumbs.length > 0"
        :items="breadcrumbs"
        variant="preview"
        interactive
        :active-id="activeBreadcrumbId"
        @select="previewBreadcrumb"
      />

      <div v-if="showPreviewMeta" class="preview__meta">
        <div class="preview__meta-copy">
          <span v-if="isTemporaryPreview" class="preview__meta-badge">
            {{ t('previewTemporary', '临时预览') }}
          </span>
          <div
            v-if="activePreviewTitle"
            class="preview__document-title"
            :title="activePreviewTitle"
          >
            {{ activePreviewTitle }}
          </div>
        </div>
        <button
          v-if="isTemporaryPreview"
          class="b3-button b3-button--outline preview__meta-return"
          @click="returnToSelectedCard"
        >
          {{ t('previewBackToCurrentCard', '返回当前卡片') }}
        </button>
      </div>

      <div class="preview__body" ref="bodyRef" @dblclick="handleDoubleClick">
        <!-- Protyle render host -->
      </div>
    </div>
    <div v-else class="preview__empty">
      <span>{{ t('clickToPreview', '点击卡片查看详情') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Protyle, type App } from 'siyuan';

import type { BreadcrumbItem } from '@/core/card/common/application/types';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import type { BrowserCard, BrowserPreviewSource } from './types';
import { applyProtyleReadonly } from './utils/protyleControl';
import { loadPreviewBreadcrumbTrail } from './utils/previewBreadcrumbData';
import {
  resolvePreviewDocumentTitle,
  resolvePreviewTargetType,
} from './utils/previewBreadcrumbs';
import { createLogger } from '@/utils/logger';
import {
  ensureSiyuanMenuComponentFallbacks,
  isMissingSiyuanMenuComponentReferenceError,
} from '@/utils/siyuanMenuComponentFallbacks';

const logger = createLogger('BrowserPreview');

const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  card: BrowserCard | null;
  mode: 'dialog' | 'tab' | 'dock';
  size: number;
}>();

const emit = defineEmits<{
  (e: 'jump', blockId: string): void;
  (e: 'update:size', size: number): void;
}>();

const bodyRef = ref<HTMLElement | null>(null);
const isLocked = ref(true);
const breadcrumbs = ref<BreadcrumbItem[]>([]);
const previewSource = ref<BrowserPreviewSource>('selected-card');
const activePreviewBlockId = ref('');
const activePreviewType = ref('');
const activePreviewTitle = ref('');
const lastLoadedBlockId = ref('');
const lastBreadcrumbBlockId = ref('');

let currentProtyle: Protyle | null = null;
let currentHostElement: HTMLElement | null = null;
let loadToken = 0;
let lastPreviewGutterInteractionAt = 0;

const PREVIEW_MENU_ERROR_SUPPRESS_WINDOW_MS = 1500;

interface ProtyleWithReadonlyPreviewElements {
  protyle?: {
    gutter?: {
      element?: HTMLElement;
      renderMenu?: (...args: unknown[]) => unknown;
    };
    wysiwyg?: {
      element?: HTMLElement;
    };
  };
}

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const previewStyle = computed(() => {
  if (props.mode === 'dialog') {
    return { width: `${props.size}px` };
  }
  return { height: `${props.size}px` };
});

const selectedCardBlockId = computed(() => props.card?.blockId || '');
const activeBreadcrumbId = computed(() => (
  previewSource.value === 'breadcrumb' ? activePreviewBlockId.value : ''
));
const currentJumpTargetId = computed(() => activePreviewBlockId.value || selectedCardBlockId.value);
const isTemporaryPreview = computed(() => (
  previewSource.value === 'breadcrumb'
  && Boolean(selectedCardBlockId.value)
  && activePreviewBlockId.value !== selectedCardBlockId.value
));
const showPreviewMeta = computed(() => Boolean(activePreviewTitle.value) || isTemporaryPreview.value);

function syncActivePreviewMetadata(): void {
  activePreviewType.value = resolvePreviewTargetType({
    card: props.card,
    activePreviewBlockId: activePreviewBlockId.value,
    breadcrumbs: breadcrumbs.value,
  });
  activePreviewTitle.value = resolvePreviewDocumentTitle({
    card: props.card,
    activePreviewBlockId: activePreviewBlockId.value,
    activePreviewType: activePreviewType.value,
    breadcrumbs: breadcrumbs.value,
  });
}

function resetToSelectedCardState(): void {
  previewSource.value = 'selected-card';
  activePreviewBlockId.value = selectedCardBlockId.value;
  syncActivePreviewMetadata();
}

function clearPreviewState(): void {
  breadcrumbs.value = [];
  previewSource.value = 'selected-card';
  activePreviewBlockId.value = '';
  activePreviewType.value = '';
  activePreviewTitle.value = '';
  lastLoadedBlockId.value = '';
  lastBreadcrumbBlockId.value = '';
}

function toggleLock(): void {
  isLocked.value = !isLocked.value;
  updateProtyleReadonly();
}

function handleDoubleClick(): void {
  if (isLocked.value) {
    isLocked.value = false;
    updateProtyleReadonly();
  }
}

function emitJump(): void {
  const targetId = currentJumpTargetId.value;
  if (!targetId) {
    return;
  }
  emit('jump', targetId);
}

function updateProtyleReadonly(): void {
  applyProtyleReadonly(currentProtyle, isLocked.value);
}

function isMissingMenuComponentReferenceError(error: unknown): boolean {
  return isMissingSiyuanMenuComponentReferenceError(error);
}

function ensurePreviewMenuGlobalFallbacks(): void {
  const patchedNames = ensureSiyuanMenuComponentFallbacks();
  if (patchedNames.length > 0) {
    logger.trace(`[BrowserPreview] Patched missing global menu fallbacks: ${patchedNames.join(', ')}`);
  }
}

function markPreviewGutterInteraction(): void {
  lastPreviewGutterInteractionAt = Date.now();
}

function shouldSuppressPreviewMenuInjectionError(event: ErrorEvent): boolean {
  if (Date.now() - lastPreviewGutterInteractionAt > PREVIEW_MENU_ERROR_SUPPRESS_WINDOW_MS) {
    return false;
  }

  const message = event.message ?? '';
  const stack = event.error instanceof Error && typeof event.error.stack === 'string'
    ? event.error.stack
    : '';
  const relatedToMenuInjector = /(InsertMenuItem|MenuShow)/i.test(`${message}\n${stack}`);
  if (!relatedToMenuInjector) {
    return false;
  }

  return [
    /(ViewSelect|MenuSeparator) is not defined/i,
    /Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'/i,
    /Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node/i,
  ].some(pattern => pattern.test(message));
}

function handlePreviewWindowError(event: ErrorEvent): void {
  if (!shouldSuppressPreviewMenuInjectionError(event)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  logger.trace('[BrowserPreview] Suppressed external preview menu injection error:', event.message);
}

function stabilizePreviewGutterMenu(protyle: unknown): void {
  const gutter = (protyle as ProtyleWithReadonlyPreviewElements | null)?.protyle?.gutter;
  if (!gutter || typeof gutter.renderMenu !== 'function') {
    return;
  }

  const gutterElement = gutter.element;
  gutterElement?.addEventListener('pointerdown', markPreviewGutterInteraction, true);
  gutterElement?.addEventListener('click', markPreviewGutterInteraction, true);
  gutterElement?.addEventListener('contextmenu', markPreviewGutterInteraction, true);

  const originalRenderMenu = gutter.renderMenu.bind(gutter);
  const safeRenderMenu = (...args: unknown[]) => {
    try {
      return originalRenderMenu(...args);
    }
    catch (error) {
      if (!isMissingMenuComponentReferenceError(error)) {
        throw error;
      }
      ensurePreviewMenuGlobalFallbacks();
      return originalRenderMenu(...args);
    }
  };
  gutter.renderMenu = safeRenderMenu;
}

function destroyCurrentProtyle(): void {
  if (currentProtyle) {
    currentProtyle.destroy();
    currentProtyle = null;
  }
  if (currentHostElement?.parentElement) {
    currentHostElement.parentElement.removeChild(currentHostElement);
  }
  currentHostElement = null;
  lastLoadedBlockId.value = '';
}

function createProtyleHost(): HTMLElement | null {
  const previewBody = bodyRef.value;
  if (!previewBody) {
    return null;
  }
  const host = document.createElement('div');
  host.className = 'preview__protyle-host';
  previewBody.appendChild(host);
  currentHostElement = host;
  return host;
}

function clearPreviewBody(): void {
  if (bodyRef.value) {
    bodyRef.value.innerHTML = '';
  }
}

async function fetchBreadcrumbs(blockId: string, token: number = loadToken): Promise<void> {
  if (token !== loadToken) {
    return;
  }

  if (blockId && blockId === lastBreadcrumbBlockId.value && breadcrumbs.value.length > 0) {
    return;
  }

  breadcrumbs.value = [];
  syncActivePreviewMetadata();

  if (!blockId) {
    return;
  }

  try {
    const nextBreadcrumbs = await loadPreviewBreadcrumbTrail(blockId, props.card);
    if (token !== loadToken) {
      return;
    }
    breadcrumbs.value = nextBreadcrumbs;
    lastBreadcrumbBlockId.value = blockId;
    syncActivePreviewMetadata();
  }
  catch (err) {
    if (token !== loadToken) {
      return;
    }
    logger.error('[BrowserPreview] Fetch breadcrumbs error:', err);
    lastBreadcrumbBlockId.value = '';
    syncActivePreviewMetadata();
  }
}

async function loadContent(blockId: string, token: number = loadToken): Promise<void> {
  if (!bodyRef.value || !props.app || !blockId) {
    return;
  }
  if (token !== loadToken) {
    return;
  }

  if (blockId === lastLoadedBlockId.value && currentProtyle) {
    return;
  }

  ensurePreviewMenuGlobalFallbacks();

  destroyCurrentProtyle();
  if (token !== loadToken) {
    return;
  }

  const host = createProtyleHost();
  if (!host) {
    return;
  }

  try {
    const nextProtyle = new Protyle(props.app, host, {
      blockId,
      mode: 'wysiwyg',
      render: {
        background: false,
        title: false,
        gutter: true,
        breadcrumb: false,
        breadcrumbDocName: false,
      },
      after: (protyle: unknown) => {
        applyProtyleReadonly(protyle, isLocked.value);
        stabilizePreviewGutterMenu(protyle);
      },
    });

    if (token !== loadToken) {
      nextProtyle.destroy();
      if (currentHostElement === host) {
        currentHostElement = null;
      }
      if (host.parentElement) {
        host.parentElement.removeChild(host);
      }
      return;
    }

    currentProtyle = nextProtyle;
    lastLoadedBlockId.value = blockId;
  }
  catch (err) {
    if (token !== loadToken) {
      return;
    }
    logger.error('[BrowserPreview] Protyle load error:', err);
    destroyCurrentProtyle();
    if (bodyRef.value) {
      bodyRef.value.innerHTML = '<div class="preview-error">加载失败</div>';
    }
  }
}

async function previewBreadcrumb(item: BreadcrumbItem): Promise<void> {
  if (!item.id) {
    return;
  }
  if (item.id === activePreviewBlockId.value && currentProtyle) {
    return;
  }

  const token = ++loadToken;
  previewSource.value = 'breadcrumb';
  activePreviewBlockId.value = item.id;
  activePreviewType.value = item.type;
  activePreviewTitle.value = resolvePreviewDocumentTitle({
    card: props.card,
    activePreviewBlockId: item.id,
    activePreviewType: item.type,
    breadcrumbs: breadcrumbs.value,
  });
  await loadContent(item.id, token);
}

async function returnToSelectedCard(): Promise<void> {
  const blockId = selectedCardBlockId.value;
  if (!blockId) {
    return;
  }
  if (blockId === activePreviewBlockId.value && currentProtyle) {
    return;
  }

  const token = ++loadToken;
  resetToSelectedCardState();
  await loadContent(blockId, token);
}

watch(() => props.card, async (newCard) => {
  const token = ++loadToken;

  if (newCard?.blockId) {
    resetToSelectedCardState();
    await fetchBreadcrumbs(newCard.blockId, token);
    if (token !== loadToken) {
      return;
    }
    await loadContent(newCard.blockId, token);
    return;
  }

  clearPreviewState();
  destroyCurrentProtyle();
  clearPreviewBody();
}, { immediate: true });

onMounted(() => {
  ensurePreviewMenuGlobalFallbacks();
  window.addEventListener('error', handlePreviewWindowError, true);
});

onBeforeUnmount(() => {
  loadToken += 1;
  destroyCurrentProtyle();
  window.removeEventListener('error', handlePreviewWindowError, true);
});

defineExpose({
  fetchBreadcrumbs,
  loadContent,
  returnToSelectedCard,
});
</script>
