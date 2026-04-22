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
import type { LiveCdfDescriptorFusionContext } from '../infrastructure/DescriptorCardRepository';
import type { SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DescriptorCardRenderService');

export interface DescriptorCardInput {
  meta?: {
    frontBlockIDs?: string[];
    typeMarker?: string;
    fieldMapping?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

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

interface CdfDescriptorFusionMeta {
  groupHint: string;
  childCue: string;
  childAnswer: string;
  fusedAttributeName: string;
}

export class DescriptorCardRenderService extends BaseCardRenderService {
  constructor(
    private repository: DescriptorCardRepository,
    private i18n: Record<string, string> = {}
  ) {
    super(); // 调用基类构造函数
  }

  private t(key: string, fallback: string): string {
    return this.i18n[key] || fallback;
  }

  /**
   * 准备描述符卡视图模型
   * 
   * @param blockId 描述符卡块 ID
   * @param fsrsCard 可选的 FSRSCard，用于获取 fieldMapping
   * @returns 视图模型，如果加载失败返回 null
   */
  async prepareViewModel(blockId: string, fsrsCard?: DescriptorCardInput): Promise<DescriptorCardViewModel | null> {
    try {
      // 1. 从仓储加载数据
      const data = await this.repository.loadDescriptorCard(blockId, fsrsCard);
      if (!data) {
        logger.warn('[SiYuanMemo][DescriptorCardRenderService] Failed to load descriptor card:', blockId);
        return null;
      }

      // 2. 创建领域实体
      const card = new DescriptorCard(data);

      // 3. 🆕 使用基类方法加载面包屑（只显示到文档块）
      const breadcrumbs = await this.loadBreadcrumbs(blockId);

      // 4. 🆕 使用基类方法加载概念上下文（仅概念块）
      const conceptContext = await this.loadConceptContext(blockId);

      // 5. 🆕 检测卡片方向（从 FSRSCard 的 typeMarker）
      const typeMarker = fsrsCard?.meta?.typeMarker || '';
      const isReverse = typeMarker.includes('reverse');
      
      logger.debug('[DescriptorCardRenderService] Card direction:', { 
        typeMarker, 
        isReverse,
        fsrsCardMeta: fsrsCard?.meta 
      });

      const cdfFusionMeta = this.resolveCdfFusionMeta(fsrsCard, data.cdfFusionContext);

      // 6. 分离正面和背面内容，传入概念上下文和方向
      const { frontHtml, backHtml } = this.splitDescriptorContent(card, conceptContext, isReverse, cdfFusionMeta);

      // 7. 构建视图模型
      const viewModel: DescriptorCardViewModel = {
        blockId: card.blockId,
        breadcrumbs, // 🆕 使用面包屑
        dependencyBlockIds: Array.from(new Set([
          card.blockId,
          card.parentConcept?.blockId,
          data.cdfFusionContext?.groupBlockId,
          data.cdfFusionContext?.groupParagraphId,
          ...card.siblingDescriptors.map((sibling) => sibling.blockId),
          ...breadcrumbs.map((item) => item.id),
        ].filter((value): value is string => typeof value === 'string' && value.length > 0))),
        frontHtml,
        backHtml,
        attribute: card.attribute,
        description: card.description,
        parentConcept: this.buildParentConceptViewModel(card),
        siblingDescriptors: card.siblingDescriptors,
        warning: card.getWarning() ? this.t(card.getWarning()!, card.getWarning()!) : null,
      };

      return viewModel;
    } catch (error) {
      logger.error('[SiYuanMemo][DescriptorCardRenderService] Error preparing view model:', error);
      return null;
    }
  }

  /**
   * 分离描述符内容为正面和背面
   * 
   * 正向卡（;;）：
   *   正面：祖先概念上下文 + 组合问题（父概念 + 描述符）
   *   背面：祖先概念上下文 + 组合问题 + 答案分隔线 + 答案
   * 
   * 反向卡（;<）：
   *   正面：祖先概念上下文 + 反向问题（描述符 + "是谁的" + 属性名）
   *   背面：祖先概念上下文 + 反向问题 + 答案分隔线 + 概念名
   * 
   * @param card 描述符卡实体
   * @param conceptContext 概念上下文（包含所有祖先，包括父概念）
   * @param isReverse 是否为反向卡
   */
  private splitDescriptorContent(
    card: DescriptorCard,
    conceptContext: Array<{ id: string; name: string; type: string; isConcept?: boolean }>,
    isReverse: boolean = false,
    cdfFusionMeta?: CdfDescriptorFusionMeta
  ): { frontHtml: string; backHtml: string } {
    // 🔧 修复：直接使用 card.attribute 和 card.description，不再解析 card.html
    // 如果 attribute 是 sentinel key（解析失败时的降级值），则翻译为本地化字符串
    const attributeNameFromCard = card.attribute === 'defaultAttribute'
      ? this.t('defaultAttribute', '属性')
      : card.attribute;
    const attributeName = cdfFusionMeta?.fusedAttributeName || attributeNameFromCard;
    const attributeValue = cdfFusionMeta?.childAnswer || card.description;
    
    if (!attributeName || !attributeValue) {
      // 如果解析失败，返回空内容
      logger.warn('[DescriptorCardRenderService] Failed to parse descriptor content:', { 
        attribute: attributeName, 
        description: attributeValue 
      });
      return {
        frontHtml: card.html,
        backHtml: '',
      };
    }

    const parentConceptName = card.getParentConceptTitle() || this.t('defaultConcept', '概念');

    // 分离祖先概念（排除父概念）
    const ancestorContext = this.getAncestorContext(conceptContext, parentConceptName);
    
    // 构建祖先上下文 HTML（不包含父概念）
    const ancestorHtml = this.buildAncestorContextHtml(ancestorContext);

    logger.debug('[DescriptorCardRenderService] Rendering card:', { isReverse, attributeName, attributeValue, parentConceptName });

    if (isReverse) {
      // 反向卡：描述符 -> 概念
      const reverseConnector = this.t('descriptorReverseConnector', '是谁的');
      const questionHtml = `<div contenteditable="false" style="font-size: 22px; line-height: 1.5; padding: 16px 0;"><span style="font-weight: 700; color: var(--b3-theme-on-surface);">${attributeValue}</span><span style="color: var(--b3-theme-on-surface-light);">${reverseConnector}</span><span style="font-weight: 600; color: var(--b3-theme-primary);">${attributeName}</span><span style="color: var(--b3-theme-on-surface-light);">？</span></div>`;

      // 答案分隔线
      const dividerHtml = `<div style="display: flex; align-items: center; margin: 16px 0; color: var(--b3-theme-on-surface-light); font-size: 14px;"><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div><span style="padding: 0 12px;">${this.t('answerLabel', '答案')}</span><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div></div>`;

      // 答案：概念名（22px）
      const answerHtml = `<div contenteditable="false" style="font-size: 22px; line-height: 1.6; color: var(--b3-theme-on-surface);">${parentConceptName}</div>`;

      // 正面：祖先上下文 + 反向问题
      const frontHtml = ancestorHtml + questionHtml;

      // 背面：祖先上下文 + 反向问题 + 答案分隔线 + 概念名
      const backHtml = ancestorHtml + questionHtml + dividerHtml + answerHtml;

      return { frontHtml, backHtml };
    } else {
      // 正向卡：概念 -> 描述符（默认）
      const ofConnector = this.t('descriptorForwardOf', '的');
      const isConnector = this.t('descriptorForwardIs', '？');
      const questionHtml = `<div contenteditable="false" style="font-size: 22px; line-height: 1.5; padding: 16px 0;"><span style="font-weight: 600; color: var(--b3-theme-primary);">${parentConceptName}</span><span style="color: var(--b3-theme-on-surface-light);">${ofConnector}</span><span style="font-weight: 700; color: var(--b3-theme-on-surface);">${attributeName}</span><span style="color: var(--b3-theme-on-surface-light);">${isConnector}</span></div>`;

      // 答案分隔线
      const dividerHtml = `<div style="display: flex; align-items: center; margin: 16px 0; color: var(--b3-theme-on-surface-light); font-size: 14px;"><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div><span style="padding: 0 12px;">${this.t('answerLabel', '答案')}</span><div style="flex: 1; height: 1px; background: var(--b3-border-color);"></div></div>`;

      // 答案：属性值（22px，左对齐）
      const answerHtml = `<div contenteditable="false" style="font-size: 22px; line-height: 1.6; color: var(--b3-theme-on-surface);">${attributeValue}</div>`;

      // 正面：祖先上下文 + 组合问题
      const frontHtml = ancestorHtml + questionHtml;

      // 背面：祖先上下文 + 组合问题 + 答案分隔线 + 答案
      const backHtml = ancestorHtml + questionHtml + dividerHtml + answerHtml;

      return { frontHtml, backHtml };
    }
  }

  private resolveCdfFusionMeta(
    fsrsCard: DescriptorCardInput | undefined,
    liveContext?: LiveCdfDescriptorFusionContext,
  ): CdfDescriptorFusionMeta | undefined {
    const liveMeta = this.buildCdfFusionMeta(
      liveContext?.groupHint,
      liveContext?.childCue,
      liveContext?.childAnswer,
    );
    if (liveMeta) {
      return liveMeta;
    }

    const fieldMapping = fsrsCard?.meta?.fieldMapping;
    if (!fieldMapping || typeof fieldMapping !== 'object') {
      return undefined;
    }

    return this.buildCdfFusionMeta(
      fieldMapping['cdf_group_hint'],
      fieldMapping['cdf_child_cue'],
      fieldMapping['cdf_child_answer'],
    );
  }

  private buildCdfFusionMeta(
    groupHintRaw: unknown,
    childCueRaw: unknown,
    childAnswerRaw: unknown,
  ): CdfDescriptorFusionMeta | undefined {
    const groupHint = typeof groupHintRaw === 'string' ? groupHintRaw.trim() : '';
    if (!groupHint) {
      return undefined;
    }

    const childCue = typeof childCueRaw === 'string' ? childCueRaw.trim() : '';
    const childAnswer = typeof childAnswerRaw === 'string' ? childAnswerRaw.trim() : '';
    if (!childCue && !childAnswer) {
      return undefined;
    }

    return {
      groupHint,
      childCue,
      childAnswer,
      fusedAttributeName: childCue ? `${groupHint}，${childCue}` : groupHint,
    };
  }

  /**
   * 获取祖先上下文（排除父概念）
   * 
   * @param conceptContext 完整的概念上下文
   * @param parentConceptName 父概念名称
   * @returns 祖先上下文（不包含父概念，只包含概念块）
   */
  private getAncestorContext(
    conceptContext: Array<{ id: string; name: string; type: string; isConcept?: boolean }>,
    parentConceptName: string
  ): Array<{ id: string; name: string; type: string; isConcept?: boolean }> {
    // 🔧 修复：只保留概念块，过滤掉文档块等非概念块
    const conceptsOnly = conceptContext.filter(item => item.isConcept === true);
    
    // 找到父概念的位置
    const parentIndex = conceptsOnly.findIndex(item => item.name === parentConceptName);
    
    if (parentIndex === -1) {
      // 如果没找到父概念，返回所有概念块
      return conceptsOnly;
    }
    
    // 返回父概念之前的所有概念块
    return conceptsOnly.slice(0, parentIndex);
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
      // 🔧 修复：明确检查 isConcept === true，避免 undefined 被当作 true
      const isConcept = item.isConcept === true;
      
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
        // 路径块（文档块等）：使用路径图标，不缩进，灰色显示
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
      logger.debug('[SiYuanMemo][DescriptorCardRenderService] Checking if descriptor card:', blockId);
      // 根据仓储的本地卡/语法判定检查是否为描述符卡
      const cardTypeMarker = await this.repository.getCardTypeMarker(blockId);
      logger.debug('[SiYuanMemo][DescriptorCardRenderService] Card type marker:', cardTypeMarker);
      return cardTypeMarker === 'descriptor';
    } catch (error) {
      logger.error('[SiYuanMemo][DescriptorCardRenderService] Error checking descriptor card:', error);
      return false;
    }
  }
}
