/**
 * 概念卡神经漫游队列
 * 
 * 专门为概念卡设计的简化神经漫游实现：
 * - 只支持概念卡作为种子
 * - 邻居包括：反链、正链、描述符卡
 * - 简单清晰的状态管理
 */

import { ConceptQueryEngine, type Neighbor, type BlockData } from './ConceptQueryEngine';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConceptNeuralQueue');

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
  private exhaustedSeeds: Set<string> = new Set();
  private displayPath: string[] = [];
  private seeds: Map<string, SeedState> = new Map(); // 改用 Map 存储种子状态
  
  // 配置
  private neighborsPerRound = 5; // 每轮漫游 5 个邻居
  private prefetchNeighborCount = 2; // 返回当前卡后，预热最多 2 个候选邻居
  private prefetchingBlockIds = new Set<string>();
  
  // 依赖
  private queryEngine: ConceptQueryEngine;
  
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
      logger.debug('getNextCard called');
      
      logger.debug('Current state', {
        currentSeed: this.currentSeed,
        seedsCount: this.seeds.size,
        exhaustedCount: this.exhaustedSeeds.size,
        visitedCount: this.visitedBlocks.size,
      });
      
      // 🆕 优化：使用 while 循环替代递归，避免栈溢出和递归开销
      while (true) {
        // 1. 如果没有当前种子或需要轮换，选择一个新种子
        if (!this.currentSeed || this.shouldRotateSeed()) {
          this.currentSeed = this.selectNextSeed();
          if (!this.currentSeed) {
            logger.debug('No unvisited seeds available');
            return null;
          }
          logger.debug('Selected seed', { seed: this.currentSeed });
        }

        // 2. 获取当前种子的邻居
        const neighbors = await this.queryEngine.fetchNeighbors(this.currentSeed);
        
        // 3. 过滤掉已访问的邻居
        const unvisitedNeighbors = neighbors.filter(n => !this.visitedBlocks.has(n.id));
        
        logger.debug('Calculated unvisited neighbors', {
          unvisitedCount: unvisitedNeighbors.length,
          totalCount: neighbors.length,
        });

        // 4. 如果有未访问的邻居，加权随机选择一个
        if (unvisitedNeighbors.length > 0) {
          const selected = this.weightedRandomSelect(unvisitedNeighbors);
          
          const blockData = await this.queryEngine.fetchBlockData(selected.id);
          
          if (!blockData) {
            // 块不存在，标记为已访问并重试
            logger.warn('Block not found, marking as visited', { blockId: selected.id });
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
          
          logger.debug('Returning neighbor card', { blockId: selected.id });
          
          const card = this.buildQueueItem(blockData, selected.type, this.getReasonText(selected.type));

          // 在不改变队列语义的前提下，预热下一张最可能命中的候选块
          this.prefetchLikelyNextNeighborBlocks(unvisitedNeighbors, selected.id);
          
          return card;
        }

        // 5. 没有未访问的邻居，检查种子本身是否已展示
        if (!this.visitedBlocks.has(this.currentSeed)) {
          logger.debug('No unvisited neighbors, returning seed itself', { seed: this.currentSeed });
          
          const blockData = await this.queryEngine.fetchBlockData(this.currentSeed);
          if (!blockData) {
            logger.error('Seed not found', { seed: this.currentSeed });
            this.currentSeed = null;
            continue; // 🆕 使用 continue 替代递归
          }

          // 标记为已访问并添加到路径
          this.visitedBlocks.add(this.currentSeed);
          this.displayPath.push(this.currentSeed);
          
          const card = this.buildQueueItem(blockData, 'seed', '种子节点');
          
          return card;
        }

        // 6. 种子和所有邻居都已访问，轮换到下一个种子
        logger.debug('Seed exhausted, rotating to next seed', { seed: this.currentSeed });
        if (this.currentSeed) {
          this.exhaustedSeeds.add(this.currentSeed);
        }
        this.rotateSeed();
        
        // 🆕 继续循环，不使用递归
      }
    } catch (error) {
      logger.error('Error in getNextCard', error);
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
    this.exhaustedSeeds.delete(blockId);
    
    logger.debug('Added seed', { blockId, priorityValue, total: this.seeds.size });
  }

  /**
   * 移除种子块
   * 
   * @param blockId 块 ID
   */
  removeSeed(blockId: string): void {
    this.seeds.delete(blockId);
    this.exhaustedSeeds.delete(blockId);
    if (this.currentSeed === blockId) {
      this.currentSeed = null;
    }
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
    this.exhaustedSeeds.clear();
    for (const seedId of seedIds) {
      this.seeds.set(seedId, {
        blockId: seedId,
        priority: 0.5, // 默认优先级
        neighborsViewed: 0,
        addedAt: Date.now(),
      });
    }
    logger.debug('Restored seeds', { count: seedIds.length });
  }

  /**
   * 清空访问历史
   */
  clearHistory(): void {
    this.visitedBlocks.clear();
    this.exhaustedSeeds.clear();
    this.displayPath = [];
    this.currentSeed = null;
    // 重置所有种子的 neighborsViewed 计数
    for (const seed of this.seeds.values()) {
      seed.neighborsViewed = 0;
    }
    logger.debug('History cleared, all seed counters reset');
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
    const candidateSeeds = Array.from(this.seeds.entries())
      .filter(([id, _]) => !this.exhaustedSeeds.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (candidateSeeds.length === 0) {
      return null;
    }

    // 按优先级加权随机选择
    return this.weightedRandomSelectSeed(candidateSeeds);
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
      'outgoing-direct': '直接引用',
      'outgoing-indirect': '间接引用',
      descriptor: '描述符卡',
      seed: '种子节点',
    };
    return reasonMap[type] || '未知关联';
  }

  /**
   * 预热可能被下一次命中的邻居块数据
   */
  private prefetchLikelyNextNeighborBlocks(neighbors: Neighbor[], selectedId: string): void {
    const candidateIds = neighbors
      .filter((neighbor) => neighbor.id !== selectedId && !this.visitedBlocks.has(neighbor.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, this.prefetchNeighborCount)
      .map((neighbor) => neighbor.id);

    for (const blockId of candidateIds) {
      if (this.prefetchingBlockIds.has(blockId)) {
        continue;
      }

      this.prefetchingBlockIds.add(blockId);
      void this.queryEngine.fetchBlockData(blockId)
        .catch((error) => {
          logger.debug('Prefetch block data failed', { blockId, error });
        })
        .finally(() => {
          this.prefetchingBlockIds.delete(blockId);
        });
    }
  }
}
