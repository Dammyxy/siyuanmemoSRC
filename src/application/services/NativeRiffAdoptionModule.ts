import { resolveRiffSymbolRenderRepair } from '@/core/card/render-contract';

export type NativeRiffAdoptionCandidate = Readonly<{
  cardId: string;
  xiuyuanId: string;
  nativeCardId: string;
  deckId: string;
  blockId: string;
  cardType: string;
  ownership: 'riff-managed' | 'local-owned';
  templateId: string;
  scheduling: Readonly<Record<string, unknown>>;
  reviewHistory: readonly unknown[];
  tags: readonly string[];
  priority: number;
  meta: Readonly<Record<string, unknown>>;
}>;

export interface NativeRiffAdoptionReadPort {
  listCandidates(): Promise<readonly NativeRiffAdoptionCandidate[]>;
  readLiveSourceMarkdown(blockId: string): Promise<string | null>;
  hasDeletionTombstone(candidate: NativeRiffAdoptionCandidate): Promise<boolean>;
  hasLegacyImportExclusion(candidate: NativeRiffAdoptionCandidate): Promise<boolean>;
}

export interface NativeRiffAdoptionWritePort {
  saveAdoptedRecords(
    records: readonly NativeRiffAdoptionCandidate[],
  ): Promise<Readonly<{ adopted: readonly NativeRiffAdoptionCandidate[] }>>;
}

export type NativeRiffAdoptionSemanticRebuild =
  | Readonly<{
      status: 'ready';
      templateId: string;
      metaPatch: Readonly<Record<string, unknown>>;
      metaDelete?: readonly string[];
    }>
  | Readonly<{
      status: 'conflict';
      reason: string;
    }>;

export type NativeRiffAdoptionModuleDeps = Readonly<{
  readPort: NativeRiffAdoptionReadPort;
  writePort: NativeRiffAdoptionWritePort;
  rebuildFromLiveSource?: (input: {
    candidate: NativeRiffAdoptionCandidate;
    sourceMarkdown: string;
  }) => Promise<NativeRiffAdoptionSemanticRebuild>;
}>;

export type NativeRiffAdoptionBlockedResult = Readonly<{
  cardId: string;
  classification:
    | 'tombstoned'
    | 'legacy-excluded'
    | 'source-missing'
    | 'semantic-conflict';
  reason: string;
}>;

export type NativeRiffAdoptionPreviewCandidate = Readonly<{
  cardId: string;
  xiuyuanId: string;
  blockId: string;
  classification:
    | 'adoptable'
    | 'already-local'
    | 'tombstoned'
    | 'legacy-excluded'
    | 'source-missing'
    | 'semantic-conflict';
  reason?: string;
}>;

export type NativeRiffAdoptionPreview = Readonly<{
  candidates: readonly NativeRiffAdoptionPreviewCandidate[];
  counts: Readonly<{
    adoptable: number;
    alreadyLocal: number;
    tombstoned: number;
    legacyExcluded: number;
    sourceMissing: number;
    semanticConflict: number;
  }>;
}>;

type NativeRiffAdoptionCandidatePlan = Readonly<{
  preview: NativeRiffAdoptionPreviewCandidate;
  adoptedRecord?: NativeRiffAdoptionCandidate;
}>;

export class NativeRiffAdoptionModule {
  constructor(private readonly deps: NativeRiffAdoptionModuleDeps) {}

  async preview(): Promise<NativeRiffAdoptionPreview> {
    const candidates: NativeRiffAdoptionPreviewCandidate[] = [];
    const counts = {
      adoptable: 0,
      alreadyLocal: 0,
      tombstoned: 0,
      legacyExcluded: 0,
      sourceMissing: 0,
      semanticConflict: 0,
    };

    for (const candidate of await this.deps.readPort.listCandidates()) {
      const plan = await this.planCandidate(candidate);
      candidates.push(plan.preview);
      incrementAdoptionPreviewCount(counts, plan.preview.classification);
    }

    return {
      candidates,
      counts,
    };
  }

  async applySelected(input: {
    cardIds: readonly string[];
  }): Promise<Readonly<{
    adopted: readonly NativeRiffAdoptionCandidate[];
    blocked: readonly NativeRiffAdoptionBlockedResult[];
  }>> {
    const selectedCardIds = new Set(input.cardIds);
    const adoptedRecords: NativeRiffAdoptionCandidate[] = [];
    const blocked: NativeRiffAdoptionBlockedResult[] = [];

    for (const candidate of await this.deps.readPort.listCandidates()) {
      if (!selectedCardIds.has(candidate.cardId)) {
        continue;
      }

      const plan = await this.planCandidate(candidate);
      if (plan.adoptedRecord) {
        adoptedRecords.push(plan.adoptedRecord);
        continue;
      }
      if (plan.preview.classification === 'source-missing') {
        blocked.push({
          cardId: candidate.cardId,
          classification: 'source-missing',
          reason: plan.preview.reason ?? 'native-riff-adoption-source-missing',
        });
        continue;
      }
      if (plan.preview.classification === 'semantic-conflict') {
        blocked.push({
          cardId: candidate.cardId,
          classification: 'semantic-conflict',
          reason: plan.preview.reason ?? 'native-riff-adoption-semantic-conflict',
        });
        continue;
      }
      if (
        plan.preview.classification === 'tombstoned'
        || plan.preview.classification === 'legacy-excluded'
      ) {
        blocked.push({
          cardId: candidate.cardId,
          classification: plan.preview.classification,
          reason: plan.preview.reason ?? 'native-riff-adoption-suppressed',
        });
      }
    }

    if (adoptedRecords.length === 0) {
      return {
        adopted: [],
        blocked,
      };
    }

    const result = await this.deps.writePort.saveAdoptedRecords(adoptedRecords);
    return {
      adopted: result.adopted,
      blocked,
    };
  }

