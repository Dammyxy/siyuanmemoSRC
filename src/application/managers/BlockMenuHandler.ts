﻿﻿﻿/**
 * BlockMenuHandler - 处理块菜单相关的事件和操作
 * 从 index.ts 拆分出来的服务
 */

import type { App } from 'siyuan';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import { ManagerSiyuanAdapter } from '@/infrastructure/siyuan/ManagerSiyuanAdapter';
import { createVueDialog } from '@/utils/dialog';
import { DEFAULT_PRIORITY } from '@/core/queue';
import type { CardAttributeRow } from '@/core/queue/types';
import { QueueType } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';

import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { StorageManager } from '@/core/storage';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { IReviewQueue } from '@/types/unified-data-source';

interface SiyuanMenuItem {
  icon?: string;
  label?: string;
  type?: 'separator';
  submenu?: SiyuanMenuItem[];
  click?: () => void | Promise<void>;
}

interface SiyuanMenu {
  addItem(item: SiyuanMenuItem): void;
}

interface BlockIconMenuDetail {
  menu?: SiyuanMenu;
  blockElements?: HTMLElement[];
}

interface DocTreeMenuDetail {
  menu?: SiyuanMenu;
  elements?: HTMLElement[];
}

interface EditorTitleMenuDetail {
  menu?: SiyuanMenu;
  data?: { rootID?: string; id?: string };
}

interface BreadcrumbMenuDetail {
  menu?: SiyuanMenu;
  protyle?: { block?: { rootID?: string; id?: string } };
}

interface BlockRefMenuDetail {
  menu?: SiyuanMenu;
  element?: HTMLElement & { dataset?: DOMStringMap };
}

interface DrillCardPayload {
  cardID: string;
  blockID: string;
  deckID: string;
  priority: number;
  nextDues: Record<1 | 2 | 3 | 4, string>;
  state: number;
  lapses: number;
  reps: number;
}

interface BlockSqlRow {
  id: string;
  type?: string;
  subtype?: string;
  content?: string;
}

interface BlockTypeRow {
  type?: string;
  content?: string;
}

interface BlockSubtypeRow {
  subtype?: string;
}

interface CardAttributeWithTypeRow extends CardAttributeRow {
  card_type?: string;
}

interface AttributeValueRow {
  value?: string;
}

interface NeuralRoamQueueLike {
  addCard(card: FSRSCard | string, priority?: 'normal' | 'high'): Promise<void>;
}

export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) => Promise<void>;
  applicationContext: ApplicationContext;  // ✅ 必需：用于访问所有 DDD 架构服务
  cardCreationHelper: CardCreationHelper;  // ✅ 卡片创建辅助类
  siyuanApi?: ManagerSiyuanPort;
}

export class BlockMenuHandler {
  private readonly siyuanApi: ManagerSiyuanPort;

