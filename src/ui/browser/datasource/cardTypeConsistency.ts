import { batchDetectCardType } from '@/core/card-builder/detectCardType';
import { createLogger } from '@/utils/logger';

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
  detectedBlockIds: string[];
}

export interface CardTypeReconcileOptions {
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
      detectedBlockIds: [],
    };
  }

  const deps = options.deps ?? {};
  const detectedBlockIds = new Set<string>();
  const conflictBlockIds = new Set<string>();
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

  return {
    rows: normalizedRows,
    conflictBlockIds: Array.from(conflictBlockIds),
    detectedBlockIds: Array.from(detectedBlockIds),
  };
}
