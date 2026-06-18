﻿﻿/**
 * BlockMenuHandler - 处理块菜单相关的事件和操作
 * 从 index.ts 拆分出来的服务
 */

import type { App } from 'siyuan';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import {
  createUnavailableHostBlockQueryPort,
  type HostBlockQueryPort,
} from '@/application/ports/HostBlockQueryPort';
import { applyDialogChrome, createVueDialog } from '@/utils/dialog';
import { DEFAULT_PRIORITY } from '@/core/queue';
import { QueueType } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';

import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { ApplicationContext } from '@/application/ApplicationContext';
import type { DialogManager } from '@/application/managers/DialogManager';
import type { StorageManager } from '@/core/storage';
import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { IReviewQueue } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { resolveListChildrenBySubtype } from '@/application/usecases/xiuyuan/shared/ListChildrenResolver';
import { resolveListItemAnchorBlockId as resolveListItemAnchorBlockIdHelper } from '@/application/usecases/xiuyuan/shared/ListItemAnchorResolver';
import { resolveCdfTailMarkerFromSources } from '@/application/usecases/xiuyuan/shared/CdfTailMarker';
import { CoreReviewEntryService, type CoreReviewScopeOptions } from '@/application/entries/CoreReviewEntryService';
import type { CoreReviewEntryActionId } from '@/application/entries/CoreReviewEntryRegistry';
import type { NeuralRoamEntryActionService } from '@/application/services/NeuralRoamEntryActionService';
import {
  resolveProgressiveExcerptSnapshotFromBlocks,
} from '@/application/entries/ProgressiveSelectionResolver';
import type { CurrentBlockTopicContinuationPreparation } from '@/application/services/SelectionTopicContinuationService';
import { isErr } from '@/types/result';

const logger = createLogger('BlockMenuHandler');

interface SiyuanMenuItem {
  icon?: string;
  label?: string;
  type?: 'separator';
  submenu?: SiyuanMenuItem[];
  click?: () => void | Promise<void>;
  disabled?: boolean;
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

interface BlockSqlRow extends Record<string, unknown> {
  id: string;
  type?: string;
  parent_id?: string;
  subtype?: string;
  content?: string;
  markdown?: string;
}

interface ReviewScopeSnapshot {
  cards: FSRSCard[];
  scopeDocIds?: string[];
}

export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: {
    focusBlockId?: string;
    seedBlockId?: string | null;
    sourceReviewCardId?: string | null;
    conceptBlockId?: string | null;
    previousEngineMode?: 'orbit' | 'hyperspace' | null;
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean;
    startNewSession?: boolean;
    entrySessionKind?: 'temporary-current-block' | 'temporary-concept' | 'station-roam' | 'concept-card-roam' | 'direct-focus' | null;
  }) => Promise<void>;
  applicationContext: ApplicationContext;  // ✅ 必需：用于访问所有 DDD 架构服务
  cardCreationHelper: CardCreationHelper;  // ✅ 卡片创建辅助类
  siyuanApi: ManagerSiyuanPort;
  hostBlockQuery?: HostBlockQueryPort;
}

export class BlockMenuHandler {
  private readonly siyuanApi: ManagerSiyuanPort;
  private readonly hostBlockQuery: HostBlockQueryPort;

  constructor(private deps: BlockMenuHandlerDeps) {
    this.siyuanApi = deps.siyuanApi;
    this.hostBlockQuery = deps.hostBlockQuery ?? createUnavailableHostBlockQueryPort('BlockMenuHandler was constructed without HostBlockQueryPort');
    // ReviewEntry 类已删除，功能直接在 BlockMenuHandler 中实现
  }

