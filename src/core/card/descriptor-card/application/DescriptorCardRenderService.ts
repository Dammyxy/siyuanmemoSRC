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
import type { CardFaceKey } from '@/types/card';
import { resolveCardRuleDirection } from '@/core/card/cardSemanticLocator';
import {
  createCdfDirectRenderable,
  type CdfDirectScene,
} from '@/core/card/common/application/cdfDirectScene';
import { projectCdfRelation } from '@/core/card/common/application/cdfDirectScene';
import {
  renderReviewMarkdown,
  type ReviewMarkdownRenderOptions,
  type ReviewRenderedMarkdown,
} from '@/core/card/common/application/reviewMarkdownRender';
import { DescriptorCard } from '../domain/DescriptorCard';
import type { DescriptorCardRepository } from '../infrastructure/DescriptorCardRepository';
import type { LiveCdfDescriptorFusionContext } from '../infrastructure/DescriptorCardRepository';
import type { SiblingDescriptor } from '../infrastructure/DescriptorCardRepository';
import { normalizeCueAnswerSource } from '@/core/xiuyuan/parseCueAndAnswer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DescriptorCardRenderService');
const DEFAULT_ATTRIBUTE_SENTINEL = 'defaultAttribute';

export interface DescriptorCardInput {
  faceKey?: CardFaceKey;
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
  directScene?: CdfDirectScene;
  relationArrow: '→' | '←' | '↔';
  isReverse: boolean;
  
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

interface DescriptorDisplayParts {
  attribute: string;
  description: string;
  usedProjection: boolean;
  usedMinimalFallback: boolean;
  fallbackSource: string;
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

      // 5. 检测卡片方向（faceKey 优先，legacy typeMarker 仅作兼容 fallback）
      const typeMarker = fsrsCard?.meta?.typeMarker || '';
      const ruleDirection = resolveCardRuleDirection(fsrsCard);
      const isReverse = ruleDirection === 'reverse';
      
      logger.debug('[DescriptorCardRenderService] Card direction:', { 
        typeMarker,
        ruleDirection,
        isReverse,
        fsrsCardMeta: fsrsCard?.meta 
      });

      const cdfFusionMeta = this.resolveCdfFusionMeta(fsrsCard, data.cdfFusionContext);
      const displayParts = this.resolveDisplayParts(card, cdfFusionMeta);

