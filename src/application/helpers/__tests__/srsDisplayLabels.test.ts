import { describe, expect, it } from 'vitest';
import {
  resolveSrsArenaContestantLabel,
  resolveSchedulerTypeLabel,
} from '@/application/helpers/srsDisplayLabels';
import { SRS_ARENA_ALGORITHM_REGISTRY } from '@/types/arena';

describe('srsDisplayLabels', () => {
  it('labels active built-in schedulers and leaves unknown ids raw', () => {
    expect(resolveSrsArenaContestantLabel('fsrs-v6')).toBe('FSRS v6');
    expect(resolveSrsArenaContestantLabel('external:demo')).toBe('external:demo');
    expect(resolveSchedulerTypeLabel('fsrs-v6')).toBe('FSRS v6');
    expect(resolveSchedulerTypeLabel('a-factor-v2')).toBe('A-Factor v2');
    expect(resolveSchedulerTypeLabel('unsupported-scheduler')).toBe('unsupported-scheduler');
  });

  it('keeps SRS Arena labels scoped to shipped contestants', () => {
    const labels = SRS_ARENA_ALGORITHM_REGISTRY.map((entry) => entry.label);

    expect(labels).toEqual(['FSRS v6']);
  });
});
