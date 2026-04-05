import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { CardApplicationService } from '../CardApplicationService';
import { ProgressiveReadingService } from '../ProgressiveReadingService';
import type { ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
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
    getCardByBlockId: vi.fn((blockId: string) => cardsByBlockId.get(blockId) || null),
  };
  return {
    service: service as unknown as CardApplicationService,
    cardsByBlockId,
  };
}

describe('ProgressiveReadingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits a document by heading/hr and copies each piece root subtree markdown', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("root_id = 'doc-1'") && stmt.includes("parent_id = 'doc-1'")) {
          return [
            { id: 'block-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', content: 'Intro', markdown: '# Intro', sort: '1' },
            { id: 'block-hr', root_id: 'doc-1', parent_id: 'doc-1', type: 'hr', content: '---', markdown: '---', sort: '2' },
            { id: 'block-2', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', content: 'Next', markdown: '## Next', sort: '3' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      copyStdMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'block-1') {
          return '# Intro\n\nAlpha body\n\n- child list';
        }
        if (blockId === 'block-2') {
          return '## Next\n\nBeta body\n\n> quote child';
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

    const result = await service.splitDocument('doc-1', 'linear');

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2']);
    expect(port.copyStdMarkdown).toHaveBeenCalledTimes(2);
    expect(port.copyStdMarkdown).toHaveBeenNthCalledWith(1, 'block-1');
    expect(port.copyStdMarkdown).toHaveBeenNthCalledWith(2, 'block-2');
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 Intro',
      '# Intro\n\nAlpha body\n\n- child list',
    );
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      2,
      'notebook-a',
      '/reading/article/02 Next',
      '## Next\n\nBeta body\n\n> quote child',
    );
    expect(cardService.service.createCard).toHaveBeenCalledTimes(1);
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['piece-1'],
      cardType: 'topic',
      metadata: expect.objectContaining({
        progressive: expect.objectContaining({
          kind: 'piece',
          mode: 'linear',
          pieceDocId: 'piece-1',
          sourceDocId: 'doc-1',
          pieceIndex: 0,
        }),
      }),
    }));
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
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async () => ({
        id: 'doc-1',
        box: 'notebook-a',
        path: '/reading/article.sy',
        hpath: '/reading/article',
        name: 'Article',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'piece-old-1'")) {
          return [];
        }
        if (stmt.includes("WHERE id = 'piece-old-2'")) {
          return [];
        }
        if (stmt.includes("root_id = 'doc-1'") && stmt.includes("parent_id = 'doc-1'")) {
          return [
            { id: 'block-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', content: 'Fresh', markdown: '# Fresh', sort: '1' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'")) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      copyStdMarkdown: vi.fn(async () => '# Fresh\n\nRebuilt body'),
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
        if (stmt.includes("WHERE id = 'piece-old-1'")) {
          return [{ id: 'piece-old-1' }];
        }
        if (stmt.includes("WHERE id = 'piece-old-2'")) {
          return [];
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
