import { Result, ok, err } from '@/types/result';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';

interface FinalizerLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface XiuyuanCreationPayload {
  xiuyuan: {
    id: string;
    blockIDs: string[];
    templateID: string;
  };
  cards: Array<{
    id: string;
    xiuyuanId: string;
    faceIndex: number;
  }>;
}

interface FinalizeRiffOptions {
  deckId?: string;
  blockIds: string[];
  source: string;
  context?: Record<string, unknown>;
}

export interface FinalizeXiuyuanCreationOptions {
  xiuyuan: Xiuyuan;
  xiuyuanRepository: IXiuyuanRepository;
  logger: FinalizerLogger;
  riff?: FinalizeRiffOptions;
}

export function toXiuyuanCreationPayload(xiuyuan: Xiuyuan): XiuyuanCreationPayload {
  return {
    xiuyuan: {
      id: xiuyuan.getId().getValue(),
      blockIDs: xiuyuan.getBlockIDs().map((id) => id.getValue()),
      templateID: xiuyuan.getTemplateID().getValue(),
    },
    cards: xiuyuan.getCards().map((card) => ({
      id: card.getId().getValue(),
      xiuyuanId: card.getXiuyuanId().getValue(),
      faceIndex: card.getFaceIndex(),
    })),
  };
}

export async function finalizeXiuyuanCreation(
  options: FinalizeXiuyuanCreationOptions
): Promise<Result<XiuyuanCreationPayload>> {
  const { xiuyuan, xiuyuanRepository, logger, riff } = options;

  const faceCount = xiuyuan.getFaces().length;
  for (let i = 0; i < faceCount; i++) {
    const cardResult = xiuyuan.createCard(i);
    if (!cardResult.ok) {
      const error = cardResult.error || new Error(`Failed to create card for face ${i}`);
      logger.error(`Failed to create card for face ${i}:`, error);
      return err(error);
    }
  }

  if (riff && riff.blockIds.length > 0) {
    const deckId = riff.deckId || BUILTIN_DECK_ID;
    try {
      await addRiffCards(deckId, riff.blockIds);
      logger.info('Created Xiuyuan and added to Riff:', {
        xiuyuanId: xiuyuan.getId().getValue(),
        blockIds: riff.blockIds,
        source: riff.source,
        ...(riff.context || {}),
      });
    } catch (error) {
      logger.warn('Failed to add to Riff:', error);
    }
  }

  const saveResult = await xiuyuanRepository.save(xiuyuan);
  if (!saveResult.ok) {
    return saveResult as Result<XiuyuanCreationPayload>;
  }

  return ok(toXiuyuanCreationPayload(xiuyuan));
}
