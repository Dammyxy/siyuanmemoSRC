/**
 * TemporaryDrillEntry - 临时练习入口
 * 
 * 特点：
 * - 复习所有类型的卡片（Item + Topic）
 * - 不记录作答，不影响排期
 * - 只支持"全部"模式（不区分到期/全部）
 * - 使用临时队列（SubsetPracticeStrategy），不持久化
 * - 练习完成后自动销毁
 * 
 * 对应 SuperMemo 的 "Drill" 功能（临时练习）
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md
 * @see H:\project-F\flashcard\资料\supermemo\Subset operations - SuperMemo Help.md
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { pushMsg } from '@/core/siyuan/api';
import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY } from '@/core/queue/abstraction/IPriority';

/**
 * 临时练习入口
 * 
 * 用于快速练习当前文档的卡片，不影响任何调度。
 * 使用临时队列，练习完成后自动销毁。
 */
export class TemporaryDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'temporary-drill',
      displayName: deps.i18n?.temporaryDrill || '临时练习',
      icon: 'iconEye',
      queueType: QueueType.FilterGroup,  // 临时队列
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
   * 2. 使用 TemporaryDrillStrategy 创建临时队列
   * 3. 打开复习对话框（评分 4 移除，1/2/3 保留）
   * 4. 练习完成后自动销毁
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
      console.log(`[TemporaryDrillEntry] Opening temporary drill with ${cards.length} cards`);
      
      // 获取 blockIds
      const blockIds = [...new Set(cards.map(card => card.blockId).filter(Boolean))];
      
      if (blockIds.length === 0) {
        console.error('[TemporaryDrillEntry] No valid blockIds found');
        await pushMsg('无法打开临时练习');
        return;
      }
      
      // 调用新的 openTemporaryDrill 方法
      await this.openTemporaryDrill(blockIds);
      
      console.log('[TemporaryDrillEntry] ✅ Temporary drill dialog opened');
    } catch (err) {
      console.error('[TemporaryDrillEntry] Failed to open temporary drill:', err);
      await pushMsg('打开临时练习失败');
    }
  }
  
  /**
   * 打开临时练习对话框（使用 TemporaryDrillStrategy）
   * 
   * @param blockIds 块 ID 列表
   */
  private async openTemporaryDrill(blockIds: string[]): Promise<void> {
    const reviewDialogManager = this.deps.reviewDialogManager as any;
    
    // 检查是否有 openTemporaryDrill 方法
    if (typeof reviewDialogManager.openTemporaryDrill === 'function') {
      await reviewDialogManager.openTemporaryDrill(blockIds);
    } else {
      // 降级：使用旧的 openDrillWithCards 方法
      console.warn('[TemporaryDrillEntry] openTemporaryDrill not found, falling back to openDrillWithCards');
      
      // 转换为旧格式的卡片数据
      const storage = (reviewDialogManager as any).deps?.plugin?.storageManager;
      const cardData = blockIds.map(blockId => {
        const card = storage?.getCardByBlockId?.(blockId);
        return {
          cardID: card?.id || '',
          blockID: blockId,
          deckID: riff.BUILTIN_DECK_ID,
          priority: card?.priority || DEFAULT_PRIORITY,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
          state: card?.state || 0,
          lapses: card?.lapses || 0,
          reps: card?.reps || 0,
        };
      }).filter(c => c.cardID);
      
      reviewDialogManager.openDrillWithCards?.(cardData, 'block');
    }
  }
}
