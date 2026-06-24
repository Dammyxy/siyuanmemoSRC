import { Result, ok, err, isErr } from '@/types/result';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { CardsCreatedEvent } from '@/core/xiuyuan/domain/events';
import { incrementRuntimePerformanceCounter } from '@/utils/runtimePerformanceDiagnostics';

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

export interface FinalizeXiuyuanCreationBatchItem {
  xiuyuan: Xiuyuan;
  source?: string;
  riff?: FinalizeRiffOptions;
}

export interface FinalizeXiuyuanCreationBatchOptions {
  items: FinalizeXiuyuanCreationBatchItem[];
  xiuyuanRepository: IXiuyuanRepository;
  eventBus: EventBus;
  logger: FinalizerLogger;
  siyuanApi: XiuyuanSiyuanPort;
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

function createCardsForXiuyuan(
  xiuyuan: Xiuyuan,
  logger: FinalizerLogger
): Result<void> {
  const faceCount = xiuyuan.getFaces().length;
  for (let i = 0; i < faceCount; i++) {
    const cardResult = xiuyuan.createCard(i);
    if (isErr(cardResult)) {
      const error = cardResult.error || new Error(`Failed to create card for face ${i}`);
      logger.error(`Failed to create card for face ${i}:`, error);
      return err(error);
    }
  }
  return ok(undefined);
}

export async function finalizeXiuyuanCreation(
  options: FinalizeXiuyuanCreationOptions
): Promise<Result<XiuyuanCreationPayload>> {
  const { xiuyuan, xiuyuanRepository, eventBus, logger, riff, siyuanApi } = options;

  const createCardsResult = createCardsForXiuyuan(xiuyuan, logger);
  if (isErr(createCardsResult)) {
    return createCardsResult as Result<XiuyuanCreationPayload>;
  }

  if (riff && riff.blockIds.length > 0) {
    const deckId = riff.deckId || siyuanApi.BUILTIN_DECK_ID;
    try {
      incrementRuntimePerformanceCounter('autocard', 'riff-single-calls', 1);
      incrementRuntimePerformanceCounter('autocard', 'riff-single-blocks', riff.blockIds.length);
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
  incrementRuntimePerformanceCounter('autocard', 'storage-save-one-calls', 1);
  incrementRuntimePerformanceCounter('autocard', 'storage-save-one-items', 1);

  incrementRuntimePerformanceCounter('autocard', 'event-single-notifications', 1);
  await eventBus.publishAll(xiuyuan.getDomainEvents());
  xiuyuan.clearDomainEvents();

  return ok(toXiuyuanCreationPayload(xiuyuan));
}

export async function finalizeXiuyuanCreationBatch(
  options: FinalizeXiuyuanCreationBatchOptions
): Promise<Result<XiuyuanCreationPayload[]>> {
  const { items, xiuyuanRepository, eventBus, logger, siyuanApi } = options;
  if (items.length === 0) {
    return ok([]);
  }

  for (const item of items) {
    const createCardsResult = createCardsForXiuyuan(item.xiuyuan, logger);
    if (isErr(createCardsResult)) {
      return createCardsResult as Result<XiuyuanCreationPayload[]>;
    }
  }

  const riffBlockIdsByDeck = new Map<string, string[]>();
  for (const item of items) {
    const riff = item.riff;
    if (!riff || riff.blockIds.length === 0) {
      continue;
    }
    const deckId = riff.deckId || siyuanApi.BUILTIN_DECK_ID;
    const blockIds = riffBlockIdsByDeck.get(deckId) ?? [];
    blockIds.push(...riff.blockIds);
    riffBlockIdsByDeck.set(deckId, blockIds);
  }

  for (const [deckId, blockIds] of riffBlockIdsByDeck.entries()) {
    try {
      incrementRuntimePerformanceCounter('autocard', 'riff-batch-calls', 1);
      incrementRuntimePerformanceCounter('autocard', 'riff-batch-blocks', blockIds.length);
      await siyuanApi.addRiffCards(deckId, blockIds);
      logger.info('Created Xiuyuans and added to Riff:', {
        deckId,
        blockIds,
        count: blockIds.length,
        source: 'batch',
      });
    } catch (error) {
      logger.warn('Failed to add batch to Riff:', error);
    }
  }

  const xiuyuans = items.map((item) => item.xiuyuan);
  incrementRuntimePerformanceCounter('autocard', 'storage-save-many-calls', 1);
  incrementRuntimePerformanceCounter('autocard', 'storage-save-many-items', xiuyuans.length);
  const saveResult = await xiuyuanRepository.saveMany(xiuyuans);
  if (!saveResult.ok) {
    return saveResult as Result<XiuyuanCreationPayload[]>;
  }

  const batchEvent = new CardsCreatedEvent(
    `cards-created:${xiuyuans[0].getId().getValue()}`,
    xiuyuans.flatMap((xiuyuan) => xiuyuan.getCards().map((card) => card.getId().getValue())),
    xiuyuans.flatMap((xiuyuan) => xiuyuan.getBlockIDs().map((blockId) => blockId.getValue())),
    xiuyuans.map((xiuyuan) => xiuyuan.getId().getValue()),
    items.map((item) => item.source?.trim()).find((source) => Boolean(source)) || 'doc-oneclick-scan',
  );
  incrementRuntimePerformanceCounter('autocard', 'event-batch-notifications', 1);
  await eventBus.publish(batchEvent);
  xiuyuans.forEach((xiuyuan) => xiuyuan.clearDomainEvents());

  return ok(xiuyuans.map((xiuyuan) => toXiuyuanCreationPayload(xiuyuan)));
}
