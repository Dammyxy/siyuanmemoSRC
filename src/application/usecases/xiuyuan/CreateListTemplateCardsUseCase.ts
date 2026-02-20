/**
 * CreateListTemplateCardsUseCase - 创建列表模板卡片用例
 * 
 * @description
 * 编排列表模板卡片创建的业务流程。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 创建列表模板的 Xiuyuan 和卡片
 * - 通过 Repository 持久化
 * - 返回创建的 Xiuyuan 和卡片
 * 
 * **列表模板特点**：
 * - 1 个 Xiuyuan → N 张 FSRSCard（N = 子列表项数量）
 * - 每张卡片的问题相同（父列表项），答案不同（各个子列表项）
 * - 支持提示功能：使用 `→` 分隔提示和答案
 * - 渐进式显示：复习时显示已学过的答案 + 当前提示
 * 
 * **业务流程**：
 * 1. 验证 CreateListTemplateCardsCommand
 * 2. 获取父块和子块的内容
 * 3. 创建 Xiuyuan 聚合根
 * 4. 为每个子块创建卡片
 * 5. 持久化 Xiuyuan
 * 6. 返回创建的 Xiuyuan 和卡片
 */

import { Result } from '@/types/result';
import { CreateListTemplateCardsCommand } from '../../commands/xiuyuan/CreateListTemplateCardsCommand';
import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 创建列表模板卡片用例
 * 
 * @class CreateListTemplateCardsUseCase
 */
export class CreateListTemplateCardsUseCase {
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
   * const useCase = new CreateListTemplateCardsUseCase(xiuyuanService);
   * const result = await useCase.execute({
   *   parentBlockId: '20230101120000-parent',
   *   childBlockIds: ['20230101120001-child1', '20230101120002-child2'],
   *   templateId: 'builtin-list-item',
   *   deckId: 'default-deck',
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
  async execute(command: CreateListTemplateCardsCommand): Promise<Result<any>> {
    // 委托给旧的 listTemplate.ts 函数
    // TODO: 未来完全重构为符合 DDD 的实现
    
    const { createListTemplateCards } = await import('@/core/xiuyuan/listTemplate');
    
    // 注意：旧函数需要 XiuyuanStorage 和 StorageManager
    // 这里暂时通过 XiuyuanService 获取
    const xiuyuanStorage = (this.xiuyuanService as any).storage;
    const storageManager = (this.xiuyuanService as any).storageManager;
    
    return createListTemplateCards(
      command.parentBlockId,
      command.childBlockIds,
      command.templateId,
      xiuyuanStorage,
      storageManager
    );
  }
}
