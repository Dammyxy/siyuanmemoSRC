import type { QueueInterface, QueueItem } from '../types';
import type { PersistenceAdapter } from '../persistence';

export interface FinalDrillQueueSnapshot {
  items: QueueItem[];
}

export type PrioritySelectMode = 'strict' | 'fuzzy';

export class FinalDrillQueue implements QueueInterface<QueueItem> {
  private items: QueueItem[] = [];
  private readonly persistence?: PersistenceAdapter<FinalDrillQueueSnapshot>;
  private readonly defaultPriority = 50;
  private readonly priorityMode: PrioritySelectMode;
  private readonly fuzzyBand: number;

  constructor(options?: {
    persistence?: PersistenceAdapter<FinalDrillQueueSnapshot>;
    priorityMode?: PrioritySelectMode;
    fuzzyBand?: number;
  }) {
    this.persistence = options?.persistence;
    this.priorityMode = options?.priorityMode || 'strict';
    this.fuzzyBand = this.normalizeFuzzyBand(options?.fuzzyBand);
  }

  async init(): Promise<void> {
    const stored = await this.persistence?.load();
    if (stored?.items) {
      this.items = stored.items;
    }
  }

  async addItem(item: QueueItem): Promise<void> {
    if (!item?.cardID) return;
    if (this.items.some((x) => x.cardID === item.cardID)) return;
    this.items.push({ ...item, priority: this.normalizePriority(item.priority) });
    await this.persistence?.save(this.snapshot());
  }

  async addItems(items: QueueItem[]): Promise<number> {
    const existing = new Set(this.items.map((x) => x.cardID).filter(Boolean));
    let added = 0;
    for (const item of items || []) {
      const id = item?.cardID;
      if (!id) continue;
      if (existing.has(id)) continue;
      this.items.push({ ...item, priority: this.normalizePriority(item.priority) });
      existing.add(id);
      added++;
    }
    if (added > 0) {
      await this.persistence?.save(this.snapshot());
    }
    return added;
  }

  getNextItem(): QueueItem | null {
    if (this.items.length === 0) return null;
    const idx = this.findHighestPriorityIndex(this.priorityMode, this.fuzzyBand);
    return idx >= 0 ? this.items[idx] : this.items[0];
  }

  getAllItems(): QueueItem[] {
    return [...this.items];
  }

  async moveToEnd(cardID: string): Promise<boolean> {
    if (!cardID) return false;
    const idx = this.items.findIndex((x) => x.cardID === cardID);
    if (idx === -1) return false;
    const [item] = this.items.splice(idx, 1);
    this.items.push(item);
    await this.persistence?.save(this.snapshot());
    return true;
  }

  async setPriority(cardID: string, priority: number): Promise<boolean> {
    if (!cardID) return false;
    const idx = this.items.findIndex((x) => x.cardID === cardID);
    if (idx === -1) return false;
    this.items[idx] = { ...this.items[idx], priority: this.normalizePriority(priority) };
    await this.persistence?.save(this.snapshot());
    return true;
  }

  async sort(): Promise<void> {
    if (this.items.length <= 1) return;
    this.items = [...this.items].sort((a, b) => this.normalizePriority(a.priority) - this.normalizePriority(b.priority));
    await this.persistence?.save(this.snapshot());
  }

  async insertAt(item: QueueItem, position: 'top' | 'bottom' | 'random'): Promise<boolean> {
    if (!item?.cardID) return false;
    if (this.items.some((x) => x.cardID === item.cardID)) return false;
    const next = { ...item, priority: this.normalizePriority(item.priority) };
    if (position === 'top') {
      this.items.unshift(next);
    } else if (position === 'bottom') {
      this.items.push(next);
    } else {
      const idx = Math.max(0, Math.min(this.items.length, Math.floor(Math.random() * (this.items.length + 1))));
      this.items.splice(idx, 0, next);
    }
    await this.persistence?.save(this.snapshot());
    return true;
  }

  async clear(): Promise<void> {
    if (this.items.length === 0) return;
    this.items = [];
    await this.persistence?.save(this.snapshot());
  }

  async removeItem(item: QueueItem): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((x) => x.cardID !== item.cardID);
    const removed = this.items.length !== before;
    if (removed) {
      await this.persistence?.save(this.snapshot());
    }
    return removed;
  }

  async removeItems(items: QueueItem[]): Promise<number> {
    const removeSet = new Set((items || []).map((x) => x?.cardID).filter(Boolean) as string[]);
    if (removeSet.size === 0) return 0;
    const before = this.items.length;
    this.items = this.items.filter((x) => !removeSet.has(x.cardID));
    const removed = before - this.items.length;
    if (removed > 0) {
      await this.persistence?.save(this.snapshot());
    }
    return removed;
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  snapshot(): FinalDrillQueueSnapshot {
    const items = this.items.map((x) => ({ ...x, priority: this.normalizePriority(x.priority) }));
    return { items };
  }

  private normalizePriority(priority: unknown): number {
    if (typeof priority !== 'number' || Number.isNaN(priority)) return this.defaultPriority;
    const p = Math.round(priority);
    return Math.min(100, Math.max(0, p));
  }

  private normalizeFuzzyBand(band: unknown): number {
    if (typeof band !== 'number' || Number.isNaN(band)) return 0;
    const n = Math.round(band);
    return Math.min(100, Math.max(0, n));
  }

  private findHighestPriorityIndex(mode: PrioritySelectMode, band: number): number {
    let bestP = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.normalizePriority(this.items[i]?.priority);
      if (p < bestP) {
        bestP = p;
      }
    }
    if (!Number.isFinite(bestP)) return -1;

    if (mode !== 'fuzzy' || band <= 0) {
      for (let i = 0; i < this.items.length; i++) {
        if (this.normalizePriority(this.items[i]?.priority) === bestP) return i;
      }
      return -1;
    }

    const maxP = Math.min(100, bestP + band);
    const candidateIdx: number[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const p = this.normalizePriority(this.items[i]?.priority);
      if (p >= bestP && p <= maxP) {
        candidateIdx.push(i);
      }
    }
    if (candidateIdx.length === 0) return -1;
    const picked = candidateIdx[Math.floor(Math.random() * candidateIdx.length)];
    return typeof picked === 'number' ? picked : -1;
  }
}
