/**
 * RetrievalPracticeEntry - 提取练习入口
 * 
 * 特点：
 * - 只复习 Item 类型的卡片（过滤 Topic）
 * - 记录作答，影响排期
 * - 支持"到期/全部"两种模式
 * - 使用 FilterGroupQueue + blockIds 过滤实现
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md 需求 2.1
 * @see .kiro/specs/block-menu-review-entries/design.md 章节 4.1
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

/**
 * 提取练习入口
 */
export class RetrievalPracticeEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'retrieval-practice',
      displayName: deps.i18n?.retrievalPractice || '提取练习',
      icon: 'iconRiffCard',
      queueType: QueueType.RetrievalPractice,
      recordReview: true,  // 记录作答
      cardTypeFilter: 'item-only',  // 只接受 Item
      supportDueMode: true,  // 支持"到期/全部"模式
    }, deps);
  }
  
  /**
   * 打开提取练习对话框
   * 
   * 使用 FilterGroupQueue + blockIds 过滤实现。
   * 
   * @param cards 卡片列表
   * @param mode 'due' | 'all'
   */
  protected async openReviewDialog(
    cards: FSRSCard[], 
    mode: 'due' | 'all'
  ): Promise<void> {
    // 过滤到期卡片
    const filteredCards = mode === 'due' 
      ? cards.filter(card => {
          const now = Date.now();
          return card.due <= now && 
                 !card.skipped && 
                 (!card.skipUntil || card.skipUntil <= now);
        })
      : cards;
    
    // 提取 blockIds
    const blockIds = filteredCards.map(c => c.blockId);
    
    // 调用 ReviewDialogManager 打开提取练习对话框
    // TODO: 需要在 ReviewDialogManager 中实现 openRetrievalPracticeWithFilter 方法
    await (this.deps.reviewDialogManager as any).openRetrievalPracticeWithFilter?.({
      blockIds,
      dueOnly: mode === 'due',
    });
  }
}
