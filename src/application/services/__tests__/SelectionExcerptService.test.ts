import { describe, expect, it, vi } from 'vitest';
import { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type {
  ProgressiveContentPayloadIdentity,
  ProgressiveDisclosureState,
  ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';

function createSelection(overrides: Partial<ProgressiveExcerptSelectionSnapshot> = {}): ProgressiveExcerptSelectionSnapshot {
  const range = document.createRange();
  return {
    blockId: 'source-block-1',
    sourceBlockId: 'source-block-1',
    sourceBlockIds: ['source-block-1'],
    text: 'Selected [link](https://example.com)',
    contentDom: '<div data-node-id="source-block-1">Selected link</div>',
    range,
    blockSelections: [{
      blockId: 'source-block-1',
      mode: 'range',
      excerptHtml: '<div data-node-id="source-block-1">Selected link</div>',
      range: range.cloneRange(),
    }],
    commonElement: document.body,
    root: document.body,
    protyle: null,
    ...overrides,
  };
}

function createSourceSemantics() {
  const sourceLineage: ProgressiveSourceLineage = {
    version: 1,
    authority: 'siyuan-block',
    sourceDocId: 'source-doc-1',
    rootDocId: 'root-doc-1',
    rootKind: 'ordinary-doc',
    sourceBlockId: 'source-block-1',
    sourceBlockIds: ['source-block-1'],
    logicalParentId: 'root-doc-1',
    logicalParentType: 'root-doc',
    sessionId: 'session-1',
    mode: 'linear',
  };
  const payloadIdentity: ProgressiveContentPayloadIdentity = {
    version: 1,
    algorithm: 'fnv1a32',
    hash: 'payload-hash',
    sourceBlockIds: ['source-block-1'],
    textLength: 37,
    domLength: 48,
  };
  const disclosureState: ProgressiveDisclosureState = {
    version: 1,
    state: 'created',
    formalSchedulerMutation: false,
  };
  return { sourceLineage, payloadIdentity, disclosureState };
}

function createService(options: {
  contentDom?: string;
  creationResult?: unknown;
  prepareHighlight?: ReturnType<typeof vi.fn>;
  applyHighlight?: ReturnType<typeof vi.fn>;
} = {}) {
  const semantics = createSourceSemantics();
  const materializeExcerptSource = vi.fn(async (selection: ProgressiveExcerptSelectionSnapshot) => ({
    sourceBlockId: selection.sourceBlockId,
    sourceBlockIds: selection.sourceBlockIds,
    contentDom: options.contentDom ?? selection.contentDom,
    highlightSnapshot: selection,
    reused: false,
  }));
  const createExcerptFromSelection = vi.fn(async () => options.creationResult ?? ({
    kind: 'created' as const,
    excerptEntityId: 'excerpt-doc-1',
    excerptEntityType: 'doc' as const,
    topicCardId: 'topic-card-1',
    sourceBlockId: 'source-block-1',
    sourceBlockIds: ['source-block-1'],
    containerDocId: 'excerpt-doc-1',
    recordId: 'record-1',
    colorApplied: false,
    ...semantics,
  }));
  const updateSourceBlockDom = vi.fn(async () => undefined);
  const prepareHighlight = options.prepareHighlight ?? vi.fn(() => ({ blockId: 'source-block-1' }));
  const applyHighlight = options.applyHighlight ?? vi.fn(async (_prepared, applyOptions) => {
    await applyOptions.persistDomBlock('source-block-1', '<div data-node-id="source-block-1">Marked</div>');
    return true;
  });

  const service = new SelectionExcerptService({
    materializeExcerptSource,
    createExcerptFromSelection,
    updateSourceBlockDom,
  } as any, {
    prepareHighlight,
    applyHighlight,
  });

  return {
    service,
    semantics,
    materializeExcerptSource,
    createExcerptFromSelection,
    updateSourceBlockDom,
    prepareHighlight,
    applyHighlight,
  };
}

describe('SelectionExcerptService.executeSelectionExcerptAction', () => {
  it('creates an excerpt through the progressive write path and returns identity/source semantics only', async () => {
    const {
      service,
      semantics,
      createExcerptFromSelection,
      updateSourceBlockDom,
      prepareHighlight,
      applyHighlight,
    } = createService();

    const result = await service.executeSelectionExcerptAction({
      selection: createSelection(),
      origin: 'review',
      currentCardId: 'current-card-1',
      sourceMarkingEnabled: true,
    });

    expect(createExcerptFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected [link](https://example.com)',
      contentDom: '<div data-node-id="source-block-1">Selected link</div>',
      origin: 'review',
      currentCardId: 'current-card-1',
    });
    expect(prepareHighlight).toHaveBeenCalledTimes(1);
    expect(applyHighlight).toHaveBeenCalledTimes(1);
    expect(updateSourceBlockDom).toHaveBeenCalledWith('source-block-1', '<div data-node-id="source-block-1">Marked</div>');
    expect(result).toMatchObject({
      kind: 'created',
      excerptEntityId: 'excerpt-doc-1',
      topicCardId: 'topic-card-1',
      sourceBlockIds: ['source-block-1'],
      colorApplied: true,
      sourceMark: { enabled: true, colorApplied: true },
      preservation: { incomplete: false, diagnostics: [] },
      ...semantics,
    });
    expect(result).not.toHaveProperty('contentDom');
    expect(result).not.toHaveProperty('selectedText');
  });

  it('hard fails before creating when source marking is enabled but highlight preparation fails', async () => {
    const prepareHighlight = vi.fn(() => {
      throw new Error('planner down');
    });
    const { service, createExcerptFromSelection, applyHighlight } = createService({ prepareHighlight });

    await expect(service.executeSelectionExcerptAction({
      selection: createSelection(),
      origin: 'editor',
      sourceMarkingEnabled: true,
    })).rejects.toThrow('PROGRESSIVE_EXCERPT_HIGHLIGHT_UNAVAILABLE');

    expect(createExcerptFromSelection).not.toHaveBeenCalled();
    expect(applyHighlight).not.toHaveBeenCalled();
  });

  it('creates without preparing or applying a source mark when source marking is disabled', async () => {
    const { service, prepareHighlight, applyHighlight } = createService();

    const result = await service.executeSelectionExcerptAction({
      selection: createSelection(),
      origin: 'editor',
      sourceMarkingEnabled: false,
    });

    expect(result).toMatchObject({
      kind: 'created',
      colorApplied: false,
      sourceMark: {
        enabled: false,
        colorApplied: false,
      },
    });
    expect(prepareHighlight).not.toHaveBeenCalled();
    expect(applyHighlight).not.toHaveBeenCalled();
  });

  it('throws progressive command failures without applying local source-mark fallback', async () => {
    const createExcerptFromSelection = vi.fn(async () => {
      throw new Error('writer relay unavailable');
    });
    const prepareHighlight = vi.fn(() => ({ blockId: 'source-block-1' }));
    const applyHighlight = vi.fn(async () => true);
    const service = new SelectionExcerptService({
      materializeExcerptSource: vi.fn(async (selection: ProgressiveExcerptSelectionSnapshot) => ({
        sourceBlockId: selection.sourceBlockId,
        sourceBlockIds: selection.sourceBlockIds,
        contentDom: selection.contentDom,
        highlightSnapshot: selection,
        reused: false,
      })),
      createExcerptFromSelection,
      updateSourceBlockDom: vi.fn(async () => undefined),
    } as any, {
      prepareHighlight,
      applyHighlight,
    });

    await expect(service.executeSelectionExcerptAction({
      selection: createSelection(),
      origin: 'review',
      sourceMarkingEnabled: true,
    })).rejects.toThrow('writer relay unavailable');

    expect(prepareHighlight).toHaveBeenCalledTimes(1);
    expect(applyHighlight).not.toHaveBeenCalled();
  });

  it('keeps source-mark persistence failure separate from content preservation degradation', async () => {
    const { service } = createService({
      contentDom: '',
      applyHighlight: vi.fn(async () => false),
    });

    const result = await service.executeSelectionExcerptAction({
      selection: createSelection({ contentDom: '' }),
      origin: 'editor',
      sourceMarkingEnabled: true,
    });

    expect(result.kind).toBe('created');
    expect(result.colorApplied).toBe(false);
    expect(result.sourceMark.diagnostic?.code).toBe('source-mark-persist-failed');
    expect(result.preservation).toEqual({
      incomplete: true,
      diagnostics: ['missing-dom-preservation-evidence'],
    });
  });
});
