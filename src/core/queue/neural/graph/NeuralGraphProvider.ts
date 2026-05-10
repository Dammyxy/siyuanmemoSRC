import * as api from '@/infrastructure/siyuan/api';
import type {
  NeuralAssociationType,
  NeuralEngineMode,
  NeuralPropagationOrigin,
} from '@/types/unified-data-source';
import { ConceptQueryEngine, type BlockData } from '../ConceptQueryEngine';
import {
  neuralGraphQueryFailed,
  resolveNeuralGraphQuery,
  type NeuralGraphQueryOperation,
  type NeuralGraphQueryPort,
} from '../NeuralGraphQueryPort';

export type NeuralGraphChannel = 'concept-map' | 'element-link' | 'block-tree' | 'document-tree' | 'source';

export interface NeuralGraphEdge {
  nodeId: string;
  associationType: NeuralAssociationType;
  weight: number;
  channel: NeuralGraphChannel;
  origin?: NeuralPropagationOrigin | null;
  distance?: number;
  sourcePriority?: number | null;
  targetPriority?: number | null;
  rootId?: string | null;
}

export interface NeuralGraphFetchOptions {
  engineMode: NeuralEngineMode;
  includeTreeChannels?: {
    blockTree: boolean;
    documentTree: boolean;
  };
}

interface BlockRow {
  id?: string;
  content?: string;
  type?: string;
  parent_id?: string | null;
  root_id?: string | null;
  sort?: number | string | null;
  box?: string | null;
  path?: string | null;
}

interface RefRow {
  id?: string;
  block_id?: string;
  def_block_id?: string;
}

interface PriorityRow {
  priority?: number | string | null;
}

interface DocListItem {
  id?: string;
  path?: string;
  box?: string;
}

interface DocumentMeta {
  docId: string;
  box: string;
  path: string;
}

interface LinkEdgeBundle {
  conceptMapEdges: NeuralGraphEdge[];
  elementLinkEdges: NeuralGraphEdge[];
}

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNonEmptyString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function normalizePriorityValue(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed > 1) {
    return clamp(parsed / 100, 0, 1);
  }
  return clamp(parsed, 0, 1);
}

function getParentListingPath(path: string): string {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '/';
  }
  return normalized.slice(0, lastSlash) || '/';
}

function dedupeEdges(edges: NeuralGraphEdge[]): NeuralGraphEdge[] {
  const bestByKey = new Map<string, NeuralGraphEdge>();
  for (const edge of edges) {
    const nodeId = String(edge.nodeId || '').trim();
    if (!nodeId) {
      continue;
    }
    const key = `${nodeId}::${edge.associationType}::${edge.channel}`;
    const existing = bestByKey.get(key);
    if (!existing || edge.weight > existing.weight) {
      bestByKey.set(key, {
        ...edge,
        nodeId,
      });
    }
  }
  return Array.from(bestByKey.values());
}

function resolveNeighborOrigin(type: 'backlink' | 'outgoing-direct' | 'outgoing-indirect' | 'descriptor'): NeuralPropagationOrigin {
  switch (type) {
    case 'backlink':
      return 'backlink';
    case 'outgoing-direct':
      return 'direct-ref';
    case 'outgoing-indirect':
      return 'indirect-ref';
    case 'descriptor':
    default:
      return 'descriptor';
  }
}

export class NeuralGraphProvider {
  private readonly queryEngine: ConceptQueryEngine;
  private readonly blockTreeCache = new Map<string, NeuralGraphEdge[]>();
  private readonly documentTreeCache = new Map<string, NeuralGraphEdge[]>();
  private readonly nodePriorityCache = new Map<string, number | null>();
  private readonly nodeConceptCache = new Map<string, boolean>();
  private readonly documentMetaCache = new Map<string, DocumentMeta | null>();
  private readonly blockRowCache = new Map<string, BlockRow | null>();

  constructor(queryEngine?: ConceptQueryEngine, private readonly graphQuery?: NeuralGraphQueryPort) {
    this.queryEngine = queryEngine ?? new ConceptQueryEngine();
  }

