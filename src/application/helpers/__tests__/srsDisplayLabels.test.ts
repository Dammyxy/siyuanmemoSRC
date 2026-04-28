import { describe, expect, it } from 'vitest';
import {
  replaceLegacySm15Display,
  resolveSrsArenaContestantLabel,
  resolveSchedulerTypeLabel,
} from '@/application/helpers/srsDisplayLabels';
import { SRS_ARENA_ALGORITHM_REGISTRY } from '@/types/arena';

describe('srsDisplayLabels', () => {
  it('uses neutral SRS Arena challenger labels for legacy sm ids', () => {
    expect(resolveSrsArenaContestantLabel('sm15')).toBe('Arena Challenger 15');
    expect(resolveSrsArenaContestantLabel('sm2')).toBe('Arena Challenger 2');
    expect(resolveSrsArenaContestantLabel('sm19')).toBe('Arena Challenger 19');
    expect(resolveSchedulerTypeLabel('sm15')).toBe('Arena Challenger 15');
    expect(replaceLegacySm15Display('SM-15 / FSRSV5')).toBe('Arena Challenger 15 / Arena Challenger 15');
  });

  it('keeps SRS Arena labels free of legacy brand words', () => {
    const labels = [
      ...SRS_ARENA_ALGORITHM_REGISTRY.map((entry) => entry.label),
      ...['sm2', 'sm5', 'sm8', 'sm15', 'sm18', 'sm19', 'sm20'].map(resolveSrsArenaContestantLabel),
    ];

    expect(labels.join(' ')).not.toMatch(/\bSM\b|SuperMemo|FSRSV5|SM-\d+/i);
  });
});
