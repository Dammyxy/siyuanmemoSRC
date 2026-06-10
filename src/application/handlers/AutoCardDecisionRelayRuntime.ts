import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import type { BackendAutoCardDecisionProjection, BackendAutoCardDecisionResolveResult, BackendUnavailableClass } from '../../../packages/contracts/src/backend-rpc';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import type { ProgressiveSourceContext } from '@/application/services/ProgressiveSourceContextResolver';
import type { AutoCardExecutionSource } from './AutoCardExecutionRuntime';

export type QuickCardSettings = {
  enabled?: boolean;
  flashcard?: {
    mark?: boolean;
    list?: boolean;
    heading?: boolean;
    superBlock?: boolean;
  };
  flashcardSeededFromSiyuan?: boolean;
  enabledSymbols?: {
    basic?: boolean;
    concept?: boolean;
    descriptor?: boolean;
    cloze?: boolean;
    multiLine?: boolean;
  };
  debounceDelay?: {
    quick?: number;
    list?: number;
  };
  enableDebounce?: boolean;
  descriptorUseXiuyuan?: boolean;
  topicDerivation?: {
    enabled?: boolean;
    storageMode?: 'workbench' | 'source-child';
  };
};

export type AutoCardDecisionRuleScope = 'all' | 'single-block' | 'structural';

export type AutoCardDecisionCoreResult = {
  candidateId: string;
  decisionEventId: string;
  status: 'selected' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
  unavailableClass: BackendUnavailableClass | null;
  matchedRuleIds: string[];
  enabledDecisions: CreationDecision[];
  selectedDecision: CreationDecision | null;
  conflicted: boolean;
  shouldUseTopicDerivation: boolean;
  markOnlyClozeCandidate: boolean;
};

export type BackendRelayRuntimeState =
  | { mode: 'missing' }
  | { mode: 'writer' }
  | { mode: 'follower'; instanceId: string }
  | { mode: 'unknown'; rawMode: string | null };

export type AutoCardDecisionBackendClient = Pick<BackendIntegrationClientFacet, 'resolveAutoCardDecision'>;

export interface AutoCardDecisionRelayRuntimeInput {
  blockId: string;
  content: string;
  blockType: string;
  resolvedCardType: 'topic' | 'item';
  source: AutoCardExecutionSource;
  ruleScope?: AutoCardDecisionRuleScope;
  quickCardSettings: QuickCardSettings;
  sourceContext: ProgressiveSourceContext | null;
}

export interface AutoCardDecisionFollowerCommandClient {
  submitAndWait: <TResult>(request: {
    instanceId: string;
    commandId?: string;
    method: string;
    params?: unknown;
  }, timeoutMs?: number) => Promise<TResult>;
}

export interface AutoCardDecisionRelayRuntimeDependencies {
  getBackendClient: () => AutoCardDecisionBackendClient | null;
  getRuntimePolicy: () => Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
  getRelayRuntimeState: () => BackendRelayRuntimeState;
  getFollowerCommandClient: () => AutoCardDecisionFollowerCommandClient | null;
  tracePolicyDecision: (reason: string, payload?: Record<string, unknown>) => void;
  toCreationDecision: (decision: BackendAutoCardDecisionProjection) => CreationDecision;
  resolveLocal: (input: AutoCardDecisionRelayRuntimeInput) => Promise<AutoCardDecisionCoreResult>;
  hashCommandPayload: (payload: string) => string;
}

export class AutoCardDecisionRelayRuntime {
  constructor(private readonly deps: AutoCardDecisionRelayRuntimeDependencies) {}

  async resolve(input: AutoCardDecisionRelayRuntimeInput): Promise<AutoCardDecisionCoreResult> {
    const backendClient = this.deps.getBackendClient();
    const runtimePolicy = this.deps.getRuntimePolicy();
    const request = this.buildRequest(input);
    if (backendClient && (runtimePolicy?.capabilities.autoCardDecisionBackendEnabled ?? true)) {
      const relayRuntime = this.deps.getRelayRuntimeState();
      this.assertRelayRuntimeAvailable(runtimePolicy, relayRuntime);
      const decisionResult = relayRuntime.mode === 'follower'
        ? await this.resolveViaFollowerRelay(relayRuntime, request)
        : await this.resolveViaBackend(backendClient, request);
      return this.toCoreResult(decisionResult);
    }

    if (runtimePolicy && !runtimePolicy.capabilities.autoCardDecisionBackendEnabled) {
      this.deps.tracePolicyDecision(
        runtimePolicy.capabilities.backendWorkerAvailable ? 'compatibility-read-used' : 'backend-worker-disabled',
        { method: 'autocard.decision.resolve', mode: 'local-decision' },
      );
    } else if (!backendClient) {
      this.deps.tracePolicyDecision('compatibility-read-used', {
        method: 'autocard.decision.resolve',
        mode: 'local-decision',
        reason: 'backend-client-missing',
      });
    }

    return measureRuntimePerformance('autocard', 'decision.local-resolve', () => this.deps.resolveLocal(input), {
      ruleScope: input.ruleScope ?? 'all',
      source: input.source,
    });
  }

