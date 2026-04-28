import type { SchedulerType } from '@/core/scheduler';
import type { SrsArenaContestantId } from '@/types/arena';

export const ARENA_CHALLENGER_15_LABEL = 'Arena Challenger 15';

function formatArenaChallengerLabel(value: string): string {
  return `Arena Challenger ${value}`;
}

export function replaceLegacySm15Display(value: string): string {
  return value
    .replace(/\bSM-?15\b/gi, ARENA_CHALLENGER_15_LABEL)
    .replace(/\bFSRSV5\b/gi, ARENA_CHALLENGER_15_LABEL);
}

export function resolveSrsArenaContestantLabel(
  contestantId: SrsArenaContestantId | string | null | undefined,
): string {
  const normalized = String(contestantId || '').trim();
  switch (normalized) {
    case 'sm15':
      return ARENA_CHALLENGER_15_LABEL;
    case 'sm2':
      return formatArenaChallengerLabel('2');
    case 'sm5':
      return formatArenaChallengerLabel('5');
    case 'sm8':
      return formatArenaChallengerLabel('8');
    case 'sm18':
      return formatArenaChallengerLabel('18');
    case 'sm19':
      return formatArenaChallengerLabel('19');
    case 'sm20':
      return formatArenaChallengerLabel('20');
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
      return ARENA_CHALLENGER_15_LABEL;
    case 'a-factor-v2':
      return 'A-Factor v2';
    case 'fsrs-v6':
      return 'FSRS v6';
    default:
      return normalized ? replaceLegacySm15Display(normalized) : 'FSRS v6';
  }
}
