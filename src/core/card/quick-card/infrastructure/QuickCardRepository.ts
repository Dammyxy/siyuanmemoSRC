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
   * @param configProvider - 配置提供者（可选，默认使用 DefaultQuickCardConfigProvider）
   */
  constructor(
    private adapter: SiyuanBlockAdapter,
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
      console.log('[QuickCardRepository] loadCard called:', { blockId, cardId });
      
      // 1. 获取块数据
      const block = await this.adapter.getBlock(blockId);
      if (!block) {
        console.warn(`[QuickCardRepository] Block not found: ${blockId}`);
        return null;
      }

      // 2. 验证块数据
      if (!block.content) {
        console.warn(`[QuickCardRepository] Block has no content: ${blockId}`);
        return null;
      }

      console.log('[QuickCardRepository] Block content:', block.content);

      // 3. 检测卡片类型
      const cardInfo = this.detectCardType(block.content);
      if (!cardInfo) {
        console.debug(`[QuickCardRepository] Not a quick card: ${blockId}`);
        return null;
      }

      console.log('[QuickCardRepository] Detected card type:', cardInfo);

      // 4. 构建元数据
      const metadata: QuickCardMetadata = {
        symbol: cardInfo.symbol,
        parentBlockId: block.parentID,
        cardId,
      };

      // 5. 如果提供了 cardId，尝试从 FSRSCard 的 meta 中获取 typeMarker
      if (cardId) {
        console.log('[QuickCardRepository] Fetching FSRSCard for cardId:', cardId);
        const fsrsCard = await this.getFSRSCard(cardId);
        console.log('[QuickCardRepository] FSRSCard:', fsrsCard);
        console.log('[QuickCardRepository] FSRSCard meta:', fsrsCard?.meta);
        
        if (fsrsCard?.meta?.typeMarker) {
          metadata.typeMarker = fsrsCard.meta.typeMarker;
          console.log(`[QuickCardRepository] ✅ Found typeMarker: ${metadata.typeMarker} for cardId: ${cardId}`);
        } else {
          console.log(`[QuickCardRepository] ⚠️ No typeMarker found for cardId: ${cardId}`);
        }
      } else {
        console.log('[QuickCardRepository] ⚠️ No cardId provided, cannot fetch typeMarker');
      }

      // 6. 对于描述符卡片，判断是否使用 Xiuyuan 模版
      if (cardInfo.type === 'descriptor') {
        metadata.isXiuyuanTemplate = await this.shouldUseXiuyuanTemplate(block);
      }

      console.log('[QuickCardRepository] Final metadata:', metadata);

      // 7. 获取策略并解析
      const strategy = CardFaceStrategyFactory.create(cardInfo.type);
      const { front, back } = strategy.parse(block.content, metadata);

      console.log('[QuickCardRepository] Parsed faces:', {
        frontHtml: front.html.substring(0, 100),
        backHtml: back.html.substring(0, 100),
      });

      // 8. 创建 CardFace 实例
      const frontFace = new CardFace(front);
      const backFace = new CardFace(back);

      // 9. 创建快速卡片实体
      return new QuickCard({
        id: cardId || `quick-card-${blockId}`,
        blockId,
        type: cardInfo.type,
        frontContent: frontFace,
        backContent: backFace,
        metadata,
      });
    } catch (error) {
      console.error(`[QuickCardRepository] Failed to load card ${blockId}:`, error);
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
      // 通过全局插件实例获取 storage
      const plugin = (window as any).siyuanMemoPlugin;
      if (!plugin?.storage) {
        return null;
      }
      return plugin.storage.getCard(cardId) || null;
    } catch (error) {
      console.error(`[QuickCardRepository] Failed to get FSRSCard:`, error);
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
   * 1. >>> (multiLine)
   * 2. >> (basic)
   * 3. << (basic)
   * 4. <> (basic)
   * 5. :: (concept)
   * 6. ;; (descriptor)
   * 7. {{}} (cloze)
   */
  private detectCardType(content: string): CardTypeInfo | null {
    // 添加空值检查
    if (!content || typeof content !== 'string') {
      console.warn('[QuickCardRepository] Invalid content:', content);
      return null;
    }

    // 优先级从高到低检测
    if (content.includes('>>>')) {
      return { type: 'multiLine', symbol: '>>>' };
    }
    if (content.includes('>>')) {
      return { type: 'basic', symbol: '>>' };
    }
    if (content.includes('<<')) {
      return { type: 'basic', symbol: '<<' };
    }
    if (content.includes('<>')) {
      return { type: 'basic', symbol: '<>' };
    }
    if (content.includes('::')) {
      return { type: 'concept', symbol: '::' };
    }
    if (content.includes(';;')) {
      return { type: 'descriptor', symbol: ';;' };
    }
    if (content.includes('{{') && content.includes('}}')) {
      return { type: 'cloze', symbol: '{{}}' };
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
}
