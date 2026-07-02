/**
 * Block Operations
 * 块操作相关的高级封装
 */

import * as api from './api.ts';
import { buildCardBlockIdStmt } from './cardBlockSql.ts';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SiyuanBlock');

type IdRow = {
    id: string;
};

type IdContentRow = {
    id: string;
    content: string;
};

/** 块属性前缀 */
export const ATTR_PREFIX = 'custom-fsrs-';
export const ATTR_CARD_ID = `${ATTR_PREFIX}card-id`;
export const ATTR_PRIORITY = `${ATTR_PREFIX}priority`;
export const ATTR_SUSPENDED = `${ATTR_PREFIX}suspended`;
export const ATTR_IS_FLASHCARD = `${ATTR_PREFIX}flashcard`;
export const ATTR_RIFF_DECKS = 'custom-riff-decks';

// Topic/Item 区分属性
export const ATTR_A_FACTOR = `${ATTR_PREFIX}a-factor`;      // A-Factor (Topic 卡片)
export const ATTR_CARD_TYPE = `${ATTR_PREFIX}card-type`;    // 卡片类型 (topic/item)

/** Topic 复习数据属性（持久化到块属性） */
export const ATTR_TOPIC_DUE = `${ATTR_PREFIX}topic-due`;
export const ATTR_TOPIC_INTERVAL = `${ATTR_PREFIX}topic-interval`;
export const ATTR_TOPIC_REPS = `${ATTR_PREFIX}topic-reps`;
export const ATTR_TOPIC_STATE = `${ATTR_PREFIX}topic-state`;

// Incremental reading attrs (canonical write path uses reading-*, legacy progressive-* stays readable)
export const ATTR_PROGRESSIVE_KIND = `${ATTR_PREFIX}reading-kind`;
export const ATTR_PROGRESSIVE_SESSION_ID = `${ATTR_PREFIX}reading-session-id`;
export const ATTR_PROGRESSIVE_MODE = `${ATTR_PREFIX}reading-mode`;
export const ATTR_PROGRESSIVE_SOURCE_DOC_ID = `${ATTR_PREFIX}reading-source-doc-id`;
export const ATTR_PROGRESSIVE_SOURCE_BLOCK_ID = `${ATTR_PREFIX}reading-source-block-id`;
export const ATTR_PROGRESSIVE_PIECE_INDEX = `${ATTR_PREFIX}reading-piece-index`;
export const ATTR_PROGRESSIVE_PIECE_COUNT = `${ATTR_PREFIX}reading-piece-count`;
export const ATTR_PROGRESSIVE_PIECE_STATE = `${ATTR_PREFIX}reading-piece-state`;
export const ATTR_PROGRESSIVE_WORKBENCH_ID = `${ATTR_PREFIX}reading-workbench-id`;
export const ATTR_PROGRESSIVE_PARENT_EXCERPT_ID = `${ATTR_PREFIX}reading-parent-excerpt-id`;
export const ATTR_PROGRESSIVE_TRACE_KIND = `${ATTR_PREFIX}reading-trace-kind`;
export const ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID = `${ATTR_PREFIX}reading-parent-topic-card-id`;
export const ATTR_PROGRESSIVE_STORAGE_MODE = `${ATTR_PREFIX}reading-storage-mode`;
export const ATTR_PROGRESSIVE_CREATION_RULE_ID = `${ATTR_PREFIX}reading-creation-rule-id`;
export const ATTR_PROGRESSIVE_ANSWER_FINGERPRINT = `${ATTR_PREFIX}reading-answer-fingerprint`;

