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
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
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
            console.error('[SiYuanMemo][CardBrowser] Listener error:', e);
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
    // 🔍 只为 Xiuyuan 卡片打印详细日志
    if (card.id.startsWith('xy_card_')) {
        console.log('[transformFSRSCard] 🔍 Xiuyuan card input:', {
            id: card.id,
            blockId: card.blockId,
            hasMeta: !!card.meta,
            metaKeys: card.meta ? Object.keys(card.meta) : [],
            xiuyuanID: (card.meta as any)?.xiuyuanID,
            allChildren: (card.meta as any)?.allChildren,
            currentIndex: (card.meta as any)?.currentIndex,
        });
    }
    
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
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    
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
                console.log('[SiYuanMemo][CardBrowser] 命中缓存，返回', cached.length, '张卡片');
                return cached;
            }

            const loadingPromise = cardCache.getLoadingPromise();
            if (loadingPromise) {
                console.log('[SiYuanMemo][CardBrowser] 等待并发加载完成...');
                return loadingPromise;
            }
        }

        console.log('[SiYuanMemo][CardBrowser] 开始加载卡片数据（使用统一数据源）...');
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
                console.log('[SiYuanMemo][CardBrowser] 获取到', blockIds.length, '张卡片，开始加载属性...');

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
                console.log(`[SiYuanMemo][CardBrowser] ✅ 加载完成，共 ${cards.length} 张卡片，耗时 ${elapsed}ms`);
                
                return cards;
            } catch (err) {
                console.error('[SiYuanMemo][CardBrowser] 加载卡片失败:', err);
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
        console.error('[SiYuanMemo][CardBrowser] Plugin instance is required');
        return [];
    }

    const unifiedDataSourceManager = (plugin as any).unifiedDataSourceManager as UnifiedDataSourceManager;
    if (!unifiedDataSourceManager) {
        console.error('[SiYuanMemo][CardBrowser] UnifiedDataSourceManager not found');
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
            console.error('[SiYuanMemo][CardBrowser] Load cards error:', err);
            return [];
        }
    });
}

/**
 * 强制刷新缓存
 */
