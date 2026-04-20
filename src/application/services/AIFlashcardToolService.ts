import type { AISiyuanBlockRow, AISiyuanMutationResult, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { CreateListTemplateCardsCommand } from '@/application/commands/xiuyuan/CreateListTemplateCardsCommand';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { AIChatToolRuntimeContext } from '@/application/services/AIChatToolExecutorService';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { findConceptByUpwardSearch } from '@/application/usecases/xiuyuan/shared/ConceptLocator';
import type {
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfStructure,
  AIWorkbenchCdfCreationItemResult,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchContextSnapshot,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
} from '@/types/ai';

type AIFlashcardXiuyuanService = Pick<XiuyuanApplicationService, 'createFromBlocks' | 'createListTemplateCards'>;
type MutationRow = AISiyuanBlockRow & { sort?: string | number };
type ResolvedWriteTarget = {
  memory: AIWorkbenchSelfTestCardTargetMemory;
  targetBlockId: string;
  writeMode: 'append' | 'after';
};

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

function parseTargetInput(args: Record<string, unknown>): AIWorkbenchSelfTestCardTargetInput | null {
  const targetMode = normalizeString(args.targetMode);
  if (!targetMode || targetMode === 'default') {
    return null;
  }
  return {
    mode: targetMode === 'block' ? 'block' : 'daily-note',
    notebookId: normalizeString(args.notebookId),
    notebookName: normalizeString(args.notebookName),
    targetBlockId: normalizeString(args.targetBlockId) || null,
    targetLabel: normalizeString(args.targetLabel),
  };
}

function parseClozeMarkers(content: string): Array<{ text: string; start: number; end: number; type: string }> {
  const markers: Array<{ text: string; start: number; end: number; type: string }> = [];
  const regex = /==([\s\S]+?)==/g;
  let match: RegExpExecArray | null = regex.exec(content);
  while (match) {
    const raw = match[1] || '';
    markers.push({
      text: raw,
      start: match.index,
      end: match.index + match[0].length,
      type: 'text',
    });
    match = regex.exec(content);
  }
  return markers;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AIFlashcardToolService {
  constructor(private readonly deps: {
    siyuanPort: AISiyuanPort;
    getXiuyuanApplicationService: () => Promise<AIFlashcardXiuyuanService>;
    loadDefaultTarget: () => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
    saveDefaultTarget: (target: AIWorkbenchSelfTestCardTargetMemory) => Promise<AIWorkbenchSelfTestCardTargetMemory | null>;
  }) {}

  async createPairCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const mode = normalizeString(args.mode) === 'bidirectional' ? 'bidirectional' : 'basic-qa';
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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
      const mutation = await this.insertMarkdown(
        this.buildPairMarkdown(front, back),
        target,
        previousSiblingId,
      );
      const rows = await this.loadMutationRows(mutation);
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
      const creation = await xiuyuanService.createFromBlocks(command);
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

    await this.persistSuccessfulTarget(target, results);
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
    const config = {
      quick: { templateId: 'builtin-quick-card', cardType: 'item' as const, creationMode: 'ai-tool:quick-card' },
      'bidirectional-single': { templateId: 'builtin-bidirectional-single', cardType: 'item' as const, creationMode: 'ai-tool:bidirectional-single' },
      'multi-cloze': { templateId: 'builtin-multi-cloze', cardType: 'cloze' as const, creationMode: 'ai-tool:multi-cloze' },
      concept: { templateId: 'builtin-concept-simple', cardType: 'concept' as const, creationMode: 'ai-tool:concept-card' },
    }[mode as 'quick' | 'bidirectional-single' | 'multi-cloze' | 'concept'];
    if (!config) {
      throw new Error(`不支持的 inline 模式：${mode}`);
    }

    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const content = normalizeString(item.content);
      if (!content) {
        results.push({ status: 'skipped', error: 'content 不能为空。' });
        continue;
      }
      const mutation = await this.insertMarkdown(content, target, previousSiblingId);
      const rows = await this.loadMutationRows(mutation);
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
      const creation = await xiuyuanService.createFromBlocks(command);
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

    await this.persistSuccessfulTarget(target, results);
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
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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
      const mutation = await this.insertMarkdown(this.buildPairMarkdown(concept, definition), target, previousSiblingId);
      const rows = await this.loadMutationRows(mutation);
      const pair = this.resolvePairBlocks(rows);
      previousSiblingId = pair.insertedRootBlockId || previousSiblingId;
      const templateId = direction === 'forward'
        ? 'builtin-concept-definition-forward'
        : direction === 'reverse'
          ? 'builtin-concept-definition-reverse'
          : 'builtin-concept-definition';
      const creation = await xiuyuanService.createFromBlocks({
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

    await this.persistSuccessfulTarget(target, results);
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
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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

      const conceptMutation = await this.insertMarkdown(concept, target, previousSiblingId);
      const conceptRows = await this.loadMutationRows(conceptMutation);
      const conceptBlockId = this.resolveFirstTextBlock(conceptRows);
      previousSiblingId = conceptBlockId || previousSiblingId;

      let definitionResult: { xiuyuanId?: string; cardIds?: string[]; blockId?: string } | null = null;
      if (definition) {
        const definitionMutation = await this.insertMarkdown(definition, target, previousSiblingId);
        const definitionRows = await this.loadMutationRows(definitionMutation);
        const definitionBlockId = this.resolveFirstTextBlock(definitionRows);
        previousSiblingId = definitionBlockId || previousSiblingId;
        const creation = await xiuyuanService.createFromBlocks({
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
        const descriptorMutation = await this.insertMarkdown(descriptorContent, target, previousSiblingId);
        const descriptorRows = await this.loadMutationRows(descriptorMutation);
        const descriptorBlockId = this.resolveFirstTextBlock(descriptorRows);
        previousSiblingId = descriptorBlockId || previousSiblingId;
        const templateId = direction === 'reverse'
          ? 'builtin-concept-descriptor-reverse'
          : direction === 'both'
            ? 'builtin-concept-descriptor-both'
            : 'builtin-concept-descriptor';
        const creation = await xiuyuanService.createFromBlocks({
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

    await this.persistSuccessfulTarget(target, results);
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
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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
      const mutation = await this.insertMarkdown(this.buildListMarkdown(parent, children), target, previousSiblingId);
      const rows = await this.loadMutationRows(mutation);
      const structure = this.resolveListStructure(rows);
      previousSiblingId = structure.parentListItemId || previousSiblingId;
      const command: CreateListTemplateCardsCommand = {
        parentBlockId: structure.parentListItemId,
        childBlockIds: structure.childListItemIds,
        templateId: 'builtin-list-item',
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        creationMode: normalizeString(item.creationMode) === 'summary-v1' ? 'summary-v1' : 'split-v2',
        cardType: normalizeString(item.cardType) === 'descriptor' ? 'descriptor' : 'item',
        listKind: 'default',
      };
      const creation = await xiuyuanService.createListTemplateCards(command);
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

    await this.persistSuccessfulTarget(target, results);
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
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
    const deckId = this.resolveDeckId(args, runtime);
    let previousSiblingId = target.targetBlockId;
    const results = [];

    for (const item of items) {
      const mode = normalizeString(item.mode) === 'descriptor-multiline' ? 'descriptor-multiline' : 'concept-multiline';
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
      const mutation = await this.insertMarkdown(markdown, target, previousSiblingId);
      const rows = await this.loadMutationRows(mutation);
      const structure = mode === 'descriptor-multiline'
        ? this.resolveDescriptorMultilineStructure(rows)
        : this.resolveListStructure(rows);
      previousSiblingId = structure.parentListItemId || previousSiblingId;
      const command: CreateListTemplateCardsCommand = {
        parentBlockId: structure.parentListItemId,
        childBlockIds: structure.childListItemIds,
        templateId: mode === 'descriptor-multiline'
          ? 'builtin-list-descriptor-multiline'
          : 'builtin-list-concept-multiline',
        ...(deckId ? { deckId } : {}),
        ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
        creationMode: 'split-v2',
        cardType: mode === 'descriptor-multiline' ? 'descriptor' : 'item',
        listKind: mode,
        ...(structure.conceptBlockId ? { conceptBlockId: structure.conceptBlockId } : {}),
      };
      const creation = await xiuyuanService.createListTemplateCards(command);
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

    await this.persistSuccessfulTarget(target, results);
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
    const target = await this.resolveWriteTarget(args);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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
      try {
        const mutation = await this.insertMarkdown(draftMarkdown, target, previousSiblingId);
        const rows = await this.loadMutationRows(mutation);
        const structure = mode === 'descriptor-multiline'
          ? this.resolveDescriptorMultilineStructure(rows)
          : this.resolveListStructure(rows);
        previousSiblingId = structure.parentListItemId || previousSiblingId;
        const command: CreateListTemplateCardsCommand = {
          parentBlockId: structure.parentListItemId,
          childBlockIds: structure.childListItemIds,
          templateId: mode === 'descriptor-multiline'
            ? 'builtin-list-descriptor-multiline'
            : 'builtin-list-concept-multiline',
          ...(deckId ? { deckId } : {}),
          ...(normalizePriority(args.priority) ? { priority: normalizePriority(args.priority) } : {}),
          creationMode: 'split-v2',
          cardType: mode === 'descriptor-multiline' ? 'descriptor' : 'item',
          listKind: mode,
          ...(structure.conceptBlockId ? { conceptBlockId: structure.conceptBlockId } : {}),
        };
        const creation = await xiuyuanService.createListTemplateCards(command);
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

    await this.persistSuccessfulTarget(target, results);
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
  ): Promise<AICdfStructure> {
    return this.resolveSemanticCdfStructure(structure, target, runtime.context);
  }

  async createSemanticCdfCards(
    structure: AICdfStructure,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    runtime: AIChatToolRuntimeContext,
  ): Promise<AIWorkbenchCdfCreationResult> {
    const resolvedStructure = await this.resolveSemanticCdfStructure(structure, target, runtime.context);
    const resolvedTarget = await this.resolveTargetFromInput(target);
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
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
          createdDefinitions: [],
          createdDescriptors: [],
          warnings: baseWarnings.length > 0 ? baseWarnings : ['未解析到现有概念文档，已跳过。'],
          error: null,
        });
        continue;
      }

      const selectedDefinitions = anchor.definitionCandidates.filter((definition) => (
        definition.selected !== false && normalizeString(definition.text)
      ));
      const selectedDescriptors = anchor.descriptorGroups.flatMap((group) => (
        group.selected === false
          ? []
          : group.items
            .filter((item) => item.selected !== false && normalizeString(item.text))
            .map((item) => ({ group, item }))
      ));

      if (selectedDefinitions.length === 0 && selectedDescriptors.length === 0) {
        itemResults.push({
          anchorId: anchor.id,
          conceptName: anchor.conceptName,
          status: 'skipped',
          conceptBlockId: resolution.conceptBlockId,
          createdDefinitions: [],
          createdDescriptors: [],
          warnings: [...baseWarnings, '该概念没有选中的定义或描述符条目。'],
          error: null,
        });
        continue;
      }

      const createdDefinitions: AIWorkbenchCdfCreationItemResult['createdDefinitions'] = [];
      const createdDescriptors: AIWorkbenchCdfCreationItemResult['createdDescriptors'] = [];
      const warnings = [...baseWarnings];
      let anchorFailed = false;
      let anchorError: string | null = null;

      try {
        for (const definition of selectedDefinitions) {
          const mutation = await this.insertMarkdown(definition.text, resolvedTarget, previousSiblingId);
          const rows = await this.loadMutationRows(mutation);
          const definitionBlockId = this.resolveFirstTextBlock(rows);
          previousSiblingId = definitionBlockId || previousSiblingId;
          const creation = await xiuyuanService.createFromBlocks({
            blockIds: [resolution.conceptBlockId, definitionBlockId],
            templateId: 'builtin-concept-definition',
            fieldMapping: {
              concept: resolution.conceptBlockId,
              definition: definitionBlockId,
            },
            ...(deckId ? { deckId } : {}),
            cardType: 'concept',
            source: 'ai-workbench',
            creationMode: 'ai-cdf-semantic-definition',
            duplicatePolicy: 'reuse-existing',
          });
          if (!creation.ok) {
            warnings.push(`定义「${definition.text}」制卡失败：${toErrorMessage(creation.error, '未知错误')}`);
            anchorFailed = true;
            continue;
          }
          createdDefinitions.push({
            definitionId: definition.id,
            text: definition.text,
            blockId: definitionBlockId,
            xiuyuanId: creation.value.xiuyuan.id,
            cardIds: creation.value.cards.map((card) => card.id),
          });
        }

        for (const descriptor of selectedDescriptors) {
          const descriptorMarkdown = `${normalizeListText(descriptor.group.title)};;${normalizeListText(descriptor.item.text)}`;
          const mutation = await this.insertMarkdown(descriptorMarkdown, resolvedTarget, previousSiblingId);
          const rows = await this.loadMutationRows(mutation);
          const descriptorBlockId = this.resolveFirstTextBlock(rows);
          previousSiblingId = descriptorBlockId || previousSiblingId;
          const creation = await xiuyuanService.createFromBlocks({
            blockIds: [resolution.conceptBlockId, descriptorBlockId],
            templateId: 'builtin-concept-descriptor',
            fieldMapping: {
              concept: resolution.conceptBlockId,
              descriptor: descriptorBlockId,
            },
            ...(deckId ? { deckId } : {}),
            cardType: 'descriptor',
            source: 'ai-workbench',
            creationMode: 'ai-cdf-semantic-descriptor',
            duplicatePolicy: 'reuse-existing',
          });
          if (!creation.ok) {
            warnings.push(`描述符「${descriptor.group.title} / ${descriptor.item.text}」制卡失败：${toErrorMessage(creation.error, '未知错误')}`);
            anchorFailed = true;
            continue;
          }
          createdDescriptors.push({
            groupId: descriptor.group.id,
            groupTitle: descriptor.group.title,
            itemId: descriptor.item.id,
            text: descriptor.item.text,
            blockId: descriptorBlockId,
            xiuyuanId: creation.value.xiuyuan.id,
            cardIds: creation.value.cards.map((card) => card.id),
          });
        }
      } catch (error) {
        anchorFailed = true;
        anchorError = toErrorMessage(error, 'CDF 语义制卡失败。');
      }

      const createdCount = createdDefinitions.length + createdDescriptors.length;
      itemResults.push({
        anchorId: anchor.id,
        conceptName: anchor.conceptName,
        status: createdCount > 0 ? 'created' : anchorFailed ? 'failed' : 'skipped',
        conceptBlockId: resolution.conceptBlockId,
        createdDefinitions,
        createdDescriptors,
        warnings,
        error: anchorError,
      });
    }

    await this.persistSuccessfulTarget(resolvedTarget, itemResults);
    const createdDefinitionCount = itemResults.reduce((total, item) => total + item.createdDefinitions.length, 0);
    const createdDescriptorCount = itemResults.reduce((total, item) => total + item.createdDescriptors.length, 0);
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

  private async createNativeRiffCards(
    args: Record<string, unknown>,
    runtime: AIChatToolRuntimeContext,
    mode: 'list-item' | 'mark' | 'heading' | 'super-block',
  ): Promise<unknown> {
    const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
    if (items.length === 0) {
      throw new Error('items 不能为空。');
    }
    const target = await this.resolveWriteTarget(args);
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
        const mutation = await this.insertMarkdown(draftMarkdown, target, previousSiblingId);
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

    await this.persistSuccessfulTarget(target, results);
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
  ): Promise<AICdfStructure> {
    const normalizedTarget = this.normalizeTargetMemory(target, Date.now());
    if (!normalizedTarget?.notebookId) {
      throw new Error('CDF 制卡前请先设置目标笔记本。');
    }
    const contextConcepts = await this.collectContextConceptMap(context);
    const anchors = await Promise.all((structure.anchors || []).map(async (anchor) => {
      const conceptName = normalizeString(anchor.conceptName);
      const warnings = [...(anchor.warnings || [])];
      const contextMatch = contextConcepts.get(normalizeConceptTitleKey(conceptName));
      let resolution: AICdfAnchorResolution | null = null;
      if (contextMatch) {
        resolution = {
          status: 'resolved-context',
          conceptBlockId: contextMatch.id,
          conceptTitle: contextMatch.title,
          reason: '复用当前上下文中已出现的概念文档。',
        };
      } else {
        const notebookMatch = await this.findExactConceptDocumentInNotebook(normalizedTarget.notebookId, conceptName);
        if (notebookMatch) {
          resolution = {
            status: 'resolved-notebook',
            conceptBlockId: notebookMatch.id,
            conceptTitle: notebookMatch.title,
            reason: '在目标笔记本中命中同名概念文档。',
          };
        } else {
          resolution = {
            status: 'unresolved',
            conceptBlockId: null,
            conceptTitle: conceptName,
            reason: '未在当前上下文或目标笔记本中解析到现有概念文档。',
          };
          warnings.push('未解析到现有概念文档，当前概念只保留为草稿，无法直接建卡。');
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

  private async resolveWriteTarget(args: Record<string, unknown>): Promise<ResolvedWriteTarget> {
    const override = parseTargetInput(args);
    if (override) {
      return this.resolveTargetFromInput(override);
    }
    const memory = await this.deps.loadDefaultTarget();
    if (!memory) {
      throw new Error('请先在 AI 工作台设置默认制卡位置，或在工具参数里显式指定 targetMode。');
    }
    return this.resolveTargetFromInput(memory);
  }

  private async resolveTargetFromInput(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  ): Promise<ResolvedWriteTarget> {
    const memory = this.normalizeTargetMemory(target, Date.now());
    if (!memory) {
      throw new Error('制卡目标不完整。');
    }
    if (memory.mode === 'daily-note') {
      const dailyNoteId = await this.deps.siyuanPort.ensureTodayDailyNote(memory.notebookId);
      return {
        memory: {
          ...memory,
          targetBlockId: null,
          targetLabel: memory.targetLabel || `${memory.notebookName} · 今日日记`,
        },
        targetBlockId: dailyNoteId,
        writeMode: 'append',
      };
    }
    if (!memory.targetBlockId) {
      throw new Error('block 模式必须提供 targetBlockId。');
    }
    const targetBlock = await this.loadTargetBlock(memory.targetBlockId);
    return {
      memory: {
        ...memory,
        notebookId: normalizeString(targetBlock.box) || memory.notebookId,
        targetLabel: memory.targetLabel || normalizeString(targetBlock.hpath) || normalizeString(targetBlock.content) || memory.targetBlockId,
      },
      targetBlockId: memory.targetBlockId,
      writeMode: this.isAppendableTarget(targetBlock) ? 'append' : 'after',
    };
  }

  private normalizeTargetMemory(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    updatedAt: number,
  ): AIWorkbenchSelfTestCardTargetMemory | null {
    const mode = target.mode === 'block' ? 'block' : 'daily-note';
    const notebookId = normalizeString(target.notebookId);
    if (!notebookId) {
      return null;
    }
    const targetBlockId = normalizeString(target.targetBlockId) || null;
    if (mode === 'block' && !targetBlockId) {
      return null;
    }
    const notebookName = normalizeString(target.notebookName) || notebookId;
    const targetLabel = normalizeString(target.targetLabel)
      || (mode === 'daily-note' ? `${notebookName} · 今日日记` : `${notebookName} · ${targetBlockId}`);
    return {
      mode,
      notebookId,
      notebookName,
      targetBlockId: mode === 'block' ? targetBlockId : null,
      targetLabel,
      updatedAt,
    };
  }

  private async persistSuccessfulTarget(target: ResolvedWriteTarget, results: unknown[]): Promise<void> {
    if (!results.some((item) => normalizeString((item as { status?: unknown }).status) === 'created')) {
      return;
    }
    await this.deps.saveDefaultTarget(target.memory);
  }

  private async insertMarkdown(
    markdown: string,
    target: ResolvedWriteTarget,
    previousSiblingId: string,
  ): Promise<AISiyuanMutationResult> {
    if (target.writeMode === 'append') {
      return this.deps.siyuanPort.appendBlockUnderParentDetailed(markdown, target.targetBlockId);
    }
    return this.deps.siyuanPort.insertBlockAfterDetailed(markdown, previousSiblingId);
  }

  private async loadMutationRows(result: AISiyuanMutationResult): Promise<MutationRow[]> {
    const blockIds = uniqueIds(result.doOperations.map((operation) => normalizeString(operation.id)));
    if (blockIds.length === 0) {
      throw new Error('未能解析插入后的块 ID。');
    }
    const escapedIds = blockIds.map((id) => `'${escapeSql(id)}'`).join(', ');
    const rows = await this.deps.siyuanPort.sql<MutationRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id IN (${escapedIds})
      ORDER BY sort ASC, id ASC
      LIMIT ${Math.max(blockIds.length, 1)}
    `);
    return rows;
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
      const rows = await this.loadMutationRows(mutation);
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
        const match = line.match(/^(\s*)[*+-]\s+\{:\s*id="([^"]+)"/);
        if (!match) {
          return null;
        }
        return {
          id: normalizeString(match[2]),
          indent: match[1]?.length || 0,
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

  private isAppendableTarget(block: AISiyuanBlockRow): boolean {
    const type = normalizeString(block.type);
    return type === 'd' || type === 'h' || type === 'l' || type === 'i' || type === 's';
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
