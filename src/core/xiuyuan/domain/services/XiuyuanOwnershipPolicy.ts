export type XiuyuanOwnership = 'local-owned' | 'riff-managed';

export interface XiuyuanOwnershipEvidence {
  templateID?: unknown;
  templateId?: unknown;
  meta?: unknown;
}

export interface CanonicalXiuyuanCandidate extends XiuyuanOwnershipEvidence {
  id: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFiniteTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
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

function readTemplateId(xiuyuan: XiuyuanOwnershipEvidence): string {
  return String(xiuyuan.templateID ?? xiuyuan.templateId ?? '').trim();
}

export function inferXiuyuanOwnership(xiuyuan: XiuyuanOwnershipEvidence): XiuyuanOwnership {
  if (isObjectRecord(xiuyuan.meta) && isXiuyuanOwnership(xiuyuan.meta.ownership)) {
    return xiuyuan.meta.ownership;
  }

  if (readTemplateId(xiuyuan) === 'builtin-riff-sync') {
    return 'riff-managed';
  }

  return isObjectRecord(xiuyuan.meta) && xiuyuan.meta.source === 'riff-sync'
    ? 'riff-managed'
    : 'local-owned';
}

export function normalizeXiuyuanOwnership<T extends XiuyuanOwnershipEvidence>(xiuyuan: T): T {
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

export function compareXiuyuanAuthority(
  left: CanonicalXiuyuanCandidate,
  right: CanonicalXiuyuanCandidate,
): number {
  const leftOwnership = inferXiuyuanOwnership(left);
  const rightOwnership = inferXiuyuanOwnership(right);
  if (leftOwnership !== rightOwnership) {
    return leftOwnership === 'local-owned' ? -1 : 1;
  }

  const leftUpdatedAt = readFiniteTimestamp(left.updatedAt) ?? 0;
  const rightUpdatedAt = readFiniteTimestamp(right.updatedAt) ?? 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  const leftCreatedAt = readFiniteTimestamp(left.createdAt) ?? 0;
  const rightCreatedAt = readFiniteTimestamp(right.createdAt) ?? 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}

export function chooseCanonicalXiuyuan<T extends CanonicalXiuyuanCandidate>(candidates: T[]): T {
  const [firstCandidate, ...restCandidates] = candidates;
  if (!firstCandidate) {
    throw new Error('chooseCanonicalXiuyuan requires at least one candidate');
  }

  return restCandidates.reduce((best, current) => {
    return compareXiuyuanAuthority(best, current) <= 0 ? best : current;
  }, firstCandidate);
}
