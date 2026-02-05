/**
 * Neural Roam Queue (V2 - Composite Architecture)
 *
 * New implementation using BaseCompositeQueue pattern.
 * Graph-based exploration with diffusion activation.
 *
 * Features:
 * - Graph traversal through associations
 * - Dynamic card creation
 * - No algorithm (NullScheduler)
 * - Supports both singleton and prototype modes
 */

import * as riff from '../../siyuan/riff';
import { NeuralQueueStorage } from '../neural/NeuralQueueStorage';
import { QueryEngine } from '../neural/QueryEngine';
import { WeightedWalkEngine } from '../neural/WeightedWalkEngine';
import { AssociationType, type NeuralContext, type NeuralQueueConfig } from '../neural/types';
import { GraphSequencer } from '../sequencers/GraphSequencer';
import { NullScheduler } from '../schedulers/NullScheduler';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';
import { getHiddenContentTypes } from '../utils/hiddenContentTypes';

type I18n = Record<string, string>;

/**
 * Simple Graph Data Source
 *
 * Wraps GraphSequencer for neural roam functionality.
 */
class GraphDataSource {
  private sequencer: GraphSequencer<string, QueueItem, any>;

  constructor(sequencer: GraphSequencer<string, QueueItem, any>) {
    this.sequencer = sequencer;
  }

  async getAll(): Promise<QueueItem[]> {
    // Return items visited by graph sequencer
    const visited = this.sequencer.getVisited();
    return Array.from(visited.values());
  }

  size(): number {
    return this.sequencer.getVisited().size;
  }

  isEmpty(): boolean {
    return this.sequencer.getVisited().size === 0;
  }
}

/**
 * Neural Roam Queue (V2)
 *
 * Simplified wrapper around existing NeuralRoamQueue logic.
 * Uses BaseCompositeQueue for consistency with other queues.
 */
/**
 * @deprecated Old architecture queue. Use src/queues/NeuralRoamQueue instead.
 */
export class NeuralRoamQueue extends BaseCompositeQueue<QueueItem> {
  private readonly deckID: string;
  private readonly i18n?: I18n;
  private readonly config: NeuralQueueConfig;
  private readonly queryEngine: QueryEngine;
  private readonly walkEngine: WeightedWalkEngine;
  private readonly graphSequencer: GraphSequencer<string, QueueItem, any>;

  private steps = 0;

  constructor(options?: {
    deckID?: string;
    i18n?: I18n;
    seedBlockId?: string;
    includeSeedAsFirst?: boolean;
    config?: Partial<NeuralQueueConfig>;
  }) {
    // ℹ️ Prepare variables that DON'T need 'this'
    const deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    const i18n = options?.i18n;

    // Load saved config
    const saved = NeuralQueueStorage.loadConfig();
    const config: NeuralQueueConfig = {
      ...saved,
      ...options?.config,
      weights: { ...saved.weights, ...(options?.config as any)?.weights },
      queryLimits: { ...saved.queryLimits, ...(options?.config as any)?.queryLimits },
      features: { ...saved.features, ...(options?.config as any)?.features },
      topicMode: { ...(saved as any).topicMode, ...(options?.config as any)?.topicMode },
    } as NeuralQueueConfig;

    const queryEngine = new QueryEngine(config);
    const walkEngine = new WeightedWalkEngine({
      [AssociationType.REF_LINK]: config.weights.refLink,
      [AssociationType.HIERARCHY]: config.weights.hierarchy,
      [AssociationType.TAG]: config.weights.tag,
      [AssociationType.SIBLING]: config.weights.sibling,
    });

    // Create a placeholder sequencer for super()
    // We'll create the real one after super() is called
    const placeholderSequencer = new GraphSequencer<string, QueueItem, any>({
      seed: undefined,
      getNeighbors: async () => [],
      toItem: async (nodeId) => ({
        cardID: nodeId,
        deckID: deckID,
        priority: 50,
      } as QueueItem),
      getNodeKey: (nodeId) => nodeId,
    });

    // Create graph data source
    const dataSource = new GraphDataSource(placeholderSequencer);

    // Create null scheduler (no algorithm for neural roam)
    const scheduler = new NullScheduler<QueueItem>();

    // ⚠️ MUST call super() FIRST before using 'this'
    super({
      scheduler,
      sequencer: placeholderSequencer,
      dataSource,
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: false,
        allowSkip: true,
      },
      statsLabel: '神经漫游',
    });

    // Now safe to assign to 'this'
    this.deckID = deckID;
    this.i18n = i18n;
    this.config = config;
    this.queryEngine = queryEngine;
    this.walkEngine = walkEngine;

    // Now create the REAL sequencer (can use 'this')
    this.graphSequencer = this.createSequencer(options?.seedBlockId || null);
    
    // Replace the placeholder in base class
    (this as any).sequencer = this.graphSequencer;
    (dataSource as any).sequencer = this.graphSequencer;
  }

  /**
   * Override getUIConfig for neural-specific UI
   */
  getUIConfig(currentItem: QueueItem | null): QueueUIConfig {
    const isFlashcard = Boolean((currentItem as any)?.meta?.neuralContext?.isFlashcard);
    const hiddenContentTypes = getHiddenContentTypes();

    if (!isFlashcard) {
      return {
        statsType: 'queue-size',
        showRatingButtons: false,
        allowSkip: true,
        hiddenContentTypes,
        customButtons: [
          {
            actionId: 'continue',
            label: this.t('neuralContinue', '继续漫游'),
          },
        ],
      };
    }

    return {
      statsType: 'queue-size',
      showRatingButtons: true,
      allowSkip: true,
      hiddenContentTypes,
    };
  }

  /**
   * Override getStats to track steps
   */
  async getStats(): Promise<QueueStats> {
    return {
      size: this.steps,
      label: '',
    };
  }

  /**
   * Create graph sequencer
   */
  private createSequencer(seedBlockId: string | null): GraphSequencer<string, QueueItem, any> {
    return new GraphSequencer<string, QueueItem, any>({
      seed: seedBlockId || undefined,
      getNeighbors: async (nodeId) => {
        const context = await this.queryEngine.query(nodeId);
        return this.transformNeighbors(context);
      },
      selectNext: (neighbors) => {
        return this.walkEngine.select(neighbors);
      },
    });
  }

  /**
   * Transform neural context to graph neighbors
   */
  private transformNeighbors(context: NeuralContext): any[] {
    if (!context.neighbors || context.neighbors.length === 0) {
      return [];
    }

    return context.neighbors.map((n) => ({
      nodeId: n.targetBlockId,
      item: {
        cardID: n.targetBlockId,
        blockID: n.targetBlockId,
        deckID: this.deckID,
        priority: DEFAULT_PRIORITY,
        meta: {
          neuralContext: {
            isFlashcard: n.isFlashcard,
            associationType: n.associationType,
          },
        },
      } as QueueItem,
      weight: n.weight,
      meta: {
        associationType: n.associationType,
        reason: this.reasonFor(n.associationType),
      },
    }));
  }

  /**
   * Get reason text for association type
   */
  private reasonFor(type: AssociationType): string {
    if (type === AssociationType.REF_LINK) return '双向链接';
    if (type === AssociationType.HIERARCHY) return '同文档';
    if (type === AssociationType.TAG) return '标签关联';
    if (type === AssociationType.SIBLING) return '兄弟块';
    return '未知关联';
  }

  /**
   * Translate i18n key
   */
  private t(key: string, fallback: string): string {
    return this.i18n?.[key] || fallback;
  }
}
