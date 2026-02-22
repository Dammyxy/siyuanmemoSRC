/**
 * 概念卡渲染服务
 * 
 * 职责：
 * - 协调概念卡的渲染逻辑
 * - 准备概念卡视图模型
 * - 继承基类的通用功能
 */

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { getBlockKramdown } from '@/core/siyuan/api';

/**
 * 概念卡视图模型
 */
export interface ConceptCardViewModel extends BaseCardViewModel {
  conceptName: string;
  conceptBlockId: string;
  contentHtml: string;
}

/**
 * 概念卡渲染服务
 */
export class ConceptCardRenderService extends BaseCardRenderService {
  /**
   * 准备视图模型
   * 
   * @param blockId 块 ID
   * @param card FSRSCard，包含 xiuyuanID
   * @returns 视图模型
   */
  async prepareViewModel(blockId: string, card?: any): Promise<ConceptCardViewModel> {
    console.log('[ConceptCardRenderService] prepareViewModel called with:', {
      blockId,
      hasCard: !!card,
      xiuyuanID: card?.xiuyuanID
    });
    
    const xiuyuanID = card?.xiuyuanID;
    if (!xiuyuanID) {
      console.error('[ConceptCardRenderService] No xiuyuanID found in card:', card);
      throw new Error('No xiuyuanID found in card');
    }

    // 1. 从 Xiuyuan 存储中获取字段映射
    const xiuyuan = await this.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    // 2. 获取概念块 ID
    const conceptBlockId = xiuyuan.fieldMapping.concept;
    if (!conceptBlockId) {
      throw new Error('Missing concept block ID in field mapping');
    }

    // 3. 获取概念名称（从块内容中提取）
    const conceptName = await this.getConceptName(conceptBlockId);

    // 4. 获取概念内容
    const { kramdown: contentKramdown } = await getBlockKramdown(conceptBlockId);
    if (!contentKramdown) {
      throw new Error(`Concept block has no content: ${conceptBlockId}`);
    }

    // 5. 使用 Lute 渲染 Markdown
    const contentHtml = this.renderMarkdown(contentKramdown);

    // 6. 使用基类方法加载面包屑
    const breadcrumbs = await this.loadBreadcrumbs(conceptBlockId);

    return {
      conceptName,
      conceptBlockId,
      contentHtml,
      breadcrumbs,
    };
  }

  /**
   * 获取概念名称
   * 
   * @param blockId 块 ID
   * @returns 概念名称
   */
  private async getConceptName(blockId: string): Promise<string> {
    const { sql } = await import('@/core/siyuan/api');
    
    const query = `
      SELECT content 
      FROM blocks 
      WHERE id = '${blockId}'
    `;
    
    const result = await sql(query);
    
    if (!result || result.length === 0) {
      throw new Error(`Block not found: ${blockId}`);
    }
    
    return result[0].content || '未命名概念';
  }
}
