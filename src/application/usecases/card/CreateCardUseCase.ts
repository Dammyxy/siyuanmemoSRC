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
import { EventBus } from '@/core/shared/domain/events/EventBus';

export class CreateCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardCreationService: CardCreationService,
    private readonly eventBus: EventBus
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

    // 2. 如果没有指定模板，根据卡片类型选择默认模板
    let templateId = command.templateId;
    if (!templateId && command.cardType) {
      templateId = this.getDefaultTemplateForType(command.cardType);
    }
    if (!templateId) {
      return err(new Error('templateId is required'));
    }

    // 3. 将命令转换为领域对象
    const conversionResult = this.convertCommandToDomain({
      ...command,
      templateId,
    });
    if (!conversionResult.ok) {
      return conversionResult as Result<Card>;
    }

    const { blockIds, templateIdObj, faces, priority } = conversionResult.value;

    // 4. 创建 Xiuyuan 聚合根
    const xiuyuanResult = Xiuyuan.create({
      blockIDs: blockIds,
      templateID: templateIdObj,
      faces: faces,
      priority: priority,
      meta: command.meta || {}
    });

    if (!xiuyuanResult.ok) {
      return xiuyuanResult as Result<Card>;
    }

    const xiuyuan = xiuyuanResult.value;

    // 5. 使用 CardCreationService 创建卡片
    // 默认为第一个面创建卡片
    const cardResult = this.cardCreationService.createCard(xiuyuan, 0);
    if (!cardResult.ok) {
      return cardResult;
    }

    const card = cardResult.value;

    // 6. 持久化 Xiuyuan（包括卡片）
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (!saveResult.ok) {
      return saveResult as Result<Card>;
    }

    // 7. 发布领域事件
    const events = xiuyuan.getDomainEvents();
    await this.eventBus.publishAll(events);
    xiuyuan.clearDomainEvents();

    // 8. 返回创建的卡片
    return ok(card);
  }

  /**
   * 根据卡片类型获取默认模板
   * 
   * @private
   * @param cardType - 卡片类型
   * @returns 模板 ID
   */
  private getDefaultTemplateForType(cardType: string): string {
    const typeToTemplate: Record<string, string> = {
      'basic': 'builtin-quick-card',
      'concept': 'builtin-concept-simple',
      'qa': 'builtin-symbol-qa',
      'cloze': 'builtin-cloze',
      'bidirectional': 'builtin-bidirectional',
    };
    return typeToTemplate[cardType] || 'builtin-quick-card';
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
    templateIdObj: TemplateId;
    faces: CardFace[];
    priority: Priority;
  }> {
    // 转换 BlockId（支持单个或多个）
    const blockIds: BlockId[] = [];
    
    if (command.blockId) {
      const blockIdResult = BlockId.create(command.blockId);
      if (!blockIdResult.ok) {
        return blockIdResult as any;
      }
      blockIds.push(blockIdResult.value);
    }
    
    if (command.blockIds) {
      for (const blockIdStr of command.blockIds) {
        const blockIdResult = BlockId.create(blockIdStr);
        if (!blockIdResult.ok) {
          return blockIdResult as any;
        }
        blockIds.push(blockIdResult.value);
      }
    }

    if (blockIds.length === 0) {
      return err(new Error('At least one blockId is required'));
    }

    // 转换 TemplateId
    const templateIdResult = TemplateId.create(command.templateId);
    if (!templateIdResult.ok) {
      return templateIdResult as any;
    }

    // 转换 CardFace 列表（如果提供）
    const faces: CardFace[] = [];
    if (command.faces) {
      for (let i = 0; i < command.faces.length; i++) {
        const faceData = command.faces[i];
        const faceResult = CardFace.create({
          question: faceData.question,
          answer: faceData.answer,
          questionBlockId: faceData.questionBlockId,
          answerBlockId: faceData.answerBlockId
        });

        if (!faceResult.ok) {
          return faceResult as any;
        }

        faces.push(faceResult.value);
      }
    } else {
      // 如果没有提供 faces，创建默认的 face
      // 使用第一个 blockId 作为问题和答案
      const defaultFaceResult = CardFace.create({
        question: blockIds[0].value,
        answer: blockIds[0].value,
        questionBlockId: blockIds[0].value,
        answerBlockId: blockIds[0].value,
      });

      if (!defaultFaceResult.ok) {
        return defaultFaceResult as any;
      }

      faces.push(defaultFaceResult.value);
    }

    // 转换 Priority
    let priority: Priority;
    if (command.priority !== undefined) {
      // 处理字符串类型的优先级
      let priorityValue: number;
      if (typeof command.priority === 'string') {
        priorityValue = command.priority === 'high' ? 1 : 0;
      } else {
        priorityValue = command.priority;
      }
      
      const priorityResult = Priority.create(priorityValue);
      if (!priorityResult.ok) {
        return priorityResult as any;
      }
      priority = priorityResult.value;
    } else {
      priority = Priority.createDefault();
    }

    return ok({
      blockIds: blockIds,
      templateIdObj: templateIdResult.value,
      faces: faces,
      priority: priority
    });
  }
}
