/**
 * 快速卡片仓储
 * 
 * @description 负责加载和解析快速卡片
 * @layer Infrastructure Layer
 */

import type { SiyuanBlock, QuickCardType, QuickCardMetadata } from '../domain/types';
import { QuickCard } from '../domain/QuickCard';
import { CardFace } from '../domain/CardFace';
import { CardFaceStrategyFactory } from '../domain/strategies/CardFaceStrategyFactory';
import { SiyuanBlockAdapter } from './SiyuanBlockAdapter';
import type { IQuickCardConfigProvider } from './QuickCardConfigProvider';
import { DefaultQuickCardConfigProvider } from './QuickCardConfigProvider';
import type { ICardStorage } from '../../../../application/interfaces/ICardStorage';

/**
 * 卡片类型检测结果
 */
interface CardTypeInfo {
  type: QuickCardType;
  symbol: string;
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
      console.log('[SiYuanMemo][QuickCardRepository] loadCard called:', { blockId, cardId });
      
      // 🆕 如果没有 cardId，说明是虚拟闪卡（topic card），不使用快速卡渲染
      // 让它降级到 Protyle 渲染，这样块引用才能正确显示
      if (!cardId) {
        console.log('[SiYuanMemo][QuickCardRepository] No cardId provided, skipping quick card detection for virtual card');
        return null;
      }
      
      // 1. 获取块数据
      const block = await this.adapter.getBlock(blockId);
      if (!block) {
        console.warn(`[SiYuanMemo][QuickCardRepository] Block not found: ${blockId}`);
        return null;
      }

      // 2. 验证块数据
      if (!block.content) {
        console.warn(`[SiYuanMemo][QuickCardRepository] Block has no content: ${blockId}`);
        return null;
      }

      console.log('[SiYuanMemo][QuickCardRepository] Block content:', block.content);

      // 3. 检测卡片类型
      const cardInfo = this.detectCardType(block.content);
      if (!cardInfo) {
        console.debug(`[SiYuanMemo][QuickCardRepository] Not a quick card: ${blockId}`);
        return null;
      }

      console.log('[SiYuanMemo][QuickCardRepository] Detected card type:', cardInfo);

      // 4. 构建元数据
      const metadata: QuickCardMetadata = {
        symbol: cardInfo.symbol,
        parentBlockId: block.parentID,
        cardId,
      };

      // 5. 如果提供了 cardId，尝试从 FSRSCard 的 meta 中获取 typeMarker 和挖空信息
      if (cardId) {
        console.log('[SiYuanMemo][QuickCardRepository] Fetching FSRSCard for cardId:', cardId);
        const fsrsCard = await this.getFSRSCard(cardId);
        console.log('[SiYuanMemo][QuickCardRepository] FSRSCard:', fsrsCard);
        console.log('[SiYuanMemo][QuickCardRepository] FSRSCard meta:', fsrsCard?.meta);
        
        if (fsrsCard?.meta) {
          // 提取 typeMarker
          if (fsrsCard.meta.typeMarker) {
            metadata.typeMarker = fsrsCard.meta.typeMarker;
            console.log(`[SiYuanMemo][QuickCardRepository] ✅ Found typeMarker: ${metadata.typeMarker} for cardId: ${cardId}`);
          }
          
          // 🆕 提取挖空信息
          if (fsrsCard.meta.clozeIndex !== undefined) {
            metadata.clozeIndex = fsrsCard.meta.clozeIndex;
            console.log(`[SiYuanMemo][QuickCardRepository] ✅ Found clozeIndex: ${metadata.clozeIndex} for cardId: ${cardId}`);
          }
          
          if (fsrsCard.meta.totalClozes !== undefined) {
            metadata.totalClozes = fsrsCard.meta.totalClozes;
            console.log(`[SiYuanMemo][QuickCardRepository] ✅ Found totalClozes: ${metadata.totalClozes} for cardId: ${cardId}`);
          }
          
          if (fsrsCard.meta.direction) {
            metadata.direction = fsrsCard.meta.direction;
            console.log(`[SiYuanMemo][QuickCardRepository] ✅ Found direction: ${metadata.direction} for cardId: ${cardId}`);
          }
        } else {
          console.log(`[SiYuanMemo][QuickCardRepository] ⚠️ No meta found for cardId: ${cardId}`);
        }
      } else {
        console.log('[SiYuanMemo][QuickCardRepository] ⚠️ No cardId provided, cannot fetch metadata');
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
          console.log(`[SiYuanMemo][QuickCardRepository] ✅ Block ${blockId} has list children, will hide them on front`);
        }
      }

      console.log('[SiYuanMemo][QuickCardRepository] Final metadata:', metadata);

      // 7. 获取策略并解析
      const strategy = CardFaceStrategyFactory.create(cardInfo.type);
      const { front, back } = strategy.parse(block.content, metadata);

      console.log('[SiYuanMemo][QuickCardRepository] Parsed faces:', {
        frontHtml: front.html.substring(0, 100),
        backHtml: back.html.substring(0, 100),
      });

      // 8. 使用 Lute 渲染 kramdown 为 HTML
      const frontHtmlRendered = this.adapter.kramdownToHtml(front.html);
      const backHtmlRendered = this.adapter.kramdownToHtml(back.html);

      console.log('[SiYuanMemo][QuickCardRepository] Rendered HTML:', {
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
      console.error(`[SiYuanMemo][QuickCardRepository] Failed to load card ${blockId}:`, error);
      return null;
    }
  }

  /**
   * 获取 FSRSCard
   * 
   * @param cardId - 卡片 ID
   * @returns FSRSCard 或 null
   */
  private async getFSRSCard(cardId: string): Promise<any | null> {
    try {
      // 通过依赖注入的 cardStorage 获取卡片
      if (!this.cardStorage) {
        console.warn('[SiYuanMemo][QuickCardRepository] CardStorage not available');
        return null;
      }
      return await this.cardStorage.getCard(cardId);
    } catch (error) {
      console.error(`[SiYuanMemo][QuickCardRepository] Failed to get FSRSCard:`, error);
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
      console.warn('[SiYuanMemo][QuickCardRepository] Invalid content:', content);
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
    if (content.includes('{{') && content.includes('}}')) {
      return { type: 'cloze', symbol: '{{}}' };
    }
    if (content.match(/==[^=]+==/)) {
      return { type: 'cloze', symbol: '==' };
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
      const listContainerResult = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${blockId}'
        AND type = 'l'
        LIMIT 1
      `);
      
      if (!listContainerResult || listContainerResult.length === 0) {
        return false;
      }
      
      const listContainerId = listContainerResult[0].id;
      
      // 2. 检查是否有子列表项（排除有序列表）
      const childrenResult = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${listContainerId}'
        AND type = 'i'
        AND (subtype IS NULL OR subtype != 'o')
        LIMIT 1
      `);
      
      return childrenResult && childrenResult.length > 0;
    } catch (err) {
      console.error('[QuickCardRepository] Failed to check list children:', err);
      return false;
    }
  }
}

