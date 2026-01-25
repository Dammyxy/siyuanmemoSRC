import type { StorageManager } from '@/core/storage';
import type { PersistenceAdapter } from '../persistence.ts';
import { StorageFileJsonAdapter } from '../adapters/storageFile.ts';
import type { QueueInterface, QueueItem, QueueStats, QueueUIConfig } from '../types.ts';
import { ListSequencer } from '../sequencers/ListSequencer.ts';
import type { IAutoSortableTrait, IMutableTrait, IPrioritizableTrait, IRemovableTrait } from '../abstraction/types.ts';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy.ts';

type FinalDrillItem = QueueItem & { priority: number };

type Snapshot = {
    items: FinalDrillItem[];
    lastAutoSortDay?: string;
};

export class FinalDrillQueue implements QueueInterface<QueueItem>, IQueueStrategy<QueueItem> {
    private readonly adapter: PersistenceAdapter<Snapshot> | null;
    private readonly sequencer = new ListSequencer<FinalDrillItem>();
    private readonly mutableTrait: IMutableTrait<QueueItem>;
    private readonly removableTrait: IRemovableTrait<QueueItem>;
    private readonly prioritizableTrait: IPrioritizableTrait<QueueItem>;
    private readonly autoSortableTrait: IAutoSortableTrait;
    private lastAutoSortDay = '';

    constructor(storage?: StorageManager) {
        this.adapter = storage ? new StorageFileJsonAdapter<Snapshot>(storage, 'queue-final-drill.json') : null;
        this.mutableTrait = {
            id: 'mutable',
            insertAt: async (items: QueueItem[], index: number) => {
                await this.insertAtPhysicalMove(items, index);
                await this.save();
            },
        };
        this.removableTrait = {
            id: 'removable',
            removeItems: async (items: QueueItem[]) => {
                return await this.removeItems(items);
            },
        };
        this.prioritizableTrait = {
            id: 'prioritizable',
            setPriority: async (item: QueueItem, priority: number) => {
                const id = String((item as any)?.cardID || '');
                if (!id) return false;
                return await this.setPriority(id, priority);
            },
        };
        this.autoSortableTrait = {
            id: 'auto-sortable',
            sort: async () => {
                await this.sort();
            },
        };
    }

    async init(): Promise<void> {
        if (!this.adapter) return;
        const snap = await this.adapter.load();
        if (snap?.items && Array.isArray(snap.items)) {
            const items = snap.items.map((x) => ({
                ...x,
                priority: Number.isFinite(Number((x as any).priority)) ? Number((x as any).priority) : 50,
            }));
            this.sequencer.setAll(items);
        }
        this.lastAutoSortDay = String((snap as any)?.lastAutoSortDay || '');
        await this.autoSortIfNeeded();
    }

    getAllItems(): FinalDrillItem[] {
        return this.sequencer.getAll();
    }

    async insertAt(items: QueueItem[], index: number): Promise<void> {
        await this.mutableTrait.insertAt(items, index);
    }

    async addItems(items: QueueItem[]): Promise<number> {
        const current = this.sequencer.getAll();
        const existing = new Set(current.map((x) => String(x.cardID)));
        let added = 0;
        const toAppend: FinalDrillItem[] = [];
        for (const it of items || []) {
            const cardID = String((it as any)?.cardID || '');
            const blockID = String((it as any)?.blockID || '');
            const deckID = String((it as any)?.deckID || '');
            if (!cardID || !blockID || !deckID) continue;
            if (existing.has(cardID)) continue;
            existing.add(cardID);
            const priority = Number.isFinite(Number((it as any)?.priority)) ? Number((it as any).priority) : 50;
            toAppend.push({ ...(it as any), cardID, blockID, deckID, priority } as FinalDrillItem);
            added++;
        }
        if (added > 0) {
            const next = current.concat(toAppend);
            this.sequencer.setAll(next);
            await this.save();
        }
        return added;
    }

