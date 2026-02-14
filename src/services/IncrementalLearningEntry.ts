/**
 * IncrementalLearningEntry - 渐进学习入口
 * 
 * 特点：
 * - 复习 Item + Topic 类型的卡片（接受所有类型）
 * - 记录作答，影响排期
 * - 支持"到期/全部"两种模式
 * - 使用 FilterGroupQueue + blockIds 过滤实现
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md 需求 2.2
 * @see .kiro/specs/block-menu-review-entries/design.md 章节 4.2
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

/**
 * 渐进学习入口
 */
export class IncrementalLearningEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'incremental-learning',
      displayName: '渐进学习',
      icon: 'iconBook',
      queueType: QueueType.IncrementalLearning,
      recordReview: true,  // 记录作答
      cardTypeFilter: 'all',  // 接受 Item + Topic
      supportDueMode: true,  // 支持"到期/全部"模式
    }, deps);
  }
  
  /**
   * 打开渐进学习对话框
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
    
    // 调用 ReviewDialogManager 打开渐进学习对话框
    await (this.deps.reviewDialogManager as any).openIncrementalLearningWithFilter?.({
      blockIds,
      dueOnly: mode === 'due',
    });
  }
}
