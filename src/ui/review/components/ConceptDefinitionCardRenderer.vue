<template>
  <div class="concept-definition-card-renderer">
    <!-- 加载状态 -->
    <div v-if="loading" class="concept-definition-card-renderer__loading">
      <div class="concept-definition-card-renderer__spinner"></div>
      <div class="concept-definition-card-renderer__loading-text">{{ t('loading', '加载中...') }}</div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="concept-definition-card-renderer__error">
      <div class="concept-definition-card-renderer__error-icon">⚠️</div>
      <div class="concept-definition-card-renderer__error-text">{{ error }}</div>
    </div>

    <!-- 概念定义卡内容 -->
    <div v-else-if="viewModel" class="concept-definition-card-renderer__content">
      <!-- 卡片类型徽章 -->
      <div class="concept-definition-card-renderer__badge">
        <span class="concept-definition-card-renderer__badge-icon">📚</span>
        <span class="concept-definition-card-renderer__badge-label">概念定义</span>
      </div>

      <!-- 正面：概念的定义？ -->
      <div
        v-if="!showAnswer"
        class="concept-definition-card-renderer__front"
      >
        <div class="concept-definition-card-renderer__question">
          <span class="concept-definition-card-renderer__concept-name">{{ viewModel.conceptName }}</span>
          <span class="concept-definition-card-renderer__question-text">的定义？</span>
        </div>
      </div>

      <!-- 背面：显示定义，隐藏当前挖空 -->
      <div
        v-else
        class="concept-definition-card-renderer__back"
      >
        <!-- 显示正面内容（灰色） -->
        <div class="concept-definition-card-renderer__front-preview">
          <span class="concept-definition-card-renderer__concept-name">{{ viewModel.conceptName }}</span>
          <span class="concept-definition-card-renderer__question-text">的定义？</span>
        </div>
        
        <!-- 答案分隔线 -->
        <div class="concept-definition-card-renderer__answer-divider">
          <span>答案</span>
        </div>
        
        <!-- 显示定义内容（隐藏当前挖空） -->
        <div
          class="concept-definition-card-renderer__definition"
          v-html="viewModel.definitionHtml"
        ></div>
      </div>

      <!-- 跳转到概念按钮 -->
      <div class="concept-definition-card-renderer__actions">
        <button
          class="concept-definition-card-renderer__btn concept-definition-card-renderer__btn--secondary"
          @click="jumpToConcept"
        >
          跳转到概念
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { openTab } from 'siyuan';
import { getBlockKramdown, sql } from '@/core/siyuan/api';

const props = defineProps<{
  blockId: string;
  cardId?: string;
  card?: any; // FSRSCard，包含 xiuyuanID 和 ruleIndex
  showAnswer?: boolean;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'loaded', viewModel: any): void;
  (e: 'error', error: Error): void;
}>();

