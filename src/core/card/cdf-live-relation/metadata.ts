import type { FSRSCard } from '@/types/card';
import type {
  CdfConceptBlockId,
  CdfLiveContentStatus,
  CdfLiveRelationIssue,
  CdfLiveRelationKey,
  CdfRelationKind,
  CdfRelationStatus,
  CdfSourceBlockId,
} from './types';

export const CDF_LIVE_RELATION_AUTHORITY = 'live-backlink';

export interface CdfLiveRelationMetadata {
  liveRelationKey?: CdfLiveRelationKey;
  relationAuthority?: typeof CDF_LIVE_RELATION_AUTHORITY;
  sourceBlockId?: CdfSourceBlockId;
  conceptBlockId?: CdfConceptBlockId;
  relationKind?: CdfRelationKind;
  liveRelationStatus?: CdfRelationStatus;
  liveContentStatus?: CdfLiveContentStatus;
  liveRelationIssues?: CdfLiveRelationIssue[];
  sourceSnapshot?: Record<string, unknown>;
  conceptSnapshot?: Record<string, unknown>;
  fieldMapping?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readIssues(value: unknown): CdfLiveRelationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is CdfLiveRelationIssue => {
    if (!isRecord(item)) {
      return false;
    }
    return typeof item.code === 'string' && (item.severity === 'blocking' || item.severity === 'warning');
  });
}

export function readCdfLiveRelationMetadata(cardOrMeta: FSRSCard | Record<string, unknown> | null | undefined): CdfLiveRelationMetadata {
  const meta = isRecord((cardOrMeta as FSRSCard | undefined)?.meta)
    ? (cardOrMeta as FSRSCard).meta
    : isRecord(cardOrMeta)
      ? cardOrMeta
      : {};

  const relationAuthority = readString(meta.relationAuthority);
  return {
    liveRelationKey: readString(meta.liveRelationKey),
    relationAuthority: relationAuthority === CDF_LIVE_RELATION_AUTHORITY ? CDF_LIVE_RELATION_AUTHORITY : undefined,
    sourceBlockId: readString(meta.sourceBlockId),
    conceptBlockId: readString(meta.conceptBlockId),
    relationKind: readString(meta.relationKind) as CdfRelationKind | undefined,
    liveRelationStatus: readString(meta.liveRelationStatus) as CdfRelationStatus | undefined,
    liveContentStatus: readString(meta.liveContentStatus) as CdfLiveContentStatus | undefined,
    liveRelationIssues: readIssues(meta.liveRelationIssues),
    sourceSnapshot: isRecord(meta.sourceSnapshot) ? meta.sourceSnapshot : undefined,
    conceptSnapshot: isRecord(meta.conceptSnapshot) ? meta.conceptSnapshot : undefined,
  };
}

export function writeCdfLiveRelationMetadata(
  meta: Record<string, unknown> | null | undefined,
  patch: CdfLiveRelationMetadata,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(isRecord(meta) ? meta : {}) };
  const assignments: Record<string, unknown> = {
    liveRelationKey: patch.liveRelationKey,
    relationAuthority: patch.relationAuthority ?? CDF_LIVE_RELATION_AUTHORITY,
    sourceBlockId: patch.sourceBlockId,
    conceptBlockId: patch.conceptBlockId,
    relationKind: patch.relationKind,
    liveRelationStatus: patch.liveRelationStatus,
    liveContentStatus: patch.liveContentStatus,
    liveRelationIssues: patch.liveRelationIssues,
    sourceSnapshot: patch.sourceSnapshot,
    conceptSnapshot: patch.conceptSnapshot,
    fieldMapping: patch.fieldMapping,
  };

  for (const [key, value] of Object.entries(assignments)) {
    if (value === undefined) {
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function isCdfLiveRelationQueueEligible(cardOrMeta: FSRSCard | Record<string, unknown> | null | undefined): boolean {
  const meta = readCdfLiveRelationMetadata(cardOrMeta);
  const hasBlockingIssue = (meta.liveRelationIssues || []).some((issue) => issue.severity === 'blocking');
  return meta.liveRelationStatus === 'active-live'
    && meta.liveContentStatus === 'content-complete'
    && !hasBlockingIssue;
}

export function hasCdfLiveRelationMetadata(cardOrMeta: FSRSCard | Record<string, unknown> | null | undefined): boolean {
  const meta = readCdfLiveRelationMetadata(cardOrMeta);
  return Boolean(
    meta.relationAuthority
    || meta.liveRelationKey
    || meta.liveRelationStatus
    || meta.liveContentStatus
    || (meta.liveRelationIssues || []).length > 0
  );
}
