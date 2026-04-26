/**
 * 卡片浏览器数据服务 v2
 * 
 * 重构版本：使用统一数据源架构
 * - 使用 UnifiedDataSourceManager 获取卡片数据
 * - 批量操作统一走显式注入的 UnifiedDataSourceManager
 * - 移除直接调用 Riff API
 * 
 * @see RIFF_API_USAGE_AUDIT.md
 */

import type { Plugin } from 'siyuan';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { FSRSCard } from '@/types';
import { applyDismissState, isCardDismissed } from '@/core/card/domain/services/dismissState';
import { PerformanceMonitor } from '@/utils/performance';
import { getCurrentDayEnd } from '@/utils/dateUtils';
import { getDayStartHour } from '@/utils/configUtils';
import { createLogger } from '@/utils/logger';
import { batchDetectCardType, initializeAFactor } from '@/core/card-builder';
import {
    type BrowserCard,
    CardState,
    STATE_LABELS,
    calculateRetrievability,
    formatDueDate,
    formatHistoryDate,
    checkNumberCondition,
    matchesParsedQuery,
    parseQuery,
    truncateContent
} from '@/types/browser';
export {
    matchesParsedQuery,
    parseQuery,
    type NumberCondition,
    type ParsedBrowserQuery,
} from '@/types/browser';

const logger = createLogger('browserService');

type BrowserBatchManagerPort = Pick<UnifiedDataSourceManager, 'getCards' | 'updateCard' | 'deleteCard'>;
export type BrowserCardProjection = Omit<BrowserCard, 'note' | 'meta'>;

type BrowserAttrKeys = {
    cardId: string;
    priority: string;
    cardType: string;
    aFactor: string;
};

type SqlRow = Record<string, unknown>;
type BlockInfoSqlRow = {
    id: string;
    root_id?: string;
    ial?: string;
    type?: string;
    content?: string;
};
type BlockAttrSqlRow = {
    block_id: string;
    name: string;
    value: string;
};
type DocTreeSqlRow = {
    id: string;
    content?: string;
    hpath?: string;
};

type BrowserPluginContext = {
    getBrowserService?: () => {
        getSiyuanApi?: () => BrowserSiyuanPort;
    } | null;
    getUnifiedDataSourceManager?: () => UnifiedDataSourceManager | null;
};

type BrowserPluginLike = Plugin & {
    getContext?: () => BrowserPluginContext | null;
    unifiedDataSourceManager?: UnifiedDataSourceManager;
};

type BrowserCardType = NonNullable<BrowserCard['cardType']>;

const BROWSER_CARD_TYPES: BrowserCardType[] = [
    'topic',
    'item',
    'concept',
    'descriptor',
    'incremental',
    'webpage',
];

let cachedAttrKeys: { signature: string; keys: BrowserAttrKeys } | null = null;

/**
 * @deprecated Browser runtime dependencies are now passed explicitly by callers.
 */
export function setGlobalBrowserContext(
    _manager: UnifiedDataSourceManager,
    _queryText: string = '',
    _siyuanApi?: BrowserSiyuanPort
): void {
    logger.debug('Ignored deprecated setGlobalBrowserContext call; browser dependencies are explicit now.');
}

/**
 * @deprecated Browser runtime dependencies are now passed explicitly by callers.
 */
export function clearGlobalBrowserContext(): void {
    cachedAttrKeys = null;
    logger.debug('Ignored deprecated clearGlobalBrowserContext call; browser dependencies are explicit now.');
}

function resolveSiyuanApi(plugin?: Plugin, explicitSiyuanApi?: BrowserSiyuanPort): BrowserSiyuanPort {
    if (explicitSiyuanApi) {
        return explicitSiyuanApi;
    }

    const pluginLike = plugin as BrowserPluginLike | undefined;
    const context = pluginLike?.getContext?.();
    const browserService = context?.getBrowserService?.();
    const siyuanApi = browserService?.getSiyuanApi?.();
    if (siyuanApi) {
        return siyuanApi;
    }

    throw new Error('Browser Siyuan API not provided. Pass siyuanApi explicitly or provide a plugin context browser service.');
}

function resolveUnifiedDataSourceManager(plugin: Plugin): UnifiedDataSourceManager | null {
    const pluginLike = plugin as BrowserPluginLike;
    const contextManager = pluginLike.getContext?.()?.getUnifiedDataSourceManager?.();
    if (contextManager) {
        return contextManager;
    }
    return pluginLike.unifiedDataSourceManager || null;
}

function toBrowserCardType(value: unknown): BrowserCardType | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim() as BrowserCardType;
    if (!normalized) {
        return undefined;
    }
    return BROWSER_CARD_TYPES.includes(normalized) ? normalized : undefined;
}

function getAttrKeys(siyuanApi: BrowserSiyuanPort): BrowserAttrKeys {
    const signature = [
        siyuanApi.ATTR_CARD_ID,
        siyuanApi.ATTR_PRIORITY,
        siyuanApi.ATTR_CARD_TYPE,
        siyuanApi.ATTR_A_FACTOR,
    ].join('|');
    if (cachedAttrKeys?.signature === signature) {
        return cachedAttrKeys.keys;
    }

    const keys = {
        cardId: siyuanApi.ATTR_CARD_ID,
        priority: siyuanApi.ATTR_PRIORITY,
        cardType: siyuanApi.ATTR_CARD_TYPE,
        aFactor: siyuanApi.ATTR_A_FACTOR,
    };
    cachedAttrKeys = { signature, keys };
    return keys;
}

