/**
 * Storage Manager
 * 统一管理插件数据的存储和读取
 * 采用混合方案：块属性 + 独立存储
 * 
 * 🆕 使用 msgpack 格式存储（性能更好，避免同步问题）
 */

import type { FSRSCard, ReviewLog, PluginSettings, RescheduleLog } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RIFF_CONFIG, type RiffIntegrationConfig } from '@/types';
import { CardType } from '@/types/card';
import * as siyuanApi from '@/core/siyuan/api';
import { ATTR_PRIORITY } from '@/core/siyuan/block';
import { clampPriority, DEFAULT_PRIORITY } from '@/core/queue/abstraction/IPriority';
import type { QueueData } from '@/core/queue/strategies/QueueMigrationManager';
import { encode, decode } from '@msgpack/msgpack';
import { migrateCard } from '@/utils/cardMigration';

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
    RIFF_BLACKLIST: 'riff-blacklist.msgpack',
    RIFF_BLACKLIST_JSON: 'riff-blacklist.json',
};

/**
 * 存储管理器类
 */
export class StorageManager {
    private basePath: string;
    private cardsCache: Map<string, FSRSCard> = new Map();
    private settings: PluginSettings = DEFAULT_SETTINGS;
    private isDirty: boolean = false;
    private practiceQueue: any[] = [];
    private practiceQueueLastAutoSortDay = '';
    private riffBlacklist: Set<string> = new Set();

    constructor(pluginName: string) {
        this.basePath = siyuanApi.getPluginDataPath(pluginName);
    }

