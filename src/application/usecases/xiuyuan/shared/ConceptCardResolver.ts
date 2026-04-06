import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { isErr } from '@/types/result';
import { createLogger } from '@/utils/logger';

const logger = createLogger('XiuyuanConceptCardResolver');

interface ConceptCardResolverDeps {
  xiuyuanRepository: IXiuyuanRepository;
  templateRegistry: Map<string, ICardTemplate>;
}

interface ResolveConceptCardParams extends ConceptCardResolverDeps {
  conceptId: string;
  deckId?: string;
  siyuanApi: XiuyuanSiyuanPort;
  eventBus?: EventBus;
}

export interface ResolvedConceptCard {
  conceptName: string;
  conceptCardId: string;
  createdConceptCard: boolean;
}

interface ConceptContentRow extends Record<string, unknown> {
  content?: string;
}

export async function resolveConceptCard(params: ResolveConceptCardParams): Promise<ResolvedConceptCard> {
  const { conceptId, deckId, xiuyuanRepository, templateRegistry, siyuanApi, eventBus } = params;

  const conceptQuery = await siyuanApi.sql<ConceptContentRow>(`
    SELECT content FROM blocks
    WHERE id = '${conceptId}'
    LIMIT 1
  `);
  if (!conceptQuery || conceptQuery.length === 0) {
    throw new Error('Concept block does not exist');
  }
  const conceptName = typeof conceptQuery[0]?.content === 'string' ? conceptQuery[0].content : '';

  const conceptAttrs = await siyuanApi.getBlockAttrs(conceptId);
  if (!conceptAttrs || (!conceptAttrs['custom-xiuyuan-id'] && !conceptAttrs['custom-fsrs-xiuyuan-id'])) {
    logger.info('Concept block has no card, creating...', conceptId);

    const { CreateXiuyuanFromBlocksUseCase } = await import('../CreateXiuyuanFromBlocksUseCase');
    const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
      xiuyuanRepository,
      templateRegistry,
      { siyuanApi, eventBus }
    );
    const createResult = await createXiuyuanUseCase.execute({
      blockIds: [conceptId],
      templateId: 'builtin-concept-simple',
      fieldMapping: { concept: conceptId },
      deckId: deckId || siyuanApi.BUILTIN_DECK_ID,
      cardType: 'concept',
    });

    if (isErr(createResult)) {
      const errorMsg = createResult.error.message || 'Unknown error';
      throw new Error(`Failed to create concept card: ${errorMsg}`);
    }

    const conceptCardId = createResult.value.xiuyuan.id;
    logger.info('Created concept card:', conceptCardId);
    return {
      conceptName,
      conceptCardId,
      createdConceptCard: true,
    };
  }

  const conceptCardId = conceptAttrs['custom-xiuyuan-id'] || conceptAttrs['custom-fsrs-xiuyuan-id'];
  logger.debug('Concept block already has card:', conceptCardId);
  return {
    conceptName,
    conceptCardId,
    createdConceptCard: false,
  };
}
