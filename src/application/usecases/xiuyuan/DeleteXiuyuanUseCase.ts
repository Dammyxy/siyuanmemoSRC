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

import { Result } from '@/types/result';
import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 删除 Xiuyuan 用例
 * 
 * @class DeleteXiuyuanUseCase
 */
export class DeleteXiuyuanUseCase {
  /**
   * 构造函数
   * 
   * @param xiuyuanService - Xiuyuan 领域服务（临时依赖）
   */
  constructor(
    private readonly xiuyuanService: XiuyuanService
  ) {}

  /**
   * 执行用例
   * 
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<boolean> - 成功返回 true，失败返回错误
   * 
   * @example
   * ```typescript
   * const useCase = new DeleteXiuyuanUseCase(xiuyuanService);
   * const result = await useCase.execute('xiuyuan-123');
   * 
   * if (result.ok) {
   *   console.log('Deleted successfully');
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async execute(xiuyuanId: string): Promise<Result<boolean>> {
    // 委托给 XiuyuanService
    return this.xiuyuanService.deleteXiuyuan(xiuyuanId);
  }
}
