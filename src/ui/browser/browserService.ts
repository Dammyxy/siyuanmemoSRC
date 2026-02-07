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
import { getCurrentDayEnd } from '@/utils/dateUtils';
import { getDayStartHour } from '@/utils/configUtils';
import type { Plugin } from 'siyuan';

const { BUILTIN_DECK_ID } = riff;
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
    blockIdSet: Set<string>;  // 用于快速查找
    isComplete: boolean;      // 是否全量加载完成
}

/**
 * 卡片缓存管理器
 * - 支持 TTL 过期
 * - 支持增量更新
 * - 支持强制刷新
 */
class CardCacheManager {
    private cache: CacheEntry | null = null;
    private readonly TTL = 0;  // 禁用缓存，数据始终最新
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
    set(cards: BrowserCard[], isComplete = true): void {
        this.cache = {
            cards,
            timestamp: Date.now(),
            blockIdSet: new Set(cards.map(c => c.blockId)),
            isComplete
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
     * 检查缓存是否有效且完整
     */
    isValid(): boolean {
        return this.cache !== null && this.cache.isComplete && (Date.now() - this.cache.timestamp <= this.TTL);
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
        dueFormatted: formatDueDate(due),  // ✅ 使用 formatDueDate（可以显示"已过期"）
        stability,
        difficulty: riffCard.difficulty ?? 0,
        retrievability: calculateRetrievability(stability, elapsedDays),
        reps: riffCard.reps ?? 0,
        lapses: riffCard.lapses ?? 0,
        elapsedDays,
        scheduledDays,
        lastReview,
        lastReviewFormatted: formatHistoryDate(lastReview),  // ✅ 使用 formatHistoryDate（显示具体日期）

        // 新增字段
        interval: scheduledDays,
        firstReview,
        firstReviewFormatted: formatHistoryDate(firstReview),  // ✅ 使用 formatHistoryDate（显示具体日期）

        priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
        suspended: customAttrs[ATTR_SUSPENDED] === 'true',

        // ✅ Topic/Item 区分
        cardType: (customAttrs[ATTR_CARD_TYPE] as 'topic' | 'item' | undefined) || undefined,
        aFactor: parseFloat(customAttrs[ATTR_A_FACTOR] || '') || undefined,
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
                AND name IN (
                    '${ATTR_CARD_ID}',
                    '${ATTR_PRIORITY}',
                    '${ATTR_SUSPENDED}',
                    '${ATTR_CARD_TYPE}',
                    '${ATTR_A_FACTOR}'
                )
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
                    notifyUpdate([], true);
                    return [];
                }

                const blockIds = allBlocks.map((b: any) => b.id).filter(Boolean);
                console.log('[CardBrowser] 获取到', blockIds.length, '个块 ID，开始增量加载属性...');

                // Step 2: 分批加载属性并更新
                const cards: BrowserCard[] = [];
                const BATCH_SIZE = 500;
                
                // 为了让 UI 尽快看到数据，我们先 resolve 第一批
                let firstBatchResolved = false;
                let resolveFn: (value: BrowserCard[]) => void;
                const returnPromise = new Promise<BrowserCard[]>((resolve) => {
                    resolveFn = resolve;
                });

                (async () => {
                    try {
                        for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
                            const batchIds = blockIds.slice(i, i + BATCH_SIZE);
                            const batchBlocks = allBlocks.slice(i, i + BATCH_SIZE);
                            
                            const { attrsMap, rootIdMap, tagsMap } = await fetchBlockInfoBatched(batchIds);
                            
                            const batchCards: BrowserCard[] = batchBlocks.map((block: any) => {
                                const customAttrs = attrsMap.get(block.id) || {};
                                const card = transformRiffBlock(block, customAttrs);
                                card.rootId = rootIdMap.get(block.id) || '';
                                card.tags = tagsMap.get(block.id) || [];
                                return card;
                            });
                            
                            cards.push(...batchCards);
                            const isComplete = cards.length >= allBlocks.length;
                            
                            // 更新缓存
                            cardCache.set(cards, isComplete);
                            
                            // 通知订阅者
                            notifyUpdate(cards, isComplete);
                            
                            if (!firstBatchResolved) {
                                firstBatchResolved = true;
                                resolveFn(cards);
                            }
                        }
                    } catch (e) {
                        console.error('[CardBrowser] Progressive load error:', e);
                        if (!firstBatchResolved) resolveFn(cards);
                    } finally {
                        cardCache.setLoadingPromise(null);
                        const elapsed = Date.now() - startTime;
                        console.log(`[CardBrowser] 全量加载结束，共 ${cards.length} 张卡片，累计耗时 ${elapsed}ms`);
                    }
                })();

                return returnPromise;
            } catch (err) {
                console.error('[CardBrowser] 加载卡片失败:', err);
                cardCache.setLoadingPromise(null);
                return [];
            }
        })();

        cardCache.setLoadingPromise(loadPromise);
        return loadPromise;
    });
}

