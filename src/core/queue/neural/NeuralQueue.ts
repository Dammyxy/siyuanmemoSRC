/**
 * NeuralQueue - 神经漫游队列主控制器
 * 
 * 实现 IReviewQueue 接口，协调 HistoryFilter、QueryEngine 和 WeightedWalkEngine
 * 提供神经漫游复习的核心逻辑。
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 4.2, 6.5, 7.1, 7.2, 7.3, 7.4, 9.1, 9.4
 */

import type { QueueInterface, QueueItem } from '../types.ts';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import { HistoryFilter } from './HistoryFilter.ts';
import { QueryEngine, CardData } from './QueryEngine.ts';
import { WeightedWalkEngine } from './WeightedWalkEngine.ts';
import {
  NeuralQueueConfig,
  DEFAULT_NEURAL_QUEUE_CONFIG,
  AssociationType,
  WeightedNeighbor,
  NeuralContext,
} from './types.ts';

export class NeuralQueue implements QueueInterface<QueueItem> {
  /** 历史过滤器 */
  private readonly historyFilter: HistoryFilter;
  
  /** 查询引擎 */
  private readonly queryEngine: QueryEngine;
  
  /** 加权游走引擎 */
  private readonly weightedWalkEngine: WeightedWalkEngine;
  
  /** 配置 */
  private readonly config: NeuralQueueConfig;
  
  /** 当前种子卡片 ID */
  private currentSeedId: string | null = null;
  
  /** 用户指定的初始种子 ID */
  private readonly initialSeedId: string | null = null;
  
  /** 前一张卡片 ID（用于显示导航路径） */
  private previousCardId: string | null = null;
  
  /** 前一张卡片的关联类型 */

  // 🆕 Orbit 状态管理
  /** 种子节点集合 */
  private seedNodes: Set<string> = new Set();
  
  /** 遗落块映射：种子ID -> 遗落块列表 */
  private missedBlocks: Map<string, import('./types.ts').MissedBlock[]> = new Map();

  /**
   * 构造函数
   * 
   * @param config 配置对象（可选，使用默认配置）
   * @param initialSeedId 用户指定的初始种子 ID（可选）
   * Requirements: 2.1, 4.2
   */
  constructor(config?: Partial<NeuralQueueConfig>, initialSeedId?: string) {
    // 合并配置
    this.config = {
      ...DEFAULT_NEURAL_QUEUE_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_NEURAL_QUEUE_CONFIG.weights,
        ...config?.weights,
      },
      queryLimits: {
        ...DEFAULT_NEURAL_QUEUE_CONFIG.queryLimits,
        ...config?.queryLimits,
      },
      features: {
        ...DEFAULT_NEURAL_QUEUE_CONFIG.features,
        ...config?.features,
      },
    };

    // 初始化组件
    this.historyFilter = new HistoryFilter(this.config.historyCapacity);
    this.queryEngine = new QueryEngine(this.config);
    this.weightedWalkEngine = new WeightedWalkEngine({
      [AssociationType.REF_LINK]: this.config.weights.refLink,
      [AssociationType.HIERARCHY]: this.config.weights.hierarchy,
      [AssociationType.TAG]: this.config.weights.tag,
      [AssociationType.SIBLING]: this.config.weights.sibling,
    });

