import type { IReviewQueue, QueueProjectionReadMode } from '@/types/unified-data-source';

type ProjectionReadPolicyCarrier = Pick<IReviewQueue, 'getProjectionReadMode'>;

export function normalizeQueueProjectionReadMode(value: unknown): QueueProjectionReadMode | null {
  if (value === 'backend-projection' || value === 'local-queue') {
    return value;
  }
  return null;
}

export function resolveQueueProjectionReadMode(
  queue: ProjectionReadPolicyCarrier | null | undefined,
): QueueProjectionReadMode | null {
  if (!queue || typeof queue.getProjectionReadMode !== 'function') {
    return null;
  }

  const mode = normalizeQueueProjectionReadMode(queue.getProjectionReadMode());
  if (!mode) {
    throw new Error('QUEUE_PROJECTION_READ_POLICY_INVALID: getProjectionReadMode returned an unsupported value');
  }
  return mode;
}

export function shouldReadQueueLocally(queue: ProjectionReadPolicyCarrier | null | undefined): boolean {
  return resolveQueueProjectionReadMode(queue) === 'local-queue';
}
