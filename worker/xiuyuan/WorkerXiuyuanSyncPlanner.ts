import type {
  BackendHotspotCommandProgress,
  BackendUnavailableClass,
  BackendXiuyuanNativeRiffBlockFacts,
  BackendXiuyuanRiffReadAuditRequest,
  BackendXiuyuanRiffReadAuditResult,
  BackendXiuyuanRiffReadAuditSource,
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
  BackendXiuyuanSyncLocalCardFact,
  BackendXiuyuanSyncLocalFacts,
  BackendXiuyuanSyncLocalXiuyuanFact,
  BackendXiuyuanSyncMode,
  BackendXiuyuanSyncPlan,
} from '../../packages/contracts/src/backend-rpc';

export interface WorkerXiuyuanSyncPlannerDependencies {
  loadLocalFacts: () => Promise<BackendXiuyuanSyncLocalFacts>;
  readNativeRiffFacts?: (
    request: BackendXiuyuanRiffReadAuditRequest,
  ) => Promise<BackendXiuyuanRiffReadAuditResult>;
  now?: () => number;
}

type NormalizedNativeRiffFacts = {
  blocks: BackendXiuyuanNativeRiffBlockFacts[];
  malformedCount: number;
  duplicateCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map(normalizeString).filter(Boolean))).sort();
}

function isSupportedMode(value: unknown): value is BackendXiuyuanSyncMode {
  return value === 'incremental' || value === 'full' || value === 'audit';
}

function progress(
  state: BackendHotspotCommandProgress['state'],
  currentStep: string,
  completedUnits: number,
  totalUnits: number,
  updatedAt: number,
): BackendHotspotCommandProgress {
  return {
    state,
    currentStep,
    completedUnits,
    totalUnits,
    updatedAt,
  };
}

function isManagedRiffFact(
  card: BackendXiuyuanSyncLocalCardFact | null,
  xiuyuan: BackendXiuyuanSyncLocalXiuyuanFact | null,
): boolean {
  const ownership = normalizeString(card?.ownership ?? xiuyuan?.ownership);
  const source = normalizeString(card?.source ?? xiuyuan?.source);
  const templateId = normalizeString(card?.templateId ?? xiuyuan?.templateId);
  const riffCardId = normalizeString(card?.riffCardId);
  return ownership === 'riff-managed'
    || source === 'riff-sync'
    || templateId === 'builtin-riff-sync'
    || riffCardId.length > 0;
}

