import { describe, expect, it, vi } from 'vitest';
import { XiuyuanSyncService } from '../XiuyuanSyncService';

function createService(): XiuyuanSyncService {
  const config = {
    deckId: '20200812220555-lj3enxa',
    storage: {},
    incrementalSync: {
      enabled: false,
      triggers: [],
      useBlacklist: true,
      autoDetectCardType: true,
    },
    fullSync: {
      enabled: false,
      interval: 0,
      cleanupBlacklist: true,
    },
    deleteSync: {
      enabled: false,
      useBlacklistFallback: true,
    },
  } as const;

  const eventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const repository = {
    findById: vi.fn(),
  };

  const blacklistService = {};
  const detectionService = {
    detectCardType: vi.fn().mockResolvedValue('topic'),
  };
  const deletionTracker = {};
  const siyuanApi = {
    BUILTIN_DECK_ID: '20200812220555-lj3enxa',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    getRiffCards: vi.fn(),
    getRiffNewCards: vi.fn(),
    removeRiffCards: vi.fn(),
    setBlockAttrs: vi.fn(),
    getBlockAttrs: vi.fn(),
  };

  return new XiuyuanSyncService(
    config as never,
    eventBus as never,
    repository as never,
    blacklistService as never,
    detectionService as never,
    deletionTracker as never,
    siyuanApi as never
  );
}

describe('XiuyuanSyncService native riff semantic routing', () => {
  it('routes concept-definition symbols to concept-definition template', () => {
    const service = createService();
    const plan = (service as any).planPostCreation(
      {
        id: '20260101010101-abcdefg',
        content: '((20260101010101-abc1234)) :: 定义',
      },
      'topic'
    );

    expect(plan.templateId).toBe('builtin-concept-definition');
    expect(plan.cardType).toBe('descriptor');
  });

  it('routes descriptor symbols to descriptor template', () => {
    const service = createService();
    const plan = (service as any).planPostCreation(
      {
        id: '20260101010101-abcdefg',
        content: '属性 ;; 描述',
      },
      'topic'
    );

    expect(plan.templateId).toBe('builtin-concept-descriptor');
    expect(plan.cardType).toBe('descriptor');
  });
});

