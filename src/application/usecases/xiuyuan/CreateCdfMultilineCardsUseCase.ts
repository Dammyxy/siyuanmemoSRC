import { err, ok, isErr, type Result } from '@/types/result';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import { resolveCdfMultilineScan, type CdfScanResult } from './shared/CdfMultilineScanner';
import {
  detectDescriptorOrDefinitionKind,
  templateIdFromDescriptorOrDefinitionKind,
  type DescriptorOrDefinitionKind,
} from './shared/DescriptorTemplateStrategy';
import { findConceptByUpwardSearch } from './shared/ConceptLocator';
import {
  extractDescriptorGroupHintFromCandidates,
  parseCueAndAnswer,
} from '@/core/xiuyuan/parseCueAndAnswer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CreateCdfMultilineCardsUseCase');

export type CdfMultilineTemplateId = 'builtin-list-concept-multiline' | 'builtin-list-descriptor-multiline';

type XiuyuanAppLike = {
  createFromBlocks: (command: CreateXiuyuanFromBlocksCommand) => Promise<Result<{
    xiuyuan: { id: string };
    cards: Array<{ id: string }>;
  }>>;
};

type CdfSiyuanPort = {
  BUILTIN_DECK_ID: string;
  sql: <TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string) => Promise<TRow[]>;
  getBlockAttrs?: (blockId: string) => Promise<Record<string, string>>;
  getBlockKramdown: (blockId: string) => Promise<{ kramdown: string }>;
};

export interface CreateCdfMultilineCardsCommand {
  parentBlockId: string;
  templateId: CdfMultilineTemplateId;
  deckId?: string;
}

export interface CreateCdfMultilineCardsPayload {
  createdDefinition: number;
  createdDescriptor: number;
  skipped: number;
  skippedExistingBinding: number;
  skippedNoTemplate: number;
  failed: number;
  firstError?: string;
  stoppedByDocumentReference: boolean;
}

type CdfDescriptorMeta = {
  groupHint: string;
  cue: string;
  answer: string;
};

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function isDefinitionTemplate(templateId: string): boolean {
  return templateId.startsWith('builtin-concept-definition');
}

async function getBlockAttrsSafe(
  blockId: string,
  siyuanApi: CdfSiyuanPort
): Promise<Record<string, string>> {
  if (typeof siyuanApi.getBlockAttrs === 'function') {
    try {
      return await siyuanApi.getBlockAttrs(blockId);
    } catch (error) {
      logger.warn('[CreateCdfMultilineCardsUseCase] getBlockAttrs failed, fallback to SQL attributes query:', {
        blockId,
        error,
      });
    }
  }

  const attrRows = await siyuanApi.sql(`
    SELECT name, value
    FROM attributes
    WHERE block_id = '${escapeSql(blockId)}'
      AND name IN ('custom-xiuyuan-id', 'custom-fsrs-xiuyuan-id')
  `);

  const attrs: Record<string, string> = {};
  for (const row of attrRows) {
    const name = typeof row?.name === 'string' ? row.name : '';
    const value = typeof row?.value === 'string' ? row.value : '';
    if (name.length > 0) {
      attrs[name] = value;
    }
  }

  return attrs;
}

