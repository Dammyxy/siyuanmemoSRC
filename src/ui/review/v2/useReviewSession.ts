import { onMounted, onUnmounted } from 'vue';
import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueItem } from '@/core/queue/types';
import type { IAdapter, RefreshCurrentItemOptions, ReviewSessionHook } from './types';
import {
  createReviewSessionController,
  type CreateReviewSessionControllerOptions,
  type ReviewSessionController,
} from './reviewSessionController';

let localReviewSurfaceCounter = 0;

function createLocalSurfaceId(): string {
  localReviewSurfaceCounter += 1;
  return `review-surface-${Date.now().toString(36)}-${localReviewSurfaceCounter.toString(36)}`;
}

export function useReviewSession<TItem extends QueueItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
  options?: CreateReviewSessionControllerOptions<TItem> & {
    controller?: ReviewSessionController<TItem> | null;
    surfaceId?: string;
  }
): ReviewSessionHook {
  const controller = options?.controller ?? createReviewSessionController(queue, adapter, options);
  const surfaceId = String(options?.surfaceId || '').trim() || createLocalSurfaceId();

  onMounted(() => {
    controller.attachSurface(surfaceId);
  });

  onUnmounted(() => {
    controller.detachSurface(surfaceId);
  });

  return {
    state: controller.state,
    context: controller.context,
    reveal: controller.reveal,
    grade: controller.grade,
    skip: controller.skip,
    back: controller.back,
    executeCommand: controller.executeCommand,
    reload: controller.reload,
    refreshCurrentItem: (item: unknown, refreshOptions?: RefreshCurrentItemOptions) => controller.refreshCurrentItem(item, refreshOptions),
    getQueueStrategy: controller.getQueueStrategy,
    loadCardByBlockId: controller.loadCardByBlockId,
    onMounted: () => controller.attachSurface(surfaceId),
    onUnmounted: () => controller.detachSurface(surfaceId),
  };
}

export {
  createReviewSessionController,
  type CreateReviewSessionControllerOptions,
  type ReviewSessionActionError,
  type ReviewSessionController,
  type ReviewSessionControllerSnapshot,
} from './reviewSessionController';
