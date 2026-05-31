export interface ReviewFeedbackJournalStoreStats {
  entryCount: number;
  pendingCount: number;
  pendingBytes: number;
  oldestPendingAt: number | null;
  statusCounts: Partial<Record<ReviewFeedbackJournalEntryStatus, number>>;
  updatedAt: number;
}

export type ReviewFeedbackJournalEntryStatus =
  | 'prepared'
  | 'projection-applied'
  | 'truth-flushed'
  | 'projection-failed'
  | 'unavailable'
  | 'repair-required';

export interface ReviewFeedbackJournalStore {
  readonly storage: 'non-siyuan' | 'unavailable';
  appendEntry(entry: unknown): Promise<ReviewFeedbackJournalStoreStats>;
  listEntries(): Promise<unknown[]>;
  listPendingEntries(): Promise<unknown[]>;
  listEntriesByStatus(status: ReviewFeedbackJournalEntryStatus, limit: number): Promise<unknown[]>;
  updateEntryStatus(
    id: string,
    status: ReviewFeedbackJournalEntryStatus,
    patch?: Record<string, unknown>,
  ): Promise<ReviewFeedbackJournalStoreStats>;
  getStats(): Promise<ReviewFeedbackJournalStoreStats>;
  clearEntries(): Promise<ReviewFeedbackJournalStoreStats>;
  readSnapshot?(): Promise<unknown | null>;
  writeSnapshot?(snapshot: unknown): Promise<void>;
}

const INDEXED_DB_NAME = 'siyuanmemo-review-feedback-journal';
const INDEXED_DB_VERSION = 3;
const INDEXED_DB_LEGACY_STORE_NAME = 'snapshots';
const INDEXED_DB_ENTRIES_STORE_NAME = 'entries';
const INDEXED_DB_METADATA_STORE_NAME = 'metadata';
const INDEXED_DB_SNAPSHOT_KEY = 'review-feedback-journal.v1';
const INDEXED_DB_STATS_KEY = 'stats';
const INDEXED_DB_LEGACY_MIGRATED_KEY = 'legacySnapshotMigrated';
const INDEXED_DB_PENDING_INDEX = 'pendingKey';
const INDEXED_DB_STATUS_INDEX = 'status';
const INDEXED_DB_STATUS_RECORDED_AT_INDEX = 'statusRecordedAt';
const INDEXED_DB_CARD_INDEX = 'cardId';
const INDEXED_DB_RECORDED_AT_INDEX = 'recordedAt';
const INDEXED_DB_IDEMPOTENCY_INDEX = 'idempotencyKey';
const INTERNAL_PENDING_KEY = '__siyuanmemoPendingKey';
const INTERNAL_STATUS_RECORDED_AT_KEY = '__siyuanmemoStatusRecordedAt';
const PENDING_ENTRY_KEY = 'pending';
const APPLIED_ENTRY_KEY = 'applied';
const REVIEW_FEEDBACK_JOURNAL_STATUSES = new Set<ReviewFeedbackJournalEntryStatus>([
  'prepared',
  'projection-applied',
  'truth-flushed',
  'projection-failed',
  'unavailable',
  'repair-required',
]);

function unavailableError(reason: string): Error {
  return new Error(`BACKEND_UNAVAILABLE: review.feedback non-SiYuan journal store unavailable (${reason})`);
}

function resolveIndexedDBFactory(): IDBFactory | null {
  const candidate = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return candidate && typeof candidate.open === 'function' ? candidate : null;
}

function requestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? unavailableError('indexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? unavailableError('indexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? unavailableError('indexedDB transaction aborted'));
  });
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getEntryId(entry: unknown): string | null {
  return isRecord(entry) && typeof entry.id === 'string' && entry.id.trim()
    ? entry.id
    : null;
}

function getRecordedAt(entry: unknown): number {
  return isRecord(entry) && typeof entry.recordedAt === 'number' && Number.isFinite(entry.recordedAt)
    ? entry.recordedAt
    : Date.now();
}

