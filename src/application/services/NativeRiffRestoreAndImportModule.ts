import type {
  NativeRiffImportRestoreCandidate,
  NativeRiffImportRestorePort,
  NativeRiffImportRestoreResult,
} from '@/application/ports/NativeRiffImportRestorePort';
import type {
  NativeRiffImportPreview,
  NativeRiffImportPreviewCandidate,
} from './NativeRiffImportModule';

type NativeRiffImportApplyResult = Readonly<{
  createdCardIds: readonly string[];
  createdCount: number;
  skippedCount: number;
}>;

export interface NativeRiffRestoreImportModulePort {
  preview(): Promise<NativeRiffImportPreview>;
  applySelected(input: {
    logicalKeys: readonly string[];
  }): Promise<NativeRiffImportApplyResult>;
}

export type NativeRiffRestoreAndImportModuleDeps = Readonly<{
  restorePort: NativeRiffImportRestorePort;
  importModule: NativeRiffRestoreImportModulePort;
}>;

export class NativeRiffRestoreAndImportModule {
  constructor(private readonly deps: NativeRiffRestoreAndImportModuleDeps) {}

  async restoreAndImport(input: {
    candidates: readonly NativeRiffImportRestoreCandidate[];
  }): Promise<Readonly<{
    restored: readonly Readonly<{
      candidate: NativeRiffImportRestoreCandidate;
      removedExclusion: boolean;
      removedCardTombstoneIds: readonly string[];
      removedXiuyuanTombstoneIds: readonly string[];
    }>[];
    importResult: NativeRiffImportApplyResult;
  }>> {
    const restored = [];
    for (const candidate of input.candidates) {
      const result = await this.deps.restorePort.restoreCandidate(candidate);
      restored.push(toRestoredCandidate(candidate, result));
    }

    const selectedCandidates = new Set(input.candidates.map(candidateIdentity));
    const preview = await this.deps.importModule.preview();
    const logicalKeys = preview.candidates
      .filter(isImportableCandidate)
      .filter(candidate => selectedCandidates.has(candidateIdentity(candidate)))
      .map(candidate => candidate.logicalKey);

    const importResult = await this.deps.importModule.applySelected({
      logicalKeys: [...new Set(logicalKeys)],
    });

    return {
      restored,
      importResult,
    };
  }
}

function toRestoredCandidate(
  candidate: NativeRiffImportRestoreCandidate,
  result: NativeRiffImportRestoreResult,
) {
  return {
    candidate,
    removedExclusion: result.removedExclusion,
    removedCardTombstoneIds: result.removedCardTombstoneIds,
    removedXiuyuanTombstoneIds: result.removedXiuyuanTombstoneIds,
  };
}

function isImportableCandidate(
  candidate: NativeRiffImportPreviewCandidate,
): candidate is Extract<NativeRiffImportPreviewCandidate, { classification: 'importable' }> {
  return candidate.classification === 'importable';
}

function candidateIdentity(candidate: {
  blockId: string;
  nativeCardId: string;
  deckId?: string;
}): string {
  return `${candidate.nativeCardId}\u0000${candidate.deckId ?? ''}\u0000${candidate.blockId}`;
}
