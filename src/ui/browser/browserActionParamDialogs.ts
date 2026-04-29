import { createVueDialog } from '@/utils/dialog';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import type { BrowserActionTarget, SortModel } from './datasource/types';
import type { BrowserCard } from './types';
import ActionParamsDialog from './ActionParamsDialog.vue';
import AdvanceDialog from './dialogs/AdvanceDialog.vue';
import PostponeDialog from './dialogs/PostponeDialog.vue';
import SpreadDialog from './dialogs/SpreadDialog.vue';

type BrowserTranslate = (key: string, fallback: string) => string;

type BrowserActionStoragePort = RescheduleStoragePort;

type BrowserQueueSizePort = {
  getSize?: () => number | Promise<number>;
};

export type BrowserActionParams = Record<string, unknown>;

export type BrowserActionParamBuilder = (
  targetCards: BrowserActionTarget[],
) => Promise<BrowserActionParams | null>;

export function openBrowserActionNumberDialog(
  options: {
    defaultValue?: number;
    description?: string;
    integer?: boolean;
    label: string;
    max?: number;
    min?: number;
    step?: number;
    title: string;
    unit?: string;
  },
  deps: {
    t: BrowserTranslate;
  },
): Promise<number | null> {
  return new Promise((resolve) => {
    const dlg = createVueDialog({
      title: options.title,
      component: ActionParamsDialog,
      props: {
        label: options.label,
        description: options.description,
        unit: options.unit,
        defaultValue: options.defaultValue,
        min: options.min,
        max: options.max,
        step: options.step,
        integer: options.integer,
        confirmText: deps.t('confirm', '确认'),
        cancelText: deps.t('cancel', '取消'),
      },
      events: {
        confirm: (value: number) => {
          dlg.destroy();
          resolve(value);
        },
        cancel: () => {
          dlg.destroy();
          resolve(null);
        },
      },
      width: '520px',
      height: '220px',
      visualVariant: 'form',
      containerClass: 'siyuanmemo-action-params-dialog',
    });
  });
}

export function createBrowserActionParamBuilders(deps: {
  ensureAllRowsSnapshotReady: () => Promise<BrowserCard[]>;
  getQueueById: (id: string) => BrowserQueueSizePort | undefined;
  getStorage: () => BrowserActionStoragePort | null | undefined;
  i18n?: Record<string, string>;
  loadAllRowsForCurrentView: (sortModel?: SortModel[]) => Promise<BrowserCard[]>;
  t: BrowserTranslate;
}): Record<string, BrowserActionParamBuilder> {
  return {
    postpone: async (cards) => {
      return new Promise((resolve) => {
        const configManager = new ConfigManager(deps.getStorage()!);
        const dlg = createVueDialog({
          title: deps.t('postpone', 'Postpone'),
          component: PostponeDialog,
          props: {
            count: cards.length,
            configManager,
            i18n: deps.i18n,
          },
          events: {
            confirm: async (config) => {
              dlg.destroy();
              resolve({ config });
            },
            cancel: () => {
              dlg.destroy();
              resolve(null);
            },
          },
          width: '800px',
          height: '85vh',
          responsive: true,
          visualVariant: 'manager',
          containerClass: 'siyuanmemo-postpone-dialog',
        });
      });
    },
    advance: async (cards) => {
      return new Promise((resolve) => {
        const configManager = new ConfigManager(deps.getStorage()!);
        const dlg = createVueDialog({
          title: deps.t('advance', 'Advance'),
          component: AdvanceDialog,
          props: {
            count: cards.length,
            configManager,
            i18n: deps.i18n,
          },
          events: {
            confirm: async (config) => {
              dlg.destroy();
              resolve({ config });
            },
            cancel: () => {
              dlg.destroy();
              resolve(null);
            },
          },
          width: '800px',
          height: '85vh',
          responsive: true,
          visualVariant: 'manager',
          containerClass: 'siyuanmemo-advance-dialog',
        });
      });
    },
    spread: async (cards) => {
      const snapshotRows = await deps.ensureAllRowsSnapshotReady();
      const fullRows = snapshotRows.length > 0 ? snapshotRows : await deps.loadAllRowsForCurrentView([]);

      return new Promise((resolve) => {
        const configManager = new ConfigManager(deps.getStorage()!);
        const dlg = createVueDialog({
          title: deps.t('spread', 'Spread Workload'),
          component: SpreadDialog,
          props: {
            count: cards.length,
            configManager,
            allCards: fullRows,
            i18n: deps.i18n,
          },
          events: {
            confirm: async (config) => {
              dlg.destroy();
              resolve({ config });
            },
            cancel: () => {
              dlg.destroy();
              resolve(null);
            },
          },
          width: '700px',
          height: '80vh',
          visualVariant: 'manager',
          containerClass: 'siyuanmemo-spread-dialog',
        });
      });
    },
    'set-priority': async (cards) => {
      const row = cards?.[0];
      const priority = await openBrowserActionNumberDialog({
        title: deps.t('setPriority', 'Set Priority'),
        label: deps.t('priorityLabel', 'Priority'),
        description: deps.t('priorityHint', '0-100, smaller = higher priority'),
        defaultValue: typeof row?.priority === 'number' ? row.priority : 50,
        min: 0,
        max: 100,
        step: 1,
        integer: true,
      }, deps);
      if (priority == null) {
        return null;
      }
      return { priority };
    },
    'insert-at': async () => {
      const queue = deps.getQueueById('final-drill');
      let length = 0;
      if (typeof queue?.getSize === 'function') {
        length = Number(await queue.getSize()) || 0;
      }
      const position = await openBrowserActionNumberDialog({
        title: deps.t('insertAt', 'Insert At Position'),
        label: deps.t('positionLabel', 'Position'),
        description: deps.t('insertAtHint', 'Enter 1~{max}, 1 means insert at top')
          .replace('{max}', String(length + 1)),
        defaultValue: 1,
        min: 1,
        max: Math.max(1, length + 1),
        step: 1,
        integer: true,
      }, deps);
      if (position == null) {
        return null;
      }
      const index = Math.max(0, Math.floor(Number(position)) - 1);
      return { index };
    },
  };
}