function normalizeEntryStatus(entry: unknown): ReviewFeedbackJournalEntryStatus {
  if (isRecord(entry)
    && typeof entry.status === 'string'
    && REVIEW_FEEDBACK_JOURNAL_STATUSES.has(entry.status as ReviewFeedbackJournalEntryStatus)) {
    return entry.status as ReviewFeedbackJournalEntryStatus;
  }
  return 'prepared';
}

function isPendingEntry(entry: unknown): boolean {
  return normalizeEntryStatus(entry) !== 'truth-flushed';
}

function withInternalIndexes(entry: unknown): unknown {
  if (!isRecord(entry)) {
    return entry;
  }
  const status = normalizeEntryStatus(entry);
  return {
    ...entry,
    status,
    [INTERNAL_PENDING_KEY]: status !== 'truth-flushed' ? PENDING_ENTRY_KEY : APPLIED_ENTRY_KEY,
    [INTERNAL_STATUS_RECORDED_AT_KEY]: [status, getRecordedAt(entry)],
  };
}

function stripInternalIndexes(entry: unknown): unknown {
  if (!isRecord(entry) || (!(INTERNAL_PENDING_KEY in entry) && !(INTERNAL_STATUS_RECORDED_AT_KEY in entry))) {
    return entry;
  }
  const clone = { ...entry };
  delete clone[INTERNAL_PENDING_KEY];
  delete clone[INTERNAL_STATUS_RECORDED_AT_KEY];
  return clone;
}

function estimateJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function estimatePendingEntryBytes(entry: unknown): number {
  return isPendingEntry(entry) ? estimateJsonByteLength(stripInternalIndexes(entry)) : 0;
}

function emptyStats(updatedAt = 0): ReviewFeedbackJournalStoreStats {
  return {
    entryCount: 0,
    pendingCount: 0,
    pendingBytes: 0,
    oldestPendingAt: null,
    statusCounts: {},
    updatedAt,
  };
}

function normalizeStats(value: unknown): ReviewFeedbackJournalStoreStats {
  if (!isRecord(value)) {
    return emptyStats();
  }
  return {
    entryCount: Math.max(0, Math.floor(Number(value.entryCount) || 0)),
    pendingCount: Math.max(0, Math.floor(Number(value.pendingCount) || 0)),
    pendingBytes: Math.max(0, Math.floor(Number(value.pendingBytes) || 0)),
    oldestPendingAt: typeof value.oldestPendingAt === 'number' && Number.isFinite(value.oldestPendingAt)
      ? value.oldestPendingAt
      : null,
    statusCounts: normalizeStatusCounts(value.statusCounts),
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || 0)),
  };
}

function buildStats(entries: unknown[], updatedAt = Date.now()): ReviewFeedbackJournalStoreStats {
  let pendingCount = 0;
  let pendingBytes = 0;
  let oldestPendingAt: number | null = null;
  const statusCounts: Partial<Record<ReviewFeedbackJournalEntryStatus, number>> = {};
  for (const entry of entries) {
    const status = normalizeEntryStatus(entry);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (isPendingEntry(entry)) {
      pendingCount += 1;
      pendingBytes += estimatePendingEntryBytes(entry);
      const recordedAt = getRecordedAt(entry);
      oldestPendingAt = oldestPendingAt === null ? recordedAt : Math.min(oldestPendingAt, recordedAt);
    }
  }
  return {
    entryCount: entries.length,
    pendingCount,
    pendingBytes,
    oldestPendingAt,
    statusCounts,
    updatedAt,
  };
}

function normalizeStatusCounts(value: unknown): Partial<Record<ReviewFeedbackJournalEntryStatus, number>> {
  if (!isRecord(value)) {
    return {};
  }
  const counts: Partial<Record<ReviewFeedbackJournalEntryStatus, number>> = {};
  for (const status of REVIEW_FEEDBACK_JOURNAL_STATUSES) {
    const count = Math.max(0, Math.floor(Number(value[status]) || 0));
    if (count > 0) {
      counts[status] = count;
    }
  }
  return counts;
}

