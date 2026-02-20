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
 * 1. 验证模板是否存在
 * 2. 构建 CardFace（从 fieldMapping）
 * 3. 创建 Xiuyuan 聚合根
 * 4. 添加到 Riff（可选）
 * 5. 通过 Repository 持久化
 * 6. 返回创建的 Xiuyuan 和卡片
 */

import { Result, ok, err } from '@/types/result';
import { CreateXiuyuanFromBlocksCommand } from '../../commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { getBlockText } from '@/core/siyuan/block';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { ICardTemplate } from '@/core/xiuyuan/types';

/**
 * 从块创建 Xiuyuan 用例
 * 
 * @class CreateXiuyuanFromBlocksUseCase
 */
export class CreateXiuyuanFromBlocksUseCase {
  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   * @param templateRegistry - 模板注册表（用于获取模板）
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>
  ) {}

  /**
   * 执行用例
   * 
   * @param command - 创建命令
   * @returns Result<any> - 成功返回创建的 Xiuyuan 和卡片，失败返回错误
   */
  async execute(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
    try {
      // 1. 验证模板
      const template = this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }

      // 2. 创建值对象
      const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      if (!xiuyuanIdResult.ok) {
        return xiuyuanIdResult as Result<any>;
      }

      const blockIdResults = command.blockIds.map(id => BlockId.create(id));
      const failedBlockId = blockIdResults.find(r => !r.ok);
      if (failedBlockId && !failedBlockId.ok) {
        return failedBlockId as Result<any>;
      }
      const blockIds = blockIdResults.map(r => (r as any).value);

      const templateIdResult = TemplateId.create(command.templateId);
      if (!templateIdResult.ok) {
        return templateIdResult as Result<any>;
      }

      const priorityResult = Priority.create(command.priority || 50);
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 3. 构建 CardFace（从 fieldMapping 和模板）
      const faces: CardFace[] = [];
      const fieldMapping = command.fieldMapping || {};

      for (const rule of template.cardRules) {
        // 获取问题和答案的块 ID
        const questionBlockId = rule.frontFields.length > 0 
          ? fieldMapping[rule.frontFields[0]] || command.blockIds[0]
          : command.blockIds[0];
        
        const answerBlockId = rule.backFields.length > 0
          ? fieldMapping[rule.backFields[0]] || command.blockIds[command.blockIds.length - 1]
          : command.blockIds[command.blockIds.length - 1];

        // 获取块内容
        const questionText = await getBlockText(questionBlockId);
        const answerText = await getBlockText(answerBlockId);

        const faceResult = CardFace.create({
          question: questionText || `Block ${questionBlockId}`,
          answer: answerText || `Block ${answerBlockId}`,
          questionBlockId,
          answerBlockId
        });

        if (!faceResult.ok) {
          return faceResult as Result<any>;
        }

        faces.push(faceResult.value);
      }

      // 4. 创建 Xiuyuan 聚合根
      const xiuyuanResult = Xiuyuan.create({
        id: xiuyuanIdResult.value,
        blockIDs: blockIds,
        templateID: templateIdResult.value,
        faces,
        priority,
        meta: {
          schedulerType: 'fsrs-v6',
          fieldMapping
        }
      });

      if (!xiuyuanResult.ok) {
        return xiuyuanResult as Result<any>;
      }

      const xiuyuan = xiuyuanResult.value;

      // 5. 添加到 Riff（可选，错误不阻断）
      const deckId = command.deckId || BUILTIN_DECK_ID;
      const representativeBlockId = command.blockIds[0];
      
      try {
        await addRiffCards(deckId, [representativeBlockId]);
        console.log('[CreateXiuyuanFromBlocksUseCase] Added to Riff:', representativeBlockId);
      } catch (error) {
        console.warn('[CreateXiuyuanFromBlocksUseCase] Failed to add to Riff:', error);
        // 不阻断流程
      }

      // 6. 通过 Repository 持久化
      const saveResult = await this.xiuyuanRepository.save(xiuyuan);
      if (!saveResult.ok) {
        return saveResult as Result<any>;
      }

      // 7. 返回结果
      return ok({
        xiuyuan: {
          id: xiuyuan.getId().getValue(),
          blockIDs: xiuyuan.getBlockIDs().map(id => id.getValue()),
          templateID: xiuyuan.getTemplateID().getValue(),
        },
        cards: xiuyuan.getCards().map(card => ({
          id: card.getId().getValue(),
          xiuyuanId: card.getXiuyuanId().getValue(),
          faceIndex: card.getFaceIndex()
        }))
      });
    } catch (error) {
      console.error('[CreateXiuyuanFromBlocksUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
