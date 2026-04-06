import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { CardApplicationService } from '../CardApplicationService';
import { ProgressiveReadingService, ProgressiveSplitCancelledError } from '../ProgressiveReadingService';
import type { ProgressiveBlockRow, ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { PluginSettings } from '@/types/settings';

function createFileServiceMock(initialData: unknown = null): IFileService & { getStored: () => unknown } {
  let stored = initialData;
  return {
    readFile: vi.fn(async () => null),
    writeFile: vi.fn(async () => undefined),
    readJSON: vi.fn(async () => stored),
    writeJSON: vi.fn(async (_fileName: string, data: unknown) => {
      stored = data;
    }),
    readMsgpack: vi.fn(async () => null),
    writeMsgpack: vi.fn(async () => undefined),
    getStored: () => stored,
  };
}

function createProgressiveSiyuanPortMock(
  overrides: Partial<ProgressiveSiyuanPort> = {},
): ProgressiveSiyuanPort {
  return {
    pushMsg: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    sql: vi.fn(async () => []),
    getDocInfo: vi.fn(async () => ({
      id: 'doc-default',
      box: 'notebook',
      path: '/doc-default.sy',
      hpath: '/doc-default',
      name: 'Doc Default',
    })),
    getBlockAttrs: vi.fn(async () => ({})),
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    copyStdMarkdown: vi.fn(async () => ''),
    createDocWithMarkdown: vi.fn(async () => 'created-doc'),
    appendMarkdownBlock: vi.fn(async () => 'appended-block'),
    appendDomBlock: vi.fn(async () => 'appended-dom-block'),
    moveBlockAsChild: vi.fn(async () => undefined),
    deleteBlock: vi.fn(async () => undefined),
    renderTemplate: vi.fn(async (template: string) => template),
    getNotebookConf: vi.fn(async () => ({
      name: 'Notebook',
      closed: false,
      refCreateSavePath: '',
      createDocNameTemplate: '',
      dailyNoteSavePath: '/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}',
      dailyNoteTemplatePath: '',
    })),
    ...overrides,
  };
}

function createSettingsProviderMock(
  overrides: Partial<PluginSettings['progressiveReading']> = {},
) {
  return {
    getSettings: () => ({
      progressiveReading: {
        altXExcerptEnabled: false,
        dailyTraceEnabled: false,
        ...overrides,
      },
    }),
  };
}

function createCardServiceMock() {
  const cardsByBlockId = new Map<string, { id: string; blockId: string }>();
  let counter = 0;
  const service = {
    createCard: vi.fn(async (command: { blockIds: string[] }) => {
      const blockId = command.blockIds[0];
      cardsByBlockId.set(blockId, {
        id: `card-${++counter}`,
        blockId,
      });
      return ok({} as never);
    }),
    deleteCard: vi.fn(async (command: { cardId: string }) => {
      for (const [blockId, card] of cardsByBlockId.entries()) {
        if (card.id === command.cardId) {
          cardsByBlockId.delete(blockId);
          break;
        }
      }
      return ok(undefined);
    }),
    getCardByBlockId: vi.fn((blockId: string) => cardsByBlockId.get(blockId) || null),
  };
  return {
    service: service as unknown as CardApplicationService,
    cardsByBlockId,
  };
}

function createSplitTreeSqlMock(
  rows: Array<ProgressiveBlockRow & { id: string; parent_id: string }>,
  existingDocIds: string[] = [],
) {
  const existingIdSet = new Set(existingDocIds);
  const normalizedRows = [...rows];

  return vi.fn(async (stmt: string) => {
    const rootMatch = stmt.match(/WHERE root_id = '([^']+)'/);
    if (rootMatch) {
      return normalizedRows
        .filter((row) => row.root_id === rootMatch[1] && row.id !== rootMatch[1])
        .sort((left, right) => {
          const parentCompare = String(left.parent_id || '').localeCompare(String(right.parent_id || ''));
          if (parentCompare !== 0) {
            return parentCompare;
          }
          const sortCompare = String(left.sort || '').localeCompare(String(right.sort || ''));
          if (sortCompare !== 0) {
            return sortCompare;
          }
          return String(left.id || '').localeCompare(String(right.id || ''));
        });
    }

    const inMatch = stmt.match(/WHERE id IN \((.+)\)/s);
    if (inMatch) {
      const ids = Array.from(inMatch[1].matchAll(/'([^']+)'/g)).map((match) => match[1]);
      return ids
        .filter((id) => existingIdSet.has(id))
        .map((id) => ({ id }));
    }

    const idMatch = stmt.match(/WHERE id = '([^']+)'/);
    if (idMatch) {
      return existingIdSet.has(idMatch[1]) ? [{ id: idMatch[1] }] : [];
    }

    if (stmt.includes("WHERE type = 'd'")) {
      return [];
    }

    throw new Error(`Unexpected SQL: ${stmt}`);
  });
}

