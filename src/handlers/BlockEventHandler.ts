import FSRSPlugin from '../index';
import { pushMsg, pushErrMsg, sql } from '@/core/siyuan/api';
import { ATTR_CARD_ID, getCardBlockIds } from '@/core/siyuan/block';
import { getRiffCardsByBlockIDs } from '@/core/siyuan/riff';
import { riff } from '@/core/siyuan';
import { DEFAULT_PRIORITY } from '@/core/queue';
import { SubsetPracticeStrategy } from '@/core/queue/strategies';
import { SubsetPracticeAdapter } from '@/ui/review/v2';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import { createVueDialog } from '@/utils/dialog';
import { createDefaultCard } from '@/types';
import { markBlockAsCard, unmarkBlockAsCard } from '@/core/siyuan/block';

export class BlockEventHandler {
  constructor(private plugin: FSRSPlugin) {}

  /**
   * 处理块图标点击（添加闪卡菜单）
   */
  handleBlockIconClick(e: any) {
    this.plugin.pluginService.handleBlockIconClick(e);
  }

  private async handleEditorTitleIconClick(e: any) {
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
          this.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[SiYuanMemo] Failed to open drill from doc menu:', err);
          await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  private async handleBreadcrumbMore(e: any) {
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
          this.openDrillDialogWithCards(cards, 'block');
        } catch (err) {
          console.error('[SiYuanMemo] Failed to open drill from breadcrumb menu:', err);
          await pushErrMsg(this.plugin.i18n?.drillFailed || '机械练习启动失败');
        }
      }
    });
  }

  private getDrillBlockElements(blockElements: HTMLElement[]): HTMLElement[] {
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

  private buildDrillCardsFromElements(elements: HTMLElement[]) {
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

  private async getDrillCardsFromDocTree(docId: string) {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }

  private async buildDrillCardsFromBlockIds(blockIds: string[]) {
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

  private openDrillDialogWithCards(cards: any[], practiceMode: 'queue' | 'block' = 'queue') {
    if (this.plugin.reviewDialog) {
      this.plugin.reviewDialog.destroy();
    }
    const ids = Array.from(new Set((cards || []).map((c) => String(c?.blockID || c?.blockId || '')).filter(Boolean)));
    if (ids.length === 0) {
      void pushMsg(this.plugin.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
      return;
    }
    const modeLabel = practiceMode === 'block'
      ? (this.plugin.i18n?.blockModeLabel || '块练习')
      : (this.plugin.i18n?.queueModeLabel || '队列练习');
    const blockTitleTemplate = this.plugin.i18n?.blockPracticeTitleWithCount || '当前练习队列：{n}张闪卡';
    const blockTitle = blockTitleTemplate.replace('{n}', String(cards.length));
    const title = practiceMode === 'block'
      ? blockTitle
      : (cards.length > 0 ? `${modeLabel} (${cards.length} 张)` : modeLabel);

    const session = new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID });
    const adapter = new SubsetPracticeAdapter({ i18n: this.plugin.i18n || {}, label: title, queueName: practiceMode });
    this.plugin.reviewDialog = createVueDialog({
      hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的 .block__icons 头部
      component: ReviewView,
      dataKey: 'dialog-opencard', // 让思源热键系统能够识别
      props: {
        app: this.plugin.app,
        i18n: this.plugin.i18n || {},
        title,  // 传递给 Vue 组件显示
        queue: session as any,
        adapter: adapter as any,
      },
      events: {
        close: () => {
          this.plugin.reviewDialog?.destroy();
        },
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.plugin.reviewDialog = null;
      },
    });

    const dialogEl = this.plugin.reviewDialog.dialog.element;
    const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
    const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

    if (scrim) {
      scrim.style.backgroundColor = 'var(--b3-theme-surface)';
    }
    if (container) {
      container.style.maxWidth = '1024px';
    }

    setTimeout(() => {
      const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
      if (focusEl) {
        focusEl.focus();
      }
    }, 100);
  }
}