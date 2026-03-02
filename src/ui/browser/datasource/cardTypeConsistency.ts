import type { FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { batchDetectCardType } from '@/core/card-builder/detectCardType';
import { runBrowserSql, setBrowserCardType } from '../browserService';

const logger = createLogger('CardTypeConsistency');

export type CanonicalCardType = 'topic' | 'item' | 'concept' | 'descriptor';

export interface CardTypeCandidate {
  blockId: string;
  cardType?: string;
}

type CardTypeSqlRow = {
  block_id?: string;
  value?: string;
};

export interface CardTypeConsistencyDependencies {
  runSql?: (stmt: string) => Promise<CardTypeSqlRow[]>;
  setBlockType?: (blockId: string, cardType: CanonicalCardType) => Promise<void>;
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

const ATTRIBUTE_CARD_TYPE_NAME = 'custom-fsrs-card-type';
const BLOCK_ID_BATCH_SIZE = 200;

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAttributeCardTypes(
  blockIds: string[],
  deps: CardTypeConsistencyDependencies
): Promise<Map<string, CanonicalCardType>> {
  const typeMap = new Map<string, CanonicalCardType>();
  const runSql = deps.runSql ?? runBrowserSql<CardTypeSqlRow>;
  if (blockIds.length === 0) {
    return typeMap;
  }

  const batches = chunkArray(blockIds, BLOCK_ID_BATCH_SIZE);
  for (const batch of batches) {
    const inClause = batch.map((blockId) => `'${escapeSQL(blockId)}'`).join(',');
    const stmt = `
      SELECT block_id, value
      FROM attributes
      WHERE block_id IN (${inClause})
        AND name = '${ATTRIBUTE_CARD_TYPE_NAME}'
    `;
    const rows = await runSql(stmt);
    for (const row of rows || []) {
      if (!row || typeof row.block_id !== 'string') {
        continue;
      }
      const blockId = row.block_id.trim();
      const cardType = normalizeCanonicalCardType(row.value);
      if (!blockId || !cardType) {
        continue;
      }
      typeMap.set(blockId, cardType);
    }
  }

  return typeMap;
}

async function repairBlockAttributeTypes(
  blockIds: Set<string>,
  resolvedTypeByBlockId: Map<string, CanonicalCardType>,
  deps: CardTypeConsistencyDependencies
): Promise<string[]> {
  const updatedBlockIds: string[] = [];
  const setBlockType = deps.setBlockType ?? setBrowserCardType;
  for (const blockId of blockIds) {
    const cardType = resolvedTypeByBlockId.get(blockId);
    if (!cardType) {
      continue;
    }
    try {
      await setBlockType(blockId, cardType);
      updatedBlockIds.push(blockId);
    } catch (error) {
      logger.warn('Failed to repair block card type attribute', { blockId, cardType, error });
    }
  }
  return updatedBlockIds;
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
  options: CardTypeReconcileOptions = {}
): Promise<CardTypeReconcileResult>;
export async function reconcileBrowserCardTypes<T extends CardTypeCandidate>(
  rows: T[],
  options: CardTypeReconcileOptions = {}
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
  const uniqueBlockIds = Array.from(new Set(
    safeRows
      .map((row) => String(row.blockId || '').trim())
      .filter(Boolean)
  ));

  const attributeTypeByBlockId = await fetchAttributeCardTypes(uniqueBlockIds, deps);
  const detectedBlockIds = new Set<string>();
  const conflictBlockIds = new Set<string>();
  const attributeBackfillBlockIds = new Set<string>();
  const unresolvedBlockIds = new Set<string>();
  const resolvedTypeByBlockId = new Map<string, CanonicalCardType>();

  for (const row of safeRows) {
    const blockId = String(row.blockId || '').trim();
    if (!blockId) {
      continue;
    }

    const attributeType = attributeTypeByBlockId.get(blockId);
    const localType = normalizeCanonicalCardType(row.cardType);

    if (attributeType) {
      resolvedTypeByBlockId.set(blockId, attributeType);
      if (localType && localType !== attributeType) {
        conflictBlockIds.add(blockId);
      }
      continue;
    }

    if (localType) {
      resolvedTypeByBlockId.set(blockId, localType);
      attributeBackfillBlockIds.add(blockId);
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
        attributeBackfillBlockIds.add(blockId);
        detectedBlockIds.add(blockId);
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

  let repairedBlockAttrs: string[] = [];
  let repairedLocalCardIds: string[] = [];
  if (repair) {
    repairedBlockAttrs = await repairBlockAttributeTypes(
      attributeBackfillBlockIds,
      resolvedTypeByBlockId,
      deps
    );
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
