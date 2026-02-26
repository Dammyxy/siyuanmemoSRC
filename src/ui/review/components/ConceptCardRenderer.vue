<template>
  <div class="concept-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" :text="t('loading', '加载中...')" />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 概念卡内容 -->
    <div v-else-if="viewModel" class="concept-card-renderer__content">
      <!-- 面包屑 -->
      <CardBreadcrumb :items="viewModel.breadcrumbs" />

      <!-- 概念卡主体 -->
      <div class="concept-card-renderer__main">
        <!-- 卡片类型徽章 -->
        <div class="concept-card-renderer__badge">
          <span class="concept-card-renderer__badge-icon">🧠</span>
          <span class="concept-card-renderer__badge-label">概念卡</span>
        </div>

        <!-- 正面：概念名称 -->
        <div
          v-if="!showAnswer"
          class="concept-card-renderer__front"
        >
          <div class="concept-card-renderer__concept-name">
            {{ viewModel.conceptName }}
          </div>
        </div>

        <!-- 背面：概念内容 -->
        <div
          v-else
          class="concept-card-renderer__back"
        >
          <!-- 显示正面内容（灰色） -->
          <div class="concept-card-renderer__front-preview">
            {{ viewModel.conceptName }}
          </div>
          
          <!-- 答案分隔线 -->
          <div class="concept-card-renderer__answer-divider">
            <span>内容</span>
          </div>
          
          <!-- 显示概念内容 -->
          <div
            class="concept-card-renderer__html-content"
            v-html="viewModel.contentHtml"
          ></div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="concept-card-renderer__actions">
        <button
          class="concept-card-renderer__btn concept-card-renderer__btn--secondary"
          @click="jumpToConcept"
        >
          📄 跳转到概念
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { openTab } from 'siyuan';
import { ConceptCardRenderService } from '@/core/card/concept/application/ConceptCardRenderService';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { ConceptCardViewModel } from '@/core/card/concept/application/ConceptCardRenderService';

interface ConceptCardInput {
  xiuyuanID?: string;
}

type OpenTabOptions = Parameters<typeof openTab>[0];
type OpenTabApp = OpenTabOptions['app'];
type SiyuanWindow = Window & {
  siyuan?: {
    ws?: {
      app?: OpenTabApp;
    };
  };
};

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: ConceptCardInput;
  showAnswer?: boolean;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  loaded: [result: { viewModel: ConceptCardViewModel | null }];
  error: [error: Error];
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<ConceptCardViewModel | null>(null);

const renderService = new ConceptCardRenderService();

// 方法
async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;
    
    viewModel.value = await renderService.prepareViewModel(props.blockId, props.card);
    emit('loaded', { viewModel: viewModel.value });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    console.error('[ConceptCardRenderer] Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

function jumpToConcept() {
  if (!viewModel.value) return;
  
  const app = (window as SiyuanWindow).siyuan?.ws?.app;
  if (!app) {
    console.error('[ConceptCardRenderer] App instance not found');
    return;
  }
  
  openTab({
    app,
    doc: {
      id: viewModel.value.conceptBlockId,
      zoomIn: false,
    },
  });
}

onMounted(() => {
  loadViewModel();
});
</script>

<style scoped>
/* 容器 */
.concept-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 内容区域 */
.concept-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

/* 概念卡主体 */
.concept-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

/* 卡片类型徽章 */
.concept-card-renderer__badge {
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

.concept-card-renderer__badge-icon {
  font-size: 16px;
}

/* 正面样式 */
.concept-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  min-height: 200px;
}

.concept-card-renderer__concept-name {
  font-size: 36px;
  font-weight: 700;
  color: var(--b3-theme-primary);
  text-align: center;
  line-height: 1.4;
}

/* 背面样式 */
.concept-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
}

.concept-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 24px;
}

.concept-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.concept-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-card-renderer__answer-divider span {
  padding: 0;
}

.concept-card-renderer__html-content {
  font-size: 16px;
  line-height: 1.8;
  color: var(--b3-theme-on-surface);
}

/* 深色主题适配 */
.concept-card-renderer__html-content :deep(.protyle-wysiwyg) {
  background: transparent;
}

/* 操作按钮 */
.concept-card-renderer__actions {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.concept-card-renderer__btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  outline: none;
}

.concept-card-renderer__btn--secondary {
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-surface);
  border: 1px solid var(--b3-border-color);
}

.concept-card-renderer__btn--secondary:hover {
  background: var(--b3-theme-surface-light);
}
</style>
