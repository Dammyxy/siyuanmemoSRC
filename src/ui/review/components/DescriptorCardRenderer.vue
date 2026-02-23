<template>
  <div class="descriptor-card-renderer">
    <!-- 加载状态 -->
    <CardLoadingState v-if="loading" :text="t('loading', '加载中...')" />

    <!-- 错误状态 -->
    <CardErrorState v-else-if="error" :message="error" />

    <!-- 描述符卡内容 -->
    <div v-else-if="viewModel" class="descriptor-card-renderer__content">
      <!-- 🆕 移除独立面包屑和紫色头部，上下文已融入正文 -->

      <!-- 警告信息 -->
      <div v-if="viewModel.warning" class="descriptor-card-renderer__warning">
        <span class="descriptor-card-renderer__warning-icon">⚠️</span>
        <span class="descriptor-card-renderer__warning-text">{{ viewModel.warning }}</span>
      </div>

      <!-- 描述符卡主体 -->
      <div class="descriptor-card-renderer__main">
        <div class="descriptor-card-renderer__badge">
          <span class="descriptor-card-renderer__badge-icon">📝</span>
          <span class="descriptor-card-renderer__badge-label">描述符卡</span>
        </div>

        <!-- 正面：概念 + 属性名 -->
        <div
          v-if="!showAnswer"
          class="descriptor-card-renderer__html-content descriptor-card-renderer__front"
          v-html="viewModel.frontHtml"
        ></div>

        <!-- 背面：属性值 -->
        <div
          v-else
          class="descriptor-card-renderer__html-content descriptor-card-renderer__back"
          v-html="viewModel.backHtml"
        ></div>
      </div>

      <!-- 同概念的其他描述符（可选） -->
      <div
        v-if="viewModel.siblingDescriptors.length > 0"
        class="descriptor-card-renderer__siblings"
      >
        <div class="descriptor-card-renderer__siblings-title">同概念的其他描述符</div>
        <div class="descriptor-card-renderer__siblings-list">
          <div
            v-for="sibling in viewModel.siblingDescriptors"
            :key="sibling.blockId"
            class="descriptor-card-renderer__sibling-item"
          >
            {{ sibling.attribute }}
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="descriptor-card-renderer__actions">
        <button
          class="descriptor-card-renderer__btn descriptor-card-renderer__btn--secondary"
          @click="rebindConcept"
          :disabled="rebinding"
        >
          🔄 {{ rebinding ? '重新绑定中...' : '重新绑定概念' }}
        </button>
      </div>
    </div>

    <!-- 完整概念模态框 -->
    <div
      v-if="showConceptModal"
      class="descriptor-card-renderer__modal"
      @click="closeConceptModal"
    >
      <div
        class="descriptor-card-renderer__modal-content"
        @click.stop
      >
        <div class="descriptor-card-renderer__modal-header">
          <h2 class="descriptor-card-renderer__modal-title">完整概念</h2>
          <button
            class="descriptor-card-renderer__modal-close"
            @click="closeConceptModal"
          >
            ✕
          </button>
        </div>
        <div
          class="descriptor-card-renderer__modal-body"
          v-html="viewModel?.parentConcept?.html || ''"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { openTab } from 'siyuan';
import CardLoadingState from '@/core/card/common/ui/CardLoadingState.vue';
import CardErrorState from '@/core/card/common/ui/CardErrorState.vue';
import type { DescriptorCardViewModel } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: any; // 🆕 FSRSCard，用于获取 frontBlockIDs
  renderService: DescriptorCardRenderService;
  showAnswer?: boolean; // 是否显示答案（背面）
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: DescriptorCardViewModel): void;
  (e: 'error', error: Error): void;
}>();

// 状态
const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<DescriptorCardViewModel | null>(null);
const showConceptModal = ref(false);
const rebinding = ref(false);

// 方法
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

