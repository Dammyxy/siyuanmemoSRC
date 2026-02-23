/**
 * 描述符卡渲染服务
 * 
 * 职责：
 * - 协调领域层和基础设施层
 * - 准备描述符卡视图模型
 * - 提供渲染所需的所有数据
 */

import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { DescriptorCard } from '../domain/DescriptorCard';
import type { DescriptorCardRepository } from '../infrastructure/DescriptorCardRepository';
import type { ParentConceptBlock, SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';

/**
 * 描述符卡视图模型
 */
export interface DescriptorCardViewModel extends BaseCardViewModel {
  // 正面内容（概念 + 属性名）
  frontHtml: string;
  
  // 背面内容（属性值）
  backHtml: string;
  
  attribute: string;
  description: string;

  // 父概念信息
  parentConcept: {
    blockId: string;
    title: string;
    preview: string;
    html: string;
    isConceptCard: boolean;
  } | null;

  // 同概念的其他描述符
  siblingDescriptors: SiblingDescriptor[];

  // 警告信息
  warning: string | null;
}

export class DescriptorCardRenderService extends BaseCardRenderService {
  constructor(
    private repository: DescriptorCardRepository
  ) {
    super(); // 调用基类构造函数
  }

  /**
   * 准备描述符卡视图模型
   * 
   * @param blockId 描述符卡块 ID
   * @param fsrsCard 可选的 FSRSCard，用于获取 fieldMapping
   * @returns 视图模型，如果加载失败返回 null
   */
  async prepareViewModel(blockId: string, fsrsCard?: any): Promise<DescriptorCardViewModel | null> {
    try {
      // 1. 从仓储加载数据
      const data = await this.repository.loadDescriptorCard(blockId, fsrsCard);
      if (!data) {
        console.warn('[SiYuanMemo][DescriptorCardRenderService] Failed to load descriptor card:', blockId);
        return null;
      }

      // 2. 创建领域实体
      const card = new DescriptorCard(data);

      // 3. 🆕 使用基类方法加载概念上下文（仅概念块）
      const conceptContext = await this.loadConceptContext(blockId);

      // 4. 分离正面和背面内容，传入概念上下文
      const { frontHtml, backHtml } = this.splitDescriptorContent(card, conceptContext);

      // 5. 构建视图模型
      const viewModel: DescriptorCardViewModel = {
        blockId: card.blockId,
        breadcrumbs: [], // 🆕 不再使用独立面包屑
        frontHtml,
        backHtml,
        attribute: card.attribute,
        description: card.description,
        parentConcept: this.buildParentConceptViewModel(card),
        siblingDescriptors: card.siblingDescriptors,
        warning: card.getWarning(),
      };

      return viewModel;
    } catch (error) {
      console.error('[SiYuanMemo][DescriptorCardRenderService] Error preparing view model:', error);
      return null;
    }
  }

  /**
   * 分离描述符内容为正面和背面
   * 
   * 正面：祖先概念上下文 + 组合问题（父概念 + 描述符）
   * 背面：祖先概念上下文 + 组合问题 + 答案分隔线 + 答案
   * 
   * @param card 描述符卡实体
   * @param conceptContext 概念上下文（包含所有祖先，包括父概念）
   */
  private splitDescriptorContent(
    card: DescriptorCard,
    conceptContext: Array<{ id: string; name: string; type: string; isConcept?: boolean }>
  ): { frontHtml: string; backHtml: string } {
    const content = card.html;
    
    // 解析描述符内容：属性名;;属性值
    const match = content.match(/^(.+?)\s*;;\s*(.+)$/s);
    
    if (!match) {
      // 如果没有 ;; 分隔符，整个内容作为正面
      return {
        frontHtml: content,
        backHtml: '',
      };
    }

    const attributeName = match[1].trim();
    const attributeValue = match[2].trim();
    const parentConceptName = card.getParentConceptTitle() || '概念';

    // 分离祖先概念（排除父概念）
    const ancestorContext = this.getAncestorContext(conceptContext, parentConceptName);
    
    // 构建祖先上下文 HTML（不包含父概念）
    const ancestorHtml = this.buildAncestorContextHtml(ancestorContext);

    // 构建组合问题：父概念 + 描述符（32px，居中，一行显示）
    const questionHtml = `<div contenteditable="false" style="font-size: 32px; line-height: 1.5; text-align: center; padding: 16px;"><span style="font-weight: 600; color: var(--b3-theme-primary);">${parentConceptName}</span><span style="color: var(--b3-theme-on-surface-light);">的</span><span style="font-weight: 700; color: var(--b3-theme-on-surface);">${attributeName}</span><span style="color: var(--b3-theme-on-surface-light);">是？</span></div>`;

    // 答案分隔线
    const dividerHtml = `<div style="display: flex; align-items: center; margin: 24px 0; color: var(--b3-theme-on-surface-light); font-size: 14px;"><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div><span style="padding: 0 12px;">答案</span><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div></div>`;

    // 答案 HTML（32px，左对齐）
    const answerHtml = `<div contenteditable="false" style="font-size: 32px; line-height: 1.6; color: var(--b3-theme-on-surface); text-align: left;">${attributeValue}</div>`;

    // 正面：祖先上下文 + 组合问题
    const frontHtml = ancestorHtml + questionHtml;

    // 背面：祖先上下文 + 组合问题 + 答案分隔线 + 答案
    const backHtml = ancestorHtml + questionHtml + dividerHtml + answerHtml;

    return { frontHtml, backHtml };
  }

  /**
   * 获取祖先上下文（排除父概念）
   * 
   * @param conceptContext 完整的概念上下文
   * @param parentConceptName 父概念名称
   * @returns 祖先上下文（不包含父概念）
   */
  private getAncestorContext(
    conceptContext: Array<{ id: string; name: string; type: string; isConcept?: boolean }>,
    parentConceptName: string
  ): Array<{ id: string; name: string; type: string; isConcept?: boolean }> {
    // 找到父概念的位置
    const parentIndex = conceptContext.findIndex(item => 
      item.isConcept !== false && item.name === parentConceptName
    );
    
    if (parentIndex === -1) {
      // 如果没找到父概念，返回所有概念块
      return conceptContext.filter(item => item.isConcept !== false);
    }
    
    // 返回父概念之前的所有项（包括路径块和概念块）
    return conceptContext.slice(0, parentIndex);
  }

  /**
   * 构建祖先上下文 HTML（不包含父概念）
   * 
   * @param ancestorContext 祖先上下文列表
   * @returns HTML 字符串
   */
  private buildAncestorContextHtml(
    ancestorContext: Array<{ id: string; name: string; type: string; isConcept?: boolean }>
  ): string {
    if (ancestorContext.length === 0) {
      return '';
    }

    let html = '<div class="descriptor-card-context">';
    
    let conceptIndent = 0; // 概念块的缩进层级
    ancestorContext.forEach((item) => {
      const isConcept = item.isConcept !== false; // 默认为 true（兼容旧数据）
      
      if (isConcept) {
        // 概念块：使用概念图标和缩进
        const indent = conceptIndent * 20;
        html += `
          <div class="descriptor-card-context__item" style="padding-left: ${indent}px;">
            <span class="descriptor-card-context__icon">💡</span>
            <span class="descriptor-card-context__name">${item.name}</span>
          </div>
        `;
        conceptIndent++; // 下一个概念块增加缩进
      } else {
        // 路径块：使用路径图标，不缩进，灰色显示
        html += `
          <div class="descriptor-card-context__item descriptor-card-context__item--path">
            <span class="descriptor-card-context__icon">📁</span>
            <span class="descriptor-card-context__name">${item.name}</span>
          </div>
        `;
      }
    });
    
    html += '</div>';
    return html;
  }

  /**
   * 构建父概念视图模型
   */
  private buildParentConceptViewModel(card: DescriptorCard): DescriptorCardViewModel['parentConcept'] {
    if (!card.hasParentConcept() || !card.parentConcept) {
      return null;
    }

    return {
      blockId: card.parentConcept.blockId,
      title: card.getParentConceptTitle(),
      preview: card.getParentConceptPreview(),
      html: card.parentConcept.html,
      isConceptCard: card.isParentConceptCard(),
    };
  }

  /**
   * 检查块是否为描述符卡
   * 
   * @param blockId 块 ID
   * @returns 是否为描述符卡
   */
  async isDescriptorCard(blockId: string): Promise<boolean> {
    try {
      console.log('[SiYuanMemo][DescriptorCardRenderService] Checking if descriptor card:', blockId);
      // 检查块属性中的 custom-fsrs-card-type
      const cardTypeMarker = await this.repository.getCardTypeMarker(blockId);
      console.log('[SiYuanMemo][DescriptorCardRenderService] Card type marker:', cardTypeMarker);
      return cardTypeMarker === 'descriptor';
    } catch (error) {
      console.error('[SiYuanMemo][DescriptorCardRenderService] Error checking descriptor card:', error);
      return false;
    }
  }
}
