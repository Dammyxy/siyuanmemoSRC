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

import { Result, ok, err } from '@/types/result';
import { CreateListTemplateCardsCommand } from '../../commands/xiuyuan/CreateListTemplateCardsCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { sql } from '@/core/siyuan/api';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { ICardTemplate } from '@/core/xiuyuan/types';

/**
 * 解析子列表项文本，提取提示和答案
 * 
 * 格式：`提示 → 答案`
 * 
 * @param text 子列表项文本
 * @returns { cue: 提示文本, answer: 答案文本 }
 */
function parseCueAndAnswer(text: string): { cue: string; answer: string } {
  const parts = text.split('→');
  
  if (parts.length >= 2) {
    const cue = parts[0].trim();
    const answer = parts.slice(1).join('→').trim();
    
    return { cue, answer };
  }
  
  // 没有 `→` 分隔符，整个文本作为答案
  return { cue: '', answer: text.trim() };
}

/**
 * 创建列表模板卡片用例
 * 
 * @class CreateListTemplateCardsUseCase
 */
export class CreateListTemplateCardsUseCase {
  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   * @param templateRegistry - 模板注册表
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
   * 
   * @example
   * ```typescript
   * const useCase = new CreateListTemplateCardsUseCase(xiuyuanRepository, templateRegistry);
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
    try {
      // 1. 检查是否已经创建过列表模版卡
      const { getBlockAttrs } = await import('@/core/siyuan/api');
      const attrs = await getBlockAttrs(command.parentBlockId);
      
      if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        console.log(`[CreateListTemplateCardsUseCase] Block ${command.parentBlockId} already has Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('此列表项已经创建过列表模版卡，请勿重复创建'));
      }
      
      // 2. 验证模板
      const template = this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }

      // 3. 获取父列表项的段落块 ID（用于问题显示）
      // 思源结构：列表项(i) → 段落(p) + 列表容器(l)
      const paragraphResult = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${command.parentBlockId}'
        AND type = 'p'
        LIMIT 1
      `);
      
      if (!paragraphResult || paragraphResult.length === 0) {
        return err(new Error('Parent list item has no paragraph block'));
      }
      
      const parentParagraphId = paragraphResult[0].id;

      // 4. 获取所有子列表项的文本内容
      const childrenContentResult = await sql(`
        SELECT id, content FROM blocks
        WHERE id IN (${command.childBlockIds.map(id => `'${id}'`).join(',')})
        ORDER BY id ASC
      `);
      
      if (!childrenContentResult || childrenContentResult.length === 0) {
        return err(new Error('Failed to fetch children content'));
      }
      
      // 解析每个子列表项的提示和答案
      const childrenData = childrenContentResult.map((row: any) => ({
        id: row.id,
        cue: parseCueAndAnswer(row.content).cue,
        answer: parseCueAndAnswer(row.content).answer,
        content: row.content
      }));

      // 5. 创建值对象
      const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);
      if (!xiuyuanIdResult.ok) {
        return xiuyuanIdResult as Result<any>;
      }

      const allBlockIds = [parentParagraphId, ...command.childBlockIds];
      const blockIdResults = allBlockIds.map(id => BlockId.create(id));
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

      // 6. 为每个子列表项创建 CardFace
      const faces: CardFace[] = [];
      
      for (const childData of childrenData) {
        const faceResult = CardFace.create({
          question: parentParagraphId, // 问题是父段落
          answer: childData.content,   // 答案是子列表项内容
          questionBlockId: parentParagraphId,
          answerBlockId: childData.id
        });

        if (!faceResult.ok) {
          return faceResult as Result<any>;
        }

        faces.push(faceResult.value);
      }

      // 7. 创建 Xiuyuan 聚合根（包含列表模板的元数据）
      const xiuyuanResult = Xiuyuan.create({
        id: xiuyuanIdResult.value,
        blockIDs: blockIds,
        templateID: templateIdResult.value,
        faces,
        priority,
        meta: {
          schedulerType: 'fsrs-v6',
          // 列表模板特有的元数据
          listTemplate: {
            parentBlockId: command.parentBlockId,
            parentParagraphId,
            childrenData: childrenData.map((c, idx) => ({
              id: c.id,
              cue: c.cue,
              answer: c.answer,
              index: idx
            }))
          }
        }
      });

      if (!xiuyuanResult.ok) {
        return xiuyuanResult as Result<any>;
      }

      const xiuyuan = xiuyuanResult.value;

      // 8. 为每个 face 创建 Card 实体
      for (let i = 0; i < faces.length; i++) {
        const cardResult = xiuyuan.createCard(i);
        if (!cardResult.ok) {
          const error = (cardResult as any).error || new Error(`Failed to create card for face ${i}`);
          console.error(`[CreateListTemplateCardsUseCase] Failed to create card for face ${i}:`, error);
          return err(error);
        }
      }

      // 9. 添加到 Riff（可选，错误不阻断）
      const deckId = command.deckId || BUILTIN_DECK_ID;
      const representativeBlockId = command.parentBlockId;
      
      try {
        await addRiffCards(deckId, [representativeBlockId]);
        console.log('[CreateListTemplateCardsUseCase] Added to Riff:', representativeBlockId);
      } catch (error) {
        console.warn('[CreateListTemplateCardsUseCase] Failed to add to Riff:', error);
        // 不阻断流程
      }

      // 10. 通过 Repository 持久化
      const saveResult = await this.xiuyuanRepository.save(xiuyuan);
      if (!saveResult.ok) {
        return saveResult as Result<any>;
      }

      // 11. 返回结果
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
      console.error('[CreateListTemplateCardsUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
