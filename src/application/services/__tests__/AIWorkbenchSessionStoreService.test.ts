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
});
