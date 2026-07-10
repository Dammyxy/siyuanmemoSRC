import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
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
  it('finalizes ordinary SiYuanMemo-owned creation without a Native Riff dependency', async () => {
    const xiuyuan = createXiuyuan('xy_20260101000000-abcde03', '20260101000000-abcde03');
    const save = vi.fn(async () => ok(undefined));
    const repo = { save } as unknown as IXiuyuanRepository;

    const result = await finalizeXiuyuanCreation({
      xiuyuan,
      xiuyuanRepository: repo,
      eventBus: new EventBus(false),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never registers Native Riff cards after local persistence', async () => {
    const xiuyuan = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
    const save = vi.fn(async () => ok(undefined));
    const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 1 }));
    const repo = { save } as unknown as IXiuyuanRepository;
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
      source: 'template-creation',
    });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(addRiffCards).not.toHaveBeenCalled();
  });

  it('records batch performance counters for one-click creation diagnostics', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    try {
      const first = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
      const second = createXiuyuan('xy_20260101000000-abcde02', '20260101000000-abcde02');
      const repo = {
        saveMany: vi.fn(async () => ok(undefined)),
      } as unknown as IXiuyuanRepository;
      const eventBus = new EventBus(false);
      eventBus.subscribe('CardsCreated', () => undefined);

      const result = await finalizeXiuyuanCreationBatch({
        items: [
          {
            xiuyuan: first,
            source: 'doc-oneclick-scan',
          },
          {
            xiuyuan: second,
            source: 'doc-oneclick-scan',
          },
        ],
        xiuyuanRepository: repo,
        eventBus,
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      });

      expect(result.ok).toBe(true);
      const report = getRuntimePerformanceDiagnosticsReport();
      expect(report.counters).not.toHaveProperty('autocard.riff-batch-calls');
      expect(report.counters).not.toHaveProperty('autocard.riff-batch-blocks');
      expect(report.counters['autocard.storage-save-many-calls']).toBe(1);
      expect(report.counters['autocard.storage-save-many-items']).toBe(2);
      expect(report.counters['autocard.event-batch-notifications']).toBe(1);
    } finally {
      clearRuntimePerformanceDiagnostics();
      setRuntimePerformanceDiagnosticsEnabled(false, { reset: false });
    }
  });

  it('persists a batch once and publishes one aggregate creation event', async () => {
    const first = createXiuyuan('xy_20260101000000-abcde01', '20260101000000-abcde01');
    const second = createXiuyuan('xy_20260101000000-abcde02', '20260101000000-abcde02');
    const saveMany = vi.fn(async () => ok(undefined));
    const repo = { saveMany } as unknown as IXiuyuanRepository;
    const eventBus = new EventBus(false);
    const events: string[][] = [];
    eventBus.subscribe('CardsCreated', (event: CardsCreatedEvent) => {
      events.push(event.cardIds);
    });

    const result = await finalizeXiuyuanCreationBatch({
      items: [
        {
          xiuyuan: first,
          source: 'doc-oneclick-scan',
        },
        {
          xiuyuan: second,
          source: 'doc-oneclick-scan',
        },
      ],
      xiuyuanRepository: repo,
      eventBus,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(result.ok).toBe(true);
    expect(saveMany).toHaveBeenCalledTimes(1);
    expect(saveMany).toHaveBeenCalledWith([first, second]);
    expect(events).toEqual([
      ['card_xy_20260101000000-abcde01_0', 'card_xy_20260101000000-abcde02_0'],
    ]);
  });
});
