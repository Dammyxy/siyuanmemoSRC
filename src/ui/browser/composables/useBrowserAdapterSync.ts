import { ref, type ComputedRef } from 'vue';
import { SRSBrowserAdapter } from '../SRSBrowserAdapter';
import type { DataChangeEvent, IUnifiedDataSourceManagerFacade, QueueType } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

interface UseBrowserAdapterSyncOptions {
  manager: ComputedRef<IUnifiedDataSourceManagerFacade | null | undefined>;
  onCardUpdated: (cardIds: string[]) => Promise<unknown>;
  onCardDeleted: (cardIds: string[]) => Promise<unknown>;
  onQueueChanged: (payload: {
    affectedQueueTypes: QueueType[] | null;
    invalidateAllCounts: boolean;
    requiresFullRefresh: boolean;
  }) => void;
  onModeSwitched: () => void;
}

const logger = createLogger('useBrowserAdapterSync');

export function useBrowserAdapterSync(options: UseBrowserAdapterSyncOptions) {
  const browserAdapter = ref<SRSBrowserAdapter | null>(null);
  let dataChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdatedCardIds = new Set<string>();
  let pendingDeletedCardIds = new Set<string>();
  let pendingQueueChangedAll = false;
  let pendingQueueChangedTypes = new Set<QueueType>();
  let pendingQueueChangedFullRefresh = false;
  let pendingModeSwitched = false;
  let flushInProgress = false;
  let flushQueued = false;
  let isDestroyed = false;

  const hasPendingEvents = (): boolean => (
    pendingUpdatedCardIds.size > 0
      || pendingDeletedCardIds.size > 0
      || pendingQueueChangedAll
      || pendingQueueChangedTypes.size > 0
      || pendingModeSwitched
  );

  const resetPendingState = () => {
    pendingUpdatedCardIds.clear();
    pendingDeletedCardIds.clear();
    pendingQueueChangedAll = false;
    pendingQueueChangedTypes.clear();
    pendingQueueChangedFullRefresh = false;
    pendingModeSwitched = false;
  };

  const flushPendingEvents = async (): Promise<void> => {
    if (isDestroyed) return;

    if (flushInProgress) {
      flushQueued = true;
      return;
    }

    flushInProgress = true;
    try {
      do {
        flushQueued = false;

        const deletedIds = Array.from(pendingDeletedCardIds);
        deletedIds.forEach((id) => pendingUpdatedCardIds.delete(id));
        const updatedIds = Array.from(pendingUpdatedCardIds);
        const queueChanged = pendingQueueChangedAll || pendingQueueChangedTypes.size > 0;
        const affectedQueueTypes = pendingQueueChangedAll
          ? null
          : Array.from(pendingQueueChangedTypes);
        const invalidateAllCounts = pendingQueueChangedAll || (!queueChanged && deletedIds.length > 0);
        const requiresFullRefresh = pendingQueueChangedFullRefresh;
        const modeSwitched = pendingModeSwitched;

        resetPendingState();

        if (deletedIds.length > 0) {
          await options.onCardDeleted(deletedIds);
        }

        if (updatedIds.length > 0) {
          await options.onCardUpdated(updatedIds);
        }

        if (queueChanged || invalidateAllCounts) {
          options.onQueueChanged({
            affectedQueueTypes: invalidateAllCounts ? null : affectedQueueTypes,
            invalidateAllCounts,
            requiresFullRefresh,
          });
        }

        if (modeSwitched) {
          options.onModeSwitched();
        }
      } while (flushQueued || hasPendingEvents());
    } finally {
      flushInProgress = false;
    }
  };

  const initBrowserAdapter = () => {
    try {
      isDestroyed = false;
      const manager = options.manager.value;
      if (!manager) {
        logger.warn('UnifiedDataSourceManager unavailable, adapter not initialized');
        browserAdapter.value = null;
        return;
      }

      if (browserAdapter.value) {
        browserAdapter.value.destroy();
        browserAdapter.value = null;
      }

      browserAdapter.value = new SRSBrowserAdapter(manager);
      browserAdapter.value.setOnDataChangeCallback((event: DataChangeEvent) => {
        if (isDestroyed) return;

        switch (event.type) {
          case 'card-created':
          case 'card-updated':
            event.cardIds?.forEach((id) => pendingUpdatedCardIds.add(id));
            break;
          case 'card-deleted':
            event.cardIds?.forEach((id) => pendingDeletedCardIds.add(id));
            break;
          case 'queue-changed':
            if (event.queueType) {
              pendingQueueChangedTypes.add(event.queueType);
            } else {
              pendingQueueChangedAll = true;
            }
            if (event.requiresFullRefresh === true) {
              pendingQueueChangedFullRefresh = true;
            }
            break;
          case 'mode-switched':
            pendingModeSwitched = true;
            break;
        }

        if (dataChangeDebounceTimer) {
          clearTimeout(dataChangeDebounceTimer);
        }

        dataChangeDebounceTimer = setTimeout(() => {
          void flushPendingEvents();
        }, 300);
      });

      logger.info('UnifiedDataSourceManager adapter initialized with debouncing');
    } catch (error) {
      logger.error('Failed to initialize UnifiedDataSourceManager adapter:', error);
      browserAdapter.value = null;
    }
  };

  const destroyBrowserAdapter = () => {
    isDestroyed = true;

    if (dataChangeDebounceTimer) {
      clearTimeout(dataChangeDebounceTimer);
      dataChangeDebounceTimer = null;
    }

    resetPendingState();
    flushQueued = false;

    if (browserAdapter.value) {
      browserAdapter.value.destroy();
      browserAdapter.value = null;
      logger.info('UnifiedDataSourceManager adapter destroyed');
    }
  };

  return {
    browserAdapter,
    initBrowserAdapter,
    destroyBrowserAdapter,
  };
}
