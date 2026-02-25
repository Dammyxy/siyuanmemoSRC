<template>
  <div class="xiuyuan-list-template-card">
    <!-- 面包屑 - 使用浏览器预览区样式 -->
    <div v-if="breadcrumbs.length > 0" class="preview__breadcrumb">
      <div 
        v-for="(item, index) in breadcrumbs" 
        :key="item.id"
        class="breadcrumb__item"
        :style="{ paddingLeft: `${index * 16 + 8}px` }"
      >
        <span class="breadcrumb__text">
          <svg class="breadcrumb__icon"><use :xlink:href="item.type === 'NodeDocument' ? '#iconFile' : '#iconALIGN'"></use></svg>
          {{ item.name || '...' }}
        </span>
      </div>
    </div>
    
    <!-- 问题部分 -->
    <div class="xiuyuan-question" v-html="questionHtml"></div>
    
    <!-- 已学过的答案 -->
    <div v-if="meta.currentIndex && meta.currentIndex > 0" class="xiuyuan-previous-answers">
      <div 
        v-for="(child, index) in previousChildren" 
        :key="child.id"
        class="xiuyuan-answer-item xiuyuan-answer-learned"
      >
        <span class="xiuyuan-answer-marker">✓</span>
        <span class="xiuyuan-answer-index">{{ index + 1 }}.</span>
        <span class="xiuyuan-answer-text">{{ child.answer }}</span>
      </div>
    </div>
    
    <!-- 当前提示（正面）或答案（背面） -->
    <div class="xiuyuan-current-item">
      <!-- 正面：显示提示 -->
      <div v-if="!showAnswer" class="xiuyuan-current-cue">
        <span class="xiuyuan-cue-marker">?</span>
        <span class="xiuyuan-cue-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <span class="xiuyuan-cue-text">{{ meta.cue || '...' }}</span>
      </div>
      
      <!-- 背面：显示答案 -->
      <div v-else class="xiuyuan-current-answer">
        <span class="xiuyuan-answer-marker">✓</span>
        <span class="xiuyuan-answer-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <span class="xiuyuan-answer-text">{{ meta.answer }}</span>
      </div>
    </div>
    
    <!-- 剩余提示 -->
    <div v-if="showAnswer && hasRemaining" class="xiuyuan-remaining-hint">
      还有 {{ remainingCount }} 个答案未学习
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import { createLogger } from '@/utils/logger';

const props = defineProps<{
  meta: XiuyuanCardMeta;
  showAnswer: boolean;
  questionBlockId: string;
  plugin?: any;
}>();

const logger = createLogger('XiuyuanListTemplateCard');

const questionHtml = ref('');
const breadcrumbs = ref<Array<{ id: string; name: string; type: string }>>([]);

function getSiyuanApi() {
  return props.plugin?.getContext?.()?.getReviewService?.()?.getSiyuanApi?.();
}

// 已学过的子项
const previousChildren = computed(() => {
  if (!props.meta.allChildren || !props.meta.currentIndex) {
    return [];
  }
  return props.meta.allChildren.slice(0, props.meta.currentIndex);
});

// 是否还有未学习的
const hasRemaining = computed(() => {
  if (!props.meta.allChildren || props.meta.currentIndex === undefined) {
    return false;
  }
  return props.meta.currentIndex < props.meta.allChildren.length - 1;
});

// 剩余数量
const remainingCount = computed(() => {
  if (!props.meta.allChildren || props.meta.currentIndex === undefined) {
    return 0;
  }
  return props.meta.allChildren.length - props.meta.currentIndex - 1;
});

