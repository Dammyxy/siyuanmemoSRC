import type { AISiyuanBlockRow, AISiyuanMutationResult, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { CreateListTemplateCardsCommand } from '@/application/commands/xiuyuan/CreateListTemplateCardsCommand';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { AIChatToolRuntimeContext } from '@/application/services/AIChatToolExecutorService';
import type { ProgressiveExcerptInput } from '@/application/services/ProgressiveReadingService';
import { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import { SelectionTopicContinuationService } from '@/application/services/SelectionTopicContinuationService';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { CreateCdfMultilineCardsUseCase } from '@/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase';
import { findConceptByUpwardSearch } from '@/application/usecases/xiuyuan/shared/ConceptLocator';
import { detectDescriptorOrDefinitionKind } from '@/application/usecases/xiuyuan/shared/DescriptorTemplateStrategy';
import type { CdfNodeKind, CdfScanNode, CdfScanResult } from '@/application/usecases/xiuyuan/shared/CdfMultilineScanner';
import { parseCueAndAnswer } from '@/core/xiuyuan/parseCueAndAnswer';
import {
  AIFlashcardCardResolutionRuntime,
  parseClozeMarkers,
} from './AIFlashcardCardResolutionRuntime';
import {
  AIFlashcardMarkdownInsertionRuntime,
  type AIFlashcardMutationRow,
} from './AIFlashcardMarkdownInsertionRuntime';
import {
  AIFlashcardTargetRuntime,
  type AIFlashcardResolvedWriteTarget,
} from './AIFlashcardTargetRuntime';
import { AIFlashcardToolDecisionRuntime } from './AIFlashcardToolDecisionRuntime';
import { AIFlashcardXiuyuanWriteRuntime } from './AIFlashcardXiuyuanWriteRuntime';
import type {
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfDefinitionCandidate,
  AICdfDescriptorGroup,
  AICdfStructure,
  AIWorkbenchConceptDocumentSearchResult,
  AIWorkbenchCdfCreationItemResult,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchContextSnapshot,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

type AIFlashcardXiuyuanService = Pick<XiuyuanApplicationService, 'createFromBlocks' | 'createListTemplateCards'>;
type MutationRow = AIFlashcardMutationRow;
type SemanticCdfTreeNode = {
  listItemId: string;
  paragraphId: string;
  text: string;
  markdown: string;
  depth: number;
  children: SemanticCdfTreeNode[];
};
type SemanticCdfDescriptorGroupPlan = {
  title: string;
  items: string[];
};
type SemanticCdfPlan = {
  conceptBlockId: string;
  definitionText: string;
  descriptorGroups: SemanticCdfDescriptorGroupPlan[];
};
type ResolvedWriteTarget = AIFlashcardResolvedWriteTarget;

type ResolvedSelectionInput = {
  sourceBlockId: string;
  sourceBlockIds: string[];
  selectedText: string;
  rootId?: string;
  blockType?: string | null;
  origin: 'editor' | 'review' | 'block-menu';
  missingInfo: string[];
};

const CDF_UNRESOLVED_WARNING = '未解析到现有概念文档，当前概念只保留为草稿，无法直接建卡。';

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter(Boolean)));
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const message = normalizeString(error);
  return message || fallback;
}

function normalizeListText(value: string): string {
  return normalizeString(value).replace(/\s*\r?\n\s*/g, ' ');
}

function normalizePriority(value: unknown): number | undefined {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return numeric;
}

function normalizeConceptTitleKey(value: unknown): string {
  return normalizeString(value).replace(/\s+/g, ' ').toLowerCase();
}

function sanitizeDocTitle(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'SiYuanMemo';
}