/**
 * 快速筛选：在内存中应用 preset 筛选
 * 
 * 根据预设类型过滤卡片列表。支持多种预设类型，包括：
 * - due: 到期卡片（使用自定义每日刷新时间）
 * - overdue: 过期卡片
 * - new: 新卡片
 * - learning: 学习中的卡片
 * - leech: 困难卡片（失败次数 >= 8）
 * - suspended: 暂停的卡片
 * - current-doc: 当前文档的卡片
 * - topic-only: 仅主题卡片
 * - item-only: 仅项目卡片
 * 
 * ## 自定义每日刷新时间
 * 
 * 对于 'due' 预设，使用用户配置的 dayStartHour 来计算"今天"的结束时间。
 * 例如：如果 dayStartHour = 4，则"今天"的结束时间是明天凌晨 4:00，
 * 而不是今天的 23:59:59。
 * 
 * 如果无法获取 plugin 实例或配置，则降级使用传统的 23:59:59 作为结束时间。
 * 
 * @param cards - 待过滤的卡片列表
 * @param preset - 预设类型
 * @param currentDocId - 当前文档 ID（用于 current-doc 预设）
 * @param plugin - 插件实例（用于获取 dayStartHour 配置）
 * @returns 过滤后的卡片列表
 * 
 * @see .kiro/specs/advanced-mode-due-cards-fix-and-custom-day-start/requirements.md
 * 
 * @example
 * ```typescript
 * // 获取到期卡片（使用自定义每日刷新时间）
 * const dueCards = applyPresetFilter(allCards, 'due', undefined, plugin);
 * 
 * // 获取当前文档的卡片
 * const currentDocCards = applyPresetFilter(allCards, 'current-doc', docId, plugin);
 * ```
 */
