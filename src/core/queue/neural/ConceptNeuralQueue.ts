/**
 * 概念卡神经漫游队列
 * 
 * 专门为概念卡设计的简化神经漫游实现：
 * - 只支持概念卡作为种子
 * - 邻居包括：反链、正链、描述符卡
 * - 简单清晰的状态管理
 */

import { ConceptQueryEngine, type Neighbor, type BlockData } from './ConceptQueryEngine';

export interface QueueItem {
  id: string;
  blockId: string;
  deckId: string;
  blockData: BlockData;
  associationType: string;
  reason: string;
}

/**
 * 种子状态
 */
interface SeedState {
  blockId: string;
  priority: number;        // 种子优先级（0-1）
  neighborsViewed: number; // 已漫游的邻居数
  addedAt: number;         // 添加时间戳
}

export class ConceptNeuralQueue {
  // 状态
  private currentSeed: string | null = null;
  private visitedBlocks: Set<string> = new Set();
  private displayPath: string[] = [];
  private seeds: Map<string, SeedState> = new Map(); // 改用 Map 存储种子状态
  
  // 配置
  private neighborsPerRound = 5; // 每轮漫游 5 个邻居
  
  // 依赖
  private queryEngine: ConceptQueryEngine;
  
  // 🆕 预加载缓存
  private preloadedCard: QueueItem | null = null;
  private isPreloading = false;
  
  constructor() {
    this.queryEngine = new ConceptQueryEngine();
  }

  /**
   * 获取下一张卡片
   * 
   * @returns 下一张卡片，如果队列耗尽则返回 null
   */
  async getNextCard(): Promise<QueueItem | null> {
    try {
      console.log('[SiyuanMemo][ConceptNeuralQueue] getNextCard called');
      
      // 🆕 如果有预加载的卡片，直接返回
      if (this.preloadedCard) {
        console.log('[SiyuanMemo][ConceptNeuralQueue] Returning preloaded card');
        const card = this.preloadedCard;
        this.preloadedCard = null;
        
        // 立即开始预加载下一张
        this.preloadNextCard();
        
        return card;
      }
      
      console.log('[SiyuanMemo][ConceptNeuralQueue] Current state:', {
        currentSeed: this.currentSeed,
        seedsCount: this.seeds.size,
        visitedCount: this.visitedBlocks.size,
      });
      
      // 🆕 优化：使用 while 循环替代递归，避免栈溢出和递归开销
      while (true) {
        // 1. 如果没有当前种子或需要轮换，选择一个新种子
        if (!this.currentSeed || this.shouldRotateSeed()) {
          this.currentSeed = this.selectNextSeed();
          if (!this.currentSeed) {
            console.log('[SiyuanMemo][ConceptNeuralQueue] No unvisited seeds available');
            return null;
          }
          console.log(`[SiyuanMemo][ConceptNeuralQueue] Selected seed: ${this.currentSeed}`);
        }

        // 2. 获取当前种子的邻居
        const neighbors = await this.queryEngine.fetchNeighbors(this.currentSeed);
        
        // 3. 过滤掉已访问的邻居
        const unvisitedNeighbors = neighbors.filter(n => !this.visitedBlocks.has(n.id));
        
        console.log(`[SiyuanMemo][ConceptNeuralQueue] Found ${unvisitedNeighbors.length} unvisited neighbors (total: ${neighbors.length})`);

        // 4. 如果有未访问的邻居，加权随机选择一个
        if (unvisitedNeighbors.length > 0) {
          const selected = this.weightedRandomSelect(unvisitedNeighbors);
          
          const blockData = await this.queryEngine.fetchBlockData(selected.id);
          
          if (!blockData) {
            // 块不存在，标记为已访问并重试
            console.warn(`[SiyuanMemo][ConceptNeuralQueue] Block ${selected.id} not found, marking as visited`);
            this.visitedBlocks.add(selected.id);
            continue; // 🆕 使用 continue 替代递归
          }

          // 标记为已访问并添加到路径
          this.visitedBlocks.add(selected.id);
          this.displayPath.push(selected.id);
          
          // 更新种子状态
          const seedState = this.seeds.get(this.currentSeed);
          if (seedState) {
            seedState.neighborsViewed++;
          }
          
          console.log(`[SiyuanMemo][ConceptNeuralQueue] Returning neighbor card: ${selected.id}`);
          
          const card = this.buildQueueItem(blockData, selected.type, this.getReasonText(selected.type));
          
          // 🆕 立即开始预加载下一张
          this.preloadNextCard();
          
          return card;
        }

        // 5. 没有未访问的邻居，检查种子本身是否已展示
        if (!this.visitedBlocks.has(this.currentSeed)) {
          console.log(`[SiyuanMemo][ConceptNeuralQueue] No unvisited neighbors, returning seed itself: ${this.currentSeed}`);
          
          const blockData = await this.queryEngine.fetchBlockData(this.currentSeed);
          if (!blockData) {
            console.error(`[SiyuanMemo][ConceptNeuralQueue] Seed ${this.currentSeed} not found`);
            this.currentSeed = null;
            continue; // 🆕 使用 continue 替代递归
          }

          // 标记为已访问并添加到路径
          this.visitedBlocks.add(this.currentSeed);
          this.displayPath.push(this.currentSeed);
          
          const card = this.buildQueueItem(blockData, 'seed', '种子节点');
          
          // 🆕 立即开始预加载下一张
          this.preloadNextCard();
          
          return card;
        }

        // 6. 种子和所有邻居都已访问，轮换到下一个种子
        console.log(`[SiyuanMemo][ConceptNeuralQueue] Seed ${this.currentSeed} exhausted, rotating to next seed`);
        this.rotateSeed();
        
        // 🆕 继续循环，不使用递归
      }
    } catch (error) {
      console.error('[SiyuanMemo][ConceptNeuralQueue] Error in getNextCard:', error);
      return null;
    }
  }

