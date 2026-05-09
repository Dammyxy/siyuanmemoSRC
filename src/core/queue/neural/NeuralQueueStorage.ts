/**
 * NeuralQueueStorage - 神经队列存储管理
 * 
 * 提供配置和会话状态的持久化功能。
 * 
 * Requirements: 10.6
 */

import { NeuralQueueConfig, MissedBlock, NavigationPathNode } from './types.ts';
import { NeuralQueueConfigManager } from './NeuralQueueConfig.ts';
import { createLogger } from '@/utils/logger';
import { createDependencyUnavailableError } from '../dependencyErrors';

const logger = createLogger('NeuralQueueStorage');

/**
 * 会话状态接口
 */
export interface SessionState {
  currentSeedId: string | null;
  visitedCards: string[];
  sessionStartTime: number;
  totalCardsReviewed: number;
  // 🆕 Orbit 状态
  /** 种子节点 ID 列表 */
  seedNodes?: string[];
  /** 遗落块映射（序列化为对象） */
  missedBlocks?: Record<string, MissedBlock[]>;
  /** 导航路径 */
  navigationPath?: NavigationPathNode[];
}

/**
 * 神经队列存储管理器
 */
export class NeuralQueueStorage {
  private static readonly CONFIG_KEY = 'neural-queue-config';
  private static readonly SESSION_KEY = 'neural-queue-session';

  /**
   * 保存配置到 localStorage
   * 
   * @param config 配置对象
   * Requirements: 10.6
   */
  static saveConfig(config: NeuralQueueConfig): void {
    try {
      const json = JSON.stringify(config);
      localStorage.setItem(this.CONFIG_KEY, json);
    } catch (error) {
      logger.error('Failed to save config:', error);
    }
  }

  /**
   * 从 localStorage 加载配置
   * 
   * @returns 配置对象，如果不存在则返回默认配置
   * Requirements: 10.6
   */
  static loadConfig(): NeuralQueueConfig {
    try {
      const json = localStorage.getItem(this.CONFIG_KEY);
      if (!json) {
        return NeuralQueueConfigManager.getDefault();
      }

      const config = JSON.parse(json) as Partial<NeuralQueueConfig>;
      
      // 验证配置
      const validation = NeuralQueueConfigManager.validate(config);
      if (!validation.valid) {
        logger.warn('Invalid config in storage, using default:', validation.errors);
        return NeuralQueueConfigManager.getDefault();
      }

      // 合并配置（填充缺失项）
      return NeuralQueueConfigManager.merge(config);
    } catch (error) {
      logger.error('Failed to load config:', error);
      return NeuralQueueConfigManager.getDefault();
    }
  }

