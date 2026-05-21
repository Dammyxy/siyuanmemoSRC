import type { NeuralEngineMode } from '@/types/unified-data-source';
import type {
  ConceptNeuralSessionState,
  FocusPoolPersistedEntry,
} from '../ConceptNeuralQueue';
import type {
  HyperspacePersistedEntry,
  HyperspaceSessionState,
} from '../hyperspace/HyperspaceEngine';

export const DEFAULT_NEURAL_ROAM_ROUTE_ID = 'default';
export const DEFAULT_NEURAL_ROAM_ROUTE_NAME = '默认航线';

export type NeuralRoamRouteId = string;
export type NeuralRoamRoutePoolKind = 'seed' | 'anchor';
export type NeuralRoamRouteEngineMode = Extract<NeuralEngineMode, 'orbit' | 'hyperspace'>;

export interface NeuralRoamRouteMetadata {
  id: NeuralRoamRouteId;
  name: string;
  temporary: boolean;
  previousRouteId: NeuralRoamRouteId | null;
  initialSeedNodeIds: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
}

export interface NeuralRoamRoutePoolEntry {
  routeId: NeuralRoamRouteId;
  nodeId: string;
  kind: NeuralRoamRoutePoolKind;
  nodeKind: FocusPoolPersistedEntry['nodeKind'] | HyperspacePersistedEntry['nodeKind'];
  role?: HyperspacePersistedEntry['role'] | null;
  priority: number;
  addedAt: number;
  visitedAt: number | null;
  preview: string;
}

export interface NeuralRoamRouteHistoryEvent {
  eventId: string;
  routeId: NeuralRoamRouteId;
  engineMode: NeuralRoamRouteEngineMode;
  nodeId: string;
  cardId: string | null;
  title: string;
  activationKind: string;
  sourceNodeId: string | null;
  visitedAt: number;
}

export interface NeuralRoamRouteSessionSnapshots {
  orbit: ConceptNeuralSessionState | null;
  hyperspace: HyperspaceSessionState | null;
}

export interface NeuralRoamRouteSnapshot {
  metadata: NeuralRoamRouteMetadata;
  seedPool: NeuralRoamRoutePoolEntry[];
  anchorPool: NeuralRoamRoutePoolEntry[];
  sessions: NeuralRoamRouteSessionSnapshots;
  history: NeuralRoamRouteHistoryEvent[];
}

export interface NeuralRoamRouteState {
  activeRouteId: NeuralRoamRouteId;
  engineMode: NeuralRoamRouteEngineMode;
  routes: NeuralRoamRouteSnapshot[];
}

export interface NeuralRoamRouteStats {
  routeId: NeuralRoamRouteId;
  seedCount: number;
  anchorCount: number;
  historyCount: number;
  totalPoolEntries: number;
}

export interface NeuralRoamRouteListItem extends NeuralRoamRouteMetadata {
  stats: NeuralRoamRouteStats;
  isActive: boolean;
}

export function normalizeRouteId(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeRouteName(value: unknown, fallback = DEFAULT_NEURAL_ROAM_ROUTE_NAME): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

export function createDefaultRoute(now = Date.now()): NeuralRoamRouteSnapshot {
  return {
    metadata: {
      id: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      name: DEFAULT_NEURAL_ROAM_ROUTE_NAME,
      temporary: false,
      previousRouteId: null,
      initialSeedNodeIds: [],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    },
    seedPool: [],
    anchorPool: [],
    sessions: {
      orbit: null,
      hyperspace: null,
    },
    history: [],
  };
}

export function cloneRouteSnapshot(route: NeuralRoamRouteSnapshot): NeuralRoamRouteSnapshot {
  return {
    metadata: {
      ...route.metadata,
      initialSeedNodeIds: [...route.metadata.initialSeedNodeIds],
    },
    seedPool: route.seedPool.map((entry) => ({ ...entry })),
    anchorPool: route.anchorPool.map((entry) => ({ ...entry })),
    sessions: {
      orbit: route.sessions.orbit ? structuredClone(route.sessions.orbit) : null,
      hyperspace: route.sessions.hyperspace ? structuredClone(route.sessions.hyperspace) : null,
    },
    history: route.history.map((event) => ({ ...event })),
  };
}
