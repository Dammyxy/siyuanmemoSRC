/**
 * Block Operations
 * 块操作相关的高级封装
 */

import * as api from './api.ts';
import type { FSRSCard } from '../../types/index.ts';

/** 块属性前缀 */
export const ATTR_PREFIX = 'custom-fsrs-';
export const ATTR_CARD_ID = `${ATTR_PREFIX}card-id`;
export const ATTR_PRIORITY = `${ATTR_PREFIX}priority`;
export const ATTR_IS_FLASHCARD = `${ATTR_PREFIX}flashcard`;
export const ATTR_RIFF_DECKS = 'custom-riff-decks';

/**
 * 将块标记为闪卡
 */
export async function markBlockAsCard(blockId: string, cardId: string, priority?: number): Promise<void> {
    const attrs: Record<string, string> = {
        [ATTR_CARD_ID]: cardId,
        [ATTR_IS_FLASHCARD]: 'true',
    };

    if (priority !== undefined) {
        attrs[ATTR_PRIORITY] = String(priority);
    }

    await api.setBlockAttrs(blockId, attrs);
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
        console.error('[FSRS] Failed to get block content:', err);
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
    const blocks = await api.getBlocksByAttr(ATTR_CARD_ID);
    return blocks.map(b => b.id);
}

/**
 * 根据文档 ID 获取其下所有闪卡块
 */
export async function getCardBlocksInDoc(docId: string): Promise<string[]> {
    const stmt = `
    SELECT b.id FROM blocks b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE b.root_id = '${docId}' AND a.name = '${ATTR_CARD_ID}' AND a.value != ''
  `;
    const blocks = await api.sql(stmt);
    return blocks.map(b => b.id);
}

/**
 * 获取文档及其子文档中的所有闪卡块
 */
export async function getCardBlocksInDocTree(docId: string): Promise<string[]> {
    // 获取文档路径
    const docInfo = await api.getDocInfo(docId);
    if (!docInfo) return [];

    const path = docInfo.path;
    const box = docInfo.box;

    // 查询该路径下所有文档的闪卡
    const stmt = `
    SELECT b.id FROM blocks b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE b.box = '${box}' 
      AND b.path LIKE '${path}%'
      AND a.name = '${ATTR_CARD_ID}' 
      AND a.value != ''
  `;
    const blocks = await api.sql(stmt);
    return blocks.map(b => b.id);
}

/**
 * 获取块的反向链接中的闪卡
 */
export async function getCardBlocksByBacklink(blockId: string): Promise<string[]> {
    const stmt = `
    SELECT b.id FROM blocks b
    INNER JOIN refs r ON b.id = r.block_id
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE r.def_block_id = '${blockId}'
      AND a.name = '${ATTR_CARD_ID}'
      AND a.value != ''
  `;
    const blocks = await api.sql(stmt);
    return blocks.map(b => b.id);
}

/**
 * 执行自定义 SQL 筛选闪卡
 */
export async function getCardBlocksBySql(customSql: string): Promise<string[]> {
    // 将用户 SQL 包装为获取闪卡的查询
    const stmt = `
    SELECT b.id FROM (${customSql}) b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE a.name = '${ATTR_CARD_ID}' AND a.value != ''
  `;
    const blocks = await api.sql(stmt);
    return blocks.map(b => b.id);
}
