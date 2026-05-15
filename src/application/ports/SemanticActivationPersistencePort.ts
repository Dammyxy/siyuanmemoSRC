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
  appendEvent(event: SemanticEvent): void;
  listEvents(sessionId: string, limit?: number): SemanticEvent[];
  saveStation(station: SemanticStation): void;
  listStations(sessionId: string): SemanticStation[];
  saveRelation(relation: SemanticRelation): void;
  listRelations(): SemanticRelation[];
  saveProjection(projection: SemanticMemoryProjection): void;
  getProjection(sessionId?: string | null): SemanticMemoryProjection | null;
}
