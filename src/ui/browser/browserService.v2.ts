/**
 * 卡片浏览器数据服务 v2
 * 
 * 重构版本：使用统一数据源架构
 * - 使用 UnifiedDataSourceManager 获取卡片数据
 * - 使用 StorageManager 进行批量操作
 * - 移除直接调用 Riff API
 * 
 * @see RIFF_API_USAGE_AUDIT.md
 */

import type { Plugin } from 'siyuan';
import type { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { PerformanceMonitor } from '@/utils/performance';
import { getCurrentDayEnd } from '@/utils/dateUtils';
import { getDayStartHour } from '@/utils/configUtils';
import { sql, setBlockAttrs } from '@/core/siyuan/api';
import {
    ATTR_CARD_ID,
    ATTR_PRIORITY,
    ATTR_SUSPENDED,
    ATTR_CARD_TYPE,
    ATTR_A_FACTOR
} from '@/core/siyuan/block';
import { batchDetectCardType, initializeAFactor } from '@/core/card-builder';
import {
    type BrowserCard,
    CardState,
    STATE_LABELS,
    calculateRetrievability,
    formatDueDate,
    formatHistoryDate,
    truncateContent
} from './types';

// ============================================================================
// 缓存层实现
// ============================================================================

type OnCacheUpdate = (cards: BrowserCard[], isComplete: boolean) => void;
const listeners = new Set<OnCacheUpdate>();

/**
 * 订阅缓存更新事件（用于渐进式加载）
 */
export function subscribeCacheUpdate(callback: OnCacheUpdate) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function notifyUpdate(cards: BrowserCard[], isComplete: boolean) {
    listeners.forEach(cb => {
        try {
            cb(cards, isComplete);
        } catch (e) {
            console.error('[CardBrowser] Listener error:', e);
        }
    });
}

interface CacheEntry {
    cards: BrowserCard[];
    timestamp: number;
    blockIdSet: Set<string>;
    isComplete: boolean;
}

/**
 * 卡片缓存管理器
 */
class CardCacheManager {
    private cache: CacheEntry | null = null;
    private readonly TTL = 0;  // 禁用缓存，数据始终最新
    private loading: Promise<BrowserCard[]> | null = null;

    get(): BrowserCard[] | null {
        if (!this.cache) return null;
        if (Date.now() - this.cache.timestamp > this.TTL) {
            return null;
        }
        return this.cache.cards;
    }

    set(cards: BrowserCard[], isComplete = true): void {
        this.cache = {
            cards,
            timestamp: Date.now(),
            blockIdSet: new Set(cards.map(c => c.blockId)),
            isComplete
        };
    }

    clear(): void {
        this.cache = null;
    }

    getStats(): { count: number; age: number; valid: boolean } {
        if (!this.cache) {
            return { count: 0, age: 0, valid: false };
        }
        const age = Date.now() - this.cache.timestamp;
        return {
            count: this.cache.cards.length,
            age,
            valid: age <= this.TTL
        };
    }

    setLoadingPromise(promise: Promise<BrowserCard[]> | null): void {
        this.loading = promise;
    }

    getLoadingPromise(): Promise<BrowserCard[]> | null {
        return this.loading;
    }
}

const cardCache = new CardCacheManager();

// ============================================================================
// 数据转换层
// ============================================================================

/**
 * 将 FSRSCard 转换为 BrowserCard
 */
function transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    // 计算经过天数
    const elapsedDays = card.lastReview 
        ? Math.floor((Date.now() - card.lastReview) / (1000 * 60 * 60 * 24))
        : 0;
    
    // 计算 Retrievability
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    
    // 转换卡片状态
    const state = card.state as CardState;
    
    // 将时间戳转换为 Date 对象
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    // 格式化日期
    const dueFormatted = formatDueDate(dueDate);
    const lastReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    const firstReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    
    // 从 meta 字段获取内容
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    
    // 从 meta 字段获取 deckId 和 rootId
    const deckId = (card.meta?.deckId as string) || '';
    const rootId = (card.meta?.rootId as string) || '';
    
    // 转换 CardType
    const cardType = card.type as 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
    
    return {
        id: card.id,
        fsrsCardId: card.id,
        blockId: card.blockId,
        deckId,
        rootId,
        content,
        fullContent,
        
        state,
        stateLabel: STATE_LABELS[state] || '未知',
        due: dueDate,
        dueFormatted,
        stability: card.stability,
        difficulty: card.difficulty,
        retrievability,
        reps: card.reps,
        lapses: card.lapses,
        elapsedDays,
        scheduledDays: card.scheduledDays || 0,
        lastReview: lastReviewDate,
        lastReviewFormatted,
        
        interval: card.scheduledDays || 0,
        firstReview: lastReviewDate,
        firstReviewFormatted,
        
        priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
        suspended: customAttrs[ATTR_SUSPENDED] === 'true',
        
        cardType: (customAttrs[ATTR_CARD_TYPE] as 'topic' | 'item' | undefined) || cardType as any,
        aFactor: parseFloat(customAttrs[ATTR_A_FACTOR] || '') || undefined,
        
        tags: [],  // 将在后续步骤中填充
    };
}