export const LEGACY_ATTR_PROGRESSIVE_KIND = `${ATTR_PREFIX}progressive-kind`;
export const LEGACY_ATTR_PROGRESSIVE_SESSION_ID = `${ATTR_PREFIX}progressive-session-id`;
export const LEGACY_ATTR_PROGRESSIVE_MODE = `${ATTR_PREFIX}progressive-mode`;
export const LEGACY_ATTR_PROGRESSIVE_SOURCE_DOC_ID = `${ATTR_PREFIX}progressive-source-doc-id`;
export const LEGACY_ATTR_PROGRESSIVE_SOURCE_BLOCK_ID = `${ATTR_PREFIX}progressive-source-block-id`;
export const LEGACY_ATTR_PROGRESSIVE_PIECE_INDEX = `${ATTR_PREFIX}progressive-piece-index`;
export const LEGACY_ATTR_PROGRESSIVE_PIECE_COUNT = `${ATTR_PREFIX}progressive-piece-count`;
export const LEGACY_ATTR_PROGRESSIVE_PIECE_STATE = `${ATTR_PREFIX}progressive-piece-state`;
export const LEGACY_ATTR_PROGRESSIVE_WORKBENCH_ID = `${ATTR_PREFIX}progressive-workbench-id`;
export const LEGACY_ATTR_PROGRESSIVE_PARENT_EXCERPT_ID = `${ATTR_PREFIX}progressive-parent-excerpt-id`;
export const LEGACY_ATTR_PROGRESSIVE_TRACE_KIND = `${ATTR_PREFIX}progressive-trace-kind`;

export function getLegacyProgressiveAttrName(attrName: string): string | null {
    switch (attrName) {
        case ATTR_PROGRESSIVE_KIND:
            return LEGACY_ATTR_PROGRESSIVE_KIND;
        case ATTR_PROGRESSIVE_SESSION_ID:
            return LEGACY_ATTR_PROGRESSIVE_SESSION_ID;
        case ATTR_PROGRESSIVE_MODE:
            return LEGACY_ATTR_PROGRESSIVE_MODE;
        case ATTR_PROGRESSIVE_SOURCE_DOC_ID:
            return LEGACY_ATTR_PROGRESSIVE_SOURCE_DOC_ID;
        case ATTR_PROGRESSIVE_SOURCE_BLOCK_ID:
            return LEGACY_ATTR_PROGRESSIVE_SOURCE_BLOCK_ID;
        case ATTR_PROGRESSIVE_PIECE_INDEX:
            return LEGACY_ATTR_PROGRESSIVE_PIECE_INDEX;
        case ATTR_PROGRESSIVE_PIECE_COUNT:
            return LEGACY_ATTR_PROGRESSIVE_PIECE_COUNT;
        case ATTR_PROGRESSIVE_PIECE_STATE:
            return LEGACY_ATTR_PROGRESSIVE_PIECE_STATE;
        case ATTR_PROGRESSIVE_WORKBENCH_ID:
            return LEGACY_ATTR_PROGRESSIVE_WORKBENCH_ID;
        case ATTR_PROGRESSIVE_PARENT_EXCERPT_ID:
            return LEGACY_ATTR_PROGRESSIVE_PARENT_EXCERPT_ID;
        case ATTR_PROGRESSIVE_TRACE_KIND:
            return LEGACY_ATTR_PROGRESSIVE_TRACE_KIND;
        default:
            return null;
    }
}

/**
 * 将块标记为闪卡
 */
export async function markBlockAsCard(
    _blockId: string,
    _cardId: string,
    _priority?: number,
    _cardType?: 'topic' | 'item' | 'concept' | 'descriptor'
): Promise<void> {
    // Legacy shim: block-level fsrs attrs are deprecated and no longer written.
    return;
}

/**
 * 取消块的闪卡标记
 */
export async function unmarkBlockAsCard(blockId: string): Promise<void> {
    await api.setBlockAttrs(blockId, {
        [ATTR_CARD_ID]: '',
        [ATTR_PRIORITY]: '',
        [ATTR_IS_FLASHCARD]: '',
    });
}

/**
 * 获取块的闪卡 ID
 */
export async function getCardIdFromBlock(blockId: string): Promise<string | null> {
    const attrs = await api.getBlockAttrs(blockId);
    return attrs[ATTR_CARD_ID] || null;
}

