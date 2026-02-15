<template>
  <div class="quick-card-renderer">
    <!-- 加载状态 -->
    <div v-if="loading" class="quick-card-renderer__loading">
      <div class="fn__loading">
        <svg class="fn__rotate"><use xlink:href="#iconLoading"></use></svg>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="quick-card-renderer__error">
      <div class="b3-label__text">{{ error }}</div>
    </div>

    <!-- 卡片内容 -->
    <div
      v-else-if="currentFace"
      ref="cardContentRef"
      class="quick-card-renderer__content"
      :class="contentClasses"
    >
      <div v-html="currentFace.html"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import type { QuickCardRenderResult } from '@/core/card/quick-card/application/QuickCardRenderService';

/**
 * Props
 */
interface Props {
  /** 块 ID */
  blockId: string;
  /** 卡片 ID（可选，用于 Xiuyuan 多卡片场景） */
  cardId?: string;
  /** 渲染服务 */
  renderService: QuickCardRenderService;
  /** 是否显示答案 */
  showAnswer?: boolean;
  /** 国际化文本 */
  i18n?: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  showAnswer: false,
});

/**
 * Emits
 */
interface Emits {
  /** 加载完成 */
  (e: 'loaded', result: QuickCardRenderResult): void;
  /** 加载失败 */
  (e: 'error', error: Error): void;
}

const emit = defineEmits<Emits>();

/**
 * 状态
 */
const loading = ref(true);
const error = ref<string | null>(null);
const currentFace = ref<QuickCardRenderResult | null>(null);
const cardContentRef = ref<HTMLElement | null>(null);

/**
 * 计算属性：内容 CSS 类
 */
const contentClasses = computed(() => {
  if (!currentFace.value) return [];
  return currentFace.value.cssClasses;
});

/**
 * 加载指定面的卡片
 */
async function loadFace(side: 'front' | 'back') {
  try {
    loading.value = true;
    error.value = null;

    console.log('[QuickCardRenderer] loadFace called:', { 
      blockId: props.blockId, 
      cardId: props.cardId, 
      side 
    });

    const result = await props.renderService.render(props.blockId, side, props.cardId);

    console.log('[QuickCardRenderer] Render result:', result);

    if (!result) {
      throw new Error('Failed to load card: not a quick card');
    }

    currentFace.value = result;
    emit('loaded', result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    console.error('[QuickCardRenderer] Failed to load face:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 监听 showAnswer 变化
 */
watch(
  () => props.showAnswer,
  (newValue) => {
    const side = newValue ? 'back' : 'front';
    loadFace(side);
  },
);

/**
 * 监听 blockId 变化
 */
watch(
  () => props.blockId,
  () => {
    const side = props.showAnswer ? 'back' : 'front';
    loadFace(side);
  },
);

/**
 * 组件挂载时加载正面
 */
onMounted(() => {
  const side = props.showAnswer ? 'back' : 'front';
  loadFace(side);
});
</script>

<style scoped>
.quick-card-renderer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.quick-card-renderer__loading,
.quick-card-renderer__error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 20px;
}

.quick-card-renderer__error {
  color: var(--b3-theme-error);
}

.quick-card-renderer__content {
  flex: 1;
  overflow-y: auto;
  /* 使用与 Protyle 相同的样式 */
  padding: 16px;
  /* 设置较大的字体以便阅读 */
  font-size: 22px;
  line-height: 1.625;
  color: var(--b3-theme-on-background);
}

/* 内容容器 - 模拟 Protyle 的 wysiwyg 容器 */
.quick-card-renderer__content > div {
  /* Protyle 的默认样式 */
  max-width: var(--b3-width-protyle-wysiwyg, 100%);
  margin: 0 auto;
  padding: 16px 24px;
  word-wrap: break-word;
  word-break: break-word;
  /* 确保字体大小继承 */
  font-size: inherit;
  /* 文本左对齐 */
  text-align: left;
  /* 添加最小高度确保内容可见 */
  min-height: 100px;
}

/* 段落样式 */
.quick-card-renderer__content :deep(p) {
  margin: 0.5em 0;
  line-height: 1.625;
  font-size: inherit;
}

/* 标题样式 */
.quick-card-renderer__content :deep(h1) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.75em;
}

.quick-card-renderer__content :deep(h2) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.5em;
}

.quick-card-renderer__content :deep(h3) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.25em;
}

.quick-card-renderer__content :deep(h4),
.quick-card-renderer__content :deep(h5),
.quick-card-renderer__content :deep(h6) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1em;
}

/* 列表样式 */
.quick-card-renderer__content :deep(ul),
.quick-card-renderer__content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

/* 代码块样式 */
.quick-card-renderer__content :deep(code) {
  font-family: var(--b3-font-family-code);
  background-color: var(--b3-theme-surface);
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

/* 标记样式 */
.quick-card-renderer__content :deep(mark) {
  background-color: var(--b3-card-warning-background);
  color: var(--b3-card-warning-color);
  padding: 0 2px;
}

/* 隐藏标记 */
.quick-card-renderer__content:deep(.card__block--hidemark mark),
.quick-card-renderer__content:deep(.card__block--hidemark [data-type~="mark"]) {
  background-color: var(--b3-theme-background);
  color: var(--b3-theme-background);
}

/* 隐藏列表 */
.quick-card-renderer__content:deep(.card__block--hideli .li),
.quick-card-renderer__content:deep(.card__block--hideli .list) {
  display: none;
}

/* 隐藏标题 */
.quick-card-renderer__content:deep(.card__block--hideh [data-type="NodeHeading"]) {
  display: none;
}

/* 隐藏超级块 */
.quick-card-renderer__content:deep(.card__block--hidesb .sb) {
  display: none;
}

/* 响应式设计 */
@media screen and (max-width: 768px) {
  .quick-card-renderer__content > div {
    padding: 12px 16px;
  }
}
</style>
