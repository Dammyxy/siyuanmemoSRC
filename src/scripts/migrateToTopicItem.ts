/**
 * 数据迁移脚本：Topic/Item 类型识别
 *
 * 功能：
 * - 自动识别现有卡片的 Topic/Item 类型
 * - 为 Topic 卡片初始化 A-Factor
 * - 写入块属性供持久化使用
 *
 * 使用方法：
 * ```typescript
 * import { migrateExistingCards } from '@/scripts/migrateToTopicItem';
 *
 * // 迁移所有卡片
 * await migrateExistingCards();
 *
 * // 或者迁移指定文档的卡片
 * await migrateCardsInDoc(docId);
 * ```
 */

import { getAllCardBlockIds, getCardBlocksInDoc, ATTR_CARD_TYPE, ATTR_A_FACTOR, ATTR_PRIORITY } from '@/core/siyuan/block';
import { detectCardType, initializeAFactor } from '@/core/card-builder/detectCardType';
import { getBlockAttrs, setBlockAttrs, sql } from '@/core/siyuan/api';
import { getRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';

/**
 * 迁移结果统计
 */
export interface MigrationResult {
    total: number;
    migrated: number;
    topics: number;
    items: number;
    errors: number;
    duration: number; // 毫秒
}

/**
 * 迁移所有现有卡片
 *
 * @param forceRemigrate 是否强制重新识别（覆盖已有标记）
 * @returns 迁移结果统计
 */
export async function migrateExistingCards(forceRemigrate = false): Promise<MigrationResult> {
    const startTime = Date.now();
    console.log('[Migration] Starting Topic/Item migration for all cards...');

    // 1. 从 Riff 获取所有卡片（包括没有 fsrs 标记的）
    // 分页获取所有卡片
    let allBlocks: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
        const response = await getRiffCards(BUILTIN_DECK_ID, page, pageSize);
        allBlocks.push(...response.blocks);

        // 如果获取的卡片数量少于 pageSize，说明已经是最后一页了
        if (response.blocks.length < pageSize) {
            break;
        }

        page++;
    }

    const blockIds = allBlocks.map((card: any) => card.id);
    console.log(`[Migration] Found ${blockIds.length} cards in Riff to migrate`);

    // 2. 批量迁移
    const result = await migrateCards(blockIds, forceRemigrate);

    const duration = Date.now() - startTime;
    console.log('[Migration] Migration completed:', {
        ...result,
        duration: `${duration}ms`,
    });

    return { ...result, duration };
}

/**
 * 迁移指定文档的卡片
 *
 * @param docId 文档 ID
 * @returns 迁移结果统计
 */
export async function migrateCardsInDoc(docId: string): Promise<MigrationResult> {
    const startTime = Date.now();
    console.log(`[Migration] Starting Topic/Item migration for doc: ${docId}`);

    // 1. 获取文档中的所有闪卡块
    const blockIds = await getCardBlocksInDoc(docId);
    console.log(`[Migration] Found ${blockIds.length} cards in doc`);

    // 2. 批量迁移
    const result = await migrateCards(blockIds);

    const duration = Date.now() - startTime;
    console.log('[Migration] Doc migration completed:', {
        ...result,
        duration: `${duration}ms`,
    });

    return { ...result, duration };
}

/**
 * 批量迁移卡片（核心逻辑）
 *
 * @param blockIds 块 ID 列表
 * @param forceRemigrate 是否强制重新识别（覆盖已有标记）
 * @returns 迁移结果统计
 */
