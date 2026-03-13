import type {
  NeuralHistoryPageRequest,
  NeuralHistoryPageResult,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cloneEntry(entry: NeuralRoamHistoryEntry): NeuralRoamHistoryEntry {
  return { ...entry };
}

export class NeuralHistoryStore {
  private capacity: number;
  private buffer: Array<NeuralRoamHistoryEntry | null>;
  private head = 0;
  private size = 0;
  private readonly entriesByEventId = new Map<string, NeuralRoamHistoryEntry>();
  private readonly entriesByNodeId = new Map<string, NeuralRoamHistoryEntry[]>();
  private readonly hitCountByNodeId = new Map<string, number>();

  constructor(maxEntries: number) {
    this.capacity = this.normalizeCapacity(maxEntries);
    this.buffer = new Array(this.capacity).fill(null);
  }

  setCapacity(maxEntries: number): boolean {
    const nextCapacity = this.normalizeCapacity(maxEntries);
    if (nextCapacity === this.capacity) {
      return false;
    }

    const entries = this.toArray();
    this.capacity = nextCapacity;
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
    this.size = 0;
    this.entriesByEventId.clear();
    this.entriesByNodeId.clear();
    this.hitCountByNodeId.clear();

    for (const entry of entries.slice(-this.capacity)) {
      this.appendInternal(entry);
    }

    return true;
  }

  clear(): void {
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
    this.size = 0;
    this.entriesByEventId.clear();
    this.entriesByNodeId.clear();
    this.hitCountByNodeId.clear();
  }

  replaceAll(entries: NeuralRoamHistoryEntry[]): void {
    this.clear();
    for (const entry of entries.slice(-this.capacity)) {
      this.appendInternal(entry);
    }
  }

  append(entry: NeuralRoamHistoryEntry): void {
    this.appendInternal(entry);
  }

  removeBySession(sessionId: string): void {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return;
    }

    this.replaceAll(
      this.toArray().filter((entry) => entry.sessionId !== normalizedSessionId),
    );
  }

  getCount(sessionId?: string | null): number {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return this.size;
    }

    let total = 0;
    this.forEachNewestFirst((entry) => {
      if (entry.sessionId === normalizedSessionId) {
        total += 1;
      }
    });
    return total;
  }

  getPage(request: NeuralHistoryPageRequest): NeuralHistoryPageResult {
    const offset = Math.max(0, Math.floor(Number(request.offset) || 0));
    const limit = clamp(Math.floor(Number(request.limit) || 0), 1, 500);
    const normalizedSessionId = String(request.sessionId || '').trim();
    const entries: NeuralRoamHistoryEntry[] = [];
    let totalCount = 0;
    let skipped = 0;

    this.forEachNewestFirst((entry) => {
      if (normalizedSessionId && entry.sessionId !== normalizedSessionId) {
        return;
      }

      totalCount += 1;
      if (skipped < offset) {
        skipped += 1;
        return;
      }
      if (entries.length < limit) {
        entries.push(cloneEntry(entry));
      }
    });

    return {
      entries,
      totalCount,
      hasMore: offset + entries.length < totalCount,
    };
  }

  findByEventId(eventId: string): NeuralRoamHistoryEntry | null {
    const normalizedEventId = String(eventId || '').trim();
    if (!normalizedEventId) {
      return null;
    }
    const entry = this.entriesByEventId.get(normalizedEventId);
    return entry ? cloneEntry(entry) : null;
  }

  getEntriesByNodeId(nodeId: string): NeuralRoamHistoryEntry[] {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return [];
    }
    return (this.entriesByNodeId.get(normalizedNodeId) ?? []).map(cloneEntry);
  }

  getHitCount(nodeId: string): number {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return 0;
    }
    return this.hitCountByNodeId.get(normalizedNodeId) ?? 0;
  }

  toArray(): NeuralRoamHistoryEntry[] {
    const result: NeuralRoamHistoryEntry[] = [];
    for (let index = 0; index < this.size; index += 1) {
      const entry = this.buffer[(this.head + index) % this.capacity];
      if (entry) {
        result.push(cloneEntry(entry));
      }
    }
    return result;
  }

  private normalizeCapacity(maxEntries: number): number {
    return clamp(Math.floor(Number(maxEntries) || 0), 1, 10_000);
  }

  private appendInternal(entry: NeuralRoamHistoryEntry): void {
    const clonedEntry = cloneEntry(entry);
    if (this.size === this.capacity) {
      this.evictOldest();
    }

    const insertIndex = (this.head + this.size) % this.capacity;
    this.buffer[insertIndex] = clonedEntry;
    this.size += 1;

    this.entriesByEventId.set(clonedEntry.eventId, clonedEntry);
    const entriesForNode = this.entriesByNodeId.get(clonedEntry.nodeId) ?? [];
    entriesForNode.push(clonedEntry);
    this.entriesByNodeId.set(clonedEntry.nodeId, entriesForNode);
    this.hitCountByNodeId.set(clonedEntry.nodeId, (this.hitCountByNodeId.get(clonedEntry.nodeId) ?? 0) + 1);
  }

  private evictOldest(): void {
    const oldest = this.buffer[this.head];
    if (!oldest) {
      return;
    }

    this.entriesByEventId.delete(oldest.eventId);
    const entriesForNode = this.entriesByNodeId.get(oldest.nodeId);
    if (entriesForNode) {
      const nextEntries = entriesForNode.filter((entry) => entry.eventId !== oldest.eventId);
      if (nextEntries.length > 0) {
        this.entriesByNodeId.set(oldest.nodeId, nextEntries);
      } else {
        this.entriesByNodeId.delete(oldest.nodeId);
      }
    }

    const nextHitCount = (this.hitCountByNodeId.get(oldest.nodeId) ?? 1) - 1;
    if (nextHitCount > 0) {
      this.hitCountByNodeId.set(oldest.nodeId, nextHitCount);
    } else {
      this.hitCountByNodeId.delete(oldest.nodeId);
    }

    this.buffer[this.head] = null;
    this.head = (this.head + 1) % this.capacity;
    this.size -= 1;
  }

  private forEachNewestFirst(visitor: (entry: NeuralRoamHistoryEntry) => void): void {
    for (let index = this.size - 1; index >= 0; index -= 1) {
      const entry = this.buffer[(this.head + index) % this.capacity];
      if (entry) {
        visitor(entry);
      }
    }
  }
}
