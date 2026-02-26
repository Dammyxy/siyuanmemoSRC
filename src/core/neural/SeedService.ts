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
import type { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SeedService');

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
     * 2. 加入种子块集合
     * 
     * @param blockId 块 ID
     */
    async lockAsSeed(blockId: string): Promise<void> {
        try {
            logger.debug(`Locking block as seed: ${blockId}`);

            // 1. 检查是否已是闪卡
            const existing = await getRiffCardsByBlockIDs([blockId]);
            if (!existing || existing.length === 0) {
                // 创建 Riff 闪卡
                logger.debug(`Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            } else {
                logger.debug(`Block ${blockId} is already a flashcard`);
            }

            // 2. 调用队列的 lockCurrentAsSeed（会处理持久化）
            await this.queue.lockCurrentAsSeed(blockId);

            logger.info(`Block ${blockId} locked as seed successfully`);
        } catch (error) {
            logger.error('Failed to lock block as seed:', error);
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
            logger.debug(`Starting roaming from seed: ${blockId}`);

            // 1. 确保是闪卡
            const existing = await getRiffCardsByBlockIDs([blockId]);
            if (!existing || existing.length === 0) {
                logger.debug(`Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            }

            // 2. 设为当前会话种子
            await this.queue.lockCurrentAsSeed(blockId, 'high');

            logger.info(`Started roaming from seed: ${blockId}`);
        } catch (error) {
            logger.error('Failed to start from seed:', error);
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
                logger.debug(`Creating Riff flashcard for: ${blockId}`);
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            }

            // 2. 加入种子块集合
            await this.queue.addCard(blockId);

            logger.info(`Block ${blockId} added as seed`);
        } catch (error) {
            logger.error('Failed to add block as seed:', error);
            throw error;
        }
    }
}
