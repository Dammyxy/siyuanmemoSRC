<template>
  <div class="xiuyuan-list-template-card">
    <CdfDirectLayout
      v-if="shouldUseDirectDisplay"
      :breadcrumbs="breadcrumbs"
      :content-html="directContentHtml"
    />

    <template v-else>
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
        <RichMarkdownContent class="xiuyuan-answer-text" :content="child.answer" />
      </div>
    </div>

    <div class="xiuyuan-current-item">
      <div v-if="!showAnswer && hasCue" class="xiuyuan-current-cue">
        <span class="xiuyuan-cue-marker">?</span>
        <span class="xiuyuan-cue-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <RichMarkdownContent class="xiuyuan-cue-text" :content="currentCue" />
      </div>

      <div v-else class="xiuyuan-current-answer">
        <span class="xiuyuan-answer-marker">✓</span>
        <span class="xiuyuan-answer-index">{{ (meta.currentIndex || 0) + 1 }}.</span>
        <RichMarkdownContent class="xiuyuan-answer-text" :content="currentAnswer" />
      </div>
    </div>

    <div v-if="showAnswer && hasRemaining" class="xiuyuan-remaining-hint">
      还有 {{ remainingCount }} 个答案未学习
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BreadcrumbItem } from '@/core/card/common/application/types';
import type {
  CdfDirectPathSegment,
  CdfDirectScene,
  CdfDirectRow,
} from '@/core/card/common/application/cdfDirectScene';
import { isCdfDirectPathSegmentArray } from '@/core/card/common/application/cdfDirectScene';
import CardBreadcrumb from '@/core/card/common/ui/CardBreadcrumb.vue';
import type { XiuyuanCardMeta } from '@/core/xiuyuan/cardMeta';
import { parseCueAndAnswer } from '@/core/xiuyuan/parseCueAndAnswer';
import { loadBreadcrumbTrail } from '@/ui/review/shared/loadBreadcrumbTrail';
import CdfDirectLayout from '@/ui/shared/cdf-direct/CdfDirectLayout.vue';
import {
  createCdfDirectMarkdown,
  normalizeCdfDirectLabel,
  projectCdfRelation,
  renderCdfDirectScene,
} from '@/ui/shared/cdf-direct/renderScene';
import RichMarkdownContent from '@/ui/shared/RichMarkdownContent.vue';
import { createLogger } from '@/utils/logger';

type SiyuanApiLike = {
  getBlockDOM: (blockId: string) => Promise<{ dom?: string } | null | undefined>;
  getBlockKramdown: (blockId: string) => Promise<{ kramdown?: string } | null | undefined>;
  getBlockBreadcrumb: (blockId: string) => Promise<unknown[]>;
};

type ParsedListTemplateChild = {
  id: string;
  cue: string;
  answer: string;
  source: string;
  directPath?: CdfDirectPathSegment[];
};

const props = defineProps<{
  meta: XiuyuanCardMeta;
  showAnswer: boolean;
  questionBlockId: string;
  siyuanApi?: SiyuanApiLike;
  displayMode?: 'semantic' | 'direct';
}>();

const logger = createLogger('XiuyuanListTemplateCard');

const questionHtml = ref('');
const breadcrumbs = ref<BreadcrumbItem[]>([]);
const parsedChildren = ref<ParsedListTemplateChild[]>([]);
let loadSeq = 0;

function toLevel(index: number): 0 | 1 | 2 {
  if (index <= 0) {
    return 0;
  }
  if (index === 1) {
    return 1;
  }
  return 2;
}

function buildPathRows(path: CdfDirectPathSegment[]): CdfDirectRow[] {
  return path.map((segment, index) => {
    if (segment.kind === 'group') {
      return {
        kind: 'group',
        key: `path-${index}`,
        level: toLevel(index),
        label: createCdfDirectMarkdown(segment.label, { forceRenderKind: 'fragment' }),
        emphasize: index === 0 ? 'primary' : 'normal',
      } as const;
    }

    return {
      kind: 'concept',
      key: `path-${index}`,
      level: toLevel(index),
      content: createCdfDirectMarkdown(segment.label, { forceRenderKind: 'fragment' }),
      emphasize: index === 0 ? 'primary' : 'normal',
    } as const;
  });
}

function buildFallbackPathRows(questionDom: string): CdfDirectRow[] {
  const label = normalizeCdfDirectLabel(questionDom);
  if (!label) {
    return [];
  }

  if (/;;;|；；；/.test(questionDom)) {
    return [{
      kind: 'group',
      key: 'fallback-group',
      level: 0,
      label: createCdfDirectMarkdown(label, { forceRenderKind: 'fragment' }),
      emphasize: 'primary',
    }];
  }

  return [{
    kind: 'concept',
    key: 'fallback-concept',
    level: 0,
    content: createCdfDirectMarkdown(label, { forceRenderKind: 'fragment' }),
    emphasize: 'primary',
  }];
}

