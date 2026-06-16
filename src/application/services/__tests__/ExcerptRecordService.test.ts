import { describe, expect, it, vi } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import {
  EXCERPT_RECORD_STORAGE_KEY,
  ExcerptRecordService,
  normalizeExcerptFingerprint,
} from '../ExcerptRecordService';

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

describe('ExcerptRecordService', () => {
  it('creates one record and blocks the same normalized selection on the same source block', async () => {
    const fileService = createFileServiceMock();
    const service = new ExcerptRecordService(fileService);

    const first = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      selectedText: 'Alpha   Beta',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-1',
        excerptEntityType: 'doc' as const,
      }),
    });

    const second = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      selectedText: 'Alpha\nBeta',
      origin: 'review',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-2',
        excerptEntityType: 'doc' as const,
      }),
    });

    expect(first.kind).toBe('created');
    expect(second).toEqual({
      kind: 'duplicate',
      record: expect.objectContaining({
        excerptEntityId: 'excerpt-1',
        sourceBlockId: 'block-1',
        sourceBlockIds: ['block-1'],
        normalizedFingerprint: 'Alpha Beta',
      }),
    });
    expect(fileService.getStored()).toEqual(expect.objectContaining({
      version: 1,
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-1',
          sourceBlockIds: ['block-1'],
          normalizedFingerprint: 'Alpha Beta',
          status: 'active',
        }),
      ],
    }));
  });

  it('dedupes multi-block excerpts by ordered block range plus normalized fingerprint', async () => {
    const fileService = createFileServiceMock();
    const service = new ExcerptRecordService(fileService);

    const first = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-2'],
      selectedText: 'Alpha Beta',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-1',
        excerptEntityType: 'doc' as const,
      }),
    });
    const duplicate = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-2'],
      selectedText: 'Alpha   Beta',
      origin: 'review',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-2',
        excerptEntityType: 'doc' as const,
      }),
    });
    const distinct = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-3'],
      selectedText: 'Alpha Beta',
      origin: 'review',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-3',
        excerptEntityType: 'doc' as const,
      }),
    });

    expect(first.kind).toBe('created');
    expect(duplicate).toEqual({
      kind: 'duplicate',
      record: expect.objectContaining({
        excerptEntityId: 'excerpt-1',
        sourceBlockIds: ['block-1', 'block-2'],
      }),
    });
    expect(distinct.kind).toBe('created');
    const stored = fileService.getStored() as { version: number; records: Array<Record<string, unknown>> };
    expect(stored).toEqual(expect.objectContaining({
      version: 1,
      records: expect.arrayContaining([
        expect.objectContaining({
          excerptEntityId: 'excerpt-1',
          sourceBlockIds: ['block-1', 'block-2'],
        }),
        expect.objectContaining({
          excerptEntityId: 'excerpt-3',
          sourceBlockIds: ['block-1', 'block-3'],
        }),
      ]),
    }));
    expect(stored.records).toHaveLength(2);
  });

  it('archives records without deleting them from storage and removes them on delete', async () => {
    const fileService = createFileServiceMock();
    const service = new ExcerptRecordService(fileService);
    const created = await service.createOrRejectDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      selectedText: 'Alpha Beta',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-1',
        excerptEntityType: 'doc' as const,
      }),
    });
    if (created.kind !== 'created') {
      throw new Error('Expected created record');
    }

    await service.archive(created.record.recordId);
    expect(await service.get(created.record.recordId)).toEqual(expect.objectContaining({
      recordId: created.record.recordId,
      status: 'archived',
    }));

    await service.delete(created.record.recordId);
    expect(await service.get(created.record.recordId)).toBeNull();
    expect(await service.list()).toEqual([]);
  });

  it('filters list results by source doc and created time', async () => {
    const now = Date.now();
    const fileService = createFileServiceMock({
      version: 1,
      records: [
        {
          recordId: 'record-1',
          excerptEntityId: 'excerpt-1',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-1',
          selectedText: 'Alpha Beta',
          normalizedFingerprint: 'Alpha Beta',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: now - 500,
          status: 'active',
        },
        {
          recordId: 'record-2',
          excerptEntityId: 'excerpt-2',
          excerptEntityType: 'block',
          sourceDocId: 'doc-2',
          sourceBlockId: 'block-2',
          selectedText: 'Gamma Delta',
          normalizedFingerprint: 'Gamma Delta',
          colorToken: 'var(--b3-font-background4)',
          origin: 'review',
          createdAt: now - 50,
          status: 'stale',
        },
      ],
    });
    const service = new ExcerptRecordService(fileService);

    const filtered = await service.list({
      sourceDocId: 'doc-2',
      createdFrom: now - 100,
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        recordId: 'record-2',
        sourceDocId: 'doc-2',
        status: 'stale',
      }),
    ]);
  });

  it('normalizes whitespace and zero-width characters when building fingerprints', () => {
    expect(normalizeExcerptFingerprint('Alpha\u200B  \nBeta')).toBe('Alpha Beta');
  });

  it('creates new records with pending completion state', async () => {
    const fileService = createFileServiceMock();
    const service = new ExcerptRecordService(fileService);

    const created = await service.createAllowingDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      selectedText: 'Alpha Beta',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-1',
        excerptEntityType: 'doc' as const,
      }),
    });

    expect(created.record).toEqual(expect.objectContaining({
      excerptEntityId: 'excerpt-1',
      completionStatus: 'pending',
    }));
    expect(fileService.getStored()).toEqual(expect.objectContaining({
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-1',
          completionStatus: 'pending',
        }),
      ],
    }));
  });

  it('treats historical records without completion state as completed', async () => {
    const fileService = createFileServiceMock({
      version: 1,
      records: [
        {
          recordId: 'record-old-1',
          excerptEntityId: 'excerpt-old-1',
          excerptEntityType: 'doc',
          sourceDocId: 'doc-1',
          sourceBlockId: 'block-1',
          sourceBlockIds: ['block-1'],
          selectedText: 'Alpha Beta',
          normalizedFingerprint: 'Alpha Beta',
          colorToken: 'var(--b3-font-background4)',
          origin: 'editor',
          createdAt: 100,
          status: 'active',
        },
      ],
    });
    const service = new ExcerptRecordService(fileService);

    await expect(service.get('record-old-1')).resolves.toEqual(expect.objectContaining({
      recordId: 'record-old-1',
      completionStatus: 'completed',
    }));
  });

  it('updates completion failure and clears the error after completion succeeds', async () => {
    const fileService = createFileServiceMock();
    const service = new ExcerptRecordService(fileService);
    const created = await service.createAllowingDuplicate({
      sourceDocId: 'doc-1',
      sourceBlockId: 'block-1',
      selectedText: 'Alpha Beta',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-1',
        excerptEntityType: 'doc' as const,
      }),
    });

    const failed = await service.markCompletionFailed(created.record.recordId, new Error('card write failed'), 123);
    expect(failed).toEqual(expect.objectContaining({
      completionStatus: 'failed',
      completionError: {
        message: 'card write failed',
        occurredAt: 123,
      },
    }));

    const completed = await service.markCompletionCompleted(created.record.recordId, 'topic-card-1');
    expect(completed).toEqual(expect.objectContaining({
      completionStatus: 'completed',
      topicCardId: 'topic-card-1',
    }));
    expect(completed).not.toHaveProperty('completionError');
    expect(fileService.getStored()).toEqual(expect.objectContaining({
      records: [
        expect.objectContaining({
          recordId: created.record.recordId,
          completionStatus: 'completed',
          topicCardId: 'topic-card-1',
        }),
      ],
    }));
  });
});
