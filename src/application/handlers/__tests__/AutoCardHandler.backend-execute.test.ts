import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

function createHandler(input?: {
  backendClient?: {
    executeAutoCard?: (request: unknown) => Promise<unknown>;
    resolveAutoCardDecision?: (request: unknown) => Promise<unknown>;
  } | null;
  relayRuntime?: {
    getMode: () => 'writer' | 'follower';
    getInstanceId: () => string;
  } | null;
  followerClient?: {
    submitAndWait: <TResult>(request: {
      instanceId: string;
      method: string;
      params?: unknown;
    }, timeoutMs?: number) => Promise<TResult>;
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

describe('AutoCardHandler backend execute routing', () => {
  it('uses backend autocard.execute when backend client is available', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 2,
      skipped: 0,
    }));
    const { handler, topicDerivedItemService } = createHandler({
      backendClient: { executeAutoCard },
    });

    const executed = await (handler as any).executeAutoCardEnvelope({
      kind: 'topic-derived',
      input: {
        sourceBlockId: 'block-1',
        sourceDocId: 'doc-1',
        parentTopicCardId: 'topic-1',
        plannerContent: 'Alpha <> Beta',
        decisions: [{
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          priority: 50,
          direction: 'both',
        }],
      },
    });

    expect(executed).toBe(true);
    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(topicDerivedItemService.createFromTopicSource).not.toHaveBeenCalled();
  });

  it('uses follower relay for autocard.execute when runtime is follower', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: false,
      created: 0,
      skipped: 1,
    }));
    const submitAndWait = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const { handler } = createHandler({
      backendClient: { executeAutoCard },
      relayRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      },
      followerClient: {
        submitAndWait,
      },
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

    expect(executed).toBe(true);
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).not.toHaveBeenCalled();
  });

  it('uses follower relay for autocard.decision.resolve when runtime is follower', async () => {
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
    const submitAndWait = vi.fn(async () => ({
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
    }));
    const { handler } = createHandler({
      backendClient: { resolveAutoCardDecision },
      relayRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      },
      followerClient: {
        submitAndWait,
      },
    });

    const result = await (handler as any).resolveAutoCardDecisionCore({
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
    });

    expect(result.candidateId).toBe('candidate-relay');
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-follower-1',
      method: 'autocard.decision.resolve',
    }));
    expect(resolveAutoCardDecision).not.toHaveBeenCalled();
  });

  it('returns explicit unavailable when follower decision relay is not ready', async () => {
    const { handler } = createHandler({
      backendClient: {
        resolveAutoCardDecision: vi.fn(async () => ({
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
        getInstanceId: () => 'instance-follower-1',
      },
      followerClient: null,
    });

    await expect((handler as any).resolveAutoCardDecisionCore({
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
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard.decision.resolve relay is unavailable in follower mode');
  });

  it('keeps local decision path when backend client is disabled', async () => {
    const { handler } = createHandler({
      backendClient: null,
    });

    const result = await (handler as any).resolveAutoCardDecisionCore({
      blockId: 'block-3',
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
    });

    expect(result.selectedDecision).toBeTruthy();
  });

  it('returns explicit unavailable when backend execution path is disabled', async () => {
    const { handler } = createHandler({
      backendClient: null,
    });

    await expect((handler as any).executeAutoCardEnvelope({
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
    })).rejects.toThrow('BACKEND_UNAVAILABLE: autocard.execute requires backend-worker ownership');
  });

  it('records backend-command execution ownership by default', async () => {
    const { handler } = createHandler({
      backendClient: null,
    });
    const ownership = (handler as any).resolveExecutionOwnership({
      kind: 'planner-decision',
    });
    expect(ownership).toEqual({
      owner: 'backend-command',
      envelopeKind: 'planner-decision',
    });
  });

  it('records backend-command ownership when backend execution path is available', async () => {
    const { handler } = createHandler({
      backendClient: {
        executeAutoCard: vi.fn(async () => ({
          executed: true,
          created: 1,
          skipped: 0,
        })),
      },
    });
    const ownership = (handler as any).resolveExecutionOwnership({
      kind: 'topic-derived',
    });
    expect(ownership).toEqual({
      owner: 'backend-command',
      envelopeKind: 'topic-derived',
    });
  });
});
