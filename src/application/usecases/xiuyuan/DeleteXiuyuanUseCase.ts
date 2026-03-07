/**
 * DeleteXiuyuanUseCase - 删除 Xiuyuan 用例
 * 
 * @description
 * 编排删除 Xiuyuan 的业务流程。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证 Xiuyuan 是否存在
 * - 删除 Xiuyuan 及其关联的卡片
 * - 清理块属性
 * - 返回删除结果
 * 
 * **业务流程**：
 * 1. 验证 xiuyuanId
 * 2. 检查 Xiuyuan 是否存在
 * 3. 删除 Xiuyuan（包括关联的卡片）
 * 4. 清理块属性
 * 5. 返回删除结果
 */

import { Result, ok, err, isErr } from '@/types/result';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeleteXiuyuanUseCase');

/**
 * 删除 Xiuyuan 用例
 * 
 * @class DeleteXiuyuanUseCase
 */
export class DeleteXiuyuanUseCase {
  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository
  ) {}

  /**
   * 执行用例
   * 
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<boolean> - 成功返回 true（删除成功）或 false（不存在），失败返回错误
   * 
   * @example
   * ```typescript
   * const useCase = new DeleteXiuyuanUseCase(xiuyuanRepository);
   * const result = await useCase.execute('xiuyuan-123');
   * 
   * if (result.ok) {
   *   if (result.value) {
   *     console.log('Deleted successfully');
   *   } else {
   *     console.log('Xiuyuan not found');
   *   }
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async execute(xiuyuanId: string): Promise<Result<boolean>> {
    try {
      // 1. 创建 XiuyuanId 值对象
      const idResult = XiuyuanId.create(xiuyuanId);
      if (isErr(idResult)) {
        return idResult as Result<boolean>;
      }

      // 2. 查找 Xiuyuan
      const findResult = await this.xiuyuanRepository.findById(idResult.value);
      if (isErr(findResult)) {
        return err(findResult.error);
      }

      if (!findResult.value) {
        // Xiuyuan 不存在
        return ok(false);
      }

      const xiuyuan = findResult.value;

      // 3. 通过 Repository 删除（会级联删除卡片、清理块属性）
      const deleteResult = await this.xiuyuanRepository.delete(xiuyuan);
      if (isErr(deleteResult)) {
        return err(deleteResult.error);
      }

      // 4. 返回成功
      return ok(true);
    } catch (error) {
      logger.error('Failed:', error);
      return err(error as Error);
    }
  }
}
