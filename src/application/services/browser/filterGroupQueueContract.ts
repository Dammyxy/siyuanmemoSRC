import type { CardFilter, IReviewQueue } from '@/types/unified-data-source';

export type FilterGroupQueueContract = IReviewQueue & {
  setFilter(filter: CardFilter): Promise<void>;
  rebuild(): Promise<void>;
};

export function hasFilterSetter(queue: IReviewQueue | null): queue is FilterGroupQueueContract {
  return Boolean(queue && typeof (queue as FilterGroupQueueContract).setFilter === 'function');
}

export function hasRebuildAction(queue: IReviewQueue | null): queue is FilterGroupQueueContract {
  return Boolean(queue && typeof (queue as FilterGroupQueueContract).rebuild === 'function');
}
