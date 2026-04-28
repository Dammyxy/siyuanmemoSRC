import type { SchedulerType } from '@/core/scheduler';
import type { SrsArenaContestantId } from '@/types/arena';

export const FSRSV5_DISPLAY_LABEL = 'FSRSV5';

export function replaceLegacySm15Display(value: string): string {
  return value.replace(/\bSM-?15\b/gi, FSRSV5_DISPLAY_LABEL);
}

export function resolveSrsArenaContestantLabel(
  contestantId: SrsArenaContestantId | string | null | undefined,
): string {
  const normalized = String(contestantId || '').trim();
  switch (normalized) {
    case 'sm15':
      return FSRSV5_DISPLAY_LABEL;
    case 'sm2':
      return 'SM-2';
    case 'sm5':
      return 'SM-5';
    case 'sm8':
      return 'SM-8';
    case 'sm18':
      return 'SM-18';
    case 'sm19':
      return 'SM-19';
    case 'sm20':
      return 'SM-20';
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
    case 'sm15':
      return FSRSV5_DISPLAY_LABEL;
    case 'a-factor-v2':
      return 'A-Factor v2';
    case 'fsrs-v6':
      return 'FSRS v6';
    default:
      return normalized ? replaceLegacySm15Display(normalized) : 'FSRS v6';
  }
}
