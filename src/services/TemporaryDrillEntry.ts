/**
 * TemporaryDrillEntry - 临时练习入口
 * 
 * 特点：
 * - 复习所有类型的卡片（Item + Topic）
 * - 不记录作答，不影响排期
 * - 只支持"全部"模式（不区分到期/全部）
 * - 使用 FilterGroup 实现（临时队列，不持久化）
 * - 练习完成后自动销毁
 * 
 * 对应 SuperMemo 的 "Review all" 功能（但不影响调度）
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md
 * @see H:\project-F\flashcard\资料\supermemo\Subset operations - SuperMemo Help.md
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { pushMsg } from '@/core/siyuan/api';

/**
 * 临时练习入口
 * 
 * 用于快速预览/测试当前文档的卡片，不影响任何调度。
 * 类似 SuperMemo 的 "Review all" 但不记录评分。
 */
export class TemporaryDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'temporary-drill',
      displayName: '临时练习',
      icon: 'iconEye',
      queueType: QueueType.FilterGroup,
      recordReview: false,  // 不记录作答
      cardTypeFilter: 'all',  // 接受所有类型
      supportDueMode: false,  // 只支持"全部"模式
    }, deps);
  }
  
  /**
   * 打开临时练习对话框
   * 
   * 流程：
   * 1. 收集当前块及子块的所有卡片
   * 2. 使用 FilterGroup 创建临时队列
   * 3. 打开复习对话框（不记录评分）
   * 4. 练习完成后自动销毁队列
   * 
   * @param cards 卡片列表
   * @param mode 'due' | 'all'（临时练习忽略此参数，总是复习全部）
   */
  protected async openReviewDialog(
    cards: FSRSCard[], 
    mode: 'due' | 'all'
  ): Promise<void> {
    if (cards.length === 0) {
      await pushMsg('当前范围内没有可练习的闪卡');
      return;
    }
    
    try {
      // 获取 blockIds
      const blockIds = [...new Set(cards.map(card => card.blockId).filter(Boolean))];
      
      if (blockIds.length === 0) {
        console.error('[TemporaryDrillEntry] No valid blockIds found');
        await pushMsg('无法打开临时练习');
        return;
      }
      
      // 创建临时过滤组配置
      const filterGroupConfig = {
        id: `temporary-drill-${Date.now()}`,
        name: '临时练习',
        blockIds: blockIds,
        cardTypes: ['item', 'topic'] as const,
        includeSubBlocks: true,
      };
      
      console.log(`[TemporaryDrillEntry] Opening temporary drill with ${cards.length} cards`, {
        blockIds: blockIds.length,
        config: filterGroupConfig,
      });
      
      // 打开 FilterGroup 复习对话框（不记录评分）
      const reviewDialogManager = this.deps.reviewDialogManager as any;
      
      if (reviewDialogManager.openFilterGroup) {
        await reviewDialogManager.openFilterGroup(filterGroupConfig, {
          recordReview: false,  // 不记录评分
          mode: 'all',
        });
      } else {
        console.error('[TemporaryDrillEntry] openFilterGroup method not found');
        await pushMsg('无法打开临时练习对话框');
      }
      
      console.log('[TemporaryDrillEntry] ✅ Temporary drill dialog opened');
    } catch (err) {
      console.error('[TemporaryDrillEntry] Failed to open temporary drill:', err);
      await pushMsg('打开临时练习失败');
    }
  }
}
