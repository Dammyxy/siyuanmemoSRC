import { describe, expect, it, vi } from 'vitest';
import { resolveSrsCardRenderContract } from '@/core/card/render-contract';
import {
  NativeRiffAdoptionModule,
  type NativeRiffAdoptionReadPort,
  type NativeRiffAdoptionWritePort,
} from '../NativeRiffAdoptionModule';

describe('NativeRiffAdoptionModule', () => {
  it('previews adoption classifications without writing', async () => {
    const base = {
      nativeCardId: 'riff-preview',
      deckId: 'deck-1',
      cardType: 'item',
      templateId: 'builtin-riff-sync',
      scheduling: {},
      reviewHistory: [],
      tags: [],
      priority: 50,
      meta: {
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
      },
    };
    const candidates = [
      {
        ...base,
        cardId: 'card-adoptable',
        xiuyuanId: 'xy-adoptable',
        blockId: 'block-adoptable',
        ownership: 'riff-managed' as const,
      },
      {
        ...base,
        cardId: 'card-local',
        xiuyuanId: 'xy-local',
        blockId: 'block-local',
        ownership: 'local-owned' as const,
      },
      {
        ...base,
        cardId: 'card-source-missing',
        xiuyuanId: 'xy-source-missing',
        blockId: 'block-source-missing',
        ownership: 'riff-managed' as const,
      },
    ];
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => candidates),
      readLiveSourceMarkdown: vi.fn(async blockId => (
        blockId === 'block-adoptable' ? '问题>>答案' : null
      )),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
    });

    const preview = await module.preview();

    expect(preview).toEqual({
      candidates: [
        {
          cardId: 'card-adoptable',
          xiuyuanId: 'xy-adoptable',
          blockId: 'block-adoptable',
          classification: 'adoptable',
        },
        {
          cardId: 'card-local',
          xiuyuanId: 'xy-local',
          blockId: 'block-local',
          classification: 'already-local',
        },
        {
          cardId: 'card-source-missing',
          xiuyuanId: 'xy-source-missing',
          blockId: 'block-source-missing',
          classification: 'source-missing',
          reason: 'native-riff-adoption-source-missing',
        },
      ],
      counts: {
        adoptable: 1,
        alreadyLocal: 1,
        tombstoned: 0,
        legacyExcluded: 0,
        sourceMissing: 1,
        semanticConflict: 0,
      },
    });
    expect(writePort.saveAdoptedRecords).not.toHaveBeenCalled();
  });

  it('previews tombstoned and legacy-excluded adoption candidates without source reads', async () => {
    const base = {
      nativeCardId: 'riff-suppressed',
      deckId: 'deck-1',
      cardType: 'item',
      ownership: 'riff-managed' as const,
      templateId: 'builtin-riff-sync',
      scheduling: {},
      reviewHistory: [],
      tags: [],
      priority: 50,
      meta: {
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
      },
    };
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => [
        {
          ...base,
          cardId: 'card-tombstoned',
          xiuyuanId: 'xy-tombstoned',
          blockId: 'block-tombstoned',
        },
        {
          ...base,
          cardId: 'card-excluded',
          xiuyuanId: 'xy-excluded',
          blockId: 'block-excluded',
        },
      ]),
      readLiveSourceMarkdown: vi.fn(async () => '问题>>答案'),
      hasDeletionTombstone: vi.fn(async candidate => candidate.cardId === 'card-tombstoned'),
      hasLegacyImportExclusion: vi.fn(async candidate => candidate.cardId === 'card-excluded'),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
    });

    const preview = await module.preview();

    expect(preview.candidates).toEqual([
      {
        cardId: 'card-tombstoned',
        xiuyuanId: 'xy-tombstoned',
        blockId: 'block-tombstoned',
        classification: 'tombstoned',
        reason: 'native-riff-adoption-tombstone',
      },
      {
        cardId: 'card-excluded',
        xiuyuanId: 'xy-excluded',
        blockId: 'block-excluded',
        classification: 'legacy-excluded',
        reason: 'native-riff-import-exclusion',
      },
    ]);
    expect(preview.counts).toMatchObject({
      tombstoned: 1,
      legacyExcluded: 1,
    });
    expect(readPort.readLiveSourceMarkdown).not.toHaveBeenCalled();
    expect(writePort.saveAdoptedRecords).not.toHaveBeenCalled();
  });

  it('adopts a riff-managed card in place without changing identity or learning state', async () => {
    const candidate = Object.freeze({
      cardId: 'card-20260610140511-bb340gl',
      xiuyuanId: 'xy_20260610140511-bb340gl',
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      cardType: 'item',
      ownership: 'riff-managed' as const,
      templateId: 'builtin-riff-sync',
      scheduling: Object.freeze({
        due: 1784016000000,
        stability: 5.4,
        difficulty: 6.1,
        reps: 14,
        lapses: 2,
        state: 2,
        lastReview: 1783584000000,
      }),
      reviewHistory: Object.freeze([
        { rating: 3, reviewedAt: 1783497600000 },
        { rating: 2, reviewedAt: 1783584000000 },
      ]),
      tags: Object.freeze(['reflection', 'important']),
      priority: 17,
      meta: Object.freeze({
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
        nativeRiffCompatibility: {
          owner: 'native-riff',
          source: 'riff-sync',
        },
      }),
    });
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => [candidate]),
      readLiveSourceMarkdown: vi.fn(async () => '反思>>反思'),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
      rebuildFromLiveSource: async () => ({
        status: 'ready',
        templateId: 'builtin-quick',
        metaPatch: {
          source: 'symbol',
          symbolDetected: true,
          symbolType: '>>',
        },
        metaDelete: ['nativeRiffCompatibility'],
      }),
    });

    const result = await module.applySelected({
      cardIds: [candidate.cardId],
    });

    expect(writePort.saveAdoptedRecords).toHaveBeenCalledWith([{
      ...candidate,
      ownership: 'local-owned',
      templateId: 'builtin-quick',
      meta: {
        source: 'symbol',
        ownership: 'local-owned',
        templateID: 'builtin-quick',
        symbolDetected: true,
        symbolType: '>>',
      },
    }]);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0]).toMatchObject({
      cardId: candidate.cardId,
      xiuyuanId: candidate.xiuyuanId,
      scheduling: candidate.scheduling,
      reviewHistory: candidate.reviewHistory,
      tags: candidate.tags,
      priority: candidate.priority,
    });
  });

  it('rebuilds the target symbol card from live Markdown into a quick render contract', async () => {
    const candidate = {
      cardId: 'card-20260610140511-bb340gl',
      xiuyuanId: 'xy_20260610140511-bb340gl',
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      cardType: 'item',
      ownership: 'riff-managed' as const,
      templateId: 'builtin-riff-sync',
      scheduling: {},
      reviewHistory: [],
      tags: [],
      priority: 50,
      meta: {
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
        forceProtyleRender: true,
        nativeRiffCompatibility: {
          owner: 'native-riff',
          source: 'riff-sync',
        },
      },
    };
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => [candidate]),
      readLiveSourceMarkdown: vi.fn(async () => '反思>>反思'),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
    });

    const result = await module.applySelected({
      cardIds: [candidate.cardId],
    });
    const adopted = result.adopted[0];
    const renderContract = resolveSrsCardRenderContract({
      card: {
        id: adopted.cardId,
        xiuyuanID: adopted.xiuyuanId,
        blockId: adopted.blockId,
        type: adopted.cardType,
        meta: adopted.meta,
      } as never,
      sourceContent: '反思>>反思',
    });

    expect(adopted).toMatchObject({
      cardId: candidate.cardId,
      xiuyuanId: candidate.xiuyuanId,
      ownership: 'local-owned',
      templateId: 'builtin-quick-card',
      meta: {
        source: 'symbol',
        ownership: 'local-owned',
        templateID: 'builtin-quick-card',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
        quickDetectReason: 'symbol-rule',
      },
    });
    expect(adopted.meta).not.toHaveProperty('forceProtyleRender');
    expect(adopted.meta).not.toHaveProperty('nativeRiffCompatibility');
    expect(renderContract).toMatchObject({
      rendererKind: 'quick',
      renderFamily: 'quick-symbol',
    });
  });

  it('fails closed without writing when live source Markdown is missing', async () => {
    const candidate = {
      cardId: 'card-missing-source',
      xiuyuanId: 'xy-missing-source',
      nativeCardId: 'riff-missing-source',
      deckId: 'deck-1',
      blockId: 'missing-source-block',
      cardType: 'item',
      ownership: 'riff-managed' as const,
      templateId: 'builtin-riff-sync',
      scheduling: { due: 1784016000000 },
      reviewHistory: [{ rating: 3 }],
      tags: ['keep'],
      priority: 19,
      meta: {
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
      },
    };
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => [candidate]),
      readLiveSourceMarkdown: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
    });

    const result = await module.applySelected({
      cardIds: [candidate.cardId],
    });

    expect(writePort.saveAdoptedRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      adopted: [],
      blocked: [{
        cardId: candidate.cardId,
        classification: 'source-missing',
        reason: 'native-riff-adoption-source-missing',
      }],
    });
    expect(candidate).toMatchObject({
      ownership: 'riff-managed',
      templateId: 'builtin-riff-sync',
      scheduling: { due: 1784016000000 },
      reviewHistory: [{ rating: 3 }],
      tags: ['keep'],
      priority: 19,
    });
  });

  it('fails closed when live source grammar cannot be resolved', async () => {
    const candidate = {
      cardId: 'card-invalid-source',
      xiuyuanId: 'xy-invalid-source',
      nativeCardId: 'riff-invalid-source',
      deckId: 'deck-1',
      blockId: 'invalid-source-block',
      cardType: 'item',
      ownership: 'riff-managed' as const,
      templateId: 'builtin-riff-sync',
      scheduling: { due: 1784016000000 },
      reviewHistory: [{ rating: 3 }],
      tags: ['keep'],
      priority: 19,
      meta: {
        source: 'riff-sync',
        ownership: 'riff-managed',
        templateID: 'builtin-riff-sync',
      },
    };
    const readPort: NativeRiffAdoptionReadPort = {
      listCandidates: vi.fn(async () => [candidate]),
      readLiveSourceMarkdown: vi.fn(async () => '普通文本，没有可确定的符号语法'),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffAdoptionWritePort = {
      saveAdoptedRecords: vi.fn(async records => ({
        adopted: records,
      })),
    };
    const module = new NativeRiffAdoptionModule({
      readPort,
      writePort,
    });

    const result = await module.applySelected({
      cardIds: [candidate.cardId],
    });

    expect(writePort.saveAdoptedRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      adopted: [],
      blocked: [{
        cardId: candidate.cardId,
        classification: 'semantic-conflict',
        reason: 'native-riff-adoption-not-applicable',
      }],
    });
    expect(candidate.ownership).toBe('riff-managed');
    expect(candidate.templateId).toBe('builtin-riff-sync');
  });
});
