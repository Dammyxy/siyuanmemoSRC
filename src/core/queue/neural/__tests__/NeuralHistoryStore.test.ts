import { describe, expect, it } from 'vitest';
import { NeuralHistoryStore } from '../NeuralHistoryStore';
import type { NeuralRoamHistoryEntry } from '@/types/unified-data-source';

function historyEntry(
  eventId: string,
  nodeId: string,
  sessionId = 'session-1',
  visitedAt = 100,
): NeuralRoamHistoryEntry {
  return {
    eventId,
    nodeId,
    focusId: 'focus-1',
    sessionId,
    associationType: 'focus',
    reason: 'focus',
    visitedAt,
    isVirtual: false,
    nodePreview: `${nodeId} preview`,
    traceQuality: 'exact',
    engineMode: 'orbit',
    sourceRole: 'orbit-center',
    origin: null,
    sourceNodeId: null,
    sourceEventId: null,
    branchRootNodeId: 'focus-1',
    activationKind: 'focus-root',
    depth: null,
    conductionScore: null,
  };
}

describe('NeuralHistoryStore', () => {
  it('evicts the oldest entry while keeping event and node indexes in sync', () => {
    const store = new NeuralHistoryStore(3);

    store.append(historyEntry('event-1', 'node-a', 'session-1', 100));
    store.append(historyEntry('event-2', 'node-b', 'session-1', 200));
    store.append(historyEntry('event-3', 'node-a', 'session-1', 300));
    store.append(historyEntry('event-4', 'node-c', 'session-1', 400));

    expect(store.toArray().map((entry) => entry.eventId)).toEqual(['event-2', 'event-3', 'event-4']);
    expect(store.findByEventId('event-1')).toBeNull();
    expect(store.findByEventId('event-3')?.nodeId).toBe('node-a');
    expect(store.getEntriesByNodeId('node-a').map((entry) => entry.eventId)).toEqual(['event-3']);
    expect(store.getHitCount('node-a')).toBe(1);
    expect(store.getCount()).toBe(3);
  });

  it('returns newest-first pages and supports session-filtered pagination', () => {
    const store = new NeuralHistoryStore(10);

    store.append(historyEntry('event-1', 'node-a', 'session-1', 100));
    store.append(historyEntry('event-2', 'node-b', 'session-2', 200));
    store.append(historyEntry('event-3', 'node-c', 'session-1', 300));
    store.append(historyEntry('event-4', 'node-d', 'session-1', 400));

    expect(store.getCount('session-1')).toBe(3);
    expect(store.getPage({ offset: 0, limit: 2 })).toEqual({
      entries: [
        historyEntry('event-4', 'node-d', 'session-1', 400),
        historyEntry('event-3', 'node-c', 'session-1', 300),
      ],
      totalCount: 4,
      hasMore: true,
    });
    expect(store.getPage({ offset: 1, limit: 2, sessionId: 'session-1' })).toEqual({
      entries: [
        historyEntry('event-3', 'node-c', 'session-1', 300),
        historyEntry('event-1', 'node-a', 'session-1', 100),
      ],
      totalCount: 3,
      hasMore: false,
    });
  });

  it('removes one session without leaving stale node hit counts behind', () => {
    const store = new NeuralHistoryStore(10);

    store.append(historyEntry('event-1', 'node-a', 'session-1', 100));
    store.append(historyEntry('event-2', 'node-b', 'session-2', 200));
    store.append(historyEntry('event-3', 'node-a', 'session-1', 300));

    store.removeBySession('session-1');

    expect(store.toArray().map((entry) => entry.eventId)).toEqual(['event-2']);
    expect(store.getCount()).toBe(1);
    expect(store.getCount('session-1')).toBe(0);
    expect(store.findByEventId('event-1')).toBeNull();
    expect(store.getEntriesByNodeId('node-a')).toEqual([]);
    expect(store.getHitCount('node-a')).toBe(0);

    store.clear();
    expect(store.getCount()).toBe(0);
    expect(store.getPage({ offset: 0, limit: 5 })).toEqual({
      entries: [],
      totalCount: 0,
      hasMore: false,
    });
  });
});
