/**
 * FinalDrillEntry - 刻意练习入口
 * 
 * 特点：
 * - 复习所有类型的卡片（Item + Topic）
 * - 不记录作答，不影响排期
 * - 只支持"全部"模式（不区分到期/全部）
 * - 使用 FinalDrill 队列实现
 * - 支持进度保存和恢复
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md 需求 2.3, 2.5
 * @see .kiro/specs/block-menu-review-entries/design.md 章节 4.3
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { pushMsg } from '@/core/siyuan/api';
import { Dialog } from 'siyuan';

/**
 * 刻意练习入口
 */
export class FinalDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'final-drill',
      displayName: '刻意练习',
      icon: 'iconCards',
      queueType: QueueType.FinalDrill,
      recordReview: false,  // 不记录作答
      cardTypeFilter: 'all',  // 接受所有类型
      supportDueMode: false,  // 只支持"全部"模式
    }, deps);
  }
  
  /**
   * 打开刻意练习对话框
   * 
   * 流程：
   * 1. 收集当前块及子块的所有卡片
   * 2. 检查 FinalDrill 队列中是否已有卡片（进度）
   * 3. 如果有进度，显示提示对话框
   * 4. 根据用户选择决定是否清空队列
   * 5. 将卡片添加到 FinalDrill 队列
   * 6. 打开 FinalDrill 复习对话框
   * 
   * @param cards 卡片列表
   * @param mode 'due' | 'all'（刻意练习忽略此参数，总是复习全部）
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
      // 获取 UnifiedDataSourceManager
      const manager = (this.deps.reviewDialogManager as any).deps?.plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[FinalDrillEntry] UnifiedDataSourceManager not found');
        await pushMsg('无法打开刻意练习');
        return;
      }
      
      // 获取 FinalDrill 队列
      const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
      if (!finalDrillQueue) {
        console.error('[FinalDrillEntry] FinalDrill queue not found');
        await pushMsg('无法打开刻意练习队列');
        return;
      }
      
      // 检查队列中是否已有卡片（进度）
      const existingCards = await finalDrillQueue.getCards();
      const hasProgress = existingCards.length > 0;
      
      if (hasProgress) {
        // 显示进度提示对话框
        const shouldContinue = await this.showProgressDialog(
          cards.length - existingCards.length,  // 已完成数量
          cards.length  // 总数量
        );
        
        if (!shouldContinue) {
          // 用户选择"从头开始"，清空队列
          await finalDrillQueue.clear();
          console.log('[FinalDrillEntry] User chose to start over, queue cleared');
        } else {
          // 用户选择"继续"，直接打开对话框
          console.log('[FinalDrillEntry] User chose to continue, opening dialog');
          await (this.deps.reviewDialogManager as any).openFinalDrill?.();
          return;
        }
      }
      
      // 清空队列（如果没有进度或用户选择从头开始）
      await finalDrillQueue.clear();
      console.log('[FinalDrillEntry] Cleared FinalDrill queue');
      
      // 添加卡片到队列
      for (const card of cards) {
        await finalDrillQueue.addCard(card.id, 'manual');
      }
      console.log(`[FinalDrillEntry] Added ${cards.length} cards to FinalDrill queue`);
      
      // 打开刻意练习对话框（使用新架构）
      await (this.deps.reviewDialogManager as any).openFinalDrill?.();
      
      console.log('[FinalDrillEntry] ✅ FinalDrill dialog opened');
    } catch (err) {
      console.error('[FinalDrillEntry] Failed to open FinalDrill:', err);
      await pushMsg('打开刻意练习失败');
    }
  }
  
  /**
   * 显示进度提示对话框
   * 
   * @param completedCount 已完成数量
   * @param totalCount 总数量
   * @returns true 表示继续，false 表示从头开始
   */
  private showProgressDialog(
    completedCount: number,
    totalCount: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: '继续上次的进度？',
        content: `
          <div class="b3-dialog__content" style="padding: 16px;">
            <div style="margin-bottom: 16px;">
              你上次练习这个文档时，学习了 ${completedCount}/${totalCount} 张卡片。要继续上次的进度吗？
            </div>
          </div>
          <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel">从头开始</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text">继续</button>
          </div>
        `,
        width: '520px',
      });
      
      const element = dialog.element;
      const cancelBtn = element.querySelector('.b3-button--cancel') as HTMLButtonElement;
      const continueBtn = element.querySelector('.b3-button--text') as HTMLButtonElement;
      
      cancelBtn?.addEventListener('click', () => {
        dialog.destroy();
        resolve(false); // 从头开始
      });
      
      continueBtn?.addEventListener('click', () => {
        dialog.destroy();
        resolve(true); // 继续
      });
    });
  }
}
