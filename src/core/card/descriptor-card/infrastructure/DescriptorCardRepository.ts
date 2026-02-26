/**
 * 描述符卡仓储
 * 
 * 职责：
 * - 查询父概念块
 * - 获取块的 HTML 内容
 * - 查询同一概念的其他描述符
 */

import type { SiyuanBlockAdapter } from './SiyuanBlockAdapter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DescriptorCardRepository');

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

interface DescriptorCardInput {
  meta?: {
    frontBlockIDs?: string[];
  };
  [key: string]: unknown;
}

export class DescriptorCardRepository {
  constructor(
    private siyuanAdapter: SiyuanBlockAdapter
  ) {}

  /**
   * 加载描述符卡数据
   * 
   * @param blockId 描述符块 ID
   * @param fsrsCard 可选的 FSRSCard，用于获取 frontBlockIDs
   */
  async loadDescriptorCard(blockId: string, fsrsCard?: DescriptorCardInput): Promise<DescriptorCardData | null> {
    try {
      // 1. 获取描述符块的 kramdown
      const descriptorKramdown = await this.siyuanAdapter.getBlockKramdown(blockId);
      if (!descriptorKramdown) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get descriptor kramdown:', blockId);
        return null;
      }

      // 2. 转换为 HTML
      const descriptorHtml = this.siyuanAdapter.kramdownToHtml(descriptorKramdown);

      // 3. 获取描述符块内容
      const descriptorBlock = await this.siyuanAdapter.getBlock(blockId);
      if (!descriptorBlock) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get descriptor block:', blockId);
        return null;
      }

      // 4. 查询父概念
      // 🆕 优先使用 FSRSCard 的 frontBlockIDs[0]（概念块 ID）
      let parentConcept: ParentConceptBlock | null = null;
      
      if (fsrsCard?.meta?.frontBlockIDs?.[0]) {
        const conceptBlockId = fsrsCard.meta.frontBlockIDs[0];
        logger.debug('[SiYuanMemo][DescriptorCardRepository] Using concept from frontBlockIDs:', conceptBlockId);
        logger.debug('[SiYuanMemo][DescriptorCardRepository] Descriptor blockId:', blockId);
        logger.debug('[SiYuanMemo][DescriptorCardRepository] Are they same?', conceptBlockId === blockId);
        parentConcept = await this.getConceptBlock(conceptBlockId);
        if (parentConcept) {
          logger.debug('[SiYuanMemo][DescriptorCardRepository] Parent concept content:', parentConcept.content);
        }
      } else {
        logger.debug('[SiYuanMemo][DescriptorCardRepository] No frontBlockIDs, searching parent chain');
        parentConcept = await this.getParentConcept(blockId);
      }