async function loadViewModel() {
  try {
    loading.value = true;
    error.value = null;

    // 🆕 传递 FSRSCard 给 renderService
    const vm = await props.renderService.prepareViewModel(props.blockId, props.card);
    if (!vm) {
      throw new Error('Failed to load descriptor card');
    }

    viewModel.value = vm;
    emit('loaded', vm);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    console.error('[DescriptorCardRenderer] Failed to load view model:', err);
  } finally {
    loading.value = false;
  }
}

function expandConcept() {
  showConceptModal.value = true;
}

function closeConceptModal() {
  showConceptModal.value = false;
}

function jumpToConcept() {
  if (!viewModel.value?.parentConcept) {
    return;
  }

  const app = (window as any).siyuan?.ws?.app;
  if (!app) {
    console.error('[DescriptorCardRenderer] App instance not found');
    return;
  }

  openTab({
    app,
    doc: { id: viewModel.value.parentConcept.blockId },
  });
}

async function rebindConcept() {
  if (rebinding.value) return;
  
  try {
    rebinding.value = true;
    
    // 动态导入重新绑定用例
    const { RebindDescriptorConceptUseCase } = await import('@/application/usecases/xiuyuan/RebindDescriptorConceptUseCase');
    const { ApplicationContext } = await import('@/application/ApplicationContext');
    
    const appContext = ApplicationContext.getInstance();
    const xiuyuanRepo = appContext.getXiuyuanRepository();
    const templateRegistry = appContext.getTemplateRegistry();
    
    const useCase = new RebindDescriptorConceptUseCase(xiuyuanRepo, templateRegistry);
    
    const result = await useCase.execute({
      descriptorBlockId: props.blockId,
    });
    
    if (result.ok) {
      const { pushMsg } = await import('@/core/siyuan/api');
      await pushMsg(`✅ 已重新绑定到概念：${result.value.newConceptName}`);
      
      // 重新加载视图模型
      await loadViewModel();
    } else {
      const { pushErrMsg } = await import('@/core/siyuan/api');
      await pushErrMsg(`❌ 重新绑定失败：${result.error.message}`);
    }
  } catch (err) {
    console.error('[DescriptorCardRenderer] Failed to rebind concept:', err);
    const { pushErrMsg } = await import('@/core/siyuan/api');
    await pushErrMsg(`❌ 重新绑定失败：${(err as Error).message}`);
  } finally {
    rebinding.value = false;
  }
}

// 生命周期
onMounted(async () => {
  await loadViewModel();
});
</script>

<style>
/* 容器 */
.descriptor-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 内容区域 */
.descriptor-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

/* 父概念上下文栏 */
.descriptor-card-renderer__parent-concept {
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.descriptor-card-renderer__parent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  opacity: 0.9;
}

.descriptor-card-renderer__parent-icon {
  font-size: 18px;
}

.descriptor-card-renderer__parent-content {
  margin-bottom: 12px;
}

.descriptor-card-renderer__parent-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.descriptor-card-renderer__parent-preview {
  font-size: 14px;
  opacity: 0.9;
  margin: 0;
  line-height: 1.6;
}

.descriptor-card-renderer__parent-actions {
  display: flex;
  gap: 8px;
}

.descriptor-card-renderer__btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.descriptor-card-renderer__btn--secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.descriptor-card-renderer__btn--secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 警告信息 */
.descriptor-card-renderer__warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--b3-theme-error-lighter);
  color: var(--b3-theme-error);
  border-left: 4px solid var(--b3-theme-error);
}

.descriptor-card-renderer__warning-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.descriptor-card-renderer__warning-text {
  font-size: 14px;
}

/* 描述符卡主体 */
.descriptor-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.descriptor-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.descriptor-card-renderer__badge-icon {
  font-size: 16px;
}

