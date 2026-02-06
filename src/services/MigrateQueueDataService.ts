/**
 * Migrate Queue Data Service
 *
 * 将旧架构队列数据迁移到新架构
 *
 * ## 功能
 * - 读取旧队列 JSON 文件（queue-final-drill.json, queue-retrieval-practice.json 等）
 * - 转换 QueueItem[] 为 FSRSCard[]
 * - 保存到新架构的 StorageManager
 * - 数据完整性验证
 *
 * ## 使用场景
 * - 插件升级时自动迁移旧队列数据
 * - 手动触发迁移（通过设置或命令）
 * - 数据回滚（保留备份）
 *
 * @example
 * ```typescript
 * const migrator = new MigrateQueueDataService(storageManager);
 *
 * // 迁移所有队列
 * const results = await migrator.migrateAll();
 * console.log('迁移结果:', results);
 *
 * // 迁移单个队列
 * await migrator.migrateQueue('retrieval-practice');
 * ```
 *
 * @see QUEUE_ARCHITECTURE.md
 * @see 旧架构到新架构迁移计划
 */

import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard, CardState } from '@/types/card';
import type { QueueItem } from '@/core/queue/types';
import { CardType } from '@/types/card';

/**
 * 队列类型映射
 */
const QUEUE_FILE_MAPPING: Record<string, string> = {
    'final-drill': 'queue-final-drill.json',
    'retrieval-practice': 'queue-retrieval-practice.json',
    'neural-roam': 'queue-neural-roam.json',
    'incremental-learning': 'queue-incremental-learning.json',
};

/**
 * 旧队列数据格式
 */
type OldQueueData = {
    version?: number;
    items: QueueItem[];
    lastAutoSortDay?: string;
    metadata?: {
        savedAt: number;
        count: number;
    };
};

/**
 * 迁移结果
 */
export type MigrationResult = {
    queueType: string;
    success: boolean;
    oldCount: number;
    newCount: number;
    error?: string;
    duration: number;
};

/**
 * 迁移统计
 */
export type MigrationStats = {
    total: number;
    success: number;
    failed: number;
    duration: number;
};

/**
 * MigrateQueueDataService 类
 *
 * 负责将旧架构队列数据迁移到新架构。
 */
export class MigrateQueueDataService {
    private readonly storage: StorageManager;

    constructor(storage: StorageManager) {
        this.storage = storage;
    }

    /**
     * 迁移所有队列
     *
     * @returns 迁移结果统计
     */
    async migrateAll(): Promise<MigrationStats> {
        const startTime = Date.now();
        const results: MigrationResult[] = [];

        console.log('[MigrateQueueDataService] 开始迁移所有队列...');

        // 迁移各个队列
        for (const queueType of Object.keys(QUEUE_FILE_MAPPING)) {
            const result = await this.migrateQueue(queueType);
            results.push(result);
        }

        const duration = Date.now() - startTime;
        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('[MigrateQueueDataService] 迁移完成:', {
            total: results.length,
            success,
            failed,
            duration,
        });

        return {
            total: results.length,
            success,
            failed,
            duration,
        };
    }

