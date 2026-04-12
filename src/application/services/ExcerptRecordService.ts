import type { IFileService } from '@/infrastructure/services/FileService';

export const EXCERPT_RECORD_STORAGE_KEY = 'progressive-excerpt-records.json';
export const PROGRESSIVE_EXCERPT_COLOR_TOKEN = 'var(--b3-font-background4)';

export type ExcerptRecordEntityType = 'doc' | 'block';
export type ExcerptRecordOrigin = 'editor' | 'review';
export type ExcerptRecordStatus = 'active' | 'stale' | 'archived';

export interface ExcerptRecord {
  recordId: string;
  excerptEntityId: string;
  excerptEntityType: ExcerptRecordEntityType;
  sourceDocId: string;
  sourceBlockId: string;
  selectedText: string;
  normalizedFingerprint: string;
  colorToken: string;
  origin: ExcerptRecordOrigin;
  createdAt: number;
  status: ExcerptRecordStatus;
}

interface ExcerptRecordState {
  version: 1;
  records: ExcerptRecord[];
}

export interface ExcerptRecordListFilters {
  sourceDocId?: string;
  statuses?: ExcerptRecordStatus[];
  createdFrom?: number;
  createdTo?: number;
}

export interface CreateExcerptRecordArtifact {
  excerptEntityId: string;
  excerptEntityType: ExcerptRecordEntityType;
}

export interface CreateExcerptRecordAttemptInput<TCreated extends CreateExcerptRecordArtifact> {
  sourceDocId: string;
  sourceBlockId: string;
  selectedText: string;
  origin: ExcerptRecordOrigin;
  colorToken?: string;
  createExcerpt: () => Promise<TCreated>;
}

export type CreateExcerptRecordAttemptResult<TCreated extends CreateExcerptRecordArtifact> =
  | {
      kind: 'created';
      record: ExcerptRecord;
      created: TCreated;
    }
  | {
      kind: 'duplicate';
      record: ExcerptRecord;
    };

function createEmptyState(): ExcerptRecordState {
  return {
    version: 1,
    records: [],
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value: unknown): ExcerptRecordStatus {
  return value === 'stale' || value === 'archived' ? value : 'active';
}

function normalizeOrigin(value: unknown): ExcerptRecordOrigin {
  return value === 'review' ? 'review' : 'editor';
}

function normalizeEntityType(value: unknown): ExcerptRecordEntityType {
  return value === 'block' ? 'block' : 'doc';
}

function sanitizeTimestamp(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : Date.now();
}

function sanitizeRecord(value: unknown): ExcerptRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ExcerptRecord>;
  const recordId = normalizeString(candidate.recordId);
  const excerptEntityId = normalizeString(candidate.excerptEntityId);
  const sourceDocId = normalizeString(candidate.sourceDocId);
  const sourceBlockId = normalizeString(candidate.sourceBlockId);
  const selectedText = normalizeString(candidate.selectedText);
  const normalizedFingerprint = normalizeExcerptFingerprint(candidate.normalizedFingerprint || candidate.selectedText || '');

  if (!recordId || !excerptEntityId || !sourceDocId || !sourceBlockId || !selectedText || !normalizedFingerprint) {
    return null;
  }

  return {
    recordId,
    excerptEntityId,
    excerptEntityType: normalizeEntityType(candidate.excerptEntityType),
    sourceDocId,
    sourceBlockId,
    selectedText,
    normalizedFingerprint,
    colorToken: normalizeString(candidate.colorToken) || PROGRESSIVE_EXCERPT_COLOR_TOKEN,
    origin: normalizeOrigin(candidate.origin),
    createdAt: sanitizeTimestamp(candidate.createdAt),
    status: normalizeStatus(candidate.status),
  };
}