  /**
   * 保存会话状态到 localStorage
   * 
   * @param state 会话状态
   * Requirements: 10.6
   */
  static saveSessionState(state: SessionState): void {
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(this.SESSION_KEY, json);
    } catch (error) {
      logger.error('Failed to save session state:', error);
    }
  }

  /**
   * 从 localStorage 加载会话状态
   * 
   * @returns 会话状态，如果不存在则返回 null
   * Requirements: 10.6
   */
  static loadSessionState(): SessionState | null {
    try {
      const json = localStorage.getItem(this.SESSION_KEY);
      if (!json) {
        return null;
      }

      const state = JSON.parse(json) as SessionState;
      
      // 验证状态结构
      if (!state || typeof state !== 'object') {
        return null;
      }

      if (!Array.isArray(state.visitedCards)) {
        return null;
      }

      return state;
    } catch (error) {
      logger.error('Failed to load session state:', error);
      throw createDependencyUnavailableError('NEURAL_QUEUE_STORAGE_UNAVAILABLE', 'failed to load session state', error);
    }
  }

  /**
   * 清除会话状态
   * 
   * Requirements: 10.6
   */
  static clearSessionState(): void {
    try {
      localStorage.removeItem(this.SESSION_KEY);
    } catch (error) {
      logger.error('Failed to clear session state:', error);
    }
  }

  /**
   * 清除所有存储数据（配置和会话）
   */
  static clearAll(): void {
    this.clearSessionState();
    try {
      localStorage.removeItem(this.CONFIG_KEY);
    } catch (error) {
      logger.error('Failed to clear config:', error);
    }
  }

  // ============================================================================
  // Orbit 状态持久化方法
  // ============================================================================

  /**
   * 🔧 验证种子块 ID 数组
   *
   * @param seeds 种子块 ID 数组
   * @returns 验证后的有效种子块 ID 数组
   * @private
   */
  private static validateSeedArray(seeds: unknown): string[] {
    if (!Array.isArray(seeds)) {
      logger.warn('Invalid seeds format (not an array)');
      return [];
    }

    // 过滤掉无效 ID
    return seeds.filter((id): id is string => {
      const isValid = id && typeof id === 'string' && id.length > 0;
      if (!isValid && id) {
        logger.warn(`Invalid seed ID: ${id}`);
      }
      return isValid;
    });
  }

  /**
   * 🔧 清理无效的遗落块条目
   *
   * @param missedBlocksObj 遗落块对象
   * @returns 清理后的遗落块对象
   * @private
   */
  private static cleanupMissedBlocks(missedBlocksObj: Record<string, unknown>): Record<string, MissedBlock[]> {
    const cleaned: Record<string, MissedBlock[]> = {};

    for (const [seedId, missedList] of Object.entries(missedBlocksObj)) {
      // 验证种子 ID
      if (!seedId || typeof seedId !== 'string') {
        logger.warn('Invalid seed ID in missedBlocks, skipping');
        continue;
      }

      // 验证遗落块列表
      if (!Array.isArray(missedList)) {
        logger.warn(`Invalid missed list for seed ${seedId}, skipping`);
        continue;
      }

      // 过滤并验证每个遗落块
      const validMissedBlocks = missedList.filter((block): block is MissedBlock => {
        const isValid =
          block &&
          typeof block === 'object' &&
          block.id &&
          typeof block.id === 'string' &&
          block.associationType &&
          typeof block.missedAt === 'number';

        if (!isValid) {
          logger.warn(`Invalid missed block for seed ${seedId}, skipping`);
        }

        return isValid;
      });

      // 只保留有有效遗落块的条目
      if (validMissedBlocks.length > 0) {
        cleaned[seedId] = validMissedBlocks;
      }
    }

    return cleaned;
  }

  /**
   * 验证 Orbit 状态数据结构
   * 
   * @param state 待验证的状态对象
   * @returns 是否有效
   * @private
   * Requirements: 8.6
   */
  private static validateOrbitState(state: unknown): boolean {
    if (!state || typeof state !== 'object') {
      return false;
    }

    const orbitState = state as Record<string, unknown>;

    // 验证 seedNodes
    if (orbitState.seedNodes !== undefined && !Array.isArray(orbitState.seedNodes)) {
      return false;
    }

    // 验证 missedBlocks
    if (orbitState.missedBlocks !== undefined) {
      if (!orbitState.missedBlocks || typeof orbitState.missedBlocks !== 'object') {
        return false;
      }

      const missedBlocksRecord = orbitState.missedBlocks as Record<string, unknown>;
      // 验证每个遗落块数组
      for (const missedList of Object.values(missedBlocksRecord)) {
        if (!Array.isArray(missedList)) {
          return false;
        }
        // 验证遗落块结构
        for (const block of missedList) {
          if (!block || typeof block !== 'object') {
            return false;
          }
          const missedBlock = block as Record<string, unknown>;
          if (
            typeof missedBlock.id !== 'string' ||
            !missedBlock.associationType ||
            typeof missedBlock.missedAt !== 'number'
          ) {
            return false;
          }
        }
      }
    }

    // 验证 navigationPath
    if (orbitState.navigationPath !== undefined) {
      if (!Array.isArray(orbitState.navigationPath)) {
        return false;
      }
      // 验证路径节点结构
      for (const node of orbitState.navigationPath) {
        if (!node || typeof node !== 'object') {
          return false;
        }
        const pathNode = node as Record<string, unknown>;
        if (
          typeof pathNode.cardId !== 'string' ||
          typeof pathNode.cardTitle !== 'string' ||
          !pathNode.associationType ||
          typeof pathNode.timestamp !== 'number'
        ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 保存 Orbit 状态（作为会话状态的一部分）
   *
   * @param seedNodes 种子节点列表
   * @param missedBlocks 遗落块映射
   * @param navigationPath 导航路径
   * Requirements: 8.1, 8.2, 8.4
   */
  static saveOrbitState(
    seedNodes: string[],
    missedBlocks: Map<string, MissedBlock[]>,
    navigationPath: NavigationPathNode[]
  ): void {
    try {
      // 🔧 验证和清理种子块数组
      const validSeedNodes = this.validateSeedArray(seedNodes);
      if (validSeedNodes.length !== seedNodes.length) {
        logger.warn(`Filtered ${seedNodes.length - validSeedNodes.length} invalid seed IDs`);
      }

      // 加载现有会话状态
      const currentState = this.loadSessionState() || {
        currentSeedId: null,
        visitedCards: [],
        sessionStartTime: Date.now(),
        totalCardsReviewed: 0,
      };

      // 将 Map 转换为普通对象
      const missedBlocksObj: Record<string, MissedBlock[]> = {};
      missedBlocks.forEach((value, key) => {
        missedBlocksObj[key] = value;
      });

      // 🔧 清理无效的遗落块条目
      const cleanedMissedBlocks = this.cleanupMissedBlocks(missedBlocksObj);
      const missedCount = Object.values(missedBlocksObj).reduce((sum, arr) => sum + arr.length, 0);
      const cleanedCount = Object.values(cleanedMissedBlocks).reduce((sum, arr) => sum + arr.length, 0);
      if (missedCount !== cleanedCount) {
        logger.warn(`Cleaned ${missedCount - cleanedCount} invalid missed blocks`);
      }

      // 合并 Orbit 状态
      const updatedState: SessionState = {
        ...currentState,
        seedNodes: validSeedNodes,
        missedBlocks: cleanedMissedBlocks,
        navigationPath,
      };

      // 保存
      this.saveSessionState(updatedState);
      logger.info('Saved Orbit state (validated and cleaned)');
    } catch (error) {
      logger.error('Failed to save Orbit state:', error);
    }
  }

  /**
   * 加载 Orbit 状态
   *
   * @returns Orbit 状态数据，如果不存在或无效则返回 null
   * Requirements: 8.3, 8.6
   */
  static loadOrbitState(): {
    seedNodes: string[];
    missedBlocks: Map<string, MissedBlock[]>;
    navigationPath: NavigationPathNode[];
  } | null {
    try {
      const state = this.loadSessionState();
      if (!state) {
        return null;
      }

      // 验证 Orbit 数据
      if (!this.validateOrbitState(state)) {
        logger.warn('Invalid Orbit state structure');
        return null;
      }

      // 🔧 验证和清理种子块数组
      const validSeedNodes = this.validateSeedArray(state.seedNodes || []);
      if (validSeedNodes.length !== (state.seedNodes || []).length) {
        logger.warn(`Filtered ${(state.seedNodes || []).length - validSeedNodes.length} invalid seed IDs on load`);
      }

      // 🔧 将普通对象转换为 Map，同时清理无效的遗落块
      const missedBlocksMap = new Map<string, MissedBlock[]>();
      if (state.missedBlocks) {
        // 使用 cleanupMissedBlocks 清理
        const cleanedMissedBlocks = this.cleanupMissedBlocks(state.missedBlocks);

        for (const [key, missedList] of Object.entries(cleanedMissedBlocks)) {
          // 只保留引用有效种子的遗落块
          if (validSeedNodes.includes(key)) {
            missedBlocksMap.set(key, missedList);
          } else {
            logger.warn(`Skipping missed blocks for invalid seed: ${key}`);
          }
        }
      }

      return {
        seedNodes: validSeedNodes,
        missedBlocks: missedBlocksMap,
        navigationPath: state.navigationPath || [],
      };
    } catch (error) {
      logger.error('Failed to load Orbit state:', error);
      throw createDependencyUnavailableError('NEURAL_QUEUE_STORAGE_UNAVAILABLE', 'failed to load Orbit state', error);
    }
  }
}
