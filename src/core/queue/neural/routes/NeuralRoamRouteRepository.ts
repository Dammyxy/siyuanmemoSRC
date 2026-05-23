import type {
  NeuralRoamRouteEngineMode,
  NeuralRoamRouteId,
  NeuralRoamRouteSnapshot,
  NeuralRoamRouteState,
} from './NeuralRoamRoute';

export interface NeuralRoamRouteRepository {
  loadState(): Promise<NeuralRoamRouteState | null>;
  saveState(state: NeuralRoamRouteState): Promise<void>;
}

export interface NeuralRoamRouteIdFactory {
  createRouteId(): NeuralRoamRouteId;
}

export interface NeuralRoamRouteClock {
  now(): number;
}

export interface CreateNeuralRoamRouteInput {
  name?: string;
  temporary?: boolean;
  previousRouteId?: string | null;
  initialSeedNodeIds?: string[];
}

export interface RenameNeuralRoamRouteInput {
  routeId: string;
  name: string;
}

export interface SwitchNeuralRoamRouteInput {
  routeId: string;
}

export interface SaveTemporaryNeuralRoamRouteInput {
  routeId: string;
  name?: string;
}

export interface DiscardTemporaryNeuralRoamRouteInput {
  routeId: string;
}

export interface DeleteNeuralRoamRouteInput {
  routeId: string;
}

export interface AppendNeuralRoamRouteHistoryInput {
  routeId?: string | null;
  event: {
    eventId: string;
    engineMode: 'orbit' | 'hyperspace';
    nodeId: string;
    cardId?: string | null;
    title?: string | null;
    activationKind?: string | null;
    sourceNodeId?: string | null;
    sourceEventId?: string | null;
    branchRootNodeId?: string | null;
    sourceRole?: 'orbit-center' | 'activation-source' | null;
    origin?: string | null;
    traceQuality?: 'exact' | 'legacy' | 'synthetic-root' | null;
    depth?: number | null;
    conductionScore?: number | null;
    visitedAt: number;
  };
  maxEntries?: number | null;
}

export interface ReadNeuralRoamRouteHistoryInput {
  routeId?: string | null;
  offset?: number;
  limit?: number;
}

export interface UpsertNeuralRoamRouteInput {
  route: NeuralRoamRouteSnapshot;
  activeRouteId?: string | null;
  engineMode?: NeuralRoamRouteEngineMode | null;
}

export interface ReplaceActiveNeuralRoamRouteInput {
  route: NeuralRoamRouteSnapshot;
  engineMode?: NeuralRoamRouteEngineMode | null;
}