  private createCoreReviewEntryService(): CoreReviewEntryService {
    return new CoreReviewEntryService({
      i18n: this.deps.i18n,
      dialogManager: this.deps.dialogManager,
      notify: async (message) => this.siyuanApi.pushMsg(message),
      getDayStartHour: () => this.deps.applicationContext.getUnifiedDataSourceManager().getDayStartHour(),
    });
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

  private getNeuralRoamEntryActionService(): NeuralRoamEntryActionService {
    return this.deps.applicationContext.getNeuralRoamEntryActionService();
  }

  private escapeAttr(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/"/g, '\\"');
  }

  private collectCardsFromDocumentDom(docId: string): FSRSCard[] {
    const escapedDocId = this.escapeAttr(docId);
    const backgrounds = Array.from(document.querySelectorAll<HTMLElement>(
      `.protyle-content .protyle-background[data-node-id="${escapedDocId}"]`,
    ));
    if (backgrounds.length === 0) {
      return [];
    }

    const blockIds = new Set<string>();
    for (const background of backgrounds) {
      const content = background.closest('.protyle-content') as HTMLElement | null;
      const wysiwyg = content?.querySelector<HTMLElement>('.protyle-wysiwyg');
      if (!wysiwyg) {
        continue;
      }
      const nodes = Array.from(wysiwyg.querySelectorAll<HTMLElement>('[data-node-id]'));
      for (const node of nodes) {
        const blockId = node.getAttribute('data-node-id');
        if (blockId) {
          blockIds.add(blockId);
        }
      }
    }

    if (blockIds.size === 0) {
      return [];
    }

    const cardsById = new Map<string, FSRSCard>();
    for (const blockId of blockIds) {
      const cards = this.getStorage().getCardsByBlockId(blockId);
      for (const card of cards) {
        if (card?.id) {
          cardsById.set(card.id, card);
        }
      }
    }

    return Array.from(cardsById.values());
  }

  private mergeUniqueCards(...groups: FSRSCard[][]): FSRSCard[] {
    const cardsById = new Map<string, FSRSCard>();
    for (const group of groups) {
      for (const card of group) {
        if (card?.id) {
          cardsById.set(card.id, card);
        }
      }
    }
    return Array.from(cardsById.values());
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

  private async resolveSubtreeBlockIds(blockIds: string[]): Promise<string[]> {
    const normalizedRoots = Array.from(new Set(
      blockIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
    ));
    if (normalizedRoots.length === 0) {
      return [];
    }

    try {
      return this.hostBlockQuery.getSubtreeBlockIds(normalizedRoots);
    } catch (error) {
      logger.warn('[BlockMenuHandler] Failed to resolve subtree block ids, fallback to selected roots only:', {
        blockIds: normalizedRoots,
        error,
      });
      return normalizedRoots;
    }
  }

  async runCoreEntryAction(actionId: CoreReviewEntryActionId, blockElements: HTMLElement[]): Promise<void> {
    const elements = Array.isArray(blockElements) ? blockElements : [];
    if (elements.length === 0) {
      await this.siyuanApi.pushMsg(
        this.deps.i18n?.coreReviewNoBlockContext || '未找到块上下文，请先选中块或将光标放在块内',
      );
      return;
    }

    const scope = this.collectReviewScopeFromBlockIcon(elements) ?? { cards: this.collectCardsFromElements(elements) };
    const coreReviewEntryService = this.createCoreReviewEntryService();
    await coreReviewEntryService.execute(actionId, scope.cards, {
      scopeDocIds: scope.scopeDocIds,
    });
  }

  async runEditSrsDataAction(blockElements: HTMLElement[]): Promise<void> {
    const elements = Array.isArray(blockElements) ? blockElements : [];
    if (elements.length === 0) {
      await this.siyuanApi.pushMsg(
        this.deps.i18n?.coreReviewNoBlockContext || '未找到块上下文，请先选中块或将光标放在块内',
      );
      return;
    }

    const blockIds = elements
      .map((el) => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    const targetCard = this.resolveEditableCardFromBlocks(elements, blockIds);
    if (!targetCard) {
      await this.siyuanApi.pushErrMsg(this.deps.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
      return;
    }

    createVueDialog({
      title: this.deps.i18n?.editSrsData || '编辑SRS数据',
      component: SrsEditorDialog,
      props: {
        card: {
          id: targetCard.cardID,
          blockId: targetCard.blockID,
          deckId: this.siyuanApi.BUILTIN_DECK_ID,
        },
        deckId: this.siyuanApi.BUILTIN_DECK_ID,
        i18n: this.deps.i18n || {},
        plugin: this.deps.applicationContext.getPlugin(),
        reviewService: this.deps.applicationContext.getReviewService(),
      },
      width: 'min(680px, 92vw)',
      height: 'min(640px, 66vh)',
      visualVariant: 'form',
      containerClass: 'siyuanmemo-srs-editor-dialog',
    });
  }

  async runRebindDescriptorConceptAction(blockElements: HTMLElement[]): Promise<void> {
    const elements = Array.isArray(blockElements) ? blockElements : [];
    if (elements.length === 0) {
      await this.siyuanApi.pushMsg(
        this.deps.i18n?.coreReviewNoBlockContext || '未找到块上下文，请先选中块或将光标放在块内',
      );
      return;
    }

    const blockId = elements
      .map((el) => el.getAttribute('data-node-id'))
      .find((id): id is string => Boolean(id));
    if (!blockId) {
      await this.siyuanApi.pushMsg(
        this.deps.i18n?.coreReviewNoBlockContext || '未找到块上下文，请先选中块或将光标放在块内',
      );
      return;
    }

    const isDescriptor = await this.isDescriptorCard(blockId);
    if (!isDescriptor) {
      await this.siyuanApi.pushErrMsg('只能对描述符卡使用此功能');
      return;
    }

    await this.rebindDescriptorConcept(blockId);
  }

  private resolveEditableCardFromBlocks(
    blockElements: HTMLElement[],
    blockIds: string[],
  ): { blockID: string; cardID: string } | null {
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
        logger.warn('[SiYuanMemo] Failed to query local storage:', err);
      }
    }

    if (!blockID || !cardID) {
      return null;
    }
    return { blockID, cardID };
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
          logger.error(`[BlockMenuHandler] Failed to add card ${card.id}:`, err);
        }
      }
      
      await this.siyuanApi.pushMsg(`已添加 ${addedCount} 张卡片到刻意练习队列`);
      
      const shouldStart = await this.confirmStartFinalDrillDialog(addedCount);
      if (shouldStart) {
        await this.deps.dialogManager.openFinalDrillDialog();
      }
    } catch (err) {
      logger.error('[BlockMenuHandler] Failed to add to FinalDrill:', err);
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
          <div class="siyuanmemo-choice-dialog">
            <p class="siyuanmemo-choice-dialog__message">
              队列中已有 <strong>${existingCount}</strong> 张卡片，你想：
            </p>
            <div class="siyuanmemo-choice-dialog__actions">
            <button class="b3-button b3-button--cancel">取消</button>
            <button class="b3-button" data-action="continue">继续练习</button>
            <button class="b3-button" data-action="replace">替换队列</button>
            <button class="b3-button b3-button--text" data-action="append">追加 ${newCount} 张</button>
            </div>
          </div>
        `,
        width: '520px',
      });
      applyDialogChrome(dialog, {
        visualVariant: 'manager',
        containerClass: 'siyuanmemo-final-drill-choice-dialog',
        dialogWidth: '520px',
        dialogHeight: 'auto',
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
          <div class="siyuanmemo-choice-dialog">
            <p class="siyuanmemo-choice-dialog__message">
              已添加 <strong>${addedCount}</strong> 张卡片到刻意练习队列。要现在开始练习吗？
            </p>
            <div class="siyuanmemo-choice-dialog__actions">
            <button class="b3-button b3-button--cancel">稍后</button>
            <button class="b3-button b3-button--text">立即开始</button>
            </div>
          </div>
        `,
        width: '420px',
      });
      applyDialogChrome(dialog, {
        visualVariant: 'form',
        containerClass: 'siyuanmemo-final-drill-confirm-dialog',
        dialogWidth: '420px',
        dialogHeight: 'auto',
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

  private buildReviewActions(cards: FSRSCard[], options?: CoreReviewScopeOptions): SiyuanMenuItem[] {
    const coreReviewEntryService = this.createCoreReviewEntryService();
    const coreReviewActions = coreReviewEntryService.createMenuActions(cards, options);

    return [
      {
        icon: coreReviewActions[0].icon,
        label: coreReviewActions[0].label,
        click: coreReviewActions[0].execute,
      },
      {
        icon: coreReviewActions[1].icon,
        label: coreReviewActions[1].label,
        click: coreReviewActions[1].execute,
      },
      this.separator(),
      {
        icon: coreReviewActions[2].icon,
        label: coreReviewActions[2].label,
        click: coreReviewActions[2].execute,
      },
      {
        icon: coreReviewActions[3].icon,
        label: coreReviewActions[3].label,
        click: coreReviewActions[3].execute,
      },
      this.separator(),
      {
        icon: coreReviewActions[4].icon,
        label: coreReviewActions[4].label,
        click: coreReviewActions[4].execute,
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
        label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入当前航线',
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

  private buildProgressiveDocActions(docId: string): SiyuanMenuItem[] {
    return [
      {
        icon: 'iconFiles',
        label: this.deps.i18n?.progressiveSplitLinear || '渐进 Split（线性）',
        click: async () => {
          await this.deps.dialogManager.openProgressiveSplitDialog(docId, 'linear');
        },
      },
      {
        icon: 'iconFiles',
        label: this.deps.i18n?.progressiveSplitNonlinear || '渐进 Split（非线性）',
        click: async () => {
          await this.deps.dialogManager.openProgressiveSplitDialog(docId, 'nonlinear');
        },
      },
    ];
  }

  private buildDocBrowserActions(scope: ReviewScopeSnapshot): SiyuanMenuItem[] {
    return [
      {
        icon: 'iconRiffCard',
        label: this.deps.i18n?.openSrsBrowser || '打开 SRS 浏览器',
        click: async () => {
          await this.deps.dialogManager.openBrowserDialog({
            initialOpenState: {
              scopeDocIds: scope.scopeDocIds,
              preset: 'all',
            },
          });
        },
      },
    ];
  }

  private buildDocBrowserLoadingActions(): SiyuanMenuItem[] {
    const loadingText = this.deps.i18n?.loading || '加载中...';
    return [
      {
        icon: 'iconRiffCard',
        label: `${this.deps.i18n?.openSrsBrowser || '打开 SRS 浏览器'} <span class="ft__secondary">(${loadingText})</span>`,
        disabled: true,
      },
    ];
  }

  private buildDocMenuGroup(labelKey: string, fallback: string, icon: string, submenu: SiyuanMenuItem[]): SiyuanMenuItem {
    return {
      icon,
      label: this.text(labelKey, fallback),
      submenu,
    };
  }

  private addSiyuanMemoMenu(menu: SiyuanMenu, submenu: SiyuanMenuItem[]): void {
    menu.addItem({
      icon: 'iconRiffCard',
      label: 'SiYuanMemo',
      submenu,
    });
  }

  private buildDocReviewMenuItems(docId: string, scope: ReviewScopeSnapshot): SiyuanMenuItem[] {
    return [
      this.buildDocMenuGroup(
        'menuGroupPractice',
        '练习',
        'iconPlay',
        [
          ...this.buildReviewActions(scope.cards, {
            scopeDocIds: scope.scopeDocIds,
          }),
          this.separator(),
          ...this.buildConceptActions(docId),
        ],
      ),
      this.buildDocMenuGroup(
        'menuGroupBrowse',
        '浏览',
        'iconSearch',
        this.buildDocBrowserActions(scope),
      ),
      this.buildDocMenuGroup(
        'menuGroupDocumentProcessing',
        '文档处理',
        'iconFiles',
        this.buildProgressiveDocActions(docId),
      ),
    ];
  }

  private buildDocLoadingMenuItems(docId: string): SiyuanMenuItem[] {
    const loadingText = this.deps.i18n?.loading || '加载中...';
    const retrievalLabel = this.deps.i18n?.retrievalPractice || '提取练习';
    const incrementalLabel = this.deps.i18n?.incrementalLearning || '渐进学习';
    const temporaryLabel = this.deps.i18n?.temporaryDrill || '临时练习';
    const dueLabel = this.deps.i18n?.dueMode || '到期';
    const allLabel = this.deps.i18n?.allMode || '全部';
    const finalDrillLabel = this.deps.i18n?.addToFinalDrillQueue || '添加到刻意练习';
    const pendingSuffix = `<span class="ft__secondary">(${loadingText})</span>`;

    return [
      this.buildDocMenuGroup(
        'menuGroupPractice',
        '练习',
        'iconPlay',
        [
          { icon: 'iconRiffCard', label: `${retrievalLabel} - ${dueLabel} ${pendingSuffix}`, disabled: true },
          { icon: 'iconRiffCard', label: `${retrievalLabel} - ${allLabel} ${pendingSuffix}`, disabled: true },
          this.separator(),
          { icon: 'iconBook', label: `${incrementalLabel} - ${dueLabel} ${pendingSuffix}`, disabled: true },
          { icon: 'iconBook', label: `${incrementalLabel} - ${allLabel} ${pendingSuffix}`, disabled: true },
          this.separator(),
          { icon: 'iconEye', label: `${temporaryLabel} ${pendingSuffix}`, disabled: true },
          this.separator(),
          { icon: 'iconAdd', label: `${finalDrillLabel} ${pendingSuffix}`, disabled: true },
          this.separator(),
          ...this.buildConceptActions(docId),
        ],
      ),
      this.buildDocMenuGroup(
        'menuGroupBrowse',
        '浏览',
        'iconSearch',
        this.buildDocBrowserLoadingActions(),
      ),
      this.buildDocMenuGroup(
        'menuGroupDocumentProcessing',
        '文档处理',
        'iconFiles',
        this.buildProgressiveDocActions(docId),
      ),
    ];
  }

  private buildReviewLoadingActions(): SiyuanMenuItem[] {
    const loadingText = this.deps.i18n?.loading || '加载中...';
    const retrievalLabel = this.deps.i18n?.retrievalPractice || '提取练习';
    const incrementalLabel = this.deps.i18n?.incrementalLearning || '渐进学习';
    const temporaryLabel = this.deps.i18n?.temporaryDrill || '临时练习';
    const dueLabel = this.deps.i18n?.dueMode || '到期';
    const allLabel = this.deps.i18n?.allMode || '全部';
    const finalDrillLabel = this.deps.i18n?.addToFinalDrillQueue || '添加到刻意练习';
    const pendingSuffix = `<span class="ft__secondary">(${loadingText})</span>`;

    return [
      { icon: 'iconRiffCard', label: `${retrievalLabel} - ${dueLabel} ${pendingSuffix}`, disabled: true },
      { icon: 'iconRiffCard', label: `${retrievalLabel} - ${allLabel} ${pendingSuffix}`, disabled: true },
      this.separator(),
      { icon: 'iconBook', label: `${incrementalLabel} - ${dueLabel} ${pendingSuffix}`, disabled: true },
      { icon: 'iconBook', label: `${incrementalLabel} - ${allLabel} ${pendingSuffix}`, disabled: true },
      this.separator(),
      { icon: 'iconEye', label: `${temporaryLabel} ${pendingSuffix}`, disabled: true },
      this.separator(),
      { icon: 'iconAdd', label: `${finalDrillLabel} ${pendingSuffix}`, disabled: true },
    ];
  }

  private collectDocReviewScope(docId: string): ReviewScopeSnapshot | null {
    const scope = this.deps.applicationContext.getDocTreeReviewScopeService().collectDocReviewScope(docId);
    if (!scope) {
      return null;
    }

    const domCards = this.collectCardsFromDocumentDom(docId);
    return {
      cards: this.mergeUniqueCards(scope.cards, domCards),
      scopeDocIds: scope.docIds,
    };
  }

  private isDocumentBlockElement(element: HTMLElement, blockId: string): boolean {
    const root = (element.closest('[data-node-id]') as HTMLElement) || element;
    const dataTypeCandidates = [
      root.getAttribute('data-type'),
      element.getAttribute('data-type'),
      root.dataset?.type,
      element.dataset?.type,
    ];

    if (dataTypeCandidates.some((value) => value === 'NodeDocument' || value === 'd')) {
      return true;
    }

    return this.deps.applicationContext.getDocTreeReviewScopeService().hasDoc(blockId);
  }

  private collectReviewScopeFromBlockIcon(blockElements: HTMLElement[]): ReviewScopeSnapshot | null {
    const rootEntries = blockElements
      .map((element) => ((element.closest('[data-node-id]') as HTMLElement) || element))
      .map((element) => ({
        element,
        blockId: element.getAttribute('data-node-id') || '',
      }))
      .filter((entry): entry is { element: HTMLElement; blockId: string } => entry.blockId.length > 0);

    if (rootEntries.length === 0) {
      return [];
    }

    const docEntries = rootEntries.filter(({ element, blockId }) => this.isDocumentBlockElement(element, blockId));
    if (docEntries.length === 0 || docEntries.length !== rootEntries.length) {
      return {
        cards: this.collectCardsFromElements(blockElements),
      };
    }

    const groups: FSRSCard[][] = [];
    const scopeDocIds = new Set<string>();
    for (const entry of docEntries) {
      const scope = this.collectDocReviewScope(entry.blockId);
      if (!scope) {
        return null;
      }
      groups.push(scope.cards);
      for (const docId of scope.scopeDocIds ?? []) {
        scopeDocIds.add(docId);
      }
    }

    return {
      cards: this.mergeUniqueCards(...groups),
      scopeDocIds: scopeDocIds.size > 0 ? Array.from(scopeDocIds) : undefined,
    };
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

  private text(key: string, fallback: string): string {
    const value = this.deps.i18n?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }

  private async runProgressiveExcerptAction(blockElements: HTMLElement[]): Promise<void> {
    const selection = resolveProgressiveExcerptSnapshotFromBlocks(blockElements);
    if (!selection) {
      await this.siyuanApi.pushErrMsg(this.text('progressiveExcerptNoSelection', '请先选中块或文本后再摘抄'));
      return;
    }

    try {
      const result = await this.deps.applicationContext.getSelectionExcerptService().executeSelectionExcerptAction({
        selection,
        origin: 'block-menu',
        sourceMarkingEnabled: this.isProgressiveExcerptSourceMarkingEnabled(),
      });
      if (result.preservation.incomplete) {
        logger.warn('[BlockMenuHandler] Progressive excerpt created without DOM preservation evidence for likely inline references', {
          sourceBlockId: result.sourceBlockId,
          sourceBlockIds: result.sourceBlockIds,
        });
      }
      if (result.preservation.incomplete) {
        await this.siyuanApi.pushMsg(
          this.text('progressiveExcerptPreservationDegraded', '已创建 Topic，但原文链接或块引用可能未完整保留'),
        );
      }
      await this.siyuanApi.pushMsg(
        result.sourceMark.diagnostic
          ? this.text('progressiveExcerptCreatedSourceMarkFailed', '已创建 Topic，但原文标记未写入')
          : this.text('progressiveExcerptCreated', '已创建 Topic，已进入今日渐进学习'),
      );
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to create progressive excerpt from block menu:', error);
      await this.siyuanApi.pushErrMsg(
        this.text('progressiveExcerptFailed', '摘抄失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private isProgressiveExcerptSourceMarkingEnabled(): boolean {
    try {
      const settingsService = this.deps.applicationContext.getSettingsService?.();
      return settingsService?.getSettings?.().progressiveReading?.sourceMarkingEnabled !== false;
    } catch (error) {
      logger.warn('[BlockMenuHandler] Failed to read progressive source-mark setting, defaulting to enabled:', error);
      return true;
    }
  }

  private resolveBlockMenuRootId(blockElement: HTMLElement, fallbackBlockId?: string): string | undefined {
    const content = blockElement.closest('.protyle-content') as HTMLElement | null;
    const rootId = String(
      content?.querySelector<HTMLElement>('.protyle-background[data-node-id]')?.getAttribute('data-node-id')
      || '',
    ).trim();
    if (rootId) {
      return rootId;
    }
    return fallbackBlockId ? String(fallbackBlockId).trim() || undefined : undefined;
  }

  private buildCurrentBlockTopicBatchAction(blockElement: HTMLElement): SiyuanMenuItem | null {
    const selection = resolveProgressiveExcerptSnapshotFromBlocks([blockElement]);
    if (!selection) {
      return null;
    }

    const preparation = this.deps.applicationContext.getSelectionTopicContinuationService().prepareCurrentBlockMarks({
      sourceBlockId: selection.sourceBlockId,
      contentDom: selection.contentDom,
      rootId: this.resolveBlockMenuRootId(blockElement, selection.sourceBlockId),
    });
    if (!preparation.available) {
      return null;
    }

    return {
      icon: 'iconAdd',
      label: this.text('progressiveExcerptBatchMenuLabel', '从当前块高亮补齐 Item'),
      click: async () => {
        await this.runCurrentBlockTopicBatchAction(blockElement, preparation);
      },
    };
  }

  private async runCurrentBlockTopicBatchAction(
    blockElement: HTMLElement,
    preparation?: CurrentBlockTopicContinuationPreparation,
  ): Promise<void> {
    const selection = resolveProgressiveExcerptSnapshotFromBlocks([blockElement]);
    if (!selection) {
      await this.siyuanApi.pushErrMsg(this.text('progressiveExcerptBatchUnavailable', '当前块没有可补齐的高亮 Item'));
      return;
    }

    const service = this.deps.applicationContext.getSelectionTopicContinuationService();
    const resolvedRootId = this.resolveBlockMenuRootId(blockElement, selection.sourceBlockId);
    const prepared = preparation || service.prepareCurrentBlockMarks({
      sourceBlockId: selection.sourceBlockId,
      contentDom: selection.contentDom,
      rootId: resolvedRootId,
    });
    if (!prepared.available) {
      await this.siyuanApi.pushErrMsg(this.text('progressiveExcerptBatchUnavailable', '当前块没有可补齐的高亮 Item'));
      return;
    }

    try {
      const result = await service.createFromCurrentBlockMarks({
        sourceBlockId: selection.sourceBlockId,
        contentDom: selection.contentDom,
        rootId: resolvedRootId,
      }, prepared);
      await this.siyuanApi.pushMsg(this.formatCurrentBlockTopicBatchMessage(result));
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to backfill topic items from current block marks:', error);
      await this.siyuanApi.pushErrMsg(
        this.text('progressiveExcerptBatchFailed', '从当前块高亮补齐 Item 失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
      );
    }
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

    const scope = this.collectReviewScopeFromBlockIcon(blockElements);
    const primaryBlockElement = ((blockElements[0]?.closest('[data-node-id]') as HTMLElement) || blockElements[0]);
    const singleDocBlockId = blockIds.length === 1 && primaryBlockElement && this.isDocumentBlockElement(primaryBlockElement, blockIds[0])
      ? blockIds[0]
      : null;
    const currentBlockTopicBatchAction = blockIds.length === 1 && primaryBlockElement && !singleDocBlockId
      ? this.buildCurrentBlockTopicBatchAction(primaryBlockElement)
      : null;
    const docScopedMenuItems = singleDocBlockId
      ? (scope ? this.buildDocReviewMenuItems(singleDocBlockId, scope) : this.buildDocLoadingMenuItems(singleDocBlockId))
      : null;
    const reviewActions = scope
      ? this.buildReviewActions(scope.cards, { scopeDocIds: scope.scopeDocIds })
      : this.buildReviewLoadingActions();
    const submenu: SiyuanMenuItem[] = [
      ...(docScopedMenuItems ?? reviewActions),
      this.separator(),
      {
        icon: 'iconEdit',
        label: this.deps.i18n?.editSrsData || '编辑SRS数据',
        click: async () => {
          await this.runEditSrsDataAction(blockElements);
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
        label: this.deps.i18n?.createListTemplateCard || '创建列表卡',
        click: async () => {
          await this.createListCardsByMarker(blockIds);
        },
      },
      {
        icon: 'iconQuote',
        label: this.text('progressiveExcerptMenuLabel', '摘录'),
        click: async () => {
          await this.runProgressiveExcerptAction(blockElements);
        },
      },
      ...(currentBlockTopicBatchAction
        ? [currentBlockTopicBatchAction]
        : []),
      this.separator(),
    ];

    if (blockIds.length === 1) {
      submenu.push(
        {
          icon: 'iconRefresh',
          label: this.deps.i18n?.rebindDescriptorConcept || '🔄 重新绑定概念',
          click: async () => {
            await this.runRebindDescriptorConceptAction(blockElements);
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
        const visitedCardIds = new Set<string>();
        const subtreeBlockIds = await this.resolveSubtreeBlockIds(blockIds);
        const cards = subtreeBlockIds
          .flatMap((blockId) => this.getStorage().getCardsByBlockId(blockId))
          .filter((card) => {
            if (!card?.id || visitedCardIds.has(card.id)) {
              return false;
            }
            visitedCardIds.add(card.id);
            return true;
          });

        if (cards.length === 0) {
          logger.warn('[BlockMenuHandler] No cards found in selected subtree blocks', {
            selectedBlockIds: blockIds,
            subtreeBlockCount: subtreeBlockIds.length,
          });
          await this.siyuanApi.pushMsg('未找到可取消的闪卡');
          return;
        }

        const cardIds = cards.map((card) => card.id);
        const batchResult = await cardService.deleteCards({ cardIds });
        if (isErr(batchResult)) {
          logger.error('[BlockMenuHandler] Failed to batch delete cards from selected subtree:', batchResult.error);

          for (const cardId of cardIds) {
            const result = await cardService.deleteCard({ cardId });
            if (!isErr(result)) {
              deletedCount++;
              continue;
            }

            failedCount++;
            logger.error(`[BlockMenuHandler] Failed to delete card ${cardId}:`, result.error);
          }
        } else {
          deletedCount += batchResult.value.deletedCount;
          failedCount += batchResult.value.failedCardIds.length;
        }

        if (deletedCount > 0) {
          await this.siyuanApi.pushMsg(
            failedCount > 0
              ? `已取消 ${deletedCount} 张闪卡，${failedCount} 张失败`
              : `已取消 ${deletedCount} 张闪卡`,
          );
          return;
        }

        if (failedCount > 0) {
          await this.siyuanApi.pushErrMsg(`取消闪卡失败：${failedCount} 张`);
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
    const scope = this.collectDocReviewScope(docId);
    if (!scope) {
      return this.buildDocLoadingMenuItems(docId);
    }
    return this.buildDocReviewMenuItems(docId, scope);
  }

  private formatCurrentBlockTopicBatchMessage(result: {
    created: number;
    skipped: number;
  }): string {
    if (result.created > 0 && result.skipped > 0) {
      return this.text('progressiveExcerptBatchCreatedSkipped', '已从当前块高亮补齐 {created} 个 Item，跳过 {skipped} 个重复项')
        .replace('{created}', String(result.created))
        .replace('{skipped}', String(result.skipped));
    }
    if (result.created > 0) {
      return this.text('progressiveExcerptBatchCreated', '已从当前块高亮补齐 {created} 个 Item')
        .replace('{created}', String(result.created));
    }
    if (result.skipped > 0) {
      return this.text('progressiveExcerptBatchSkipped', '当前块高亮已对应现有 Item，已跳过 {skipped} 个重复项')
        .replace('{skipped}', String(result.skipped));
    }
    return this.text('progressiveExcerptBatchUnavailable', '当前块没有可补齐的高亮 Item');
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
      const submenu = this.generateReviewMenuForDocSync(docId);
      this.addSiyuanMemoMenu(menu, submenu);
    } catch (err) {
      logger.error('[SiYuanMemo] Failed to generate doctree menu:', err);
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
      const submenu = this.generateReviewMenuForDocSync(docId);
      this.addSiyuanMemoMenu(menu, submenu);
    } catch (err) {
      logger.error('[SiYuanMemo] Failed to generate doc menu:', err);
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
      const submenu = this.generateReviewMenuForDocSync(docId);
      this.addSiyuanMemoMenu(menu, submenu);
    } catch (err) {
      logger.error('[SiYuanMemo] Failed to generate breadcrumb menu:', err);
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
      logger.error('[SiYuanMemo] Failed to generate blockref menu:', err);
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

    for (const blockID of uniqueIds) {
      const cards = this.getStorage().getCardsByBlockId(blockID);
      for (const card of cards) {
        const cardID = card.id;
        if (!cardID || seen.has(cardID)) {
          continue;
        }
        if (card.type === CardType.Topic) {
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
    }
    
    return result;
  }

  private resolveListMarkerFromTail(
    parentParagraphKramdown: string,
    parentParagraphText: string,
    fallbackParentKramdown: string
  ): 'concept' | 'descriptor' | null {
    return resolveCdfTailMarkerFromSources([
      parentParagraphKramdown,
      parentParagraphText,
      fallbackParentKramdown,
    ]);
  }

  private async resolveListItemAnchorBlockId(selectedBlockId: string): Promise<string | null> {
    return resolveListItemAnchorBlockIdHelper(selectedBlockId, this.hostBlockQuery);
  }

  private async getParentParagraphSources(parentBlockId: string): Promise<{
    paragraphKramdown: string;
    paragraphText: string;
    parentKramdown: string;
  }> {
    const paragraphRow = await this.hostBlockQuery.getFirstParagraphUnderParent(parentBlockId);
    const paragraphId = paragraphRow?.id;
    if (!paragraphId) {
      const parent = await this.siyuanApi.getBlockKramdown(parentBlockId);
      return {
        paragraphKramdown: '',
        paragraphText: '',
        parentKramdown: parent.kramdown || '',
      };
    }
    const paragraphText = paragraphRow.content;
    const [paragraphKramdown, parent] = await Promise.all([
      this.siyuanApi.getBlockKramdown(paragraphId),
      this.siyuanApi.getBlockKramdown(parentBlockId),
    ]);
    return {
      paragraphKramdown: paragraphKramdown.kramdown || '',
      paragraphText,
      parentKramdown: parent.kramdown || '',
    };
  }

  private async createListCardsByMarker(blockIds: string[]): Promise<void> {
    if (!blockIds || blockIds.length === 0) {
      await this.siyuanApi.pushErrMsg('未选中任何块');
      return;
    }

    const parentBlockId = await this.resolveListItemAnchorBlockId(blockIds[0]);
    if (!parentBlockId) {
      await this.siyuanApi.pushErrMsg('仅支持列表项块或其直属段落块');
      return;
    }

    const parentSources = await this.getParentParagraphSources(parentBlockId);
    const marker = this.resolveListMarkerFromTail(
      parentSources.paragraphKramdown,
      parentSources.paragraphText,
      parentSources.parentKramdown
    );

    if (marker === 'concept') {
      await this.deps.dialogManager.createCdfMultilineTemplateCards(
        [parentBlockId],
        'builtin-list-concept-multiline',
        { skipSymbolConfirmation: true }
      );
      return;
    }

    if (marker === 'descriptor') {
      await this.deps.dialogManager.createCdfMultilineTemplateCards(
        [parentBlockId],
        'builtin-list-descriptor-multiline',
        { skipSymbolConfirmation: true }
      );
      return;
    }

    await this.createListTemplateCards([parentBlockId]);
  }

  /**
   * 创建列表模版卡（默认流）
   *
   * @description
   * - 有序子级（>=2）：逐条创建（split-v2）
   * - 无序子级（>=2）：汇总创建（summary-v1）
   * - 混合：双轨并存
   *
   * @param blockIds 选中的块 ID 列表
   */
  private async createListTemplateCards(blockIds: string[]): Promise<void> {
    try {
      if (!blockIds || blockIds.length === 0) {
        await this.siyuanApi.pushErrMsg('未选中任何块');
        return;
      }

      // 只处理第一个块（支持从直属段落块自动归一到父列表项）
      const parentBlockId = await this.resolveListItemAnchorBlockId(blockIds[0]);
      if (!parentBlockId) {
        await this.siyuanApi.pushErrMsg('仅支持列表项块或其直属段落块');
        return;
      }
      logger.info(`[SiYuanMemo] 🎯 Creating list template cards for: ${parentBlockId}`);

      // 1. 检查块类型
      const blockInfo = await this.hostBlockQuery.getBlockTypeAndContent(parentBlockId);

      if (!blockInfo) {
        await this.siyuanApi.pushErrMsg('块不存在');
        return;
      }

      const blockType = blockInfo.type;

      if (blockType !== 'i') {
        await this.siyuanApi.pushErrMsg(`只能对列表项块使用此功能（当前类型：${blockType}）`);
        return;
      }

      const resolved = await resolveListChildrenBySubtype(parentBlockId, this.siyuanApi);
      const orderedChildren = resolved.orderedChildren;
      const unorderedChildren = resolved.unorderedChildren;

      if (orderedChildren.length < 2 && unorderedChildren.length < 2) {
        await this.siyuanApi.pushErrMsg('至少需要2个同类型子列表项（有序或无序）');
        return;
      }

      const xiuyuanAppService = await this.deps.applicationContext.getXiuyuanApplicationService();

      let orderedCreated = 0;
      let unorderedCreated = 0;
      let skippedCount = 0;

      if (orderedChildren.length >= 2) {
        const orderedResult = await xiuyuanAppService.createListTemplateCards({
          parentBlockId,
          childBlockIds: orderedChildren.map((row) => row.id),
          templateId: 'builtin-list-item',
          creationMode: 'split-v2',
          listKind: 'default',
        });

        if (isErr(orderedResult)) {
          await this.siyuanApi.pushErrMsg(`创建失败：${orderedResult.error.message}`);
          return;
        }

        orderedCreated = orderedResult.value.created.length;
        skippedCount += orderedResult.value.skippedChildBlockIds.length;
      }

      if (unorderedChildren.length >= 2) {
        const unorderedResult = await xiuyuanAppService.createListTemplateCards({
          parentBlockId,
          childBlockIds: unorderedChildren.map((row) => row.id),
          templateId: 'builtin-list-item',
          creationMode: 'summary-v1',
          listKind: 'default',
        });

        if (isErr(unorderedResult)) {
          await this.siyuanApi.pushErrMsg(`创建失败：${unorderedResult.error.message}`);
          return;
        }

        unorderedCreated = unorderedResult.value.created.length;
        skippedCount += unorderedResult.value.skippedChildBlockIds.length;
      }

      await this.siyuanApi.pushMsg(
        `✅ 列表卡创建完成：有序创建：${orderedCreated} / 无序汇总：${unorderedCreated} / 跳过：${skippedCount}`
      );
      logger.info('[SiYuanMemo] List template cards creation complete:', {
        parentBlockId,
        orderedChildren: orderedChildren.length,
        unorderedChildren: unorderedChildren.length,
        orderedCreated,
        unorderedCreated,
        skippedCount,
      });
    } catch (err) {
      logger.error('[SiYuanMemo] Failed to create list template cards:', err);
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
      const service = this.getNeuralRoamEntryActionService();
      const result = priority === 'high'
        ? await service.makeConceptAndStartRoam(blockId)
        : await service.makeConceptAndAddToQueue(blockId, { priority: 'normal' });

      if (!result.ok) {
        logger.error('[BlockMenuHandler] Failed to make concept and add to roam:', result);
        await this.siyuanApi.pushErrMsg(`❌ 操作失败：${result.message}`);
        return;
      }

      if (priority === 'high') {
        await this.siyuanApi.pushMsg('🚀 已加入神经漫游当前航线（高优先级），正在打开神经漫游...');
      } else {
        await this.siyuanApi.pushMsg('📍 已加入神经漫游当前航线');
      }

      logger.info(`[BlockMenuHandler] Added concept card to neural roam: ${blockId} (priority: ${priority})`);
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to make concept and add to roam:', error);
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
      const card = this.getStorage().getCardByBlockId(blockId);
      if (!card) {
        return false;
      }
      const metaMarker = (card.meta as { cardTypeMarker?: string } | undefined)?.cardTypeMarker;
      return card.type === CardType.Concept || card.cardTypeMarker === 'concept' || metaMarker === 'concept';
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to check if concept card:', error);
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
      const card = this.getStorage().getCardByBlockId(blockId);
      if (!card) {
        return false;
      }
      const metaMarker = (card.meta as { cardTypeMarker?: string } | undefined)?.cardTypeMarker;
      return card.type === CardType.Descriptor || card.cardTypeMarker === 'descriptor' || metaMarker === 'descriptor';
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to check if descriptor card:', error);
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
      logger.info('[BlockMenuHandler] Rebinding descriptor concept for block:', blockId);
      
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
      
      if (!isErr(result)) {
        const { newConceptName, createdConceptCard } = result.value;
        
        if (createdConceptCard) {
          await this.siyuanApi.pushMsg(`✅ 已重新绑定到概念：${newConceptName}（已自动创建概念卡）`);
        } else {
          await this.siyuanApi.pushMsg(`✅ 已重新绑定到概念：${newConceptName}`);
        }
        
        logger.info('[BlockMenuHandler] Rebind descriptor concept success:', result.value);
      } else {
        await this.siyuanApi.pushErrMsg(`❌ 重新绑定失败：${result.error.message}`);
        logger.error('[BlockMenuHandler] Rebind descriptor concept failed:', result.error);
      }
    } catch (error) {
      logger.error('[BlockMenuHandler] Failed to rebind descriptor concept:', error);
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