.descriptor-card-renderer__html-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 正面样式 */
.descriptor-card-renderer__front {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

/* 使用深度选择器确保样式生效 */
.descriptor-card-renderer__front :deep(.descriptor-card-front__concept),
.descriptor-card-front__concept {
  font-size: 24px !important;
  font-weight: 600 !important;
  color: var(--b3-theme-primary) !important;
  margin-bottom: 4px !important;
  line-height: 1.4 !important;
}

.descriptor-card-renderer__front :deep(.descriptor-card-front__divider),
.descriptor-card-front__divider {
  font-size: 24px !important;
  color: var(--b3-theme-on-surface-light) !important;
  margin-bottom: 4px !important;
  line-height: 1.4 !important;
}

.descriptor-card-renderer__front :deep(.descriptor-card-front__attribute),
.descriptor-card-front__attribute {
  font-size: 24px !important;
  font-weight: 700 !important;
  color: var(--b3-theme-on-surface) !important;
  line-height: 1.4 !important;
}

/* 背面样式 */
.descriptor-card-renderer__back {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

.descriptor-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 24px;
  margin-bottom: 24px;
}

.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__concept),
.descriptor-card-renderer__front-preview .descriptor-card-front__concept,
.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__attribute),
.descriptor-card-renderer__front-preview .descriptor-card-front__attribute,
.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__divider),
.descriptor-card-renderer__front-preview .descriptor-card-front__divider {
  font-size: 24px !important;
  margin-bottom: 2px !important;
}

.descriptor-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.descriptor-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.descriptor-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.descriptor-card-renderer__answer-divider span {
  padding: 0;
}

.descriptor-card-renderer__back :deep(.descriptor-card-back__value),
.descriptor-card-back__value {
  font-size: 24px !important;
  line-height: 1.6 !important;
  color: var(--b3-theme-on-surface) !important;
}

/* 覆盖 Lute 渲染的默认样式 */
.descriptor-card-renderer__back :deep(.descriptor-card-back__value *),
.descriptor-card-back__value * {
  font-size: 24px !important;
  line-height: 1.6 !important;
}

/* 同概念的其他描述符 */
.descriptor-card-renderer__siblings {
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.descriptor-card-renderer__siblings-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
}

.descriptor-card-renderer__siblings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.descriptor-card-renderer__sibling-item {
  padding: 4px 12px;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

/* 模态框 */
.descriptor-card-renderer__modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.descriptor-card-renderer__modal-content {
  background: var(--b3-theme-background);
  border-radius: 12px;
  max-width: 800px;
  max-height: 80vh;
  width: 90%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.descriptor-card-renderer__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--b3-border-color);
}

.descriptor-card-renderer__modal-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.descriptor-card-renderer__modal-close:hover {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 容器 */
.descriptor-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 加载状态 */
.descriptor-card-renderer__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.descriptor-card-renderer__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--b3-border-color);
  border-top-color: var(--b3-theme-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.descriptor-card-renderer__loading-text {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}

/* 错误状态 */
.descriptor-card-renderer__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.descriptor-card-renderer__error-icon {
  font-size: 48px;
}

.descriptor-card-renderer__error-text {
  font-size: 14px;
  color: var(--b3-theme-error);
  text-align: center;
}

/* 内容区域 */
.descriptor-card-renderer__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

/* 父概念上下文栏 */
.descriptor-card-renderer__parent-concept {
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.descriptor-card-renderer__parent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  opacity: 0.9;
}

.descriptor-card-renderer__parent-icon {
  font-size: 18px;
}

.descriptor-card-renderer__parent-content {
  margin-bottom: 12px;
}

.descriptor-card-renderer__parent-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.descriptor-card-renderer__parent-preview {
  font-size: 14px;
  opacity: 0.9;
  margin: 0;
  line-height: 1.6;
}

.descriptor-card-renderer__parent-actions {
  display: flex;
  gap: 8px;
}

.descriptor-card-renderer__btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.descriptor-card-renderer__btn--secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.descriptor-card-renderer__btn--secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 警告信息 */
.descriptor-card-renderer__warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--b3-theme-error-lighter);
  color: var(--b3-theme-error);
  border-left: 4px solid var(--b3-theme-error);
}

.descriptor-card-renderer__warning-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.descriptor-card-renderer__warning-text {
  font-size: 14px;
}

/* 描述符卡主体 */
.descriptor-card-renderer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.descriptor-card-renderer__badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  align-self: flex-start;
}

.descriptor-card-renderer__badge-icon {
  font-size: 16px;
}

