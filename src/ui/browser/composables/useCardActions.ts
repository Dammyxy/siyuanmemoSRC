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
import { CardType } from '@/types/card';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useCardActions');

export interface UseCardActionsOptions {
  loading: Ref<boolean>;
  loadData: () => Promise<void>;
  refreshData: (forceRefresh?: boolean, preserveFocusState?: boolean) => Promise<void>;
  t: (key: string, fallback: string) => string;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  storage?: CardTypeMarkerStoragePort | null;  // 添加 storage 依赖
}

type BrowserMenuItem = {
  icon?: string;
  label?: string;
  click?: () => void;
  type?: 'separator';
  submenu?: BrowserMenuItem[];
};

type RenderTarget =
  | 'default'
  | 'quick'
  | 'concept'
  | 'concept-definition-forward'
  | 'concept-definition-reverse'
  | 'descriptor-forward'
  | 'descriptor-reverse';

type RenderTargetSpec = {
  typeMarker?: string;
  templateID?: string;
};

const RENDER_TARGET_SPECS: Record<RenderTarget, RenderTargetSpec> = {
  default: {},
  quick: {},
  concept: {
    typeMarker: 'C',
    templateID: 'builtin-concept-simple',
  },
  'concept-definition-forward': {
    typeMarker: 'concept-definition-forward',
    templateID: 'builtin-concept-definition-forward',
  },
  'concept-definition-reverse': {
    typeMarker: 'concept-definition-reverse',
    templateID: 'builtin-concept-definition-reverse',
  },
  'descriptor-forward': {
    typeMarker: 'concept-descriptor-forward',
    templateID: 'builtin-concept-descriptor',
  },
  'descriptor-reverse': {
    typeMarker: 'concept-descriptor-reverse',
    templateID: 'builtin-concept-descriptor-reverse',
  },
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

export function useCardActions(options: UseCardActionsOptions) {
  const { loading, loadData, refreshData, t, pushMsg, pushErrMsg, storage } = options;

  // 初始化 CardTypeMarkerService
  const cardTypeMarkerService = storage ? new CardTypeMarkerService(storage) : null;

  function renderTargetLabel(target: RenderTarget): string {
    switch (target) {
      case 'default':
        return t('renderAsDefault', '标准渲染（编辑器）');
      case 'quick':
        return t('renderAsQuick', '快速渲染');
      case 'concept':
        return t('renderAsConcept', '概念卡渲染');
      case 'concept-definition-forward':
        return t('renderAsConceptDefinitionForward', '概念定义卡渲染（正向）');
      case 'concept-definition-reverse':
        return t('renderAsConceptDefinitionReverse', '概念定义卡渲染（反向）');
      case 'descriptor-forward':
        return t('renderAsDescriptorForward', '描述符渲染（正向）');
      case 'descriptor-reverse':
        return t('renderAsDescriptorReverse', '描述符渲染（反向）');
      default:
        return t('convertRenderMenu', '转换渲染');
    }
  }

  function collectFsrsCardIds(cards: BrowserCard[]): { cardIds: string[]; skipped: number } {
    const cardIds: string[] = [];
    let skipped = 0;

    for (const card of cards) {
      if (card.fsrsCardId) {
        cardIds.push(card.fsrsCardId);
      } else {
        skipped++;
        logger.warn('Card missing fsrsCardId, skipping:', card.id, card.blockId);
      }
    }

    return { cardIds, skipped };
  }

  function toMetaRecord(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object') {
      return { ...(meta as Record<string, unknown>) };
    }
    return {};
  }

  function applyRenderTargetMeta(
    sourceMeta: Record<string, unknown>,
    target: RenderTarget
  ): { meta: Record<string, unknown>; changed: boolean } {
    const meta = { ...sourceMeta };
    const spec = RENDER_TARGET_SPECS[target];

    if (target === 'default') {
      const hadForceProtyleRender = meta.forceProtyleRender === true;
      const hadForceQuickRender = Object.prototype.hasOwnProperty.call(meta, 'forceQuickRender');
      if (!hadForceProtyleRender) {
        meta.forceProtyleRender = true;
      }
      if (hadForceQuickRender) {
        delete meta.forceQuickRender;
      }
      return { meta, changed: !hadForceProtyleRender || hadForceQuickRender };
    }

    if (target === 'quick') {
      const hadForceQuickRender = meta.forceQuickRender === true;
      const hadForceProtyleRender = Object.prototype.hasOwnProperty.call(meta, 'forceProtyleRender');
      if (!hadForceQuickRender) {
        meta.forceQuickRender = true;
      }
      if (hadForceProtyleRender) {
        delete meta.forceProtyleRender;
      }
      return { meta, changed: !hadForceQuickRender || hadForceProtyleRender };
    }

    const currentTypeMarker = typeof meta.typeMarker === 'string' ? meta.typeMarker : undefined;
    const currentTemplateID = typeof meta.templateID === 'string' ? meta.templateID : undefined;
    const hadForceProtyleRender = Object.prototype.hasOwnProperty.call(meta, 'forceProtyleRender');
    const hadForceQuickRender = Object.prototype.hasOwnProperty.call(meta, 'forceQuickRender');

    let changed = false;
    if (spec.typeMarker && currentTypeMarker !== spec.typeMarker) {
      meta.typeMarker = spec.typeMarker;
      changed = true;
    }
    if (spec.templateID && currentTemplateID !== spec.templateID) {
      meta.templateID = spec.templateID;
      changed = true;
    }
    if (hadForceProtyleRender) {
      delete meta.forceProtyleRender;
      changed = true;
    }
    if (hadForceQuickRender) {
      delete meta.forceQuickRender;
      changed = true;
    }

    return { meta, changed };
  }

  async function convertCardsRender(cards: BrowserCard[], target: RenderTarget): Promise<void> {
    if (!cards?.length) return;

    if (!storage) {
      await pushErrMsg('存储服务未初始化，无法转换渲染', 3000);
      return;
    }

    const { cardIds, skipped } = collectFsrsCardIds(cards);
    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return;
    }

    let updated = 0;
    let missing = 0;
    let unchanged = 0;

    for (const cardId of cardIds) {
      const fsrsCard = storage.getCard(cardId);
      if (!fsrsCard) {
        missing++;
        logger.warn(`Card not found in storage, skipping render conversion: ${cardId}`);
        continue;
      }

      const currentMeta = toMetaRecord(fsrsCard.meta);
      const { meta, changed } = applyRenderTargetMeta(currentMeta, target);

      if (!changed) {
        unchanged++;
        continue;
      }

      storage.setCard({
        ...fsrsCard,
        meta,
      });
      updated++;
    }

    if (updated === 0) {
      const noChangeMsg = `未发生渲染变更（无可更新卡片）`;
      await pushMsg(noChangeMsg, 3000);
      return;
    }

    await storage.saveCards();

    const detailParts: string[] = [];
    if (skipped > 0) detailParts.push(`缺少ID ${skipped} 张`);
    if (missing > 0) detailParts.push(`存储缺失 ${missing} 张`);
    if (unchanged > 0) detailParts.push(`已是目标渲染 ${unchanged} 张`);
    const detail = detailParts.length > 0 ? `（${detailParts.join('，')}）` : '';
    const targetLabel = renderTargetLabel(target);

    await pushMsg(
      `✅ 已将 ${updated} 张卡片转换为${targetLabel}${detail}（仅更新渲染标记，不改变队列类型）`,
      4000
    );

    invalidateCardCache();
    await loadData();
  }

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
              fsrsCard.type = CardType.Topic;
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
    } catch (err: unknown) {
      logger.error('Failed to mark cards as Topic:', err);
      await pushErrMsg(`标记失败：${errorMessage(err, '未知错误')}`, 3000);
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
              fsrsCard.type = CardType.Item;
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
    } catch (err: unknown) {
      logger.error('Failed to mark cards as Item:', err);
      await pushErrMsg(`标记失败：${errorMessage(err, '未知错误')}`, 3000);
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
    } catch (err: unknown) {
      logger.error('Migration failed:', err);
      pushErrMsg(`识别失败：${errorMessage(err, '未知错误')}`, 3000);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 标记卡片为概念卡
   */
  async function markCardsAsConcept(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    const { cardIds, skipped } = collectFsrsCardIds(cards);

    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return;
    }

    logger.info(`Marking ${cardIds.length} cards as Concept:`, cardIds);

    try {
      if (!cardTypeMarkerService) {
        await pushErrMsg('存储服务未初始化，无法标记概念卡', 3000);
        return;
      }
      // 使用 CardTypeMarkerService 批量设置
      await cardTypeMarkerService.batchSetMarker(cardIds, 'concept');

      const renderHint = '（仅更新队列类型，不改变模板渲染）';
      const msg = skipped > 0 
        ? `✅ 已将 ${cardIds.length} 张卡片标记为概念卡（跳过 ${skipped} 张）${renderHint}`
        : `✅ 已将 ${cardIds.length} 张卡片标记为概念卡${renderHint}`;
      await pushMsg(msg, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to mark cards as Concept:', err);
      await pushErrMsg(`标记失败：${errorMessage(err, '未知错误')}`, 3000);
    }
  }

  /**
   * 标记卡片为描述符卡
   */
  async function markCardsAsDescriptor(cards: BrowserCard[]): Promise<void> {
    if (!cards?.length) return;

    const { cardIds, skipped } = collectFsrsCardIds(cards);

    if (cardIds.length === 0) {
      await pushErrMsg('未找到有效的卡片 ID', 3000);
      return;
    }

    logger.info(`Marking ${cardIds.length} cards as Descriptor:`, cardIds);

    try {
      if (!cardTypeMarkerService) {
        await pushErrMsg('存储服务未初始化，无法标记描述符卡', 3000);
        return;
      }
      // 使用 CardTypeMarkerService 批量设置
      await cardTypeMarkerService.batchSetMarker(cardIds, 'descriptor');

      const renderHint = '（仅更新队列类型，不改变模板渲染）';
      const msg = skipped > 0 
        ? `✅ 已将 ${cardIds.length} 张卡片标记为描述符卡（跳过 ${skipped} 张）${renderHint}`
        : `✅ 已将 ${cardIds.length} 张卡片标记为描述符卡${renderHint}`;
      await pushMsg(msg, 3000);

      invalidateCardCache();
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to mark cards as Descriptor:', err);
      await pushErrMsg(`标记失败：${errorMessage(err, '未知错误')}`, 3000);
    }
  }

  /**
   * 构建卡片类型子菜单
   */
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
        icon: '🧠',
        label: t('markAsConcept2', '标记为概念卡（队列）'),
        click: () => void markCardsAsConcept(selected),
      },
      {
        icon: '🏷️',
        label: t('markAsDescriptor2', '标记为描述符卡（队列）'),
        click: () => void markCardsAsDescriptor(selected),
      },
      { type: 'separator' },
      {
        icon: 'iconRefresh',
        label: t('convertRenderMenu', '转换渲染'),
        submenu: [
          {
            icon: 'iconEdit',
            label: t('renderAsDefault', '标准渲染（编辑器）'),
            click: () => void convertCardsRender(selected, 'default'),
          },
          {
            icon: '⚡',
            label: t('renderAsQuick', '快速渲染'),
            click: () => void convertCardsRender(selected, 'quick'),
          },
          {
            icon: '🧠',
            label: t('renderAsConcept', '概念卡渲染'),
            click: () => void convertCardsRender(selected, 'concept'),
          },
          {
            icon: '📘',
            label: t('renderAsConceptDefinitionForward', '概念定义卡渲染（正向）'),
            click: () => void convertCardsRender(selected, 'concept-definition-forward'),
          },
          {
            icon: '📙',
            label: t('renderAsConceptDefinitionReverse', '概念定义卡渲染（反向）'),
            click: () => void convertCardsRender(selected, 'concept-definition-reverse'),
          },
          {
            icon: '🏷️',
            label: t('renderAsDescriptorForward', '描述符渲染（正向）'),
            click: () => void convertCardsRender(selected, 'descriptor-forward'),
          },
          {
            icon: '🔁',
            label: t('renderAsDescriptorReverse', '描述符渲染（反向）'),
            click: () => void convertCardsRender(selected, 'descriptor-reverse'),
          },
        ],
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