function normalizeNativeRiffBlocks(
  blocks: BackendXiuyuanNativeRiffBlockFacts[],
): NormalizedNativeRiffFacts {
  const seen = new Set<string>();
  const normalized: BackendXiuyuanNativeRiffBlockFacts[] = [];
  let malformedCount = 0;
  let duplicateCount = 0;

  for (const block of blocks) {
    const id = normalizeString(block?.id);
    const content = normalizeString(block?.content);
    if (!id || !content) {
      malformedCount += 1;
      continue;
    }
    if (seen.has(id)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(id);
    normalized.push({
      ...block,
      id,
      content,
      ial: isRecord(block.ial) ? block.ial : undefined,
    });
  }

  return {
    blocks: normalized,
    malformedCount,
    duplicateCount,
  };
}

function buildLocalIndexes(localFacts: BackendXiuyuanSyncLocalFacts): {
  xiuyuanById: Map<string, BackendXiuyuanSyncLocalXiuyuanFact>;
  xiuyuanByBlockId: Map<string, BackendXiuyuanSyncLocalXiuyuanFact>;
  cardByBlockId: Map<string, BackendXiuyuanSyncLocalCardFact>;
  managedRiffBlockIds: Set<string>;
  localOwnedBlockIds: Set<string>;
} {
  const xiuyuanById = new Map<string, BackendXiuyuanSyncLocalXiuyuanFact>();
  const xiuyuanByBlockId = new Map<string, BackendXiuyuanSyncLocalXiuyuanFact>();
  for (const xiuyuan of localFacts.xiuyuans) {
    xiuyuanById.set(xiuyuan.id, xiuyuan);
    for (const blockId of xiuyuan.blockIds) {
      const normalized = normalizeString(blockId);
      if (normalized && !xiuyuanByBlockId.has(normalized)) {
        xiuyuanByBlockId.set(normalized, xiuyuan);
      }
    }
    const representative = normalizeString(xiuyuan.representativeBlockId);
    if (representative && !xiuyuanByBlockId.has(representative)) {
      xiuyuanByBlockId.set(representative, xiuyuan);
    }
  }

  const cardByBlockId = new Map<string, BackendXiuyuanSyncLocalCardFact>();
  const managedRiffBlockIds = new Set<string>();
  const localOwnedBlockIds = new Set<string>();
  for (const card of localFacts.cards) {
    const blockId = normalizeString(card.blockId);
    if (!blockId) {
      continue;
    }
    if (!cardByBlockId.has(blockId)) {
      cardByBlockId.set(blockId, card);
    }
    const xiuyuan = card.xiuyuanId ? xiuyuanById.get(card.xiuyuanId) ?? null : xiuyuanByBlockId.get(blockId) ?? null;
    if (isManagedRiffFact(card, xiuyuan)) {
      managedRiffBlockIds.add(blockId);
    } else {
      localOwnedBlockIds.add(blockId);
    }
  }

  for (const [blockId, xiuyuan] of xiuyuanByBlockId.entries()) {
    if (managedRiffBlockIds.has(blockId) || localOwnedBlockIds.has(blockId)) {
      continue;
    }
    if (isManagedRiffFact(null, xiuyuan)) {
      managedRiffBlockIds.add(blockId);
    } else {
      localOwnedBlockIds.add(blockId);
    }
  }

  return {
    xiuyuanById,
    xiuyuanByBlockId,
    cardByBlockId,
    managedRiffBlockIds,
    localOwnedBlockIds,
  };
}

export class WorkerXiuyuanSyncPlanner {
  constructor(private readonly deps: WorkerXiuyuanSyncPlannerDependencies) {}

  async execute(request: BackendXiuyuanSyncExecuteRequest): Promise<BackendXiuyuanSyncExecuteResult> {
    const startedAt = this.now();
    const validationError = this.validateRequest(request);
    if (validationError) {
      return this.unavailable(request, 'INVALID_REQUEST', validationError, 'validate-request', false, startedAt);
    }

    if (!this.deps.readNativeRiffFacts) {
      return this.unavailable(
        request,
        'KERNEL_SIDECAR_UNAVAILABLE',
        'native Riff read/audit proxy unavailable',
        'read-native-riff-facts',
        true,
        startedAt,
      );
    }

    let localFacts: BackendXiuyuanSyncLocalFacts;
    try {
      localFacts = await this.deps.loadLocalFacts();
    } catch (error) {
      return this.unavailable(
        request,
        'BACKEND_UNAVAILABLE',
        error instanceof Error ? error.message : String(error),
        'read-local-xiuyuan-facts',
        true,
        startedAt,
      );
    }

    const readRequest = this.buildReadRequest(request);
    const nativeResult = await this.deps.readNativeRiffFacts(readRequest);
    if (nativeResult.status !== 'ready') {
      return {
        status: nativeResult.status,
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        mode: request.mode,
        dryRun: request.dryRun,
        unavailableClass: nativeResult.unavailableClass,
        reason: nativeResult.reason,
        recoverable: nativeResult.recoverable,
        progress: progress(
          nativeResult.status === 'unavailable' ? 'unavailable' : 'failed',
          'read-native-riff-facts',
          1,
          3,
          this.now(),
        ),
        applyImpact: {
          requested: request.dryRun !== true,
          applied: false,
          reason: 'read-unavailable',
          changed: {},
        },
        diagnostics: {
          diagnosticEventId: this.diagnosticEventId(request),
          readSource: nativeResult.diagnostics.source,
          localLoadedAt: localFacts.loadedAt,
          nativeReadAt: null,
          timingMs: Math.max(0, this.now() - startedAt),
          errorCategory: nativeResult.unavailableClass,
        },
      };
    }

    const native = normalizeNativeRiffBlocks(nativeResult.blocks);
    const plan = this.buildPlan(request.mode, localFacts, native, nativeResult.blocks.length);

    return {
      status: 'planned',
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      mode: request.mode,
      dryRun: request.dryRun,
      progress: progress('succeeded', 'planned', 3, 3, this.now()),
      plan,
      applyImpact: {
        requested: request.dryRun !== true,
        applied: false,
        reason: request.dryRun === true ? 'dry-run' : 'apply-not-implemented',
        changed: {},
      },
      diagnostics: {
        diagnosticEventId: this.diagnosticEventId(request),
        readSource: nativeResult.diagnostics.source,
        localLoadedAt: localFacts.loadedAt,
        nativeReadAt: nativeResult.readAt,
        timingMs: Math.max(0, this.now() - startedAt),
        errorCategory: null,
      },
    };
  }

  private buildPlan(
    mode: BackendXiuyuanSyncMode,
    localFacts: BackendXiuyuanSyncLocalFacts,
    native: NormalizedNativeRiffFacts,
    nativeRiffCount: number,
  ): BackendXiuyuanSyncPlan {
    const indexes = buildLocalIndexes(localFacts);
    const nativeBlockIds = new Set(native.blocks.map((block) => block.id));
    const create = new Set<string>();
    const update = new Set<string>();
    const skippedLocalOwned = new Set<string>();

    for (const block of native.blocks) {
      if (indexes.managedRiffBlockIds.has(block.id)) {
        update.add(block.id);
        continue;
      }
      if (
        indexes.localOwnedBlockIds.has(block.id)
        || indexes.cardByBlockId.has(block.id)
        || indexes.xiuyuanByBlockId.has(block.id)
      ) {
        skippedLocalOwned.add(block.id);
        continue;
      }
      create.add(block.id);
    }

    const deleteBlockIds = mode === 'full'
      ? uniqueSorted(Array.from(indexes.managedRiffBlockIds).filter((blockId) => !nativeBlockIds.has(blockId)))
      : [];

    const createBlockIds = uniqueSorted(create);
    const updateBlockIds = uniqueSorted(update);
    const skippedLocalOwnedBlockIds = uniqueSorted(skippedLocalOwned);

    return {
      localXiuyuanCount: localFacts.xiuyuans.length,
      localCardCount: localFacts.cards.length,
      localManagedRiffCount: indexes.managedRiffBlockIds.size,
      nativeRiffCount,
      normalizedNativeRiffCount: native.blocks.length,
      malformedNativeRiffCount: native.malformedCount,
      duplicateNativeRiffCount: native.duplicateCount,
      createCount: createBlockIds.length,
      updateCount: updateBlockIds.length,
      deleteCount: deleteBlockIds.length,
      skippedLocalOwnedCount: skippedLocalOwnedBlockIds.length,
      candidateBlockIds: {
        create: createBlockIds,
        update: updateBlockIds,
        delete: deleteBlockIds,
        skippedLocalOwned: skippedLocalOwnedBlockIds,
      },
    };
  }

  private buildReadRequest(request: BackendXiuyuanSyncExecuteRequest): BackendXiuyuanRiffReadAuditRequest {
    return {
      requestId: `riff-read-${request.commandId}`,
      mode: request.mode,
      deckId: request.deckId,
      since: typeof (request as { since?: unknown }).since === 'number'
        ? (request as { since: number }).since
        : null,
      scope: request.scope ?? null,
      deadlineAt: request.deadlineAt ?? null,
    };
  }

  private validateRequest(request: BackendXiuyuanSyncExecuteRequest): string | null {
    if (!request || !isRecord(request)) {
      return 'xiuyuan.sync.execute requires named params';
    }
    if (!normalizeString(request.requestId)) {
      return 'xiuyuan.sync.execute requires requestId';
    }
    if (!normalizeString(request.commandId)) {
      return 'xiuyuan.sync.execute requires commandId';
    }
    if (!normalizeString(request.idempotencyKey)) {
      return 'xiuyuan.sync.execute requires idempotencyKey';
    }
    if (!normalizeString(request.deckId)) {
      return 'xiuyuan.sync.execute requires deckId';
    }
    if (!isSupportedMode(request.mode)) {
      return 'xiuyuan.sync.execute requires supported mode';
    }
    return null;
  }

  private unavailable(
    request: Partial<BackendXiuyuanSyncExecuteRequest> | null | undefined,
    unavailableClass: BackendUnavailableClass,
    reason: string,
    currentStep: string,
    recoverable: boolean,
    startedAt: number,
  ): BackendXiuyuanSyncExecuteResult {
    const mode = isSupportedMode(request?.mode) ? request!.mode : 'audit';
    return {
      status: unavailableClass === 'INVALID_REQUEST' ? 'failed' : 'unavailable',
      commandId: normalizeString(request?.commandId) || 'unknown-command',
      idempotencyKey: normalizeString(request?.idempotencyKey) || 'unknown-idempotency-key',
      mode,
      dryRun: request?.dryRun !== false,
      unavailableClass,
      reason,
      recoverable,
      progress: progress(
        unavailableClass === 'INVALID_REQUEST' ? 'validation-failed' : 'unavailable',
        currentStep,
        0,
        3,
        this.now(),
      ),
      applyImpact: {
        requested: request?.dryRun === false,
        applied: false,
        reason: 'read-unavailable',
        changed: {},
      },
      diagnostics: {
        diagnosticEventId: this.diagnosticEventId(request),
        readSource: 'none' as BackendXiuyuanRiffReadAuditSource | 'none',
        localLoadedAt: null,
        nativeReadAt: null,
        timingMs: Math.max(0, this.now() - startedAt),
        errorCategory: unavailableClass,
      },
    };
  }

  private diagnosticEventId(request: Partial<BackendXiuyuanSyncExecuteRequest> | null | undefined): string {
    const commandId = normalizeString(request?.commandId) || 'unknown-command';
    return `xiuyuan-sync:${commandId}`;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}
