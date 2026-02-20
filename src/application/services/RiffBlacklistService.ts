/**
 * RiffBlacklistService - Riff 黑名单管理服务
 * 
 * @module RiffBlacklistService
 * @description
 * 应用层服务，负责管理不需要同步到 Riff 的块 ID 黑名单。
 * 提供快速的成员检查和持久化存储。
 * 
 * **职责**：
 * - 管理 Riff 黑名单的加载和保存
 * - 支持添加/移除块到黑名单
 * - 提供快速的成员检查（O(1)）
 * - 支持清空整个黑名单
 * - 使用防抖机制避免频繁写入
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import type { IFileService } from '../../infrastructure/services/FileService';

/**
 * Riff 黑名单服务接口
 */
export interface IRiffBlacklistService {
  /**
   * 初始化服务（加载黑名单）
   */
  init(): Promise<void>;
  
  /**
   * 添加块到黑名单
   * @param blockID 块 ID
   */
  addToBlacklist(blockID: string): Promise<void>;
  
  /**
   * 从黑名单移除块
   * @param blockID 块 ID
   */
  removeFromBlacklist(blockID: string): Promise<void>;
  
  /**
   * 检查块是否在黑名单中
   * @param blockID 块 ID
   * @returns 是否在黑名单中
   */
  isInBlacklist(blockID: string): boolean;
  
  /**
   * 获取整个黑名单
   * @returns 黑名单集合
   */
  getBlacklist(): Set<string>;
  
  /**
   * 清空黑名单
   */
  clearBlacklist(): Promise<void>;
}

/**
 * Riff 黑名单数据结构
 */
interface RiffBlacklistData {
  blacklist: string[];
}

/**
 * Riff 黑名单服务实现
 */
export class RiffBlacklistService implements IRiffBlacklistService {
  private blacklist: Set<string> = new Set();
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖延迟
  
  // 存储文件名
  private readonly BLACKLIST_FILE = 'riff-blacklist.json';

  constructor(private readonly fileService: IFileService) {}

  /**
   * 初始化服务（加载黑名单）
   */
  async init(): Promise<void> {
    try {
      // 加载黑名单数据
      const data = await this.fileService.readJSON<RiffBlacklistData>(this.BLACKLIST_FILE);
      
      if (data && Array.isArray(data.blacklist)) {
        // 从数组创建 Set
        this.blacklist = new Set(data.blacklist);
        console.log(`[RiffBlacklistService] Loaded ${this.blacklist.size} items from blacklist`);
      } else {
        // 文件不存在或格式错误，初始化为空黑名单
        this.blacklist = new Set();
        await this.saveBlacklist();
        console.log('[RiffBlacklistService] Initialized empty blacklist');
      }
    } catch (error) {
      console.error('[RiffBlacklistService] Failed to initialize blacklist:', error);
      // 初始化失败时使用空黑名单
      this.blacklist = new Set();
      throw error;
    }
  }

  /**
   * 添加块到黑名单
   * @param blockID 块 ID
   */
  async addToBlacklist(blockID: string): Promise<void> {
    if (!blockID || typeof blockID !== 'string') {
      throw new Error('Invalid block ID: must be a non-empty string');
    }

    // 添加到 Set（如果已存在则不会重复添加）
    const sizeBefore = this.blacklist.size;
    this.blacklist.add(blockID);
    
    // 只有实际添加了新项才保存
    if (this.blacklist.size > sizeBefore) {
      console.log(`[RiffBlacklistService] Added block to blacklist: ${blockID}`);
      this.debouncedSave();
    }
  }

  /**
   * 从黑名单移除块
   * @param blockID 块 ID
   */
  async removeFromBlacklist(blockID: string): Promise<void> {
    if (!blockID || typeof blockID !== 'string') {
      throw new Error('Invalid block ID: must be a non-empty string');
    }

    // 从 Set 中删除
    const deleted = this.blacklist.delete(blockID);
    
    // 只有实际删除了项才保存
    if (deleted) {
      console.log(`[RiffBlacklistService] Removed block from blacklist: ${blockID}`);
      this.debouncedSave();
    }
  }

  /**
   * 检查块是否在黑名单中
   * @param blockID 块 ID
   * @returns 是否在黑名单中
   */
  isInBlacklist(blockID: string): boolean {
    if (!blockID || typeof blockID !== 'string') {
      return false;
    }
    return this.blacklist.has(blockID);
  }

  /**
   * 获取整个黑名单
   * @returns 黑名单集合（返回新的 Set 副本，防止外部修改）
   */
  getBlacklist(): Set<string> {
    return new Set(this.blacklist);
  }

  /**
   * 清空黑名单
   */
  async clearBlacklist(): Promise<void> {
    const sizeBefore = this.blacklist.size;
    this.blacklist.clear();
    
    // 只有黑名单不为空时才保存
    if (sizeBefore > 0) {
      console.log(`[RiffBlacklistService] Cleared blacklist (${sizeBefore} items removed)`);
      // 清空操作立即保存，不使用防抖
      await this.saveBlacklist();
    }
  }

  /**
   * 防抖保存黑名单
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      await this.saveBlacklist();
      this.saveDebounceTimer = null;
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 立即保存黑名单
   */
  private async saveBlacklist(): Promise<void> {
    try {
      // 将 Set 转换为数组
      const data: RiffBlacklistData = {
        blacklist: Array.from(this.blacklist)
      };
      
      await this.fileService.writeJSON(this.BLACKLIST_FILE, data);
      console.log(`[RiffBlacklistService] Blacklist saved successfully (${this.blacklist.size} items)`);
    } catch (error) {
      console.error('[RiffBlacklistService] Failed to save blacklist:', error);
      throw error;
    }
  }
}