      // 6. 分离正面和背面内容，传入概念上下文和方向
      const { frontHtml, backHtml } = this.splitDescriptorContent(card, conceptContext, isReverse, displayParts);
      const relationArrow = this.resolveDescriptorArrow(data.content, isReverse);
      const directScene = this.buildDirectScene({
        relationArrow,
        isReverse,
        displayParts,
        parentConceptTitle: card.getParentConceptTitle(),
        cdfFusionMeta,
      });

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
        directScene,
        relationArrow,
        isReverse,
        attribute: displayParts.attribute,
        description: displayParts.description,
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
    displayParts?: DescriptorDisplayParts
  ): { frontHtml: string; backHtml: string } {
    const attributeName = displayParts?.attribute || '';
    const attributeValue = displayParts?.description || '';

    const parentConceptName = card.getParentConceptTitle() || this.t('defaultConcept', '概念');

    // 分离祖先概念（排除父概念）
    const ancestorContext = this.getAncestorContext(conceptContext, parentConceptName);
    
    // 构建祖先上下文 HTML（不包含父概念）
    const ancestorHtml = this.buildAncestorContextHtml(ancestorContext);

    if (displayParts?.usedMinimalFallback) {
      logger.warn('[DescriptorCardRenderService] Falling back to minimal descriptor content', {
        blockId: card.blockId,
        source: displayParts.fallbackSource,
      });
      const minimalHtml = this.buildMinimalFallbackContent(ancestorHtml, displayParts.fallbackSource);
      if (minimalHtml) {
        return {
          frontHtml: minimalHtml,
          backHtml: minimalHtml,
        };
      }

      const rawHtml = ancestorHtml + card.html;
      return {
        frontHtml: rawHtml,
        backHtml: rawHtml,
      };
    }

    if (!attributeName || !attributeValue) {
      logger.warn('[DescriptorCardRenderService] Failed to resolve descriptor display parts:', {
        attribute: attributeName,
        description: attributeValue,
        blockId: card.blockId,
      });
      return {
        frontHtml: ancestorHtml + card.html,
        backHtml: ancestorHtml + card.html,
      };
    }

    logger.debug('[DescriptorCardRenderService] Rendering card:', { isReverse, attributeName, attributeValue, parentConceptName });

    if (isReverse) {
      // 反向卡：描述符 -> 概念
      const reverseConnector = this.t('descriptorReverseConnector', '是谁的');
      const questionHtml = this.buildDescriptorQuestionHtml({
        direction: 'reverse',
        primaryMarkdown: attributeValue,
        connectorText: reverseConnector,
        secondaryMarkdown: attributeName,
        trailingText: '？',
      });
      const dividerHtml = this.buildDescriptorAnswerDividerHtml();
      const answerHtml = this.buildDescriptorAnswerHtml(
        'descriptor-card-answer-content descriptor-card-answer-content--concept',
        parentConceptName,
      );

      // 正面：祖先上下文 + 反向问题
      const frontHtml = ancestorHtml + questionHtml;

      // 背面：祖先上下文 + 反向问题 + 答案分隔线 + 概念名
      const backHtml = ancestorHtml + questionHtml + dividerHtml + answerHtml;

      return { frontHtml, backHtml };
    } else {
      // 正向卡：概念 -> 描述符（默认）
      const ofConnector = this.t('descriptorForwardOf', '的');
      const isConnector = this.t('descriptorForwardIs', '？');
      const questionHtml = this.buildDescriptorQuestionHtml({
        direction: 'forward',
        primaryMarkdown: parentConceptName,
        connectorText: ofConnector,
        secondaryMarkdown: attributeName,
        trailingText: isConnector,
      });
      const dividerHtml = this.buildDescriptorAnswerDividerHtml();
      const answerHtml = this.buildDescriptorAnswerHtml(
        'descriptor-card-answer-content descriptor-card-answer-content--description',
        attributeValue,
      );

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

  private resolveDisplayParts(
    card: DescriptorCard,
    cdfFusionMeta?: CdfDescriptorFusionMeta,
  ): DescriptorDisplayParts {
    const fallbackSource = this.pickFirstNonEmpty(
      card.sourceMarkdown,
      card.content,
      card.description,
    );
    const projectedRelation = projectCdfRelation(fallbackSource);
    const baseAttribute = card.attribute === DEFAULT_ATTRIBUTE_SENTINEL ? '' : card.attribute.trim();
    const baseDescription = card.description.trim();

    if (cdfFusionMeta) {
      return {
        attribute: cdfFusionMeta.fusedAttributeName.trim(),
        description: this.pickFirstNonEmpty(
          cdfFusionMeta.childAnswer,
          projectedRelation.right,
          baseDescription,
          fallbackSource,
        ),
        usedProjection: false,
        usedMinimalFallback: false,
        fallbackSource,
      };
    }

    if (baseAttribute && baseDescription) {
      return {
        attribute: baseAttribute,
        description: baseDescription,
        usedProjection: false,
        usedMinimalFallback: false,
        fallbackSource,
      };
    }

    if (projectedRelation.matched) {
      return {
        attribute: projectedRelation.left,
        description: projectedRelation.right,
        usedProjection: true,
        usedMinimalFallback: false,
        fallbackSource,
      };
    }

    const minimalSource = this.pickFirstNonEmpty(baseDescription, fallbackSource);
    return {
      attribute: '',
      description: minimalSource,
      usedProjection: false,
      usedMinimalFallback: true,
      fallbackSource: minimalSource,
    };
  }

  private buildDirectScene(params: {
    relationArrow: '→' | '←' | '↔';
    isReverse: boolean;
    displayParts: DescriptorDisplayParts;
    parentConceptTitle: string;
    cdfFusionMeta?: CdfDescriptorFusionMeta;
  }): CdfDirectScene | undefined {
    const { relationArrow, isReverse, displayParts, parentConceptTitle, cdfFusionMeta } = params;
    const rows: CdfDirectScene['rows'] = [];
    const conceptTitle = parentConceptTitle.trim();

    if (conceptTitle) {
      rows.push({
        kind: 'concept',
        key: 'concept',
        level: 0,
        content: createCdfDirectRenderable(
          this.renderMarkdownFragment(`[[${conceptTitle}]]`),
          'fragment',
        ),
        emphasize: 'primary',
      });
    }

    if (cdfFusionMeta) {
      rows.push({
        kind: 'group',
        key: 'group',
        level: conceptTitle ? 1 : 0,
        label: createCdfDirectRenderable(
          this.renderMarkdownFragment(cdfFusionMeta.groupHint),
          'fragment',
        ),
      });

      const relationLevel = conceptTitle ? 2 : 1;
      if (cdfFusionMeta.childCue) {
        const cueContent = this.renderMarkdownContent(cdfFusionMeta.childCue, {
          forceRenderKind: 'fragment',
        });
        const descriptionContent = this.renderMarkdownContent(displayParts.description);
        rows.push({
          kind: 'relation',
          key: 'descriptor',
          level: relationLevel,
          left: createCdfDirectRenderable(cueContent.html, cueContent.renderKind),
          right: createCdfDirectRenderable(descriptionContent.html, descriptionContent.renderKind),
          arrow: relationArrow,
        });
      } else if (displayParts.description) {
        const descriptionContent = this.renderMarkdownContent(displayParts.description);
        rows.push({
          kind: 'standalone',
          key: 'descriptor-answer',
          level: relationLevel,
          content: createCdfDirectRenderable(descriptionContent.html, descriptionContent.renderKind),
        });
      }
    } else if (displayParts.attribute) {
      const attributeContent = this.renderMarkdownContent(displayParts.attribute, {
        forceRenderKind: 'fragment',
      });
      const descriptionContent = this.renderMarkdownContent(displayParts.description);
      rows.push({
        kind: 'relation',
        key: 'descriptor',
        level: conceptTitle ? 1 : 0,
        left: createCdfDirectRenderable(attributeContent.html, attributeContent.renderKind),
        right: createCdfDirectRenderable(descriptionContent.html, descriptionContent.renderKind),
        arrow: relationArrow,
      });
    } else if (displayParts.description) {
      const descriptionContent = this.renderMarkdownContent(displayParts.description);
      rows.push({
        kind: 'standalone',
        key: 'descriptor-answer',
        level: conceptTitle ? 1 : 0,
        content: createCdfDirectRenderable(descriptionContent.html, descriptionContent.renderKind),
      });
    }

    if (rows.length === 0) {
      return undefined;
    }

    let frontMask: CdfDirectScene['frontMask'] = null;
    if (isReverse && conceptTitle) {
      frontMask = {
        rowKey: 'concept',
        segment: 'whole',
      };
    } else if (!isReverse && rows.some((row) => row.key === 'descriptor')) {
      frontMask = {
        rowKey: 'descriptor',
        segment: 'right',
      };
    } else if (!isReverse && rows.some((row) => row.key === 'descriptor-answer') && rows.length > 1) {
      frontMask = {
        rowKey: 'descriptor-answer',
        segment: 'whole',
      };
    }

    return {
      rows,
      frontMask,
    };
  }

  private pickFirstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return '';
  }

  private buildMinimalFallbackContent(ancestorHtml: string, fallbackSource: string): string {
    const normalized = normalizeCueAnswerSource(fallbackSource);
    if (!normalized) {
      return '';
    }

    return `${ancestorHtml}<div class="descriptor-card-fallback" contenteditable="false">${this.renderMarkdownContent(normalized).html}</div>`;
  }

  private buildDescriptorQuestionHtml(options: {
    direction: 'forward' | 'reverse';
    primaryMarkdown: string;
    connectorText: string;
    secondaryMarkdown: string;
    trailingText: string;
  }): string {
    return `
      <div class="descriptor-card-question descriptor-card-question--${options.direction}" contenteditable="false">
        <div class="descriptor-card-question__segment descriptor-card-question__segment--primary">${this.renderMarkdownFragment(options.primaryMarkdown)}</div>
        <div class="descriptor-card-question__segment descriptor-card-question__segment--connector">${this.escapeHtml(options.connectorText)}</div>
        <div class="descriptor-card-question__segment descriptor-card-question__segment--secondary">${this.renderMarkdownFragment(options.secondaryMarkdown)}</div>
        <div class="descriptor-card-question__segment descriptor-card-question__segment--connector">${this.escapeHtml(options.trailingText)}</div>
      </div>
    `;
  }

  private buildDescriptorAnswerDividerHtml(): string {
    return `
      <div class="descriptor-card-answer-divider">
        <div class="descriptor-card-answer-divider__line"></div>
        <span class="descriptor-card-answer-divider__label">${this.escapeHtml(this.t('answerLabel', '答案'))}</span>
        <div class="descriptor-card-answer-divider__line"></div>
      </div>
    `;
  }

  private buildDescriptorAnswerHtml(className: string, markdown: string): string {
    return `<div class="${className}" contenteditable="false">${this.renderMarkdownContent(markdown).html}</div>`;
  }

  private renderMarkdownContent(
    markdown: string,
    options?: ReviewMarkdownRenderOptions,
  ): ReviewRenderedMarkdown {
    const normalized = String(markdown || '').trim();
    if (!normalized) {
      return {
        html: '',
        renderKind: options?.forceRenderKind ?? 'fragment',
        normalizedKramdown: '',
      };
    }

    const contentRenderer = this.repository as DescriptorCardRepository & {
      renderMarkdownContent?: (
        value: string,
        renderOptions?: ReviewMarkdownRenderOptions,
      ) => ReviewRenderedMarkdown;
    };
    if (typeof contentRenderer.renderMarkdownContent === 'function') {
      return contentRenderer.renderMarkdownContent(normalized, options);
    }

    return renderReviewMarkdown(normalized, options);
  }

  private renderMarkdownFragment(markdown: string): string {
    const normalized = String(markdown || '').trim();
    if (!normalized) {
      return '';
    }

    if (typeof (this.repository as DescriptorCardRepository & {
      renderMarkdownFragment?: (value: string) => string;
    }).renderMarkdownFragment === 'function') {
      return (this.repository as DescriptorCardRepository & {
        renderMarkdownFragment: (value: string) => string;
      }).renderMarkdownFragment(normalized);
    }

    return this.renderMarkdownContent(normalized, {
      forceRenderKind: 'fragment',
    }).html || `<p>${this.escapeHtml(normalized)}</p>`;
  }

  private escapeHtml(source: string): string {
    return String(source || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  private resolveDescriptorArrow(
    content: string,
    isReverse: boolean,
  ): '→' | '←' | '↔' {
    const normalized = String(content || '').replace(/\{:[^}]*\}/g, ' ').trim();
    if (/;<>|；《》|↔/.test(normalized)) {
      return '↔';
    }
    if (/;<|；《|←/.test(normalized) || isReverse) {
      return '←';
    }
    if (/;;|；；|->|→/.test(normalized)) {
      return '→';
    }
    return '→';
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