export async function runBrowserSql<T extends SqlRow = SqlRow>(
    stmt: string,
    siyuanApi: BrowserSiyuanPort,
): Promise<T[]> {
    const rows = await siyuanApi.sql(stmt);
    return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function pushBrowserMsg(
    msg: string,
    timeout: number | undefined,
    siyuanApi: BrowserSiyuanPort,
): Promise<void> {
    await siyuanApi.pushMsg(msg, timeout);
}

export async function pushBrowserErrMsg(
    msg: string,
    timeout: number | undefined,
    siyuanApi: BrowserSiyuanPort,
): Promise<void> {
    await siyuanApi.pushErrMsg(msg, timeout);
}

function resolveBatchManager(manager?: BrowserBatchManagerPort): BrowserBatchManagerPort | null {
    return manager ?? null;
}

function toUniqueBlockIds(blockIds: string[]): string[] {
    return Array.from(new Set((blockIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
}

async function loadFsrsCardsByBlockIds(
    blockIds: string[],
    manager: Pick<UnifiedDataSourceManager, 'getCards'>
): Promise<FSRSCard[]> {
    const uniqueBlockIds = toUniqueBlockIds(blockIds);
    if (uniqueBlockIds.length === 0) {
        return [];
    }

    return manager.getCards({ blockIds: uniqueBlockIds });
}

async function buildBlockCardMap(
    blockIds: string[],
    manager: BrowserBatchManagerPort
): Promise<Map<string, FSRSCard[]>> {
    const targetBlockIds = new Set(toUniqueBlockIds(blockIds));
    const blockCardMap = new Map<string, FSRSCard[]>();
    const cards = await loadFsrsCardsByBlockIds(Array.from(targetBlockIds), manager);

    for (const card of cards) {
        if (!targetBlockIds.has(card.blockId)) {
            continue;
        }
        const group = blockCardMap.get(card.blockId);
        if (group) {
            group.push(card);
        } else {
            blockCardMap.set(card.blockId, [card]);
        }
    }

    return blockCardMap;
}

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
            logger.error('Listener error:', e);
        }
    });
}

interface CacheEntry {
    cards: BrowserCard[];
    timestamp: number;
    blockIdSet: Set<string>;
    blockIdMap: Map<string, BrowserCard>;
    isComplete: boolean;
}

/**
 * 卡片缓存管理器
 */
class CardCacheManager {
    private cache: CacheEntry | null = null;
    private readonly TTL = 0;  // 禁用缓存，数据始终最新
    private loading: Promise<BrowserCard[]> | null = null;

    private isCacheValid(): boolean {
        if (!this.cache) return false;
        const ttlMs = Math.max(this.TTL, 10_000);
        return Date.now() - this.cache.timestamp <= ttlMs;
    }

    get(): BrowserCard[] | null {
        if (!this.cache) return null;
        if (!this.isCacheValid()) {
            return null;
        }
        return this.cache.cards;
    }

    getByBlockIds(blockIds: string[]): Map<string, BrowserCard> {
        const result = new Map<string, BrowserCard>();
        if (!this.cache || !this.isCacheValid()) {
            return result;
        }
        for (const blockId of blockIds) {
            const card = this.cache.blockIdMap.get(blockId);
            if (card) {
                result.set(blockId, card);
            }
        }
        return result;
    }

    set(cards: BrowserCard[], isComplete = true): void {
        const blockIdMap = new Map<string, BrowserCard>();
        for (const card of cards) {
            if (card?.blockId) {
                blockIdMap.set(card.blockId, card);
            }
        }
        this.cache = {
            cards,
            timestamp: Date.now(),
            blockIdSet: new Set(blockIdMap.keys()),
            blockIdMap,
            isComplete
        };
    }

    clear(): void {
        this.cache = null;
    }

    /**
     * 更新单个卡片的缓存
     */
    updateCard(blockId: string, updates: Partial<BrowserCard>): void {
        if (!this.cache) return;
        
        const card = this.cache.blockIdMap.get(blockId);
        if (card) {
            Object.assign(card, updates);
            this.cache.timestamp = Date.now();
        }
    }

    /**
     * 从缓存中移除多个卡片
     */
    removeCards(blockIds: string[]): void {
        if (!this.cache) return;
        
        const blockIdSet = new Set(blockIds);
        this.cache.cards = this.cache.cards.filter(c => !blockIdSet.has(c.blockId));
        this.cache.blockIdSet = new Set(this.cache.cards.map(c => c.blockId));
        this.cache.blockIdMap = new Map(this.cache.cards.map(c => [c.blockId, c]));
        this.cache.timestamp = Date.now();
    }

