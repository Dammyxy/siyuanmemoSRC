import { describe, expect, it } from 'vitest';
import { shouldReloadQueueAfterSourceExistenceUpdate } from '../sourceExistenceUpdatePolicy';

describe('sourceExistenceUpdatePolicy', () => {
  it('reloads active queue views when visible source updates mark a block missing', () => {
    expect(shouldReloadQueueAfterSourceExistenceUpdate({
      activeQueueId: 'incremental-learning',
      statuses: [{ exists: false }],
    })).toBe(true);
  });

  it('does not reload deck views or active queue updates without missing blocks', () => {
    expect(shouldReloadQueueAfterSourceExistenceUpdate({
      activeQueueId: null,
      statuses: [{ exists: false }],
    })).toBe(false);
    expect(shouldReloadQueueAfterSourceExistenceUpdate({
      activeQueueId: 'incremental-learning',
      statuses: [{ exists: true }, { exists: null }],
    })).toBe(false);
  });
});
