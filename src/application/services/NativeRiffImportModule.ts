import type {
  NativeRiffImportScheduleSnapshot,
  NativeRiffImportSourceCard,
  NativeRiffImportSourcePort,
} from '@/application/ports/NativeRiffImportSourcePort';

export type NativeRiffImportClassification =
  | 'importable'
  | 'already-owned'
  | 'existing-needs-repair'
  | 'tombstoned'
  | 'legacy-excluded'
  | 'semantic-conflict';

export type NativeRiffImportLocalFace = Readonly<{
  cardId: string;
  logicalKey: string;
  ownership: 'local-owned' | 'riff-managed';
  needsSemanticRepair?: boolean;
}>;

export interface NativeRiffImportLocalReadPort {
  findByImportReceipt(input: {
    nativeCardId: string;
    deckId: string;
  }): Promise<NativeRiffImportLocalFace | null>;
  findByLogicalKey(logicalKey: string): Promise<NativeRiffImportLocalFace | null>;
  hasDeletionTombstone(candidate: NativeRiffImportSourceCard): Promise<boolean>;
  hasLegacyImportExclusion(candidate: NativeRiffImportSourceCard): Promise<boolean>;
}

export type NativeRiffImportSemanticFace = Readonly<{
  logicalKey: string;
  faceIndex: number;
  ruleIndex?: number;
}>;

export type NativeRiffImportSemanticResolution =
  | Readonly<{
      status: 'resolved';
      faces: readonly NativeRiffImportSemanticFace[];
    }>
  | Readonly<{
      status: 'conflict';
      reason: string;
    }>;

type NativeRiffImportPreviewCandidateBase = Readonly<{
  nativeCardId: string;
  deckId: string;
  blockId: string;
}>;

type NativeRiffImportFacePreviewCandidate = NativeRiffImportPreviewCandidateBase & Readonly<{
  classification: 'importable' | 'already-owned' | 'existing-needs-repair';
  logicalKey: string;
  faceIndex: number;
  ruleIndex?: number;
  existingCardId?: string;
  reason?: string;
}>;

type NativeRiffImportSuppressedPreviewCandidate = NativeRiffImportPreviewCandidateBase & Readonly<{
  classification: 'tombstoned' | 'legacy-excluded';
  reason: string;
}>;

type NativeRiffImportConflictPreviewCandidate = NativeRiffImportPreviewCandidateBase & Readonly<{
  classification: 'semantic-conflict';
  reason?: string;
}>;

export type NativeRiffImportPreviewCandidate =
  | NativeRiffImportFacePreviewCandidate
  | NativeRiffImportSuppressedPreviewCandidate
  | NativeRiffImportConflictPreviewCandidate;

export type NativeRiffImportPreview = Readonly<{
  candidates: readonly NativeRiffImportPreviewCandidate[];
  counts: Readonly<{
    importable: number;
    alreadyOwned: number;
    existingNeedsRepair: number;
    tombstoned: number;
    legacyExcluded: number;
    semanticConflict: number;
  }>;
}>;

export type NativeRiffImportReceipt = Readonly<{
  version: 1;
  nativeCardId: string;
  deckId: string;
  importedAt: number;
}>;

export type NativeRiffImportCreatePlan = Readonly<{
  nativeCardId: string;
  deckId: string;
  blockId: string;
  sourceMarkdown: string;
  logicalKey: string;
  faceIndex: number;
  ruleIndex?: number;
  scheduleSeed?: NativeRiffImportScheduleSnapshot;
  importReceipt: NativeRiffImportReceipt;
}>;

export interface NativeRiffImportWritePort {
  createImportedFaces(
    plans: readonly NativeRiffImportCreatePlan[],
  ): Promise<Readonly<{ createdCardIds: readonly string[] }>>;
}

export type NativeRiffImportModuleDeps = Readonly<{
  source: NativeRiffImportSourcePort;
  localRead: NativeRiffImportLocalReadPort;
  writePort?: NativeRiffImportWritePort;
  now?: () => number;
  resolveSemanticFaces: (
    candidate: NativeRiffImportSourceCard,
  ) => Promise<NativeRiffImportSemanticResolution>;
}>;

export class NativeRiffImportModule {
  constructor(private readonly deps: NativeRiffImportModuleDeps) {}

  async preview(): Promise<NativeRiffImportPreview> {
    return (await this.buildPreviewPlan()).preview;
  }

  async applySelected(input: {
    logicalKeys: readonly string[];
  }): Promise<Readonly<{
    createdCardIds: readonly string[];
    createdCount: number;
    skippedCount: number;
  }>> {
    if (!this.deps.writePort) {
      throw new Error('NATIVE_RIFF_IMPORT_WRITE_UNAVAILABLE');
    }

    const selectedLogicalKeys = new Set(input.logicalKeys);
    const { createPlans } = await this.buildPreviewPlan();
    const selectedPlans = createPlans.filter(plan => selectedLogicalKeys.has(plan.logicalKey));
    if (selectedPlans.length === 0) {
      return {
        createdCardIds: [],
        createdCount: 0,
        skippedCount: selectedLogicalKeys.size,
      };
    }
    const result = await this.deps.writePort.createImportedFaces(selectedPlans);

    return {
      createdCardIds: result.createdCardIds,
      createdCount: result.createdCardIds.length,
      skippedCount: Math.max(0, selectedLogicalKeys.size - selectedPlans.length),
    };
  }

