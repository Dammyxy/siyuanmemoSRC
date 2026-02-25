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
import { createLogger } from '@/utils/logger';

const logger = createLogger('NeuralQueue');

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

  /** 🆕 上次缓存的候选节点（用于记录遗落块） */
  private lastCandidates: import('./types.ts').WeightedNeighbor[] = [];

  /** 🆕 方向遗落块存储（方向漫游专用） */
  private directionMissedBlocks: Map<AssociationType, import('./types.ts').MissedBlock[]> = new Map();

  /** 🔑 展示路径：只记录真正通过 getNextItem() 返回的卡片 */
  private displayPath: string[] = [];

  /** 🆕 路径导航指针（-1 表示未初始化，指向 displayPath 中的当前位置） */
  private currentPathIndex: number = -1;

  /** 🆕 导航模式：explore 探索新邻居 | follow 沿路径前进 */
  private navigationMode: 'explore' | 'follow' = 'explore';

  /** 🆕 书签位置（用于"返回最新"功能，-1 表示无书签） */
  private pathBookmark: number = -1;

  /** 🆕 验证缓存（避免重复验证） */
  private validationCache: Set<string> = new Set();
  /** 🆕 上次验证时间 */
  private lastValidationTime: number = 0;
  /** 🆕 验证间隔（毫秒） */
  private readonly VALIDATION_INTERVAL = 60000; // 1分钟

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
      // 🆕 概念卡专用权重
      [AssociationType.BACKLINK]: this.config.weights.backlink,
      [AssociationType.CONCEPT_LINK]: this.config.weights.conceptLink,
      [AssociationType.DESCRIPTOR]: this.config.weights.descriptor,
    });

    // 保存用户指定的初始种子
    this.initialSeedId = initialSeedId || null;
    this.currentSeedId = this.initialSeedId;

    // 🔧 延迟执行自动验证（不阻塞初始化）
    setTimeout(async () => {
      await this.validateSeedBlocks();
    }, 1000);
  }

  /**
   * 🆕 恢复种子节点集合（从持久化数据恢复）
   *
   * 用于在初始化后批量添加种子块，避免触发 setSeed 的副作用（如记录遗落块）
   *
   * @param seedIds 种子块 ID 列表
   */
  restoreSeedNodes(seedIds: string[]): void {
    logger.info(`Restoring ${seedIds.length} seed nodes:`, seedIds.map(id => id.substring(0, 12)));
    for (const seedId of seedIds) {
      this.seedNodes.add(seedId);
    }
    logger.info(`Seed nodes restored, total: ${this.seedNodes.size}`);
  }

  /**
   * 添加项目到队列（神经队列不支持手动添加）
   * 
   * @param item 队列项
   */
  async addItem(item: QueueItem): Promise<void> {
    void item;
    // 神经队列通过漫游自动发现卡片，不支持手动添加
    logger.warn('addItem is not supported in neural queue');
  }

  /**
   * 获取下一张卡片（核心方法）
   *
   * 🆕 支持双模式导航：
   * - follow 模式：沿历史路径前进（返回 displayPath[currentPathIndex + 1]）
   * - explore 模式：探索新邻居（原有逻辑）
   *
   * @returns 下一张卡片，如果没有则返回 null
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 6.5, 9.1, 9.4
   */
  async getNextItem(): Promise<QueueItem | null> {
    try {
      // 🆕 1. 如果是 follow 模式 + 路径内有下一个节点
      if (this.navigationMode === 'follow' &&
          this.currentPathIndex >= 0 &&
          this.currentPathIndex < this.displayPath.length - 1) {
        const nextNodeId = this.displayPath[this.currentPathIndex + 1];
        this.currentPathIndex++;

        logger.info(`Follow mode: moving to next node in path (index: ${this.currentPathIndex}, id: ${nextNodeId})`);

        // 获取卡片详情并返回
        const cardData = await this.fetchCardDetails(nextNodeId);
        if (!cardData) {
          // 节点不存在，退出 follow 模式
          logger.warn(`Follow mode: node ${nextNodeId} not found, switching to explore mode`);
          this.navigationMode = 'explore';
          return this.getNextItem(); // 递归调用（explore 模式）
        }

        // 更新当前种子
        this.previousCardId = this.currentSeedId;
        this.currentSeedId = nextNodeId;

        return this.buildQueueItem(cardData);
      }

      // 🆕 2. explore 模式或路径已到末尾 - 使用原逻辑
      if (this.navigationMode === 'follow') {
        logger.info('Follow mode: reached end of path, switching to explore mode');
        this.navigationMode = 'explore'; // 自动切换到 explore
      }

      const item = await this.getNextItemExplore();

      // 🆕 3. 更新路径指针（explore 模式下追加新节点）
      if (item) {
        // 🔧 检查节点是否已存在于路径中
        const existingIndex = this.displayPath.indexOf(item.blockId);

        if (existingIndex !== -1) {
          // 节点已存在：跳转到该位置（不追加）
          this.currentPathIndex = existingIndex;
          logger.info(`Node ${item.blockId.substring(0, 8)} already in path, jumped to index ${existingIndex} (total: ${this.displayPath.length})`);
        } else {
          // 节点不存在：追加到路径
          // 如果当前不在路径末尾，截断后续路径（类似浏览器历史的"分支"行为）
          if (this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length - 1) {
            this.displayPath = this.displayPath.slice(0, this.currentPathIndex + 1);
            logger.info(`Explore mode: truncated path to index ${this.currentPathIndex}`);
          }

          this.displayPath.push(item.blockId);
          this.currentPathIndex = this.displayPath.length - 1;
          logger.info(`Explore mode: added new node to path (index: ${this.currentPathIndex}, total: ${this.displayPath.length})`);
        }
      }

      return item;
    } catch (error) {
      logger.error('Error in getNextItem:', error);
      return null;
    }
  }

  /**
   * 🆕 获取下一张卡片（探索模式）
   *
   * 原 getNextItem() 的核心逻辑，负责：
   * - 初始化种子
   * - 获取邻居节点
   * - 加权随机选择
   * - 添加到历史记录
   *
   * @returns 下一张卡片，如果没有则返回 null
   * @private
   */
  private async getNextItemExplore(): Promise<QueueItem | null> {
    // 1. 初始化种子（如果需要）
    if (!this.currentSeedId) {
      this.currentSeedId = await this.pickRandomSeed();
      if (!this.currentSeedId) {
        logger.warn('No cards available in the pool');
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
      logger.info('Dead end reached');
      
      // 🔧 如果当前种子还没有被返回过（不在 displayPath 中），返回当前种子
      if (!this.displayPath.includes(this.currentSeedId)) {
        logger.info(`Returning current seed as it hasn't been displayed: ${this.currentSeedId}`);
        const cardData = await this.fetchCardDetails(this.currentSeedId);
        if (cardData) {
          await this.addBlockAndDescendantsToHistory(this.currentSeedId);
          return this.buildQueueItem(cardData, AssociationType.SEED, '种子节点');
        }
      }
      
      // 尝试选择新种子
      logger.info('Picking new seed');
      const newSeed = await this.pickRandomSeed();
      if (!newSeed) {
        logger.warn('No more cards available');
        return null;
      }

      // 重置状态
      this.previousCardId = this.currentSeedId;
      this.currentSeedId = newSeed;

      // 递归调用获取下一张卡片
      return this.getNextItemExplore();
    }

    // 5. 转换为 WeightedNeighbor 并应用权重
    const weightedNeighbors: WeightedNeighbor[] = unvisitedNeighbors.map(n => ({
      id: n.id,
      weight: 0, // 将由 weightedWalkEngine 分配
      associationType: n.type,
      reason: this.getReasonText(n.type),
    }));

    const neighborsWithWeights = this.weightedWalkEngine.applyWeights(weightedNeighbors);

    // 🔧 缓存当前候选节点（用于记录遗落块）
    this.lastCandidates = neighborsWithWeights;

    // 6. 使用加权随机选择下一个节点
    const selectedNeighbor = this.weightedWalkEngine.selectNext(neighborsWithWeights);
    if (!selectedNeighbor) {
      logger.error('Failed to select next neighbor');
      return null;
    }

    // 7. 获取卡片详情
    const cardData = await this.fetchCardDetails(selectedNeighbor.id);
    if (!cardData) {
      // 卡片不存在，从历史中移除并重试
      logger.warn(`Card ${selectedNeighbor.id} not found, retrying`);
      this.historyFilter.add(selectedNeighbor.id);
      return this.getNextItemExplore();
    }

    // 8. 更新状态并添加到历史记录
    this.previousCardId = this.currentSeedId;
    this.currentSeedId = selectedNeighbor.id;

    // 🔑 关键：添加当前块及其所有子块到历史记录，避免重复展示
    await this.addBlockAndDescendantsToHistory(selectedNeighbor.id);

    // 9. 构造 QueueItem 并注入神经上下文
    return this.buildQueueItem(cardData, selectedNeighbor.associationType, selectedNeighbor.reason);
  }

  /**
   * 🆕 构造 QueueItem（辅助方法）
   *
   * @param cardData 卡片数据
   * @param associationType 关联类型（可选，默认为 REF_LINK）
   * @param reason 关联原因（可选）
   * @returns QueueItem
   * @private
   */
  private buildQueueItem(
    cardData: CardData,
    associationType?: AssociationType,
    reason?: string
  ): QueueItem {
    return {
      id: cardData.id,
      blockId: cardData.id,
      deckId: 'neural-roaming', // 神经漫游使用特殊的 deck ID
      priority: DEFAULT_PRIORITY,
      meta: {
        neuralContext: {
          previousCardId: this.previousCardId,
          associationType: associationType || AssociationType.REF_LINK,
          reason: reason || this.getReasonText(associationType || AssociationType.REF_LINK),
          blockType: cardData.blockType,
          isFlashcard: cardData.hasFlashcard,
        } as NeuralContext,
      },
    };
  }

  /**
   * 移除项目（神经队列不支持）
   * 
   * @param item 队列项
   * @returns 总是返回 false
   */
  async removeItem(item: QueueItem): Promise<boolean> {
    void item;
    logger.warn('removeItem is not supported in neural queue');
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
    this.displayPath = []; // 同时清空展示路径
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
        // 🔒 检查初始种子是否为概念卡
        const isConceptCard = await this.queryEngine.isConceptCard(this.initialSeedId);
        if (isConceptCard) {
          logger.info(`Using initial seed (concept card): ${this.initialSeedId}`);
          return this.initialSeedId;
        } else {
          logger.warn(`Initial seed ${this.initialSeedId} is not a concept card, will pick random concept card`);
        }
      }

      // 🔧 优先从 seedNodes 中选择未访问的种子
      if (this.seedNodes.size > 0) {
        const unvisitedSeeds = Array.from(this.seedNodes).filter(
          seedId => !this.historyFilter.has(seedId)
        );
        
        if (unvisitedSeeds.length > 0) {
          // 随机选择一个未访问的种子
          const randomIndex = Math.floor(Math.random() * unvisitedSeeds.length);
          const selectedSeed = unvisitedSeeds[randomIndex];
          logger.info(`Selected unvisited seed from seedNodes: ${selectedSeed}`);
          return selectedSeed;
        } else {
          logger.info('All seeds in seedNodes have been visited');
        }
      }

      // 随机选择一个未访问的概念卡
      const randomCard = await this.queryEngine.fetchRandomCard();
      return randomCard;
    } catch (error) {
      logger.error('Failed to pick random seed:', error);
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
        logger.error(`Card not found: ${cardId}`);
      }
      return cardData;
    } catch (error) {
      logger.error(`Failed to fetch card details for ${cardId}:`, error);
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
      // 🆕 概念卡专用类型
      [AssociationType.BACKLINK]: '反向链接',
      [AssociationType.CONCEPT_LINK]: '概念关联',
      [AssociationType.DESCRIPTOR]: '描述符卡',
      [AssociationType.SEED]: '种子节点',
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
        logger.info(`Added ${descendants.length} descendants of ${blockId} to history`);
      }
    } catch (error) {
      // 如果查询子块失败，只添加当前块（降级处理）
      logger.error(`Failed to fetch descendants for ${blockId}:`, error);
      this.historyFilter.add(blockId);
    }
  }

  // ============================================================================
  // Orbit 状态管理方法
  // ============================================================================

  /**
   * 设置种子块
   *
   * 🆕 保留完整路径并追加新种子（不清空历史）
   *
   * 当用户选择一个候选块或遗落块作为种子时调用。
   * 将其他候选块记录为"遗落块"。
   *
   * @param blockId 被选为种子的块 ID
   * @param currentCandidates 当前所有候选节点列表
   * Requirements: 4.1, 4.2, 4.3
   */
  public async setSeed(blockId: string, currentCandidates: WeightedNeighbor[]): Promise<void> {
    // 🔧 验证种子块是否存在
    try {
      const exists = await this.queryEngine.fetchCardData(blockId);
      if (!exists) {
        throw new Error(`Cannot set seed: block ${blockId} does not exist`);
      }
    } catch (error) {
      logger.error(`Seed validation failed for ${blockId}:`, error);
      throw new Error(`Cannot set seed: block ${blockId} is invalid`);
    }

    // 检查是否已经是种子
    const isAlreadySeed = this.seedNodes.has(blockId);

    if (isAlreadySeed) {
      logger.warn(`Block ${blockId} is already a seed`);
      // 🆕 即使已经是种子，也要跳转到该位置（更新路径指针）
      if (this.displayPath.includes(blockId)) {
        const index = this.displayPath.indexOf(blockId);
        this.currentPathIndex = index;
        logger.info(`Jumped to existing seed at index ${index} (total: ${this.displayPath.length})`);
      }
      this.navigationMode = 'explore'; // 切换到探索模式
      return;
    }

    // 1. 标记为种子
    this.seedNodes.add(blockId);
    logger.info(`Set block ${blockId} as seed`);

    // 2. 将其他候选记录为遗落块
    const missed: import('./types.ts').MissedBlock[] = currentCandidates
      .filter(c => c.id !== blockId)
      .map(c => ({
        id: c.id,
        associationType: c.associationType,
        missedAt: Date.now(),
      }));

    this.missedBlocks.set(blockId, missed);
    logger.info(`Recorded ${missed.length} missed blocks for seed ${blockId}`);

    // 3. 更新当前种子
    this.previousCardId = this.currentSeedId;
    this.currentSeedId = blockId;
    if (!this.historyFilter.has(blockId)) {
      this.historyFilter.add(blockId);
    }

    // 🆕 4. 追加到路径末尾（而非清空）
    if (!this.displayPath.includes(blockId)) {
      // 如果不在路径中，追加到末尾
      this.displayPath.push(blockId);
      this.currentPathIndex = this.displayPath.length - 1;
      logger.info(`Appended seed ${blockId} to path (index: ${this.currentPathIndex}, total: ${this.displayPath.length})`);
    } else {
      // 如果已在路径中，跳转到该位置（复用 jumpToHistoryNode 逻辑）
      const index = this.displayPath.indexOf(blockId);
      this.currentPathIndex = index;
      logger.info(`Seed ${blockId} already in path, jumped to index ${index} (total: ${this.displayPath.length})`);
    }

    // 🆕 5. 切换到 explore 模式（从新种子开始探索）
    this.navigationMode = 'explore';
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
   * 注意：这个方法返回缓存的候选节点。
   * 实际的候选节点在 getNextItem() 中从 queryEngine 获取。
   * 
   * @returns 候选节点列表
   * @private
   */
  private getCurrentCandidates(): import('./types.ts').CandidateNode[] {
    // 返回上次缓存的候选节点
    return (this.lastCandidates || []).map(candidate => ({
      id: candidate.id,
      associationType: candidate.associationType,
      weight: candidate.weight,
      reason: candidate.reason,
    }));
  }

  /**
   * 获取导航路径
   *
   * 返回真正展示过的卡片路径（不包括自动添加的子块）
   *
   * @returns 导航路径节点列表
   * @private
   * Requirements: 10.1
   */
  private async getNavigationPath(): Promise<import('./types.ts').NavigationPathNode[]> {
    // 使用展示路径，只包含真正通过 getNextItem() 返回的卡片
    const path = [...this.displayPath];
    const currentId = this.currentSeedId;

    // 🔧 调试：记录种子节点集合的内容
    logger.info('getNavigationPath - seedNodes Set:', {
      size: this.seedNodes.size,
      seeds: Array.from(this.seedNodes).map(id => id.substring(0, 12)),
      displayPathLength: path.length,
      displayPathIds: path.map(id => id.substring(0, 12)),
      currentSeedId: currentId?.substring(0, 12),
    });

    // 如果当前节点不在路径中，添加到末尾
    if (currentId && !path.includes(currentId)) {
      path.push(currentId);
    }

    // 批量查询块内容
    const contentMap = await this.queryEngine.fetchBlockContents(path);

    // 转换为 NavigationPathNode 格式
    const result = path.map((cardId, index) => ({
      cardId,
      cardTitle: contentMap.get(cardId) || cardId.substring(0, 8) + '...',
      associationType: AssociationType.REF_LINK,
      timestamp: Date.now() - (path.length - index) * 1000,
      isSeed: this.seedNodes.has(cardId),
    }));

    // 🔧 调试：记录哪些节点被标记为种子
    logger.info('getNavigationPath - result:', {
      totalNodes: result.length,
      seedCount: result.filter(n => n.isSeed).length,
      seedNodes: result.filter(n => n.isSeed).map(n => ({
        id: n.cardId.substring(0, 12),
        title: n.cardTitle?.substring(0, 30),
      })),
    });

    return result;
  }

  /**
   * 获取当前候选节点（用于 setSeed）
   * 
   * 返回当前缓存的候选节点列表，用于在设置种子时记录遗落块。
   * 
   * @returns 候选节点（WeightedNeighbor 格式）
   * @public
   */
  public getCurrentCandidatesForSeed(): import('./types.ts').WeightedNeighbor[] {
    // 从 lastCandidates 返回缓存的候选
    return this.lastCandidates || [];
  }

  /**
   * 获取遗落块数据
   * 
   * @returns 遗落块 Map
   * @public
   */
  public getMissedBlocks(): Map<string, import('./types.ts').MissedBlock[]> {
    return new Map(this.missedBlocks);
  }

  /**
   * 恢复遗落块数据
   *
   * 用于在重新初始化后恢复之前记录的遗落块。
   *
   * @param missedBlocks 遗落块 Map
   * @public
   */
  public restoreMissedBlocks(missedBlocks: Map<string, import('./types.ts').MissedBlock[]>): void {
    this.missedBlocks = new Map(missedBlocks);
    logger.info(`Restored ${missedBlocks.size} missed block entries`);
  }

  // ===== 🆕 方向漫游扩展方法（Orbit v2.0） =====

  /**
   * 🆕 获取指定方向的候选节点
   *
   * @param nodeId 节点 ID
   * @param direction 关联类型
   * @returns 该方向的候选节点列表
   */
  public async getCandidatesForDirection(
    nodeId: string,
    direction: AssociationType
  ): Promise<import('./types.ts').WeightedNeighbor[]> {
    const allNeighbors = await this.queryEngine.fetchNeighbors(nodeId);
    return allNeighbors
      .filter(n => n.associationType === direction)
      .map(n => ({
        id: n.id,
        weight: n.weight || 0,
        associationType: n.associationType,
        reason: this.getReasonText(n.associationType),
      }));
  }

  /**
   * 🆕 获取所有方向的候选节点（分组）
   *
   * @param nodeId 节点 ID
   * @returns 按关联类型分组的候选节点 Map
   */
  public async getCandidatesByDirection(
    nodeId: string
  ): Promise<Map<AssociationType, import('./types.ts').WeightedNeighbor[]>> {
    const allNeighbors = await this.queryEngine.fetchNeighbors(nodeId);
    const grouped = new Map<AssociationType, import('./types.ts').WeightedNeighbor[]>();

    // 收集所有 ID 用于批量查询内容
    const allIds = allNeighbors.map(n => n.id);
    const contentMap = await this.queryEngine.fetchBlockContents(allIds);

    for (const neighbor of allNeighbors) {
      if (!grouped.has(neighbor.type)) {
        grouped.set(neighbor.type, []);
      }
      grouped.get(neighbor.type)!.push({
        id: neighbor.id,
        blockId: neighbor.id, // 修复：添加缺失的 blockId 字段
        title: contentMap.get(neighbor.id) || neighbor.id.substring(0, 8) + '...', // 添加块内容
        weight: (neighbor as any).weight || 0,
        associationType: neighbor.type, // 修复：使用正确的字段名 type
        reason: this.getReasonText(neighbor.type), // 修复：使用正确的字段名 type
      });
    }

    return grouped;
  }

  /**
   * 🆕 记录方向遗落块
   *
   * 当用户切换方向时，将当前方向的未选中候选记为遗落。
   *
   * @param direction 关联类型
   * @param candidateIds 候选块 ID 列表
   */
  public recordDirectionMissed(direction: AssociationType, candidateIds: string[]): void {
    this.directionMissedBlocks.set(
      direction,
      candidateIds.map(id => ({
        id,
        blockId: id,
        associationType: direction,
        missedAt: Date.now(),
      }))
    );
    logger.info(`Recorded ${candidateIds.length} missed blocks for direction: ${direction}`);
  }

  /**
   * 🆕 获取增强的 Orbit 状态（v2 - 支持方向漫游）
   *
   * @param selectedDirection 当前选中的方向
   * @returns Orbit 状态对象
   */
  public async getOrbitStateV2(
    selectedDirection: 'AUTO' | AssociationType
  ): Promise<any> {
    // 🔧 在获取状态前验证种子块（非阻塞，使用缓存）
    this.validateSeedBlocks().catch(err => {
      logger.warn('Seed validation failed during getOrbitStateV2:', err);
    });

    const currentNodeId = this.currentSeedId;
    logger.info('getOrbitStateV2 called:', { currentNodeId, selectedDirection });

    if (!currentNodeId) {
      logger.info('getOrbitStateV2: No current node, returning empty state');
      // 返回空状态
      return {
        historyPath: [],
        currentNodeId: null,
        selectedDirection,
        autoModeDirections: [AssociationType.REF_LINK, AssociationType.HIERARCHY],
        candidatesByDirection: new Map(),
        seedMissedBlocks: new Map(),
        directionMissedBlocks: new Map(),
      };
    }

    const candidatesByDirection = await this.getCandidatesByDirection(currentNodeId);
    const historyPath = await this.getNavigationPath(); // 改为 await

    logger.info('getOrbitStateV2 result:', {
      historyPathLength: historyPath.length,
      candidatesByDirectionSize: candidatesByDirection.size,
      candidatesByDirectionKeys: Array.from(candidatesByDirection.keys()),
      candidateCounts: Array.from(candidatesByDirection.entries()).map(([k, v]) => `${k}: ${v.length}`),
      // 🆕 显示哪些节点是种子块
      seedNodes: historyPath.filter(n => n.isSeed).map(n => ({
        cardId: n.cardId?.substring(0, 12),
        title: n.cardTitle?.substring(0, 30),
      })),
    });

    return {
      historyPath,
      currentNodeId,
      selectedDirection,
      autoModeDirections: [AssociationType.REF_LINK, AssociationType.HIERARCHY],
      candidatesByDirection,
      seedMissedBlocks: new Map(this.missedBlocks),
      directionMissedBlocks: new Map(this.directionMissedBlocks),
    };
  }

  /**
   * 🆕 获取方向遗落块
   *
   * @returns 方向遗落块 Map
   */
  public getDirectionMissedBlocks(): Map<AssociationType, import('./types.ts').MissedBlock[]> {
    return new Map(this.directionMissedBlocks);
  }

  /**
   * 🆕 清除方向遗落块
   */
  public clearDirectionMissedBlocks(): void {
    this.directionMissedBlocks.clear();
    logger.info('Cleared direction missed blocks');
  }

  // ============================================================================
  // 路径导航系统（Path Navigation System）
  // ============================================================================

  private resolvePathIndex(nodeId: string, method: string): number {
    const index = this.displayPath.indexOf(nodeId);
    if (index === -1) {
      logger.warn(`${method}: node ${nodeId} not found in display path`);
    }
    return index;
  }

  private hasValidPathIndex(index: number): boolean {
    return index >= 0 && index < this.displayPath.length;
  }

  private cleanupInvalidSeedState(seedId: string): void {
    this.missedBlocks.delete(seedId);
    this.validationCache.delete(seedId);
  }

  /**
   * 🆕 跳转到历史路径中的指定节点
   *
   * 当用户点击历史节点时调用。设置当前位置指针，保存书签，并切换为 follow 模式。
   *
   * @param nodeId 目标节点 ID
   * @returns 是否成功跳转（节点存在于路径中返回 true）
   */
  public jumpToHistoryNode(nodeId: string): boolean {
    const index = this.resolvePathIndex(nodeId, 'jumpToHistoryNode');
    if (index === -1) {
      return false;
    }

    // 保存当前位置为书签（用于"返回最新"）
    if (this.currentPathIndex !== -1 && this.currentPathIndex !== index) {
      this.pathBookmark = this.currentPathIndex;
      logger.info(`Bookmark saved at index ${this.pathBookmark}`);
    }

    // 跳转到目标位置
    this.currentPathIndex = index;
    this.currentSeedId = nodeId;
    this.navigationMode = 'follow'; // 默认进入"沿路径"模式

    logger.info(`Jumped to history node ${nodeId} (index: ${index}, mode: follow)`);
    return true;
  }

  /**
   * 🆕 选中历史路径中的指定节点（仅查看，不跳转）
   *
   * 当用户左键点击历史节点时调用。仅用于加载卡片内容到 UI，
   * 不改变当前路径指针、种子 ID 或导航模式。
   *
   * 与 jumpToHistoryNode 的区别：
   * - jumpToHistoryNode: 改变路径位置，轨道区会跟随移动
   * - selectHistoryNode: 仅加载卡片，轨道区保持当前位置
   *
   * @param nodeId 目标节点 ID
   * @returns 是否成功选中（节点存在于路径中返回 true）
   */
  public selectHistoryNode(nodeId: string): boolean {
    const index = this.resolvePathIndex(nodeId, 'selectHistoryNode');
    if (index === -1) {
      return false;
    }

    // 仅记录日志，不改变任何状态
    logger.info(`Selected history node ${nodeId} (index: ${index}) without changing position`);
    return true;
  }

  /**
   * 🆕 获取指定路径位置的卡片项（不改变当前索引）
   *
   * 用于加载历史节点的完整卡片数据到 UI。
   * 不改变 currentPathIndex，不改变导航状态。
   *
   * @param nodeId 目标节点 ID
   * @returns 完整 QueueItem，如果节点不存在则返回 null
   */
  public async getPathItemByNodeId(nodeId: string): Promise<QueueItem | null> {
    const index = this.resolvePathIndex(nodeId, 'getPathItemByNodeId');
    if (index === -1) {
      return null;
    }

    const cardData = await this.fetchCardDetails(nodeId);

    if (!cardData) {
      logger.warn(`getPathItemByNodeId: node ${nodeId} not found`);
      return null;
    }

    return this.buildQueueItem(cardData);
  }

  /**
   * 🆕 获取当前路径位置的卡片项（不推进索引）
   *
   * 用于历史节点跳转后获取完整卡片数据，而不是创建空壳临时对象。
   * 这确保 UI 适配器的 toUIState 能获取到真实的卡片信息。
   *
   * @returns 当前路径位置的完整 QueueItem，如果位置无效或卡片不存在则返回 null
   */
  public async getCurrentPathItem(): Promise<QueueItem | null> {
    if (!this.hasValidPathIndex(this.currentPathIndex)) {
      logger.warn(`getCurrentPathItem: invalid path index ${this.currentPathIndex}`);
      return null;
    }

    const nodeId = this.displayPath[this.currentPathIndex];
    const cardData = await this.fetchCardDetails(nodeId);

    if (!cardData) {
      logger.warn(`getCurrentPathItem: node ${nodeId} not found`);
      return null;
    }

    return this.buildQueueItem(cardData);
  }

  /**
   * 🆕 切换导航模式
   *
   * @param mode 导航模式：'explore' 探索新邻居 | 'follow' 沿路径前进
   */
  public setNavigationMode(mode: 'explore' | 'follow'): void {
    this.navigationMode = mode;
    logger.info(`Navigation mode set to: ${mode}`);
  }

  /**
   * 🆕 返回书签位置
   *
   * 用于"返回最新"功能。跳转回书签保存的位置，并清除书签。
   *
   * @returns 是否成功返回（有书签且位置有效返回 true）
   */
  public returnToBookmark(): boolean {
    if (this.pathBookmark === -1) {
      logger.warn('No bookmark to return to');
      return false;
    }

    if (!this.hasValidPathIndex(this.pathBookmark)) {
      logger.warn('Bookmark index out of range');
      this.pathBookmark = -1;
      return false;
    }

    const bookmarkNodeId = this.displayPath[this.pathBookmark];
    this.currentPathIndex = this.pathBookmark;
    this.currentSeedId = bookmarkNodeId;
    this.pathBookmark = -1; // 清除书签

    logger.info(`Returned to bookmark (index: ${this.currentPathIndex}, node: ${bookmarkNodeId})`);
    return true;
  }

  /**
   * 🆕 获取导航状态
   *
   * @returns 导航状态对象
   */
  public getNavigationState(): {
    currentPathIndex: number;
    navigationMode: 'explore' | 'follow';
    hasBookmark: boolean;
    pathLength: number;
    displayPath: string[];  // 🆕 添加完整路径
  } {
    return {
      currentPathIndex: this.currentPathIndex,
      navigationMode: this.navigationMode,
      hasBookmark: this.pathBookmark !== -1,
      pathLength: this.displayPath.length,
      displayPath: [...this.displayPath],  // 🆕 返回路径副本
    };
  }

  /**
   * 🆕 恢复导航状态
   *
   * 用于重建 NeuralQueue 实例后恢复之前的路径状态。
   *
   * @param state 导航状态对象
   */
  public restoreNavigationState(state: {
    displayPath: string[];
    currentPathIndex: number;
    navigationMode: 'explore' | 'follow';
  }): void {
    this.displayPath = [...state.displayPath];
    this.currentPathIndex = state.currentPathIndex;
    this.navigationMode = state.navigationMode;
    logger.info(`Navigation state restored: index ${this.currentPathIndex}, total ${this.displayPath.length}, mode ${this.navigationMode}`);
  }

  // ============================================================================
  // 🆕 种子块验证机制（Seed Block Validation）
  // ============================================================================

  /**
   * 🔧 验证种子块是否存在
   *
   * 检查所有种子块是否仍然存在于数据库中，清理无效的种子和相关遗落块。
   *
   * @private
   */
  private async validateSeedBlocks(): Promise<void> {
    const now = Date.now();
    const timeSinceLastValidation = now - this.lastValidationTime;

    // 避免频繁验证（1分钟内只验证一次）
    if (timeSinceLastValidation < this.VALIDATION_INTERVAL && this.validationCache.size > 0) {
      logger.info('Skipping validation (cached, last validation was ' +
        `${Math.round(timeSinceLastValidation / 1000)}s ago)`);
      return;
    }

    logger.info('Starting seed block validation...');
    const validSeeds = new Set<string>();
    const invalidSeeds: string[] = [];

    // 并发验证所有种子（提高性能）
    const validationPromises = Array.from(this.seedNodes).map(async (seedId) => {
      try {
        const exists = await this.queryEngine.fetchCardData(seedId);
        return { seedId, exists: !!exists };
      } catch (error) {
        logger.warn(`Error validating seed ${seedId}:`, error);
        return { seedId, exists: false };
      }
    });

    const results = await Promise.all(validationPromises);

    for (const { seedId, exists } of results) {
      if (exists) {
        validSeeds.add(seedId);
        this.validationCache.add(seedId);
      } else {
        invalidSeeds.push(seedId);
        logger.warn(`Removing invalid seed: ${seedId}`);
        // 清理相关的遗落块
        this.cleanupInvalidSeedState(seedId);
      }
    }

    if (invalidSeeds.length > 0) {
      logger.info(`Cleaned up ${invalidSeeds.length} invalid seeds:`, invalidSeeds);
      this.seedNodes = validSeeds;

      // 持久化更新后的种子集合
      this.persistSeedBlocks();
    }

    this.lastValidationTime = now;
    logger.info(`Seed validation completed: ${validSeeds.size} valid, ${invalidSeeds.length} invalid`);
  }

  /**
   * 🔧 自动修复队列状态
   *
   * 公共方法：清理无效数据，验证种子块，修复不一致状态。
   *
   * @returns 修复统计信息
   */
  public async autoRepair(): Promise<{
    seedsCleaned: number;
    missedBlocksCleaned: number;
  }> {
    logger.info('Starting auto-repair...');

    // 1. 验证并清理种子块
    const validSeeds = new Set<string>();
    let seedsCleaned = 0;

    const validationPromises = Array.from(this.seedNodes).map(async (seedId) => {
      try {
        const exists = await this.queryEngine.fetchCardData(seedId);
        return { seedId, exists: !!exists };
      } catch (error) {
        return { seedId, exists: false };
      }
    });

    const results = await Promise.all(validationPromises);

    for (const { seedId, exists } of results) {
      if (exists) {
        validSeeds.add(seedId);
      } else {
        seedsCleaned++;
        this.cleanupInvalidSeedState(seedId);
      }
    }

    this.seedNodes = validSeeds;

    // 2. 清理空的遗落块记录
    let missedBlocksCleaned = 0;
    const emptyMissedEntries: string[] = [];

    this.missedBlocks.forEach((blocks, seedId) => {
      if (blocks.length === 0 || !this.seedNodes.has(seedId)) {
        emptyMissedEntries.push(seedId);
      }
    });

    emptyMissedEntries.forEach(seedId => {
      this.missedBlocks.delete(seedId);
      missedBlocksCleaned++;
    });

    // 3. 如果没有有效种子，尝试使用当前种子
    if (this.seedNodes.size === 0 && this.currentSeedId) {
      logger.warn('No valid seeds found, trying to use current seed');
      const currentExists = await this.queryEngine.fetchCardData(this.currentSeedId);
      if (currentExists) {
        this.seedNodes.add(this.currentSeedId);
        logger.info('Added current seed as valid seed');
      }
    }

    // 4. 持久化修复后的状态
    this.persistSeedBlocks();

    logger.info(`Auto-repair completed: ${seedsCleaned} seeds, ${missedBlocksCleaned} missed block entries`);

    return { seedsCleaned, missedBlocksCleaned };
  }

  /**
   * 🔧 持久化种子块到存储
   *
   * @private
   */
  private persistSeedBlocks(): void {
    try {
      // 使用 NeuralQueueStorage 持久化
      const { NeuralQueueStorage } = require('./NeuralQueueStorage');
      const seedArray = Array.from(this.seedNodes);

      // 检查是否有 Orbit 状态需要保存
      const sessionState = NeuralQueueStorage.loadSessionState();
      if (sessionState) {
        // 更新现有会话状态
        sessionState.seedNodes = seedArray;
        NeuralQueueStorage.saveSessionState(sessionState);
      } else {
        // 创建新的会话状态
        NeuralQueueStorage.saveOrbitState(
          seedArray,
          this.missedBlocks,
          [] // navigationPath 将由外部提供
        );
      }

      logger.info(`Persisted ${seedArray.length} seed blocks`);
    } catch (error) {
      logger.error('Failed to persist seed blocks:', error);
    }
  }

  /**
   * 🔧 触发验证（在关键时刻调用）
   *
   * @param force 是否强制验证（忽略缓存）
   */
  public async triggerValidation(force = false): Promise<void> {
    if (force) {
      this.validationCache.clear();
      this.lastValidationTime = 0;
    }
    await this.validateSeedBlocks();
  }
}