const previousChildren = computed(() => {
  if (!props.meta.allChildren || !props.meta.currentIndex) {
    return [];
  }
  return parsedChildren.value.slice(0, props.meta.currentIndex);
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

const currentChild = computed(() => {
  if (!Array.isArray(props.meta.allChildren) || typeof props.meta.currentIndex !== 'number') {
    return null;
  }
  return parsedChildren.value[props.meta.currentIndex] || null;
});

const currentCue = computed(() => currentChild.value?.cue || '');
const currentAnswer = computed(() => currentChild.value?.answer || '');
const currentSource = computed(() => currentChild.value?.source || '');
const hasCue = computed(() => currentCue.value.trim().length > 0);
const currentRelation = computed(() => projectCdfRelation(currentSource.value, '→'));

const directScene = computed<CdfDirectScene | null>(() => {
  if (props.displayMode !== 'direct') {
    return null;
  }

  const current = currentChild.value;
  if (!current) {
    return null;
  }

  const pathRows = current.directPath?.length
    ? buildPathRows(current.directPath)
    : buildFallbackPathRows(questionHtml.value);
  const rows: CdfDirectRow[] = [...pathRows];
  const relation = currentRelation.value;
  const currentLevel = rows.length === 0 ? 0 : rows.length === 1 ? 1 : 2;

  if (relation.matched) {
    rows.push({
      kind: 'relation',
      key: 'current-relation',
      level: currentLevel,
      left: createCdfDirectMarkdown(relation.left, { forceRenderKind: 'fragment' }),
      right: createCdfDirectMarkdown(relation.right),
      arrow: relation.arrow,
    });
  } else {
    const currentLabel = normalizeCdfDirectLabel(current.answer || current.source);
    const currentContent = createCdfDirectMarkdown(currentLabel);
    if (currentContent.html.trim().length > 0) {
      rows.push({
        kind: 'standalone',
        key: 'current-answer',
        level: currentLevel,
        content: currentContent,
      });
    }
  }

  if (rows.length === 0) {
    return null;
  }

  const conceptRow = rows.find((row) => row.kind === 'concept');
  let frontMask: CdfDirectScene['frontMask'] = null;

  if (!props.showAnswer) {
    if (relation.matched && relation.arrow === '←' && conceptRow) {
      frontMask = {
        rowKey: conceptRow.key,
        segment: 'whole',
      };
    } else if (relation.matched) {
      frontMask = {
        rowKey: 'current-relation',
        segment: 'right',
      };
    } else if (rows.some((row) => row.key === 'current-answer') && rows.length > 1) {
      frontMask = {
        rowKey: 'current-answer',
        segment: 'whole',
      };
    }
  }

  return {
    rows,
    frontMask,
  };
});

const shouldUseDirectDisplay = computed(() => directScene.value !== null);

const directContentHtml = computed(() => {
  if (!directScene.value) {
    return '';
  }

  return renderCdfDirectScene(directScene.value, {
    showAnswer: props.showAnswer === true,
  });
});

async function loadCardContent(): Promise<void> {
  const seq = ++loadSeq;
  try {
    const siyuanApi = props.siyuanApi;
    if (!siyuanApi) {
      throw new Error('Environment not initialized');
    }

    const childIds = Array.isArray(props.meta.allChildren)
      ? props.meta.allChildren
          .map((child) => String(child?.id || '').trim())
          .filter((id) => id.length > 0)
      : [];
    const storedChildrenById = new Map(
      (props.meta.allChildren || []).map((child) => [String(child?.id || ''), child] as const),
    );

    const [questionResult, breadcrumbItems, childMarkdownList] = await Promise.all([
      siyuanApi.getBlockDOM(props.questionBlockId),
      loadBreadcrumbTrail(props.questionBlockId, {
        siyuanApi,
        trimTrailingCount: 2,
      }).catch((breadcrumbError) => {
        logger.warn('[XiuyuanListTemplateCard] Failed to load breadcrumbs:', breadcrumbError);
        return [];
      }),
      Promise.all(
        childIds.map(async (id) => {
          const storedChild = storedChildrenById.get(id);
          const { kramdown } = await siyuanApi.getBlockKramdown(id) || {};
          const source = String(kramdown || storedChild?.source || '');
          const parsed = parseCueAndAnswer(source);
          return {
            id,
            cue: parsed.cue,
            answer: parsed.answer,
            source,
            directPath: isCdfDirectPathSegmentArray(storedChild?.directPath)
              ? storedChild.directPath
              : undefined,
          };
        }),
      ),
    ]);

    if (seq !== loadSeq) {
      return;
    }

    questionHtml.value = questionResult?.dom || '';
    breadcrumbs.value = breadcrumbItems;
    parsedChildren.value = childMarkdownList;
  }
  catch (error) {
    if (seq !== loadSeq) {
      return;
    }
    logger.error('[XiuyuanListTemplateCard] Failed to load question block:', error);
    questionHtml.value = '<div class="ft__error">加载失败</div>';
    parsedChildren.value = [];
  }
}

watch(
  () => [
    props.questionBlockId,
    props.showAnswer,
    props.meta.currentIndex,
    ...(props.meta.allChildren?.map((child) => {
      const directPathToken = Array.isArray(child.directPath)
        ? child.directPath.map((segment) => `${segment.kind}:${segment.label}`).join('|')
        : '';
      return `${String(child.id || '')}:${String(child.source || '')}:${directPathToken}`;
    }) || []),
  ],
  () => {
    void loadCardContent();
  },
  { immediate: true },
);
</script>

<style scoped>
.xiuyuan-list-template-card {
  padding: 16px;
}

.xiuyuan-question {
  font-size: var(--siyuanmemo-review-font-title, 1.125em);
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
}

.xiuyuan-answer-index {
  color: var(--b3-theme-on-surface-light);
  min-width: 20px;
}

.xiuyuan-current-item {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
  border: 2px solid var(--b3-theme-primary);
}

.xiuyuan-current-cue,
.xiuyuan-current-answer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.xiuyuan-cue-marker {
  color: var(--b3-theme-warning);
  font-weight: bold;
}

.xiuyuan-cue-index,
.xiuyuan-answer-index {
  min-width: 24px;
  font-weight: 500;
}

.xiuyuan-cue-text,
.xiuyuan-answer-text {
  flex: 1;
}

.xiuyuan-remaining-hint {
  text-align: center;
  color: var(--b3-theme-on-surface-light);
  font-size: 0.875em;
  padding: 8px;
}
</style>