function minNullable(a: number | null, b: number): number {
  return a === null ? b : Math.min(a, b);
}

function updateStatsForStatusChange(
  currentStats: ReviewFeedbackJournalStoreStats,
  existing: unknown,
  next: unknown,
): ReviewFeedbackJournalStoreStats {
  const existingPending = isPendingEntry(existing);
  const nextPending = isPendingEntry(next);
  const existingStatus = normalizeEntryStatus(existing);
  const nextStatus = normalizeEntryStatus(next);
  const statusCounts = { ...currentStats.statusCounts };
  statusCounts[existingStatus] = Math.max(0, (statusCounts[existingStatus] ?? 0) - 1);
  if (statusCounts[existingStatus] === 0) {
    delete statusCounts[existingStatus];
  }
  statusCounts[nextStatus] = (statusCounts[nextStatus] ?? 0) + 1;
  return {
    entryCount: currentStats.entryCount,
    pendingCount: Math.max(0, currentStats.pendingCount - (existingPending ? 1 : 0) + (nextPending ? 1 : 0)),
    pendingBytes: Math.max(
      0,
      currentStats.pendingBytes
        - (existingPending ? estimatePendingEntryBytes(existing) : 0)
        + (nextPending ? estimatePendingEntryBytes(next) : 0),
    ),
    oldestPendingAt: currentStats.oldestPendingAt,
    statusCounts,
    updatedAt: Date.now(),
  };
}

function normalizeSnapshotEntries(snapshot: unknown): unknown[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.entries)) {
    return [];
  }
  return snapshot.entries.filter((entry) => getEntryId(entry));
}

function ensureEntryIndexes(store: IDBObjectStore): void {
  if (!store.indexNames.contains(INDEXED_DB_PENDING_INDEX)) {
    store.createIndex(INDEXED_DB_PENDING_INDEX, INTERNAL_PENDING_KEY, { unique: false });
  }
  if (!store.indexNames.contains(INDEXED_DB_STATUS_INDEX)) {
    store.createIndex(INDEXED_DB_STATUS_INDEX, 'status', { unique: false });
  }
  if (!store.indexNames.contains(INDEXED_DB_STATUS_RECORDED_AT_INDEX)) {
    store.createIndex(INDEXED_DB_STATUS_RECORDED_AT_INDEX, INTERNAL_STATUS_RECORDED_AT_KEY, { unique: false });
  }
  if (!store.indexNames.contains(INDEXED_DB_CARD_INDEX)) {
    store.createIndex(INDEXED_DB_CARD_INDEX, 'cardId', { unique: false });
  }
  if (!store.indexNames.contains(INDEXED_DB_RECORDED_AT_INDEX)) {
    store.createIndex(INDEXED_DB_RECORDED_AT_INDEX, 'recordedAt', { unique: false });
  }
  if (!store.indexNames.contains(INDEXED_DB_IDEMPOTENCY_INDEX)) {
    store.createIndex(INDEXED_DB_IDEMPOTENCY_INDEX, 'idempotencyKey', { unique: false });
  }
}

class IndexedDbReviewFeedbackJournalStore implements ReviewFeedbackJournalStore {
  readonly storage = 'non-siyuan' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private legacyMigrationPromise: Promise<void> | null = null;