function normalizeSelectionOrigin(
  value: unknown,
  fallback: ResolvedSelectionInput['origin'],
): ResolvedSelectionInput['origin'] {
  return value === 'review' || value === 'block-menu' || value === 'editor'
    ? value
    : fallback;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AIFlashcardToolService {
  private readonly cardResolutionRuntime = new AIFlashcardCardResolutionRuntime();
  private readonly toolDecisionRuntime = new AIFlashcardToolDecisionRuntime();
  private readonly markdownRuntime: AIFlashcardMarkdownInsertionRuntime;
  private readonly targetRuntime: AIFlashcardTargetRuntime;
  private readonly xiuyuanWriteRuntime: AIFlashcardXiuyuanWriteRuntime;

  constructor(private readonly deps: {
    siyuanPort: AISiyuanPort;
    getXiuyuanApplicationService: () => Promise<AIFlashcardXiuyuanService>;
    loadDefaultTarget: () => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
    saveDefaultTarget: (target: AIWorkbenchSelfTestCardTargetMemory) => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
    getSelectionExcerptService?: () => SelectionExcerptService;
    getSelectionTopicContinuationService?: () => SelectionTopicContinuationService;
  }) {
    this.markdownRuntime = new AIFlashcardMarkdownInsertionRuntime({
      appendBlockUnderParentDetailed: (markdown, parentId) => this.deps.siyuanPort.appendBlockUnderParentDetailed(markdown, parentId),
      insertBlockAfterDetailed: (markdown, previousId) => this.deps.siyuanPort.insertBlockAfterDetailed(markdown, previousId),
      sql: (stmt) => this.deps.siyuanPort.sql(stmt),
    });
    this.targetRuntime = new AIFlashcardTargetRuntime({
      loadDefaultTarget: () => this.deps.loadDefaultTarget(),
      saveDefaultTarget: (target) => this.deps.saveDefaultTarget(target),
      ensureTodayDailyNote: (notebookId) => this.deps.siyuanPort.ensureTodayDailyNote(notebookId),
      loadTargetBlock: (blockId) => this.loadTargetBlock(blockId),
    });
    this.xiuyuanWriteRuntime = new AIFlashcardXiuyuanWriteRuntime({
      getXiuyuanApplicationService: () => this.deps.getXiuyuanApplicationService(),
    });
  }

  async decideStudyAction(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const request = normalizeString(args.request);
    const goalHint = normalizeString(args.goalHint) || 'auto';
    const selection = this.resolveSelectionInput(args, runtime, {
      allowBlockMenuOrigin: true,
    });
    const canContinue = this.prepareTopicContinuation(selection);
    const lowerRequest = request.toLowerCase();
    const wantsUnderstand = goalHint === 'understand'
      || /解释|理解|讲解|说明|总结|抓重点|翻译|梳理|分析/.test(request);
    const wantsExtract = goalHint === 'extract'
      || /摘录|摘抄|提取|抽取|保存成\s*topic|做成\s*topic|生成\s*topic/.test(request);
    const wantsCard = goalHint === 'create-card'
      || /制卡|做卡|卡片|flashcard|问答卡|挖空|descriptor|定义卡|cdf/.test(lowerRequest);
    const wantsContinuation = /继续|沿用|已有\s*topic|topic\s*下|item|继续制卡|alt\+z|⌥⇧z/i.test(request);

    if ((wantsExtract || wantsContinuation) && canContinue?.available) {
      return {
        action: 'create-topic-item',
        recommendedTool: 'CreateTopicItems',
        cardFamily: 'topic-item',
        reason: '当前选区已经落在已有 Topic 语境里，更适合沿用原 Topic 继续生成 Item。',
        missingInfo: selection.missingInfo,
        approvalRequired: true,
      };
    }

    if (wantsExtract) {
      return {
        action: 'create-excerpt-topic',
        recommendedTool: 'CreateExcerptTopic',
        cardFamily: 'topic-excerpt',
        reason: '当前请求更像是在把材料提取为可继续学习的 Topic，而不是直接生成文本卡。',
        missingInfo: selection.missingInfo,
        approvalRequired: true,
      };
    }

    if (wantsCard) {
      const cardDecision = this.toolDecisionRuntime.resolveCardCreationDecision({
        request,
        selection,
        continuationAvailable: canContinue?.available === true,
      });
      return {
        action: 'create-card',
        recommendedTool: cardDecision.recommendedTool,
        cardFamily: cardDecision.cardFamily,
        reason: cardDecision.reason,
        missingInfo: selection.missingInfo,
        approvalRequired: true,
      };
    }

    if (wantsUnderstand || !selection.selectedText) {
      return {
        action: 'answer-directly',
        recommendedTool: null,
        cardFamily: null,
        reason: wantsUnderstand
          ? '当前更适合先把材料解释清楚，再决定是否摘录或制卡。'
          : '当前缺少足够的选区材料，更适合先继续对话澄清目标。',
        missingInfo: selection.missingInfo,
        approvalRequired: false,
      };
    }

    const cardDecision = this.toolDecisionRuntime.resolveCardCreationDecision({
      request,
      selection,
      continuationAvailable: canContinue?.available === true,
    });
    return {
      action: 'create-card',
      recommendedTool: cardDecision.recommendedTool,
      cardFamily: cardDecision.cardFamily,
      reason: `${cardDecision.reason} 当前材料已经具备进入文本类卡工具的最小信息。`,
      missingInfo: selection.missingInfo,
      approvalRequired: true,
    };
  }

  async createExcerptTopic(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const selection = this.resolveSelectionInput(args, runtime);
    if (selection.missingInfo.length > 0) {
      throw new Error(`缺少必要信息：${selection.missingInfo.join(', ')}`);
    }
    const excerptService = this.requireSelectionExcerptService();
    const input: ProgressiveExcerptInput = {
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      selectedText: selection.selectedText,
      origin: selection.origin === 'review' ? 'review' : 'editor',
    };
    const result = await excerptService.createFromSelection(input);
    return {
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      selectedText: selection.selectedText,
      result,
    };
  }

  async createTopicItems(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const selection = this.resolveSelectionInput(args, runtime, {
      allowBlockMenuOrigin: true,
    });
    if (selection.missingInfo.length > 0) {
      throw new Error(`缺少必要信息：${selection.missingInfo.join(', ')}`);
    }
    const continuationService = this.requireSelectionTopicContinuationService();
    const preparation = continuationService.prepareSelection({
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      selectedText: selection.selectedText,
      ...(selection.rootId ? { rootId: selection.rootId } : {}),
      origin: selection.origin,
    });
    if (!preparation.available || !preparation.topicContext) {
      return {
        available: false,
        topicCardId: null,
        mode: null,
        created: 0,
        skipped: 0,
        items: [],
      };
    }
    const result = await continuationService.createFromSelection({
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      selectedText: selection.selectedText,
      ...(selection.rootId ? { rootId: selection.rootId } : {}),
      origin: selection.origin,
    }, preparation);
    return {
      available: true,
      topicCardId: preparation.topicContext.topicCardId,
      mode: preparation.mode,
      created: result.created,
      skipped: result.skipped,
      items: result.items,
    };
  }

  async createPairCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const mode = normalizeString(args.mode) === 'bidirectional' ? 'bidirectional' : 'basic-qa';
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;

    const results = [];
    for (const item of items) {
      const front = normalizeString(item.front);
      const back = normalizeString(item.back);
      if (!front || !back) {
        results.push({ status: 'skipped', front, back, error: 'front / back 不能为空。' });
        continue;
      }
      const mutation = await this.markdownRuntime.insertMarkdown(
        this.buildPairMarkdown(front, back),
        target,
        previousSiblingId,
      );
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      const pair = this.resolvePairBlocks(rows);
      previousSiblingId = pair.insertedRootBlockId || previousSiblingId;
      const command: CreateXiuyuanFromBlocksCommand = {
        blockIds: [pair.frontBlockId, pair.backBlockId],
        templateId: mode === 'bidirectional' ? 'builtin-bidirectional' : 'builtin-basic-qa',
        fieldMapping: mode === 'bidirectional'
          ? { term: pair.frontBlockId, definition: pair.backBlockId }
          : { question: pair.frontBlockId, answer: pair.backBlockId },
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        cardType: 'item',
        source: 'ai-workbench',
        creationMode: `ai-tool:${mode}`,
        duplicatePolicy: 'reuse-existing',
      };
      const creation = await this.xiuyuanWriteRuntime.createFromBlocks(command);
      if (!creation.ok) {
        results.push({
          status: 'failed',
          front,
          back,
          insertedRootBlockId: pair.insertedRootBlockId,
          error: toErrorMessage(creation.error, '制卡失败。'),
        });
        continue;
      }
      results.push({
        status: 'created',
        front,
        back,
        insertedRootBlockId: pair.insertedRootBlockId,
        sourceBlockIds: [pair.frontBlockId, pair.backBlockId],
        templateId: command.templateId,
        xiuyuanId: creation.value.xiuyuan.id,
        cardIds: creation.value.cards.map((card) => card.id),
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      mode,
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createInlineCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const mode = normalizeString(args.mode) || 'quick';
    const config = this.cardResolutionRuntime.resolveInlineCardConfig(mode);

    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const content = normalizeString(item.content);
      if (!content) {
        results.push({ status: 'skipped', error: 'content 不能为空。' });
        continue;
      }
      const mutation = await this.markdownRuntime.insertMarkdown(content, target, previousSiblingId);
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      const blockId = this.resolveFirstTextBlock(rows);
      previousSiblingId = blockId || previousSiblingId;
      const command: CreateXiuyuanFromBlocksCommand = {
        blockIds: [blockId],
        templateId: config.templateId,
        fieldMapping: mode === 'concept'
          ? { concept: blockId }
          : { content: blockId },
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        cardType: config.cardType,
        source: 'ai-workbench',
        creationMode: config.creationMode,
        duplicatePolicy: 'reuse-existing',
      };
      if (mode === 'multi-cloze') {
        const clozes = parseClozeMarkers(content);
        if (clozes.length === 0) {
          results.push({ status: 'skipped', content, error: '没有找到 ==挖空== 标记。' });
          continue;
        }
        command.clozeInfo = {
          originalContent: content,
          clozes,
        };
        const renderMode = normalizeString(item.clozeRenderMode);
        if (renderMode === 'inline-formula-cloze') {
          command.clozeRenderMode = 'inline-formula-cloze';
        }
      }
      const creation = await this.xiuyuanWriteRuntime.createFromBlocks(command);
      if (!creation.ok) {
        results.push({
          status: 'failed',
          content,
          sourceBlockIds: [blockId],
          error: toErrorMessage(creation.error, '制卡失败。'),
        });
        continue;
      }
      results.push({
        status: 'created',
        content,
        sourceBlockIds: [blockId],
        templateId: config.templateId,
        xiuyuanId: creation.value.xiuyuan.id,
        cardIds: creation.value.cards.map((card) => card.id),
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      mode,
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createConceptDefinitionCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const concept = normalizeString(item.concept);
      const definition = normalizeString(item.definition);
      const direction = normalizeString(item.direction) || 'both';
      if (!concept || !definition) {
        results.push({ status: 'skipped', concept, definition, error: 'concept / definition 不能为空。' });
        continue;
      }
      const mutation = await this.markdownRuntime.insertMarkdown(this.buildPairMarkdown(concept, definition), target, previousSiblingId);
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      const pair = this.resolvePairBlocks(rows);
      previousSiblingId = pair.insertedRootBlockId || previousSiblingId;
      const templateId = direction === 'forward'
        ? 'builtin-concept-definition-forward'
        : direction === 'reverse'
          ? 'builtin-concept-definition-reverse'
          : 'builtin-concept-definition';
      const creation = await this.xiuyuanWriteRuntime.createFromBlocks({
        blockIds: [pair.frontBlockId, pair.backBlockId],
        templateId,
        fieldMapping: {
          concept: pair.frontBlockId,
          definition: pair.backBlockId,
        },
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        cardType: 'concept',
        source: 'ai-workbench',
        creationMode: 'ai-tool:concept-definition',
        duplicatePolicy: 'reuse-existing',
      });
      if (!creation.ok) {
        results.push({
          status: 'failed',
          concept,
          definition,
          insertedRootBlockId: pair.insertedRootBlockId,
          error: toErrorMessage(creation.error, '制卡失败。'),
        });
        continue;
      }
      results.push({
        status: 'created',
        concept,
        definition,
        templateId,
        insertedRootBlockId: pair.insertedRootBlockId,
        sourceBlockIds: [pair.frontBlockId, pair.backBlockId],
        xiuyuanId: creation.value.xiuyuan.id,
        cardIds: creation.value.cards.map((card) => card.id),
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createDescriptorCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const concept = normalizeString(item.concept);
      const definition = normalizeString(item.definition);
      const descriptors = Array.isArray(item.descriptors) ? item.descriptors as Array<Record<string, unknown>> : [];
      if (!concept || descriptors.length === 0) {
        results.push({ status: 'skipped', concept, error: 'concept 和 descriptors 至少要提供一项。' });
        continue;
      }

      const conceptMutation = await this.markdownRuntime.insertMarkdown(concept, target, previousSiblingId);
      const conceptRows = await this.markdownRuntime.loadMutationRows(conceptMutation);
      const conceptBlockId = this.resolveFirstTextBlock(conceptRows);
      previousSiblingId = conceptBlockId || previousSiblingId;

      let definitionResult: { xiuyuanId?: string; cardIds?: string[]; blockId?: string } | null = null;
      if (definition) {
        const definitionMutation = await this.markdownRuntime.insertMarkdown(definition, target, previousSiblingId);
        const definitionRows = await this.markdownRuntime.loadMutationRows(definitionMutation);
        const definitionBlockId = this.resolveFirstTextBlock(definitionRows);
        previousSiblingId = definitionBlockId || previousSiblingId;
        const creation = await this.xiuyuanWriteRuntime.createFromBlocks({
          blockIds: [conceptBlockId, definitionBlockId],
          templateId: 'builtin-concept-definition',
          fieldMapping: {
            concept: conceptBlockId,
            definition: definitionBlockId,
          },
          ...(deckId ? { deckId } : {}),
          ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
          cardType: 'concept',
          source: 'ai-workbench',
          creationMode: 'ai-tool:descriptor-definition',
          duplicatePolicy: 'reuse-existing',
        });
        if (creation.ok) {
          definitionResult = {
            xiuyuanId: creation.value.xiuyuan.id,
            cardIds: creation.value.cards.map((card) => card.id),
            blockId: definitionBlockId,
          };
        }
      }

      const descriptorResults = [];
      for (const descriptor of descriptors) {
        const cue = normalizeListText(normalizeString(descriptor.cue));
        const answer = normalizeListText(normalizeString(descriptor.answer));
        const direction = normalizeString(descriptor.direction) || 'forward';
        if (!cue || !answer) {
          descriptorResults.push({ status: 'skipped', cue, answer, error: 'cue / answer 不能为空。' });
          continue;
        }
        const descriptorContent = direction === 'reverse'
          ? `${cue};<${answer}`
          : direction === 'both'
            ? `${cue};<>${answer}`
            : `${cue};;${answer}`;
        const descriptorMutation = await this.markdownRuntime.insertMarkdown(descriptorContent, target, previousSiblingId);
        const descriptorRows = await this.markdownRuntime.loadMutationRows(descriptorMutation);
        const descriptorBlockId = this.resolveFirstTextBlock(descriptorRows);
        previousSiblingId = descriptorBlockId || previousSiblingId;
        const templateId = direction === 'reverse'
          ? 'builtin-concept-descriptor-reverse'
          : direction === 'both'
            ? 'builtin-concept-descriptor-both'
            : 'builtin-concept-descriptor';
        const creation = await this.xiuyuanWriteRuntime.createFromBlocks({
          blockIds: [conceptBlockId, descriptorBlockId],
          templateId,
          fieldMapping: {
            concept: conceptBlockId,
            descriptor: descriptorBlockId,
          },
          ...(deckId ? { deckId } : {}),
          ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
          cardType: 'descriptor',
          source: 'ai-workbench',
          creationMode: 'ai-tool:descriptor-card',
          duplicatePolicy: 'reuse-existing',
        });
        if (!creation.ok) {
          descriptorResults.push({
            status: 'failed',
            cue,
            answer,
            sourceBlockIds: [conceptBlockId, descriptorBlockId],
            error: toErrorMessage(creation.error, '制卡失败。'),
          });
          continue;
        }
        descriptorResults.push({
          status: 'created',
          cue,
          answer,
          templateId,
          sourceBlockIds: [conceptBlockId, descriptorBlockId],
          xiuyuanId: creation.value.xiuyuan.id,
          cardIds: creation.value.cards.map((card) => card.id),
        });
      }

      results.push({
        status: descriptorResults.some((entry) => entry.status === 'created') ? 'created' : 'failed',
        concept,
        conceptBlockId,
        definition: definition || undefined,
        definitionResult,
        descriptors: descriptorResults,
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createListCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const parent = normalizeListText(normalizeString(item.parent));
      const children = Array.isArray(item.children)
        ? (item.children as unknown[]).map((entry) => normalizeListText(normalizeString(entry))).filter(Boolean)
        : [];
      if (!parent || children.length < 2) {
        results.push({ status: 'skipped', parent, children, error: 'parent 不能为空，children 至少需要 2 项。' });
        continue;
      }
      const mutation = await this.markdownRuntime.insertMarkdown(this.buildListMarkdown(parent, children), target, previousSiblingId);
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      const structure = this.resolveListStructure(rows);
      previousSiblingId = structure.parentListItemId || previousSiblingId;
      const command: CreateListTemplateCardsCommand = {
        parentBlockId: structure.parentListItemId,
        childBlockIds: structure.childListItemIds,
        templateId: 'builtin-list-item',
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        creationMode: normalizeString(item.creationMode) === 'summary-v1' ? 'summary-v1' : 'split-v2',
        cardType: this.cardResolutionRuntime.resolveListCardType(item.cardType),
        listKind: 'default',
      };
      const creation = await this.xiuyuanWriteRuntime.createListTemplateCards(command);
      if (!creation.ok) {
        results.push({
          status: 'failed',
          parent,
          children,
          insertedRootBlockId: structure.parentListItemId,
          error: toErrorMessage(creation.error, '列表模板制卡失败。'),
        });
        continue;
      }
      results.push({
        status: 'created',
        parent,
        children,
        insertedRootBlockId: structure.parentListItemId,
        templateId: command.templateId,
        created: creation.value.created,
        skippedChildBlockIds: creation.value.skippedChildBlockIds,
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createCdfMultilineCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const mode = this.cardResolutionRuntime.resolveCdfMode(item.mode);
      const cdfConfig = this.cardResolutionRuntime.resolveCdfListConfig(mode);
      const concept = normalizeListText(normalizeString(item.concept));
      const parent = normalizeListText(normalizeString(item.parent));
      const children = Array.isArray(item.children)
        ? (item.children as unknown[]).map((entry) => normalizeListText(normalizeString(entry))).filter(Boolean)
        : [];
      if (!parent || children.length < 2) {
        results.push({ status: 'skipped', mode, parent, children, error: 'parent 不能为空，children 至少需要 2 项。' });
        continue;
      }

      const markdown = mode === 'descriptor-multiline'
        ? this.buildDescriptorMultilineMarkdown(concept, parent, children)
        : this.buildConceptMultilineMarkdown(concept || parent, children);
      const mutation = await this.markdownRuntime.insertMarkdown(markdown, target, previousSiblingId);
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      const structure = mode === 'descriptor-multiline'
        ? this.resolveDescriptorMultilineStructure(rows)
        : this.resolveListStructure(rows);
      previousSiblingId = structure.parentListItemId || previousSiblingId;
      const command: CreateListTemplateCardsCommand = {
        parentBlockId: structure.parentListItemId,
        childBlockIds: structure.childListItemIds,
        templateId: cdfConfig.templateId,
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        creationMode: 'split-v2',
        cardType: cdfConfig.cardType,
        listKind: cdfConfig.listKind,
        ...(structure.conceptBlockId ? { conceptBlockId: structure.conceptBlockId } : {}),
      };
      const creation = await this.xiuyuanWriteRuntime.createListTemplateCards(command);
      if (!creation.ok) {
        results.push({
          status: 'failed',
          mode,
          concept,
          parent,
          children,
          insertedRootBlockId: structure.parentListItemId,
          error: toErrorMessage(creation.error, 'CDF 多行制卡失败。'),
        });
        continue;
      }
      results.push({
        status: 'created',
        mode,
        concept,
        parent,
        children,
        insertedRootBlockId: structure.parentListItemId,
        templateId: command.templateId,
        created: creation.value.created,
        skippedChildBlockIds: creation.value.skippedChildBlockIds,
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createCdfDraftCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const draftMarkdown = normalizeString(item.draftMarkdown || item.content);
      const summary = normalizeString(item.summary) || this.summarizeDraftMarkdown(draftMarkdown);
      if (!draftMarkdown) {
        results.push({ status: 'skipped', mode: 'cdf-multiline', summary, draftMarkdown, error: 'draftMarkdown 不能为空。' });
        continue;
      }

      const mode = draftMarkdown.includes(';;;') ? 'descriptor-multiline' : 'concept-multiline';
      const cdfConfig = this.cardResolutionRuntime.resolveCdfListConfig(mode);
      try {
        const mutation = await this.markdownRuntime.insertMarkdown(draftMarkdown, target, previousSiblingId);
        const rows = await this.markdownRuntime.loadMutationRows(mutation);
        const structure = mode === 'descriptor-multiline'
          ? this.resolveDescriptorMultilineStructure(rows)
          : this.resolveListStructure(rows);
        previousSiblingId = structure.parentListItemId || previousSiblingId;
        const command: CreateListTemplateCardsCommand = {
          parentBlockId: structure.parentListItemId,
          childBlockIds: structure.childListItemIds,
          templateId: cdfConfig.templateId,
          ...(deckId ? { deckId } : {}),
          ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
          creationMode: 'split-v2',
          cardType: cdfConfig.cardType,
          listKind: cdfConfig.listKind,
          ...(structure.conceptBlockId ? { conceptBlockId: structure.conceptBlockId } : {}),
        };
        const creation = await this.xiuyuanWriteRuntime.createListTemplateCards(command);
        if (!creation.ok) {
          results.push({
            status: 'failed',
            mode: 'cdf-multiline',
            summary,
            draftMarkdown,
            insertedRootBlockId: structure.parentListItemId,
            sourceBlockIds: [structure.parentListItemId, ...structure.childListItemIds],
            xiuyuanId: null,
            cardIds: [],
            warnings: [],
            error: toErrorMessage(creation.error, 'CDF 多行制卡失败。'),
          });
          continue;
        }
        results.push({
          status: 'created',
          mode: 'cdf-multiline',
          summary,
          draftMarkdown,
          insertedRootBlockId: structure.parentListItemId,
          sourceBlockIds: [structure.parentListItemId, ...structure.childListItemIds],
          xiuyuanId: creation.value.xiuyuan.id,
          cardIds: creation.value.cards.map((card) => card.id),
          warnings: [],
          created: creation.value.created,
          skippedChildBlockIds: creation.value.skippedChildBlockIds,
        });
      } catch (error) {
        results.push({
          status: 'failed',
          mode: 'cdf-multiline',
          summary,
          draftMarkdown,
          insertedRootBlockId: null,
          sourceBlockIds: [],
          xiuyuanId: null,
          cardIds: [],
          warnings: [],
          error: toErrorMessage(error, 'CDF 多行制卡失败。'),
        });
      }
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      mode: 'cdf-multiline',
      target: target.memory,
      createdCount: results.filter((item) => item.status === 'created').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  async createNativeListItemCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    return this.createNativeRiffCards(args, runtime, 'list-item');
  }

  async createNativeMarkCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    return this.createNativeRiffCards(args, runtime, 'mark');
  }

  async createNativeHeadingCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    return this.createNativeRiffCards(args, runtime, 'heading');
  }

  async createNativeSuperBlockCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    return this.createNativeRiffCards(args, runtime, 'super-block');
  }

  async previewSemanticCdfStructure(
    structure: AICdfStructure,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    runtime: AIChatToolRuntimeContext,
    options?: {
      forceResolve?: boolean;
    },
  ): Promise<AICdfStructure> {
    return this.resolveSemanticCdfStructure(structure, target, runtime.context, {
      preserveManualResolution: options?.forceResolve !== true,
    });
  }

  async createSemanticCdfCards(
    structure: AICdfStructure,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    runtime: AIChatToolRuntimeContext,
  ): Promise<AIWorkbenchCdfCreationResult> {
    const resolvedStructure = await this.resolveSemanticCdfStructure(structure, target, runtime.context, {
      preserveManualResolution: true,
    });
    const resolvedTarget = await this.targetRuntime.resolveTargetFromInput(target);
    const xiuyuanService = await this.xiuyuanWriteRuntime.getService();
    const createCdfMultilineUseCase = new CreateCdfMultilineCardsUseCase(
      { createFromBlocks: xiuyuanService.createFromBlocks.bind(xiuyuanService) },
      this.deps.siyuanPort,
    );
    const deckId = this.resolveDeckId({}, runtime);
    let previousSiblingId = resolvedTarget.targetBlockId;
    const itemResults: AIWorkbenchCdfCreationItemResult[] = [];

    for (const anchor of resolvedStructure.anchors) {
      if (anchor.selected === false) {
        continue;
      }
      const resolution = anchor.resolution || null;
      const baseWarnings = [...(anchor.warnings || [])];
      if (!resolution?.conceptBlockId) {
        itemResults.push({
          anchorId: anchor.id,
          conceptName: anchor.conceptName,
          status: 'skipped',
          conceptBlockId: null,
          insertedRootBlockId: null,
          createdDefinitionCount: 0,
          createdDescriptorCount: 0,
          warnings: baseWarnings.length > 0 ? baseWarnings : ['未解析到现有概念文档，已跳过。'],
          error: null,
        });
        continue;
      }
      if (!this.isResolutionCompatibleWithTarget(resolution, resolvedTarget.memory.notebookId)) {
        itemResults.push({
          anchorId: anchor.id,
          conceptName: anchor.conceptName,
          status: 'skipped',
          conceptBlockId: resolution.conceptBlockId,
          insertedRootBlockId: null,
          createdDefinitionCount: 0,
          createdDescriptorCount: 0,
          warnings: [...baseWarnings, '当前概念解析结果属于旧目标笔记本，请重新解析或重新搜索概念文档。'],
          error: null,
        });
        continue;
      }

      const warnings = [...baseWarnings];
      const selectedDefinitions = anchor.definitionCandidates.filter((definition) => (
        definition.selected !== false && normalizeString(definition.text)
      ));
      const selectedDefinition = selectedDefinitions[0] || null;
      if (selectedDefinitions.length > 1) {
        warnings.push('同一概念当前只支持一个定义候选，已自动使用首个选中定义。');
      }
      const selectedDescriptorGroups = anchor.descriptorGroups
        .filter((group) => group.selected !== false)
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.selected !== false && normalizeString(item.text)),
        }))
        .filter((group) => normalizeString(group.title) && group.items.length > 0);

      if (!selectedDefinition && selectedDescriptorGroups.length === 0) {
        itemResults.push({
          anchorId: anchor.id,
          conceptName: anchor.conceptName,
          status: 'skipped',
          conceptBlockId: resolution.conceptBlockId,
          insertedRootBlockId: null,
          createdDefinitionCount: 0,
          createdDescriptorCount: 0,
          warnings: [...baseWarnings, '该概念没有选中的定义或描述符条目。'],
          error: null,
        });
        continue;
      }

      let insertedRootBlockId: string | null = null;
      let createdDefinitionCount = 0;
      let createdDescriptorCount = 0;
      let status: AIWorkbenchCdfCreationItemResult['status'] = 'skipped';
      let anchorError: string | null = null;

      try {
        const semanticPlan = this.buildSemanticCdfPlan(
          resolution.conceptBlockId,
          selectedDefinition,
          selectedDescriptorGroups,
        );
        const draftMarkdown = this.buildSemanticCdfMarkdown(semanticPlan);
        const mutation = await this.markdownRuntime.insertMarkdown(draftMarkdown, resolvedTarget, previousSiblingId);
        insertedRootBlockId = await this.resolveInsertedListRootItemIdWithFallback(mutation);
        previousSiblingId = insertedRootBlockId || previousSiblingId;

        let scanResult: CdfScanResult;
        try {
          scanResult = await this.buildSemanticCdfScanResult(mutation, insertedRootBlockId, semanticPlan);
        } catch (error) {
          anchorError = `CDF 源块已写入，但未能完成扫描/制卡：${toErrorMessage(error, '未能构造 CDF 扫描结果。')}`;
          status = 'failed';
          itemResults.push({
            anchorId: anchor.id,
            conceptName: anchor.conceptName,
            status,
            conceptBlockId: resolution.conceptBlockId,
            insertedRootBlockId,
            createdDefinitionCount,
            createdDescriptorCount,
            warnings,
            error: anchorError,
          });
          continue;
        }

        const creation = await createCdfMultilineUseCase.executeFromScanResult(
          scanResult,
          'builtin-list-concept-multiline',
          deckId,
        );
        if (!creation.ok) {
          anchorError = toErrorMessage(creation.error, 'CDF 语义制卡失败。');
          status = 'failed';
        } else {
          createdDefinitionCount = creation.value.createdDefinition;
          createdDescriptorCount = creation.value.createdDescriptor;
          if (creation.value.failed > 0 && creation.value.firstError) {
            warnings.push(creation.value.firstError);
          }
          status = createdDefinitionCount + createdDescriptorCount > 0
            ? 'created'
            : creation.value.failed > 0
              ? 'failed'
              : 'skipped';
          if (status === 'failed') {
            anchorError = creation.value.firstError || 'CDF 语义制卡失败。';
          }
        }
      } catch (error) {
        anchorError = toErrorMessage(error, 'CDF 语义制卡失败。');
        status = 'failed';
      }

      itemResults.push({
        anchorId: anchor.id,
        conceptName: anchor.conceptName,
        status,
        conceptBlockId: resolution.conceptBlockId,
        insertedRootBlockId,
        createdDefinitionCount,
        createdDescriptorCount,
        warnings,
        error: anchorError,
      });
    }

    await this.targetRuntime.persistSuccessfulTarget(resolvedTarget, itemResults);
    const createdDefinitionCount = itemResults.reduce((total, item) => total + item.createdDefinitionCount, 0);
    const createdDescriptorCount = itemResults.reduce((total, item) => total + item.createdDescriptorCount, 0);
    return {
      target: resolvedTarget.memory,
      targetBlockId: resolvedTarget.targetBlockId,
      targetLabel: resolvedTarget.memory.targetLabel,
      itemResults,
      createdDefinitionCount,
      createdDescriptorCount,
      createdCount: itemResults.filter((item) => item.status === 'created').length,
      skippedCount: itemResults.filter((item) => item.status === 'skipped').length,
      failedCount: itemResults.filter((item) => item.status === 'failed').length,
    };
  }

  async searchConceptDocumentsInNotebook(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    query: string,
    limit = 8,
  ): Promise<AIWorkbenchConceptDocumentSearchResult[]> {
    const normalizedTarget = this.targetRuntime.normalizeTargetMemory(target, Date.now());
    if (!normalizedTarget?.notebookId) {
      throw new Error('搜索概念文档前请先设置目标笔记本。');
    }
    const normalizedQuery = normalizeString(query);
    if (!normalizedQuery) {
      throw new Error('请输入概念文档标题或路径关键字。');
    }
    const normalizedLimit = Math.min(Math.max(Math.floor(Number(limit) || 8), 1), 12);
    const rows = await this.deps.siyuanPort.sql<Array<Record<string, unknown>>[number]>(`
      SELECT id, content, hpath, box
      FROM blocks
      WHERE box = '${escapeSql(normalizedTarget.notebookId)}'
        AND type = 'd'
        AND (
          content LIKE '%${escapeSql(normalizedQuery)}%'
          OR hpath LIKE '%${escapeSql(normalizedQuery)}%'
        )
      ORDER BY updated DESC, id DESC
      LIMIT ${normalizedLimit}
    `);
    return rows
      .map((row) => ({
        id: normalizeString(row.id),
        title: normalizeString(row.content),
        hPath: normalizeString(row.hpath),
        notebookId: normalizeString(row.box) || normalizedTarget.notebookId,
        notebookName: normalizedTarget.notebookName,
      }))
      .filter((row) => row.id && row.title);
  }

  async createOrReuseConceptDocumentInNotebook(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    conceptName: string,
  ): Promise<{ document: AIWorkbenchConceptDocumentSearchResult; reused: boolean }> {
    const normalizedTarget = this.targetRuntime.normalizeTargetMemory(target, Date.now());
    if (!normalizedTarget?.notebookId) {
      throw new Error('新建概念文档前请先设置目标笔记本。');
    }
    const normalizedConceptName = normalizeString(conceptName);
    if (!normalizedConceptName) {
      throw new Error('概念名称不能为空。');
    }
    const existing = await this.findRootConceptDocumentInNotebook(
      normalizedTarget.notebookId,
      normalizedTarget.notebookName,
      normalizedConceptName,
    );
    if (existing) {
      return {
        document: existing,
        reused: true,
      };
    }
    const rootPath = `/${sanitizeDocTitle(normalizedConceptName)}`;
    const createdDocId = normalizeString(await this.deps.siyuanPort.createDocWithMarkdown(
      normalizedTarget.notebookId,
      rootPath,
      `# ${normalizedConceptName}`,
    ));
    const createdDocument = createdDocId
      ? await this.loadConceptDocumentById(createdDocId, normalizedTarget.notebookName, normalizedTarget.notebookId)
      : null;
    if (createdDocument) {
      return {
        document: createdDocument,
        reused: false,
      };
    }
    const resolved = await this.findRootConceptDocumentInNotebook(
      normalizedTarget.notebookId,
      normalizedTarget.notebookName,
      normalizedConceptName,
    );
    if (!resolved) {
      throw new Error('新建概念文档后仍未能定位到目标文档。');
    }
    return {
      document: resolved,
      reused: false,
    };
  }

  private async createNativeRiffCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
    mode: 'list-item' | 'mark' | 'heading' | 'super-block',
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.targetRuntime.resolveWriteTarget(args);
    const deckId = this.resolveDeckId(args, runtime) || this.deps.siyuanPort.BUILTIN_DECK_ID;
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const draftMarkdown = normalizeString(item.draftMarkdown || item.content);
      const summary = normalizeString(item.summary) || this.summarizeDraftMarkdown(draftMarkdown);
      if (!draftMarkdown) {
        results.push({ status: 'skipped', mode, summary, draftMarkdown, error: 'draftMarkdown 不能为空。' });
        continue;
      }

      try {
        if (mode === 'mark' && parseClozeMarkers(draftMarkdown).length === 0) {
          throw new Error('mark 模式的草稿必须包含合法的 ==标记==。');
        }
        const mutation = await this.markdownRuntime.insertMarkdown(draftMarkdown, target, previousSiblingId);
        const resolved = await this.resolveNativeRiffStructureWithFallback(mode, mutation);
        previousSiblingId = resolved.insertedRootBlockId || previousSiblingId;
        await this.deps.siyuanPort.addRiffCards(deckId, [resolved.riffBlockId]);
        results.push({
          status: 'created',
          mode,
          summary,
          draftMarkdown,
          insertedRootBlockId: resolved.insertedRootBlockId,
          sourceBlockIds: resolved.sourceBlockIds,
          riffBlockId: resolved.riffBlockId,
          xiuyuanId: null,
          cardIds: [],
          warnings: [],
        });
      } catch (error) {
        results.push({
          status: 'failed',
          mode,
          summary,
          draftMarkdown,
          insertedRootBlockId: null,
          sourceBlockIds: [],
          riffBlockId: null,
          xiuyuanId: null,
          cardIds: [],
          warnings: [],
          error: toErrorMessage(error, `${mode} 原生制卡失败。`),
        });
      }
    }

    await this.targetRuntime.persistSuccessfulTarget(target, results);
    return {
      mode,
      target: target.memory,
      deckId,
      createdCount: results.filter((item) => item.status === 'created').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      items: results,
    };
  }

  private async resolveSemanticCdfStructure(
    structure: AICdfStructure,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    context: AIWorkbenchContextSnapshot | null,
    options?: {
      preserveManualResolution?: boolean;
    },
  ): Promise<AICdfStructure> {
    const normalizedTarget = this.targetRuntime.normalizeTargetMemory(target, Date.now());
    if (!normalizedTarget?.notebookId) {
      throw new Error('CDF 制卡前请先设置目标笔记本。');
    }
    const contextConcepts = await this.collectContextConceptMap(context);
    const anchors = await Promise.all((structure.anchors || []).map(async (anchor) => {
      const conceptName = normalizeString(anchor.conceptName);
      const warnings = [...(anchor.warnings || [])].filter((warning) => warning !== CDF_UNRESOLVED_WARNING);
      if (
        options?.preserveManualResolution !== false
        && anchor.resolution?.status === 'resolved-manual'
        && anchor.resolution.conceptBlockId
      ) {
        return {
          ...anchor,
          resolution: {
            ...anchor.resolution,
            notebookId: normalizeString(anchor.resolution.notebookId) || normalizedTarget.notebookId,
          },
          warnings,
        } satisfies AICdfAnchor;
      }
      const contextMatch = contextConcepts.get(normalizeConceptTitleKey(conceptName));
      let resolution: AICdfAnchorResolution | null = null;
      if (contextMatch) {
        resolution = {
          status: 'resolved-context',
          conceptBlockId: contextMatch.id,
          conceptTitle: contextMatch.title,
          reason: '复用当前上下文中已出现的概念文档。',
          notebookId: null,
        };
      } else {
        const notebookMatch = await this.findExactConceptDocumentInNotebook(normalizedTarget.notebookId, conceptName);
        if (notebookMatch) {
          resolution = {
            status: 'resolved-notebook',
            conceptBlockId: notebookMatch.id,
            conceptTitle: notebookMatch.title,
            reason: '在目标笔记本中命中同名概念文档。',
            notebookId: normalizedTarget.notebookId,
          };
        } else {
          resolution = {
            status: 'unresolved',
            conceptBlockId: null,
            conceptTitle: conceptName,
            reason: '未在当前上下文或目标笔记本中解析到现有概念文档。',
            notebookId: normalizedTarget.notebookId,
          };
          warnings.push(CDF_UNRESOLVED_WARNING);
        }
      }
      return {
        ...anchor,
        resolution,
        warnings,
      } satisfies AICdfAnchor;
    }));
    return {
      anchors,
    };
  }

  private isResolutionCompatibleWithTarget(
    resolution: AICdfAnchorResolution,
    notebookId: string,
  ): boolean {
    if (resolution.status !== 'resolved-notebook' && resolution.status !== 'resolved-manual') {
      return true;
    }
    const resolutionNotebookId = normalizeString(resolution.notebookId);
    if (!resolutionNotebookId) {
      return true;
    }
    return resolutionNotebookId === normalizeString(notebookId);
  }

  private async collectContextConceptMap(
    context: AIWorkbenchContextSnapshot | null,
  ): Promise<Map<string, { id: string; title: string }>> {
    const blockIds = uniqueIds([
      ...(context?.selectedBlockIds || []),
      ...(context?.blocks || []).map((block) => block.blockId),
      ...(context?.currentCard?.sourceBlockIds || []),
      context?.currentCard?.blockId || null,
    ]);
    const conceptIds = new Set<string>();
    for (const blockId of blockIds) {
      try {
        const located = await findConceptByUpwardSearch(blockId, this.deps.siyuanPort as never);
        if (located?.conceptId) {
          conceptIds.add(located.conceptId);
        }
      } catch {
        // Ignore per-block lookup failures so one bad block doesn't break preview.
      }
    }
    if (conceptIds.size === 0) {
      return new Map();
    }
    const titles = await this.loadBlockTitles([...conceptIds]);
    return new Map(
      titles
        .map((item) => [normalizeConceptTitleKey(item.title), item] as const)
        .filter((entry) => entry[0]),
    );
  }

  private async loadBlockTitles(blockIds: string[]): Promise<Array<{ id: string; title: string }>> {
    if (blockIds.length === 0) {
      return [];
    }
    const escapedIds = blockIds.map((id) => `'${escapeSql(id)}'`).join(', ');
    const rows = await this.deps.siyuanPort.sql<Array<Record<string, unknown>>[number]>(`
      SELECT id, content
      FROM blocks
      WHERE id IN (${escapedIds})
      LIMIT ${Math.max(blockIds.length, 1)}
    `);
    return rows.map((row) => ({
      id: normalizeString(row.id),
      title: normalizeString(row.content),
    })).filter((row) => row.id && row.title);
  }

  private async findExactConceptDocumentInNotebook(
    notebookId: string,
    conceptName: string,
  ): Promise<{ id: string; title: string } | null> {
    const normalizedName = normalizeString(conceptName);
    if (!normalizedName) {
      return null;
    }
    const rows = await this.deps.siyuanPort.sql<Array<Record<string, unknown>>[number]>(`
      SELECT id, content
      FROM blocks
      WHERE box = '${escapeSql(notebookId)}'
        AND type = 'd'
        AND content = '${escapeSql(normalizedName)}'
      LIMIT 1
    `);
    const row = rows[0];
    const id = normalizeString(row?.id);
    return id
      ? {
        id,
        title: normalizeString(row?.content) || normalizedName,
      }
      : null;
  }

  private async findRootConceptDocumentInNotebook(
    notebookId: string,
    notebookName: string,
    conceptName: string,
  ): Promise<AIWorkbenchConceptDocumentSearchResult | null> {
    const normalizedName = normalizeString(conceptName);
    if (!normalizedName) {
      return null;
    }
    const hpaths = uniqueIds([
      `/${normalizedName}`,
      `/${sanitizeDocTitle(normalizedName)}`,
    ]);
    if (hpaths.length === 0) {
      return null;
    }
    const rows = await this.deps.siyuanPort.sql<Array<Record<string, unknown>>[number]>(`
      SELECT id, content, hpath, box
      FROM blocks
      WHERE box = '${escapeSql(notebookId)}'
        AND type = 'd'
        AND hpath IN (${hpaths.map((hpath) => `'${escapeSql(hpath)}'`).join(', ')})
      ORDER BY updated DESC, id DESC
      LIMIT 1
    `);
    return this.normalizeConceptDocumentSearchResult(rows[0], notebookName, notebookId);
  }

  private async loadConceptDocumentById(
    documentId: string,
    notebookName: string,
    notebookId: string,
  ): Promise<AIWorkbenchConceptDocumentSearchResult | null> {
    const normalizedDocumentId = normalizeString(documentId);
    if (!normalizedDocumentId) {
      return null;
    }
    const rows = await this.deps.siyuanPort.sql<Array<Record<string, unknown>>[number]>(`
      SELECT id, content, hpath, box
      FROM blocks
      WHERE id = '${escapeSql(normalizedDocumentId)}'
      LIMIT 1
    `);
    return this.normalizeConceptDocumentSearchResult(rows[0], notebookName, notebookId);
  }

  private normalizeConceptDocumentSearchResult(
    row: Record<string, unknown> | null | undefined,
    notebookName: string,
    notebookId: string,
  ): AIWorkbenchConceptDocumentSearchResult | null {
    const id = normalizeString(row?.id);
    const title = normalizeString(row?.content);
    if (!id || !title) {
      return null;
    }
    return {
      id,
      title,
      hPath: normalizeString(row?.hpath) || `/${title}`,
      notebookId: normalizeString(row?.box) || notebookId,
      notebookName: notebookName || notebookId,
    };
  }

  private buildPairMarkdown(front: string, back: string): string {
    return `* ${normalizeListText(front)}\n  * ${normalizeListText(back)}`;
  }

  private buildListMarkdown(parent: string, children: string[]): string {
    return [
      `* ${normalizeListText(parent)}`,
      ...children.map((child) => `  * ${normalizeListText(child)}`),
    ].join('\n');
  }

  private buildConceptMultilineMarkdown(concept: string, children: string[]): string {
    return [
      `* ${normalizeListText(concept)}:::`,
      ...children.map((child) => `  * ${normalizeListText(child)}`),
    ].join('\n');
  }

  private buildDescriptorMultilineMarkdown(concept: string, parent: string, children: string[]): string {
    if (!concept) {
      return [
        `* ${normalizeListText(parent)};;;`,
        ...children.map((child) => `  * ${normalizeListText(child)}`),
      ].join('\n');
    }
    return [
      `* ${normalizeListText(concept)}`,
      `  * ${normalizeListText(parent)};;;`,
      ...children.map((child) => `    * ${normalizeListText(child)}`),
    ].join('\n');
  }

  private buildSemanticCdfPlan(
    conceptBlockId: string,
    definition: AICdfDefinitionCandidate | null,
    descriptorGroups: AICdfDescriptorGroup[],
  ): SemanticCdfPlan {
    return {
      conceptBlockId,
      definitionText: normalizeListText(definition?.text || ''),
      descriptorGroups: descriptorGroups
        .map((group) => ({
          title: normalizeListText(group.title),
          items: group.items.map((item) => normalizeListText(item.text)).filter(Boolean),
        }))
        .filter((group) => group.title.length > 0 && group.items.length > 0),
    };
  }

  private buildSemanticCdfRootLine(plan: SemanticCdfPlan): string {
    return plan.definitionText
      ? `((${plan.conceptBlockId}))::${plan.definitionText}`
      : `((${plan.conceptBlockId}))`;
  }

  private buildSemanticCdfMarkdown(
    plan: SemanticCdfPlan,
  ): string {
    const rootLine = this.buildSemanticCdfRootLine(plan);
    const lines = [`* ${rootLine}`];
    for (const group of plan.descriptorGroups) {
      const title = group.title;
      const items = group.items;
      if (!title || items.length === 0) {
        continue;
      }
      if (items.length === 1) {
        lines.push(`  * ${title};;${items[0]}`);
        continue;
      }
      lines.push(`  * ${title};;;`);
      for (const item of items) {
        lines.push(`    * ${item}`);
      }
    }
    return lines.join('\n');
  }

  private async buildSemanticCdfScanResult(
    mutation: AISiyuanMutationResult,
    insertedRootBlockId: string,
    semanticPlan: SemanticCdfPlan,
  ): Promise<CdfScanResult> {
    const rows = await this.loadSemanticCdfMutationRowsWithRetry(mutation);
    const treeFromRows = this.buildSemanticCdfTreeFromRows(rows);
    if (treeFromRows) {
      return this.buildSemanticCdfScanFromTree(insertedRootBlockId, treeFromRows, undefined, semanticPlan);
    }

    const { kramdown } = await this.deps.siyuanPort.getBlockKramdown(insertedRootBlockId);
    const treeFromKramdown = await this.buildSemanticCdfTreeFromKramdown(insertedRootBlockId, normalizeString(kramdown));
    if (treeFromKramdown) {
      return this.buildSemanticCdfScanFromTree(insertedRootBlockId, treeFromKramdown, normalizeString(kramdown), semanticPlan);
    }

    throw new Error('未能从 mutation rows 或 kramdown 还原 CDF 列表结构。');
  }

  private async loadSemanticCdfMutationRowsWithRetry(
    mutation: AISiyuanMutationResult,
  ): Promise<MutationRow[]> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const rows = await this.markdownRuntime.loadMutationRows(mutation);
        if (rows.length > 0) {
          return rows;
        }
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) {
        await waitFor(attempt === 0 ? 20 : 40);
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    return [];
  }

  private buildSemanticCdfTreeFromRows(rows: MutationRow[]): SemanticCdfTreeNode | null {
    const ordered = this.sortedRows(rows);
    const listItems = ordered.filter((row) => normalizeString(row.type) === 'i' && normalizeString(row.id));
    if (listItems.length === 0) {
      return null;
    }
    const root = [...listItems].sort((left, right) => this.rowDepth(left, ordered) - this.rowDepth(right, ordered))[0];
    if (!root?.id) {
      return null;
    }
    const buildNode = (listItemId: string): SemanticCdfTreeNode | null => {
      const paragraph = ordered.find((row) => (
        normalizeString(row.parent_id) === listItemId && normalizeString(row.type) === 'p' && normalizeString(row.id)
      ));
      if (!paragraph?.id) {
        return null;
      }
      const directChildren = ordered
        .filter((row) => (
          normalizeString(row.parent_id) === listItemId
          && normalizeString(row.type) === 'l'
          && normalizeString(row.id)
        ))
        .flatMap((container) => ordered.filter((row) => (
          normalizeString(row.parent_id) === container.id
          && normalizeString(row.type) === 'i'
          && normalizeString(row.id)
        )))
        .map((child) => buildNode(child.id!))
        .filter((child): child is SemanticCdfTreeNode => Boolean(child));
      const markdown = normalizeString(paragraph.markdown) || normalizeString(paragraph.content);
      const text = normalizeString(paragraph.content) || markdown;
      return {
        listItemId,
        paragraphId: paragraph.id,
        text,
        markdown,
        depth: this.rowDepth(paragraph, ordered),
        children: directChildren,
      };
    };
    return buildNode(root.id) || null;
  }

  private async buildSemanticCdfTreeFromKramdown(
    insertedRootBlockId: string,
    kramdown: string,
  ): Promise<SemanticCdfTreeNode | null> {
    const lines = String(kramdown || '').split(/\r?\n/);
    const lineEntries = lines
      .map((line, index) => {
        const listItem = this.parseKramdownListItemLine(line);
        if (!listItem) {
          return null;
        }
        return {
          listItemId: listItem.id,
          paragraphId: this.resolveFollowingKramdownParagraphId(lines, index, listItem.indent),
          depth: listItem.depth,
          text: listItem.text,
        };
      })
      .filter((entry): entry is { listItemId: string; paragraphId: string; depth: number; text: string } => Boolean(entry?.listItemId));
    if (lineEntries.length === 0) {
      return null;
    }

    const paragraphRows = await this.loadParagraphRowsForListItems(lineEntries.map((entry) => entry.listItemId));
    const paragraphByParentId = new Map(
      paragraphRows
        .filter((row) => normalizeString(row.parent_id) && normalizeString(row.id))
        .map((row) => [normalizeString(row.parent_id), row] as const),
    );
    const rootEntry = lineEntries[0];
    const stack: SemanticCdfTreeNode[] = [];
    let rootNode: SemanticCdfTreeNode | null = null;
    for (const entry of lineEntries) {
      const paragraph = paragraphByParentId.get(entry.listItemId);
      const paragraphId = normalizeString(paragraph?.id) || entry.paragraphId || entry.listItemId;
      const markdownText = normalizeString(paragraph?.markdown) || entry.text;
      const text = normalizeString(paragraph?.content) || entry.text;
      const node: SemanticCdfTreeNode = {
        listItemId: entry.listItemId,
        paragraphId,
        text,
        markdown: markdownText,
        depth: entry.depth,
        children: [],
      };
      while (stack.length > entry.depth) {
        stack.pop();
      }
      const parent = stack[stack.length - 1] || null;
      if (parent) {
        parent.children.push(node);
      } else if (!rootNode) {
        rootNode = node;
      }
      stack[entry.depth] = node;
    }
    if (rootNode) {
      return rootNode;
    }
    const rootParagraph = paragraphByParentId.get(rootEntry.listItemId);
    const rootParagraphId = normalizeString(rootParagraph?.id) || rootEntry.paragraphId || rootEntry.listItemId || insertedRootBlockId;
    if (!rootParagraphId) {
      return null;
    }
    return {
      listItemId: rootEntry.listItemId || insertedRootBlockId,
      paragraphId: rootParagraphId,
      text: normalizeString(rootParagraph?.content) || rootEntry.text,
      markdown: normalizeString(rootParagraph?.markdown) || rootEntry.text,
      depth: rootEntry.depth,
      children: [],
    };
  }

  private extractKramdownAttributeId(source: string): string {
    const match = String(source || '').match(/\bid="([^"]+)"/);
    return normalizeString(match?.[1]);
  }

  private parseKramdownListItemLine(line: string): {
    id: string;
    indent: number;
    depth: number;
    text: string;
  } | null {
    const match = String(line || '').match(/^(\s*)[*+-]\s+\{:\s*([^}]*)\}\s*(.*)$/);
    if (!match) {
      return null;
    }
    const id = this.extractKramdownAttributeId(match[2] || '');
    if (!id) {
      return null;
    }
    const indent = match[1]?.length || 0;
    return {
      id,
      indent,
      depth: Math.floor(indent / 2),
      text: normalizeString(match[3]),
    };
  }

  private parseKramdownAttributeOnlyLineId(line: string): string {
    const match = String(line || '').match(/^\s*\{:\s*([^}]*)\}\s*$/);
    return match ? this.extractKramdownAttributeId(match[1] || '') : '';
  }

  private resolveFollowingKramdownParagraphId(
    lines: string[],
    listLineIndex: number,
    listIndent: number,
  ): string {
    for (let index = listLineIndex + 1; index < lines.length; index += 1) {
      const line = lines[index] || '';
      if (!line.trim()) {
        continue;
      }
      if (this.parseKramdownListItemLine(line)) {
        return '';
      }
      const id = this.parseKramdownAttributeOnlyLineId(line);
      const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
      if (id && indent > listIndent) {
        return id;
      }
      return '';
    }
    return '';
  }

  private async loadParagraphRowsForListItems(listItemIds: string[]): Promise<MutationRow[]> {
    const normalizedIds = uniqueIds(listItemIds);
    if (normalizedIds.length === 0) {
      return [];
    }
    const escapedIds = normalizedIds.map((id) => `'${escapeSql(id)}'`).join(', ');
    return this.deps.siyuanPort.sql<MutationRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort
      FROM blocks
      WHERE parent_id IN (${escapedIds})
        AND type = 'p'
      ORDER BY sort ASC, id ASC
    `);
  }

  private buildSemanticCdfScanFromTree(
    insertedRootBlockId: string,
    rootNode: SemanticCdfTreeNode,
    parentKramdownOverride?: string,
    semanticPlan?: SemanticCdfPlan,
  ): CdfScanResult {
    const buildNode = (node: SemanticCdfTreeNode, groupPlan?: SemanticCdfDescriptorGroupPlan): CdfScanNode => {
      const explicitMarkerKind = detectDescriptorOrDefinitionKind(node.markdown || node.text || '');
      const recursiveMarkerKind = explicitMarkerKind !== 'none' || node.children.length === 0
        ? explicitMarkerKind
        : this.detectFirstSemanticChildKind(node.children);
      const markerKind = explicitMarkerKind !== 'none' ? explicitMarkerKind : recursiveMarkerKind;
      const childListItemIds = node.children.map((child) => child.listItemId);
      if (groupPlan) {
        const plannedMarkerKind: CdfNodeKind = groupPlan.items.length > 1
          ? 'descriptor-multiline'
          : 'descriptor-forward';
        const plannedKramdown = groupPlan.items.length > 1
          ? `${groupPlan.title};;;`
          : `${groupPlan.title};;${groupPlan.items[0] || ''}`;
        const descriptorMeta = groupPlan.items.length === 1
          ? parseCueAndAnswer(groupPlan.items[0] || '')
          : null;
        const plannedNode: CdfScanNode = {
          id: node.listItemId,
          subtype: '',
          firstParagraphId: node.paragraphId,
          firstParagraphText: plannedKramdown || node.text,
          firstParagraphKramdown: plannedKramdown || node.markdown,
          markerKind: plannedMarkerKind,
          explicitMarkerKind: plannedMarkerKind,
          recursiveMarkerKind: plannedMarkerKind,
          hasDocumentReference: /\(\(\d{14}-[a-z0-9]{7}/i.test(node.markdown),
          orderedChildListItemIds: [],
          unorderedChildListItemIds: plannedMarkerKind === 'descriptor-multiline' ? childListItemIds : [],
        };
        if (descriptorMeta) {
          plannedNode.descriptorMeta = {
            groupHint: groupPlan.title,
            cue: descriptorMeta.cue,
            answer: descriptorMeta.answer,
          };
        }
        return plannedNode;
      }
      return {
        id: node.listItemId,
        subtype: '',
        firstParagraphId: node.paragraphId,
        firstParagraphText: node.text,
        firstParagraphKramdown: node.markdown,
        markerKind,
        explicitMarkerKind,
        recursiveMarkerKind,
        hasDocumentReference: /\(\(\d{14}-[a-z0-9]{7}/i.test(node.markdown),
        orderedChildListItemIds: [],
        unorderedChildListItemIds: markerKind === 'descriptor-multiline' ? childListItemIds : [],
      };
    };
    const plannedParentKramdown = semanticPlan ? this.buildSemanticCdfRootLine(semanticPlan) : '';
    return {
      parentBlockId: rootNode.listItemId || insertedRootBlockId,
      parentParagraphId: rootNode.paragraphId,
      parentParagraphText: plannedParentKramdown || rootNode.text,
      parentParagraphKramdown: plannedParentKramdown || rootNode.markdown,
      parentKramdown: plannedParentKramdown || parentKramdownOverride || rootNode.markdown,
      nodes: rootNode.children.map((child, index) => buildNode(child, semanticPlan?.descriptorGroups[index])),
      stoppedByDocumentReference: false,
    };
  }

  private detectFirstSemanticChildKind(children: SemanticCdfTreeNode[]): CdfNodeKind {
    for (const child of children) {
      const kind = detectDescriptorOrDefinitionKind(child.markdown || child.text || '');
      if (kind !== 'none') {
        return kind;
      }
      const nestedKind = this.detectFirstSemanticChildKind(child.children);
      if (nestedKind !== 'none') {
        return nestedKind;
      }
    }
    return 'none';
  }

  private requireSelectionExcerptService(): SelectionExcerptService {
    const service = this.deps.getSelectionExcerptService?.();
    if (!service) {
      throw new Error('AI excerpt tools are not initialized.');
    }
    return service;
  }

  private requireSelectionTopicContinuationService(): SelectionTopicContinuationService {
    const service = this.deps.getSelectionTopicContinuationService?.();
    if (!service) {
      throw new Error('AI topic continuation tools are not initialized.');
    }
    return service;
  }

  private resolveSelectionInput(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
    options?: {
      allowBlockMenuOrigin?: boolean;
    },
  ): ResolvedSelectionInput {
    const context = runtime.context;
    const blocks = Array.isArray(context?.blocks) ? context.blocks : [];
    const firstBlock = blocks[0];
    const currentCard = context?.currentCard;
    const sourceBlockId = normalizeString(args.sourceBlockId)
      || normalizeString(firstBlock?.blockId)
      || normalizeString(currentCard?.blockId);
    const sourceBlockIds = uniqueIds(
      Array.isArray(args.sourceBlockIds)
        ? args.sourceBlockIds as Array<string | null | undefined>
        : (context?.selectedBlockIds?.length
          ? context.selectedBlockIds
          : (blocks.length > 0
            ? blocks.map((block) => block.blockId)
            : (currentCard?.sourceBlockIds || []))),
    );
    const selectedText = normalizeString(args.selectedText)
      || normalizeString(args.content)
      || normalizeString(blocks.map((block) => normalizeString(block.text)).filter(Boolean).join('\n\n'))
      || normalizeString(currentCard?.sourceText);
    const fallbackOrigin: ResolvedSelectionInput['origin'] = context?.source === 'review' ? 'review' : 'editor';
    const origin = normalizeSelectionOrigin(
      args.origin,
      options?.allowBlockMenuOrigin ? fallbackOrigin : (fallbackOrigin === 'review' ? 'review' : 'editor'),
    );
    const missingInfo: string[] = [];
    if (!sourceBlockId) {
      missingInfo.push('sourceBlockId');
    }
    if (!selectedText) {
      missingInfo.push('selectedText');
    }
    return {
      sourceBlockId,
      sourceBlockIds: sourceBlockIds.length > 0 ? sourceBlockIds : uniqueIds([sourceBlockId]),
      selectedText,
      rootId: normalizeString(args.rootId) || normalizeString(firstBlock?.rootId) || undefined,
      blockType: normalizeString(firstBlock?.type) || null,
      origin,
      missingInfo,
    };
  }

  private prepareTopicContinuation(selection: ResolvedSelectionInput): ReturnType<SelectionTopicContinuationService['prepareSelection']> | null {
    if (selection.missingInfo.length > 0) {
      return null;
    }
    try {
      return this.requireSelectionTopicContinuationService().prepareSelection({
        sourceBlockId: selection.sourceBlockId,
        sourceBlockIds: selection.sourceBlockIds,
        selectedText: selection.selectedText,
        ...(selection.rootId ? { rootId: selection.rootId } : {}),
        origin: selection.origin,
      });
    } catch {
      return null;
    }
  }

  private resolveFirstTextBlock(rows: MutationRow[]): string {
    const first = this.sortedRows(rows).find((row) => {
      const type = normalizeString(row.type);
      return type === 'p' || type === 'h' || type === 't' || type === 'm' || type === 'i';
    });
    if (!first?.id) {
      throw new Error('未找到插入后的文本块。');
    }
    return first.id;
  }

  private resolvePairBlocks(rows: MutationRow[]): { insertedRootBlockId: string; frontBlockId: string; backBlockId: string } {
    const structure = this.resolveListStructure(rows);
    return {
      insertedRootBlockId: structure.parentListItemId,
      frontBlockId: structure.parentTextBlockId,
      backBlockId: structure.childTextBlockIds[0] || structure.childListItemIds[0],
    };
  }

  private resolveListStructure(rows: MutationRow[]): {
    parentListItemId: string;
    parentTextBlockId: string;
    childListItemIds: string[];
    childTextBlockIds: string[];
    conceptBlockId?: string;
  } {
    const ordered = this.sortedRows(rows);
    const listItems = ordered.filter((row) => normalizeString(row.type) === 'i' && normalizeString(row.id));
    if (listItems.length === 0) {
      throw new Error('未找到插入后的列表项。');
    }
    const parentListItem = [...listItems].sort((left, right) => this.rowDepth(left, ordered) - this.rowDepth(right, ordered))[0]!;
    const childListItems = listItems
      .filter((row) => row.id !== parentListItem.id && this.isDescendantOf(row.id!, parentListItem.id!, ordered))
      .sort((left, right) => this.rowDepth(left, ordered) - this.rowDepth(right, ordered));
    if (childListItems.length === 0) {
      throw new Error('未找到插入后的子列表项。');
    }
    return {
      parentListItemId: parentListItem.id!,
      parentTextBlockId: this.resolveTextBlockForListItem(parentListItem.id!, ordered),
      childListItemIds: childListItems.map((row) => row.id!),
      childTextBlockIds: childListItems.map((row) => this.resolveTextBlockForListItem(row.id!, ordered)),
      conceptBlockId: this.resolveTextBlockForListItem(parentListItem.id!, ordered),
    };
  }

  private resolveRootListItemId(rows: MutationRow[]): string {
    const ordered = this.sortedRows(rows);
    const listItems = ordered.filter((row) => normalizeString(row.type) === 'i' && normalizeString(row.id));
    if (listItems.length === 0) {
      throw new Error('未找到插入后的列表项。');
    }
    return [...listItems].sort((left, right) => this.rowDepth(left, ordered) - this.rowDepth(right, ordered))[0]!.id!;
  }

  private async resolveInsertedListRootItemIdWithFallback(
    mutation: AISiyuanMutationResult,
  ): Promise<string> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      if (rows.length > 0) {
        try {
          return this.resolveRootListItemId(rows);
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < 2) {
        await waitFor(attempt === 0 ? 20 : 40);
      }
    }
    const rootBlockId = this.resolveMutationQuestionRootId(mutation);
    if (rootBlockId) {
      const kramdown = await this.deps.siyuanPort.getBlockKramdown(rootBlockId);
      const resolved = this.resolveRootListItemIdFromKramdown(rootBlockId, normalizeString(kramdown?.kramdown));
      if (resolved) {
        return resolved;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('未找到插入后的列表项。');
  }

  private resolveDescriptorMultilineStructure(rows: MutationRow[]): {
    parentListItemId: string;
    parentTextBlockId: string;
    childListItemIds: string[];
    childTextBlockIds: string[];
    conceptBlockId?: string;
  } {
    const ordered = this.sortedRows(rows);
    const listItems = ordered.filter((row) => normalizeString(row.type) === 'i' && normalizeString(row.id));
    if (listItems.length === 0) {
      throw new Error('未找到插入后的列表项。');
    }
    const root = [...listItems].sort((left, right) => this.rowDepth(left, ordered) - this.rowDepth(right, ordered))[0]!;
    const descendants = listItems.filter((row) => row.id !== root.id && this.isDescendantOf(row.id!, root.id!, ordered));
    const parent = descendants[0];
    if (!parent?.id) {
      return this.resolveListStructure(rows);
    }
    const children = descendants.filter((row) => row.id !== parent.id && this.isDescendantOf(row.id!, parent.id!, ordered));
    if (children.length === 0) {
      throw new Error('未找到 descriptor multiline 的子列表项。');
    }
    return {
      parentListItemId: parent.id,
      parentTextBlockId: this.resolveTextBlockForListItem(parent.id, ordered),
      childListItemIds: children.map((row) => row.id!).filter(Boolean),
      childTextBlockIds: children.map((row) => this.resolveTextBlockForListItem(row.id!, ordered)),
      conceptBlockId: this.resolveTextBlockForListItem(root.id!, ordered),
    };
  }

  private resolveNativeRiffStructure(
    mode: 'list-item' | 'mark' | 'heading' | 'super-block',
    rows: MutationRow[],
  ): {
    insertedRootBlockId: string;
    riffBlockId: string;
    sourceBlockIds: string[];
  } {
    if (mode === 'list-item') {
      const structure = this.resolveListStructure(rows);
      return {
        insertedRootBlockId: structure.parentListItemId,
        riffBlockId: structure.parentListItemId,
        sourceBlockIds: [structure.parentListItemId, ...structure.childListItemIds],
      };
    }
    if (mode === 'mark') {
      const blockId = this.resolveFirstTextBlock(rows);
      return {
        insertedRootBlockId: blockId,
        riffBlockId: blockId,
        sourceBlockIds: [blockId],
      };
    }
    if (mode === 'heading') {
      const heading = this.sortedRows(rows).find((row) => normalizeString(row.type) === 'h' && normalizeString(row.id));
      if (!heading?.id) {
        throw new Error('未找到插入后的标题块。');
      }
      return {
        insertedRootBlockId: heading.id,
        riffBlockId: heading.id,
        sourceBlockIds: [heading.id],
      };
    }
    const superBlock = this.sortedRows(rows).find((row) => normalizeString(row.type) === 's' && normalizeString(row.id));
    if (!superBlock?.id) {
      throw new Error('未找到插入后的超级块。');
    }
    return {
      insertedRootBlockId: superBlock.id,
      riffBlockId: superBlock.id,
      sourceBlockIds: [superBlock.id],
    };
  }

  private async resolveNativeRiffStructureWithFallback(
    mode: 'list-item' | 'mark' | 'heading' | 'super-block',
    mutation: AISiyuanMutationResult,
  ): Promise<{
    insertedRootBlockId: string;
    riffBlockId: string;
    sourceBlockIds: string[];
  }> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rows = await this.markdownRuntime.loadMutationRows(mutation);
      if (rows.length > 0) {
        try {
          return this.resolveNativeRiffStructure(mode, rows);
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < 2) {
        await waitFor(attempt === 0 ? 20 : 40);
      }
    }
    if (mode === 'list-item') {
      const rootBlockId = this.resolveMutationQuestionRootId(mutation);
      if (rootBlockId) {
        const kramdown = await this.deps.siyuanPort.getBlockKramdown(rootBlockId);
        const resolved = this.resolveListItemStructureFromKramdown(rootBlockId, normalizeString(kramdown?.kramdown));
        if (resolved) {
          return resolved;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${mode} 原生制卡失败。`);
  }

  private resolveMutationQuestionRootId(mutation: AISiyuanMutationResult): string | null {
    const operations = mutation.doOperations
      .map((operation) => ({
        id: normalizeString(operation.id),
        parentId: normalizeString(operation.parentID),
      }))
      .filter((operation) => Boolean(operation.id));
    if (operations.length === 0) {
      return null;
    }
    const byId = new Map(operations.map((operation) => [operation.id, operation] as const));
    const childrenByParent = new Map<string, string[]>();
    for (const operation of operations) {
      if (!operation.parentId) {
        continue;
      }
      childrenByParent.set(operation.parentId, [...(childrenByParent.get(operation.parentId) || []), operation.id]);
    }
    const descendantCount = (id: string): number => {
      const children = childrenByParent.get(id) || [];
      return children.reduce((total, childId) => total + 1 + descendantCount(childId), 0);
    };
    const roots = operations
      .filter((operation) => !operation.parentId || !byId.has(operation.parentId))
      .sort((left, right) => descendantCount(right.id) - descendantCount(left.id));
    const root = roots[0] || operations[0];
    const directChildren = childrenByParent.get(root.id) || [];
    if (directChildren.length === 1 && (childrenByParent.get(directChildren[0]!) || []).length > 0) {
      return directChildren[0]!;
    }
    return root.id;
  }

  private resolveListItemStructureFromKramdown(
    rootBlockId: string,
    kramdown: string,
  ): {
    insertedRootBlockId: string;
    riffBlockId: string;
    sourceBlockIds: string[];
  } | null {
    const lines = String(kramdown || '').split(/\r?\n/);
    const listItemLines = lines
      .map((line, index) => {
        const listItem = this.parseKramdownListItemLine(line);
        if (!listItem) {
          return null;
        }
        return {
          id: listItem.id,
          indent: listItem.indent,
          index,
        };
      })
      .filter((entry): entry is { id: string; indent: number; index: number } => Boolean(entry?.id));
    if (listItemLines.length === 0) {
      return null;
    }
    const questionItem = listItemLines[0]!;
    const answerItem = listItemLines.find((entry) => (
      entry.index > questionItem.index && entry.indent > questionItem.indent
    )) || null;
    return {
      insertedRootBlockId: questionItem.id || rootBlockId,
      riffBlockId: questionItem.id || rootBlockId,
      sourceBlockIds: uniqueIds([questionItem.id || rootBlockId, answerItem?.id || null]),
    };
  }

  private resolveRootListItemIdFromKramdown(rootBlockId: string, kramdown: string): string | null {
    const firstListItemId = String(kramdown || '')
      .split(/\r?\n/)
      .map((line) => this.parseKramdownListItemLine(line))
      .find((entry) => Boolean(entry?.id))
      ?.id;
    return normalizeString(firstListItemId) || rootBlockId || null;
  }

  private resolveTextBlockForListItem(listItemId: string, rows: MutationRow[]): string {
    const directParagraph = this.sortedRows(rows).find((row) => (
      normalizeString(row.parent_id) === listItemId && normalizeString(row.type) === 'p'
    ));
    return directParagraph?.id || listItemId;
  }

  private sortedRows(rows: MutationRow[]): MutationRow[] {
    return [...rows].sort((left, right) => {
      const leftSort = Number(left.sort ?? 0);
      const rightSort = Number(right.sort ?? 0);
      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      return normalizeString(left.id).localeCompare(normalizeString(right.id));
    });
  }

  private rowDepth(row: MutationRow, rows: MutationRow[]): number {
    let depth = 0;
    let currentParentId = normalizeString(row.parent_id);
    const byId = new Map(rows.map((entry) => [normalizeString(entry.id), entry] as const));
    while (currentParentId && byId.has(currentParentId)) {
      depth += 1;
      currentParentId = normalizeString(byId.get(currentParentId)?.parent_id);
    }
    return depth;
  }

  private isDescendantOf(candidateId: string, ancestorId: string, rows: MutationRow[]): boolean {
    const byId = new Map(rows.map((entry) => [normalizeString(entry.id), entry] as const));
    let currentParentId = normalizeString(byId.get(candidateId)?.parent_id);
    while (currentParentId) {
      if (currentParentId === ancestorId) {
        return true;
      }
      currentParentId = normalizeString(byId.get(currentParentId)?.parent_id);
    }
    return false;
  }

  private async loadTargetBlock(blockId: string): Promise<AISiyuanBlockRow> {
    const rows = await this.deps.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown
      FROM blocks
      WHERE id = '${escapeSql(blockId)}'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row || !normalizeString(row.id)) {
      throw new Error('未找到目标文档或块，请检查块 ID 是否有效。');
    }
    return row;
  }

  private summarizeDraftMarkdown(markdown: string): string {
    const firstLine = String(markdown || '')
      .split(/\r?\n/)
      .map((line) => normalizeString(line))
      .find(Boolean) || '';
    return normalizeString(
      firstLine
        .replace(/^#+\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/:::+$/, '')
        .replace(/;;;+$/, '')
        .replace(/==/g, ''),
    ) || '未命名草稿';
  }

  private resolveDeckId(args: Record<string, unknown>, runtime: AIChatToolRuntimeContext): string | undefined {
    const explicit = normalizeString(args.deckId);
    if (explicit) {
      return explicit;
    }
    const currentCard = runtime.context?.currentCardRaw as { deckId?: unknown; deckID?: unknown } | undefined;
    return normalizeString(currentCard?.deckId) || normalizeString(currentCard?.deckID) || undefined;
  }
}
