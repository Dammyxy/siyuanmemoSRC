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
import { ClozeCardGenerator } from '@/core/xiuyuan/domain/services/ClozeCardGenerator';
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
      // 1. 检查是否已经创建过 Xiuyuan 卡片
      const { getBlockAttrs } = await import('@/core/siyuan/api');
      const firstBlockId = command.blockIds[0];
      const attrs = await getBlockAttrs(firstBlockId);
      
      if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        console.log(`[CreateXiuyuanFromBlocksUseCase] Block ${firstBlockId} already has Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('此块已经创建过修缘卡片，请勿重复创建'));
      }
      
      // 2. 验证模板（优先使用自定义模版）
      let template = command.template || this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }

      // 🆕 处理双向卡片：动态生成 cardRules
      if (command.isBidirectional && command.templateId === 'builtin-quick-card') {
        console.log('[CreateXiuyuanFromBlocksUseCase] Creating bidirectional card, adding reverse rule');
        template = {
          ...template,
          cardRules: [
            {
              typeMarker: 'forward',
              frontFields: ['content'],
              backFields: ['content'],
              cardType: 'basic',
            },
            {
              typeMarker: 'reverse',
              frontFields: ['content'],
              backFields: ['content'],
              cardType: 'basic',
            },
          ],
        };
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }

      // 3. 创建值对象
      // 🔧 统一 ID 格式：使用代表块 ID（第一个块）
      const representativeBlockId = command.blockIds[0];
      const xiuyuanIdResult = XiuyuanId.create(`xy_${representativeBlockId}`);
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

      // 4. 构建 CardFace（从 fieldMapping 和模板）
      const faces: CardFace[] = [];
      const fieldMapping = command.fieldMapping || {};

      // 🆕 处理多填空卡片（使用领域服务）
      if (command.clozeInfo && command.clozeInfo.clozes.length > 0) {
        const facesResult = ClozeCardGenerator.generateFaces(
          command.clozeInfo.originalContent,
          command.clozeInfo.clozes,
          command.blockIds[0]
        );
        
        if (!facesResult.ok) {
          return facesResult as Result<any>;
        }
        
        faces.push(...facesResult.value);
      }
      // 🆕 处理背面挖空卡片
      else if (command.backClozeInfo && command.backClozeInfo.clozes.length > 0) {
        const { front, back, clozes, direction } = command.backClozeInfo;
        const blockId = command.blockIds[0];
        
        console.log('[CreateXiuyuanFromBlocksUseCase] Creating back cloze faces:', {
          direction,
          clozeCount: clozes.length
        });
        
        // 正向卡片：为每个挖空生成一个 face
        if (direction === 'forward' || direction === 'both') {
          for (let i = 0; i < clozes.length; i++) {
            const faceResult = CardFace.create({
              question: front,
              answer: back,
              questionBlockId: blockId,
              answerBlockId: blockId,
              metadata: {
                clozeIndex: i,
                totalClozes: clozes.length,
                direction: 'forward'
              }
            });
            
            if (!faceResult.ok) {
              return faceResult as Result<any>;
            }
            
            faces.push(faceResult.value);
          }
        }
        
        // 反向卡片：只生成一个 face，不挖空
        if (direction === 'backward' || direction === 'both') {
          const faceResult = CardFace.create({
            question: back,   // 原始背面（完整显示）
            answer: front,    // 原始正面
            questionBlockId: blockId,
            answerBlockId: blockId,
            metadata: {
              clozeIndex: -1,  // -1 表示不挖空
              direction: 'reverse'
            }
          });
          
          if (!faceResult.ok) {
            return faceResult as Result<any>;
          }
          
          faces.push(faceResult.value);
        }
      }
      // 🆕 处理双向卡片：两个 face 使用相同的块内容
      else if (command.isBidirectional && command.templateId === 'builtin-quick-card') {
        console.log('[CreateXiuyuanFromBlocksUseCase] Creating bidirectional faces');
        
        const blockId = command.blockIds[0];
        const blockText = await getBlockText(blockId);
        
        // 正向 face
        const forwardFaceResult = CardFace.create({
          question: blockText || `Block ${blockId}`,
          answer: blockText || `Block ${blockId}`,
          questionBlockId: blockId,
          answerBlockId: blockId
        });
        
        if (!forwardFaceResult.ok) {
          return forwardFaceResult as Result<any>;
        }
        
        // 反向 face
        const reverseFaceResult = CardFace.create({
          question: blockText || `Block ${blockId}`,
          answer: blockText || `Block ${blockId}`,
          questionBlockId: blockId,
          answerBlockId: blockId
        });
        
        if (!reverseFaceResult.ok) {
          return reverseFaceResult as Result<any>;
        }
        
        faces.push(forwardFaceResult.value, reverseFaceResult.value);
      } 
      else {
        // 普通卡片：使用原有逻辑
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
      }

      // 5. 创建 Xiuyuan 聚合根
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

      // 6. 为每个 face 创建卡片
      for (let i = 0; i < faces.length; i++) {
        const cardResult = xiuyuan.createCard(i);
        if (!cardResult.ok) {
          const error = (cardResult as any).error || new Error('Failed to create card');
          console.error(`[CreateXiuyuanFromBlocksUseCase] Failed to create card for face ${i}:`, error);
          return err(error);
        }
      }

      // 7. 添加到 Riff（可选，错误不阻断）
      const deckId = command.deckId || BUILTIN_DECK_ID;
      
      try {
        await addRiffCards(deckId, [representativeBlockId]);
        console.log('[CreateXiuyuanFromBlocksUseCase] ✅ Created Xiuyuan and added to Riff:', {
          xiuyuanId: xiuyuan.getId().getValue(),
          blockId: representativeBlockId,
          source: 'template-creation'
        });
      } catch (error) {
        console.warn('[CreateXiuyuanFromBlocksUseCase] Failed to add to Riff:', error);
        // 不阻断流程
      }

      // 8. 通过 Repository 持久化
      const saveResult = await this.xiuyuanRepository.save(xiuyuan);
      if (!saveResult.ok) {
        return saveResult as Result<any>;
      }

      // 9. 返回结果
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