  async appendEntry(entry: unknown): Promise<ReviewFeedbackJournalStoreStats> {
    const id = getEntryId(entry);
    if (!id) {
      throw unavailableError('journal entry id unavailable');
    }
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const indexedEntry = withInternalIndexes(entry);
    const transaction = db.transaction([INDEXED_DB_ENTRIES_STORE_NAME, INDEXED_DB_METADATA_STORE_NAME], 'readwrite');
    const entriesStore = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME);
    const metadataStore = transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME);
    const existing = await requestToPromise(entriesStore.get(id));
    const currentStats = normalizeStats(await requestToPromise(metadataStore.get(INDEXED_DB_STATS_KEY)));
    const existingPending = existing !== undefined && isPendingEntry(existing);
    const nextPending = isPendingEntry(indexedEntry);
    const existingStatus = existing !== undefined ? normalizeEntryStatus(existing) : null;
    const nextStatus = normalizeEntryStatus(indexedEntry);
    const statusCounts = { ...currentStats.statusCounts };
    if (existingStatus) {
      statusCounts[existingStatus] = Math.max(0, (statusCounts[existingStatus] ?? 0) - 1);
      if (statusCounts[existingStatus] === 0) {
        delete statusCounts[existingStatus];
      }
    }
    statusCounts[nextStatus] = (statusCounts[nextStatus] ?? 0) + 1;
    const nextStats = {
      entryCount: currentStats.entryCount + (existing === undefined ? 1 : 0),
      pendingCount: Math.max(0, currentStats.pendingCount - (existingPending ? 1 : 0) + (nextPending ? 1 : 0)),
      pendingBytes: Math.max(
        0,
        currentStats.pendingBytes
          - (existingPending ? estimatePendingEntryBytes(existing) : 0)
          + (nextPending ? estimatePendingEntryBytes(indexedEntry) : 0),
      ),
      oldestPendingAt: existing === undefined && nextPending
        ? minNullable(currentStats.oldestPendingAt, getRecordedAt(indexedEntry))
        : currentStats.oldestPendingAt,
      statusCounts,
      updatedAt: Date.now(),
    } satisfies ReviewFeedbackJournalStoreStats;
    entriesStore.put(indexedEntry);
    metadataStore.put(nextStats, INDEXED_DB_STATS_KEY);
    await transactionDone(transaction);
    return nextStats;
  }

  async listEntries(): Promise<unknown[]> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const transaction = db.transaction(INDEXED_DB_ENTRIES_STORE_NAME, 'readonly');
    const request = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME).getAll();
    const result = await requestToPromise(request);
    await transactionDone(transaction);
    return result.map((entry) => stripInternalIndexes(cloneValue(entry)));
  }

  async listPendingEntries(): Promise<unknown[]> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const transaction = db.transaction(INDEXED_DB_ENTRIES_STORE_NAME, 'readonly');
    const index = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME).index(INDEXED_DB_PENDING_INDEX);
    const request = index.getAll(PENDING_ENTRY_KEY);
    const result = await requestToPromise(request);
    await transactionDone(transaction);
    return result.map((entry) => stripInternalIndexes(cloneValue(entry)));
  }

  async listEntriesByStatus(status: ReviewFeedbackJournalEntryStatus, limit: number): Promise<unknown[]> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const boundedLimit = Math.max(1, Math.floor(Number(limit) || 1));
    const transaction = db.transaction(INDEXED_DB_ENTRIES_STORE_NAME, 'readonly');
    const index = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME).index(INDEXED_DB_STATUS_RECORDED_AT_INDEX);
    const request = index.openCursor(IDBKeyRange.bound([status, 0], [status, Number.MAX_SAFE_INTEGER]));
    const entries: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || entries.length >= boundedLimit) {
          resolve();
          return;
        }
        entries.push(stripInternalIndexes(cloneValue(cursor.value)));
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? unavailableError('indexedDB status cursor failed'));
    });
    await transactionDone(transaction);
    return entries;
  }

  async updateEntryStatus(
    id: string,
    status: ReviewFeedbackJournalEntryStatus,
    patch: Record<string, unknown> = {},
  ): Promise<ReviewFeedbackJournalStoreStats> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const transaction = db.transaction([INDEXED_DB_ENTRIES_STORE_NAME, INDEXED_DB_METADATA_STORE_NAME], 'readwrite');
    const entriesStore = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME);
    const metadataStore = transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME);
    const existing = await requestToPromise(entriesStore.get(id));
    if (existing === undefined) {
      await transactionDone(transaction);
      return normalizeStats(await this.getStats());
    }
    const nextEntry = withInternalIndexes({
      ...(isRecord(existing) ? stripInternalIndexes(existing) : {}),
      ...patch,
      status,
    });
    const currentStats = normalizeStats(await requestToPromise(metadataStore.get(INDEXED_DB_STATS_KEY)));
    const nextStats = updateStatsForStatusChange(currentStats, existing, nextEntry);
    entriesStore.put(nextEntry);
    metadataStore.put(nextStats, INDEXED_DB_STATS_KEY);
    await transactionDone(transaction);
    if (isPendingEntry(nextEntry) && nextStats.oldestPendingAt === null) {
      return this.rebuildStatsFromEntries(db);
    }
    if (isPendingEntry(existing)
      && !isPendingEntry(nextEntry)
      && currentStats.oldestPendingAt === getRecordedAt(existing)) {
      return this.rebuildStatsFromEntries(db);
    }
    return nextStats;
  }

  async getStats(): Promise<ReviewFeedbackJournalStoreStats> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const transaction = db.transaction(INDEXED_DB_METADATA_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME).get(INDEXED_DB_STATS_KEY));
    await transactionDone(transaction);
    return normalizeStats(result);
  }

  async clearEntries(): Promise<ReviewFeedbackJournalStoreStats> {
    const db = await this.openDatabase();
    await this.ensureLegacySnapshotMigrated(db);
    const nextStats = emptyStats(Date.now());
    const transaction = db.transaction([INDEXED_DB_ENTRIES_STORE_NAME, INDEXED_DB_METADATA_STORE_NAME], 'readwrite');
    transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME).clear();
    transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME).put(nextStats, INDEXED_DB_STATS_KEY);
    await transactionDone(transaction);
    return nextStats;
  }

  async readSnapshot(): Promise<unknown | null> {
    const entries = await this.listEntries();
    const stats = await this.getStats();
    return {
      version: 1,
      entries,
      updatedAt: stats.updatedAt,
    };
  }

  async writeSnapshot(snapshot: unknown): Promise<void> {
    const entries = normalizeSnapshotEntries(snapshot);
    const indexedEntries = entries.map((entry) => withInternalIndexes(entry));
    const stats = buildStats(indexedEntries);
    const db = await this.openDatabase();
    const transaction = db.transaction([INDEXED_DB_ENTRIES_STORE_NAME, INDEXED_DB_METADATA_STORE_NAME], 'readwrite');
    const entriesStore = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME);
    entriesStore.clear();
    for (const entry of indexedEntries) {
      entriesStore.put(entry);
    }
    transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME).put(stats, INDEXED_DB_STATS_KEY);
    await transactionDone(transaction);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    const indexedDB = resolveIndexedDBFactory();
    if (!indexedDB) {
      throw unavailableError('indexedDB unavailable');
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(INDEXED_DB_LEGACY_STORE_NAME)) {
          db.createObjectStore(INDEXED_DB_LEGACY_STORE_NAME);
        }
        const entriesStore = db.objectStoreNames.contains(INDEXED_DB_ENTRIES_STORE_NAME)
          ? request.transaction?.objectStore(INDEXED_DB_ENTRIES_STORE_NAME)
          : db.createObjectStore(INDEXED_DB_ENTRIES_STORE_NAME, { keyPath: 'id' });
        if (entriesStore) {
          ensureEntryIndexes(entriesStore);
        }
        if (!db.objectStoreNames.contains(INDEXED_DB_METADATA_STORE_NAME)) {
          db.createObjectStore(INDEXED_DB_METADATA_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? unavailableError('indexedDB open failed'));
      request.onblocked = () => reject(unavailableError('indexedDB open blocked'));
    });
    return this.dbPromise;
  }

  private ensureLegacySnapshotMigrated(db: IDBDatabase): Promise<void> {
    if (!this.legacyMigrationPromise) {
      this.legacyMigrationPromise = this.migrateLegacySnapshot(db);
    }
    return this.legacyMigrationPromise;
  }

  private async migrateLegacySnapshot(db: IDBDatabase): Promise<void> {
    const metadata = await this.readMetadata(db, INDEXED_DB_LEGACY_MIGRATED_KEY);
    if (isRecord(metadata) && metadata.migrated === true) {
      return;
    }
    const legacySnapshot = await this.readLegacySnapshot(db);
    const legacyEntries = normalizeSnapshotEntries(legacySnapshot);
    const existingEntries = await this.readStoredEntries(db);
    const mergedEntries = new Map<string, unknown>();
    for (const entry of existingEntries) {
      const id = getEntryId(entry);
      if (id) {
        mergedEntries.set(id, entry);
      }
    }
    for (const entry of legacyEntries) {
      const id = getEntryId(entry);
      if (id) {
        mergedEntries.set(id, withInternalIndexes(entry));
      }
    }
    const indexedEntries = Array.from(mergedEntries.values()).map((entry) => withInternalIndexes(entry));
    const stats = buildStats(indexedEntries, Date.now());
    const transaction = db.transaction([INDEXED_DB_ENTRIES_STORE_NAME, INDEXED_DB_METADATA_STORE_NAME], 'readwrite');
    const entriesStore = transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME);
    for (const entry of indexedEntries) {
      entriesStore.put(entry);
    }
    const metadataStore = transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME);
    metadataStore.put(stats, INDEXED_DB_STATS_KEY);
    metadataStore.put({ migrated: true, migratedAt: Date.now() }, INDEXED_DB_LEGACY_MIGRATED_KEY);
    await transactionDone(transaction);
  }

  private async readMetadata(db: IDBDatabase, key: string): Promise<unknown | null> {
    const transaction = db.transaction(INDEXED_DB_METADATA_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME).get(key));
    await transactionDone(transaction);
    return result ?? null;
  }

  private async readLegacySnapshot(db: IDBDatabase): Promise<unknown | null> {
    const transaction = db.transaction(INDEXED_DB_LEGACY_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(INDEXED_DB_LEGACY_STORE_NAME).get(INDEXED_DB_SNAPSHOT_KEY));
    await transactionDone(transaction);
    return result ?? null;
  }

  private async readStoredEntries(db: IDBDatabase): Promise<unknown[]> {
    const transaction = db.transaction(INDEXED_DB_ENTRIES_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(INDEXED_DB_ENTRIES_STORE_NAME).getAll());
    await transactionDone(transaction);
    return result;
  }

  private async rebuildStatsFromEntries(db: IDBDatabase): Promise<ReviewFeedbackJournalStoreStats> {
    const entries = await this.readStoredEntries(db);
    const stats = buildStats(entries, Date.now());
    const transaction = db.transaction(INDEXED_DB_METADATA_STORE_NAME, 'readwrite');
    transaction.objectStore(INDEXED_DB_METADATA_STORE_NAME).put(stats, INDEXED_DB_STATS_KEY);
    await transactionDone(transaction);
    return stats;
  }
}

