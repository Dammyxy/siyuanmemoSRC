/**
 * Storage Manager
 * 统一管理插件数据的存储和读取
 * 采用混合方案：块属性 + 独立存储
 */

import type { FSRSCard, ReviewLog, PluginSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

/** 块属性前缀 */
export const BLOCK_ATTR_PREFIX = 'custom-fsrs-';
export const ATTR_CARD_ID = `${BLOCK_ATTR_PREFIX}card-id`;

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
    private pluginName: string;
    private cardsCache: Map<string, FSRSCard> = new Map();
    private settings: PluginSettings = DEFAULT_SETTINGS;
    private isDirty: boolean = false;

    constructor(pluginName: string) {
        this.pluginName = pluginName;
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
        return this.getAllCards().filter(card => card.due <= nowMs);
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

    // ==================== 底层 API ====================

    /**
     * 读取插件数据
     */
    private async readPluginData(fileName: string): Promise<string | null> {
        // TODO: 调用思源 API
        // return await fetch(`/api/file/getFile`, { ... })
        return null;
    }

    /**
     * 写入插件数据
     */
    private async writePluginData(fileName: string, content: string): Promise<void> {
        // TODO: 调用思源 API
        // await fetch(`/api/file/putFile`, { ... })
    }

    /**
     * 设置块属性
     */
    async setBlockAttr(blockId: string, attrs: Record<string, string>): Promise<void> {
        // TODO: 调用思源 API
        // await fetch(`/api/attr/setBlockAttrs`, { ... })
    }

    /**
     * 获取块属性
     */
    async getBlockAttr(blockId: string): Promise<Record<string, string>> {
        // TODO: 调用思源 API
        // return await fetch(`/api/attr/getBlockAttrs`, { ... })
        return {};
    }
}
