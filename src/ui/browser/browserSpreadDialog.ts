import { createVueDialog } from '@/utils/dialog';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import type { BrowserCard } from './types';
import { adjustTime } from './datasource/MenuActions';
import SpreadDialog from './dialogs/SpreadDialog.vue';
import RescheduleResultDialog from './dialogs/RescheduleResultDialog.vue';
import { getBrowserActionErrorMessage } from './browserActionFeedback';

type BrowserTranslate = (key: string, fallback: string) => string;

export async function openBrowserSpreadDialog(deps: {
  activeQueueId: string | null;
  ensureAllRowsSnapshotReady: () => Promise<BrowserCard[]>;
  getStorage: () => RescheduleStoragePort | null | undefined;
  i18n?: Record<string, string>;
  loadAllRowsForCurrentView: () => Promise<BrowserCard[]>;
  logger: {
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
  };
  plugin?: unknown;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  pushMsg: (msg: string, duration?: number, level?: 'error') => Promise<void>;
  refreshData: (forceRefresh?: boolean) => Promise<void>;
  t: BrowserTranslate;
}): Promise<void> {
  deps.logger.info('[SiYuanMemo][SRSBrowser] Opening Spread dialog');

  try {
    const isQueueMode = deps.activeQueueId === 'retrieval' || deps.activeQueueId === 'incremental-learning';

    let cardsToSpread = await deps.ensureAllRowsSnapshotReady();
    if (cardsToSpread.length === 0) {
      cardsToSpread = await deps.loadAllRowsForCurrentView();
    }

    deps.logger.info('[SiYuanMemo][SRSBrowser] Cards to spread:', {
      mode: deps.activeQueueId || 'all',
      total: cardsToSpread.length,
      sample: cardsToSpread.slice(0, 3).map(card => ({ blockId: card.blockId, due: card.due })),
    });

    if (cardsToSpread.length === 0) {
      await deps.pushMsg(deps.t('noCards', 'No cards'));
      return;
    }

    const now = Date.now();
    const outstandingCards = cardsToSpread.filter((card) => {
      const dueTime = card.due instanceof Date ? card.due.getTime() : card.due;
      return dueTime <= now;
    });

    deps.logger.info('[SiYuanMemo][SRSBrowser] Spread default eligible cards:', {
      total: cardsToSpread.length,
      outstanding: outstandingCards.length,
      defaultFilter: isQueueMode ? 'queue-all' : 'due-only',
    });

    const configManager = new ConfigManager(deps.getStorage()!);
    const dlg = createVueDialog({
      title: deps.t('spread', '分散复习压力'),
      component: SpreadDialog,
      props: {
        count: outstandingCards.length,
        configManager,
        allCards: cardsToSpread,
        queueMode: isQueueMode,
        i18n: deps.i18n,
      },
      events: {
        confirm: async (config) => {
          dlg.destroy();

          try {
            const effectiveConfig = {
              ...config,
              collectAllCards: isQueueMode,
            };

            const result = await adjustTime(
              deps.plugin,
              cardsToSpread,
              'spread',
              { config: effectiveConfig },
            );

            if (result) {
              const resultDlg = createVueDialog({
                title: deps.t('spreadResult', '分散结果'),
                component: RescheduleResultDialog,
                props: {
                  result: {
                    success: true,
                    updated: result.updated,
                    skipped: result.skipped,
                    skippedReasons: result.skippedReasons,
                    averageCardsPerDay: result.averageCardsPerDay,
                  },
                  operationType: 'spread',
                },
                events: {
                  close: () => {
                    resultDlg.destroy();
                  },
                },
                width: '600px',
                height: '450px',
                responsive: true,
                visualVariant: 'form',
                containerClass: 'siyuanmemo-reschedule-result-dialog',
              });
            }

            await deps.refreshData(true);
            await deps.pushMsg(deps.t('spreadSuccess', '分散操作完成'));
          } catch (error: unknown) {
            deps.logger.error('[SiYuanMemo][SRSBrowser] Spread operation failed:', error);
            await deps.pushErrMsg(getBrowserActionErrorMessage(error, deps.t('spreadFailed', '分散操作失败')));
          }
        },
        cancel: () => {
          dlg.destroy();
        },
      },
      width: '800px',
      height: '85vh',
      responsive: true,
      visualVariant: 'manager',
      containerClass: 'siyuanmemo-spread-dialog',
    });
  } catch (error: unknown) {
    deps.logger.error('[SiYuanMemo][SRSBrowser] Failed to open Spread dialog:', error);
    await deps.pushErrMsg(getBrowserActionErrorMessage(error, deps.t('openDialogFailed', 'Failed to open dialog')));
  }
}
