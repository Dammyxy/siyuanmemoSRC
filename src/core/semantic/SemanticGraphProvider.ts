import type { NeuralGraphQueryPort } from '@/core/queue/neural/NeuralGraphQueryPort';
import type { NeuralGraphEdge } from '@/core/queue/neural/graph/NeuralGraphProvider';
import type { SemanticCandidateSource } from '@/core/semantic/semanticActivationTypes';

export interface SemanticGraphCandidateSourceRequest {
  currentNodeId: string;
  rootFocusNodeId: string;
  includeStructuralRelations?: boolean;
}

export type SemanticGraphCandidateSourceResult =
  | {
      status: 'ok';
      sources: SemanticCandidateSource[];
    }
  | {
      status: 'unavailable';
      unavailableReason: 'graph-unavailable' | 'invalid-request';
      message: string;
    };

type SemanticGraphScope = SemanticCandidateSource['scope'];

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function edgeKey(sourceNodeId: string, edge: NeuralGraphEdge, scope: SemanticGraphScope): string {
  return `${scope}\u001f${sourceNodeId}\u001f${edge.nodeId}\u001f${edge.channel}\u001f${edge.associationType}`;
}

export class SemanticGraphProvider {
  constructor(private readonly graphQuery: NeuralGraphQueryPort) {}

  async getCandidateSources(
    request: SemanticGraphCandidateSourceRequest,
  ): Promise<SemanticGraphCandidateSourceResult> {
    const currentNodeId = normalizeString(request.currentNodeId);
    const rootFocusNodeId = normalizeString(request.rootFocusNodeId);
    if (!currentNodeId || !rootFocusNodeId) {
      return {
        status: 'unavailable',
        unavailableReason: 'invalid-request',
        message: 'SEMANTIC_GRAPH_INVALID_REQUEST: currentNodeId and rootFocusNodeId are required',
      };
    }

    const sourceGroups: Array<{ scope: SemanticGraphScope; nodeId: string; operation: 'fetchEdges' | 'fetchBlockTreeEdges' | 'fetchDocumentTreeEdges' }> = [
      { scope: 'current-node', nodeId: currentNodeId, operation: 'fetchEdges' },
    ];
    if (rootFocusNodeId !== currentNodeId) {
      sourceGroups.push({ scope: 'root-focus', nodeId: rootFocusNodeId, operation: 'fetchEdges' });
    }
    if (request.includeStructuralRelations) {
      sourceGroups.push(
        { scope: 'structural', nodeId: currentNodeId, operation: 'fetchBlockTreeEdges' },
        { scope: 'structural', nodeId: currentNodeId, operation: 'fetchDocumentTreeEdges' },
      );
    }

    const sources = new Map<string, SemanticCandidateSource>();
    for (const group of sourceGroups) {
      const result = await this.graphQuery.query<NeuralGraphEdge[]>({
        operation: group.operation,
        blockId: group.nodeId,
      });
      if (result.status === 'failed') {
        return {
          status: 'unavailable',
          unavailableReason: 'graph-unavailable',
          message: `SEMANTIC_GRAPH_UNAVAILABLE: ${result.error || `${group.operation} failed for ${group.nodeId}`}`,
        };
      }
      if (result.status !== 'found') {
        continue;
      }
      const edges = Array.isArray(result.data) ? result.data : [];
      for (const edge of edges) {
        const nodeId = normalizeString(edge.nodeId);
        if (!nodeId || nodeId === group.nodeId) {
          continue;
        }
        const key = edgeKey(group.nodeId, edge, group.scope);
        const source: SemanticCandidateSource = {
          nodeId,
          relatedToNodeId: group.nodeId,
          scope: group.scope,
          relationType: String(edge.associationType || edge.channel || 'semantic-edge'),
          weight: clamp01(Number(edge.weight)),
          structural: edge.channel === 'block-tree' || edge.channel === 'document-tree',
          evidence: {
            channel: edge.channel,
            origin: edge.origin ?? null,
            distance: edge.distance ?? null,
            rootId: edge.rootId ?? null,
          },
        };
        const previous = sources.get(key);
        if (!previous || source.weight > previous.weight) {
          sources.set(key, source);
        }
      }
    }

    return {
      status: 'ok',
      sources: Array.from(sources.values()).sort((left, right) => (
        left.nodeId.localeCompare(right.nodeId)
        || left.scope.localeCompare(right.scope)
        || left.relatedToNodeId.localeCompare(right.relatedToNodeId)
      )),
    };
  }
}
