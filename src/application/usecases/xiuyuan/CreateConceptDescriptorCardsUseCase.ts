import { Result, ok, err, isErr } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';
import { resolveConceptCard } from './shared/ConceptCardResolver';
import {
  containsDescriptorOrDefinitionSymbol,
  resolveDescriptorTemplateByMarkdown,
} from './shared/DescriptorTemplateStrategy';
import { resolveListItemAnchorBlockId } from './shared/ListItemAnchorResolver';

const logger = createLogger('CreateConceptDescriptorCardsUseCase');

const FW_SEMICOLON = '\uFF1B';
const FW_COLON = '\uFF1A';
const L_ANGLE = '\u300A';
const R_ANGLE = '\u300B';

const CONCEPT_REF_PATTERN = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/;
const DESCRIPTOR_CONTENT_FILTER_SQL = `
  (
    content LIKE '%;;%' OR content LIKE '%${FW_SEMICOLON}${FW_SEMICOLON}%'
    OR content LIKE '%;<%' OR content LIKE '%${FW_SEMICOLON}${L_ANGLE}%'
    OR content LIKE '%;<>%' OR content LIKE '%${FW_SEMICOLON}${L_ANGLE}${R_ANGLE}%'
    OR content LIKE '%::%' OR content LIKE '%${FW_COLON}${FW_COLON}%'
    OR content LIKE '%:>%' OR content LIKE '%${FW_COLON}${R_ANGLE}%'
    OR content LIKE '%:<%' OR content LIKE '%${FW_COLON}${L_ANGLE}%'
  )
`;

interface BlockRow {
  id: string;
  type?: string;
  content?: string;
  markdown?: string;
  parent_id?: string;
}

interface DescriptorBuildResult {
  blockIds: [string, string];
  fieldMapping: Record<string, string>;
  templateId: string;
}

export interface CreateConceptDescriptorCardsCommand {
  parentBlockId: string;
  deckId?: string;
  priority?: number;
}

export interface ConceptDescriptorCardsResult {
  conceptCardId?: string;
  descriptorCards: Array<{
    xiuyuanId: string;
    descriptorBlockId: string;
    cards: Array<{ id: string; faceIndex: number }>;
  }>;
  skipped: string[];
}

function toRows(result: unknown): BlockRow[] {
  return Array.isArray(result) ? (result as BlockRow[]) : [];
}

function buildDescriptorPayload(conceptBlockId: string, descriptorBlockId: string, markdown: string): DescriptorBuildResult {
  const { templateId, isDefinition } = resolveDescriptorTemplateByMarkdown(markdown);
  if (isDefinition) {
    return {
      blockIds: [descriptorBlockId, conceptBlockId],
      fieldMapping: {
        concept: conceptBlockId,
        definition: descriptorBlockId,
      },
      templateId,
    };
  }

  return {
    blockIds: [conceptBlockId, descriptorBlockId],
    fieldMapping: {
      concept: conceptBlockId,
      descriptor: descriptorBlockId,
    },
    templateId,
  };
}

export class CreateConceptDescriptorCardsUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;

  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports?: { siyuanApi?: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new XiuyuanSiyuanAdapter();
    this.eventBus = ports?.eventBus ?? new EventBus(false);
  }

  async execute(command: CreateConceptDescriptorCardsCommand): Promise<Result<ConceptDescriptorCardsResult>> {
    try {
      const anchorBlockId = await resolveListItemAnchorBlockId(command.parentBlockId, this.siyuanApi);
      if (!anchorBlockId) {
        return err(new Error('Only list-item blocks or their direct paragraph blocks are supported'));
      }

      const safeAnchorBlockId = anchorBlockId.replace(/'/g, "''");
      const parentParagraphRows = toRows(
        await this.siyuanApi.sql(`
          SELECT id, content, markdown FROM blocks
          WHERE parent_id = '${safeAnchorBlockId}'
            AND type = 'p'
          ORDER BY sort ASC, id ASC
          LIMIT 1
        `)
      );
      if (parentParagraphRows.length === 0) {
        return err(new Error('List item paragraph not found'));
      }

      const parentParagraph = parentParagraphRows[0];
      const parentMarkdown = parentParagraph.markdown || parentParagraph.content || '';
      const refMatch = parentMarkdown.match(CONCEPT_REF_PATTERN);
      if (!refMatch) {
        return err(new Error('Concept reference not found in parent block'));
      }

      const conceptBlockId = refMatch[1];
      logger.info('Found concept block ID:', conceptBlockId);

      const conceptRows = toRows(
        await this.siyuanApi.sql(`
          SELECT type FROM blocks
          WHERE id = '${conceptBlockId}'
          LIMIT 1
        `)
      );
      if (conceptRows.length === 0) {
        return err(new Error('Referenced concept block does not exist'));
      }
      if (conceptRows[0].type !== 'd') {
        return err(new Error('Concept reference must point to a document block'));
      }

      const resolvedConcept = await resolveConceptCard({
        conceptId: conceptBlockId,
        deckId: command.deckId,
        xiuyuanRepository: this.xiuyuanRepository,
        templateRegistry: this.templateRegistry,
        siyuanApi: this.siyuanApi,
        eventBus: this.eventBus,
      });
      const conceptCardId = resolvedConcept.createdConceptCard
        ? resolvedConcept.conceptCardId
        : undefined;
      logger.debug('Resolved concept name:', resolvedConcept.conceptName);

      const descriptorBlockMap = new Map<string, BlockRow>();
      const addDescriptorRows = (rows: BlockRow[]): void => {
        for (const row of rows) {
          if (row?.id && !descriptorBlockMap.has(row.id)) {
            descriptorBlockMap.set(row.id, row);
          }
        }
      };

      if (containsDescriptorOrDefinitionSymbol(parentMarkdown)) {
        addDescriptorRows(parentParagraphRows);
        logger.debug('Added parent paragraph as descriptor/definition block');
      }

      const listContainerRows = toRows(
        await this.siyuanApi.sql(`
          SELECT id FROM blocks
          WHERE parent_id = '${safeAnchorBlockId}'
            AND type = 'l'
          LIMIT 1
        `)
      );
      if (listContainerRows.length > 0) {
        const listContainerId = listContainerRows[0].id;
        const childItemRows = toRows(
          await this.siyuanApi.sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${listContainerId}'
              AND type = 'i'
            ORDER BY id ASC
          `)
        );
        logger.debug(`Found ${childItemRows.length} child list items`);

        for (const item of childItemRows) {
          const descriptorRows = toRows(
            await this.siyuanApi.sql(`
              SELECT id, content, markdown FROM blocks
              WHERE parent_id = '${item.id}'
                AND type = 'p'
                AND ${DESCRIPTOR_CONTENT_FILTER_SQL}
              LIMIT 1
            `)
          );
          addDescriptorRows(descriptorRows);
        }
      }

      if (descriptorBlockMap.size === 0) {
        const parentContainerRows = toRows(
          await this.siyuanApi.sql(`
            SELECT parent_id FROM blocks
            WHERE id = '${safeAnchorBlockId}'
            LIMIT 1
          `)
        );
        if (parentContainerRows.length > 0 && parentContainerRows[0].parent_id) {
          const parentContainerId = parentContainerRows[0].parent_id;
          const siblingItemRows = toRows(
            await this.siyuanApi.sql(`
              SELECT id FROM blocks
              WHERE parent_id = '${parentContainerId}'
                AND type = 'i'
                AND id > '${safeAnchorBlockId}'
              ORDER BY id ASC
            `)
          );
          logger.debug(`Found ${siblingItemRows.length} sibling list items`);

          for (const item of siblingItemRows) {
            const descriptorRows = toRows(
              await this.siyuanApi.sql(`
                SELECT id, content, markdown FROM blocks
                WHERE parent_id = '${item.id}'
                  AND type = 'p'
                  AND ${DESCRIPTOR_CONTENT_FILTER_SQL}
                LIMIT 1
              `)
            );
            addDescriptorRows(descriptorRows);
          }
        }
      }

      const descriptorBlocks = Array.from(descriptorBlockMap.values());
      if (descriptorBlocks.length === 0) {
        return err(new Error('No descriptor or definition block found'));
      }
      logger.info(`Found ${descriptorBlocks.length} descriptor/definition blocks`);

      const descriptorCards: ConceptDescriptorCardsResult['descriptorCards'] = [];
      const skipped: string[] = [];

      const { CreateXiuyuanFromBlocksUseCase } = await import('./CreateXiuyuanFromBlocksUseCase');
      const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
        this.xiuyuanRepository,
        this.templateRegistry,
        { siyuanApi: this.siyuanApi, eventBus: this.eventBus }
      );

      for (const descriptorBlock of descriptorBlocks) {
        const descriptorBlockId = descriptorBlock.id;
        const descriptorAttrs = await this.siyuanApi.getBlockAttrs(descriptorBlockId);
        if (descriptorAttrs && (descriptorAttrs['custom-xiuyuan-id'] || descriptorAttrs['custom-fsrs-xiuyuan-id'])) {
          logger.debug('Descriptor block already has card, skipping:', descriptorBlockId);
          skipped.push(descriptorBlockId);
          continue;
        }

        const markdown = descriptorBlock.markdown || descriptorBlock.content || '';
        const payload = buildDescriptorPayload(conceptBlockId, descriptorBlockId, markdown);
        logger.debug('Creating descriptor card:', {
          descriptorBlockId,
          templateId: payload.templateId,
          blockIds: payload.blockIds,
        });

        const result = await createXiuyuanUseCase.execute({
          blockIds: payload.blockIds,
          templateId: payload.templateId,
          fieldMapping: payload.fieldMapping,
          deckId: command.deckId || this.siyuanApi.BUILTIN_DECK_ID,
          cardType: 'descriptor',
        });

        if (!isErr(result)) {
          descriptorCards.push({
            xiuyuanId: result.value.xiuyuan.id,
            descriptorBlockId,
            cards: result.value.cards,
          });
          logger.info('Created descriptor card:', result.value.xiuyuan.id);
        } else {
          logger.error('Failed to create descriptor card:', result.error);
          skipped.push(descriptorBlockId);
        }
      }

      return ok({
        conceptCardId,
        descriptorCards,
        skipped,
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(error as Error);
    }
  }
}