export function invalidateCardCache(): void {
    cardCache.clear();
    console.log('[SiYuanMemo][CardBrowser] 缓存已清除');
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

/** 数值比较条件 */
export interface NumberCondition {
    operator: '<' | '>' | '<=' | '>=' | '=' | '!=';
    value: number;
}

export interface ParsedBrowserQuery {
    text: string;
    tags: string[];
    decks: string[];
    states: CardState[];
    docs: string[];
    conditions: {
        priority?: NumberCondition[];
        interval?: NumberCondition[];
        reps?: NumberCondition[];
        lapses?: NumberCondition[];
        difficulty?: NumberCondition[];
        retrievability?: NumberCondition[];
        stability?: NumberCondition[];
    };
}

export function parseQuery(input: string): ParsedBrowserQuery {
    const tokens = (input || '').trim().split(/\s+/).filter(Boolean);
    const tags: string[] = [];
    const decks: string[] = [];
    const docs: string[] = [];
    const states: CardState[] = [];
    const freeText: string[] = [];

    const conditions: ParsedBrowserQuery['conditions'] = {
        priority: [],
        interval: [],
        reps: [],
        lapses: [],
        difficulty: [],
        retrievability: [],
        stability: [],
    };

    const pushUnique = (arr: string[], v: string) => {
        if (!v) return;
        if (!arr.includes(v)) arr.push(v);
    };

    const fieldAliases: Record<string, keyof ParsedBrowserQuery['conditions']> = {
        'prior': 'priority',
        'priority': 'priority',
        'intrv': 'interval',
        'interval': 'interval',
        'reps': 'reps',
        'lapses': 'lapses',
        'dif': 'difficulty',
        'difficulty': 'difficulty',
        'fi': 'retrievability',
        'retrievability': 'retrievability',
        'af': 'stability',
        'stability': 'stability',
    };

    const parseNumberCondition = (token: string): boolean => {
        // 🔧 修复：支持全角符号和 HTML 转义符号
        // 将全角符号转换为半角符号
        let normalizedToken = token
            .replace(/＜/g, '<')
            .replace(/＞/g, '>')
            .replace(/＝/g, '=')
            .replace(/！/g, '!');
        
        // 将 HTML 转义符号转换为半角符号
        normalizedToken = normalizedToken
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&le;/g, '<=')
            .replace(/&ge;/g, '>=');
        
        const match = normalizedToken.match(/^([a-zA-Z_]+)(<=|>=|<|>|=|!=)(-?\d+(\.\d+)?)$/);
        if (!match) return false;

        const [, field, operator, valueStr] = match;
        const fieldName = fieldAliases[field.toLowerCase()];
        if (!fieldName) return false;

        const value = parseFloat(valueStr);
        if (isNaN(value)) return false;

        conditions[fieldName]!.push({ operator: operator as NumberCondition['operator'], value });
        return true;
    };

    for (const token of tokens) {
        if (parseNumberCondition(token)) {
            continue;
        }

        const idx = token.indexOf(':');
        if (idx <= 0) {
            freeText.push(token);
            continue;
        }

        const key = token.slice(0, idx).toLowerCase();
        const rawValue = token.slice(idx + 1).trim();
        if (!rawValue) continue;

        if (key === 'tag') {
            const v = rawValue.replace(/^#+|#+$/g, '');
            pushUnique(tags, v);
            continue;
        }
        if (key === 'deck') {
            pushUnique(decks, rawValue);
            continue;
        }
        if (key === 'doc') {
            pushUnique(docs, rawValue);
            continue;
        }
        if (key === 'state') {
            const parts = rawValue.split(/[\/,|]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
            for (const p of parts) {
                if (p === 'new') states.push(CardState.New);
                else if (p === 'review') states.push(CardState.Review);
                else if (p === 'learning') states.push(CardState.Learning);
                else if (p === 'relearning') states.push(CardState.Relearning);
            }
            continue;
        }

        freeText.push(token);
    }

    return {
        text: freeText.join(' ').trim(),
        tags,
        decks,
        states: Array.from(new Set(states)),
        docs,
        conditions,
    };
}

function checkNumberCondition(actualValue: number, conditions: NumberCondition[]): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(cond => {
        switch (cond.operator) {
            case '<': return actualValue < cond.value;
            case '>': return actualValue > cond.value;
            case '<=': return actualValue <= cond.value;
            case '>=': return actualValue >= cond.value;
            case '=': return actualValue === cond.value;
            case '!=': return actualValue !== cond.value;
            default: return true;
        }
    });
}

function applyParsedQuery(cards: BrowserCard[], parsed: ParsedBrowserQuery): BrowserCard[] {
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

export function matchesParsedQuery(card: BrowserCard, parsed: ParsedBrowserQuery): boolean {
    if (parsed.decks.length > 0 && !parsed.decks.includes(card.deckId)) return false;
    if (parsed.states.length > 0 && !parsed.states.includes(card.state)) return false;
    if (parsed.docs.length > 0 && (!card.rootId || !parsed.docs.includes(card.rootId))) return false;
    
    if (parsed.tags.length > 0) {
        const tags = card.tags || [];
        if (!parsed.tags.every(t => tags.includes(t))) return false;
    }
    
    if (parsed.text) {
        const q = parsed.text.toLowerCase();
        if (!(card.fullContent || card.content || '').toLowerCase().includes(q)) return false;
    }
    
    const conds = parsed.conditions;
    if (conds.priority && !checkNumberCondition(card.priority, conds.priority)) return false;
    if (conds.interval && !checkNumberCondition(card.interval, conds.interval)) return false;
    if (conds.reps && !checkNumberCondition(card.reps, conds.reps)) return false;
    if (conds.lapses && !checkNumberCondition(card.lapses, conds.lapses)) return false;
    if (conds.difficulty && !checkNumberCondition(card.difficulty, conds.difficulty)) return false;
    if (conds.retrievability && !checkNumberCondition(card.retrievability, conds.retrievability)) return false;
    if (conds.stability && !checkNumberCondition(card.stability, conds.stability)) return false;
    
    return true;
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

export async function getDocTree(rootIds: string[]): Promise<DocTreeNode[]> {
    const ids = Array.from(new Set((rootIds || []).filter(Boolean)));
    if (ids.length === 0) return [];
    
    try {
        const sqlQuery = `
            SELECT id, content, hpath
            FROM blocks
            WHERE id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
        `;
        
        const rows = await sql(sqlQuery);
        const foundIds = new Set((rows || []).map((r: any) => r.id));
        const result = (rows || []).map((r: any) => {
            const title = (r.content || '').trim() || String(r.hpath || '').split('/').pop() || r.id;
            return { id: r.id, title };
        });
        
        for (const id of ids) {
            if (!foundIds.has(id)) {
                result.push({ id, title: `📄 ${id} (已删除)` });
            }
        }
        
        return result;
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] getDocTree error:', err);
        return ids.map((id) => ({ id, title: id }));
    }
}

export async function loadQueueCards(
    blockIds: string[],
    queryText: string | undefined,
    unifiedDataSourceManager: UnifiedDataSourceManager
): Promise<BrowserCard[]> {
    const ids = Array.from(new Set((blockIds || []).filter(Boolean)));
    if (ids.length === 0) return [];

    try {
        // 从缓存或统一数据源获取卡片
        const cachedCards = cardCache.get();
        if (cachedCards) {
            const cardMap = new Map(cachedCards.map(c => [c.blockId, c]));
            let cards = ids.map(id => cardMap.get(id)).filter(Boolean) as BrowserCard[];
            
            if (queryText) {
                const parsed = parseQuery(queryText);
                cards = applyParsedQuery(cards, parsed);
            }
            
            const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
            return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
        }

        // 回退：从统一数据源加载
        const router = unifiedDataSourceManager.getRouter();
        const allCards = await router.getCards();
        const cardMap = new Map(allCards.map(c => [c.blockId, c]));
        
        const { attrsMap, rootIdMap, tagsMap } = await fetchBlockInfoBatched(ids);
        
        let cards: BrowserCard[] = ids
            .map(id => cardMap.get(id))
            .filter(Boolean)
            .map(card => {
                const customAttrs = attrsMap.get(card!.blockId) || {};
                const browserCard = transformFSRSCard(card!, customAttrs);
                browserCard.rootId = rootIdMap.get(card!.blockId) || browserCard.rootId || '';
                browserCard.tags = tagsMap.get(card!.blockId) || [];
                return browserCard;
            });

        const parsed = parseQuery(queryText || '');
        cards = applyParsedQuery(cards, parsed);
        const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
        return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] loadQueueCards error:', err);
        return [];
    }
}


// ============================================================================
// 批量操作（使用 StorageManager）
// ============================================================================

/**
 * 批量重置为新卡
 * ✅ 使用 StorageManager，移除 Riff API 调用
 */
export async function batchReset(
    blockIds: string[],
    storageManager: StorageManager
): Promise<number> {
    if (blockIds.length === 0) return 0;

    try {
        // ✅ 使用 StorageManager 批量更新
        const updates = blockIds.map(blockId => ({
            blockId,
            state: CardState.New,
            due: Date.now(),
            reps: 0,
            lapses: 0,
            lastReview: null,
        }));
        
        await storageManager.batchUpdateCards(updates as any);
        
        // 清除缓存
        cardCache.clear();
        
        console.log('[SiYuanMemo][CardBrowser] ✅ Batch reset completed:', blockIds.length);
        return blockIds.length;
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] Batch reset error:', err);
        return 0;
    }
}

