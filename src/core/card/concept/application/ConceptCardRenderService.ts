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
import { createLogger } from '@/utils/logger';
import {
  resolveLuteRenderer,
  resolveSiyuanMemoPlugin,
} from '@/core/card/concept-definition/application/runtime';

const logger = createLogger('ConceptCardRenderService');

/**
 * 概念卡视图模型
 */
export interface ConceptCardViewModel extends BaseCardViewModel {
  conceptName: string;
  conceptBlockId: string;
  contentHtml: string;
}

interface ConceptCardInput {
  xiuyuanID?: string;
  meta?: {
    xiuyuanID?: string;
  };
}

interface XiuyuanLike {
  fieldMapping?: Record<string, unknown>;
  getMeta?: () => Record<string, unknown>;
  getFaces?: () => Array<{ questionBlockId?: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  async prepareViewModel(blockId: string, card?: ConceptCardInput): Promise<ConceptCardViewModel> {
    logger.debug('[ConceptCardRenderService] prepareViewModel called with:', {
      blockId,
      hasCard: !!card,
      xiuyuanID: card?.xiuyuanID,
      metaXiuyuanID: card?.meta?.xiuyuanID,
    });
    
    const xiuyuanID = card?.xiuyuanID || card?.meta?.xiuyuanID;
    if (!xiuyuanID) {
      logger.error('[ConceptCardRenderService] No xiuyuanID found in card:', card);
      throw new Error('No xiuyuanID found in card');
    }

    // 1. 从 Xiuyuan 存储中获取字段映射
    const xiuyuan = await this.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    // 2. 获取概念块 ID
    const conceptBlockId = this.resolveConceptBlockId(xiuyuan);
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

  private resolveConceptBlockId(xiuyuan: XiuyuanLike): string | null {
    const directMapping = isRecord(xiuyuan.fieldMapping)
      ? xiuyuan.fieldMapping
      : null;
    const directConcept = directMapping?.concept;
    if (typeof directConcept === 'string' && directConcept.length > 0) {
      return directConcept;
    }

    if (typeof xiuyuan.getMeta === 'function') {
      const meta = xiuyuan.getMeta();
      if (isRecord(meta.fieldMapping)) {
        const concept = meta.fieldMapping.concept;
        if (typeof concept === 'string' && concept.length > 0) {
          return concept;
        }
      }
    }

    if (typeof xiuyuan.getFaces === 'function') {
      const firstFace = xiuyuan.getFaces()[0];
      if (firstFace && typeof firstFace.questionBlockId === 'string' && firstFace.questionBlockId.length > 0) {
        return firstFace.questionBlockId;
      }
    }

    return null;
  }

  private async getXiuyuan(xiuyuanID: string): Promise<XiuyuanLike | null> {
    const plugin = resolveSiyuanMemoPlugin();
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const context = await plugin.getContext?.();
    const xiuyuanAppService = await context?.getXiuyuanApplicationService?.();
    if (!xiuyuanAppService || typeof xiuyuanAppService.getXiuyuan !== 'function') {
      throw new Error('XiuyuanApplicationService not available');
    }

    const rawResult = await xiuyuanAppService.getXiuyuan({ xiuyuanId: xiuyuanID });
    if (!isRecord(rawResult)) {
      return null;
    }

    const xiuyuan = rawResult.xiuyuan;
    return isRecord(xiuyuan) ? (xiuyuan as XiuyuanLike) : null;
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

  /**
   * 使用 Lute 渲染 Markdown
   */
  private renderMarkdown(kramdown: string): string {
    const lute = resolveLuteRenderer();
    if (!lute) {
      throw new Error('Lute not available');
    }
    return lute.Md2BlockDOM(kramdown);
  }
}
