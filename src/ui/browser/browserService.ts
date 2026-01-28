/**
 * 卡片浏览器数据服务
 * 
 * 性能优化版本：
 * - 合并 SQL 查询（4次 -> 1次）
 * - 内存缓存层（TTL + 增量更新）
 * - 优化筛选（内存快速过滤）
 */

import { riff } from '@/core/siyuan';
import { PerformanceMonitor } from '@/utils/performance';

const { BUILTIN_DECK_ID } = riff;
import { sql, setBlockAttrs } from '@/core/siyuan/api';
import { ATTR_CARD_ID } from '@/core/siyuan/block';
import {
    type BrowserCard,
    CardState,
    STATE_LABELS,
    calculateRetrievability,
    formatDate,
    truncateContent
} from './types';

/** 自定义属性名 */
const ATTR_PRIORITY = 'custom-fsrs-priority';
const ATTR_SUSPENDED = 'custom-fsrs-suspended';

// ============================================================================
// 缓存层实现
// ============================================================================

interface CacheEntry {
    cards: BrowserCard[];
    timestamp: number;
    blockIdSet: Set<string>;  // 用于快速查找
}

/**
 * 卡片缓存管理器
 * - 支持 TTL 过期
 * - 支持增量更新
 * - 支持强制刷新
 */
class CardCacheManager {
    private cache: CacheEntry | null = null;
    private readonly TTL = 60 * 1000;  // 60秒缓存
    private loading: Promise<BrowserCard[]> | null = null;  // 防止并发加载

    /**
     * 获取缓存的卡片（如果有效）
     */
    get(): BrowserCard[] | null {
        if (!this.cache) return null;
        if (Date.now() - this.cache.timestamp > this.TTL) {
            return null;  // 已过期
        }
        return this.cache.cards;
    }

    /**
     * 设置缓存
     */
    set(cards: BrowserCard[]): void {
        this.cache = {
            cards,
            timestamp: Date.now(),
            blockIdSet: new Set(cards.map(c => c.blockId)),
        };
    }

    /**
     * 清除缓存
     */
    clear(): void {
        this.cache = null;
        this.loading = null;
    }

    /**
     * 更新单张卡片（增量更新）
     */
    updateCard(blockId: string, updates: Partial<BrowserCard>): void {
        if (!this.cache) return;
        const idx = this.cache.cards.findIndex(c => c.blockId === blockId);
        if (idx >= 0) {
            this.cache.cards[idx] = { ...this.cache.cards[idx], ...updates };
        }
    }

    /**
     * 移除卡片（增量更新）
     */
    removeCards(blockIds: string[]): void {
        if (!this.cache) return;
        const removeSet = new Set(blockIds);
        this.cache.cards = this.cache.cards.filter(c => !removeSet.has(c.blockId));
        for (const id of blockIds) {
            this.cache.blockIdSet.delete(id);
        }
    }

    /**
     * 检查缓存是否有效
     */
    isValid(): boolean {
        return this.cache !== null && (Date.now() - this.cache.timestamp <= this.TTL);
    }

    /**
     * 获取缓存统计
     */
    getStats(): { count: number; age: number; valid: boolean } {
        if (!this.cache) return { count: 0, age: -1, valid: false };
        return {
            count: this.cache.cards.length,
            age: Date.now() - this.cache.timestamp,
            valid: this.isValid(),
        };
    }

    /**
     * 获取或设置 loading promise（防止并发加载）
     */
    getLoadingPromise(): Promise<BrowserCard[]> | null {
        return this.loading;
    }

    setLoadingPromise(promise: Promise<BrowserCard[]> | null): void {
        this.loading = promise;
    }
}

// 全局缓存实例
export const cardCache = new CardCacheManager();

function escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
}

