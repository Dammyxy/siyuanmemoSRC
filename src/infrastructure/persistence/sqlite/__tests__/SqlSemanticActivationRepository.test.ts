import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlSemanticActivationRepository } from '@/infrastructure/persistence/sqlite/SqlSemanticActivationRepository';
import type { SemanticActivationPersistencePort } from '@/application/ports/SemanticActivationPersistencePort';

type JsonFileService = Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'>;

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

describe('SqlSemanticActivationRepository', () => {
  it('persists Semantic sessions, events, stations, relations, and projection cache in the SQLite owner database', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlSemanticActivationRepository(database);
    const port: SemanticActivationPersistencePort = repository;

    await database.runTransaction('semantic.persistence.tracer', () => {
      port.saveSession({
        sessionId: 'session-1',
        rootFocusNodeId: 'concept-root',
        currentNodeId: 'concept-root',
        activeLens: 'assimilation',
        narrativePath: [{
          nodeId: 'concept-root',
          lens: 'assimilation',
          eventId: 'event-start',
          visitedAt: 1_700_001_000_000,
        }],
        startedAt: 1_700_001_000_000,
        endedAt: null,
      });
      port.appendEvent({
        eventId: 'event-start',
        sessionId: 'session-1',
        type: 'session-started',
        nodeId: 'concept-root',
        lens: 'assimilation',
        occurredAt: 1_700_001_000_000,
        payload: { source: 'review-concept' },
      });
      port.saveStation({
        stationId: 'station-node-1',
        type: 'node',
        sessionId: 'session-1',
        nodeId: 'concept-root',
        path: null,
        lensHistory: ['assimilation'],
        createdAt: 1_700_001_000_100,
      });
      port.saveRelation({
        relationId: 'relation-ai-1',
        fromNodeId: 'concept-root',
        toNodeId: 'implicit-1',
        decision: 'accepted',
        source: 'ai',
        confidence: 0.35,
        reason: 'manual accepted current-path analysis',
        decidedAt: 1_700_001_000_200,
      });
      port.saveProjection({
        version: 1,
        sessionId: 'session-1',
        nodeMemory: [{
          nodeId: 'concept-root',
          oldKnowledgeScore: 0.8,
          semanticFamiliarity: 0.6,
          manualBoost: 1,
          novelty: 0.2,
          instability: 0,
          tension: 0.1,
          lastProjectedAt: 1_700_001_000_300,
        }],
        edgeMemory: [{
          fromNodeId: 'concept-root',
          toNodeId: 'implicit-1',
          relationConfidence: 0.35,
          traversalCount: 1,
          manualBoost: 0,
          tension: 0.2,
          lastProjectedAt: 1_700_001_000_300,
        }],
        rebuiltAt: 1_700_001_000_300,
      });
      port.saveBranchEdge({
        edgeId: 'edge-1',
        sessionId: 'session-1',
        branchId: 'branch-main',
        fromNodeId: 'concept-root',
        toNodeId: 'card-1',
        lens: 'accommodation',
        explanation: {
          fromNodeId: 'concept-root',
          toNodeId: 'card-1',
          lens: 'accommodation',
          primaryExplanation: 'new note reframes old review card',
          reasonTags: ['tension'],
          evidence: [{ eventId: 'event-start', weight: 0.6 }],
          createdBy: { kind: 'user', id: 'user-1', label: 'manual follow' },
          createdAt: 1_700_001_000_400,
        },
        createdBy: { kind: 'user', id: 'user-1', label: 'manual follow' },
        createdAt: 1_700_001_000_400,
      });
      port.saveBranchState({
        branchId: 'branch-main',
        sessionId: 'session-1',
        rootNodeId: 'concept-root',
        activeCursorNodeId: 'card-1',
        archivedAt: null,
        restoredAt: null,
        updatedAt: 1_700_001_000_500,
      });
      port.saveLaterEntry({
        entryId: 'later-1',
        sessionId: 'session-1',
        nodeId: 'card-2',
        reason: 'compare later',
        createdAt: 1_700_001_000_600,
        removedAt: null,
      });
      port.saveIrrelevantFeedback({
        feedbackId: 'irrelevant-1',
        sessionId: 'session-1',
        nodeId: 'card-3',
        scope: 'root',
        rootFocusNodeId: 'concept-root',
        createdAt: 1_700_001_000_700,
      });
      port.saveSuggestion({
        suggestionId: 'suggestion-1',
        sessionId: 'session-1',
        source: 'ai',
        summary: 'bind this to a real block before following',
        status: 'active',
        targetNodeId: 'card-1',
        boundNodeId: null,
        materializedBlockId: null,
        materializedCardId: null,
        createdAt: 1_700_001_000_800,
        updatedAt: 1_700_001_000_800,
      });
    });

    expect(port.getSession('session-1')).toMatchObject({
      sessionId: 'session-1',
      rootFocusNodeId: 'concept-root',
      currentNodeId: 'concept-root',
      activeLens: 'assimilation',
    });
    expect(port.listEvents('session-1')).toHaveLength(1);
    expect(port.listStations('session-1')).toHaveLength(1);
    expect(port.listRelations()).toHaveLength(1);
    expect(port.getProjection('session-1')).toMatchObject({
      version: 1,
      sessionId: 'session-1',
      nodeMemory: [expect.objectContaining({ nodeId: 'concept-root' })],
      edgeMemory: [expect.objectContaining({ toNodeId: 'implicit-1' })],
    });
    expect(port.listBranchEdges('session-1')).toEqual([
      expect.objectContaining({
        edgeId: 'edge-1',
        branchId: 'branch-main',
        explanation: expect.objectContaining({ primaryExplanation: 'new note reframes old review card' }),
      }),
    ]);
    expect(port.listBranchStates('session-1')).toEqual([
      expect.objectContaining({ branchId: 'branch-main', activeCursorNodeId: 'card-1' }),
    ]);
    expect(port.listLaterEntries('session-1')).toEqual([
      expect.objectContaining({ entryId: 'later-1', nodeId: 'card-2', removedAt: null }),
    ]);
    expect(port.listIrrelevantFeedback('session-1')).toEqual([
      expect.objectContaining({ feedbackId: 'irrelevant-1', scope: 'root', rootFocusNodeId: 'concept-root' }),
    ]);
    expect(port.listSuggestions('session-1')).toEqual([
      expect.objectContaining({ suggestionId: 'suggestion-1', status: 'active', targetNodeId: 'card-1' }),
    ]);
  });
});