  private async planCandidate(
    candidate: NativeRiffAdoptionCandidate,
  ): Promise<NativeRiffAdoptionCandidatePlan> {
    const previewBase = {
      cardId: candidate.cardId,
      xiuyuanId: candidate.xiuyuanId,
      blockId: candidate.blockId,
    };
    if (candidate.ownership === 'local-owned') {
      return {
        preview: {
          ...previewBase,
          classification: 'already-local',
        },
      };
    }

    if (await this.deps.readPort.hasDeletionTombstone(candidate)) {
      return {
        preview: {
          ...previewBase,
          classification: 'tombstoned',
          reason: 'native-riff-adoption-tombstone',
        },
      };
    }

    if (await this.deps.readPort.hasLegacyImportExclusion(candidate)) {
      return {
        preview: {
          ...previewBase,
          classification: 'legacy-excluded',
          reason: 'native-riff-import-exclusion',
        },
      };
    }

    const sourceMarkdown = await this.deps.readPort.readLiveSourceMarkdown(candidate.blockId);
    if (!sourceMarkdown) {
      return {
        preview: {
          ...previewBase,
          classification: 'source-missing',
          reason: 'native-riff-adoption-source-missing',
        },
      };
    }

    const rebuild = await (this.deps.rebuildFromLiveSource ?? rebuildNativeRiffAdoptionFromLiveSource)({
      candidate,
      sourceMarkdown,
    });
    if (rebuild.status !== 'ready') {
      return {
        preview: {
          ...previewBase,
          classification: 'semantic-conflict',
          reason: rebuild.reason,
        },
      };
    }

    const meta: Record<string, unknown> = {
      ...candidate.meta,
      ...rebuild.metaPatch,
      ownership: 'local-owned',
      templateID: rebuild.templateId,
    };
    for (const key of rebuild.metaDelete ?? []) {
      delete meta[key];
    }

    return {
      preview: {
        ...previewBase,
        classification: 'adoptable',
      },
      adoptedRecord: {
        ...candidate,
        ownership: 'local-owned',
        templateId: rebuild.templateId,
        meta,
      },
    };
  }
}

function incrementAdoptionPreviewCount(
  counts: {
    adoptable: number;
    alreadyLocal: number;
    tombstoned: number;
    legacyExcluded: number;
    sourceMissing: number;
    semanticConflict: number;
  },
  classification: NativeRiffAdoptionPreviewCandidate['classification'],
): void {
  switch (classification) {
    case 'adoptable':
      counts.adoptable++;
      break;
    case 'already-local':
      counts.alreadyLocal++;
      break;
    case 'tombstoned':
      counts.tombstoned++;
      break;
    case 'legacy-excluded':
      counts.legacyExcluded++;
      break;
    case 'source-missing':
      counts.sourceMissing++;
      break;
    case 'semantic-conflict':
      counts.semanticConflict++;
      break;
  }
}

export async function rebuildNativeRiffAdoptionFromLiveSource(input: {
  candidate: NativeRiffAdoptionCandidate;
  sourceMarkdown: string;
}): Promise<NativeRiffAdoptionSemanticRebuild> {
  const repair = resolveRiffSymbolRenderRepair({
    cardType: input.candidate.cardType,
    meta: input.candidate.meta,
    sourceContent: input.sourceMarkdown,
  });
  if (repair.status !== 'repair-required' || !repair.repairPatch) {
    return {
      status: 'conflict',
      reason: repair.diagnostics[0] ?? `native-riff-adoption-${repair.status}`,
    };
  }

  return {
    status: 'ready',
    templateId: isBidirectionalSymbol(repair.symbolType)
      ? 'builtin-bidirectional-single'
      : 'builtin-quick-card',
    metaPatch: {
      source: 'symbol',
      ...(repair.repairPatch.metaPatch ?? {}),
    },
    metaDelete: Array.from(new Set([
      'nativeRiffCompatibility',
      ...(repair.repairPatch.metaDelete ?? []),
    ])),
  };
}

function isBidirectionalSymbol(symbolType: string): boolean {
  return symbolType === '<>' || symbolType === '《》';
}