describe('ProgressiveReadingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits nested H1-H3 sections into a real document tree and keeps linear preorder session order', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'preface', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', content: 'Opening note', markdown: 'Opening note', sort: '001' },
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '002' },
      { id: 'h1-next', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Next', markdown: '# Next', sort: '003' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h2-detail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'h', subtype: 'h2', content: 'Detail', markdown: '## Detail', sort: '002' },
      { id: 'intro-tail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'After detail', markdown: 'After detail', sort: '003' },
      { id: 'detail-body', root_id: 'doc-1', parent_id: 'h2-detail', type: 'p', content: 'Detail body', markdown: 'Detail body', sort: '001' },
      { id: 'h3-deep', root_id: 'doc-1', parent_id: 'h2-detail', type: 'h', subtype: 'h3', content: 'Deep', markdown: '### Deep', sort: '002' },
      { id: 'deep-body', root_id: 'doc-1', parent_id: 'h3-deep', type: 'p', content: 'Deep body', markdown: 'Deep body', sort: '001' },
      { id: 'next-body', root_id: 'doc-1', parent_id: 'h1-next', type: 'p', content: 'Next body', markdown: 'Next body', sort: '001' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        switch (blockId) {
          case 'preface':
            return 'Opening note';
          case 'intro-body':
            return 'Intro body';
          case 'intro-tail':
            return 'After detail';
          case 'detail-body':
            return 'Detail body';
          case 'deep-body':
            return 'Deep body';
          case 'next-body':
            return 'Next body';
          default:
            throw new Error(`Unexpected block copy: ${blockId}`);
        }
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2')
        .mockResolvedValueOnce('piece-3')
        .mockResolvedValueOnce('piece-4')
        .mockResolvedValueOnce('piece-5')
        .mockResolvedValueOnce('piece-6'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'linear');

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2', 'piece-3', 'piece-4', 'piece-5', 'piece-6']);
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 [前言]',
      'Opening note',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/02 Intro',
      '# Intro\n\nIntro body',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      3,
      'notebook-a',
      '/reading/article/02 Intro/01 Detail',
      '## Detail\n\nDetail body',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      4,
      'notebook-a',
      '/reading/article/02 Intro/01 Detail/01 Deep',
      '### Deep\n\nDeep body',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      5,
      'notebook-a',
      '/reading/article/02 Intro/02 After detail',
      'After detail',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      6,
      'notebook-a',
      '/reading/article/03 Next',
      '# Next\n\nNext body',
    );
    expect(port.sql).toHaveBeenCalledTimes(1);
    expect(vi.mocked(port.sql).mock.calls[0]?.[0]).toContain("WHERE root_id = 'doc-1'");
    expect(cardService.service.createCard).toHaveBeenCalledTimes(1);
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['piece-1'],
      metadata: expect.objectContaining({
        progressive: expect.objectContaining({
          pieceIndex: 0,
          pieceDocId: 'piece-1',
        }),
      }),
    }));

    const stored = fileService.getStored() as {
      sessions: Record<string, {
        pieces: Array<{
          pieceDocId: string;
          depth?: number;
          parentPieceDocId?: string;
          state: 'active' | 'pending' | 'completed';
        }>;
      }>;
    };
    const session = Object.values(stored.sessions)[0];
    expect(session.pieces.map((piece) => ({
      pieceDocId: piece.pieceDocId,
      depth: piece.depth,
      parentPieceDocId: piece.parentPieceDocId,
      state: piece.state,
    }))).toEqual([
      { pieceDocId: 'piece-1', depth: 0, parentPieceDocId: undefined, state: 'active' },
      { pieceDocId: 'piece-2', depth: 0, parentPieceDocId: undefined, state: 'pending' },
      { pieceDocId: 'piece-3', depth: 1, parentPieceDocId: 'piece-2', state: 'pending' },
      { pieceDocId: 'piece-4', depth: 2, parentPieceDocId: 'piece-3', state: 'pending' },
      { pieceDocId: 'piece-5', depth: 1, parentPieceDocId: 'piece-2', state: 'pending' },
      { pieceDocId: 'piece-6', depth: 0, parentPieceDocId: undefined, state: 'pending' },
    ]);
  });

  it('reports staged progress and avoids per-piece hpath lookups when createDoc returns doc ids', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h2-detail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'h', subtype: 'h2', content: 'Detail', markdown: '## Detail', sort: '002' },
      { id: 'detail-body', root_id: 'doc-1', parent_id: 'h2-detail', type: 'p', content: 'Detail body', markdown: 'Detail body', sort: '001' },
    ]);
    const progressEvents: Array<{ phase: string; percentage: number; current: number; total: number }> = [];
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'intro-body') {
          return 'Intro body';
        }
        if (blockId === 'detail-body') {
          return 'Detail body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    await service.splitDocument('doc-1', 'linear', undefined, {
      onProgress: (progress) => {
        progressEvents.push({
          phase: progress.phase,
          percentage: progress.percentage,
          current: progress.current,
          total: progress.total,
        });
      },
    });

    expect(progressEvents.some((progress) => progress.phase === 'scan')).toBe(true);
    expect(progressEvents.some((progress) => progress.phase === 'plan')).toBe(true);
    expect(progressEvents.some((progress) => progress.phase === 'createDocs')).toBe(true);
    expect(progressEvents.some((progress) => progress.phase === 'createCards')).toBe(true);
    expect(progressEvents.some((progress) => progress.phase === 'save' && progress.percentage === 100)).toBe(true);
    expect(progressEvents.every((progress, index, values) => index === 0 || progress.percentage >= values[index - 1].percentage)).toBe(true);
    expect(vi.mocked(port.sql).mock.calls.some(([stmt]) => String(stmt).includes("WHERE type = 'd'"))).toBe(false);
  });

  it('stops at the next cancellation checkpoint, skips session persistence, and cleans up created docs', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h1-next', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Next', markdown: '# Next', sort: '002' },
      { id: 'next-body', root_id: 'doc-1', parent_id: 'h1-next', type: 'p', content: 'Next body', markdown: 'Next body', sort: '001' },
    ]);
    let cancelRequested = false;
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'intro-body') {
          return 'Intro body';
        }
        if (blockId === 'next-body') {
          return 'Next body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.splitDocument('doc-1', 'linear', undefined, {
      onProgress: (progress) => {
        if (progress.phase === 'createDocs' && progress.current >= 1) {
          cancelRequested = true;
        }
      },
      isCancellationRequested: () => cancelRequested,
    })).rejects.toBeInstanceOf(ProgressiveSplitCancelledError);

    expect(fileService.writeJSON).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(port.deleteBlock).toHaveBeenCalledWith('piece-1');
    expect(port.deleteBlock).not.toHaveBeenCalledWith('piece-2');
  });

  it('marks cancellation cleanup as incomplete when artifact deletion fails', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h1-next', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Next', markdown: '# Next', sort: '002' },
      { id: 'next-body', root_id: 'doc-1', parent_id: 'h1-next', type: 'p', content: 'Next body', markdown: 'Next body', sort: '001' },
    ]);
    let cancelRequested = false;
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'intro-body') {
          return 'Intro body';
        }
        if (blockId === 'next-body') {
          return 'Next body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
      deleteBlock: vi.fn(async () => {
        throw new Error('cleanup failed');
      }),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.splitDocument('doc-1', 'linear', undefined, {
      onProgress: (progress) => {
        if (progress.phase === 'createDocs' && progress.current >= 1) {
          cancelRequested = true;
        }
      },
      isCancellationRequested: () => cancelRequested,
    })).rejects.toMatchObject({
      cleanupIncomplete: true,
    });
  });

  it('activates every generated document immediately in nonlinear mode and creates topic cards for all preorder pieces', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h2-detail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'h', subtype: 'h2', content: 'Detail', markdown: '## Detail', sort: '002' },
      { id: 'detail-body', root_id: 'doc-1', parent_id: 'h2-detail', type: 'p', content: 'Detail body', markdown: 'Detail body', sort: '001' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'intro-body') {
          return 'Intro body';
        }
        if (blockId === 'detail-body') {
          return 'Detail body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'nonlinear');

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2']);
    expect(cardService.service.createCard).toHaveBeenCalledTimes(2);
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(1, expect.objectContaining({
      blockIds: ['piece-1'],
    }));
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(2, expect.objectContaining({
      blockIds: ['piece-2'],
    }));

    const stored = fileService.getStored() as {
      sessions: Record<string, {
        mode: 'linear' | 'nonlinear';
        pieces: Array<{
          pieceDocId: string;
          state: 'active' | 'pending' | 'completed';
          topicCardId?: string;
        }>;
      }>;
    };
    const session = Object.values(stored.sessions)[0];
    expect(session.mode).toBe('nonlinear');
    expect(session.pieces.map((piece) => ({
      pieceDocId: piece.pieceDocId,
      state: piece.state,
      topicCardId: piece.topicCardId,
    }))).toEqual([
      { pieceDocId: 'piece-1', state: 'active', topicCardId: 'card-1' },
      { pieceDocId: 'piece-2', state: 'active', topicCardId: 'card-2' },
    ]);
  });

  it('keeps skipped heading levels inside the nearest selected ancestor and promotes deeper selected headings', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h2-detail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'h', subtype: 'h2', content: 'Detail', markdown: '## Detail', sort: '002' },
      { id: 'detail-body', root_id: 'doc-1', parent_id: 'h2-detail', type: 'p', content: 'Detail body', markdown: 'Detail body', sort: '001' },
      { id: 'h3-deep', root_id: 'doc-1', parent_id: 'h2-detail', type: 'h', subtype: 'h3', content: 'Deep', markdown: '### Deep', sort: '002' },
      { id: 'deep-body', root_id: 'doc-1', parent_id: 'h3-deep', type: 'p', content: 'Deep body', markdown: 'Deep body', sort: '001' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        switch (blockId) {
          case 'intro-body':
            return 'Intro body';
          case 'detail-body':
            return 'Detail body';
          case 'deep-body':
            return 'Deep body';
          default:
            throw new Error(`Unexpected block copy: ${blockId}`);
        }
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'linear', {
      horizontalRule: false,
      headingLevels: ['h1', 'h3ToH6'],
      customStringEnabled: false,
      customString: '',
    });

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2']);
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 Intro',
      '# Intro\n\nIntro body\n\n## Detail\n\nDetail body',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/01 Intro/01 Deep',
      '### Deep\n\nDeep body',
    );
  });

  it('creates supplemental child documents for hr-based local content splits inside the current heading level', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'part-a', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Alpha', markdown: 'Alpha', sort: '001' },
      { id: 'hr-1', root_id: 'doc-1', parent_id: 'h1-intro', type: 'hr', content: '---', markdown: '---', sort: '002' },
      { id: 'part-b', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Beta', markdown: 'Beta', sort: '003' },
      { id: 'h2-detail', root_id: 'doc-1', parent_id: 'h1-intro', type: 'h', subtype: 'h2', content: 'Detail', markdown: '## Detail', sort: '004' },
      { id: 'detail-body', root_id: 'doc-1', parent_id: 'h2-detail', type: 'p', content: 'Detail body', markdown: 'Detail body', sort: '001' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'part-a') {
          return 'Alpha';
        }
        if (blockId === 'part-b') {
          return 'Beta';
        }
        if (blockId === 'detail-body') {
          return 'Detail body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2')
        .mockResolvedValueOnce('piece-3')
        .mockResolvedValueOnce('piece-4'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'linear', {
      horizontalRule: true,
      headingLevels: ['h1', 'h2'],
      customStringEnabled: false,
      customString: '',
    });

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2', 'piece-3', 'piece-4']);
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 Intro',
      '# Intro',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/01 Intro/01 Alpha',
      'Alpha',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      3,
      'notebook-a',
      '/reading/article/01 Intro/02 Beta',
      'Beta',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      4,
      'notebook-a',
      '/reading/article/01 Intro/03 Detail',
      '## Detail\n\nDetail body',
    );
  });

  it('falls back to flat segment documents when no heading levels are enabled', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'block-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', content: 'Alpha', markdown: 'Alpha', sort: '001' },
      { id: 'block-cut', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', content: '###CUT### Start here', markdown: '###CUT### Start here', sort: '002' },
      { id: 'block-2', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', content: 'After', markdown: 'After', sort: '003' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'block-1') {
          return 'Alpha';
        }
        if (blockId === 'block-cut') {
          return '###CUT### Start here';
        }
        if (blockId === 'block-2') {
          return 'After';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'linear', {
      horizontalRule: false,
      headingLevels: [],
      customStringEnabled: true,
      customString: '###CUT###',
    });

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2']);
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 Alpha',
      'Alpha',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/02 ###CUT### Start here',
      '###CUT### Start here\n\nAfter',
    );
  });

  it('rejects split requests when no valid markers are selected', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock();
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.splitDocument('doc-1', 'linear', {
      horizontalRule: false,
      headingLevels: [],
      customStringEnabled: false,
      customString: '',
    })).rejects.toThrow('至少选择一个切割标记');

    expect(port.sql).not.toHaveBeenCalled();
  });

  it('allows re-splitting when the recorded session has no remaining piece docs', async () => {
    const initialState = {
      version: 2 as const,
      sessions: {
        'session-old': {
          id: 'session-old',
          sourceDocId: 'doc-1',
          sourceDocTitle: 'Article',
          notebook: 'notebook-a',
          mode: 'linear' as const,
          createdAt: 1,
          activePieceIndex: 0,
          pieces: [
            { pieceDocId: 'piece-old-1', title: '01 Old', order: 0, state: 'active' as const, topicCardId: 'card-old-1' },
            { pieceDocId: 'piece-old-2', title: '02 Old', order: 1, state: 'pending' as const },
          ],
        },
      },
      sourceDocToSession: {
        'doc-1': 'session-old',
      },
      pieceToSession: {
        'piece-old-1': 'session-old',
        'piece-old-2': 'session-old',
      },
      sourceDocToWorkbench: {},
    };
    const fileService = createFileServiceMock(initialState);
    const sql = createSplitTreeSqlMock([
      { id: 'block-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Fresh', markdown: '# Fresh', sort: '001' },
      { id: 'block-1-body', root_id: 'doc-1', parent_id: 'block-1', type: 'p', content: 'Rebuilt body', markdown: 'Rebuilt body', sort: '001' },
    ]);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql,
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'block-1-body') {
          return 'Rebuilt body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'piece-new-1'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.splitDocument('doc-1', 'linear');

    expect(result.pieceDocIds).toEqual(['piece-new-1']);
    const stored = fileService.getStored() as typeof initialState & {
      sessions: Record<string, unknown>;
      sourceDocToSession: Record<string, string>;
      pieceToSession: Record<string, string>;
    };
    expect(stored.sessions['session-old']).toBeUndefined();
    expect(stored.sourceDocToSession['doc-1']).not.toBe('session-old');
    expect(stored.pieceToSession['piece-old-1']).toBeUndefined();
    expect(stored.pieceToSession['piece-old-2']).toBeUndefined();
    expect(stored.pieceToSession['piece-new-1']).toBe(stored.sourceDocToSession['doc-1']);
  });

  it('blocks re-splitting when an existing split session still has piece docs', async () => {
    const initialState = {
      version: 2 as const,
      sessions: {
        'session-old': {
          id: 'session-old',
          sourceDocId: 'doc-1',
          sourceDocTitle: 'Article',
          notebook: 'notebook-a',
          mode: 'linear' as const,
          createdAt: 1,
          activePieceIndex: 0,
          pieces: [
            { pieceDocId: 'piece-old-1', title: '01 Old', order: 0, state: 'active' as const, topicCardId: 'card-old-1' },
            { pieceDocId: 'piece-old-2', title: '02 Old', order: 1, state: 'pending' as const },
          ],
        },
      },
      sourceDocToSession: {
        'doc-1': 'session-old',
      },
      pieceToSession: {
        'piece-old-1': 'session-old',
        'piece-old-2': 'session-old',
      },
      sourceDocToWorkbench: {},
    };
    const fileService = createFileServiceMock(initialState);
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('WHERE id IN')) {
          return [{ id: 'piece-old-1' }];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.splitDocument('doc-1', 'linear')).rejects.toThrow(
      '当前文档已经存在渐进 split 会话，仍有 1 个 piece 子文档存在'
    );
    expect(port.createDocWithMarkdown).not.toHaveBeenCalled();
  });

  it('completes the current linear piece and activates the next piece topic', async () => {
    const initialState = {
      version: 2 as const,
      sessions: {
        'session-1': {
          id: 'session-1',
          sourceDocId: 'doc-1',
          sourceDocTitle: 'Article',
          notebook: 'notebook-a',
          mode: 'linear' as const,
          createdAt: 1,
          activePieceIndex: 0,
          pieces: [
            { pieceDocId: 'piece-1', title: '01 Intro', order: 0, state: 'active' as const, topicCardId: 'card-existing' },
            { pieceDocId: 'piece-2', title: '02 Next', order: 1, state: 'pending' as const },
          ],
        },
      },
      sourceDocToSession: {
        'doc-1': 'session-1',
      },
      pieceToSession: {
        'piece-1': 'session-1',
        'piece-2': 'session-1',
      },
      sourceDocToWorkbench: {},
    };
    const fileService = createFileServiceMock(initialState);
    const port = createProgressiveSiyuanPortMock();
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.completeCurrentPiece('piece-1');

    expect(result).toEqual({
      sessionId: 'session-1',
      completedPieceDocId: 'piece-1',
      nextPieceDocId: 'piece-2',
      nextTopicCardId: 'card-1',
    });
    expect(port.setBlockAttrs).toHaveBeenCalledWith('piece-1', {
      'custom-fsrs-reading-piece-state': 'completed',
    });
    expect(port.setBlockAttrs).toHaveBeenCalledWith('piece-2', {
      'custom-fsrs-reading-piece-state': 'active',
    });
  });

  it('creates ordinary-note excerpts as child excerpt documents and only leaves doc refs in daily notes', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => {
        if (docId === 'doc-ordinary') {
          return {
            id: 'doc-ordinary',
            box: 'notebook-a',
            path: '/reading/ordinary.sy',
            hpath: '/reading/ordinary',
            name: 'Ordinary',
          };
        }
        return {
          id: docId,
          box: 'notebook-a',
          path: '/unknown.sy',
          hpath: '/unknown',
          name: docId,
        };
      }),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-1'")) {
          return [
            { id: 'source-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Before Focus text after', markdown: 'Before Focus text after' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/daily note/2026/2026-04-05'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/SiYuan Memo 渐进阅读'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-anchor-ref'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-source-group'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-excerpt-ref'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockKramdown: vi.fn(async () => ({
        kramdown: 'Before Focus text after',
      })),
      renderTemplate: vi.fn(async () => '/daily note/2026/2026-04-05'),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('daily-note-1')
        .mockResolvedValueOnce('excerpt-doc-1')
        .mockResolvedValueOnce('anchor-doc-1'),
      appendMarkdownBlock: vi
        .fn()
        .mockResolvedValueOnce('daily-anchor-ref-1')
        .mockResolvedValueOnce('daily-source-group-1')
        .mockResolvedValueOnce('daily-excerpt-ref-1'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock({ dailyTraceEnabled: true }));

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-1',
      selectedText: 'Focus text',
      origin: 'editor',
    });

    expect(result).toEqual({
      excerptDocId: 'excerpt-doc-1',
      topicCardId: 'card-1',
      sourceBlockId: 'source-1',
      dailyNoteDocId: 'daily-note-1',
    });
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/ordinary/[摘录 001] Focus text',
      '',
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('Focus text'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('data-type="block-ref"'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('data-id="source-1"'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('>*</span>'),
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      3,
      'notebook-a',
      '/SiYuan Memo 渐进阅读',
      '# SiYuan Memo 渐进阅读',
    );
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-1', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
      'custom-fsrs-reading-source-block-id': 'source-1',
    }));
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(1, 'daily-note-1', '((anchor-doc-1))');
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(2, 'daily-anchor-ref-1', '((doc-ordinary))');
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(3, 'daily-source-group-1', '((excerpt-doc-1))');
    expect(cardService.service.createCard).toHaveBeenCalledTimes(1);
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['excerpt-doc-1'],
      cardType: 'topic',
      extractedFrom: 'source-1',
      metadata: expect.objectContaining({
        source: 'manual',
        isDocument: true,
      }),
      progressiveLineage: expect.objectContaining({
        kind: 'excerpt',
        sourceDocId: 'doc-ordinary',
        sourceBlockId: 'source-1',
      }),
    }));
    expect(fileService.writeJSON).not.toHaveBeenCalled();
  });

  it('creates split-piece excerpts as child excerpt documents, increments numbering, and appends doc refs to daily notes', async () => {
    const initialState = {
      version: 2 as const,
      sessions: {
        'session-1': {
          id: 'session-1',
          sourceDocId: 'doc-root',
          sourceDocTitle: 'Source Root',
          notebook: 'notebook-a',
          mode: 'linear' as const,
          createdAt: 1,
          activePieceIndex: 0,
          pieces: [
            { pieceDocId: 'piece-1', title: '01 Intro', order: 0, state: 'active' as const, topicCardId: 'card-piece-1' },
          ],
        },
      },
      sourceDocToSession: {
        'doc-root': 'session-1',
      },
      pieceToSession: {
        'piece-1': 'session-1',
      },
      sourceDocToWorkbench: {},
    };
    const fileService = createFileServiceMock(initialState);
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => {
        if (docId === 'piece-1') {
          return {
            id: 'piece-1',
            box: 'notebook-a',
            path: '/reading/article/01 Intro.sy',
            hpath: '/reading/article/01 Intro',
            name: '01 Intro',
          };
        }
        return {
          id: docId,
          box: 'notebook-a',
          path: '/unknown.sy',
          hpath: '/unknown',
          name: docId,
        };
      }),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'piece-block-1'")) {
          return [
            { id: 'piece-block-1', root_id: 'piece-1', parent_id: 'piece-1', box: 'notebook-a', type: 'p', content: 'Before Piece text after', markdown: 'Before Piece text after' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/daily note/2026/2026-04-05'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'piece-1'")) {
          return [
            { id: 'excerpt-doc-old-1', content: '[摘录 001] Earlier' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/SiYuan Memo 渐进阅读'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-anchor-ref'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-source-group'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'daily-excerpt-ref'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockKramdown: vi.fn(async () => ({
        kramdown: 'Before Piece text after',
      })),
      renderTemplate: vi.fn(async () => '/daily note/2026/2026-04-05'),
      createDocWithMarkdown: vi
        .fn()
        .mockResolvedValueOnce('daily-note-1')
        .mockResolvedValueOnce('excerpt-doc-2')
        .mockResolvedValueOnce('anchor-doc-1'),
      appendMarkdownBlock: vi
        .fn()
        .mockResolvedValueOnce('daily-anchor-ref-1')
        .mockResolvedValueOnce('daily-source-group-1')
        .mockResolvedValueOnce('daily-excerpt-ref-1'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock({ dailyTraceEnabled: true }));

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'piece-block-1',
      selectedText: 'Piece text',
      origin: 'review',
      currentCardId: 'card-piece-1',
    });

    expect(result).toEqual({
      excerptDocId: 'excerpt-doc-2',
      topicCardId: 'card-1',
      sourceBlockId: 'piece-block-1',
      dailyNoteDocId: 'daily-note-1',
    });
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/01 Intro/[摘录 002] Piece text',
      '',
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('Piece text'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('data-type="block-ref"'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('data-id="piece-block-1"'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('>*</span>'),
    );
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(1, 'daily-note-1', '((anchor-doc-1))');
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(2, 'daily-anchor-ref-1', '((piece-1))');
    expect(port.appendMarkdownBlock).toHaveBeenNthCalledWith(3, 'daily-source-group-1', '((excerpt-doc-2))');
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-2', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-session-id': 'session-1',
      'custom-fsrs-reading-mode': 'linear',
      'custom-fsrs-reading-source-doc-id': 'piece-1',
      'custom-fsrs-reading-source-block-id': 'piece-block-1',
    }));
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['excerpt-doc-2'],
      extractedFrom: 'piece-block-1',
      metadata: expect.objectContaining({
        isDocument: true,
      }),
      progressiveLineage: expect.objectContaining({
        kind: 'excerpt',
        sessionId: 'session-1',
        mode: 'linear',
        pieceDocId: 'piece-1',
        sourceDocId: 'piece-1',
        sourceBlockId: 'piece-block-1',
      }),
    }));

    const stored = fileService.getStored() as typeof initialState;
    expect(stored.sessions['session-1'].pieces[0]).toEqual(expect.objectContaining({
      pieceDocId: 'piece-1',
      topicCardId: 'card-piece-1',
    }));
    expect(stored.sessions['session-1'].pieces[0]).not.toHaveProperty('workbenchDocId');
    expect(fileService.writeJSON).not.toHaveBeenCalled();
  });

  it('skips Daily Notes trace by default while still creating excerpt docs and topic cards', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => ({
        id: docId,
        box: 'notebook-a',
        path: '/reading/ordinary.sy',
        hpath: '/reading/ordinary',
        name: 'Ordinary',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-plain-1'")) {
          return [
            { id: 'source-plain-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Focus beta', markdown: 'Alpha Focus beta' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-plain-1'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-plain-1',
      selectedText: 'Focus',
      origin: 'editor',
    });

    expect(result).toEqual({
      excerptDocId: 'excerpt-doc-plain-1',
      topicCardId: 'card-1',
      sourceBlockId: 'source-plain-1',
      dailyNoteDocId: '',
    });
    expect(port.createDocWithMarkdown).toHaveBeenCalledTimes(1);
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/ordinary/[摘录 001] Focus',
      '',
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-plain-1',
      expect.stringContaining('data-id="source-plain-1"'),
    );
    expect(port.appendMarkdownBlock).not.toHaveBeenCalled();
  });

  it('uses a short normalized preview for new excerpt document titles while keeping full excerpt content', async () => {
    const longSelection = '人的思考并不只发生在大脑里，\n  而是分布在工具、符号与制度之间';
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => ({
        id: docId,
        box: 'notebook-a',
        path: '/reading/ordinary.sy',
        hpath: '/reading/ordinary',
        name: 'Ordinary',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-long-1'")) {
          return [
            { id: 'source-long-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Long selection source', markdown: 'Long selection source' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-long-1'),
    });
    const cardService = createCardServiceMock();
    const service = new ProgressiveReadingService(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-long-1',
      selectedText: longSelection,
      origin: 'editor',
    });

    expect(result).toEqual({
      excerptDocId: 'excerpt-doc-long-1',
      topicCardId: 'card-1',
      sourceBlockId: 'source-long-1',
      dailyNoteDocId: '',
    });
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/ordinary/[摘录 001] 人的思考并不只发生在大…',
      '',
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-long-1',
      expect.stringContaining('人的思考并不只发生在大脑里'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-long-1',
      expect.stringContaining('而是分布在工具、符号与制度之间'),
    );
  });
});
