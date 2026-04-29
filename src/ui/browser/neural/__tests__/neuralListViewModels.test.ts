import { describe, expect, it } from 'vitest';
import {
  toNeuralAnchorListEntries,
  toNeuralHistoryListEntries,
  toNeuralSourceListEntries,
} from '../neuralListViewModels';

describe('neuralListViewModels', () => {
  it('sorts history entries, marks current/selected/anchor state, and reuses injected repeat counts', () => {
    const entries = [
      { eventId: 'event-old', nodeId: 'node-a', visitedAt: 10, nodePreview: 'A' },
      { eventId: 'event-new', nodeId: 'node-b', visitedAt: 30, nodePreview: 'B' },
    ] as never[];

    const result = toNeuralHistoryListEntries(entries, {
      anchorIds: new Set(['node-b']),
      currentNodeId: 'node-a',
      selectedEventId: 'event-new',
      getRepeatHitCount: (nodeId) => nodeId === 'node-b' ? 3 : 1,
    });

    expect(result.map((entry) => entry.eventId)).toEqual(['event-new', 'event-old']);
    expect(result[0]).toMatchObject({
      eventId: 'event-new',
      isAnchored: true,
      isCurrent: false,
      isSelected: true,
      repeatHitCount: 3,
    });
    expect(result[1]).toMatchObject({
      eventId: 'event-old',
      isAnchored: false,
      isCurrent: true,
      isSelected: false,
      repeatHitCount: 1,
    });
  });

  it('projects source entries with current state only', () => {
    const result = toNeuralSourceListEntries([
      { nodeId: 'node-a', visitedAt: 10, nodePreview: 'A' },
      { nodeId: 'node-b', visitedAt: 20, nodePreview: 'B' },
    ] as never[], { currentNodeId: 'node-a' });

    expect(result.map((entry) => [entry.nodeId, entry.isCurrent])).toEqual([
      ['node-b', false],
      ['node-a', true],
    ]);
  });

  it('projects anchors with current and in-history state', () => {
    const result = toNeuralAnchorListEntries([
      { nodeId: 'node-a', visitedAt: 10, nodePreview: 'A' },
      { nodeId: 'node-b', visitedAt: 20, nodePreview: 'B' },
    ] as never[], {
      currentNodeId: 'node-b',
      historyNodeIds: new Set(['node-a']),
    });

    expect(result.map((entry) => [entry.nodeId, entry.isCurrent, entry.inHistory])).toEqual([
      ['node-b', true, false],
      ['node-a', false, true],
    ]);
  });
});
