import { type Ref } from 'vue';
import { migrateExistingCards } from '@/scripts/migrateToTopicItem';
import { invalidateCardCache } from '../browserService';
import type { BrowserCard } from '../types';
import { CardType, type FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import {
  applyCardTypeTransition,
  type EditableCardType,
} from '@/application/services/card-editor/applyCardTypeTransition';
import {
  applyRenderTargetTransition,
  getRenderTargetLabel,
  getRenderTargetOptions,
  type EditableRenderTarget,
} from '@/application/services/card-editor/applyRenderTargetTransition';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';

const logger = createLogger('useCardActions');

export interface UseCardActionsOptions {
  loading: Ref<boolean>;
  loadData: () => Promise<void>;
  refreshData: (forceRefresh?: boolean, preserveFocusState?: boolean) => Promise<void>;
  t: (key: string, fallback: string) => string;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  storage?: CardTypeMarkerStoragePort | null;
  manager?: IUnifiedDataSourceManagerFacade | null;
}

type BrowserMenuItem = {
  icon?: string;
  label?: string;
  click?: () => void;
  type?: 'separator';
  submenu?: BrowserMenuItem[];
};

type LocalCardMutation = (card: FSRSCard) => {
  card: FSRSCard;
  changed: boolean;
};

type CardUpdateSummary = {
  updated: number;
  skipped: number;
  missing: number;
  unchanged: number;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

function collectCardIds(cards: BrowserCard[]): { cardIds: string[]; skipped: number } {
  const cardIds: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const card of cards) {
    const preferredId = typeof card.fsrsCardId === 'string' ? card.fsrsCardId.trim() : '';
    const fallbackId = typeof card.id === 'string' ? card.id.trim() : '';
    const cardId = preferredId || fallbackId;

    if (!cardId) {
      skipped++;
      logger.warn('Card missing storage id, skipping', { id: card.id, blockId: card.blockId });
      continue;
    }

    if (seen.has(cardId)) {
      continue;
    }

    seen.add(cardId);
    cardIds.push(cardId);
  }

  return { cardIds, skipped };
}

function buildLocalCardUpdateDetail(summary: CardUpdateSummary): string {
  const detailParts: string[] = [];
  if (summary.skipped > 0) detailParts.push(`缺少 ID ${summary.skipped} 张`);
  if (summary.missing > 0) detailParts.push(`存储缺失 ${summary.missing} 张`);
  if (summary.unchanged > 0) detailParts.push(`已是目标状态 ${summary.unchanged} 张`);
  return detailParts.length > 0 ? `（${detailParts.join('，')}）` : '';
}

export function useCardActions(options: UseCardActionsOptions) {
  const { loading, loadData, refreshData, t, pushMsg, pushErrMsg, storage, manager } = options;

  async function updateLocalCards(
    cards: BrowserCard[],
    mutation: LocalCardMutation,
  ): Promise<CardUpdateSummary | null> {
    const { cardIds, skipped } = collectCardIds(cards);
    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return null;
    }

    if (manager) {
      let updated = 0;
      let missing = 0;
      let unchanged = 0;

      for (const cardId of cardIds) {
        try {
          const fsrsCard = await manager.getCard(cardId);
          const result = mutation(fsrsCard);
          if (!result.changed) {
            unchanged++;
            continue;
          }

          await manager.updateCard(result.card);
          updated++;
        } catch (error) {
          missing++;
          logger.warn(`Card not found in unified manager, skipping update: ${cardId}`, error);
        }
      }

      if (updated > 0) {
        invalidateCardCache();
        await loadData();
      }

      return { updated, skipped, missing, unchanged };
    }

    if (!storage) {
      await pushErrMsg('存储服务未初始化，无法更新卡片', 3000);
      return null;
    }

    let updated = 0;
    let missing = 0;
    let unchanged = 0;

    for (const cardId of cardIds) {
      const fsrsCard = storage.getCard(cardId);
      if (!fsrsCard) {
        missing++;
        logger.warn(`Card not found in storage, skipping update: ${cardId}`);
        continue;
      }

      const result = mutation(fsrsCard);
      if (!result.changed) {
        unchanged++;
        continue;
      }

      storage.setCard(result.card);
      updated++;
    }

    if (updated > 0) {
      await storage.saveCards();
      invalidateCardCache();
      await loadData();
    }

    return { updated, skipped, missing, unchanged };
  }

  async function applyCardType(cards: BrowserCard[], targetType: EditableCardType, label: string): Promise<void> {
    if (!cards?.length) return;

    try {
      const summary = await updateLocalCards(cards, (fsrsCard) => applyCardTypeTransition(fsrsCard, targetType));
      if (!summary) {
        return;
      }

      if (summary.updated === 0) {
        await pushMsg('未发生类型变更（没有可更新的卡片）', 3000);
        return;
      }

      await pushMsg(
        `已更新 ${summary.updated} 张卡片的类型为 ${label}，并按默认策略同步渲染${buildLocalCardUpdateDetail(summary)}`,
        3000,
      );
    } catch (err: unknown) {
      logger.error(`Failed to mark cards as ${targetType}`, err);
      await pushErrMsg(`类型更新失败：${errorMessage(err, '未知错误')}`, 3000);
    }
  }

  async function convertCardsRender(cards: BrowserCard[], target: EditableRenderTarget): Promise<void> {
    if (!cards?.length) return;

    try {
      const summary = await updateLocalCards(cards, (fsrsCard) => applyRenderTargetTransition(fsrsCard, target));
      if (!summary) {
        return;
      }

      if (summary.updated === 0) {
        await pushMsg('未发生渲染变更（没有可更新的卡片）', 3000);
        return;
      }

      await pushMsg(
        `已将 ${summary.updated} 张卡片切换为 ${getRenderTargetLabel(target, t)}${buildLocalCardUpdateDetail(summary)}（仅更新渲染元数据，不改卡片类型）`,
        4000,
      );
    } catch (err: unknown) {
      logger.error(`Failed to convert cards render to ${target}`, err);
      await pushErrMsg(`渲染转换失败：${errorMessage(err, '未知错误')}`, 3000);
    }
  }

  async function markCardsAsTopic(cards: BrowserCard[]): Promise<void> {
    await applyCardType(cards, CardType.Topic, 'Topic');
  }

  async function markCardsAsItem(cards: BrowserCard[]): Promise<void> {
    await applyCardType(cards, CardType.Item, 'Item');
  }

  async function markCardsAsConcept(cards: BrowserCard[]): Promise<void> {
    await applyCardType(cards, CardType.Concept, t('conceptCard', '概念卡'));
  }

  async function markCardsAsDescriptor(cards: BrowserCard[]): Promise<void> {
    await applyCardType(cards, CardType.Descriptor, t('descriptorCard', '描述符卡'));
  }

  async function migrateTopicItem(): Promise<void> {
    const confirmed = await new Promise<boolean>((resolve) => {
      const dialog = document.createElement('div');
      dialog.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';

      const content = document.createElement('div');
      content.style.cssText = 'background: var(--b3-theme-background); padding: 24px; border-radius: 8px; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';

      content.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 18px;">${t('migrateConfirmTitle', '识别 Topic/Item 类型')}</h3>
        <p style="margin: 0 0 20px 0; color: var(--b3-theme-on-surface); line-height: 1.6; white-space: pre-line;">
          ${t('migrateConfirmMessage', `此操作将自动识别所有卡片的类型：
Topic（主题）= 纯阅读材料，使用 A-Factor 算法
Item（卡片）= 问答卡片，使用 FSRS 算法

是否继续？`)}
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="b3-button b3-button--outline" id="migrate-cancel">${t('cancel', '取消')}</button>
          <button class="b3-button b3-button--primary" id="migrate-confirm">${t('confirm', '确认')}</button>
        </div>
      `;

      dialog.appendChild(content);
      document.body.appendChild(dialog);

      const cancelBtn = content.querySelector('#migrate-cancel') as HTMLButtonElement;
      const confirmBtn = content.querySelector('#migrate-confirm') as HTMLButtonElement;
      const cleanup = () => document.body.removeChild(dialog);

      cancelBtn.onclick = () => { cleanup(); resolve(false); };
      confirmBtn.onclick = () => { cleanup(); resolve(true); };
      dialog.onclick = (event) => {
        if (event.target === dialog) {
          cleanup();
          resolve(false);
        }
      };
    });

    if (!confirmed) {
      logger.info('Migration cancelled by user');
      return;
    }

    loading.value = true;

    try {
      logger.info('Starting Topic/Item migration');
      await pushMsg('正在执行 Topic/Item 类型识别...', 3000);

      const result = await migrateExistingCards(true);
      const message = `识别完成：${result.migrated}/${result.total} 张卡片（Topic: ${result.topics}, Item: ${result.items}, 耗时: ${Math.round(result.duration / 1000)}s）`;
      logger.info(message);
      await pushMsg(message, 5000);

      if (result.errors > 0) {
        await pushErrMsg(`有 ${result.errors} 张卡片识别失败，请查看控制台`, 5000);
      }

      invalidateCardCache();
      await refreshData(true, true);
    } catch (err: unknown) {
      logger.error('Migration failed', err);
      await pushErrMsg(`识别失败：${errorMessage(err, '未知错误')}`, 3000);
    } finally {
      loading.value = false;
    }
  }

  function getRenderMenuIcon(target: EditableRenderTarget): string {
    switch (target) {
      case 'default':
        return 'iconEdit';
      case 'quick':
        return 'iconFlashcard';
      case 'concept':
        return 'iconBulb';
      case 'concept-definition-forward':
      case 'concept-definition-reverse':
        return 'iconBook';
      case 'descriptor-forward':
      case 'descriptor-reverse':
        return 'iconTag';
    }
  }

  function buildCardTypeSubmenu(selected: BrowserCard[]): BrowserMenuItem[] {
    return [
      {
        icon: 'iconFile',
        label: t('markAsTopic', '标记为 Topic'),
        click: () => void markCardsAsTopic(selected),
      },
      {
        icon: 'iconCheck',
        label: t('markAsItem', '标记为 Item'),
        click: () => void markCardsAsItem(selected),
      },
      { type: 'separator' },
      {
        icon: 'iconBulb',
        label: t('markAsConcept', '标记为概念卡'),
        click: () => void markCardsAsConcept(selected),
      },
      {
        icon: 'iconTag',
        label: t('markAsDescriptor', '标记为描述符卡'),
        click: () => void markCardsAsDescriptor(selected),
      },
      { type: 'separator' },
      {
        icon: 'iconRefresh',
        label: t('convertRenderMenu', '转换渲染'),
        submenu: getRenderTargetOptions(t).map((option) => ({
          icon: getRenderMenuIcon(option.value),
          label: option.label,
          click: () => void convertCardsRender(selected, option.value),
        })),
      },
    ];
  }

  return {
    markCardsAsTopic,
    markCardsAsItem,
    markCardsAsConcept,
    markCardsAsDescriptor,
    convertCardsRender,
    migrateTopicItem,
    buildCardTypeSubmenu,
  };
}
