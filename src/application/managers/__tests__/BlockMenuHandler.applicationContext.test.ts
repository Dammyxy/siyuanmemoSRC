import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockMenuHandler } from '../BlockMenuHandler';
import { IntegrationRuntimeAccess } from '@/application/runtime-access';

describe('BlockMenuHandler bounded runtime access', () => {
  let runtimeAccess: IntegrationRuntimeAccess;
  let blockMenuHandler: BlockMenuHandler;

  beforeEach(() => {
    runtimeAccess = new IntegrationRuntimeAccess();
    blockMenuHandler = new BlockMenuHandler({
      app: {} as never,
      i18n: {},
      cardCreationHelper: {} as never,
      openCreateTemplateCardDialog: vi.fn(),
      openNeuralReviewDialog: vi.fn(),
      runtimeAccess,
      siyuanApi: {
        BUILTIN_DECK_ID: 'builtin',
        CARD_ID_ATTR: 'custom-fsrs-card-id',
        pushMsg: vi.fn().mockResolvedValue(undefined),
        pushErrMsg: vi.fn().mockResolvedValue(undefined),
      } as never,
    });
  });

  it('has no mutable ApplicationContext setter', () => {
    expect('setApplicationContext' in blockMenuHandler).toBe(false);
  });

  it('fails explicitly before runtime bindings are installed', () => {
    expect(() => (
      blockMenuHandler as unknown as { getCardService(): unknown }
    ).getCardService()).toThrow(
      'RUNTIME_ACCESS_UNAVAILABLE: integration-runtime.services callback is not bound',
    );
  });

  it('uses the bind-once integration runtime after startup binding', () => {
    const cardService = {};
    runtimeAccess.bindRuntime({
      cardService,
    } as never);

    expect((
      blockMenuHandler as unknown as { getCardService(): unknown }
    ).getCardService()).toBe(cardService);
    expect(() => runtimeAccess.bindRuntime({ cardService: {} } as never)).toThrow(
      'RUNTIME_ACCESS_ALREADY_BOUND: integration-runtime.services callback is already bound',
    );
  });
});
