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
export class NeuralRoamQueueV2 extends BaseCompositeQueue<QueueItem> {
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
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.i18n = options?.i18n;

    // Load saved config
    const saved = NeuralQueueStorage.loadConfig();
    this.config = {
      ...saved,
      ...options?.config,
      weights: { ...saved.weights, ...(options?.config as any)?.weights },
      queryLimits: { ...saved.queryLimits, ...(options?.config as any)?.queryLimits },
      features: { ...saved.features, ...(options?.config as any)?.features },
      topicMode: { ...(saved as any).topicMode, ...(options?.config as any)?.topicMode },
    } as NeuralQueueConfig;

    this.queryEngine = new QueryEngine(this.config);
    this.walkEngine = new WeightedWalkEngine({
      [AssociationType.REF_LINK]: this.config.weights.refLink,
      [AssociationType.HIERARCHY]: this.config.weights.hierarchy,
      [AssociationType.TAG]: this.config.weights.tag,
      [AssociationType.SIBLING]: this.config.weights.sibling,
    });

    // Create graph sequencer
    this.graphSequencer = this.createSequencer(options?.seedBlockId || null);

    // Create graph data source
    const dataSource = new GraphDataSource(this.graphSequencer);

    // Create null scheduler (no algorithm for neural roam)
    const scheduler = new NullScheduler<QueueItem>();

    // Initialize base class
    super({
      scheduler,
      sequencer: this.graphSequencer,
      dataSource,
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: false,
        allowSkip: true,
      },
      statsLabel: '神经漫游',
    });
  }

  /**
   * Override getUIConfig for neural-specific UI
   */
  getUIConfig(currentItem: QueueItem | null): QueueUIConfig {
    const isFlashcard = Boolean((currentItem as any)?.meta?.neuralContext?.isFlashcard);

    if (!isFlashcard) {
      return {
        statsType: 'queue-size',
        showRatingButtons: false,
        allowSkip: true,
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
