import type { IXiuyuan } from '@/core/xiuyuan/types';
import {
  isAuthorizedSchedulingWriteSource,
  type SchedulingWriteSource,
} from '@/core/scheduler/schedulingStateCleanliness';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { FSRSCard } from '@/types/card';

export type LogicalXiuyuanKey = string;
export type LogicalCardKey = string;
export type XiuyuanOwnership = 'local-owned' | 'riff-managed';

export interface MergeOutcome<T> {
  value: T;
  source: 'local' | 'remote' | 'merged';
  changed: boolean;
}

type XiuyuanLike = Pick<IXiuyuan, 'id' | 'blockIDs' | 'templateID' | 'meta' | 'createdAt' | 'updatedAt' | 'fields'>;
type CardLike = Pick<CardPersistenceDTO, 'xiuyuanID' | 'blockId' | 'meta'> | Pick<FSRSCard, 'xiuyuanID' | 'blockId' | 'meta'>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawValue of values) {
    const value = String(rawValue || '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isXiuyuanOwnership(value: unknown): value is XiuyuanOwnership {
  return value === 'local-owned' || value === 'riff-managed';
}

function isDescriptorTemplate(templateId: string): boolean {
  return templateId === 'builtin-concept-descriptor'
    || templateId === 'builtin-concept-descriptor-reverse'
    || templateId === 'builtin-concept-descriptor-both';
}

function mergeMeta(
  preferredMeta: Record<string, unknown> | undefined,
  incomingMeta: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!preferredMeta && !incomingMeta) {
    return undefined;
  }

  const merged: Record<string, unknown> = {
    ...(preferredMeta || {}),
    ...(incomingMeta || {}),
  };
  if (preferredMeta && Object.prototype.hasOwnProperty.call(preferredMeta, 'ownership')) {
    merged.ownership = preferredMeta.ownership;
  }

  const preferredCardIds = Array.isArray(preferredMeta?.cardIds)
    ? preferredMeta.cardIds.filter((value): value is string => typeof value === 'string')
    : [];
  const incomingCardIds = Array.isArray(incomingMeta?.cardIds)
    ? incomingMeta.cardIds.filter((value): value is string => typeof value === 'string')
    : [];
  const mergedCardIds = uniqueStrings([...preferredCardIds, ...incomingCardIds]);
  if (mergedCardIds.length > 0) {
    merged.cardIds = mergedCardIds;
  }

  const preferredFaces = Array.isArray(preferredMeta?.faces) ? preferredMeta.faces : [];
  const incomingFaces = Array.isArray(incomingMeta?.faces) ? incomingMeta.faces : [];
  if (preferredFaces.length === 0 && incomingFaces.length > 0) {
    merged.faces = incomingFaces;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeFieldMappings(
  preferred: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!preferred && !incoming) {
    return undefined;
  }

  return {
    ...(preferred || {}),
    ...(incoming || {}),
  };
}

function mergeStringArrays(preferred: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
  const merged = uniqueStrings([...(preferred || []), ...(incoming || [])]);
  return merged.length > 0 ? merged : undefined;
}

export function getXiuyuanRepresentativeBlockId(xiuyuan: Pick<IXiuyuan, 'blockIDs' | 'templateID'>): string {
  const blockIDs = uniqueStrings(Array.isArray(xiuyuan.blockIDs) ? xiuyuan.blockIDs : []);
  if (blockIDs.length === 0) {
    return '';
  }

  if (isDescriptorTemplate(String(xiuyuan.templateID || '').trim()) && blockIDs.length >= 2) {
    return blockIDs[1];
  }

  return blockIDs[0];
}

export function buildLogicalXiuyuanKey(xiuyuan: Pick<IXiuyuan, 'id' | 'blockIDs' | 'templateID'>): LogicalXiuyuanKey {
  const representativeBlockId = getXiuyuanRepresentativeBlockId(xiuyuan);
  if (representativeBlockId) {
    return `block:${representativeBlockId}`;
  }

  return `xiuyuan:${String(xiuyuan.id || '').trim()}`;
}

export function readCardFaceIndex(meta: unknown): number {
  if (!isObjectRecord(meta)) {
    return 0;
  }

  const faceIndex = readFiniteNumber(meta.faceIndex) ?? readFiniteNumber(meta.ruleIndex);
  if (faceIndex == null) {
    return 0;
  }

  return Math.max(0, Math.floor(faceIndex));
}

export function buildLogicalCardKey(card: CardLike, xiuyuan?: Pick<IXiuyuan, 'id' | 'blockIDs' | 'templateID'>): LogicalCardKey {
  const logicalXiuyuanKey = xiuyuan
    ? buildLogicalXiuyuanKey(xiuyuan)
    : (() => {
        const blockId = String(card.blockId || '').trim();
        if (blockId) {
          return `block:${blockId}`;
        }
        return `xiuyuan:${String(card.xiuyuanID || '').trim()}`;
      })();

  return `${logicalXiuyuanKey}::${readCardFaceIndex(card.meta)}`;
}

export function isManagedRiffXiuyuanRecord(xiuyuan: Pick<IXiuyuan, 'templateID' | 'meta'>): boolean {
  return inferXiuyuanOwnership(xiuyuan) === 'riff-managed';
}

export function inferXiuyuanOwnership(xiuyuan: Pick<IXiuyuan, 'templateID' | 'meta'>): XiuyuanOwnership {
  if (isObjectRecord(xiuyuan.meta) && isXiuyuanOwnership(xiuyuan.meta.ownership)) {
    return xiuyuan.meta.ownership;
  }

  if (String(xiuyuan.templateID || '').trim() === 'builtin-riff-sync') {
    return 'riff-managed';
  }

  return isObjectRecord(xiuyuan.meta) && xiuyuan.meta.source === 'riff-sync'
    ? 'riff-managed'
    : 'local-owned';
}

export function normalizeXiuyuanOwnership<T extends Pick<IXiuyuan, 'templateID' | 'meta'>>(xiuyuan: T): T {
  const ownership = inferXiuyuanOwnership(xiuyuan);
  const currentMeta = isObjectRecord(xiuyuan.meta) ? xiuyuan.meta : undefined;
  if (currentMeta?.ownership === ownership) {
    return xiuyuan;
  }

  return {
    ...xiuyuan,
    meta: {
      ...(currentMeta || {}),
      ownership,
    },
  } as T;
}

export function compareXiuyuanAuthority(left: XiuyuanLike, right: XiuyuanLike): number {
  const leftOwnership = inferXiuyuanOwnership(left);
  const rightOwnership = inferXiuyuanOwnership(right);
  if (leftOwnership !== rightOwnership) {
    return leftOwnership === 'local-owned' ? -1 : 1;
  }

  const leftUpdatedAt = readFiniteNumber(left.updatedAt) ?? 0;
  const rightUpdatedAt = readFiniteNumber(right.updatedAt) ?? 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  const leftCreatedAt = readFiniteNumber(left.createdAt) ?? 0;
  const rightCreatedAt = readFiniteNumber(right.createdAt) ?? 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}

export function chooseCanonicalXiuyuan<T extends XiuyuanLike>(candidates: T[]): T {
  const [firstCandidate, ...restCandidates] = candidates;
  if (!firstCandidate) {
    throw new Error('chooseCanonicalXiuyuan requires at least one candidate');
  }

  return restCandidates.reduce((best, current) => {
    return compareXiuyuanAuthority(best, current) <= 0 ? best : current;
  }, firstCandidate);
}

export function mergeXiuyuanSnapshots(
  preferred: XiuyuanLike,
  incoming: XiuyuanLike,
): MergeOutcome<IXiuyuan> {
  const normalizedPreferred = normalizeXiuyuanOwnership(preferred);
  const normalizedIncoming = normalizeXiuyuanOwnership(incoming);
  const blockIDs = uniqueStrings([
    ...(Array.isArray(normalizedPreferred.blockIDs) ? normalizedPreferred.blockIDs : []),
    ...(Array.isArray(normalizedIncoming.blockIDs) ? normalizedIncoming.blockIDs : []),
  ]);
  const fields = [
    ...(Array.isArray(normalizedPreferred.fields) ? normalizedPreferred.fields : []),
    ...(Array.isArray(normalizedIncoming.fields) ? normalizedIncoming.fields : []),
  ].filter((field, index, array) => {
    const signature = `${String(field?.name || '')}::${String(field?.blockID || '')}::${String(field?.marker || '')}`;
    return array.findIndex((candidate) => (
      `${String(candidate?.name || '')}::${String(candidate?.blockID || '')}::${String(candidate?.marker || '')}`
    ) === signature) === index;
  });

  const mergedMeta = mergeMeta(
    isObjectRecord(normalizedPreferred.meta) ? normalizedPreferred.meta : undefined,
    isObjectRecord(normalizedIncoming.meta) ? normalizedIncoming.meta : undefined,
  );

  const mergedValue: IXiuyuan = {
    ...normalizedPreferred,
    id: normalizedPreferred.id,
    blockIDs,
    fields,
    templateID: String(normalizedPreferred.templateID || normalizedIncoming.templateID || '').trim(),
    createdAt: Math.min(
      readFiniteNumber(normalizedPreferred.createdAt) ?? Date.now(),
      readFiniteNumber(normalizedIncoming.createdAt) ?? Date.now(),
    ),
    updatedAt: Math.max(
      readFiniteNumber(normalizedPreferred.updatedAt) ?? 0,
      readFiniteNumber(normalizedIncoming.updatedAt) ?? 0,
    ),
    meta: mergedMeta,
  };
  const value = normalizeXiuyuanOwnership(mergedValue);

  const changed = value.blockIDs.length !== (Array.isArray(normalizedPreferred.blockIDs) ? normalizedPreferred.blockIDs.length : 0)
    || value.fields.length !== (Array.isArray(normalizedPreferred.fields) ? normalizedPreferred.fields.length : 0)
    || value.updatedAt !== normalizedPreferred.updatedAt
    || value.meta !== normalizedPreferred.meta;

  return {
    value,
    source: 'merged',
    changed,
  };
}

export function mergeCardDTOsLocalFirst(
  localCard: CardPersistenceDTO,
  incomingCard: CardPersistenceDTO,
  options: {
    canonicalXiuyuanId?: string;
    preferIncomingScheduling?: boolean;
    schedulingWriteSource?: SchedulingWriteSource;
  } = {},
): MergeOutcome<CardPersistenceDTO> {
  const mergedMeta = mergeMeta(
    isObjectRecord(localCard.meta) ? localCard.meta : undefined,
    isObjectRecord(incomingCard.meta) ? incomingCard.meta : undefined,
  );
  const mergedTags = uniqueStrings([...(localCard.tags || []), ...(incomingCard.tags || [])]);
  const mergedFrontBlockIDs = mergeStringArrays(localCard.frontBlockIDs, incomingCard.frontBlockIDs);
  const mergedBackBlockIDs = mergeStringArrays(localCard.backBlockIDs, incomingCard.backBlockIDs);
  const mergedFieldMapping = mergeFieldMappings(localCard.fieldMapping, incomingCard.fieldMapping);
  const canonicalXiuyuanId = String(options.canonicalXiuyuanId || localCard.xiuyuanID || incomingCard.xiuyuanID || '').trim();
  const shouldPreferIncomingScheduling = options.preferIncomingScheduling === true
    && isAuthorizedSchedulingWriteSource(options.schedulingWriteSource);
  const incomingSchedulingFields: Partial<CardPersistenceDTO> = shouldPreferIncomingScheduling
    ? {
        due: incomingCard.due,
        stability: incomingCard.stability,
        difficulty: incomingCard.difficulty,
        reps: incomingCard.reps,
        lapses: incomingCard.lapses,
        state: incomingCard.state,
        lastReview: incomingCard.lastReview,
        elapsedDays: incomingCard.elapsedDays,
        scheduledDays: incomingCard.scheduledDays,
        learning_step: incomingCard.learning_step,
        aFactor: incomingCard.aFactor,
        schedulerType: incomingCard.schedulerType,
        schedulerMeta: incomingCard.schedulerMeta,
        postponeCount: incomingCard.postponeCount,
        lastPostponeDate: incomingCard.lastPostponeDate,
        rescheduleHistory: incomingCard.rescheduleHistory,
      }
    : {};

  const mergedCard: CardPersistenceDTO = {
    ...incomingCard,
    ...localCard,
    ...incomingSchedulingFields,
    id: localCard.id,
    blockId: String(localCard.blockId || incomingCard.blockId || '').trim(),
    xiuyuanID: canonicalXiuyuanId || undefined,
    tags: mergedTags,
    cardTypeMarker: incomingCard.cardTypeMarker ?? localCard.cardTypeMarker,
    syncToRiff: localCard.syncToRiff ?? incomingCard.syncToRiff,
    riffCardId: incomingCard.riffCardId ?? localCard.riffCardId,
    templateID: localCard.templateID ?? incomingCard.templateID,
    frontBlockIDs: mergedFrontBlockIDs,
    backBlockIDs: mergedBackBlockIDs,
    fieldMapping: mergedFieldMapping,
    xiuyuanPriority: localCard.xiuyuanPriority ?? incomingCard.xiuyuanPriority,
    sourceUrl: incomingCard.sourceUrl ?? localCard.sourceUrl,
    extractedFrom: incomingCard.extractedFrom ?? localCard.extractedFrom,
    meta: mergedMeta,
    createdAt: Math.min(
      readFiniteNumber(localCard.createdAt) ?? Date.now(),
      readFiniteNumber(incomingCard.createdAt) ?? Date.now(),
    ),
    updatedAt: Math.max(
      readFiniteNumber(localCard.updatedAt) ?? 0,
      readFiniteNumber(incomingCard.updatedAt) ?? 0,
    ),
  };

  const changed = mergedCard.xiuyuanID !== localCard.xiuyuanID
    || mergedCard.due !== localCard.due
    || mergedCard.stability !== localCard.stability
    || mergedCard.difficulty !== localCard.difficulty
    || mergedCard.reps !== localCard.reps
    || mergedCard.lapses !== localCard.lapses
    || mergedCard.state !== localCard.state
    || mergedCard.lastReview !== localCard.lastReview
    || mergedCard.elapsedDays !== localCard.elapsedDays
    || mergedCard.scheduledDays !== localCard.scheduledDays
    || mergedCard.learning_step !== localCard.learning_step
    || mergedCard.schedulerType !== localCard.schedulerType
    || mergedCard.schedulerMeta !== localCard.schedulerMeta
    || mergedCard.updatedAt !== localCard.updatedAt
    || mergedCard.cardTypeMarker !== localCard.cardTypeMarker
    || mergedCard.riffCardId !== localCard.riffCardId
    || mergedCard.meta !== localCard.meta;

  return {
    value: mergedCard,
    source: 'merged',
    changed,
  };
}
