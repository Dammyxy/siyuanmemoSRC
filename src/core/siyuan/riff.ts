/**
 * Riff API - 对接思源原生闪卡系统
 * 通过调用 /api/riff/* 接口读写思源闪卡
 */

import { request, getBlocksByIds } from './api.ts';

type ReviewedCardsPayload = {
    reviewedCards?: RiffReviewCard[];
};

type RiffCardsByBlockIdsResponse = {
    blocks?: RiffBlock[];
};

type BlockInfoRow = Record<string, unknown> & {
    id?: unknown;
    created_time?: unknown;
    created?: unknown;
    createdAt?: unknown;
    created_at?: unknown;
    last_edited_time?: unknown;
    updated?: unknown;
    updatedAt?: unknown;
    updated_at?: unknown;
};

const SIYUAN_BLOCK_ID_TIMESTAMP = /^(\d{14})-/;

function normalizeEpochMs(value: number): number | null {
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    return value < 10_000_000_000 ? value * 1_000 : value;
}

function parseSiyuanCompactTimestamp(value: string): number | null {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const [, year, month, day, hour, minute, second] = match;
    const timestamp = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
    );
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function parseRiffTimestampMs(value: unknown): number | null {
    if (typeof value === 'number') {
        return normalizeEpochMs(value);
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const compact = parseSiyuanCompactTimestamp(trimmed);
    if (compact !== null) {
        return compact;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
        return normalizeEpochMs(numeric);
    }
    return null;
}

function parseBlockIdTimestampMs(blockId: unknown): number | null {
    if (typeof blockId !== 'string') {
        return null;
    }
    const match = SIYUAN_BLOCK_ID_TIMESTAMP.exec(blockId.trim());
    if (!match) {
        return null;
    }
    return parseSiyuanCompactTimestamp(match[1]);
}

function resolveRiffBlockCreatedAtMs(block: RiffBlock): number | null {
    return parseRiffTimestampMs(block.created)
        ?? parseRiffTimestampMs(block.updated)
        ?? parseBlockIdTimestampMs(block.id);
}

function toRiffTimestamp(value: unknown, fallback: string): string {
    const timestamp = parseRiffTimestampMs(value);
    if (timestamp !== null) {
        return new Date(timestamp).toISOString();
    }
    return fallback;
}

function withReviewedCards<T extends Record<string, unknown>>(
    payload: T,
    reviewedCards: readonly RiffReviewCard[]
): T & ReviewedCardsPayload {
    if (reviewedCards.length === 0) {
        return payload;
    }

    return {
        ...payload,
        reviewedCards: [...reviewedCards],
    };
}

async function enrichRiffBlocksWithTimestamps(blocks: RiffBlock[]): Promise<RiffBlock[]> {
    const blockIdsNeedingInfo = Array.from(new Set(
        blocks
            .filter(block => parseRiffTimestampMs(block.created) === null && parseRiffTimestampMs(block.updated) === null)
            .map(block => String(block.id || '').trim())
            .filter(Boolean),
    ));
    if (blockIdsNeedingInfo.length === 0) {
        return blocks;
    }

    try {
        const blockInfos = await getBlocksByIds<BlockInfoRow>(blockIdsNeedingInfo);
        const infoMap = new Map(blockInfos.map(info => [String(info.id || '').trim(), info]));
        return blocks.map((block) => {
            const info = infoMap.get(String(block.id || '').trim());
            if (!info) return block;
            const created = info.created_time ?? info.created ?? info.createdAt ?? info.created_at ?? block.created;
            const updated = info.last_edited_time ?? info.updated ?? info.updatedAt ?? info.updated_at ?? block.updated;
            return {
                ...block,
                created: toRiffTimestamp(created, block.created),
                updated: toRiffTimestamp(updated, block.updated),
            };
        });
    } catch {
        return blocks;
    }
}

// ==================== 卡包管理 ====================

/** 获取所有闪卡卡包 */
export async function getRiffDecks(): Promise<RiffDeck[]> {
    const data = await request<RiffDeck[]>('/riff/getRiffDecks', {});
    return data || [];
}

/** 创建卡包 */
export async function createRiffDeck(name: string): Promise<RiffDeck> {
    return request('/riff/createRiffDeck', { name });
}

/** 删除卡包 */
export async function removeRiffDeck(deckID: string): Promise<void> {
    return request('/riff/removeRiffDeck', { deckID });
}

/** 重命名卡包 */
export async function renameRiffDeck(deckID: string, name: string): Promise<void> {
    return request('/riff/renameRiffDeck', { deckID, name });
}

// ==================== 卡片管理 ====================

/** 从卡包移除卡片 */
/** 根据块 ID 获取闪卡信息 */
export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<RiffBlock[]> {
    const data = await request<RiffCardsByBlockIdsResponse>('/riff/getRiffCardsByBlockIDs', { blockIDs });
    const blocks: RiffBlock[] = data?.blocks || [];
    if (!blocks.length) return blocks;
    try {
        const blockInfos = await getBlocksByIds<BlockInfoRow>(blocks.map(b => b.id));
        const infoMap = new Map(blockInfos.map(info => [info.id, info]));
        return blocks.map((block) => {
            const info = infoMap.get(block.id);
            if (!info) return block;
            const created = info?.created_time ?? info?.created ?? info?.createdAt ?? info?.created_at ?? block.created;
            const updated = info?.last_edited_time ?? info?.updated ?? info?.updatedAt ?? info?.updated_at ?? block.updated;
            return {
                ...block,
                created: toRiffTimestamp(created, block.created),
                updated: toRiffTimestamp(updated, block.updated),
            };
        });
    } catch {
        return blocks;
    }
}

/** 获取卡包中的所有卡片（旧版 API - 分页） */
export async function getRiffCards(deckID: string, page?: number, pageSize?: number): Promise<{
    blocks: RiffBlock[];
    total: number;
    pageCount: number;
}>;

/** 获取卡包中的所有卡片（新版 API - 支持过滤选项） */
export async function getRiffCards(deckID: string, options?: {
    dueOnly?: boolean;
    notebook?: string;
    rootID?: string;
    includeNew?: boolean;
}): Promise<RiffBlock[]>;

/** 获取卡包中的所有卡片（实现） */
export async function getRiffCards(
    deckID: string,
    pageOrOptions?: number | {
        dueOnly?: boolean;
        notebook?: string;
        rootID?: string;
        includeNew?: boolean;
    },
    pageSize?: number
): Promise<{ blocks: RiffBlock[]; total: number; pageCount: number } | RiffBlock[]> {
    // 旧版 API：getRiffCards(deckID, page, pageSize)
    if (typeof pageOrOptions === 'number' || pageOrOptions === undefined) {
        const page = pageOrOptions || 1;
        const size = pageSize || 20;
        return request('/riff/getRiffCards', { id: deckID, page, pageSize: size });
    }
    
    // 新版 API：getRiffCards(deckID, options)
    const options = pageOrOptions;
    
    // 如果指定了 dueOnly，使用 getRiffDueCards
    if (options.dueOnly) {
        const data = await getRiffDueCards(deckID, options.notebook, options.rootID);
        if (!data || !data.cards || data.cards.length === 0) return [];
        const blockIDs = data.cards.map(c => c.blockID);
        return getRiffCardsByBlockIDs(blockIDs);
    }
    
    // 否则获取所有卡片（分页）
    const allCards: RiffBlock[] = [];
    let page = 1;
    const size = 100;
    
    while (true) {
        let data: { blocks: RiffBlock[]; total: number; pageCount: number };
        
        if (options.notebook) {
            data = await getNotebookRiffCards(options.notebook, page, size);
        } else if (options.rootID) {
            data = await getTreeRiffCards(options.rootID, page, size);
        } else {
            data = await request('/riff/getRiffCards', { id: deckID, page, pageSize: size });
        }
        
        if (!data.blocks || data.blocks.length === 0) break;
        
        allCards.push(...data.blocks);
        
        if (page >= data.pageCount) break;
        page++;
    }
    
    return allCards;
}

/** 获取新卡片（增量同步用）
 * 
 * @param deckID 卡包 ID
 * @param since 时间戳（毫秒），只获取此时间之后创建的卡片
 * @returns 新卡片列表
 */
export async function getRiffNewCards(deckID: string, since?: number): Promise<RiffBlock[]> {
    // 获取所有卡片
    const allCards = await getRiffCards(deckID, { includeNew: true });
    
    if (since !== undefined && since > 0) {
        const enrichedCards = await enrichRiffBlocksWithTimestamps(allCards);
        return enrichedCards.filter((card) => {
            const created = resolveRiffBlockCreatedAtMs(card);
            return created !== null && created > since;
        });
    }
    
    return allCards;
}

/** 获取文档树下的闪卡 */
export async function getTreeRiffCards(rootID: string, page = 1, pageSize = 20): Promise<{
    blocks: RiffBlock[];
    total: number;
    pageCount: number;
}> {
    return request('/riff/getTreeRiffCards', { id: rootID, page, pageSize });
}

/** 获取笔记本下的闪卡 */
export async function getNotebookRiffCards(notebookID: string, page = 1, pageSize = 20): Promise<{
    blocks: RiffBlock[];
    total: number;
    pageCount: number;
}> {
    return request('/riff/getNotebookRiffCards', { id: notebookID, page, pageSize });
}

// ==================== 复习相关 ====================

/** 获取到期卡片（用于复习） */
export async function getRiffDueCards(
    deckID: string,
    notebook?: string,
    rootID?: string,
    reviewedCards: readonly RiffReviewCard[] = []
): Promise<RiffReviewData> {
    const payload = withReviewedCards({
        deckID,
        notebook: notebook || '',
        rootID: rootID || '',
    }, reviewedCards);
    return request('/riff/getRiffDueCards', payload);
}

/** 提交复习评分 */
export async function reviewRiffCard(
    deckID: string,
    cardID: string,
    rating: 1 | 2 | 3 | 4,
    reviewedCards: readonly RiffReviewCard[] = []
): Promise<void> {
    const payload = withReviewedCards({
        deckID,
        cardID,
        rating,
    }, reviewedCards);
    return request('/riff/reviewRiffCard', payload);
}

/** 跳过复习 */
export async function skipReviewRiffCard(deckID: string, cardID: string): Promise<void> {
    return request('/riff/skipReviewRiffCard', { deckID, cardID });
}

/** 重置闪卡 */
export async function resetRiffCards(
    type: 'notebook' | 'tree' | 'deck',
    id: string,
    deckID: string,
    blockIDs?: string[]
): Promise<void> {
    return request('/riff/resetRiffCards', { type, id, deckID, blockIDs });
}

/** 批量设置到期时间 */
export async function batchSetRiffCardsDueTime(
    cardDues: Array<{ id: string; due: string }>
): Promise<void> {
    return request('/riff/batchSetRiffCardsDueTime', { cardDues });
}

export async function getTreeRiffDueCards(
    rootID: string,
    reviewedCards: readonly RiffReviewCard[] = []
): Promise<RiffReviewData> {
    const payload = withReviewedCards({ rootID }, reviewedCards);
    return request('/riff/getTreeRiffDueCards', payload);
}

export async function getNotebookRiffDueCards(
    notebook: string,
    reviewedCards: readonly RiffReviewCard[] = []
): Promise<RiffReviewData> {
    const payload = withReviewedCards({ notebook }, reviewedCards);
    return request('/riff/getNotebookRiffDueCards', payload);
}

// ==================== 类型定义 ====================

/** 卡包 */
export interface RiffDeck {
    id: string;
    name: string;
    size: number;
    created: string;
    updated: string;
}

/** 闪卡块信息 */
export interface RiffBlock {
    id: string;
    box: string;
    path: string;
    hPath: string;
    content: string;
    created: string;
    updated: string;
    type: string;
    subType: string;
    ial: Record<string, string>;
    riffCardID?: string;
    riffCardId?: string;
    // 卡片信息
    riffCard?: RiffCard;
}

/** 卡片调度信息 */
export interface RiffCard {
    id: string;           // 卡片 ID
    blockID: string;      // 块 ID
    deckID: string;       // 卡包 ID
    due: string;          // 到期时间 ISO 格式
    reps: number;         // 复习次数
    lapses: number;       // 遗忘次数
    state: number;        // 状态 0=New, 1=Learning, 2=Review, 3=Relearning
    lastReview: string;   // 上次复习时间
    stability: number;    // 稳定性
    difficulty: number;   // 难度
    elapsedDays: number;  // 经过天数
    scheduledDays: number; // 预定间隔
}

/** 复习数据 */
export interface RiffReviewData {
    cards: RiffReviewCard[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
}

/** 待复习卡片 */
export interface RiffReviewCard {
    cardID: string;
    blockID: string;
    deckID: string;
    nextDues: {
        again: string;
        hard: string;
        good: string;
        easy: string;
    };
}

// ==================== 工具函数 ====================

/** 内置默认卡包 ID */
export const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

/** 获取所有到期卡片数量 */
export async function getDueCardCount(): Promise<number> {
    try {
        const data = await getRiffDueCards(BUILTIN_DECK_ID);
        return data?.unreviewedCount || 0;
    } catch {
        return 0;
    }
}

/** 获取所有闪卡块 ID */
export async function getAllRiffBlockIDs(): Promise<string[]> {
    const allIDs: string[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
        const data = await getRiffCards(BUILTIN_DECK_ID, page, pageSize);
        if (!data.blocks || data.blocks.length === 0) break;

        allIDs.push(...data.blocks.map(b => b.id));

        if (page >= data.pageCount) break;
        page++;
    }

    return allIDs;
}
