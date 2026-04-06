import { Result, ok, err, isErr } from '@/types/result';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
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
  eventBus: EventBus;
  logger: FinalizerLogger;
  siyuanApi: XiuyuanSiyuanPort;
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
  const { xiuyuan, xiuyuanRepository, eventBus, logger, riff, siyuanApi } = options;

  const faceCount = xiuyuan.getFaces().length;
  for (let i = 0; i < faceCount; i++) {
    const cardResult = xiuyuan.createCard(i);
    if (isErr(cardResult)) {
      const error = cardResult.error || new Error(`Failed to create card for face ${i}`);
      logger.error(`Failed to create card for face ${i}:`, error);
      return err(error);
    }
  }

  if (riff && riff.blockIds.length > 0) {
    const deckId = riff.deckId || siyuanApi.BUILTIN_DECK_ID;
    try {
      await siyuanApi.addRiffCards(deckId, riff.blockIds);
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

  await eventBus.publishAll(xiuyuan.getDomainEvents());
  xiuyuan.clearDomainEvents();

  return ok(toXiuyuanCreationPayload(xiuyuan));
}