// 状态
const loading = ref(true);
const error = ref<string | null>(null);
const viewModel = ref<{
  conceptName: string;
  conceptBlockId: string;
  definitionHtml: string;
  clozeIndex?: number;
  totalClozes?: number;
} | null>(null);

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

    console.log('[ConceptDefinitionCardRenderer] Loading view model:', {
      blockId: props.blockId,
      cardId: props.cardId,
      card: props.card
    });

    // 1. 获取 Xiuyuan 信息
    const xiuyuanID = props.card?.meta?.xiuyuanID;
    if (!xiuyuanID) {
      throw new Error('No xiuyuanID found in card meta');
    }

    // 2. 从 Xiuyuan 存储中获取字段映射
    const xiuyuanStorage = (window as any).siyuan?.ws?.app?.plugins?.find(
      (p: any) => p.name === 'siyuan-plugin-siyuanmemo'
    )?.xiuyuanService;

    if (!xiuyuanStorage) {
      throw new Error('XiuyuanService not found');
    }

    const xiuyuan = xiuyuanStorage.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    console.log('[ConceptDefinitionCardRenderer] Xiuyuan:', xiuyuan);

    // 3. 获取概念块 ID 和定义块 ID
    const conceptBlockId = xiuyuan.fieldMapping.concept;
    const definitionBlockId = xiuyuan.fieldMapping.definition;

    if (!conceptBlockId || !definitionBlockId) {
      throw new Error('Missing concept or definition block ID in field mapping');
    }

    // 4. 获取概念名称（文档块标题）
    const conceptQuery = `SELECT content FROM blocks WHERE id = '${conceptBlockId}' LIMIT 1`;
    const conceptResult = await sql(conceptQuery);
    
    if (!conceptResult || conceptResult.length === 0) {
      throw new Error(`Concept block not found: ${conceptBlockId}`);
    }

    const conceptName = conceptResult[0].content;

    // 5. 获取定义内容
    const { kramdown: definitionKramdown } = await getBlockKramdown(definitionBlockId);
    if (!definitionKramdown) {
      throw new Error(`Definition block has no content: ${definitionBlockId}`);
    }

    // 6. 解析定义中的挖空
    const clozePattern = /==(.+?)==|\{\{(.+?)\}\}/g;
    const clozes: Array<{ text: string; start: number; end: number }> = [];
    let match;
    
    while ((match = clozePattern.exec(definitionKramdown)) !== null) {
      clozes.push({
        text: match[1] || match[2],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    console.log('[ConceptDefinitionCardRenderer] Found clozes:', clozes.length);

    // 7. 确定当前挖空索引
    let clozeIndex = 0;
    const typeMarker = props.card?.meta?.typeMarker;
    if (typeMarker && typeMarker.startsWith('concept-definition-cloze-')) {
      clozeIndex = parseInt(typeMarker.replace('concept-definition-cloze-', ''));
    }

    console.log('[ConceptDefinitionCardRenderer] Current cloze index:', clozeIndex);

    // 8. 生成定义 HTML（隐藏当前挖空）
    let processedKramdown = definitionKramdown;
    
    if (clozes.length > 0 && clozeIndex < clozes.length) {
      // 有挖空：隐藏当前挖空
      const currentCloze = clozes[clozeIndex];
      
      // 从后往前替换，避免索引偏移
      const sortedClozes = [...clozes].sort((a, b) => b.start - a.start);
      
      for (let i = 0; i < sortedClozes.length; i++) {
        const cloze = sortedClozes[i];
        const before = processedKramdown.substring(0, cloze.start);
        const after = processedKramdown.substring(cloze.end);
        
        if (cloze.start === currentCloze.start) {
          // 当前挖空：替换为 [___]
          processedKramdown = before + '[___]' + after;
        } else {
          // 其他挖空：显示原文
          processedKramdown = before + cloze.text + after;
        }
      }
    }

    // 9. 使用 Lute 渲染 Markdown
    // 从全局获取 Lute 实例
    const lute = (window as any).Lute?.New?.();
    if (!lute) {
      throw new Error('Lute not available');
    }
    const definitionHtml = lute.Md2BlockDOM(processedKramdown);

    // 10. 构建视图模型
    viewModel.value = {
      conceptName,
      conceptBlockId,
      definitionHtml,
      clozeIndex: clozes.length > 0 ? clozeIndex : undefined,
      totalClozes: clozes.length > 0 ? clozes.length : undefined
    };

    emit('loaded', viewModel.value);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error.value = errorMessage;
    emit('error', err instanceof Error ? err : new Error(errorMessage));
    console.error('[ConceptDefinitionCardRenderer] Failed to load view model:', err);
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
    console.error('[ConceptDefinitionCardRenderer] App instance not found');
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

/* 加载状态 */
.concept-definition-card-renderer__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.concept-definition-card-renderer__spinner {
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

.concept-definition-card-renderer__loading-text {
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}

/* 错误状态 */
.concept-definition-card-renderer__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
}

.concept-definition-card-renderer__error-icon {
  font-size: 48px;
}

.concept-definition-card-renderer__error-text {
  font-size: 14px;
  color: var(--b3-theme-error);
  text-align: center;
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

/* 正面样式 */
.concept-definition-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  min-height: 200px;
}

.concept-definition-card-renderer__question {
  font-size: 28px;
  line-height: 1.4;
  text-align: center;
}

.concept-definition-card-renderer__concept-name {
  font-weight: 700;
  color: var(--b3-theme-primary);
}

.concept-definition-card-renderer__question-text {
  color: var(--b3-theme-on-surface);
}

/* 背面样式 */
.concept-definition-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
}

.concept-definition-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  margin-bottom: 24px;
  text-align: center;
}

.concept-definition-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.concept-definition-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.concept-definition-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

.concept-definition-card-renderer__definition {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
}

/* 覆盖 Lute 渲染的默认样式 */
.concept-definition-card-renderer__definition :deep(*) {
  font-size: 24px !important;
  line-height: 1.6 !important;
}

/* 挖空占位符样式 */
.concept-definition-card-renderer__definition :deep([___]) {
  display: inline-block;
  min-width: 60px;
  padding: 0 8px;
  background: var(--b3-theme-surface);
  border: 2px dashed var(--b3-theme-primary);
  border-radius: 4px;
  color: transparent;
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
