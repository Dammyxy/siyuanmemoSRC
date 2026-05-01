import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';

describe('ApplicationContext writer relay command dispatch', () => {
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
});
