import type {
  SemanticEvent,
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticIrrelevantFeedback,
  SemanticLaterEntry,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticSuggestion,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';

export interface SemanticActivationPersistencePort {
  saveSession(session: SemanticSessionSnapshot): void;
  getSession(sessionId: string): SemanticSessionSnapshot | null;
  findActiveSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null;
  findMostRecentEndedSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null;
  appendEvent(event: SemanticEvent): void;
  listEvents(sessionId: string, limit?: number): SemanticEvent[];
  saveStation(station: SemanticStation): void;
  listStations(sessionId: string): SemanticStation[];
  listStationsByRoot(rootFocusNodeId: string): SemanticStation[];
  getStation(stationId: string): SemanticStation | null;
  archiveStation(stationId: string, archivedAt: number): SemanticStation | null;
  saveRelation(relation: SemanticRelation): void;
  listRelations(): SemanticRelation[];
  saveBranchEdge(edge: SemanticBranchEdge): void;
  listBranchEdges(sessionId: string): SemanticBranchEdge[];
  saveBranchState(state: SemanticBranchState): void;
  listBranchStates(sessionId: string): SemanticBranchState[];
  saveLaterEntry(entry: SemanticLaterEntry): void;
  listLaterEntries(sessionId: string): SemanticLaterEntry[];
  saveIrrelevantFeedback(feedback: SemanticIrrelevantFeedback): void;
  listIrrelevantFeedback(sessionId: string): SemanticIrrelevantFeedback[];
  saveSuggestion(suggestion: SemanticSuggestion): void;
  listSuggestions(sessionId: string): SemanticSuggestion[];
  saveProjection(projection: SemanticMemoryProjection): void;
  getProjection(sessionId?: string | null): SemanticMemoryProjection | null;
}
