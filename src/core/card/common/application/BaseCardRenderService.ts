/**
 * 基础卡片渲染服务
 * 
 * 职责：
 * - 提供通用的渲染辅助方法
 * - 不包含业务逻辑，只是工具方法集合
 * - 供各个卡片类型的 RenderService 继承使用
 * 
 * 注意：这不是一个完整的 DDD 层，只是共享代码
 */

import { getBlockBreadcrumb, getBlockAttrs } from '@/core/siyuan/api';
import { extractConceptName, hasConceptDefinitionSyntax } from '@/core/xiuyuan/cardMeta';
import type { BreadcrumbItem } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BaseCardRenderService');

type RawBreadcrumbItem = {
  id?: string;
  name?: string;
  type?: string;
};

export abstract class BaseCardRenderService {
  /**
   * 加载块的面包屑
   * 
   * @param blockId 块 ID
   * @param excludeLast 排除最后几项（默认 1，排除当前块）
   * @returns 面包屑列表
   * 
   * @description
   * CDF 规则：概念块只显示名称，隐藏定义
   * - 检查块属性 custom-fsrs-card-type === 'concept'
   * - 或检查内容是否包含 :: 语法
   * - 如果是概念块，使用 extractConceptName 提取名称
   * 
   * 🆕 只显示到文档块为止，过滤掉文档块之后的所有内容（避免剧透）
   */
  protected async loadBreadcrumbs(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      // 排除最后 N 项
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      // 🆕 找到最后一个文档块的位置
      let lastDocumentIndex = -1;
      for (let i = parentBreadcrumbs.length - 1; i >= 0; i--) {
        if (parentBreadcrumbs[i].type === 'NodeDocument') {
          lastDocumentIndex = i;
          break;
        }
      }
      
      // 🆕 只保留到最后一个文档块（包含）
      const filteredBreadcrumbs = lastDocumentIndex >= 0 
        ? parentBreadcrumbs.slice(0, lastDocumentIndex + 1)
        : parentBreadcrumbs;
      
      // 处理每个面包屑项，应用 CDF 规则
      const processedBreadcrumbs = await Promise.all(
        filteredBreadcrumbs.map(async (item: RawBreadcrumbItem) => {
          const itemId = item.id || '';
          let itemName = item.name || '';
          
          // 检查是否是概念块
          const isConcept = await this.isConceptBlock(itemId, itemName);
          
          // 如果是概念块，只显示概念名称（隐藏定义）
          if (isConcept) {
            itemName = extractConceptName(itemName);
          }
          
          return {
            id: itemId,
            name: itemName,
            type: item.type || 'NodeParagraph',
          };
        })
      );
      
      // 去重：使用 Map 按标准化后的 name 去重
      return this.deduplicateBreadcrumbs(processedBreadcrumbs);
    } catch (error) {
      logger.error('[BaseCardRenderService] Failed to load breadcrumbs:', error);
      return [];
    }
  }

  /**
   * 加载概念上下文（仅概念块）
   * 
   * @param blockId 块 ID
   * @param excludeLast 排除最后几项（默认 1，排除当前块）
   * @returns 概念上下文列表
   * 
   * @description
   * RemNote CDF 规则：只显示概念层级，过滤掉文档、标题等非概念块
   * - 只保留概念块（custom-fsrs-card-type === 'concept' 或包含 :: 语法）
   * - 提取概念名称（隐藏定义）
   * - 🆕 保留文档块作为路径，但标记为非概念
   */
  protected async loadConceptContext(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      logger.debug('[BaseCardRenderService] loadConceptContext - breadcrumbResult:', breadcrumbResult);
      
      // 排除最后 N 项
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      logger.debug('[BaseCardRenderService] loadConceptContext - parentBreadcrumbs:', parentBreadcrumbs);
      
      // 🆕 处理所有块，标记是否为概念块
      const contextItems: Array<BreadcrumbItem & { isConcept: boolean }> = [];
      
      for (const item of parentBreadcrumbs) {
        const itemId = item.id || '';
        let itemName = item.name || '';
        const itemType = item.type || 'NodeParagraph';
        
        logger.debug('[BaseCardRenderService] loadConceptContext - checking item:', { itemId, itemName, itemType });
        
        // 检查是否是概念块
        const isConcept = await this.isConceptBlock(itemId, itemName);
        
        logger.debug('[BaseCardRenderService] loadConceptContext - isConcept:', isConcept);
        
        if (isConcept) {
          // 提取概念名称（隐藏定义）
          itemName = extractConceptName(itemName);
          logger.debug('[BaseCardRenderService] loadConceptContext - extracted name:', itemName);
        }
        
        contextItems.push({
          id: itemId,
          name: itemName,
          type: itemType,
          isConcept, // 🆕 标记是否为概念
        });
      }
      
      logger.debug('[BaseCardRenderService] loadConceptContext - final contextItems:', contextItems);
      
      return contextItems;
    } catch (error) {
      logger.error('[BaseCardRenderService] Failed to load concept context:', error);
      return [];
    }
  }

  /**
   * 检查块是否是概念块
   * 
   * @param blockId 块 ID
   * @param content 块内容（可能只是标题，不完整）
   * @returns 是否是概念块
   * 
   * @description
   * 检查顺序：
   * 1. 先排除文档块（type === 'd'）
   * 2. 检查块属性 custom-fsrs-card-type === 'concept'
   * 3. 如果是列表项，查询其段落子块的内容
   * 4. 检查内容是否包含块引用 ((block-id)) 或 :: 语法
   */
  private async isConceptBlock(blockId: string, content: string): Promise<boolean> {
    try {
      // 🆕 方法 1：先获取块信息，排除文档块
      const { sql } = await import('@/core/siyuan/api');
      const blockResult = await sql(`
        SELECT content, markdown, type FROM blocks
        WHERE id = '${blockId}'
        LIMIT 1
      `);
      
      if (!blockResult || blockResult.length === 0) {
        return this.hasConceptSyntax(content);
      }
      
      const blockType = blockResult[0].type || '';
      
      // 🆕 优先排除文档块
      if (blockType === 'd') {
        logger.debug('[BaseCardRenderService] isConceptBlock - document block, excluded');
        return false;
      }
      
      // 方法 2：检查块属性
      const attrs = await getBlockAttrs(blockId);
      
      logger.debug('[BaseCardRenderService] isConceptBlock - attrs:', { blockId, attrs, blockType });
      
      if (attrs?.['custom-fsrs-card-type'] === 'concept') {
        return true;
      }
      
      // 方法 3：如果是列表项，查询其段落子块的内容
      if (blockType === 'i') {
        const paragraphResult = await sql(`
          SELECT content, markdown FROM blocks
          WHERE parent_id = '${blockId}' AND type = 'p'
          LIMIT 1
        `);
        
        if (paragraphResult && paragraphResult.length > 0) {
          const paragraphContent = paragraphResult[0].content || '';
          const paragraphMarkdown = paragraphResult[0].markdown || '';
          logger.debug('[BaseCardRenderService] isConceptBlock - list item paragraph:', { 
            blockId, 
            paragraphContent, 
            paragraphMarkdown 
          });
          return this.hasConceptSyntax(paragraphContent) || this.hasBlockReference(paragraphMarkdown);
        }
      }
      
      // 方法 4：其他类型块，直接检查 content 和 markdown
      const blockContent = blockResult[0].content || '';
      const blockMarkdown = blockResult[0].markdown || '';
      logger.debug('[BaseCardRenderService] isConceptBlock - block data:', { 
        blockId, 
        blockContent, 
        blockMarkdown, 
        blockType 
      });
      return this.hasConceptSyntax(blockContent) || this.hasBlockReference(blockMarkdown);
    } catch (error) {
      logger.error('[BaseCardRenderService] isConceptBlock error:', error);
      // 如果查询失败，fallback 到内容检查
      return this.hasConceptSyntax(content);
    }
  }

  /**
   * 检查内容是否包含概念语法
   * 
   * @param content 内容
   * @returns 是否包含 :: 语法
   */
  private hasConceptSyntax(content: string): boolean {
    return hasConceptDefinitionSyntax(content);
  }

  /**
   * 检查 markdown 是否包含块引用
   * 
   * @param markdown markdown 内容
   * @returns 是否包含块引用 ((block-id))
   */
  private hasBlockReference(markdown: string): boolean {
    // 匹配块引用：((block-id)) 或 ((block-id '名称'))
    const blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/;
    return blockRefPattern.test(markdown);
  }

  /**
   * 去重面包屑
   * 
   * @param breadcrumbs 原始面包屑列表
   * @returns 去重后的面包屑列表
   */
  private deduplicateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): BreadcrumbItem[] {
    const dedupMap = new Map<string, BreadcrumbItem>();
    
    for (const item of breadcrumbs) {
      // 标准化文本：去掉列表符号
      const normalizedName = item.name.replace(/^[•\-\d]+\.?\s*/, '').trim();
      dedupMap.set(normalizedName, {
        id: item.id,
        name: normalizedName,
        type: item.type,
      });
    }
    
    return Array.from(dedupMap.values());
  }

  /**
   * 创建答案分隔线 HTML
   * 
   * @param label 分隔线标签（默认"答案"）
   * @returns HTML 字符串
   */
  protected createAnswerDivider(label: string = '答案'): string {
    return `<div class="card-renderer__answer-divider"><span>${label}</span></div>`;
  }

  /**
   * 创建正面预览 HTML（灰显）
   * 
   * @param frontHtml 正面 HTML
   * @returns 包装后的 HTML
   */
  protected createFrontPreview(frontHtml: string): string {
    return `<div class="card-renderer__front-preview">${frontHtml}</div>`;
  }

  /**
   * 包装答案 HTML
   * 
   * @param answerHtml 答案 HTML
   * @returns 包装后的 HTML
   */
  protected wrapAnswer(answerHtml: string): string {
    return `<div class="card-renderer__answer">${answerHtml}</div>`;
  }

  /**
   * 组合背面 HTML（正面预览 + 分隔线 + 答案）
   * 
   * @param frontHtml 正面 HTML
   * @param answerHtml 答案 HTML
   * @param dividerLabel 分隔线标签
   * @returns 完整的背面 HTML
   */
  protected composeBackHtml(
    frontHtml: string,
    answerHtml: string,
    dividerLabel: string = '答案'
  ): string {
    const preview = this.createFrontPreview(frontHtml);
    const divider = this.createAnswerDivider(dividerLabel);
    const answer = this.wrapAnswer(answerHtml);
    
    return `${preview}${divider}${answer}`;
  }
}
