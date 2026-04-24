/**
 * 描述符卡仓储
 * 
 * 职责：
 * - 查询父概念块
 * - 获取块的 HTML 内容
 * - 查询同一概念的其他描述符
 */

import type { SiyuanBlockAdapter } from './SiyuanBlockAdapter';
import {
  extractDescriptorGroupHintFromCandidates,
  hasDescriptorGroupHintTail,
  parseCueAndAnswer,
} from '@/core/xiuyuan/parseCueAndAnswer';
import {
  renderReviewMarkdown,
  type ReviewMarkdownRenderOptions,
  type ReviewRenderedMarkdown,
} from '@/core/card/common/application/reviewMarkdownRender';
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
  sourceMarkdown: string;
  parentConcept: ParentConceptBlock | null;
  siblingDescriptors: SiblingDescriptor[];
  cdfFusionContext?: LiveCdfDescriptorFusionContext;
}

/**
 * 同概念的其他描述符
 */
export interface SiblingDescriptor {
  blockId: string;
  content: string;
  attribute: string; // 属性名（;; 前面的部分）
}

export interface LiveCdfDescriptorFusionContext {
  groupBlockId: string;
  groupParagraphId: string;
  groupHint: string;
  childCue: string;
  childAnswer: string;
}

interface DescriptorCardInput {
  meta?: {
    frontBlockIDs?: string[];
    fieldMapping?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export class DescriptorCardRepository {
  constructor(
    private siyuanAdapter: SiyuanBlockAdapter
  ) {}

  renderMarkdownFragment(markdown: string): string {
    return renderReviewMarkdown(markdown, {
      forceRenderKind: 'fragment',
    }).html;
  }

  renderMarkdownContent(
    markdown: string,
    options?: ReviewMarkdownRenderOptions,
  ): ReviewRenderedMarkdown {
    return renderReviewMarkdown(markdown, options);
  }

  private hasConceptSyntax(content: string): boolean {
    return content.includes('::') || content.includes('：：');
  }

  private hasDescriptorSyntax(content: string): boolean {
    return content.includes(';;') || content.includes(';<') || content.includes(';<>');
  }

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

      // 4. 查询父概念（优先使用元数据中的 concept 映射）
      let parentConcept: ParentConceptBlock | null = null;
      const conceptBlockId = this.resolveConceptBlockId(fsrsCard, blockId);

      if (conceptBlockId) {
        logger.debug('[SiYuanMemo][DescriptorCardRepository] Using concept block from card metadata:', {
          conceptBlockId,
          descriptorBlockId: blockId,
        });
        parentConcept = await this.getConceptBlock(conceptBlockId);
      }

      if (!parentConcept) {
        logger.debug('[SiYuanMemo][DescriptorCardRepository] Falling back to parent chain for concept lookup');
        parentConcept = await this.getParentConcept(blockId);
      }

      // 5. 查询同概念的其他描述符（如果有父概念）
      const siblingDescriptors = parentConcept
        ? await this.getSiblingDescriptors(parentConcept.blockId, blockId)
        : [];
      const cdfFusionContext = await this.loadLiveCdfFusionContext(descriptorBlock, descriptorKramdown);

      return {
        blockId,
        content: descriptorBlock.content,
        html: descriptorHtml,
        sourceMarkdown: descriptorKramdown,
        parentConcept,
        siblingDescriptors,
        cdfFusionContext,
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

        const parentBlock = await this.siyuanAdapter.getBlock(parentId);
        if (parentBlock?.content && this.hasConceptSyntax(parentBlock.content)) {
          foundConceptId = parentId;
          logger.debug(`[SiYuanMemo][DescriptorCardRepository] Found concept card at depth ${depth}:`, parentId);
          break;
        }

        // 如果父块不是概念卡，检查是否包含概念卡的块引用
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

  private resolveConceptBlockId(fsrsCard: DescriptorCardInput | undefined, descriptorBlockId: string): string | null {
    const meta = fsrsCard?.meta;
    if (!meta) {
      return null;
    }

    const conceptFromFieldMapping = this.getFieldMappingValue(meta.fieldMapping, 'concept');
    if (conceptFromFieldMapping && conceptFromFieldMapping !== descriptorBlockId) {
      return conceptFromFieldMapping;
    }

    const frontBlockIDs = Array.isArray(meta.frontBlockIDs) ? meta.frontBlockIDs : [];
    const conceptFromFrontBlocks = frontBlockIDs.find((id) => id && id !== descriptorBlockId);
    if (conceptFromFrontBlocks) {
      return conceptFromFrontBlocks;
    }

    return null;
  }

  private getFieldMappingValue(fieldMapping: unknown, key: string): string | null {
    if (!fieldMapping || typeof fieldMapping !== 'object') {
      return null;
    }

    const value = (fieldMapping as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async loadLiveCdfFusionContext(
    descriptorBlock: { id: string; content: string },
    descriptorKramdown: string,
  ): Promise<LiveCdfDescriptorFusionContext | undefined> {
    const descriptorListItemId = await this.siyuanAdapter.getParentBlockId(descriptorBlock.id);
    if (!descriptorListItemId) {
      return undefined;
    }

    const descriptorListId = await this.siyuanAdapter.getParentBlockId(descriptorListItemId);
    if (!descriptorListId) {
      return undefined;
    }

    const groupBlockId = await this.siyuanAdapter.getParentBlockId(descriptorListId);
    if (!groupBlockId) {
      return undefined;
    }

    const groupParagraph = await this.siyuanAdapter.getFirstParagraphChildBlock(groupBlockId);
    if (!groupParagraph) {
      return undefined;
    }

    const groupParagraphKramdown = await this.siyuanAdapter.getBlockKramdown(groupParagraph.id);
    const hasGroupMarker = hasDescriptorGroupHintTail(groupParagraphKramdown || '')
      || hasDescriptorGroupHintTail(groupParagraph.content || '');
    if (!hasGroupMarker) {
      return undefined;
    }

    const groupHint = extractDescriptorGroupHintFromCandidates(
      groupParagraphKramdown || undefined,
      groupParagraph.content,
    );
    if (!groupHint) {
      return undefined;
    }

    const parsedCueAnswer = parseCueAndAnswer(descriptorBlock.content || descriptorKramdown || '');

    return {
      groupBlockId,
      groupParagraphId: groupParagraph.id,
      groupHint,
      childCue: parsedCueAnswer.cue,
      childAnswer: parsedCueAnswer.answer,
    };
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
        const refBlock = await this.siyuanAdapter.getBlock(refId);
        if (refBlock?.content && this.hasConceptSyntax(refBlock.content)) {
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
    const block = await this.siyuanAdapter.getBlock(blockId);
    if (!block) {
      return null;
    }
    if (this.hasConceptSyntax(block.content)) {
      return 'concept';
    }
    if (this.hasDescriptorSyntax(block.content)) {
      return 'descriptor';
    }
    return null;
  }
}
