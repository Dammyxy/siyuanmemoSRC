import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AIWorkbenchSessionPersistScheduler,
  AI_WORKBENCH_SESSION_SCHEMA_VERSION,
  buildCurrentAIWorkbenchSessionRecord,
  createAIWorkbenchSessionRecord,
  createEmptyConversationTree,
  projectAIWorkbenchSessionRecordApplication,
} from '../AIWorkbenchSessionRuntime';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_GENERAL_CHAT_SKILL_ID,
  type AIWorkbenchContextSnapshot,
  type AIWorkbenchConversationTree,
  type AIWorkbenchMessage,
} from '@/types/ai';

const reviewContext: AIWorkbenchContextSnapshot = {
  source: 'review',
  selectedBlockIds: ['block-1'],
  blocks: [{ blockId: 'block-1', text: 'Block text' }],
  queueType: 'retrieval',
  queueProgress: null,
  currentCard: null,
  currentCardRaw: null,
  neuralBatch: null,
};

function buildTree(): AIWorkbenchConversationTree {
  return {
    ...createEmptyConversationTree(),
    rootNodeId: 'msg-1',
    activeLeafNodeId: 'msg-2',
    nodes: {
      'msg-1': {
        id: 'msg-1',
        kind: 'message',
        skillId: AI_GENERAL_CHAT_SKILL_ID,
        tabId: 'chat',
        scope: 'skill',
        parentId: null,
        childIds: ['msg-2'],
        createdAt: 1,
        hidden: false,
        pinned: false,
        status: 'ready',
        activeVersionId: 'msg-1::v1',
        versions: [],
      },
      'msg-2': {
        id: 'msg-2',
        kind: 'message',
        skillId: AI_CONCEPT_COACH_SKILL_ID,
        tabId: 'working-definition',
        scope: 'tab',
        parentId: 'msg-1',
        childIds: [],
        createdAt: 2,
        hidden: false,
        pinned: false,
        status: 'ready',
        activeVersionId: 'msg-2::v1',
        versions: [],
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AIWorkbenchSessionRuntime', () => {
  it('creates a new session record with current skill threads and schema metadata', () => {
    const record = createAIWorkbenchSessionRecord({
      id: 'ai-session-1',
      title: 'Review AI',
      context: reviewContext,
      contextSignature: 'ctx-1',
      sourceReviewSessionId: 'review-session-1',
      reviewChatKey: 'retrieval::Review',
      surface: 'review-dialog-sidecar',
      activeSkillId: 'user:outline',
      activeTabId: 'user:outline:summary',
      skillTabIds: ['user:outline:summary'],
      now: 100,
    });

    expect(record.schemaVersion).toBe(AI_WORKBENCH_SESSION_SCHEMA_VERSION);
    expect(record.source).toBe('review');
    expect(record.createdAt).toBe(100);
    expect(record.threads['user:outline']['user:outline:summary']).toMatchObject({
      skillId: 'user:outline',
      tabId: 'user:outline:summary',
      messages: [],
    });
    expect(record.tree).toEqual(createEmptyConversationTree());
  });

  it('builds current session records from tree metadata and caller-owned state projections', () => {
    const tree = buildTree();
    const message = {
      id: 'msg-1',
      kind: 'user',
      skillId: AI_GENERAL_CHAT_SKILL_ID,
      tabId: 'chat',
      view: AI_GENERAL_CHAT_SKILL_ID,
      content: 'hello',
      createdAt: 1,
      purpose: 'follow-up',
      appliedContexts: [],
    } as unknown as AIWorkbenchMessage;

    const record = buildCurrentAIWorkbenchSessionRecord({
      sessionId: 'ai-session-1',
      title: '',
      fallbackTitle: 'Untitled',
      sourceReviewSessionId: 'review-session-1',
      reviewChatKey: 'retrieval::Review',
      surface: 'review-tab-companion',
      contextSignature: 'ctx-1',
      context: null,
      liveContext: reviewContext,
      createdAt: 10,
      updatedAt: 20,
      activeSkillId: AI_GENERAL_CHAT_SKILL_ID,
      activeTabId: 'chat',
      tree,
      messages: [message],
      threads: {
        [AI_GENERAL_CHAT_SKILL_ID]: {
          chat: {
            skillId: AI_GENERAL_CHAT_SKILL_ID,
            tabId: 'chat',
            messages: [message],
            resultContextSignature: null,
            stale: false,
            staleReason: null,
          },
        },
      },
      conceptSkillResult: null,
      conceptCoachResultsByContext: {},
      genericSkillResults: {},
      vars: [],
      diagnostics: [],
    });

    expect(record).toMatchObject({
      id: 'ai-session-1',
      title: 'Untitled',
      source: 'review',
      createdAt: 10,
      updatedAt: 20,
      messageCount: 2,
      activeSkills: [AI_GENERAL_CHAT_SKILL_ID, AI_CONCEPT_COACH_SKILL_ID],
      activeViews: [AI_GENERAL_CHAT_SKILL_ID, AI_CONCEPT_COACH_SKILL_ID],
    });
  });

  it('projects session record application without mutating runtime state', () => {
    const record = createAIWorkbenchSessionRecord({
      id: 'ai-session-1',
      title: 'Review AI',
      context: reviewContext,
      contextSignature: 'ctx-old',
      sourceReviewSessionId: 'review-session-1',
      reviewChatKey: '',
      surface: 'unknown-surface' as never,
      activeSkillId: AI_GENERAL_CHAT_SKILL_ID,
      activeTabId: 'chat',
      skillTabIds: ['chat'],
      now: 100,
    });

    const projection = projectAIWorkbenchSessionRecordApplication({
      record,
      liveContext: reviewContext,
      liveContextSignature: 'ctx-new',
      fallbackReviewChatKey: 'retrieval::Review',
    });

    expect(projection).toMatchObject({
      sessionId: 'ai-session-1',
      sessionTitle: 'Review AI',
      surface: 'standalone-dialog',
      reviewChatKey: 'retrieval::Review',
      contextIsHistorical: true,
    });
  });

  it('coalesces scheduled persistence and reports async failures', async () => {
    vi.useFakeTimers();
    const scheduler = new AIWorkbenchSessionPersistScheduler(10);
    const firstTask = vi.fn(async () => undefined);
    const error = new Error('persist failed');
    const secondTask = vi.fn(async () => {
      throw error;
    });
    const onError = vi.fn();

    scheduler.schedule(firstTask, onError);
    scheduler.schedule(secondTask, onError);

    expect(scheduler.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(10);

    expect(firstTask).not.toHaveBeenCalled();
    expect(secondTask).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(scheduler.hasPending()).toBe(false);
  });
});
