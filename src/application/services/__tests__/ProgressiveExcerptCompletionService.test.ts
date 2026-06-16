import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/types/result';
import type { CardApplicationService } from '../CardApplicationService';
import { EXCERPT_RECORD_STORAGE_KEY, ExcerptRecordService } from '../ExcerptRecordService';
import { ProgressiveExcerptCompletionService } from '../ProgressiveExcerptCompletionService';
import type { IFileService } from '@/infrastructure/services/FileService';

function createFileServiceMock(initialRecords: unknown = null): IFileService & { getStored: (fileName?: string) => unknown } {
  const store = new Map<string, unknown>();
  if (initialRecords !== null) {
    store.set(EXCERPT_RECORD_STORAGE_KEY, initialRecords);
  }
  return {
    readFile: vi.fn(async () => null),
    writeFile: vi.fn(async () => undefined),
    readJSON: vi.fn(async (fileName: string) => (store.has(fileName) ? store.get(fileName) ?? null : null)),
    writeJSON: vi.fn(async (fileName: string, data: unknown) => {
      store.set(fileName, data);
    }),
    readMsgpack: vi.fn(async () => null),
    writeMsgpack: vi.fn(async () => undefined),
    getStored: (fileName = EXCERPT_RECORD_STORAGE_KEY) => store.get(fileName),
  };
}

function createCardServiceMock() {
  const cardsByBlockId = new Map<string, { id: string; blockId: string; type?: string }>();
  let counter = 0;
  const service = {
    createCard: vi.fn(async (command: { blockIds: string[]; cardType?: string }) => {
      const blockId = command.blockIds[0];
      cardsByBlockId.set(blockId, {
        id: `card-${++counter}`,
        blockId,
        type: command.cardType,
      });
      return ok({} as never);
    }),
    getCardByBlockId: vi.fn((blockId: string) => cardsByBlockId.get(blockId) || null),
  };
  return {
    service: service as unknown as CardApplicationService,
    cardsByBlockId,
  };
}

async function createPendingRecord(recordService: ExcerptRecordService) {
  const created = await recordService.createAllowingDuplicate({
    sourceDocId: 'doc-1',
    sourceBlockId: 'source-1',
    selectedText: 'Alpha Beta',
    origin: 'editor',
    createExcerpt: async () => ({
      excerptEntityId: 'excerpt-1',
      excerptEntityType: 'doc' as const,
    }),
  });
  return created.record;
}

