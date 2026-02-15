/**
 * 描述符卡仓储
 * 
 * 职责：
 * - 查询父概念块
 * - 获取块的 HTML 内容
 * - 查询同一概念的其他描述符
 */

import type { SiyuanBlockAdapter } from './SiyuanBlockAdapter';

/**
 * 父概念块数据
 */
export interface ParentConceptBlock {
  blockId: string;
  content: string;
  html: string;
  cardTypeMarker?: 'concept';
  isConceptCard: boolean;
}

/**
 * 描述符卡数据
 */
export interface DescriptorCardData {
  blockId: string;
  content: string;
  html: string;
  parentConcept: ParentConceptBlock | null;
  siblingDescriptors: SiblingDescriptor[];
}

/**
 * 同概念的其他描述符
 */
export interface SiblingDescriptor {
  blockId: string;
  content: string;
  attribute: string; // 属性名（;; 前面的部分）
}

export class DescriptorCardRepository {
  constructor(
    private siyuanAdapter: SiyuanBlockAdapter
  ) {}

  /**
   * 加载描述符卡数据
   */
  async loadDescriptorCard(blockId: string): Promise<DescriptorCardData | null> {
    try {
      // 1. 获取描述符块的 HTML
      const descriptorHtml = await this.siyuanAdapter.getBlockHtml(blockId);
      if (!descriptorHtml) {
        console.warn('[DescriptorCardRepository] Failed to get descriptor HTML:', blockId);
        return null;
      }

      // 2. 获取描述符块内容
      const descriptorBlock = await this.siyuanAdapter.getBlock(blockId);
      if (!descriptorBlock) {
        console.warn('[DescriptorCardRepository] Failed to get descriptor block:', blockId);
        return null;
      }

      // 3. 查询父概念
      const parentConcept = await this.getParentConcept(blockId);

      // 4. 查询同概念的其他描述符（如果有父概念）
      const siblingDescriptors = parentConcept
        ? await this.getSiblingDescriptors(parentConcept.blockId, blockId)
        : [];

      return {
        blockId,
        content: descriptorBlock.content,
        html: descriptorHtml,
        parentConcept,
        siblingDescriptors,
      };
    } catch (error) {
      console.error('[DescriptorCardRepository] Failed to load descriptor card:', error);
      return null;
    }
  }

  /**
   * 查询父概念块
   */
  async getParentConcept(descriptorBlockId: string): Promise<ParentConceptBlock | null> {
    try {
      // 1. 获取父块 ID
      const parentId = await this.siyuanAdapter.getParentBlockId(descriptorBlockId);
      if (!parentId) {
        console.warn('[DescriptorCardRepository] No parent block found for:', descriptorBlockId);
        return null;
      }

      // 2. 获取父块内容
      const parentBlock = await this.siyuanAdapter.getBlock(parentId);
      if (!parentBlock) {
        console.warn('[DescriptorCardRepository] Failed to get parent block:', parentId);
        return null;
      }

      // 3. 获取父块 HTML
      const parentHtml = await this.siyuanAdapter.getBlockHtml(parentId);
      if (!parentHtml) {
        console.warn('[DescriptorCardRepository] Failed to get parent HTML:', parentId);
        return null;
      }

      // 4. 检查父块是否为概念卡
      const cardTypeMarker = await this.siyuanAdapter.getBlockAttribute(
        parentId,
        'custom-fsrs-card-type'
      );
      const isConceptCard = cardTypeMarker === 'concept';

      return {
        blockId: parentId,
        content: parentBlock.content,
        html: parentHtml,
        cardTypeMarker: isConceptCard ? 'concept' : undefined,
        isConceptCard,
      };
    } catch (error) {
      console.error('[DescriptorCardRepository] Failed to get parent concept:', error);
      return null;
    }
  }

  /**
   * 查询同一概念的其他描述符
   */
  async getSiblingDescriptors(
    parentBlockId: string,
    currentDescriptorId: string
  ): Promise<SiblingDescriptor[]> {
    try {
      const siblings = await this.siyuanAdapter.querySiblingDescriptors(
        parentBlockId,
        currentDescriptorId
      );

      return siblings.map(block => ({
        blockId: block.id,
        content: block.content,
        attribute: this.extractAttribute(block.content),
      }));
    } catch (error) {
      console.error('[DescriptorCardRepository] Failed to get sibling descriptors:', error);
      return [];
    }
  }

  /**
   * 提取属性名（;; 前面的部分）
   */
  private extractAttribute(content: string): string {
    const match = content.match(/^(.+?)\s*;;/);
    return match ? match[1].trim() : '属性';
  }

  /**
   * 获取卡片类型标记
   */
  async getCardTypeMarker(blockId: string): Promise<string | null> {
    return await this.siyuanAdapter.getBlockAttribute(blockId, 'custom-fsrs-card-type');
  }
}
