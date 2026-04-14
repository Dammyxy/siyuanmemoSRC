import { describe, expect, it } from 'vitest';
import { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { AIWorkbenchSessionRecord } from '@/types/ai';

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
  return {
    id,
    title,
    source: 'review',
    sourceReviewSessionId: 'review-session-1',
    surface: 'review-dialog-sidecar',
    contextSignature: `ctx-${id}`,
    createdAt: 1,
    updatedAt: 1,
    lastActiveView: 'explain',
    activeViews: [],
    messageCount: 0,
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
    makeCardMode: 'qa',
    requestBatchSummary: false,
    threads: {
      tutor: {
        view: 'tutor',
        messages: [],
        resultContextSignature: null,
        stale: false,
        staleReason: null,
      },
      explain: {
        view: 'explain',
        messages: [
          {
            id: 'msg-1',
            view: 'explain',
            kind: 'assistant-text',
            content: 'hello',
            createdAt: 1,
            sourceContent: 'hello',
            appliedContexts: [],
          },
        ],
        resultContextSignature: null,
        stale: false,
        staleReason: null,
      },
      'make-cards': {
        view: 'make-cards',
        messages: [],
        resultContextSignature: null,
        stale: false,
        staleReason: null,
      },
    },
  };
}

describe('AIWorkbenchSessionStoreService', () => {
  it('persists, renames, lists, and deletes session records', async () => {
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
      lastActiveView: 'explain',
      messageCount: 1,
      activeViews: ['explain'],
    });

    const renamed = await service.renameSession('session-a', 'Renamed Session');
    expect(renamed?.title).toBe('Renamed Session');

    const loaded = await service.loadSession('session-a');
    expect(loaded?.title).toBe('Renamed Session');
    expect(loaded?.threads.explain.messages).toHaveLength(1);

    await service.deleteSession('session-b');
    expect(await service.loadSession('session-b')).toBeNull();
    expect(await service.listSummaries()).toHaveLength(1);
  });
});
