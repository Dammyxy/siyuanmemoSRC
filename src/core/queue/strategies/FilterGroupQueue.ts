import type { QueueInterface, QueueItem } from '../types.ts';
import type { PersistenceAdapter } from '../persistence.ts';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';

export interface FilterGroupConfig {
  id: string;
  weight: number;
}

export interface FilterGroupSnapshot {
  groups: Record<string, QueueItem[]>;
  cursor: number;
  schedule: string[];
}

export class FilterGroupQueue implements QueueInterface<QueueItem> {
  private groups: Record<string, QueueItem[]> = {};
  private schedule: string[] = [];
  private cursor = 0;
  private readonly configs: FilterGroupConfig[];
  private readonly persistence?: PersistenceAdapter<FilterGroupSnapshot>;

  constructor(
    configs: FilterGroupConfig[],
    persistence?: PersistenceAdapter<FilterGroupSnapshot>,
  ) {
    this.configs = configs;
    this.persistence = persistence;
    this.schedule = this.buildSchedule(configs);
    for (const cfg of configs) {
      this.groups[cfg.id] = [];
    }
  }

  async init(): Promise<void> {
    const stored = await this.persistence?.load();
    if (!stored) return;
    const groups = stored.groups || this.groups;
    for (const [gid, items] of Object.entries(groups)) {
      this.groups[gid] = (items || []).map((it) => ({
        ...(it as any),
        priority: Number.isFinite(Number((it as any)?.priority)) ? Number((it as any).priority) : DEFAULT_PRIORITY,
      })) as QueueItem[];
    }
    this.cursor = stored.cursor || 0;
    this.schedule = stored.schedule?.length ? stored.schedule : this.schedule;
  }

  async addItem(item: QueueItem): Promise<void> {
    const groupId = String(item?.meta?.groupId || this.configs[0]?.id || 'default');
    if (!this.groups[groupId]) {
      this.groups[groupId] = [];
    }
    if (!Number.isFinite(Number((item as any)?.priority))) {
      (item as any).priority = DEFAULT_PRIORITY;
    }
    if (this.groups[groupId].some((x) => x.cardID === item.cardID)) return;
    this.groups[groupId].push(item);
    await this.persistence?.save(this.snapshot());
  }

  async addItems(items: QueueItem[]): Promise<number> {
    let added = 0;
    for (const it of items || []) {
      const before = this.size();
      await this.addItem(it);
      if (this.size() !== before) {
        added++;
      }
    }
    return added;
  }

  getAllItems(): QueueItem[] {
    const result: QueueItem[] = [];
    for (const q of Object.values(this.groups)) {
      result.push(...q);
    }
    return result;
  }

  getNextItem(): QueueItem | null {
    if (this.isEmpty()) return null;
    for (let i = 0; i < this.schedule.length; i++) {
      const idx = (this.cursor + i) % this.schedule.length;
      const gid = this.schedule[idx];
      const q = this.groups[gid];
      if (q && q.length > 0) {
        return q[0];
      }
    }
    return null;
  }

  async removeItem(item: QueueItem): Promise<boolean> {
    let removed = false;
    for (const gid of Object.keys(this.groups)) {
      const q = this.groups[gid];
      const before = q.length;
      this.groups[gid] = q.filter((x) => x.cardID !== item.cardID);
      if (this.groups[gid].length !== before) {
        removed = true;
      }
    }
    if (removed) {
      await this.persistence?.save(this.snapshot());
    }
    return removed;
  }

  async removeItems(items: QueueItem[]): Promise<number> {
    const set = new Set((items || []).map((x) => String((x as any)?.cardID || '')).filter(Boolean));
    if (set.size === 0) return 0;
    const before = this.size();
    for (const gid of Object.keys(this.groups)) {
      this.groups[gid] = (this.groups[gid] || []).filter((x) => !set.has(String(x.cardID)));
    }
    const removed = before - this.size();
    if (removed > 0) {
      await this.persistence?.save(this.snapshot());
    }
    return removed;
  }

  size(): number {
    return Object.values(this.groups).reduce((n, q) => n + q.length, 0);
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }

  async advanceGroupCursor(): Promise<void> {
    if (this.schedule.length === 0) return;
    this.cursor = (this.cursor + 1) % this.schedule.length;
    await this.persistence?.save(this.snapshot());
  }

  snapshot(): FilterGroupSnapshot {
    const groups: Record<string, QueueItem[]> = {};
    for (const [k, v] of Object.entries(this.groups)) {
      groups[k] = [...v];
    }
    return { groups, cursor: this.cursor, schedule: [...this.schedule] };
  }

  private buildSchedule(configs: FilterGroupConfig[]): string[] {
    const result: string[] = [];
    for (const cfg of configs) {
      const w = Math.max(1, Math.floor(cfg.weight || 1));
      for (let i = 0; i < w; i++) {
        result.push(cfg.id);
      }
    }
    return result.length ? result : ['default'];
  }
}