export async function migrateCards(blockIds: string[], forceRemigrate = false): Promise<MigrationResult> {
    let migrated = 0;
    let topics = 0;
    let items = 0;
    let errors = 0;

    // 批量处理（每批 10 个，避免并发过多）
    const batchSize = 10;
    for (let i = 0; i < blockIds.length; i += batchSize) {
        const batch = blockIds.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map(async (blockId) => {
                return await migrateSingleCard(blockId, forceRemigrate);
            })
        );

        // 统计结果
        for (const result of results) {
            if (result.status === 'fulfilled') {
                if (result.value.migrated) {
                    migrated++;
                    if (result.value.cardType === 'topic') {
                        topics++;
                    } else if (result.value.cardType === 'item') {
                        items++;
                    }
                }
            } else {
                errors++;
                console.error('[Migration] Card migration failed:', result.reason);
            }
        }

        // 进度日志
        const progress = Math.min(i + batchSize, blockIds.length);
        console.log(`[Migration] Progress: ${progress}/${blockIds.length} (${topics} topics, ${items} items)`);
    }

    return {
        total: blockIds.length,
        migrated,
        topics,
        items,
        errors,
        duration: 0, // 会在外层设置
    };
}

/**
 * 迁移单张卡片
 *
 * @param blockId 块 ID
 * @returns 迁移结果
 */
export async function migrateSingleCard(blockId: string, forceRemigrate = false): Promise<{
    blockId: string;
    migrated: boolean;
    cardType?: 'topic' | 'item';
    aFactor?: number;
}> {
    try {
        // 1. 检测卡片类型
        const cardType = await detectCardType(blockId);

        // 2. 获取现有属性
        const attrs = await getBlockAttrs(blockId);
        const existingType = attrs?.[ATTR_CARD_TYPE];  // ← 添加可选链操作符

        // 如果已经有类型标记，跳过（除非强制重新识别）
        if (!forceRemigrate && (existingType === 'topic' || existingType === 'item')) {
            return {
                blockId,
                migrated: false,
                cardType: existingType,
            };
        }

        // 3. 获取优先级（用于初始化 A-Factor）
        const priorityStr = attrs?.[ATTR_PRIORITY] || '50';
        const priority = parseInt(priorityStr, 10);
        const validPriority = isNaN(priority) ? 50 : Math.max(0, Math.min(100, priority));

        // 4. 准备更新属性
        const updates: Record<string, string> = {
            [ATTR_CARD_TYPE]: cardType,
        };

        // 5. 如果是 Topic，初始化 A-Factor
        if (cardType === 'topic') {
            const aFactor = initializeAFactor(validPriority);
            updates[ATTR_A_FACTOR] = aFactor.toString();

            console.log('[Migration] Topic card:', {
                blockId,
                priority: validPriority,
                aFactor,
            });
        } else {
            console.log('[Migration] Item card:', { blockId });
        }

        // 6. 写入块属性
        await setBlockAttrs(blockId, updates);

        return {
            blockId,
            migrated: true,
            cardType,
            aFactor: cardType === 'topic' ? parseFloat(updates[ATTR_A_FACTOR]) : undefined,
        };
    } catch (err: any) {
        const errorMsg = err?.message || String(err);

        // 区分不同类型的错误
        if (errorMsg.includes('tree not found') || errorMsg.includes('Not found entity')) {
            console.warn(`[Migration] Block ${blockId}: Skipped (document tree deleted)`);
            return { blockId, migrated: false, cardType: undefined };
        }

        if (errorMsg.includes('正在进行数据索引') || errorMsg.includes('索引')) {
            console.warn(`[Migration] Block ${blockId}: Skipped (indexing in progress)`);
            return { blockId, migrated: false, cardType: undefined };
        }

        console.error(`[Migration] Failed to migrate card ${blockId}:`, errorMsg);
        throw err;
    }
}

/**
 * 检查是否需要迁移
 *
 * @returns 是否需要迁移
 */
export async function checkMigrationNeeded(): Promise<boolean> {
    try {
        const blockIds = await getAllCardBlockIds();

        // 检查前 100 个卡片，看是否有未标记类型的
        const sampleSize = Math.min(100, blockIds.length);
        const sample = blockIds.slice(0, sampleSize);

        for (const blockId of sample) {
            const attrs = await getBlockAttrs(blockId);
            const cardType = attrs?.[ATTR_CARD_TYPE];

            // 如果发现未标记类型的卡片，需要迁移
            if (!cardType || (cardType !== 'topic' && cardType !== 'item')) {
                return true;
            }
        }

        return false;
    } catch (err) {
        console.error('[Migration] Failed to check migration status:', err);
        return false;
    }
}