function sortRecords(records: ExcerptRecord[]): ExcerptRecord[] {
  return [...records].sort((left, right) => {
    if (right.createdAt !== left.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return right.recordId.localeCompare(left.recordId);
  });
}

export function normalizeExcerptFingerprint(value: string): string {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ExcerptRecordService {
  constructor(
    private readonly fileService: IFileService,
    private readonly storageKey = EXCERPT_RECORD_STORAGE_KEY,
  ) {}

  async createOrRejectDuplicate<TCreated extends CreateExcerptRecordArtifact>(
    input: CreateExcerptRecordAttemptInput<TCreated>,
  ): Promise<CreateExcerptRecordAttemptResult<TCreated>> {
    const sourceDocId = normalizeString(input.sourceDocId);
    const sourceBlockId = normalizeString(input.sourceBlockId);
    const selectedText = normalizeString(input.selectedText);
    const normalizedFingerprint = normalizeExcerptFingerprint(selectedText);
    if (!sourceDocId || !sourceBlockId || !selectedText || !normalizedFingerprint) {
      throw new Error('摘录记录需要有效的来源与文本');
    }

    const state = await this.readState();
    const duplicate = state.records.find((record) =>
      record.sourceBlockId === sourceBlockId
      && record.normalizedFingerprint === normalizedFingerprint
      && record.status !== 'archived'
    );
    if (duplicate) {
      return {
        kind: 'duplicate',
        record: duplicate,
      };
    }

    const created = await input.createExcerpt();
    const excerptEntityId = normalizeString(created.excerptEntityId);
    if (!excerptEntityId) {
      throw new Error('摘录记录需要有效的摘录实体 ID');
    }

    const record: ExcerptRecord = {
      recordId: this.createRecordId(),
      excerptEntityId,
      excerptEntityType: normalizeEntityType(created.excerptEntityType),
      sourceDocId,
      sourceBlockId,
      selectedText,
      normalizedFingerprint,
      colorToken: normalizeString(input.colorToken) || PROGRESSIVE_EXCERPT_COLOR_TOKEN,
      origin: normalizeOrigin(input.origin),
      createdAt: Date.now(),
      status: 'active',
    };

    state.records.unshift(record);
    await this.writeState(state);

    return {
      kind: 'created',
      record,
      created,
    };
  }

  async list(filters: ExcerptRecordListFilters = {}): Promise<ExcerptRecord[]> {
    const state = await this.readState();
    const statusFilter = Array.isArray(filters.statuses) && filters.statuses.length > 0
      ? new Set(filters.statuses)
      : null;
    const sourceDocId = normalizeString(filters.sourceDocId);
    const createdFrom = Number.isFinite(filters.createdFrom) ? Number(filters.createdFrom) : null;
    const createdTo = Number.isFinite(filters.createdTo) ? Number(filters.createdTo) : null;

    return sortRecords(state.records.filter((record) => {
      if (statusFilter && !statusFilter.has(record.status)) {
        return false;
      }
      if (sourceDocId && record.sourceDocId !== sourceDocId) {
        return false;
      }
      if (createdFrom !== null && record.createdAt < createdFrom) {
        return false;
      }
      if (createdTo !== null && record.createdAt > createdTo) {
        return false;
      }
      return true;
    }));
  }

  async get(recordId: string): Promise<ExcerptRecord | null> {
    const normalizedRecordId = normalizeString(recordId);
    if (!normalizedRecordId) {
      return null;
    }
    const state = await this.readState();
    return state.records.find((record) => record.recordId === normalizedRecordId) || null;
  }

  async findBySourceBlock(sourceBlockId: string): Promise<ExcerptRecord[]> {
    const normalizedSourceBlockId = normalizeString(sourceBlockId);
    if (!normalizedSourceBlockId) {
      return [];
    }
    const state = await this.readState();
    return sortRecords(state.records.filter((record) => record.sourceBlockId === normalizedSourceBlockId));
  }

  async archive(recordId: string): Promise<ExcerptRecord | null> {
    return this.updateStatus(recordId, 'archived');
  }

  async markStale(recordId: string): Promise<ExcerptRecord | null> {
    return this.updateStatus(recordId, 'stale');
  }

  async delete(recordId: string): Promise<void> {
    const normalizedRecordId = normalizeString(recordId);
    if (!normalizedRecordId) {
      return;
    }

    const state = await this.readState();
    const nextRecords = state.records.filter((record) => record.recordId !== normalizedRecordId);
    if (nextRecords.length === state.records.length) {
      return;
    }

    state.records = nextRecords;
    await this.writeState(state);
  }

  private async updateStatus(recordId: string, status: ExcerptRecordStatus): Promise<ExcerptRecord | null> {
    const normalizedRecordId = normalizeString(recordId);
    if (!normalizedRecordId) {
      return null;
    }

    const state = await this.readState();
    const record = state.records.find((entry) => entry.recordId === normalizedRecordId);
    if (!record) {
      return null;
    }

    if (record.status === status) {
      return record;
    }

    record.status = status;
    await this.writeState(state);
    return record;
  }

  private async readState(): Promise<ExcerptRecordState> {
    const persisted = await this.fileService.readJSON<ExcerptRecordState>(this.storageKey);
    if (!persisted || typeof persisted !== 'object') {
      return createEmptyState();
    }

    const records = Array.isArray((persisted as { records?: unknown[] }).records)
      ? (persisted as { records: unknown[] }).records.map(sanitizeRecord).filter((record): record is ExcerptRecord => record !== null)
      : [];

    return {
      version: 1,
      records: sortRecords(records),
    };
  }

  private async writeState(state: ExcerptRecordState): Promise<void> {
    await this.fileService.writeJSON(this.storageKey, {
      version: 1,
      records: sortRecords(state.records),
    } satisfies ExcerptRecordState);
  }

  private createRecordId(): string {
    const now = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `excerpt-record-${now}-${random}`;
  }
}
