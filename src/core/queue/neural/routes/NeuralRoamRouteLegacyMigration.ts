import type { NeuralRoamHistoryEntry } from '@/types/unified-data-source';
import type { ConceptNeuralSessionState, FocusPoolPersistedEntry } from '../ConceptNeuralQueue';
import type { HyperspacePersistedEntry, HyperspaceSessionState } from '../hyperspace/HyperspaceEngine';
import {
  createDefaultRoute,
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  type NeuralRoamRouteEngineMode,
  type NeuralRoamRouteHistoryEvent,
  type NeuralRoamRoutePoolEntry,
  type NeuralRoamRouteState,
} from './NeuralRoamRoute';

type LegacyRouteState = {
  engineMode: NeuralRoamRouteEngineMode;
  orbitSeedPool: FocusPoolPersistedEntry[];
  orbitAnchorPool: FocusPoolPersistedEntry[];
  orbitSession: ConceptNeuralSessionState | null;
  hyperspaceSourcePool: HyperspacePersistedEntry[];
  hyperspaceAnchorPool: HyperspacePersistedEntry[];
  hyperspaceSession: HyperspaceSessionState | null;
};

export function migrateLegacyNeuralRoamStateToDefaultRoute(
  rawState: unknown,
  now = Date.now(),
): NeuralRoamRouteState | null {
  const legacy = resolveLegacyRouteState(rawState);
  if (!legacy) {
    return null;
  }

  const route = createDefaultRoute(now);
  route.seedPool = mergePoolEntries([
    ...legacy.orbitSeedPool.map((entry) => focusPoolEntryToRouteEntry(entry, 'seed')),
    ...legacy.hyperspaceSourcePool.map((entry) => hyperspaceEntryToRouteEntry(entry, 'seed')),
  ]);
  route.anchorPool = mergePoolEntries([
    ...legacy.orbitAnchorPool.map((entry) => focusPoolEntryToRouteEntry(entry, 'anchor')),
    ...legacy.hyperspaceAnchorPool.map((entry) => hyperspaceEntryToRouteEntry(entry, 'anchor')),
  ]);
  route.sessions = {
    orbit: legacy.orbitSession ? structuredClone(legacy.orbitSession) : null,
    hyperspace: legacy.hyperspaceSession ? structuredClone(legacy.hyperspaceSession) : null,
  };
  route.history = buildRouteHistoryFromEngineSessions(legacy.orbitSession, legacy.hyperspaceSession);

  return {
    activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    engineMode: legacy.engineMode,
    routes: [route],
  };
}

function resolveLegacyRouteState(rawState: unknown): LegacyRouteState | null {
  if (!isRecord(rawState)) {
    return null;
  }

  if (isRecord(rawState.orbit) && isRecord(rawState.hyperspace)) {
    return {
      engineMode: normalizeEngineMode(rawState.engineMode),
      orbitSeedPool: normalizeFocusPool(rawState.orbit.seedPool),
      orbitAnchorPool: normalizeFocusPool(rawState.orbit.anchorPool),
      orbitSession: isRecord(rawState.orbit.session)
        ? structuredClone(rawState.orbit.session) as ConceptNeuralSessionState
        : null,
      hyperspaceSourcePool: normalizeHyperspacePool(rawState.hyperspace.sourcePool),
      hyperspaceAnchorPool: normalizeHyperspacePool(rawState.hyperspace.anchorPool),
      hyperspaceSession: isRecord(rawState.hyperspace.session)
        ? structuredClone(rawState.hyperspace.session) as HyperspaceSessionState
        : null,
    };
  }

  if (Array.isArray(rawState.seedPool) && Array.isArray(rawState.anchorPool)) {
    return {
      engineMode: 'orbit',
      orbitSeedPool: normalizeFocusPool(rawState.seedPool),
      orbitAnchorPool: normalizeFocusPool(rawState.anchorPool),
      orbitSession: isRecord(rawState.session)
        ? structuredClone(rawState.session) as ConceptNeuralSessionState
        : null,
      hyperspaceSourcePool: [],
      hyperspaceAnchorPool: [],
      hyperspaceSession: null,
    };
  }

  if (Array.isArray(rawState.focusPool)) {
    const { seedPool, anchorPool } = splitFocusPoolToSeedAndAnchor(normalizeFocusPool(rawState.focusPool));
    return {
      engineMode: 'orbit',
      orbitSeedPool: seedPool,
      orbitAnchorPool: anchorPool,
      orbitSession: isRecord(rawState.session)
        ? {
            ...(structuredClone(rawState.session) as ConceptNeuralSessionState),
            seedPool,
            anchorPool,
          }
        : null,
      hyperspaceSourcePool: [],
      hyperspaceAnchorPool: [],
      hyperspaceSession: null,
    };
  }

  if (Array.isArray(rawState.conceptBlocks)) {
    const mergedPool = mergeLegacyConceptBlocks(rawState.conceptBlocks, rawState.session);
    const { seedPool, anchorPool } = splitFocusPoolToSeedAndAnchor(mergedPool);
    return {
      engineMode: 'orbit',
      orbitSeedPool: seedPool,
      orbitAnchorPool: anchorPool,
      orbitSession: isRecord(rawState.session)
        ? {
            ...(structuredClone(rawState.session) as ConceptNeuralSessionState),
            seedPool,
            anchorPool,
          }
        : null,
      hyperspaceSourcePool: [],
      hyperspaceAnchorPool: [],
      hyperspaceSession: null,
    };
  }

  return null;
}

