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
});
