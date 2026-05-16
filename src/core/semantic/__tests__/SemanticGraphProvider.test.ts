import { describe, expect, it, vi } from 'vitest';
import type { NeuralGraphQueryPort } from '@/core/queue/neural/NeuralGraphQueryPort';
import { SemanticGraphProvider } from '../SemanticGraphProvider';

describe('SemanticGraphProvider', () => {
  it('reads candidate sources through the neural graph query boundary', async () => {
    const graphQuery: NeuralGraphQueryPort = {
      query: vi.fn(async (request) => ({
        status: 'found',
        blockId: request.blockId,
        data: request.blockId === 'current'
          ? [
              {
                nodeId: 'candidate-current',
                associationType: 'concept-link',
                weight: 0.8,
                channel: 'concept-map',
                origin: 'direct-ref',
              },
            ]
          : [
              {
                nodeId: 'candidate-root',
                associationType: 'element-link',
                weight: 0.45,
                channel: 'element-link',
                origin: 'indirect-ref',
              },
            ],
      })),
    };
    const provider = new SemanticGraphProvider(graphQuery);

    const result = await provider.getCandidateSources({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
    });

    expect(result).toMatchObject({
      status: 'ok',
      sources: expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'candidate-current',
          relatedToNodeId: 'current',
          scope: 'current-node',
          weight: 0.8,
          structural: false,
        }),
        expect.objectContaining({
          nodeId: 'candidate-root',
          relatedToNodeId: 'root',
          scope: 'root-focus',
          weight: 0.45,
          structural: false,
        }),
      ]),
    });
    expect(graphQuery.query).toHaveBeenCalledWith({ operation: 'fetchEdges', blockId: 'current' });
    expect(graphQuery.query).toHaveBeenCalledWith({ operation: 'fetchEdges', blockId: 'root' });
  });

  it('keeps structural graph queries opt-in', async () => {
    const graphQuery: NeuralGraphQueryPort = {
      query: vi.fn(async (request) => ({
        status: 'found',
        blockId: request.blockId,
        data: request.operation === 'fetchEdges'
          ? []
          : [
              {
                nodeId: 'structural-candidate',
                associationType: request.operation === 'fetchBlockTreeEdges' ? 'tree-child' : 'tree-sibling',
                weight: 0.2,
                channel: request.operation === 'fetchBlockTreeEdges' ? 'block-tree' : 'document-tree',
              },
            ],
      })),
    };
    const provider = new SemanticGraphProvider(graphQuery);

    const disabled = await provider.getCandidateSources({
      currentNodeId: 'current',
      rootFocusNodeId: 'current',
    });
    expect(graphQuery.query).not.toHaveBeenCalledWith({ operation: 'fetchBlockTreeEdges', blockId: 'current' });
    expect(graphQuery.query).not.toHaveBeenCalledWith({ operation: 'fetchDocumentTreeEdges', blockId: 'current' });
    const enabled = await provider.getCandidateSources({
      currentNodeId: 'current',
      rootFocusNodeId: 'current',
      includeStructuralRelations: true,
    });

    expect(disabled).toMatchObject({ status: 'ok', sources: [] });
    expect(enabled).toMatchObject({
      status: 'ok',
      sources: expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'structural-candidate',
          scope: 'structural',
          structural: true,
        }),
      ]),
    });
    expect(graphQuery.query).toHaveBeenCalledWith({ operation: 'fetchBlockTreeEdges', blockId: 'current' });
    expect(graphQuery.query).toHaveBeenCalledWith({ operation: 'fetchDocumentTreeEdges', blockId: 'current' });
  });

  it('returns explicit graph unavailable instead of reading graph data locally', async () => {
    const graphQuery: NeuralGraphQueryPort = {
      query: vi.fn(async (request) => ({
        status: 'failed',
        blockId: request.blockId,
        data: null,
        error: 'host effect missing',
      })),
    };
    const provider = new SemanticGraphProvider(graphQuery);

    await expect(provider.getCandidateSources({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
    })).resolves.toMatchObject({
      status: 'unavailable',
      unavailableReason: 'graph-unavailable',
    });
  });
});
