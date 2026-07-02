import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import { ok } from '@/types/result';
import type { CardApplicationService } from '../CardApplicationService';
import { EXCERPT_RECORD_STORAGE_KEY, type ExcerptRecord, ExcerptRecordService } from '../ExcerptRecordService';
import { ProgressiveReadingService, ProgressiveSplitCancelledError } from '../ProgressiveReadingService';
import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
import type { ProgressiveBlockRow, ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { PluginSettings } from '@/types/settings';
import { classifyBlockAttrWrite } from '@/types/block-attr-policy';
import {
  buildProgressiveContentPayloadIdentity,
  type ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import {
  ATTR_PROGRESSIVE_DERIVED_ITEM_IDENTITY,
  ATTR_PROGRESSIVE_DISCLOSURE_STATE,
  ATTR_PROGRESSIVE_PAYLOAD_IDENTITY,
  ATTR_PROGRESSIVE_SELECTION_SNAPSHOT,
  ATTR_PROGRESSIVE_SOURCE_LINEAGE,
  ATTR_PROGRESSIVE_SOURCE_POSITION,
} from '../ProgressiveAttrContract';

const NODE_ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/u;

function isDirectChildCleanupSql(stmt: string, docId: string): boolean {
  return stmt.includes(`WHERE b.parent_id = '${docId}'`) && stmt.includes('LIMIT 2');
}

function isDocHPathLookupSql(stmt: string): boolean {
  return stmt.includes('WHERE type = \'d\'')
    && stmt.includes('AND hpath = \'')
    && stmt.includes('LIMIT 1');
}

function createFileServiceMock(initialData: unknown = null): IFileService & { getStored: (fileName?: string) => unknown } {
  const store = new Map<string, unknown>();
  if (initialData !== null) {
    store.set('progressive-reading.json', initialData);
  }
  return {
    readFile: vi.fn(async () => null),
    writeFile: vi.fn(async () => undefined),
    readJSON: vi.fn(async (fileName: string) => (store.has(fileName) ? store.get(fileName) ?? null : null)),
    writeJSON: vi.fn(async (_fileName: string, data: unknown) => {
      store.set(_fileName, data);
    }),
    readMsgpack: vi.fn(async () => null),
    writeMsgpack: vi.fn(async () => undefined),
    getStored: (fileName = 'progressive-reading.json') => store.get(fileName),
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
    updateDomBlock: vi.fn(async () => 'updated-dom-block'),
    updateMarkdownBlock: vi.fn(async () => 'updated-markdown-block'),
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
  overrides: Partial<PluginSettings['progressiveReading'] & { dailyTraceEnabled?: boolean }> = {},
) {
  return {
    getSettings: () => ({
      progressiveReading: {
        altXExcerptEnabled: false,
        storage: {
          mode: 'source-child',
          notebookId: '',
          targetBlockId: '',
        },
        ...overrides,
      },
    }),
  };
}

function createProgressiveNativeRiffPortMock(
  overrides: Partial<ProgressiveNativeRiffPort> = {},
): ProgressiveNativeRiffPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    addRiffCards: vi.fn(async () => ({
      name: 'builtin-deck',
      size: 0,
    })),
    ...overrides,
  };
}

function createConfiguredCaptureStorageServiceMock(overrides: Record<string, unknown> = {}) {
  return {
    hasExplicitConfiguration: vi.fn(() => false),
    resolveLibraryTarget: vi.fn(),
    resolveDailyNoteTarget: vi.fn(),
    listOpenNotebooks: vi.fn(async () => []),
    ...overrides,
  };
}

function createExcerptCompletionServiceMock() {
  return {
    enqueue: vi.fn(async (record: ExcerptRecord) => ({
      status: 'completed' as const,
      recordId: record.recordId,
      topicCardId: `topic-card-${record.excerptEntityId}`,
      created: true,
    })),
  };
}

function createServiceUnderTest(
  port: ProgressiveSiyuanPort,
  fileService: IFileService,
  cardService: CardApplicationService,
  settingsProvider: {
    getSettings: () => {
      progressiveReading: PluginSettings['progressiveReading'] & { dailyTraceEnabled?: boolean };
    };
  },
  configuredCaptureStorageService = createConfiguredCaptureStorageServiceMock(),
  nativeRiffApi = createProgressiveNativeRiffPortMock(),
  ownershipBoundaryClient?: {
    p6OwnershipQuery?: ReturnType<typeof vi.fn>;
  },
  backendClient?: {
    executeProgressiveCommand?: ReturnType<typeof vi.fn>;
  },
  commandRelayRuntime?: {
    getMode?: ReturnType<typeof vi.fn>;
    getInstanceId?: ReturnType<typeof vi.fn>;
  },
  followerCommandClient?: {
    submitAndWait?: ReturnType<typeof vi.fn>;
  },
  transactionProvenanceRegistry?: {
    recordBlockIds: ReturnType<typeof vi.fn>;
  },
  excerptCompletionService?: {
    enqueue: (record: ExcerptRecord) => Promise<{
      status: 'completed';
      recordId: string;
      topicCardId: string;
      created: boolean;
    } | {
      status: 'failed';
      recordId: string;
      error: string;
    }>;
  },
) {
  const excerptRecordService = new ExcerptRecordService(fileService);
  return new ProgressiveReadingService(
    port,
    nativeRiffApi,
    fileService,
    cardService,
    settingsProvider,
    configuredCaptureStorageService as never,
    excerptRecordService,
    undefined,
    ownershipBoundaryClient as never,
    backendClient as never,
    commandRelayRuntime as never,
    followerCommandClient as never,
    transactionProvenanceRegistry as never,
    excerptCompletionService ?? createExcerptCompletionServiceMock(),
  );
}

function createCardServiceMock(initialCards: Array<{ id: string; blockId: string; type?: string }> = []) {
  const cardsByBlockId = new Map<string, { id: string; blockId: string; type?: string }>(
    initialCards.map((card) => [card.blockId, card]),
  );
  let counter = initialCards.length;
  const service = {
    createCard: vi.fn(async (command: { blockIds: string[] }) => {
      const blockId = command.blockIds[0];
      cardsByBlockId.set(blockId, {
        id: `card-${++counter}`,
        blockId,
        type: String((command as { cardType?: string }).cardType || '').trim() || undefined,
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
    updateCard: vi.fn(async () => ok(undefined)),
    updateFSRSCard: vi.fn(async () => ok(undefined)),
    getCardByBlockId: vi.fn((blockId: string) => cardsByBlockId.get(blockId) || null),
    getCardsByBlockId: vi.fn((blockId: string) => {
      const card = cardsByBlockId.get(blockId);
      return card ? [card] : [];
    }),
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

function createExcerptSelectionSnapshot(
  overrides: Partial<ProgressiveExcerptSelectionSnapshot> = {},
): ProgressiveExcerptSelectionSnapshot {
  const range = document.createRange();
  const commonElement = document.body;
  return {
    blockId: 'block-1',
    sourceBlockId: 'block-1',
    sourceBlockIds: ['block-1', 'block-2'],
    text: 'Alpha\nBeta',
    contentDom: [
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    ].join(''),
    range,
    blockSelections: [
      {
        blockId: 'block-1',
        mode: 'full-block',
        excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      },
      {
        blockId: 'block-2',
        mode: 'full-block',
        excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      },
    ],
    commonElement,
    root: document.body,
    protyle: { wysiwyg: { element: document.body } } as never,
    ...overrides,
  };
}

describe('ProgressiveReadingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports progressive ownership boundary query before direct block reads', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-boundary-1'")) {
          return [
            { id: 'source-boundary-1', root_id: 'doc-1', parent_id: 'doc-1', box: 'nb', type: 'p', content: 'text', markdown: 'text' },
          ];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const { service: cardService } = createCardServiceMock();
    const ownershipBoundaryClient = {
      p6OwnershipQuery: vi.fn(async () => ({ ok: true })),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
      createConfiguredCaptureStorageServiceMock(),
      createProgressiveNativeRiffPortMock(),
      ownershipBoundaryClient,
    );

    const row = await (service as unknown as {
      getBlockInfo: (blockId: string) => Promise<ProgressiveBlockRow>;
    }).getBlockInfo('source-boundary-1');

    expect(row.id).toBe('source-boundary-1');
    expect(ownershipBoundaryClient.p6OwnershipQuery).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'progressive',
      operation: 'read-block-meta',
      payload: expect.objectContaining({ blockId: 'source-boundary-1' }),
    }));
  });

  it('executes child doc creation through the backend progressive command facade', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-block-1'")) {
          return [
            { id: 'source-block-1', root_id: 'doc-1', parent_id: 'doc-1', box: 'nb', type: 'p', content: 'text', markdown: 'text' },
          ];
        }
        if (stmt.includes("WHERE id = 'doc-1'")) {
          return [
            { id: 'doc-1', root_id: 'doc-1', parent_id: '', box: 'nb', type: 'd', content: 'Doc 1', markdown: 'Doc 1' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'") || stmt.includes("WHERE b.type = 'd'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const { service: cardService } = createCardServiceMock();
    const backendClient = {
      executeProgressiveCommand: vi.fn(async () => ({
        status: 'completed' as const,
        commandId: 'progressive:create-child-doc:1',
        idempotencyKey: 'progressive:create-child-doc:source-block-1:1',
        operation: 'create-child-doc' as const,
        result: {
          docId: 'created-via-backend',
          parentDocId: 'doc-1',
          storageMode: 'workbench',
          sequence: 1,
          contentBlockId: 'created-block-via-backend',
        },
        rollback: { attempted: false, status: 'not-needed' as const },
        progress: {
          state: 'succeeded' as const,
          updatedAt: 1,
        },
        diagnostics: {
          diagnosticEventId: 'progressive:create-child-doc:1',
          family: 'progressive.command' as const,
          commandId: 'progressive:create-child-doc:1',
          errorCategory: null,
        },
      })),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
      createConfiguredCaptureStorageServiceMock(),
      createProgressiveNativeRiffPortMock(),
      undefined,
      backendClient,
    );

    const result = await service.createChildDocFromSource({
      sourceDocId: 'doc-1',
      kind: 'derived-item-doc',
      fallbackTitle: '挖空',
      previewText: 'preview',
      contentMarkdown: 'content',
      attrs: {},
    });

    expect(result.docId).toBe('created-via-backend');
    expect(port.createDocWithMarkdown).not.toHaveBeenCalled();
    expect(backendClient.executeProgressiveCommand).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create-child-doc',
      input: expect.objectContaining({
        sourceDocId: 'doc-1',
        kind: 'derived-item-doc',
        fallbackTitle: '挖空',
      }),
    }));
  });

  it('creates child docs with clean preview titles and numeric collision suffixes', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => ({
        id: docId,
        box: 'notebook-a',
        path: '/reading/source.sy',
        hpath: '/reading/source',
        name: 'Source',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/reading/source/Focus text'")) {
          return [{ id: 'existing-focus-doc' }];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/reading/source/Focus text 2'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'created-focus-doc'),
      updateMarkdownBlock: vi.fn(async () => 'created-focus-content'),
    });
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService, createSettingsProviderMock());

    const result = await service.createChildDocFromSource({
      sourceDocId: 'doc-1',
      kind: 'derived-item-doc',
      fallbackTitle: '挖空',
      previewText: 'Focus/text',
      previewMax: 20,
      storageMode: 'source-child',
      contentMarkdown: 'content',
      attrs: {},
    });

    expect(result).toEqual(expect.objectContaining({
      docId: 'created-focus-doc',
      parentDocId: 'doc-1',
      sequence: 2,
      contentBlockId: 'created-focus-content',
    }));
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/source/Focus text 2',
      '',
    );
  });

  it('relays backend progressive commands when current window is follower', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock();
    const { service: cardService } = createCardServiceMock();
    const backendClient = {
      executeProgressiveCommand: vi.fn(async () => {
        throw new Error('writer should own follower progressive command');
      }),
    };
    const followerCommandClient = {
      submitAndWait: vi.fn(async () => ({
        status: 'completed' as const,
        commandId: 'progressive-relayed',
        idempotencyKey: 'progressive-relayed-key',
        operation: 'delete-artifact' as const,
        result: null,
        rollback: { attempted: false, status: 'not-needed' as const },
        progress: { state: 'succeeded' as const, updatedAt: 1 },
        diagnostics: {
          diagnosticEventId: 'progressive-relayed',
          family: 'progressive.command' as const,
          commandId: 'progressive-relayed',
          errorCategory: null,
        },
      })),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
      createConfiguredCaptureStorageServiceMock(),
      createProgressiveNativeRiffPortMock(),
      undefined,
      backendClient,
      { getMode: vi.fn(() => 'follower'), getInstanceId: vi.fn(() => 'follower-1') },
      followerCommandClient,
    );

    await service.deleteProgressiveArtifact('block-relay-1');

    expect(backendClient.executeProgressiveCommand).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(followerCommandClient.submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-1',
      method: 'progressive.command.execute',
      params: expect.objectContaining({
        operation: 'delete-artifact',
        input: { blockId: 'block-relay-1' },
        caller: expect.objectContaining({
          runtimeRole: 'follower',
          instanceId: 'follower-1',
        }),
      }),
    }));
  });

  it('updates excerpt source blocks through the progressive Siyuan port DOM update path', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock();
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    await expect(
      service.updateSourceBlockDom('source-block-1', '<div data-node-id="source-block-1">Updated</div>'),
    ).resolves.toBeUndefined();

    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'source-block-1',
      '<div data-node-id="source-block-1">Updated</div>',
    );
  });

  it('keeps cross-block excerpt selections on the original source range without mutating source blocks', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id IN ('block-1', 'block-2', 'block-3')")) {
          return [
            { id: 'block-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', sort: '001' },
            { id: 'block-2', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', sort: '002' },
            { id: 'block-3', root_id: 'doc-1', parent_id: 'doc-1', type: 'p', sort: '003' },
          ];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    const snapshot = createExcerptSelectionSnapshot({
      sourceBlockIds: ['block-1', 'block-2', 'block-3'],
      text: 'lpha\nMiddle block\nTail',
      contentDom: [
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">lpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Middle block</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Tail</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      ].join(''),
      blockSelections: [
        {
          blockId: 'block-1',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">lpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
          beforeHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">A</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
          range: document.createRange(),
        },
        {
          blockId: 'block-2',
          mode: 'full-block',
          excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Middle block</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        },
        {
          blockId: 'block-3',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Tail</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
          afterHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true"> end</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
          range: document.createRange(),
        },
      ],
    });

    const result = await service.materializeExcerptSource(snapshot);

    expect(port.updateDomBlock).not.toHaveBeenCalled();
    expect(port.moveBlockAsChild).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-2', 'block-3'],
      reused: false,
      contentDom: snapshot.contentDom,
    }));
    expect(result.highlightSnapshot).toBe(snapshot);
    expect(result.highlightSnapshot.sourceBlockId).toBe('block-1');
    expect(result.highlightSnapshot.sourceBlockIds).toEqual(['block-1', 'block-2', 'block-3']);
    expect(result.highlightSnapshot.blockSelections.map((selection) => selection.blockId)).toEqual([
      'block-1',
      'block-2',
      'block-3',
    ]);
    expect(result.highlightSnapshot.blockSelections.map((selection) => selection.mode)).toEqual([
      'range',
      'full-block',
      'range',
    ]);
  });

  it('keeps selections inside an existing native super block anchored to the first selected child', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id IN ('child-1', 'child-2')")) {
          return [
            { id: 'child-1', root_id: 'doc-1', parent_id: 'super-block-1', type: 'p', sort: '001' },
            { id: 'child-2', root_id: 'doc-1', parent_id: 'super-block-1', type: 'p', sort: '002' },
          ];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    const snapshot = createExcerptSelectionSnapshot({
      blockId: 'child-1',
      sourceBlockId: 'child-1',
      sourceBlockIds: ['child-1', 'child-2'],
      blockSelections: [
        {
          blockId: 'child-1',
          mode: 'full-block',
          excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        },
        {
          blockId: 'child-2',
          mode: 'full-block',
          excerptHtml: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        },
      ],
    });

    const result = await service.materializeExcerptSource(snapshot);

    expect(port.updateDomBlock).not.toHaveBeenCalled();
    expect(port.moveBlockAsChild).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      sourceBlockId: 'child-1',
      sourceBlockIds: ['child-1', 'child-2'],
      reused: false,
      contentDom: snapshot.contentDom,
    }));
    expect(result.highlightSnapshot).toBe(snapshot);
    expect(result.highlightSnapshot.blockSelections.map((selection) => selection.blockId)).toEqual(['child-1', 'child-2']);
  });

  it('keeps multi-block full selections on the original child ids without rewriting list containers', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id IN ('list-item-1', 'list-item-2')")) {
          return [
            { id: 'list-item-1', root_id: 'doc-1', parent_id: 'list-1', type: 'i', sort: '001' },
            { id: 'list-item-2', root_id: 'doc-1', parent_id: 'list-1', type: 'i', sort: '002' },
          ];
        }
        if (stmt.includes("WHERE id = 'list-1'")) {
          return [
            { id: 'list-1', root_id: 'doc-1', parent_id: 'doc-1', type: 'l', sort: '000' },
          ];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    const snapshot = createExcerptSelectionSnapshot({
      blockId: 'list-item-1',
      sourceBlockId: 'list-item-1',
      sourceBlockIds: ['list-item-1', 'list-item-2'],
      text: 'Alpha\nBeta',
      contentDom: [
        '<div data-type="NodeListItem" class="li"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeListItem" class="li"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      ].join(''),
      blockSelections: [
        {
          blockId: 'list-item-1',
          mode: 'full-block',
          excerptHtml: '<div data-type="NodeListItem" class="li"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        },
        {
          blockId: 'list-item-2',
          mode: 'full-block',
          excerptHtml: '<div data-type="NodeListItem" class="li"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        },
      ],
    });

    const result = await service.materializeExcerptSource(snapshot);

    expect(port.updateDomBlock).not.toHaveBeenCalled();
    expect(port.moveBlockAsChild).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      sourceBlockId: 'list-item-1',
      sourceBlockIds: ['list-item-1', 'list-item-2'],
      reused: false,
      contentDom: snapshot.contentDom,
    }));
    expect(result.highlightSnapshot).toBe(snapshot);
    expect(result.highlightSnapshot.sourceBlockId).toBe('list-item-1');
    expect(result.highlightSnapshot.sourceBlockIds).toEqual(['list-item-1', 'list-item-2']);
    expect(result.highlightSnapshot.blockSelections.map((selection) => selection.blockId)).toEqual([
      'list-item-1',
      'list-item-2',
    ]);
  });

  it('stamps valid block ids onto multi-block excerpt entity DOM and appends the first source ref inline', () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock();
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    const excerptEntityDom = (service as unknown as {
      buildExcerptEntityDom: (input: {
        selectedText: string;
        contentDom?: string;
        sourceBlockIds: string[];
      }) => string;
    }).buildExcerptEntityDom({
      selectedText: 'Alpha\nBeta',
      sourceBlockIds: ['source-1', 'source-2'],
      contentDom: [
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      ].join(''),
    });

    const template = document.createElement('template');
    template.innerHTML = excerptEntityDom;
    const blockElements = Array.from(template.content.querySelectorAll<HTMLElement>('[data-type]'))
      .filter((element) => String(element.getAttribute('data-type') || '').startsWith('Node'));

    expect(blockElements).toHaveLength(2);
    expect(blockElements.every((element) => NODE_ID_PATTERN.test(String(element.getAttribute('data-node-id') || '').trim()))).toBe(true);
    expect(excerptEntityDom).toContain('data-id="source-1"');
    expect(excerptEntityDom).not.toContain('data-id="source-2"');
    expect((excerptEntityDom.match(/data-type="block-ref"/g) || [])).toHaveLength(1);
    expect(blockElements[0].querySelector('[contenteditable="true"]')?.innerHTML).toContain('Alpha');
    expect(blockElements[0].querySelector('[contenteditable="true"]')?.innerHTML).toContain('data-id="source-1"');
    expect(blockElements[1].querySelector('[contenteditable="true"]')?.innerHTML).not.toContain('data-id=');
  });

  it('removes accidental leading blank excerpt blocks before adding the source ref', () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock();
    const { service: cardService } = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService,
      createSettingsProviderMock(),
    );

    const excerptEntityDom = (service as unknown as {
      buildExcerptEntityDom: (input: {
        selectedText: string;
        contentDom?: string;
        sourceBlockIds: string[];
      }) => string;
    }).buildExcerptEntityDom({
      selectedText: 'Alpha\nBeta',
      sourceBlockIds: ['source-1'],
      contentDom: [
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true"><br /></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">\u200b</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      ].join(''),
    });

    const template = document.createElement('template');
    template.innerHTML = excerptEntityDom;
    const blockElements = Array.from(template.content.querySelectorAll<HTMLElement>('[data-type]'))
      .filter((element) => String(element.getAttribute('data-type') || '').startsWith('Node'));

    expect(blockElements).toHaveLength(3);
    expect(blockElements[0].textContent?.replace(/\u200b/g, '').trim()).toContain('Alpha');
    expect(blockElements[0].querySelector('[contenteditable="true"]')?.innerHTML).toContain('data-id="source-1"');
    expect(blockElements[1].textContent?.replace(/\u200b/g, '').trim()).toBe('');
    expect(blockElements[2].textContent?.replace(/\u200b/g, '').trim()).toBe('Beta');
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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
      cardType: 'topic',
      progressiveLineage: expect.objectContaining({
        kind: 'piece',
        sessionId: expect.any(String),
        mode: 'linear',
        pieceDocId: 'piece-1',
        pieceIndex: 0,
        sourceDocId: 'doc-1',
      }),
      metadata: expect.objectContaining({
        source: 'manual',
        isDocument: true,
      }),
    }));
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    const result = await service.splitDocument('doc-1', 'nonlinear');

    expect(result.pieceDocIds).toEqual(['piece-1', 'piece-2']);
    expect(cardService.service.createCard).toHaveBeenCalledTimes(2);
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(1, expect.objectContaining({
      blockIds: ['piece-1'],
      cardType: 'topic',
      progressiveLineage: expect.objectContaining({
        kind: 'piece',
        mode: 'nonlinear',
        pieceDocId: 'piece-1',
        pieceIndex: 0,
        sourceDocId: 'doc-1',
      }),
    }));
    expect(cardService.service.createCard).toHaveBeenNthCalledWith(2, expect.objectContaining({
      blockIds: ['piece-2'],
      cardType: 'topic',
      progressiveLineage: expect.objectContaining({
        kind: 'piece',
        mode: 'nonlinear',
        pieceDocId: 'piece-2',
        pieceIndex: 1,
        sourceDocId: 'doc-1',
      }),
    }));
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

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
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

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
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

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
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

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
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

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
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['piece-2'],
      cardType: 'topic',
      progressiveLineage: expect.objectContaining({
        kind: 'piece',
        sessionId: 'session-1',
        mode: 'linear',
        pieceDocId: 'piece-2',
        pieceIndex: 1,
        sourceDocId: 'doc-1',
      }),
    }));
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
    expect(cardService.service.updateCard).not.toHaveBeenCalled();
    expect(cardService.service.updateFSRSCard).not.toHaveBeenCalled();
  });

  it('executes progressive advance and defer commands through processing state without formal scheduler mutation', async () => {
    const initialState = {
      version: 2 as const,
      sessions: {
        'session-command-1': {
          id: 'session-command-1',
          sourceDocId: 'doc-command-1',
          sourceDocTitle: 'Source',
          notebook: 'notebook-a',
          mode: 'linear' as const,
          createdAt: 1,
          activePieceIndex: 0,
          pieces: [
            { pieceDocId: 'piece-command-1', title: '01 Current', order: 0, state: 'active' as const },
            { pieceDocId: 'piece-command-2', title: '02 Next', order: 1, state: 'pending' as const },
          ],
        },
      },
      sourceDocToSession: {
        'doc-command-1': 'session-command-1',
      },
      pieceToSession: {
        'piece-command-1': 'session-command-1',
        'piece-command-2': 'session-command-1',
      },
      sourceDocToWorkbench: {},
    };
    const fileService = createFileServiceMock(initialState);
    const port = createProgressiveSiyuanPortMock();
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
    );

    await service.executeProcessingCommand({ operation: 'advance', pieceDocId: 'piece-command-1' });
    await service.executeProcessingCommand({ operation: 'defer', pieceDocId: 'piece-command-2' });

    expect(port.setBlockAttrs).toHaveBeenCalledWith('piece-command-1', {
      'custom-fsrs-reading-piece-state': 'completed',
    });
    expect(port.setBlockAttrs).toHaveBeenCalledWith('piece-command-2', expect.objectContaining({
      'custom-fsrs-reading-piece-state': 'deferred',
    }));
    expect(JSON.parse(
      vi.mocked(port.setBlockAttrs).mock.calls.find(([blockId, attrs]) =>
        blockId === 'piece-command-2' && Object.prototype.hasOwnProperty.call(attrs, ATTR_PROGRESSIVE_DISCLOSURE_STATE)
      )?.[1][ATTR_PROGRESSIVE_DISCLOSURE_STATE] ?? '{}',
    )).toEqual({
      version: 1,
      state: 'deferred',
      formalSchedulerMutation: false,
    });
    expect(cardService.service.updateCard).not.toHaveBeenCalled();
    expect(cardService.service.updateFSRSCard).not.toHaveBeenCalled();
  });

  it('creates ordinary-note excerpts as child excerpt documents without writing Daily Notes trace, even when legacy trace settings are present', async () => {
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
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockKramdown: vi.fn(async () => ({
        kramdown: 'Before Focus text after',
      })),
      createDocWithMarkdown: vi.fn().mockResolvedValueOnce('excerpt-doc-1'),
      updateDomBlock: vi.fn(async () => 'excerpt-content-1'),
    });
    const cardService = createCardServiceMock();
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const transactionProvenanceRegistry = {
      recordBlockIds: vi.fn(),
    };
    const legacySettingsProvider = {
      getSettings: () => ({
        progressiveReading: {
          altXExcerptEnabled: false,
          storage: {
            mode: 'library',
            notebookId: '',
            targetBlockId: '',
          },
          dailyTraceEnabled: true,
        },
      }),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      legacySettingsProvider,
      undefined,
      nativeRiffApi,
      undefined,
      undefined,
      undefined,
      undefined,
      transactionProvenanceRegistry,
    );

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-1',
      selectedText: 'Focus text',
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'source-1',
      sourceBlockIds: ['source-1'],
      containerDocId: 'excerpt-doc-1',
      recordId: expect.any(String),
      colorApplied: false,
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/ordinary/Focus text',
      '',
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('Focus text'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('data-type="block-ref"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('data-id="source-1"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('>*</span>'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-1',
      expect.stringContaining('data-subtype="s"'),
    );
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-1', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
      'custom-fsrs-reading-source-block-id': 'source-1',
    }));
    expect(port.createDocWithMarkdown).toHaveBeenCalledTimes(1);
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.appendMarkdownBlock).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
    expect(transactionProvenanceRegistry.recordBlockIds).toHaveBeenNthCalledWith(1, ['source-1'], {
      reason: 'progressive-excerpt-source-mark',
      source: 'progressive-excerpt',
      suppressAutoCard: true,
    });
    expect(transactionProvenanceRegistry.recordBlockIds).toHaveBeenNthCalledWith(2, ['excerpt-content-1'], {
      reason: 'progressive-excerpt-artifact',
      source: 'progressive-excerpt',
      suppressAutoCard: true,
    });
    expect(transactionProvenanceRegistry.recordBlockIds).toHaveBeenNthCalledWith(3, ['excerpt-doc-1'], {
      reason: 'progressive-excerpt-artifact',
      source: 'progressive-excerpt',
      suppressAutoCard: true,
    });
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      version: 1,
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-doc-1',
          sourceDocId: 'doc-ordinary',
          sourceBlockId: 'source-1',
          selectedText: 'Focus text',
          normalizedFingerprint: 'Focus text',
          status: 'active',
          completionStatus: 'pending',
        }),
      ],
    }));
  });

  it('replaces the empty doc body through document update without deleting placeholder blocks', async () => {
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
        if (stmt.includes("WHERE id = 'source-cleanup-1'")) {
          return [
            {
              id: 'source-cleanup-1',
              root_id: 'doc-cleanup',
              parent_id: 'doc-cleanup',
              box: 'notebook-a',
              type: 'p',
              content: 'Focus text',
              markdown: 'Focus text',
            },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-cleanup'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-cleanup-1'),
      updateDomBlock: vi.fn(async () => 'excerpt-content-cleanup-1'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    await service.createExcerptFromSelection({
      sourceBlockId: 'source-cleanup-1',
      selectedText: 'Focus text',
      origin: 'editor',
    });

    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-cleanup-1',
      expect.stringContaining('Focus text'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-cleanup-1', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
    }));
  });

  it('records progressive source semantics for excerpts without writing high-churn block attrs', async () => {
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
        if (stmt.includes("WHERE id = 'source-lineage-1'")) {
          return [
            { id: 'source-lineage-1', root_id: 'doc-lineage', parent_id: 'doc-lineage', box: 'notebook-a', type: 'p', content: 'Before Focus text after', markdown: 'Before Focus text after' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-lineage'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-lineage-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-lineage-1'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    await service.createExcerptFromSelection({
      sourceBlockId: 'source-lineage-1',
      selectedText: 'Focus text',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Focus text</div></div>',
      origin: 'editor',
    });

    const excerptAttrsCall = vi.mocked(port.setBlockAttrs).mock.calls.find(([blockId, attrs]) =>
      blockId === 'excerpt-lineage-1' && attrs['custom-fsrs-reading-kind'] === 'excerpt-doc'
    );
    expect(excerptAttrsCall?.[1]).toEqual(expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'doc-lineage',
      'custom-fsrs-reading-source-block-id': 'source-lineage-1',
    }));
    expect(excerptAttrsCall?.[1]).not.toHaveProperty(ATTR_PROGRESSIVE_SOURCE_LINEAGE);
    expect(excerptAttrsCall?.[1]).not.toHaveProperty(ATTR_PROGRESSIVE_SELECTION_SNAPSHOT);
    expect(excerptAttrsCall?.[1]).not.toHaveProperty(ATTR_PROGRESSIVE_PAYLOAD_IDENTITY);
    expect(excerptAttrsCall?.[1]).not.toHaveProperty(ATTR_PROGRESSIVE_SOURCE_POSITION);
    expect(excerptAttrsCall?.[1]).not.toHaveProperty(ATTR_PROGRESSIVE_DISCLOSURE_STATE);

    const highChurnAttrs = [
      ATTR_PROGRESSIVE_SOURCE_LINEAGE,
      ATTR_PROGRESSIVE_SELECTION_SNAPSHOT,
      ATTR_PROGRESSIVE_PAYLOAD_IDENTITY,
      ATTR_PROGRESSIVE_SOURCE_POSITION,
      ATTR_PROGRESSIVE_DISCLOSURE_STATE,
      ATTR_PROGRESSIVE_DERIVED_ITEM_IDENTITY,
    ];
    for (const [, attrs] of vi.mocked(port.setBlockAttrs).mock.calls) {
      for (const attrName of highChurnAttrs) {
        expect(attrs).not.toHaveProperty(attrName);
      }
    }

    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      version: 1,
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-lineage-1',
          sourceDocId: 'doc-lineage',
          sourceBlockId: 'source-lineage-1',
          sourceBlockIds: ['source-lineage-1'],
          sourceSemantics: expect.objectContaining({
            sourceLineage: expect.objectContaining({
              version: 1,
              authority: 'siyuan-block',
              sourceDocId: 'doc-lineage',
              rootDocId: 'doc-lineage',
              sourceBlockId: 'source-lineage-1',
              sourceBlockIds: ['source-lineage-1'],
            }),
            selectionSnapshot: expect.objectContaining({
              kind: 'block-selection',
              sourceBlockId: 'source-lineage-1',
              selectionMode: 'range',
            }),
            payloadIdentity: expect.objectContaining({
              algorithm: 'fnv1a32',
              sourceBlockIds: ['source-lineage-1'],
              textLength: 10,
            }),
            sourcePosition: expect.objectContaining({
              kind: 'siyuan-block',
              blockId: 'source-lineage-1',
              rootDocId: 'doc-lineage',
            }),
            disclosureState: {
              version: 1,
              state: 'created',
              formalSchedulerMutation: false,
            },
          }),
        }),
      ],
    }));
    expect(cardService.service.createCard).not.toHaveBeenCalled();
  });

  it('creates excerpts when the Siyuan attr writer rejects forbidden source-lineage attrs', async () => {
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
        if (stmt.includes("WHERE id = 'source-policy-1'")) {
          return [
            { id: 'source-policy-1', root_id: 'doc-policy', parent_id: 'doc-policy', box: 'notebook-a', type: 'p', content: 'Policy guarded source', markdown: 'Policy guarded source' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-policy'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-policy-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-policy-1'),
      setBlockAttrs: vi.fn(async (_blockId: string, attrs: Record<string, string>) => {
        for (const [attrName, value] of Object.entries(attrs)) {
          const classification = classifyBlockAttrWrite(attrName, String(value));
          if (!classification.allowed) {
            throw new Error(`BLOCK_ATTR_WRITE_FORBIDDEN: ${attrName} (${classification.reason})`);
          }
        }
      }),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.createExcerptFromSelection({
      sourceBlockId: 'source-policy-1',
      selectedText: 'Policy guarded source',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Policy guarded source</div></div>',
      origin: 'editor',
    })).resolves.toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-policy-1',
      sourceBlockId: 'source-policy-1',
    }));
  });

  it('reports current, stale, missing, and detached progressive source status without rewriting excerpt payload', async () => {
    let rows: ProgressiveBlockRow[] = [
      { id: 'source-status-1', root_id: 'doc-status', parent_id: 'doc-status', box: 'notebook-a', type: 'p', content: 'Focus text', markdown: 'Focus text' },
    ];
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('WHERE id IN')) {
          return rows;
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
    });
    const fileService = createFileServiceMock();
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());
    const lineage: ProgressiveSourceLineage = {
      version: 1,
      authority: 'siyuan-block',
      sourceDocId: 'doc-status',
      rootDocId: 'doc-status',
      rootKind: 'ordinary-doc',
      sourceBlockId: 'source-status-1',
      sourceBlockIds: ['source-status-1'],
      logicalParentId: 'doc-status',
      logicalParentType: 'root-doc',
    };
    const payloadIdentity = buildProgressiveContentPayloadIdentity({
      sourceBlockIds: ['source-status-1'],
      selectedText: 'Focus text',
      contentDom: '<p>Focus text</p>',
      sourceBlocks: rows,
    });

    await expect(service.inspectProgressiveSource({
      lineage,
      payloadIdentity,
      selectedText: 'Focus text',
      contentDom: '<p>Focus text</p>',
    })).resolves.toEqual(expect.objectContaining({
      status: 'current',
      missingBlockIds: [],
      detachedBlockIds: [],
    }));

    rows = [
      { id: 'source-status-1', root_id: 'doc-status', parent_id: 'doc-status', box: 'notebook-a', type: 'p', content: 'Changed text', markdown: 'Changed text' },
    ];
    await expect(service.inspectProgressiveSource({
      lineage,
      payloadIdentity,
      selectedText: 'Focus text',
      contentDom: '<p>Focus text</p>',
    })).resolves.toEqual(expect.objectContaining({
      status: 'stale',
      diagnostics: ['stale-source-payload'],
    }));

    rows = [];
    await expect(service.inspectProgressiveSource({
      lineage,
      payloadIdentity,
      selectedText: 'Focus text',
      contentDom: '<p>Focus text</p>',
    })).resolves.toEqual(expect.objectContaining({
      status: 'missing',
      missingBlockIds: ['source-status-1'],
    }));

    rows = [
      { id: 'source-status-1', root_id: 'other-doc', parent_id: 'other-doc', box: 'notebook-a', type: 'p', content: 'Focus text', markdown: 'Focus text' },
    ];
    await expect(service.inspectProgressiveSource({
      lineage,
      payloadIdentity,
      selectedText: 'Focus text',
      contentDom: '<p>Focus text</p>',
    })).resolves.toEqual(expect.objectContaining({
      status: 'detached',
      detachedBlockIds: ['source-status-1'],
    }));

    expect(port.updateDomBlock).not.toHaveBeenCalled();
    expect(port.setBlockAttrs).not.toHaveBeenCalled();
  });

  it('creates split-piece excerpts as child excerpt documents without writing Daily Notes trace', async () => {
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
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/reading/article/01 Intro/Piece text'")) {
          return [
            { id: 'excerpt-doc-old-1', content: 'Piece text' },
          ];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/reading/article/01 Intro/Piece text 2'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-2')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockKramdown: vi.fn(async () => ({
        kramdown: 'Before Piece text after',
      })),
      createDocWithMarkdown: vi.fn().mockResolvedValueOnce('excerpt-doc-2'),
    });
    const cardService = createCardServiceMock();
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'piece-block-1',
      selectedText: 'Piece text',
      origin: 'review',
      currentCardId: 'card-piece-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-2',
      excerptEntityType: 'doc',
      sourceBlockId: 'piece-block-1',
      sourceBlockIds: ['piece-block-1'],
      containerDocId: 'excerpt-doc-2',
      recordId: expect.any(String),
      colorApplied: false,
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(port.createDocWithMarkdown).toHaveBeenNthCalledWith(
      1,
      'notebook-a',
      '/reading/article/01 Intro/Piece text 2',
      '',
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('Piece text'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('data-type="block-ref"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('data-id="piece-block-1"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-2',
      expect.stringContaining('>*</span>'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.appendMarkdownBlock).not.toHaveBeenCalled();
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-2', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'piece-1',
      'custom-fsrs-reading-source-block-id': 'piece-block-1',
    }));
    const excerptAttrsCall = vi.mocked(port.setBlockAttrs).mock.calls.find(([blockId]) => blockId === 'excerpt-doc-2');
    expect(excerptAttrsCall?.[1]).not.toHaveProperty('custom-fsrs-reading-session-id');
    expect(excerptAttrsCall?.[1]).not.toHaveProperty('custom-fsrs-reading-mode');
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-doc-2',
          sourceSemantics: expect.objectContaining({
            sourceLineage: expect.objectContaining({
              sessionId: 'session-1',
              mode: 'linear',
              pieceDocId: 'piece-1',
              sourceDocId: 'piece-1',
              sourceBlockId: 'piece-block-1',
            }),
          }),
        }),
      ],
    }));
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();

    const stored = fileService.getStored() as typeof initialState;
    expect(stored.sessions['session-1'].pieces[0]).toEqual(expect.objectContaining({
      pieceDocId: 'piece-1',
      topicCardId: 'card-piece-1',
    }));
    expect(stored.sessions['session-1'].pieces[0]).not.toHaveProperty('workbenchDocId');
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      version: 1,
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-doc-2',
          sourceDocId: 'piece-1',
          sourceBlockId: 'piece-block-1',
          completionStatus: 'pending',
        }),
      ],
    }));
  });

  it('allows repeated excerpts from the same normalized source text', async () => {
    const fileService = createFileServiceMock();
    const recordService = new ExcerptRecordService(fileService);
    await recordService.createOrRejectDuplicate({
      sourceDocId: 'doc-ordinary',
      sourceBlockId: 'source-dup-1',
      selectedText: 'Focus text',
      origin: 'editor',
      createExcerpt: async () => ({
        excerptEntityId: 'excerpt-existing-1',
        excerptEntityType: 'doc' as const,
      }),
    });

    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => ({
        id: docId,
        box: 'notebook-a',
        path: '/reading/ordinary.sy',
        hpath: '/reading/ordinary',
        name: 'Ordinary',
      })),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-dup-1'")) {
          return [
            { id: 'source-dup-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Before Focus text after', markdown: 'Before Focus text after' },
          ];
        }
        if (stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-created-2'),
      updateDomBlock: vi.fn(async () => 'excerpt-content-created-2'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-dup-1',
      selectedText: 'Focus text',
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-created-2',
      sourceBlockId: 'source-dup-1',
      sourceBlockIds: ['source-dup-1'],
    }));
    expect(port.createDocWithMarkdown).toHaveBeenCalledTimes(1);
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-created-2',
      expect.stringContaining('Focus text'),
    );
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-created-2',
          sourceBlockId: 'source-dup-1',
          normalizedFingerprint: 'Focus text',
          completionStatus: 'pending',
        }),
        expect.objectContaining({
          excerptEntityId: 'excerpt-existing-1',
          sourceBlockId: 'source-dup-1',
          normalizedFingerprint: 'Focus text',
        }),
      ],
    }));
  });

  it('rejects excerpt sources without root or notebook identity before creating artifacts', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id = 'source-missing-root-1'")) {
          return [
            { id: 'source-missing-root-1', root_id: '', parent_id: '', box: '', type: 'p', content: 'Focus text', markdown: 'Focus text' },
          ];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-should-not-exist'),
      appendDomBlock: vi.fn(async () => 'block-should-not-exist'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.createExcerptFromSelection({
      sourceBlockId: 'source-missing-root-1',
      selectedText: 'Focus text',
      origin: 'editor',
    })).rejects.toThrow('无法解析摘抄来源块');

    expect(port.createDocWithMarkdown).not.toHaveBeenCalled();
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.setBlockAttrs).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toBeUndefined();
  });

  it('does not persist records or cards when source-child excerpt doc creation cannot be located', async () => {
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
        if (stmt.includes("WHERE id = 'source-create-fail-1'")) {
          return [
            { id: 'source-create-fail-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Focus text', markdown: 'Focus text' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (stmt.includes("WHERE type = 'd'") && stmt.includes("hpath = '/reading/ordinary/Focus text'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => ''),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    await expect(service.createExcerptFromSelection({
      sourceBlockId: 'source-create-fail-1',
      selectedText: 'Focus text',
      origin: 'editor',
    })).rejects.toThrow('子文档创建后无法定位');

    expect(port.createDocWithMarkdown).toHaveBeenCalledTimes(1);
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.setBlockAttrs).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toBeUndefined();
  });

  it('does not write any Daily Notes trace by default while still creating excerpt docs', async () => {
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
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-plain-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-plain-1'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-plain-1',
      selectedText: 'Focus',
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-plain-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'source-plain-1',
      sourceBlockIds: ['source-plain-1'],
      containerDocId: 'excerpt-doc-plain-1',
      recordId: expect.any(String),
      colorApplied: false,
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(port.createDocWithMarkdown).toHaveBeenCalledTimes(1);
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/ordinary/Focus',
      '',
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-plain-1',
      expect.stringContaining('data-id="source-plain-1"'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalled();
    expect(port.appendMarkdownBlock).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
  });

  it('returns created excerpt before Topic card completion', async () => {
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
        if (stmt.includes("WHERE id = 'source-fast-1'")) {
          return [
            { id: 'source-fast-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Fast beta', markdown: 'Alpha Fast beta' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-fast-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-fast-1'),
    });
    const cardService = createCardServiceMock();
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    vi.mocked(cardService.service.createCard).mockImplementation(async () => {
      throw new Error('foreground card completion should not run');
    });
    const excerptCompletionService = {
      enqueue: vi.fn(async (record: ExcerptRecord) => ({
        status: 'completed' as const,
        recordId: record.recordId,
        topicCardId: 'card-bg-1',
        created: true,
      })),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      excerptCompletionService,
    );

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-fast-1',
      selectedText: 'Fast',
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-fast-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'source-fast-1',
      sourceBlockIds: ['source-fast-1'],
      containerDocId: 'excerpt-doc-fast-1',
      recordId: expect.any(String),
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(excerptCompletionService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      excerptEntityId: 'excerpt-doc-fast-1',
      completionStatus: 'pending',
    }));
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });

  it('shows a failure message when background excerpt completion fails immediately', async () => {
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
        if (stmt.includes("WHERE id = 'source-completion-fail-1'")) {
          return [
            { id: 'source-completion-fail-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Fail beta', markdown: 'Alpha Fail beta' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-completion-fail-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-completion-fail-1'),
    });
    const cardService = createCardServiceMock();
    const excerptCompletionService = {
      enqueue: vi.fn(async (record: ExcerptRecord) => ({
        status: 'failed' as const,
        recordId: record.recordId,
        error: 'card write failed',
      })),
    };
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      excerptCompletionService,
    );

    await expect(service.createExcerptFromSelection({
      sourceBlockId: 'source-completion-fail-1',
      selectedText: 'Fail',
      origin: 'editor',
    })).resolves.toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-completion-fail-1',
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(port.pushErrMsg).toHaveBeenCalledWith('摘录已创建，但制卡未完成，可稍后重试');
  });

  it('treats explicit source-child excerpt storage as source-adjacent even when notebook fields are present', async () => {
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
        if (stmt.includes("WHERE id = 'source-source-child-1'")) {
          return [
            { id: 'source-source-child-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Focus beta', markdown: 'Alpha Focus beta' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-source-child-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-source-child-1'),
    });
    const cardService = createCardServiceMock();
    const configuredCaptureStorageService = createConfiguredCaptureStorageServiceMock({
      hasExplicitConfiguration: vi.fn(() => true),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock({
        storage: {
          mode: 'source-child',
          notebookId: 'library-box',
          targetBlockId: 'library-parent-1',
        },
      }),
      configuredCaptureStorageService,
    );

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-source-child-1',
      selectedText: 'Focus',
      origin: 'editor',
    });

    expect(result.kind).toBe('created');
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/ordinary/Focus',
      '',
    );
    expect(configuredCaptureStorageService.resolveLibraryTarget).not.toHaveBeenCalled();
    expect(configuredCaptureStorageService.resolveDailyNoteTarget).not.toHaveBeenCalled();
  });

  it('creates multi-block library excerpts with preserved rich content and only the first visible source ref', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => {
        if (docId === 'source-rich-1') {
          return {
            id: 'source-rich-1',
            box: 'notebook-a',
            path: '/reading/ordinary.sy',
            hpath: '/reading/ordinary',
            name: 'Ordinary',
          };
        }
        return {
          id: docId,
          box: 'library-box',
          path: '/SiYuanMemo Topic 库.sy',
          hpath: '/SiYuanMemo Topic 库',
          name: 'SiYuanMemo Topic 库',
        };
      }),
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes("WHERE id IN ('source-rich-1', 'source-rich-2')")) {
          return [
            { id: 'source-rich-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Link', markdown: 'Alpha Link', sort: '1' },
            { id: 'source-rich-2', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Beta', markdown: 'Beta', sort: '2' },
          ];
        }
        if (stmt.includes("WHERE id = 'source-rich-1'")) {
          return [
            { id: 'source-rich-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Link Beta', markdown: 'Alpha Link Beta' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-rich-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-rich-1'),
    });
    const cardService = createCardServiceMock();
    const configuredCaptureStorageService = createConfiguredCaptureStorageServiceMock({
      hasExplicitConfiguration: vi.fn(() => true),
      resolveLibraryTarget: vi.fn(async () => ({
        notebookId: 'library-box',
        containerDocId: 'library-root-1',
        parentBlockId: 'library-root-1',
        parentDoc: {
          id: 'library-root-1',
          box: 'library-box',
          path: '/SiYuanMemo Topic 库.sy',
          hpath: '/SiYuanMemo Topic 库',
          name: 'SiYuanMemo Topic 库',
        },
        targetKind: 'root-doc' as const,
      })),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock({
        storage: {
          mode: 'library',
          notebookId: 'library-box',
          targetBlockId: '',
        },
      }),
      configuredCaptureStorageService,
    );

    const contentDom = [
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="a" data-href="https://example.com">Markdown Link</span> <span data-type="block-ref" data-id="20240101010101-abcdefg">Ref</span> <span data-type="a" data-href="assets/paper.pdf">Asset</span> <span data-type="a" data-href="siyuan://blocks/20240101010101-abcdefg">Siyuan</span> <span data-type="tag">#token#</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    ].join('');

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-rich-1',
      sourceBlockIds: ['source-rich-1', 'source-rich-2'],
      selectedText: 'Alpha Markdown Link Ref Asset Siyuan #token#\nBeta',
      contentDom,
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-rich-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'source-rich-1',
      sourceBlockIds: ['source-rich-1', 'source-rich-2'],
      containerDocId: 'library-root-1',
    }));
    expect(configuredCaptureStorageService.resolveLibraryTarget).toHaveBeenCalledTimes(1);
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-type="a"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-type="block-ref"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-href="assets/paper.pdf"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-href="siyuan://blocks/20240101010101-abcdefg"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-type="tag"'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-id="source-rich-1"'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalledWith(
      'excerpt-doc-rich-1',
      expect.stringContaining('data-id="source-rich-2"'),
    );
    expect(cardService.service.createCard).not.toHaveBeenCalled();
  });

  it('creates multi-block daily-note excerpts as ordinary blocks with only the first visible source ref', async () => {
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
        if (stmt.includes("WHERE id IN ('source-daily-1', 'source-daily-2')")) {
          return [
            { id: 'source-daily-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Link', markdown: 'Alpha Link', sort: '1' },
            { id: 'source-daily-2', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Beta', markdown: 'Beta', sort: '2' },
          ];
        }
        if (stmt.includes("WHERE id = 'source-daily-1'")) {
          return [
            { id: 'source-daily-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Alpha Link Beta', markdown: 'Alpha Link Beta' },
          ];
        }
        if (stmt.includes("WHERE b.parent_id = 'daily-doc-1'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      appendMarkdownBlock: vi.fn(async () => 'daily-root-1'),
      appendDomBlock: vi.fn(async () => 'excerpt-block-1'),
    });
    const cardService = createCardServiceMock();
    const configuredCaptureStorageService = createConfiguredCaptureStorageServiceMock({
      hasExplicitConfiguration: vi.fn(() => true),
      resolveDailyNoteTarget: vi.fn(async () => ({
        notebookId: 'daily-box',
        containerDocId: 'daily-doc-1',
      })),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock({
        storage: {
          mode: 'daily-note',
          notebookId: 'daily-box',
          targetBlockId: '',
        },
      }),
      configuredCaptureStorageService,
    );

    const contentDom = [
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="a" data-href="https://example.com">Link</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    ].join('');

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-daily-1',
      sourceBlockIds: ['source-daily-1', 'source-daily-2'],
      selectedText: 'Alpha Link\nBeta',
      contentDom,
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-block-1',
      excerptEntityType: 'block',
      sourceBlockId: 'source-daily-1',
      sourceBlockIds: ['source-daily-1', 'source-daily-2'],
      containerDocId: 'daily-doc-1',
    }));
    expect(configuredCaptureStorageService.resolveDailyNoteTarget).toHaveBeenCalledTimes(1);
    expect(port.appendMarkdownBlock).toHaveBeenCalledWith(
      'daily-doc-1',
      expect.stringContaining('##'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'daily-root-1',
      expect.not.stringContaining('NodeSuperBlock'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'daily-root-1',
      expect.stringContaining('data-type="a"'),
    );
    expect(port.appendDomBlock).toHaveBeenCalledWith(
      'daily-root-1',
      expect.stringContaining('data-id="source-daily-1"'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalledWith(
      'daily-root-1',
      expect.stringContaining('data-id="source-daily-2"'),
    );
    expect(cardService.service.createCard).not.toHaveBeenCalled();
  });

  it('keeps a single-source super block without adding a second daily-note wrapper', async () => {
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
        if (stmt.includes("WHERE id = 'source-super-1'")) {
          return [
            { id: 'source-super-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 's', content: 'Source super block', markdown: 'Source super block' },
          ];
        }
        if (stmt.includes("WHERE b.parent_id = 'daily-doc-1'")) {
          return [];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      appendMarkdownBlock: vi.fn(async () => 'daily-root-1'),
      appendDomBlock: vi.fn(async () => 'excerpt-block-1'),
    });
    const cardService = createCardServiceMock();
    const configuredCaptureStorageService = createConfiguredCaptureStorageServiceMock({
      hasExplicitConfiguration: vi.fn(() => true),
      resolveDailyNoteTarget: vi.fn(async () => ({
        notebookId: 'daily-box',
        containerDocId: 'daily-doc-1',
      })),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock({
        storage: {
          mode: 'daily-note',
          notebookId: 'daily-box',
          targetBlockId: '',
        },
      }),
      configuredCaptureStorageService,
    );

    const materializedSuperBlockDom = [
      '<div data-type="NodeSuperBlock" class="sb" data-sb-layout="row">',
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      '<div class="protyle-attr" contenteditable="false">\u200b</div>',
      '</div>',
    ].join('');

    await service.createExcerptFromSelection({
      sourceBlockId: 'source-super-1',
      sourceBlockIds: ['source-super-1'],
      selectedText: 'Alpha\nBeta',
      contentDom: materializedSuperBlockDom,
      origin: 'editor',
    });

    const appendedDom = vi.mocked(port.appendDomBlock).mock.calls.find(([parentId]) => parentId === 'daily-root-1')?.[1];
    expect(typeof appendedDom).toBe('string');
    expect((String(appendedDom).match(/NodeSuperBlock/g) || [])).toHaveLength(1);
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
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-long-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-long-1'),
    });
    const cardService = createCardServiceMock();
    const service = createServiceUnderTest(port, fileService, cardService.service, createSettingsProviderMock());

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'source-long-1',
      selectedText: longSelection,
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-long-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'source-long-1',
      sourceBlockIds: ['source-long-1'],
      containerDocId: 'excerpt-doc-long-1',
      recordId: expect.any(String),
      colorApplied: false,
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(port.createDocWithMarkdown).toHaveBeenCalledWith(
      'notebook-a',
      '/reading/ordinary/人的思考并不只发生在大…',
      '',
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-long-1',
      expect.stringContaining('人的思考并不只发生在大脑里'),
    );
    expect(port.updateDomBlock).toHaveBeenCalledWith(
      'excerpt-doc-long-1',
      expect.stringContaining('而是分布在工具、符号与制度之间'),
    );
    expect(port.appendDomBlock).not.toHaveBeenCalled();
  });

  it('creates nested excerpt topics inside excerpt docs with parent lineage and native Riff sync', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => {
        if (docId === 'excerpt-doc-root-1') {
          return {
            id: 'excerpt-doc-root-1',
            box: 'notebook-a',
            path: '/reading/ordinary/[摘录 001] Root.sy',
            hpath: '/reading/ordinary/[摘录 001] Root',
            name: '[摘录 001] Root',
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
        if (stmt.includes("WHERE id = 'excerpt-child-source-1'")) {
          return [
            { id: 'excerpt-child-source-1', root_id: 'excerpt-doc-root-1', parent_id: 'excerpt-doc-root-1', box: 'notebook-a', type: 'p', content: 'Nested focus line', markdown: 'Nested focus line' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'excerpt-doc-root-1'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-child-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === 'excerpt-doc-root-1') {
          return {
            'custom-fsrs-reading-kind': 'excerpt-doc',
            'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
            'custom-fsrs-reading-source-block-id': 'source-root-1',
          };
        }
        return {};
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-child-1'),
    });
    const cardService = createCardServiceMock([
      { id: 'topic-card-excerpt-root-1', blockId: 'excerpt-doc-root-1', type: 'topic' },
    ]);
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    const result = await service.createExcerptFromSelection({
      sourceBlockId: 'excerpt-child-source-1',
      selectedText: 'Nested focus line',
      origin: 'editor',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-child-1',
      excerptEntityType: 'doc',
      sourceBlockId: 'excerpt-child-source-1',
      containerDocId: 'excerpt-doc-child-1',
    }));
    expect(result).not.toHaveProperty('topicCardId');
    expect(port.setBlockAttrs).toHaveBeenCalledWith('excerpt-doc-child-1', expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'excerpt-doc-root-1',
      'custom-fsrs-reading-source-block-id': 'excerpt-child-source-1',
      'custom-fsrs-reading-parent-topic-card-id': 'topic-card-excerpt-root-1',
      'custom-fsrs-reading-parent-excerpt-id': 'excerpt-doc-root-1',
    }));
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });

  it('creates nested excerpt topics inside topic docs without inventing parent excerpt lineage', async () => {
    const fileService = createFileServiceMock();
    const port = createProgressiveSiyuanPortMock({
      getDocInfo: vi.fn(async (docId: string) => {
        if (docId === 'topic-doc-root-1') {
          return {
            id: 'topic-doc-root-1',
            box: 'notebook-a',
            path: '/reading/topic-doc.sy',
            hpath: '/reading/topic-doc',
            name: 'Topic Doc',
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
        if (stmt.includes("WHERE id = 'topic-doc-source-1'")) {
          return [
            { id: 'topic-doc-source-1', root_id: 'topic-doc-root-1', parent_id: 'topic-doc-root-1', box: 'notebook-a', type: 'p', content: 'Topic child excerpt', markdown: 'Topic child excerpt' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'topic-doc-root-1'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'topic-doc-excerpt-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      getBlockAttrs: vi.fn(async () => ({})),
      createDocWithMarkdown: vi.fn(async () => 'topic-doc-excerpt-1'),
    });
    const cardService = createCardServiceMock([
      { id: 'topic-card-root-1', blockId: 'topic-doc-root-1', type: 'topic' },
    ]);
    const nativeRiffApi = createProgressiveNativeRiffPortMock();
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    await service.createExcerptFromSelection({
      sourceBlockId: 'topic-doc-source-1',
      selectedText: 'Topic child excerpt',
      origin: 'editor',
    });

    const setAttrsCall = vi.mocked(port.setBlockAttrs).mock.calls.find(([blockId]) => blockId === 'topic-doc-excerpt-1');
    expect(setAttrsCall?.[1]).toEqual(expect.objectContaining({
      'custom-fsrs-reading-kind': 'excerpt-doc',
      'custom-fsrs-reading-source-doc-id': 'topic-doc-root-1',
      'custom-fsrs-reading-source-block-id': 'topic-doc-source-1',
      'custom-fsrs-reading-parent-topic-card-id': 'topic-card-root-1',
    }));
    expect(setAttrsCall?.[1]).not.toHaveProperty('custom-fsrs-reading-parent-excerpt-id');
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });

  it('keeps split piece documents and local cards when native Riff is unavailable', async () => {
    const fileService = createFileServiceMock();
    const sql = createSplitTreeSqlMock([
      { id: 'h1-intro', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Intro', markdown: '# Intro', sort: '001' },
      { id: 'intro-body', root_id: 'doc-1', parent_id: 'h1-intro', type: 'p', content: 'Intro body', markdown: 'Intro body', sort: '001' },
      { id: 'h1-next', root_id: 'doc-1', parent_id: 'doc-1', type: 'h', subtype: 'h1', content: 'Next', markdown: '# Next', sort: '002' },
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
        if (blockId === 'intro-body') {
          return 'Intro body';
        }
        if (blockId === 'next-body') {
          return 'Next body';
        }
        throw new Error(`Unexpected block copy: ${blockId}`);
      }),
      createDocWithMarkdown: vi.fn()
        .mockResolvedValueOnce('piece-1')
        .mockResolvedValueOnce('piece-2'),
    });
    const cardService = createCardServiceMock();
    const nativeRiffApi = createProgressiveNativeRiffPortMock({
      addRiffCards: vi.fn(async () => {
        throw new Error('native riff failed');
      }),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    await expect(service.splitDocument('doc-1', 'linear')).resolves.toEqual(expect.objectContaining({
      pieceDocIds: ['piece-1', 'piece-2'],
    }));

    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
    expect(cardService.service.deleteCard).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalledWith('piece-1');
    expect(port.deleteBlock).not.toHaveBeenCalledWith('piece-2');
    expect(fileService.writeJSON).toHaveBeenCalled();
  });

  it('does not put native Riff registration on the excerpt foreground path', async () => {
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
        if (stmt.includes("WHERE id = 'source-riff-fail-1'")) {
          return [
            { id: 'source-riff-fail-1', root_id: 'doc-ordinary', parent_id: 'doc-ordinary', box: 'notebook-a', type: 'p', content: 'Focus text', markdown: 'Focus text' },
          ];
        }
        if (stmt.includes("a0.value = 'excerpt-doc'") && stmt.includes("a1.value = 'doc-ordinary'")) {
          return [];
        }
        if (isDirectChildCleanupSql(stmt, 'excerpt-doc-riff-fail-1')) {
          return [];
        }
        if (isDocHPathLookupSql(stmt)) {
          return [];
        }
        throw new Error(`Unexpected SQL: ${stmt}`);
      }),
      createDocWithMarkdown: vi.fn(async () => 'excerpt-doc-riff-fail-1'),
    });
    const cardService = createCardServiceMock();
    const nativeRiffApi = createProgressiveNativeRiffPortMock({
      addRiffCards: vi.fn(async () => {
        throw new Error('native riff failed');
      }),
    });
    const service = createServiceUnderTest(
      port,
      fileService,
      cardService.service,
      createSettingsProviderMock(),
      undefined,
      nativeRiffApi,
    );

    await expect(service.createExcerptFromSelection({
      sourceBlockId: 'source-riff-fail-1',
      selectedText: 'Focus text',
      origin: 'editor',
    })).resolves.toEqual(expect.objectContaining({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-riff-fail-1',
    }));

    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(cardService.service.deleteCard).not.toHaveBeenCalled();
    expect(port.deleteBlock).not.toHaveBeenCalledWith('excerpt-doc-riff-fail-1');
    expect(fileService.getStored(EXCERPT_RECORD_STORAGE_KEY)).toEqual(expect.objectContaining({
      records: [
        expect.objectContaining({
          excerptEntityId: 'excerpt-doc-riff-fail-1',
          completionStatus: 'pending',
        }),
      ],
    }));
  });
});
