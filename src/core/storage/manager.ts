/**
 * Storage Manager
 * 统一管理插件数据的存储和读取
 * 采用混合方案：块属性 + 独立存储
 * 
 * 🆕 使用 msgpack 格式存储（性能更好，避免同步问题）
 */

import type { FSRSCard, ReviewLog, PluginSettings, RescheduleLog } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RIFF_CONFIG, normalizePluginSettings, type RiffIntegrationConfig } from '@/types';
import { CardType, CardState } from '@/types/card';
import * as siyuanApi from '@/core/siyuan/api';
import { ATTR_PRIORITY } from '@/core/siyuan/block';
import { clampPriority, DEFAULT_PRIORITY } from '@/core/queue/abstraction/IPriority';
import { encode, decode } from '@msgpack/msgpack';
import { migrateCard } from '@/utils/cardMigration';
import { repairFsrsReviewState } from '@/core/scheduler/fsrsReviewStateRepair';
import { createLogger } from '@/utils/logger';
import type { RescheduleHistoryEntry } from '@/types/reschedule';

/** 存储文件名 */
const STORAGE_FILES = {
    CARDS: 'cards.msgpack',                      // 🆕 使用 msgpack 格式
    CARDS_JSON: 'cards.json',                    // 旧格式（用于迁移）
    SETTINGS: 'settings.json',                   // 保持 JSON（便于手动编辑）
    LOGS_DIR: 'logs',
    PRACTICE_QUEUE: 'practice-queue.msgpack',    // 🆕 使用 msgpack 格式
    PRACTICE_QUEUE_JSON: 'practice-queue.json',  // 旧格式（用于迁移）
    PRACTICE_QUEUE_BACKUP: 'practice-queue-backup.msgpack',
    INCREMENTAL_LEARNING_QUEUE: 'incremental-learning-queue.msgpack',
    INCREMENTAL_LEARNING_QUEUE_JSON: 'incremental-learning-queue.json',
};

interface QueueData {
    version: number;
    items: StoredQueueItem[];
    metadata: {
        createdAt: number;
        updatedAt: number;
        totalReviewed: number;
        initialTotal: number;
    };
}

interface StoredQueueItem extends Record<string, unknown> {
    cardID?: string;
    cardId?: string;
    blockID?: string;
    blockId?: string;
    priority?: number;
}

interface QueuePayload {
    items: StoredQueueItem[];
    lastAutoSortDay: string;
}

interface AttributeRow {
    block_id?: unknown;
    blockId?: unknown;
    value?: unknown;
}

const logger = createLogger('StorageManager');
type LegacyStorageSource = 'msgpack' | 'json' | 'none';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function toStoredQueueItem(value: unknown): StoredQueueItem | null {
    if (!isRecord(value)) {
        return null;
    }
    return { ...value };
}

function normalizeStoredQueueItems(items: unknown[]): StoredQueueItem[] {
    const out: StoredQueueItem[] = [];
    for (const raw of items) {
        const item = toStoredQueueItem(raw);
        if (!item) {
            continue;
        }
        const priorityValue = Number(item.priority);
        item.priority = Number.isFinite(priorityValue) ? priorityValue : DEFAULT_PRIORITY;
        out.push(item);
    }
    return out;
}

function resolveQueueItemCardId(item: StoredQueueItem): string {
    return String(item.cardID || item.cardId || '');
}

function resolveQueueItemBlockId(item: StoredQueueItem): string {
    return String(item.blockID || item.blockId || '');
}

function normalizeAttributeRows(rows: unknown): AttributeRow[] {
    if (!Array.isArray(rows)) {
        return [];
    }
    return rows.filter((row): row is AttributeRow => isRecord(row));
}

function toNumberOrDefault(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toBooleanOrDefault(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    return fallback;
}

function toBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}

function isCardType(value: unknown): value is CardType {
    return typeof value === 'string' && Object.values(CardType).includes(value as CardType);
}

function isSchedulerType(value: unknown): value is NonNullable<FSRSCard['schedulerType']> {
    return value === 'fsrs-v6'
        || value === 'sm2'
        || value === 'sm15'
        || value === 'a-factor'
        || value === 'a-factor-v2'
        || value === 'riff';
}

function toCardState(value: unknown): CardState {
    switch (value) {
        case CardState.Learning:
        case CardState.Review:
        case CardState.Relearning:
        case CardState.Suspended:
            return value;
        default:
            return CardState.New;
    }
}

function toRescheduleHistory(value: unknown): RescheduleHistoryEntry[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const entries = value.flatMap((entry): RescheduleHistoryEntry[] => {
        if (!isRecord(entry)) {
            return [];
        }
        const type = entry.type;
        if (type !== 'postpone' && type !== 'advance' && type !== 'spread' && type !== 'dilute') {
            return [];
        }
        const timestamp = toNumberOrUndefined(entry.timestamp);
        const oldDue = toNumberOrUndefined(entry.oldDue);
        const newDue = toNumberOrUndefined(entry.newDue);
        if (timestamp === undefined || oldDue === undefined || newDue === undefined) {
            return [];
        }
        const reason = toStringOrUndefined(entry.reason);
        return [{
            type,
            timestamp,
            oldDue,
            newDue,
            ...(reason ? { reason } : {}),
        }];
    });

    return entries.length > 0 ? entries : undefined;
}

