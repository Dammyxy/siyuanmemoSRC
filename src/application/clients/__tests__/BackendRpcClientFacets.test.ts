import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendRpcRequest,
  type BackendRpcResponse,
} from '../../../../packages/contracts/src/backend-rpc';
import {
  BackendAiJobRpcClient,
  BackendBrowserRpcClient,
  BackendCoreRpcClient,
  BackendIntegrationRpcClient,
  BackendNeuralRoamRpcClient,
  BackendPrivateApiRpcClient,
  BackendQueueProjectionRpcClient,
  BackendReviewRpcClient,
  BackendRpcCaller,
  BackendSemanticRpcClient,
  type SrsBackendTransport,
} from '../backend';

describe('backend RPC client facets', () => {
  it('routes core, Browser, and Queue Projection facets through one shared caller', async () => {
    const { caller, requests } = createFacetHarness({
      'browser.deck.matchedIds': { ids: ['card-a', 'card-b'] },
      'browser.count': { count: '3' },
      'browser.sourceExistence.byBlockIds': {
        statusByBlockId: [
          { blockId: 'block-a', exists: true },
          { blockId: 'block-b', exists: null },
        ],
      },
    });
    const core = new BackendCoreRpcClient(caller);
    const browser = new BackendBrowserRpcClient(caller);
    const queue = new BackendQueueProjectionRpcClient(caller);

    await core.systemHealth();
    await expect(browser.browserDeckMatchedIds({ deckId: 'deck-a' } as never)).resolves.toEqual(['card-a', 'card-b']);
    await expect(browser.browserCountCards({ deckId: 'deck-a' } as never)).resolves.toBe(3);
    await expect(browser.browserSourceExistenceByBlockIds(['block-a', 'block-b'])).resolves.toEqual(new Map([
      ['block-a', true],
      ['block-b', null],
    ]));
    await queue.queueProjectionSnapshot({ queueType: 'retrieval-practice' } as never);

    expect(requests.map((request) => ({
      id: request.id,
      method: request.method,
      params: request.params,
    }))).toEqual([
      { id: 1, method: 'system.health', params: [] },
      { id: 2, method: 'browser.deck.matchedIds', params: [{ query: { deckId: 'deck-a' } }] },
      { id: 3, method: 'browser.count', params: [{ query: { deckId: 'deck-a' } }] },
      { id: 4, method: 'browser.sourceExistence.byBlockIds', params: [{ blockIds: ['block-a', 'block-b'] }] },
      { id: 5, method: 'queue.projection.snapshot', params: [{ queueType: 'retrieval-practice' }] },
    ]);
  });

  it('routes Review, NeuralRoam, and AI/Job facets without scheduling facade side effects', async () => {
    const { caller, requests } = createFacetHarness({
      'ai.prompt.execute': { ok: true, streamId: 'stream-a', sessionId: 'session-a', jobId: 'job-a' },
      'neural-roam.command': { status: 'ok', queueType: 'neural-roam' },
      'review.feedback': { committed: true, cardId: 'card-a' },
    });
    const review = new BackendReviewRpcClient(caller);
    const neuralRoam = new BackendNeuralRoamRpcClient(caller);
    const aiJob = new BackendAiJobRpcClient(caller);

    await expect(review.reviewFeedback({ cardId: 'card-a', rating: 3 } as never)).resolves.toEqual({
      committed: true,
      cardId: 'card-a',
    });
    await expect(neuralRoam.neuralRoamCommand({ command: 'reset' } as never)).resolves.toEqual({
      status: 'ok',
      queueType: 'neural-roam',
    });
    await expect(aiJob.executeAiPrompt({ prompt: 'hello' } as never)).resolves.toEqual({
      ok: true,
      streamId: 'stream-a',
      sessionId: 'session-a',
      jobId: 'job-a',
    });

    expect(requests.map((request) => ({
      method: request.method,
      params: request.params,
    }))).toEqual([
      { method: 'review.feedback', params: [{ cardId: 'card-a', rating: 3 }] },
      { method: 'neural-roam.command', params: [{ command: 'reset' }] },
      { method: 'ai.prompt.execute', params: [{ prompt: 'hello' }] },
    ]);
  });

  it('routes Semantic, Private API, and integration facets through family-owned method strings', async () => {
    const { caller, requests } = createFacetHarness({
      'domainSync.conflictSources.cleanupCandidates': { ok: true, candidates: [] },
      'private.read.cards': { ok: true, rows: [] },
      'progressive.command.execute': { status: 'accepted', commandId: 'progressive-a' },
      'semantic.browser.read': { status: 'ready', session: null },
    });
    const semantic = new BackendSemanticRpcClient(caller);
    const privateApi = new BackendPrivateApiRpcClient(caller);
    const integration = new BackendIntegrationRpcClient(caller);

    await semantic.semanticBrowserRead({ method: 'semantic.browser.read', requestId: 'semantic-a' } as never);
    await privateApi.privateRead({ method: 'private.read.cards', requestId: 'private-a' } as never);
    await integration.domainSyncConflictSourceCleanupCandidates();
    await integration.executeProgressiveCommand({ commandId: 'progressive-a' } as never);

    expect(requests.map((request) => ({
      method: request.method,
      params: request.params,
    }))).toEqual([
      {
        method: 'semantic.browser.read',
        params: [{ method: 'semantic.browser.read', requestId: 'semantic-a' }],
      },
      {
        method: 'private.read.cards',
        params: [{ method: 'private.read.cards', requestId: 'private-a' }],
      },
      {
        method: 'domainSync.conflictSources.cleanupCandidates',
        params: [],
      },
      {
        method: 'progressive.command.execute',
        params: [{ commandId: 'progressive-a' }],
      },
    ]);
  });

  it('propagates explicit backend unavailable errors through facets', async () => {
    const { caller } = createFacetHarness({}, 'BACKEND_UNAVAILABLE');
    const core = new BackendCoreRpcClient(caller);

    await expect(core.loadDatabase()).rejects.toThrow('BACKEND_UNAVAILABLE: test unavailable');
  });
});

function createFacetHarness(
  resultsByMethod: Record<string, unknown> = {},
  errorCode: 'BACKEND_UNAVAILABLE' | null = null,
): {
  caller: BackendRpcCaller;
  requests: BackendRpcRequest[];
} {
  const requests: BackendRpcRequest[] = [];
  const transport: SrsBackendTransport = {
    request: vi.fn(async (request) => {
      requests.push(request);
      if (errorCode) {
        return {
          jsonrpc: BACKEND_RPC_VERSION,
          id: request.id,
          error: {
            code: errorCode,
            message: 'test unavailable',
          },
        } satisfies BackendRpcResponse;
      }
      return {
        jsonrpc: BACKEND_RPC_VERSION,
        id: request.id,
        result: resultsByMethod[request.method] ?? {
          ok: true,
          method: request.method,
          params: request.params,
        },
      } satisfies BackendRpcResponse;
    }),
  };
  return {
    caller: new BackendRpcCaller(transport),
    requests,
  };
}