class InMemoryReviewFeedbackJournalStore implements ReviewFeedbackJournalStore {
  readonly storage = 'non-siyuan' as const;
  private entries = new Map<string, unknown>();
  private stats: ReviewFeedbackJournalStoreStats = emptyStats();

  async appendEntry(entry: unknown): Promise<ReviewFeedbackJournalStoreStats> {
    const id = getEntryId(entry);
    if (!id) {
      throw unavailableError('journal entry id unavailable');
    }
    const indexedEntry = withInternalIndexes(cloneValue(entry));
    const existing = this.entries.get(id);
    const existingPending = existing !== undefined && isPendingEntry(existing);
    const nextPending = isPendingEntry(indexedEntry);
    const existingStatus = existing !== undefined ? normalizeEntryStatus(existing) : null;
    const nextStatus = normalizeEntryStatus(indexedEntry);
    const statusCounts = { ...this.stats.statusCounts };
    if (existingStatus) {
      statusCounts[existingStatus] = Math.max(0, (statusCounts[existingStatus] ?? 0) - 1);
      if (statusCounts[existingStatus] === 0) {
        delete statusCounts[existingStatus];
      }
    }
    statusCounts[nextStatus] = (statusCounts[nextStatus] ?? 0) + 1;
    this.entries.set(id, indexedEntry);
    this.stats = {
      entryCount: this.stats.entryCount + (existing === undefined ? 1 : 0),
      pendingCount: Math.max(0, this.stats.pendingCount - (existingPending ? 1 : 0) + (nextPending ? 1 : 0)),
      pendingBytes: Math.max(
        0,
        this.stats.pendingBytes
          - (existingPending ? estimatePendingEntryBytes(existing) : 0)
          + (nextPending ? estimatePendingEntryBytes(indexedEntry) : 0),
      ),
      oldestPendingAt: existing === undefined && nextPending
        ? minNullable(this.stats.oldestPendingAt, getRecordedAt(indexedEntry))
        : this.stats.oldestPendingAt,
      statusCounts,
      updatedAt: Date.now(),
    };
    return cloneValue(this.stats);
  }