  private async buildPreviewPlan(): Promise<{
    preview: NativeRiffImportPreview;
    createPlans: NativeRiffImportCreatePlan[];
  }> {
    const candidates: NativeRiffImportPreviewCandidate[] = [];
    const createPlans: NativeRiffImportCreatePlan[] = [];
    const counts = {
      importable: 0,
      alreadyOwned: 0,
      existingNeedsRepair: 0,
      tombstoned: 0,
      legacyExcluded: 0,
      semanticConflict: 0,
    };

    for (const sourceCard of await this.deps.source.listImportCandidates()) {
      if (await this.deps.localRead.hasDeletionTombstone(sourceCard)) {
        candidates.push({
          classification: 'tombstoned',
          nativeCardId: sourceCard.nativeCardId,
          deckId: sourceCard.deckId,
          blockId: sourceCard.blockId,
          reason: 'native-riff-import-tombstone',
        });
        counts.tombstoned++;
        continue;
      }

      if (await this.deps.localRead.hasLegacyImportExclusion(sourceCard)) {
        candidates.push({
          classification: 'legacy-excluded',
          nativeCardId: sourceCard.nativeCardId,
          deckId: sourceCard.deckId,
          blockId: sourceCard.blockId,
          reason: 'native-riff-import-exclusion',
        });
        counts.legacyExcluded++;
        continue;
      }

      const resolution = await this.deps.resolveSemanticFaces(sourceCard);
      if (resolution.status === 'conflict') {
        candidates.push({
          classification: 'semantic-conflict',
          nativeCardId: sourceCard.nativeCardId,
          deckId: sourceCard.deckId,
          blockId: sourceCard.blockId,
          reason: resolution.reason,
        });
        counts.semanticConflict++;
        continue;
      }

      const receiptMatch = await this.deps.localRead.findByImportReceipt({
        nativeCardId: sourceCard.nativeCardId,
        deckId: sourceCard.deckId,
      });

      for (const face of resolution.faces) {
        if (receiptMatch?.ownership === 'local-owned') {
          const needsRepair = receiptMatch.needsSemanticRepair === true;
          candidates.push({
            classification: needsRepair ? 'existing-needs-repair' : 'already-owned',
            nativeCardId: sourceCard.nativeCardId,
            deckId: sourceCard.deckId,
            blockId: sourceCard.blockId,
            logicalKey: face.logicalKey,
            faceIndex: face.faceIndex,
            ...(face.ruleIndex == null ? {} : { ruleIndex: face.ruleIndex }),
            existingCardId: receiptMatch.cardId,
            ...(needsRepair ? { reason: 'local-owned-semantic-repair-required' } : {}),
          });
          if (needsRepair) {
            counts.existingNeedsRepair++;
          } else {
            counts.alreadyOwned++;
          }
          continue;
        }

        const logicalMatch = await this.deps.localRead.findByLogicalKey(face.logicalKey);
        if (logicalMatch?.ownership === 'local-owned') {
          const needsRepair = logicalMatch.needsSemanticRepair === true;
          candidates.push({
            classification: needsRepair ? 'existing-needs-repair' : 'already-owned',
            nativeCardId: sourceCard.nativeCardId,
            deckId: sourceCard.deckId,
            blockId: sourceCard.blockId,
            logicalKey: face.logicalKey,
            faceIndex: face.faceIndex,
            ...(face.ruleIndex == null ? {} : { ruleIndex: face.ruleIndex }),
            existingCardId: logicalMatch.cardId,
            ...(needsRepair ? { reason: 'local-owned-semantic-repair-required' } : {}),
          });
          if (needsRepair) {
            counts.existingNeedsRepair++;
          } else {
            counts.alreadyOwned++;
          }
          continue;
        }

        candidates.push({
          classification: 'importable',
          nativeCardId: sourceCard.nativeCardId,
          deckId: sourceCard.deckId,
          blockId: sourceCard.blockId,
          logicalKey: face.logicalKey,
          faceIndex: face.faceIndex,
          ...(face.ruleIndex == null ? {} : { ruleIndex: face.ruleIndex }),
        });
        createPlans.push({
          nativeCardId: sourceCard.nativeCardId,
          deckId: sourceCard.deckId,
          blockId: sourceCard.blockId,
          sourceMarkdown: sourceCard.sourceMarkdown,
          logicalKey: face.logicalKey,
          faceIndex: face.faceIndex,
          ...(face.ruleIndex == null ? {} : { ruleIndex: face.ruleIndex }),
          ...(isValidScheduleSeed(sourceCard.schedule)
            ? { scheduleSeed: sourceCard.schedule }
            : {}),
          importReceipt: Object.freeze({
            version: 1,
            nativeCardId: sourceCard.nativeCardId,
            deckId: sourceCard.deckId,
            importedAt: this.deps.now?.() ?? Date.now(),
          }),
        });
        counts.importable++;
      }
    }

    return {
      preview: {
        candidates,
        counts,
      },
      createPlans,
    };
  }
}

function isValidScheduleSeed(
  schedule: NativeRiffImportScheduleSnapshot | undefined,
): schedule is NativeRiffImportScheduleSnapshot {
  if (!schedule) {
    return false;
  }

  if (!isValidDateString(schedule.due)) {
    return false;
  }
  if (
    !Number.isInteger(schedule.state)
    || schedule.state < 0
    || schedule.state > 3
  ) {
    return false;
  }
  if (!isNonNegativeFinite(schedule.stability) || !isNonNegativeFinite(schedule.difficulty)) {
    return false;
  }
  if (!isNonNegativeInteger(schedule.reps) || !isNonNegativeInteger(schedule.lapses)) {
    return false;
  }
  if (schedule.lastReview != null && !isValidDateString(schedule.lastReview)) {
    return false;
  }

  return true;
}

function isValidDateString(value: string): boolean {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
