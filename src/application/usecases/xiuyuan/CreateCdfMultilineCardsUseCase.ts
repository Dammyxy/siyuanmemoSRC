import { err, ok, type Result } from '@/types/result';
import { resolveCdfMultilineScan } from './shared/CdfMultilineScanner';
import {
  detectDescriptorOrDefinitionKind,
  templateIdFromDescriptorOrDefinitionKind,
  type DescriptorOrDefinitionKind,
} from './shared/DescriptorTemplateStrategy';
import { findConceptByUpwardSearch } from './shared/ConceptLocator';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CreateCdfMultilineCardsUseCase');

export type CdfMultilineTemplateId = 'builtin-list-concept-multiline' | 'builtin-list-descriptor-multiline';

type XiuyuanAppLike = {
  createFromBlocks: (command: Record<string, unknown>) => Promise<Result<{
    xiuyuan: { id: string };
    cards: Array<{ id: string }>;
  }>>;
};

type CdfSiyuanPort = {
  BUILTIN_DECK_ID: string;
  sql: (stmt: string) => Promise<Array<Record<string, unknown>>>;
  getBlockAttrs: (blockId: string) => Promise<Record<string, string>>;
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
  failed: number;
  firstError?: string;
  stoppedByDocumentReference: boolean;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function isDefinitionTemplate(templateId: string): boolean {
  return templateId.startsWith('builtin-concept-definition');
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
    siyuanApi.getBlockAttrs(paragraphId),
    siyuanApi.getBlockAttrs(listItemId),
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
  const attrs = await siyuanApi.getBlockAttrs(conceptBlockId);
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
  });
  if (!createResult.ok) {
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
      const fallbackForNone = command.templateId === 'builtin-list-concept-multiline' ? 'definition' : 'descriptor';
      const scanResult = await resolveCdfMultilineScan(command.parentBlockId, this.siyuanApi);
      if (scanResult.nodes.length === 0) {
        return err(new Error('未找到可制卡的子级块'));
      }

      let conceptBlockId: string | null = null;
      if (command.templateId === 'builtin-list-concept-multiline') {
        conceptBlockId = await resolveConceptDocumentIdFromReference(scanResult.parentParagraphKramdown, this.siyuanApi);
        if (!conceptBlockId && scanResult.parentKramdown !== scanResult.parentParagraphKramdown) {
          conceptBlockId = await resolveConceptDocumentIdFromReference(scanResult.parentKramdown, this.siyuanApi);
        }
      } else {
        const located = await findConceptByUpwardSearch(command.parentBlockId, this.siyuanApi as never);
        conceptBlockId = located?.conceptId || null;
      }

      if (!conceptBlockId) {
        return err(new Error('未找到可用概念块'));
      }

      const ensureResult = await ensureConceptCard(
        conceptBlockId,
        this.xiuyuanAppService,
        this.siyuanApi,
        command.deckId
      );
      if (!ensureResult.ok) {
        return err(ensureResult.error);
      }

      let createdDefinition = 0;
      let createdDescriptor = 0;
      let skipped = 0;
      let failed = 0;
      let firstError = '';
      const setFirstError = (message: string): void => {
        if (!firstError) {
          firstError = message;
        }
      };

      const createForParagraph = async (paragraphId: string, listItemId: string, markerKind: DescriptorOrDefinitionKind): Promise<void> => {
        const hasBinding = await hasXiuyuanBindingOnParagraphOrListItem(paragraphId, listItemId, this.siyuanApi);
        if (hasBinding) {
          skipped += 1;
          return;
        }

        const templateId = templateIdFromDescriptorOrDefinitionKind(markerKind, fallbackForNone);
        if (!templateId) {
          skipped += 1;
          return;
        }

        const definition = isDefinitionTemplate(templateId);
        const createResult = await this.xiuyuanAppService.createFromBlocks({
          blockIds: definition ? [paragraphId, conceptBlockId] : [conceptBlockId, paragraphId],
          templateId,
          fieldMapping: definition
            ? { concept: conceptBlockId, definition: paragraphId }
            : { concept: conceptBlockId, descriptor: paragraphId },
          deckId: command.deckId || this.siyuanApi.BUILTIN_DECK_ID,
          cardType: 'descriptor',
        });

        if (!createResult.ok) {
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

      for (const node of scanResult.nodes) {
        if (node.markerKind === 'descriptor-multiline') {
          const nestedIds = [...node.orderedChildListItemIds, ...node.unorderedChildListItemIds];
          for (const nestedListItemId of nestedIds) {
            const paragraphId = await getFirstParagraphIdForListItem(nestedListItemId, this.siyuanApi);
            if (!paragraphId) {
              failed += 1;
              setFirstError(`子级缺少段落块：${nestedListItemId}`);
              continue;
            }
            const paragraphRows = await this.siyuanApi.sql(`
              SELECT markdown, content
              FROM blocks
              WHERE id = '${escapeSql(paragraphId)}'
              LIMIT 1
            `);
            const paragraphMarkdown = String(paragraphRows?.[0]?.markdown || paragraphRows?.[0]?.content || '');
            const kind = detectDescriptorOrDefinitionKind(paragraphMarkdown);
            await createForParagraph(paragraphId, nestedListItemId, kind);
          }
          continue;
        }

        await createForParagraph(node.firstParagraphId, node.id, node.markerKind);
      }

      return ok({
        createdDefinition,
        createdDescriptor,
        skipped,
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
