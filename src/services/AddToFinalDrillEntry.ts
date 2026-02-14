/**
 * AddToFinalDrillEntry - 添加到刻意练习入口
 * 
 * 特点：
 * - 将当前文档的卡片添加到全局 FinalDrill 队列
 * - 支持追加、替换、继续三种模式
 * - 使用 FinalDrill 队列实现（全局队列，持久化）
 * - 评分 < 3 保留，≥ 3 移除
 * 
 * 对应 SuperMemo 的 "Add to drill" 功能
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md
 * @see H:\project-F\flashcard\资料\supermemo\Subset operations - SuperMemo Help.md
 * @see H:\project-F\flashcard\资料\supermemo\finaldrill.md
 */

import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { pushMsg } from '@/core/siyuan/api';
import { Dialog } from 'siyuan';

/**
 * 添加到刻意练习入口
 * 
 * 用于将困难卡片添加到全局队列，反复练习直到掌握。
 * 类似 SuperMemo 的 "Add to drill"。
 */
export class AddToFinalDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'add-to-final-drill',
      displayName: '添加到刻意练习',
      icon: 'iconAdd',
      queueType: QueueType.FinalDrill,
      recordReview: false,  // FinalDrill 有自己的评分逻辑
      cardTypeFilter: 'all',  // 接受所有类型
      supportDueMode: false,  // 只支持"全部"模式
    }, deps);
  }
  
  /**
   * 打开添加到刻意练习对话框
   * 
   * 流程：
   * 1. 收集当前块及子块的所有卡片
   * 2. 检查 FinalDrill 队列中是否已有卡片
   * 3. 如果有卡片，显示选择对话框（继续/替换/追加）
   * 4. 根据用户选择执行相应操作
   * 5. 询问是否立即开始练习
   * 
   * @param cards 卡片列表
   * @param mode 'due' | 'all'（忽略此参数，总是添加全部）
   */
  protected async openReviewDialog(
    cards: FSRSCard[], 
    mode: 'due' | 'all'
  ): Promise<void> {
    if (cards.length === 0) {
      await pushMsg('当前范围内没有可添加的闪卡');
      return;
    }
    
    try {
      // 获取 UnifiedDataSourceManager
      const manager = (this.deps.reviewDialogManager as any).deps?.plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[AddToFinalDrillEntry] UnifiedDataSourceManager not found');
        await pushMsg('无法添加到刻意练习');
        return;
      }
      
      // 获取 FinalDrill 队列
      const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
      if (!finalDrillQueue) {
        console.error('[AddToFinalDrillEntry] FinalDrill queue not found');
        await pushMsg('无法找到刻意练习队列');
        return;
      }
      
      // 检查队列中是否已有卡片
      const existingCards = await finalDrillQueue.getCards();
      const hasProgress = existingCards.length > 0;
      
      let action: 'continue' | 'replace' | 'append' | 'cancel' = 'append';
      
      if (hasProgress) {
        // 显示选择对话框
        action = await this.showActionDialog(existingCards.length, cards.length);
        
        if (action === 'cancel') {
          return; // 用户取消
        }
        
        if (action === 'continue') {
          // 继续练习现有队列，不添加新卡片
          await (this.deps.reviewDialogManager as any).openFinalDrill?.();
          return;
        }
        
        if (action === 'replace') {
          // 替换：清空队列
          await finalDrillQueue.clear();
          console.log('[AddToFinalDrillEntry] Queue cleared for replacement');
        }
        
        // action === 'append': 追加，不清空队列
      }
      
      // 添加卡片到队列（追加到末尾）
      let addedCount = 0;
      for (const card of cards) {
        try {
          await finalDrillQueue.addCard(card.id, 'manual');
          addedCount++;
        } catch (err) {
          console.error(`[AddToFinalDrillEntry] Failed to add card ${card.id}:`, err);
        }
      }
      
      console.log(`[AddToFinalDrillEntry] Added ${addedCount}/${cards.length} cards to FinalDrill queue`);
      
      // 提示用户
      await pushMsg(`已添加 ${addedCount} 张卡片到刻意练习队列`);
      
      // 询问是否立即开始练习
      const shouldStart = await this.confirmStartDialog(addedCount);
      if (shouldStart) {
        await (this.deps.reviewDialogManager as any).openFinalDrill?.();
      }
      
      console.log('[AddToFinalDrillEntry] ✅ Cards added to FinalDrill queue');
    } catch (err) {
      console.error('[AddToFinalDrillEntry] Failed to add to FinalDrill:', err);
      await pushMsg('添加到刻意练习失败');
    }
  }
  
  /**
   * 显示操作选择对话框
   * 
   * @param existingCount 队列中已有的卡片数量
   * @param newCount 要添加的卡片数量
   * @returns 'continue' | 'replace' | 'append' | 'cancel'
   */
  private showActionDialog(
    existingCount: number,
    newCount: number
  ): Promise<'continue' | 'replace' | 'append' | 'cancel'> {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: '刻意练习队列',
        content: `
          <div class="b3-dialog__content" style="padding: 16px;">
            <div style="margin-bottom: 16px;">
              队列中已有 <strong>${existingCount}</strong> 张卡片，你想：
            </div>
          </div>
          <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel">取消</button>
            <div class="fn__space"></div>
            <button class="b3-button" data-action="continue">继续练习</button>
            <div class="fn__space"></div>
            <button class="b3-button" data-action="replace">替换队列</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text" data-action="append">追加 ${newCount} 张</button>
          </div>
        `,
        width: '520px',
      });
      
      const element = dialog.element;
      
      element.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
        dialog.destroy();
        resolve('continue');
      });
      
      element.querySelector('[data-action="replace"]')?.addEventListener('click', () => {
        dialog.destroy();
        resolve('replace');
      });
      
      element.querySelector('[data-action="append"]')?.addEventListener('click', () => {
        dialog.destroy();
        resolve('append');
      });
      
      element.querySelector('.b3-button--cancel')?.addEventListener('click', () => {
        dialog.destroy();
        resolve('cancel');
      });
    });
  }
  
  /**
   * 确认是否立即开始练习
   * 
   * @param addedCount 已添加的卡片数量
   * @returns true 表示立即开始，false 表示稍后
   */
  private confirmStartDialog(addedCount: number): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: '开始练习？',
        content: `
          <div class="b3-dialog__content" style="padding: 16px;">
            <div style="margin-bottom: 16px;">
              已添加 <strong>${addedCount}</strong> 张卡片到刻意练习队列。要现在开始练习吗？
            </div>
          </div>
          <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel">稍后</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text">立即开始</button>
          </div>
        `,
        width: '420px',
      });
      
      const element = dialog.element;
      
      element.querySelector('.b3-button--cancel')?.addEventListener('click', () => {
        dialog.destroy();
        resolve(false);
      });
      
      element.querySelector('.b3-button--text')?.addEventListener('click', () => {
        dialog.destroy();
        resolve(true);
      });
    });
  }
}
