export type MigratedStateOwner =
  | 'application-command'
  | 'backend-worker'
  | 'writer-relay'
  | 'compatibility-read';

export type BackendMigrationWriterRelayPolicy =
  | 'required-for-formal-mutation'
  | 'required-when-follower'
  | 'not-required-read-only'
  | 'not-required-renderer-facts-only';

export type BackendMigrationKernelProxyDependency =
  | 'none'
  | 'riff-read-audit'
  | 'private-status-sse'
  | 'network-proxy'
  | 'graph-read-host-effect';

export interface BackendMigrationRetainedEffect {
  id: string;
  kind: 'renderer-host-effect' | 'local-fallback' | 'compatibility-read';
  owner: string;
  reason: string;
  removalCondition: string;
  validation: string;
}

export interface MigratedStateFamily {
  familyId: string;
  currentOwner: MigratedStateOwner;
  targetOwner: MigratedStateOwner;
  ownerRuntime: MigratedStateOwner;
  contract: string;
  writerRelayPolicy: BackendMigrationWriterRelayPolicy;
  kernelProxyDependency: BackendMigrationKernelProxyDependency;
  idempotencyKey: string;
  storage: 'siyuanmemo.db' | 'kernel-queue' | 'memory' | 'diagnostics';
  allowedReaders: string[];
  allowedWriters: MigratedStateOwner[];
  compatibilityReads: string[];
  featureGate: string | null;
  rolloutFlag: string | null;
  fallbackRemovalCondition: string;
  retainedEffects: BackendMigrationRetainedEffect[];
  rollbackMode: 'return-unavailable' | 'disable-feature-flag' | 'compatibility-read-only';
  diagnostics: string[];
}

export const BACKEND_MIGRATION_FEATURE_GATES = {
  autocardDecisionRelay: 'VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY',
  autocardExecuteRelay: 'VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER',
  kernelTransactionIngest: 'VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST',
  privateApi: 'VITE_SIYUANMEMO_ENABLE_PRIVATE_API',
} as const;

