import { describe, expect, it } from 'vitest';
import { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import { AI_CONCEPT_COACH_SKILL_ID, AI_CONCEPT_COACH_TAB_IDS, type AISkillTabId, type AIWorkbenchSessionRecord, type AIWorkbenchThreads } from '@/types/ai';

function createFileService() {
  const files = new Map<string, unknown>();
  return {
    async readJSON<T>(fileName: string): Promise<T | null> {
      return (files.has(fileName) ? files.get(fileName) : null) as T | null;
    },
    async writeJSON(fileName: string, data: unknown): Promise<void> {
      files.set(fileName, JSON.parse(JSON.stringify(data)));
    },
    async deleteFile(fileName: string): Promise<void> {
      files.delete(fileName);
    },
  };
}

function createRecord(id: string, title: string): AIWorkbenchSessionRecord {
  const createThread = (tabId: AISkillTabId) => ({
    skillId: AI_CONCEPT_COACH_SKILL_ID,
    tabId,
    messages: tabId === 'working-definition'
      ? [
        {
          id: 'msg-1',
          skillId: AI_CONCEPT_COACH_SKILL_ID,
          tabId,
          view: AI_CONCEPT_COACH_SKILL_ID,
          kind: 'assistant-text' as const,
          content: 'hello',
          createdAt: 1,
          sourceContent: 'hello',
          appliedContexts: [],
        },
      ]
      : [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  });
  const threads = {
    [AI_CONCEPT_COACH_SKILL_ID]: Object.fromEntries(
      AI_CONCEPT_COACH_TAB_IDS.map((tabId) => [tabId, createThread(tabId)]),
    ),
  } as AIWorkbenchThreads;
  return {
    id,
    title,
    source: 'review',
    sourceReviewSessionId: 'review-session-1',
    reviewChatKey: 'retrieval::Review',
    surface: 'review-dialog-sidecar',
    contextSignature: `ctx-${id}`,
    createdAt: 1,
    updatedAt: 1,
    activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
    activeTabId: 'working-definition',
    activeSkills: [AI_CONCEPT_COACH_SKILL_ID],
    lastActiveView: AI_CONCEPT_COACH_SKILL_ID,
    activeViews: [AI_CONCEPT_COACH_SKILL_ID],
    messageCount: 1,
    context: {
      source: 'review',
      selectedBlockIds: ['block-a'],
      blocks: [{ blockId: 'block-a', text: 'content' }],
      queueType: 'retrieval',
      queueProgress: null,
      currentCard: null,
      currentCardRaw: null,
      neuralBatch: null,
    },
    threads,
    skillResults: { [AI_CONCEPT_COACH_SKILL_ID]: null },
  };
}

describe('AIWorkbenchSessionStoreService', () => {
  it('persists, renames, lists, and deletes concept-coach session records', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);

    await service.saveSession(createRecord('session-a', 'First Session'));
    await service.saveSession({
      ...createRecord('session-b', 'Second Session'),
      updatedAt: 10,
    });

    const summaries = await service.listSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      id: 'session-b',
      title: 'Second Session',
      activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
      activeTabId: 'working-definition',
      lastActiveView: AI_CONCEPT_COACH_SKILL_ID,
      messageCount: 1,
      activeViews: [AI_CONCEPT_COACH_SKILL_ID],
    });

    const renamed = await service.renameSession('session-a', 'Renamed Session');
    expect(renamed?.title).toBe('Renamed Session');

    const loaded = await service.loadSession('session-a');
    expect(loaded?.title).toBe('Renamed Session');
    expect(loaded?.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].messages).toHaveLength(1);

    await service.deleteSession('session-b');
    expect(await service.loadSession('session-b')).toBeNull();
    expect(await service.listSummaries()).toHaveLength(1);
  });

  it('persists self-test card target memory separately from session records', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);

    expect(await service.loadSelfTestCardTargetMemory()).toBeNull();

    await service.saveSelfTestCardTargetMemory({
      mode: 'block',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: 'doc-block-1',
      targetLabel: '学习笔记 · /AI 制卡',
      updatedAt: 10,
    });

    expect(await service.loadSelfTestCardTargetMemory()).toEqual({
      mode: 'block',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: 'doc-block-1',
      targetLabel: '学习笔记 · /AI 制卡',
      updatedAt: 10,
    });

    expect(await service.listSummaries()).toEqual([]);
  });

  it('drops legacy make-cards and candidate-board data when loading old records', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);

    await fileService.writeJSON('ai-workbench/sessions/records/legacy.json', {
      ...createRecord('legacy', 'Legacy Session'),
      lastActiveView: 'make-cards',
      threads: {
        explain: {
          view: 'explain',
          messages: [],
          resultContextSignature: null,
          stale: false,
          staleReason: null,
        },
        'make-cards': {
          view: 'make-cards',
          messages: [
            {
              id: 'legacy-board',
              view: 'make-cards',
              kind: 'candidate-board',
              createdAt: 1,
              result: {},
              appliedContexts: [],
            },
          ],
          resultContextSignature: null,
          stale: false,
          staleReason: null,
        },
      },
    } as unknown);

    const loaded = await service.loadSession('legacy');

    expect(loaded?.lastActiveView).toBe(AI_CONCEPT_COACH_SKILL_ID);
    expect(loaded?.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].messages).toEqual([]);
  });

  it('preserves user skill threads and generic structured results', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);
    const record = createRecord('user-skill', 'User Skill Session');

    record.activeSkillId = 'user:outline';
    record.activeTabId = 'user:outline:summary';
    record.activeSkills = ['user:outline'];
    record.lastActiveView = 'user:outline';
    record.activeViews = ['user:outline'];
    record.threads['user:outline'] = {
      'user:outline:summary': {
        skillId: 'user:outline',
        tabId: 'user:outline:summary',
        messages: [{
          id: 'user-msg-1',
          skillId: 'user:outline',
          tabId: 'user:outline:summary',
          view: 'user:outline',
          kind: 'assistant-result',
          createdAt: 2,
          rawContent: '{"summary":["A"]}',
          conceptCoachResult: null,
          tabResult: null,
          genericStructuredResult: {
            skillId: 'user:outline',
            rawContent: '{"summary":["A"]}',
            sections: [{
              id: 'user:outline:summary',
              responseKey: 'summary',
              title: 'Summary',
              renderer: 'list',
              value: ['A'],
              text: '',
              items: ['A'],
              cards: [],
              keyValues: [],
            }],
          },
          genericSectionResult: {
            id: 'user:outline:summary',
            responseKey: 'summary',
            title: 'Summary',
            renderer: 'list',
            value: ['A'],
            text: '',
            items: ['A'],
            cards: [],
            keyValues: [],
          },
          normalizationDiagnostic: {
            status: 'partial',
            missingSections: ['Cues'],
            rawShape: 'object:summary',
            renderer: 'list',
          },
          explainResult: null,
          appliedContexts: [],
        }],
        resultContextSignature: 'ctx-user',
        stale: false,
        staleReason: null,
      },
    };
    record.genericSkillResults = {
      'user:outline': {
        skillId: 'user:outline',
        rawContent: '{"summary":["A"]}',
        sections: [{
          id: 'user:outline:summary',
          responseKey: 'summary',
          title: 'Summary',
          renderer: 'list',
          value: ['A'],
          text: '',
          items: ['A'],
          cards: [],
          keyValues: [],
        }],
      },
    };

    await service.saveSession(record);
    const loaded = await service.loadSession('user-skill');

    expect(loaded?.activeSkillId).toBe('user:outline');
    expect(loaded?.threads['user:outline']['user:outline:summary'].messages).toHaveLength(1);
    expect(loaded?.genericSkillResults?.['user:outline']?.sections[0]).toMatchObject({
      id: 'user:outline:summary',
      items: ['A'],
    });
  });

  it('migrates v2 thread-only sessions into the current tree-backed schema', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);

    await fileService.writeJSON('ai-workbench/sessions/records/v2-session.json', {
      ...createRecord('v2-session', 'Legacy Tree Migration'),
      schemaVersion: 2,
      tree: undefined,
    });

    const loaded = await service.loadSession('v2-session');

    expect(loaded?.schemaVersion).toBe(5);
    expect(loaded?.tree?.rootNodeId).toBeTruthy();
    expect(Object.keys(loaded?.tree?.nodes || {})).toHaveLength(1);
    expect(loaded?.tree?.nodes['msg-1']).toMatchObject({
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      tabId: 'working-definition',
      kind: 'message',
      activeVersionId: expect.stringContaining('msg-1::v'),
    });
  });

  it('finds the latest review session by reviewChatKey and falls back to legacy records without the summary key', async () => {
    const fileService = createFileService();
    const service = new AIWorkbenchSessionStoreService(fileService);

    await service.saveSession({
      ...createRecord('session-new', 'Queue Session'),
      updatedAt: 20,
    });
    const direct = await service.findLatestByReviewChatKey({
      reviewChatKey: 'retrieval::Review',
      source: 'review',
    });
    expect(direct?.id).toBe('session-new');

    const legacyFileService = createFileService();
    const legacyService = new AIWorkbenchSessionStoreService(legacyFileService);
    await legacyFileService.writeJSON('ai-workbench/sessions/index.json', {
      sessions: [{
        id: 'session-legacy',
        title: 'Legacy Queue Session',
        source: 'review',
        sourceReviewSessionId: 'review-session-legacy',
        surface: 'review-dialog-sidecar',
        contextSignature: 'ctx-legacy',
        createdAt: 1,
        updatedAt: 10,
        activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
        activeTabId: 'working-definition',
        activeSkills: [AI_CONCEPT_COACH_SKILL_ID],
        messageCount: 1,
        lastActiveView: AI_CONCEPT_COACH_SKILL_ID,
        activeViews: [AI_CONCEPT_COACH_SKILL_ID],
      }],
    });
    await legacyFileService.writeJSON('ai-workbench/sessions/records/session-legacy.json', {
      ...createRecord('session-legacy', 'Legacy Queue Session'),
      reviewChatKey: null,
      updatedAt: 10,
      context: {
        source: 'review',
        selectedBlockIds: ['block-a'],
        blocks: [{ blockId: 'block-a', text: 'content' }],
        queueType: 'retrieval',
        queueProgress: {
          queueType: 'retrieval',
          queueLabel: 'Review',
          completed: 1,
          remaining: 2,
          total: 3,
        },
        currentCard: null,
        currentCardRaw: null,
        neuralBatch: null,
      },
    });

    const fallback = await legacyService.findLatestByReviewChatKey({
      reviewChatKey: 'retrieval::Review',
      source: 'review',
    });
    expect(fallback).toMatchObject({
      id: 'session-legacy',
      reviewChatKey: 'retrieval::Review',
    });
  });
});