  /**
   * 🆕 预加载下一张卡片（后台执行）
   * 
   * 在返回当前卡片后立即调用，后台预加载下一张卡片，
   * 这样用户点击"下一张"时可以立即显示，无需等待。
   */
  private preloadNextCard(): void {
    // 如果已经在预加载，跳过
    if (this.isPreloading) {
      return;
    }
    
    this.isPreloading = true;
    
    // 异步预加载，不阻塞当前操作
    (async () => {
      try {
        console.log('[SiyuanMemo][ConceptNeuralQueue] 🔄 Preloading next card...');
        
        // 🔧 修复：保存当前完整状态（包括种子状态）
        const savedSeed = this.currentSeed;
        const savedVisited = new Set(this.visitedBlocks);
        const savedPath = [...this.displayPath];
        const savedSeedsState = new Map(
          Array.from(this.seeds.entries()).map(([id, state]) => [
            id,
            { ...state } // 深拷贝种子状态
          ])
        );
        
        // 临时修改状态来获取下一张卡片
        const nextCard = await this.getNextCardInternal();
        
        // 🔧 修复：无论是否成功，都恢复状态
        this.currentSeed = savedSeed;
        this.visitedBlocks = savedVisited;
        this.displayPath = savedPath;
        this.seeds = savedSeedsState;
        
        if (nextCard) {
          // 保存预加载的卡片
          this.preloadedCard = nextCard;
          console.log('[SiyuanMemo][ConceptNeuralQueue] ✅ Preloaded card:', nextCard.blockId);
        } else {
          console.log('[SiyuanMemo][ConceptNeuralQueue] ⚠️ No card to preload');
        }
      } catch (error) {
        console.error('[SiyuanMemo][ConceptNeuralQueue] Preload error:', error);
      } finally {
        this.isPreloading = false;
      }
    })();
  }