/**
 * 批量暂停/取消暂停
 * ✅ 使用 StorageManager，移除 Riff API 调用
 */
export async function batchSuspend(
    blockIds: string[],
    suspend: boolean,
    storageManager: StorageManager
): Promise<number> {
    if (blockIds.length === 0) return 0;

    try {
        // ✅ 使用 StorageManager 批量更新
        const farFuture = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
        const updates = blockIds.map(blockId => ({
            blockId,
            suspended: suspend,
            due: suspend ? farFuture : Date.now(),
        }));
        
        await storageManager.batchUpdateCards(updates as any);
        
        // 同时更新块属性
        for (const blockId of blockIds) {
            try {
                if (suspend) {
                    await setBlockAttrs(blockId, { [ATTR_SUSPENDED]: 'true' });
                } else {
                    await setBlockAttrs(blockId, { [ATTR_SUSPENDED]: '' });
                }
                
                // 增量更新缓存
                cardCache.updateCard(blockId, { suspended: suspend });
            } catch (err) {
                console.error('[SiYuanMemo][CardBrowser] Update block attr error:', blockId, err);
            }
        }
        
        console.log('[SiYuanMemo][CardBrowser] ✅ Batch suspend completed:', blockIds.length);
        return blockIds.length;
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] Batch suspend error:', err);
        return 0;
    }
}