    getStats(): { count: number; age: number; valid: boolean } {
        if (!this.cache) {
            return { count: 0, age: 0, valid: false };
        }
        const age = Date.now() - this.cache.timestamp;
        const ttlMs = Math.max(this.TTL, 10_000);
        return {
            count: this.cache.cards.length,
            age,
            valid: age <= ttlMs
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
 * 
 * 🆕 性能优化：
 * - 使用更快的日期计算
 * - 减少不必要的对象创建
 * - 延迟计算非关键字段
 */
function transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    // 🆕 优化：使用常量避免重复计算
    const now = Date.now();
    const MS_PER_DAY = 86400000;  // 1000 * 60 * 60 * 24
    
    // 🆕 优化：直接除以毫秒数，避免多次乘法
    const elapsedDays = card.lastReview 
        ? Math.floor((now - card.lastReview) / MS_PER_DAY)
        : 0;
    
    // 计算 Retrievability
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    
    // 转换卡片状态
    const state = card.state as CardState;
    
    // 🆕 优化：只创建一次 Date 对象
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
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    
    // 🔧 修复：优先使用块属性，但如果块属性不存在，使用 FSRSCard.type
    // 这样可以确保所有概念卡都能被正确识别
    const finalCardType = cardType
      || (customAttrs[attrKeys.cardType] as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined);
    
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
        
        // ✅ 优先级从 FSRSCard 读取，不再使用块属性
        priority: card.priority,
        suspended: isCardDismissed(card),
        
        cardType: finalCardType,
        aFactor: card.aFactor,  // 🔧 修复：从卡片数据读取，不再从块属性读取
        
        tags: [],  // 将在后续步骤中填充
        
        // 🆕 传递完整的 meta 字段（用于 Xiuyuan 卡片识别）
        meta: card.meta,
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
                logger.info('[SiYuanMemo][CardBrowser] 命中缓存，返回', cached.length, '张卡片');
                return cached;
            }

            const loadingPromise = cardCache.getLoadingPromise();
            if (loadingPromise) {
                logger.info('[SiYuanMemo][CardBrowser] 等待并发加载完成...');
                return loadingPromise;
            }
        }

        logger.info('[SiYuanMemo][CardBrowser] 开始加载卡片数据（使用统一数据源）...');
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
                logger.info('[SiYuanMemo][CardBrowser] 获取到', blockIds.length, '张卡片，开始加载属性...');

                // 分批加载属性
                const cards: BrowserCard[] = [];
                const BATCH_SIZE = 500;
                
                for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
                    const batchIds = blockIds.slice(i, i + BATCH_SIZE);
                    const batchCards = fsrsCards.slice(i, i + BATCH_SIZE);
                    
                    const { attrsMap, rootIdMap, tagsMap, contentMap } = await fetchBlockInfoBatched(batchIds, siyuanApi);
                    
                    logger.info(`[SiYuanMemo][CardBrowser] 🔍 Batch ${i}: contentMap size = ${contentMap.size}`);
                    
                    const batchBrowserCards: BrowserCard[] = batchCards.map((card) => {
                        const customAttrs = attrsMap.get(card.blockId) || {};
                        const browserCard = transformFSRSCard(card, customAttrs);
                        browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
                        browserCard.tags = tagsMap.get(card.blockId) || [];
                        
                        // 🔧 修复：对于文档块卡片，优先使用数据库的 content（文档标题）
                        // 检查当前内容是否为空或只有空白字符（包括零宽字符）
                        const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
                        const dbContent = contentMap.get(card.blockId);
                        
                        if (!currentContent && dbContent) {
                            logger.info(`[SiYuanMemo][CardBrowser] 🔍 Document block card ${card.blockId}:`, {
                                fsrsType: card.type,
                                browserCardType: browserCard.cardType,
                                hasDbContent: !!dbContent,
                                dbContent: dbContent?.substring(0, 50),
                                beforeUpdate_content: browserCard.content?.substring(0, 50),
                                beforeUpdate_fullContent: browserCard.fullContent?.substring(0, 50),
                            });
                            
                            // 使用数据库内容（文档块的 content 就是标题）
                            browserCard.fullContent = dbContent;
                            browserCard.content = truncateContent(dbContent, 100);
                            logger.info(`[SiYuanMemo][CardBrowser] ✅ Updated document block card:`, {
                                blockId: card.blockId,
                                cardType: card.type,
                                afterUpdate_content: browserCard.content,
                                afterUpdate_fullContent: browserCard.fullContent,
                            });
                        }
                        
                        return browserCard;
                    });
                    
                    cards.push(...batchBrowserCards);
                    const isComplete = cards.length >= fsrsCards.length;
                    
