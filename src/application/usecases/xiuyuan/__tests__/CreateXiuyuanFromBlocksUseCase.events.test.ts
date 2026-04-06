import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { CreateXiuyuanFromBlocksUseCase } from '../CreateXiuyuanFromBlocksUseCase';

const QUESTION_BLOCK_ID = '20260101000000-abcde01';
const ANSWER_BLOCK_ID = '20260101000000-abcde02';

const BASIC_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: 'Basic QA',
  category: 'basic',
  fields: [
    { name: 'question' },
    { name: 'answer' },
  ],
  cardRules: [
    {
      typeMarker: 'default',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};

function createRepositoryMock(order: string[]) {
  const save = vi.fn(async (xiuyuan) => {
    order.push(`save:${xiuyuan.getId().getValue()}`);
    return ok(undefined);
  });

  return {
    save,
    findById: vi.fn(),
    findByBlockId: vi.fn(),
    findAll: vi.fn().mockResolvedValue(ok([])),
    delete: vi.fn(),
    saveMany: vi.fn(),
    deleteMany: vi.fn(),
    getXiuyuanIdByCardId: vi.fn(),
  } as unknown as IXiuyuanRepository;
}

function createSiyuanApiMock(): XiuyuanSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    getBlockAttrs: vi.fn(async () => ({})),
    getBlockText: vi.fn(async (blockId: string) => {
      if (blockId === QUESTION_BLOCK_ID) {
        return 'What is spaced repetition?';
      }
      if (blockId === ANSWER_BLOCK_ID) {
        return 'A scheduling method for memory review.';
      }
      return '';
    }),
    addRiffCards: vi.fn().mockResolvedValue({ name: 'deck', size: 1 }),
    sql: vi.fn(),
    getBlockKramdown: vi.fn(),
  };
}

describe('CreateXiuyuanFromBlocksUseCase event publishing', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus(false);
  });

  afterEach(() => {
    eventBus.clear();
  });

  it('publishes CardCreated only after Xiuyuan save succeeds', async () => {
    const order: string[] = [];
    const repo = createRepositoryMock(order);
    const siyuanApi = createSiyuanApiMock();
    const createdCardIds: string[] = [];

    eventBus.subscribe('CardCreated', (event) => {
      order.push(`event:${event.cardId}`);
      createdCardIds.push(event.cardId);
    });

    const useCase = new CreateXiuyuanFromBlocksUseCase(
      repo,
      new Map([[BASIC_TEMPLATE.id, BASIC_TEMPLATE]]),
      { siyuanApi, eventBus }
    );

    const result = await useCase.execute({
      blockIds: [QUESTION_BLOCK_ID, ANSWER_BLOCK_ID],
      templateId: BASIC_TEMPLATE.id,
      fieldMapping: {
        question: QUESTION_BLOCK_ID,
        answer: ANSWER_BLOCK_ID,
      },
      deckId: 'deck-1',
      cardType: 'item',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(createdCardIds).toEqual([result.value.cards[0]?.id]);
    expect(order).toEqual([
      expect.stringMatching(/^save:/),
      `event:${result.value.cards[0]?.id}`,
    ]);
  });
});
