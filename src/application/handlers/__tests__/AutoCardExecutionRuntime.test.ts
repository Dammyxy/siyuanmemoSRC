import { describe, expect, it, vi } from 'vitest';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import {
  AutoCardExecutionRuntime,
  type AutoCardExecutionEnvelope,
} from '../AutoCardExecutionRuntime';

function createDecision(overrides: Partial<CreationDecision> = {}): CreationDecision {
  return {
    id: 'BasicDirectionRule',
    family: 'basic',
    templateId: 'builtin-quick-card',
    cardType: 'item',
    mode: 'single',
    executorKind: 'quick-basic',
    priority: 50,
    ...overrides,
  };
}

describe('AutoCardExecutionRuntime', () => {
  it('delegates planner-decision envelope to planner executor', async () => {
    const executePlannerDecision = vi.fn(async () => true);
    const createTopicDerivedItem = vi.fn();
    const pushMsg = vi.fn();
    const runtime = new AutoCardExecutionRuntime({
      executePlannerDecision,
      createTopicDerivedItem,
      pushMsg,
    });

    const envelope: AutoCardExecutionEnvelope = {
      kind: 'planner-decision',
      blockId: 'block-1',
      content: 'Alpha >> Beta',
      decision: createDecision(),
      source: 'symbol-listener',
      docRootId: 'doc-1',
    };

    const created = await runtime.execute(envelope);

    expect(created).toBe(true);
    expect(executePlannerDecision).toHaveBeenCalledTimes(1);
    expect(executePlannerDecision).toHaveBeenCalledWith({
      blockId: 'block-1',
      content: 'Alpha >> Beta',
      decision: expect.objectContaining({ id: 'BasicDirectionRule' }),
      source: 'symbol-listener',
      docRootId: 'doc-1',
    });
    expect(createTopicDerivedItem).not.toHaveBeenCalled();
    expect(pushMsg).not.toHaveBeenCalled();
  });

  it('executes topic-derived envelope and publishes created/skipped message', async () => {
    const executePlannerDecision = vi.fn();
    const createTopicDerivedItem = vi.fn(async () => ({
      created: 2,
      skipped: 1,
    }));
    const pushMsg = vi.fn(async () => undefined);
    const runtime = new AutoCardExecutionRuntime({
      executePlannerDecision,
      createTopicDerivedItem,
      pushMsg,
    });

    const created = await runtime.execute({
      kind: 'topic-derived',
      input: {
        sourceBlockId: 'block-2',
        sourceDocId: 'doc-2',
        parentTopicCardId: 'topic-1',
        plannerContent: 'Alpha >> Beta',
        decisions: [createDecision()],
      },
    });

    expect(created).toBe(true);
    expect(createTopicDerivedItem).toHaveBeenCalledTimes(1);
    expect(pushMsg).toHaveBeenCalledWith('已在当前 Topic 下新增 2 个 Item，跳过 1 个重复项');
    expect(executePlannerDecision).not.toHaveBeenCalled();
  });

  it('does not publish toast when topic-derived creates no item', async () => {
    const pushMsg = vi.fn(async () => undefined);
    const runtime = new AutoCardExecutionRuntime({
      executePlannerDecision: vi.fn(),
      createTopicDerivedItem: vi.fn(async () => ({
        created: 0,
        skipped: 3,
      })),
      pushMsg,
    });

    const created = await runtime.execute({
      kind: 'topic-derived',
      input: {
        sourceBlockId: 'block-3',
        sourceDocId: 'doc-3',
        parentTopicCardId: 'topic-3',
        plannerContent: 'Alpha >> Beta',
        decisions: [createDecision()],
      },
    });

    expect(created).toBe(false);
    expect(pushMsg).not.toHaveBeenCalled();
  });

  it('prefers backend execute channel when provided', async () => {
    const executeViaBackend = vi.fn(async () => ({
      executed: true,
      created: 3,
      skipped: 0,
    }));
    const runtime = new AutoCardExecutionRuntime({
      executePlannerDecision: vi.fn(async () => true),
      createTopicDerivedItem: vi.fn(async () => ({
        created: 1,
        skipped: 0,
      })),
      pushMsg: vi.fn(async () => undefined),
      executeViaBackend,
    });

    const result = await runtime.executeWithResult({
      kind: 'planner-decision',
      blockId: 'block-4',
      content: 'Alpha <> Beta',
      decision: createDecision(),
      source: 'symbol-listener',
    });

    expect(executeViaBackend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      executed: true,
      created: 3,
      skipped: 0,
    });
  });

  it('does not fall back to local planner execution when backend execute fails', async () => {
    const executePlannerDecision = vi.fn(async () => true);
    const executeViaBackend = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer relay unavailable');
    });
    const runtime = new AutoCardExecutionRuntime({
      executePlannerDecision,
      createTopicDerivedItem: vi.fn(async () => ({
        created: 1,
        skipped: 0,
      })),
      pushMsg: vi.fn(async () => undefined),
      executeViaBackend,
    });

    await expect(runtime.executeWithResult({
      kind: 'planner-decision',
      blockId: 'block-5',
      content: 'Alpha >> Beta',
      decision: createDecision(),
      source: 'symbol-listener',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: writer relay unavailable');

    expect(executeViaBackend).toHaveBeenCalledTimes(1);
    expect(executePlannerDecision).not.toHaveBeenCalled();
  });
});
