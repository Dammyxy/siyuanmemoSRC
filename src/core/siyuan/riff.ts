/**
 * Riff API - 对接思源原生闪卡系统
 * 通过调用 /api/riff/* 接口读写思源闪卡
 */

import { request, getBlocksByIds } from './api.ts';

// ==================== 卡包管理 ====================

/** 获取所有闪卡卡包 */
export async function getRiffDecks(): Promise<RiffDeck[]> {
    const data = await request('/riff/getRiffDecks', {});
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

/** 将块添加到卡包 */
export async function addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return request('/riff/addRiffCards', { deckID, blockIDs });
}

/** 从卡包移除卡片 */
export async function removeRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return request('/riff/removeRiffCards', { deckID, blockIDs });
}

/** 根据块 ID 获取闪卡信息 */
export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<RiffBlock[]> {
    const data = await request('/riff/getRiffCardsByBlockIDs', { blockIDs });
    const blocks: RiffBlock[] = data?.blocks || [];
    if (!blocks.length) return blocks;
    try {
        const blockInfos = await getBlocksByIds(blocks.map(b => b.id));
        const infoMap = new Map(blockInfos.map(info => [info.id, info]));
        return blocks.map((block) => {
            const info = infoMap.get(block.id);
            if (!info) return block;
            const created = info?.created_time ?? info?.created ?? info?.createdAt ?? info?.created_at ?? block.created;
            const updated = info?.last_edited_time ?? info?.updated ?? info?.updatedAt ?? info?.updated_at ?? block.updated;
            return { ...block, created, updated };
        });
    } catch {
        return blocks;
    }
}

/** 获取卡包中的所有卡片 */
export async function getRiffCards(deckID: string, page = 1, pageSize = 20): Promise<{
    blocks: RiffBlock[];
    total: number;
    pageCount: number;
}> {
    return request('/riff/getRiffCards', { id: deckID, page, pageSize });
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
    reviewedCards: any[] = []
): Promise<RiffReviewData> {
    const payload: any = {
        deckID,
        notebook: notebook || '',
        rootID: rootID || '',
    };
    if (reviewedCards.length > 0) {
        payload.reviewedCards = reviewedCards;
    }
    return request('/riff/getRiffDueCards', payload);
}

/** 提交复习评分 */
export async function reviewRiffCard(
    deckID: string,
    cardID: string,
    rating: 1 | 2 | 3 | 4,
    reviewedCards: any[] = []
): Promise<void> {
    const payload: any = {
        deckID,
        cardID,
        rating,
    };
    if (reviewedCards.length > 0) {
        payload.reviewedCards = reviewedCards;
    }
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
    reviewedCards: any[] = []
): Promise<RiffReviewData> {
    const payload: any = { rootID };
    if (reviewedCards.length > 0) {
        payload.reviewedCards = reviewedCards;
    }
    return request('/riff/getTreeRiffDueCards', payload);
}

export async function getNotebookRiffDueCards(
    notebook: string,
    reviewedCards: any[] = []
): Promise<RiffReviewData> {
    const payload: any = { notebook };
    if (reviewedCards.length > 0) {
        payload.reviewedCards = reviewedCards;
    }
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
