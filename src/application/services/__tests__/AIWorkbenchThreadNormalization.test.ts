import { describe, expect, it } from 'vitest';
import {
  cloneAttachedContexts,
  createInitialViewState,
  normalizeThreads,
  resolveUserMessagePurpose,
} from '../AIWorkbenchThreadNormalization';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_GENERAL_CHAT_SKILL_ID,
  type AIAttachedContextItem,
  type AIWorkbenchApprovalMessage,
  type AIWorkbenchAssistantTextMessage,
  type AIWorkbenchUserMessage,
} from '@/types/ai';

describe('AIWorkbenchThreadNormalization', () => {
  it('normalizes built-in persisted threads and backfills concept result context signatures', () => {
    const threads = normalizeThreads({
      [AI_GENERAL_CHAT_SKILL_ID]: {
        chat: {
          messages: [{
            id: 'user-1',
            kind: 'user',
            skillId: AI_GENERAL_CHAT_SKILL_ID,
            tabId: 'chat',
            purpose: 'follow-up',
            content: '  hello  ',
            createdAt: 100,
          }],
        },
      },
      [AI_CONCEPT_COACH_SKILL_ID]: {
        'working-definition': {
          resultContextSignature: 'ctx-result',
          stale: true,
          staleReason: '  old context  ',
          messages: [
            { id: 'drop-me', kind: 'candidate-board' },
            {
              id: 'assistant-1',
              kind: 'assistant-text',
              skillId: AI_CONCEPT_COACH_SKILL_ID,
              tabId: 'working-definition',
              content: '  answer  ',
              diagnostics: [' ok ', ''],
              createdAt: 110,
            },
          ],
        },
      },
    });

    const userMessage = threads[AI_GENERAL_CHAT_SKILL_ID].chat.messages[0] as AIWorkbenchUserMessage;
    expect(userMessage).toMatchObject({
      id: 'user-1',
      kind: 'user',
      content: 'hello',
      purpose: 'follow-up',
    });

    const conceptThread = threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'];
    expect(conceptThread).toMatchObject({
      resultContextSignature: 'ctx-result',
      stale: true,
      staleReason: 'old context',
    });
    expect(conceptThread.messages).toHaveLength(1);
    expect(conceptThread.messages[0]).toMatchObject({
      id: 'assistant-1',
      kind: 'assistant-text',
      content: 'answer',
      contextSignature: 'ctx-result',
      diagnostics: ['ok'],
    } satisfies Partial<AIWorkbenchAssistantTextMessage>);
  });

  it('keeps user skill threads and normalizes approval requests to the persisted policy shape', () => {
    const threads = normalizeThreads({
      'user:outline': {
        'user:outline:summary': {
          messages: [{
            id: 'approval-1',
            kind: 'approval',
            skillId: 'user:outline',
            tabId: 'user:outline:summary',
            createdAt: 200,
            request: {
              id: 'approval-request-1',
              type: 'unknown',
              toolCallId: 'call-1',
              toolName: 'siyuan.insertBlock',
              group: 'siyuan-write',
              title: 'Write',
              description: 'Insert block',
              args: null,
              status: 'queued',
            },
          }],
        },
      },
    });

    const message = threads['user:outline']['user:outline:summary'].messages[0] as AIWorkbenchApprovalMessage;
    expect(message.request).toMatchObject({
      id: 'approval-request-1',
      type: 'execution',
      toolCallId: 'call-1',
      toolName: 'siyuan.insertBlock',
      group: 'siyuan-write',
      args: {},
      status: 'pending',
      createdAt: 200,
    });
  });

  it('creates independent view state and clones attached contexts deeply enough for block ids', () => {
    const viewState = createInitialViewState();
    viewState[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].stale = true;

    expect(viewState[AI_CONCEPT_COACH_SKILL_ID].perspectives.stale).toBe(false);
    expect(resolveUserMessagePurpose('weird')).toBe('initial-run');

    const original: AIAttachedContextItem[] = [{
      id: 'ctx-1',
      providerKey: 'manual-text',
      title: 'Manual',
      summary: '1 block',
      preview: 'preview',
      content: 'content',
      blockIds: ['b1'],
      createdAt: 1,
    }];
    const cloned = cloneAttachedContexts(original);
    cloned[0].blockIds.push('b2');

    expect(cloned[0].blockIds).toEqual(['b1', 'b2']);
    expect(original[0].blockIds).toEqual(['b1']);
  });
});
