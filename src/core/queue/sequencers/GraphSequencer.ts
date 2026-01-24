import type { ISequencer } from '../abstraction/types';

export type WeightedNeighbor<TNode, TEdge = unknown> = {
  node: TNode;
  weight: number;
  edge?: TEdge;
};

export class GraphSequencer<TNode, TItem, TEdge = unknown> implements ISequencer<TItem> {
  private readonly getNeighbors: (node: TNode) => Promise<Array<WeightedNeighbor<TNode, TEdge>>>;
  private readonly toItem: (node: TNode, ctx: { from: TNode | null; edge: TEdge | null }) => Promise<TItem | null>;
  private readonly getNodeKey: (node: TNode) => string;
  private readonly getSeed: () => Promise<TNode | null>;
  private readonly random: () => number;

  private readonly visited = new Set<string>();
  private current: TNode | null = null;
  private previous: TNode | null = null;
  private previousEdge: TEdge | null = null;

  constructor(options: {
    seed?: TNode | null;
    getSeed?: () => Promise<TNode | null>;
    getNeighbors: (node: TNode) => Promise<Array<WeightedNeighbor<TNode, TEdge>>>;
    toItem: (node: TNode, ctx: { from: TNode | null; edge: TEdge | null }) => Promise<TItem | null>;
    getNodeKey: (node: TNode) => string;
    random?: () => number;
  }) {
    this.getNeighbors = options.getNeighbors;
    this.toItem = options.toItem;
    this.getNodeKey = options.getNodeKey;
    this.random = options.random || Math.random;
    this.getSeed = options.getSeed || (async () => (options.seed ?? null));
    if (options.seed) {
      this.current = options.seed;
      const k = this.getNodeKey(this.current);
      if (k) this.visited.add(k);
    }
  }

  async next(): Promise<TItem | null> {
    for (let guard = 0; guard < 2000; guard++) {
      if (!this.current) {
        const seed = await this.getSeed();
        if (!seed) return null;
        this.current = seed;
        const k = this.getNodeKey(seed);
        if (k) this.visited.add(k);
        this.previous = null;
        this.previousEdge = null;
      }

      const neighbors = await this.getNeighbors(this.current);
      const candidates = (neighbors || []).filter((n) => {
        const key = this.getNodeKey(n.node);
        return Boolean(key) && !this.visited.has(key);
      });

      if (candidates.length === 0) {
        this.current = null;
        continue;
      }

      const picked = this.pickWeighted(candidates);
      const nextNode = picked.node;
      const nextKey = this.getNodeKey(nextNode);
      if (!nextKey) {
        continue;
      }

      this.previous = this.current;
      this.previousEdge = (picked.edge ?? null) as TEdge | null;
      this.current = nextNode;
      this.visited.add(nextKey);

      const item = await this.toItem(nextNode, { from: this.previous, edge: this.previousEdge });
      if (item) return item;
    }

    return null;
  }

  private pickWeighted(items: Array<WeightedNeighbor<TNode, TEdge>>): WeightedNeighbor<TNode, TEdge> {
    if (items.length === 1) return items[0];
    const weights = items.map((x) => Math.max(0, Number(x.weight) || 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      const idx = Math.floor(this.random() * items.length);
      return items[Math.max(0, Math.min(items.length - 1, idx))];
    }
    let r = this.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }
}
