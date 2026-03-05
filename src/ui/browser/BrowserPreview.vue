<template>
  <div class="card-browser__preview" :style="previewStyle">
    <div v-if="card" class="preview__content">
      <div class="preview__header">
        <span class="preview__title">{{ t('preview', '预览') }}</span>
        <div class="preview__actions">
          <!-- 锁定/解锁按钮 -->
          <button 
            class="b3-button b3-button--outline" 
            :class="{ 'preview__lock--active': isLocked }"
            @click="toggleLock" 
            :title="isLocked ? t('unlockPreview', '双击内容区也可解锁') : t('lockPreview', '锁定编辑')"
          >
            <svg><use :xlink:href="isLocked ? '#iconLock' : '#iconUnlock'"></use></svg>
          </button>
          <button class="b3-button b3-button--outline" @click="$emit('jump')" :title="t('jumpToBlock', '跳转')">
            <svg><use xlink:href="#iconOpen"></use></svg>
          </button>
        </div>
      </div>
      
      <!-- 卡片路径面包屑 (垂直层级) -->
      <div class="preview__breadcrumb" v-if="breadcrumbs.length > 0">
        <div 
          v-for="(item, index) in breadcrumbs" 
          :key="item.id"
          class="breadcrumb__item"
          :style="{ paddingLeft: `${index * 16 + 8}px` }"
          @click="loadContent(item.id)"
        >
          <span class="breadcrumb__text">
            <svg class="breadcrumb__icon"><use :xlink:href="item.type === 'NodeDocument' ? '#iconFile' : '#iconALIGN'"></use></svg>
            {{ item.name || '...' }}
          </span>
        </div>
      </div>

      <div class="preview__body" ref="bodyRef" @dblclick="handleDoubleClick">
        <!-- Protyle 渲染区域 -->
      </div>
    </div>
    <div v-else class="preview__empty">
      <span>{{ t('clickToPreview', '点击卡片查看详情') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Protyle, type App } from 'siyuan';
import type { BrowserCard } from './types';
import { applyProtyleReadonly } from './utils/protyleControl';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BrowserPreview');

// Props
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  card: BrowserCard | null;
  mode: 'dialog' | 'tab' | 'dock';
  size: number;
}>();

// Emits
const emit = defineEmits<{
  (e: 'jump'): void;
  (e: 'update:size', size: number): void;
}>();

// State
const bodyRef = ref<HTMLElement | null>(null);
const isLocked = ref(true);
const breadcrumbs = ref<IBreadcrumbItem[]>([]);
let currentProtyle: Protyle | null = null;
let currentHostElement: HTMLElement | null = null;
let loadToken = 0;
let lastPreviewGutterInteractionAt = 0;
const PREVIEW_MENU_ERROR_SUPPRESS_WINDOW_MS = 1500;

// 面包屑接口
interface IBreadcrumbItem {
  id: string;
  name: string;
  type: string;
  subType: string;
  children: [];
}

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

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 预览区域样式
const previewStyle = computed(() => {
  if (props.mode === 'dialog') {
    return { width: `${props.size}px` };
  } else {
    return { height: `${props.size}px` };
  }
});

// 切换锁定状态
function toggleLock() {
  isLocked.value = !isLocked.value;
  updateProtyleReadonly();
}

// 双击解锁
function handleDoubleClick() {
  if (isLocked.value) {
    isLocked.value = false;
    updateProtyleReadonly();
  }
}

// 更新 Protyle 只读状态
function updateProtyleReadonly() {
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
  const textArg = args.find((arg) => typeof arg === 'string') as string | undefined;
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

function installMenuComponentFallback(name: string, creator: (args: unknown[]) => HTMLElement): boolean {
  const globalObject = globalThis as Record<string, unknown>;
  if (typeof globalObject[name] !== 'undefined') {
    return false;
  }

  globalObject[name] = function MenuComponentFallback(...args: unknown[]) {
    return creator(args);
  };
  return true;
}

function ensurePreviewMenuGlobalFallbacks() {
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

function markPreviewGutterInteraction() {
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
  ].some((pattern) => pattern.test(message));
}

function handlePreviewWindowError(event: ErrorEvent) {
  if (!shouldSuppressPreviewMenuInjectionError(event)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  logger.trace('[BrowserPreview] Suppressed external preview menu injection error:', event.message);
}

function stabilizePreviewGutterMenu(protyle: unknown) {
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
    } catch (error) {
      if (!isMissingMenuComponentReferenceError(error)) {
        throw error;
      }
      ensurePreviewMenuGlobalFallbacks();
      return originalRenderMenu(...args);
    }
  };
  gutter.renderMenu = safeRenderMenu;
}

function destroyCurrentProtyle() {
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

// 获取面包屑数据
async function fetchBreadcrumbs(blockId: string, token: number = loadToken) {
  if (token !== loadToken) {
    return;
  }
  breadcrumbs.value = [];
  if (!props.app) return;

  try {
    const response = await fetch('/api/block/getBlockBreadcrumb', {
      method: 'POST',
      body: JSON.stringify({ id: blockId }),
    });
    const data = await response.json();
    if (token !== loadToken) {
      return;
    }
    if (data.code === 0 && data.data) {
      let rawBreadcrumbs = data.data;

      // Xiuyuan list template cards append two trailing path items we do not need.
      const isXiuyuanListTemplate = props.card?.meta?.templateID === 'builtin-list-item';
      if (isXiuyuanListTemplate) {
        rawBreadcrumbs = rawBreadcrumbs.slice(0, -2);
      }

      // Deduplicate by normalized breadcrumb text.
      const dedupMap = new Map<string, IBreadcrumbItem>();
      for (const item of rawBreadcrumbs) {
        const normalizedName = item.name.replace(/^[\u2022\-\d]+\.?\s*/, '').trim();
        dedupMap.set(normalizedName, {
          ...item,
          name: normalizedName,
        });
      }

      if (token !== loadToken) {
        return;
      }
      breadcrumbs.value = Array.from(dedupMap.values());
    }
  } catch (err) {
    if (token !== loadToken) {
      return;
    }
    logger.error('[BrowserPreview] Fetch breadcrumbs error:', err);
  }
}

// 加载预览内容
async function loadContent(blockId: string, token: number = loadToken) {
  if (!bodyRef.value || !props.app) return;
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
      blockId: blockId,
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
  } catch (err) {
    if (token !== loadToken) {
      return;
    }
    logger.error('[BrowserPreview] Protyle load error:', err);
    destroyCurrentProtyle();
    if (bodyRef.value) {
      bodyRef.value.innerHTML = `<div class="preview-error">加载失败</div>`;
    }
  }
}

// 监听卡片变化
watch(() => props.card, async (newCard) => {
  const token = ++loadToken;
  if (newCard?.blockId) {
    await fetchBreadcrumbs(newCard.blockId, token);
    if (token !== loadToken) {
      return;
    }
    await loadContent(newCard.blockId, token);
  } else {
    breadcrumbs.value = [];
    destroyCurrentProtyle();
    if (bodyRef.value) {
      bodyRef.value.innerHTML = '';
    }
  }
}, { immediate: true });

// 清理
onMounted(() => {
  ensurePreviewMenuGlobalFallbacks();
  window.addEventListener('error', handlePreviewWindowError, true);
});

onBeforeUnmount(() => {
  loadToken += 1;
  destroyCurrentProtyle();
  window.removeEventListener('error', handlePreviewWindowError, true);
});

// 暴露方法供父组件调用
defineExpose({
  loadContent,
  fetchBreadcrumbs,
});
</script>
