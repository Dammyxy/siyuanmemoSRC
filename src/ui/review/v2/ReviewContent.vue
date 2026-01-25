<template>
  <div class="fsrs-review-v2-content">
    <div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty ft__secondary">
      {{ t('loadingContent', '内容加载中...') }}
    </div>

    <div v-else-if="content.type === 'html'" class="fsrs-review-v2-content__html" v-html="content.data"></div>

    <div v-else class="fsrs-review-v2-content__protyle">
      <div ref="hostRef" class="fsrs-review-v2-content__protyle-host"></div>
    </div>

    <div v-if="overlay && overlayComponent" class="fsrs-review-v2-content__overlay" :data-layout="overlay.layout">
      <component :is="overlayComponent" v-bind="overlay.props"></component>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getBlockDocInfo, getBlockDOM, getDocContent } from '@/core/siyuan/api';
import * as siyuan from 'siyuan';
import type { ReviewUIState } from './types';
import { OVERLAY_REGISTRY } from './overlays/index';

const props = defineProps<{
  app: any;
  content: ReviewUIState['content'];
  overlay?: ReviewUIState['overlay'];
  i18n?: Record<string, string>;
  hasHiddenContent?: boolean;
  showAnswer?: boolean;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const hostRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<any>(null);
let renderSeq = 0;

const overlayComponent = computed<any | null>(() => {
  const key = String(props.overlay?.component || '');
  if (!key) return null;
  return (OVERLAY_REGISTRY as any)[key] || null;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function ensureEditor(): Promise<void> {
  if (editorRef.value) return;
  if (!hostRef.value) return;
  if (!props.app) return;
  const ProtyleCtor = (siyuan as any).Protyle;
  if (!ProtyleCtor) {
    hostRef.value.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    return;
  }
  const cbGetAll = (siyuan as any).Constants?.CB_GET_ALL ?? 2;
  editorRef.value = new ProtyleCtor(props.app, hostRef.value, {
    blockId: '',
    action: [cbGetAll].filter(Boolean),
    render: {
      background: false,
      gutter: true,
      breadcrumbDocName: false,
      breadcrumb: false,
      title: false,
    },
    typewriterMode: false,
  });
}

async function waitForWysiwyg(seq: number): Promise<{ protyle: any; wysiwyg: HTMLElement } | null> {
  for (let i = 0; i < 30; i++) {
    if (seq !== renderSeq) return null;
    const protyle = editorRef.value?.protyle;
    const wysiwyg = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (protyle && wysiwyg) return { protyle, wysiwyg };
    await nextTick();
    await sleep(16);
  }
  return null;
}

async function renderProtyle(blockID: string): Promise<void> {
  const seq = ++renderSeq;
  await ensureEditor();
  if (seq !== renderSeq) return;

  const ready = await waitForWysiwyg(seq);
  if (!ready) {
    if (seq !== renderSeq) return;
    const host = hostRef.value;
    if (host) {
      host.innerHTML = `<div class="ft__error" style="padding: 16px; text-align: center;">${t('loadFailed', '加载失败')}</div>`;
    }
    return;
  }
  const { protyle, wysiwyg } = ready;

  try {
    const docInfo = await getBlockDocInfo(blockID);
    const ial = docInfo?.ial || docInfo?.data?.ial;
    if (ial) {
      protyle.wysiwyg?.renderCustom(ial);
    }

    let html = '';
    try {
      const docData = await getDocContent(blockID, 102400, 0);
      html = String(docData?.content || '');
    } catch {}

    if (!html) {
      const domData = await getBlockDOM(blockID);
      html = String(domData?.dom || '');
    }

    wysiwyg.innerHTML = html || `<p>${t('blockLabel', '块')} ${blockID}</p>`;

    await nextTick();
    protyle.block.id = blockID;
    protyle.block.showAll = true;
  } catch {
    wysiwyg.innerHTML = `<p class="ft__error">${t('loadFailed', '加载失败')}</p>`;
  }
}

watch(
  () => [props.content.type, props.content.data, props.content.id] as const,
  ([type, data]) => {
    if (type !== 'protyle') return;
    const blockID = String(data || '');
    if (!blockID) return;
    void renderProtyle(blockID);
  },
  { immediate: true },
);

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    const protyle = editorRef.value?.protyle;
    if (!protyle || !protyle.wysiwyg) return;
    const wysiwyg = protyle.wysiwyg.element;
    if (!wysiwyg) return;

    if (!hidden) {
      wysiwyg.classList.remove(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
      return;
    }

    if (show) {
      wysiwyg.classList.remove(
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hidesb',
        'card__block--hideh'
      );
    } else {
      wysiwyg.classList.add('card__block--hideh');
      // TODO: 根据 QueueUIConfig.hiddenContentTypes 添加其他类
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  const { type, data } = props.content;
  if (type !== 'protyle') return;
  const blockID = String(data || '');
  if (!blockID) return;
  void renderProtyle(blockID);
});

onUnmounted(() => {
  try {
    editorRef.value?.destroy?.();
  } catch {}
  editorRef.value = null;
});

const overlay = computed(() => props.overlay);
const content = computed(() => props.content);
</script>

<style scoped>
.fsrs-review-v2-content {
  position: relative;
  min-height: 240px;
  flex: 1;
  overflow: hidden;
}

.fsrs-review-v2-content__empty {
  padding: 16px;
  text-align: center;
}

.fsrs-review-v2-content__html {
  padding: 8px;
}

.fsrs-review-v2-content__protyle {
  height: 100%;
  overflow: auto;
}

.fsrs-review-v2-content__protyle-host {
  padding: 0;
}

.fsrs-review-v2-content__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fsrs-review-v2-content__overlay[data-layout='top'] {
  inset: 0 0 auto 0;
}

.fsrs-review-v2-content__overlay[data-layout='bottom'] {
  inset: auto 0 0 0;
}

.fsrs-review-v2-content__overlay[data-layout='cover'] {
  inset: 0;
}
</style>