    // 保存用户指定的初始种子
    this.initialSeedId = initialSeedId || null;
    this.currentSeedId = this.initialSeedId;
  }

  /**
   * 添加项目到队列（神经队列不支持手动添加）
   * 
   * @param item 队列项
   */
  async addItem(item: QueueItem): Promise<void> {
    void item;
    // 神经队列通过漫游自动发现卡片，不支持手动添加
    console.warn('[NeuralQueue] addItem is not supported in neural queue');
  }

  /**
   * 获取下一张卡片（核心方法）
   * 
   * @returns 下一张卡片，如果没有则返回 null
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 6.5, 9.1, 9.4
   */
  async getNextItem(): Promise<QueueItem | null> {
    try {
      // 1. 初始化种子（如果需要）
      if (!this.currentSeedId) {
        this.currentSeedId = await this.pickRandomSeed();
        if (!this.currentSeedId) {
          console.warn('[NeuralQueue] No cards available in the pool');
          return null;
        }
        // 第一张卡片没有前驱
        this.previousCardId = null;
      }

      // 2. 获取当前种子的邻居
      const neighbors = await this.queryEngine.fetchNeighbors(this.currentSeedId);
      
      // 3. 使用历史过滤器过滤已访问的节点
      const unvisitedNeighbors = this.historyFilter.filter(
        neighbors.map(n => ({ id: n.id, type: n.type }))
      );

      // 4. 处理死胡同情况
      if (unvisitedNeighbors.length === 0) {
        console.log('[NeuralQueue] Dead end reached, picking new seed');
        const newSeed = await this.pickRandomSeed();
        if (!newSeed) {
          console.warn('[NeuralQueue] No more cards available');
          return null;
        }
        
        // 重置状态
        this.previousCardId = this.currentSeedId;
        this.currentSeedId = newSeed;
        
        // 递归调用获取下一张卡片
        return this.getNextItem();
      }

      // 5. 转换为 WeightedNeighbor 并应用权重
      const weightedNeighbors: WeightedNeighbor[] = unvisitedNeighbors.map(n => ({
        id: n.id,
        weight: 0, // 将由 weightedWalkEngine 分配
        associationType: n.type,
        reason: this.getReasonText(n.type),
      }));

      const neighborsWithWeights = this.weightedWalkEngine.applyWeights(weightedNeighbors);

      // 6. 使用加权随机选择下一个节点
      const selectedNeighbor = this.weightedWalkEngine.selectNext(neighborsWithWeights);
      if (!selectedNeighbor) {
        console.error('[NeuralQueue] Failed to select next neighbor');
        return null;
      }

      // 7. 获取卡片详情
      const cardData = await this.fetchCardDetails(selectedNeighbor.id);
      if (!cardData) {
        // 卡片不存在，从历史中移除并重试
        console.warn(`[NeuralQueue] Card ${selectedNeighbor.id} not found, retrying`);
        this.historyFilter.add(selectedNeighbor.id);
        return this.getNextItem();
      }

      // 8. 更新状态并添加到历史记录
      this.previousCardId = this.currentSeedId;
      this.currentSeedId = selectedNeighbor.id;
      
      // 🔑 关键：添加当前块及其所有子块到历史记录，避免重复展示
      await this.addBlockAndDescendantsToHistory(selectedNeighbor.id);

      // 9. 构造 QueueItem 并注入神经上下文
      const queueItem: QueueItem = {
        cardID: cardData.id,
        blockID: cardData.id,
        deckID: 'neural-roaming', // 神经漫游使用特殊的 deck ID
        priority: DEFAULT_PRIORITY,
        meta: {
          neuralContext: {
            previousCardId: this.previousCardId,
            associationType: selectedNeighbor.associationType,
            reason: selectedNeighbor.reason,
            blockType: cardData.blockType,
            isFlashcard: cardData.hasFlashcard,
          } as NeuralContext,
        },
      };

      return queueItem;
    } catch (error) {
      console.error('[NeuralQueue] Error in getNextItem:', error);
      return null;
    }
  }

  /**
   * 移除项目（神经队列不支持）
   * 
   * @param item 队列项
   * @returns 总是返回 false
   */
  async removeItem(item: QueueItem): Promise<boolean> {
    void item;
    console.warn('[NeuralQueue] removeItem is not supported in neural queue');
    return false;
  }

  /**
   * 获取队列大小（神经队列动态生成，返回历史大小）
   * 
   * @returns 历史记录大小
   */
  size(): number {
    return this.historyFilter.size();
  }

  /**
   * 检查队列是否为空（神经队列永远不为空，除非没有卡片）
   * 
   * @returns 总是返回 false
   */
  isEmpty(): boolean {
    return false;
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.historyFilter.clear();
    this.currentSeedId = this.initialSeedId;
    this.previousCardId = null;
  }

  /**
   * 获取历史快照（用于持久化）
   */
  getHistorySnapshot(): string[] {
    return this.historyFilter.snapshot();
  }

  /**
   * 恢复历史记录（从持久化恢复）
   */
  restoreHistory(snapshot: string[]): void {
    this.historyFilter.restore(snapshot);
  }

  /**
   * 随机选择一个种子卡片
   * 
   * @returns 种子卡片 ID，如果没有则返回 null
   * @private
   * Requirements: 4.1, 4.3, 9.3
   */
  private async pickRandomSeed(): Promise<string | null> {
    try {
      // 优先使用用户指定的初始种子
      if (this.initialSeedId && !this.historyFilter.has(this.initialSeedId)) {
        return this.initialSeedId;
      }

      // 随机选择一个未访问的卡片
      const randomCard = await this.queryEngine.fetchRandomCard();
      return randomCard;
    } catch (error) {
      console.error('[NeuralQueue] Failed to pick random seed:', error);
      return null;
    }
  }

  /**
   * 获取卡片详情
   * 
   * @param cardId 卡片 ID
   * @returns 卡片数据，如果不存在则返回 null
   * @private
   * Requirements: 9.4, 9.6
   */
  private async fetchCardDetails(cardId: string): Promise<CardData | null> {
    try {
      const cardData = await this.queryEngine.fetchCardData(cardId);
      if (!cardData) {
        console.error(`[NeuralQueue] Card not found: ${cardId}`);
      }
      return cardData;
    } catch (error) {
      console.error(`[NeuralQueue] Failed to fetch card details for ${cardId}:`, error);
      return null;
    }
  }

  /**
   * 获取关联类型的描述文本
   * 
   * @param type 关联类型
   * @returns 描述文本
   * @private
   */
  private getReasonText(type: AssociationType): string {
    const reasonMap: Record<AssociationType, string> = {
      [AssociationType.REF_LINK]: '双向链接',
      [AssociationType.HIERARCHY]: '同文档',
      [AssociationType.TAG]: '标签关联',
      [AssociationType.SIBLING]: '兄弟块',
    };
    return reasonMap[type] || '未知关联';
  }

  /**
   * 将块及其所有子块添加到历史记录
   * 
   * 避免"一炮三响"问题：如果展示了父列表项块，就不应该再展示它的子块。
   * 
   * @param blockId 块 ID
   * @private
   */
  private async addBlockAndDescendantsToHistory(blockId: string): Promise<void> {
    try {
      // 1. 添加当前块到历史记录
      this.historyFilter.add(blockId);
      
      // 2. 查询所有子块
      const descendants = await this.queryEngine.fetchDescendants(blockId);
      
      // 3. 将所有子块添加到历史记录
      if (descendants && descendants.length > 0) {
        for (const descendant of descendants) {
          this.historyFilter.add(descendant.id);
        }
        console.log(`[NeuralQueue] Added ${descendants.length} descendants of ${blockId} to history`);
      }
    } catch (error) {
      // 如果查询子块失败，只添加当前块（降级处理）
      console.error(`[NeuralQueue] Failed to fetch descendants for ${blockId}:`, error);
      this.historyFilter.add(blockId);
    }
  }

  // ============================================================================
  // Orbit 状态管理方法
  // ============================================================================

  /**
   * 设置种子块
   * 
   * 当用户选择一个候选块或遗落块作为种子时调用。
   * 将其他候选块记录为"遗落块"。
   * 
   * @param blockId 被选为种子的块 ID
   * @param currentCandidates 当前所有候选节点列表
   * Requirements: 4.1, 4.2, 4.3
   */
  public setSeed(blockId: string, currentCandidates: WeightedNeighbor[]): void {
    // 检查是否已经是种子
    if (this.seedNodes.has(blockId)) {
      console.warn(`[NeuralQueue] Block ${blockId} is already a seed`);
      return;
    }

    // 1. 标记为种子
    this.seedNodes.add(blockId);
    console.log(`[NeuralQueue] Set block ${blockId} as seed`);

    // 2. 将其他候选记录为遗落块
    const missed: import('./types.ts').MissedBlock[] = currentCandidates
      .filter(c => c.id !== blockId)
      .map(c => ({
        id: c.id,
        associationType: c.associationType,
        missedAt: Date.now(),
      }));

    this.missedBlocks.set(blockId, missed);
    console.log(`[NeuralQueue] Recorded ${missed.length} missed blocks for seed ${blockId}`);

    // 3. 更新当前种子
    this.previousCardId = this.currentSeedId;
    this.currentSeedId = blockId;
  }

  /**
   * 获取 Orbit 状态
   * 
   * 返回完整的 Orbit 可视化状态，包括历史路径、遗落块、当前节点和候选节点。
   * 
   * @returns Orbit 状态对象
   * Requirements: 10.1, 10.2
   */
  public getOrbitState(): import('./types.ts').OrbitState {
    return {
      historyPath: this.getNavigationPath(),
      missedBlocks: new Map(this.missedBlocks),
      currentNodeId: this.currentSeedId,
      candidateNodes: this.getCurrentCandidates(),
    };
  }

  /**
   * 获取当前候选节点（带关联类型）
   * 
   * @returns 候选节点列表
   * @private
   */
  private getCurrentCandidates(): import('./types.ts').CandidateNode[] {
    // TODO: 实现从 queryEngine 获取邻居的逻辑
    // 这需要在后续任务中与 QueryEngine 集成
    return [];
  }

  /**
   * 获取导航路径
   * 
   * 从历史过滤器获取访问过的卡片列表，并转换为导航路径节点格式。
   * 
   * @returns 导航路径节点列表
   * @private
   * Requirements: 10.1
   */
  private getNavigationPath(): import('./types.ts').NavigationPathNode[] {
    const history = this.historyFilter.snapshot();
    
    // 转换为 NavigationPathNode 格式
    return history.map((cardId, index) => ({
      cardId,
      cardTitle: '', // TODO: 需要从数据库获取标题
      associationType: AssociationType.REF_LINK, // 默认类型
      timestamp: Date.now() - (history.length - index) * 1000, // 估算时间戳
      isSeed: this.seedNodes.has(cardId),
    }));
  }
}