.descriptor-card-renderer__html-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 正面样式 */
.descriptor-card-renderer__front {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

.descriptor-card-front__concept {
  font-size: 32px !important;
  font-weight: 600;
  color: var(--b3-theme-primary);
  margin-bottom: 4px;
  line-height: 1.4;
}

.descriptor-card-front__divider {
  font-size: 32px !important;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 4px;
  line-height: 1.4;
}

.descriptor-card-front__attribute {
  font-size: 32px !important;
  font-weight: 700;
  color: var(--b3-theme-on-surface);
  line-height: 1.4;
}

/* 背面样式 */
.descriptor-card-renderer__back {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px 32px;
  min-height: 200px;
}

.descriptor-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  margin-bottom: 24px;
}

.descriptor-card-renderer__front-preview .descriptor-card-front__concept,
.descriptor-card-renderer__front-preview .descriptor-card-front__attribute,
.descriptor-card-renderer__front-preview .descriptor-card-front__divider {
  font-size: 24px !important;
  margin-bottom: 2px;
}

.descriptor-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.descriptor-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.descriptor-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.descriptor-card-renderer__answer-divider span {
  padding: 0;
}

.descriptor-card-back__value {
  font-size: 32px !important;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 覆盖 Lute 渲染的默认样式 */
.descriptor-card-back__value * {
  font-size: 32px !important;
  line-height: 1.6 !important;
}

/* 同概念的其他描述符 */
.descriptor-card-renderer__siblings {
  padding: 16px;
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.descriptor-card-renderer__siblings-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 8px;
}

.descriptor-card-renderer__siblings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.descriptor-card-renderer__sibling-item {
  padding: 4px 12px;
  background: var(--b3-theme-background);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

/* 模态框 */
.descriptor-card-renderer__modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.descriptor-card-renderer__modal-content {
  background: var(--b3-theme-background);
  border-radius: 12px;
  max-width: 800px;
  max-height: 80vh;
  width: 90%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.descriptor-card-renderer__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--b3-border-color);
}

.descriptor-card-renderer__modal-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-surface-light);
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.descriptor-card-renderer__modal-close:hover {
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
}

.descriptor-card-renderer__modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}
</style>


/* 🆕 RemNote 风格的概念上下文 */
.descriptor-card-context {
  margin-bottom: 16px;
  border-left: 2px solid var(--b3-border-color);
}

.descriptor-card-context__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 4px 12px;
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
  line-height: 1.6;
}

.descriptor-card-context__item--current {
  color: var(--b3-theme-on-surface);
  font-weight: 500;
}

/* 🆕 路径块样式（文档块等） */
.descriptor-card-context__item--path {
  opacity: 0.5;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.descriptor-card-context__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.descriptor-card-context__name {
  flex: 1;
}

/* 🆕 组合问题样式 */
.descriptor-card-question {
  display: block;
  padding: 16px;
  font-size: 32px;
  line-height: 1.5;
  color: var(--b3-theme-on-surface);
  white-space: nowrap;
}

.descriptor-card-question__concept,
.descriptor-card-question__connector,
.descriptor-card-question__attribute,
.descriptor-card-question__mark {
  display: inline;
}

.descriptor-card-question__concept {
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.descriptor-card-question__connector {
  color: var(--b3-theme-on-surface-light);
}

.descriptor-card-question__attribute {
  font-weight: 700;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-question__mark {
  color: var(--b3-theme-on-surface-light);
}

/* 🆕 正面当前项样式 */
.descriptor-card-front__current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  border-left: 3px solid var(--b3-theme-primary);
}

.descriptor-card-front__icon {
  font-size: 18px;
  flex-shrink: 0;
}

.descriptor-card-front__attribute {
  font-size: 18px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.descriptor-card-front__arrow {
  font-size: 18px;
  color: var(--b3-theme-on-surface-light);
}

/* 🆕 背面答案值样式 */
.descriptor-card-back__value {
  font-size: 20px;
  color: var(--b3-theme-on-surface);
  line-height: 1.6;
  padding: 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  border-left: 3px solid var(--b3-theme-success);
}
