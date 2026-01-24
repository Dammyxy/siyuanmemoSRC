import type { StorageManager } from '@/core/storage';
import type { PersistenceAdapter } from '../persistence';
import { StorageFileJsonAdapter } from '../adapters/storageFile';
import type { QueueInterface, QueueItem } from '../types';

type FinalDrillItem = QueueItem & { priority: number };

type Snapshot = {
    items: FinalDrillItem[];
};

export class DeliberatePracticeQueue implements QueueInterface<QueueItem> {
    private readonly adapter: PersistenceAdapter<Snapshot> | null;
    private items: FinalDrillItem[] = [];

    constructor(storage?: StorageManager) {
        this.adapter = storage ? new StorageFileJsonAdapter<Snapshot>(storage, 'queue-final-drill.json') : null;
    }

    async init(): Promise<void> {
        if (!this.adapter) return;
        const snap = await this.adapter.load();
        if (snap?.items && Array.isArray(snap.items)) {
            this.items = snap.items.map((x) => ({
                ...x,
                priority: Number.isFinite(Number((x as any).priority)) ? Number((x as any).priority) : 50,
            }));
        }
    }

    getAllItems(): FinalDrillItem[] {
        return [...this.items];
    }

    async insertAt(items: QueueItem[], index: number): Promise<void> {
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
        this.items = this.items.filter((x) => !removeSet.has(String(x.cardID)));

        const clamped = Math.max(0, Math.min(Math.floor(Number(index || 0)), this.items.length));
        this.items.splice(clamped, 0, ...toInsert);
        await this.save();
    }

    async addItems(items: QueueItem[]): Promise<number> {
        const existing = new Set(this.items.map((x) => String(x.cardID)));
        let added = 0;
        for (const it of items || []) {
            const cardID = String((it as any)?.cardID || '');
            const blockID = String((it as any)?.blockID || '');
            const deckID = String((it as any)?.deckID || '');
            if (!cardID || !blockID || !deckID) continue;
            if (existing.has(cardID)) continue;
            existing.add(cardID);
            const priority = Number.isFinite(Number((it as any)?.priority)) ? Number((it as any).priority) : 50;
            this.items.push({ ...it, cardID, blockID, deckID, priority } as FinalDrillItem);
            added++;
        }
        if (added > 0) await this.save();
        return added;
    }

    async removeItems(items: QueueItem[]): Promise<number> {
        const removeSet = new Set((items || []).map((x) => String((x as any)?.cardID || '')).filter(Boolean));
        if (removeSet.size === 0) return 0;
        const before = this.items.length;
        this.items = this.items.filter((x) => !removeSet.has(String(x.cardID)));
        const removed = before - this.items.length;
        if (removed > 0) await this.save();
        return removed;
    }

    async setPriority(cardID: string, priority: number): Promise<boolean> {
        const id = String(cardID || '');
        if (!id) return false;
        const p = Math.max(0, Math.min(100, Math.floor(Number(priority))));
        const it = this.items.find((x) => String(x.cardID) === id);
        if (!it) return false;
        it.priority = p;
        await this.save();
        return true;
    }

    async sort(): Promise<void> {
        this.items.sort((a, b) => {
            const pa = Number(a.priority);
            const pb = Number(b.priority);
            if (pa !== pb) return pa - pb;
            return String(a.cardID).localeCompare(String(b.cardID));
        });
        await this.save();
    }

    async clear(): Promise<void> {
        this.items = [];
        await this.save();
    }

    async addItem(item: QueueItem): Promise<void> {
        await this.addItems([item]);
    }

    async getNextItem(): Promise<QueueItem | null> {
        const next = this.items[0];
        if (!next) return null;
        this.items = this.items.slice(1);
        await this.save();
        return next;
    }

    async removeItem(item: QueueItem): Promise<boolean> {
        const removed = await this.removeItems([item]);
        return removed > 0;
    }

    size(): number {
        return this.items.length;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    private async save(): Promise<void> {
        if (!this.adapter) return;
        await this.adapter.save({ items: this.items });
    }
}
