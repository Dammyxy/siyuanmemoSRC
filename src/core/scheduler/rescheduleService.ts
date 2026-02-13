import { riff } from '@/core/siyuan';
import { pushErrMsg } from '@/core/siyuan/api';
import type { StorageManager } from '@/core/storage';
import type { RescheduleLog, RescheduleResult, ActionMeta } from '@/types';
import type { FSRSCard } from '@/types/card';
import type { PostponeConfig, AdvanceConfig, SpreadConfig, PostponeResult, AdvanceResult, SpreadResult } from '@/types/reschedule';
import { RescheduleErrorCode, type RescheduleError, type Result } from '@/types/reschedule-error';
import { PostponeEngine } from './PostponeEngine';
import { AdvanceEngine } from './AdvanceEngine';
import { SpreadEngine } from './SpreadEngine';
import { ConfigManager } from './ConfigManager';
import { ConfigValidator } from './ConfigValidator';

const { BUILTIN_DECK_ID } = riff;

function formatSiyuanTime(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
}

export class RescheduleService {
    private postponeEngine: PostponeEngine;
    private advanceEngine: AdvanceEngine;
    private spreadEngine: SpreadEngine;
    private configManager: ConfigManager;

    constructor(private storage: StorageManager) {
        this.postponeEngine = new PostponeEngine(storage);
        this.advanceEngine = new AdvanceEngine(storage);
        this.spreadEngine = new SpreadEngine(storage);
        this.configManager = new ConfigManager(storage);
    }

    /**
     * 错误处理包装器
     * 捕获操作中的错误并返回统一的错误格式
     *
     * @param operation 要执行的操作
     * @param errorContext 错误上下文描述
     * @returns 操作结果（成功或失败）
     */
    private async executeWithErrorHandling<T>(
        operation: () => Promise<T>,
        errorContext: string
    ): Promise<Result<T, RescheduleError>> {
        try {
            const result = await operation();
            return { ok: true, value: result };
        } catch (error: any) {
            console.error(`[RescheduleService] ${errorContext}:`, error);

            // 确定错误代码
            let code = RescheduleErrorCode.UNKNOWN_ERROR;
            if (error.message?.includes('network') || error.message?.includes('fetch')) {
                code = RescheduleErrorCode.NETWORK_ERROR;
            } else if (error.message?.includes('storage') || error.message?.includes('database')) {
                code = RescheduleErrorCode.STORAGE_ERROR;
            } else if (error.message?.includes('calculation') || error.message?.includes('NaN')) {
                code = RescheduleErrorCode.CALCULATION_ERROR;
            } else if (error.message?.includes('batch') || error.message?.includes('update')) {
                code = RescheduleErrorCode.BATCH_UPDATE_FAILED;
            }

            return {
                ok: false,
                error: {
                    code,
                    message: error.message || 'Unknown error occurred',
                    details: error
                }
            };
        }
    }

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

    // ========== 新增方法：基于 SuperMemo 设计的高级重新调度操作 ==========

