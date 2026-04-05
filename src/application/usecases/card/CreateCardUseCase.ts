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

import { ok, err, isErr, type Result } from '@/types/result';
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
import type { CardCreationSiyuanPort } from '@/application/ports/CardCreationSiyuanPort';
import { CardCreationSiyuanAdapter } from '@/infrastructure/siyuan/CardCreationSiyuanAdapter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CreateCardUseCase');

export class CreateCardUseCase {
  private readonly siyuanApi: CardCreationSiyuanPort;

  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardCreationService: CardCreationService,
    private readonly eventBus: EventBus,
    ports?: { siyuanApi?: CardCreationSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new CardCreationSiyuanAdapter();
  }

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

    // 2. 自动选择模板（如果未指定）
    let templateId: string | null;
    try {
      templateId = await this.selectTemplate(command);
    } catch (error) {
      logger.error('Template selection failed', error);
      return err(this.toError(error, 'Template selection failed'));
    }
    if (!templateId) {
      return err(new Error('Failed to select template'));
    }

    // 3. 将命令转换为领域对象（需要先转换以获取 faces）
    const conversionResult = this.convertCommandToDomain({
      ...command,
      templateId,
    });
    if (isErr(conversionResult)) {
      return conversionResult;
    }

    const { blockIds, templateIdObj, faces, priority } = conversionResult.value;

    // 4. 自动选择调度器类型（基于 faces 和 cardType）
    const schedulerType = this.selectSchedulerType(command, faces);

    // 5. 创建 Xiuyuan 聚合根
    const xiuyuanResult = Xiuyuan.create({
      blockIDs: blockIds,
      templateID: templateIdObj,
      faces: faces,
      priority: priority,
      meta: {
        ...(command.meta || {}),
        ...(command.metadata || {}),
        schedulerType: schedulerType, // Store schedulerType in meta (Requirement 5.5)
        cardType: command.cardType,   // 🆕 传递卡片类型到 meta
        ...(command.extractedFrom ? { extractedFrom: command.extractedFrom } : {}),
        ...(command.progressiveLineage ? { progressive: command.progressiveLineage } : {}),
      }
    });

    if (isErr(xiuyuanResult)) {
      return xiuyuanResult;
    }

    const xiuyuan = xiuyuanResult.value;

    // 6. 使用 CardCreationService 创建卡片
    // 默认为第一个面创建卡片
    const cardResult = this.cardCreationService.createCard(xiuyuan, 0);
    if (isErr(cardResult)) {
      return cardResult;
    }

    const card = cardResult.value;

    // 7. 持久化 Xiuyuan（包括卡片）
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (isErr(saveResult)) {
      return saveResult;
    }

    // 8. 发布领域事件
    const events = xiuyuan.getDomainEvents();
    await this.eventBus.publishAll(events);
    xiuyuan.clearDomainEvents();

