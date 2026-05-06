import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';

const autoCardPolicyLoggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => autoCardPolicyLoggerMocks,
}));

import { AutoCardHandler } from '../AutoCardHandler';

function createReleasePolicy(overrides?: {
  backendWorker?: string;
  writerLeaseGuard?: string;
  autocardDecisionRelay?: string;
}) {
  return resolveBackendMigrationRuntimePolicy({
    VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: overrides?.backendWorker ?? 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: overrides?.writerLeaseGuard ?? 'true',
    VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: overrides?.autocardDecisionRelay ?? 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'false',
    VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
    VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'false',
  });
}

function createHandler(input?: {
  backendClient?: {
    executeAutoCard?: (request: unknown) => Promise<unknown>;
    resolveAutoCardDecision?: (request: unknown) => Promise<unknown>;
  } | null;
  relayRuntime?: {
    getMode: () => string;
    getInstanceId: () => string;
    ensureWritable?: () => Promise<void>;
  } | null;
  followerClient?: {
    submitAndWait: <TResult>(request: {
      instanceId: string;
      method: string;
      params?: unknown;
      commandId?: string;
    }, timeoutMs?: number) => Promise<TResult>;
  } | null;
  runtimePolicy?: {
    capabilities: {
      backendWorkerAvailable: boolean;
      writerRelayRuntimeEnabled: boolean;
      writerRelayRequiredForBackendWrites: boolean;
      reviewFeedbackWriteEnabled: boolean;
      autoCardExecuteWriteEnabled: boolean;
      autoCardDecisionBackendEnabled: boolean;
      kernelTransactionIngestEnabled: boolean;
      privateApiReadEnabled: boolean;
      privateApiMutationEnabled: boolean;
      aiBackendSessionEnabled: boolean;
    };
  } | null;
}) {
  const topicDerivedItemService = {
    createFromTopicSource: vi.fn(async () => ({
      created: 1,
      skipped: 0,
      items: [],
    })),
  };
  const plugin = {
    getContext: () => ({
      getSettingsService: () => ({
        getSettings: () => ({
          quickCard: {
            enabled: true,
          },
        }),
      }),
      getCardService: () => ({
        getCardByBlockId: () => null,
        getCardsByBlockId: () => [],
        saveCards: async () => undefined,
      }),
      getCardTypeDetectionService: () => ({
        detectCardType: async () => 'item',
      }),
      getTopicDerivedItemService: () => topicDerivedItemService,
      getSrsBackendClient: () => input?.backendClient ?? null,
      getFrontendInstanceRuntime: () => input?.relayRuntime ?? null,
      getFollowerCommandClient: () => input?.followerClient ?? null,
      getBackendMigrationRuntimePolicy: () => input?.runtimePolicy ?? null,
    }),
  };

  const handler = new AutoCardHandler(plugin as never, {
    siyuanApi: {
      getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
      sql: vi.fn(async () => []),
      getBlockAttrs: vi.fn(async () => ({})),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
      setBlockAttrs: vi.fn(async () => undefined),
      markBlockAsCard: vi.fn(async () => undefined),
    } as never,
    riffApi: {
      BUILTIN_DECK_ID: 'builtin-deck',
      addRiffCards: vi.fn(async () => ({ name: 'builtin-deck', size: 0 })),
    } as never,
  });

  return {
    handler,
    topicDerivedItemService,
  };
}

function createDecisionRequest() {
  return {
    blockId: 'block-2',
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
  } as const;
}