export const BACKEND_MIGRATION_OWNERSHIP_MAP: MigratedStateFamily[] = [
  {
    familyId: 'autocard.decision',
    currentOwner: 'writer-relay',
    targetOwner: 'writer-relay',
    ownerRuntime: 'writer-relay',
    contract: 'autocard.decision.resolve',
    writerRelayPolicy: 'required-when-follower',
    kernelProxyDependency: 'none',
    idempotencyKey: 'candidateId/idempotencyKey',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.handlers.AutoCardHandler', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['writer-relay'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay,
    fallbackRemovalCondition: 'decision relay diagnostics show writer/follower parity and no follower-local decision path remains',
    retainedEffects: [],
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['candidateId', 'decisionEventId', 'unavailableClass'],
  },
  {
    familyId: 'autocard.execute',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'autocard.execute',
    writerRelayPolicy: 'required-when-follower',
    kernelProxyDependency: 'none',
    idempotencyKey: 'candidateId/decisionEventId/idempotencyKey',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.handlers.AutoCardHandler', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'backend execute callback and writer relay are active with no local execute fallback in follower windows',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['candidateId', 'decisionEventId', 'status'],
  },
  {
    familyId: 'topic-derived',
    currentOwner: 'backend-worker',
    targetOwner: 'application-command',
    ownerRuntime: 'application-command',
    contract: 'topic-derived.command.execute',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'riff-read-audit',
    idempotencyKey: 'sourceBlockId/parentTopicCardId/answerFingerprint',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.TopicDerivedItemService'],
    allowedWriters: ['application-command'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'topic-derived document/card/attr/native Riff orchestration is owned by backend command facade',
    retainedEffects: [
      {
        id: 'topic-derived-renderer-materialization',
        kind: 'renderer-host-effect',
        owner: 'application.services.TopicDerivedItemService',
        reason: 'source selection and user-approved insertion facts are renderer-only during cutover',
        removalCondition: 'backend command consumes bounded materialization facts and rejects stale facts explicitly',
        validation: 'TopicDerivedItemService tests cover rollback and native Riff unavailable behavior',
      },
    ],
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['decisionEventId', 'created', 'skipped'],
  },
  {
    familyId: 'topic-derived.command',
    currentOwner: 'application-command',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'topic-derived.command.execute',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'riff-read-audit',
    idempotencyKey: 'commandId/sourceBlockId/parentTopicCardId/answerFingerprint',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.TopicDerivedItemService', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'application write entrypoint is replaced by backend command facade and no local formal write fallback remains',
    retainedEffects: [
      {
        id: 'topic-derived-dom-facts',
        kind: 'renderer-host-effect',
        owner: 'ui.review/application handlers',
        reason: 'DOM/editor selection facts cannot be read by worker or kernel',
        removalCondition: 'renderer submits only bounded facts; backend owns state transition and rollback outcome',
        validation: 'stale DOM facts and rollback failure tests pass before cutover',
      },
    ],
    rollbackMode: 'return-unavailable',
    diagnostics: ['commandId', 'sourceBlockId', 'status', 'unavailableClass'],
  },
  {
    familyId: 'xiuyuan.command',
    currentOwner: 'application-command',
    targetOwner: 'application-command',
    ownerRuntime: 'application-command',
    contract: 'xiuyuan.command.execute',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'riff-read-audit',
    idempotencyKey: 'commandId/xiuyuanId/blockIds',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.XiuyuanApplicationService'],
    allowedWriters: ['application-command'],
    compatibilityReads: [],
    featureGate: null,
    rolloutFlag: null,
    fallbackRemovalCondition: 'create/delete/rebind usecases either backendize or remain explicitly application-owned outside Xiuyuan sync cutover',
    retainedEffects: [],
    rollbackMode: 'compatibility-read-only',
    diagnostics: ['commandId', 'resultStatus'],
  },
  {
    familyId: 'progressive.command',
    currentOwner: 'application-command',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'progressive.command.execute',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'riff-read-audit',
    idempotencyKey: 'commandId/sourceBlockId/selectionFingerprint',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.ProgressiveReadingService', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'ProgressiveReadingService write entrypoints are backend command facades and local document/card/Riff writes are removed',
    retainedEffects: [
      {
        id: 'progressive-selection-materialization',
        kind: 'renderer-host-effect',
        owner: 'application.services.SelectionExcerptService',
        reason: 'current editor selection and insertion target are renderer-only facts',
        removalCondition: 'backend command rejects stale/missing materialization facts and owns rollback result',
        validation: 'duplicate command, stale DOM facts, native Riff unavailable, and rollback failure tests pass',
      },
    ],
    rollbackMode: 'return-unavailable',
    diagnostics: ['commandId', 'sourceBlockId', 'status', 'rollbackStatus'],
  },
  {
    familyId: 'browser.aggregate-read',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'browser.aggregate.snapshot/page/focus',
    writerRelayPolicy: 'not-required-read-only',
    kernelProxyDependency: 'none',
    idempotencyKey: 'snapshotId/generation/queryFingerprint',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.BrowserApplicationService', 'ui.browser.BrowserGridDatasourceLifecycle'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'Browser consumes backend aggregate snapshots/pages/focus and no local allRows/UI SQL hierarchy repair remains',
    retainedEffects: [
      {
        id: 'browser-visible-grid-state',
        kind: 'renderer-host-effect',
        owner: 'ui.browser.SRSBrowser',
        reason: 'AG Grid visible row state stays renderer-local for presentation only',
        removalCondition: 'bulk actions bind to backend snapshot identity or explicit backend-validated card ids',
        validation: 'large deck open, focus snapshot, stale generation, aggregate unavailable, and ready-empty tests pass',
      },
    ],
    rollbackMode: 'return-unavailable',
    diagnostics: ['snapshotId', 'generation', 'pageCursor', 'status', 'unavailableClass'],
  },
  {
    familyId: 'graph.query',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'graph.query',
    writerRelayPolicy: 'not-required-read-only',
    kernelProxyDependency: 'graph-read-host-effect',
    idempotencyKey: 'queryId/sourceNodeId/queryFingerprint',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.clients.NeuralRoamBackendClient', 'application.clients.SemanticActivationCommandClient', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: ['typed graph host effect while kernel/private read proxy is under cutover'],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'Review/Semantic traversal consumes backend graph read models and renderer graph SQL host effects are migration-only',
    retainedEffects: [
      {
        id: 'graph-query-host-effect',
        kind: 'renderer-host-effect',
        owner: 'SrsBackendClient neural graph host effect bridge',
        reason: 'SiYuan block/link graph facts are not fully available inside Worker until approved kernel/private read adapters are complete',
        removalCondition: 'backend graph query service uses approved kernel/private read adapter and boundary check rejects renderer graph SQL authority',
        validation: 'missing source, unreadable historical node, limit, backend unavailable, and content-safe diagnostics tests pass',
      },
    ],
    rollbackMode: 'return-unavailable',
    diagnostics: ['queryId', 'queryKind', 'counts', 'timing', 'unavailableClass'],
  },
  {
    familyId: 'review.feedback',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'review.feedback',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'none',
    idempotencyKey: 'cardId/sessionId/reviewedAt/idempotencyKey',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.usecases.review.ReviewCommitUseCase', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'ReviewCommitUseCase has no scheduler/local commit fallback and queue impact comes from backend result',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['cardId', 'queueType', 'committed'],
  },
  {
    familyId: 'review.source-refresh',
    currentOwner: 'application-command',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'review.sourceRefresh.execute',
    writerRelayPolicy: 'required-when-follower',
    kernelProxyDependency: 'none',
    idempotencyKey: 'commandId/sourceBlockId/sessionId/generation',
    storage: 'siyuanmemo.db',
    allowedReaders: ['ui.review.v2.reviewSourceRefreshRuntime', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: ['source existence presentation refresh during Review UI cutover'],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'Review source refresh consumes backend-authored refresh impact and stops inferring source existence locally',
    retainedEffects: [
      {
        id: 'review-source-refresh-local-inference',
        kind: 'local-fallback',
        owner: 'ui.review.v2.reviewSourceRefreshRuntime',
        reason: 'Review visible content reload still needs renderer-level source refresh during migration',
        removalCondition: 'backend source refresh returns cleanup/refresh impact and unavailable states for session advancement',
        validation: 'missing source cleanup, refresh unavailable, and no UI SQL fallback tests pass',
      },
    ],
    rollbackMode: 'return-unavailable',
    diagnostics: ['commandId', 'sourceBlockId', 'refreshImpact', 'unavailableClass'],
  },
  {
    familyId: 'queue.scheduler',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'review.feedback queueImpact / queue.projection.*',
    writerRelayPolicy: 'required-for-formal-mutation',
    kernelProxyDependency: 'none',
    idempotencyKey: 'queueType/policyHash/generation',
    storage: 'siyuanmemo.db',
    allowedReaders: ['core.scheduler.SchedulerRouter', 'worker.db.DatabaseWorkerService'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: null,
    rolloutFlag: null,
    fallbackRemovalCondition: 'scheduler writes stay under review.feedback backend path and no renderer scheduler commit is reachable',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['queueType', 'queueMode', 'commitPolicy'],
  },
  {
    familyId: 'kernel.transaction',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'kernel.transaction.ingest/dequeue/requeue',
    writerRelayPolicy: 'required-when-follower',
    kernelProxyDependency: 'none',
    idempotencyKey: 'transaction idempotencyKey',
    storage: 'kernel-queue',
    allowedReaders: ['application.handlers.KernelTransactionActionPump', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest,
    fallbackRemovalCondition: 'kernel transaction ingest and action pump remain backend/writer-owned with no kernel DB ownership',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['idempotencyKey', 'queueLength', 'acceptedTotal'],
  },
  {
    familyId: 'private.read',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'private.health/private.diagnostics.status/private.read.*',
    writerRelayPolicy: 'not-required-read-only',
    kernelProxyDependency: 'private-status-sse',
    idempotencyKey: 'requestId',
    storage: 'diagnostics',
    allowedReaders: ['application.services.PrivateApiService'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    fallbackRemovalCondition: 'private read status/diagnostics fail closed when backend/kernel capability is unavailable',
    retainedEffects: [],
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['requestId', 'method', 'auditStatus'],
  },
  {
    familyId: 'private.mutation',
    currentOwner: 'writer-relay',
    targetOwner: 'writer-relay',
    ownerRuntime: 'writer-relay',
    contract: 'private.command.execute',
    writerRelayPolicy: 'required-when-follower',
    kernelProxyDependency: 'private-status-sse',
    idempotencyKey: 'requestId/idempotencyKey',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.PrivateApiService'],
    allowedWriters: ['writer-relay'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    fallbackRemovalCondition: 'private mutation remains narrow, writer-routed, and duplicate-safe with no follower direct backend mutation',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['requestId', 'idempotencyKey', 'commandId', 'auditStatus'],
  },
  {
    familyId: 'browser.read',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    ownerRuntime: 'backend-worker',
    contract: 'browser.deck.* / browser.sourceExistence.*',
    writerRelayPolicy: 'not-required-read-only',
    kernelProxyDependency: 'none',
    idempotencyKey: 'queryName/queryFingerprint/generation',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.BrowserApplicationService'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rolloutFlag: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    fallbackRemovalCondition: 'Browser deck/page/read failures return explicit unavailable and do not read legacy snapshots',
    retainedEffects: [],
    rollbackMode: 'return-unavailable',
    diagnostics: ['queryName', 'status', 'unavailableClass'],
  },
  {
    familyId: 'compatibility.read',
    currentOwner: 'compatibility-read',
    targetOwner: 'backend-worker',
    ownerRuntime: 'compatibility-read',
    contract: 'documented migration-source read only',
    writerRelayPolicy: 'not-required-read-only',
    kernelProxyDependency: 'none',
    idempotencyKey: 'migrationSourceId/readGeneration',
    storage: 'siyuanmemo.db',
    allowedReaders: ['initial migration loaders', 'explicit compatibility-read contracts'],
    allowedWriters: ['compatibility-read'],
    compatibilityReads: ['legacy msgpack/sql base64 migration sources only'],
    featureGate: null,
    rolloutFlag: null,
    fallbackRemovalCondition: 'all retained compatibility reads have owner, source, removal condition, and no production write fallback',
    retainedEffects: [
      {
        id: 'legacy-storage-migration-read',
        kind: 'compatibility-read',
        owner: 'storage migration runtime',
        reason: 'legacy stores can be read only as migration sources',
        removalCondition: 'migration source expiry is validated and runtime msgpack checker stays green',
        validation: 'check-no-runtime-msgpack and hidden fallback checks pass',
      },
    ],
    rollbackMode: 'compatibility-read-only',
    diagnostics: ['sourceId', 'readGeneration', 'migrationStatus'],
  },
];

export function listMigratedStateFamilies(): MigratedStateFamily[] {
  return BACKEND_MIGRATION_OWNERSHIP_MAP.slice();
}

export function getMigratedStateFamily(familyId: string): MigratedStateFamily | undefined {
  const normalized = String(familyId || '').trim();
  if (!normalized) {
    return undefined;
  }
  return BACKEND_MIGRATION_OWNERSHIP_MAP.find((family) => family.familyId === normalized);
}
