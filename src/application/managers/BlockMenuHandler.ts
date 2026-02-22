﻿﻿﻿/**
 * BlockMenuHandler - 处理块菜单相关的事件和操作
 * 从 index.ts 拆分出来的服务
 */

import type { App } from 'siyuan';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import * as api from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import { DEFAULT_PRIORITY } from '@/core/queue';
import type { CardAttributeRow } from '@/core/queue/types';
import { QueueType } from '@/types/unified-data-source';

import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { StorageManager } from '@/core/storage';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';

export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) => Promise<void>;
  applicationContext: ApplicationContext;  // ✅ 必需：用于访问所有 DDD 架构服务
  cardCreationHelper: CardCreationHelper;  // ✅ 卡片创建辅助类
  plugin?: any;  // 🔧 向后兼容：用于访问遗留服务（将逐步移除）
}

export class BlockMenuHandler {
  constructor(private deps: BlockMenuHandlerDeps) {
    // ReviewEntry 类已删除，功能直接在 BlockMenuHandler 中实现
  }

  /**
   * 设置 ApplicationContext（用于解决循环依赖）
   * 
   * @param context ApplicationContext 实例
   */
  setApplicationContext(context: ApplicationContext): void {
    this.deps.applicationContext = context;
  }

  /**
   * 获取卡片应用服务（DDD 架构）
   * 
   * @returns CardApplicationService 实例
   * @throws Error 如果 ApplicationContext 未初始化
   */
  private getCardService(): any {
    return this.deps.applicationContext.getCardService();
  }

  /**
   * 获取存储管理器（DDD 架构）
   * 
   * @returns StorageManager 实例
   * @throws Error 如果 ApplicationContext 未初始化
   */
  private getStorage(): StorageManager {
    return this.deps.applicationContext.getStorage();
  }

  /**
   * 从块元素收集闪卡
   * 
   * @param blockElements 块元素列表
   * @returns 卡片列表
   */
  private collectCardsFromElements(blockElements: HTMLElement[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    const roots = blockElements.map((el) => 
      (el.closest('[data-node-id]') as HTMLElement) || el
    );

    for (const root of roots) {
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
        
        const cards = this.getStorage().getCardsByBlockId(blockId);
        for (const card of cards) {
          result.push(card);
        }
      }
    }
    
    return result;
  }

  /**
   * 过滤到期卡片
   * 
   * @param cards 卡片列表
   * @returns 到期卡片列表
   */
  private filterDueCards(cards: any[]): any[] {
    const now = Date.now();
    return cards.filter(card => 
      card.due <= now &&
      !card.skipped &&
      (!card.skipUntil || card.skipUntil <= now)
    );
  }

  /**
   * 打开提取练习对话框
   * 
   * @param cards 卡片列表
   * @param dueOnly 是否只复习到期卡片
   */
  private async openRetrievalPractice(cards: any[], dueOnly: boolean): Promise<void> {
    const blockIds = cards.map(c => c.blockId);
    await this.deps.dialogManager.openRetrievalPracticeWithFilter({
      blockIds,
      dueOnly,
    });
  }

  /**
   * 打开渐进学习对话框
   * 
   * @param cards 卡片列表
   * @param dueOnly 是否只复习到期卡片
   */
  private async openIncrementalLearning(cards: any[], dueOnly: boolean): Promise<void> {
    const blockIds = cards.map(c => c.blockId);
    await this.deps.dialogManager.openIncrementalLearningWithFilter({
      blockIds,
      dueOnly,
    });
  }

  /**
   * 打开临时练习对话框
   * 
   * @param cards 卡片列表
   */
  private async openTemporaryDrill(cards: any[]): Promise<void> {
    const blockIds = [...new Set(cards.map(card => card.blockId).filter(Boolean))];
    
    if (blockIds.length === 0) {
      await pushMsg('无法打开临时练习');
      return;
    }
    
    await this.deps.dialogManager.openTemporaryDrill(blockIds);
  }

