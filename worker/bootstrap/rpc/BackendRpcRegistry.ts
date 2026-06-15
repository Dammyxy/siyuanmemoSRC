import {
  BACKEND_RPC_METHODS,
  BACKEND_RPC_METHOD_CONTRACT_BY_METHOD,
  type BackendRpcFamily,
  type BackendRpcHandlerAdapter,
  type BackendRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS, type BackendAutoCardRpcHandlerContext } from './BackendAutoCardRpcAdapter';
import { BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS, type BackendBrowserRpcHandlerContext } from './BackendBrowserRpcAdapter';
import { BACKEND_CORE_RPC_HANDLER_REGISTRATIONS, type BackendCoreRpcHandlerContext } from './BackendCoreRpcAdapter';
import { BACKEND_GRAPH_RPC_HANDLER_REGISTRATIONS, type BackendGraphRpcHandlerContext } from './BackendGraphRpcAdapter';
import { BACKEND_HOTSPOT_RPC_HANDLER_REGISTRATIONS, type BackendHotspotRpcHandlerContext } from './BackendHotspotRpcAdapter';
import { BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS, type BackendKernelTransactionRpcHandlerContext } from './BackendKernelTransactionRpcAdapter';
import { BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS, type BackendNeuralRoamRpcHandlerContext } from './BackendNeuralRoamRpcAdapter';
import { BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS, type BackendP6OwnershipRpcHandlerContext } from './BackendP6OwnershipRpcAdapter';
import { BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS, type BackendPrivateApiRpcHandlerContext } from './BackendPrivateApiRpcAdapter';
import { BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS, type BackendProgressiveRpcHandlerContext } from './BackendProgressiveRpcAdapter';
import { BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS, type BackendQueueProjectionRpcHandlerContext } from './BackendQueueProjectionRpcAdapter';
import { BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS, type BackendReviewRpcHandlerContext } from './BackendReviewRpcAdapter';
import { BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS, type BackendSemanticRpcHandlerContext } from './BackendSemanticRpcAdapter';
import { BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS, type BackendSyncRpcHandlerContext } from './BackendSyncRpcAdapter';
import { BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS, type BackendTopicDerivedRpcHandlerContext } from './BackendTopicDerivedRpcAdapter';
import { BACKEND_XIUYUAN_RPC_HANDLER_REGISTRATIONS, type BackendXiuyuanRpcHandlerContext } from './BackendXiuyuanRpcAdapter';

export interface BackendKernelRpcHandlerContext
  extends BackendAutoCardRpcHandlerContext,
    BackendCoreRpcHandlerContext,
    BackendBrowserRpcHandlerContext,
    BackendHotspotRpcHandlerContext,
    BackendKernelTransactionRpcHandlerContext,
    BackendNeuralRoamRpcHandlerContext,
    BackendQueueProjectionRpcHandlerContext,
    BackendReviewRpcHandlerContext,
    BackendSyncRpcHandlerContext,
    BackendGraphRpcHandlerContext,
    BackendPrivateApiRpcHandlerContext,
    BackendSemanticRpcHandlerContext,
    BackendP6OwnershipRpcHandlerContext,
    BackendXiuyuanRpcHandlerContext,
    BackendProgressiveRpcHandlerContext,
    BackendTopicDerivedRpcHandlerContext {}

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

export const BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS = Object.freeze([
  ...BACKEND_CORE_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_NEURAL_ROAM_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_HOTSPOT_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_GRAPH_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_XIUYUAN_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS,
  ...BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS,
]) as readonly BackendRpcHandlerRegistration<BackendKernelRpcHandlerContext>[];

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