describe('ProgressiveExcerptCompletionService', () => {
  it('dedupes in-flight completion by excerpt entity id', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    const record = await createPendingRecord(recordService);
    const cardService = createCardServiceMock();
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
    });

    const first = completionService.enqueue(record);
    const second = completionService.enqueue(record);

    await expect(first).resolves.toEqual({
      status: 'completed',
      recordId: record.recordId,
      topicCardId: 'card-1',
      created: true,
    });
    await expect(second).resolves.toEqual({
      status: 'completed',
      recordId: record.recordId,
      topicCardId: 'card-1',
      created: true,
    });
    expect(cardService.service.createCard).toHaveBeenCalledTimes(1);
    await expect(recordService.get(record.recordId)).resolves.toEqual(expect.objectContaining({
      completionStatus: 'completed',
      topicCardId: 'card-1',
    }));
  });

  it('backs completion from existing Topic card without creating a new one', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    const record = await createPendingRecord(recordService);
    const cardService = createCardServiceMock();
    cardService.cardsByBlockId.set('excerpt-1', {
      id: 'card-existing-1',
      blockId: 'excerpt-1',
      type: 'topic',
    });
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
    });

    await expect(completionService.complete(record)).resolves.toEqual({
      status: 'completed',
      recordId: record.recordId,
      topicCardId: 'card-existing-1',
      created: false,
    });
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    await expect(recordService.get(record.recordId)).resolves.toEqual(expect.objectContaining({
      completionStatus: 'completed',
      topicCardId: 'card-existing-1',
    }));
  });

  it('marks completion failed when the excerpt entity no longer exists', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    const record = await createPendingRecord(recordService);
    const cardService = createCardServiceMock();
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => false),
      now: () => 456,
    });

    await expect(completionService.complete(record)).resolves.toEqual({
      status: 'failed',
      recordId: record.recordId,
      error: '摘录实体不存在',
    });
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    await expect(recordService.get(record.recordId)).resolves.toEqual(expect.objectContaining({
      completionStatus: 'failed',
      completionError: {
        message: '摘录实体不存在',
        occurredAt: 456,
      },
    }));
  });

  it('marks completion failed when card creation fails', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    const record = await createPendingRecord(recordService);
    const cardService = createCardServiceMock();
    vi.mocked(cardService.service.createCard).mockResolvedValue(err(new Error('card write failed')) as never);
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
      now: () => 789,
    });

    await expect(completionService.complete(record)).resolves.toEqual({
      status: 'failed',
      recordId: record.recordId,
      error: 'card write failed',
    });
    await expect(recordService.get(record.recordId)).resolves.toEqual(expect.objectContaining({
      completionStatus: 'failed',
      completionError: {
        message: 'card write failed',
        occurredAt: 789,
      },
    }));
  });

  it('creates Topic cards with persisted excerpt source semantics', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    const created = await recordService.createAllowingDuplicate({
      sourceDocId: 'piece-1',
      sourceBlockId: 'piece-block-1',
      sourceBlockIds: ['piece-block-1', 'piece-block-2'],
      selectedText: 'Alpha Beta',
      origin: 'review',
      sourceSemantics: {
        sourceLineage: {
          version: 1,
          authority: 'siyuan-block',
          sourceDocId: 'piece-1',
          rootDocId: 'piece-1',
          rootKind: 'piece',
          sourceBlockId: 'piece-block-1',
          sourceBlockIds: ['piece-block-1', 'piece-block-2'],
          logicalParentId: 'piece-1',
          logicalParentType: 'root-doc',
          parentTopicCardId: 'topic-card-parent-1',
          parentExcerptId: 'excerpt-parent-1',
          sessionId: 'session-1',
          mode: 'linear',
        },
        payloadIdentity: {
          version: 1,
          algorithm: 'fnv1a32',
          hash: 'payload-hash',
          sourceBlockIds: ['piece-block-1', 'piece-block-2'],
          textLength: 10,
          domLength: 20,
        },
        disclosureState: {
          version: 1,
          state: 'created',
          formalSchedulerMutation: false,
        },
      },
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-piece-1',
        excerptEntityType: 'doc' as const,
      }),
    });
    const cardService = createCardServiceMock();
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
    });

    await completionService.complete(created.record);

    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['excerpt-piece-1'],
      cardType: 'topic',
      extractedFrom: 'piece-block-1',
      metadata: expect.objectContaining({
        source: 'manual',
        isDocument: true,
      }),
      progressiveLineage: expect.objectContaining({
        kind: 'excerpt',
        sessionId: 'session-1',
        mode: 'linear',
        pieceDocId: 'piece-1',
        sourceDocId: 'piece-1',
        sourceBlockId: 'piece-block-1',
        sourceBlockIds: ['piece-block-1', 'piece-block-2'],
        parentTopicCardId: 'topic-card-parent-1',
        parentExcerptId: 'excerpt-parent-1',
        sourceLineage: expect.objectContaining({
          rootKind: 'piece',
        }),
        payloadIdentity: expect.objectContaining({
          algorithm: 'fnv1a32',
          hash: 'payload-hash',
        }),
        disclosureState: expect.objectContaining({
          state: 'created',
        }),
      }),
    }));
  });

  it('repairs pending records before failed ones with a bounded limit', async () => {
    const fileService = createFileServiceMock({
      version: 1,
      records: [
        {
          recordId: 'record-completed',
          excerptEntityId: 'excerpt-completed',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-completed',
          sourceBlockIds: ['block-completed'],
          selectedText: 'Completed',
          normalizedFingerprint: 'Completed',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 400,
          status: 'active',
          completionStatus: 'completed',
          topicCardId: 'card-completed',
        },
        {
          recordId: 'record-failed-old',
          excerptEntityId: 'excerpt-failed-old',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-failed-old',
          sourceBlockIds: ['block-failed-old'],
          selectedText: 'Failed Old',
          normalizedFingerprint: 'Failed Old',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 500,
          status: 'active',
          completionStatus: 'failed',
          completionError: {
            message: 'old failed',
            occurredAt: 100,
          },
        },
        {
          recordId: 'record-pending-old',
          excerptEntityId: 'excerpt-pending-old',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-pending-old',
          sourceBlockIds: ['block-pending-old'],
          selectedText: 'Pending Old',
          normalizedFingerprint: 'Pending Old',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 200,
          status: 'active',
          completionStatus: 'pending',
        },
        {
          recordId: 'record-pending-new',
          excerptEntityId: 'excerpt-pending-new',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-pending-new',
          sourceBlockIds: ['block-pending-new'],
          selectedText: 'Pending New',
          normalizedFingerprint: 'Pending New',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 600,
          status: 'active',
          completionStatus: 'pending',
        },
        {
          recordId: 'record-failed-new',
          excerptEntityId: 'excerpt-failed-new',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-failed-new',
          sourceBlockIds: ['block-failed-new'],
          selectedText: 'Failed New',
          normalizedFingerprint: 'Failed New',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 300,
          status: 'active',
          completionStatus: 'failed',
          completionError: {
            message: 'new failed',
            occurredAt: 700,
          },
        },
      ],
    });
    const recordService = new ExcerptRecordService(fileService);
    const cardService = createCardServiceMock();
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
    });

    const results = await completionService.repairBatch({ limit: 3 });

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.recordId)).toEqual([
      'record-pending-new',
      'record-pending-old',
      'record-failed-new',
    ]);
    expect(cardService.service.createCard).toHaveBeenCalledTimes(3);
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(1, expect.objectContaining({
      blockIds: ['excerpt-pending-new'],
    }));
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(2, expect.objectContaining({
      blockIds: ['excerpt-pending-old'],
    }));
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(3, expect.objectContaining({
      blockIds: ['excerpt-failed-new'],
    }));
    await expect(recordService.get('record-pending-new')).resolves.toEqual(expect.objectContaining({
      completionStatus: 'completed',
    }));
    await expect(recordService.get('record-pending-old')).resolves.toEqual(expect.objectContaining({
      completionStatus: 'completed',
    }));
    await expect(recordService.get('record-failed-new')).resolves.toEqual(expect.objectContaining({
      completionStatus: 'completed',
    }));
    await expect(recordService.get('record-failed-old')).resolves.toEqual(expect.objectContaining({
      completionStatus: 'failed',
    }));
  });

  it('repairs scoped records with a default limit of five', async () => {
    const records = Array.from({ length: 6 }, (_, index) => ({
      recordId: `record-pending-${index + 1}`,
      excerptEntityId: `excerpt-pending-${index + 1}`,
      excerptEntityType: 'doc' as const,
      sourceDocId: 'doc-1',
      sourceBlockId: `block-pending-${index + 1}`,
      sourceBlockIds: [`block-pending-${index + 1}`],
      selectedText: `Pending ${index + 1}`,
      normalizedFingerprint: `Pending ${index + 1}`,
      colorToken: 'var(--b3-font-background4)',
      origin: 'editor' as const,
      createdAt: 100 + index,
      status: 'active' as const,
      completionStatus: 'pending' as const,
    }));
    const fileService = createFileServiceMock({
      version: 1,
      records,
    });
    const recordService = new ExcerptRecordService(fileService);
    const cardService = createCardServiceMock();
    const completionService = new ProgressiveExcerptCompletionService({
      cardService: cardService.service,
      excerptRecordService: recordService,
      blockExists: vi.fn(async () => true),
    });

    const results = await completionService.repairRecords(records);

    expect(results).toHaveLength(5);
    expect(results.map((result) => result.recordId)).toEqual([
      'record-pending-6',
      'record-pending-5',
      'record-pending-4',
      'record-pending-3',
      'record-pending-2',
    ]);
  });
});