/**
 * 批量设置优先级
 */
export async function batchSetPriority(
    blockIds: string[],
    priority: number
): Promise<number> {
    if (blockIds.length === 0) return 0;

    let successCount = 0;
    const clampedPriority = Math.max(0, Math.min(100, priority));

    for (const blockId of blockIds) {
        try {
            // 更新 FSRSCard.priority（统一优先级存储）
            const card = storageManager.getCardByBlockId(blockId);
            if (card) {
                card.priority = clampedPriority;
                storageManager.setCard(card);
            }
            
            successCount++;
            
            // 增量更新缓存
            cardCache.updateCard(blockId, { priority: clampedPriority });
        } catch (err) {
            console.error('[SiYuanMemo][CardBrowser] Set priority error:', blockId, err);
        }
    }
    
    // 保存所有更新
    try {
        await storageManager.saveCards();
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] Save cards error:', err);
    }

    return successCount;
}

/**
 * 批量删除卡片
 * ✅ 使用 StorageManager，移除 Riff API 调用
 */
export async function batchDelete(
    blockIds: string[],
    storageManager: StorageManager
): Promise<number> {
    if (blockIds.length === 0) return 0;

    try {
        console.log('[batchDelete] 开始删除卡片:', blockIds.length);
        
        // ✅ 使用 StorageManager 删除
        await storageManager.deleteCards(blockIds);
        
        // 增量更新缓存
        cardCache.removeCards(blockIds);
        
        console.log('[batchDelete] ✅ Batch delete completed:', blockIds.length);
        return blockIds.length;
    } catch (err) {
        console.error('[batchDelete] Batch delete error:', err);
        return 0;
    }
}

/**
 * 批量重新调度
 * ✅ 使用 StorageManager，移除 Riff API 调用
 */
export async function batchReschedule(
    cards: BrowserCard[],
    mode: 'absolute' | 'relative',
    value: Date | number,
    storageManager: StorageManager
): Promise<number> {
    if (cards.length === 0) return 0;

    const newDue = mode === 'absolute'
        ? (value as Date).getTime()
        : Date.now() + (value as number) * 24 * 60 * 60 * 1000;

    try {
        // ✅ 使用 StorageManager 批量更新
        const updates = cards.map(card => ({
            blockId: card.blockId,
            due: newDue,
        }));
        
        await storageManager.batchUpdateCards(updates as any);
        
        console.log('[SiYuanMemo][CardBrowser] ✅ Batch reschedule completed:', cards.length);
        return cards.length;
    } catch (err) {
        console.error('[SiYuanMemo][CardBrowser] Batch reschedule error:', err);
        return 0;
    }
}

/**
 * 批量检测卡片类型并应用到块属性
 */
export async function batchDetectCardTypes(
    cards: BrowserCard[]
): Promise<{
    detected: number;
    updated: number;
    failed: number;
}> {
    if (cards.length === 0) {
        return { detected: 0, updated: 0, failed: 0 };
    }

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
                        [ATTR_CARD_TYPE]: cardType,
                    };

                    let aFactor: number | undefined;
                    if (cardType === 'topic') {
                        aFactor = initializeAFactor(card.priority);
                        attrs[ATTR_A_FACTOR] = aFactor.toString();
                    }

                    await setBlockAttrs(card.blockId, attrs);

                    const cacheUpdates: Partial<BrowserCard> = { cardType };
                    if (aFactor !== undefined) {
                        cacheUpdates.aFactor = aFactor;
                    }
                    cardCache.updateCard(card.blockId, cacheUpdates);
                    updated++;
                } catch (err) {
                    console.error(`[SiYuanMemo][CardBrowser] Failed to update card type for ${card.blockId}:`, err);
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
        console.error('[SiYuanMemo][CardBrowser] batchDetectCardTypes error:', err);
        return { detected: 0, updated: 0, failed: cards.length };
    }
}
