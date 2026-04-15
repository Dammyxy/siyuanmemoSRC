import { onMounted, onUnmounted } from 'vue';
import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueItem } from '@/core/queue/types';
import type { InitialReviewSessionState } from '@/types/unified-data-source';
import type { IAdapter, ReviewSessionHook } from './types';
import {
  createReviewSessionController,
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
  options?: {
    onReview?: (cardId: string, rating: number) => void;
    initialSessionState?: InitialReviewSessionState;
    initialCurrentItem?: TItem | null;
    initialShowAnswer?: boolean;
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
    refreshCurrentItem: controller.refreshCurrentItem,
    getQueueStrategy: controller.getQueueStrategy,
    loadCardByBlockId: controller.loadCardByBlockId,
    onMounted: () => controller.attachSurface(surfaceId),
    onUnmounted: () => controller.detachSurface(surfaceId),
  };
}

export {
  createReviewSessionController,
  type ReviewSessionController,
  type ReviewSessionControllerSnapshot,
} from './reviewSessionController';