  private buildRequest(input: AutoCardDecisionRelayRuntimeInput) {
    return {
      blockId: input.blockId,
      content: input.content,
      blockType: input.blockType,
      resolvedCardType: input.resolvedCardType,
      source: input.source,
      ruleScope: input.ruleScope ?? 'all',
      hasParentTopicCard: Boolean(input.sourceContext?.parentTopicCardId),
      settings: {
        enabledSymbols: {
          basic: input.quickCardSettings.enabledSymbols?.basic,
          concept: input.quickCardSettings.enabledSymbols?.concept,
          descriptor: input.quickCardSettings.enabledSymbols?.descriptor,
          cloze: input.quickCardSettings.enabledSymbols?.cloze,
          multiLine: input.quickCardSettings.enabledSymbols?.multiLine,
        },
        topicDerivation: {
          enabled: input.quickCardSettings.topicDerivation?.enabled,
        },
      },
    } as const;
  }

  private assertRelayRuntimeAvailable(
    runtimePolicy: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null,
    relayRuntime: BackendRelayRuntimeState,
  ): void {
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'missing') {
      this.deps.tracePolicyDecision('writer-relay-runtime-missing', {
        method: 'autocard.decision.resolve',
      });
      throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve requires writer relay runtime');
    }
    if (runtimePolicy?.capabilities.writerRelayRequiredForBackendWrites && relayRuntime.mode === 'unknown') {
      this.deps.tracePolicyDecision('writer-relay-runtime-unknown', {
        method: 'autocard.decision.resolve',
        rawMode: relayRuntime.rawMode,
      });
      throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve requires writer relay runtime');
    }
  }

  private async resolveViaFollowerRelay(
    relayRuntime: Extract<BackendRelayRuntimeState, { mode: 'follower' }>,
    request: ReturnType<AutoCardDecisionRelayRuntime['buildRequest']>,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const followerClient = this.deps.getFollowerCommandClient();
    if (!followerClient) {
      this.deps.tracePolicyDecision('follower-relay-unavailable', {
        method: 'autocard.decision.resolve',
        instanceId: relayRuntime.instanceId,
      });
      throw new Error('BACKEND_UNAVAILABLE: autocard.decision.resolve relay is unavailable in follower mode');
    }
    try {
      const relayResult = await measureRuntimePerformance('autocard', 'decision.relay-submit-wait', () => followerClient.submitAndWait<unknown>({
        instanceId: relayRuntime.instanceId,
        commandId: `autocard.decision.resolve:${this.deps.hashCommandPayload(JSON.stringify(request))}`,
        method: 'autocard.decision.resolve',
        params: request,
      }), {
        method: 'autocard.decision.resolve',
        ruleScope: request.ruleScope,
        source: request.source,
      });
      return normalizeBackendDecisionResolveResult(relayResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes('BACKEND_UNAVAILABLE: writer relay timeout')) {
        this.deps.tracePolicyDecision('follower-relay-timeout', {
          method: 'autocard.decision.resolve',
          instanceId: relayRuntime.instanceId,
        });
      }
      throw error;
    }
  }

  private async resolveViaBackend(
    backendClient: AutoCardDecisionBackendClient,
    request: ReturnType<AutoCardDecisionRelayRuntime['buildRequest']>,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    return normalizeBackendDecisionResolveResult(
      await measureRuntimePerformance('autocard', 'decision.backend-worker', () => backendClient.resolveAutoCardDecision(request), {
        method: 'autocard.decision.resolve',
        ruleScope: request.ruleScope,
        source: request.source,
      }),
    );
  }

  private toCoreResult(decisionResult: BackendAutoCardDecisionResolveResult): AutoCardDecisionCoreResult {
    return {
      candidateId: decisionResult.candidateId,
      decisionEventId: decisionResult.decisionEventId,
      status: decisionResult.status,
      unavailableClass: decisionResult.unavailableClass ?? null,
      matchedRuleIds: decisionResult.matchedRuleIds || [],
      enabledDecisions: (decisionResult.filteredDecisions || []).map((decision) => this.deps.toCreationDecision(decision)),
      selectedDecision: decisionResult.selectedDecision ? this.deps.toCreationDecision(decisionResult.selectedDecision) : null,
      conflicted: decisionResult.conflicted === true,
      shouldUseTopicDerivation: decisionResult.shouldUseTopicDerivation === true,
      markOnlyClozeCandidate: decisionResult.markOnlyClozeCandidate === true,
    };
  }
}

function normalizeBackendDecisionResolveResult(payload: unknown): BackendAutoCardDecisionResolveResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('autocard.decision.resolve returned invalid payload');
  }
  const candidate = payload as Record<string, unknown>;
  const status = String(candidate.status || '').trim();
  if (!isDecisionStatus(status)) {
    throw new Error('autocard.decision.resolve returned invalid payload');
  }
  const candidateId = String(candidate.candidateId || '').trim();
  const decisionEventId = String(candidate.decisionEventId || '').trim();
  if (!candidateId || !decisionEventId) {
    throw new Error('autocard.decision.resolve returned invalid payload');
  }
  return payload as BackendAutoCardDecisionResolveResult;
}

function isDecisionStatus(value: string): value is AutoCardDecisionCoreResult['status'] {
  return value === 'selected'
    || value === 'skipped'
    || value === 'no-op'
    || value === 'unavailable'
    || value === 'failed';
}