function buildRouteHistoryFromEngineSessions(
  orbitSession: ConceptNeuralSessionState | null,
  hyperspaceSession: HyperspaceSessionState | null,
): NeuralRoamRouteHistoryEvent[] {
  return [
    ...historyEntriesToRouteEvents(orbitSession?.history, 'orbit'),
    ...historyEntriesToRouteEvents(hyperspaceSession?.history, 'hyperspace'),
  ].sort((left, right) => left.visitedAt - right.visitedAt);
}

function historyEntriesToRouteEvents(
  entries: NeuralRoamHistoryEntry[] | null | undefined,
  engineMode: NeuralRoamRouteEngineMode,
): NeuralRoamRouteHistoryEvent[] {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        eventId: String(entry.eventId || `${engineMode}-${entry.nodeId}-${entry.visitedAt}`).trim(),
        routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
        engineMode,
        nodeId: String(entry.nodeId || '').trim(),
        cardId: typeof entry.cardId === 'string' && entry.cardId ? entry.cardId : null,
        title: String(entry.nodePreview || entry.nodeId || '').trim(),
        activationKind: String(entry.activationKind || '').trim() || 'unknown',
        sourceNodeId: typeof entry.sourceNodeId === 'string' && entry.sourceNodeId ? entry.sourceNodeId : null,
        visitedAt: Number.isFinite(Number(entry.visitedAt)) ? Number(entry.visitedAt) : 0,
      })).filter((event) => event.eventId && event.nodeId)
    : [];
}

function focusPoolEntryToRouteEntry(
  entry: FocusPoolPersistedEntry,
  kind: 'seed' | 'anchor',
): NeuralRoamRoutePoolEntry {
  return {
    routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    nodeId: entry.nodeId,
    kind,
    nodeKind: entry.nodeKind,
    priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0.5,
    addedAt: Number.isFinite(Number(entry.addedAt)) ? Number(entry.addedAt) : Date.now(),
    visitedAt: Number.isFinite(Number(entry.visitedAt)) ? Number(entry.visitedAt) : null,
    preview: entry.nodePreview,
  };
}

function hyperspaceEntryToRouteEntry(
  entry: HyperspacePersistedEntry,
  kind: 'seed' | 'anchor',
): NeuralRoamRoutePoolEntry {
  return {
    routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    nodeId: entry.nodeId,
    kind,
    nodeKind: entry.nodeKind,
    role: entry.role,
    priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0.5,
    addedAt: Number.isFinite(Number(entry.addedAt)) ? Number(entry.addedAt) : Date.now(),
    visitedAt: Number.isFinite(Number(entry.visitedAt)) ? Number(entry.visitedAt) : null,
    preview: entry.nodePreview,
  };
}

function mergePoolEntries(entries: NeuralRoamRoutePoolEntry[]): NeuralRoamRoutePoolEntry[] {
  const merged = new Map<string, NeuralRoamRoutePoolEntry>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.nodeId}`;
    if (!entry.nodeId || merged.has(key)) {
      continue;
    }
    merged.set(key, { ...entry });
  }
  return Array.from(merged.values());
}

function splitFocusPoolToSeedAndAnchor(entries: FocusPoolPersistedEntry[]): {
  seedPool: FocusPoolPersistedEntry[];
  anchorPool: FocusPoolPersistedEntry[];
} {
  return {
    seedPool: entries.filter((entry) => entry.nodeKind === 'concept'),
    anchorPool: entries.filter((entry) => entry.nodeKind !== 'concept'),
  };
}

function mergeLegacyConceptBlocks(conceptBlocks: unknown[], session: unknown): FocusPoolPersistedEntry[] {
  const now = Date.now();
  const fromSession = isRecord(session) && Array.isArray(session.focusPool)
    ? normalizeFocusPool(session.focusPool)
    : [];
  const byId = new Map(fromSession.map((entry) => [entry.nodeId, entry]));
  for (const blockId of conceptBlocks) {
    const nodeId = String(blockId || '').trim();
    if (!nodeId || byId.has(nodeId)) {
      continue;
    }
    byId.set(nodeId, {
      nodeId,
      nodeKind: 'concept',
      priority: 0.5,
      neighborsViewed: 0,
      addedAt: now,
      nodePreview: nodeId,
    });
  }
  return Array.from(byId.values());
}

function normalizeFocusPool(value: unknown): FocusPoolPersistedEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((entry) => ({
      nodeId: String(entry.nodeId || '').trim(),
      nodeKind: entry.nodeKind === 'virtual' ? 'virtual' : 'concept',
      priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0.5,
      neighborsViewed: Number.isFinite(Number(entry.neighborsViewed)) ? Number(entry.neighborsViewed) : 0,
      addedAt: Number.isFinite(Number(entry.addedAt)) ? Number(entry.addedAt) : Date.now(),
      nodePreview: String(entry.nodePreview || entry.nodeId || '').trim(),
    }))
    .filter((entry) => entry.nodeId);
}

function normalizeHyperspacePool(value: unknown): HyperspacePersistedEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((entry) => ({
      nodeId: String(entry.nodeId || '').trim(),
      nodeKind: entry.nodeKind === 'virtual' ? 'virtual' : entry.nodeKind === 'element' ? 'element' : 'concept',
      role: entry.role === 'activation-source' ? 'activation-source' : 'orbit-center',
      priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0.5,
      addedAt: Number.isFinite(Number(entry.addedAt)) ? Number(entry.addedAt) : Date.now(),
      visitedAt: Number.isFinite(Number(entry.visitedAt)) ? Number(entry.visitedAt) : 0,
      nodePreview: String(entry.nodePreview || entry.nodeId || '').trim(),
    }))
    .filter((entry) => entry.nodeId);
}

function normalizeEngineMode(value: unknown): NeuralRoamRouteEngineMode {
  return value === 'hyperspace' ? 'hyperspace' : 'orbit';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