/**
 * 存储管理器类
 * 
 * @deprecated 此类已废弃，请使用 UnifiedStorageManager + Repository 模式
 * 
 * 迁移指南：
 * - 查询操作：使用 UnifiedStorageManager.getCard() 等方法
 * - 写操作：使用 CardApplicationService.batchUpdateCardsWithoutEvents() 等方法
 * - 业务逻辑：使用领域服务和应用服务
 * 
 * 此类仅保留用于向后兼容，将在未来版本中移除。
 */
export class StorageManager {
    private basePath: string;
    private cardsCache: Map<string, FSRSCard> = new Map();
    private settings: PluginSettings = DEFAULT_SETTINGS;
    private isDirty: boolean = false;
    private practiceQueue: StoredQueueItem[] = [];
    private practiceQueueLastAutoSortDay = '';

    constructor(pluginName: string) {
        this.basePath = siyuanApi.getPluginDataPath(pluginName);
    }

    /**
     * 初始化存储，加载数据到内存
     */
    async init(): Promise<void> {
        // 仅保留 settings 初始化。
        // 说明：cards/practice/incremental/riff-blacklist 已迁移到 UnifiedStorageManager
        // 与 QueuePersistenceService，不再走旧 StorageManager 启动链路。
        await this.loadSettings();
        this.cardsCache.clear();
        this.practiceQueue = [];
        this.incrementalLearningQueue = [];
        this.practiceQueueLastAutoSortDay = '';
    }

    // ==================== 设置 ====================

    /**
     * 获取设置
     */
    getSettings(): PluginSettings {
        return this.settings;
    }

    /**
     * 更新设置
     */
    async updateSettings(settings: Partial<PluginSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        await this.saveSettings();
    }

