import { describe, expect, it, vi } from 'vitest';
import type { NativeRiffImportSourcePort } from '@/application/ports/NativeRiffImportSourcePort';
import {
  NativeRiffImportModule,
  type NativeRiffImportLocalReadPort,
  type NativeRiffImportWritePort,
} from '../NativeRiffImportModule';

describe('NativeRiffImportModule', () => {
  it('previews an importable face without mutating source or local state', async () => {
    const sourceCard = Object.freeze({
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      sourceMarkdown: '反思>>反思',
    });
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [sourceCard]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [{
          logicalKey: 'block:20260610140511-bb340gl::face:0',
          faceIndex: 0,
        }],
      }),
    });

    await expect(module.preview()).resolves.toEqual({
      candidates: [{
        classification: 'importable',
        nativeCardId: '20260610192850-rzrmc29',
        deckId: 'deck-1',
        blockId: '20260610140511-bb340gl',
        logicalKey: 'block:20260610140511-bb340gl::face:0',
        faceIndex: 0,
      }],
      counts: {
        importable: 1,
        alreadyOwned: 0,
        existingNeedsRepair: 0,
        tombstoned: 0,
        legacyExcluded: 0,
        semanticConflict: 0,
      },
    });
    expect(sourceCard).toEqual({
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      sourceMarkdown: '反思>>反思',
    });
    expect(localRead.findByImportReceipt).toHaveBeenCalledWith({
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
    });
    expect(localRead.findByLogicalKey).toHaveBeenCalledWith(
      'block:20260610140511-bb340gl::face:0',
    );
  });

  it('classifies an import receipt match as already-owned', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-owned',
        deckId: 'deck-1',
        blockId: '20260610140511-bb340gl',
        sourceMarkdown: '反思>>反思',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => ({
        cardId: 'local-card-1',
        logicalKey: 'block:20260610140511-bb340gl::face:0',
        ownership: 'local-owned',
      })),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [{
          logicalKey: 'block:20260610140511-bb340gl::face:0',
          faceIndex: 0,
        }],
      }),
    });

    const preview = await module.preview();

    expect(preview.candidates).toEqual([{
      classification: 'already-owned',
      nativeCardId: 'riff-owned',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      logicalKey: 'block:20260610140511-bb340gl::face:0',
      faceIndex: 0,
      existingCardId: 'local-card-1',
    }]);
    expect(preview.counts).toEqual({
      importable: 0,
      alreadyOwned: 1,
      existingNeedsRepair: 0,
      tombstoned: 0,
      legacyExcluded: 0,
      semanticConflict: 0,
    });
    expect(localRead.findByLogicalKey).not.toHaveBeenCalled();
  });

  it('uses receipt identity only for its matching face and still creates missing faces', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-multi-receipt',
        deckId: 'deck-1',
        blockId: 'multi-receipt-block',
        sourceMarkdown: '一<>二',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => ({
        cardId: 'local-face-0',
        logicalKey: 'block:multi-receipt-block::face:0',
        ownership: 'local-owned',
      })),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async plans => ({
        createdCardIds: plans.map(plan => `created:${plan.logicalKey}`),
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [
          {
            logicalKey: 'block:multi-receipt-block::face:0',
            faceIndex: 0,
          },
          {
            logicalKey: 'block:multi-receipt-block::face:1',
            faceIndex: 1,
          },
        ],
      }),
    });

    const result = await module.applySelected({
      logicalKeys: [
        'block:multi-receipt-block::face:0',
        'block:multi-receipt-block::face:1',
      ],
    });

    expect(writePort.createImportedFaces).toHaveBeenCalledWith([
      expect.objectContaining({
        logicalKey: 'block:multi-receipt-block::face:1',
        faceIndex: 1,
      }),
    ]);
    expect(result).toEqual({
      createdCardIds: ['created:block:multi-receipt-block::face:1'],
      createdCount: 1,
      skippedCount: 1,
    });
  });

  it('classifies a deletion tombstone before semantic or ownership reads', async () => {
    const sourceCard = {
      nativeCardId: 'riff-tombstoned',
      deckId: 'deck-1',
      blockId: '20260610140511-tombstn',
      sourceMarkdown: '已删除>>不要恢复',
    };
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [sourceCard]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => true),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const resolveSemanticFaces = vi.fn(async () => ({
      status: 'resolved' as const,
      faces: [{
        logicalKey: 'block:20260610140511-tombstn::face:0',
        faceIndex: 0,
      }],
    }));
    const module = new NativeRiffImportModule({
      source,
      localRead,
      resolveSemanticFaces,
    });

    const preview = await module.preview();

    expect(preview.candidates).toEqual([{
      classification: 'tombstoned',
      nativeCardId: 'riff-tombstoned',
      deckId: 'deck-1',
      blockId: '20260610140511-tombstn',
      reason: 'native-riff-import-tombstone',
    }]);
    expect(preview.counts.tombstoned).toBe(1);
    expect(resolveSemanticFaces).not.toHaveBeenCalled();
    expect(localRead.findByImportReceipt).not.toHaveBeenCalled();
    expect(localRead.findByLogicalKey).not.toHaveBeenCalled();
  });

  it('classifies a migrated legacy blacklist entry as legacy-excluded', async () => {
    const sourceCard = {
      nativeCardId: 'riff-excluded',
      deckId: 'deck-1',
      blockId: '20260610140511-exclude',
      sourceMarkdown: '排除>>不导入',
    };
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [sourceCard]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => true),
    };
    const resolveSemanticFaces = vi.fn(async () => ({
      status: 'resolved' as const,
      faces: [{
        logicalKey: 'block:20260610140511-exclude::face:0',
        faceIndex: 0,
      }],
    }));
    const module = new NativeRiffImportModule({
      source,
      localRead,
      resolveSemanticFaces,
    });

    const preview = await module.preview();

    expect(preview.candidates).toEqual([{
      classification: 'legacy-excluded',
      nativeCardId: 'riff-excluded',
      deckId: 'deck-1',
      blockId: '20260610140511-exclude',
      reason: 'native-riff-import-exclusion',
    }]);
    expect(preview.counts.legacyExcluded).toBe(1);
    expect(resolveSemanticFaces).not.toHaveBeenCalled();
    expect(localRead.findByImportReceipt).not.toHaveBeenCalled();
  });

  it('classifies unresolved live semantics as a semantic conflict', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-conflict',
        deckId: 'deck-1',
        blockId: '20260610140511-conflict',
        sourceMarkdown: '无法确定的旧内容',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      resolveSemanticFaces: async () => ({
        status: 'conflict',
        reason: 'unsupported-or-ambiguous-grammar',
      }),
    });

    const preview = await module.preview();

    expect(preview.candidates).toEqual([{
      classification: 'semantic-conflict',
      nativeCardId: 'riff-conflict',
      deckId: 'deck-1',
      blockId: '20260610140511-conflict',
      reason: 'unsupported-or-ambiguous-grammar',
    }]);
    expect(preview.counts.semanticConflict).toBe(1);
    expect(localRead.findByImportReceipt).not.toHaveBeenCalled();
    expect(localRead.findByLogicalKey).not.toHaveBeenCalled();
  });

  it('creates only missing semantic faces and preserves existing local learning state', async () => {
    const existingFace0 = Object.freeze({
      cardId: 'local-face-0',
      logicalKey: 'block:multi-face::face:0',
      ownership: 'local-owned' as const,
      due: '2026-07-20T00:00:00.000Z',
      reps: 12,
      reviewHistory: Object.freeze([{ rating: 3, reviewedAt: 100 }]),
    });
    const existingFace1 = Object.freeze({
      cardId: 'local-face-1',
      logicalKey: 'block:multi-face::face:1',
      ownership: 'local-owned' as const,
      due: '2026-07-21T00:00:00.000Z',
      reps: 8,
      reviewHistory: Object.freeze([{ rating: 2, reviewedAt: 200 }]),
    });
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-multi-face',
        deckId: 'deck-1',
        blockId: 'multi-face',
        sourceMarkdown: '一<>二',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async (logicalKey: string) => {
        if (logicalKey === existingFace0.logicalKey) return existingFace0;
        if (logicalKey === existingFace1.logicalKey) return existingFace1;
        return null;
      }),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async plans => ({
        createdCardIds: plans.map(plan => `created:${plan.logicalKey}`),
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [
          { logicalKey: existingFace0.logicalKey, faceIndex: 0 },
          { logicalKey: existingFace1.logicalKey, faceIndex: 1 },
          { logicalKey: 'block:multi-face::face:2', faceIndex: 2 },
        ],
      }),
    });

    const result = await module.applySelected({
      logicalKeys: [
        existingFace0.logicalKey,
        existingFace1.logicalKey,
        'block:multi-face::face:2',
      ],
    });

    expect(writePort.createImportedFaces).toHaveBeenCalledWith([expect.objectContaining({
      nativeCardId: 'riff-multi-face',
      deckId: 'deck-1',
      blockId: 'multi-face',
      sourceMarkdown: '一<>二',
      logicalKey: 'block:multi-face::face:2',
      faceIndex: 2,
    })]);
    expect(result).toEqual({
      createdCardIds: ['created:block:multi-face::face:2'],
      createdCount: 1,
      skippedCount: 2,
    });
    expect(existingFace0).toEqual({
      cardId: 'local-face-0',
      logicalKey: 'block:multi-face::face:0',
      ownership: 'local-owned',
      due: '2026-07-20T00:00:00.000Z',
      reps: 12,
      reviewHistory: [{ rating: 3, reviewedAt: 100 }],
    });
    expect(existingFace1).toEqual({
      cardId: 'local-face-1',
      logicalKey: 'block:multi-face::face:1',
      ownership: 'local-owned',
      due: '2026-07-21T00:00:00.000Z',
      reps: 8,
      reviewHistory: [{ rating: 2, reviewedAt: 200 }],
    });
  });

  it('seeds scheduling only for a newly imported face', async () => {
    const schedule = Object.freeze({
      due: '2026-07-15T00:00:00.000Z',
      state: 2,
      stability: 4.5,
      difficulty: 6.2,
      reps: 9,
      lapses: 1,
      lastReview: '2026-07-10T00:00:00.000Z',
    });
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [
        {
          nativeCardId: 'riff-new',
          deckId: 'deck-1',
          blockId: 'new-block',
          sourceMarkdown: '新问题>>新答案',
          schedule,
        },
        {
          nativeCardId: 'riff-existing',
          deckId: 'deck-1',
          blockId: 'existing-block',
          sourceMarkdown: '旧问题>>旧答案',
          schedule,
        },
      ]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async (logicalKey: string) => (
        logicalKey === 'block:existing-block::face:0'
          ? {
              cardId: 'local-existing',
              logicalKey,
              ownership: 'local-owned',
            }
          : null
      )),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async () => ({
        createdCardIds: ['local-new'],
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      resolveSemanticFaces: async candidate => ({
        status: 'resolved',
        faces: [{
          logicalKey: `block:${candidate.blockId}::face:0`,
          faceIndex: 0,
        }],
      }),
    });

    const result = await module.applySelected({
      logicalKeys: [
        'block:new-block::face:0',
        'block:existing-block::face:0',
      ],
    });

    expect(writePort.createImportedFaces).toHaveBeenCalledWith([expect.objectContaining({
      nativeCardId: 'riff-new',
      deckId: 'deck-1',
      blockId: 'new-block',
      sourceMarkdown: '新问题>>新答案',
      logicalKey: 'block:new-block::face:0',
      faceIndex: 0,
      scheduleSeed: schedule,
    })]);
    expect(result).toEqual({
      createdCardIds: ['local-new'],
      createdCount: 1,
      skippedCount: 1,
    });
  });

  it('omits an invalid Native Riff schedule seed', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-invalid-schedule',
        deckId: 'deck-1',
        blockId: 'invalid-schedule-block',
        sourceMarkdown: '问题>>答案',
        schedule: {
          due: 'not-a-date',
          state: 2,
          stability: 4.5,
          difficulty: 6.2,
          reps: 9,
          lapses: 1,
        },
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async () => ({
        createdCardIds: ['local-new'],
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [{
          logicalKey: 'block:invalid-schedule-block::face:0',
          faceIndex: 0,
        }],
      }),
    });

    await module.applySelected({
      logicalKeys: ['block:invalid-schedule-block::face:0'],
    });

    expect(writePort.createImportedFaces).toHaveBeenCalledWith([expect.objectContaining({
      nativeCardId: 'riff-invalid-schedule',
      deckId: 'deck-1',
      blockId: 'invalid-schedule-block',
      sourceMarkdown: '问题>>答案',
      logicalKey: 'block:invalid-schedule-block::face:0',
      faceIndex: 0,
    })]);
  });

  it('creates an immutable Native Riff import receipt for a new face', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-receipt',
        deckId: 'deck-receipt',
        blockId: 'receipt-block',
        sourceMarkdown: '问题>>答案',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async () => null),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async () => ({
        createdCardIds: ['local-receipt'],
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      now: () => 1_788_537_600_000,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [{
          logicalKey: 'block:receipt-block::face:0',
          faceIndex: 0,
        }],
      }),
    });

    await module.applySelected({
      logicalKeys: ['block:receipt-block::face:0'],
    });

    const plan = vi.mocked(writePort.createImportedFaces).mock.calls[0]?.[0]?.[0];
    expect(plan?.importReceipt).toEqual({
      version: 1,
      nativeCardId: 'riff-receipt',
      deckId: 'deck-receipt',
      importedAt: 1_788_537_600_000,
    });
    expect(Object.isFrozen(plan?.importReceipt)).toBe(true);
  });

  it('reports existing-needs-repair without mutating a local-owned card', async () => {
    const source: NativeRiffImportSourcePort = {
      listImportCandidates: vi.fn(async () => [{
        nativeCardId: 'riff-needs-repair',
        deckId: 'deck-1',
        blockId: 'needs-repair-block',
        sourceMarkdown: '问题>>答案',
      }]),
    };
    const localRead: NativeRiffImportLocalReadPort = {
      findByImportReceipt: vi.fn(async () => null),
      findByLogicalKey: vi.fn(async logicalKey => ({
        cardId: 'local-needs-repair',
        logicalKey,
        ownership: 'local-owned',
        needsSemanticRepair: true,
      })),
      hasDeletionTombstone: vi.fn(async () => false),
      hasLegacyImportExclusion: vi.fn(async () => false),
    };
    const writePort: NativeRiffImportWritePort = {
      createImportedFaces: vi.fn(async () => ({
        createdCardIds: [],
      })),
    };
    const module = new NativeRiffImportModule({
      source,
      localRead,
      writePort,
      resolveSemanticFaces: async () => ({
        status: 'resolved',
        faces: [{
          logicalKey: 'block:needs-repair-block::face:0',
          faceIndex: 0,
        }],
      }),
    });

    const preview = await module.preview();
    const applyResult = await module.applySelected({
      logicalKeys: ['block:needs-repair-block::face:0'],
    });

    expect(preview.candidates).toEqual([{
      classification: 'existing-needs-repair',
      nativeCardId: 'riff-needs-repair',
      deckId: 'deck-1',
      blockId: 'needs-repair-block',
      logicalKey: 'block:needs-repair-block::face:0',
      faceIndex: 0,
      existingCardId: 'local-needs-repair',
      reason: 'local-owned-semantic-repair-required',
    }]);
    expect(preview.counts.existingNeedsRepair).toBe(1);
    expect(writePort.createImportedFaces).not.toHaveBeenCalled();
    expect(applyResult).toEqual({
      createdCardIds: [],
      createdCount: 0,
      skippedCount: 1,
    });
  });
});
