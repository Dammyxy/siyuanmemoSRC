import type { CdfConceptBlockId, CdfLiveRelationKey, CdfRelationKind, CdfSourceBlockId } from './types';

export function createCdfLiveRelationKey(
  sourceBlockId: CdfSourceBlockId,
  conceptBlockId: CdfConceptBlockId,
  relationKind: CdfRelationKind,
): CdfLiveRelationKey {
  return `${sourceBlockId}:${conceptBlockId}:${relationKind}`;
}
