import { riff } from '@/core/siyuan';
import { pushErrMsg } from '@/core/siyuan/api';
import type { StorageManager } from '@/core/storage';
import type { RescheduleLog, RescheduleResult, ActionMeta } from '@/types';

const { BUILTIN_DECK_ID } = riff;

function formatSiyuanTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RescheduleService {
    constructor(private storage: StorageManager) { }

    /**
     * Resolve Riff Card IDs from Block IDs with JIT initialization and retry policy.
     */
    private async resolveRiffCardIdByBlockIdWithRetry(blockIds: string[], options?: { delayMs?: number; maxRetries?: number }): Promise<Map<string, string>> {
        const resolvedByBlockId = new Map<string, string>();
        const unique = Array.from(new Set(blockIds.filter(Boolean)));
        if (unique.length === 0) return resolvedByBlockId;

        const fetchOnce = async (ids: string[]) => {
            for (let i = 0; i < ids.length; i += 200) {
                const batch = ids.slice(i, i + 200);
                const blocks = await riff.getRiffCardsByBlockIDs(batch);
                for (const b of blocks as any[]) {
                    const blockID = String(b?.id || '');
                    const riffCardID = String(b?.riffCard?.id || '');
                    if (blockID && riffCardID) resolvedByBlockId.set(blockID, riffCardID);
                }
            }
        };

        // 1. Initial Check
        await fetchOnce(unique);
        let pending = unique.filter((bid) => !resolvedByBlockId.has(bid));
        if (pending.length === 0) return resolvedByBlockId;

        // 2. Initialize missing cards
        for (let i = 0; i < pending.length; i += 200) {
            const batch = pending.slice(i, i + 200);
            await riff.addRiffCards(BUILTIN_DECK_ID, batch);
        }

        // 3. Retry loop with delay
        const delayMs = Math.max(0, Math.floor(Number(options?.delayMs ?? 500)));
        const maxRetries = Math.max(1, Math.min(5, Math.floor(Number(options?.maxRetries ?? 3))));

        // Wait initial delay before first retry check to allow DB write
        await sleep(delayMs);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            await fetchOnce(pending);
            pending = pending.filter((bid) => !resolvedByBlockId.has(bid));
            console.log(`[RescheduleService] JIT Retry ${attempt + 1}/${maxRetries}, pending: ${pending.length}`);
            if (pending.length === 0) break;
            if (attempt < maxRetries - 1) await sleep(delayMs);
        }

        return resolvedByBlockId;
    }

    private async performBatchUpdate(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        calculator: (currentDue: Date) => Date,
        meta: ActionMeta,
        type: RescheduleLog['action']
    ): Promise<RescheduleResult> {
        const result: RescheduleResult = { updated: [], skipped: [] };

        // 1. Resolve IDs
        const missingBlockIds = rows.filter(r => !r.cardId && r.blockId).map(r => r.blockId);
        const resolvedMap = await this.resolveRiffCardIdByBlockIdWithRetry(missingBlockIds);

        const itemsToUpdate: { id: string; due: string }[] = [];
        const logSample: RescheduleLog['sample'] = [];

        for (const row of rows) {
            let cardId = row.cardId;
            if (!cardId && row.blockId) {
                cardId = resolvedMap.get(row.blockId) || row.blockId; // Fallback to blockId
            }

            if (!cardId) {
                result.skipped.push({ reason: 'no-id', blockId: row.blockId });
                continue;
            }

            const currentDue = row.currentDue || new Date();
            const newDue = calculator(currentDue);
            const newDueStr = formatSiyuanTime(newDue);

            // Safety check: if newDue is same as old due? Riff doesn't care, but we might want to skip?
            // For now, valid update.

            itemsToUpdate.push({ id: cardId, due: newDueStr });
            result.updated.push({
                cardId,
                blockId: row.blockId,
                oldDue: row.currentDue ? formatSiyuanTime(row.currentDue) : undefined,
                newDue: newDueStr
            });

            if (logSample.length < 3) {
                logSample.push({
                    cardId,
                    blockId: row.blockId,
                    oldDue: row.currentDue ? formatSiyuanTime(row.currentDue) : undefined,
                    newDue: newDueStr
                });
            }
        }

        if (itemsToUpdate.length === 0) {
            return result;
        }

        try {
            await riff.batchSetRiffCardsDueTime(itemsToUpdate);

            // Log it
            await this.storage.addRescheduleLog({
                ts: Date.now(),
                action: type,
                source: meta.source,
                targets: itemsToUpdate.map(i => i.id),
                result: { updated: itemsToUpdate.length, skipped: result.skipped.length },
                sample: logSample
            });

        } catch (err: any) {
            console.error('[RescheduleService] Batch update failed', err);
            await pushErrMsg(`Reschedule failed: ${err.message}`);
            result.errors = [{ message: err.message }];
            // Adjust result to reflect failure? 
            // Technically we shouldn't return updated if api failed.
            // But we pushed to `result.updated` earlier for optimistic return.
            // We should revert or mark valid.

            // Allow caller to handle error, but we log failure.
            await this.storage.addRescheduleLog({
                ts: Date.now(),
                action: type,
                source: meta.source,
                targets: itemsToUpdate.map(i => i.id),
                result: { updated: 0, skipped: itemsToUpdate.length + result.skipped.length },
                sample: [],
                error: { code: 'API_ERROR', message: err.message }
            });
            throw err;
        }

        return result;
    }

    /**
     * Advance cards (random disperse)
     */
    async advance(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        maxDays: number,
        meta: ActionMeta
    ): Promise<RescheduleResult> {
        const clamped = Math.max(1, Math.min(365, Math.floor(Number(maxDays || 0))));
        const dayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();

        return this.performBatchUpdate(
            rows,
            (currentDue) => {
                // Safety Lock: if interval < range, keep unchanged?
                // Logic from browserService:
                // const remainingDays = currentDue ? Math.ceil((currentDue.getTime() - now) / dayMs) : 0;
                // if (remainingDays < clamped) { return currentDue; } // But wait, this means we DON'T advance if it's already soon?
                // Actually the requirement: "interval 小于范围时保持不变"
                // "remainingDays" is basically current interval until due.

                const remainingDays = Math.ceil((currentDue.getTime() - now) / dayMs);
                if (remainingDays < clamped && !meta.force) {
                    // Logic from previous implementation: skip if already sooner than maxDays? 
                    // Wait, "Advance" means pull TO Present.
                    // If maxDays=7, we want to reschedule to +1..+7 days from now.
                    // If current due is tomorrow (+1), do we start it?
                    // Previous logic: `if (remainingDays < clamped) continue;` -> If it's ALREADY within the window, don't move it.
                    return currentDue;
                }

                const days = Math.floor(Math.random() * (clamped + 1));
                return new Date(now + days * dayMs);
            },
            meta,
            'advance'
        );
    }

    /**
     * Postpone cards
     */
    async postpone(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        days: number,
        meta: ActionMeta
    ): Promise<RescheduleResult> {
        const clamped = Math.max(1, Math.min(365, Math.floor(Number(days || 0))));
        const dayMs = 24 * 60 * 60 * 1000;

        return this.performBatchUpdate(
            rows,
            (currentDue) => {
                // Dev feedback says: "以 Card.Due 为基准推迟（不是 Today）"
                // "Postpone 语义：以 Card.Due 为基准推迟（不是 Today）。"
                // However, if Card.Due is in the past (Overdue), usually we want Postpone to be relative to Today or Due?
                // SuperMemo Postpone: relative to current schedule. 
                // If I have a card due yesterday (-1), and postpone 1 day. New due = Today (0)? Or Yesterday+1 = Today?
                // If I utilize `currentDue` strictly:
                return new Date(currentDue.getTime() + clamped * dayMs);
            },
            meta,
            'postpone'
        );
    }

    /**
     * Absolute Reschedule
     */
    async rescheduleAbsolute(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        targetDate: Date,
        meta: ActionMeta
    ): Promise<RescheduleResult> {
        return this.performBatchUpdate(
            rows,
            () => targetDate,
            meta,
            'reschedule-absolute'
        );
    }

    /**
     * Relative Reschedule
     */
    async rescheduleRelative(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        days: number,
        meta: ActionMeta
    ): Promise<RescheduleResult> {
        // Simple shift
        const dayMs = 24 * 60 * 60 * 1000;
        return this.performBatchUpdate(
            rows,
            (currentDue) => new Date(currentDue.getTime() + days * dayMs),
            meta,
            'reschedule-relative'
        );
    }
}
