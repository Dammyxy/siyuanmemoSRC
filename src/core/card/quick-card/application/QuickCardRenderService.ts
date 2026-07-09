import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { ReviewRichContentRenderer } from '@/core/card/common/application/ReviewRichContentRenderer';
import type { RichContentResult } from '@/core/card/common/application/richContent';
import type { QuickCardRepository } from '../infrastructure/QuickCardRepository';
import {
  QuickCardRenderError,
  type QuickCardType,
  type QuickCardMetadata,
  type QuickCardRenderDiagnosticCode,
} from '../domain/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QuickCardRenderService');

/**
 * 快速卡片视图模型
 */
export interface QuickCardViewModel extends BaseCardViewModel {
  /** Rich Review content */
  content: RichContentResult;
  /** CSS 类名列表 */
  cssClasses: string[];
  /** 卡片类型 */
  cardType: QuickCardType;
  /** 卡片元数据 */
  metadata: QuickCardMetadata;
  side: 'front' | 'back';
  diagnostics: QuickCardRenderDiagnosticCode[];
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
  private readonly viewModelCache = new Map<string, QuickCardViewModel>();

  constructor(
    private readonly repository: QuickCardRepository,
    private readonly richContentRenderer = new ReviewRichContentRenderer(),
  ) {
    super();
  }

  private shouldFallbackToNativeRender(metadata: QuickCardMetadata): boolean {
    return metadata.symbol === '==';
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
    const cacheKey = `${blockId}:${cardId || ''}:${side}`;
    const cached = this.viewModelCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        breadcrumbs: cached.breadcrumbs.map((item) => ({ ...item })),
        cssClasses: [...cached.cssClasses],
        metadata: {
          ...cached.metadata,
        },
      };
    }

    try {
      const card = await this.repository.loadCard(blockId, cardId);
      if (!card) {
        throw new QuickCardRenderError(
          'quick-source-block-missing',
          `Quick card source block not found: ${blockId}`,
          { blockId, cardId },
        );
      }
      if (this.shouldFallbackToNativeRender(card.metadata)) {
        logger.debug('[QuickCardRenderService] Use native renderer for == cloze card', {
          blockId,
          cardId,
        });
        throw new QuickCardRenderError(
          'quick-native-cloze-owned-by-protyle',
          'Quick card uses native cloze rendering instead of the quick renderer',
          { blockId, cardId, symbol: card.metadata.symbol },
        );
      }

      // 获取指定面的内容
      const face = card.getFace(side);
      if (!face.html.trim()) {
        throw new QuickCardRenderError(
          'quick-face-empty',
          `Quick card ${side} side is empty: ${blockId}`,
          { blockId, cardId, side },
        );
      }
      
      // 使用基类方法加载面包屑
      const breadcrumbs = await this.loadBreadcrumbs(blockId);

      const viewModel: QuickCardViewModel = {
        blockId,
        breadcrumbs,
        content: this.richContentRenderer.renderHtml(face.html, {
          id: `${blockId}:${side}`,
          kind: 'quick',
          field: side,
        }),
        cssClasses: face.getCssClasses(),
        cardType: card.type,
        metadata: card.metadata,
        side,
        diagnostics: [],
      };
      this.viewModelCache.set(cacheKey, {
        ...viewModel,
        breadcrumbs: viewModel.breadcrumbs.map((item) => ({ ...item })),
        cssClasses: [...viewModel.cssClasses],
        metadata: {
          ...viewModel.metadata,
        },
      });
      return viewModel;
    } catch (error) {
      logger.error('[QuickCardRenderService] Failed to prepare view model:', error);
      throw error;
    }
  }

  /**
   * 检测块是否为快速卡片
   * 
   * @param blockId - 块 ID
   * @returns 是否为快速卡片
   */
  async isQuickCard(blockId: string, cardId?: string): Promise<boolean> {
    try {
      const card = await this.repository.loadCard(blockId, cardId);
      if (!card) {
        return false;
      }
      if (this.shouldFallbackToNativeRender(card.metadata)) {
        return false;
      }
      return true;
    } catch (error) {
      logger.error('[QuickCardRenderService] Failed to detect quick card:', error);
      return false;
    }
  }
}