// ============================================================================
// 数据加载层（使用统一数据源）
// ============================================================================

/**
 * 加载所有卡片（使用统一数据源）
 */
async function loadAllCardsRaw(
    unifiedDataSourceManager: UnifiedDataSourceManager,
    forceRefresh = false
): Promise<BrowserCard[]> {
    return PerformanceMonitor.measure('loadAllCardsRaw', async () => {
        // 检查缓存
        if (!forceRefresh) {
            const cached = cardCache.get();
            if (cached) {
                console.log('[CardBrowser] 命中缓存，返回', cached.length, '张卡片');
                return cached;
            }

            const loadingPromise = cardCache.getLoadingPromise();
            if (loadingPromise) {
                console.log('[CardBrowser] 等待并发加载完成...');
                return loadingPromise;
            }
        }

        console.log('[CardBrowser] 开始加载卡片数据（使用统一数据源）...');
        const startTime = Date.now();

        const loadPromise = (async () => {
            try {
                // ✅ 使用统一数据源获取所有卡片
                const router = unifiedDataSourceManager.getRouter();
                const fsrsCards = await router.getCards();
                
                if (fsrsCards.length === 0) {
                    cardCache.set([]);
                    notifyUpdate([], true);
                    return [];
                }

                const blockIds = fsrsCards.map(c => c.blockId).filter(Boolean);
                console.log('[CardBrowser] 获取到', blockIds.length, '张卡片，开始加载属性...');

                // 分批加载属性
                const cards: BrowserCard[] = [];
                const BATCH_SIZE = 500;
                
                for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
                    const batchIds = blockIds.slice(i, i + BATCH_SIZE);
                    const batchCards = fsrsCards.slice(i, i + BATCH_SIZE);
                    
                    const { attrsMap, rootIdMap, tagsMap } = await fetchBlockInfoBatched(batchIds);
                    
                    const batchBrowserCards: BrowserCard[] = batchCards.map((card) => {
                        const customAttrs = attrsMap.get(card.blockId) || {};
                        const browserCard = transformFSRSCard(card, customAttrs);
                        browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
                        browserCard.tags = tagsMap.get(card.blockId) || [];
                        return browserCard;
                    });
                    
                    cards.push(...batchBrowserCards);
                    const isComplete = cards.length >= fsrsCards.length;
                    
                    cardCache.set(cards, isComplete);
                    notifyUpdate(cards, isComplete);
                }

                const elapsed = Date.now() - startTime;
                console.log(`[CardBrowser] ✅ 加载完成，共 ${cards.length} 张卡片，耗时 ${elapsed}ms`);
                
                return cards;
            } catch (err) {
                console.error('[CardBrowser] 加载卡片失败:', err);
                return [];
            } finally {
                cardCache.setLoadingPromise(null);
            }
        })();

        cardCache.setLoadingPromise(loadPromise);
        return loadPromise;
    });
}

/**
 * 合并查询：一次性获取块信息和属性
 */
