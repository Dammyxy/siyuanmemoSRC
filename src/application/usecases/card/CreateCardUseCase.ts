/**
 * CreateCardUseCase - 创建卡片用例
 * 
 * @description
 * 编排卡片创建的业务流程，协调领域层和基础设施层。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 创建 Xiuyuan 聚合根
 * - 使用 CardCreationService 创建卡片
 * - 通过 XiuyuanRepository 持久化
 * - 返回创建的卡片
 * 
 * **业务流程**：
 * 1. 验证 CreateCardCommand
 * 2. 将命令转换为领域对象（值对象）
 * 3. 创建 Xiuyuan 聚合根
 * 4. 使用 CardCreationService 创建卡片
 * 5. 持久化 Xiuyuan（包括卡片）
 * 6. 返回创建的卡片
 */

import { Result, ok, err } from '@/types/result';
import { CreateCardCommand, validateCreateCardCommand } from '../../commands/card/CreateCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { Card } from '@/core/xiuyuan/domain/Card';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';

export class CreateCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardCreationService: CardCreationService
  ) {}

  /**
   * 执行创建卡片用例
   * 
   * @param command - 创建卡片命令
   * @returns Result<Card> - 成功返回创建的 Card，失败返回错误
   */
  async execute(command: CreateCardCommand): Promise<Result<Card>> {
    // 1. 验证输入命令
    const validationError = validateCreateCardCommand(command);
    if (validationError) {
      return err(new Error(`Invalid command: ${validationError}`));
    }

    // 2. 将命令转换为领域对象
    const conversionResult = this.convertCommandToDomain(command);
    if (!conversionResult.ok) {
      return err(conversionResult.error);
    }

    const { blockIds, templateId, faces, priority } = conversionResult.value;

    // 3. 创建 Xiuyuan 聚合根
    const xiuyuanResult = Xiuyuan.create({
      blockIDs: blockIds,
      templateID: templateId,
      faces: faces,
      priority: priority,
      meta: command.meta || {}
    });

    if (!xiuyuanResult.ok) {
      return err(xiuyuanResult.error);
    }

    const xiuyuan = xiuyuanResult.value;

    // 4. 使用 CardCreationService 创建卡片
    // 默认为第一个面创建卡片
    const cardResult = this.cardCreationService.createCard(xiuyuan, 0);
    if (!cardResult.ok) {
      return err(cardResult.error);
    }

    const card = cardResult.value;

    // 5. 持久化 Xiuyuan（包括卡片）
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (!saveResult.ok) {
      return err(saveResult.error);
    }

    // 6. 返回创建的卡片
    return ok(card);
  }

  /**
   * 将命令转换为领域对象
   * 
   * @private
   * @param command - 创建卡片命令
   * @returns Result<ConversionResult> - 成功返回转换后的领域对象，失败返回错误
   */
  private convertCommandToDomain(command: CreateCardCommand): Result<{
    blockIds: BlockId[];
    templateId: TemplateId;
    faces: CardFace[];
    priority: Priority;
  }> {
    // 转换 BlockId
    const blockIdResult = BlockId.create(command.blockId);
    if (!blockIdResult.ok) {
      return err(new Error(`Invalid blockId: ${blockIdResult.error.message}`));
    }

    // 转换 TemplateId
    const templateIdResult = TemplateId.create(command.templateId);
    if (!templateIdResult.ok) {
      return err(new Error(`Invalid templateId: ${templateIdResult.error.message}`));
    }

    // 转换 CardFace 列表
    const faces: CardFace[] = [];
    for (let i = 0; i < command.faces.length; i++) {
      const faceData = command.faces[i];
      const faceResult = CardFace.create({
        question: faceData.question,
        answer: faceData.answer,
        questionBlockId: faceData.questionBlockId,
        answerBlockId: faceData.answerBlockId
      });

      if (!faceResult.ok) {
        return err(new Error(`Invalid face[${i}]: ${faceResult.error.message}`));
      }

      faces.push(faceResult.value);
    }

    // 转换 Priority
    let priority: Priority;
    if (command.priority !== undefined) {
      const priorityResult = Priority.create(command.priority);
      if (!priorityResult.ok) {
        return err(new Error(`Invalid priority: ${priorityResult.error.message}`));
      }
      priority = priorityResult.value;
    } else {
      priority = Priority.createDefault();
    }

    return ok({
      blockIds: [blockIdResult.value],
      templateId: templateIdResult.value,
      faces: faces,
      priority: priority
    });
  }
}
