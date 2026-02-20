/**
 * CreateXiuyuanFromBlocksUseCase - 从块创建 Xiuyuan 用例
 * 
 * @description
 * 编排从思源笔记块创建 Xiuyuan 的业务流程。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 从块 ID 创建 Xiuyuan 聚合根
 * - 通过 Repository 持久化
 * - 返回创建的 Xiuyuan 和卡片
 * 
 * **业务流程**：
 * 1. 验证 CreateXiuyuanFromBlocksCommand
 * 2. 检查块是否已经关联 Xiuyuan（防止重复创建）
 * 3. 创建 Xiuyuan 聚合根
 * 4. 持久化 Xiuyuan
 * 5. 返回创建的 Xiuyuan 和卡片
 */

import { Result } from '@/types/result';
import { CreateXiuyuanFromBlocksCommand } from '../../commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 从块创建 Xiuyuan 用例
 * 
 * @class CreateXiuyuanFromBlocksUseCase
 */
export class CreateXiuyuanFromBlocksUseCase {
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
   * @param command - 创建命令
   * @returns Result<any> - 成功返回创建的 Xiuyuan 和卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * const useCase = new CreateXiuyuanFromBlocksUseCase(xiuyuanService);
   * const result = await useCase.execute({
   *   blockIds: ['block-1', 'block-2'],
   *   templateId: 'basic',
   *   fieldMapping: { question: 'block-1', answer: 'block-2' },
   *   deckId: 'deck-123',
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Created Xiuyuan:', result.value.xiuyuan.id);
   *   console.log('Created Cards:', result.value.cards.length);
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async execute(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
    // 委托给 XiuyuanService
    // 注意：当前 XiuyuanService.createFromBlocks 不支持 priority 参数
    return this.xiuyuanService.createFromBlocks(
      command.blockIds,
      command.templateId,
      command.fieldMapping || {},
      command.deckId
    );
  }
}
