import type {
  SemanticEvent,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';

export interface SemanticActivationPersistencePort {
  saveSession(session: SemanticSessionSnapshot): void;
  getSession(sessionId: string): SemanticSessionSnapshot | null;
  findActiveSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null;
  appendEvent(event: SemanticEvent): void;
  listEvents(sessionId: string, limit?: number): SemanticEvent[];
  saveStation(station: SemanticStation): void;
  listStations(sessionId: string): SemanticStation[];
  listStationsByRoot(rootFocusNodeId: string): SemanticStation[];
  getStation(stationId: string): SemanticStation | null;
  archiveStation(stationId: string, archivedAt: number): SemanticStation | null;
  saveRelation(relation: SemanticRelation): void;
  listRelations(): SemanticRelation[];
  saveProjection(projection: SemanticMemoryProjection): void;
  getProjection(sessionId?: string | null): SemanticMemoryProjection | null;
}
