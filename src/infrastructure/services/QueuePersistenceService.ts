/**
 * QueuePersistenceService - 队列持久化服务
 * 
 * @module QueuePersistenceService
 * @description
 * 提供通用的键值存储接口，所有队列通过它持久化状态。
 * 采用方案 A - 通用键值存储服务，不需要知道队列的具体结构。
 * 
 * **职责**：
 * - 提供简单的 get/set/delete/keys 接口
 * - 支持任意 JSON 可序列化的数据类型
 * - 使用 Map 作为内存缓存
 * - 实现防抖机制（300ms）避免频繁写入
 * - 将所有队列数据持久化到单一文件（queues.msgpack）
 * 
 * **设计原则**：
 * - 队列自治：每个队列领域对象自己管理状态和逻辑
 * - 通用存储：持久化服务不需要知道队列的具体结构
 * - 简单接口：只提供 get/set，队列自己决定数据格式
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import type { IFileService } from './FileService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueuePersistenceService');

/**
 * 队列持久化服务接口
 */
export interface IQueuePersistenceService {
  /**
   * 初始化服务（加载所有队列数据）
   */
  init(): Promise<void>;
  
  /**
   * 获取队列数据
   * @param key 队列唯一键名（如 "retrievalPracticeQueue"）
   * @returns 队列数据，如果不存在返回 null
   */
  get<T>(key: string): T | null;
  
  /**
   * 设置队列数据
   * @param key 队列唯一键名
   * @param value 队列数据（必须是 JSON 可序列化的）
   */
  set(key: string, value: unknown): Promise<void>;
  
  /**
   * 删除队列数据
   * @param key 队列唯一键名
   */
  delete(key: string): Promise<void>;
  
  /**
   * 获取所有队列键名
   */
  keys(): string[];
  
  /**
   * 立即保存所有队列数据（绕过防抖）
   */
  flush(): Promise<void>;
}

/**
 * 队列持久化错误
 */
export class QueuePersistenceError extends Error {
  constructor(
    public readonly operation: string,
    public readonly key: string,
    public readonly cause: Error
  ) {
    super(`Queue persistence ${operation} failed for key "${key}": ${cause.message}`);
    this.name = 'QueuePersistenceError';
  }
}

/**
 * 队列持久化服务实现
 */
export class QueuePersistenceService implements IQueuePersistenceService {
  private static readonly STORAGE_FILE = 'queues.msgpack';
  private static readonly DEBOUNCE_DELAY = 300; // 300ms 防抖延迟
  
  private cache: Map<string, unknown> = new Map();
  private saveTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(private readonly fileService: IFileService) {}

  /**
   * 初始化服务（加载所有队列数据）
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.warn('Already initialized, skipping');
      return;
    }

    try {
      const data = await this.fileService.readMsgpack<Record<string, unknown>>(
        QueuePersistenceService.STORAGE_FILE
      );
      
      if (data) {
        // 将加载的数据填充到缓存
        this.cache = new Map(Object.entries(data));
        logger.info(`Loaded ${this.cache.size} queue(s) from storage`);
      } else {
        logger.info('No existing queue data found, starting fresh');
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize:', error);
      throw new QueuePersistenceError(
        'init',
        'all',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 获取队列数据
   */
  get<T>(key: string): T | null {
    if (!this.initialized) {
      logger.warn('Service not initialized, returning null');
      return null;
    }

    const value = this.cache.get(key);
    return value !== undefined ? (value as T) : null;
  }

  /**
   * 设置队列数据
   */
  async set(key: string, value: unknown): Promise<void> {
    if (!this.initialized) {
      throw new QueuePersistenceError(
        'set',
        key,
        new Error('Service not initialized')
      );
    }

    try {
      // 验证数据是 JSON 可序列化的
      JSON.stringify(value);
      
      // 更新内存缓存
      this.cache.set(key, value);
      
      // 触发防抖保存
      this.debouncedSave();
    } catch (error) {
      if (error instanceof TypeError) {
        logger.error(`Value for key "${key}" is not JSON-serializable:`, error);
        throw new QueuePersistenceError(
          'set',
          key,
          new Error(`Value is not JSON-serializable: ${error.message}`)
        );
      }
      throw error;
    }
  }

  /**
   * 删除队列数据
   */
  async delete(key: string): Promise<void> {
    if (!this.initialized) {
      throw new QueuePersistenceError(
        'delete',
        key,
        new Error('Service not initialized')
      );
    }

    this.cache.delete(key);
    
    // 触发防抖保存
    this.debouncedSave();
  }

  /**
   * 获取所有队列键名
   */
  keys(): string[] {
    if (!this.initialized) {
      logger.warn('Service not initialized, returning empty array');
      return [];
    }

    return Array.from(this.cache.keys());
  }

  /**
   * 立即保存所有队列数据（绕过防抖）
   */
  async flush(): Promise<void> {
    if (!this.initialized) {
      throw new QueuePersistenceError(
        'flush',
        'all',
        new Error('Service not initialized')
      );
    }

    // 取消待处理的防抖保存
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // 立即保存
    await this.save();
  }

  /**
   * 防抖保存
   * 在 300ms 内如果有新的修改，会重置计时器
   */
  private debouncedSave(): void {
    // 取消之前的计时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // 设置新的计时器
    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        logger.error('Debounced save failed:', error);
      });
    }, QueuePersistenceService.DEBOUNCE_DELAY);
  }

  /**
   * 保存所有队列数据到文件
   */
  private async save(): Promise<void> {
    try {
      // 将 Map 转换为普通对象
      const data = Object.fromEntries(this.cache);
      
      // 写入文件
      await this.fileService.writeMsgpack(
        QueuePersistenceService.STORAGE_FILE,
        data
      );
      
      logger.info(`Saved ${this.cache.size} queue(s) to storage`);
    } catch (error) {
      logger.error('Failed to save queue data:', error);
      throw new QueuePersistenceError(
        'save',
        'all',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 生命周期结束时确保防抖数据落盘
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await this.flush();
      logger.info('QueuePersistenceService disposed and flushed');
    } catch (error) {
      logger.error('Failed to flush queue persistence during dispose:', error);
    }
  }
}
