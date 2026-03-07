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

let hasPatchedMenuFallbacks = false;

function isMissingMenuComponentReferenceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /(ViewSelect|MenuSeparator) is not defined/i.test(error.message);
}

function decorateMenuFallbackNode(node: HTMLElement): HTMLElement {
  const state = node as unknown as Record<string, unknown>;
  state.element = node;
  state.render = () => node;
  state.mount = () => node;
  state.destroy = () => undefined;
  state.update = () => node;
  state.onSelect = () => undefined;
  return node;
}

function buildFallbackViewSelectItem(args: unknown[]): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'b3-menu__item';

  const icon = document.createElement('span');
  icon.className = 'b3-menu__icon';
  item.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'b3-menu__label';
  const textArg = args.find(arg => typeof arg === 'string') as string | undefined;
  label.textContent = textArg ?? '';
  item.appendChild(label);

  return decorateMenuFallbackNode(item);
}

function buildFallbackMenuSeparator(): HTMLElement {
  const separator = document.createElement('button');
  separator.type = 'button';
  separator.className = 'b3-menu__separator';
  separator.tabIndex = -1;
  separator.setAttribute('aria-hidden', 'true');
  return decorateMenuFallbackNode(separator);
}

function installMenuComponentFallback(
  name: string,
  creator: (args: unknown[]) => HTMLElement,
): boolean {
  const globalObject = globalThis as Record<string, unknown>;
  if (typeof globalObject[name] !== 'undefined') {
    return false;
  }

  globalObject[name] = function MenuComponentFallback(...args: unknown[]) {
    return creator(args);
  };
  return true;
}

function ensurePreviewMenuGlobalFallbacks(): void {
  const patchedNames: string[] = [];
  if (installMenuComponentFallback('ViewSelect', buildFallbackViewSelectItem)) {
    patchedNames.push('ViewSelect');
  }
  if (installMenuComponentFallback('MenuSeparator', () => buildFallbackMenuSeparator())) {
    patchedNames.push('MenuSeparator');
  }

  if (!hasPatchedMenuFallbacks && patchedNames.length > 0) {
    hasPatchedMenuFallbacks = true;
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
    syncActivePreviewMetadata();
  }
  catch (err) {
    if (token !== loadToken) {
      return;
    }
    logger.error('[BrowserPreview] Fetch breadcrumbs error:', err);
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
