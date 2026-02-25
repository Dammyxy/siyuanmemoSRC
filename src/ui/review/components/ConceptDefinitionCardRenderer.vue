<template>
  <div class="concept-definition-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" :text="t('loading', '加载中...')" />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 概念定义卡内容 -->
    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 卡片类型徽章 -->
      <div class="concept-definition-card-renderer__badge">
        <span class="concept-definition-card-renderer__badge-icon">📚</span>
        <span class="concept-definition-card-renderer__badge-label">
          {{ viewModel.isReverse ? t('conceptDefinitionCardReverse', '概念定义卡（反向）') : t('conceptDefinitionCard', '概念定义卡') }}
        </span>
      </div>

      <!-- 概念定义卡主体 -->
      <div class="concept-definition-card-renderer__main">
        <!-- 正面 -->
        <div
          v-if="!showAnswer"
          class="concept-definition-card-renderer__html-content concept-definition-card-renderer__front"
          v-html="viewModel.frontHtml"
        ></div>

        <!-- 背面 -->
        <div
          v-else
          class="concept-definition-card-renderer__html-content concept-definition-card-renderer__back"
          v-html="viewModel.backHtml"
        ></div>
      </div>

      <!-- 跳转到概念按钮 -->
      <div class="concept-definition-card-renderer__actions">
        <button
          class="concept-definition-card-renderer__btn concept-definition-card-renderer__btn--secondary"
          @click="jumpToConcept"
        >
          {{ t('jumpToConcept', '跳转到概念') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { openTab } from 'siyuan';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import { createLogger } from '@/utils/logger';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { ConceptDefinitionCardViewModel } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: any; // FSRSCard，包含 xiuyuanID 和 faceIndex
  showAnswer?: boolean;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: ConceptDefinitionCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

// 状态
const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptDefinitionCardViewModel | null>(null);

const logger = createLogger('ConceptDefinitionCardRenderer');

const resolvePlugin = () => {
  return (window as any).siyuan?.ws?.app?.plugins?.find(
    (p: any) => p.name === 'siyuan-plugin-siyuanmemo'
  );
};

const renderService = new ConceptDefinitionCardRenderService(props.i18n || {}, {
  getXiuyuan: async (xiuyuanID: string) => {
    const plugin = resolvePlugin();
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const xiuyuanAppService = await plugin.getContext?.()?.getXiuyuanApplicationService?.();
    if (!xiuyuanAppService) {
      throw new Error('XiuyuanApplicationService not available');
    }

    const result = await xiuyuanAppService.getXiuyuan({ xiuyuanId: xiuyuanID });
    if (!result?.xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }
    return result;
  },
  renderMarkdown: (kramdown: string) => {
    const lute = (window as any).Lute?.New?.();
    if (!lute) {
      throw new Error('Lute not available');
    }
    return lute.Md2BlockDOM(kramdown);
  },
});

// 方法
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 加载视图模型
 */
async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;

    viewModel.value = await renderService.prepareViewModel(props.blockId, props.card);
    emit('loaded', viewModel.value);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    logger.error('Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 跳转到概念文档
 */
function jumpToConcept() {
  if (!viewModel.value?.conceptBlockId) {
    return;
  }

  const app = (window as any).siyuan?.ws?.app;
  if (!app) {
    logger.error('App instance not found');
    return;
  }

  openTab({
    app,
    doc: { id: viewModel.value.conceptBlockId },
  });
}

// 生命周期
onMounted(async () => {
  await loadViewModel();
});
</script>

<style scoped>
/* 容器 */
.concept-definition-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 内容区域 */
.concept-definition-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 16px;
}

/* 卡片类型徽章 */
.concept-definition-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.concept-definition-card-renderer__badge-icon {
  font-size: 16px;
}

/* 概念定义卡主体 */
.concept-definition-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.concept-definition-card-renderer__html-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 正面样式 */
.concept-definition-card-renderer__front {
  padding: 24px 32px;
  min-height: 200px;
}

/* 背面样式 */
.concept-definition-card-renderer__back {
  padding: 24px 32px;
  min-height: 200px;
}

/* 问题样式 */
.concept-definition-card-renderer__html-content :deep(.concept-definition-question) {
  font-size: 24px;
  line-height: 1.6;
}

.concept-definition-card-renderer__html-content :deep(.concept-name) {
  font-weight: 700;
  color: var(--b3-theme-primary);
}

.concept-definition-card-renderer__html-content :deep(.question-text) {
  color: var(--b3-theme-on-surface);
}

/* 答案样式 */
.concept-definition-card-renderer__html-content :deep(.concept-definition-answer) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.concept-definition-card-renderer__html-content :deep(.question-repeat) {
  font-size: 20px;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider) {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 8px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider::before) {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-definition-card-renderer__html-content :deep(.answer-divider::after) {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-definition-card-renderer__html-content :deep(.definition-content) {
  font-size: 22px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 反向卡片样式 */
.concept-definition-card-renderer__html-content :deep(.concept-definition-question.reverse) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.concept-definition-card-renderer__html-content :deep(.reverse-label) {
  font-size: 18px;
  color: var(--b3-theme-on-surface-light);
}

.concept-definition-card-renderer__html-content :deep(.concept-answer) {
  padding: 16px 0;
}

.concept-definition-card-renderer__html-content :deep(.concept-name.large) {
  font-size: 32px;
  font-weight: 700;
  color: var(--b3-theme-primary);
}

/* 操作按钮 */
.concept-definition-card-renderer__actions {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--b3-border-color);
  margin-top: auto;
}

.concept-definition-card-renderer__btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.concept-definition-card-renderer__btn--secondary {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  border: 1px solid var(--b3-border-color);
}

.concept-definition-card-renderer__btn--secondary:hover {
  background: var(--b3-theme-surface-light);
}
</style>
