import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { CardsCreatedEvent } from '@/core/xiuyuan/domain/events';
import { finalizeXiuyuanCreation, finalizeXiuyuanCreationBatch } from '../FinalizeXiuyuanCreation';
import {
  clearRuntimePerformanceDiagnostics,
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createXiuyuan(id: string, blockId: string): Xiuyuan {
  return unwrap(Xiuyuan.create({
    id: unwrap(XiuyuanId.create(id)),
    blockIDs: [unwrap(BlockId.create(blockId))],
    templateID: unwrap(TemplateId.create('builtin-quick-card')),
    faces: [unwrap(CardFace.create({
      question: `Question ${blockId}`,
      answer: `Answer ${blockId}`,
      questionBlockId: blockId,
      answerBlockId: blockId,
    }))],
  }));
}

describe('finalizeXiuyuanCreationBatch', () => {
  it('skips native Riff registration for ordinary SiYuanMemo-owned creation', async () => {
    const xiuyuan = createXiuyuan('xy_20260101000000-abcde03', '20260101000000-abcde03');
    const save = vi.fn(async () => ok(undefined));
    const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 1 }));
    const repo = { save } as unknown as IXiuyuanRepository;
    const siyuanApi = {
      BUILTIN_DECK_ID: 'builtin-deck',
      addRiffCards,
    } as unknown as XiuyuanSiyuanPort;

    const result = await finalizeXiuyuanCreation({
      xiuyuan,
      xiuyuanRepository: repo,
      eventBus: new EventBus(false),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      siyuanApi,
      riff: {
        deckId: 'deck-1',
        blockIds: ['20260101000000-abcde03'],
        source: 'template-creation',
      },
    });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(addRiffCards).not.toHaveBeenCalled();
  });

  it('persists single Xiuyuan before registering native Riff cards', async () => {
    const xiuyuan = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
    const save = vi.fn(async () => ok(undefined));
    const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 1 }));
    const repo = { save } as unknown as IXiuyuanRepository;
    const siyuanApi = {
      BUILTIN_DECK_ID: 'builtin-deck',
      addRiffCards,
    } as unknown as XiuyuanSiyuanPort;
    const eventBus = new EventBus(false);

    const result = await finalizeXiuyuanCreation({
      xiuyuan,
      xiuyuanRepository: repo,
      eventBus,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      siyuanApi,
      riff: {
        deckId: 'deck-1',
        blockIds: ['20260101000000-abcde01'],
        source: 'template-creation',
        action: 'explicit-native-riff-compatibility',
      },
    });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(addRiffCards).toHaveBeenCalledTimes(1);
    expect(save.mock.invocationCallOrder[0])
      .toBeLessThan(addRiffCards.mock.invocationCallOrder[0]);
  });

  it('records batch performance counters for one-click creation diagnostics', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    try {
      const first = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
      const second = createXiuyuan('xy_20260101000000-abcde02', '20260101000000-abcde02');
      const repo = {
        saveMany: vi.fn(async () => ok(undefined)),
      } as unknown as IXiuyuanRepository;
      const siyuanApi = {
        BUILTIN_DECK_ID: 'builtin-deck',
        addRiffCards: vi.fn(async () => ({ name: 'deck', size: 2 })),
      } as unknown as XiuyuanSiyuanPort;
      const eventBus = new EventBus(false);
      eventBus.subscribe('CardsCreated', () => undefined);

      const result = await finalizeXiuyuanCreationBatch({
        items: [
          {
            xiuyuan: first,
            source: 'doc-oneclick-scan',
            riff: {
              deckId: 'deck-1',
              blockIds: ['20260101000000-abcde01'],
              source: 'doc-oneclick-scan',
              action: 'explicit-native-riff-compatibility',
            },
          },
          {
            xiuyuan: second,
            source: 'doc-oneclick-scan',
            riff: {
              deckId: 'deck-1',
              blockIds: ['20260101000000-abcde02'],
              source: 'doc-oneclick-scan',
              action: 'explicit-native-riff-compatibility',
            },
          },
        ],
        xiuyuanRepository: repo,
        eventBus,
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        siyuanApi,
      });

      expect(result.ok).toBe(true);
      const report = getRuntimePerformanceDiagnosticsReport();
      expect(report.counters['autocard.riff-batch-calls']).toBe(1);
      expect(report.counters['autocard.riff-batch-blocks']).toBe(2);
      expect(report.counters['autocard.storage-save-many-calls']).toBe(1);
      expect(report.counters['autocard.storage-save-many-items']).toBe(2);
      expect(report.counters['autocard.event-batch-notifications']).toBe(1);
    } finally {
      clearRuntimePerformanceDiagnostics();
      setRuntimePerformanceDiagnosticsEnabled(false, { reset: false });
    }
  });

  it('coalesces same-deck Riff registration and repository persistence', async () => {
    const first = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
    const second = createXiuyuan('xy_20260101000000-abcde02', '20260101000000-abcde02');
    const saveMany = vi.fn(async () => ok(undefined));
    const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 2 }));
    const repo = { saveMany } as unknown as IXiuyuanRepository;
    const siyuanApi = {
      BUILTIN_DECK_ID: 'builtin-deck',
      addRiffCards,
    } as unknown as XiuyuanSiyuanPort;
    const eventBus = new EventBus(false);
    const events: string[][] = [];
    eventBus.subscribe('CardsCreated', (event: CardsCreatedEvent) => {
      events.push(event.cardIds);
    });

    const result = await finalizeXiuyuanCreationBatch({
      items: [
        {
          xiuyuan: first,
          riff: {
            deckId: 'deck-1',
            blockIds: ['20260101000000-abcde01'],
            source: 'doc-oneclick-scan',
            action: 'explicit-native-riff-compatibility',
          },
        },
        {
          xiuyuan: second,
          riff: {
            deckId: 'deck-1',
            blockIds: ['20260101000000-abcde02'],
            source: 'doc-oneclick-scan',
            action: 'explicit-native-riff-compatibility',
          },
        },
      ],
      xiuyuanRepository: repo,
      eventBus,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      siyuanApi,
    });

    expect(result.ok).toBe(true);
    expect(addRiffCards).toHaveBeenCalledTimes(1);
    expect(addRiffCards).toHaveBeenCalledWith('deck-1', [
      '20260101000000-abcde01',
      '20260101000000-abcde02',
    ]);
    expect(saveMany).toHaveBeenCalledTimes(1);
    expect(saveMany).toHaveBeenCalledWith([first, second]);
    expect(saveMany.mock.invocationCallOrder[0])
      .toBeLessThan(addRiffCards.mock.invocationCallOrder[0]);
    expect(events).toEqual([
      ['card_xy_20260101000000-abcde01_0', 'card_xy_20260101000000-abcde02_0'],
    ]);
  });
});