    async removeItems(items: QueueItem[]): Promise<number> {
        const removeSet = new Set((items || []).map((x) => String((x as any)?.cardID || '')).filter(Boolean));
        if (removeSet.size === 0) return 0;
        const current = this.sequencer.getAll();
        const next = current.filter((x) => !removeSet.has(String(x.cardID)));
        const removed = current.length - next.length;
        this.sequencer.setAll(next);
        if (removed > 0) await this.save();
        return removed;
    }

    async setPriority(cardID: string, priority: number): Promise<boolean> {
        const id = String(cardID || '');
        if (!id) return false;
        const p = Math.max(0, Math.min(100, Math.floor(Number(priority))));
        const current = this.sequencer.getAll();
        const it = current.find((x) => String(x.cardID) === id);
        if (!it) return false;
        it.priority = p;
        this.sequencer.setAll(current);
        await this.save();
        return true;
    }

    async sort(): Promise<void> {
        const current = this.sequencer.getAll();
        current.sort((a, b) => {
            const pa = Number(a.priority);
            const pb = Number(b.priority);
            if (pa !== pb) return pa - pb;
            return String(a.cardID).localeCompare(String(b.cardID));
        });
        this.sequencer.setAll(current);
        await this.save();
    }

    async clear(): Promise<void> {
        this.sequencer.setAll([]);
        await this.save();
    }

    async addItem(item: QueueItem): Promise<void> {
        await this.addItems([item]);
    }

    async getNextItem(): Promise<QueueItem | null> {
        const next = await this.sequencer.next();
        if (!next) return null;
        await this.save();
        return next;
    }

    getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
        return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
    }

    async getStats(): Promise<QueueStats> {
        return { size: this.size() };
    }

    async next(): Promise<QueueItem | null> {
        return await this.getNextItem();
    }

    async onFeedback(_currentItem: QueueItem | null, _feedback: QueueFeedback): Promise<void> {
    }

    async removeItem(item: QueueItem): Promise<boolean> {
        const removed = await this.removeItems([item]);
        return removed > 0;
    }

    size(): number {
        return this.sequencer.size();
    }

    isEmpty(): boolean {
        return this.size() === 0;
    }

    getMutableTrait(): IMutableTrait<QueueItem> {
        return this.mutableTrait;
    }

    getRemovableTrait(): IRemovableTrait<QueueItem> {
        return this.removableTrait;
    }

    getPrioritizableTrait(): IPrioritizableTrait<QueueItem> {
        return this.prioritizableTrait;
    }

    getAutoSortableTrait(): IAutoSortableTrait {
        return this.autoSortableTrait;
    }

    private async save(): Promise<void> {
        if (!this.adapter) return;
        await this.adapter.save({ items: this.sequencer.getAll(), lastAutoSortDay: this.lastAutoSortDay });
    }

    private async insertAtPhysicalMove(items: QueueItem[], index: number): Promise<void> {
        const toInsert: FinalDrillItem[] = [];
        for (const it of items || []) {
            const cardID = String((it as any)?.cardID || '');
            const blockID = String((it as any)?.blockID || '');
            const deckID = String((it as any)?.deckID || '');
            if (!cardID || !blockID || !deckID) continue;
            const priority = Number.isFinite(Number((it as any)?.priority)) ? Number((it as any).priority) : 50;
            toInsert.push({ ...(it as any), cardID, blockID, deckID, priority } as FinalDrillItem);
        }
        if (toInsert.length === 0) return;

        const removeSet = new Set(toInsert.map((x) => String(x.cardID)));
        const current = this.sequencer.getAll().filter((x) => !removeSet.has(String(x.cardID)));
        const clamped = Math.max(0, Math.min(Math.floor(Number(index || 0)), current.length));
        current.splice(clamped, 0, ...toInsert);
        this.sequencer.setAll(current);
    }

    private async autoSortIfNeeded(): Promise<void> {
        const today = new Date().toISOString().slice(0, 10);
        if (today === this.lastAutoSortDay) return;
        this.lastAutoSortDay = today;
        if (this.sequencer.size() <= 1) {
            await this.save();
            return;
        }
        await this.sort();
    }
}
