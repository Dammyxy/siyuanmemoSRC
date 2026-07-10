import { describe, expect, it } from 'vitest';
import {
  classifyTransactionBatch,
  shouldDispatchAutoCard,
  shouldDispatchKernelTransactionIngest,
} from '../transaction-classifier';
import type { Transaction } from '../transaction-types';

function tx(doOperations: Transaction['doOperations']): Transaction {
  return {
    doOperations,
    undoOperations: null,
  };
}

describe('transaction classifier', () => {
  it('classifies ordinary inspectable edits as no-op for SiYuanMemo consumers', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'update',
          id: 'block-plain',
          data: {
            new: {
              content: 'ordinary paragraph without quick-card markers',
            },
          },
        },
      ]),
    ]);

    expect(classification.transactionCount).toBe(1);
    expect(classification.operationCount).toBe(1);
    expect(classification.changedBlockIds).toEqual(['block-plain']);
    expect(classification.actionClasses).toEqual(['update']);
    expect(classification.autoCard.prefilteredNoOpCount).toBe(1);
    expect(classification.autoCard.candidateOperations).toEqual([]);
    expect(classification.documentTree.hasHint).toBe(false);
    expect(classification.hasSiYuanMemoSignal).toBe(false);
    expect(shouldDispatchKernelTransactionIngest(classification)).toBe(false);
    expect(shouldDispatchAutoCard(classification)).toBe(false);
  });

  it('classifies SiYuan HTML payloads stored directly in operation data as inspectable no-op edits', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'update',
          id: 'block-html',
          data: '<div data-node-id="block-html" data-type="NodeParagraph"><div contenteditable="true">ordinary edited line without markers</div></div>',
        },
      ]),
    ]);

    expect(classification.changedBlockIds).toEqual(['block-html']);
    expect(classification.autoCard.prefilteredNoOpCount).toBe(1);
    expect(classification.autoCard.candidateOperations).toEqual([]);
    expect(classification.hasSiYuanMemoSignal).toBe(false);
    expect(shouldDispatchKernelTransactionIngest(classification)).toBe(false);
    expect(shouldDispatchAutoCard(classification)).toBe(false);
  });

  it('dedupes changed ids and records AutoCard marker evidence without content text', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'insert',
          id: 'block-marker',
          parentID: 'doc-1',
          data: {
            new: {
              markdown: 'Prompt >> Answer',
            },
          },
        },
        {
          action: 'insert',
          id: 'block-marker',
          data: {
            new: {
              content: 'Prompt >> Answer',
            },
          },
        },
      ]),
    ]);

    expect(classification.changedBlockIds).toEqual(['block-marker', 'doc-1']);
    expect(classification.autoCard.hasMarkerEvidence).toBe(true);
    expect(classification.autoCard.candidateOperations).toEqual([
      {
        action: 'insert',
        blockId: 'block-marker',
        evidence: 'marker',
        opId: 'block-marker',
      },
    ]);
    expect(JSON.stringify(classification)).not.toContain('Prompt >> Answer');
    expect(shouldDispatchKernelTransactionIngest(classification)).toBe(true);
    expect(shouldDispatchAutoCard(classification)).toBe(true);
  });

  it('detects AutoCard markers in SiYuan HTML payloads stored directly in operation data', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'insert',
          id: 'block-html-marker',
          data: '<div data-node-id="block-html-marker" data-type="NodeParagraph"><div contenteditable="true">Prompt &gt;&gt; Answer</div></div>',
        },
      ]),
    ]);

    expect(classification.autoCard.hasMarkerEvidence).toBe(true);
    expect(classification.autoCard.candidateOperations).toEqual([
      {
        action: 'insert',
        blockId: 'block-html-marker',
        evidence: 'marker',
        opId: 'block-html-marker',
      },
    ]);
    expect(JSON.stringify(classification)).not.toContain('Prompt');
    expect(shouldDispatchKernelTransactionIngest(classification)).toBe(true);
    expect(shouldDispatchAutoCard(classification)).toBe(true);
  });

  it('preserves bounded AutoCard maybe-scan for uninspectable insert/update operations', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'update',
          id: 'block-unknown-payload',
          data: {},
        },
      ]),
    ]);

    expect(classification.autoCard.candidateOperations).toEqual([
      {
        action: 'update',
        blockId: 'block-unknown-payload',
        evidence: 'maybe-scan',
        opId: 'block-unknown-payload',
      },
    ]);
    expect(classification.hasSiYuanMemoSignal).toBe(true);
  });

  it('extracts document-tree hints from document block operations', () => {
    const classification = classifyTransactionBatch([
      tx([
        {
          action: 'move',
          id: 'doc-1',
          parentID: 'notebook-root',
          data: {
            old: { type: 'd' },
            new: { type: 'd' },
          },
        },
      ]),
    ]);

    expect(classification.documentTree.hasHint).toBe(true);
    expect(classification.documentTree.touchedBlockIds).toEqual(['doc-1', 'notebook-root']);
    expect(classification.hasSiYuanMemoSignal).toBe(true);
  });
});
