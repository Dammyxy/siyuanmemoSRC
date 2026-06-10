import {
  BACKEND_RPC_METHODS,
  BACKEND_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendRpcFamily,
  type BackendRpcHandlerAdapter,
  type BackendRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';

export interface LegacyBackendKernelHandlerContext {
  handleLegacyBackendKernelMethod(method: BackendRpcMethod, params: unknown): Promise<unknown> | unknown;
}

export interface BackendRpcHandlerRegistration<TContext = unknown, TParams = unknown, TResult = unknown>
  extends BackendRpcHandlerAdapter<TParams, TResult, TContext> {
  readonly owner: string;
}

export interface BackendRpcRegistryValidationIssue {
  readonly type: 'duplicate-method' | 'missing-method' | 'unknown-method' | 'family-mismatch';
  readonly method: string;
  readonly owners?: readonly string[];
  readonly expectedFamily?: BackendRpcFamily;
  readonly actualFamily?: BackendRpcFamily;
}

export interface BackendRpcHandlerRegistry<TContext = unknown> {
  readonly entries: readonly BackendRpcHandlerRegistration<TContext>[];
  readonly handlersByMethod: ReadonlyMap<BackendRpcMethod, BackendRpcHandlerRegistration<TContext>>;
}

export const LEGACY_BACKEND_KERNEL_RPC_METHODS = [
  'system.health',
  'db.load',
  'db.persist',
  'sync.conflict.merge',
  'sync.conflict.summarize',
  'sync.conflict.reload',
  'diagnostics.status',
  'domainSync.status',
  'domainSync.repair.preview',
  'domainSync.repair.apply',
  'domainSync.conflictSources.cleanupCandidates',
  'domainSync.conflictSources.cleanup',
  'sync.reviewDivergence.audit',
  'browser.deck.page',
  'browser.deck.matchedIds',
  'browser.deck.rowsByIds',
  'browser.deck.documentCounts',
  'browser.count',
  'browser.stats',
  'browser.sourceExistence.refreshCandidates',
  'browser.sourceExistence.update',
  'browser.sourceExistence.byBlockIds',
  'browser.sourceExistence.summary',
  'browser.sourceExistence.applySweepHost',
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
  'neural-roam.advance',
  'neural-roam.viewState',
  'neural-roam.command',
  'kernel.transaction.ingest',
  'kernel.transaction.dequeue',
  'kernel.transaction.requeue',
  'autocard.decision.resolve',
  'autocard.execute',
  'review.feedback',
  'review.truth.flush',
  'review.truth.backfill',
  'ai.session.create',
  'ai.session.get',
  'ai.session.update',
  'ai.session.cancel',
  'ai.prompt.execute',
  'ai.tool.job.execute',
  'ai.tool.job.approval',
  'ai.stream.start',
  'ai.stream.cancel',
  'job.get',
  'job.cancel',
  'hotspot.command.submit',
  'hotspot.job.get',
  'xiuyuan.sync.execute',
  'progressive.command.execute',
  'topic-derived.command.execute',
  'review.riffFeedback.execute',
  'review.sourceRefresh.execute',
  'browser.aggregate.snapshot',
  'browser.aggregate.page',
  'browser.aggregate.focus',
  'graph.query',
  'private.health',
  'private.diagnostics.status',
  'private.audit.query',
  'private.read.cards',
  'private.read.queues',
  'private.read.sessions',
  'private.command.execute',
  'semantic.command.execute',
  'semantic.session.read',
  'semantic.sidebar.read',
  'semantic.browser.read',
  'p6.ownership.query',
  'p6.ownership.command',
  'browser.sourceExistence.applySweep',
] as const satisfies readonly BackendRpcMethod[];

export const LEGACY_BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS = Object.freeze(
  LEGACY_BACKEND_KERNEL_RPC_METHODS.map(createLegacyBackendKernelHandlerRegistration),
);

export function createBackendRpcHandlerRegistry<TContext>(
  entries: readonly BackendRpcHandlerRegistration<TContext>[],
): BackendRpcHandlerRegistry<TContext> {
  const duplicate = findDuplicateBackendRpcHandlerMethods(entries)[0];
  if (duplicate) {
    throw new Error(`Duplicate backend RPC handler registration: ${duplicate.method} (${duplicate.owners.join(', ')})`);
  }
  return {
    entries: Object.freeze([...entries]),
    handlersByMethod: new Map(entries.map((entry) => [entry.method, entry])),
  };
}

export function validateBackendRpcHandlerRegistry(
  entries: readonly BackendRpcHandlerRegistration[],
  methods: readonly BackendRpcMethod[] = BACKEND_RPC_METHODS,
): BackendRpcRegistryValidationIssue[] {
  const issues: BackendRpcRegistryValidationIssue[] = [];
  const entriesByMethod = new Map<string, BackendRpcHandlerRegistration[]>();
  for (const entry of entries) {
    const existing = entriesByMethod.get(entry.method) ?? [];
    existing.push(entry);
    entriesByMethod.set(entry.method, existing);
  }

  for (const duplicate of findDuplicateBackendRpcHandlerMethods(entries)) {
    issues.push(duplicate);
  }

  const expectedMethods = new Set<BackendRpcMethod>(methods);
  for (const method of methods) {
    if (!entriesByMethod.has(method)) {
      issues.push({ type: 'missing-method', method });
    }
  }

  for (const entry of entries) {
    if (!expectedMethods.has(entry.method)) {
      issues.push({ type: 'unknown-method', method: entry.method, owners: [entry.owner] });
      continue;
    }
    const expectedFamily = BACKEND_RPC_METHOD_CONTRACT_BY_METHOD[entry.method].family;
    if (entry.family !== expectedFamily) {
      issues.push({
        type: 'family-mismatch',
        method: entry.method,
        expectedFamily,
        actualFamily: entry.family,
        owners: [entry.owner],
      });
    }
  }

  return issues;
}

export function findDuplicateBackendRpcHandlerMethods(
  entries: readonly Pick<BackendRpcHandlerRegistration, 'method' | 'owner'>[],
): BackendRpcRegistryValidationIssue[] {
  const ownersByMethod = new Map<BackendRpcMethod, string[]>();
  for (const entry of entries) {
    const owners = ownersByMethod.get(entry.method) ?? [];
    owners.push(entry.owner);
    ownersByMethod.set(entry.method, owners);
  }
  return Array.from(ownersByMethod.entries())
    .filter(([, owners]) => owners.length > 1)
    .map(([method, owners]) => ({
      type: 'duplicate-method' as const,
      method,
      owners,
    }));
}

function createLegacyBackendKernelHandlerRegistration(
  method: BackendRpcMethod,
): BackendRpcHandlerRegistration<LegacyBackendKernelHandlerContext> {
  return {
    method,
    family: BACKEND_RPC_METHOD_CONTRACT_BY_METHOD[method].family,
    owner: 'BackendKernel.handle-switch',
    handle: (params, context) => context.handleLegacyBackendKernelMethod(method, params),
  };
}
