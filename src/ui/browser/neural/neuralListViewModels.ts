import type {
  NeuralRoamAnchorEntry,
  NeuralRoamHistoryEntry,
  NeuralRoamSourceEntry,
} from '@/types/unified-data-source';
import type {
  NeuralAnchorListEntry,
  NeuralListEntry,
  NeuralSourceListEntry,
} from './types';

export function toNeuralHistoryListEntries(
  entries: NeuralRoamHistoryEntry[],
  options?: {
    anchorIds?: Set<string>;
    currentNodeId?: string | null;
    selectedEventId?: string | null;
    getRepeatHitCount?: (nodeId: string) => number;
  }
): NeuralListEntry[] {
  const anchorIds = options?.anchorIds ?? new Set<string>();
  const currentNodeId = options?.currentNodeId ?? null;
  const selectedEventId = options?.selectedEventId ?? null;
  const getRepeatHitCount = options?.getRepeatHitCount;
  const repeatHitCountByNodeId = getRepeatHitCount
    ? null
    : entries.reduce((map, entry) => {
      map.set(entry.nodeId, (map.get(entry.nodeId) ?? 0) + 1);
      return map;
    }, new Map<string, number>());

  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
      isAnchored: anchorIds.has(entry.nodeId),
      isSelected: selectedEventId ? entry.eventId === selectedEventId : false,
      repeatHitCount: getRepeatHitCount
        ? Math.max(1, getRepeatHitCount(entry.nodeId))
        : (repeatHitCountByNodeId?.get(entry.nodeId) ?? 1),
    }));
}

export function toNeuralSourceListEntries(
  entries: NeuralRoamSourceEntry[],
  options?: {
    currentNodeId?: string | null;
  }
): NeuralSourceListEntry[] {
  const currentNodeId = options?.currentNodeId ?? null;
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
    }));
}

export function toNeuralAnchorListEntries(
  entries: NeuralRoamAnchorEntry[],
  options?: {
    historyNodeIds?: Set<string>;
    currentNodeId?: string | null;
  }
): NeuralAnchorListEntry[] {
  const historyNodeIds = options?.historyNodeIds ?? new Set<string>();
  const currentNodeId = options?.currentNodeId ?? null;
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
      inHistory: historyNodeIds.has(entry.nodeId),
    }));
}
