import type { SchedulerType } from '@/core/scheduler';
import type { SrsArenaContestantId } from '@/types/arena';

export function resolveSrsArenaContestantLabel(
  contestantId: SrsArenaContestantId | string | null | undefined,
): string {
  const normalized = String(contestantId || '').trim();
  switch (normalized) {
    case 'fsrs-v6':
      return 'FSRS v6';
    default:
      return normalized || '-';
  }
}

export function resolveSchedulerTypeLabel(
  schedulerType: SchedulerType | string | null | undefined,
): string {
  const normalized = String(schedulerType || '').trim();
  switch (normalized) {
    case 'a-factor-v2':
      return 'A-Factor v2';
    case 'fsrs-v6':
      return 'FSRS v6';
    default:
      return normalized || 'FSRS v6';
  }
}
