import { describe, expect, it, vi } from 'vitest';
import { SrsBackendClient, type SrsBackendTransport } from '../SrsBackendClient';

describe('SrsBackendClient', () => {
  it('sends browser phase-2 rpc envelopes with positional params', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        switch (request.method) {
          case 'browser.deck.page':
            return { jsonrpc: '2.0', id: request.id, result: { total: 0, cards: [] } };
          case 'browser.deck.matchedIds':
            return { jsonrpc: '2.0', id: request.id, result: { ids: ['card-1'] } };
          case 'browser.deck.rowsByIds':
            return { jsonrpc: '2.0', id: request.id, result: { cards: [{ id: 'card-1', blockId: 'block-1' }] } };
          case 'browser.stats':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                totalCards: 1,
                dueCards: 1,
                newCards: 0,
                learningCards: 0,
                reviewCards: 1,
                suspendedCards: 0,
                lostCards: 0,
              },
            };
          case 'browser.count':
            return { jsonrpc: '2.0', id: request.id, result: { count: 1 } };
          case 'browser.sourceExistence.refreshCandidates':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                candidates: [
                  {
                    cardId: 'card-1',
                    blockId: 'block-1',
                    sourceExists: null,
                    sourceCheckedAt: null,
                  },
                ],
              },
            };
          case 'browser.sourceExistence.byBlockIds':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                statusByBlockId: [
                  { blockId: 'block-1', exists: false },
                ],
              },
            };
          case 'browser.sourceExistence.update':
            return { jsonrpc: '2.0', id: request.id, result: { updated: 1 } };
          case 'browser.sourceExistence.summary':
            return { jsonrpc: '2.0', id: request.id, result: { unknown: 0, stale: 0, missing: 1 } };
          case 'browser.sourceExistence.applySweep':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'browser.sourceExistence.applySweepHost':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'kernel.transaction.ingest':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                accepted: 1,
                queued: 1,
                receivedAt: 1,
                duplicate: false,
                queueLength: 1,
                maxQueueLength: 256,
              },
            };
          case 'kernel.transaction.dequeue':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                actions: [],
                remaining: 0,
              },
            };
          case 'kernel.transaction.requeue':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                requeued: 1,
                queueLength: 1,
                maxQueueLength: 4096,
              },
            };
          case 'autocard.decision.resolve':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                candidateId: 'candidate-1',
                decisionEventId: 'decision-1',
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
              },
            };
          case 'autocard.execute':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                executed: true,
                created: 1,
                skipped: 0,
              },
            };
          case 'review.feedback':
            return { jsonrpc: '2.0', id: request.id, error: { code: 'BACKEND_UNAVAILABLE', message: 'review not ready' } };
          case 'queue.projection.snapshot': {
            const [params] = request.params as [{ queueType?: string }?];
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: params?.queueType,
                policyHash: 'policy-deferred',
                generation: 4,
                status: 'ready',
                rows: [],
                counters: {
                  version: 4,
                  remaining: 0,
                  due: 0,
                  total: 0,
                  buckets: { all: 0, item: 0, descriptor: 0, topic: 0, concept: 0 },
                  source: 'reconciled',
                },
              },
            };
          }
          case 'queue.projection.rowsByIds': {
            const [params] = request.params as [{ queueType?: string }?];
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: params?.queueType,
                policyHash: 'policy-deferred',
                generation: 4,
                status: 'ready',
                rows: [],
                cards: [],
              },
            };
          }
          case 'neural-roam.advance':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: 'neural-roam',
                sessionId: 'session-neural-1',
                status: 'advanced',
                nextItem: {
                  id: 'node-2',
                  cardId: 'node-2',
                  blockId: 'node-2',
                  deckId: 'neural-roam',
                  due: null,
                  type: 'topic',
                  meta: {
                    neuralContext: {
                      isFlashcard: false,
                    },
                  },
                  sourceKind: 'virtual',
                  payload: null,
                },
                counters: {
                  remaining: 1,
                  due: 1,
                  total: 1,
                  pendingAssociatedReview: 0,
                  sourceNodes: 1,
                },
                sessionState: {
                  sessionId: 'session-neural-1',
                  engineMode: 'hyperspace',
                  currentNodeId: 'node-2',
                  currentEventId: 'event-2',
                  pathLength: 2,
                  historyCount: 1,
                  exhausted: false,
                  projectionGeneration: 4,
                  policyHash: 'policy-deferred',
                },
                projectionImpact: null,
                unavailableReason: null,
                message: null,
              },
            };
          case 'ai.session.create':
          case 'ai.session.get':
          case 'ai.session.update':
          case 'ai.session.cancel':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                session: {
                  sessionId: 'ai-session-1',
                  surfaceId: 'standalone-dialog',
                  reviewSessionId: null,
                  owner: 'backend',
                  skillId: 'general-chat',
                  providerId: 'openai',
                  modelId: 'gpt-test',
                  state: request.method === 'ai.session.cancel' ? 'canceled' : 'active',
                  createdAt: 1,
                  updatedAt: 2,
                  expiresAt: null,
                  lastError: null,
                  diagnosticEventId: 'diag-ai-session-1',
                },
              },
            };
          case 'ai.stream.start':
          case 'ai.stream.cancel':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                streamId: 'stream-1',
                sessionId: 'ai-session-1',
                jobId: 'job-1',
                state: request.method === 'ai.stream.cancel' ? 'canceled' : 'started',
                diagnosticEventId: 'diag-ai-stream-1',
              },
            };
          case 'ai.prompt.execute':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                sessionId: 'ai-session-1',
                streamId: 'stream-1',
                jobId: 'job-1',
                state: 'completed',
                unavailableClass: null,
                diagnosticEventId: 'diag-ai-prompt-1',
                response: {
                  status: 200,
                  headers: {},
                  body: '{"choices":[{"message":{"content":"ok"}}]}',
                },
              },
            };
          case 'job.get':
          case 'job.cancel':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                job: {
                  jobId: 'job-1',
                  kind: 'ai-stream',
                  owner: 'backend',
                  idempotencyKey: 'job-key-1',
                  state: request.method === 'job.cancel' ? 'canceled' : 'running',
                  progress: 40,
                  startedAt: 1,
                  updatedAt: 2,
                  deadlineAt: null,
                  retryPolicy: 'none',
                  result: null,
                  error: null,
                },
              },
            };
          default:
            return { jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_FOUND', message: 'not mocked' } };
        }
      }),
    };

    const client = new SrsBackendClient(transport);
    await client.browserDeckPage({ preset: 'all' }, { startRow: 0, endRow: 10 });
    await expect(client.browserDeckMatchedIds({ preset: 'all' })).resolves.toEqual(['card-1']);
    await expect(client.browserDeckRowsByIds(['card-1'])).resolves.toEqual([{ id: 'card-1', blockId: 'block-1' }]);
    await expect(client.browserStats()).resolves.toMatchObject({ totalCards: 1, dueCards: 1 });
    await expect(client.browserCountCards({ includeSuspended: false })).resolves.toBe(1);
    await expect(client.browserSourceExistenceRefreshCandidates({ blockIds: ['block-1'] })).resolves.toHaveLength(1);
    await expect(client.browserSourceExistenceByBlockIds(['block-1'])).resolves.toEqual(new Map([['block-1', false]]));
    await expect(client.browserSourceExistenceUpdate([{ blockId: 'block-1', exists: false }], 1)).resolves.toBe(1);
    await expect(client.browserSourceExistenceSummary()).resolves.toEqual({ unknown: 0, stale: 0, missing: 1 });
    await expect(client.browserSourceExistenceApplySweep({ blockIds: ['block-1'] }, ['block-1'], 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.browserSourceExistenceApplySweepHost({ blockIds: ['block-1'] }, 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.ingestKernelTransactions({
      source: 'kernel-sidecar',
      transactions: [{ id: 'tx-1' }],
      receivedAt: 1,
      idempotencyKey: 'tx-1',
    })).resolves.toEqual({
      accepted: 1,
      queued: 1,
      receivedAt: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    });
    await expect(client.dequeueKernelTransactions({
      maxActions: 8,
    })).resolves.toEqual({
      actions: [],
      remaining: 0,
    });
    await expect(client.requeueKernelTransactions({
      actions: [{
        type: 'native-riff-remove',
        blockIds: ['block-1'],
        source: 'ws-main',
        receivedAt: 1,
        idempotencyKey: 'rq-1',
      }],
    })).resolves.toEqual({
      requeued: 1,
      queueLength: 1,
      maxQueueLength: 4096,
    });
    await expect(client.resolveAutoCardDecision({
      blockId: 'block-1',
      content: 'Q <> A',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
      settings: {
        enabledSymbols: {
          basic: true,
        },
      },
    })).resolves.toMatchObject({
      candidateId: 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      selectedDecision: null,
      strategyUsed: 'semantic-first',
    });
    await expect(client.executeAutoCard({
      envelope: {
        kind: 'planner-decision',
        blockId: 'block-1',
        content: 'Q <> A',
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
      },
    })).resolves.toEqual({
      executed: true,
      created: 1,
      skipped: 0,
    });
    await expect(client.reviewFeedback({
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review not ready');
    await expect(client.queueProjectionSnapshot({
      queueType: 'neural-roam',
      generation: 4,
      policyHash: 'policy-deferred',
    })).resolves.toMatchObject({
      queueType: 'neural-roam',
      status: 'ready',
      generation: 4,
    });
    await expect(client.queueProjectionRowsByIds({
      queueType: 'filter-group',
      ids: ['row-a'],
      generation: 4,
      policyHash: 'policy-deferred',
    })).resolves.toMatchObject({
      queueType: 'filter-group',
      status: 'ready',
      cards: [],
    });
    await expect(client.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      currentItem: {
        id: 'node-1',
        cardId: 'node-1',
        blockId: 'node-1',
        sourceKind: 'virtual',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      projectionGeneration: 4,
      policyHash: 'policy-deferred',
      idempotencyKey: 'neural-advance-key-1',
    })).resolves.toMatchObject({
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      status: 'advanced',
      nextItem: {
        blockId: 'node-2',
        sourceKind: 'virtual',
      },
      counters: {
        remaining: 1,
      },
      sessionState: {
        projectionGeneration: 4,
        policyHash: 'policy-deferred',
      },
    });
    await expect(client.createAiSession({
      sessionId: 'ai-session-1',
      surfaceId: 'standalone-dialog',
    })).resolves.toMatchObject({
      ok: true,
      session: {
        sessionId: 'ai-session-1',
      },
    });
    await expect(client.getAiSession({
      sessionId: 'ai-session-1',
    })).resolves.toMatchObject({
      ok: true,
      session: {
        sessionId: 'ai-session-1',
      },
    });
    await expect(client.updateAiSession({
      sessionId: 'ai-session-1',
      state: 'streaming',
    })).resolves.toMatchObject({
      ok: true,
      session: {
        state: 'active',
      },
    });
    await expect(client.cancelAiSession({
      sessionId: 'ai-session-1',
      reason: 'cancel-test',
    })).resolves.toMatchObject({
      ok: true,
      session: {
        state: 'canceled',
      },
    });
    await expect(client.startAiStream({
      streamId: 'stream-1',
      sessionId: 'ai-session-1',
      jobId: 'job-1',
    })).resolves.toMatchObject({
      ok: true,
      state: 'started',
    });
    await expect(client.cancelAiStream({
      streamId: 'stream-1',
      sessionId: 'ai-session-1',
      jobId: 'job-1',
    })).resolves.toMatchObject({
      ok: true,
      state: 'canceled',
    });
    await expect(client.executeAiPrompt({
      sessionId: 'ai-session-1',
      streamId: 'stream-1',
      jobId: 'job-1',
      request: {
        url: 'https://example.com/chat/completions',
        method: 'POST',
        body: '{}',
      },
    })).resolves.toMatchObject({
      ok: true,
      state: 'completed',
    });
    await expect(client.getAiJob({
      jobId: 'job-1',
    })).resolves.toMatchObject({
      ok: true,
      job: {
        jobId: 'job-1',
      },
    });
    await expect(client.cancelAiJob({
      jobId: 'job-1',
      reason: 'cancel-job',
    })).resolves.toMatchObject({
      ok: true,
      job: {
        state: 'canceled',
      },
    });

    expect(requests.map((request) => request.method)).toEqual([
      'browser.deck.page',
      'browser.deck.matchedIds',
      'browser.deck.rowsByIds',
      'browser.stats',
      'browser.count',
      'browser.sourceExistence.refreshCandidates',
      'browser.sourceExistence.byBlockIds',
      'browser.sourceExistence.update',
      'browser.sourceExistence.summary',
      'browser.sourceExistence.applySweep',
      'browser.sourceExistence.applySweepHost',
      'kernel.transaction.ingest',
      'kernel.transaction.dequeue',
      'kernel.transaction.requeue',
      'autocard.decision.resolve',
      'autocard.execute',
      'review.feedback',
      'queue.projection.snapshot',
      'queue.projection.rowsByIds',
      'neural-roam.advance',
      'ai.session.create',
      'ai.session.get',
      'ai.session.update',
      'ai.session.cancel',
      'ai.stream.start',
      'ai.stream.cancel',
      'ai.prompt.execute',
      'job.get',
      'job.cancel',
    ]);
    expect(requests[0].params).toEqual([{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }]);
    expect(requests[1].params).toEqual([{ query: { preset: 'all' } }]);
    expect(requests[15].params).toEqual([{
      envelope: {
        kind: 'planner-decision',
        blockId: 'block-1',
        content: 'Q <> A',
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
      },
    }]);
    expect(requests[16].params).toEqual([{
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    }]);
    expect(requests[19].params).toEqual([{
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      currentItem: {
        id: 'node-1',
        cardId: 'node-1',
        blockId: 'node-1',
        sourceKind: 'virtual',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      projectionGeneration: 4,
      policyHash: 'policy-deferred',
      idempotencyKey: 'neural-advance-key-1',
    }]);
    expect(requests[14].params).toEqual([{
      blockId: 'block-1',
      content: 'Q <> A',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
      settings: {
        enabledSymbols: {
          basic: true,
        },
      },
    }]);
  });

  it('rejects autocard.decision.resolve payload when status envelope is missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          matchedRuleIds: [],
          enabledDecisions: [],
          filteredDecisions: [],
          selectedDecision: null,
          conflicted: false,
          strategyUsed: 'semantic-first',
          markOnlyClozeCandidate: false,
          shouldUseTopicDerivation: false,
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.resolveAutoCardDecision({
      blockId: 'block-1',
      content: 'Q <> A',
      source: 'symbol-listener',
    })).rejects.toThrow('autocard.decision.resolve returned invalid payload');
  });

  it('rejects ai stream/job payloads when required fields are missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        if (request.method === 'ai.stream.start') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              ok: true,
              streamId: '',
            },
          };
        }
        if (request.method === 'ai.prompt.execute') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              ok: true,
              streamId: '',
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            ok: true,
          },
        };
      }),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.startAiStream({
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
    })).rejects.toThrow('ai.stream.start returned invalid payload');

    await expect(client.getAiJob({
      jobId: 'job-1',
    })).rejects.toThrow('job.get returned invalid payload');

    await expect(client.executeAiPrompt({
      sessionId: 'session-1',
      streamId: 'stream-1',
      jobId: 'job-1',
      request: {
        url: 'https://example.com/chat/completions',
      },
    })).rejects.toThrow('ai.prompt.execute returned invalid payload');
  });

  it('rejects neural-roam.advance payload when semantic fields are missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          queueType: 'neural-roam',
          status: 'advanced',
          nextItem: null,
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: 'session-1',
    })).rejects.toThrow('neural-roam.advance returned invalid payload');
  });
});