async function fetchBlockInfoBatched(
    blockIds: string[]
): Promise<{
    attrsMap: Map<string, Record<string, string>>;
    rootIdMap: Map<string, string>;
    tagsMap: Map<string, string[]>;
}> {
    const attrsMap = new Map<string, Record<string, string>>();
    const rootIdMap = new Map<string, string>();
    const tagsMap = new Map<string, string[]>();

    if (blockIds.length === 0) {
        return { attrsMap, rootIdMap, tagsMap };
    }

    const BATCH_SIZE = 500;
    
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const inClause = batchIds.map(id => `'${escapeSQL(id)}'`).join(',');

        const [blocksResult, attrsResult] = await Promise.all([
            sql(`SELECT id, root_id, ial FROM blocks WHERE id IN (${inClause})`),
            sql(`
                SELECT block_id, name, value
                FROM attributes
                WHERE block_id IN (${inClause})
                AND name IN (
                    '${ATTR_CARD_ID}',
                    '${ATTR_PRIORITY}',
                    '${ATTR_SUSPENDED}',
                    '${ATTR_CARD_TYPE}',
                    '${ATTR_A_FACTOR}'
                )
            `)
        ]);

        for (const row of blocksResult || []) {
            rootIdMap.set(row.id, row.root_id || '');
            
            const ial = String(row.ial || '');
            const tags: string[] = [];
            const tagMatches = ial.matchAll(/#([^#\s]+)#/g);
            for (const match of tagMatches) {
                tags.push(match[1]);
            }
            tagsMap.set(row.id, tags);
        }

        for (const row of attrsResult || []) {
            if (!attrsMap.has(row.block_id)) {
                attrsMap.set(row.block_id, {});
            }
            attrsMap.get(row.block_id)![row.name] = row.value;
        }
    }

    return { attrsMap, rootIdMap, tagsMap };
}

function escapeSQL(str: string): string {
    return String(str || '').replace(/'/g, "''");
}

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 加载卡片列表（使用统一数据源）
 */
export async function loadCards(
    preset: string,
    currentDocId?: string,
    queryText?: string,
    forceRefresh = false,
    cardType: 'all' | 'topic-only' | 'item-only' = 'all',
    plugin?: Plugin
): Promise<BrowserCard[]> {
    if (!plugin) {
        console.error('[CardBrowser] Plugin instance is required');
        return [];
    }

    const unifiedDataSourceManager = (plugin as any).unifiedDataSourceManager as UnifiedDataSourceManager;
    if (!unifiedDataSourceManager) {
        console.error('[CardBrowser] UnifiedDataSourceManager not found');
        return [];
    }

    return PerformanceMonitor.measure('loadCards', async () => {
        try {
            // Step 1: 从统一数据源加载所有卡片
            const allCards = await loadAllCardsRaw(unifiedDataSourceManager, forceRefresh);
            if (allCards.length === 0) {
                return [];
            }

            // Step 2: 应用 preset 筛选
            let cards = applyPresetFilter(allCards, preset, currentDocId, plugin);

            // Step 3: 应用 cardType 筛选
            if (cardType === 'topic-only') {
                cards = cards.filter(c => c.cardType === 'topic');
            } else if (cardType === 'item-only') {
                cards = cards.filter(c => c.cardType === 'item' || !c.cardType);
            }

            // Step 4: 应用查询文本筛选
            const parsed = parseQuery(queryText || '');
            cards = applyParsedQuery(cards, parsed);

            // Step 5: 按 due 时间排序
            cards.sort((a, b) => {
                const da = a.due instanceof Date ? a.due.getTime() : 0;
                const db = b.due instanceof Date ? b.due.getTime() : 0;
                if (da !== db) return da - db;
                return String(a.blockId).localeCompare(String(b.blockId));
            });

            return cards;
        } catch (err) {
            console.error('[CardBrowser] Load cards error:', err);
            return [];
        }
    });
}

/**
 * 强制刷新缓存
 */
export function invalidateCardCache(): void {
    cardCache.clear();
    console.log('[CardBrowser] 缓存已清除');
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { count: number; age: number; valid: boolean } {
    return cardCache.getStats();
}

// ============================================================================
// 筛选逻辑（保持不变）
// ============================================================================

// TODO: 从原 browserService.ts 复制以下函数：
// - parseQuery()
// - applyPresetFilter()
// - applyParsedQuery()
// - matchesParsedQuery()
// - extractSqlStatement()
// 等等...

// 临时占位符
function parseQuery(query: string): any {
    return { text: query, tags: [], decks: [], states: [], docs: [], conditions: [] };
}

function applyPresetFilter(cards: BrowserCard[], preset: string, currentDocId?: string, plugin?: Plugin): BrowserCard[] {
    // TODO: 实现筛选逻辑
    return cards;
}

function applyParsedQuery(cards: BrowserCard[], parsed: any): BrowserCard[] {
    // TODO: 实现查询筛选
    return cards;
}

export function extractSqlStatement(query: string): string | null {
    const match = /^sql:\s*(.+)$/i.exec(query?.trim() || '');
    return match ? match[1].trim() : null;
}

export function matchesParsedQuery(card: BrowserCard, parsed: any): boolean {
    // TODO: 实现匹配逻辑
    return true;
}
