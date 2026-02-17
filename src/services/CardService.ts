import type FSRSPlugin from '../index';
import { pushMsg, pushErrMsg, sql } from '@/core/siyuan/api';
import { createVueDialog } from '@/utils/dialog';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { riff } from '@/core/siyuan';
import { ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { createDefaultCard } from '@/types';
import { markBlockAsCard, unmarkBlockAsCard } from '@/core/siyuan/block';

/**
 * 卡片服务类
 * 负责处理所有与卡片相关的操作
 */
export class CardService {
  constructor(private plugin: FSRSPlugin) {}

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const blockElements: HTMLElement[] = detail?.blockElements || [];

    if (!menu || blockElements.length === 0) {
      return;
    }

    const blockIds = blockElements
      .map(el => el.getAttribute('data-node-id'))
      .filter((id): id is string => Boolean(id));

    if (blockIds.length === 0) {
      return;
    }

    const hasUncarded = blockElements.some(el => !el.hasAttribute(ATTR_CARD_ID));
    const hasCarded = blockElements.some(el => el.hasAttribute(ATTR_CARD_ID));
    const drillBlocks = this.getDrillBlockElements(blockElements);
    const drillCount = drillBlocks.length;
    const drillLabel = `<span title="${this.plugin.i18n?.drillHint || 'Add flashcards in current block and sub-blocks to drill queue'}">${this.plugin.i18n?.blockModeLabel || 'Block Practice'}</span> <span class="ft__secondary">(${drillCount})</span>`;

    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        if (drillCount === 0) {
          await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
          return;
        }
        try {
          const cards = this.buildDrillCardsFromElements(drillBlocks);
          if (cards.length === 0) {
            await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.plugin.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.plugin.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[SiyuanMemo] Failed to open drill from blocks:', err);
          await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
        }
      },
    });

    // 编辑 SRS 数据 - 支持新卡（有 ATTR_CARD_ID）和老 riff 卡（只在 riff 数据库中）
    menu.addItem({
      icon: 'iconEdit',
      label: this.plugin.i18n?.editSrsData || '编辑SRS数据',
      click: async () => {
        // 优先查找有 ATTR_CARD_ID 的新卡
        let target = blockElements.find(el => el.hasAttribute(ATTR_CARD_ID));
        let blockID = target?.getAttribute('data-node-id');
        let cardID = target?.getAttribute(ATTR_CARD_ID);

        // ✅ 新架构：从本地存储查询卡片
        if (!cardID && blockIds.length > 0) {
          try {
            console.log('[SiyuanMemo] Querying local storage for blockIds:', blockIds);
            // 尝试从本地存储获取卡片
            for (const bid of blockIds) {
              const card = this.plugin.storage.getCardByBlockId(bid);
              if (card) {
                blockID = card.blockId;
                cardID = card.id;
                console.log('[SiyuanMemo] Found card in local storage:', blockID, cardID);
                break;
              }
            }
          } catch (err) {
            console.warn('[SiyuanMemo] Failed to query local storage:', err);
          }
        }

        if (!blockID || !cardID) {
          pushErrMsg(this.plugin.i18n?.msg_no_flashcard || '未找到闪卡，请先将块制为闪卡');
          return;
        }
        createVueDialog({
          title: this.plugin.i18n?.editSrsData || '编辑SRS数据',
          component: SrsEditorDialog,
          props: {
            card: {
              id: cardID,
              blockId: blockID,
              deckId: riff.BUILTIN_DECK_ID,
            },
            deckId: riff.BUILTIN_DECK_ID,
            plugin: this.plugin,  // ✅ 传递 plugin 实例
            i18n: this.plugin.i18n || {},
          },
          width: '860px',
          height: '80vh',
        });
      },
    });

    if (hasUncarded) {
      menu.addItem({
        icon: 'iconAdd',
        label: this.plugin.i18n?.makeCardFromSelection || '选中制卡',
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
              await markBlockAsCard(blockId, card.id, card.priority, 'item');
              this.plugin.storage.setCard(card);
              createdCount++;
            } catch (err) {
              console.error('[SiyuanMemo] Failed to create card from block:', blockId, err);
            }
          }

          if (createdCount > 0) {
            await this.plugin.storage.saveCards();
            await pushMsg((this.plugin.i18n?.msg_created || '已创建 {n} 张闪卡').replace('{n}', String(createdCount)));
          } else {
            await pushMsg(this.plugin.i18n?.msg_already_cards || '选中的块已经是闪卡');
          }
        },
      });
    }

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
              this.plugin.storage.removeCard(cardId);
              removedCount++;
            } catch (err) {
              console.error('[SiyuanMemo] Failed to remove card from block:', blockId, err);
            }
          }

          if (removedCount > 0) {
            await this.plugin.storage.saveCards();
            await pushMsg((this.plugin.i18n?.msg_unmarked || '已取消 {n} 张闪卡').replace('{n}', String(removedCount)));
          } else {
            await pushMsg(this.plugin.i18n?.msg_no_removable || '未找到可取消的闪卡');
          }
        },
      });
    }

    if (!hasUncarded && !hasCarded) {
      pushErrMsg(this.plugin.i18n?.msg_no_operable_blocks || '未找到可操作的块');
    }
  }

  getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
    const seen = new Set<string>();
    const result: HTMLElement[] = [];
    const roots = blockElements.map(el => (el.closest('[data-node-id]') as HTMLElement) || el);
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

  buildDrillCardsFromElements(elements: HTMLElement[]) {
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
        priority: 50, // DEFAULT_PRIORITY
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
        state: 0,
        lapses: 0,
        reps: 0,
      });
    }
    return result;
  }

  async getDrillCardsFromDocTree(docId: string) {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  async handleEditorTitleIconClick(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const docInfo = detail?.data;
    const docId = docInfo?.rootID || docInfo?.id;
    if (!menu || !docId) {
      return;
    }
    const drillLabel = this.plugin.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.plugin.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.plugin.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[SiyuanMemo] Failed to open drill from doc menu:', err);
          await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  async handleBreadcrumbMore(e: any) {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const protyle = detail?.protyle;
    const docId = protyle?.block?.rootID || protyle?.block?.id;
    if (!menu || !docId) {
      return;
    }
    const drillLabel = this.plugin.i18n?.blockModeLabel || '块练习';
    menu.addItem({
      icon: 'iconRiffCard',
      label: drillLabel,
      click: async () => {
        try {
          const cards = await this.getDrillCardsFromDocTree(docId);
          if (cards.length === 0) {
            await pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          // await pushMsg((this.plugin.i18n?.drillAdded || '已加入 {n} 张闪卡').replace('{n}', String(cards.length)));
          this.plugin.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[SiyuanMemo] Failed to open drill from breadcrumb menu:', err);
          await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  async buildDrillCardsFromBlockIds(blockIds: string[]) {
    const uniqueIds = Array.from(new Set(blockIds));
    if (uniqueIds.length === 0) {
      return [];
    }
    const result: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200);
      const idsStr = batch.map(id => `'${id}'`).join(',');
      const rows = await sql(`SELECT block_id, value FROM attributes WHERE name = '${ATTR_CARD_ID}' AND block_id IN (${idsStr}) AND value != ''`);
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
          priority: 50, // DEFAULT_PRIORITY
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