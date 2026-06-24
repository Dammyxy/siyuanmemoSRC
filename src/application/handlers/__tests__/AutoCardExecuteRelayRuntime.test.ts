import { describe, expect, it, vi } from 'vitest';
import { resolveBackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import { AutoCardExecuteRelayRuntime } from '../AutoCardExecuteRelayRuntime';
import type { AutoCardExecutionEnvelope } from '../AutoCardExecutionRuntime';
import type { BackendAutoCardExecuteEnvelope } from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRelayRuntimeState } from '../AutoCardDecisionRelayRuntime';

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

function executionEnvelope(): AutoCardExecutionEnvelope {
  return {
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
  };
}

function backendEnvelope(blockId = 'block-1', content = 'Alpha <> Beta'): BackendAutoCardExecuteEnvelope {
  return {
    kind: 'planner-decision',
    blockId,
    content,
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
  };
}

function createRuntime(input?: {
  executeAutoCard?: (request: unknown) => Promise<unknown>;
  executeAutoCardBatch?: (request: unknown) => Promise<unknown>;
  submitAndWait?: <TResult>(request: {
    instanceId: string;
    method: string;
    params?: unknown;
    commandId?: string;
  }, timeoutMs?: number) => Promise<TResult>;
  relayState?: BackendRelayRuntimeState | (() => BackendRelayRuntimeState);
  ensureWritable?: () => Promise<void>;
  tracePolicyDecision?: (reason: string, payload?: Record<string, unknown>) => void;
}) {
  const executeAutoCard = vi.fn(input?.executeAutoCard ?? (async () => ({
    executed: true,
    created: 1.9,
    skipped: -1,
  })));
  const executeAutoCardBatch = vi.fn(input?.executeAutoCardBatch ?? (async () => ({
    executed: true,
    created: 2.9,
    skipped: -1,
  })));
  const submitAndWait = input?.submitAndWait === undefined
    ? vi.fn(async () => ({
      executed: true,
      created: 2,
      skipped: 0,
    }))
    : vi.fn(input.submitAndWait);
  const ensureWritable = vi.fn(input?.ensureWritable ?? (async () => undefined));
  const tracePolicyDecision = vi.fn(input?.tracePolicyDecision ?? (() => undefined));
  const relayState = input?.relayState ?? { mode: 'writer' as const };
  const runtime = new AutoCardExecuteRelayRuntime({
    getBackendClient: () => ({ executeAutoCard, executeAutoCardBatch } as never),
    getRuntimePolicy: () => releasePolicy(),
    getRelayRuntimeState: () => typeof relayState === 'function' ? relayState() : relayState,
    getFrontendRelayRuntime: () => ({ ensureWritable }),
    getFollowerCommandClient: () => submitAndWait ? ({ submitAndWait }) : null,
    tracePolicyDecision,
    toBackendExecuteEnvelope: (envelope) => backendEnvelope(
      envelope.kind === 'planner-decision' ? envelope.blockId : 'topic-derived',
      envelope.kind === 'planner-decision' ? envelope.content : '',
    ),
  });

  return {
    runtime,
    executeAutoCard,
    executeAutoCardBatch,
    submitAndWait,
    ensureWritable,
    tracePolicyDecision,
  };
}

describe('AutoCardExecuteRelayRuntime', () => {
  it('executes writer-mode AutoCard envelopes through backend worker and normalizes result', async () => {
    const { runtime, executeAutoCard, ensureWritable } = createRuntime();

    const result = await runtime.execute(executionEnvelope());

    expect(result).toEqual({
      executed: true,
      created: 1,
      skipped: 0,
    });
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).toHaveBeenCalledWith({
      envelope: backendEnvelope(),
    });
  });

  it('executes writer-mode document scan batches through one backend worker call', async () => {
    const { runtime, executeAutoCard, executeAutoCardBatch, ensureWritable } = createRuntime();
    const secondEnvelope: AutoCardExecutionEnvelope = {
      ...executionEnvelope(),
      blockId: 'block-2',
      content: 'Gamma >> Delta',
    };

    const result = await (runtime as any).executeBatch([
      executionEnvelope(),
      secondEnvelope,
    ]);

    expect(result).toEqual({
      executed: true,
      created: 2,
      skipped: 0,
    });
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(executeAutoCardBatch).toHaveBeenCalledWith({
      items: [
        { envelope: backendEnvelope() },
        { envelope: backendEnvelope('block-2', 'Gamma >> Delta') },
      ],
    });
  });

  it('routes follower-mode AutoCard execute through writer relay without direct backend execute', async () => {
    const { runtime, executeAutoCard, submitAndWait } = createRuntime({
      relayState: { mode: 'follower', instanceId: 'follower-1' },
    });

    const result = await runtime.execute(executionEnvelope());

    expect(result.executed).toBe(true);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-1',
      method: 'autocard.execute',
      params: {
        envelope: backendEnvelope(),
      },
    }));
  });

  it('hands off to follower relay when ensureWritable discovers stale writer ownership', async () => {
    let relayMode: BackendRelayRuntimeState = { mode: 'writer' };
    const { runtime, executeAutoCard, submitAndWait } = createRuntime({
      relayState: () => relayMode,
      ensureWritable: async () => {
        relayMode = { mode: 'follower', instanceId: 'follower-after-refresh' };
        throw new Error('BACKEND_UNAVAILABLE: writer lease lost');
      },
    });

    const result = await runtime.execute(executionEnvelope());

    expect(result.executed).toBe(true);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-after-refresh',
      method: 'autocard.execute',
    }));
  });

  it('fails closed when writer relay runtime is missing', async () => {
    const { runtime, tracePolicyDecision } = createRuntime({
      relayState: { mode: 'missing' },
    });

    await expect(runtime.execute(executionEnvelope())).rejects.toThrow(
      'BACKEND_UNAVAILABLE: autocard.execute requires writer relay runtime',
    );
    expect(tracePolicyDecision).toHaveBeenCalledWith('writer-relay-runtime-missing', {
      method: 'autocard.execute',
    });
  });

  it('fails closed in follower mode when follower command client is unavailable', async () => {
    const tracePolicyDecision = vi.fn();
    const runtime = new AutoCardExecuteRelayRuntime({
      getBackendClient: () => ({ executeAutoCard: vi.fn() } as never),
      getRuntimePolicy: () => releasePolicy(),
      getRelayRuntimeState: () => ({ mode: 'follower', instanceId: 'follower-1' }),
      getFrontendRelayRuntime: () => null,
      getFollowerCommandClient: () => null,
      tracePolicyDecision,
      toBackendExecuteEnvelope: () => backendEnvelope(),
    });

    await expect(runtime.execute(executionEnvelope())).rejects.toThrow(
      'BACKEND_UNAVAILABLE: autocard.execute relay is unavailable in follower mode',
    );
    expect(tracePolicyDecision).toHaveBeenCalledWith('follower-relay-unavailable', {
      method: 'autocard.execute',
      instanceId: 'follower-1',
    });
  });

  it('traces follower relay timeout diagnostics', async () => {
    const { runtime, tracePolicyDecision } = createRuntime({
      relayState: { mode: 'follower', instanceId: 'follower-timeout' },
      submitAndWait: async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer relay timeout');
      },
    });

    await expect(runtime.execute(executionEnvelope())).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer relay timeout',
    );
    expect(tracePolicyDecision).toHaveBeenCalledWith('follower-relay-timeout', {
      method: 'autocard.execute',
      instanceId: 'follower-timeout',
    });
  });
});