    /**
     * 执行 Postpone 操作（新接口）
     * 使用 PostponeEngine 实现完整的 SuperMemo Postpone 算法
     *
     * @param cards 要处理的卡片列表
     * @param config Postpone 配置
     * @param meta 操作元数据
     * @returns Postpone 操作结果
     */
    async postponeWithConfig(
        cards: FSRSCard[],
        config: PostponeConfig,
        meta: ActionMeta,
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<PostponeResult> {
        // 验证配置
        const validationError = ConfigValidator.validatePostponeConfig(config);
        if (validationError) {
            console.error('[RescheduleService] Invalid postpone config:', validationError);
            await pushErrMsg(`Invalid configuration: ${validationError.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [validationError.message]
            };
        }

        // 执行操作并处理错误
        const result = await this.executeWithErrorHandling(
            () => this.postponeEngine.execute(cards, config, false, meta.source, onProgress),
            'postponeWithConfig'
        );

        if (!result.ok) {
            await pushErrMsg(`Postpone failed: ${result.error.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [result.error.message]
            };
        }

        return result.value;
    }

    /**
     * 执行 Dilute 操作
     * Dilute 与 Postpone 的区别：Dilute 处理所有卡片（包括未到期的），而 Postpone 只处理 outstanding 卡片
     *
     * @param cards 要处理的卡片列表
     * @param config Postpone 配置（Dilute 使用相同的配置）
     * @param meta 操作元数据
     * @param onProgress 进度回调函数
     * @returns Postpone 操作结果
     */
    async dilute(
        cards: FSRSCard[],
        config: PostponeConfig,
        meta: ActionMeta,
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<PostponeResult> {
        // 验证配置
        const validationError = ConfigValidator.validatePostponeConfig(config);
        if (validationError) {
            console.error('[RescheduleService] Invalid dilute config:', validationError);
            await pushErrMsg(`Invalid configuration: ${validationError.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [validationError.message]
            };
        }

        // 执行操作并处理错误
        const result = await this.executeWithErrorHandling(
            () => this.postponeEngine.execute(cards, config, true, meta.source, onProgress),
            'dilute'
        );

        if (!result.ok) {
            await pushErrMsg(`Dilute failed: ${result.error.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [result.error.message]
            };
        }

        return result.value;
    }

    /**
     * 执行 Auto-Postpone 操作
     * 在学习开始前自动推迟低优先级的积压卡片
     *
     * 算法：
     * 1. 获取所有 outstanding 卡片（due < now）
     * 2. 按优先级排序
     * 3. 跳过前 N 个最高优先级卡片
     * 4. 对剩余卡片执行 Postpone
     *
     * @param config Postpone 配置
     * @param onProgress 进度回调函数
     * @returns Postpone 操作结果
     */
    async autoPostpone(
        config: PostponeConfig,
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<PostponeResult> {
        // 验证配置
        const validationError = ConfigValidator.validatePostponeConfig(config);
        if (validationError) {
            console.error('[RescheduleService] Invalid auto-postpone config:', validationError);
            await pushErrMsg(`Invalid configuration: ${validationError.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [validationError.message]
            };
        }

        // 执行操作并处理错误
        const result = await this.executeWithErrorHandling(
            async () => {
                // 获取所有卡片
                const allCards = await this.storage.getAllCards();
                const now = Date.now();

                // 过滤 outstanding 卡片
                const outstandingCards = allCards.filter(card => card.due < now);

                // 按优先级排序（priority 越小越重要）
                const sortedCards = outstandingCards.sort((a, b) =>
                    (a.priority ?? 50) - (b.priority ?? 50)
                );

                // 跳过前 N 个最高优先级卡片
                const skipCount = config.skipTopNElements ?? 0;
                const cardsToPostpone = sortedCards.slice(skipCount);

                // 执行 Postpone
                return this.postponeEngine.execute(cardsToPostpone, config, false, 'auto-postpone', onProgress);
            },
            'autoPostpone'
        );

        if (!result.ok) {
            await pushErrMsg(`Auto-postpone failed: ${result.error.message}`);
            return {
                updated: 0,
                skipped: 0,
                skippedReasons: {},
                errors: [result.error.message]
            };
        }

        return result.value;
    }

    /**
     * 执行 Advance 操作（新接口）
     * 使用 AdvanceEngine 实现完整的 SuperMemo Advance 算法
     *
     * @param cards 要处理的卡片列表
     * @param config Advance 配置
     * @param meta 操作元数据
     * @param onProgress 进度回调函数
     * @returns Advance 操作结果
     */
    async advanceWithConfig(
        cards: FSRSCard[],
        config: AdvanceConfig,
        meta: ActionMeta,
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<AdvanceResult> {
        // 验证配置
        const validationError = ConfigValidator.validateAdvanceConfig(config);
        if (validationError) {
            console.error('[RescheduleService] Invalid advance config:', validationError);
            await pushErrMsg(`Invalid configuration: ${validationError.message}`);
            return {
                updated: 0,
                overdueHandled: 0,
                unchanged: 0,
                errors: [validationError.message]
            };
        }

        // 执行操作并处理错误
        const result = await this.executeWithErrorHandling(
            () => this.advanceEngine.execute(cards, config, meta.source, onProgress),
            'advanceWithConfig'
        );

        if (!result.ok) {
            await pushErrMsg(`Advance failed: ${result.error.message}`);
            return {
                updated: 0,
                overdueHandled: 0,
                unchanged: 0,
                errors: [result.error.message]
            };
        }

        return result.value;
    }

    /**
     * 执行 Spread 操作（新接口）
     * 使用 SpreadEngine 实现完整的 SuperMemo Spread/Mercy 算法
     *
     * @param cards 要处理的卡片列表
     * @param config Spread 配置
     * @param meta 操作元数据
     * @param onProgress 进度回调函数
     * @returns Spread 操作结果
     */
    async spreadWithConfig(
        cards: FSRSCard[],
        config: SpreadConfig,
        meta: ActionMeta,
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<SpreadResult> {
        // 验证配置
        const validationError = ConfigValidator.validateSpreadConfig(config);
        if (validationError) {
            console.error('[RescheduleService] Invalid spread config:', validationError);
            await pushErrMsg(`Invalid configuration: ${validationError.message}`);
            return {
                updated: 0,
                averageCardsPerDay: 0,
                errors: [validationError.message]
            };
        }

        // 执行操作并处理错误
        const result = await this.executeWithErrorHandling(
            () => this.spreadEngine.execute(cards, config, meta.source, onProgress),
            'spreadWithConfig'
        );

        if (!result.ok) {
            await pushErrMsg(`Spread failed: ${result.error.message}`);
            return {
                updated: 0,
                averageCardsPerDay: 0,
                errors: [result.error.message]
            };
        }

        return result.value;
    }
}