describe('AutoCardHandler backend execute routing', () => {
  beforeEach(() => {
    autoCardPolicyLoggerMocks.info.mockReset();
    autoCardPolicyLoggerMocks.warn.mockReset();
    autoCardPolicyLoggerMocks.error.mockReset();
    autoCardPolicyLoggerMocks.debug.mockReset();
  });

  it('uses backend autocard.execute in default release env (backend+writer writer mode)', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 2,
      skipped: 0,
    }));
    const resolveAutoCardDecision = vi.fn(async () => ({
      candidateId: 'candidate-backend',
      decisionEventId: 'decision-backend',
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: null,
      conflicted: false,
      strategyUsed: 'semantic-first',
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    }));
    const { handler } = createHandler({
      backendClient: { executeAutoCard, resolveAutoCardDecision },
      relayRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-1',
        ensureWritable: vi.fn(async () => undefined),
      },
      runtimePolicy: createReleasePolicy(),
    });

    const executed = await (handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-2',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    });
    const decision = await (handler as any).resolveAutoCardDecisionCore(createDecisionRequest());

    expect(executed).toBe(true);
    expect(decision.candidateId).toBe('candidate-backend');
    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(resolveAutoCardDecision).toHaveBeenCalledTimes(1);
  });

  it('refreshes writer lease before direct backend autocard.execute', async () => {
    const ensureWritable = vi.fn(async () => undefined);
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const { handler } = createHandler({
      backendClient: { executeAutoCard },
      relayRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-guarded-1',
        ensureWritable,
      },
      followerClient: {
        submitAndWait: vi.fn(async () => {
          throw new Error('real writer must not relay autocard.execute');
        }),
      },
      runtimePolicy: createReleasePolicy(),
    });

    const executed = await (handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-writer-guarded',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    });

    expect(executed).toBe(true);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).toHaveBeenCalledTimes(1);
  });

  it('routes stale writer autocard.execute through follower relay after guard refresh', async () => {
    let mode: 'writer' | 'follower' = 'writer';
    const executeAutoCard = vi.fn(async () => {
      throw new Error('stale writer must not execute autocard directly');
    });
    const submitAndWait = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const { handler } = createHandler({
      backendClient: { executeAutoCard },
      relayRuntime: {
        getMode: () => mode,
        getInstanceId: () => 'stale-writer-autocard-1',
        ensureWritable: vi.fn(async () => {
          mode = 'follower';
          throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance');
        }),
      },
      followerClient: { submitAndWait },
      runtimePolicy: createReleasePolicy(),
    });

    const executed = await (handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-stale-writer-autocard',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    });

    expect(executed).toBe(true);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'stale-writer-autocard-1',
      method: 'autocard.execute',
    }));
  });

  it('fails closed for backend-disabled policy in execute path and emits diagnostics', async () => {
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => ({ executed: true, created: 1, skipped: 0 })),
      },
      runtimePolicy: createReleasePolicy({ backendWorker: 'false', writerLeaseGuard: 'false' }),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-backend-disabled',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard.execute requires backend+writer ownership');

    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'backend-worker-disabled',
        method: 'autocard.execute',
      }),
    );
  });

  it('fails closed for backend-only policy in execute path and emits diagnostics', async () => {
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => ({ executed: true, created: 1, skipped: 0 })),
      },
      runtimePolicy: createReleasePolicy({ backendWorker: 'true', writerLeaseGuard: 'false' }),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-backend-only',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard.execute requires backend+writer ownership');

    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'writer-relay-disabled',
        method: 'autocard.execute',
      }),
    );
  });

  it('uses follower relay for execute and decision in follower mode', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: false,
      created: 0,
      skipped: 1,
    }));
    const resolveAutoCardDecision = vi.fn(async () => ({
      candidateId: 'candidate-backend',
      decisionEventId: 'decision-backend',
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: null,
      conflicted: false,
      strategyUsed: 'semantic-first',
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    }));
    const submitAndWait = vi.fn(async (request: { method: string }) => {
      if (request.method === 'autocard.execute') {
        return { executed: true, created: 1, skipped: 0 };
      }
      return {
        candidateId: 'candidate-relay',
        decisionEventId: 'decision-relay',
        status: 'selected',
        unavailableClass: null,
        matchedRuleIds: ['BasicDirectionRule'],
        enabledDecisions: [],
        filteredDecisions: [],
        selectedDecision: null,
        conflicted: false,
        strategyUsed: 'semantic-first',
        markOnlyClozeCandidate: false,
        shouldUseTopicDerivation: false,
      };
    });
    const { handler } = createHandler({
      backendClient: { executeAutoCard, resolveAutoCardDecision },
      relayRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      },
      followerClient: { submitAndWait },
      runtimePolicy: createReleasePolicy(),
    });

    const executed = await (handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-2',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    });
    const decision = await (handler as any).resolveAutoCardDecisionCore(createDecisionRequest());

    expect(executed).toBe(true);
    expect(decision.candidateId).toBe('candidate-relay');
    expect(submitAndWait).toHaveBeenCalledTimes(2);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(resolveAutoCardDecision).not.toHaveBeenCalled();
  });

  it('fails closed when runtime mode is unknown and writer relay is required', async () => {
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => ({ executed: true, created: 1, skipped: 0 })),
        resolveAutoCardDecision: vi.fn(async () => ({
          candidateId: 'candidate-backend',
          decisionEventId: 'decision-backend',
          status: 'selected',
          unavailableClass: null,
          matchedRuleIds: [],
          enabledDecisions: [],
          filteredDecisions: [],
          selectedDecision: null,
          conflicted: false,
          strategyUsed: 'semantic-first',
          markOnlyClozeCandidate: false,
          shouldUseTopicDerivation: false,
        })),
      },
      relayRuntime: {
        getMode: () => 'observer',
        getInstanceId: () => 'instance-observer',
      },
      runtimePolicy: createReleasePolicy(),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-unknown-mode',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime');

    await expect((handler as any).resolveAutoCardDecisionCore(createDecisionRequest())).rejects.toThrow(
      'BACKEND_UNAVAILABLE: autocard.decision.resolve requires writer relay runtime',
    );
  });

  it('emits follower relay timeout diagnostics for execute and decision', async () => {
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer relay timeout');
    });
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => ({ executed: true, created: 1, skipped: 0 })),
        resolveAutoCardDecision: vi.fn(async () => ({
          candidateId: 'candidate-backend',
          decisionEventId: 'decision-backend',
          status: 'selected',
          unavailableClass: null,
          matchedRuleIds: [],
          enabledDecisions: [],
          filteredDecisions: [],
          selectedDecision: null,
          conflicted: false,
          strategyUsed: 'semantic-first',
          markOnlyClozeCandidate: false,
          shouldUseTopicDerivation: false,
        })),
      },
      relayRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-timeout',
      },
      followerClient: { submitAndWait },
      runtimePolicy: createReleasePolicy(),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-timeout-1',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: writer relay timeout');
    await expect((handler as any).resolveAutoCardDecisionCore(createDecisionRequest())).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer relay timeout',
    );

    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'follower-relay-timeout',
        method: 'autocard.execute',
      }),
    );
    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'follower-relay-timeout',
        method: 'autocard.decision.resolve',
      }),
    );
  });

  it('emits writer unavailable diagnostics when backend execute reports writer lease failure', async () => {
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => {
          throw new Error('BACKEND_UNAVAILABLE: writer lease not owned by current instance');
        }),
      },
      relayRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-1',
        ensureWritable: vi.fn(async () => undefined),
      },
      runtimePolicy: createReleasePolicy(),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-writer-unavailable',
      content: 'Alpha <> Beta',
      decision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'both',
      },
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: writer lease not owned by current instance');

    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'writer-unavailable',
        method: 'autocard.execute',
      }),
    );
  });

  it('uses local decision path and emits compatibility-read-used diagnostics when backend decision is disabled', async () => {
    const { handler } = createHandler({
      backendClient: {
        resolveAutoCardDecision: vi.fn(async () => ({
          candidateId: 'candidate-backend',
          decisionEventId: 'decision-backend',
          status: 'selected',
          unavailableClass: null,
          matchedRuleIds: [],
          enabledDecisions: [],
          filteredDecisions: [],
          selectedDecision: null,
          conflicted: false,
          strategyUsed: 'semantic-first',
          markOnlyClozeCandidate: false,
          shouldUseTopicDerivation: false,
        })),
      },
      runtimePolicy: createReleasePolicy({ autocardDecisionRelay: 'false' }),
    });

    const result = await (handler as any).resolveAutoCardDecisionCore(createDecisionRequest());
    expect(result.selectedDecision).toBeTruthy();
    expect(autoCardPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][AutoCardHandler]',
      expect.objectContaining({
        reason: 'compatibility-read-used',
        method: 'autocard.decision.resolve',
        mode: 'local-decision',
      }),
    );
  });
});
