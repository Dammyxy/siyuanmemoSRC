import { describe, expect, it } from 'vitest';
import {
  applyBackendBrowserStats,
  applyLoadedAllCardsTotal,
  isDefaultAllCardsScope,
} from '../browserGlobalStatsRuntime';

const defaultScope = {
  activeDocId: null,
  activeQueueId: null,
  activeScopeDocIds: null,
  currentCardType: 'all',
  currentPreset: 'all',
  searchQuery: '',
};

describe('browserGlobalStatsRuntime', () => {
  it('treats the loaded default all-cards total as the immediate global total', () => {
    expect(isDefaultAllCardsScope(defaultScope)).toBe(true);

    expect(applyLoadedAllCardsTotal({
      dismissed: 0,
      lost: 0,
      total: 70,
    }, defaultScope, 242)).toEqual({
      dismissed: 0,
      lost: 0,
      total: 242,
    });
  });

  it('does not let stale smaller backend stats overwrite the loaded all-cards total', () => {
    expect(applyBackendBrowserStats({
      dismissed: 0,
      lost: 0,
      total: 242,
    }, defaultScope, {
      dueCards: 0,
      learningCards: 0,
      lostCards: 3,
      newCards: 0,
      reviewCards: 0,
      suspendedCards: 4,
      totalCards: 70,
    }, 242)).toEqual({
      dismissed: 4,
      lost: 3,
      total: 242,
    });
  });

  it('uses backend stats outside the default all-cards scope', () => {
    expect(applyLoadedAllCardsTotal({
      dismissed: 0,
      lost: 0,
      total: 70,
    }, {
      ...defaultScope,
      activeQueueId: 'retrieval',
    }, 242)).toEqual({
      dismissed: 0,
      lost: 0,
      total: 70,
    });

    expect(applyBackendBrowserStats({
      dismissed: 0,
      lost: 0,
      total: 242,
    }, {
      ...defaultScope,
      activeQueueId: 'retrieval',
    }, {
      dueCards: 0,
      learningCards: 0,
      lostCards: 3,
      newCards: 0,
      reviewCards: 0,
      suspendedCards: 4,
      totalCards: 70,
    }, 242).total).toBe(70);
  });
});