                    cardCache.set(cards, isComplete);
                    notifyUpdate(cards, isComplete);
                }

                const elapsed = Date.now() - startTime;
                logger.info(`[SiYuanMemo][CardBrowser] ✅ 加载完成，共 ${cards.length} 张卡片，耗时 ${elapsed}ms`);
                
                return cards;
            } catch (err) {
                logger.error('[SiYuanMemo][CardBrowser] 加载卡片失败:', err);
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
 * 
 * ✅ 优化：为概念卡获取文档标题
 */
async function fetchBlockInfoBatched(
    blockIds: string[],
    siyuanApi: BrowserSiyuanPort,
): Promise<{
    attrsMap: Map<string, Record<string, string>>;
    rootIdMap: Map<string, string>;
    tagsMap: Map<string, string[]>;
    contentMap: Map<string, string>; // 🆕 添加内容映射
}> {
    const attrsMap = new Map<string, Record<string, string>>();
    const rootIdMap = new Map<string, string>();
    const tagsMap = new Map<string, string[]>();
    const contentMap = new Map<string, string>(); // 🆕 内容映射

    if (blockIds.length === 0) {
        return { attrsMap, rootIdMap, tagsMap, contentMap };
    }

    const attrKeys = getAttrKeys(siyuanApi);
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const inClause = batchIds.map(id => `'${escapeSQL(id)}'`).join(',');

        const [blocksResult, attrsResult] = await Promise.all([
            // 🆕 添加 type 和 content 字段，用于识别文档块并获取标题
            runBrowserSql<BlockInfoSqlRow>(`SELECT id, root_id, ial, type, content FROM blocks WHERE id IN (${inClause})`, siyuanApi),
            runBrowserSql<BlockAttrSqlRow>(`
                SELECT block_id, name, value
                FROM attributes
                WHERE block_id IN (${inClause})
                AND name IN (
                    '${attrKeys.cardId}',
                    '${attrKeys.priority}',
                    '${attrKeys.cardType}',
                    '${attrKeys.aFactor}'
                )
            `, siyuanApi)
        ]);

        for (const row of blocksResult) {
            rootIdMap.set(row.id, row.root_id || '');
            
            // 🆕 存储内容（对于文档块，content 是文档标题）
            const content = String(row.content || '').trim();
            if (content) {
                contentMap.set(row.id, content);
                logger.info(`[SiYuanMemo][fetchBlockInfoBatched] 📝 Block ${row.id}: type=${row.type}, content="${content.substring(0, 50)}..."`);
            } else {
                logger.info(`[SiYuanMemo][fetchBlockInfoBatched] ⚠️ Block ${row.id}: type=${row.type}, content is empty`);
            }
            
            const ial = String(row.ial || '');
            const tags: string[] = [];
            const tagMatches = ial.matchAll(/#([^#\s]+)#/g);
            for (const match of tagMatches) {
                tags.push(match[1]);
            }
            tagsMap.set(row.id, tags);
        }

        for (const row of attrsResult) {
            if (!attrsMap.has(row.block_id)) {
                attrsMap.set(row.block_id, {});
            }
            attrsMap.get(row.block_id)![row.name] = row.value;
        }
    }

    return { attrsMap, rootIdMap, tagsMap, contentMap };
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
        logger.error('[SiYuanMemo][CardBrowser] Plugin instance is required');
        return [];
    }

    const siyuanApi = resolveSiyuanApi(plugin);

    const unifiedDataSourceManager = resolveUnifiedDataSourceManager(plugin);
    if (!unifiedDataSourceManager) {
        logger.error('[SiYuanMemo][CardBrowser] UnifiedDataSourceManager not found');
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

            // 🔍 调试：输出所有卡片的类型和内容
            logger.info('[SiYuanMemo][CardBrowser] 📊 Final cards summary:', {
                total: cards.length,
                byType: cards.reduce((acc, c) => {
                    acc[c.cardType || 'unknown'] = (acc[c.cardType || 'unknown'] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>),
                conceptCards: cards.filter(c => c.cardType === 'concept').map(c => ({
                    blockId: c.blockId,
                    content: c.content?.substring(0, 30),
                    fullContent: c.fullContent?.substring(0, 30),
                    hasContent: !!c.content,
                    hasFullContent: !!c.fullContent,
                }))
            });

            return cards;
        } catch (err) {
            logger.error('[SiYuanMemo][CardBrowser] Load cards error:', err);
            return [];
        }
    });
}

/**
 * 强制刷新缓存
 */
export function invalidateCardCache(): void {
    cardCache.clear();
    logger.info('[SiYuanMemo][CardBrowser] 缓存已清除');
}

/**
 * 🆕 强制清除所有缓存（包括浏览器缓存）
 */
