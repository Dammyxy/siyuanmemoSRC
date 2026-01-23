/**
 * NeuralQueueStorage - 神经队列存储管理
 * 
 * 提供配置和会话状态的持久化功能。
 * 
 * Requirements: 10.6
 */

import { NeuralQueueConfig, NeuralQueueState } from './types.ts';
import { NeuralQueueConfigManager } from './NeuralQueueConfig.ts';

/**
 * 会话状态接口
 */
export interface SessionState {
  currentSeedId: string | null;
  visitedCards: string[];
  sessionStartTime: number;
  totalCardsReviewed: number;
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
      console.error('[NeuralQueueStorage] Failed to save config:', error);
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
        console.warn('[NeuralQueueStorage] Invalid config in storage, using default:', validation.errors);
        return NeuralQueueConfigManager.getDefault();
      }

      // 合并配置（填充缺失项）
      return NeuralQueueConfigManager.merge(config);
    } catch (error) {
      console.error('[NeuralQueueStorage] Failed to load config:', error);
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
      console.error('[NeuralQueueStorage] Failed to save session state:', error);
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
      console.error('[NeuralQueueStorage] Failed to load session state:', error);
      return null;
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
      console.error('[NeuralQueueStorage] Failed to clear session state:', error);
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
      console.error('[NeuralQueueStorage] Failed to clear config:', error);
    }
  }
}
