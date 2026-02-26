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
import { createLogger } from '@/utils/logger';
import {
  resolveLuteRenderer,
  resolveSiyuanMemoPlugin,
  type XiuyuanEntityPort,
  type XiuyuanQueryResult,
} from './runtime';

interface GetXiuyuanQueryResult {
  xiuyuan: XiuyuanEntityPort;
}

export interface ConceptDefinitionCardInput {
  xiuyuanID?: string;
  meta?: {
    xiuyuanID?: string;
    typeMarker?: string;
    faceIndex?: number;
  };
  [key: string]: unknown;
}

interface ConceptDefinitionCardRenderPorts {
  getXiuyuan?: (xiuyuanID: string) => Promise<GetXiuyuanQueryResult>;
  renderMarkdown?: (kramdown: string) => string;
}

const logger = createLogger('ConceptDefinitionCardRenderService');

function isXiuyuanQueryResult(value: unknown): value is XiuyuanQueryResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as XiuyuanQueryResult;
  return !!candidate.xiuyuan && typeof candidate.xiuyuan.getFaces === 'function';
}

/**
 * 概念定义卡视图模型
 */
export interface ConceptDefinitionCardViewModel extends BaseCardViewModel {
  conceptName: string;
  conceptBlockId: string;
  definitionHtml: string;
  frontHtml: string;  // 🆕 正面 HTML（问题）
  backHtml: string;   // 🆕 背面 HTML（答案）
  clozeIndex?: number;
  totalClozes?: number;
  isReverse?: boolean; // 是否为反向卡片
}

/**
 * 概念定义卡渲染服务
 */
export class ConceptDefinitionCardRenderService extends BaseCardRenderService {

  constructor(
    private i18n: Record<string, string> = {},
    private ports: ConceptDefinitionCardRenderPorts = {}
  ) {
    super();
  }

