/**
 * BlockMenuHandler - 处理块菜单相关的事件和操作
 * 从 index.ts 拆分出来的服务
 */

import type { App } from 'siyuan';
import type { StorageManager } from '@/core/storage';
import { riff } from '@/core/siyuan';
import { markBlockAsCard, unmarkBlockAsCard, ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { pushErrMsg, pushMsg, sql } from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import { createDefaultCard } from '@/types';
import { DEFAULT_PRIORITY } from '@/core/queue';

import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { ReviewDialogManager } from './ReviewDialogManager';
import type { XiuyuanService } from '@/core/xiuyuan';

export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  storage: StorageManager;
  reviewDialogManager: ReviewDialogManager;
  xiuyuanService: XiuyuanService;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: { seedBlockId?: string; includeSeedAsFirst?: boolean; resetHistory?: boolean }) => Promise<void>;
}

export class BlockMenuHandler {
  constructor(private deps: BlockMenuHandlerDeps) {}

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

    const hasUncarded = blockElements.some((el) => !el.hasAttribute(ATTR_CARD_ID));
    const hasCarded = blockElements.some((el) => el.hasAttribute(ATTR_CARD_ID));
    const drillBlocks = this.getDrillBlockElements(blockElements);
    const drillCount = drillBlocks.length;
    const drillLabel = `<span title="${this.deps.i18n?.drillHint || '将当前块及子块中的闪卡加入机械练习队列'}">${this.deps.i18n?.blockModeLabel || '块练习'}</span> <span class="ft__secondary">(${drillCount})</span>`;

