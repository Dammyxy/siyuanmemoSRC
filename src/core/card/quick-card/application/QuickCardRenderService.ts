import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import type { QuickCardRepository } from '../infrastructure/QuickCardRepository';
import type { QuickCardType, QuickCardMetadata } from '../domain/types';

/**
 * 快速卡片视图模型
 */
export interface QuickCardViewModel extends BaseCardViewModel {
  /** 渲染的 HTML 内容 */
  html: string;
  /** CSS 类名列表 */
  cssClasses: string[];
  /** 卡片类型 */
  cardType: QuickCardType;
  /** 卡片元数据 */
  metadata: QuickCardMetadata;
}

/**
 * 快速卡片渲染结果（向后兼容）
 * @deprecated 使用 QuickCardViewModel 代替
 */
export interface QuickCardRenderResult {
  /** 渲染的 HTML 内容 */
  html: string;
  /** CSS 类名列表 */
  cssClasses: string[];
  /** 卡片类型 */
  cardType: QuickCardType;
  /** 卡片元数据 */
  metadata: QuickCardMetadata;
}

/**
 * 快速卡片渲染服务
 * 
 * 职责：
 * - 协调领域层和基础设施层
 * - 提供卡片渲染功能
 * - 处理正反面切换
 * - 继承基类提供面包屑等通用功能
 */
export class QuickCardRenderService extends BaseCardRenderService {
  constructor(private readonly repository: QuickCardRepository) {
    super();
  }

  /**
   * 准备视图模型（新架构方法）
   * 
   * @param blockId - 块 ID
   * @param side - 卡片面（front/back）
   * @param cardId - 卡片 ID（可选）
   * @returns 视图模型
   */
  async prepareViewModel(
    blockId: string,
    side: 'front' | 'back',
    cardId?: string
  ): Promise<QuickCardViewModel | null> {
    try {
      const card = await this.repository.loadCard(blockId, cardId);
      if (!card) {
        return null;
      }

      // 获取指定面的内容
      const face = card.getFace(side);
      
      // 使用基类方法加载面包屑
      const breadcrumbs = await this.loadBreadcrumbs(blockId);

      return {
        blockId,
        breadcrumbs,
        html: face.html,
        cssClasses: face.getCssClasses(),
        cardType: card.type,
        metadata: card.metadata,
      };
    } catch (error) {
      console.error('[QuickCardRenderService] Failed to prepare view model:', error);
      throw error;
    }
  }

  /**
   * 检测块是否为快速卡片
   * 
   * @param blockId - 块 ID
   * @returns 是否为快速卡片
   */
  async isQuickCard(blockId: string): Promise<boolean> {
    try {
      const card = await this.repository.loadCard(blockId);
      return card !== null;
    } catch (error) {
      console.error('[QuickCardRenderService] Failed to detect quick card:', error);
      return false;
    }
  }

  /**
   * 渲染指定面的卡片（向后兼容方法）
   * 
   * @deprecated 使用 prepareViewModel 代替
   * @param blockId - 块 ID
   * @param side - 卡片面（front/back）
   * @param cardId - 卡片 ID（可选，用于 Xiuyuan 多卡片场景）
   * @returns 渲染结果，如果不是快速卡片则返回 null
   */
  async render(
    blockId: string,
    side: 'front' | 'back',
    cardId?: string,
  ): Promise<QuickCardRenderResult | null> {
    // 加载卡片
    const card = await this.repository.loadCard(blockId, cardId);
    if (!card) {
      return null;
    }

    // 获取指定面
    const face = card.getFace(side);

    // 生成 CSS 类
    const cssClasses = face.getCssClasses();

    // 返回渲染结果
    return {
      html: face.html,
      cssClasses,
      cardType: card.type,
      metadata: card.metadata,
    };
  }

  /**
   * 切换卡片面
   * 
   * @param blockId - 块 ID
   * @param currentSide - 当前面
   * @param cardId - 卡片 ID（可选，用于 Xiuyuan 多卡片场景）
   * @returns 另一面的渲染结果
   */
  async toggleFace(
    blockId: string,
    currentSide: 'front' | 'back',
    cardId?: string,
  ): Promise<QuickCardRenderResult | null> {
    const nextSide = currentSide === 'front' ? 'back' : 'front';
    return this.render(blockId, nextSide, cardId);
  }
}
