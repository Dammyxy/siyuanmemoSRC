import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type {
  AISiyuanBlockRow,
  AISiyuanPort,
} from '@/application/ports/AISiyuanPort';
import type { FSRSCard } from '@/types/card';
import type {
  AIAttachedContextItem,
  AIBlockContext,
  AIContextProviderKey,
  AIReviewCardContext,
  AIWorkbenchContextSnapshot,
  AIWorkbenchOpenOptions,
  AIWorkbenchState,
} from '@/types/ai';
import {
  buildReviewCardSemantics,
  isDocumentBlockType,
  isNeuralVirtualReviewCard,
  readReviewNeuralContext,
  readStringArrayFromMeta,
  readXiuyuanMeta,
} from '@/application/services/AIWorkbenchContextProjection';

type AIWorkbenchContextRuntimeDeps = {
  state: AIWorkbenchState;
  cardContentQueryService: CardContentQueryService;
  siyuanPort: AISiyuanPort;
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function truncateText(value: string, limit = 140): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function parseBlockReferenceIds(value: string): string[] {
  return uniqueIds((normalizeString(value).match(/\d{14}-[0-9a-z]{7}/ig) || []));
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AIWorkbenchContextRuntime {
  constructor(private readonly deps: AIWorkbenchContextRuntimeDeps) {}

  async buildContextSnapshot(options: AIWorkbenchOpenOptions): Promise<AIWorkbenchContextSnapshot> {
    const currentCard = options.currentCard ?? null;
    const sourceBlockIdsFromCard = this.resolveSourceBlockIdsFromCard(currentCard);
    const neuralVirtualBlockIds = this.resolveNeuralVirtualBlockIds(currentCard);
    const selectedBlockIds = uniqueIds([
      ...(options.selectedBlockIds || []),
      options.currentBlockId || null,
      ...sourceBlockIdsFromCard,
      ...neuralVirtualBlockIds,
    ]);
    const blocks = await this.enrichNeuralVirtualBlockContexts(
      await this.loadBlockContexts(selectedBlockIds),
      neuralVirtualBlockIds,
    );
    return {
      source: options.source || 'standalone',
      selectedBlockIds,
      blocks,
      queueType: options.queueType ?? null,
      queueProgress: options.queueProgress ?? null,
      currentCard: await this.buildReviewCardContext(currentCard, options.revealed === true),
      currentCardRaw: currentCard,
      neuralBatch: options.neuralBatch ?? null,
    };
  }

  async loadBlockContexts(blockIds: string[]): Promise<AIBlockContext[]> {
    if (blockIds.length === 0) {
      return [];
    }
    const escapedIds = blockIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const rows = await this.deps.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, parent_id, root_id, type, subtype, content, markdown, hpath
      FROM blocks
      WHERE id IN (${escapedIds})
      LIMIT ${blockIds.length}
    `);
    const documentMarkdownById = await this.resolveDocumentMarkdownByRows(rows);
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    return blockIds.map((blockId) => {
      const row = byId.get(blockId);
      const documentMarkdown = documentMarkdownById.get(blockId);
      const fallbackMarkdown = normalizeString(row?.markdown);
      const fallbackContent = normalizeString(row?.content);
      return {
        blockId,
        text: documentMarkdown || fallbackMarkdown || fallbackContent,
        markdown: documentMarkdown || fallbackMarkdown,
        type: normalizeString(row?.type) || undefined,
        parentId: normalizeString(row?.parent_id) || null,
        rootId: normalizeString(row?.root_id) || null,
        hPath: normalizeString(row?.hpath) || null,
      } satisfies AIBlockContext;
    });
  }

  buildAttachedContextItem(input: {
    providerKey: AIContextProviderKey;
    title: string;
    content: string;
    blockIds?: string[];
    summary?: string;
    preview?: string;
  }): AIAttachedContextItem | null {
    const content = normalizeString(input.content);
    if (!content) {
      return null;
    }
    const blockIds = uniqueIds(input.blockIds || []);
    return {
      id: createEntryId('ai-context'),
      providerKey: input.providerKey,
      title: normalizeString(input.title) || '补充上下文',
      summary: normalizeString(input.summary)
        || `${blockIds.length > 0 ? `${blockIds.length} 个块` : '临时材料'} · ${content.length} 字`,
      preview: normalizeString(input.preview) || truncateText(content, 80),
      content,
      blockIds,
      createdAt: Date.now(),
    };
  }

  createManualContextAttachment(input?: string): AIAttachedContextItem | null {
    const content = normalizeString(input);
    return this.buildAttachedContextItem({
      providerKey: 'manual-text',
      title: '手工材料',
      content,
      summary: `手工材料 · ${content.length} 字`,
    });
  }

  async createSelectedContentAttachment(): Promise<AIAttachedContextItem | null> {
    const selectionSnapshot = resolveProgressiveExcerptSelectionSnapshot();
    if (selectionSnapshot?.text) {
      return this.buildAttachedContextItem({
        providerKey: 'selected-content',
        title: '选中内容',
        content: selectionSnapshot.text,
        blockIds: selectionSnapshot.sourceBlockIds,
        summary: `${selectionSnapshot.sourceBlockIds.length} 个块 · ${selectionSnapshot.text.length} 字`,
      });
    }
    const resolver = new BlockContextResolver({ i18n: {}, notify: () => {} });
    const resolved = resolver.resolve({});
    const blockIds = uniqueIds(
      (resolved?.blockElements || []).map((element) => element.getAttribute('data-node-id')),
    );
    if (blockIds.length === 0) {
      return null;
    }
    const blocks = await this.loadBlockContexts(blockIds);
    const content = blocks
      .map((block) => normalizeString(block.markdown || block.text))
      .filter(Boolean)
      .join('\n\n');
    return this.buildAttachedContextItem({
      providerKey: 'selected-content',
      title: '选中内容',
      content,
      blockIds,
      summary: `${blockIds.length} 个块 · ${content.length} 字`,
    });
  }

  async createBlockRefsAttachment(input?: string): Promise<AIAttachedContextItem | null> {
    const blockIds = parseBlockReferenceIds(normalizeString(input));
    if (blockIds.length === 0) {
      return null;
    }
    const blocks = await this.loadBlockContexts(blockIds);
    const content = blocks
      .map((block) => normalizeString(block.markdown || block.text))
      .filter(Boolean)
      .join('\n\n');
    return this.buildAttachedContextItem({
      providerKey: 'block-refs',
      title: '指定块内容',
      content,
      blockIds,
      summary: `${blockIds.length} 个块 · ${content.length} 字`,
    });
  }

  async createCurrentDocumentAttachment(): Promise<AIAttachedContextItem | null> {
    const liveOrHistoricalContext = this.deps.state.liveContext || this.deps.state.context;
    const candidateRootIds = uniqueIds([
      ...(liveOrHistoricalContext?.blocks || []).map((block) => block.rootId),
      liveOrHistoricalContext?.currentCard?.blockId || null,
    ]);
    let documentId = candidateRootIds[0] || '';
    if (!documentId) {
      const resolver = new BlockContextResolver({ i18n: {}, notify: () => {} });
      const resolved = resolver.resolve({});
      const firstBlockId = normalizeString(resolved?.blockElements?.[0]?.getAttribute('data-node-id'));
      if (firstBlockId) {
        const rows = await this.deps.siyuanPort.sql<{ root_id?: string }>(`
          SELECT root_id
          FROM blocks
          WHERE id = '${firstBlockId.replace(/'/g, "''")}'
          LIMIT 1
        `);
        documentId = normalizeString(rows[0]?.root_id);
      }
    }
    if (!documentId) {
      return null;
    }
    const [documentBlock] = await this.loadBlockContexts([documentId]);
    if (!documentBlock) {
      return null;
    }
    return this.buildAttachedContextItem({
      providerKey: 'current-document',
      title: '当前文档',
      content: normalizeString(documentBlock.markdown || documentBlock.text),
      blockIds: [documentId],
      summary: `${documentBlock.hPath || '当前文档'} · ${normalizeString(documentBlock.text).length} 字`,
      preview: truncateText(normalizeString(documentBlock.text), 96),
    });
  }

  async attachContextFromProvider(
    providerKey: AIContextProviderKey,
    input?: string,
  ): Promise<AIAttachedContextItem | null> {
    switch (providerKey) {
      case 'manual-text':
        return this.createManualContextAttachment(input);
      case 'selected-content':
        return this.createSelectedContentAttachment();
      case 'block-refs':
        return this.createBlockRefsAttachment(input);
      case 'current-document':
        return this.createCurrentDocumentAttachment();
      default:
        return null;
    }
  }

  private async buildReviewCardContext(card: FSRSCard | null, revealed: boolean): Promise<AIReviewCardContext | null> {
    if (!card) {
      return null;
    }
    const semantics = buildReviewCardSemantics(card.type);
    const meta = readXiuyuanMeta(card);
    const neuralContext = readReviewNeuralContext(card);
    const frontBlockIds = readStringArrayFromMeta(meta, 'frontBlockIDs');
    const backBlockIds = readStringArrayFromMeta(meta, 'backBlockIDs');
    const neuralVirtualBlockIds = this.resolveNeuralVirtualBlockIds(card);
    const sourceBlockIds = uniqueIds([
      ...frontBlockIds,
      ...backBlockIds,
      card.blockId,
      typeof card.extractedFrom === 'string' ? card.extractedFrom : '',
      ...neuralVirtualBlockIds,
    ]);
    const contentMap = await this.resolveAIBlockContents(sourceBlockIds);
    await this.enrichAIBlockContentsWithStandardMarkdown(contentMap, neuralVirtualBlockIds);
    const frontText = frontBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    const backText = backBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    const sourceText = sourceBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    return {
      cardId: card.id,
      blockId: card.blockId,
      cardType: String(card.type || ''),
      revealed,
      ...semantics,
      sourceBlockIds,
      frontText,
      backText: semantics.hasAnswerFace ? backText : '',
      sourceText,
      neuralContext,
    };
  }

  private resolveNeuralVirtualBlockIds(card: FSRSCard | null): string[] {
    if (!isNeuralVirtualReviewCard(card)) {
      return [];
    }
    const neuralContext = readReviewNeuralContext(card);
    return uniqueIds([
      card?.blockId,
      neuralContext?.sourceVirtualNodeId,
    ]);
  }

  private resolveSourceBlockIdsFromCard(card: FSRSCard | null): string[] {
    if (!card) {
      return [];
    }
    const meta = readXiuyuanMeta(card);
    return uniqueIds([
      ...readStringArrayFromMeta(meta, 'frontBlockIDs'),
      ...readStringArrayFromMeta(meta, 'backBlockIDs'),
      card.blockId,
      typeof card.extractedFrom === 'string' ? card.extractedFrom : '',
    ]);
  }

  private async readStandardMarkdownByBlockIds(blockIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const blockId of uniqueIds(blockIds)) {
      try {
        const markdown = normalizeString(await this.deps.siyuanPort.copyStdMarkdown(blockId));
        if (markdown) {
          result.set(blockId, markdown);
        }
      } catch {
        // Keep SQL-derived block text already loaded for the context snapshot.
      }
    }
    return result;
  }

  private async enrichNeuralVirtualBlockContexts(
    blocks: AIBlockContext[],
    blockIds: string[],
  ): Promise<AIBlockContext[]> {
    if (blockIds.length === 0 || blocks.length === 0) {
      return blocks;
    }
    const markdownById = await this.readStandardMarkdownByBlockIds(blockIds);
    if (markdownById.size === 0) {
      return blocks;
    }
    return blocks.map((block) => {
      const markdown = markdownById.get(block.blockId);
      return markdown
        ? {
            ...block,
            text: markdown,
            markdown,
          }
        : block;
    });
  }

  private async resolveAIBlockContents(
    blockIds: string[],
  ): Promise<Map<string, { content: string; type: string; isDocument: boolean }>> {
    const queryResults = await this.deps.cardContentQueryService.getBlockContentsWithType(blockIds);
    const resolved = new Map<string, { content: string; type: string; isDocument: boolean }>();
    for (const blockId of blockIds) {
      const entry = queryResults.get(blockId);
      const type = normalizeString(entry?.type);
      const title = normalizeString(entry?.content);
      if (isDocumentBlockType(type)) {
        resolved.set(blockId, {
          content: await this.readDocumentMarkdown(blockId, title),
          type: type || 'd',
          isDocument: true,
        });
        continue;
      }
      resolved.set(blockId, {
        content: title,
        type,
        isDocument: entry?.isDocument === true,
      });
    }
    return resolved;
  }

  private async enrichAIBlockContentsWithStandardMarkdown(
    contentMap: Map<string, { content: string; type: string; isDocument: boolean }>,
    blockIds: string[],
  ): Promise<void> {
    if (blockIds.length === 0) {
      return;
    }
    const markdownById = await this.readStandardMarkdownByBlockIds(blockIds);
    for (const [blockId, markdown] of markdownById.entries()) {
      const existing = contentMap.get(blockId);
      contentMap.set(blockId, {
        content: markdown,
        type: existing?.type || '',
        isDocument: existing?.isDocument === true,
      });
    }
  }

  private async resolveDocumentMarkdownByRows(rows: AISiyuanBlockRow[]): Promise<Map<string, string>> {
    const documentRows = rows.filter((row) => isDocumentBlockType(row.type));
    const resolved = new Map<string, string>();
    for (const row of documentRows) {
      const blockId = normalizeString(row.id);
      if (!blockId) {
        continue;
      }
      const title = normalizeString(row.content) || normalizeString(row.hpath);
      resolved.set(blockId, await this.readDocumentMarkdown(blockId, title));
    }
    return resolved;
  }

  private async readDocumentMarkdown(blockId: string, title?: string): Promise<string> {
    try {
      return normalizeString(await this.deps.siyuanPort.copyStdMarkdown(blockId));
    } catch {
      const label = normalizeString(title) || blockId;
      throw new Error(`AI 无法读取文档「${label}」的正文，请稍后重试。`);
    }
  }
}