      // 5. 查询同概念的其他描述符（如果有父概念）
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
      logger.error('[SiYuanMemo][DescriptorCardRepository] Failed to load descriptor card:', error);
      return null;
    }
  }

  /**
   * 获取概念块（直接通过块 ID）
   */
  async getConceptBlock(conceptBlockId: string): Promise<ParentConceptBlock | null> {
    try {
      // 获取概念块内容和 kramdown
      const conceptBlock = await this.siyuanAdapter.getBlock(conceptBlockId);
      if (!conceptBlock) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get concept block:', conceptBlockId);
        return null;
      }

      const conceptKramdown = await this.siyuanAdapter.getBlockKramdown(conceptBlockId);
      if (!conceptKramdown) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get concept kramdown:', conceptBlockId);
        return null;
      }

      const conceptHtml = this.siyuanAdapter.kramdownToHtml(conceptKramdown);

      return {
        blockId: conceptBlockId,
        content: conceptBlock.content,
        html: conceptHtml,
        cardTypeMarker: 'concept',
        isConceptCard: true,
      };
    } catch (error) {
      logger.error('[SiYuanMemo][DescriptorCardRepository] Failed to get concept block:', error);
      return null;
    }
  }

  /**
   * 查询父概念块（支持多层向上查找和块引用）
   */
  async getParentConcept(descriptorBlockId: string): Promise<ParentConceptBlock | null> {
    try {
      // 向上查找最多 4 层，寻找概念卡
      let currentId = descriptorBlockId;
      let foundConceptId: string | null = null;
      const maxDepth = 4;
      
      for (let depth = 0; depth < maxDepth; depth++) {
        // 获取父块 ID
        const parentId = await this.siyuanAdapter.getParentBlockId(currentId);
        if (!parentId) {
          logger.warn(`[SiYuanMemo][DescriptorCardRepository] No parent at depth ${depth}`);
          break;
        }

        logger.debug(`[SiYuanMemo][DescriptorCardRepository] Checking parent at depth ${depth}:`, parentId);

        // 检查父块是否是概念卡
        const cardTypeMarker = await this.siyuanAdapter.getBlockAttribute(
          parentId,
          'custom-fsrs-card-type'
        );
        
        if (cardTypeMarker === 'concept') {
          foundConceptId = parentId;
          logger.debug(`[SiYuanMemo][DescriptorCardRepository] Found concept card at depth ${depth}:`, parentId);
          break;
        }

        // 如果父块不是概念卡，检查是否包含概念卡的块引用
        const parentBlock = await this.siyuanAdapter.getBlock(parentId);
        if (parentBlock?.content) {
          const refConceptId = await this.findConceptCardInBlockRef(parentBlock.content);
          if (refConceptId) {
            foundConceptId = refConceptId;
            logger.debug(`[SiYuanMemo][DescriptorCardRepository] Found concept card reference at depth ${depth}:`, refConceptId);
            break;
          }
        }

        currentId = parentId;
      }

      if (!foundConceptId) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] No concept card found in ancestor chain');
        return null;
      }

      // 获取概念块内容和 kramdown
      const conceptBlock = await this.siyuanAdapter.getBlock(foundConceptId);
      if (!conceptBlock) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get concept block:', foundConceptId);
        return null;
      }

      const conceptKramdown = await this.siyuanAdapter.getBlockKramdown(foundConceptId);
      if (!conceptKramdown) {
        logger.warn('[SiYuanMemo][DescriptorCardRepository] Failed to get concept kramdown:', foundConceptId);
        return null;
      }

      const conceptHtml = this.siyuanAdapter.kramdownToHtml(conceptKramdown);

      return {
        blockId: foundConceptId,
        content: conceptBlock.content,
        html: conceptHtml,
        cardTypeMarker: 'concept',
        isConceptCard: true,
      };
    } catch (error) {
      logger.error('[SiYuanMemo][DescriptorCardRepository] Failed to get parent concept:', error);
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
      logger.error('[SiYuanMemo][DescriptorCardRepository] Failed to get sibling descriptors:', error);
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
   * 从块内容中查找概念卡的块引用
   * @param content 块内容
   * @returns 概念卡 ID，如果没找到返回 null
   */
  private async findConceptCardInBlockRef(content: string): Promise<string | null> {
    try {
      // 提取块引用 ID（格式：((20230101120000-abcdefg 'alias')) 或 ((20230101120000-abcdefg))）
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const matches = [...content.matchAll(refPattern)];

      if (matches.length === 0) {
        return null;
      }

      // 检查每个引用是否是概念卡
      for (const match of matches) {
        const refId = match[1];
        const cardType = await this.siyuanAdapter.getBlockAttribute(refId, 'custom-fsrs-card-type');
        if (cardType === 'concept') {
          return refId;
        }
      }

      return null;
    } catch (error) {
      logger.error('[SiYuanMemo][DescriptorCardRepository] Error finding concept card in block ref:', error);
      return null;
    }
  }

  /**
   * 获取卡片类型标记
   */
  async getCardTypeMarker(blockId: string): Promise<string | null> {
    return await this.siyuanAdapter.getBlockAttribute(blockId, 'custom-fsrs-card-type');
  }
}
