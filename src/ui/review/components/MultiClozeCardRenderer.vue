<template>
  <div class="multi-cloze-card-renderer">
    <!-- 正面：显示问题 -->
    <div v-if="!showAnswer" class="multi-cloze-card-renderer__front">
      <div class="multi-cloze-card-renderer__question" v-html="questionHtml"></div>
    </div>

    <!-- 背面：显示答案 -->
    <div v-else class="multi-cloze-card-renderer__back">
      <!-- 显示正面内容（灰色，左对齐） -->
      <div class="multi-cloze-card-renderer__front-preview" v-html="questionHtml"></div>
      
      <!-- 答案分隔线 -->
      <div class="multi-cloze-card-renderer__answer-divider">
        <span>答案</span>
      </div>
      
      <!-- 显示答案（左对齐） -->
      <div class="multi-cloze-card-renderer__answer" v-html="answerHtml"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  card: any; // FSRSCard，包含 meta.faces 和 meta.faceIndex
  showAnswer?: boolean;
}>();

/**
 * 获取当前卡片的 face
 */
const currentFace = computed(() => {
  const faces = props.card?.meta?.faces || [];
  const faceIndex = props.card?.meta?.faceIndex ?? 0;
  return faces[faceIndex] || { question: '', answer: '' };
});

/**
 * 问题 HTML
 */
const questionHtml = computed(() => {
  return currentFace.value.question || '';
});

/**
 * 答案 HTML
 */
const answerHtml = computed(() => {
  return currentFace.value.answer || '';
});
</script>

<style scoped>
.multi-cloze-card-renderer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
}

/* 正面样式 - 与背面保持相同位置 */
.multi-cloze-card-renderer__front {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 48px 32px;
  min-height: 200px;
}

.multi-cloze-card-renderer__question {
  font-size: 24px;
  line-height: 1.6;
  text-align: left;
  color: var(--b3-theme-on-surface);
  width: 100%;
}

/* 背面样式 - 视线自然向下流动 */
.multi-cloze-card-renderer__back {
  flex: 1;
  padding: 48px 32px 32px;
  display: flex;
  flex-direction: column;
}

/* 正面预览 - 缩小灰显在顶部 */
.multi-cloze-card-renderer__front-preview {
  opacity: 0.4;
  font-size: 16px;
  line-height: 1.5;
  margin-bottom: 20px;
  text-align: left;
}

/* 答案分隔线 - 视觉引导 */
.multi-cloze-card-renderer__answer-divider {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 16px 0 24px 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  font-weight: 500;
}

.multi-cloze-card-renderer__answer-divider::before {
  content: '';
  width: 60px;
  height: 1px;
  background: var(--b3-border-color);
  margin-right: 12px;
}

.multi-cloze-card-renderer__answer-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--b3-border-color);
  margin-left: 12px;
}

/* 答案 - 左对齐,与正面保持相同位置 */
.multi-cloze-card-renderer__answer {
  font-size: 24px;
  line-height: 1.6;
  color: var(--b3-theme-on-surface);
  text-align: left;
  width: 100%;
}

/* 挖空占位符样式 */
.multi-cloze-card-renderer__question :deep(mark),
.multi-cloze-card-renderer__answer :deep(mark) {
  background-color: var(--b3-theme-primary-lightest, #e3f2fd);
  color: var(--b3-theme-on-surface);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

/* 响应式设计 */
@media screen and (max-width: 768px) {
  .multi-cloze-card-renderer__front,
  .multi-cloze-card-renderer__back {
    padding: 32px 24px;
  }
  
  .multi-cloze-card-renderer__question,
  .multi-cloze-card-renderer__answer {
    font-size: 20px;
  }
  
  .multi-cloze-card-renderer__front-preview {
    font-size: 14px;
  }
}
</style>