function extractTagsFromIal(ial: string | undefined): string[] {
    const raw = ial || '';
    const matches = raw.match(/#[^#\s]+#/g);
    if (!matches) return [];
    const tags = matches.map(tag => tag.replace(/#/g, '')).filter(Boolean);
    return Array.from(new Set(tags));
}

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
    // ✅ 新增：FSRS 参数数值比较
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

    // ✅ 新增：FSRS 参数数值比较条件
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

    // ✅ 字段名别名映射
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

    // ✅ 解析数值比较表达式（如 prior<40, interval>7）
    const parseNumberCondition = (token: string): boolean => {
        // 匹配操作符：< > <= >= = !=
        const match = token.match(/^([a-zA-Z_]+)(<=|>=|<|>|=|!=)(-?\d+(\.\d+)?)$/);
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
        // ✅ 优先尝试解析数值比较表达式
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

/** 解析时间格式 (支持思源14位格式和ISO格式) */
function parseSiyuanTime(timeStr: string | undefined): Date | null {
    if (!timeStr) return null;

    // 1. 思源 14 位格式: 20260120150000 -> Date
    if (/^\d{14}$/.test(timeStr)) {
        const y = parseInt(timeStr.slice(0, 4));
        const m = parseInt(timeStr.slice(4, 6)) - 1;
        const d = parseInt(timeStr.slice(6, 8));
        const h = parseInt(timeStr.slice(8, 10));
        const min = parseInt(timeStr.slice(10, 12));
        const s = parseInt(timeStr.slice(12, 14));
        return new Date(Date.UTC(y, m, d, h, min, s));
    }

    // 2. ISO 格式: 2026-01-21T05:17:35+08:00 -> Date
    const isoParsed = new Date(timeStr);
    if (!isNaN(isoParsed.getTime())) {
        return isoParsed;
    }

    return null;
}

/** 格式化为思源时间格式 */
function formatSiyuanTime(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
}

/** 将 Riff Block 转换为浏览器卡片 */
function transformRiffBlock(block: any, customAttrs: Record<string, string>): BrowserCard {
    const riffCard = block.riffCard || {};
    const realCardId = String(block?.riffCardID || block?.riffCardId || riffCard?.id || '');
    const state = (riffCard.state ?? 0) as CardState;
    const due = parseSiyuanTime(riffCard.due) ?? new Date();
    const lastReview = parseSiyuanTime(riffCard.lastReview);
    const stability = riffCard.stability ?? 0;
    const elapsedDays = riffCard.elapsedDays ?? 0;
    const scheduledDays = riffCard.scheduledDays ?? 0;

    // 首次复习：如果 reps > 0 且有 lastReview，往前推算
    let firstReview: Date | null = null;
    if (riffCard.reps > 0 && lastReview) {
        // 简单估算：首次复习 = lastReview - elapsedDays（不精确）
        firstReview = lastReview;
    }

    return {
        id: realCardId || String(block.id || ''),
        fsrsCardId: customAttrs[ATTR_CARD_ID] || '',
        blockId: block.id,
        deckId: riffCard.deckID || BUILTIN_DECK_ID,
        content: truncateContent(block.content || block.fcontent || ''),
        fullContent: block.content || block.fcontent || '',

        state,
        stateLabel: STATE_LABELS[state] || '未知',
        due,
        dueFormatted: formatDate(due),
        stability,
        difficulty: riffCard.difficulty ?? 0,
        retrievability: calculateRetrievability(stability, elapsedDays),
        reps: riffCard.reps ?? 0,
        lapses: riffCard.lapses ?? 0,
        elapsedDays,
        scheduledDays,
        lastReview,
        lastReviewFormatted: formatDate(lastReview),

        // 新增字段
        interval: scheduledDays,
        firstReview,
        firstReviewFormatted: formatDate(firstReview),

        priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
        suspended: customAttrs[ATTR_SUSPENDED] === 'true',
    };
}

/** 检查数值是否满足条件 */
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

    // ✅ 新增：应用 FSRS 参数数值比较筛选
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

/** 加载所有卡片（分页获取全部，优化版：增大 pageSize） */
async function loadAllRiffBlocks(): Promise<any[]> {
    const allBlocks: any[] = [];
    let page = 1;
    const pageSize = 500;  // 优化：增大分页大小，减少网络请求次数

    while (true) {
        const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, pageSize);
        if (!data?.blocks || data.blocks.length === 0) break;

        allBlocks.push(...data.blocks);

        if (page >= data.pageCount) break;
        page++;
    }

    return allBlocks;
}

/**
 * 合并查询：一次性获取块信息和属性
 * 将原来的 3 次 SQL 查询合并为 1 次
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

    // 分批处理，每批 500 个 ID（避免 SQL 过长）
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const inClause = batchIds.map(id => `'${escapeSQL(id)}'`).join(',');

        // 合并查询：一次性获取 blocks 表和 attributes 表的数据
        const [blocksResult, attrsResult] = await Promise.all([
            sql(`SELECT id, root_id, ial FROM blocks WHERE id IN (${inClause})`),
            sql(`
                SELECT block_id, name, value 
                FROM attributes 
                WHERE block_id IN (${inClause})
                AND name IN ('${ATTR_CARD_ID}', '${ATTR_PRIORITY}', '${ATTR_SUSPENDED}')
            `)
        ]);

        // 处理 blocks 结果
        (blocksResult || []).forEach((b: any) => {
            rootIdMap.set(b.id, b.root_id || '');
            tagsMap.set(b.id, extractTagsFromIal(b.ial));
        });

        // 处理 attributes 结果
        (attrsResult || []).forEach((a: any) => {
            if (!attrsMap.has(a.block_id)) {
                attrsMap.set(a.block_id, {});
            }
            attrsMap.get(a.block_id)![a.name] = a.value;
        });
    }

    return { attrsMap, rootIdMap, tagsMap };
}

/**
 * 加载所有卡片原始数据（带缓存 + 性能监控）
 * 这是内部函数，返回未筛选的全部卡片
 */
async function loadAllCardsRaw(forceRefresh = false): Promise<BrowserCard[]> {
    return PerformanceMonitor.measure('loadAllCardsRaw', async () => {
        // 检查缓存
        if (!forceRefresh) {
            const cached = cardCache.get();
            if (cached) {
                console.log('[CardBrowser] 命中缓存，返回', cached.length, '张卡片');
                return cached;
            }

            // 防止并发加载
            const loadingPromise = cardCache.getLoadingPromise();
            if (loadingPromise) {
                console.log('[CardBrowser] 等待并发加载完成...');
                return loadingPromise;
            }
        }

        console.log('[CardBrowser] 开始加载卡片数据...');
        const startTime = Date.now();

        // 创建加载 Promise
        const loadPromise = (async () => {
            try {
                // Step 1: 获取所有 Riff 卡片
                const allBlocks = await loadAllRiffBlocks();
                if (allBlocks.length === 0) {
                    cardCache.set([]);
                    return [];
                }

                const blockIds = allBlocks.map((b: any) => b.id).filter(Boolean);
                console.log('[CardBrowser] 获取到', blockIds.length, '个块 ID');

                // Step 2: 合并查询块信息和属性（优化：1 次并行查询代替 3 次串行查询）
                const { attrsMap, rootIdMap, tagsMap } = await fetchBlockInfoBatched(blockIds);

                // Step 3: 转换为浏览器卡片
                const cards: BrowserCard[] = allBlocks.map((block: any) => {
                    const customAttrs = attrsMap.get(block.id) || {};
                    const card = transformRiffBlock(block, customAttrs);
                    card.rootId = rootIdMap.get(block.id) || '';
                    card.tags = tagsMap.get(block.id) || [];
                    return card;
                });

                // 存入缓存
                cardCache.set(cards);

                const elapsed = Date.now() - startTime;
                console.log(`[CardBrowser] 加载完成，共 ${cards.length} 张卡片，耗时 ${elapsed}ms`);

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
 * 快速筛选：在内存中应用 preset 筛选
 * 优化：使用 switch 和早期返回，避免不必要的遍历
 */
function applyPresetFilter(cards: BrowserCard[], preset: string, currentDocId?: string): BrowserCard[] {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

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
        case 'all':
        default:
            return cards;
    }
}

/** 加载卡片列表（优化版：使用缓存 + 合并查询 + 性能监控） */
export async function loadCards(
    preset: string,
    currentDocId?: string,
    queryText?: string,
    forceRefresh = false
): Promise<BrowserCard[]> {
    return PerformanceMonitor.measure('loadCards', async () => {
        try {
            // Step 1: 从缓存或数据源加载所有卡片
            const allCards = await loadAllCardsRaw(forceRefresh);
            if (allCards.length === 0) {
                return [];
            }

            // Step 2: 应用 preset 筛选（内存中快速过滤）
            let cards = applyPresetFilter(allCards, preset, currentDocId);

            // Step 3: 应用查询文本筛选
            const parsed = parseQuery(queryText || '');
            cards = applyParsedQuery(cards, parsed);

            // Step 4: 按 due 时间排序
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
 * 加载所有卡片（不应用筛选，用于统计）
 * 优化版：使用缓存
 */
export async function loadAllCards(forceRefresh = false): Promise<BrowserCard[]> {
    return loadAllCardsRaw(forceRefresh);
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

export interface DocTreeNode {
    id: string;
    title: string;
}

export async function getDocTree(rootIds: string[]): Promise<DocTreeNode[]> {
    const ids = Array.from(new Set((rootIds || []).filter(Boolean)));
    if (ids.length === 0) return [];
    try {
        const rows = await sql(`
      SELECT id, content, hpath
      FROM blocks
      WHERE id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
    `);
        return (rows || []).map((r: any) => {
            const title = (r.content || '').trim() || String(r.hpath || '').split('/').pop() || r.id;
            return { id: r.id, title };
        });
    } catch (err) {
        console.error('[CardBrowser] getDocTree error:', err);
        return ids.map((id) => ({ id, title: id }));
    }
}

export async function loadQueueCards(blockIds: string[], queryText?: string): Promise<BrowserCard[]> {
    const ids = Array.from(new Set((blockIds || []).filter(Boolean)));
    if (ids.length === 0) return [];

    try {
        // 优化：先尝试从缓存中获取卡片
        const cachedCards = cardCache.get();
        if (cachedCards) {
            // 快速路径：从缓存中查找
            const cardMap = new Map(cachedCards.map(c => [c.blockId, c]));
            let cards = ids.map(id => cardMap.get(id)).filter(Boolean) as BrowserCard[];
            
            // 应用查询筛选
            if (queryText) {
                const parsed = parseQuery(queryText);
                cards = applyParsedQuery(cards, parsed);
            }
            
            // 保持原始顺序
            const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
            return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
        }

        // 回退：从 API 加载
        const blocks = await riff.getRiffCardsByBlockIDs(ids);
        if (!blocks?.length) return [];

        // 合并查询块信息和属性
        const { attrsMap, rootIdMap, tagsMap } = await fetchBlockInfoBatched(ids);

        let cards: BrowserCard[] = (blocks || []).map((block: any) => {
            const customAttrs = attrsMap.get(block.id) || {};
            const card = transformRiffBlock(block, customAttrs);
            card.rootId = rootIdMap.get(block.id) || '';
            card.tags = tagsMap.get(block.id) || [];
            return card;
        });

        const parsed = parseQuery(queryText || '');
        cards = applyParsedQuery(cards, parsed);
        const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
        const ordered = ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
        return ordered;
    } catch (err) {
        console.error('[CardBrowser] loadQueueCards error:', err);
        return [];
    }
}

/** 批量重新调度 */
export async function batchReschedule(
    cards: BrowserCard[],
    mode: 'absolute' | 'relative',
    value: Date | number
): Promise<number> {
    if (cards.length === 0) return 0;

    const newDue = mode === 'absolute'
        ? (value as Date)
        : new Date(Date.now() + (value as number) * 24 * 60 * 60 * 1000);

    const dueStr = formatSiyuanTime(newDue);

    const resolveRiffCardIdsByBlockIds = async (blockIds: string[]): Promise<Map<string, string>> => {
        const map = new Map<string, string>();
        const ids = Array.from(new Set((blockIds || []).map(x => String(x || '')).filter(Boolean)));
        if (ids.length === 0) return map;

        const fetchOnce = async (batchIds: string[]) => {
            const blocks = await riff.getRiffCardsByBlockIDs(batchIds);
            for (const b of blocks as any[]) {
                const blockID = String(b?.id || '');
                const riffCardID = String(b?.riffCardID || b?.riffCardId || b?.riffCard?.id || '');
                if (blockID && riffCardID) map.set(blockID, riffCardID);
            }
        };

        for (let i = 0; i < ids.length; i += 200) {
            await fetchOnce(ids.slice(i, i + 200));
        }

        const pending = ids.filter((bid) => !map.has(bid));
        if (pending.length === 0) return map;

        for (let i = 0; i < pending.length; i += 200) {
            await riff.addRiffCards(BUILTIN_DECK_ID, pending.slice(i, i + 200));
        }

        for (let i = 0; i < pending.length; i += 200) {
            await fetchOnce(pending.slice(i, i + 200));
        }

        return map;
    };

    const missingBlockIds = cards.filter(c => !c.id && c.blockId).map(c => c.blockId);
    const resolved = missingBlockIds.length > 0 ? await resolveRiffCardIdsByBlockIds(missingBlockIds) : new Map<string, string>();

    // 构建批量更新数据
    const cardDues = cards
        .map(c => {
            const id = c.id || resolved.get(c.blockId) || '';
            return { id, due: dueStr };
        })
        .filter(x => x.id); // 确保有卡片 ID

    if (cardDues.length === 0) return 0;

    try {
        await riff.batchSetRiffCardsDueTime(cardDues);
        return cardDues.length;
    } catch (err) {
        console.error('[CardBrowser] Batch reschedule error:', err);
        return 0;
    }
}

/** 批量重置为新卡 */
export async function batchReset(blockIds: string[]): Promise<number> {
    if (blockIds.length === 0) return 0;

    try {
        // 使用 deck 类型重置
        await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
        
        // 清除缓存（重置会改变卡片状态，需要重新加载）
        cardCache.clear();
        
        return blockIds.length;
    } catch (err) {
        console.error('[CardBrowser] Batch reset error:', err);
        return 0;
    }
}

/** 批量暂停/取消暂停 */
export async function batchSuspend(blockIds: string[], suspend: boolean): Promise<number> {
    let successCount = 0;

    for (const blockId of blockIds) {
        try {
            if (suspend) {
                await setBlockAttrs(blockId, { [ATTR_SUSPENDED]: 'true' });
            } else {
                await setBlockAttrs(blockId, { [ATTR_SUSPENDED]: '' });
            }
            successCount++;
            
            // 增量更新缓存
            cardCache.updateCard(blockId, { suspended: suspend });
        } catch (err) {
            console.error('[CardBrowser] Suspend error:', blockId, err);
        }
    }

    return successCount;
}

/** 批量设置优先级 */
export async function batchSetPriority(blockIds: string[], priority: number): Promise<number> {
    let successCount = 0;
    const clampedPriority = Math.max(0, Math.min(100, priority));

    for (const blockId of blockIds) {
        try {
            await setBlockAttrs(blockId, { [ATTR_PRIORITY]: String(clampedPriority) });
            successCount++;
            
            // 增量更新缓存
            cardCache.updateCard(blockId, { priority: clampedPriority });
        } catch (err) {
            console.error('[CardBrowser] Set priority error:', blockId, err);
        }
    }

    return successCount;
}

/** 批量删除卡片 (从卡组移除) */
export async function batchDelete(blockIds: string[]): Promise<number> {
    if (blockIds.length === 0) return 0;

    try {
        await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
        
        // 增量更新缓存：移除卡片
        cardCache.removeCards(blockIds);
        
        return blockIds.length;
    } catch (err) {
        console.error('[CardBrowser] Delete error:', err);
        return 0;
    }
}
