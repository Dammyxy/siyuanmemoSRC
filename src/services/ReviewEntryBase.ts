/**
 * ReviewEntryBase - 复习入口基类
 * 
 * 提供统一的复习入口抽象，支持三种复习模式：
 * - 提取练习（RetrievalPractice）：只复习 Item 卡片，记录作答，影响排期
 * - 渐进学习（IncrementalLearning）：复习 Item + Topic 卡片，记录作答，影响排期
 * - 刻意练习（DeliberatePractice）：复习所有卡片，不记录作答，不影响排期
 * 
 * @see .kiro/specs/block-menu-review-entries/requirements.md
 * @see .kiro/specs/block-menu-review-entries/design.md
 */

import type { FSRSCard } from '@/types/card';
import type { StorageManager } from '@/core/storage';
import type { ReviewDialogManager } from './ReviewDialogManager';
import { pushMsg } from '@/core/siyuan/api';
import { QueueType } from '@/types/unified-data-source';

/**
 * 卡片类型过滤器
 */
export type CardTypeFilter = 
  | 'item-only'      // 只接受 Item
  | 'all'            // 接受 Item + Topic
  | ((card: FSRSCard) => boolean);  // 自定义过滤函数

/**
 * 复习入口配置
 */
export interface ReviewEntryConfig {
  /** 入口 ID（唯一标识） */
  id: string;
  
  /** 显示名称 */
  displayName: string;
  
  /** 图标 */
  icon: string;
  
  /** 队列类型 */
  queueType: QueueType;
  
  /** 是否记录作答（影响排期） */
  recordReview: boolean;
  
  /** 卡片类型过滤器 */
  cardTypeFilter: CardTypeFilter;
  
  /** 是否支持"到期/全部"模式 */
  supportDueMode: boolean;
}

/**
 * 复习入口依赖注入接口
 */
export interface ReviewEntryBaseDeps {
  storage: StorageManager;
  reviewDialogManager: ReviewDialogManager;
  i18n: Record<string, string>;
}

/**
 * 复习入口基类
 * 
 * 职责：
 * 1. 收集当前块及子块的闪卡
 * 2. 过滤卡片类型
 * 3. 计算到期/全部数量
 * 4. 生成菜单项
 * 5. 打开复习对话框（由子类实现）
 */
export abstract class ReviewEntryBase {
  constructor(
    protected config: ReviewEntryConfig,
    protected deps: ReviewEntryBaseDeps
  ) {}
  
  /**
   * 从块元素收集闪卡
   * 
   * 支持当前块及所有子块的卡片收集。
   * 支持模板卡（一个块对应多张卡片）。
   * 
   * @param blockElements 块元素列表
   * @returns 卡片列表
   */
  protected collectCardsFromElements(blockElements: HTMLElement[]): FSRSCard[] {
    const seen = new Set<string>();
    const result: FSRSCard[] = [];
    const roots = blockElements.map((el) => 
      (el.closest('[data-node-id]') as HTMLElement) || el
    );

    for (const root of roots) {
      // 获取当前块及所有子块
      const nodes = [
        root, 
        ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
      ];
      
      for (const node of nodes) {
        const blockId = node.getAttribute('data-node-id');
        if (!blockId || seen.has(blockId)) {
          continue;
        }
        seen.add(blockId);
        
        // 从本地存储查询卡片（支持一个块对应多张卡片，如模板卡）
        const cards = this.deps.storage.getCardsByBlockId(blockId);
        for (const card of cards) {
          if (this.filterCard(card)) {
            result.push(card);
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * 过滤卡片
   * 
   * 根据配置的 cardTypeFilter 过滤卡片类型。
   * 
   * @param card 卡片
   * @returns 是否接受该卡片
   */
  protected filterCard(card: FSRSCard): boolean {
    const filter = this.config.cardTypeFilter;
    
    if (filter === 'item-only') {
      return card.type !== 'topic';
    } else if (filter === 'all') {
      return true;
    } else if (typeof filter === 'function') {
      return filter(card);
    }
    
    return true;
  }
  
  /**
   * 计算到期卡片数量
   * 
   * @param cards 卡片列表
   * @returns 到期数量
   */
  protected countDueCards(cards: FSRSCard[]): number {
    const now = Date.now();
    return cards.filter(card => 
      card.due <= now &&
      !card.skipped &&
      (!card.skipUntil || card.skipUntil <= now)
    ).length;
  }
  
  /**
   * 获取菜单标签
   * 
   * @param dueCount 到期数量
   * @param totalCount 总数量
   * @param mode 'due' | 'all'
   * @returns 菜单标签 HTML
   */
  protected getMenuLabel(
    dueCount: number, 
    totalCount: number, 
    mode: 'due' | 'all'
  ): string {
    const name = this.config.displayName;
    
    if (mode === 'due') {
      const dueText = this.deps.i18n?.dueMode || '到期';
      return `${name} - ${dueText} <span class="ft__secondary">(${dueCount}/${totalCount})</span>`;
    } else {
      const allText = this.deps.i18n?.allMode || '全部';
      return `${name} - ${allText} <span class="ft__secondary">(${totalCount})</span>`;
    }
  }
  
  /**
   * 打开复习对话框
   * 
   * 由子类实现具体的对话框打开逻辑。
   * 
   * @param cards 卡片列表
   * @param mode 'due' | 'all'
   */
  protected abstract openReviewDialog(
    cards: FSRSCard[], 
    mode: 'due' | 'all'
  ): Promise<void>;
  
  /**
   * 创建菜单项
   * 
   * 公共接口，用于生成块菜单中的菜单项。
   * 
   * @param blockElements 块元素列表
   * @returns 菜单项数组
   */
  createMenuItems(blockElements: HTMLElement[]): any[] {
    const cards = this.collectCardsFromElements(blockElements);
    const dueCount = this.countDueCards(cards);
    const totalCount = cards.length;
    
    const items: any[] = [];
    
    if (!this.config.supportDueMode) {
      // 只支持"全部"模式（如刻意练习）
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'all'),
        click: async () => {
          if (totalCount === 0) {
            await pushMsg(
              this.deps.i18n?.drillNoCards || 
              '当前范围内没有可练习的闪卡'
            );
            return;
          }
          await this.openReviewDialog(cards, 'all');
        },
      });
    } else {
      // 支持"到期"和"全部"两种模式
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'due'),
        click: async () => {
          if (dueCount === 0) {
            await pushMsg(
              this.deps.i18n?.noDueCards || 
              '当前范围内没有到期的闪卡'
            );
            return;
          }
          await this.openReviewDialog(cards, 'due');
        },
      });
      
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'all'),
        click: async () => {
          if (totalCount === 0) {
            await pushMsg(
              this.deps.i18n?.drillNoCards || 
              '当前范围内没有可练习的闪卡'
            );
            return;
          }
          await this.openReviewDialog(cards, 'all');
        },
      });
    }
    
    return items;
  }
}
