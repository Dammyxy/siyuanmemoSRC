export type MigratedStateOwner =
  | 'application-command'
  | 'backend-worker'
  | 'writer-relay'
  | 'compatibility-read';

export interface MigratedStateFamily {
  familyId: string;
  currentOwner: MigratedStateOwner;
  targetOwner: MigratedStateOwner;
  storage: 'siyuanmemo.db' | 'kernel-queue' | 'memory' | 'diagnostics';
  allowedReaders: string[];
  allowedWriters: MigratedStateOwner[];
  compatibilityReads: string[];
  featureGate: string | null;
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
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.handlers.AutoCardHandler', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['writer-relay'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay,
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['candidateId', 'decisionEventId', 'unavailableClass'],
  },
  {
    familyId: 'autocard.execute',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.handlers.AutoCardHandler', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rollbackMode: 'return-unavailable',
    diagnostics: ['candidateId', 'decisionEventId', 'status'],
  },
  {
    familyId: 'topic-derived',
    currentOwner: 'application-command',
    targetOwner: 'application-command',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.TopicDerivedItemService'],
    allowedWriters: ['application-command'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['decisionEventId', 'created', 'skipped'],
  },
  {
    familyId: 'xiuyuan.command',
    currentOwner: 'application-command',
    targetOwner: 'application-command',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.XiuyuanApplicationService'],
    allowedWriters: ['application-command'],
    compatibilityReads: [],
    featureGate: null,
    rollbackMode: 'compatibility-read-only',
    diagnostics: ['commandId', 'resultStatus'],
  },
  {
    familyId: 'review.feedback',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.usecases.review.ReviewCommitUseCase', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    rollbackMode: 'return-unavailable',
    diagnostics: ['cardId', 'queueType', 'committed'],
  },
  {
    familyId: 'queue.scheduler',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    storage: 'siyuanmemo.db',
    allowedReaders: ['core.scheduler.SchedulerRouter', 'worker.db.DatabaseWorkerService'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: null,
    rollbackMode: 'return-unavailable',
    diagnostics: ['queueType', 'queueMode', 'commitPolicy'],
  },
  {
    familyId: 'kernel.transaction',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    storage: 'kernel-queue',
    allowedReaders: ['application.handlers.KernelTransactionActionPump', 'worker.bootstrap.BackendKernel'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest,
    rollbackMode: 'return-unavailable',
    diagnostics: ['idempotencyKey', 'queueLength', 'acceptedTotal'],
  },
  {
    familyId: 'private.read',
    currentOwner: 'backend-worker',
    targetOwner: 'backend-worker',
    storage: 'diagnostics',
    allowedReaders: ['application.services.PrivateApiService'],
    allowedWriters: ['backend-worker'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    rollbackMode: 'disable-feature-flag',
    diagnostics: ['requestId', 'method', 'auditStatus'],
  },
  {
    familyId: 'private.mutation',
    currentOwner: 'writer-relay',
    targetOwner: 'writer-relay',
    storage: 'siyuanmemo.db',
    allowedReaders: ['application.services.PrivateApiService'],
    allowedWriters: ['writer-relay'],
    compatibilityReads: [],
    featureGate: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    rollbackMode: 'return-unavailable',
    diagnostics: ['requestId', 'idempotencyKey', 'commandId', 'auditStatus'],
  },
  {
    familyId: 'compatibility.read',
    currentOwner: 'compatibility-read',
    targetOwner: 'compatibility-read',
    storage: 'memory',
    allowedReaders: [],
    allowedWriters: ['compatibility-read'],
    compatibilityReads: [],
    featureGate: null,
    rollbackMode: 'compatibility-read-only',
    diagnostics: ['source', 'allowedUntil', 'removalCondition'],
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