    /**
     * 加载设置
     */
    private async loadSettings(): Promise<void> {
        try {
            const data = await this.readPluginData(STORAGE_FILES.SETTINGS);
            if (data) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
                // ✅ 向后兼容：自动迁移旧的队列名称
                const defaultQueue = String(this.settings.queues?.defaultQueue || '');
                if (defaultQueue === 'deliberate') {
                    this.settings.queues.defaultQueue = 'final-drill';
                }
                if (defaultQueue === 'neural-wandering') {
                    this.settings.queues.defaultQueue = 'neural-roam';
                }

                const normalized = normalizePluginSettings(this.settings);
                this.settings = normalized.settings;
                if (normalized.changed) {
                    await this.saveSettings();
                    logger.info('[StorageManager] Migrated legacy FSRS settings to v6 defaults');
                }
            }
        } catch (err) {
            logger.warn('Failed to load settings, using defaults:', err);
            this.settings = DEFAULT_SETTINGS;
        }
    }

    /**
     * 保存设置
     */
    private async saveSettings(): Promise<void> {
        await this.writePluginData(STORAGE_FILES.SETTINGS, JSON.stringify(this.settings, null, 2));
    }

    /**
     * 获取 Riff 集成配置
     */
    getRiffIntegrationConfig(): RiffIntegrationConfig {
        return this.settings.riffIntegration || DEFAULT_RIFF_CONFIG;
    }

    /**
     * 更新 Riff 集成配置
     */
    async updateRiffIntegrationConfig(config: Partial<RiffIntegrationConfig>): Promise<void> {
        const currentConfig = this.getRiffIntegrationConfig();
        this.settings.riffIntegration = { ...currentConfig, ...config };
        await this.saveSettings();
    }

    // ==================== 卡片 ====================

    /**
     * 获取卡片
     */
    getCard(cardId: string): FSRSCard | undefined {
        return this.cardsCache.get(cardId);
    }

    /**
     * 根据块 ID 获取卡片
     */
    getCardByBlockId(blockId: string): FSRSCard | undefined {
        for (const card of this.cardsCache.values()) {
            if (card.blockId === blockId) {
                return card;
            }
        }
        return undefined;
    }

    /**
     * 根据块 ID 获取所有卡片（支持双向卡等多卡片场景）
     * 
     * @param blockId 块 ID
     * @returns 该块对应的所有卡片数组
     */
    getCardsByBlockId(blockId: string): FSRSCard[] {
        const cards: FSRSCard[] = [];
        for (const card of this.cardsCache.values()) {
            if (card.blockId === blockId) {
                cards.push(card);
            }
        }
        return cards;
    }

    /**
     * 获取所有卡片
     */
    getAllCards(): FSRSCard[] {
        return Array.from(this.cardsCache.values());
    }

    /**
     * 添加或更新卡片
     */
    setCard(card: FSRSCard): void {
        this.cardsCache.set(card.id, card);
        this.isDirty = true;
    }

    /**
     * 删除卡片
     */
    removeCard(cardId: string): boolean {
        const result = this.cardsCache.delete(cardId);
        if (result) {
            this.isDirty = true;
        }
        return result;
    }

    /**
     * 批量删除卡片（同时从本地和 Riff 删除）
     * 
     * @param blockIds 块 ID 列表
     */
    async deleteCards(blockIds: string[]): Promise<void> {
        if (blockIds.length === 0) return;

        logger.info('Deleting cards:', blockIds.length);

        // 1. 从本地存储删除
        let deletedCount = 0;
        for (const blockId of blockIds) {
            const card = this.getCardByBlockId(blockId);
            if (card) {
                this.removeCard(card.id);
                deletedCount++;
            }
        }

        // 2. 保存更改
        if (deletedCount > 0) {
            await this.saveCards();
            logger.info('Deleted from local storage:', deletedCount);
        }

        // 3. 从 Riff 卡组删除
        try {
            const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await removeRiffCards(BUILTIN_DECK_ID, blockIds);
            logger.info('Deleted from Riff deck:', blockIds.length);
        } catch (error) {
            logger.error('Failed to delete from Riff:', error);
            // 不抛出错误，因为本地已经删除成功
        }

        // 4. 取消块的卡片标记
        try {
            const { unmarkBlockAsCard } = await import('@/core/siyuan/block');
            for (const blockId of blockIds) {
                await unmarkBlockAsCard(blockId);
            }
            logger.info('Unmarked blocks:', blockIds.length);
        } catch (error) {
            logger.error('Failed to unmark blocks:', error);
            // 不抛出错误
        }
    }



    /**
     * 加载卡片
     * 
     * 🔧 自动规范化混合类型数据
     */
    async loadCards(): Promise<void> {
        try {
            const { data, source } = await this.loadWithLegacyFallback(STORAGE_FILES.CARDS, STORAGE_FILES.CARDS_JSON);
            if (source === 'none') {
                logger.info('No card data found, starting with empty collection');
                this.cardsCache.clear();
                return;
            }

            const cards: unknown[] = Array.isArray(data) ? data : [];
            const normalizedCount = this.cacheNormalizedCards(cards);
            this.logXiuyuanCardSamples('Loaded', this.getAllCards());

            const sourceLabel = source === 'msgpack' ? 'msgpack' : 'JSON, will migrate to msgpack';
            logger.info(`Loaded ${cards.length} cards (${sourceLabel})`);
            await this.persistNormalizedCardsIfNeeded(normalizedCount);
        } catch (err) {
            logger.error('Failed to load cards:', err);
            // ✅ 确保即使出错也有一个有效的空缓存
            this.cardsCache.clear();
        }
    }

    private async loadWithLegacyFallback(msgpackFile: string, jsonFile: string): Promise<{ data: unknown; source: LegacyStorageSource }> {
        const msgpackData = await this.loadMsgpackData(msgpackFile);
        if (msgpackData !== null && msgpackData !== undefined) {
            return { data: msgpackData, source: 'msgpack' };
        }

        const jsonData = await this.readPluginData(jsonFile);
        if (!jsonData) {
            return { data: null, source: 'none' };
        }

        return { data: JSON.parse(jsonData), source: 'json' };
    }

    private cacheNormalizedCards(cards: unknown[]): number {
        this.cardsCache.clear();

        let normalizedCount = 0;
        for (const card of cards) {
            const normalizedCard = this.normalizeCard(card);
            this.cardsCache.set(normalizedCard.id, normalizedCard);

            if (this.wasCardNormalized(card, normalizedCard)) {
                normalizedCount++;
            }
        }

        return normalizedCount;
    }

    private async persistNormalizedCardsIfNeeded(normalizedCount: number): Promise<void> {
        if (normalizedCount <= 0) {
            return;
        }

        logger.info(`🔧 Normalized ${normalizedCount} mixed-type cards, saving...`);
        this.isDirty = true;
        await this.saveCards();
    }

    private logXiuyuanCardSamples(stage: 'Loaded' | 'Saving', cards: FSRSCard[]): void {
        const xiuyuanCards = cards.filter(c => c.id.startsWith('xy_card_'));
        if (xiuyuanCards.length === 0) {
            return;
        }

        logger.info(`🔍 ${stage} Xiuyuan cards:`, {
            count: xiuyuanCards.length,
            samples: xiuyuanCards.slice(0, 2).map(c => ({
                id: c.id,
                blockId: c.blockId,
                hasMeta: !!c.meta,
                metaKeys: c.meta ? Object.keys(c.meta) : [],
                xiuyuanID: isRecord(c.meta) ? c.meta.xiuyuanID : undefined,
                currentIndex: isRecord(c.meta) ? c.meta.currentIndex : undefined,
            })),
        });
    }
    
    /**
     * 规范化卡片数据
     * 
     * 将混合类型的卡片转换为纯 FSRSCard 格式：
     * - 移除 QueueItem 特有字段（deckID）
     * - 统一使用小写字段（blockId, cardId）
     * - 填充缺失的扩展字段
     * - 🆕 修复无效的日期字段（due, lastReview）
     * 
     * 🔧 注意：type 字段需要从块属性读取，不能随意填充默认值
     * 如果卡片没有 type 字段，保持 undefined，等待从块属性读取
     */
    private normalizeCard(card: unknown): FSRSCard {
        const source = isRecord(card) ? card : {};
        // 处理大小写变体
        const id = source.id || source.cardID || source.cardId;
        const blockId = source.blockId || source.blockID;
        
        // 🆕 验证并修复日期字段
        const validateTimestamp = (value: unknown, fieldName: string): number => {
            // 如果是字符串，尝试解析
            if (typeof value === 'string') {
                const timestamp = new Date(value).getTime();
                // 检查是否为有效时间戳（大于 2000-01-01 且不是 NaN）
                // 2000-01-01 ≈ 946684800000 ms
                // 这样可以过滤掉 "0001-01-01" 这种无效日期（会被解析为负数或很小的正数）
                const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
                if (!isNaN(timestamp) && timestamp >= MIN_VALID_TIMESTAMP) {
                    return timestamp;
                }
                logger.warn(`Invalid date string in ${fieldName}: "${value}" (timestamp: ${timestamp}) for card ${id || blockId}`);
                return 0;
            }
            
            // 如果是数字，验证有效性
            if (typeof value === 'number') {
                // 同样检查最小有效时间戳
                const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
                if (isNaN(value) || value < 0 || (value > 0 && value < MIN_VALID_TIMESTAMP)) {
                    logger.warn(`Invalid timestamp in ${fieldName}: ${value} for card ${id || blockId}`);
                    return 0;
                }
                return value;
            }
            
            // 其他情况返回默认值
            return 0;
        };
        
        // 构造纯 FSRSCard（移除 QueueItem 字段）
        const meta = isRecord(source.meta) ? source.meta : undefined;
        const syncToRiff = toBoolean(source.syncToRiff);
        const riffCardId = toStringOrUndefined(source.riffCardId);
        const skipUntil = toNumberOrUndefined(source.skipUntil);
        const postponeCount = toNumberOrUndefined(source.postponeCount);
        const lastPostponeDate = toNumberOrUndefined(source.lastPostponeDate);
        const rescheduleHistory = toRescheduleHistory(source.rescheduleHistory);
        const normalized: FSRSCard = {
            // 标识字段
            id: String(id || blockId),
            xiuyuanID: typeof source.xiuyuanID === 'string'
                ? source.xiuyuanID
                : (typeof source.meta === 'object' && source.meta !== null && typeof (source.meta as Record<string, unknown>).xiuyuanID === 'string'
                    ? String((source.meta as Record<string, unknown>).xiuyuanID)
                    : ''),
            blockId: String(blockId || id),
            
            // FSRS 核心字段（🆕 验证日期）
            due: validateTimestamp(source.due, 'due') || Date.now(),
            state: toCardState(source.state),
            stability: toNumberOrDefault(source.stability, 0),
            difficulty: toNumberOrDefault(source.difficulty, 0),
            reps: toNumberOrDefault(source.reps, 0),
            lapses: toNumberOrDefault(source.lapses, 0),
            lastReview: validateTimestamp(source.lastReview, 'lastReview'),
            elapsedDays: toNumberOrDefault(source.elapsedDays, 0),
            scheduledDays: toNumberOrDefault(source.scheduledDays, 0),
            
            // 扩展字段（填充默认值）
            priority: toNumberOrDefault(source.priority, 50),
            // ✅ 修复：为 null/undefined 提供默认值 CardType.Item
            type: isCardType(source.type) ? source.type : CardType.Item,
            tags: toStringArray(source.tags),
            leechCount: toNumberOrDefault(source.leechCount, 0),
            isLeech: toBooleanOrDefault(source.isLeech, false),
            skipped: toBooleanOrDefault(source.skipped, false),
            
            // 元数据
            createdAt: toNumberOrDefault(source.createdAt, Date.now()),
            updatedAt: toNumberOrDefault(source.updatedAt, Date.now()),
            
            // 保留其他字段（但不包括 deckID）
            ...(isSchedulerType(source.schedulerType) && { schedulerType: source.schedulerType }),
            ...(syncToRiff !== undefined && { syncToRiff }),
            ...(riffCardId && { riffCardId }),
            ...(skipUntil !== undefined && { skipUntil }),
            ...(meta && { meta }),
            
            // 🆕 保留 SuperMemo 重新调度字段（如果存在）
            ...(postponeCount !== undefined && { postponeCount }),
            ...(lastPostponeDate !== undefined && { lastPostponeDate }),
            ...(rescheduleHistory && { rescheduleHistory }),
        };
        
        // ✅ 应用迁移逻辑：确保所有必需字段存在（learning_step、postponeCount、rescheduleHistory）
        const migrated = migrateCard(normalized);
        return repairFsrsReviewState(migrated, { schedulerType: migrated.schedulerType }).card;
    }
    
    /**
     * 检查卡片是否被规范化
     * 
     * 判断依据：
     * - 原卡片有 deckID 字段（QueueItem 特征）
     * - 原卡片使用大写字段（blockID, cardID）
     * - 原卡片缺少扩展字段
     */
    private wasCardNormalized(original: unknown, normalized: FSRSCard): boolean {
        const source = isRecord(original) ? original : {};
        // 检查是否有 QueueItem 特征
        const hadDeckID = 'deckID' in source;
        
        // 检查是否使用大写字段
        const hadUpperCase = ('blockID' in source) || ('cardID' in source);
        
        // 检查是否缺少扩展字段
        const lackedExtendedFields = 
            !('priority' in source) ||
            !('type' in source) ||
            !('tags' in source);
        
        return hadDeckID
            || hadUpperCase
            || lackedExtendedFields
            || this.wasSchedulingStateNormalized(source, normalized);
    }

    private wasSchedulingStateNormalized(source: Record<string, unknown>, normalized: FSRSCard): boolean {
        const fields: Array<keyof Pick<
            FSRSCard,
            'due' | 'state' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'lastReview' | 'elapsedDays' | 'scheduledDays' | 'learning_step'
        >> = [
            'due',
            'state',
            'stability',
            'difficulty',
            'reps',
            'lapses',
            'lastReview',
            'elapsedDays',
            'scheduledDays',
            'learning_step',
        ];

        return fields.some((field) => {
            const currentValue = toNumberOrUndefined(normalized[field]);
            if (currentValue === undefined) {
                return false;
            }

            const sourceValue = field === 'due' || field === 'lastReview'
                ? this.readSourceTimestamp(source[field])
                : toNumberOrUndefined(source[field]);

            return sourceValue !== currentValue;
        });
    }

    private readSourceTimestamp(value: unknown): number | undefined {
        if (typeof value === 'string') {
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        return toNumberOrUndefined(value);
    }

    /**
     * 保存卡片（批量）
     */
    async saveCards(): Promise<void> {
        if (!this.isDirty) return;

        const cards = this.getAllCards();
        this.logXiuyuanCardSamples('Saving', cards);
        
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.CARDS, cards);
        this.isDirty = false;
        logger.info(`Saved ${cards.length} cards (msgpack)`);
    }

    getPracticeQueue(): StoredQueueItem[] {
        return this.practiceQueue;
    }

    async setPracticeQueue(queue: StoredQueueItem[]): Promise<void> {
        this.practiceQueue = queue;
        await this.savePracticeQueue();
    }

    async addPracticeQueue(cards: StoredQueueItem[]): Promise<number> {
        const existing = new Set(this.practiceQueue.map(resolveQueueItemCardId).filter(Boolean));
        let added = 0;
        for (const rawCard of cards) {
            const cardId = resolveQueueItemCardId(rawCard);
            if (!cardId || existing.has(cardId)) {
                continue;
            }
            existing.add(cardId);
            this.practiceQueue.push({
                ...rawCard,
                priority: toNumberOrDefault(rawCard.priority, DEFAULT_PRIORITY),
            });
            added++;
        }
        if (added > 0) {
            await this.savePracticeQueue();
        }
        return added;
    }

    async clearPracticeQueue(): Promise<void> {
        this.practiceQueue = [];
        await this.savePracticeQueue();
    }

    // ==================== Phase 2d.2: 版本化队列数据 ====================

    /**
     * 获取队列数据（版本化格式）
     */
    getQueueData(): QueueData | null {
        return {
            version: 2,
            items: this.practiceQueue,
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                totalReviewed: 0,
                initialTotal: this.practiceQueue.length,
            },
        };
    }

    /**
     * 设置队列数据（版本化格式）
     */
    async setQueueData(data: QueueData): Promise<void> {
        this.practiceQueue = data.items;
        await this.savePracticeQueueV2(data);
    }

    // ==================== Phase 2d.4: 数据备份 ====================

    /**
     * 获取队列备份数据
     */
    async getQueueBackup(): Promise<QueueData | null> {
        try {
            // 🆕 使用 msgpack 格式加载
            const data = await this.loadMsgpackData<QueueData>(STORAGE_FILES.PRACTICE_QUEUE_BACKUP);
            if (data) {
                return data;
            }
        } catch (error) {
            logger.warn('Failed to load queue backup:', error);
        }
        return null;
    }

    /**
     * 保存队列备份数据
     */
    async setQueueBackup(data: QueueData): Promise<void> {
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.PRACTICE_QUEUE_BACKUP, data);
        logger.debug('Queue backup saved (msgpack)');
    }

    /**
     * 保存队列数据（版本 2 格式）
     */
    private async savePracticeQueueV2(data: QueueData): Promise<void> {
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.PRACTICE_QUEUE, data);
    }

    async readPluginFile(fileName: string): Promise<string | null> {
        return this.readPluginData(fileName);
    }

    async writePluginFile(fileName: string, content: string): Promise<void> {
        await this.writePluginData(fileName, content);
    }

    // ==================== 复习日志 ====================

    /**
     * 添加复习日志
     */
    async addReviewLog(log: ReviewLog): Promise<void> {
        const date = new Date(log.review);
        const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.json`;
        const filePath = `${STORAGE_FILES.LOGS_DIR}/${fileName}`;

        let logs: ReviewLog[] = [];
        try {
            const data = await this.readPluginData(filePath);
            if (data) {
                const parsed = JSON.parse(data);
                logs = Array.isArray(parsed) ? parsed : [];
            }
        } catch {
            // 文件不存在，创建新的
        }

        logs.push(log);
        await this.writePluginData(filePath, JSON.stringify(logs, null, 2));
    }

    async addRescheduleLog(log: RescheduleLog): Promise<void> {
        const date = new Date(log.ts);
        const fileName = `reschedule-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.json`;
        const filePath = `${STORAGE_FILES.LOGS_DIR}/${fileName}`;

        let logs: RescheduleLog[] = [];
        try {
            const data = await this.readPluginData(filePath);
            if (data) {
                const parsed = JSON.parse(data);
                logs = Array.isArray(parsed) ? parsed : [];
            }
        } catch {
        }

        logs.push(log);
        await this.writePluginData(filePath, JSON.stringify(logs, null, 2));
    }

    /**
     * 获取指定月份的复习日志
     */
    async getReviewLogs(year: number, month: number): Promise<ReviewLog[]> {
        const fileName = `${year}-${String(month).padStart(2, '0')}.json`;
        const filePath = `${STORAGE_FILES.LOGS_DIR}/${fileName}`;

        try {
            const data = await this.readPluginData(filePath);
            if (data) {
                const parsed = JSON.parse(data);
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch {
            // 文件不存在
        }
        return [];
    }

    /**
     * 获取所有复习日志（用于参数优化）
     * 遍历所有历史月份文件，直到找不到更多日志为止
     */
    async getAllReviewLogs(): Promise<ReviewLog[]> {
        const allLogs: ReviewLog[] = [];
        const now = new Date();
        let consecutiveEmptyMonths = 0;
        const MAX_EMPTY_MONTHS = 3; // 连续 3 个月没有日志就停止

        // 从当前月份开始，向前遍历所有月份
        for (let i = 0; ; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const logs = await this.getReviewLogs(date.getFullYear(), date.getMonth() + 1);

            if (logs.length > 0) {
                allLogs.push(...logs);
                consecutiveEmptyMonths = 0;
            } else {
                consecutiveEmptyMonths++;
                // 如果连续几个月都没有日志，就停止遍历
                if (consecutiveEmptyMonths >= MAX_EMPTY_MONTHS) {
                    break;
                }
            }

            // 安全限制：最多遍历 120 个月（10年）
            if (i >= 120) {
                logger.warn('Reached maximum month limit (120) for review logs');
                break;
            }
        }

        // 按时间排序（最新的在前）
        allLogs.sort((a, b) => b.review - a.review);

        logger.info('Loaded review logs:', {
            count: allLogs.length,
            months: Math.floor((now.getTime() - Date.UTC(now.getFullYear() - 10, 0, 1)) / (30 * 24 * 60 * 60 * 1000)),
        });
        return allLogs;
    }

    private normalizePracticeQueueItems(items: unknown[]): StoredQueueItem[] {
        return normalizeStoredQueueItems(items);
    }

    private parsePracticeQueuePayload(data: unknown): QueuePayload {
        if (Array.isArray(data)) {
            return {
                items: this.normalizePracticeQueueItems(data),
                lastAutoSortDay: '',
            };
        }

        if (isRecord(data)) {
            const items = Array.isArray(data.items) ? data.items : [];
            return {
                items: this.normalizePracticeQueueItems(items),
                lastAutoSortDay: String(data.lastAutoSortDay || ''),
            };
        }

        return {
            items: [],
            lastAutoSortDay: '',
        };
    }

    async loadPracticeQueue(): Promise<void> {
        try {
            const { data, source } = await this.loadWithLegacyFallback(
                STORAGE_FILES.PRACTICE_QUEUE,
                STORAGE_FILES.PRACTICE_QUEUE_JSON
            );

            if (source === 'none') {
                this.practiceQueue = [];
                this.practiceQueueLastAutoSortDay = '';
            } else {
                const parsed = this.parsePracticeQueuePayload(data);
                this.practiceQueue = parsed.items;
                this.practiceQueueLastAutoSortDay = parsed.lastAutoSortDay;
                logger.info(
                    `Loaded practice queue (${source === 'msgpack' ? 'msgpack' : 'JSON, will migrate'}): ${this.practiceQueue.length} items`
                );
            }
        } catch (err) {
            logger.warn('Failed to load practice queue:', err);
            this.practiceQueue = [];
            this.practiceQueueLastAutoSortDay = '';
        }
        await this.autoSortPracticeQueueIfNeeded();
    }

    private async savePracticeQueue(): Promise<void> {
        const payload = { items: this.practiceQueue, lastAutoSortDay: this.practiceQueueLastAutoSortDay };
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.PRACTICE_QUEUE, payload);
    }

    // ==================== 渐进学习队列 ====================

    private incrementalLearningQueue: StoredQueueItem[] = [];

    getIncrementalLearningQueue(): StoredQueueItem[] {
        return this.incrementalLearningQueue;
    }

    async setIncrementalLearningQueue(queue: StoredQueueItem[]): Promise<void> {
        this.incrementalLearningQueue = queue;
        await this.saveIncrementalLearningQueue();
    }

    async loadIncrementalLearningQueue(): Promise<void> {
        try {
            const { data, source } = await this.loadWithLegacyFallback(
                STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE,
                STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE_JSON
            );

            if (source === 'none') {
                this.incrementalLearningQueue = [];
            } else {
                this.incrementalLearningQueue = Array.isArray(data) ? normalizeStoredQueueItems(data) : [];
                logger.info(
                    `Loaded incremental learning queue (${source === 'msgpack' ? 'msgpack' : 'JSON, will migrate'}): ${this.incrementalLearningQueue.length} items`
                );
            }
        } catch (err) {
            logger.warn('Failed to load incremental learning queue:', err);
            this.incrementalLearningQueue = [];
        }
    }

    private async saveIncrementalLearningQueue(): Promise<void> {
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE, this.incrementalLearningQueue);
    }

    private async autoSortPracticeQueueIfNeeded(): Promise<void> {
        const today = new Date().toISOString().slice(0, 10);
        if (today === this.practiceQueueLastAutoSortDay) return;
        if (!Array.isArray(this.practiceQueue) || this.practiceQueue.length <= 1) {
            this.practiceQueueLastAutoSortDay = today;
            await this.savePracticeQueue();
            return;
        }
        const blockIds = this.practiceQueue
            .map((item) => resolveQueueItemBlockId(item))
            .filter(Boolean);
        const priMap = await this.getPrioritiesByBlockIDs(blockIds).catch(() => new Map<string, number>());
        const keyed = this.practiceQueue.map((item, idx) => {
            const bid = resolveQueueItemBlockId(item);
            const p = clampPriority(priMap.get(bid), DEFAULT_PRIORITY);
            return {
                item: { ...item, priority: p },
                idx,
                p,
            };
        });
        keyed.sort((a, b) => {
            if (a.p !== b.p) return a.p - b.p;
            return a.idx - b.idx;
        });
        this.practiceQueue = keyed.map((x) => x.item);
        this.practiceQueueLastAutoSortDay = today;
        await this.savePracticeQueue();
    }

    private async getPrioritiesByBlockIDs(blockIDs: string[]): Promise<Map<string, number>> {
        const ids = Array.from(new Set((blockIDs || []).map((x) => String(x || '')).filter(Boolean)));
        const out = new Map<string, number>();
        if (ids.length === 0) return out;
        for (let i = 0; i < ids.length; i += 200) {
            const batch = ids.slice(i, i + 200);
            const inList = batch.map((id) => `'${this.escapeSQL(id)}'`).join(',');
            const stmt = `SELECT block_id, value FROM attributes WHERE name = '${ATTR_PRIORITY}' AND block_id IN (${inList})`;
            const rows = await siyuanApi.sql(stmt).catch((): unknown[] => []);
            for (const row of normalizeAttributeRows(rows)) {
                const bid = String(row.block_id ?? row.blockId ?? '');
                if (!bid) continue;
                out.set(bid, clampPriority(row.value, DEFAULT_PRIORITY));
            }
        }
        return out;
    }

    private escapeSQL(value: string): string {
        return String(value || '').replace(/'/g, "''");
    }

    // ==================== 底层 API ====================

    /**
     * 读取插件数据
     */
    private async readPluginData(fileName: string): Promise<string | null> {
        const path = `${this.basePath}/${fileName}`;
        return await siyuanApi.getFile(path);
    }

    /**
     * 写入插件数据
     */
    private async writePluginData(fileName: string, content: string): Promise<void> {
        const path = `${this.basePath}/${fileName}`;
        await siyuanApi.putFile(path, content);
    }

    /**
     * 加载 JSON 数据
     */
    async loadData<T = unknown>(filename: string): Promise<T | null> {
        try {
            const content = await this.readPluginData(filename);
            if (!content) return null;

            return JSON.parse(content) as T;
        } catch (error) {
            logger.error(`Failed to load ${filename}:`, error);
            return null;
        }
    }

    /**
     * 保存 JSON 数据
     */
    async saveData<T = unknown>(filename: string, data: T): Promise<void> {
        try {
            const content = JSON.stringify(data, null, 2);
            await this.writePluginData(filename, content);
        } catch (error) {
            logger.error(`Failed to save ${filename}:`, error);
            throw error;
        }
    }

    // ==================== msgpack 存储方法 🆕 ====================

    /**
     * 加载 msgpack 数据
     */
    async loadMsgpackData<T = unknown>(filename: string): Promise<T | null> {
        try {
            const content = await this.readPluginData(filename);
            if (!content) return null;

            // msgpack 是二进制格式，需要从 Base64 解码
            const binaryString = atob(content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 使用 msgpack 解码
            return decode(bytes) as T;
        } catch (error) {
            // 特别处理 Base64 解码错误（文件损坏）
            if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
                logger.warn(`Corrupted msgpack file (invalid Base64): ${filename}, removing corrupted file`);
                try {
                    await siyuanApi.removeFile(`${this.basePath}/${filename}`);
                } catch (removeError) {
                    logger.warn(`Failed to remove corrupted msgpack file: ${filename}`, removeError);
                }
            } else {
                logger.error(`Failed to load msgpack ${filename}:`, error);
            }
            return null;
        }
    }

    /**
     * 保存 msgpack 数据
     */
    async saveMsgpackData<T = unknown>(filename: string, data: T): Promise<void> {
        try {
            // 使用 msgpack 编码
            const buffer = encode(data);
            
            // 将 Uint8Array 转换为 Base64 字符串
            let binaryString = '';
            for (let i = 0; i < buffer.length; i++) {
                binaryString += String.fromCharCode(buffer[i]);
            }
            const content = btoa(binaryString);
            
            await this.writePluginData(filename, content);
        } catch (error) {
            logger.error(`Failed to save msgpack ${filename}:`, error);
            throw error;
        }
    }

    /**
     * 迁移 JSON 数据到 msgpack 格式
     * 
     * 🆕 Phase 1.0.5: 数据迁移
     * 🆕 添加损坏文件检测和清理
     */
    async migrateToMsgpack(): Promise<void> {
        const migrations = [
            { from: STORAGE_FILES.CARDS_JSON, to: STORAGE_FILES.CARDS, name: 'cards' },
            { from: STORAGE_FILES.PRACTICE_QUEUE_JSON, to: STORAGE_FILES.PRACTICE_QUEUE, name: 'practice-queue' },
            { from: STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE_JSON, to: STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE, name: 'incremental-learning-queue' },
        ];

        let migratedCount = 0;
        let cleanedCount = 0;

        for (const { from, to, name } of migrations) {
            try {
                // 🆕 检查 msgpack 文件是否损坏
                const msgpackContent = await this.readPluginData(to);
                if (msgpackContent) {
                    try {
                        // 尝试解码，检查是否损坏
                        await this.loadMsgpackData(to);
                        continue; // 文件正常，跳过迁移
                    } catch (error) {
                        // 文件损坏，删除并重新迁移
                        logger.warn(`⚠️ Corrupted msgpack file detected: ${to}, will re-migrate`);
                        cleanedCount++;
                    }
                }

                // 读取 JSON 文件
                const jsonContent = await this.readPluginData(from);
                if (!jsonContent) {
                    // JSON 文件不存在
                    if (msgpackContent) {
                        // msgpack 损坏但 JSON 不存在，删除损坏的 msgpack 文件
                        logger.warn(`⚠️ No JSON backup found for corrupted ${to}, will start fresh`);
                        // 注意：我们不主动删除文件，只是让它在下次保存时被覆盖
                    } else {
                        logger.info(`No data files found for ${name}, will create on first save`);
                    }
                    continue;
                }

                const data = JSON.parse(jsonContent);

                // 保存为 msgpack
                await this.saveMsgpackData(to, data);

                migratedCount++;
                logger.info(`✅ Migrated ${name}: ${from} → ${to}`);

                // 可选：删除旧文件（暂时保留，以便回滚）
                // await siyuanApi.removeFile(`${this.basePath}/${from}`);
            } catch (error) {
                logger.error(`❌ Failed to migrate ${name}:`, error);
            }
        }

        if (migratedCount > 0 || cleanedCount > 0) {
            const messages = [];
            if (migratedCount > 0) {
                messages.push(`migrated ${migratedCount} files`);
            }
            if (cleanedCount > 0) {
                messages.push(`cleaned ${cleanedCount} corrupted files`);
            }
            logger.info(`🎉 Msgpack migration complete: ${messages.join(', ')}`);
        }
    }

    // ==================== 数据修复 ====================
    
    /**
     * 修复所有卡片的无效日期
     * 
     * 扫描所有卡片，修复以下问题：
     * - 无效的 lastReview 时间戳（NaN、负数、无效日期字符串）
     * - 无效的 due 时间戳
     * 
     * @returns 修复的卡片数量
     */
    async repairInvalidDates(): Promise<{ fixed: number; total: number }> {
        logger.info('🔧 Starting date repair...');
        
        let fixedCount = 0;
        const totalCount = this.cardsCache.size;
        const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
        
        for (const [cardId, card] of this.cardsCache.entries()) {
            let needsFix = false;
            
            // 检查 lastReview
            if (typeof card.lastReview === 'number') {
                // 修复无效时间戳：NaN、负数、或小于 2000-01-01 的值（如 0 或 "0001-01-01" 转换后的值）
                if (isNaN(card.lastReview) || card.lastReview < 0 || (card.lastReview > 0 && card.lastReview < MIN_VALID_TIMESTAMP)) {
                    logger.warn(`Fixing invalid lastReview for card ${cardId}: ${card.lastReview} -> 0`);
                    card.lastReview = 0;
                    needsFix = true;
                }
            } else if (card.lastReview !== undefined && card.lastReview !== null) {
                logger.warn(`Fixing non-numeric lastReview for card ${cardId}: ${typeof card.lastReview} -> 0`);
                card.lastReview = 0;
                needsFix = true;
            }
            
            // 检查 due
            if (typeof card.due === 'number') {
                // 修复无效时间戳：NaN、负数、或小于 2000-01-01 的值
                if (isNaN(card.due) || card.due < 0 || (card.due > 0 && card.due < MIN_VALID_TIMESTAMP)) {
                    logger.warn(`Fixing invalid due for card ${cardId}: ${card.due} -> ${Date.now()}`);
                    card.due = Date.now();
                    needsFix = true;
                }
            } else if (card.due !== undefined && card.due !== null) {
                logger.warn(`Fixing non-numeric due for card ${cardId}: ${typeof card.due} -> ${Date.now()}`);
                card.due = Date.now();
                needsFix = true;
            }
            
            if (needsFix) {
                card.updatedAt = Date.now();
                this.cardsCache.set(cardId, card);
                fixedCount++;
            }
        }
        
        if (fixedCount > 0) {
            logger.info(`🔧 Fixed ${fixedCount} cards, saving...`);
            this.isDirty = true;
            await this.saveCards();
        } else {
            logger.info('✅ No invalid dates found');
        }
        
        return { fixed: fixedCount, total: totalCount };
    }
}

