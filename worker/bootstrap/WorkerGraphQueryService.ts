import type {
  BackendGraphPresentationEdge,
  BackendGraphPresentationNode,
  BackendGraphQueryKind,
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendNeuralGraphQueryOperation,
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendUnavailableClass,
} from '../../packages/contracts/src/backend-rpc';

type NeuralGraphResolver = (
  request: BackendNeuralGraphQueryRequest,
) => Promise<BackendNeuralGraphQueryResult>;

interface WorkerGraphQueryServiceOptions {
  resolveNeuralGraphQuery?: NeuralGraphResolver;
}

interface BlockDataLike {
  id?: unknown;
  content?: unknown;
  type?: unknown;
  parent_id?: unknown;
  root_id?: unknown;
}

interface NeighborLike {
  id?: unknown;
  type?: unknown;
  weight?: unknown;
}

interface EdgeLike {
  nodeId?: unknown;
  associationType?: unknown;
  channel?: unknown;
  weight?: unknown;
  origin?: unknown;
  rootId?: unknown;
}

const KIND_TO_OPERATION: Record<BackendGraphQueryKind, BackendNeuralGraphQueryOperation> = {
  neighbors: 'fetchNeighbors',
  backlinks: 'fetchBacklinks',
  'outgoing-links': 'fetchOutgoingLinks',
  descriptors: 'fetchDescriptors',
  'subtree-ids': 'fetchSubtreeBlockIds',
  'generic-edges': 'fetchEdges',
  'hyperspace-edges': 'fetchHyperspaceEdges',
  'concept-map-edges': 'fetchConceptMapEdges',
  'element-link-edges': 'fetchElementLinkEdges',
  'block-tree-edges': 'fetchBlockTreeEdges',
  'document-tree-edges': 'fetchDocumentTreeEdges',
  'node-priority': 'fetchNodePriority',
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeLimit(value: unknown): number {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(1, Math.min(500, numeric)) : 64;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function summarizeContent(value: unknown): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Untitled block';
  }
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function mapBlockKind(type: unknown, conceptLike = false): BackendGraphPresentationNode['kind'] {
  if (conceptLike) {
    return 'concept';
  }
  switch (normalizeString(type)) {
    case 'd':
      return 'document';
    case 'h':
      return 'heading';
    case 'i':
      return 'list-item';
    case 'p':
      return 'paragraph';
    default:
      return 'block';
  }
}

function readNodeId(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeString(value);
  }
  if (isRecord(value)) {
    return normalizeString(value.id ?? value.nodeId ?? value.blockId);
  }
  return '';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export class WorkerGraphQueryService {
  constructor(private readonly options: WorkerGraphQueryServiceOptions = {}) {}

  async query(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult> {
    const startedAt = Date.now();
    const queryId = normalizeString(request.queryId) || 'unknown-query';
    const sourceNodeId = normalizeString(request.sourceNodeId);
    const kind = request.kind || 'neighbors';

    if (!sourceNodeId) {
      return this.unavailable(queryId, kind, 'graph.query requires sourceNodeId', 'INVALID_REQUEST', startedAt);
    }
    if (!this.options.resolveNeuralGraphQuery) {
      return this.unavailable(queryId, kind, 'graph query read adapter unavailable', 'BACKEND_UNAVAILABLE', startedAt);
    }
    if (Number.isFinite(Number(request.deadlineAt)) && Number(request.deadlineAt) <= Date.now()) {
      return this.unavailable(queryId, kind, 'graph query deadline exceeded before dispatch', 'TIMEOUT', startedAt);
    }

    try {
      const source = await this.fetchBlock(sourceNodeId);
      if (source.status === 'known-missing') {
        return {
          status: 'partial',
          queryId,
          kind,
          nodes: [this.unavailableNode(sourceNodeId, 'known-missing')],
          edges: [],
          limitReached: false,
          continuation: null,
          diagnostics: this.readyDiagnostics(startedAt, 1, 0, 'unavailable'),
        };
      }
      if (source.status === 'unknown') {
        return this.unavailable(queryId, kind, 'graph source availability unknown', 'BACKEND_UNAVAILABLE', startedAt);
      }
      if (source.status === 'failed') {
        return this.failed(queryId, kind, source.error || 'graph source read failed', startedAt);
      }

      const operation = KIND_TO_OPERATION[kind];
      const graph = await this.queryGraph(operation, sourceNodeId, request);
      if (graph.status === 'known-missing') {
        return {
          status: 'partial',
          queryId,
          kind,
          nodes: [this.availableNode(source.data as BlockDataLike, sourceNodeId)],
          edges: [],
          limitReached: false,
          continuation: null,
          diagnostics: this.readyDiagnostics(startedAt, 1, 0, 'partial'),
        };
      }
      if (graph.status === 'unknown') {
        return this.unavailable(queryId, kind, 'graph query returned unknown source state', 'BACKEND_UNAVAILABLE', startedAt);
      }
      if (graph.status === 'failed') {
        return this.failed(queryId, kind, graph.error || 'graph query failed', startedAt);
      }

      return this.buildReadyResult({
        request,
        startedAt,
        queryId,
        kind,
        sourceNode: this.availableNode(source.data as BlockDataLike, sourceNodeId),
        data: graph.data,
      });
    } catch (error) {
      return this.failed(queryId, kind, error instanceof Error ? error.message : String(error), startedAt);
    }
  }

  private async buildReadyResult(input: {
    request: BackendGraphQueryRequest;
    startedAt: number;
    queryId: string;
    kind: BackendGraphQueryKind;
    sourceNode: BackendGraphPresentationNode;
    data: unknown;
  }): Promise<BackendGraphQueryResult> {
    if (input.kind === 'node-priority') {
      const priority = Number(input.data);
      const sourceNode = {
        ...input.sourceNode,
        sourceIdentity: {
          ...(input.sourceNode.sourceIdentity || {}),
          priority: Number.isFinite(priority) ? priority : null,
        },
      };
      return {
        status: 'ready',
        queryId: input.queryId,
        kind: input.kind,
        nodes: [sourceNode],
        edges: [],
        limitReached: false,
        continuation: null,
        diagnostics: this.readyDiagnostics(input.startedAt, 1, 0, 'available'),
      };
    }

    const limit = normalizeLimit(input.request.limit);
    const rawEntries = asArray(input.data);
    const limitReached = rawEntries.length > limit;
    const entries = rawEntries.slice(0, limit);
    const nodesById = new Map<string, BackendGraphPresentationNode>();
    nodesById.set(input.sourceNode.nodeId, input.sourceNode);
    const edges: BackendGraphPresentationEdge[] = [];

    for (const [index, entry] of entries.entries()) {
      const targetId = readNodeId(entry);
      if (!targetId) {
        continue;
      }
      if (!nodesById.has(targetId)) {
        nodesById.set(targetId, await this.presentationNode(targetId));
      }
      edges.push(this.presentationEdge(input.sourceNode.nodeId, targetId, input.kind, entry, index));
    }

    const nodes = Array.from(nodesById.values());
    const hasUnavailableNode = nodes.some((node) => node.availability === 'unavailable');
    return {
      status: limitReached || hasUnavailableNode ? 'partial' : 'ready',
      queryId: input.queryId,
      kind: input.kind,
      nodes,
      edges,
      limitReached,
      continuation: limitReached ? String(limit) : null,
      diagnostics: this.readyDiagnostics(
        input.startedAt,
        nodes.length,
        edges.length,
        hasUnavailableNode ? 'partial' : 'available',
      ),
    };
  }

  private queryGraph(
    operation: BackendNeuralGraphQueryOperation,
    blockId: string,
    request: BackendGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult> {
    return this.options.resolveNeuralGraphQuery!({
      operation,
      blockId,
      options: {
        ...(isRecord(request.scope) ? request.scope : {}),
        limit: normalizeLimit(request.limit),
        cacheGeneration: request.cacheGeneration ?? null,
      },
    });
  }

  private fetchBlock(blockId: string): Promise<BackendNeuralGraphQueryResult<BlockDataLike>> {
    return this.options.resolveNeuralGraphQuery!({
      operation: 'fetchBlockData',
      blockId,
    }) as Promise<BackendNeuralGraphQueryResult<BlockDataLike>>;
  }

  private async presentationNode(nodeId: string): Promise<BackendGraphPresentationNode> {
    const block = await this.fetchBlock(nodeId);
    if (block.status === 'found' && block.data) {
      return this.availableNode(block.data, nodeId);
    }
    return this.unavailableNode(nodeId, block.status === 'failed' ? 'unreadable' : block.status);
  }

  private availableNode(block: BlockDataLike, fallbackId: string): BackendGraphPresentationNode {
    const nodeId = normalizeString(block.id) || fallbackId;
    const type = normalizeString(block.type);
    return {
      nodeId,
      kind: mapBlockKind(type),
      title: summarizeContent(block.content),
      summary: null,
      sourceIdentity: {
        blockId: nodeId,
        rootId: normalizeString(block.root_id) || null,
        parentId: normalizeString(block.parent_id) || null,
      },
      breadcrumb: null,
      availability: 'available',
      unavailableReason: null,
      debugId: nodeId,
    };
  }

  private unavailableNode(nodeId: string, reason: string): BackendGraphPresentationNode {
    return {
      nodeId,
      kind: 'unknown',
      title: 'Unavailable node',
      summary: null,
      sourceIdentity: { blockId: nodeId },
      breadcrumb: null,
      availability: 'unavailable',
      unavailableReason: reason,
      debugId: nodeId,
    };
  }

  private presentationEdge(
    sourceNodeId: string,
    targetNodeId: string,
    queryKind: BackendGraphQueryKind,
    entry: unknown,
    index: number,
  ): BackendGraphPresentationEdge {
    const edge = isRecord(entry) ? entry as NeighborLike & EdgeLike : {};
    const kind = normalizeString(edge.channel)
      || normalizeString(edge.associationType)
      || normalizeString(edge.type)
      || queryKind;
    return {
      edgeId: `${sourceNodeId}:${kind}:${targetNodeId}:${index}`,
      sourceNodeId,
      targetNodeId,
      kind,
      rationale: kind,
      evidence: {
        queryKind,
        weight: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : null,
        origin: normalizeString(edge.origin) || null,
        rootId: normalizeString(edge.rootId) || null,
      },
    };
  }

  private readyDiagnostics(
    startedAt: number,
    nodeCount: number,
    edgeCount: number,
    sourceAvailability: 'available' | 'partial' | 'unavailable',
  ): Extract<BackendGraphQueryResult, { status: 'ready' | 'partial' }>['diagnostics'] {
    return {
      timingMs: Math.max(0, Date.now() - startedAt),
      nodeCount,
      edgeCount,
      sourceAvailability,
    };
  }

  private unavailable(
    queryId: string,
    kind: BackendGraphQueryKind,
    reason: string,
    unavailableClass: BackendUnavailableClass,
    startedAt: number,
  ): BackendGraphQueryResult {
    return {
      status: 'unavailable',
      queryId,
      kind,
      unavailableClass,
      reason,
      recoverable: unavailableClass !== 'INVALID_REQUEST',
      diagnostics: {
        timingMs: Math.max(0, Date.now() - startedAt),
        sourceAvailability: unavailableClass === 'INVALID_REQUEST' ? 'unknown' : 'unavailable',
        errorCategory: unavailableClass,
      },
    };
  }

  private failed(
    queryId: string,
    kind: BackendGraphQueryKind,
    reason: string,
    startedAt: number,
  ): BackendGraphQueryResult {
    return {
      status: 'failed',
      queryId,
      kind,
      unavailableClass: 'FAILED',
      reason,
      recoverable: true,
      diagnostics: {
        timingMs: Math.max(0, Date.now() - startedAt),
        sourceAvailability: 'unknown',
        errorCategory: 'FAILED',
      },
    };
  }
}
