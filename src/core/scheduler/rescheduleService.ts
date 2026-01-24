import { riff } from '@/core/siyuan';
import { pushErrMsg } from '@/core/siyuan/api';
import type { StorageManager } from '@/core/storage';
import type { RescheduleLog, RescheduleResult, ActionMeta } from '@/types';

const { BUILTIN_DECK_ID } = riff;

function formatSiyuanTime(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
}

export class RescheduleService {
    constructor(private storage: StorageManager) { }

    private async sleep(ms: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Resolve Riff Card IDs from Block IDs with JIT initialization and retry policy.
     */
    private async resolveRiffCardIdByBlockIdWithRetry(blockIds: string[], options?: { maxRetries?: number }): Promise<Map<string, string>> {
        const resolvedByBlockId = new Map<string, string>();
        const unique = Array.from(new Set(blockIds.filter(Boolean)));
        if (unique.length === 0) return resolvedByBlockId;

        const fetchOnce = async (ids: string[]) => {
            for (let i = 0; i < ids.length; i += 200) {
                const batch = ids.slice(i, i + 200);
                const blocks = await riff.getRiffCardsByBlockIDs(batch);
                for (const b of blocks as any[]) {
                    const blockID = String(b?.id || '');
                    const riffCardID = String(b?.riffCardID || b?.riffCardId || b?.riffCard?.id || '');
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

        // 3. Retry loop (no JIT delay; keep limited retries for eventual consistency)
        const maxRetries = Math.max(1, Math.min(8, Math.floor(Number(options?.maxRetries ?? 6))));
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                const delayMs = Math.min(500, 80 * attempt);
                await this.sleep(delayMs);
            }
            await fetchOnce(pending);
            pending = pending.filter((bid) => !resolvedByBlockId.has(bid));
            console.log(`[RescheduleService] JIT Retry ${attempt + 1}/${maxRetries}, pending: ${pending.length}`, pending);
            if (pending.length === 0) break;
        }
        if (pending.length > 0) {
            await this.sleep(800);
            await fetchOnce(pending);
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
                cardId = resolvedMap.get(row.blockId) || '';
                if (!cardId) {
                    result.skipped.push({ reason: 'jit-failed', blockId: row.blockId });
                    continue;
                }
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
            console.log(`[RescheduleService] Batch update success: ${itemsToUpdate.length} items, skipped: ${result.skipped.length}`, itemsToUpdate);
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
            (_) => {
                // "Advance" implies pulling the card to a sooner date (or delaying it if it was overdue, but mainly randomizing in near future).
                // Previous logic skipped cards already within range. We remove this to ensure "Advance" always acts as a "Reschedule in Range".

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

    async spread(
        rows: Array<{ blockId: string; cardId?: string; currentDue?: Date }>,
        options: { maxDays: number },
        meta: ActionMeta
    ): Promise<RescheduleResult> {
        const result: RescheduleResult = { updated: [], skipped: [] };
        const clamped = Math.max(1, Math.min(365, Math.floor(Number(options?.maxDays || 0))));
        const dayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();

        const itemsToUpdate: { id: string; due: string }[] = [];
        const logSample: RescheduleLog['sample'] = [];

        const candidates: Array<{ cardId: string; blockId?: string }> = [];
        for (const row of rows || []) {
            const cardId = String(row?.cardId || '');
            if (!cardId) {
                result.skipped.push({ reason: 'no-id', blockId: row?.blockId });
                continue;
            }
            candidates.push({ cardId, blockId: row?.blockId });
        }

        const total = candidates.length;
        for (let i = 0; i < candidates.length; i++) {
            const row = candidates[i];
            const raw = Math.floor(((i + 1) / total) * clamped) - 1;
            const days = Math.max(0, Math.min(clamped - 1, raw));
            const newDue = new Date(now + days * dayMs);
            const newDueStr = formatSiyuanTime(newDue);
            itemsToUpdate.push({ id: row.cardId, due: newDueStr });
            result.updated.push({ cardId: row.cardId, blockId: row.blockId, newDue: newDueStr });
            if (logSample.length < 3) {
                logSample.push({ cardId: row.cardId, blockId: row.blockId, newDue: newDueStr });
            }
        }

        if (itemsToUpdate.length === 0) return result;

        try {
            await riff.batchSetRiffCardsDueTime(itemsToUpdate);
            await this.storage.addRescheduleLog({
                ts: Date.now(),
                action: 'spread',
                source: meta.source,
                targets: itemsToUpdate.map(i => i.id),
                result: { updated: itemsToUpdate.length, skipped: result.skipped.length },
                sample: logSample
            });
        } catch (err: any) {
            await pushErrMsg(`Reschedule failed: ${err.message}`);
            result.errors = [{ message: err.message }];
            await this.storage.addRescheduleLog({
                ts: Date.now(),
                action: 'spread',
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
