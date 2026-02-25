/**
 * 卡片操作 composable
 * 处理卡片类型标记、迁移等操作
 */
import { type Ref } from 'vue';
import { migrateExistingCards } from '@/scripts/migrateToTopicItem';
import { invalidateCardCache, setBrowserCardType } from '../browserService';
import type { BrowserCard } from '../types';
import { CardTypeMarkerService } from '@/core/card-type/CardTypeMarkerService';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useCardActions');

export interface UseCardActionsOptions {
  loading: Ref<boolean>;
  loadData: () => Promise<void>;
  refreshData: (forceRefresh?: boolean, preserveFocusState?: boolean) => Promise<void>;
  t: (key: string, fallback: string) => string;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  storage: CardTypeMarkerStoragePort;  // 添加 storage 依赖
}

export function useCardActions(options: UseCardActionsOptions) {
  const { loading, loadData, refreshData, t, pushMsg, pushErrMsg, storage } = options;

  // 初始化 CardTypeMarkerService
  const cardTypeMarkerService = new CardTypeMarkerService(storage);

  /**
   * 标记卡片为 Topic
   */
  async function markCardsAsTopic(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    const blockIds = cards.map(c => c.blockId);
    logger.info(`Marking ${blockIds.length} cards as Topic:`, blockIds);

    try {
      // 1. 更新块属性
      for (const blockId of blockIds) {
        await setBrowserCardType(blockId, 'topic');
      }

      // 2. 更新 StorageManager 中的卡片类型
      if (storage) {
        for (const card of cards) {
          const cardId = card.fsrsCardId || card.id;
          if (cardId) {
            const fsrsCard = storage.getCard(cardId);
            if (fsrsCard) {
              fsrsCard.type = 'topic' as any;
              storage.setCard(fsrsCard);
              logger.debug(`Updated card type in storage: ${cardId} -> topic`);
            }
          }
        }
        await storage.saveCards();
      }

      await pushMsg(`✅ 已将 ${blockIds.length} 张卡片标记为 Topic`, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: any) {
      logger.error('Failed to mark cards as Topic:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  }

  /**
   * 标记卡片为 Item
   */
  async function markCardsAsItem(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    const blockIds = cards.map(c => c.blockId);
    logger.info(`Marking ${blockIds.length} cards as Item:`, blockIds);

    try {
      // 1. 更新块属性
      for (const blockId of blockIds) {
        await setBrowserCardType(blockId, 'item');
      }

      // 2. 更新 StorageManager 中的卡片类型
      if (storage) {
        for (const card of cards) {
          const cardId = card.fsrsCardId || card.id;
          if (cardId) {
            const fsrsCard = storage.getCard(cardId);
            if (fsrsCard) {
              fsrsCard.type = 'item' as any;
              storage.setCard(fsrsCard);
              logger.debug(`Updated card type in storage: ${cardId} -> item`);
            }
          }
        }
        await storage.saveCards();
      }

      await pushMsg(`✅ 已将 ${blockIds.length} 张卡片标记为 Item`, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: any) {
      logger.error('Failed to mark cards as Item:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  }

  /**
   * Topic/Item 类型迁移（带确认弹窗）
   */
  async function migrateTopicItem(): Promise<void> {
    // 显示确认弹窗
    const confirmed = await new Promise<boolean>((resolve) => {
      const dialog = document.createElement('div');
      dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';

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
      dialog.onclick = (e) => { if (e.target === dialog) { cleanup(); resolve(false); } };
    });

    if (!confirmed) {
      logger.info('Migration cancelled by user');
      return;
    }

    loading.value = true;

    try {
      logger.info('Starting Topic/Item migration...');
      pushMsg('正在执行 Topic/Item 类型识别...', 3000);

      const result = await migrateExistingCards(true);

      const msg = `✅ 识别完成：${result.migrated}/${result.total} 张卡片 (Topic: ${result.topics}, Item: ${result.items}, 耗时: ${Math.round(result.duration / 1000)}s)`;
      logger.info(msg);
      pushMsg(msg, 5000);

      if (result.errors > 0) {
        pushErrMsg(`⚠️ ${result.errors} 张卡片识别失败，请查看控制台`, 5000);
      }

      invalidateCardCache();
      await refreshData(true, true);
    } catch (err: any) {
      logger.error('Migration failed:', err);
      pushErrMsg(`识别失败：${err?.message || '未知错误'}`, 3000);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 标记卡片为概念卡
   */
  async function markCardsAsConcept(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    // 收集有效的卡片 ID（必须有 fsrsCardId）
    const cardIds: string[] = [];
    const skippedCount = cards.length;
    
    for (const card of cards) {
      if (card.fsrsCardId) {
        cardIds.push(card.fsrsCardId);
      } else {
        logger.warn('Card missing fsrsCardId, skipping:', card.id, card.blockId);
      }
    }

    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return;
    }

    logger.info(`Marking ${cardIds.length} cards as Concept:`, cardIds);

    try {
      // 使用 CardTypeMarkerService 批量设置
      await cardTypeMarkerService.batchSetMarker(cardIds, 'concept');

      const skipped = skippedCount - cardIds.length;
      const msg = skipped > 0 
        ? `✅ 已将 ${cardIds.length} 张卡片标记为概念卡（跳过 ${skipped} 张）`
        : `✅ 已将 ${cardIds.length} 张卡片标记为概念卡`;
      await pushMsg(msg, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: any) {
      logger.error('Failed to mark cards as Concept:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  }

  /**
   * 标记卡片为描述符卡
   */
  async function markCardsAsDescriptor(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    // 收集有效的卡片 ID（必须有 fsrsCardId）
    const cardIds: string[] = [];
    const skippedCount = cards.length;
    
    for (const card of cards) {
      if (card.fsrsCardId) {
        cardIds.push(card.fsrsCardId);
      } else {
        logger.warn('Card missing fsrsCardId, skipping:', card.id, card.blockId);
      }
    }

    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return;
    }

    logger.info(`Marking ${cardIds.length} cards as Descriptor:`, cardIds);

    try {
      // 使用 CardTypeMarkerService 批量设置
      await cardTypeMarkerService.batchSetMarker(cardIds, 'descriptor');

      const skipped = skippedCount - cardIds.length;
      const msg = skipped > 0 
        ? `✅ 已将 ${cardIds.length} 张卡片标记为描述符卡（跳过 ${skipped} 张）`
        : `✅ 已将 ${cardIds.length} 张卡片标记为描述符卡`;
      await pushMsg(msg, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: any) {
      logger.error('Failed to mark cards as Descriptor:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  }

  /**
   * 构建卡片类型子菜单
   */
  function buildCardTypeSubmenu(selected: BrowserCard[]): any[] {
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
        icon: '🧠',
        label: t('markAsConcept2', '标记为概念卡'),
        click: () => void markCardsAsConcept(selected),
      },
      {
        icon: '🏷️',
        label: t('markAsDescriptor2', '标记为描述符卡'),
        click: () => void markCardsAsDescriptor(selected),
      },
    ];
  }

  return {
    markCardsAsTopic,
    markCardsAsItem,
    markCardsAsConcept,
    markCardsAsDescriptor,
    migrateTopicItem,
    buildCardTypeSubmenu,
  };
}