    /**
     * 初始化存储，加载数据到内存
     */
    async init(): Promise<void> {
        // 🆕 首次运行时迁移 JSON 数据到 msgpack
        await this.migrateToMsgpack();
        
        await this.loadSettings();
        await this.loadCards();
        await this.loadPracticeQueue();
        await this.loadIncrementalLearningQueue();
        await this.loadRiffBlacklist();
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
                const dq = (this.settings as any)?.queues?.defaultQueue;
                if (dq === 'deliberate') (this.settings as any).queues.defaultQueue = 'final-drill';
                if (dq === 'neural-wandering') (this.settings as any).queues.defaultQueue = 'neural-roam';
            }
        } catch (err) {
            console.warn('[FSRS] Failed to load settings, using defaults:', err);
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
     * 获取到期卡片
     */
    getDueCards(now: Date = new Date()): FSRSCard[] {
        const nowMs = now.getTime();
        return this.getAllCards().filter(card =>
            card.due <= nowMs &&
            !card.skipped &&
            (!card.skipUntil || card.skipUntil <= nowMs)
        );
    }

    /**
     * 加载卡片
     * 
     * 🔧 自动规范化混合类型数据
     */
    private async loadCards(): Promise<void> {
        try {
            // 🆕 优先加载 msgpack 格式
            const data = await this.loadMsgpackData(STORAGE_FILES.CARDS);
            if (data) {
                const cards: FSRSCard[] = Array.isArray(data) ? data : [];
                this.cardsCache.clear();
                
                // 🔧 规范化每张卡片
                let normalizedCount = 0;
                for (const card of cards) {
                    const normalizedCard = this.normalizeCard(card);
                    this.cardsCache.set(normalizedCard.id, normalizedCard);
                    
                    // 检查是否进行了规范化
                    if (this.wasCardNormalized(card, normalizedCard)) {
                        normalizedCount++;
                    }
                }
                
                console.log(`[FSRS] Loaded ${cards.length} cards (msgpack)`);
                
                // 如果有卡片被规范化，保存到磁盘
                if (normalizedCount > 0) {
                    console.log(`[FSRS] 🔧 Normalized ${normalizedCount} mixed-type cards, saving...`);
                    this.isDirty = true;
                    await this.saveCards();
                }
                
                return;
            }

            // 后备：尝试加载 JSON 格式（向后兼容）
            const jsonData = await this.readPluginData(STORAGE_FILES.CARDS_JSON);
            if (jsonData) {
                const cards: FSRSCard[] = JSON.parse(jsonData);
                this.cardsCache.clear();
                
                // 🔧 规范化每张卡片
                let normalizedCount = 0;
                for (const card of cards) {
                    const normalizedCard = this.normalizeCard(card);
                    this.cardsCache.set(normalizedCard.id, normalizedCard);
                    
                    if (this.wasCardNormalized(card, normalizedCard)) {
                        normalizedCount++;
                    }
                }
                
                console.log(`[FSRS] Loaded ${cards.length} cards (JSON, will migrate to msgpack)`);
                
                // 如果有卡片被规范化，保存到磁盘
                if (normalizedCount > 0) {
                    console.log(`[FSRS] 🔧 Normalized ${normalizedCount} mixed-type cards, saving...`);
                    this.isDirty = true;
                    await this.saveCards();
                }
            }
        } catch (err) {
            console.warn('[FSRS] Failed to load cards:', err);
        }
    }
    
    /**
     * 规范化卡片数据
     * 
     * 将混合类型的卡片转换为纯 FSRSCard 格式：
     * - 移除 QueueItem 特有字段（deckID）
     * - 统一使用小写字段（blockId, cardId）
     * - 填充缺失的扩展字段
     * 
     * 🔧 注意：type 字段需要从块属性读取，不能随意填充默认值
     * 如果卡片没有 type 字段，保持 undefined，等待从块属性读取
     */
    private normalizeCard(card: any): FSRSCard {
        // 处理大小写变体
        const id = card.id || card.cardID || card.cardId;
        const blockId = card.blockId || card.blockID;
        
        // 构造纯 FSRSCard（移除 QueueItem 字段）
        const normalized: FSRSCard = {
            // 标识字段
            id: String(id || blockId),
            blockId: String(blockId || id),
            
            // FSRS 核心字段
            due: card.due ?? Date.now(),
            state: card.state ?? 0,
            stability: card.stability ?? 0,
            difficulty: card.difficulty ?? 0,
            reps: card.reps ?? 0,
            lapses: card.lapses ?? 0,
            lastReview: card.lastReview ?? 0,
            elapsedDays: card.elapsedDays ?? 0,
            scheduledDays: card.scheduledDays ?? 0,
            
            // 扩展字段（填充默认值）
            priority: card.priority ?? 50,
            // ✅ 修复：为 null/undefined 提供默认值 CardType.Item
            type: card.type ?? CardType.Item,
            tags: card.tags ?? [],
            leechCount: card.leechCount ?? 0,
            isLeech: card.isLeech ?? false,
            skipped: card.skipped ?? false,
            
            // 元数据
            createdAt: card.createdAt ?? Date.now(),
            updatedAt: card.updatedAt ?? Date.now(),
            
            // 保留其他字段（但不包括 deckID）
            ...(card.schedulerType && { schedulerType: card.schedulerType }),
            ...(card.syncToRiff !== undefined && { syncToRiff: card.syncToRiff }),
            ...(card.riffCardId && { riffCardId: card.riffCardId }),
            ...(card.skipUntil && { skipUntil: card.skipUntil }),
            ...(card.meta && { meta: card.meta }),
            
            // 🆕 保留 SuperMemo 重新调度字段（如果存在）
            ...(card.postponeCount !== undefined && { postponeCount: card.postponeCount }),
            ...(card.lastPostponeDate !== undefined && { lastPostponeDate: card.lastPostponeDate }),
            ...(card.rescheduleHistory !== undefined && { rescheduleHistory: card.rescheduleHistory }),
        };
        
        // ✅ 应用迁移逻辑：确保所有必需字段存在（learning_step、postponeCount、rescheduleHistory）
        return migrateCard(normalized);
    }
    
    /**
     * 检查卡片是否被规范化
     * 
     * 判断依据：
     * - 原卡片有 deckID 字段（QueueItem 特征）
     * - 原卡片使用大写字段（blockID, cardID）
     * - 原卡片缺少扩展字段
     */
    private wasCardNormalized(original: any, normalized: FSRSCard): boolean {
        // 检查是否有 QueueItem 特征
        const hadDeckID = 'deckID' in original;
        
        // 检查是否使用大写字段
        const hadUpperCase = ('blockID' in original) || ('cardID' in original);
        
        // 检查是否缺少扩展字段
        const lackedExtendedFields = 
            !('priority' in original) ||
            !('type' in original) ||
            !('tags' in original);
        
        return hadDeckID || hadUpperCase || lackedExtendedFields;
    }

    /**
     * 保存卡片（批量）
     */
    async saveCards(): Promise<void> {
        if (!this.isDirty) return;

        const cards = this.getAllCards();
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.CARDS, cards);
        this.isDirty = false;
        console.log(`[FSRS] Saved ${cards.length} cards (msgpack)`);
    }

    getPracticeQueue(): any[] {
        return this.practiceQueue;
    }

    async setPracticeQueue(queue: any[]): Promise<void> {
        this.practiceQueue = queue;
        await this.savePracticeQueue();
    }

    async addPracticeQueue(cards: any[]): Promise<number> {
        const existing = new Set(this.practiceQueue.map(card => card.cardID));
        let added = 0;
        for (const card of cards) {
            if (!card?.cardID || existing.has(card.cardID)) {
                continue;
            }
            existing.add(card.cardID);
            if (!Number.isFinite(Number(card?.priority))) {
                card.priority = DEFAULT_PRIORITY;
            }
            this.practiceQueue.push(card);
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
            const data = await this.loadMsgpackData(STORAGE_FILES.PRACTICE_QUEUE_BACKUP);
            if (data) {
                return data as QueueData;
            }
        } catch (error) {
            console.warn('[StorageManager] Failed to load queue backup:', error);
        }
        return null;
    }

    /**
     * 保存队列备份数据
     */
    async setQueueBackup(data: QueueData): Promise<void> {
        // 🆕 使用 msgpack 格式保存
        await this.saveMsgpackData(STORAGE_FILES.PRACTICE_QUEUE_BACKUP, data);
        console.debug('[StorageManager] Queue backup saved (msgpack)');
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
                console.warn('[StorageManager] Reached maximum month limit (120) for review logs');
                break;
            }
        }

        // 按时间排序（最新的在前）
        allLogs.sort((a, b) => b.review - a.review);

        console.log('[StorageManager] Loaded', allLogs.length, 'review logs from', Math.floor((now.getTime() - Date.UTC(now.getFullYear() - 10, 0, 1)) / (30 * 24 * 60 * 60 * 1000)), 'months');
        return allLogs;
    }

    private async loadPracticeQueue(): Promise<void> {
        try {
            // 🆕 优先加载 msgpack 格式
            const data = await this.loadMsgpackData(STORAGE_FILES.PRACTICE_QUEUE);
            if (data) {
                if (Array.isArray(data)) {
                    this.practiceQueue = data.map((x) => ({
                        ...(x as any),
                        priority: Number.isFinite(Number((x as any)?.priority)) ? Number((x as any).priority) : DEFAULT_PRIORITY,
                    }));
                    this.practiceQueueLastAutoSortDay = '';
                } else if (data && typeof data === 'object') {
                    const items = Array.isArray((data as any).items) ? (data as any).items : [];
                    this.practiceQueue = items.map((x: any) => ({
                        ...(x as any),
                        priority: Number.isFinite(Number((x as any)?.priority)) ? Number((x as any).priority) : DEFAULT_PRIORITY,
                    }));
                    this.practiceQueueLastAutoSortDay = String((data as any).lastAutoSortDay || '');
                } else {
                    this.practiceQueue = [];
                    this.practiceQueueLastAutoSortDay = '';
                }
                console.log(`[FSRS] Loaded practice queue (msgpack): ${this.practiceQueue.length} items`);
                await this.autoSortPracticeQueueIfNeeded();
                return;
            }

            // 后备：尝试加载 JSON 格式
            const jsonData = await this.readPluginData(STORAGE_FILES.PRACTICE_QUEUE_JSON);
            if (jsonData) {
                const parsed = JSON.parse(jsonData);
                if (Array.isArray(parsed)) {
                    this.practiceQueue = parsed.map((x) => ({
                        ...(x as any),
                        priority: Number.isFinite(Number((x as any)?.priority)) ? Number((x as any).priority) : DEFAULT_PRIORITY,
                    }));
                    this.practiceQueueLastAutoSortDay = '';
                } else if (parsed && typeof parsed === 'object') {
                    const items = Array.isArray((parsed as any).items) ? (parsed as any).items : [];
                    this.practiceQueue = items.map((x: any) => ({
                        ...(x as any),
                        priority: Number.isFinite(Number((x as any)?.priority)) ? Number((x as any).priority) : DEFAULT_PRIORITY,
                    }));
                    this.practiceQueueLastAutoSortDay = String((parsed as any).lastAutoSortDay || '');
                } else {
                    this.practiceQueue = [];
                    this.practiceQueueLastAutoSortDay = '';
                }
                console.log(`[FSRS] Loaded practice queue (JSON, will migrate): ${this.practiceQueue.length} items`);
            } else {
                this.practiceQueue = [];
                this.practiceQueueLastAutoSortDay = '';
            }
        } catch (err) {
            console.warn('[FSRS] Failed to load practice queue:', err);
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

    private incrementalLearningQueue: any[] = [];

    getIncrementalLearningQueue(): any[] {
        return this.incrementalLearningQueue;
    }

    async setIncrementalLearningQueue(queue: any[]): Promise<void> {
        this.incrementalLearningQueue = queue;
        await this.saveIncrementalLearningQueue();
    }

    private async loadIncrementalLearningQueue(): Promise<void> {
        try {
            // 🆕 优先加载 msgpack 格式
            const data = await this.loadMsgpackData(STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE);
            if (data) {
                this.incrementalLearningQueue = Array.isArray(data) ? data : [];
                console.log(`[FSRS] Loaded incremental learning queue (msgpack): ${this.incrementalLearningQueue.length} items`);
                return;
            }

            // 后备：尝试加载 JSON 格式
            const jsonData = await this.readPluginData(STORAGE_FILES.INCREMENTAL_LEARNING_QUEUE_JSON);
            if (jsonData) {
                const parsed = JSON.parse(jsonData);
                this.incrementalLearningQueue = Array.isArray(parsed) ? parsed : [];
                console.log(`[FSRS] Loaded incremental learning queue (JSON, will migrate): ${this.incrementalLearningQueue.length} items`);
            } else {
                this.incrementalLearningQueue = [];
            }
        } catch (err) {
            console.warn('[FSRS] Failed to load incremental learning queue:', err);
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
            .map((x) => String((x as any)?.blockID || (x as any)?.blockId || ''))
            .filter(Boolean);
        const priMap = await this.getPrioritiesByBlockIDs(blockIds).catch(() => new Map<string, number>());
        const keyed = this.practiceQueue.map((it, idx) => {
            const bid = String((it as any)?.blockID || (it as any)?.blockId || '');
            const p = clampPriority(priMap.get(bid), DEFAULT_PRIORITY);
            (it as any).priority = p;
            return { it, idx, p };
        });
        keyed.sort((a, b) => {
            if (a.p !== b.p) return a.p - b.p;
            return a.idx - b.idx;
        });
        this.practiceQueue = keyed.map((x) => x.it);
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
            const rows = await siyuanApi.sql(stmt).catch(() => []);
            for (const r of rows as any[]) {
                const bid = String(r?.block_id || r?.blockId || '');
                if (!bid) continue;
                out.set(bid, clampPriority(r?.value, DEFAULT_PRIORITY));
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
    async loadData(filename: string): Promise<any> {
        try {
            const content = await this.readPluginData(filename);
            if (!content) return null;

            return JSON.parse(content);
        } catch (error) {
            console.error(`[StorageManager] Failed to load ${filename}:`, error);
            return null;
        }
    }

    /**
     * 保存 JSON 数据
     */
    async saveData(filename: string, data: any): Promise<void> {
        try {
            const content = JSON.stringify(data, null, 2);
            await this.writePluginData(filename, content);
        } catch (error) {
            console.error(`[StorageManager] Failed to save ${filename}:`, error);
            throw error;
        }
    }

    // ==================== msgpack 存储方法 🆕 ====================

    /**
     * 加载 msgpack 数据
     */
    async loadMsgpackData(filename: string): Promise<any> {
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
            return decode(bytes);
        } catch (error) {
            // 特别处理 Base64 解码错误（文件损坏）
            if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
                console.warn(`[StorageManager] Corrupted msgpack file (invalid Base64): ${filename}`);
            } else {
                console.error(`[StorageManager] Failed to load msgpack ${filename}:`, error);
            }
            return null;
        }
    }

    /**
     * 保存 msgpack 数据
     */
    async saveMsgpackData(filename: string, data: any): Promise<void> {
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
            console.error(`[StorageManager] Failed to save msgpack ${filename}:`, error);
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
            { from: STORAGE_FILES.RIFF_BLACKLIST_JSON, to: STORAGE_FILES.RIFF_BLACKLIST, name: 'riff-blacklist' },
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
                        console.warn(`[StorageManager] ⚠️ Corrupted msgpack file detected: ${to}, will re-migrate`);
                        cleanedCount++;
                    }
                }

                // 读取 JSON 文件
                const jsonContent = await this.readPluginData(from);
                if (!jsonContent) {
                    // JSON 文件不存在
                    if (msgpackContent) {
                        // msgpack 损坏但 JSON 不存在，删除损坏的 msgpack 文件
                        console.warn(`[StorageManager] ⚠️ No JSON backup found for corrupted ${to}, will start fresh`);
                        // 注意：我们不主动删除文件，只是让它在下次保存时被覆盖
                    } else {
                        console.log(`[StorageManager] No data files found for ${name}, will create on first save`);
                    }
                    continue;
                }

                const data = JSON.parse(jsonContent);

                // 保存为 msgpack
                await this.saveMsgpackData(to, data);

                migratedCount++;
                console.log(`[StorageManager] ✅ Migrated ${name}: ${from} → ${to}`);

                // 可选：删除旧文件（暂时保留，以便回滚）
                // await siyuanApi.removeFile(`${this.basePath}/${from}`);
            } catch (error) {
                console.error(`[StorageManager] ❌ Failed to migrate ${name}:`, error);
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
            console.log(`[StorageManager] 🎉 Msgpack migration complete: ${messages.join(', ')}`);
        }
    }

    // ==================== Riff Blacklist ====================

    /**
     * Add block ID to Riff blacklist
     */
    addToRiffBlacklist(blockID: string): void {
        this.riffBlacklist.add(blockID);
        void this.saveRiffBlacklist();
    }

    /**
     * Remove block ID from Riff blacklist
     */
    removeFromRiffBlacklist(blockID: string): void {
        this.riffBlacklist.delete(blockID);
        void this.saveRiffBlacklist();
    }

    /**
     * Check if block ID is in blacklist
     */
    isInRiffBlacklist(blockID: string): boolean {
        return this.riffBlacklist.has(blockID);
    }

    /**
     * Get blacklist (returns a copy)
     */
    getRiffBlacklist(): Set<string> {
        return new Set(this.riffBlacklist);
    }

    /**
     * Clear blacklist
     */
    async clearRiffBlacklist(): Promise<void> {
        this.riffBlacklist.clear();
        await this.saveRiffBlacklist();
    }

    /**
     * Load blacklist from file
     */
    private async loadRiffBlacklist(): Promise<void> {
        try {
            // 🆕 优先加载 msgpack 格式
            const data = await this.loadMsgpackData(STORAGE_FILES.RIFF_BLACKLIST);
            if (data) {
                this.riffBlacklist = new Set(Array.isArray(data) ? data : []);
                console.log('[StorageManager] Loaded Riff blacklist (msgpack):', this.riffBlacklist.size);
                return;
            }

            // 后备：尝试加载 JSON 格式
            const jsonData = await this.readPluginData(STORAGE_FILES.RIFF_BLACKLIST_JSON);
            if (jsonData) {
                const parsed = JSON.parse(jsonData);
                this.riffBlacklist = new Set(Array.isArray(parsed) ? parsed : []);
                console.log('[StorageManager] Loaded Riff blacklist (JSON, will migrate):', this.riffBlacklist.size);
            } else {
                this.riffBlacklist = new Set();
            }
        } catch (err) {
            console.warn('[StorageManager] Failed to load Riff blacklist:', err);
            this.riffBlacklist = new Set();
        }
    }

    /**
     * Save blacklist to file
     */
    private async saveRiffBlacklist(): Promise<void> {
        try {
            const data = Array.from(this.riffBlacklist);
            // 🆕 使用 msgpack 格式保存
            await this.saveMsgpackData(STORAGE_FILES.RIFF_BLACKLIST, data);
            console.log('[StorageManager] Saved Riff blacklist (msgpack):', data.length);
        } catch (err) {
            console.error('[StorageManager] Failed to save Riff blacklist:', err);
        }
    }
}
