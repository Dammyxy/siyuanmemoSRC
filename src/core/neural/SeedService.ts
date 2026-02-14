/**
 * SeedService - 统一的种子块管理服务
 * 
 * 负责：
 * 1. 创建 Riff 闪卡
 * 2. 加入神经漫游队列
 * 3. 设为当前种子
 * 
 * 工具栏按钮和图谱右键菜单共用此服务。
 */

import { addRiffCards, BUILTIN_DECK_ID, getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import type { NeuralRoamQueue } from '@/queues/NeuralRoamQueue';
import type { WeightedNeighbor } from '@/core/queue/neural/types';

export class SeedService {
    private queue: NeuralRoamQueue;

    constructor(queue: NeuralRoamQueue) {
        this.queue = queue;
    }

    /**
     * 锁定块为种子（统一入口）
     * 
     * 流程：
     * 1. 创建 Riff 闪卡（如果尚未是闪卡）
     * 2. 记录当前候选块为遗落块
     * 3. 加入种子块集合
     * 4. 设为当前种子并重新初始化队列
     * 
     * @param blockId 块 ID
     * @param currentCandidates 当前候选节点（用于记录遗落块）
     */
    async lockAsSeed(blockId: string, currentCandidates?: WeightedNeighbor[]): Promise<void> {
        try {
            console.log(`[SeedService] Locking block as seed: ${blockId}`);

            // 1. 检查是否已是闪卡
            const existing = await getRiffCardsByBlockIDs([blockId]);
            if (!existing || existing.length === 0) {
                // 创建 Riff 闪卡
                console.log(`[SeedService] Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            } else {
                console.log(`[SeedService] Block ${blockId} is already a flashcard`);
            }

            // 2. 记录遗落块（如果有候选节点）
            if (currentCandidates && currentCandidates.length > 0) {
                this.queue.setSeed(blockId, currentCandidates);
                console.log(`[SeedService] Recorded ${currentCandidates.length} missed blocks`);
            }

            // 3. 调用队列的 lockCurrentAsSeed（会处理持久化和重新初始化）
            await this.queue.lockCurrentAsSeed(blockId);

            console.log(`[SeedService] Block ${blockId} locked as seed successfully`);
        } catch (error) {
            console.error(`[SeedService] Failed to lock block as seed:`, error);
            throw error;
        }
    }

    /**
     * 从图谱选择块作为漫游起点
     * 
     * 与 lockAsSeed 类似，但不记录遗落块（因为是从图谱选择的）。
     * 
     * @param blockId 块 ID
     */
    async startFromSeed(blockId: string): Promise<void> {
        try {
            console.log(`[SeedService] Starting roaming from seed: ${blockId}`);

            // 1. 确保是闪卡
            const existing = await getRiffCardsByBlockIDs([blockId]);
            if (!existing || existing.length === 0) {
                console.log(`[SeedService] Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            }

            // 2. 直接开始漫游
            await this.queue.startRoamingFromSeed(blockId);

            console.log(`[SeedService] Started roaming from seed: ${blockId}`);
        } catch (error) {
            console.error(`[SeedService] Failed to start from seed:`, error);
            throw error;
        }
    }

    /**
     * 添加块为种子（仅加入队列，不设为当前种子）
     * 
     * @param blockId 块 ID
     */
    async addAsSeed(blockId: string): Promise<void> {
        try {
            // 1. 确保是闪卡
            const existing = await getRiffCardsByBlockIDs([blockId]);
            if (!existing || existing.length === 0) {
                console.log(`[SeedService] Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            }

            // 2. 加入种子块集合
            await this.queue.addCard(blockId);

            console.log(`[SeedService] Block ${blockId} added as seed`);
        } catch (error) {
            console.error(`[SeedService] Failed to add block as seed:`, error);
            throw error;
        }
    }
}
