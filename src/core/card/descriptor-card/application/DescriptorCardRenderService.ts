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
  html: string;
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
   * @returns 视图模型，如果加载失败返回 null
   */
  async prepareViewModel(blockId: string): Promise<DescriptorCardViewModel | null> {
    try {
      // 1. 从仓储加载数据
      const data = await this.repository.loadDescriptorCard(blockId);
      if (!data) {
        console.warn('[DescriptorCardRenderService] Failed to load descriptor card:', blockId);
        return null;
      }

      // 2. 创建领域实体
      const card = new DescriptorCard(data);

      // 3. 构建视图模型
      const viewModel: DescriptorCardViewModel = {
        blockId: card.blockId,
        html: card.html,
        attribute: card.attribute,
        description: card.description,
        parentConcept: this.buildParentConceptViewModel(card),
        siblingDescriptors: card.siblingDescriptors,
        warning: card.getWarning(),
      };

      return viewModel;
    } catch (error) {
      console.error('[DescriptorCardRenderService] Error preparing view model:', error);
      return null;
    }
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
      // 检查块属性中的 custom-fsrs-card-type
      const cardTypeMarker = await this.repository.getCardTypeMarker(blockId);
      return cardTypeMarker === 'descriptor';
    } catch (error) {
      console.error('[DescriptorCardRenderService] Error checking descriptor card:', error);
      return false;
    }
  }
}
