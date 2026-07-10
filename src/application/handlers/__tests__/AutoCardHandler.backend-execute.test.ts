import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import {
  clearRuntimePerformanceDiagnostics,
  getRuntimePerformanceDiagnosticsReport,
  installRuntimePerformanceDiagnosticsGlobal,
} from '@/utils/runtimePerformanceDiagnostics';
import { BUILTIN_DECK_ID } from '@/core/siyuan/riff';

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
  contextError?: Error;
  backendClientError?: Error;
  backendClient?: {
    executeAutoCard?: (request: unknown) => Promise<unknown>;
    executeAutoCardBatch?: (request: unknown) => Promise<unknown>;
    resolveAutoCardDecision?: (request: unknown) => Promise<unknown>;
  } | null;
  relayRuntimeError?: Error;
  relayRuntime?: {
    getMode: () => string;
    getInstanceId: () => string;
    ensureWritable?: () => Promise<void>;
  } | null;
  hostBlockQuery?: Record<string, unknown>;
  getBlockKramdown?: (blockId: string) => Promise<{ kramdown: string }>;
  xiuyuanApplicationService?: Record<string, unknown>;
  followerClientError?: Error;
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
    getContext: () => {
      if (input?.contextError) {
        throw input.contextError;
      }
      return ({
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
      getXiuyuanApplicationService: async () => input?.xiuyuanApplicationService ?? ({
        createFromBlocks: vi.fn(async () => ({
          ok: true,
          value: {
            xiuyuan: { id: 'xiuyuan-single' },
            cards: [{ id: 'card-single' }],
          },
        })),
        createFromBlocksBatch: vi.fn(async () => ({
          ok: true,
          value: {
            payloads: [],
            createdCount: 0,
            skippedCount: 0,
            failedCount: 0,
          },
        })),
        createTemplate: vi.fn(async () => ({ ok: true, value: undefined })),
      }),
      getSrsBackendClient: () => {
        if (input?.backendClientError) {
          throw input.backendClientError;
        }
        return input?.backendClient ?? null;
      },
      getFrontendInstanceRuntime: () => {
        if (input?.relayRuntimeError) {
          throw input.relayRuntimeError;
        }
        return input?.relayRuntime ?? null;
      },
      getFollowerCommandClient: () => {
        if (input?.followerClientError) {
          throw input.followerClientError;
        }
        return input?.followerClient ?? null;
      },
      getBackendMigrationRuntimePolicy: () => input?.runtimePolicy ?? null,
    });
    },
  };

  const handler = new AutoCardHandler(plugin as never, {
    siyuanApi: {
      getBlockKramdown: vi.fn(input?.getBlockKramdown ?? (async () => ({ kramdown: '' }))),
      sql: vi.fn(async () => []),
      getBlockAttrs: vi.fn(async () => ({})),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
      setBlockAttrs: vi.fn(async () => undefined),
      markBlockAsCard: vi.fn(async () => undefined),
    } as never,
    hostBlockQuery: input?.hostBlockQuery as never,
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

  it('routes one-click document scans through one backend batch execute call', async () => {
    installRuntimePerformanceDiagnosticsGlobal();
    const runtimePerformance = globalThis.siyuanMemoRuntimePerformance;
    runtimePerformance?.enable?.();
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const executeAutoCardBatch = vi.fn(async () => ({
      executed: true,
      created: 2,
      skipped: 0,
    }));
    const resolveAutoCardDecision = vi.fn(async (request: { blockId: string }) => ({
      candidateId: `candidate-${request.blockId}`,
      decisionEventId: `decision-${request.blockId}`,
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'forward',
      },
      conflicted: false,
      strategyUsed: 'semantic-first',
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    }));
    const hostBlockQuery = {
      getDocumentRootId: vi.fn(async () => 'doc-root-1'),
      listBlocksByRoot: vi.fn(async () => [
        { id: 'block-1', type: 'p' },
        { id: 'block-2', type: 'p' },
      ]),
      listParentIdsWithParagraphChild: vi.fn(async () => new Set<string>()),
    };
    const ensureWritable = vi.fn(async () => undefined);
    const { handler } = createHandler({
      backendClient: { executeAutoCard, executeAutoCardBatch, resolveAutoCardDecision },
      relayRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-doc-scan-1',
        ensureWritable,
      },
      runtimePolicy: createReleasePolicy(),
      hostBlockQuery,
      getBlockKramdown: async (blockId) => ({
        kramdown: blockId === 'block-1' ? 'Alpha >> Beta' : 'Gamma >> Delta',
      }),
    });

    const summary = await handler.scanDocumentByRootId('doc-root-1');

    expect(summary).toMatchObject({
      rootId: 'doc-root-1',
      scanned: 2,
      created: 2,
      skipped: 0,
      failed: 0,
    });
    expect(resolveAutoCardDecision).toHaveBeenCalledTimes(2);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(executeAutoCardBatch).toHaveBeenCalledTimes(1);
    expect(executeAutoCardBatch).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          envelope: expect.objectContaining({
            kind: 'planner-decision',
            blockId: 'block-1',
            content: 'Alpha >> Beta',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
          }),
        }),
        expect.objectContaining({
          envelope: expect.objectContaining({
            kind: 'planner-decision',
            blockId: 'block-2',
            content: 'Gamma >> Delta',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
          }),
        }),
      ],
    });
    const report = getRuntimePerformanceDiagnosticsReport();
    expect(report.counters['autocard.doc-scan-candidates']).toBe(2);
    expect(report.counters['autocard.doc-scan-created']).toBe(2);
    expect(report.counters['autocard.doc-scan-skipped']).toBe(0);
    expect(report.counters['autocard.doc-scan-failed']).toBe(0);
    expect(report.events.some((event) => event.path === 'autocard' && event.operation === 'doc-scan.total')).toBe(true);
    expect(report.events.some((event) => event.path === 'autocard' && event.operation === 'execute-envelope-batch.worker-or-relay')).toBe(true);
    runtimePerformance?.disable?.();
    clearRuntimePerformanceDiagnostics();
  });

  it('does not count backend structural no-match as skipped before document scan batch execution', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const executeAutoCardBatch = vi.fn(async (request: { items: unknown[] }) => ({
      executed: false,
      created: 0,
      skipped: request.items.length,
      failed: 0,
    }));
    const resolveAutoCardDecision = vi.fn(async (request: { ruleScope?: string }) => ({
      candidateId: 'candidate-doc-scan',
      decisionEventId: 'decision-doc-scan',
      status: request.ruleScope === 'structural' ? 'skipped' : 'selected',
      unavailableClass: null,
      matchedRuleIds: request.ruleScope === 'structural' ? [] : ['BasicDirectionRule'],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: request.ruleScope === 'structural' ? null : {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        priority: 50,
        direction: 'forward',
      },
      conflicted: false,
      strategyUsed: 'semantic-first',
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    }));
    const hostBlockQuery = {
      getDocumentRootId: vi.fn(async () => 'doc-root-1'),
      listBlocksByRoot: vi.fn(async () => [
        { id: 'list-item-1', type: 'i' },
        { id: 'list-item-2', type: 'i' },
        { id: 'paragraph-1', type: 'p' },
        { id: 'paragraph-2', type: 'p' },
      ]),
      listParentIdsWithParagraphChild: vi.fn(async () => new Set<string>()),
    };
    const { handler } = createHandler({
      backendClient: { executeAutoCard, executeAutoCardBatch, resolveAutoCardDecision },
      relayRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-doc-scan-2',
        ensureWritable: vi.fn(async () => undefined),
      },
      runtimePolicy: createReleasePolicy(),
      hostBlockQuery,
      getBlockKramdown: async (blockId) => ({
        kramdown: `${blockId} >> Answer`,
      }),
    });

    const summary = await handler.scanDocumentByRootId('doc-root-1');

    expect(summary).toMatchObject({
      rootId: 'doc-root-1',
      scanned: 4,
      created: 0,
      skipped: 4,
      failed: 0,
      conflicted: 0,
      consumed: 0,
    });
    expect(resolveAutoCardDecision).toHaveBeenCalledTimes(6);
    expect(executeAutoCardBatch).toHaveBeenCalledTimes(1);
  });

  it('executes backend document scan quick-basic batches through Xiuyuan batch creation', async () => {
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xiuyuan-single' },
        cards: [{ id: 'card-single' }],
      },
    }));
    const createFromBlocksBatch = vi.fn(async (commands: unknown[]) => ({
      ok: true,
      value: {
        payloads: commands.map((_, index) => ({
          xiuyuan: { id: `xiuyuan-${index + 1}` },
          cards: [{ id: `card-${index + 1}` }],
        })),
        createdCount: commands.length,
        skippedCount: 0,
        failedCount: 0,
      },
    }));
    const { handler } = createHandler({
      xiuyuanApplicationService: {
        createFromBlocks,
        createFromBlocksBatch,
        createTemplate: vi.fn(async () => ({ ok: true, value: undefined })),
      },
    });

    const result = await handler.executeBatchFromBackend({
      items: [
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-1',
            content: 'Alpha >> Beta',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'item',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'forward',
            },
          },
        },
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-2',
            content: 'Gamma >> Delta',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'topic',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'forward',
            },
          },
        },
      ],
    });

    expect(result).toEqual({
      executed: true,
      created: 2,
      skipped: 0,
      failed: 0,
    });
    expect(createFromBlocks).not.toHaveBeenCalled();
    expect(createFromBlocksBatch).toHaveBeenCalledTimes(1);
    expect(createFromBlocksBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        blockIds: ['block-1'],
        templateId: 'builtin-quick-card',
        fieldMapping: { content: 'block-1' },
        deckId: BUILTIN_DECK_ID,
        cardType: 'item',
        source: 'doc-oneclick-scan',
        duplicatePolicy: 'error',
        creationRuleId: 'BasicDirectionRule',
        creationMode: 'single',
      }),
      expect.objectContaining({
        blockIds: ['block-2'],
        templateId: 'builtin-quick-card',
        fieldMapping: { content: 'block-2' },
        deckId: BUILTIN_DECK_ID,
        cardType: 'topic',
        source: 'doc-oneclick-scan',
        duplicatePolicy: 'error',
        creationRuleId: 'BasicDirectionRule',
        creationMode: 'single',
      }),
    ]);
  });

  it('batches mixed one-click basic directions including bidirectional symbols', async () => {
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xiuyuan-single' },
        cards: [{ id: 'card-single' }],
      },
    }));
    const createFromBlocksBatch = vi.fn(async (commands: unknown[]) => ({
      ok: true,
      value: {
        payloads: commands.map((_, index) => ({
          xiuyuan: { id: `xiuyuan-${index + 1}` },
          cards: [{ id: `card-${index + 1}` }],
        })),
        createdCount: commands.length,
        skippedCount: 0,
        failedCount: 0,
      },
    }));
    const { handler } = createHandler({
      xiuyuanApplicationService: {
        createFromBlocks,
        createFromBlocksBatch,
        createTemplate: vi.fn(async () => ({ ok: true, value: undefined })),
      },
    });

    const result = await handler.executeBatchFromBackend({
      items: [
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-1',
            content: '1>>2',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'item',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'forward',
            },
          },
        },
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-2',
            content: '3<>4',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
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
          },
        },
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-3',
            content: '5<<6',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'item',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'backward',
            },
          },
        },
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-4',
            content: '7>>8',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'item',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'forward',
            },
          },
        },
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-5',
            content: '9<>10',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
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
          },
        },
      ],
    });

    expect(result).toEqual({
      executed: true,
      created: 5,
      skipped: 0,
      failed: 0,
    });
    expect(createFromBlocks).not.toHaveBeenCalled();
    expect(createFromBlocksBatch).toHaveBeenCalledTimes(1);
    expect(createFromBlocksBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        blockIds: ['block-1'],
        templateId: 'builtin-quick-card',
        fieldMapping: { content: 'block-1' },
      }),
      expect.objectContaining({
        blockIds: ['block-2'],
        templateId: 'builtin-bidirectional-single',
        fieldMapping: { content: 'block-2' },
      }),
      expect.objectContaining({
        blockIds: ['block-3'],
        templateId: 'builtin-quick-card',
        fieldMapping: { content: 'block-3' },
      }),
      expect.objectContaining({
        blockIds: ['block-4'],
        templateId: 'builtin-quick-card',
        fieldMapping: { content: 'block-4' },
      }),
      expect.objectContaining({
        blockIds: ['block-5'],
        templateId: 'builtin-bidirectional-single',
        fieldMapping: { content: 'block-5' },
      }),
    ]);
  });

  it('keeps batch failure counts visible when Xiuyuan batch creation reports failures', async () => {
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xiuyuan-single' },
        cards: [{ id: 'card-single' }],
      },
    }));
    const createFromBlocksBatch = vi.fn(async () => ({
      ok: true,
      value: {
        payloads: [
          {
            xiuyuan: { id: 'xiuyuan-1' },
            cards: [{ id: 'card-1' }],
          },
        ],
        createdCount: 1,
        skippedCount: 0,
        failedCount: 1,
      },
    }));
    const { handler } = createHandler({
      xiuyuanApplicationService: {
        createFromBlocks,
        createFromBlocksBatch,
        createTemplate: vi.fn(async () => ({ ok: true, value: undefined })),
      },
    });

    const result = await handler.executeBatchFromBackend({
      items: [
        {
          envelope: {
            kind: 'planner-decision',
            blockId: 'block-1',
            content: 'Alpha >> Beta',
            source: 'doc-oneclick-scan',
            docRootId: 'doc-root-1',
            decision: {
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-quick-card',
              cardType: 'item',
              mode: 'single',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'forward',
            },
          },
        },
      ],
    });

    expect(result).toEqual({
      executed: true,
      created: 1,
      skipped: 0,
      failed: 1,
    });
    expect(createFromBlocks).not.toHaveBeenCalled();
    expect(createFromBlocksBatch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when ApplicationContext lookup throws instead of continuing with absent dependencies', async () => {
    const { handler } = createHandler({
      contextError: new Error('context registry unavailable'),
      runtimePolicy: createReleasePolicy({ autocardDecisionRelay: 'false' }),
    });

    await expect((handler as any).resolveAutoCardDecisionCore(createDecisionRequest())).rejects.toThrow(
      'AUTOCARD_RUNTIME_UNAVAILABLE: ApplicationContext lookup failed',
    );
  });

  it('fails closed when follower command client lookup throws instead of continuing as missing relay', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const { handler } = createHandler({
      backendClient: { executeAutoCard },
      relayRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-client-fails',
      },
      followerClientError: new Error('follower client registry unavailable'),
      runtimePolicy: createReleasePolicy(),
    });

    await expect((handler as any).executeAutoCardEnvelope({
      kind: 'planner-decision',
      blockId: 'block-follower-client-fails',
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
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard follower command client is unavailable');

    expect(executeAutoCard).not.toHaveBeenCalled();
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
