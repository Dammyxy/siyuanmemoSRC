/**
 * Storage Manager
 * 统一管理插件数据的存储和读取
 * 采用混合方案：块属性 + 独立存储
 */

import type { FSRSCard, ReviewLog, PluginSettings, RescheduleLog } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as siyuanApi from '@/core/siyuan/api';

/** 存储文件名 */
const STORAGE_FILES = {
    CARDS: 'cards.json',
    SETTINGS: 'settings.json',
    LOGS_DIR: 'logs',
};

/**
 * 存储管理器类
 */
export class StorageManager {
    private basePath: string;
    private cardsCache: Map<string, FSRSCard> = new Map();
    private settings: PluginSettings = DEFAULT_SETTINGS;
    private isDirty: boolean = false;

    constructor(pluginName: string) {
        this.basePath = siyuanApi.getPluginDataPath(pluginName);
    }

    /**
     * 初始化存储，加载数据到内存
     */
    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadCards();
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

    async readPluginFile(fileName: string): Promise<string | null> {
        return this.readPluginData(fileName);
    }

    async writePluginFile(fileName: string, content: string): Promise<void> {
        await this.writePluginData(fileName, content);
    }

    // ==================== 调度日志 ====================

    /**
     * 添加调度日志
     */
    async addRescheduleLog(log: RescheduleLog): Promise<void> {
        const date = new Date(log.ts);
        const fileName = `scheduler-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.json`;
        const filePath = `${STORAGE_FILES.LOGS_DIR}/${fileName}`;

        let logs: RescheduleLog[] = [];
        try {
            const data = await this.readPluginData(filePath);
            if (data) {
                logs = JSON.parse(data);
            }
        } catch {
            // 文件不存在
        }

        logs.push(log);
        await this.writePluginData(filePath, JSON.stringify(logs, null, 2));
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
                logs = JSON.parse(data);
            }
        } catch {
            // 文件不存在，创建新的
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
                return JSON.parse(data);
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
