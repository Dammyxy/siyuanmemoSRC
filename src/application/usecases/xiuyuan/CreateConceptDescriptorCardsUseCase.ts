import { Result, ok, err, isErr } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';
import { resolveConceptCard } from './shared/ConceptCardResolver';
import {
  containsDescriptorOrDefinitionSymbol,
  resolveDescriptorTemplateByMarkdown,
} from './shared/DescriptorTemplateStrategy';
import { resolveListItemAnchorBlockId } from './shared/ListItemAnchorResolver';
import {
  toXiuyuanSharedQueryPort,
  type XiuyuanSharedQueryPort,
} from './shared/XiuyuanSharedQueryPort';

const logger = createLogger('CreateConceptDescriptorCardsUseCase');

const CONCEPT_REF_PATTERN = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/;

interface BlockRow {
  id: string;
  type?: string;
  content?: string;
  markdown?: string;
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

function toDescriptorCandidate(paragraph: { id: string; markdown: string; content: string } | null): BlockRow | null {
  if (!paragraph) {
    return null;
  }
  const markdown = paragraph.markdown || paragraph.content || '';
  if (!containsDescriptorOrDefinitionSymbol(markdown)) {
    return null;
  }
  return {
    id: paragraph.id,
    content: paragraph.content,
    markdown: paragraph.markdown,
  };
}

export class CreateConceptDescriptorCardsUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;
  private readonly queryPort: XiuyuanSharedQueryPort;

  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports: { siyuanApi: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.eventBus = ports.eventBus ?? new EventBus(false);
    this.queryPort = toXiuyuanSharedQueryPort(this.siyuanApi);
  }

  async execute(command: CreateConceptDescriptorCardsCommand): Promise<Result<ConceptDescriptorCardsResult>> {
    try {
      const anchorBlockId = await resolveListItemAnchorBlockId(command.parentBlockId, this.siyuanApi);
      if (!anchorBlockId) {
        return err(new Error('Only list-item blocks or their direct paragraph blocks are supported'));
      }

      const parentParagraph = await this.queryPort.getFirstParagraphUnderParent(anchorBlockId);
      if (!parentParagraph) {
        return err(new Error('List item paragraph not found'));
      }

      const parentMarkdown = parentParagraph.markdown || parentParagraph.content || '';
      const refMatch = parentMarkdown.match(CONCEPT_REF_PATTERN);
      if (!refMatch) {
        return err(new Error('Concept reference not found in parent block'));
      }

      const conceptBlockId = refMatch[1];
      logger.info('Found concept block ID:', conceptBlockId);

      const conceptType = await this.queryPort.getBlockType(conceptBlockId);
      if (!conceptType) {
        return err(new Error('Referenced concept block does not exist'));
      }
      if (conceptType !== 'd') {
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
      const addDescriptorCandidate = (row: BlockRow | null): void => {
        if (row?.id && !descriptorBlockMap.has(row.id)) {
          descriptorBlockMap.set(row.id, row);
        }
      };

      addDescriptorCandidate(toDescriptorCandidate(parentParagraph));
      if (descriptorBlockMap.size > 0) {
        logger.debug('Added parent paragraph as descriptor/definition block');
      }

      const listContainerId = await this.queryPort.getFirstListContainerId(anchorBlockId);
      if (listContainerId) {
        const childItemRows = await this.queryPort.listListItemIdsUnderParent(listContainerId);
        logger.debug(`Found ${childItemRows.length} child list items`);
        for (const itemId of childItemRows) {
          const descriptorParagraph = await this.queryPort.getFirstParagraphUnderParent(itemId);
          addDescriptorCandidate(toDescriptorCandidate(descriptorParagraph));
        }
      }

      if (descriptorBlockMap.size === 0) {
        const parentContainerId = await this.queryPort.getParentId(anchorBlockId);
        if (parentContainerId) {
          const siblingItemRows = (await this.queryPort.listListItemIdsUnderParent(parentContainerId))
            .filter((id) => id > anchorBlockId);
          logger.debug(`Found ${siblingItemRows.length} sibling list items`);
          for (const itemId of siblingItemRows) {
            const descriptorParagraph = await this.queryPort.getFirstParagraphUnderParent(itemId);
            addDescriptorCandidate(toDescriptorCandidate(descriptorParagraph));
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
