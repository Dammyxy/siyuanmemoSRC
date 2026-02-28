<template>
  <div class="quick-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" text="加载快速卡片..." />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 卡片内容 -->
    <div v-else-if="viewModel" class="quick-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 卡片内容 -->
      <div
        ref="cardContentRef"
        class="quick-card-renderer__card"
        :class="contentClasses"
      >
        <div v-html="renderedHtml"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { QuickCardRenderService, QuickCardViewModel } from '@/core/card/quick-card/application/QuickCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import { createLogger } from '@/utils/logger';
import { renderMathWithKatex } from './mathRender';

const logger = createLogger('QuickCardRenderer');

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
  (e: 'loaded', result: QuickCardViewModel): void;
  /** 加载失败 */
  (e: 'error', error: Error): void;
}

const emit = defineEmits<Emits>();

/**
 * 状态
 */
const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<QuickCardViewModel | null>(null);
const renderedHtml = ref('');
const cardContentRef = ref<HTMLElement | null>(null);

function renderDisplayHtml(result: QuickCardViewModel): string {
  // Only apply KaTeX re-render for formula cloze quick cards.
  if (result.metadata.symbol !== '\\cloze') {
    return result.html;
  }
  return renderMathWithKatex(result.html, (error) => {
    logger.warn('[QuickCardRenderer] Failed to render KaTeX expression:', error);
  });
}

/**
 * 计算属性：内容 CSS 类
 */
const contentClasses = computed(() => {
  if (!viewModel.value) return [];
  return viewModel.value.cssClasses;
});

/**
 * 加载视图模型
 */
async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;

    const side = props.showAnswer ? 'back' : 'front';

    logger.info('[QuickCardRenderer] loadViewModel called:', { 
      blockId: props.blockId, 
      cardId: props.cardId, 
      side 
    });

    const result = await props.renderService.prepareViewModel(props.blockId, side, props.cardId);

    logger.info('[SiYuanMemo][QuickCardRenderer] View model:', result);

    if (!result) {
      throw new Error('Failed to load card: not a quick card');
    }

    viewModel.value = result;
    renderedHtml.value = renderDisplayHtml(result);
    emit('loaded', result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    // 只在非预期错误时显示错误日志
    if (!errorMessage.includes('not a quick card')) {
      logger.error('[SiYuanMemo][QuickCardRenderer] Failed to load view model:', err);
    }
  } finally {
    loading.value = false;
  }
}

/**
 * 监听 showAnswer 变化
 */
watch(
  () => props.showAnswer,
  () => {
    loadViewModel();
  },
);

/**
 * 监听 blockId 变化
 */
watch(
  () => props.blockId,
  () => {
    loadViewModel();
  },
);

/**
 * 组件挂载时加载视图模型
 */
onMounted(() => {
  loadViewModel();
});
</script>

<style scoped>
.quick-card-renderer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.quick-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.quick-card-renderer__card {
  flex: 1;
  padding: 48px 32px;
  font-size: 22px;
  line-height: 1.625;
  color: var(--b3-theme-on-background);
}

/* 段落样式 */
.quick-card-renderer__card :deep(p) {
  margin: 0.5em 0;
  line-height: 1.625;
}

/* 标题样式 */
.quick-card-renderer__card :deep(h1) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.75em;
}

.quick-card-renderer__card :deep(h2) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.5em;
}

.quick-card-renderer__card :deep(h3) {
  margin: 0.5em 0;
  font-weight: 600;
  font-size: 1.25em;
}

/* 列表样式 */
.quick-card-renderer__card :deep(ul),
.quick-card-renderer__card :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

/* 代码块样式 */
.quick-card-renderer__card :deep(code) {
  font-family: var(--b3-font-family-code);
  background-color: var(--b3-theme-surface);
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

/* 标记样式 - 柔和的淡绿色高亮 */
.quick-card-renderer__card :deep(mark) {
  background-color: #C8E6C9; /* 柔和的淡绿色 (Material Green 100) */
  color: #00695C; /* 深青色文字 */
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

/* 隐藏标记 */
.quick-card-renderer__card:deep(.card__block--hidemark mark),
.quick-card-renderer__card:deep(.card__block--hidemark [data-type~="mark"]) {
  background-color: var(--b3-theme-background);
  color: var(--b3-theme-background);
}

/* 隐藏列表 */
.quick-card-renderer__card:deep(.card__block--hideli .li),
.quick-card-renderer__card:deep(.card__block--hideli .list) {
  display: none;
}

/* 隐藏标题 */
.quick-card-renderer__card:deep(.card__block--hideh [data-type="NodeHeading"]) {
  display: none;
}

/* 隐藏超级块 */
.quick-card-renderer__card:deep(.card__block--hidesb .sb) {
  display: none;
}
</style>