  private t(key: string, fallback: string): string {
    return this.i18n[key] || fallback;
  }
  /**
   * 准备视图模型
   * 
   * @param blockId 块 ID
   * @param card FSRSCard，包含 xiuyuanID 和 typeMarker
   * @returns 视图模型
   */
  async prepareViewModel(blockId: string, card?: ConceptDefinitionCardInput): Promise<ConceptDefinitionCardViewModel> {
    // 1. 获取 Xiuyuan 信息
    logger.debug('[ConceptDefinitionCardRenderService] prepareViewModel called with:', {
      blockId,
      hasCard: !!card,
      cardXiuyuanID: card?.xiuyuanID,
      metaXiuyuanID: card?.meta?.xiuyuanID,
      typeMarker: card?.meta?.typeMarker,
      cardKeys: card ? Object.keys(card) : [],
      metaKeys: card?.meta ? Object.keys(card.meta) : []
    });
    
    // 优先使用顶层的 xiuyuanID，如果没有则使用 meta 中的
    const xiuyuanID = card?.xiuyuanID || card?.meta?.xiuyuanID;
    
    logger.debug('[ConceptDefinitionCardRenderService] Resolved xiuyuanID:', {
      xiuyuanID,
      type: typeof xiuyuanID,
      isUndefined: xiuyuanID === undefined,
      isNull: xiuyuanID === null,
      isFalsy: !xiuyuanID
    });
    
    if (!xiuyuanID) {
      logger.error('[ConceptDefinitionCardRenderService] No xiuyuanID found in card:', card);
      throw new Error('No xiuyuanID found in card');
    }

    // 2. 从 Xiuyuan 存储中获取领域对象
    const result = await this.getXiuyuan(xiuyuanID);
    const xiuyuan = result.xiuyuan;
    
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    // 3. 获取卡片面索引
    const faceIndex = card?.meta?.faceIndex ?? 0;
    const faces = xiuyuan.getFaces(); // 使用领域对象的方法
    
    if (!faces || faceIndex >= faces.length) {
      throw new Error(`Invalid faceIndex: ${faceIndex}, total faces: ${faces?.length || 0}`);
    }

    const face = faces[faceIndex];
    
    // 4. 获取概念块 ID 和定义块 ID
    // 注意：CardFace 中的 questionBlockId 和 answerBlockId 根据卡片方向不同而不同
    // - 正向卡：questionBlockId = 概念块，answerBlockId = 定义块
    // - 反向卡：questionBlockId = 定义块，answerBlockId = 概念块
    // 但我们总是需要：概念块用于显示概念名称，定义块用于显示定义内容
    
    const isReverse = card?.meta?.typeMarker?.includes('reverse') === true;
    const conceptBlockId = isReverse ? face.answerBlockId : face.questionBlockId;
    const definitionBlockId = isReverse ? face.questionBlockId : face.answerBlockId;

    logger.debug('[ConceptDefinitionCardRenderService] Block IDs from CardFace:', {
      conceptBlockId,
      definitionBlockId,
      faceIndex,
      typeMarker: card?.meta?.typeMarker,
      isReverse,
      questionBlockId: face.questionBlockId,
      answerBlockId: face.answerBlockId
    });

    if (!conceptBlockId || !definitionBlockId) {
      throw new Error('Missing concept or definition block ID in CardFace');
    }

    // 5. 获取概念名称
    logger.debug('[ConceptDefinitionCardRenderService] About to get concept name:', {
      conceptBlockId,
      definitionBlockId,
      isReverse,
      faceQuestionBlockId: face.questionBlockId,
      faceAnswerBlockId: face.answerBlockId
    });
    
    const conceptName = await this.getConceptName(conceptBlockId);
    
    logger.debug('[ConceptDefinitionCardRenderService] Concept name:', {
      conceptName,
      length: conceptName.length,
      preview: conceptName.substring(0, 50)
    });

    // 6. 获取定义内容
    const { kramdown: definitionKramdown } = await getBlockKramdown(definitionBlockId);
    
    logger.debug('[ConceptDefinitionCardRenderService] Definition kramdown:', {
      length: definitionKramdown?.length,
      preview: definitionKramdown?.substring(0, 100)
    });
    
    if (!definitionKramdown) {
      throw new Error(`Definition block has no content: ${definitionBlockId}`);
    }

    // 7. 解析定义块内容
    // 格式：((ref '概念')):>定义 或 ((ref '概念')):<定义 或 ((ref '概念'))::定义 {: 属性}
    // 我们需要提取符号后面的部分（去掉属性）
    // 支持的符号：::, :>, :<, ：：, ：》, ：《
    const definitionMatch = definitionKramdown.match(/(?:::|:>|:<|：：|：》|：《)(.+?)(?:\s*\{:|$)/s);
    const definitionText = definitionMatch ? definitionMatch[1].trim() : definitionKramdown;
    
    logger.debug('[ConceptDefinitionCardRenderService] Parsed definition:', {
      original: definitionKramdown.substring(0, 100),
      extracted: definitionText.substring(0, 100),
      matchFound: !!definitionMatch
    });

    // 8. 解析挖空
    const clozes = this.parseClozes(definitionText);

    // 9. 确定当前挖空索引（isReverse 已在前面计算）
    const { clozeIndex } = this.parseTypeMarker(card?.meta?.typeMarker);

    // 10. 生成定义 HTML（隐藏当前挖空）
    const processedKramdown = this.processDefinitionKramdown(
      definitionText,
      clozes,
      clozeIndex
    );

    // 11. 使用 Lute 渲染 Markdown
    const definitionHtml = this.renderMarkdown(processedKramdown);

    // 12. 使用基类方法加载面包屑
    const breadcrumbs = await this.loadBreadcrumbs(blockId);

    // 13. 生成 frontHtml 和 backHtml（类似描述符卡的格式）
    let frontHtml: string;
    let backHtml: string;
    
    if (!isReverse) {
      // 正向卡：问概念的定义
      const questionText = this.t('conceptDefinitionQuestion', '{concept}的定义？').replace('{concept}', conceptName);
      frontHtml = `
        <div class="concept-definition-question">
          <span class="concept-name">${conceptName}</span>
          <span class="question-text">${questionText.replace(conceptName, '')}</span>
        </div>
      `;

      backHtml = `
        <div class="concept-definition-answer">
          <div class="question-repeat">
            <span class="concept-name">${conceptName}</span>
            <span class="question-text">${questionText.replace(conceptName, '')}</span>
          </div>
          <div class="answer-divider"><span>${this.t('answerLabel', '答案')}</span></div>
          <div class="definition-content">${definitionHtml}</div>
        </div>
      `;
    } else {
      // 反向卡：给定义问概念
      const reverseQuestion = this.t('conceptDefinitionReverseQuestion', '以下是哪个概念的定义？');
      frontHtml = `
        <div class="concept-definition-question reverse">
          <div class="reverse-label">${reverseQuestion}</div>
          <div class="definition-content">${definitionHtml}</div>
        </div>
      `;

      backHtml = `
        <div class="concept-definition-answer reverse">
          <div class="question-repeat">
            <div class="reverse-label">${reverseQuestion}</div>
            <div class="definition-content">${definitionHtml}</div>
          </div>
          <div class="answer-divider"><span>${this.t('answerLabel', '答案')}</span></div>
          <div class="concept-answer">
            <span class="concept-name large">${conceptName}</span>
          </div>
        </div>
      `;
    }

    // 14. 构建视图模型
    return {
      blockId,
      breadcrumbs,
      conceptName,
      conceptBlockId,
      definitionHtml,
      frontHtml,
      backHtml,
      clozeIndex: clozes.length > 0 ? clozeIndex : undefined,
      totalClozes: clozes.length > 0 ? clozes.length : undefined,
      isReverse,
    };
  }

  /**
   * 获取 Xiuyuan 对象
   */
  private async getXiuyuan(xiuyuanID: string): Promise<GetXiuyuanQueryResult> {
    if (this.ports.getXiuyuan) {
      return this.ports.getXiuyuan(xiuyuanID);
    }

    logger.debug('[ConceptDefinitionCardRenderService] getXiuyuan called with:', {
      xiuyuanID,
      type: typeof xiuyuanID,
      isUndefined: xiuyuanID === undefined
    });
    
    // 通过 window 获取 plugin 实例
    const plugin = resolveSiyuanMemoPlugin();

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // 获取 XiuyuanApplicationService
    const context = await plugin.getContext?.();
    const xiuyuanAppService = await context?.getXiuyuanApplicationService?.();
    if (!xiuyuanAppService) {
      throw new Error('XiuyuanApplicationService not available');
    }

    logger.debug('[ConceptDefinitionCardRenderService] About to call xiuyuanAppService.getXiuyuan with:', {
      xiuyuanID,
      type: typeof xiuyuanID
    });

    // 从 XiuyuanApplicationService 获取 Xiuyuan
    // 注意：getXiuyuan 接收的是一个查询对象，不是直接的字符串
    const rawResult = await xiuyuanAppService.getXiuyuan({ xiuyuanId: xiuyuanID });
    
    logger.debug('[ConceptDefinitionCardRenderService] getXiuyuan result:', {
      hasResult: !!rawResult,
      resultType: typeof rawResult,
      resultKeys: rawResult ? Object.keys(rawResult) : [],
      hasXiuyuan: isXiuyuanQueryResult(rawResult),
      xiuyuanType: isXiuyuanQueryResult(rawResult) ? typeof rawResult.xiuyuan : 'undefined',
      xiuyuanValue: isXiuyuanQueryResult(rawResult) ? rawResult.xiuyuan : undefined,
    });
    
    if (!isXiuyuanQueryResult(rawResult)) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    return { xiuyuan: rawResult.xiuyuan };
  }

  /**
   * 获取概念名称
   */
  private async getConceptName(conceptBlockId: string): Promise<string> {
    const conceptQuery = `SELECT content FROM blocks WHERE id = '${conceptBlockId}' LIMIT 1`;
    const conceptResult = await sql(conceptQuery);
    
    logger.debug('[ConceptDefinitionCardRenderService] getConceptName query result:', {
      conceptBlockId,
      hasResult: !!conceptResult && conceptResult.length > 0,
      content: conceptResult?.[0]?.content
    });
    
    if (!conceptResult || conceptResult.length === 0) {
      throw new Error(`Concept block not found: ${conceptBlockId}`);
    }

    let conceptName = conceptResult[0].content;
    
    // 如果概念名称包含方向符号（::, :>, :<），说明这是定义块而不是概念文档块
    // 需要从符号前面提取块引用中的概念名称
    if (conceptName.match(/(?:::|:>|:<|：：|：》|：《)/)) {
      logger.debug('[ConceptDefinitionCardRenderService] Detected definition block format, extracting concept from block reference');
      
      // 格式：((block-id '概念名称')):>定义
      // 提取块引用中的别名作为概念名称
      const blockRefMatch = conceptName.match(/\(\([^\)]+\s+'([^']+)'\)\)/);
      if (blockRefMatch) {
        conceptName = blockRefMatch[1];
        logger.debug('[ConceptDefinitionCardRenderService] Extracted concept name from block reference alias:', conceptName);
      } else {
        // 如果没有别名，尝试从块引用的 ID 获取文档标题
        const blockIdMatch = conceptName.match(/\(\((\d{14}-[a-z0-9]{7})/);
        if (blockIdMatch) {
          const refBlockId = blockIdMatch[1];
          const refQuery = `SELECT content FROM blocks WHERE id = '${refBlockId}' LIMIT 1`;
          const refResult = await sql(refQuery);
          if (refResult && refResult.length > 0) {
            conceptName = refResult[0].content;
            logger.debug('[ConceptDefinitionCardRenderService] Extracted concept name from referenced block:', conceptName);
          }
        }
      }
    }

    return conceptName;
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
    if (this.ports.renderMarkdown) {
      return this.ports.renderMarkdown(kramdown);
    }

    const lute = resolveLuteRenderer();
    if (!lute) {
      throw new Error('Lute not available');
    }
    return lute.Md2BlockDOM(kramdown);
  }
}