  /**
   * 🆕 内部方法：获取下一张卡片（不触发预加载）
   * 
   * 用于预加载逻辑，避免无限递归预加载
   */
  private async getNextCardInternal(): Promise<QueueItem | null> {
    try {
      while (true) {
        // 1. 如果没有当前种子或需要轮换，选择一个新种子
        if (!this.currentSeed || this.shouldRotateSeed()) {
          this.currentSeed = this.selectNextSeed();
          if (!this.currentSeed) {
            return null;
          }
        }

        // 2. 获取当前种子的邻居
        const neighbors = await this.queryEngine.fetchNeighbors(this.currentSeed);
        
        // 3. 过滤掉已访问的邻居
        const unvisitedNeighbors = neighbors.filter(n => !this.visitedBlocks.has(n.id));

        // 4. 如果有未访问的邻居，加权随机选择一个
        if (unvisitedNeighbors.length > 0) {
          const selected = this.weightedRandomSelect(unvisitedNeighbors);
          
          const blockData = await this.queryEngine.fetchBlockData(selected.id);
          
          if (!blockData) {
            this.visitedBlocks.add(selected.id);
            continue;
          }

          // 标记为已访问并添加到路径
          this.visitedBlocks.add(selected.id);
          this.displayPath.push(selected.id);
          
          // 更新种子状态
          const seedState = this.seeds.get(this.currentSeed);
          if (seedState) {
            seedState.neighborsViewed++;
          }
          
          return this.buildQueueItem(blockData, selected.type, this.getReasonText(selected.type));
        }

        // 5. 没有未访问的邻居，检查种子本身是否已展示
        if (!this.visitedBlocks.has(this.currentSeed)) {
          const blockData = await this.queryEngine.fetchBlockData(this.currentSeed);
          if (!blockData) {
            this.currentSeed = null;
            continue;
          }

          this.visitedBlocks.add(this.currentSeed);
          this.displayPath.push(this.currentSeed);
          
          return this.buildQueueItem(blockData, 'seed', '种子节点');
        }

        // 6. 种子和所有邻居都已访问，轮换到下一个种子
        this.rotateSeed();
      }
    } catch (error) {
      console.error('[SiyuanMemo][ConceptNeuralQueue] Error in getNextCardInternal:', error);
      return null;
    }
  }

  /**
   * 添加种子块
   * 
   * @param blockId 块 ID
   * @param priority 优先级（'normal' | 'high'），默认 'normal'
   */
  async addSeed(blockId: string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    // 验证是否为概念卡
    const isConcept = await this.queryEngine.isConceptCard(blockId);
    if (!isConcept) {
      throw new Error(`Block ${blockId} is not a concept card`);
    }

    const priorityValue = priority === 'high' ? 0.9 : 0.5;
    
    this.seeds.set(blockId, {
      blockId,
      priority: priorityValue,
      neighborsViewed: 0,
      addedAt: Date.now(),
    });
    
    console.log(`[SiyuanMemo][ConceptNeuralQueue] Added seed: ${blockId} (priority: ${priorityValue}, total: ${this.seeds.size})`);
  }

  /**
   * 移除种子块
   * 
   * @param blockId 块 ID
   */
  removeSeed(blockId: string): void {
    this.seeds.delete(blockId);
  }

  /**
   * 获取所有种子块
   * 
   * @returns 种子块 ID 列表
   */
  getSeeds(): string[] {
    return Array.from(this.seeds.keys());
  }

  /**
   * 恢复种子块集合
   * 
   * @param seedIds 种子块 ID 列表
   */
  restoreSeeds(seedIds: string[]): void {
    this.seeds.clear();
    for (const seedId of seedIds) {
      this.seeds.set(seedId, {
        blockId: seedId,
        priority: 0.5, // 默认优先级
        neighborsViewed: 0,
        addedAt: Date.now(),
      });
    }
    console.log(`[SiyuanMemo][ConceptNeuralQueue] Restored ${seedIds.length} seeds`);
  }

