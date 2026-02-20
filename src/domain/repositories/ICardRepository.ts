/**
 * ICardRepository - 卡片仓储接口
 * 
 * @module ICardRepository
 * @description
 * 定义卡片持久化的抽象接口，遵循 DDD 仓储模式。
 * 
 * **设计原则**：
 * 1. 面向领域：接口使用领域语言（Card Entity）
 * 2. 技术无关：不暴露具体的存储实现
 * 3. 集合语义：像操作内存集合一样操作持久化数据
 * 
 * **职责**：
 * - 定义卡片的 CRUD 操作
 * - 定义查询方法
 * - 定义批量操作
 * 
 * @see Card - 卡片领域实体
 * @see CardRepository - 仓储实现
 */

import type { Card } from '../entities/Card';
import type { CardType } from '../../types/card';
import type { Result } from '../../types/result';

/**
 * 卡片仓储接口
 * 
 * 遵循 Repository 模式，提供类似集合的接口
 */
export interface ICardRepository {
  // ==================== CRUD 操作 ====================

  /**
   * 保存卡片（新增或更新）
   * 
   * @param card 卡片实体
   * @returns 成功或失败结果
   */
  save(card: Card): Promise<Result<void>>;

  /**
   * 批量保存卡片
   * 
   * @param cards 卡片实体数组
   * @returns 成功或失败结果
   */
  saveBatch(cards: Card[]): Promise<Result<void>>;

  /**
   * 根据 ID 查找卡片
   * 
   * @param id 卡片 ID
   * @returns 卡片实体或 null
   */
  findById(id: string): Promise<Result<Card | null>>;

  /**
   * 根据块 ID 查找卡片
   * 
   * @param blockId 块 ID
   * @returns 卡片实体数组
   */
  findByBlockId(blockId: string): Promise<Result<Card[]>>;

  /**
   * 根据 Xiuyuan ID 查找卡片
   * 
   * @param xiuyuanId Xiuyuan ID
   * @returns 卡片实体数组
   */
  findByXiuyuanId(xiuyuanId: string): Promise<Result<Card[]>>;

  /**
   * 根据类型查找卡片
   * 
   * @param type 卡片类型
   * @returns 卡片实体数组
   */
  findByType(type: CardType): Promise<Result<Card[]>>;

  /**
   * 查找所有卡片
   * 
   * @returns 卡片实体数组
   */
  findAll(): Promise<Result<Card[]>>;

  /**
   * 删除卡片
   * 
   * @param id 卡片 ID
   * @returns 成功或失败结果
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * 批量删除卡片
   * 
   * @param ids 卡片 ID 数组
   * @returns 成功或失败结果
   */
  deleteBatch(ids: string[]): Promise<Result<void>>;

  // ==================== 查询方法 ====================

  /**
   * 查找到期卡片
   * 
   * @param limit 限制数量
   * @returns 卡片实体数组
   */
  findDueCards(limit: number): Promise<Result<Card[]>>;

  /**
   * 查找新卡片
   * 
   * @param limit 限制数量
   * @returns 卡片实体数组
   */
  findNewCards(limit: number): Promise<Result<Card[]>>;

  /**
   * 查找学习中卡片
   * 
   * @returns 卡片实体数组
   */
  findLearningCards(): Promise<Result<Card[]>>;

  /**
   * 查找复习卡片
   * 
   * @returns 卡片实体数组
   */
  findReviewCards(): Promise<Result<Card[]>>;

  /**
   * 查找难点卡片
   * 
   * @returns 卡片实体数组
   */
  findLeechCards(): Promise<Result<Card[]>>;

  /**
   * 查找跳过的卡片
   * 
   * @returns 卡片实体数组
   */
  findSkippedCards(): Promise<Result<Card[]>>;

  /**
   * 检查卡片是否存在
   * 
   * @param id 卡片 ID
   * @returns 是否存在
   */
  exists(id: string): Promise<Result<boolean>>;

  /**
   * 统计卡片数量
   * 
   * @returns 卡片总数
   */
  count(): Promise<Result<number>>;

  /**
   * 按类型统计卡片数量
   * 
   * @returns 类型 → 数量的映射
   */
  countByType(): Promise<Result<Record<CardType, number>>>;

  // ==================== 持久化控制 ====================

  /**
   * 立即保存所有更改到存储
   * 
   * @returns 成功或失败结果
   */
  flush(): Promise<Result<void>>;

  /**
   * 从存储重新加载所有数据
   * 
   * @returns 成功或失败结果
   */
  reload(): Promise<Result<void>>;
}
