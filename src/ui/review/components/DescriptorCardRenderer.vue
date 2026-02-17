<template>
  <div class="descriptor-card-renderer">
    <!-- 加载状态 -->
    <div v-if="loading" class="descriptor-card-renderer__loading">
      <div class="descriptor-card-renderer__spinner"></div>
      <div class="descriptor-card-renderer__loading-text">{{ t('loading', '加载中...') }}</div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="descriptor-card-renderer__error">
      <div class="descriptor-card-renderer__error-icon">⚠️</div>
      <div class="descriptor-card-renderer__error-text">{{ error }}</div>
    </div>

    <!-- 描述符卡内容 -->
    <div v-else-if="viewModel" class="descriptor-card-renderer__content">
      <!-- 父概念上下文栏（始终显示） -->
      <div v-if="viewModel.parentConcept" class="descriptor-card-renderer__parent-concept">
        <div class="descriptor-card-renderer__parent-header">
          <span class="descriptor-card-renderer__parent-icon">🧠</span>
          <span class="descriptor-card-renderer__parent-label">关于概念</span>
        </div>
        <div class="descriptor-card-renderer__parent-content">
          <h3 class="descriptor-card-renderer__parent-title">{{ viewModel.parentConcept.title }}</h3>
        </div>
        <div class="descriptor-card-renderer__parent-actions">
          <button
            class="descriptor-card-renderer__btn descriptor-card-renderer__btn--secondary"
            @click="expandConcept"
          >
            详情
          </button>
          <button
            v-if="viewModel.parentConcept.isConceptCard"
            class="descriptor-card-renderer__btn descriptor-card-renderer__btn--secondary"
            @click="jumpToConcept"
          >
            跳转
          </button>
        </div>
      </div>

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
        >
          <!-- 显示正面内容（灰色） -->
          <div
            class="descriptor-card-renderer__front-preview"
            v-html="viewModel.frontHtml"
          ></div>
          
          <!-- 答案分隔线 -->
          <div class="descriptor-card-renderer__answer-divider">
            <span>答案</span>
          </div>
          
          <!-- 显示背面内容 -->
          <div v-html="viewModel.backHtml"></div>
        </div>
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
import type { DescriptorCardViewModel } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import type { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: any; // 🆕 FSRSCard，用于获取 fieldMapping
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
  margin-bottom: 4px !important;
  line-height: 1.4 !important;
}

.descriptor-card-renderer__front :deep(.descriptor-card-front__question),
.descriptor-card-front__question {
  font-size: 24px !important;
  color: var(--b3-theme-on-surface-light) !important;
  line-height: 1.4 !important;
}

/* 背面样式 */
.descriptor-card-renderer__back {
  padding: 48px 32px 32px;
}

.descriptor-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  margin-bottom: 24px;
}

.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__concept),
.descriptor-card-renderer__front-preview .descriptor-card-front__concept,
.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__attribute),
.descriptor-card-renderer__front-preview .descriptor-card-front__attribute {
  font-size: 16px !important;
  margin-bottom: 2px !important;
}

.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__divider),
.descriptor-card-renderer__front-preview .descriptor-card-front__divider,
.descriptor-card-renderer__front-preview :deep(.descriptor-card-front__question),
.descriptor-card-renderer__front-preview .descriptor-card-front__question {
  font-size: 16px !important;
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
  margin-bottom: 4px;
  line-height: 1.4;
}

.descriptor-card-front__question {
  font-size: 32px !important;
  color: var(--b3-theme-on-surface-light);
  line-height: 1.4;
}

/* 背面样式 */
.descriptor-card-renderer__back {
  padding: 48px 32px 32px;
}

.descriptor-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  margin-bottom: 24px;
}

.descriptor-card-renderer__front-preview .descriptor-card-front__concept,
.descriptor-card-renderer__front-preview .descriptor-card-front__attribute {
  font-size: 16px !important;
  margin-bottom: 2px;
}

.descriptor-card-renderer__front-preview .descriptor-card-front__divider,
.descriptor-card-renderer__front-preview .descriptor-card-front__question {
  font-size: 16px !important;
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