  private async queryGraph<TData>(
    operation: NeuralGraphQueryOperation,
    nodeId: string,
    fallback: TData,
    options?: Record<string, unknown>,
  ): Promise<{ handled: boolean; value: TData }> {
    const result = await resolveNeuralGraphQuery<TData>(this.graphQuery, {
      operation,
      blockId: nodeId,
      options,
    });
    if (!result) {
      return { handled: false, value: fallback };
    }
    if (result.status === 'failed') {
      throw neuralGraphQueryFailed(result);
    }
    if (result.status === 'known-missing' || result.status === 'unknown') {
      return { handled: true, value: fallback };
    }
    return {
      handled: true,
      value: result.data == null ? fallback : result.data,
    };
  }

  async fetchBlockData(nodeId: string): Promise<BlockData | null> {
    const graph = await this.queryGraph<BlockData | null>('fetchBlockData', nodeId, null);
    if (graph.handled) {
      return graph.value;
    }
    return this.queryEngine.fetchBlockData(nodeId);
  }

  async isConceptCard(nodeId: string): Promise<boolean> {
    const graph = await this.queryGraph<boolean>('isConceptCard', nodeId, false);
    if (graph.handled) {
      return graph.value;
    }

    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return false;
    }

    if (this.nodeConceptCache.has(normalizedNodeId)) {
      return this.nodeConceptCache.get(normalizedNodeId) ?? false;
    }

