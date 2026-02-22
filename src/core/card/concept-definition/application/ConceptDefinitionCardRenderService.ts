/**
 * 概念定义卡渲染服务
 * 
 * 职责：
 * - 协调概念定义卡的渲染逻辑
 * - 准备概念定义卡视图模型
 * - 处理挖空逻辑
 * - 继承基类的通用功能
 */

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { getBlockKramdown, sql } from '@/core/siyuan/api';

/**
 * 概念定义卡视图模型
 */
export interface ConceptDefinitionCardViewModel extends BaseCardViewModel {
  conceptName: string;
  conceptBlockId: string;
  definitionHtml: string;
  clozeIndex?: number;
  totalClozes?: number;
  isReverse?: boolean; // 是否为反向卡片
}

/**
 * 概念定义卡渲染服务
 */
export class ConceptDefinitionCardRenderService extends BaseCardRenderService {
  /**
   * 准备视图模型
   * 
   * @param blockId 块 ID
   * @param card FSRSCard，包含 xiuyuanID 和 typeMarker
   * @returns 视图模型
   */
  async prepareViewModel(blockId: string, card?: any): Promise<ConceptDefinitionCardViewModel> {
    // 1. 获取 Xiuyuan 信息
    console.log('[ConceptDefinitionCardRenderService] prepareViewModel called with:', {
      blockId,
      hasCard: !!card,
      xiuyuanID: card?.xiuyuanID,
      typeMarker: card?.meta?.typeMarker
    });
    
    const xiuyuanID = card?.xiuyuanID;
    if (!xiuyuanID) {
      console.error('[ConceptDefinitionCardRenderService] No xiuyuanID found in card:', card);
      throw new Error('No xiuyuanID found in card');
    }

    // 2. 从 Xiuyuan 存储中获取字段映射
    const xiuyuan = await this.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    // 3. 获取概念块 ID 和定义块 ID
    const conceptBlockId = xiuyuan.fieldMapping.concept;
    const definitionBlockId = xiuyuan.fieldMapping.definition;

    if (!conceptBlockId || !definitionBlockId) {
      throw new Error('Missing concept or definition block ID in field mapping');
    }

    // 4. 获取概念名称
    const conceptName = await this.getConceptName(conceptBlockId);

    // 5. 获取定义内容
    const { kramdown: definitionKramdown } = await getBlockKramdown(definitionBlockId);
    if (!definitionKramdown) {
      throw new Error(`Definition block has no content: ${definitionBlockId}`);
    }

    // 6. 解析挖空
    const clozes = this.parseClozes(definitionKramdown);

    // 7. 确定当前挖空索引和是否为反向卡片
    const { clozeIndex, isReverse } = this.parseTypeMarker(card?.meta?.typeMarker);

    // 8. 生成定义 HTML（隐藏当前挖空）
    const processedKramdown = this.processDefinitionKramdown(
      definitionKramdown,
      clozes,
      clozeIndex
    );

    // 9. 使用 Lute 渲染 Markdown
    const definitionHtml = this.renderMarkdown(processedKramdown);

    // 10. 使用基类方法加载面包屑
    const breadcrumbs = await this.loadBreadcrumbs(blockId);

    // 11. 构建视图模型
    return {
      blockId,
      breadcrumbs,
      conceptName,
      conceptBlockId,
      definitionHtml,
      clozeIndex: clozes.length > 0 ? clozeIndex : undefined,
      totalClozes: clozes.length > 0 ? clozes.length : undefined,
      isReverse,
    };
  }

  /**
   * 获取 Xiuyuan 对象
   */
  private async getXiuyuan(xiuyuanID: string): Promise<any> {
    // 通过 window 获取 plugin 实例
    const plugin = (window as any).siyuan?.ws?.app?.plugins?.find(
      (p: any) => p.name === 'siyuan-plugin-siyuanmemo'
    );

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // 获取 XiuyuanApplicationService
    const xiuyuanAppService = await plugin.context.getXiuyuanApplicationService();
    if (!xiuyuanAppService) {
      throw new Error('XiuyuanApplicationService not available');
    }

    // 从 XiuyuanApplicationService 获取 Xiuyuan
    const xiuyuan = await xiuyuanAppService.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    return xiuyuan;
  }

