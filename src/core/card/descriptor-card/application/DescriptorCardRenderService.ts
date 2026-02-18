/**
 * 描述符卡渲染服务
 * 
 * 职责：
 * - 协调领域层和基础设施层
 * - 准备描述符卡视图模型
 * - 提供渲染所需的所有数据
 */

import { DescriptorCard } from '../domain/DescriptorCard';
import type { DescriptorCardRepository } from '../infrastructure/DescriptorCardRepository';
import type { ParentConceptBlock, SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';

/**
 * 描述符卡视图模型
 */
export interface DescriptorCardViewModel {
  // 描述符卡信息
  blockId: string;
  
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

export class DescriptorCardRenderService {
  constructor(
    private repository: DescriptorCardRepository
  ) {}

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

      // 3. 分离正面和背面内容
      const { frontHtml, backHtml } = this.splitDescriptorContent(card);

      // 4. 构建视图模型
      const viewModel: DescriptorCardViewModel = {
        blockId: card.blockId,
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
   * 正面：概念标题 + 属性名（;; 前面的部分）
   * 背面：属性值（;; 后面的部分）
   */
  private splitDescriptorContent(card: DescriptorCard): { frontHtml: string; backHtml: string } {
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

    // 构建正面 HTML：概念标题 + 属性名 + 问号（使用内联样式确保字体大小）
    const conceptTitle = card.getParentConceptTitle() || '概念'; // 如果没有父概念，使用默认值
    const frontHtml = `
      <div class="descriptor-card-front" style="font-size: 18px;">
        <div class="descriptor-card-front__concept" style="font-size: 18px !important;">${conceptTitle}</div>
        <div class="descriptor-card-front__divider" style="font-size: 18px !important;">的</div>
        <div class="descriptor-card-front__attribute" style="font-size: 18px !important; font-weight: 700;">${attributeName}？</div>
      </div>
    `;

    // 背面 HTML：属性值（使用内联样式确保字体大小）
    const backHtml = `
      <div class="descriptor-card-back" style="font-size: 18px;">
        <div class="descriptor-card-back__value" style="font-size: 18px !important;">${attributeValue}</div>
      </div>
    `;

    return { frontHtml, backHtml };
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