async function getFirstParagraphIdForListItem(
  listItemId: string,
  siyuanApi: CdfSiyuanPort
): Promise<string | null> {
  const rows = await siyuanApi.sql(`
    SELECT id
    FROM blocks
    WHERE parent_id = '${escapeSql(listItemId)}'
      AND type = 'p'
    ORDER BY sort ASC, id ASC
    LIMIT 1
  `);
  const id = rows?.[0]?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function hasXiuyuanBindingOnParagraphOrListItem(
  paragraphId: string,
  listItemId: string,
  siyuanApi: CdfSiyuanPort
): Promise<boolean> {
  const [paragraphAttrs, listItemAttrs] = await Promise.all([
    getBlockAttrsSafe(paragraphId, siyuanApi),
    getBlockAttrsSafe(listItemId, siyuanApi),
  ]);
  const paraBinding = paragraphAttrs?.['custom-xiuyuan-id'] || paragraphAttrs?.['custom-fsrs-xiuyuan-id'];
  const itemBinding = listItemAttrs?.['custom-xiuyuan-id'] || listItemAttrs?.['custom-fsrs-xiuyuan-id'];
  return Boolean((typeof paraBinding === 'string' && paraBinding.trim().length > 0)
    || (typeof itemBinding === 'string' && itemBinding.trim().length > 0));
}

async function resolveConceptDocumentIdFromReference(
  markdown: string,
  siyuanApi: CdfSiyuanPort
): Promise<string | null> {
  const refMatch = markdown.match(/\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/i);
  if (!refMatch) {
    return null;
  }

  const refId = refMatch[1];
  const typeRows = await siyuanApi.sql(`
    SELECT type
    FROM blocks
    WHERE id = '${escapeSql(refId)}'
    LIMIT 1
  `);
  if (!typeRows || typeRows.length === 0) {
    return null;
  }
  return typeRows[0]?.type === 'd' ? refId : null;
}

async function ensureConceptCard(
  conceptBlockId: string,
  xiuyuanAppService: XiuyuanAppLike,
  siyuanApi: CdfSiyuanPort,
  deckId?: string
): Promise<Result<void>> {
  const attrs = await getBlockAttrsSafe(conceptBlockId, siyuanApi);
  const existing = attrs?.['custom-xiuyuan-id'] || attrs?.['custom-fsrs-xiuyuan-id'];
  if (existing && existing.trim().length > 0) {
    return ok(undefined);
  }

  const createResult = await xiuyuanAppService.createFromBlocks({
    blockIds: [conceptBlockId],
    templateId: 'builtin-concept-simple',
    fieldMapping: { concept: conceptBlockId },
    deckId: deckId || siyuanApi.BUILTIN_DECK_ID,
    cardType: 'concept',
    duplicatePolicy: 'reuse-existing',
  });
  if (isErr(createResult)) {
    return err(createResult.error);
  }
  return ok(undefined);
}

export class CreateCdfMultilineCardsUseCase {
  constructor(
    private readonly xiuyuanAppService: XiuyuanAppLike,
    private readonly siyuanApi: CdfSiyuanPort
  ) {}

  async execute(command: CreateCdfMultilineCardsCommand): Promise<Result<CreateCdfMultilineCardsPayload>> {
    try {
      const scanResult = await resolveCdfMultilineScan(command.parentBlockId, this.siyuanApi);
      return this.executeFromScanResult(scanResult, command.templateId, command.deckId);
    } catch (error) {
      logger.error('Failed to create CDF multiline cards:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async executeFromScanResult(
    scanResult: CdfScanResult,
    templateId: CdfMultilineTemplateId,
    deckId?: string,
  ): Promise<Result<CreateCdfMultilineCardsPayload>> {
    try {
      const fallbackForNone = templateId === 'builtin-list-concept-multiline' ? 'definition' : 'descriptor';

      let conceptBlockId: string | null = null;
      if (templateId === 'builtin-list-concept-multiline') {
        conceptBlockId = await resolveConceptDocumentIdFromReference(scanResult.parentParagraphKramdown, this.siyuanApi);
        if (!conceptBlockId && scanResult.parentKramdown !== scanResult.parentParagraphKramdown) {
          conceptBlockId = await resolveConceptDocumentIdFromReference(scanResult.parentKramdown, this.siyuanApi);
        }
      } else {
        const located = await findConceptByUpwardSearch(scanResult.parentBlockId, this.siyuanApi as never);
        conceptBlockId = located?.conceptId || null;
      }

      if (!conceptBlockId) {
        return err(new Error('未找到可用概念块'));
      }

      const ensureResult = await ensureConceptCard(
        conceptBlockId,
        this.xiuyuanAppService,
        this.siyuanApi,
        deckId
      );
      if (isErr(ensureResult)) {
        return err(ensureResult.error);
      }

      let createdDefinition = 0;
      let createdDescriptor = 0;
      let skipped = 0;
      let skippedExistingBinding = 0;
      let skippedNoTemplate = 0;
      let failed = 0;
      let firstError = '';
      const setFirstError = (message: string): void => {
        if (!firstError) {
          firstError = message;
        }
      };

      const loadParagraphMarkdownAndContent = async (
        paragraphId: string
      ): Promise<{ markdown: string; content: string }> => {
        const paragraphRows = await this.siyuanApi.sql(`
          SELECT markdown, content
          FROM blocks
          WHERE id = '${escapeSql(paragraphId)}'
          LIMIT 1
        `);
        return {
          markdown: String(paragraphRows?.[0]?.markdown || paragraphRows?.[0]?.content || ''),
          content: String(paragraphRows?.[0]?.content || paragraphRows?.[0]?.markdown || ''),
        };
      };

      const createForParagraph = async (
        paragraphId: string,
        listItemId: string,
        markerKind: DescriptorOrDefinitionKind,
        descriptorMeta?: CdfDescriptorMeta
      ): Promise<void> => {
        const hasBinding = await hasXiuyuanBindingOnParagraphOrListItem(paragraphId, listItemId, this.siyuanApi);
        if (hasBinding) {
          skipped += 1;
          skippedExistingBinding += 1;
          return;
        }

        const templateId = templateIdFromDescriptorOrDefinitionKind(markerKind, fallbackForNone);
        if (!templateId) {
          skipped += 1;
          skippedNoTemplate += 1;
          return;
        }

        const definition = isDefinitionTemplate(templateId);
        const fieldMapping: Record<string, string> = definition
          ? { concept: conceptBlockId, definition: paragraphId }
          : { concept: conceptBlockId, descriptor: paragraphId };
        if (!definition && descriptorMeta) {
          fieldMapping.cdf_group_hint = descriptorMeta.groupHint;
          fieldMapping.cdf_child_cue = descriptorMeta.cue;
          fieldMapping.cdf_child_answer = descriptorMeta.answer;
        }

        const createResult = await this.xiuyuanAppService.createFromBlocks({
          blockIds: definition ? [paragraphId, conceptBlockId] : [conceptBlockId, paragraphId],
          templateId,
          fieldMapping,
          deckId: deckId || this.siyuanApi.BUILTIN_DECK_ID,
          cardType: 'descriptor',
        });

        if (isErr(createResult)) {
          failed += 1;
          setFirstError(createResult.error.message);
          return;
        }

        if (definition) {
          createdDefinition += 1;
        } else {
          createdDescriptor += 1;
        }
      };

      const parentMarkerKindFromParagraphKramdown = detectDescriptorOrDefinitionKind(scanResult.parentParagraphKramdown || '');
      const parentMarkerKindFromBlockKramdown = detectDescriptorOrDefinitionKind(scanResult.parentKramdown || '');
      const parentMarkerKindFromParagraphText = detectDescriptorOrDefinitionKind(scanResult.parentParagraphText || '');
      const parentMarkerKind = parentMarkerKindFromParagraphKramdown !== 'none'
        ? parentMarkerKindFromParagraphKramdown
        : parentMarkerKindFromBlockKramdown !== 'none'
          ? parentMarkerKindFromBlockKramdown
          : parentMarkerKindFromParagraphText;

      const canCreateFromParent = templateId === 'builtin-list-concept-multiline'
        && parentMarkerKind.startsWith('definition');
      if (scanResult.nodes.length === 0 && !canCreateFromParent) {
        return err(new Error('未找到可制卡的子级块'));
      }

      if (canCreateFromParent) {
        await createForParagraph(
          scanResult.parentParagraphId,
          scanResult.parentBlockId,
          parentMarkerKind,
        );
      }

      if (templateId === 'builtin-list-descriptor-multiline' && parentMarkerKind === 'descriptor-multiline') {
        const descriptorGroupHint = extractDescriptorGroupHintFromCandidates(
          scanResult.parentParagraphKramdown,
          scanResult.parentParagraphText
        );

        for (const node of scanResult.nodes) {
          const paragraph = await loadParagraphMarkdownAndContent(node.firstParagraphId);
          const parsedCueAnswer = parseCueAndAnswer(paragraph.content || paragraph.markdown);
          const kind = detectDescriptorOrDefinitionKind(paragraph.markdown);
          await createForParagraph(node.firstParagraphId, node.id, kind, {
            groupHint: descriptorGroupHint,
            cue: parsedCueAnswer.cue,
            answer: parsedCueAnswer.answer,
          });
        }

        return ok({
          createdDefinition,
          createdDescriptor,
          skipped,
          skippedExistingBinding,
          skippedNoTemplate,
          failed,
          firstError: firstError || undefined,
          stoppedByDocumentReference: scanResult.stoppedByDocumentReference,
        });
      }

      for (const node of scanResult.nodes) {
        if (node.markerKind === 'descriptor-multiline') {
          const descriptorGroupHint = extractDescriptorGroupHintFromCandidates(
            node.firstParagraphKramdown,
            node.firstParagraphText
          );
          const nestedIds = [...node.orderedChildListItemIds, ...node.unorderedChildListItemIds];
          for (const nestedListItemId of nestedIds) {
            const paragraphId = await getFirstParagraphIdForListItem(nestedListItemId, this.siyuanApi);
            if (!paragraphId) {
              failed += 1;
              setFirstError(`子级缺少段落块：${nestedListItemId}`);
              continue;
            }
            const paragraph = await loadParagraphMarkdownAndContent(paragraphId);
            const parsedCueAnswer = parseCueAndAnswer(paragraph.content || paragraph.markdown);
            const kind = detectDescriptorOrDefinitionKind(paragraph.markdown);
            const nestedMarkerKind = kind === 'none' && templateId === 'builtin-list-concept-multiline'
              ? 'descriptor-forward'
              : kind;
            await createForParagraph(paragraphId, nestedListItemId, nestedMarkerKind, {
              groupHint: descriptorGroupHint,
              cue: parsedCueAnswer.cue,
              answer: parsedCueAnswer.answer,
            });
          }
          continue;
        }

        await createForParagraph(node.firstParagraphId, node.id, node.markerKind, node.descriptorMeta);
      }

      return ok({
        createdDefinition,
        createdDescriptor,
        skipped,
        skippedExistingBinding,
        skippedNoTemplate,
        failed,
        firstError: firstError || undefined,
        stoppedByDocumentReference: scanResult.stoppedByDocumentReference,
      });
    } catch (error) {
      logger.error('Failed to create CDF multiline cards:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
