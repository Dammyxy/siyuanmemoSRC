import { describe, expect, it } from 'vitest';
import { AIWorkbenchConversationTreeRuntime } from '../AIWorkbenchConversationTreeRuntime';
import {
  createEmptyConversationTree,
  createInitialThreads,
} from '../AIWorkbenchSessionRuntime';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_GENERAL_CHAT_SKILL_ID,
  type AISkillId,
  type AISkillTabId,
  type AIWorkbenchApprovalMessage,
  type AIWorkbenchAssistantTextMessage,
  type AIWorkbenchState,
  type AIWorkbenchToolLogMessage,
  type AIWorkbenchUserMessage,
} from '@/types/ai';

function createRuntime(contextSignature = 'ctx-1') {
  const state = {
    activeSkillId: AI_GENERAL_CHAT_SKILL_ID,
    activeTabId: 'chat',
    contextSignature,
    threads: createInitialThreads(),
    tree: createEmptyConversationTree(),
  } as AIWorkbenchState;
  const runtime = new AIWorkbenchConversationTreeRuntime({
    state,
    normalizeSkillForCurrentSettings: (skillId) => skillId,
    normalizeTabForCurrentSettings: (tabId) => tabId,
    isContextScopedConceptTab: (skillId, tabId) => skillId === AI_CONCEPT_COACH_SKILL_ID && tabId !== 'chat',
  });
  return { state, runtime };
}

function userMessage(id: string, content: string): AIWorkbenchUserMessage {
  return {
    id,
    skillId: AI_GENERAL_CHAT_SKILL_ID,
    tabId: 'chat',
    view: AI_GENERAL_CHAT_SKILL_ID,
    kind: 'user',
    purpose: 'follow-up',
    content,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    editedFromMessageId: null,
    attachedContexts: [],
  };
}

function assistantMessage(input: {
  id: string;
  skillId?: AISkillId;
  tabId?: AISkillTabId;
  content?: string;
  contextSignature?: string | null;
  presentation?: AIWorkbenchAssistantTextMessage['presentation'];
}): AIWorkbenchAssistantTextMessage {
  return {
    id: input.id,
    skillId: input.skillId || AI_GENERAL_CHAT_SKILL_ID,
    tabId: input.tabId || 'chat',
    view: input.skillId || AI_GENERAL_CHAT_SKILL_ID,
    kind: 'assistant-text',
    content: input.content || input.id,
    sourceContent: null,
    appliedContexts: [],
    reasoningContent: null,
    diagnostics: [],
    interrupted: false,
    failureDiagnostic: null,
    failureRunMode: null,
    createdAt: Number(input.id.replace(/\D/g, '')) || 1,
    contextSignature: input.contextSignature ?? null,
    presentation: input.presentation,
  };
}

describe('AIWorkbenchConversationTreeRuntime', () => {
  it('appends skill-scoped chat messages and rebuilds projected threads', () => {
    const { state, runtime } = createRuntime();

    runtime.appendNodeMessage('chat', userMessage('msg-1', 'hello'));
    runtime.appendNodeMessage('chat', assistantMessage({ id: 'msg-2', content: 'reply' }));

    expect(state.tree.rootNodeId).toBe('msg-1');
    expect(state.tree.activeLeafNodeId).toBe('msg-2');
    expect(state.threads[AI_GENERAL_CHAT_SKILL_ID].chat.messages.map((message) => message.id)).toEqual([
      'msg-1',
      'msg-2',
    ]);
  });

  it('filters concept tab projections to the active context signature', () => {
    const { state, runtime } = createRuntime('ctx-new');
    runtime.appendNodeMessage('working-definition', assistantMessage({
      id: 'concept-old',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      tabId: 'working-definition',
      contextSignature: 'ctx-old',
    }), { scope: 'tab' });
    runtime.appendNodeMessage('working-definition', assistantMessage({
      id: 'concept-new',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      tabId: 'working-definition',
      contextSignature: 'ctx-new',
    }), { scope: 'tab' });

    const messages = runtime.getProjectedMessagesForView(AI_CONCEPT_COACH_SKILL_ID, 'working-definition');

    expect(messages.map((message) => message.id)).toEqual(['concept-new']);
    expect(state.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].resultContextSignature).toBe('ctx-new');
  });

  it('groups supplemental tool and approval messages under one render entry', () => {
    const primary = assistantMessage({ id: 'primary', content: 'answer' });
    const toolLog = {
      id: 'tool-1',
      kind: 'tool-log',
      skillId: AI_GENERAL_CHAT_SKILL_ID,
      tabId: 'chat',
      view: AI_GENERAL_CHAT_SKILL_ID,
      toolCallId: 'call-1',
      toolName: 'ReadVar',
      group: 'vars',
      status: 'success',
      content: 'done',
      argsText: null,
      resultText: 'done',
      error: null,
      argsVarRef: null,
      varRef: null,
      durationMs: null,
      roundIndex: null,
      llmUsage: null,
      createdAt: 2,
    } satisfies AIWorkbenchToolLogMessage;
    const approval = {
      id: 'approval-1',
      kind: 'approval',
      skillId: AI_GENERAL_CHAT_SKILL_ID,
      tabId: 'chat',
      view: AI_GENERAL_CHAT_SKILL_ID,
      request: {
        id: 'approval-request-1',
        type: 'execution',
        toolCallId: 'call-2',
        toolName: 'WriteVar',
        group: 'vars',
        title: 'Write',
        description: 'Write var',
        args: {},
        status: 'pending',
        createdAt: 3,
      },
      createdAt: 3,
    } satisfies AIWorkbenchApprovalMessage;

    const entry = AIWorkbenchConversationTreeRuntime.createRenderEntry(primary, [toolLog, approval]);

    expect(AIWorkbenchConversationTreeRuntime.isSupplementalMessage([primary, toolLog], 1)).toBe(true);
    expect(entry.stepCount).toBe(2);
    expect(entry.pendingApproval?.request.id).toBe('approval-request-1');
  });
});