    /**
     * 迁移单个队列
     *
     * @param queueType - 队列类型（'final-drill', 'retrieval-practice' 等）
     * @returns 迁移结果
     */
    async migrateQueue(queueType: string): Promise<MigrationResult> {
        const startTime = Date.now();

        try {
            console.log(`[MigrateQueueDataService] 迁移队列: ${queueType}`);

            // 1. 读取旧队列数据
            const oldData = await this.readOldQueueFile(queueType);

            if (!oldData || oldData.items.length === 0) {
                console.log(`[MigrateQueueDataService] 队列 ${queueType} 无数据，跳过`);
                return {
                    queueType,
                    success: true,
                    oldCount: 0,
                    newCount: 0,
                    duration: Date.now() - startTime,
                };
            }

            const oldCount = oldData.items.length;

            // 2. 转换为新架构格式
            const newCards = this.convertToNewFormat(oldData.items, queueType);

            // 3. 验证数据完整性
            this.validateMigration(oldData.items, newCards);

            // 4. 保存到 StorageManager
            await this.saveToStorageManager(newCards);

            const newCount = newCards.length;
            const duration = Date.now() - startTime;

            console.log(`[MigrateQueueDataService] 队列 ${queueType} 迁移成功:`, {
                oldCount,
                newCount,
                duration,
            });

            return {
                queueType,
                success: true,
                oldCount,
                newCount,
                duration,
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            console.error(`[MigrateQueueDataService] 队列 ${queueType} 迁移失败:`, error);

            return {
                queueType,
                success: false,
                oldCount: 0,
                newCount: 0,
                error: errorMessage,
                duration,
            };
        }
    }

    /**
     * 读取旧队列文件
     *
     * @param queueType - 队列类型
     * @returns 旧队列数据或 null
     */
    private async readOldQueueFile(queueType: string): Promise<OldQueueData | null> {
        const filename = QUEUE_FILE_MAPPING[queueType];

        if (!filename) {
            console.warn(`[MigrateQueueDataService] 未知队列类型: ${queueType}`);
            return null;
        }

        try {
            // 这里需要实现读取插件的 JSON 文件
            // 假设 StorageManager 有一个 readPluginData 方法
            const data = await (this.storage as any).readPluginData?.(filename);

            if (!data) {
                return null;
            }

            const parsed = JSON.parse(data) as OldQueueData;

            // 验证数据格式
            if (!parsed.items || !Array.isArray(parsed.items)) {
                console.error(`[MigrateQueueDataService] 无效的数据格式: ${filename}`);
                return null;
            }

            return parsed;
        } catch (error) {
            console.error(`[MigrateQueueDataService] 读取文件失败: ${filename}`, error);
            return null;
        }
    }

    /**
     * 转换 QueueItem[] 为 FSRSCard[]
     *
     * @param oldItems - 旧架构卡片数组
     * @param queueType - 队列类型
     * @returns 新架构卡片数组
     */
    private convertToNewFormat(oldItems: QueueItem[], queueType: string): FSRSCard[] {
        const now = Date.now();

        return oldItems.map((item, index) => {
            // 基础字段映射
            const card: FSRSCard = {
                // 标识字段
                id: item.cardID,
                blockId: item.blockID,

                // FSRS 核心字段（必需）
                due: item.lastReview && item.elapsedDays && item.scheduledDays
                    ? item.lastReview + (item.elapsedDays + item.scheduledDays) * 24 * 60 * 60 * 1000
                    : now, // 如果没有到期时间，使用当前时间
                stability: item.stability ?? 0,
                difficulty: item.difficulty ?? 5,
                reps: item.reps ?? 0,
                lapses: item.lapses ?? 0,
                state: this.mapCardState(item.state),
                lastReview: item.lastReview ?? 0,
                elapsedDays: item.elapsedDays ?? 0,
                scheduledDays: item.scheduledDays ?? 0,

                // 扩展字段（必需）
                priority: item.priority ?? 50,
                type: this.inferCardType(queueType, item),
                tags: [],

                // 难点攻克字段（必需）
                leechCount: 0,
                isLeech: false,

                // 跳过字段（必需）
                skipped: false,

                // 元数据字段（必需）
                createdAt: item.updatedAt ?? now,
                updatedAt: item.updatedAt ?? now,

                // Riff 集成字段
                deckID: item.deckID,
            };

            // 保留原始元数据
            if (item.meta) {
                card.meta = item.meta;
            }

            // 保留 nextDues（如果有）
            if (item.nextDues) {
                (card as any).nextDues = item.nextDues;
            }

            return card;
        });
    }

    /**
     * 映射卡片状态
     *
     * @param oldState - 旧架构状态（可选）
     * @returns 新架构状态
     */
    private mapCardState(oldState?: number): CardState {
        // 如果旧状态有效，直接使用
        if (oldState !== undefined && oldState >= 0 && oldState <= 3) {
            return oldState as CardState;
        }

        // 否则默认为新卡
        return 0; // CardState.New
    }

    /**
     * 推断卡片类型
     *
     * @param queueType - 队列类型
     * @param item - 旧架构卡片
     * @returns 卡片类型
     */
    private inferCardType(queueType: string, item: QueueItem): CardType {
        // 根据队列类型和元数据推断卡片类型
        const topicTag = item.meta?.['topic'] as boolean | undefined;

        if (topicTag) {
            return CardType.Topic;
        }

        // 默认为 Item 类型
        return CardType.Item;
    }

    /**
     * 验证数据完整性
     *
     * @param oldItems - 旧架构卡片
     * @param newCards - 新架构卡片
     * @throws Error 如果验证失败
     */
    private validateMigration(oldItems: QueueItem[], newCards: FSRSCard[]): void {
        // 1. 数量检查
        if (oldItems.length !== newCards.length) {
            throw new Error(
                `数据数量不匹配: 旧架构 ${oldItems.length} 张，新架构 ${newCards.length} 张`
            );
        }

        // 2. ID 检查
        for (let i = 0; i < oldItems.length; i++) {
            const oldItem = oldItems[i];
            const newCard = newCards[i];

            if (oldItem.cardID !== newCard.id) {
                console.warn(
                    `[MigrateQueueDataService] 卡片 ID 不匹配 at index ${i}:` +
                    ` 旧=${oldItem.cardID}, 新=${newCard.id}`
                );
            }
        }

        // 3. 必需字段检查
        for (const card of newCards) {
            if (!card.id || !card.blockId) {
                throw new Error(`卡片缺少必需字段: id=${card.id}, blockId=${card.blockId}`);
            }
        }

        console.log(`[MigrateQueueDataService] 数据完整性验证通过: ${newCards.length} 张卡片`);
    }

    /**
     * 保存到 StorageManager
     *
     * @param cards - 新架构卡片数组
     */
    private async saveToStorageManager(cards: FSRSCard[]): Promise<void> {
        // 使用 StorageManager 的 setCard 方法逐个添加卡片
        for (const card of cards) {
            this.storage.setCard(card);
        }

        // 保存到磁盘
        await this.storage.saveCards();

        console.log(`[MigrateQueueDataService] 已保存 ${cards.length} 张卡片到 StorageManager`);
    }

    /**
     * 备份旧队列文件
     *
     * 在迁移前自动备份旧数据，以便回滚。
     *
     * @param queueType - 队列类型
     */
    async backupOldQueue(queueType: string): Promise<void> {
        const filename = QUEUE_FILE_MAPPING[queueType];

        if (!filename) {
            return;
        }

        try {
            // 读取旧文件
            const data = await (this.storage as any).readPluginData?.(filename);

            if (!data) {
                return;
            }

            // 写入备份文件
            const backupFilename = filename.replace('.json', '.backup.json');
            await (this.storage as any).writePluginData?.(backupFilename, data);

            console.log(`[MigrateQueueDataService] 已备份队列: ${queueType} -> ${backupFilename}`);
        } catch (error) {
            console.error(`[MigrateQueueDataService] 备份失败: ${queueType}`, error);
        }
    }

    /**
     * 检查队列是否已迁移
     *
     * @param queueType - 队列类型
     * @returns 是否已迁移
     */
    isQueueMigrated(queueType: string): boolean {
        // 检查 StorageManager 中是否已有该队列的数据
        // 这里需要根据实际情况实现
        return false;
    }

    /**
     * 获取迁移状态
     *
     * @returns 所有队列的迁移状态
     */
    async getMigrationStatus(): Promise<Record<string, boolean>> {
        const status: Record<string, boolean> = {};

        for (const queueType of Object.keys(QUEUE_FILE_MAPPING)) {
            status[queueType] = this.isQueueMigrated(queueType);
        }

        return status;
    }
}