function applyPresetFilter(cards: BrowserCard[], preset: string, currentDocId?: string, plugin?: Plugin): BrowserCard[] {
    const now = new Date();
    
    // 使用基于 dayStartHour 的 todayEnd 计算
    let todayEnd: Date;
    if (plugin) {
        const dayStartHour = getDayStartHour(plugin);
        const dayEndTimestamp = getCurrentDayEnd(dayStartHour);
        todayEnd = new Date(dayEndTimestamp);
    } else {
        // 降级：使用传统的 23:59:59
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
        case 'topic-only':
            // 只显示明确标记为 topic 的卡片
            return cards.filter(c => c.cardType === 'topic');
        case 'item-only':
            // 显示 item 卡片，缺失 cardType 的卡片默认为 item
            return cards.filter(c => c.cardType === 'item' || !c.cardType);
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
    forceRefresh = false,
    cardType: 'all' | 'topic-only' | 'item-only' = 'all',  // ✅ 新增卡片类型参数
    plugin?: Plugin  // 🆕 新增 plugin 参数
): Promise<BrowserCard[]> {
    return PerformanceMonitor.measure('loadCards', async () => {
        try {
            // Step 1: 从缓存或数据源加载所有卡片
            const allCards = await loadAllCardsRaw(forceRefresh);
            if (allCards.length === 0) {
                return [];
            }

            // Step 2: 应用 preset 筛选（内存中快速过滤）
            let cards = applyPresetFilter(allCards, preset, currentDocId, plugin);

            // Step 2.5: ✅ 应用 cardType 筛选
            // 注意：不再使用基于内容的回退逻辑来推断卡片类型
            // 如果 cardType 字段缺失，默认为 'item'
            if (cardType === 'topic-only') {
                cards = cards.filter(c => c.cardType === 'topic');
            } else if (cardType === 'item-only') {
                cards = cards.filter(c => c.cardType === 'item' || !c.cardType);  // 缺失时默认为 item
            }

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
    
    console.log('[getDocTree] 🔍 Input rootIds:', rootIds);
    console.log('[getDocTree] 🔍 Unique IDs:', ids);
    
    try {
        const sqlQuery = `
      SELECT id, content, hpath
      FROM blocks
      WHERE id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
    `;
        console.log('[getDocTree] 🔍 SQL query:', sqlQuery);
        
        const rows = await sql(sqlQuery);
        console.log('[getDocTree] 🔍 SQL result:', rows);
        
        const foundIds = new Set((rows || []).map((r: any) => r.id));
        const result = (rows || []).map((r: any) => {
            const title = (r.content || '').trim() || String(r.hpath || '').split('/').pop() || r.id;
            return { id: r.id, title };
        });
        
        // ✅ 对于未找到的文档，添加占位符（显示ID）
        for (const id of ids) {
            if (!foundIds.has(id)) {
                console.warn('[getDocTree] ⚠️ Document not found in database:', id);
                result.push({ id, title: `📄 ${id} (已删除)` });
            }
        }
        
        console.log('[getDocTree] ✅ Final result:', result);
        return result;
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
export async function batchDelete(blockIds: string[], options?: { force?: boolean }): Promise<number> {
    if (blockIds.length === 0) return 0;

    console.log('[batchDelete] 开始删除卡片:', blockIds);
    console.log('[batchDelete] 强制删除模式:', options?.force);

    try {
        // 先检查卡片是否存在
        const existingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        console.log('[batchDelete] Riff 中存在的卡片数量:', existingCards?.length);
        console.log('[batchDelete] Riff 中存在的卡片 ID:', existingCards?.map((c: any) => c.id));
        
        if (!existingCards || existingCards.length === 0) {
            console.warn('[batchDelete] 这些卡片不在 Riff 中，无法删除');
            return 0;
        }

        // 删除卡片
        console.log('[batchDelete] 调用 riff.removeRiffCards...');
        await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
        console.log('[batchDelete] ✅ Riff API 调用成功');

        // 验证删除结果
        const remainingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        let actualDeleted = blockIds.length - (remainingCards?.length || 0);
        console.log('[batchDelete] 删除后剩余卡片数量:', remainingCards?.length);
        console.log('[batchDelete] 实际删除的卡片数量:', actualDeleted);

        // 🆕 如果删除失败且启用强制模式，尝试重置后再删除
        if (actualDeleted === 0 && options?.force && remainingCards?.length > 0) {
            console.warn('[batchDelete] ⚠️ 常规删除失败，尝试强制删除（重置后删除）...');
            
            try {
                // 步骤1: 重置卡片（清除损坏的数据）
                console.log('[batchDelete] 步骤1: 重置卡片...');
                await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
                console.log('[batchDelete] ✅ 重置成功');
                
                // 步骤2: 再次尝试删除
                console.log('[batchDelete] 步骤2: 再次尝试删除...');
                await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
                
                // 步骤3: 验证结果
                const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
                actualDeleted = blockIds.length - (finalCheck?.length || 0);
                console.log('[batchDelete] 强制删除后实际删除数量:', actualDeleted);
                
                if (actualDeleted > 0) {
                    console.log('[batchDelete] ✅ 强制删除成功');
                } else {
                    console.error('[batchDelete] ❌ 强制删除仍然失败，这些卡片可能需要手动清理数据库');
                    console.error('[batchDelete] 问题卡片 ID:', blockIds);
                }
            } catch (forceErr) {
                console.error('[batchDelete] 强制删除过程中出错:', forceErr);
                console.error('[batchDelete] 错误堆栈:', forceErr instanceof Error ? forceErr.stack : undefined);
            }
        }

        // 增量更新缓存：移除卡片
        if (actualDeleted > 0) {
            cardCache.removeCards(blockIds);
            console.log('[batchDelete] 缓存已更新，移除了', actualDeleted, '张卡片');
        }

        return actualDeleted;
    } catch (err) {
        console.error('[batchDelete] 删除失败:', err);
        console.error('[batchDelete] 错误堆栈:', err instanceof Error ? err.stack : undefined);
        return 0;
    }
}

/**
 * 批量检测卡片类型并应用到块属性
 *
 * 功能：
 * - 批量调用 detectCardType 检测类型
 * - 自动初始化 Topic 卡片的 A-Factor
 * - 批量更新块属性（每批 50 张）
 *
 * @param cards 需要检测的卡片列表
 * @returns 检测结果统计
 */
export async function batchDetectCardTypes(
    cards: BrowserCard[]
): Promise<{
    detected: number;      // 成功检测数量
    updated: number;       // 成功更新数量
    failed: number;        // 失败数量
}> {
    if (cards.length === 0) {
        return { detected: 0, updated: 0, failed: 0 };
    }

    try {
        // 1. 批量检测类型
        const blockIds = cards.map(c => c.blockId);
        const typeMap = await batchDetectCardType(blockIds);

        // 2. 准备批量更新
        let updated = 0;
        let failed = 0;

        // 3. 批量处理（每批 50 张，避免阻塞 UI）
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

                    // Topic 卡片初始化 A-Factor
                    let aFactor: number | undefined;
                    if (cardType === 'topic') {
                        aFactor = initializeAFactor(card.priority);
                        attrs[ATTR_A_FACTOR] = aFactor.toString();
                    }

                    await setBlockAttrs(card.blockId, attrs);

                    // ✅ 增量更新缓存
                    const cacheUpdates: Partial<BrowserCard> = { cardType };
                    if (aFactor !== undefined) {
                        cacheUpdates.aFactor = aFactor;
                    }
                    cardCache.updateCard(card.blockId, cacheUpdates);
                    updated++;
                } catch (err) {
                    console.error(`[CardBrowser] Failed to update card type for ${card.blockId}:`, err);
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
        console.error('[CardBrowser] batchDetectCardTypes error:', err);
        return { detected: 0, updated: 0, failed: cards.length };
    }
}