  /**
   * 获取概念名称
   */
  private async getConceptName(conceptBlockId: string): Promise<string> {
    const conceptQuery = `SELECT content FROM blocks WHERE id = '${conceptBlockId}' LIMIT 1`;
    const conceptResult = await sql(conceptQuery);
    
    if (!conceptResult || conceptResult.length === 0) {
      throw new Error(`Concept block not found: ${conceptBlockId}`);
    }

    return conceptResult[0].content;
  }

  /**
   * 解析挖空
   */
  private parseClozes(kramdown: string): Array<{ text: string; start: number; end: number }> {
    const clozePattern = /==(.+?)==|\{\{(.+?)\}\}/g;
    const clozes: Array<{ text: string; start: number; end: number }> = [];
    let match;
    
    while ((match = clozePattern.exec(kramdown)) !== null) {
      clozes.push({
        text: match[1] || match[2],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    return clozes;
  }

  /**
   * 解析 typeMarker，提取挖空索引和方向
   */
  private parseTypeMarker(typeMarker?: string): { clozeIndex: number; isReverse: boolean } {
    if (!typeMarker) {
      return { clozeIndex: 0, isReverse: false };
    }

    // concept-definition-forward / concept-definition-reverse
    if (typeMarker === 'concept-definition-forward') {
      return { clozeIndex: 0, isReverse: false };
    }
    if (typeMarker === 'concept-definition-reverse') {
      return { clozeIndex: 0, isReverse: true };
    }

    // concept-definition-cloze-{index}-forward / concept-definition-cloze-{index}-reverse
    const clozeMatch = typeMarker.match(/concept-definition-cloze-(\d+)-(forward|reverse)/);
    if (clozeMatch) {
      return {
        clozeIndex: parseInt(clozeMatch[1]),
        isReverse: clozeMatch[2] === 'reverse'
      };
    }

    // 兼容旧格式：concept-definition-cloze-{index}（默认正向）
    const oldClozeMatch = typeMarker.match(/concept-definition-cloze-(\d+)/);
    if (oldClozeMatch) {
      return {
        clozeIndex: parseInt(oldClozeMatch[1]),
        isReverse: false
      };
    }

    return { clozeIndex: 0, isReverse: false };
  }

  /**
   * 获取当前挖空索引（兼容旧方法）
   * @deprecated 使用 parseTypeMarker 替代
   */
  private getCurrentClozeIndex(typeMarker?: string): number {
    return this.parseTypeMarker(typeMarker).clozeIndex;
  }

  /**
   * 处理定义 Kramdown（隐藏当前挖空）
   */
  private processDefinitionKramdown(
    kramdown: string,
    clozes: Array<{ text: string; start: number; end: number }>,
    clozeIndex: number
  ): string {
    if (clozes.length === 0 || clozeIndex >= clozes.length) {
      return kramdown;
    }

    const currentCloze = clozes[clozeIndex];
    
    // 从后往前替换，避免索引偏移
    const sortedClozes = [...clozes].sort((a, b) => b.start - a.start);
    let processedKramdown = kramdown;
    
    for (const cloze of sortedClozes) {
      const before = processedKramdown.substring(0, cloze.start);
      const after = processedKramdown.substring(cloze.end);
      
      if (cloze.start === currentCloze.start) {
        // 当前挖空：替换为 [___]
        processedKramdown = before + '[___]' + after;
      } else {
        // 其他挖空：显示原文
        processedKramdown = before + cloze.text + after;
      }
    }

    return processedKramdown;
  }

  /**
   * 使用 Lute 渲染 Markdown
   */
  private renderMarkdown(kramdown: string): string {
    const lute = (window as any).Lute?.New?.();
    if (!lute) {
      throw new Error('Lute not available');
    }
    return lute.Md2BlockDOM(kramdown);
  }
}