export async function isFlashcardBlock(blockId: string): Promise<boolean> {
    const attrs = await api.getBlockAttrs(blockId);
    if (attrs[ATTR_CARD_ID]) return true;
    if ((attrs[ATTR_IS_FLASHCARD] || '').toLowerCase() === 'true') return true;
    if ((attrs.flashcard || '').toLowerCase() === 'true') return true;
    return false;
}

/**
 * 检查块是否有原生 Riff 标记 (用于 UI 显示红点)
 */
export async function hasRiffAttribute(blockId: string): Promise<boolean> {
    const attrs = await api.getBlockAttrs(blockId);
    return !!attrs[ATTR_RIFF_DECKS];
}

/**
 * 获取块内容（HTML 格式）
 */
export async function getBlockContent(blockId: string): Promise<string> {
    try {
        const { dom } = await api.getBlockDOM(blockId);
        return api.domToHtml(dom);
    } catch (err) {
        logger.error('Failed to get block content', { blockId, error: err });
        return `<p class="error">加载失败: ${blockId}</p>`;
    }
}

/**
 * 获取块纯文本
 */
export async function getBlockText(blockId: string): Promise<string> {
    try {
        const { dom } = await api.getBlockDOM(blockId);
        return api.domToText(dom);
    } catch {
        return '';
    }
}

/**
 * 获取所有带闪卡标记的块 ID
 */
export async function getAllCardBlockIds(): Promise<string[]> {
    const blocks = await api.getBlocksByAttr<IdContentRow>(ATTR_CARD_ID);
    return blocks.map(b => b.id);
}

export type CardBlockIdFilter = {
    type: 'doc' | 'tree' | 'sql' | 'backlink';
    value: string;
};

export async function getCardBlockIds(filter: CardBlockIdFilter): Promise<string[]> {
    const type = filter?.type;
    const value = String(filter?.value || '');
    if (!value) return [];
    if (type === 'doc') return getCardBlocksInDoc(value);
    if (type === 'tree') return getCardBlocksInDocTree(value);
    if (type === 'backlink') return getCardBlocksByBacklink(value);
    if (type === 'sql') return getCardBlocksBySql(value);
    return [];
}

/**
 * 根据文档 ID 获取其下所有闪卡块
 */
export async function getCardBlocksInDoc(docId: string): Promise<string[]> {
    const stmt = buildCardBlockIdStmt({ type: 'doc', docId });
    const blocks = await api.sql<IdRow>(stmt);
    return blocks.map(b => b.id);
}

/**
 * 获取文档及其子文档中的所有闪卡块
 */
export async function getCardBlocksInDocTree(docId: string): Promise<string[]> {
    // 获取文档路径
    const docInfo = await api.getDocInfo(docId);
    if (!docInfo) return [];

    const path = typeof docInfo.path === 'string' ? docInfo.path : '';
    const box = typeof docInfo.box === 'string' ? docInfo.box : '';
    if (!path || !box) return [];

    // 查询该路径下所有文档的闪卡
    const stmt = buildCardBlockIdStmt({ type: 'tree', box, pathPrefix: path });
    const blocks = await api.sql<IdRow>(stmt);
    return blocks.map(b => b.id);
}

/**
 * 获取块的反向链接中的闪卡
 */
export async function getCardBlocksByBacklink(blockId: string): Promise<string[]> {
    const stmt = buildCardBlockIdStmt({ type: 'backlink', defBlockId: blockId });
    const blocks = await api.sql<IdRow>(stmt);
    return blocks.map(b => b.id);
}

/**
 * 执行自定义 SQL 筛选闪卡
 */
export async function getCardBlocksBySql(customSql: string): Promise<string[]> {
    // 将用户 SQL 包装为获取闪卡的查询
    const stmt = buildCardBlockIdStmt({ type: 'sql', stmt: customSql });
    const blocks = await api.sql<IdRow>(stmt);
    return blocks.map(b => b.id);
}