export function forceInvalidateAllCache(): void {
    cardCache.clear();
    // 清除所有监听器，强制重新加载
    listeners.clear();
    logger.info('[SiYuanMemo][CardBrowser] 所有缓存已强制清除');
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

// ============================================================================
// 查询和筛选逻辑（从原文件复制）
// ============================================================================

function applyParsedQuery(cards: BrowserCard[], parsed: ReturnType<typeof parseQuery>): BrowserCard[] {
    let next = cards;

    if (parsed.decks.length > 0) {
        const set = new Set(parsed.decks);
        next = next.filter(c => set.has(c.deckId));
    }

    if (parsed.states.length > 0) {
        const set = new Set(parsed.states);
        next = next.filter(c => set.has(c.state));
    }

    if (parsed.docs.length > 0) {
        const set = new Set(parsed.docs);
        next = next.filter(c => c.rootId && set.has(c.rootId));
    }

    if (parsed.tags.length > 0) {
        next = next.filter(c => {
            const tags = c.tags || [];
            return parsed.tags.every(t => tags.includes(t));
        });
    }

    if (parsed.text) {
        const q = parsed.text.toLowerCase();
        next = next.filter(c => (c.fullContent || c.content || '').toLowerCase().includes(q));
    }

    const conds = parsed.conditions;
    next = next.filter(c => {
        if (conds.priority && !checkNumberCondition(c.priority, conds.priority)) return false;
        if (conds.interval && !checkNumberCondition(c.interval, conds.interval)) return false;
        if (conds.reps && !checkNumberCondition(c.reps, conds.reps)) return false;
        if (conds.lapses && !checkNumberCondition(c.lapses, conds.lapses)) return false;
        if (conds.difficulty && !checkNumberCondition(c.difficulty, conds.difficulty)) return false;
        if (conds.retrievability && !checkNumberCondition(c.retrievability, conds.retrievability)) return false;
        if (conds.stability && !checkNumberCondition(c.stability, conds.stability)) return false;
        return true;
    });

    return next;
}

function applyPresetFilter(cards: BrowserCard[], preset: string, currentDocId?: string, plugin?: Plugin): BrowserCard[] {
    const now = new Date();
    
    let todayEnd: Date;
    if (plugin) {
        const dayStartHour = getDayStartHour(plugin);
        const dayEndTimestamp = getCurrentDayEnd(dayStartHour);
        todayEnd = new Date(dayEndTimestamp);
    } else {
        todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    switch (preset) {
        case 'due':
            return cards.filter(c => c.due <= todayEnd && !c.suspended);
        case 'overdue':
            return cards.filter(c => c.due < now && !c.suspended);
        case 'new':
            return cards.filter(c => c.state === CardState.New && !c.suspended);
        case 'learning':
            return cards.filter(c => (c.state === CardState.Learning || c.state === CardState.Relearning) && !c.suspended);
        case 'leech':
            return cards.filter(c => c.lapses >= 8);
        case 'suspended':
            return cards.filter(c => c.suspended);
        case 'current-doc':
            if (currentDocId) {
                return cards.filter(c => c.rootId === currentDocId);
            }
            return cards;
        // ❌ 移除：topic-only 和 item-only 应该由 cardType 筛选器处理，不是 preset
        // case 'topic-only':
        //     return cards.filter(c => c.cardType === 'topic');
        // case 'item-only':
        //     return cards.filter(c => c.cardType === 'item' || !c.cardType);
        case 'all':
        default:
            return cards;
    }
}

export function extractSqlStatement(query: string): string | null {
    const match = /^sql:\s*(.+)$/i.exec(query?.trim() || '');
    return match ? match[1].trim() : null;
}

// ============================================================================
// 其他辅助函数
// ============================================================================

export async function loadAllCards(
    unifiedDataSourceManager: UnifiedDataSourceManager,
    forceRefresh = false
): Promise<BrowserCard[]> {
    return loadAllCardsRaw(unifiedDataSourceManager, forceRefresh);
}

export interface DocTreeNode {
    id: string;
    title: string;
}

export async function getDocTree(
    rootIds: string[],
    siyuanApi: BrowserSiyuanPort,
): Promise<DocTreeNode[]> {
    const ids = Array.from(new Set((rootIds || []).filter(Boolean)));
    if (ids.length === 0) return [];
    
    try {
        const sqlQuery = `
            SELECT id, content, hpath
            FROM blocks
            WHERE id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
        `;
        
        const rows = await runBrowserSql<DocTreeSqlRow>(sqlQuery, siyuanApi);
        const foundIds = new Set(rows.map((row) => row.id));
        const result = rows.map((row) => {
            const title = (row.content || '').trim() || String(row.hpath || '').split('/').pop() || row.id;
            return { id: row.id, title };
        });
        
        for (const id of ids) {
            if (!foundIds.has(id)) {
                result.push({ id, title: `📄 ${id} (已删除)` });
            }
        }
        
        return result;
    } catch (err) {
        logger.error('[SiYuanMemo][CardBrowser] getDocTree error:', err);
        return ids.map((id) => ({ id, title: id }));
    }
}

export async function loadQueueCards(
    blockIds: string[],
    queryText: string | undefined,
    unifiedDataSourceManager: UnifiedDataSourceManager,
    siyuanApi: BrowserSiyuanPort,
): Promise<BrowserCard[]> {
    return buildBrowserCardsByBlockIds(blockIds, {
        queryText,
        applyQueryFilter: true,
        manager: unifiedDataSourceManager,
        siyuanApi,
    });

    const ids = Array.from(new Set((blockIds || []).filter(Boolean)));
    if (ids.length === 0) return [];
    const attrKeys = getAttrKeys(siyuanApi);

    try {
        // 从缓存或统一数据源获取卡片
        const cachedCards = cardCache.get();
        if (cachedCards) {
            const cachedByBlockId = cardCache.getByBlockIds(ids);
            if (cachedByBlockId.size === ids.length) {
                let cards = ids
                    .map(id => cachedByBlockId.get(id))
                    .filter(Boolean) as BrowserCard[];
                
                if (queryText) {
                    const parsed = parseQuery(queryText);
                    cards = applyParsedQuery(cards, parsed);
                }
                
                const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
                return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
            }
        }

        // 默认：从统一数据源加载
        const router = unifiedDataSourceManager.getRouter();
        const allCards = await router.getCards();
        const cardMap = new Map(allCards.map(c => [c.blockId, c]));
        
        const { attrsMap, rootIdMap, tagsMap, contentMap } = await fetchBlockInfoBatched(ids, siyuanApi);
        
        // 🆕 优化：合并多次遍历为一次，减少中间数组创建
        const parsed = parseQuery(queryText || '');
        const cards: BrowserCard[] = [];
        
        for (const id of ids) {
            const card = cardMap.get(id);
            
            // 🆕 如果块没有对应的 FSRS 卡片，创建虚拟卡片
            if (!card) {
                logger.info(`[SiYuanMemo][loadQueueCards] Block ${id} has no FSRS card, creating virtual card`);
                
                const customAttrs = attrsMap.get(id) || {};
                const parsedPriority = Number(customAttrs[attrKeys.priority]);
                const dbContent = contentMap.get(id) || '';
                const rootId = rootIdMap.get(id) || '';
                const tags = tagsMap.get(id) || [];
                
                // 创建虚拟卡片（用于神经漫游等场景）
                const virtualCard: BrowserCard = {
                    id: id,
                    fsrsCardId: id,
                    blockId: id,
                    deckId: '',
                    content: truncateContent(dbContent, 100),
                    fullContent: dbContent,
                    rootId: rootId,
                    state: 0,  // New
                    stateLabel: '新卡',
                    due: new Date(),
                    dueFormatted: '-',
                    stability: 0,
                    difficulty: 0,
                    retrievability: 0,
                    reps: 0,
                    lapses: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    lastReview: null,
                    lastReviewFormatted: '-',
                    interval: 0,
                    firstReview: null,
                    firstReviewFormatted: '-',
                    priority: Number.isFinite(parsedPriority) ? parsedPriority : 50,
                    suspended: false,
                    tags: tags,
                    note: '',
                    cardType: toBrowserCardType(customAttrs[attrKeys.cardType]) || 'concept',  // 默认为概念卡
                    aFactor: undefined,
                };
                
                // 🔧 只在有查询文本时才应用筛选
                if (!queryText || matchesParsedQuery(virtualCard, parsed)) {
                    cards.push(virtualCard);
                }
                continue;
            }
            
            const customAttrs = attrsMap.get(card.blockId) || {};
            const browserCard = transformFSRSCard(card, customAttrs);
            browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
            browserCard.tags = tagsMap.get(card.blockId) || [];
            
            // 🔧 修复：对于文档块卡片，优先使用数据库的 content（文档标题）
            // 检查当前内容是否为空或只有空白字符（包括零宽字符）
            const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
            const dbContent = contentMap.get(card.blockId);
            
            // 如果当前内容为空但数据库有内容，使用数据库内容（文档块的 content 就是标题）
            if (!currentContent && dbContent) {
                browserCard.fullContent = dbContent;
                browserCard.content = truncateContent(dbContent, 100);
            }
            
            // 🔧 修复：只在有查询文本时才应用筛选，否则返回所有卡片
            // 这样神经漫游队列的浏览器可以显示所有队列中的卡片
            if (!queryText || matchesParsedQuery(browserCard, parsed)) {
                cards.push(browserCard);
            }
        }
        
        return cards;
    } catch (err) {
        logger.error('[SiYuanMemo][CardBrowser] loadQueueCards error:', err);
        return [];
    }
}

/**
 * 简化版的 loadQueueCards，使用全局上下文
 * 
 * 这是一个便捷包装函数，使用全局设置的 unifiedDataSourceManager 和 queryText。
 * 在调用前必须先调用 setGlobalBrowserContext() 初始化全局上下文。
 * 
 * @param blockIds 要加载的卡片 ID 列表
 * @returns 加载的卡片列表
 * 
 * @example
 * ```typescript
 * // 初始化全局上下文（在组件初始化时）
 * setGlobalBrowserContext(unifiedDataSourceManager, searchQuery);
 * 
 * // 使用简化版本
 * const cards = await loadQueueCardsSimple(['block-id-1', 'block-id-2']);
 * ```
 */
export async function loadQueueCardsSimple(
    blockIds: string[],
    options: {
        queryText?: string;
        manager: UnifiedDataSourceManager;
        siyuanApi: BrowserSiyuanPort;
    },
): Promise<BrowserCard[]> {
    return loadQueueCards(blockIds, options.queryText, options.manager, options.siyuanApi);
}

function toBrowserCardProjection(card: BrowserCard): BrowserCardProjection {
    const { note: _note, meta: _meta, ...projection } = card;
    return projection;
}

type LoadBrowserCardsByBlockIdsOptions = {
    queryText?: string;
    applyQueryFilter?: boolean;
    manager?: UnifiedDataSourceManager;
    siyuanApi?: BrowserSiyuanPort;
};

function resolveBrowserManager(manager?: UnifiedDataSourceManager): UnifiedDataSourceManager | null {
    return manager ?? null;
}

async function buildBrowserCardsByBlockIds(
    blockIds: string[],
    options: LoadBrowserCardsByBlockIdsOptions = {}
): Promise<BrowserCard[]> {
    const ids = toUniqueBlockIds(blockIds);
    if (ids.length === 0) return [];

    const manager = resolveBrowserManager(options.manager);
    if (!manager) {
        logger.error('Browser manager not initialized for blockId load');
        return [];
    }

    const applyQueryFilter = options.applyQueryFilter !== false;
    const normalizedQueryText = applyQueryFilter ? options.queryText : undefined;

    try {
        const cachedCards = cardCache.get();
        if (cachedCards) {
            const cachedByBlockId = cardCache.getByBlockIds(ids);
            if (cachedByBlockId.size === ids.length) {
                let cards = ids
                    .map((id) => cachedByBlockId.get(id))
                    .filter(Boolean) as BrowserCard[];

                if (normalizedQueryText) {
                    cards = applyParsedQuery(cards, parseQuery(normalizedQueryText));
                }

                const byBlockId = new Map(cards.map((card) => [card.blockId, card]));
                return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
            }
        }

        const siyuanApi = options.siyuanApi;
        if (!siyuanApi) {
            logger.error('Browser Siyuan API not provided for blockId load');
            return [];
        }
        const attrKeys = getAttrKeys(siyuanApi);
        const scopedCards = await loadFsrsCardsByBlockIds(ids, manager);
        const cardMap = new Map(scopedCards.map((card) => [card.blockId, card]));
        const { attrsMap, rootIdMap, tagsMap, contentMap } = await fetchBlockInfoBatched(ids, siyuanApi);
        const parsed = normalizedQueryText ? parseQuery(normalizedQueryText) : null;
        const cards: BrowserCard[] = [];

        for (const id of ids) {
            const card = cardMap.get(id);

            if (!card) {
                const customAttrs = attrsMap.get(id) || {};
                const parsedPriority = Number(customAttrs[attrKeys.priority]);
                const dbContent = contentMap.get(id) || '';
                const rootId = rootIdMap.get(id) || '';
                const tags = tagsMap.get(id) || [];
                const virtualCard: BrowserCard = {
                    id,
                    fsrsCardId: id,
                    blockId: id,
                    deckId: '',
                    content: truncateContent(dbContent, 100),
                    fullContent: dbContent,
                    rootId,
                    state: 0,
                    stateLabel: STATE_LABELS[CardState.New] || 'New',
                    due: new Date(),
                    dueFormatted: '-',
                    stability: 0,
                    difficulty: 0,
                    retrievability: 0,
                    reps: 0,
                    lapses: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    lastReview: null,
                    lastReviewFormatted: '-',
                    interval: 0,
                    firstReview: null,
                    firstReviewFormatted: '-',
                    priority: Number.isFinite(parsedPriority) ? parsedPriority : 50,
                    suspended: false,
                    tags,
                    note: '',
                    cardType: toBrowserCardType(customAttrs[attrKeys.cardType]) || 'concept',
                    aFactor: undefined,
                };

                if (!parsed || matchesParsedQuery(virtualCard, parsed)) {
                    cards.push(virtualCard);
                }
                continue;
            }

            const customAttrs = attrsMap.get(card.blockId) || {};
            const browserCard = transformFSRSCard(card, customAttrs);
            browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
            browserCard.tags = tagsMap.get(card.blockId) || [];

            const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
            const dbContent = contentMap.get(card.blockId);
            if (!currentContent && dbContent) {
                browserCard.fullContent = dbContent;
                browserCard.content = truncateContent(dbContent, 100);
            }

            if (!parsed || matchesParsedQuery(browserCard, parsed)) {
                cards.push(browserCard);
            }
        }

        return cards;
    } catch (err) {
        logger.error('[SiYuanMemo][CardBrowser] blockId card load error:', err);
        return [];
    }
}

export async function loadBrowserCardsByBlockIds(
    blockIds: string[],
    options: LoadBrowserCardsByBlockIdsOptions = {}
): Promise<BrowserCard[]> {
    return buildBrowserCardsByBlockIds(blockIds, options);
}

export async function loadBrowserCardProjectionsByBlockIds(
    blockIds: string[],
    options: LoadBrowserCardsByBlockIdsOptions = {}
): Promise<BrowserCardProjection[]> {
    const cards = await buildBrowserCardsByBlockIds(blockIds, options);
    return cards.map(toBrowserCardProjection);
}


// ============================================================================
// 批量操作（使用 UnifiedDataSourceManager）
// ============================================================================

async function updateCardsByBlockIds(
    blockIds: string[],
    manager: BrowserBatchManagerPort,
    mutation: (card: FSRSCard, blockId: string) => FSRSCard
): Promise<number> {
    const uniqueBlockIds = Array.from(new Set(blockIds.filter(Boolean)));
    if (uniqueBlockIds.length === 0) {
        return 0;
    }

    const blockCardMap = await buildBlockCardMap(uniqueBlockIds, manager);
    let updatedBlocks = 0;

    for (const blockId of uniqueBlockIds) {
        const cardsInBlock = blockCardMap.get(blockId) || [];
        if (cardsInBlock.length === 0) {
            continue;
        }

        for (const card of cardsInBlock) {
            const updatedCard = mutation(card, blockId);
            await manager.updateCard(updatedCard);
        }
        updatedBlocks++;
    }

    return updatedBlocks;
}

/**
 * 批量重置为新卡
 */
export async function batchReset(
    blockIds: string[],
    manager?: BrowserBatchManagerPort
): Promise<number> {
    if (blockIds.length === 0) return 0;

    const resolvedManager = resolveBatchManager(manager);
    if (!resolvedManager) {
        logger.error('batchReset failed: manager is not available');
        return 0;
    }

    try {
        const now = Date.now();
        const updatedBlocks = await updateCardsByBlockIds(
            blockIds,
            resolvedManager,
            (card) =>
                ({
                    ...card,
                    state: CardState.New,
                    due: now,
                    reps: 0,
                    lapses: 0,
                    lastReview: 0,
                }) as FSRSCard
        );

        cardCache.clear();

        logger.info('Batch reset completed', {
            requestedBlocks: new Set(blockIds).size,
            updatedBlocks,
        });
        return updatedBlocks;
    } catch (err) {
        logger.error('Batch reset error:', err);
        return 0;
    }
}

/**
 * 批量暂停/取消暂停
 * ✅ 使用统一数据源 manager 批量更新
 */
export async function batchSuspend(
    blockIds: string[],
    suspend: boolean,
    manager?: BrowserBatchManagerPort
): Promise<number> {
    if (blockIds.length === 0) return 0;

    const resolvedManager = resolveBatchManager(manager);
    if (!resolvedManager) {
        logger.error('batchSuspend failed: manager is not available');
        return 0;
    }

    try {
        const uniqueBlockIds = Array.from(new Set(blockIds.filter(Boolean)));
        const updatedBlocks = await updateCardsByBlockIds(
            uniqueBlockIds,
            resolvedManager,
            (card) => {
                return applyDismissState(card, suspend, { touchUpdatedAt: true }) as FSRSCard;
            }
        );

        for (const blockId of uniqueBlockIds) {
            cardCache.updateCard(blockId, { suspended: suspend });
        }

        logger.info('Batch suspend completed', {
            requestedBlocks: uniqueBlockIds.length,
            updatedBlocks,
            suspend,
        });
        return updatedBlocks;
    } catch (err) {
        logger.error('Batch suspend error:', err);
        return 0;
    }
}

/**
 * 批量设置优先级
 */
export async function batchSetPriority(
    blockIds: string[],
    priority: number,
    manager?: BrowserBatchManagerPort
): Promise<number> {
    if (blockIds.length === 0) return 0;

    const uniqueBlockIds = Array.from(new Set(blockIds.filter(Boolean)));
    const clampedPriority = Math.max(0, Math.min(100, priority));
    const resolvedManager = resolveBatchManager(manager);
    if (!resolvedManager) {
        logger.error('batchSetPriority failed: manager is not available');
        return 0;
    }
    try {
        const updatedBlocks = await updateCardsByBlockIds(
            uniqueBlockIds,
            resolvedManager,
            (card) =>
                ({
                    ...card,
                    priority: clampedPriority,
                }) as FSRSCard
        );
        for (const blockId of uniqueBlockIds) {
            cardCache.updateCard(blockId, { priority: clampedPriority });
        }

        logger.info('Batch set priority completed', {
            requestedBlocks: uniqueBlockIds.length,
            updatedBlocks,
            priority: clampedPriority,
        });
        return updatedBlocks;
    } catch (err) {
        logger.error('Batch priority card update error:', err);
        return 0;
    }
}

/**
 * 批量删除卡片
 * ✅ 使用统一数据源 manager 删除
 */
export async function batchDelete(
    blockIds: string[],
    manager?: BrowserBatchManagerPort
): Promise<number> {
    if (blockIds.length === 0) return 0;

    const resolvedManager = resolveBatchManager(manager);
    if (!resolvedManager) {
        logger.error('batchDelete failed: manager is not available');
        return 0;
    }

    try {
        const uniqueBlockIds = Array.from(new Set(blockIds.filter(Boolean)));
        const blockCardMap = await buildBlockCardMap(uniqueBlockIds, resolvedManager);
        let deletedBlocks = 0;

        for (const blockId of uniqueBlockIds) {
            const cardsInBlock = blockCardMap.get(blockId) || [];
            if (cardsInBlock.length === 0) {
                continue;
            }

            for (const card of cardsInBlock) {
                await resolvedManager.deleteCard(card.id);
            }
            deletedBlocks++;
        }

        cardCache.removeCards(uniqueBlockIds);
        logger.info('Batch delete completed', {
            requestedBlocks: uniqueBlockIds.length,
            deletedBlocks,
        });
        return deletedBlocks;
    } catch (err) {
        logger.error('Batch delete error:', err);
        return 0;
    }
}

/**
 * 批量重新调度
 * ✅ 使用统一数据源 manager 更新 due
 */
export async function batchReschedule(
    cards: BrowserCard[],
    mode: 'absolute' | 'relative',
    value: Date | number,
    manager?: BrowserBatchManagerPort
): Promise<number> {
    if (cards.length === 0) return 0;

    const resolvedManager = resolveBatchManager(manager);
    if (!resolvedManager) {
        logger.error('batchReschedule failed: manager is not available');
        return 0;
    }

    const newDue = mode === 'absolute'
        ? (value as Date).getTime()
        : Date.now() + (value as number) * 24 * 60 * 60 * 1000;

    try {
        const blockIds = cards.map((card) => card.blockId).filter(Boolean);
        const updatedBlocks = await updateCardsByBlockIds(
            blockIds,
            resolvedManager,
            (card) =>
                ({
                    ...card,
                    due: newDue,
                }) as FSRSCard
        );

        logger.info('Batch reschedule completed', {
            requestedBlocks: new Set(blockIds).size,
            updatedBlocks,
            mode,
            newDue,
        });
        return updatedBlocks;
    } catch (err) {
        logger.error('Batch reschedule error:', err);
        return 0;
    }
}

/**
 * 批量检测卡片类型并应用到块属性
 */
export async function batchDetectCardTypes(
    cards: BrowserCard[],
    options: { siyuanApi?: BrowserSiyuanPort } = {},
): Promise<{
    detected: number;
    updated: number;
    failed: number;
}> {
    if (cards.length === 0) {
        return { detected: 0, updated: 0, failed: 0 };
    }
    const siyuanApi = options.siyuanApi;
    if (!siyuanApi) {
        logger.error('batchDetectCardTypes requires explicit siyuanApi');
        return { detected: 0, updated: 0, failed: cards.length };
    }
    const attrKeys = getAttrKeys(siyuanApi);

    try {
        const blockIds = cards.map(c => c.blockId);
        const typeMap = await batchDetectCardType(blockIds);

        let updated = 0;
        let failed = 0;

        const BATCH_SIZE = 50;
        for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (card) => {
                try {
                    const cardType = typeMap.get(card.blockId);
                    if (!cardType) {
                        failed++;
                        return;
                    }

                    const attrs: Record<string, string> = {
                        [attrKeys.cardType]: cardType,
                    };

                    // 🔧 修复：不再写入 A-Factor 块属性
                    // Topic 卡片的 A-Factor 只存储在 FSRSCard.aFactor 中
                    let aFactor: number | undefined;
                    if (cardType === 'topic') {
                        aFactor = initializeAFactor(card.priority);
                    }

                    await siyuanApi.setBlockAttrs(card.blockId, attrs);

                    const cacheUpdates: Partial<BrowserCard> = { cardType };
                    if (aFactor !== undefined) {
                        cacheUpdates.aFactor = aFactor;
                    }
                    cardCache.updateCard(card.blockId, cacheUpdates);
                    updated++;
                } catch (err) {
                    logger.error(`Failed to update card type for ${card.blockId}:`, err);
                    failed++;
                }
            }));
        }

        return {
            detected: cards.length,
            updated,
            failed,
        };
    } catch (err) {
        logger.error('batchDetectCardTypes error:', err);
        return { detected: 0, updated: 0, failed: cards.length };
    }
}