  constructor(private deps: BlockMenuHandlerDeps) {
    this.siyuanApi = deps.siyuanApi ?? new ManagerSiyuanAdapter();
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
  private getCardService(): CardApplicationService {
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

  private getQueue(type: QueueType): IReviewQueue {
    return this.deps.applicationContext.getUnifiedDataSourceManager().getQueue(type);
  }

  private extractMetaRootId(card: FSRSCard): string | undefined {
    const meta = card.meta as unknown;
    if (typeof meta !== 'object' || meta === null || !('rootId' in meta)) {
      return undefined;
    }
    const rootId = (meta as { rootId?: unknown }).rootId;
    return typeof rootId === 'string' ? rootId : undefined;
  }

  /**
   * 从块元素收集闪卡
   * 
   * @param blockElements 块元素列表
   * @returns 卡片列表
   */
  private collectCardsFromElements(blockElements: HTMLElement[]): FSRSCard[] {
    const seen = new Set<string>();
    const result: FSRSCard[] = [];
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
  private filterDueCards(cards: FSRSCard[]): FSRSCard[] {
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
  private async openRetrievalPractice(cards: FSRSCard[], dueOnly: boolean): Promise<void> {
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
  private async openIncrementalLearning(cards: FSRSCard[], dueOnly: boolean): Promise<void> {
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
  private async openTemporaryDrill(cards: FSRSCard[]): Promise<void> {
    const blockIds = [...new Set(cards.map(card => card.blockId).filter(Boolean))];
    
    if (blockIds.length === 0) {
      await this.siyuanApi.pushMsg('无法打开临时练习');
      return;
    }
    
    await this.deps.dialogManager.openTemporaryDrill(blockIds);
  }

  /**
   * 添加到刻意练习队列
   * 
   * @param cards 卡片列表
   */
  private async addToFinalDrill(cards: FSRSCard[]): Promise<void> {
    try {
      const finalDrillQueue = this.getQueue(QueueType.FinalDrill);
      
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
      
      await this.siyuanApi.pushMsg(`已添加 ${addedCount} 张卡片到刻意练习队列`);
      
      const shouldStart = await this.confirmStartFinalDrillDialog(addedCount);
      if (shouldStart) {
        await this.deps.dialogManager.openFinalDrillDialog();
      }
    } catch (err) {
      console.error('[BlockMenuHandler] Failed to add to FinalDrill:', err);
      await this.siyuanApi.pushMsg('添加到刻意练习失败');
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
        title: this.deps.i18n?.finalDrillQueueTitle || '刻意练习队列',
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
        title: this.deps.i18n?.startPracticeTitle || '开始练习？',
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
   * 菜单通用构建：分隔线
   */
  private separator(): SiyuanMenuItem {
    return { type: 'separator' };
  }

  private buildReviewActions(cards: FSRSCard[]): SiyuanMenuItem[] {
    const itemCards = cards.filter((card) => card.type !== CardType.Topic);
    const dueItemCards = this.filterDueCards(itemCards);
    const dueAllCards = this.filterDueCards(cards);

    return [
      {
        icon: 'iconRiffCard',
        label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueItemCards.length}/${itemCards.length})</span>`,
        click: async () => {
          if (dueItemCards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
            return;
          }
          await this.openRetrievalPractice(dueItemCards, true);
        },
      },
      {
        icon: 'iconRiffCard',
        label: `${this.deps.i18n?.retrievalPractice || '提取练习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${itemCards.length})</span>`,
        click: async () => {
          if (itemCards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          await this.openRetrievalPractice(itemCards, false);
        },
      },
      this.separator(),
      {
        icon: 'iconBook',
        label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.dueMode || '到期'} <span class="ft__secondary">(${dueAllCards.length}/${cards.length})</span>`,
        click: async () => {
          if (dueAllCards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
            return;
          }
          await this.openIncrementalLearning(dueAllCards, true);
        },
      },
      {
        icon: 'iconBook',
        label: `${this.deps.i18n?.incrementalLearning || '渐进学习'} - ${this.deps.i18n?.allMode || '全部'} <span class="ft__secondary">(${cards.length})</span>`,
        click: async () => {
          if (cards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          await this.openIncrementalLearning(cards, false);
        },
      },
      this.separator(),
      {
        icon: 'iconEye',
        label: `${this.deps.i18n?.temporaryDrill || '临时练习'} <span class="ft__secondary">(${cards.length})</span>`,
        click: async () => {
          if (cards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          await this.openTemporaryDrill(cards);
        },
      },
      this.separator(),
      {
        icon: 'iconAdd',
        label: `${this.deps.i18n?.addToFinalDrillQueue || '添加到刻意练习'} <span class="ft__secondary">(${cards.length})</span>`,
        click: async () => {
          if (cards.length === 0) {
            await this.siyuanApi.pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可添加的闪卡');
            return;
          }
          await this.addToFinalDrill(cards);
        },
      },
    ];
  }

  private buildConceptActions(blockId: string): SiyuanMenuItem[] {
    return [
      {
        icon: 'iconMark',
        label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列',
        click: async () => {
          await this.makeConceptAndAddToRoam(blockId, 'normal');
        },
      },
      {
        icon: 'iconFocus',
        label: this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游',
        click: async () => {
          await this.makeConceptAndAddToRoam(blockId, 'high');
        },
      },
    ];
  }

  private addSiyuanMemoMenu(menu: SiyuanMenu, submenu: SiyuanMenuItem[]): void {
    menu.addItem({
      icon: 'iconRiffCard',
      label: 'SiyuanMemo',
      submenu,
    });
  }

  private getEventDetail<T extends object>(event: unknown): T | null {
    if (!event || typeof event !== 'object') {
      return null;
    }
    const detail = (event as { detail?: unknown }).detail;
    if (detail && typeof detail === 'object') {
      return detail as T;
    }
    return event as T;
  }

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: unknown): void {
    const detail = this.getEventDetail<BlockIconMenuDetail>(e);
    const menu = detail?.menu;
    const blockElements = detail?.blockElements ?? [];

    if (!menu || blockElements.length === 0) {
      return;
    }

    const blockIds = blockElements
      .map((el) => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    if (blockIds.length === 0) {
      return;
    }

    const cards = this.collectCardsFromElements(blockElements);
    const submenu: SiyuanMenuItem[] = [
      ...this.buildReviewActions(cards),
      this.separator(),
      ...this.buildConceptActions(blockIds[0]),
      this.separator(),
      {
        icon: 'iconEdit',
        label: this.deps.i18n?.editSrsData || '编辑SRS数据',
        click: async () => {
          let target = blockElements.find((el) => el.hasAttribute(this.siyuanApi.CARD_ID_ATTR));
          let blockID = target?.getAttribute('data-node-id');
          let cardID = target?.getAttribute(this.siyuanApi.CARD_ID_ATTR);

          if (!cardID) {
            try {
              for (const bid of blockIds) {
                const card = this.getStorage().getCardByBlockId(bid);
                if (card) {
                  blockID = card.blockId;
                  cardID = card.id;
                  break;
                }
              }
            } catch (err) {
              console.warn('[SiYuanMemo] Failed to query local storage:', err);
            }
          }

          if (!blockID || !cardID) {
            await this.siyuanApi.pushErrMsg(this.deps.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
            return;
          }

          createVueDialog({
            title: this.deps.i18n?.editSrsData || '编辑SRS数据',
            component: SrsEditorDialog,
            props: {
              card: {
                id: cardID,
                blockId: blockID,
                deckId: this.siyuanApi.BUILTIN_DECK_ID,
              },
              deckId: this.siyuanApi.BUILTIN_DECK_ID,
              i18n: this.deps.i18n || {},
              plugin: this.deps.applicationContext.getPlugin(),
              reviewService: this.deps.applicationContext.getReviewService(),
            },
            width: '860px',
            height: '80vh',
          });
        },
      },
      this.separator(),
      {
        icon: 'iconAdd',
        label: this.deps.i18n?.createTemplateCard || '快速制卡',
        click: async () => {
          await this.deps.openCreateTemplateCardDialog(blockIds);
        },
      },
      {
        icon: 'iconList',
        label: this.deps.i18n?.createListTemplateCard || '创建有序列表卡',
        click: async () => {
          const hasOrderedChildren = await this.hasOrderedListChildren(blockIds[0]);
          if (!hasOrderedChildren) {
            await this.siyuanApi.pushErrMsg('只能对包含有序子列表项的块使用此功能');
            return;
          }
          await this.createListTemplateCards(blockIds);
        },
      },
      this.separator(),
    ];

    if (blockIds.length === 1) {
      submenu.push(
        {
          icon: 'iconRefresh',
          label: this.deps.i18n?.rebindDescriptorConcept || '🔄 重新绑定概念',
          click: async () => {
            const isDescriptor = await this.isDescriptorCard(blockIds[0]);
            if (!isDescriptor) {
              await this.siyuanApi.pushErrMsg('只能对描述符卡使用此功能');
              return;
            }
            await this.rebindDescriptorConcept(blockIds[0]);
          },
        },
        this.separator(),
      );
    }

    submenu.push({
      icon: 'iconTrashcan',
      label: this.deps.i18n?.deleteCard || '取消闪卡',
      click: async () => {
        const cardService = this.getCardService();
        let deletedCount = 0;
        let failedCount = 0;

        for (const blockId of blockIds) {
          const card = this.getStorage().getCardByBlockId(blockId);
          if (!card) {
            continue;
          }

          const result = await cardService.deleteCard({ cardId: card.id });
          if (result.ok) {
            deletedCount++;
            continue;
          }

          failedCount++;
          console.error(`[BlockMenuHandler] Failed to delete card ${card.id}:`, result.error);
        }

        if (deletedCount > 0) {
          await this.siyuanApi.pushMsg(
            failedCount > 0
              ? `已取消 ${deletedCount} 张闪卡，${failedCount} 张失败`
              : `已取消 ${deletedCount} 张闪卡`,
          );
          return;
        }

        await this.siyuanApi.pushMsg('未找到可取消的闪卡');
      },
    });

    this.addSiyuanMemoMenu(menu, submenu);
  }

  /**
   * 为文档树生成复习菜单项（同步版本，用于事件处理）
   */
  private generateReviewMenuForDocSync(docId: string): SiyuanMenuItem[] {
    const cardsInDoc = this.getStorage()
      .getAllCards()
      .filter((card) => {
        const rootId = this.extractMetaRootId(card);
        return rootId === docId || card.blockId === docId;
      });

    return [
      ...this.buildReviewActions(cardsInDoc),
      this.separator(),
      ...this.buildConceptActions(docId),
    ];
  }

  /**
   * 处理文档树菜单（文档块的块标菜单）
   */
  handleDocTreeMenu(e: unknown): void {
    const detail = this.getEventDetail<DocTreeMenuDetail>(e);
    const menu = detail?.menu;
    const docId = detail?.elements?.[0]?.getAttribute('data-node-id');
    if (!menu || !docId) {
      return;
    }

    try {
      this.addSiyuanMemoMenu(menu, this.generateReviewMenuForDocSync(docId));
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate doctree menu:', err);
    }
  }

  /**
   * 处理编辑器标题图标点击
   */
  handleEditorTitleIconClick(e: unknown): void {
    const detail = this.getEventDetail<EditorTitleMenuDetail>(e);
    const menu = detail?.menu;
    const docId = detail?.data?.rootID || detail?.data?.id;
    if (!menu || !docId) {
      return;
    }

    try {
      this.addSiyuanMemoMenu(menu, this.generateReviewMenuForDocSync(docId));
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate doc menu:', err);
    }
  }

  /**
   * 处理面包屑更多菜单
   */
  handleBreadcrumbMore(e: unknown): void {
    const detail = this.getEventDetail<BreadcrumbMenuDetail>(e);
    const menu = detail?.menu;
    const docId = detail?.protyle?.block?.rootID || detail?.protyle?.block?.id;
    if (!menu || !docId) {
      return;
    }

    try {
      this.addSiyuanMemoMenu(menu, this.generateReviewMenuForDocSync(docId));
    } catch (err) {
      console.error('[SiYuanMemo] Failed to generate breadcrumb menu:', err);
    }
  }

  /**
   * 处理块引用右键菜单
   */
  handleBlockRefMenu(e: unknown): void {
    const detail = this.getEventDetail<BlockRefMenuDetail>(e);
    const menu = detail?.menu;
    const blockId = detail?.element?.dataset?.id;
    if (!menu || !blockId) {
      return;
    }

    try {
      this.addSiyuanMemoMenu(menu, this.buildConceptActions(blockId));
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
  buildDrillCardsFromElements(elements: HTMLElement[]): DrillCardPayload[] {
    const result: DrillCardPayload[] = [];
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
        deckID: this.siyuanApi.BUILTIN_DECK_ID,
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
  async getDrillCardsFromDocTree(docId: string): Promise<DrillCardPayload[]> {
    const blockIds = await this.siyuanApi.getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  /**
   * 从块 ID 列表构建练习卡片数据
   */
  async buildDrillCardsFromBlockIds(blockIds: string[]): Promise<DrillCardPayload[]> {
    const uniqueIds = Array.from(new Set(blockIds));
    if (uniqueIds.length === 0) {
      return [];
    }

    const result: DrillCardPayload[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map((id) => `'${this.escapeSQL(id)}'`).join(',');
      
      // 查询卡片属性，包括卡片类型
      const rows = await this.siyuanApi.sql(`
        SELECT 
          a1.block_id, 
          a1.value as card_id,
          a2.value as card_type
        FROM attributes a1
        LEFT JOIN attributes a2 ON a1.block_id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
        WHERE a1.name = '${this.siyuanApi.CARD_ID_ATTR}' 
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
          deckID: this.siyuanApi.BUILTIN_DECK_ID,
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
      const listContainerResult = await this.siyuanApi.sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${parentBlockId}'
        AND type = 'l'
        LIMIT 1
      `) as BlockSqlRow[];
      
      if (!listContainerResult || listContainerResult.length === 0) {
        return false;
      }
      
      const listContainerId = listContainerResult[0].id;
      
      // 2. 检查子列表项是否为有序列表
      const childrenResult = await this.siyuanApi.sql(`
        SELECT subtype FROM blocks
        WHERE parent_id = '${listContainerId}'
        AND type = 'i'
        LIMIT 1
      `) as BlockSubtypeRow[];
      
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
        await this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      // 只处理第一个块
      const parentBlockId = blockIds[0];
      console.log(`[SiYuanMemo] 🎯 Creating ordered list template cards for: ${parentBlockId}`);

      // 1. 检查块类型
      const typeResult = await this.siyuanApi.sql(`
        SELECT type, content FROM blocks
        WHERE id = '${parentBlockId}'
        LIMIT 1
      `) as BlockTypeRow[];

      if (!typeResult || typeResult.length === 0) {
        await this.siyuanApi.pushErrMsg('块不存在');
        return;
      }

      const blockType = typeResult[0].type;
      const blockContent = typeResult[0].content;

      if (blockType !== 'i') {
        await this.siyuanApi.pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      // 2. 获取子级列表项（必须是有序列表）
      // 思源的列表结构：列表项(i) → 段落(p) + 列表容器(l) → 子列表项(i)
      // 所以需要先找到列表容器(l)，再查询其子级
      const allChildrenResult = await this.siyuanApi.sql(`
        SELECT id, type, content FROM blocks
        WHERE parent_id = '${parentBlockId}'
        ORDER BY id ASC
      `) as BlockSqlRow[];
      
      console.log(`[SiYuanMemo] All children of ${parentBlockId}:`, allChildrenResult);
      
      // 找到列表容器
      const listContainer = allChildrenResult.find((r) => r.type === 'l');
      
      if (!listContainer) {
        await this.siyuanApi.pushErrMsg('未找到列表容器，请确保列表结构正确');
        return;
      }
      
      console.log(`[SiYuanMemo] Found list container:`, listContainer.id);
      
      // 查询列表容器的所有子级（不限制类型，看看实际结构）
      const allListChildren = await this.siyuanApi.sql(`
        SELECT id, type, subtype, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        ORDER BY id ASC
      `) as BlockSqlRow[];
      
      console.log(`[SiYuanMemo] All list container children:`, allListChildren);
      
      // 查询列表容器的子级列表项（必须是有序列表）
      const childrenResult = await this.siyuanApi.sql(`
        SELECT id, content FROM blocks
        WHERE parent_id = '${listContainer.id}'
        AND type = 'i'
        AND subtype = 'o'
        ORDER BY id ASC
      `) as BlockSqlRow[];

      console.log(`[SiYuanMemo] Ordered list item children (type='i', subtype='o'):`, childrenResult);

      // 如果没有找到直接子级，尝试查询所有后代列表项（必须是有序列表）
      let finalChildren: BlockSqlRow[] = childrenResult;
      if (!finalChildren || finalChildren.length === 0) {
        console.log(`[SiYuanMemo] No direct ordered children found, trying descendants...`);
        
        // 使用递归查询找到所有后代列表项（有序列表）
        const descendantsResult = await this.siyuanApi.sql(`
          WITH RECURSIVE descendants AS (
            SELECT id, type, subtype, content, parent_id FROM blocks WHERE parent_id = '${listContainer.id}'
            UNION ALL
            SELECT b.id, b.type, b.subtype, b.content, b.parent_id FROM blocks b
            INNER JOIN descendants d ON b.parent_id = d.id
          )
          SELECT id, content FROM descendants WHERE type = 'i' AND subtype = 'o' ORDER BY id ASC
        `) as BlockSqlRow[];
        
        console.log(`[SiYuanMemo] Descendant ordered list items:`, descendantsResult);
        finalChildren = descendantsResult;
      }

      if (!finalChildren || finalChildren.length < 2) {
        await this.siyuanApi.pushErrMsg(`需要至少2个有序子列表项（当前：${finalChildren?.length || 0}个）`);
        return;
      }

      const childBlockIds = finalChildren.map((row) => row.id);
      console.log(`[SiYuanMemo] Found ${childBlockIds.length} children:`, childBlockIds);

      // 3. 确认创建
      await this.siyuanApi.pushMsg(`检测到 ${childBlockIds.length} 个子级列表项，开始创建卡片...`);

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
        await this.siyuanApi.pushMsg(`✅ 成功创建 ${childBlockIds.length} 张有序列表模版卡！`);
        console.log(`[SiYuanMemo] 🎉 Ordered list template cards creation complete:`, result.value);
      } else {
        const errorMsg = result.ok === false ? result.error.message : 'Unknown error';
        await this.siyuanApi.pushErrMsg(`创建失败：${errorMsg}`);
        console.error(`[SiYuanMemo] ❌ Ordered list template cards creation failed:`, result.ok === false ? result.error : 'Unknown error');
      }
    } catch (err) {
      console.error('[SiYuanMemo] Failed to create ordered list template cards:', err);
      await this.siyuanApi.pushErrMsg(`创建失败：${(err as Error).message}`);
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
          await this.siyuanApi.markBlockAsCard(blockId, result.value.id.value, priority === 'high' ? 1 : 0, 'item');
          
          // 更新块属性为 concept 类型
          await this.siyuanApi.setBlockAttrs(blockId, {
            'custom-fsrs-card-type': 'concept'
          });
          
          // ✅ 添加到 Riff（确保同步）
          await this.siyuanApi.addRiffCards(this.siyuanApi.BUILTIN_DECK_ID, [blockId]);
          console.log(`[BlockMenuHandler] Added concept card to Riff: ${blockId}`);
          
          console.log(`[BlockMenuHandler] Created concept card via CardCreationHelper: ${blockId}`);
          await this.siyuanApi.pushMsg('✅ 已制作为概念卡');
        } else {
          console.error(`[BlockMenuHandler] Failed to create concept card: ${result.error.message}`);
          await this.siyuanApi.pushErrMsg(`创建失败：${result.error.message}`);
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
              type: CardType.Concept,
            }
          });
          
          if (result.ok) {
            // 更新块属性
            await this.siyuanApi.setBlockAttrs(blockId, {
              'custom-fsrs-card-type': 'concept'
            });
            
            console.log(`[BlockMenuHandler] Updated card type to concept for block: ${blockId}`);
            await this.siyuanApi.pushMsg('✅ 已更新为概念卡');
          } else {
            console.error(`[BlockMenuHandler] Failed to update card type: ${result.error}`);
            await this.siyuanApi.pushErrMsg(`更新失败：${result.error}`);
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
      const neuralQueue = this.getQueue(QueueType.NeuralRoam) as unknown as NeuralRoamQueueLike;
      
      // 5. 添加到队列
      await neuralQueue.addCard(blockId, priority);
      
      // 6. 如果是高优先级，自动打开神经漫游对话框
      if (priority === 'high') {
        await this.siyuanApi.pushMsg('🚀 已加入漫游队列（高优先级），正在打开神经漫游...');
        
        // 打开神经漫游对话框
        try {
          await this.deps.dialogManager.openNeuralRoamDialog();
        } catch (err) {
          console.error('[BlockMenuHandler] Failed to open neural roam dialog:', err);
          await this.siyuanApi.pushErrMsg('❌ 打开神经漫游失败');
        }
      } else {
        await this.siyuanApi.pushMsg('📍 已加入漫游队列');
      }
      
      console.log(`[BlockMenuHandler] Added concept card to neural roam: ${blockId} (priority: ${priority})`);
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to make concept and add to roam:', error);
      await this.siyuanApi.pushErrMsg('❌ 操作失败：' + (error as Error).message);
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
      const rows = await this.siyuanApi.sql(stmt) as AttributeValueRow[];
      return rows && rows.length > 0 && rows[0].value === 'concept';
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to check if concept card:', error);
      return false;
    }
  }

  /**
   * 检查块是否为描述符卡
   * 
   * @param blockId 块 ID
   * @returns 是否为描述符卡
   */
  private async isDescriptorCard(blockId: string): Promise<boolean> {
    try {
      const stmt = `
        SELECT value
        FROM attributes
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND name = 'custom-fsrs-card-type'
      `;
      const rows = await this.siyuanApi.sql(stmt) as AttributeValueRow[];
      return rows && rows.length > 0 && rows[0].value === 'descriptor';
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to check if descriptor card:', error);
      return false;
    }
  }

  /**
   * 重新绑定描述符卡片的概念
   * 
   * @param blockId 描述符块 ID
   */
  private async rebindDescriptorConcept(blockId: string): Promise<void> {
    try {
      console.log('[BlockMenuHandler] Rebinding descriptor concept for block:', blockId);
      
      // 获取 XiuyuanApplicationService
      const xiuyuanAppService = await this.deps.applicationContext.getXiuyuanApplicationService();
      if (!xiuyuanAppService) {
        await this.siyuanApi.pushErrMsg('❌ Xiuyuan 应用服务未初始化');
        return;
      }
      
      // 调用应用服务的 rebindDescriptorConcept 方法
      const result = await xiuyuanAppService.rebindDescriptorConcept({
        descriptorBlockId: blockId,
      });
      
      if (result.ok) {
        const { newConceptName, createdConceptCard } = result.value;
        
        if (createdConceptCard) {
          await this.siyuanApi.pushMsg(`✅ 已重新绑定到概念：${newConceptName}（已自动创建概念卡）`);
        } else {
          await this.siyuanApi.pushMsg(`✅ 已重新绑定到概念：${newConceptName}`);
        }
        
        console.log('[BlockMenuHandler] Rebind descriptor concept success:', result.value);
      } else {
        await this.siyuanApi.pushErrMsg(`❌ 重新绑定失败：${result.error.message}`);
        console.error('[BlockMenuHandler] Rebind descriptor concept failed:', result.error);
      }
    } catch (error) {
      console.error('[BlockMenuHandler] Failed to rebind descriptor concept:', error);
      await this.siyuanApi.pushErrMsg(`❌ 重新绑定失败：${(error as Error).message}`);
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