    const isConcept = await this.queryEngine.isConceptCard(normalizedNodeId);
    this.nodeConceptCache.set(normalizedNodeId, isConcept);
    return isConcept;
  }

  async fetchEdges(nodeId: string): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchEdges', nodeId, []);
    if (graph.handled) {
      return graph.value;
    }

    const neighbors = await this.queryEngine.fetchNeighbors(nodeId);
    const targetPriority = await this.fetchNodePriority(nodeId);
    return neighbors.map((neighbor) => ({
      nodeId: neighbor.id,
      associationType: neighbor.type,
      weight: neighbor.weight,
      channel: neighbor.type === 'descriptor' ? 'element-link' : 'concept-map',
      origin: resolveNeighborOrigin(neighbor.type),
      targetPriority,
      rootId: null,
    }));
  }

  async fetchHyperspaceEdges(nodeId: string, options: NeuralGraphFetchOptions): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchHyperspaceEdges', nodeId, [], {
      engineMode: options.engineMode,
      includeTreeChannels: options.includeTreeChannels ?? null,
    });
    if (graph.handled) {
      return graph.value;
    }

    if (options.engineMode !== 'hyperspace') {
      return this.fetchEdges(nodeId);
    }

    const edges: NeuralGraphEdge[] = [];
    const { conceptMapEdges, elementLinkEdges } = await this.fetchLinkEdgeBundle(nodeId);
    edges.push(...conceptMapEdges, ...elementLinkEdges);

    if (options.includeTreeChannels?.blockTree) {
      edges.push(...await this.fetchBlockTreeEdges(nodeId));
    }

    if (options.includeTreeChannels?.documentTree) {
      edges.push(...await this.fetchDocumentTreeEdges(nodeId));
    }

    return dedupeEdges(edges);
  }

  async fetchConceptMapEdges(nodeId: string): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchConceptMapEdges', nodeId, []);
    if (graph.handled) {
      return graph.value;
    }
    const { conceptMapEdges } = await this.fetchLinkEdgeBundle(nodeId);
    return conceptMapEdges.map((edge) => ({ ...edge }));
  }

  async fetchElementLinkEdges(nodeId: string): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchElementLinkEdges', nodeId, []);
    if (graph.handled) {
      return graph.value;
    }
    const { elementLinkEdges } = await this.fetchLinkEdgeBundle(nodeId);
    return elementLinkEdges.map((edge) => ({ ...edge }));
  }

  async fetchBlockTreeEdges(nodeId: string): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchBlockTreeEdges', nodeId, []);
    if (graph.handled) {
      return graph.value;
    }

    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return [];
    }

    const cached = this.blockTreeCache.get(normalizedNodeId);
    if (cached) {
      return cached.map((edge) => ({ ...edge }));
    }

    const currentRow = await this.fetchBlockRow(normalizedNodeId);
    if (!currentRow) {
      this.blockTreeCache.set(normalizedNodeId, []);
      return [];
    }

    const edges: NeuralGraphEdge[] = [];
    const sourcePriority = await this.fetchNodePriority(normalizedNodeId);
    const rootId = toNonEmptyString(currentRow.root_id);
    const parentId = toNonEmptyString(currentRow.parent_id);

    if (parentId && parentId !== normalizedNodeId) {
      edges.push({
        nodeId: parentId,
        associationType: 'tree-parent',
        weight: 10,
        channel: 'block-tree',
        origin: 'block-tree',
        distance: 1,
        sourcePriority,
        targetPriority: await this.fetchNodePriority(parentId),
        rootId,
      });
    }

    const escapedNodeId = escapeSql(normalizedNodeId);
    const children = await api.sql<BlockRow>(`
      SELECT id, root_id, sort
      FROM blocks
      WHERE parent_id = '${escapedNodeId}'
      ORDER BY sort ASC
    `);
    for (const child of children) {
      const childId = toNonEmptyString(child.id);
      if (!childId || childId === normalizedNodeId) {
        continue;
      }
      edges.push({
        nodeId: childId,
        associationType: 'tree-child',
        weight: 12,
        channel: 'block-tree',
        origin: 'block-tree',
        distance: 1,
        sourcePriority,
        targetPriority: await this.fetchNodePriority(childId),
        rootId: toNonEmptyString(child.root_id) ?? rootId,
      });
    }

    if (parentId) {
      const siblings = await api.sql<BlockRow>(`
        SELECT id, root_id, sort
        FROM blocks
        WHERE parent_id = '${escapeSql(parentId)}'
        ORDER BY sort ASC
      `);
      const orderedIds = siblings
        .map((row) => toNonEmptyString(row.id))
        .filter((candidate): candidate is string => Boolean(candidate));
      const currentIndex = orderedIds.indexOf(normalizedNodeId);
      orderedIds.forEach((siblingId, index) => {
        if (siblingId === normalizedNodeId) {
          return;
        }
        const distance = currentIndex >= 0 ? Math.max(1, Math.abs(index - currentIndex)) : 1;
        edges.push({
          nodeId: siblingId,
          associationType: 'tree-sibling',
          weight: Math.max(4, 10 - distance),
          channel: 'block-tree',
          origin: 'block-tree',
          distance,
          sourcePriority,
          targetPriority: null,
          rootId,
        });
      });
    }

    const deduped = dedupeEdges(edges);
    this.blockTreeCache.set(normalizedNodeId, deduped);
    return deduped.map((edge) => ({ ...edge }));
  }

  async fetchDocumentTreeEdges(nodeId: string): Promise<NeuralGraphEdge[]> {
    const graph = await this.queryGraph<NeuralGraphEdge[]>('fetchDocumentTreeEdges', nodeId, []);
    if (graph.handled) {
      return graph.value;
    }

    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return [];
    }

    const cached = this.documentTreeCache.get(normalizedNodeId);
    if (cached) {
      return cached.map((edge) => ({ ...edge }));
    }

    const meta = await this.resolveDocumentMeta(normalizedNodeId);
    if (!meta) {
      this.documentTreeCache.set(normalizedNodeId, []);
      return [];
    }

    const edges: NeuralGraphEdge[] = [];
    const sourcePriority = await this.fetchNodePriority(normalizedNodeId);
    const parentListingPath = getParentListingPath(meta.path);
    const parentDocPath = parentListingPath.endsWith('.sy') ? parentListingPath : null;

    if (parentDocPath) {
      const parentDocRows = await api.sql<BlockRow>(`
        SELECT id, root_id, box, path
        FROM blocks
        WHERE type = 'd'
          AND box = '${escapeSql(meta.box)}'
          AND path = '${escapeSql(parentDocPath)}'
        LIMIT 1
      `);
      const parentDocId = toNonEmptyString(parentDocRows[0]?.id);
      if (parentDocId && parentDocId !== meta.docId) {
        edges.push({
          nodeId: parentDocId,
          associationType: 'tree-parent',
          weight: 8,
          channel: 'document-tree',
          origin: 'document-tree',
          distance: 1,
          sourcePriority,
          targetPriority: await this.fetchNodePriority(parentDocId),
          rootId: parentDocId,
        });
      }
    }

    const childDocs = await api.listDocsByPath<DocListItem>(meta.box, meta.path);
    for (const child of childDocs) {
      const childId = toNonEmptyString(child.id);
      if (!childId || childId === meta.docId) {
        continue;
      }
      edges.push({
        nodeId: childId,
        associationType: 'tree-child',
        weight: 9,
        channel: 'document-tree',
        origin: 'document-tree',
        distance: 1,
        sourcePriority,
        targetPriority: await this.fetchNodePriority(childId),
        rootId: childId,
      });
    }

    const siblingDocs = await api.listDocsByPath<DocListItem>(meta.box, parentListingPath);
    const siblingIds = siblingDocs
      .map((doc) => toNonEmptyString(doc.id))
      .filter((candidate): candidate is string => Boolean(candidate));
    const currentIndex = siblingIds.indexOf(meta.docId);
    siblingIds.forEach((siblingId, index) => {
      if (siblingId === meta.docId) {
        return;
      }
      const distance = currentIndex >= 0 ? Math.max(1, Math.abs(index - currentIndex)) : 1;
      edges.push({
        nodeId: siblingId,
        associationType: 'tree-sibling',
        weight: Math.max(3, 8 - distance),
        channel: 'document-tree',
        origin: 'document-tree',
        distance,
        sourcePriority,
        targetPriority: null,
        rootId: siblingId,
      });
    });

    const deduped = dedupeEdges(edges);
    this.documentTreeCache.set(normalizedNodeId, deduped);
    return deduped.map((edge) => ({ ...edge }));
  }

  async fetchNodePriority(nodeId: string): Promise<number | null> {
    const graph = await this.queryGraph<number | null>('fetchNodePriority', nodeId, null);
    if (graph.handled) {
      return graph.value;
    }

    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }

    if (this.nodePriorityCache.has(normalizedNodeId)) {
      return this.nodePriorityCache.get(normalizedNodeId) ?? null;
    }

    let normalizedPriority: number | null = null;
    try {
      const rows = await api.sql<PriorityRow>(`
        SELECT priority
        FROM fsrs_cards
        WHERE block_id = '${escapeSql(normalizedNodeId)}'
        LIMIT 1
      `);
      normalizedPriority = normalizePriorityValue(rows[0]?.priority);
    } catch {
      normalizedPriority = null;
    }

    this.nodePriorityCache.set(normalizedNodeId, normalizedPriority);
    return normalizedPriority;
  }

  private async fetchLinkEdgeBundle(nodeId: string): Promise<LinkEdgeBundle> {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return {
        conceptMapEdges: [],
        elementLinkEdges: [],
      };
    }

    const [sourcePriority, neighbors] = await Promise.all([
      this.fetchNodePriority(normalizedNodeId),
      this.queryEngine.fetchNeighbors(normalizedNodeId),
    ]);

    const targetPriorityPromises = new Map<string, Promise<number | null>>();
    const targetConceptPromises = new Map<string, Promise<boolean>>();
    const rootIdPromises = new Map<string, Promise<string | null>>();

    const getTargetPriority = (targetNodeId: string): Promise<number | null> => {
      const normalizedTargetId = String(targetNodeId || '').trim();
      if (!normalizedTargetId) {
        return Promise.resolve(null);
      }
      const existing = targetPriorityPromises.get(normalizedTargetId);
      if (existing) {
        return existing;
      }
      const promise = this.fetchNodePriority(normalizedTargetId);
      targetPriorityPromises.set(normalizedTargetId, promise);
      return promise;
    };

    const getRootId = (targetNodeId: string): Promise<string | null> => {
      const normalizedTargetId = String(targetNodeId || '').trim();
      if (!normalizedTargetId) {
        return Promise.resolve(null);
      }
      const existing = rootIdPromises.get(normalizedTargetId);
      if (existing) {
        return existing;
      }
      const promise = this.fetchRootId(normalizedTargetId);
      rootIdPromises.set(normalizedTargetId, promise);
      return promise;
    };

    const getTargetIsConcept = (targetNodeId: string): Promise<boolean> => {
      const normalizedTargetId = String(targetNodeId || '').trim();
      if (!normalizedTargetId) {
        return Promise.resolve(false);
      }
      const existing = targetConceptPromises.get(normalizedTargetId);
      if (existing) {
        return existing;
      }
      const promise = this.isConceptCard(normalizedTargetId);
      targetConceptPromises.set(normalizedTargetId, promise);
      return promise;
    };

    const edges = await Promise.all(
      neighbors.map(async (neighbor) => {
        const associationType = neighbor.type === 'descriptor'
          ? 'descriptor' as const
          : await getTargetIsConcept(neighbor.id)
            ? 'concept-link' as const
            : 'element-link' as const;

        return {
          nodeId: neighbor.id,
          associationType,
          weight: neighbor.weight,
          channel: associationType === 'concept-link' ? 'concept-map' as const : 'element-link' as const,
          origin: resolveNeighborOrigin(neighbor.type),
          sourcePriority,
          targetPriority: await getTargetPriority(neighbor.id),
          rootId: await getRootId(neighbor.id),
        } satisfies NeuralGraphEdge;
      }),
    );

    const conceptMapEdges = edges.filter((edge) => edge.channel === 'concept-map');
    const elementLinkEdges = edges.filter((edge) => edge.channel === 'element-link');

    return {
      conceptMapEdges,
      elementLinkEdges,
    };
  }

  private async fetchBlockRow(nodeId: string): Promise<BlockRow | null> {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }

    if (this.blockRowCache.has(normalizedNodeId)) {
      return this.blockRowCache.get(normalizedNodeId) ?? null;
    }

    const rows = await api.sql<BlockRow>(`
      SELECT id, content, type, parent_id, root_id, sort, box, path
      FROM blocks
      WHERE id = '${escapeSql(normalizedNodeId)}'
      LIMIT 1
    `);
    const row = rows[0] ?? null;
    this.blockRowCache.set(normalizedNodeId, row);
    return row;
  }

  private async fetchRootId(nodeId: string): Promise<string | null> {
    const row = await this.fetchBlockRow(nodeId);
    return toNonEmptyString(row?.root_id);
  }

  private async resolveDocumentMeta(nodeId: string): Promise<DocumentMeta | null> {
    const blockRow = await this.fetchBlockRow(nodeId);
    const docId = blockRow?.type === 'd'
      ? toNonEmptyString(blockRow.id)
      : toNonEmptyString(blockRow?.root_id);
    if (!docId) {
      return null;
    }

    if (this.documentMetaCache.has(docId)) {
      return this.documentMetaCache.get(docId) ?? null;
    }

    let box = toNonEmptyString(blockRow?.box);
    let path = toNonEmptyString(blockRow?.path);

    if (!box || !path) {
      try {
        const docInfo = await api.getDocInfo(docId) as { box?: unknown; path?: unknown };
        box = box ?? toNonEmptyString(docInfo.box);
        path = path ?? toNonEmptyString(docInfo.path);
      } catch {
        // fall through to block lookup below
      }
    }

    if (!box || !path) {
      const docRows = await api.sql<BlockRow>(`
        SELECT id, box, path
        FROM blocks
        WHERE id = '${escapeSql(docId)}'
        LIMIT 1
      `);
      box = box ?? toNonEmptyString(docRows[0]?.box);
      path = path ?? toNonEmptyString(docRows[0]?.path);
    }

    const meta = box && path
      ? { docId, box, path }
      : null;
    this.documentMetaCache.set(docId, meta);
    return meta;
  }
}