// 加载问题块的 HTML 和面包屑
onMounted(async () => {
  try {
    const siyuanApi = getSiyuanApi();
    if (!siyuanApi) {
      throw new Error('Environment not initialized');
    }

    // 加载问题块 HTML
    const result = await siyuanApi.getBlockDOM(props.questionBlockId);
    questionHtml.value = result?.dom || '';
    
    // 加载面包屑
    const breadcrumbResult = await siyuanApi.getBlockBreadcrumb(props.questionBlockId);
    
    if (breadcrumbResult && Array.isArray(breadcrumbResult)) {
      // 排除最后两项：
      // - 最后一项：段落块（questionBlockId 本身）
      // - 倒数第二项：列表项块（问题标题，会在正文中显示）
      const parentBreadcrumbs = breadcrumbResult.slice(0, -2);
      
      const allBreadcrumbs = parentBreadcrumbs.map((item: any) => ({
        id: item.id || '',
        name: item.name || '',
        type: item.type || 'NodeParagraph',
      }));
      
      // 🔧 去重：使用 Map 按标准化后的 name 去重
      const dedupMap = new Map<string, { id: string; name: string; type: string }>();
      
      for (const item of allBreadcrumbs) {
        // 标准化文本：去掉列表符号
        const normalizedName = item.name.replace(/^[•\-\d]+\.?\s*/, '').trim();
        
        // 使用标准化后的 name 作为 key 和 value，这样相同内容的会覆盖
        dedupMap.set(normalizedName, {
          id: item.id,
          name: normalizedName, // 使用标准化后的名称
          type: item.type,
        });
      }
      
      // 转换回数组
      breadcrumbs.value = Array.from(dedupMap.values());
    }
  } catch (err) {
    logger.error('[XiuyuanListTemplateCard] Failed to load question block:', err);
    questionHtml.value = '<div class="ft__error">加载失败</div>';
  }
});
</script>

<style scoped>
.xiuyuan-list-template-card {
  padding: 16px;
}

/* 垂直面包屑样式 - 复用浏览器预览区样式 */
.preview__breadcrumb {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  margin-bottom: 0;
  background: transparent;
}

.breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--b3-theme-on-surface);
  line-height: 1.6;
  position: relative;
  border-radius: 4px;
}

.breadcrumb__item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary);
  background-color: var(--b3-list-hover);
}

.breadcrumb__text {
  display: flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--b3-font-family);
  opacity: 0.86;
  flex: 1;
  min-width: 0;
}

.breadcrumb__icon {
  width: 12px;
  height: 12px;
  margin-right: 6px;
  opacity: 0.6;
  fill: var(--b3-theme-on-surface);
}

.xiuyuan-question {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--b3-theme-primary);
}

.xiuyuan-previous-answers {
  margin-bottom: 12px;
}

.xiuyuan-answer-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  gap: 8px;
}

.xiuyuan-answer-learned {
  opacity: 0.6;
  color: var(--b3-theme-on-surface-light);
}

.xiuyuan-answer-marker {
  color: var(--b3-theme-success);
  font-weight: bold;
  flex-shrink: 0;
}

.xiuyuan-answer-index {
  flex-shrink: 0;
  font-weight: 500;
}

.xiuyuan-answer-text {
  flex: 1;
}

.xiuyuan-current-item {
  margin-top: 12px;
}

.xiuyuan-current-cue {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  gap: 8px;
  background: var(--b3-theme-primary-lightest);
  border-left: 4px solid var(--b3-theme-primary);
  border-radius: 4px;
}

.xiuyuan-cue-marker {
  color: var(--b3-theme-primary);
  font-weight: bold;
  font-size: 20px;
  flex-shrink: 0;
}

.xiuyuan-cue-index {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.xiuyuan-cue-text {
  flex: 1;
  font-weight: 500;
  color: var(--b3-theme-on-primary-container);
}

.xiuyuan-current-answer {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  gap: 8px;
  background: var(--b3-theme-success-lightest);
  border-left: 4px solid var(--b3-theme-success);
  border-radius: 4px;
}

.xiuyuan-remaining-hint {
  margin-top: 16px;
  padding: 8px 12px;
  background: var(--b3-theme-background-light);
  border-radius: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  text-align: center;
}
</style>