    // 块练习菜单项
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        if (drillCount === 0) {
          await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        try {
          const cards = this.buildDrillCardsFromElements(drillBlocks);
          if (cards.length === 0) {
            await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          this.deps.reviewDialogManager.openDrillWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from blocks:', err);
          await pushErrMsg(this.deps.i18n?.drillFailed || '机械练习启动失败');
        }
      },
    });

    // 神经复习菜单项
    menu.addItem({
      icon: 'iconRefresh',
      label: this.deps.i18n?.startNeuralReviewFromHere || '从此处开始神经复习',
      click: async () => {
        const seedBlockId = blockIds[0];
        const includeSeedAsFirst = Boolean(blockElements[0]?.hasAttribute?.(ATTR_CARD_ID));
        try {
          await this.deps.openNeuralReviewDialog({ seedBlockId, includeSeedAsFirst, resetHistory: true });
        } catch (err) {
          console.error('[FSRS] Failed to open neural review from block:', err);
          await pushErrMsg(this.deps.i18n?.neuralReviewFailed || '神经复习启动失败');
        }
      },
    });

    // 编辑 SRS 数据菜单项
    menu.addItem({
      icon: 'iconEdit',
      label: this.deps.i18n?.editSrsData || '编辑SRS数据',
      click: async () => {
        let target = blockElements.find((el) => el.hasAttribute(ATTR_CARD_ID));
        let blockID = target?.getAttribute('data-node-id');
        let cardID = target?.getAttribute(ATTR_CARD_ID);

        // 如果没找到，尝试从 riff API 查询老卡
        if (!cardID && blockIds.length > 0) {
          try {
            console.log('[FSRS] Querying riff cards for blockIds:', blockIds);
            const riffBlocks = await getRiffCardsByBlockIDs(blockIds);
            console.log('[FSRS] Riff API response:', riffBlocks);

            if (riffBlocks.length > 0) {
              const riffBlock = riffBlocks[0];
              blockID = riffBlock.id || blockIds[0];
              cardID =
                riffBlock.riffCard?.id ||
                riffBlock.ial?.['custom-riff-decks']?.split(',')[0] ||
                blockID;
              console.log('[FSRS] Resolved blockID:', blockID, 'cardID:', cardID);
            }
          } catch (err) {
            console.warn('[FSRS] Failed to query riff cards:', err);
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
              cardID,
              blockID,
              deckID: riff.BUILTIN_DECK_ID,
            },
            deckID: riff.BUILTIN_DECK_ID,
            i18n: this.deps.i18n || {},
          },
          width: '760px',
          height: '70vh',
        });
      },
    });

    // 制卡菜单项
    if (hasUncarded) {
      menu.addItem({
        icon: 'iconAdd',
        label: this.deps.i18n?.makeCardFromSelection || '选中制卡',
        click: async () => {
          let createdCount = 0;

          for (const element of blockElements) {
            if (element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            if (!blockId) {
              continue;
            }
            try {
              const card = createDefaultCard(blockId);
              await markBlockAsCard(blockId, card.id, card.priority);
              this.deps.storage.setCard(card);
              createdCount++;
            } catch (err) {
              console.error('[FSRS] Failed to create card from block:', blockId, err);
            }
          }

          if (createdCount > 0) {
            await this.deps.storage.saveCards();
            await pushMsg((this.deps.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
          } else {
            await pushMsg(this.deps.i18n?.msg_already_cards || '选中的块已经是闪卡');
          }
        },
      });

      // 创建模板卡片（Xiuyuan）
      menu.addItem({
        icon: 'iconAdd',
        label: this.deps.i18n?.createTemplateCard || '创建模板卡片',
        click: async () => {
          await this.deps.openCreateTemplateCardDialog(blockIds);
        },
      });
    }

    // 取消闪卡菜单项
    if (hasCarded) {
      menu.addItem({
        icon: 'iconTrashcan',
        label: '取消闪卡',
        click: async () => {
          let removedCount = 0;

          for (const element of blockElements) {
            if (!element.hasAttribute(ATTR_CARD_ID)) {
              continue;
            }
            const blockId = element.getAttribute('data-node-id');
            const cardId = element.getAttribute(ATTR_CARD_ID);
            if (!blockId || !cardId) {
              continue;
            }
            try {
              await unmarkBlockAsCard(blockId);
              this.deps.storage.removeCard(cardId);
              removedCount++;
            } catch (err) {
              console.error('[FSRS] Failed to remove card from block:', blockId, err);
            }
          }

          if (removedCount > 0) {
            await this.deps.storage.saveCards();
            await pushMsg((this.deps.i18n?.msg_unmarked || '已取消 {n} 张闪卡').replace('{n}', String(removedCount)));
          } else {
            await pushMsg(this.deps.i18n?.msg_no_removable || '未找到可取消的闪卡');
          }
        },
      });
    }

    if (!hasUncarded && !hasCarded) {
      pushErrMsg(this.deps.i18n?.msg_no_operable_blocks || '未找到可操作的块');
    }
  }

  /**
   * 处理编辑器标题图标点击
   */
  async handleEditorTitleIconClick(e: any): Promise<void> {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const docInfo = detail?.data;
    const docId = docInfo?.rootID || docInfo?.id;

    if (!menu || !docId) {
      return;
    }

    const drillLabel = this.deps.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          this.deps.reviewDialogManager.openDrillWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from doc menu:', err);
          await pushErrMsg(this.deps.i18n?.drillFailed || '机械练习启动失败');
        }
      },
    });
  }

  /**
   * 处理面包屑更多菜单
   */
  async handleBreadcrumbMore(e: any): Promise<void> {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const protyle = detail?.protyle;
    const docId = protyle?.block?.rootID || protyle?.block?.id;

    if (!menu || !docId) {
      return;
    }

    const drillLabel = this.deps.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          this.deps.reviewDialogManager.openDrillWithCards(cards, 'block');
        } catch (err) {
          console.error('[FSRS] Failed to open drill from breadcrumb menu:', err);
          await pushErrMsg(this.deps.i18n?.drillFailed || '机械练习启动失败');
        }
      },
    });
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
        const id = node.getAttribute('data-node-id');
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        if (node.hasAttribute(ATTR_CARD_ID)) {
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
      const cardID = el.getAttribute(ATTR_CARD_ID);
      if (!blockID || !cardID || seen.has(cardID)) {
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

    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map((id) => `'${id}'`).join(',');
      const rows = await sql(
        `SELECT block_id, value FROM attributes WHERE name = '${ATTR_CARD_ID}' AND block_id IN (${idsStr}) AND value != ''`
      );

      for (const row of rows) {
        const blockID = row.block_id || row.blockID;
        const cardID = row.value || row.card_id || row.cardID;
        if (!blockID || !cardID || seen.has(cardID)) {
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
}
