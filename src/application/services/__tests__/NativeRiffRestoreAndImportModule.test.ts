import { describe, expect, it, vi } from 'vitest';
import type { NativeRiffImportRestorePort } from '@/application/ports/NativeRiffImportRestorePort';
import { NativeRiffRestoreAndImportModule } from '../NativeRiffRestoreAndImportModule';

describe('NativeRiffRestoreAndImportModule', () => {
  it('restores only selected candidates and imports only their newly importable faces', async () => {
    const restorePort: NativeRiffImportRestorePort = {
      restoreCandidate: vi.fn(async candidate => ({
        removedExclusion: candidate.blockId === 'selected-block',
        removedCardTombstoneIds: candidate.blockId === 'selected-block'
          ? ['deleted-card-selected']
          : [],
        removedXiuyuanTombstoneIds: [],
      })),
    };
    const importModule = {
      preview: vi.fn(async () => ({
        candidates: [
          {
            classification: 'importable' as const,
            nativeCardId: 'riff-selected',
            deckId: 'deck-1',
            blockId: 'selected-block',
            logicalKey: 'block:selected-block::face:0',
            faceIndex: 0,
          },
          {
            classification: 'importable' as const,
            nativeCardId: 'riff-unselected',
            deckId: 'deck-1',
            blockId: 'unselected-block',
            logicalKey: 'block:unselected-block::face:0',
            faceIndex: 0,
          },
        ],
        counts: {
          importable: 2,
          alreadyOwned: 0,
          existingNeedsRepair: 0,
          tombstoned: 0,
          legacyExcluded: 0,
          semanticConflict: 0,
        },
      })),
      applySelected: vi.fn(async () => ({
        createdCardIds: ['created-selected'],
        createdCount: 1,
        skippedCount: 0,
      })),
    };
    const module = new NativeRiffRestoreAndImportModule({
      restorePort,
      importModule,
    });

    const result = await module.restoreAndImport({
      candidates: [{
        blockId: 'selected-block',
        nativeCardId: 'riff-selected',
        deckId: 'deck-1',
      }],
    });

    expect(restorePort.restoreCandidate).toHaveBeenCalledTimes(1);
    expect(importModule.applySelected).toHaveBeenCalledWith({
      logicalKeys: ['block:selected-block::face:0'],
    });
    expect(result).toEqual({
      restored: [{
        candidate: {
          blockId: 'selected-block',
          nativeCardId: 'riff-selected',
          deckId: 'deck-1',
        },
        removedExclusion: true,
        removedCardTombstoneIds: ['deleted-card-selected'],
        removedXiuyuanTombstoneIds: [],
      }],
      importResult: {
        createdCardIds: ['created-selected'],
        createdCount: 1,
        skippedCount: 0,
      },
    });
  });
});
