/**
 * 列表模版卡专用创建方法
 * 
 * 列表模版卡的特殊性：
 * - 1 个 Xiuyuan → N 张 FSRSCard（N = 子列表项数量）
 * - 每张卡片的问题相同（父列表项），答案不同（各个子列表项）
 * - 支持提示功能：使用 `::` 分隔提示和答案
 * - 渐进式显示：复习时显示已学过的答案 + 当前提示
 */

import type { IXiuyuan, ICardMapping, IXiuyuanField } from './types';
import type { XiuyuanStorage } from './storage';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { CardState, CardType } from '@/types';
import { ok, err, type Result } from '@/types/result';
import { sql } from '@/core/siyuan/api';
import { 
  generateXiuyuanCardID, 
  calculateRenderBlockIDs,
  type XiuyuanCardMeta 
} from './cardMeta';

/**
 * 解析子列表项文本，提取提示和答案
 * 
 * 格式：`? 提示 :: 答案` 或 `提示 :: 答案`
 * 
 * @param text 子列表项文本
 * @returns { cue: 提示文本, answer: 答案文本 }
 */
function parseCueAndAnswer(text: string): { cue: string; answer: string } {
  const parts = text.split('::');
  
  if (parts.length >= 2) {
    let cue = parts[0].trim();
    const answer = parts.slice(1).join('::').trim();
    
    // 移除开头的 `?` 标记
    if (cue.startsWith('?')) {
      cue = cue.substring(1).trim();
    }
    
    return { cue, answer };
  }
  
  // 没有 `::` 分隔符，整个文本作为答案
  return { cue: '', answer: text.trim() };
}

/**
 * 创建列表模版卡
 * 
 * @param parentBlockId 父列表项 ID（问题）
 * @param childBlockIds 子列表项 ID 列表（答案）
 * @param templateID 模板 ID（应该是 'builtin-list-item'）
 * @param xiuyuanStorage Xiuyuan 存储
 * @param storageManager 卡片存储
 * @returns Result，成功时包含创建的 Xiuyuan 和 CardMapping 数组
 */
export async function createListTemplateCards(
  parentBlockId: string,
  childBlockIds: string[],
  templateID: string,
  xiuyuanStorage: XiuyuanStorage,
  storageManager: StorageManager
): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>> {
  try {
    const template = xiuyuanStorage.getTemplate(templateID);
    if (!template) {
      return err(new Error(`Template not found: ${templateID}`));
    }

    if (!template.cardRules || template.cardRules.length === 0) {
      return err(new Error('Template has no card rules'));
    }

    const rule = template.cardRules[0]; // 列表模版只有一个规则

    // 0. 获取父列表项的段落块 ID（用于问题显示）
    // 思源结构：列表项(i) → 段落(p) + 列表容器(l)
    const paragraphResult = await sql(`
      SELECT id FROM blocks
      WHERE parent_id = '${parentBlockId}'
      AND type = 'p'
      LIMIT 1
    `);
    
    if (!paragraphResult || paragraphResult.length === 0) {
      return err(new Error('Parent list item has no paragraph block'));
    }
    
    const parentParagraphId = paragraphResult[0].id;

    // 1. 获取所有子列表项的文本内容
    const childrenContentResult = await sql(`
      SELECT id, content FROM blocks
      WHERE id IN (${childBlockIds.map(id => `'${id}'`).join(',')})
      ORDER BY id ASC
    `);
    
    if (!childrenContentResult || childrenContentResult.length === 0) {
      return err(new Error('Failed to fetch children content'));
    }
    
    // 解析每个子列表项的提示和答案
    const childrenData = childrenContentResult.map((row: any) => ({
      id: row.id,
      cue: parseCueAndAnswer(row.content).cue,
      answer: parseCueAndAnswer(row.content).answer,
    }));

    // 2. 创建 Xiuyuan（包含所有块）
    const allBlockIds = [parentParagraphId, ...childBlockIds];
    const fields: IXiuyuanField[] = [
      { name: 'question', blockID: parentParagraphId, marker: 'question' },
      { name: 'answer', blockID: '', marker: 'answer' }, // 答案字段会被每张卡片覆盖
    ];

    const xiuyuan = xiuyuanStorage.createXiuyuan({
      blockIDs: allBlockIds,
      fields,
      templateID,
    });

    // 3. 为每个子列表项创建一张 FSRSCard
    const cards: ICardMapping[] = [];
    const now = Date.now();

    for (let i = 0; i < childrenData.length; i++) {
      const childData = childrenData[i];
      
      // 生成独立的卡片 ID
      const cardID = generateXiuyuanCardID(xiuyuan.id, i);
      
      // 每张卡片有自己的字段映射
      const fieldMapping = {
        question: parentParagraphId,
        answer: childData.id,
      };
      
      // 计算渲染信息
      const { frontBlockIDs, backBlockIDs } = calculateRenderBlockIDs(
        rule.frontFields,
        rule.backFields,
        fieldMapping
      );
      
      // 主块 ID（用于卡片浏览器显示）
      const mainBlockID = childData.id;
      
      // 创建 CardMapping
      const mapping: ICardMapping = {
        xiuyuanID: xiuyuan.id,
        cardID,
        frontFields: rule.frontFields,
        backFields: rule.backFields,
        typeMarker: rule.typeMarker,
      };
      xiuyuanStorage.createMapping(mapping);
      cards.push(mapping);

      // 创建 FSRSCard
      const meta: XiuyuanCardMeta = {
        xiuyuanID: xiuyuan.id,
        templateID,
        ruleIndex: i,
        frontFields: rule.frontFields,
        backFields: rule.backFields,
        fieldMapping,
        frontBlockIDs,
        backBlockIDs,
        // 🆕 存储提示和答案信息
        cue: childData.cue,
        answer: childData.answer,
        // 🆕 存储所有子列表项信息（用于渐进式显示）
        allChildren: childrenData.map((c, idx) => ({
          id: c.id,
          cue: c.cue,
          answer: c.answer,
          index: idx,
        })),
        currentIndex: i,
      };

      const fsrsCard: FSRSCard = {
        id: cardID,
        blockId: mainBlockID,
        due: now,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: now,
        updatedAt: now,
        meta,
      };
      
      storageManager.setCard(fsrsCard);
    }

    // 4. 持久化
    const saveResult = await xiuyuanStorage.save();
    if (!saveResult.ok) {
      console.warn('[Xiuyuan] Save failed:', saveResult.error);
    }
    await storageManager.saveCards();
    
    return ok({ xiuyuan, cards });
  } catch (error) {
    console.error('[Xiuyuan] createListTemplateCards failed:', error);
    return err(error as Error);
  }
}
