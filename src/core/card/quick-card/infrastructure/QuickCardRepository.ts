/**
 * 快速卡片仓储
 * 
 * @description 负责加载和解析快速卡片
 * @layer Infrastructure Layer
 */

import {
  QuickCardRenderError,
  type SiyuanBlock,
  type QuickCardType,
  type QuickCardMetadata,
} from '../domain/types';
import { QuickCard } from '../domain/QuickCard';
import { CardFace } from '../domain/CardFace';
import { CardFaceStrategyFactory } from '../domain/strategies/CardFaceStrategyFactory';
import { SiyuanBlockAdapter } from './SiyuanBlockAdapter';
import type { IQuickCardConfigProvider } from './QuickCardConfigProvider';
import { DefaultQuickCardConfigProvider } from './QuickCardConfigProvider';
import type { ICardStorage } from '../../../../application/interfaces/ICardStorage';
import { createLogger } from '@/utils/logger';
import { hasFormulaClozeMarkerTargets } from '@/utils/formula-cloze-parser';

const logger = createLogger('QuickCardRepository');

/**
 * 卡片类型检测结果
 */
interface CardTypeInfo {
  type: QuickCardType;
  symbol: string;
}

interface BlockIdRow extends Record<string, unknown> {
  id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringMeta(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumberMeta(meta: Record<string, unknown>, key: string): number | undefined {
  const value = meta[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 快速卡片仓储
 * 
 * @description 负责从思源加载块数据并解析为快速卡片实体
 * @example
 * ```typescript
 * const adapter = new SiyuanBlockAdapter();
 * const repository = new QuickCardRepository(adapter);
 * const card = await repository.loadCard('20230101120000-abcdefg');
 * if (card) {
 *   console.log(`Card type: ${card.type}`);
 * }
 * ```
 */
export class QuickCardRepository {
  /**
   * 构造函数
   * 
   * @param adapter - 思源块适配器
   * @param cardStorage - 卡片存储接口（用于获取 FSRSCard）
   * @param configProvider - 配置提供者（可选，默认使用 DefaultQuickCardConfigProvider）
   */
  constructor(
    private adapter: SiyuanBlockAdapter,
    private cardStorage: ICardStorage | null = null,
    private configProvider: IQuickCardConfigProvider = new DefaultQuickCardConfigProvider(),
  ) {}

  private renderFaceHtml(faceHtml: string): string {
    const rendered = this.adapter.renderQuickFaceHtml(faceHtml);
    if (faceHtml.trim().length > 0 && rendered.trim().length === 0) {
      logger.warn('[SiYuanMemo][QuickCardRepository] Quick face render unexpectedly empty, falling back to source face text', {
        preview: faceHtml.substring(0, 120),
      });
      return faceHtml.trim();
    }
    return rendered;
  }

  /**
   * 加载快速卡片
   * 
   * @param blockId - 块 ID
   * @param cardId - 卡片 ID（可选，用于 Xiuyuan 多卡片场景）
   * @returns 快速卡片实体，如果不是快速卡片或加载失败则返回 null
   * 
   * @example
   * ```typescript
   * const card = await repository.loadCard('20230101120000-abcdefg');
   * if (card) {
   *   const frontFace = card.getFace('front');
   *   console.log(frontFace.html);
   * } else {
   *   console.log('Not a quick card or load failed');
   * }
   * ```
   */
  async loadCard(blockId: string, cardId?: string): Promise<QuickCard | null> {
    try {
      const isCardIdMissing = !cardId;
      logger.debug('[SiYuanMemo][QuickCardRepository] loadCard called:', {
        blockId,
        cardId,
        isCardIdMissing,
      });
      
      // 1. 获取块数据
      const block = await this.adapter.getBlock(blockId);
      if (!block) {
        logger.warn(`[SiYuanMemo][QuickCardRepository] Block not found: ${blockId}`);
        throw new QuickCardRenderError(
          'quick-source-block-missing',
          `Quick card source block not found: ${blockId}`,
          { blockId, cardId },
        );
      }

      // 2. 验证块数据
      if (!block.content) {
        logger.warn(`[SiYuanMemo][QuickCardRepository] Block has no content: ${blockId}`);
        throw new QuickCardRenderError(
          'quick-source-block-empty',
          `Quick card source block is empty: ${blockId}`,
          { blockId, cardId },
        );
      }

      logger.debug('[SiYuanMemo][QuickCardRepository] Block content:', block.content);

      // 3. 检测卡片类型
      const cardInfo = this.detectCardType(block.content);
      if (!cardInfo) {
        logger.debug(`[SiYuanMemo][QuickCardRepository] Not a quick card: ${blockId}`);
        throw new QuickCardRenderError(
          'quick-symbol-grammar-unparseable',
          `Quick card symbol grammar is not parseable: ${blockId}`,
          { blockId, cardId },
        );
      }

      logger.debug('[SiYuanMemo][QuickCardRepository] Detected card type:', {
        blockId,
        cardId,
        isCardIdMissing,
        detectedQuickType: cardInfo.type,
        symbol: cardInfo.symbol,
      });

      // 4. 构建元数据
      const metadata: QuickCardMetadata = {
        symbol: cardInfo.symbol,
        parentBlockId: block.parentID,
      };
      if (cardId) {
        metadata.cardId = cardId;
      }

      // 5. 如果提供了 cardId，尝试从 FSRSCard 的 meta 中获取 typeMarker 和挖空信息
      if (cardId) {
        logger.debug('[SiYuanMemo][QuickCardRepository] Fetching FSRSCard for cardId:', cardId);
        const fsrsCard = await this.getFSRSCard(cardId);
        logger.debug('[SiYuanMemo][QuickCardRepository] FSRSCard:', fsrsCard);
        logger.debug('[SiYuanMemo][QuickCardRepository] FSRSCard meta:', fsrsCard?.meta);

        if (fsrsCard?.blockId && fsrsCard.blockId !== blockId) {
          throw new QuickCardRenderError(
            'quick-card-source-mismatch',
            `Quick card id does not belong to source block: ${cardId}`,
            { blockId, cardId, cardBlockId: fsrsCard.blockId },
          );
        }
        
        if (isRecord(fsrsCard?.meta)) {
          const fsrsMeta = fsrsCard.meta;
          // 提取 typeMarker
          const typeMarker = readStringMeta(fsrsMeta, 'typeMarker');
          if (typeMarker) {
            metadata.typeMarker = typeMarker;
            logger.debug(`[SiYuanMemo][QuickCardRepository] ✅ Found typeMarker: ${metadata.typeMarker} for cardId: ${cardId}`);
          }
          
          // 🆕 提取挖空信息
          const clozeIndex = readNumberMeta(fsrsMeta, 'clozeIndex');
          if (clozeIndex !== undefined) {
            metadata.clozeIndex = clozeIndex;
            logger.debug(`[SiYuanMemo][QuickCardRepository] ✅ Found clozeIndex: ${metadata.clozeIndex} for cardId: ${cardId}`);
          }
          
          const totalClozes = readNumberMeta(fsrsMeta, 'totalClozes');
          if (totalClozes !== undefined) {
            metadata.totalClozes = totalClozes;
            logger.debug(`[SiYuanMemo][QuickCardRepository] ✅ Found totalClozes: ${metadata.totalClozes} for cardId: ${cardId}`);
          }
          
          const direction = readStringMeta(fsrsMeta, 'direction');
          if (direction === 'forward' || direction === 'reverse') {
            metadata.direction = direction;
            logger.debug(`[SiYuanMemo][QuickCardRepository] ✅ Found direction: ${metadata.direction} for cardId: ${cardId}`);
          }
        } else {
          logger.debug(`[SiYuanMemo][QuickCardRepository] ⚠️ No meta found for cardId: ${cardId}`);
        }
      } else {
        logger.debug('[SiYuanMemo][QuickCardRepository] No cardId provided, skip FSRS metadata enrichment', {
          blockId,
          cardId,
          isCardIdMissing,
          detectedQuickType: cardInfo.type,
        });
      }

      // 6. 对于描述符卡片，判断是否使用 Xiuyuan 模版
      if (cardInfo.type === 'descriptor') {
        metadata.isXiuyuanTemplate = await this.shouldUseXiuyuanTemplate(block);
      }

      // 7. 检测是否为列表项且有子列表项（无序列表）
      if (block.type === 'i') {
        const hasListChildren = await this.checkHasListChildren(blockId);
        if (hasListChildren) {
          metadata.hasListChildren = true;
          logger.debug(`[SiYuanMemo][QuickCardRepository] ✅ Block ${blockId} has list children, will hide them on front`);
        }
      }

      logger.debug('[SiYuanMemo][QuickCardRepository] Final metadata:', metadata);

      // 7. 获取策略并解析
      const strategy = CardFaceStrategyFactory.create(cardInfo.type);
      const { front, back } = strategy.parse(block.content, metadata);

      logger.debug('[SiYuanMemo][QuickCardRepository] Parsed faces:', {
        frontHtml: front.html.substring(0, 100),
        backHtml: back.html.substring(0, 100),
      });

      // 8. 渲染内容：
      //    LaTeX cloze 直接保留 kramdown，由 QuickCardRenderer + KaTeX 统一渲染。
      //    避免 SpinBlockDOM 在公式场景输出空壳节点导致内容不可见。
      const shouldKeepRawLatexKramdown = metadata.symbol === '\\cloze';
      const frontHtmlRendered = shouldKeepRawLatexKramdown
        ? front.html
        : this.renderFaceHtml(front.html);
      const backHtmlRendered = shouldKeepRawLatexKramdown
        ? back.html
        : this.renderFaceHtml(back.html);

      logger.debug('[SiYuanMemo][QuickCardRepository] Rendered HTML:', {
        shouldKeepRawLatexKramdown,
        frontHtml: frontHtmlRendered.substring(0, 100),
        backHtml: backHtmlRendered.substring(0, 100),
      });

      // 9. 创建 CardFace 实例（使用渲染后的 HTML）
      const frontFace = new CardFace({
        html: frontHtmlRendered,
        hiddenTypes: front.hiddenTypes,
      });
      const backFace = new CardFace({
        html: backHtmlRendered,
        hiddenTypes: back.hiddenTypes,
      });

      // 10. 创建快速卡片实体
      return new QuickCard({
        id: cardId || `quick-card-${blockId}`,
        blockId,
        type: cardInfo.type,
        frontContent: frontFace,
        backContent: backFace,
        metadata,
      });
    } catch (error) {
      if (error instanceof QuickCardRenderError) {
        throw error;
      }
      logger.error(`[SiYuanMemo][QuickCardRepository] Failed to load card ${blockId}:`, error);
      return null;
    }
  }

  /**
   * 获取 FSRSCard
   * 
   * @param cardId - 卡片 ID
   * @returns FSRSCard 或 null
   */
  private async getFSRSCard(
    cardId: string
  ): Promise<Awaited<ReturnType<ICardStorage['getCard']>>> {
    try {
      // 通过依赖注入的 cardStorage 获取卡片
      if (!this.cardStorage) {
        logger.warn('[SiYuanMemo][QuickCardRepository] CardStorage not available');
        return null;
      }
      return await this.cardStorage.getCard(cardId);
    } catch (error) {
      logger.error(`[SiYuanMemo][QuickCardRepository] Failed to get FSRSCard:`, error);
      return null;
    }
  }

  /**
   * 检测卡片类型
   * 
   * @param content - 块内容
   * @returns 卡片类型信息，如果不是快速卡片则返回 null
   * 
   * @description 按优先级检测卡片类型：
   * 1. >>> 或 》》》 (multiLine)
   * 2. >> 或 》》 (basic)
   * 3. << 或 《《 (basic)
   * 4. <> 或 《》 (basic)
   * 5. :: 或 ：： (concept)
   * 6. ;; 或 ；； (descriptor)
   * 7. {{}} 或 == (cloze)
   */
  private detectCardType(content: string): CardTypeInfo | null {
    // 添加空值检查
    if (!content || typeof content !== 'string') {
      logger.warn('[SiYuanMemo][QuickCardRepository] Invalid content:', content);
      return null;
    }

    // 优先级从高到低检测
    if (content.includes('>>>') || content.includes('》》》')) {
      return { type: 'multiLine', symbol: content.includes('>>>') ? '>>>' : '》》》' };
    }
    if (content.includes('>>') || content.includes('》》')) {
      return { type: 'basic', symbol: content.includes('>>') ? '>>' : '》》' };
    }
    if (content.includes('<<') || content.includes('《《')) {
      return { type: 'basic', symbol: content.includes('<<') ? '<<' : '《《' };
    }
    if (content.includes('<>') || content.includes('《》')) {
      return { type: 'basic', symbol: content.includes('<>') ? '<>' : '《》' };
    }
    if (content.includes('::') || content.includes('：：')) {
      return { type: 'concept', symbol: content.includes('::') ? '::' : '：：' };
    }
    if (content.includes(';;') || content.includes('；；')) {
      return { type: 'descriptor', symbol: content.includes(';;') ? ';;' : '；；' };
    }
    // 检测填空符号：{{}} 或 ==
    // 注意：需要排除三花括号（如超级块语法 {{{row ...}}}）
    if (/(^|[^{}])\{\{(?!\{)[\s\S]*?\}\}(?!\})/.test(content)) {
      return { type: 'cloze', symbol: '{{}}' };
    }
    if (content.match(/==[^=]+==/)) {
      return { type: 'cloze', symbol: '==' };
    }
    if (hasFormulaClozeMarkerTargets(content)) {
      return { type: 'cloze', symbol: '\\cloze' };
    }

    return null;
  }

  /**
   * 判断是否使用 Xiuyuan 模版
   * 
   * @param block - 块数据
   * @returns 是否使用 Xiuyuan 模版
   * 
   * @description 判断条件：
   * 1. 配置中启用 descriptorUseXiuyuan
   * 2. 父块存在
   * 3. 父块内容包含 :: 符号（是概念卡片）
   */
  private async shouldUseXiuyuanTemplate(block: SiyuanBlock): Promise<boolean> {
    // 1. 检查配置
    const config = this.configProvider.getConfig();
    if (!config.descriptorUseXiuyuan) {
      return false;
    }

    // 2. 检查父块是否存在
    if (!block.parentID) {
      return false;
    }

    // 3. 检查父块是否为概念卡片
    const parentBlock = await this.adapter.getBlock(block.parentID);
    if (!parentBlock) {
      return false;
    }

    return parentBlock.content.includes('::');
  }

  /**
   * 检查列表项是否有子列表项
   * 
   * @param blockId - 块 ID
   * @returns 是否有子列表项
   * 
   * @description 检测逻辑：
   * 1. 获取列表容器（type = 'l'）
   * 2. 检查列表容器是否有子列表项（type = 'i'）
   * 3. 排除有序列表（subtype = 'o'），因为有序列表使用列表模板
   */
  private async checkHasListChildren(blockId: string): Promise<boolean> {
    try {
      // 动态导入 sql 函数，避免循环依赖
      const { sql } = await import('@/core/siyuan/api');
      
      // 1. 获取列表容器
      const listContainerResult = await sql<BlockIdRow>(`
        SELECT id FROM blocks
        WHERE parent_id = '${blockId}'
        AND type = 'l'
        LIMIT 1
      `);
      
      if (!listContainerResult || listContainerResult.length === 0) {
        return false;
      }
      
      const listContainerId = typeof listContainerResult[0]?.id === 'string'
        ? listContainerResult[0].id
        : '';
      if (!listContainerId) {
        return false;
      }
      
      // 2. 检查是否有子列表项（排除有序列表）
      const childrenResult = await sql<BlockIdRow>(`
        SELECT id FROM blocks
        WHERE parent_id = '${listContainerId}'
        AND type = 'i'
        AND (subtype IS NULL OR subtype != 'o')
        LIMIT 1
      `);
      
      return childrenResult && childrenResult.length > 0;
    } catch (err) {
      logger.error('[QuickCardRepository] Failed to check list children:', err);
      return false;
    }
  }
}

