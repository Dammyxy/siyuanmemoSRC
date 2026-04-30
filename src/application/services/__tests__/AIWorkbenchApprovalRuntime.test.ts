import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchApprovalRuntime } from '../AIWorkbenchApprovalRuntime';
import type {
  AIChatApprovalRequest,
  AIWorkbenchMessage,
  AIWorkbenchState,
} from '@/types/ai';

function approvalRequest(overrides: Partial<AIChatApprovalRequest> = {}): AIChatApprovalRequest {
  return {
    id: 'approval-1',
    type: 'execution',
    status: 'pending',
    toolName: 'read_block',
    title: '读取块',
    args: { id: 'block-1' },
    argsText: '{"id":"block-1"}',
    createdAt: 10,
    skillId: 'general-chat',
    tabId: 'chat',
    runGroupId: 'run-1',
    ...overrides,
  } as AIChatApprovalRequest;
}

function createRuntime() {
  const messages: AIWorkbenchMessage[] = [];
  const patched: AIWorkbenchMessage[] = [];
  const state = {
    activeSkillId: 'general-chat',
    activeTabId: 'chat',
    pendingApprovals: [],
    diagnostics: [],
  } as unknown as AIWorkbenchState;
  const approvalResolvers = new Map();
  const persistCurrentSession = vi.fn();
  const runtime = new AIWorkbenchApprovalRuntime({
    state,
    approvalResolvers,
    appendMessage: (_tabId, message) => {
      messages.push(message);
    },
    patchActiveNodeMessage: (_messageId, updater) => {
      const next = updater(messages.find((message) => message.kind === 'approval')!);
      patched.push(next);
      return next;
    },
    findApprovalMessageNodeId: () => 'node-approval',
    syncDerivedStateFromThreads: vi.fn(),
    persistCurrentSession,
  });
  return { runtime, state, messages, patched, approvalResolvers, persistCurrentSession };
}

describe('AIWorkbenchApprovalRuntime', () => {
  it('appends pending approval messages and resolves them without changing approval policy shape', async () => {
    const { runtime, state, messages, patched, approvalResolvers, persistCurrentSession } = createRuntime();
    const pending = approvalRequest();
    const decisionPromise = runtime.requestInlineToolApproval(pending);

    expect(state.pendingApprovals).toEqual([pending]);
    expect(messages.map((message) => message.kind)).toEqual(['approval', 'assistant-text']);
    expect(approvalResolvers.has('approval-1')).toBe(true);

    await runtime.resolveToolApproval('approval-1', false, 'no');
    const decision = await decisionPromise;

    expect(decision).toEqual({ approved: false, rejectReason: 'no' });
    expect(state.pendingApprovals).toEqual([]);
    expect(patched[0]).toMatchObject({
      kind: 'approval',
      request: {
        id: 'approval-1',
        status: 'rejected',
        rejectReason: 'no',
      },
    });
    expect(persistCurrentSession).toHaveBeenCalledTimes(1);
  });
});
