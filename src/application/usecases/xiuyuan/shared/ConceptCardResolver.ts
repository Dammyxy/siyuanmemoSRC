import { sql, getBlockAttrs } from '@/core/siyuan/api';
import { BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('XiuyuanConceptCardResolver');

interface ConceptCardResolverDeps {
  xiuyuanRepository: IXiuyuanRepository;
  templateRegistry: Map<string, ICardTemplate>;
}

interface ResolveConceptCardParams extends ConceptCardResolverDeps {
  conceptId: string;
  deckId?: string;
}

export interface ResolvedConceptCard {
  conceptName: string;
  conceptCardId: string;
  createdConceptCard: boolean;
}

export async function resolveConceptCard(params: ResolveConceptCardParams): Promise<ResolvedConceptCard> {
  const { conceptId, deckId, xiuyuanRepository, templateRegistry } = params;

  const conceptQuery = await sql(`
    SELECT content FROM blocks
    WHERE id = '${conceptId}'
    LIMIT 1
  `);
  if (!conceptQuery || conceptQuery.length === 0) {
    throw new Error('Concept block does not exist');
  }
  const conceptName = conceptQuery[0].content;

  const conceptAttrs = await getBlockAttrs(conceptId);
  if (!conceptAttrs || (!conceptAttrs['custom-xiuyuan-id'] && !conceptAttrs['custom-fsrs-xiuyuan-id'])) {
    logger.info('Concept block has no card, creating...', conceptId);

    const { CreateXiuyuanFromBlocksUseCase } = await import('../CreateXiuyuanFromBlocksUseCase');
    const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(xiuyuanRepository, templateRegistry);
    const createResult = await createXiuyuanUseCase.execute({
      blockIds: [conceptId],
      templateId: 'builtin-concept-simple',
      fieldMapping: { concept: conceptId },
      deckId: deckId || BUILTIN_DECK_ID,
      cardType: 'concept',
    });

    if (!createResult.ok) {
      const errorMsg = createResult.error?.message || 'Unknown error';
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
