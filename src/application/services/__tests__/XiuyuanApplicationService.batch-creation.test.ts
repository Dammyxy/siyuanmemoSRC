import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { XiuyuanApplicationService } from '../XiuyuanApplicationService';

const BASIC_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: 'Quick Card',
  category: 'basic',
  fields: [{ name: 'content' }],
  cardRules: [
    {
      typeMarker: 'default',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};

const BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional-single',
  name: 'Bidirectional Card',
  category: 'basic',
  fields: [{ name: 'content' }],
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['content'],
      backFields: ['content'],
    },
    {
      typeMarker: 'reverse',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};

function must<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createExistingXiuyuan(blockId: string): Xiuyuan {
  return must(Xiuyuan.create({
    id: must(XiuyuanId.create(`xy_${blockId}`)),
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create(BASIC_TEMPLATE.id)),
    faces: [must(CardFace.create({
      question: `Question ${blockId}`,
      answer: `Answer ${blockId}`,
      questionBlockId: blockId,
      answerBlockId: blockId,
    }))],
  }));
}

describe('XiuyuanApplicationService batch creation', () => {
  it('tracks created and skipped counts without native Riff registration for ordinary batch creation', async () => {
    const existingBlockId = '20260101000000-abcde02';
    const existingXiuyuan = createExistingXiuyuan(existingBlockId);
    const repo = {
      findById: vi.fn(async (id: XiuyuanId) => {
        return id.getValue() === `xy_${existingBlockId}` ? ok(existingXiuyuan) : ok(null);
      }),
      saveMany: vi.fn(async () => ok(undefined)),
    } as unknown as IXiuyuanRepository;
    const siyuanApi = {
      BUILTIN_DECK_ID: 'builtin-deck',
      getBlockAttrs: vi.fn(async () => ({})),
      getBlockText: vi.fn(async (blockId: string) => `Text for ${blockId}`),
      addRiffCards: vi.fn(async () => ({ name: 'deck', size: 2 })),
    } as unknown as XiuyuanSiyuanPort;
    const service = new XiuyuanApplicationService(
      repo,
      new Map([[BASIC_TEMPLATE.id, BASIC_TEMPLATE]]),
      new EventBus(false),
      siyuanApi,
    );

    const result = await service.createFromBlocksBatch([
      {
        blockIds: ['20260101000000-abcde01'],
        templateId: BASIC_TEMPLATE.id,
        fieldMapping: { content: '20260101000000-abcde01' },
        deckId: 'deck-1',
        cardType: 'item',
        source: 'doc-scan',
      },
      {
        blockIds: [existingBlockId],
        templateId: BASIC_TEMPLATE.id,
        fieldMapping: { content: existingBlockId },
        deckId: 'deck-1',
        cardType: 'item',
        source: 'doc-scan',
        duplicatePolicy: 'reuse-existing',
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.createdCount).toBe(1);
    expect(result.ok && result.value.skippedCount).toBe(1);
    expect(siyuanApi.addRiffCards).not.toHaveBeenCalled();
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
    expect(result.ok && result.value.payloads).toHaveLength(2);
  });

  it('creates bidirectional template cards inside the same local batch persistence path', async () => {
    const repo = {
      findById: vi.fn(async () => ok(null)),
      saveMany: vi.fn(async () => ok(undefined)),
    } as unknown as IXiuyuanRepository;
    const siyuanApi = {
      BUILTIN_DECK_ID: 'builtin-deck',
      getBlockAttrs: vi.fn(async () => ({})),
      getBlockText: vi.fn(async (blockId: string) => `Text for ${blockId}`),
      addRiffCards: vi.fn(async () => ({ name: 'deck', size: 1 })),
    } as unknown as XiuyuanSiyuanPort;
    const service = new XiuyuanApplicationService(
      repo,
      new Map([
        [BASIC_TEMPLATE.id, BASIC_TEMPLATE],
        [BIDIRECTIONAL_TEMPLATE.id, BIDIRECTIONAL_TEMPLATE],
      ]),
      new EventBus(false),
      siyuanApi,
    );

    const result = await service.createFromBlocksBatch([
      {
        blockIds: ['20260101000000-abcde03'],
        templateId: BIDIRECTIONAL_TEMPLATE.id,
        fieldMapping: { content: '20260101000000-abcde03' },
        deckId: 'deck-1',
        cardType: 'item',
        source: 'doc-oneclick-scan',
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.createdCount).toBe(1);
    expect(result.ok && result.value.payloads[0]?.cards).toHaveLength(2);
    expect(siyuanApi.addRiffCards).not.toHaveBeenCalled();
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
  });
});
