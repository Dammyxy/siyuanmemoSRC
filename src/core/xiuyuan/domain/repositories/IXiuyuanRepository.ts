/**
 * IXiuyuanRepository - 修缘仓储接口
 * 
 * @description
 * 定义 Xiuyuan 聚合根的持久化接口。
 * 
 * **设计原则**：
 * - 接口隔离：只定义领域层需要的方法
 * - 依赖倒置：领域层定义接口，基础设施层实现
 * - 使用 Result 类型：统一错误处理
 * - 支持批量操作：提升性能
 * 
 * **实现要求**：
 * - 实现类需要协调 msgpack、块属性、Riff 三个数据源
 * - 实现类需要处理领域模型与持久化模型的转换
 * - 实现类需要发布领域事件
 */

import { Result } from '../../../../types/result';
import { Xiuyuan } from '../Xiuyuan';
import { XiuyuanId } from '../XiuyuanId';
import { BlockId } from '../BlockId';

export interface IXiuyuanRepository {
  /**
   * 保存 Xiuyuan 聚合根
   * 
   * @description
   * 保存 Xiuyuan 到持久化存储。如果 Xiuyuan 已存在，则更新；否则创建新记录。
   * 
   * **实现要求**：
   * - 保存到 msgpack 存储
   * - 写入块属性
   * - 同步到 Riff
   * - 发布领域事件
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  save(xiuyuan: Xiuyuan): Promise<Result<void>>;

  /**
   * 根据 ID 查找 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Result<Xiuyuan | null> - 成功返回 Xiuyuan（如果不存在则返回 null），失败返回错误
   */
  findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>>;

  /**
   * 根据块 ID 查找 Xiuyuan
   * 
   * @description
   * 一个块可能关联多个 Xiuyuan（例如，多面卡片）。
   * 
   * @param blockId - 块 ID
   * @returns Result<Xiuyuan[]> - 成功返回 Xiuyuan 列表，失败返回错误
   */
  findByBlockId(blockId: BlockId): Promise<Result<Xiuyuan[]>>;

  /**
   * 查找所有 Xiuyuan
   * 
   * @returns Result<Xiuyuan[]> - 成功返回所有 Xiuyuan，失败返回错误
   */
  findAll(): Promise<Result<Xiuyuan[]>>;

  /**
   * 删除 Xiuyuan
   * 
   * @description
   * 删除 Xiuyuan 及其所有关联的卡片。
   * 
   * **实现要求**：
   * - 从 msgpack 存储删除
   * - 删除块属性
   * - 从 Riff 删除
   * - 发布领域事件
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  delete(xiuyuan: Xiuyuan): Promise<Result<void>>;

  /**
   * 批量保存 Xiuyuan
   * 
   * @description
   * 批量保存多个 Xiuyuan，提升性能。
   * 
   * @param xiuyuans - Xiuyuan 列表
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  saveMany(xiuyuans: Xiuyuan[]): Promise<Result<void>>;

  /**
   * 批量删除 Xiuyuan
   * 
   * @description
   * 批量删除多个 Xiuyuan，提升性能。
   * 
   * @param xiuyuans - Xiuyuan 列表
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  deleteMany(xiuyuans: Xiuyuan[]): Promise<Result<void>>;
}
