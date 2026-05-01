import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';

describe('ApplicationContext writer relay command dispatch', () => {
  it('dispatches autocard.decision.resolve to backend client', async () => {
    const resolveAutoCardDecision = vi.fn(async () => ({
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
    }));
    const client = {
      resolveAutoCardDecision,
    } as unknown as {
      resolveAutoCardDecision: (request: unknown) => Promise<unknown>;
    };

    const result = await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
      method: 'autocard.decision.resolve',
      params: {
        blockId: 'block-1',
        content: 'Alpha <> Beta',
        source: 'symbol-listener',
      },
    });

    expect(resolveAutoCardDecision).toHaveBeenCalledTimes(1);
    expect(resolveAutoCardDecision).toHaveBeenCalledWith({
      blockId: 'block-1',
      content: 'Alpha <> Beta',
      source: 'symbol-listener',
    });
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'selected',
    });
  });

  it('dispatches autocard.execute to backend client', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const client = {
      executeAutoCard,
    } as unknown as {
      executeAutoCard: (request: unknown) => Promise<unknown>;
    };

    const result = await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
      method: 'autocard.execute',
      params: {
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
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
        },
      },
    });

    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).toHaveBeenCalledWith({
      envelope: expect.objectContaining({
        kind: 'planner-decision',
        blockId: 'block-1',
      }),
    });
    expect(result).toEqual({
      executed: true,
      created: 1,
      skipped: 0,
    });
  });

  it('rejects autocard.execute relay when params is not an object', async () => {
    const client = {
      executeAutoCard: vi.fn(),
    };

    await expect((ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
      method: 'autocard.execute',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: autocard.execute relay requires params object');
    expect(client.executeAutoCard).not.toHaveBeenCalled();
  });

  it('rejects autocard.decision.resolve relay when params is not an object', async () => {
    const client = {
      resolveAutoCardDecision: vi.fn(),
    };

    await expect((ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
      method: 'autocard.decision.resolve',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: autocard.decision.resolve relay requires params object');
    expect(client.resolveAutoCardDecision).not.toHaveBeenCalled();
  });
});
