<template>
  <div class="xiuyuan-list-template-card">
    <CardBreadcrumb
      v-if="breadcrumbs.length > 0"
      :items="breadcrumbs"
      variant="preview"
    />

    <div class="xiuyuan-question" v-html="questionHtml"></div>

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

    <div class="xiuyuan-current-item">
      <div v-if="!showAnswer && hasCue" class="xiuyuan-current-cue">
        <span class="xiuyuan-cue-marker">?</span>
        <span class="xiuyuan-cue-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <span class="xiuyuan-cue-text">{{ meta.cue }}</span>
      </div>

      <div v-else class="xiuyuan-current-answer">
        <span class="xiuyuan-answer-marker">✓</span>
        <span class="xiuyuan-answer-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <span class="xiuyuan-answer-text">{{ meta.answer }}</span>
      </div>
    </div>

    <div v-if="showAnswer && hasRemaining" class="xiuyuan-remaining-hint">
      还有 {{ remainingCount }} 个答案未学习
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { BreadcrumbItem } from '@/core/card/common/application/types';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import { loadBreadcrumbTrail } from '@/ui/review/shared/loadBreadcrumbTrail';
import { createLogger } from '@/utils/logger';

type SiyuanApiLike = {
  getBlockDOM: (blockId: string) => Promise<{ dom?: string } | null | undefined>;
};

type ReviewServiceLike = {
  getSiyuanApi?: () => SiyuanApiLike | undefined;
};

type PluginContextLike = {
  getReviewService?: () => ReviewServiceLike | undefined;
};

type XiuyuanTemplatePluginLike = {
  getContext?: () => PluginContextLike | undefined;
};

const props = defineProps<{
  meta: XiuyuanCardMeta;
  showAnswer: boolean;
  questionBlockId: string;
  plugin?: XiuyuanTemplatePluginLike;
}>();

const logger = createLogger('XiuyuanListTemplateCard');

const questionHtml = ref('');
const breadcrumbs = ref<BreadcrumbItem[]>([]);

function getSiyuanApi() {
  return props.plugin?.getContext?.()?.getReviewService?.()?.getSiyuanApi?.();
}

const previousChildren = computed(() => {
  if (!props.meta.allChildren || !props.meta.currentIndex) {
    return [];
  }
  return props.meta.allChildren.slice(0, props.meta.currentIndex);
});

const hasRemaining = computed(() => {
  if (!props.meta.allChildren || props.meta.currentIndex === undefined) {
    return false;
  }
  return props.meta.currentIndex < props.meta.allChildren.length - 1;
});

const remainingCount = computed(() => {
  if (!props.meta.allChildren || props.meta.currentIndex === undefined) {
    return 0;
  }
  return props.meta.allChildren.length - props.meta.currentIndex - 1;
});

const hasCue = computed(() => (props.meta.cue || '').trim().length > 0);

onMounted(async () => {
  try {
    const siyuanApi = getSiyuanApi();
    if (!siyuanApi) {
      throw new Error('Environment not initialized');
    }

    const result = await siyuanApi.getBlockDOM(props.questionBlockId);
    questionHtml.value = result?.dom || '';

    breadcrumbs.value = await loadBreadcrumbTrail(props.questionBlockId, {
      trimTrailingCount: 2,
    }).catch((breadcrumbError) => {
      logger.warn('[XiuyuanListTemplateCard] Failed to load breadcrumbs:', breadcrumbError);
      return [];
    });
  }
  catch (error) {
    logger.error('[XiuyuanListTemplateCard] Failed to load question block:', error);
    questionHtml.value = '<div class="ft__error">加载失败</div>';
  }
});
</script>

<style scoped>
.xiuyuan-list-template-card {
  padding: 16px;
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
  white-space: pre-line;
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
