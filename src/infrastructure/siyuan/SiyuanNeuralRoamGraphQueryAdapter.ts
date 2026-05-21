import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
} from '../../../packages/contracts/src/backend-rpc';
import { ConceptQueryEngine } from '@/core/queue/neural/ConceptQueryEngine';
import { NeuralGraphProvider } from '@/core/queue/neural/graph/NeuralGraphProvider';
import type { NeuralRoamNodeTypeResolverPort } from '@/core/queue/domain/ports';
import type { NeuralRoamCardFacts } from '@/core/queue/neural/NeuralRoamCardFacts';
import type { NeuralGraphQueryPort } from '@/core/queue/neural/NeuralGraphQueryPort';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SiyuanNeuralRoamGraphQueryAdapter');

export interface SiyuanNeuralRoamGraphQueryAdapterOptions {
  nodeTypeResolver?: NeuralRoamNodeTypeResolverPort;
  cardFacts?: NeuralRoamCardFacts;
}

export class SiyuanNeuralRoamGraphQueryAdapter implements NeuralGraphQueryPort {
  private readonly queryEngine: ConceptQueryEngine;
  private readonly graphProvider: NeuralGraphProvider;

  constructor(options: SiyuanNeuralRoamGraphQueryAdapterOptions = {}) {
    const cardFacts = options.cardFacts ?? (options.nodeTypeResolver
      ? { resolveNodeType: (blockId: string) => options.nodeTypeResolver!.resolveNodeType(blockId) }
      : undefined);
    this.queryEngine = new ConceptQueryEngine({
      nodeTypeResolver: options.nodeTypeResolver,
      cardFacts,
    });
    this.graphProvider = new NeuralGraphProvider(this.queryEngine);
  }

  async query<TData = unknown>(
    request: BackendNeuralGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult<TData>> {
    const blockId = String(request.blockId || '').trim();
    if (!blockId) {
      return {
        status: 'unknown',
        blockId,
        data: null,
        error: 'missing blockId',
      };
    }

    try {
      const data = await this.execute(request, blockId);
      if (request.operation === 'fetchBlockData' && data == null) {
        return {
          status: 'known-missing',
          blockId,
          data: null,
        };
      }
      return {
        status: 'found',
        blockId,
        data: data as TData,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Neural graph query failed', {
        operation: request.operation,
        blockId,
        error: message,
      });
      return {
        status: 'failed',
        blockId,
        data: null,
        error: message,
      };
    }
  }

  private async execute(request: BackendNeuralGraphQueryRequest, blockId: string): Promise<unknown> {
    switch (request.operation) {
      case 'fetchBlockData':
        return this.queryEngine.fetchBlockData(blockId);
      case 'fetchNeighbors':
        return this.queryEngine.fetchNeighbors(blockId);
      case 'fetchBacklinks':
        return this.queryEngine.fetchBacklinks(blockId);
      case 'fetchDirectOutgoingLinks':
        return this.queryEngine.fetchDirectOutgoingLinks(blockId);
      case 'fetchIndirectOutgoingLinks':
        return this.queryEngine.fetchIndirectOutgoingLinks(
          blockId,
          Array.isArray(request.options?.backlinkIds)
            ? request.options.backlinkIds.map((id) => String(id || '').trim()).filter(Boolean)
            : undefined,
        );
      case 'fetchOutgoingLinks':
        return this.queryEngine.fetchOutgoingLinks(blockId);
      case 'fetchDescriptors':
        return this.queryEngine.fetchDescriptors(blockId);
      case 'isConceptCard':
        return this.queryEngine.isConceptCard(blockId);
      case 'fetchSubtreeBlockIds':
        return this.queryEngine.fetchSubtreeBlockIds(blockId);
      case 'fetchEdges':
        return this.graphProvider.fetchEdges(blockId);
      case 'fetchHyperspaceEdges':
        return this.graphProvider.fetchHyperspaceEdges(blockId, {
          engineMode: request.options?.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit',
          includeTreeChannels: {
            blockTree: Boolean((request.options?.includeTreeChannels as { blockTree?: unknown } | undefined)?.blockTree),
            documentTree: Boolean((request.options?.includeTreeChannels as { documentTree?: unknown } | undefined)?.documentTree),
          },
        });
      case 'fetchConceptMapEdges':
        return this.graphProvider.fetchConceptMapEdges(blockId);
      case 'fetchElementLinkEdges':
        return this.graphProvider.fetchElementLinkEdges(blockId);
      case 'fetchBlockTreeEdges':
        return this.graphProvider.fetchBlockTreeEdges(blockId);
      case 'fetchDocumentTreeEdges':
        return this.graphProvider.fetchDocumentTreeEdges(blockId);
      case 'fetchNodePriority':
        return this.graphProvider.fetchNodePriority(blockId);
      default:
        return null;
    }
  }
}