  async listEntries(): Promise<unknown[]> {
    return Array.from(this.entries.values()).map((entry) => stripInternalIndexes(cloneValue(entry)));
  }

  async listPendingEntries(): Promise<unknown[]> {
    return Array.from(this.entries.values())
      .filter((entry) => isPendingEntry(entry))
      .map((entry) => stripInternalIndexes(cloneValue(entry)));
  }

  async listEntriesByStatus(status: ReviewFeedbackJournalEntryStatus, limit: number): Promise<unknown[]> {
    const boundedLimit = Math.max(1, Math.floor(Number(limit) || 1));
    return Array.from(this.entries.values())
      .filter((entry) => normalizeEntryStatus(entry) === status)
      .sort((a, b) => getRecordedAt(a) - getRecordedAt(b))
      .slice(0, boundedLimit)
      .map((entry) => stripInternalIndexes(cloneValue(entry)));
  }

  async updateEntryStatus(
    id: string,
    status: ReviewFeedbackJournalEntryStatus,
    patch: Record<string, unknown> = {},
  ): Promise<ReviewFeedbackJournalStoreStats> {
    const existing = this.entries.get(id);
    if (existing === undefined) {
      return cloneValue(this.stats);
    }
    const nextEntry = withInternalIndexes({
      ...(isRecord(existing) ? stripInternalIndexes(existing) : {}),
      ...patch,
      status,
    });
    this.entries.set(id, nextEntry);
    this.stats = updateStatsForStatusChange(this.stats, existing, nextEntry);
    if (isPendingEntry(nextEntry) && this.stats.oldestPendingAt === null) {
      this.stats = buildStats(Array.from(this.entries.values()), Date.now());
    }
    if (isPendingEntry(existing)
      && !isPendingEntry(nextEntry)
      && this.stats.oldestPendingAt === getRecordedAt(existing)) {
      this.stats = buildStats(Array.from(this.entries.values()), Date.now());
    }
    return cloneValue(this.stats);
  }

  async getStats(): Promise<ReviewFeedbackJournalStoreStats> {
    return cloneValue(this.stats);
  }

  async clearEntries(): Promise<ReviewFeedbackJournalStoreStats> {
    this.entries.clear();
    this.stats = emptyStats(Date.now());
    return cloneValue(this.stats);
  }

  async readSnapshot(): Promise<unknown | null> {
    return {
      version: 1,
      entries: await this.listEntries(),
      updatedAt: this.stats.updatedAt,
    };
  }

  async writeSnapshot(snapshot: unknown): Promise<void> {
    this.entries.clear();
    const entries = normalizeSnapshotEntries(snapshot);
    for (const entry of entries) {
      const id = getEntryId(entry);
      if (id) {
        this.entries.set(id, withInternalIndexes(cloneValue(entry)));
      }
    }
    this.stats = buildStats(Array.from(this.entries.values()), Date.now());
  }
}

export function createIndexedDbReviewFeedbackJournalStore(): ReviewFeedbackJournalStore {
  return new IndexedDbReviewFeedbackJournalStore();
}

export function createInMemoryReviewFeedbackJournalStore(): ReviewFeedbackJournalStore {
  return new InMemoryReviewFeedbackJournalStore();
}