    // 9. 返回创建的卡片
    return ok(card);
  }

  /**
   * 自动选择模板
   * 
   * 根据以下规则选择模板：
   * 1. 如果显式指定了 templateId，直接使用
   * 2. 检测块内容是否包含 <> 符号
   *    - 有符号 → builtin-quick-card（会动态生成单向或双向）
   * 3. 根据 cardType 和 blockCount 选择默认模板
   * 
   * @private
   * @param command - 创建卡片命令
   * @returns 模板 ID
   */
  private async selectTemplate(command: CreateCardCommand): Promise<string | null> {
    // 1. 如果显式指定了模板，直接使用（Requirement 8.6）
    if (command.templateId) {
      return command.templateId;
    }

    // 2. 获取所有 blockIds
    const blockIds: string[] = [];
    if (command.blockId) {
      blockIds.push(command.blockId);
    }
    if (command.blockIds) {
      blockIds.push(...command.blockIds);
    }

    if (blockIds.length === 0) {
      return null;
    }

    // 3. 检测第一个块是否包含 <> 符号（Requirement 8.1）
    const hasSymbol = await this.detectSymbol(blockIds[0]);
    if (hasSymbol) {
      // 有 <> 符号 → 统一使用 builtin-quick-card
      // 会在创建时根据符号动态生成单向或双向卡片
      return 'builtin-quick-card';
    }

    // 4. 根据 cardType 和 blockCount 选择默认模板（Requirements 8.2-8.5）
    const cardType = command.cardType || 'item';
    const blockCount = blockIds.length;
    
    return this.getDefaultTemplateForType(cardType, blockCount);
  }

  /**
   * 检测块内容是否包含 <> 符号
   * 
   * @private
   * @param blockId - 块 ID
   * @returns 是否包含 <> 符号
   */
  private async detectSymbol(blockId: string): Promise<boolean> {
    const content = await this.siyuanApi.getBlockText(blockId);
    return content.includes('<>');
  }

  /**
   * 根据卡片类型和块数量获取默认模板
   * 
   * 规则：
   * - Concept + 2块 → builtin-concept-descriptor (Requirement 8.2)
   * - Concept + 1块 → builtin-concept-simple (Requirement 8.3)
   * - Item + 1块 → builtin-quick-card (Requirement 8.4)
   * - Item + 2块 → builtin-basic-qa (Requirement 8.5)
   * - Descriptor → builtin-concept-descriptor
   * - Topic → builtin-topic
   * 
   * @private
   * @param cardType - 卡片类型
   * @param blockCount - 块数量
   * @returns 模板 ID
   */
  private getDefaultTemplateForType(cardType: string, blockCount: number): string {
    switch (cardType) {
      case 'concept':
        // Concept 卡：2块用 descriptor 模板，1块用 simple 模板
        return blockCount > 1
          ? 'builtin-concept-descriptor'
          : 'builtin-concept-simple';
      
      case 'descriptor':
        // Descriptor 卡：总是使用 concept-descriptor 模板
        return 'builtin-concept-descriptor';
      
      case 'topic':
        // Topic 卡：使用 topic 模板
        return 'builtin-topic';
      
      case 'item':
      default:
        // Item 卡：1块用 quick-card，2块用 basic-qa
        return blockCount === 1
          ? 'builtin-quick-card'
          : 'builtin-basic-qa';
    }
  }

  /**
   * 自动选择调度器类型
   * 
   * 根据以下规则选择调度器：
   * 1. 如果显式指定了 schedulerType，直接使用（Requirement 5.5）
   * 2. Item → FSRS v6（总是有答案）
   * 3. Topic → A-Factor（总是无答案）
   * 4. Descriptor → FSRS v6（永远有答案）
   * 5. Concept → 有答案 ? FSRS v6 : A-Factor
   * 
   * 扩展点：未来可以添加新的卡片类型和调度器映射
   * 
   * @private
   * @param command - 创建卡片命令
   * @param faces - 卡片面列表
   * @returns 调度器类型
   */
  private selectSchedulerType(command: CreateCardCommand, faces: CardFace[]): 'fsrs-v6' | 'a-factor' | 'sm2' {
    // 1. 如果显式指定了调度器类型，直接使用（Requirement 5.5）
    if (command.schedulerType) {
      return command.schedulerType;
    }

    // 2. 获取卡片类型
    const cardType = command.cardType || 'item';

    // 3. 根据卡片类型选择调度器
    switch (cardType) {
      case 'item':
        // Item 卡总是有答案，使用 FSRS v6
        return 'fsrs-v6';
      
      case 'topic':
        // Topic 卡总是无答案，使用 A-Factor
        return 'a-factor';
      
      case 'descriptor':
        // Descriptor 卡永远有答案，使用 FSRS v6
        return 'fsrs-v6';
      
      case 'concept':
        // Concept 卡：检查是否有非空答案
        // 有答案 → FSRS v6，无答案 → A-Factor
        const hasAnswer = this.hasValidAnswer(faces);
        return hasAnswer ? 'fsrs-v6' : 'a-factor';
      
      default:
        // 默认使用 FSRS v6（扩展点：未来新卡片类型）
        return 'fsrs-v6';
    }
  }

  /**
   * 检查 faces 是否有有效的答案
   * 
   * @private
   * @param faces - 卡片面列表
   * @returns 是否有有效答案
   */
  private hasValidAnswer(faces: CardFace[]): boolean {
    if (!faces || faces.length === 0) {
      return false;
    }

    // 检查是否至少有一个 face 有非空答案
    return faces.some(face => {
      const answer = face.answer;
      return answer && answer.trim().length > 0;
    });
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
      if (isErr(blockIdResult)) {
        return blockIdResult;
      }
      blockIds.push(blockIdResult.value);
    }
    
    if (command.blockIds) {
      for (const blockIdStr of command.blockIds) {
        const blockIdResult = BlockId.create(blockIdStr);
        if (isErr(blockIdResult)) {
          return blockIdResult;
        }
        blockIds.push(blockIdResult.value);
      }
    }

    if (blockIds.length === 0) {
      return err(new Error('At least one blockId is required'));
    }

    // 转换 TemplateId (templateId should be set by selectTemplate in execute())
    if (!command.templateId) {
      return err(new Error('templateId is required'));
    }
    const templateIdResult = TemplateId.create(command.templateId);
    if (isErr(templateIdResult)) {
      return templateIdResult;
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

        if (isErr(faceResult)) {
          return faceResult;
        }

        faces.push(faceResult.value);
      }
    } else {
      // 如果没有提供 faces，根据模板创建默认的 face
      const templateId = command.templateId!;
      
      // 注意：模板的存在性验证应该在 Repository 层或更早的阶段完成
      // UseCase 只负责业务流程编排，不关心基础设施细节
      
      if (templateId === 'builtin-basic-qa' || templateId === 'builtin-bidirectional') {
        // 基础问答和双向卡片：第一个块为问题，第二个块为答案
        if (blockIds.length >= 2) {
          const defaultFaceResult = CardFace.create({
            question: blockIds[0].getValue(),
            answer: blockIds[1].getValue(),
            questionBlockId: blockIds[0].getValue(),
            answerBlockId: blockIds[1].getValue(),
          });

          if (isErr(defaultFaceResult)) {
            return defaultFaceResult;
          }

          faces.push(defaultFaceResult.value);
        } else {
          return err(new Error(`Template ${templateId} requires at least 2 blocks`));
        }
      } else {
        const isTopicFace = templateId === 'builtin-topic' || command.cardType === 'topic';
        // Topic 卡默认只有正面，没有答案块；其他模板沿用单块问答默认面。
        const defaultFaceResult = CardFace.create({
          question: blockIds[0].getValue(),
          answer: isTopicFace ? '' : blockIds[0].getValue(),
          questionBlockId: blockIds[0].getValue(),
          answerBlockId: isTopicFace ? undefined : blockIds[0].getValue(),
        });

        if (isErr(defaultFaceResult)) {
          return defaultFaceResult;
        }

        faces.push(defaultFaceResult.value);
      }
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
      if (isErr(priorityResult)) {
        return priorityResult;
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

  private toError(error: unknown, defaultMessage: string): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(defaultMessage);
  }
}
