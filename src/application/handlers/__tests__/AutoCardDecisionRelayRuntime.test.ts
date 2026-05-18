import { describe, expect, it, vi } from 'vitest';
import { AutoCardDecisionRelayRuntime, type AutoCardDecisionRelayRuntimeInput } from '../AutoCardDecisionRelayRuntime';
import { resolveBackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';

function releasePolicy() {
  return resolveBackendMigrationRuntimePolicy({
    VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
    VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'false',
    VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
    VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'false',
  });
}

function decisionInput(): AutoCardDecisionRelayRuntimeInput {
  return {
    blockId: 'block-1',
    content: 'Alpha <> Beta',
    blockType: 'p',
    resolvedCardType: 'item',
    source: 'symbol-listener',
    ruleScope: 'all',
    quickCardSettings: {
      enabledSymbols: {
        basic: true,
        concept: true,
        descriptor: true,
        cloze: true,
        multiLine: true,
      },
      topicDerivation: {
        enabled: true,
      },
    },
    sourceContext: null,
  };
}

function backendResult(candidateId = 'candidate-relay') {
  return {
    candidateId,
    decisionEventId: `decision-${candidateId}`,
    status: 'selected' as const,
    unavailableClass: null,
    matchedRuleIds: ['BasicDirectionRule'],
    enabledDecisions: [],
    filteredDecisions: [],
    selectedDecision: null,
    conflicted: false,
    strategyUsed: 'semantic-first' as const,
    markOnlyClozeCandidate: false,
    shouldUseTopicDerivation: false,
  };
}

describe('AutoCardDecisionRelayRuntime', () => {
  it('routes follower AutoCard decisions through writer relay without direct backend resolve', async () => {
    const resolveAutoCardDecision = vi.fn(async () => backendResult('candidate-backend'));
    const submitAndWait = vi.fn(async () => backendResult('candidate-relay'));
    const runtime = new AutoCardDecisionRelayRuntime({
      getBackendClient: () => ({ resolveAutoCardDecision } as never),
      getRuntimePolicy: () => releasePolicy(),
      getRelayRuntimeState: () => ({ mode: 'follower', instanceId: 'follower-1' }),
      getFollowerCommandClient: () => ({ submitAndWait }),
      tracePolicyDecision: vi.fn(),
      toCreationDecision: (decision) => decision as never,
      resolveLocal: vi.fn(),
      hashCommandPayload: () => 'hash-1',
    });

    const result = await runtime.resolve(decisionInput());

    expect(result.candidateId).toBe('candidate-relay');
    expect(resolveAutoCardDecision).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-1',
      commandId: 'autocard.decision.resolve:hash-1',
      method: 'autocard.decision.resolve',
    }));
  });
});