  /**
   * 添加到刻意练习队列
   * 
   * @param cards 卡片列表
   */
  private async addToFinalDrill(cards: any[]): Promise<void> {
    try {
      const manager = this.deps.applicationContext?.getUnifiedDataSourceManager() || this.deps.plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[BlockMenuHandler] UnifiedDataSourceManager not found');
        await pushMsg('无法添加到刻意练习');
        return;
      }
      
      const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
      if (!finalDrillQueue) {
        console.error('[BlockMenuHandler] FinalDrill queue not found');
        await pushMsg('无法找到刻意练习队列');
        return;
      }
      
      const existingCards = await finalDrillQueue.getCards();
      const hasProgress = existingCards.length > 0;
      
      let action: 'continue' | 'replace' | 'append' | 'cancel' = 'append';
      
      if (hasProgress) {
        action = await this.showFinalDrillActionDialog(existingCards.length, cards.length);
        
        if (action === 'cancel') {
          return;
        }
        
        if (action === 'continue') {
          await this.deps.dialogManager.openFinalDrillDialog();
          return;
        }
        
        if (action === 'replace') {
          await finalDrillQueue.clear();
        }
      }
      
      let addedCount = 0;
      for (const card of cards) {
        try {
          await finalDrillQueue.addCard(card.id, 'manual');
          addedCount++;
        } catch (err) {
          console.error(`[BlockMenuHandler] Failed to add card ${card.id}:`, err);
        }
      }
      
      await pushMsg(`已添加 ${addedCount} 张卡片到刻意练习队列`);
      
      const shouldStart = await this.confirmStartFinalDrillDialog(addedCount);
      if (shouldStart) {
        await this.deps.dialogManager.openFinalDrillDialog();
      }
    } catch (err) {
      console.error('[BlockMenuHandler] Failed to add to FinalDrill:', err);
      await pushMsg('添加到刻意练习失败');
    }
  }

  /**
   * 显示刻意练习操作选择对话框
   */
  private showFinalDrillActionDialog(
    existingCount: number,
    newCount: number
  ): Promise<'continue' | 'replace' | 'append' | 'cancel'> {
    return new Promise((resolve) => {
      const { Dialog } = require('siyuan');
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
   * 确认是否立即开始刻意练习
   */
  private confirmStartFinalDrillDialog(addedCount: number): Promise<boolean> {
    return new Promise((resolve) => {
      const { Dialog } = require('siyuan');
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

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const blockElements: HTMLElement[] = detail?.blockElements || [];

    if (!menu || blockElements.length === 0) {
      return;
    }

    const blockIds = blockElements
      .map((el) => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    if (blockIds.length === 0) {
      return;
    }

    // 构建子菜单项数组
    const submenu: any[] = [];

    // ✅ Phase 10.6 - 直接实现复习菜单项（不依赖 ReviewEntry 抽象类）
    const cards = this.collectCardsFromElements(blockElements);
    const itemCards = cards.filter(c => c.type !== 'topic');
    const dueItemCards = this.filterDueCards(itemCards);
    const dueAllCards = this.filterDueCards(cards);
    
    // 1. 提取练习（只复习 Item 卡片）
    submenu.push({
      icon: 'iconRiffCard',
      label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueItemCards.length}/${itemCards.length})</span>`,
      click: async () => {
        if (dueItemCards.length === 0) {
          await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
          return;
        }
        await this.openRetrievalPractice(dueItemCards, true);
      },
    });
    
    submenu.push({
      icon: 'iconRiffCard',
      label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${itemCards.length})</span>`,
      click: async () => {
        if (itemCards.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openRetrievalPractice(itemCards, false);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 2. 渐进学习（复习 Item + Topic）
    submenu.push({
      icon: 'iconBook',
      label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueAllCards.length}/${cards.length})</span>`,
      click: async () => {
        if (dueAllCards.length === 0) {
          await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
          return;
        }
        await this.openIncrementalLearning(dueAllCards, true);
      },
    });
    
    submenu.push({
      icon: 'iconBook',
      label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${cards.length})</span>`,
      click: async () => {
        if (cards.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openIncrementalLearning(cards, false);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 3. 临时练习（不记录作答）
    submenu.push({
      icon: 'iconEye',
      label: `${this.deps.i18n?.temporaryDrill || '临时练习'} <span class="ft__secondary">(${cards.length})</span>`,
      click: async () => {
        if (cards.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openTemporaryDrill(cards);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 4. 添加到刻意练习
    submenu.push({
      icon: 'iconAdd',
      label: `${this.deps.i18n?.addToFinalDrillQueue || '添加到刻意练习'} <span class="ft__secondary">(${cards.length})</span>`,
      click: async () => {
        if (cards.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可添加的闪卡');
          return;
        }
        await this.addToFinalDrill(cards);
      },
    });
    
    submenu.push({ type: 'separator' });

    // 制作为概念卡并加入队列
    submenu.push({
      icon: 'iconMark',
      label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列',
      click: async () => {
        await this.makeConceptAndAddToRoam(blockIds[0], 'normal');
      },
    });

    // 制作为概念卡并立即漫游
    submenu.push({
      icon: 'iconFocus',
      label: this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游',
      click: async () => {
        await this.makeConceptAndAddToRoam(blockIds[0], 'high');
      },
    });

    submenu.push({
      type: 'separator',
    });

    // 编辑 SRS 数据菜单项
    submenu.push({
      icon: 'iconEdit',
      label: this.deps.i18n?.editSrsData || '编辑SRS数据',
      click: async () => {
        let target = blockElements.find((el) => el.hasAttribute(ATTR_CARD_ID));
        let blockID = target?.getAttribute('data-node-id');
        let cardID = target?.getAttribute(ATTR_CARD_ID);

        // ✅ 新架构：从本地存储查询卡片
        if (!cardID && blockIds.length > 0) {
          try {
            console.log('[SiYuanMemo] Querying local storage for blockIds:', blockIds);
            for (const bid of blockIds) {
              const card = this.getStorage().getCardByBlockId(bid);
              if (card) {
                blockID = card.blockId;
                cardID = card.id;
                console.log('[SiYuanMemo] Found card in local storage:', blockID, cardID);
                break;
              }
            }
          } catch (err) {
            console.warn('[SiYuanMemo] Failed to query local storage:', err);
          }
        }

        if (!blockID || !cardID) {
          pushErrMsg(this.deps.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
          return;
        }

        createVueDialog({
          title: this.deps.i18n?.editSrsData || '编辑SRS数据',
          component: SrsEditorDialog,
          props: {
            card: {
              id: cardID,
              blockId: blockID,
              deckId: riff.BUILTIN_DECK_ID,
            },
            deckId: riff.BUILTIN_DECK_ID,
            i18n: this.deps.i18n || {},
            plugin: this.deps.plugin,  // 向后兼容
            reviewService: this.deps.applicationContext?.getReviewService?.(),  // ✅ DDD 架构
          },
          width: '860px',
          height: '80vh',
        });
      },
    });

    submenu.push({
      type: 'separator',
    });

    // 选中制卡（暂时隐藏）
    // submenu.push({
    //   icon: 'iconAdd',
    //   label: this.deps.i18n?.makeCardFromSelection || '选中制卡',
    //   click: async () => {
    //     let createdCount = 0;

    //     for (const element of blockElements) {
    //       if (element.hasAttribute(ATTR_CARD_ID)) {
    //         continue;
    //       }
    //       const blockId = element.getAttribute('data-node-id');
    //       if (!blockId) {
    //         continue;
    //       }
    //       try {
    //         const card = createDefaultCard(blockId);
    //         await markBlockAsCard(blockId, card.id, card.priority, 'item');
    //         this.deps.storage.setCard(card);
    //         createdCount++;
    //       } catch (err) {
    //         console.error('[SiYuanMemo] Failed to create card from block:', blockId, err);
    //       }
    //     }

    //     if (createdCount > 0) {
    //       await this.deps.storage.saveCards();
    //       await pushMsg((this.deps.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
    //     } else {
    //       await pushMsg(this.deps.i18n?.msg_already_cards || '选中的块已经是闪卡');
    //     }
    //   },
    // });

    // 创建模板卡片
    submenu.push({
      icon: 'iconAdd',
      label: this.deps.i18n?.createTemplateCard || '创建模板卡片',
      click: async () => {
        await this.deps.openCreateTemplateCardDialog(blockIds);
      },
    });

    // 创建有序列表模版卡（始终显示）
    submenu.push({
      icon: 'iconList',
      label: this.deps.i18n?.createListTemplateCard || '创建有序列表模版卡',
      click: async () => {
        // 检查子级是否为有序列表项
        const hasOrderedChildren = await this.hasOrderedListChildren(blockIds[0]);
        if (!hasOrderedChildren) {
          await pushErrMsg('只能对包含有序子列表项的块使用此功能');
          return;
        }
        await this.createListTemplateCards(blockIds);
      },
    });

    submenu.push({
      type: 'separator',
    });

    // 取消闪卡（始终显示）
    submenu.push({
      icon: 'iconTrashcan',
      label: this.deps.i18n?.deleteCard || '取消闪卡',
      click: async () => {
        // 🆕 使用新架构的 CardApplicationService（如果可用）
        const cardService = this.getCardService();
        
        let deletedCount = 0;
        let failedCount = 0;
        
        for (const blockId of blockIds) {
          // 1. 从 storage 获取卡片以获得 cardId
          const card = this.getStorage().getCardByBlockId(blockId);
          
          if (!card) {
            continue; // 跳过不存在的卡片
          }
          
          // 2. 调用 CardApplicationService.deleteCard()
          const result = await cardService.deleteCard({ cardId: card.id });
          
          if (result.ok) {
            deletedCount++;
          } else {
            failedCount++;
            console.error(`[BlockMenuHandler] Failed to delete card ${card.id}:`, result.error);
          }
        }
        
        // 3. 显示结果消息
        if (deletedCount > 0) {
          if (failedCount > 0) {
            await pushMsg(`已取消 ${deletedCount} 张闪卡，${failedCount} 张失败`);
          } else {
            await pushMsg(`已取消 ${deletedCount} 张闪卡`);
          }
        } else {
          await pushMsg('未找到可取消的闪卡');
        }
      },
    });

    // 添加主菜单项，使用子菜单
    menu.addItem({
      icon: 'iconRiffCard',
      label: 'SiyuanMemo',
      submenu,
    });
  }

  /**
   * 为文档树生成复习菜单项（同步版本，用于事件处理）
   * 
   * @param docId 文档 ID
   * @returns 菜单项数组
   */
  private generateReviewMenuForDocSync(docId: string): any[] {
    const submenu: any[] = [];
    
    // 同步获取所有卡片
    const allCards = this.getStorage().getAllCards();
    
    // 使用 meta.rootId 匹配（卡片的 meta.rootId 字段表示所属文档）
    const cardsInDoc = allCards.filter(card => {
      const rootId = (card as any).meta?.rootId;
      return rootId === docId || card.blockId === docId;
    });
    
    // ✅ Phase 10.6 - 直接实现复习菜单项
    const itemCards = cardsInDoc.filter(c => c.type !== 'topic');
    const dueItemCards = this.filterDueCards(itemCards);
    const dueAllCards = this.filterDueCards(cardsInDoc);
    
    // 1. 提取练习
    submenu.push({
      icon: 'iconRiffCard',
      label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueItemCards.length}/${itemCards.length})</span>`,
      click: async () => {
        if (dueItemCards.length === 0) {
          await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
          return;
        }
        await this.openRetrievalPractice(dueItemCards, true);
      },
    });
    
    submenu.push({
      icon: 'iconRiffCard',
      label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${itemCards.length})</span>`,
      click: async () => {
        if (itemCards.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openRetrievalPractice(itemCards, false);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 2. 渐进学习
    submenu.push({
      icon: 'iconBook',
      label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueAllCards.length}/${cardsInDoc.length})</span>`,
      click: async () => {
        if (dueAllCards.length === 0) {
          await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
          return;
        }
        await this.openIncrementalLearning(dueAllCards, true);
      },
    });
    
    submenu.push({
      icon: 'iconBook',
      label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${cardsInDoc.length})</span>`,
      click: async () => {
        if (cardsInDoc.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openIncrementalLearning(cardsInDoc, false);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 3. 临时练习
    submenu.push({
      icon: 'iconEye',
      label: `${this.deps.i18n?.temporaryDrill || '临时练习'} <span class="ft__secondary">(${cardsInDoc.length})</span>`,
      click: async () => {
        if (cardsInDoc.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        await this.openTemporaryDrill(cardsInDoc);
      },
    });
    
    submenu.push({ type: 'separator' });
    
    // 4. 添加到刻意练习
    submenu.push({
      icon: 'iconAdd',
      label: `${this.deps.i18n?.addToFinalDrillQueue || '添加到刻意练习'} <span class="ft__secondary">(${cardsInDoc.length})</span>`,
      click: async () => {
        if (cardsInDoc.length === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可添加的闪卡');
          return;
        }
        await this.addToFinalDrill(cardsInDoc);
      },
    });
    
    // 添加神经漫游相关菜单项
    submenu.push({ type: 'separator' });
    
    // 制作为概念卡并加入队列
    submenu.push({
      icon: 'iconMark',
      label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列',
      click: async () => {
        await this.makeConceptAndAddToRoam(docId, 'normal');
      },
    });
    
    // 制作为概念卡并立即漫游
    submenu.push({
      icon: 'iconFocus',
      label: this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游',
      click: async () => {
        await this.makeConceptAndAddToRoam(docId, 'high');
      },
    });
    
    return submenu;
  }

  /**
   * 处理文档树菜单（文档块的块标菜单）
   */
  handleDocTreeMenu(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const elements = detail?.elements;

    if (!menu || !elements || elements.length === 0) {
      return;
    }

    const firstElement = elements[0];
    const docId = firstElement?.getAttribute('data-node-id');

    if (!docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate doctree menu:', err);
    }
  }

  /**
   * 处理编辑器标题图标点击
   */
  handleEditorTitleIconClick(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const docInfo = detail?.data;
    const docId = docInfo?.rootID || docInfo?.id;

    if (!menu || !docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate doc menu:', err);
    }
  }

  /**
   * 处理面包屑更多菜单
   */
  handleBreadcrumbMore(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const protyle = detail?.protyle;
    const docId = protyle?.block?.rootID || protyle?.block?.id;

    if (!menu || !docId) {
      return;
    }

    try {
      const submenu = this.generateReviewMenuForDocSync(docId);
      
      // 添加菜单项
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate breadcrumb menu:', err);
    }
  }

  /**
   * 处理块引用右键菜单
   */
  handleBlockRefMenu(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const element = detail?.element;

    if (!menu || !element) {
      return;
    }

    // 获取块引用指向的块 ID
    const blockId = element.dataset?.id;
    if (!blockId) {
      return;
    }

    try {
      const submenu: any[] = [];

      // 制作为概念卡并加入队列
      submenu.push({
        icon: 'iconMark',
        label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列',
        click: async () => {
          await this.makeConceptAndAddToRoam(blockId, 'normal');
        },
      });

      // 制作为概念卡并立即漫游
      submenu.push({
        icon: 'iconFocus',
        label: this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游',
        click: async () => {
          await this.makeConceptAndAddToRoam(blockId, 'high');
        },
      });

      // 添加菜单项
      menu.addItem({
        icon: 'iconRiffCard',
        label: 'SiyuanMemo',
        submenu,
      });
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate blockref menu:', err);
    }
  }

  /**
   * 获取包含闪卡的块元素
   */
  getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    const seen = new Set<string>();
    const result: HTMLElement[] = [];
    const roots = blockElements.map((el) => (el.closest('[data-node-id]') as HTMLElement) || el);

    for (const root of roots) {
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))];
      
      for (const node of nodes) {
        const blockId = node.getAttribute('data-node-id');
        if (!blockId || seen.has(blockId)) {
          continue;
        }
        seen.add(blockId);
        
        // 从本地存储查询卡片
        const card = this.getStorage().getCardByBlockId(blockId);
        if (card) {
          result.push(node);
        }
      }
    }
    
    return result;
  }

  /**
   * 从 DOM 元素构建练习卡片数据
   */
  buildDrillCardsFromElements(elements: HTMLElement[]): any[] {
    const result: any[] = [];
    const seen = new Set<string>();

    for (const el of elements) {
      const blockID = el.getAttribute('data-node-id');
      if (!blockID || seen.has(blockID)) {
        continue;
      }
      
      // 从本地存储获取卡片信息
      const card = this.getStorage().getCardByBlockId(blockID);
      if (!card) {
        continue;
      }
      
      const cardID = card.id;
      if (seen.has(cardID)) {
        continue;
      }
      seen.add(cardID);
      
      result.push({
        cardID,
        blockID,
        deckID: riff.BUILTIN_DECK_ID,
        priority: card.priority || DEFAULT_PRIORITY,
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
        state: card.state || 0,
        lapses: card.lapses || 0,
        reps: card.reps || 0,
      });
    }
    return result;
  }

  /**
   * 从文档树获取练习卡片
   */
  async getDrillCardsFromDocTree(docId: string): Promise<any[]> {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  /**
   * 从块 ID 列表构建练习卡片数据
   */
  async buildDrillCardsFromBlockIds(blockIds: string[]): Promise<any[]> {
    const uniqueIds = Array.from(new Set(blockIds));
    if (uniqueIds.length === 0) {
      return [];
    }

    const result: any[] = [];
    const seen = new Set<string>();

    interface CardAttributeWithTypeRow extends CardAttributeRow {
      card_type?: string;
    }

    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map((id) => `'${id}'`).join(',');
      
      // 查询卡片属性，包括卡片类型
      const rows = await sql(`
        SELECT 
          a1.block_id, 
          a1.value as card_id,
          a2.value as card_type
        FROM attributes a1
        LEFT JOIN attributes a2 ON a1.block_id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
        WHERE a1.name = '${ATTR_CARD_ID}' 
          AND a1.block_id IN (${idsStr}) 
          AND a1.value != ''
      `) as CardAttributeWithTypeRow[];

      for (const row of rows) {
        const blockID = row.block_id || row.blockID;
        const cardID = row.value;
        const cardType = row.card_type;
        
        if (!blockID || !cardID || seen.has(cardID)) {
          continue;
        }
        
        // 过滤：只接受 Item 类型的卡片（或未标记类型的卡片）
        // Topic 卡片不应该加入提取练习队列
        if (cardType === 'topic') {
          continue;
        }
        
        seen.add(cardID);
        result.push({
          cardID,
          blockID,
          deckID: riff.BUILTIN_DECK_ID,
          priority: DEFAULT_PRIORITY,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
          state: 0,
          lapses: 0,
          reps: 0,
        });
      }
    }
    
    return result;
  }

  /**
   * 检查块的子列表项是否为有序列表
   */
  private async hasOrderedListChildren(parentBlockId: string): Promise<boolean> {
    try {
      // 1. 获取列表容器
      const listContainerResult = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${parentBlockId}'
        AND type = 'l'
        LIMIT 1
      `);
      
      if (!listContainerResult || listContainerResult.length === 0) {
        return false;
      }
      
      const listContainerId = listContainerResult[0].id;
      
      // 2. 检查子列表项是否为有序列表
      const childrenResult = await sql(`
        SELECT subtype FROM blocks
        WHERE parent_id = '${listContainerId}'
        AND type = 'i'
        LIMIT 1
      `);
      
      if (!childrenResult || childrenResult.length === 0) {
        return false;
      }
      
      return childrenResult[0].subtype === 'o';
    } catch (err) {
      console.error('[SiYuanMemo] Failed to check list type:', err);
      return false;
    }
  }

  /**
   * 创建有序列表模版卡
   * 
   * @description
   * 自动检测列表项块，如果子级为有序列表项，则为每个子级创建一张卡片。
   * 支持提示功能：子列表项使用 `→` 分隔提示和答案。
   * 
   * @param blockIds 选中的块 ID 列表
   */
  private async createListTemplateCards(blockIds: string[]): Promise<void> {
    try {
      if (!blockIds || blockIds.length === 0) {
        await pushErrMsg('未选中任何块');
        return;
      }

      // 只处理第一个块
      const parentBlockId = blockIds[0];
      console.log(`[SiYuanMemo] 🎯 Creating ordered list template cards for: ${parentBlockId}`);

      // 1. 检查块类型
      const typeResult = await sql(`
        SELECT type, content FROM blocks
        WHERE id = '${parentBlockId}'
        LIMIT 1
      `);

      if (!typeResult || typeResult.length === 0) {
        await pushErrMsg('块不存在');
        return;
      }

      const blockType = typeResult[0].type;
      const blockContent = typeResult[0].content;

      if (blockType !== 'i') {
        await pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      // 2. 获取子级列表项（必须是有序列表）
      // 思源的列表结构：列表项(i) → 段落(p) + 列表容器(l) → 子列表项(i)
      // 所以需要先找到列表容器(l)，再查询其子级
      const allChildrenResult = await sql(`
        SELECT id, type, content FROM blocks
        WHERE parent_id = '${parentBlockId}'
        ORDER BY id ASC
      `);
      
      console.log(`[SiYuanMemo] All children of ${parentBlockId}:`, allChildrenResult);
      
      // 找到列表容器
      const listContainer = allChildrenResult?.find((r: any) => r.type === 'l');
      
      if (!listContainer) {
        await pushErrMsg('未找到列表容器，请确保列表结构正确');
        return;
      }
      
      console.log(`[SiYuanMemo] Found list container:`, listContainer.id);
      
      // 查询列表容器的所有子级（不限制类型，看看实际结构）
      const allListChildren = await sql(`
        SELECT id, type, subtype, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        ORDER BY id ASC
      `);
      
      console.log(`[SiYuanMemo] All list container children:`, allListChildren);
      
      // 查询列表容器的子级列表项（必须是有序列表）
      const childrenResult = await sql(`
        SELECT id, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        AND type = 'i'
        AND subtype = 'o'
        ORDER BY id ASC
      `);

      console.log(`[SiYuanMemo] Ordered list item children (type='i', subtype='o'):`, childrenResult);

      // 如果没有找到直接子级，尝试查询所有后代列表项（必须是有序列表）
      let finalChildren = childrenResult;
      if (!finalChildren || finalChildren.length === 0) {
        console.log(`[SiYuanMemo] No direct ordered children found, trying descendants...`);
        
        // 使用递归查询找到所有后代列表项（有序列表）
        const descendantsResult = await sql(`
          WITH RECURSIVE descendants AS (
            SELECT id, type, subtype, content, parent_id FROM blocks WHERE parent_id = '${listContainer.id}'
            UNION ALL
            SELECT b.id, b.type, b.subtype, b.content, b.parent_id FROM blocks b
            INNER JOIN descendants d ON b.parent_id = d.id
          )
          SELECT id, content FROM descendants WHERE type = 'i' AND subtype = 'o' ORDER BY id ASC
        `);
        
        console.log(`[SiYuanMemo] Descendant ordered list items:`, descendantsResult);
        finalChildren = descendantsResult;
      }

      if (!finalChildren || finalChildren.length < 2) {
        await pushErrMsg(`需要至少2个有序子列表项（当前：${finalChildren?.length || 0}个）`);
        return;
      }

      const childBlockIds = finalChildren.map((row: any) => row.id);
      console.log(`[SiYuanMemo] Found ${childBlockIds.length} children:`, childBlockIds);

      // 3. 确认创建
      await pushMsg(`检测到 ${childBlockIds.length} 个子级列表项，开始创建卡片...`);

      // 4. 为所有子级创建有序列表模版卡（一次性创建）
      console.log(`[SiYuanMemo] Creating ordered list template cards: ${blockContent} → ${childBlockIds.length} children`);

      // ✅ 使用 XiuyuanApplicationService（符合 DDD 架构）
      const xiuyuanAppService = await this.deps.applicationContext.getXiuyuanApplicationService();
      const result = await xiuyuanAppService.createListTemplateCards({
        parentBlockId,
        childBlockIds,
        templateId: 'builtin-list-item'
      });

      if (result.ok) {
        await pushMsg(`✅ 成功创建 ${childBlockIds.length} 张有序列表模版卡！`);
        console.log(`[SiYuanMemo] 🎉 Ordered list template cards creation complete:`, result.value);
      } else {
        const errorMsg = result.ok === false ? result.error.message : 'Unknown error';
        await pushErrMsg(`创建失败：${errorMsg}`);
        console.error(`[SiYuanMemo] ❌ Ordered list template cards creation failed:`, result.ok === false ? result.error : 'Unknown error');
      }
    } catch (err) {
      console.error('[SiYuanMemo] Failed to create ordered list template cards:', err);
      await pushErrMsg(`创建失败：${(err as Error).message}`);
    }
  }

  /**
   * 制作为概念卡并加入神经漫游队列
   * 
   * @param blockId 块 ID
   * @param priority 优先级（'normal' | 'high'）
   */
  private async makeConceptAndAddToRoam(blockId: string, priority: 'normal' | 'high'): Promise<void> {
    try {
      // 1. 检查是否已经是卡片
      const existingCard = this.getStorage().getCardByBlockId(blockId);
      
      if (!existingCard) {
        // 2. 使用 CardCreationHelper 创建概念卡
        const priorityValue = priority === 'high' ? 100 : 50;
        
        const result = await this.deps.cardCreationHelper.createConceptCard(blockId, {
          priority: priorityValue,
          metadata: {
            source: 'manual',
          },
        });
        
        if (result.ok) {
          // 标记块为闪卡（类型为 concept）
          await markBlockAsCard(blockId, result.value.id.value, priority === 'high' ? 1 : 0, 'item');
          
          // 更新块属性为 concept 类型
          await api.setBlockAttrs(blockId, {
            'custom-fsrs-card-type': 'concept'
          });
          
          // ✅ 添加到 Riff（确保同步）
          const riffAPI = await import('@/core/siyuan/riff');
          await riffAPI.addRiffCards(riffAPI.BUILTIN_DECK_ID, [blockId]);
          console.log(`[BlockMenuHandler] Added concept card to Riff: ${blockId}`);
          
          console.log(`[BlockMenuHandler] Created concept card via CardCreationHelper: ${blockId}`);
          await pushMsg('✅ 已制作为概念卡');
        } else {
          console.error(`[BlockMenuHandler] Failed to create concept card: ${result.error.message}`);
          await pushErrMsg(`创建失败：${result.error.message}`);
        }
      } else {
        // 3. 如果已经是卡片，确保类型为 concept
        const isConcept = await this.isConceptCard(blockId);
        if (!isConcept) {
          // 使用 CardApplicationService 更新卡片类型
          const cardService = this.getCardService();
          
          const result = await cardService.updateFSRSCard({
            cardId: existingCard.id,
            updates: {
              type: 'concept' as any,
            }
          });
          
          if (result.ok) {
            // 更新块属性
            await api.setBlockAttrs(blockId, {
              'custom-fsrs-card-type': 'concept'
            });
            
            console.log(`[BlockMenuHandler] Updated card type to concept for block: ${blockId}`);
            await pushMsg('✅ 已更新为概念卡');
          } else {
            console.error(`[BlockMenuHandler] Failed to update card type: ${result.error}`);
            await pushErrMsg(`更新失败：${result.error}`);
            return;
          }
        }
      }
      
      // 🔧 等待属性写入完成（增加等待时间并添加重试逻辑）
      let retries = 5;
      let isConceptVerified = false;
      
      while (retries > 0 && !isConceptVerified) {
        await new Promise(resolve => setTimeout(resolve, 200));
        isConceptVerified = await this.isConceptCard(blockId);
        
        if (!isConceptVerified) {
          console.log(`[BlockMenuHandler] Waiting for concept card attribute to be written... (retries left: ${retries})`);
          retries--;
        }
      }
      
      if (!isConceptVerified) {
        console.warn(`[BlockMenuHandler] Concept card attribute verification failed after retries, but continuing...`);
      }
      
      // 4. 获取神经漫游队列（✅ DDD 架构：通过 ApplicationContext）
      const unifiedDataSourceManager = this.deps.applicationContext?.getUnifiedDataSourceManager?.() || this.deps.plugin?.unifiedDataSourceManager;
      
      if (!unifiedDataSourceManager) {
        await pushErrMsg('❌ 统一数据源管理器未初始化');
        return;
      }
      
      const neuralQueue = unifiedDataSourceManager.getQueue(QueueType.NeuralRoam);
      
      if (!neuralQueue) {
        await pushErrMsg('❌ 神经漫游队列未初始化');
        return;
      }
      
      // 5. 添加到队列
      await neuralQueue.addCard(blockId, priority);
      
      // 6. 如果是高优先级，自动打开神经漫游对话框
      if (priority === 'high') {
        await pushMsg('🚀 已加入漫游队列（高优先级），正在打开神经漫游...');
        
        // 打开神经漫游对话框
        try {
          await this.deps.dialogManager.openNeuralRoamDialog();
        } catch (err) {
          console.error('[BlockMenuHandler] Failed to open neural roam dialog:', err);
          await pushErrMsg('❌ 打开神经漫游失败');
        }
      } else {
        await pushMsg('📍 已加入漫游队列');
      }
      
      console.log(`[BlockMenuHandler] Added concept card to neural roam: ${blockId} (priority: ${priority})`);
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to make concept and add to roam:', error);
      await pushErrMsg('❌ 操作失败：' + (error as Error).message);
    }
  }

  /**
   * 检查块是否为概念卡
   * 
   * @param blockId 块 ID
   * @returns 是否为概念卡
   */
  private async isConceptCard(blockId: string): Promise<boolean> {
    try {
      const stmt = `
        SELECT value
        FROM attributes
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND name = 'custom-fsrs-card-type'
      `;
      const rows = await sql(stmt);
      return rows && rows.length > 0 && rows[0].value === 'concept';
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to check if concept card:', error);
      return false;
    }
  }

  /**
   * SQL 转义
   * 
   * @param value 要转义的值
   * @returns 转义后的值
   */
  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