  /**
   * 清空访问历史
   */
  clearHistory(): void {
    this.visitedBlocks.clear();
    this.displayPath = [];
    this.currentSeed = null;
    // 🆕 清空预加载缓存
    this.preloadedCard = null;
    this.isPreloading = false;
  }

  /**
   * 获取队列大小（未访问的种子数量）
   * 
   * @returns 队列大小
   */
  size(): number {
    const unvisitedSeeds = Array.from(this.seeds.keys()).filter(
      id => !this.visitedBlocks.has(id)
    );
    return unvisitedSeeds.length;
  }

  /**
   * 判断是否需要轮换种子
   * 
   * @returns 是否需要轮换
   */
  private shouldRotateSeed(): boolean {
    if (!this.currentSeed) return true;
    
    const seedState = this.seeds.get(this.currentSeed);
    if (!seedState) return true;
    
    return seedState.neighborsViewed >= this.neighborsPerRound;
  }

  /**
   * 轮换到下一个种子
   */
  private rotateSeed(): void {
    if (this.currentSeed) {
      const seedState = this.seeds.get(this.currentSeed);
      if (seedState) {
        seedState.neighborsViewed = 0; // 重置计数
      }
    }
    this.currentSeed = null; // 下次调用时重新选择
  }

  /**
   * 选择下一个种子（基于优先级和轮换）
   * 
   * @returns 种子 ID，如果没有则返回 null
   */
  private selectNextSeed(): string | null {
    const unvisitedSeeds = Array.from(this.seeds.entries())
      .filter(([id, _]) => !this.visitedBlocks.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (unvisitedSeeds.length === 0) {
      return null;
    }

    // 按优先级加权随机选择
    return this.weightedRandomSelectSeed(unvisitedSeeds);
  }

  /**
   * 加权随机选择种子
   * 
   * @param seeds 种子列表
   * @returns 选中的种子 ID
   */
  private weightedRandomSelectSeed(seeds: Array<SeedState & { id: string }>): string {
    // 计算总权重（使用优先级）
    const totalWeight = seeds.reduce((sum, s) => sum + s.priority, 0);
    
    // 随机选择
    let random = Math.random() * totalWeight;
    
    for (const seed of seeds) {
      random -= seed.priority;
      if (random <= 0) {
        return seed.id;
      }
    }

    // 兜底：返回最后一个
    return seeds[seeds.length - 1].id;
  }

  /**
   * 加权随机选择邻居
   * 
   * @param neighbors 邻居列表
   * @returns 选中的邻居
   */
  private weightedRandomSelect(neighbors: Neighbor[]): Neighbor {
    // 计算总权重
    const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
    
    // 随机选择
    let random = Math.random() * totalWeight;
    
    for (const neighbor of neighbors) {
      random -= neighbor.weight;
      if (random <= 0) {
        return neighbor;
      }
    }

    // 兜底：返回最后一个
    return neighbors[neighbors.length - 1];
  }

  /**
   * 构建队列项
   * 
   * @param blockData 块数据
   * @param associationType 关联类型
   * @param reason 关联原因
   * @returns 队列项
   */
  private buildQueueItem(
    blockData: BlockData,
    associationType: string,
    reason: string
  ): QueueItem {
    return {
      id: blockData.id,
      blockId: blockData.id,
      deckId: blockData.root_id || blockData.id,
      blockData,
      associationType,
      reason,
    };
  }

  /**
   * 获取关联类型的描述文本
   * 
   * @param type 关联类型
   * @returns 描述文本
   */
  private getReasonText(type: string): string {
    const reasonMap: Record<string, string> = {
      backlink: '反向链接',
      outgoing: '概念关联',
      descriptor: '描述符卡',
      seed: '种子节点',
    };
    return reasonMap[type] || '未知关联';
  }
}
