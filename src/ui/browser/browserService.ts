/**
 * 卡片浏览器数据服务
 */

import { riff } from '@/core/siyuan';

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

export interface ParsedBrowserQuery {
    text: string;
    tags: string[];
    decks: string[];
    states: CardState[];
    docs: string[];
}

export function parseQuery(input: string): ParsedBrowserQuery {
    const tokens = (input || '').trim().split(/\s+/).filter(Boolean);
    const tags: string[] = [];
    const decks: string[] = [];
    const docs: string[] = [];
    const states: CardState[] = [];
    const freeText: string[] = [];

    const pushUnique = (arr: string[], v: string) => {
        if (!v) return;
        if (!arr.includes(v)) arr.push(v);
    };

    for (const token of tokens) {
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
        id: realCardId,
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

    return next;
}

/** 加载所有卡片（分页获取全部） */
async function loadAllRiffBlocks(): Promise<any[]> {
    const allBlocks: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
        const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, pageSize);
        if (!data?.blocks || data.blocks.length === 0) break;

        allBlocks.push(...data.blocks);

        if (page >= data.pageCount) break;
        page++;
    }

    return allBlocks;
}

/** 加载卡片列表 */
export async function loadCards(
    preset: string,
    currentDocId?: string,
    queryText?: string
): Promise<BrowserCard[]> {
    try {
        // 获取所有 Riff 卡片
        const allBlocks = await loadAllRiffBlocks();
        if (allBlocks.length === 0) {
            return [];
        }

        // 获取块 ID 列表
        const blockIds = allBlocks.map((b: any) => b.id).filter(Boolean);

        // 获取自定义属性
        let attrsMap = new Map<string, Record<string, string>>();
        if (blockIds.length > 0) {
        const attrsResult = await sql(`
        SELECT block_id, name, value 
        FROM attributes 
        WHERE block_id IN (${blockIds.map(id => `'${escapeSQL(id)}'`).join(',')})
        AND name IN ('${ATTR_CARD_ID}', '${ATTR_PRIORITY}', '${ATTR_SUSPENDED}')
      `);
            (attrsResult || []).forEach((a: any) => {
                if (!attrsMap.has(a.block_id)) {
                    attrsMap.set(a.block_id, {});
                }
                attrsMap.get(a.block_id)![a.name] = a.value;
            });
        }

        // 获取 root_id 与 tags（IAL）
        let rootIdMap = new Map<string, string>();
        let tagsMap = new Map<string, string[]>();
        if (blockIds.length > 0) {
            const blocksResult = await sql(`
        SELECT id, root_id 
        FROM blocks 
        WHERE id IN (${blockIds.map(id => `'${escapeSQL(id)}'`).join(',')})
      `);
            (blocksResult || []).forEach((b: any) => {
                rootIdMap.set(b.id, b.root_id);
            });
            const ialResult = await sql(`
        SELECT id, ial
        FROM blocks
        WHERE id IN (${blockIds.map(id => `'${escapeSQL(id)}'`).join(',')})
      `);
            (ialResult || []).forEach((b: any) => {
                tagsMap.set(b.id, extractTagsFromIal(b.ial));
            });
        }

        // 转换为浏览器卡片
        let cards: BrowserCard[] = allBlocks.map((block: any) => {
            const customAttrs = attrsMap.get(block.id) || {};
            const card = transformRiffBlock(block, customAttrs);
            card.rootId = rootIdMap.get(block.id) || '';
            card.tags = tagsMap.get(block.id) || [];
            return card;
        });

        // 应用筛选
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        switch (preset) {
            case 'due':
                cards = cards.filter(c => c.due <= todayEnd && !c.suspended);
                break;
            case 'overdue':
                cards = cards.filter(c => c.due < now && !c.suspended);
                break;
            case 'new':
                cards = cards.filter(c => c.state === CardState.New && !c.suspended);
                break;
            case 'learning':
                cards = cards.filter(c => (c.state === CardState.Learning || c.state === CardState.Relearning) && !c.suspended);
                break;
            case 'leech':
                cards = cards.filter(c => c.lapses >= 8);
                break;
            case 'suspended':
                cards = cards.filter(c => c.suspended);
                break;
            case 'current-doc':
                if (currentDocId) {
                    cards = cards.filter(c => c.rootId === currentDocId);
                }
                break;
            case 'all':
            default:
                // 不筛选
                break;
        }

        const parsed = parseQuery(queryText || '');
        cards = applyParsedQuery(cards, parsed);

        return cards;
    } catch (err) {
        console.error('[CardBrowser] Load cards error:', err);
        return [];
    }
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
        const blocks = await riff.getRiffCardsByBlockIDs(ids);
        if (!blocks?.length) return [];

        const attrsMap = new Map<string, Record<string, string>>();
        const attrsResult = await sql(`
      SELECT block_id, name, value
      FROM attributes
      WHERE block_id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
        AND name IN ('${ATTR_CARD_ID}', '${ATTR_PRIORITY}', '${ATTR_SUSPENDED}')
    `);
        (attrsResult || []).forEach((a: any) => {
            if (!attrsMap.has(a.block_id)) attrsMap.set(a.block_id, {});
            attrsMap.get(a.block_id)![a.name] = a.value;
        });

        const blocksInfo = await sql(`
      SELECT id, root_id, ial
      FROM blocks
      WHERE id IN (${ids.map(id => `'${escapeSQL(id)}'`).join(',')})
    `);
        const rootIdMap = new Map<string, string>();
        const tagsMap = new Map<string, string[]>();
        (blocksInfo || []).forEach((b: any) => {
            rootIdMap.set(b.id, b.root_id);
            tagsMap.set(b.id, extractTagsFromIal(b.ial));
        });

        let cards: BrowserCard[] = (blocks || []).map((block: any) => {
            const customAttrs = attrsMap.get(block.id) || {};
            const card = transformRiffBlock(block, customAttrs);
            card.rootId = rootIdMap.get(block.id) || '';
            card.tags = tagsMap.get(block.id) || [];
            return card;
        });

        const parsed = parseQuery(queryText || '');
        cards = applyParsedQuery(cards, parsed);
        return cards;
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
        return blockIds.length;
    } catch (err) {
        console.error('[CardBrowser] Delete error:', err);
        return 0;
    }
}
