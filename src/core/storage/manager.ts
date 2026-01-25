/**
 * Storage Manager
 * 统一管理插件数据的存储和读取
 * 采用混合方案：块属性 + 独立存储
 */

import type { FSRSCard, ReviewLog, PluginSettings, RescheduleLog } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as siyuanApi from '@/core/siyuan/api';
import { ATTR_PRIORITY } from '@/core/siyuan/block';
import { clampPriority, DEFAULT_PRIORITY } from '@/core/queue/abstraction/IPriority';

/** 存储文件名 */
const STORAGE_FILES = {
    CARDS: 'cards.json',
    SETTINGS: 'settings.json',
    LOGS_DIR: 'logs',
    PRACTICE_QUEUE: 'practice-queue.json',
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

    constructor(pluginName: string) {
        this.basePath = siyuanApi.getPluginDataPath(pluginName);
    }

    /**
     * 初始化存储，加载数据到内存
     */
    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadCards();
        await this.loadPracticeQueue();
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
     */
    private async loadCards(): Promise<void> {
        try {
            const data = await this.readPluginData(STORAGE_FILES.CARDS);
            if (data) {
                const cards: FSRSCard[] = JSON.parse(data);
                this.cardsCache.clear();
                for (const card of cards) {
                    this.cardsCache.set(card.id, card);
                }
                console.log(`[FSRS] Loaded ${cards.length} cards`);
            }
        } catch (err) {
            console.warn('[FSRS] Failed to load cards:', err);
        }
    }

    /**
     * 保存卡片（批量）
     */
    async saveCards(): Promise<void> {
        if (!this.isDirty) return;

        const cards = this.getAllCards();
        await this.writePluginData(STORAGE_FILES.CARDS, JSON.stringify(cards, null, 2));
        this.isDirty = false;
        console.log(`[FSRS] Saved ${cards.length} cards`);
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
     */
    async getAllReviewLogs(): Promise<ReviewLog[]> {
        // TODO: 遍历所有月份文件
        const allLogs: ReviewLog[] = [];
        const now = new Date();

        // 获取最近 12 个月的日志
        for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const logs = await this.getReviewLogs(date.getFullYear(), date.getMonth() + 1);
            allLogs.push(...logs);
        }

        return allLogs;
    }

    private async loadPracticeQueue(): Promise<void> {
        try {
            const data = await this.readPluginData(STORAGE_FILES.PRACTICE_QUEUE);
            if (data) {
                const parsed = JSON.parse(data);
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
        await this.writePluginData(STORAGE_FILES.PRACTICE_QUEUE, JSON.stringify(payload, null, 2));
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
}
