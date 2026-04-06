import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/siyuan/api', () => ({
  sql: vi.fn(),
  listDocsByPath: vi.fn(),
  getDocInfo: vi.fn(),
}));

import * as api from '@/infrastructure/siyuan/api';
import { ConceptQueryEngine } from '../../ConceptQueryEngine';
import { NeuralGraphProvider } from '../NeuralGraphProvider';

describe('NeuralGraphProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(api.sql).mockReset();
    vi.mocked(api.listDocsByPath).mockReset();
    vi.mocked(api.getDocInfo).mockReset();
  });

  it('fetches neighbors once per hyperspace link bundle and splits concept and element edges', async () => {
    vi.mocked(api.sql).mockImplementation(async (query: string) => {
      if (query.includes('FROM fsrs_cards')) {
        return [{ priority: 80 }];
      }
      if (query.includes("WHERE id = 'concept-neighbor'")) {
        return [{ id: 'concept-neighbor', root_id: 'doc-1' }];
      }
      if (query.includes("WHERE id = 'element-neighbor'")) {
        return [{ id: 'element-neighbor', root_id: 'doc-1' }];
      }
      return [];
    });

    const fetchNeighbors = vi.spyOn(ConceptQueryEngine.prototype, 'fetchNeighbors').mockResolvedValue([
      { id: 'concept-neighbor', type: 'backlink', weight: 15 },
      { id: 'element-neighbor', type: 'outgoing-direct', weight: 10 },
    ]);
    vi.spyOn(ConceptQueryEngine.prototype, 'isConceptCard').mockImplementation(async (nodeId: string) => nodeId === 'concept-neighbor');

    const provider = new NeuralGraphProvider();
    const edges = await provider.fetchHyperspaceEdges('source-1', {
      engineMode: 'hyperspace',
      includeTreeChannels: {
        blockTree: false,
        documentTree: false,
      },
    });

    expect(fetchNeighbors).toHaveBeenCalledTimes(1);
    expect(edges).toEqual([
      expect.objectContaining({
        nodeId: 'concept-neighbor',
        associationType: 'concept-link',
        channel: 'concept-map',
        origin: 'backlink',
      }),
      expect.objectContaining({
        nodeId: 'element-neighbor',
        associationType: 'element-link',
        channel: 'element-link',
        origin: 'direct-ref',
      }),
    ]);
  });

  it('keeps flashcard neighbors as element-link even when the source node is a concept', async () => {
    vi.mocked(api.sql).mockImplementation(async (query: string) => {
      if (query.includes('FROM fsrs_cards')) {
        return [{ priority: 80 }];
      }
      if (query.includes("WHERE id = 'flashcard-neighbor'")) {
        return [{ id: 'flashcard-neighbor', root_id: 'doc-1' }];
      }
      return [];
    });

    vi.spyOn(ConceptQueryEngine.prototype, 'fetchNeighbors').mockResolvedValue([
      { id: 'flashcard-neighbor', type: 'backlink', weight: 15 },
    ]);
    vi.spyOn(ConceptQueryEngine.prototype, 'isConceptCard').mockImplementation(async (nodeId: string) => nodeId === 'source-1');

    const provider = new NeuralGraphProvider();
    const edges = await provider.fetchHyperspaceEdges('source-1', {
      engineMode: 'hyperspace',
      includeTreeChannels: {
        blockTree: false,
        documentTree: false,
      },
    });

    expect(edges).toEqual([
      expect.objectContaining({
        nodeId: 'flashcard-neighbor',
        associationType: 'element-link',
        channel: 'element-link',
        origin: 'backlink',
      }),
    ]);
  });

  it('uses the injected query engine instance when building hyperspace edges', async () => {
    vi.mocked(api.sql).mockImplementation(async (query: string) => {
      if (query.includes('FROM fsrs_cards')) {
        return [{ priority: 80 }];
      }
      if (query.includes("WHERE id = 'paragraph-neighbor'")) {
        return [{ id: 'paragraph-neighbor', root_id: 'doc-1' }];
      }
      return [];
    });

    const queryEngine = {
      fetchNeighbors: vi.fn(async () => [
        { id: 'paragraph-neighbor', type: 'backlink' as const, weight: 15 },
      ]),
      isConceptCard: vi.fn(async () => false),
      fetchBlockData: vi.fn(),
    } as unknown as ConceptQueryEngine;

    const provider = new NeuralGraphProvider(queryEngine);
    const edges = await provider.fetchHyperspaceEdges('source-1', {
      engineMode: 'hyperspace',
      includeTreeChannels: {
        blockTree: false,
        documentTree: false,
      },
    });

    expect((queryEngine as unknown as { fetchNeighbors: ReturnType<typeof vi.fn> }).fetchNeighbors).toHaveBeenCalledWith('source-1');
    expect(edges).toEqual([
      expect.objectContaining({
        nodeId: 'paragraph-neighbor',
        associationType: 'element-link',
        channel: 'element-link',
      }),
    ]);
  });
});
