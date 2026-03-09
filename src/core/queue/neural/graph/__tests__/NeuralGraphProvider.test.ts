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

  it('fetches neighbors once per hyperspace link bundle and splits concept and descriptor edges', async () => {
    vi.mocked(api.sql).mockImplementation(async (query: string) => {
      if (query.includes('FROM fsrs_cards')) {
        return [{ priority: 80 }];
      }
      if (query.includes("WHERE id = 'concept-neighbor'")) {
        return [{ id: 'concept-neighbor', root_id: 'doc-1' }];
      }
      if (query.includes("WHERE id = 'descriptor-neighbor'")) {
        return [{ id: 'descriptor-neighbor', root_id: 'doc-1' }];
      }
      return [];
    });

    const fetchNeighbors = vi.spyOn(ConceptQueryEngine.prototype, 'fetchNeighbors').mockResolvedValue([
      { id: 'concept-neighbor', type: 'backlink', weight: 15 },
      { id: 'descriptor-neighbor', type: 'descriptor', weight: 3 },
    ]);
    vi.spyOn(ConceptQueryEngine.prototype, 'isConceptCard').mockResolvedValue(true);

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
        nodeId: 'descriptor-neighbor',
        associationType: 'descriptor',
        channel: 'element-link',
        origin: 'descriptor',
      }),
    ]);
  });
});
