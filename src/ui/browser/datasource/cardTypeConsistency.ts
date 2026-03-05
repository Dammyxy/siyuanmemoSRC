import type { FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { batchDetectCardType } from '@/core/card-builder/detectCardType';

const logger = createLogger('CardTypeConsistency');

export type CanonicalCardType = 'topic' | 'item' | 'concept' | 'descriptor';

export interface CardTypeCandidate {
  blockId: string;
  cardType?: string;
}

export interface CardTypeConsistencyDependencies {
  detectTypes?: (blockIds: string[]) => Promise<Map<string, 'topic' | 'item'>>;
}

export interface CardTypeReconcileResult<T extends CardTypeCandidate = CardTypeCandidate> {
  rows: T[];
  conflictBlockIds: string[];
  attributeBackfillBlockIds: string[];
  detectedBlockIds: string[];
  repairedBlockAttrs: string[];
  repairedLocalCardIds: string[];
}

export interface CardTypeReconcileOptions {
  repair?: boolean;
  manager?: IUnifiedDataSourceManagerFacade;
  deps?: CardTypeConsistencyDependencies;
}

function isCanonicalCardType(value: unknown): value is CanonicalCardType {
  return value === 'topic'
    || value === 'item'
    || value === 'concept'
    || value === 'descriptor';
}

function normalizeCanonicalCardType(value: unknown): CanonicalCardType | undefined {
  if (!isCanonicalCardType(value)) {
    return undefined;
  }
  return value;
}

async function repairLocalCardTypes(
  resolvedTypeByBlockId: Map<string, CanonicalCardType>,
  manager?: IUnifiedDataSourceManagerFacade
): Promise<string[]> {
  const repairedCardIds: string[] = [];
  if (!manager || resolvedTypeByBlockId.size === 0) {
    return repairedCardIds;
  }

  let cards: FSRSCard[] = [];
  try {
    cards = await manager.getCards({
      blockIds: Array.from(resolvedTypeByBlockId.keys()),
    });
  } catch (error) {
    logger.warn('Failed to load cards for local card type repair', error);
    return repairedCardIds;
  }

  for (const card of cards) {
    const expectedType = resolvedTypeByBlockId.get(card.blockId);
    if (!expectedType) {
      continue;
    }
    const currentType = normalizeCanonicalCardType(card.type);
    if (currentType === expectedType) {
      continue;
    }
    try {
      await manager.updateCard({
        ...card,
        type: expectedType as FSRSCard['type'],
      });
      repairedCardIds.push(card.id);
    } catch (error) {
      logger.warn('Failed to repair local card type', {
        blockId: card.blockId,
        cardId: card.id,
        expectedType,
        error,
      });
    }
  }

  return repairedCardIds;
}

export async function reconcileBrowserCardTypes(
  rows: CardTypeCandidate[],
  options?: CardTypeReconcileOptions
): Promise<CardTypeReconcileResult>;
export async function reconcileBrowserCardTypes<T extends CardTypeCandidate>(
  rows: T[],
  options?: CardTypeReconcileOptions
) : Promise<CardTypeReconcileResult<T>>;
export async function reconcileBrowserCardTypes<T extends CardTypeCandidate>(
  rows: T[],
  options: CardTypeReconcileOptions = {}
): Promise<CardTypeReconcileResult<T>> {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    return {
      rows: [],
      conflictBlockIds: [],
      attributeBackfillBlockIds: [],
      detectedBlockIds: [],
      repairedBlockAttrs: [],
      repairedLocalCardIds: [],
    };
  }

  const deps = options.deps ?? {};
  const repair = options.repair === true;
  const detectedBlockIds = new Set<string>();
  const conflictBlockIds = new Set<string>();
  const attributeBackfillBlockIds = new Set<string>(); // kept for backward-compatible result shape
  const unresolvedBlockIds = new Set<string>();
  const resolvedTypeByBlockId = new Map<string, CanonicalCardType>();

  for (const row of safeRows) {
    const blockId = String(row.blockId || '').trim();
    if (!blockId) {
      continue;
    }

    const localType = normalizeCanonicalCardType(row.cardType);

    if (localType) {
      resolvedTypeByBlockId.set(blockId, localType);
      continue;
    }

    unresolvedBlockIds.add(blockId);
  }

  if (unresolvedBlockIds.size > 0) {
    const detectTypes = deps.detectTypes ?? batchDetectCardType;
    try {
      const detectedTypeByBlockId = await detectTypes(Array.from(unresolvedBlockIds));
      for (const [blockId, detectedType] of detectedTypeByBlockId.entries()) {
        const normalized = normalizeCanonicalCardType(detectedType);
        if (!normalized) {
          continue;
        }
        resolvedTypeByBlockId.set(blockId, normalized);
        detectedBlockIds.add(blockId);
        attributeBackfillBlockIds.add(blockId);
      }
    } catch (error) {
      logger.warn('Failed to detect card types for unresolved blocks', error);
    }
  }

  const normalizedRows = safeRows.map((row) => {
    const blockId = String(row.blockId || '').trim();
    const resolvedType = blockId ? resolvedTypeByBlockId.get(blockId) : undefined;
    if (!resolvedType || row.cardType === resolvedType) {
      return row;
    }
    return {
      ...row,
      cardType: resolvedType,
    } as T;
  });

  const repairedBlockAttrs: string[] = [];
  let repairedLocalCardIds: string[] = [];
  if (repair) {
    repairedLocalCardIds = await repairLocalCardTypes(
      resolvedTypeByBlockId,
      options.manager
    );
  }

  return {
    rows: normalizedRows,
    conflictBlockIds: Array.from(conflictBlockIds),
    attributeBackfillBlockIds: Array.from(attributeBackfillBlockIds),
    detectedBlockIds: Array.from(detectedBlockIds),
    repairedBlockAttrs,
    repairedLocalCardIds,
  };
}
