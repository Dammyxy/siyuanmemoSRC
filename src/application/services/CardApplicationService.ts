/**
 * CardApplicationService - 卡片应用服务
 * 
 * @description
 * 卡片相关操作的主要入口点，封装三个核心用例。
 * 作为表现层和应用层之间的桥梁，提供清晰的 API。
 * 
 * **设计原则**：
 * - 应用服务模式：协调用例执行
 * - 依赖注入：通过构造函数注入用例
 * - 薄包装：不包含业务逻辑，仅委托给用例
 * - 统一接口：为表现层提供一致的 API
 * 
 * **职责**：
 * - 提供卡片创建、删除、更新的统一接口
 * - 委托具体业务逻辑给对应的用例
 * - 处理用例之间的协调（如果需要）
 * 
 * **使用场景**：
 * - 表现层（UI 组件、事件处理器）调用此服务
 * - 服务委托给具体的用例执行业务逻辑
 * - 用例协调领域层和基础设施层
 */

import { Result } from '@/types/result';
import { CreateCardCommand } from '../commands/card/CreateCardCommand';
import { DeleteCardCommand } from '../commands/card/DeleteCardCommand';
import { UpdateCardCommand } from '../commands/card/UpdateCardCommand';
import { CreateCardUseCase } from '../usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '../usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '../usecases/card/UpdateCardUseCase';
import { Card } from '@/core/xiuyuan/domain/Card';

/**
 * 卡片应用服务
 * 
 * @class CardApplicationService
 */
export class CardApplicationService {
  /**
   * 构造函数
   * 
   * @param createCardUseCase - 创建卡片用例
   * @param deleteCardUseCase - 删除卡片用例
   * @param updateCardUseCase - 更新卡片用例
   */
  constructor(
    private readonly createCardUseCase: CreateCardUseCase,
    private readonly deleteCardUseCase: DeleteCardUseCase,
    private readonly updateCardUseCase: UpdateCardUseCase
  ) {}

  /**
   * 创建卡片
   * 
   * @param command - 创建卡片命令
   * @returns Result<Card> - 成功返回创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.createCard({
   *   blockId: '20240101120000-abc123',
   *   templateId: 'basic',
   *   faces: [
   *     { question: 'What is DDD?', answer: 'Domain-Driven Design' }
   *   ],
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Card created:', result.value);
   * } else {
   *   console.error('Failed to create card:', result.error);
   * }
   * ```
   */
  async createCard(command: CreateCardCommand): Promise<Result<Card>> {
    return this.createCardUseCase.execute(command);
  }

  /**
   * 删除卡片
   * 
   * @param command - 删除卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.deleteCard({
   *   cardId: 'card-123'
   * });
   * 
   * if (result.ok) {
   *   console.log('Card deleted successfully');
   * } else {
   *   console.error('Failed to delete card:', result.error);
   * }
   * ```
   */
  async deleteCard(command: DeleteCardCommand): Promise<Result<void>> {
    return this.deleteCardUseCase.execute(command);
  }

  /**
   * 更新卡片
   * 
   * @param command - 更新卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.updateCard({
   *   cardId: 'card-123',
   *   xiuyuanId: 'xiuyuan-456',
   *   faceIndex: 1
   * });
   * 
   * if (result.ok) {
   *   console.log('Card updated successfully');
   * } else {
   *   console.error('Failed to update card:', result.error);
   * }
   * ```
   */
  async updateCard(command: UpdateCardCommand): Promise<Result<void>> {
    return this.updateCardUseCase.execute(command);
  }
}
