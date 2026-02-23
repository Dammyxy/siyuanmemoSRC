/**
 * CreateConceptDescriptorAutoUseCase - 创建概念描述符卡片用例（自动探路）
 * 
 * @description
 * 批量创建概念描述符卡片，使用向上探路逻辑自动查找概念块。
 * 
 * **业务规则**：
 * 1. 选择包含 ;; 的块（可以是多个）
 * 2. 向上探路查找概念块：
 *    - 优先查找最近的标题块 (type='h')
 *    - 如果没有标题块，使用文档块 (type='d')
 * 3. 如果概念块没有被制作为概念卡，则制作
 * 4. 为每个描述符块生成【概念-描述符】卡
 * 
 * **使用场景**：
 * ```
 * # 概念标题
 * 
 * 属性1 ;; 描述1
 * 属性2 ;; 描述2
 * 属性3 ;; 描述3
 * ```
 * 
 * 或者：
 * ```
 * 文档内容...
 * 
 * 属性1 ;; 描述1
 * 属性2 ;; 描述2
 * ```
 * 
 * 结果：
 * - 1 个概念卡（标题块或文档块）
 * - N 张概念-描述符卡
 */

import { Result, ok, err } from '@/types/result';
import { sql, getBlockAttrs, setBlockAttrs } from '@/core/siyuan/api';
import { BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';

export interface CreateConceptDescriptorAutoCommand {
  /** 描述符块 ID 列表（包含 ;; 的块） */
  descriptorBlockIds: string[];
  /** 牌组 ID */
  deckId?: string;
  /** 优先级 */
  priority?: number;
}

export interface ConceptDescriptorAutoResult {
  /** 概念卡 ID */
  conceptCardId: string;
  /** 概念块类型 */
  conceptType: 'heading' | 'document';
  /** 创建的描述符卡列表 */
  descriptorCards: Array<{
    xiuyuanId: string;
    descriptorBlockId: string;
    cards: Array<{ id: string; faceIndex: number }>;
  }>;
  /** 跳过的描述符块（已存在卡片） */
  skipped: string[];
}

/**
 * 向上探路查找概念块
 * 
 * @param blockId 起始块 ID
 * @returns { conceptId: 概念块 ID, conceptType: 'heading' | 'document' }
 */
async function findConceptByUpwardSearch(blockId: string): Promise<{
  conceptId: string;
  conceptType: 'heading' | 'document';
} | null> {
  let currentId = blockId;
  let firstHeadingId: string | null = null;
  let documentId: string | null = null;
  const maxDepth = 20;
  
  for (let depth = 0; depth < maxDepth; depth++) {
    const query = `
      SELECT parent_id 
      FROM blocks 
      WHERE id = '${currentId}' 
      LIMIT 1
    `;
    const result = await sql(query);
    
    if (!result || result.length === 0 || !result[0]?.parent_id) {
      break;
    }
    
    const parentId = result[0].parent_id;
    
    // 查询父块类型
    const parentQuery = `
      SELECT type, content 
      FROM blocks 
      WHERE id = '${parentId}' 
      LIMIT 1
    `;
    const parentResult = await sql(parentQuery);
    
    if (parentResult && parentResult.length > 0) {
      const parentType = parentResult[0].type;
      
      // 记录第一个标题块
      if (parentType === 'h' && !firstHeadingId) {
        firstHeadingId = parentId;
        console.log('[CreateConceptDescriptorAutoUseCase] Found first heading block:', parentId);
      }
      
      // 记录文档块
      if (parentType === 'd') {
        documentId = parentId;
        console.log('[CreateConceptDescriptorAutoUseCase] Found document block:', parentId);
        break;
      }
    }
    
    currentId = parentId;
  }
  
  // 决定使用哪个作为概念块
  if (firstHeadingId) {
    return { conceptId: firstHeadingId, conceptType: 'heading' };
  } else if (documentId) {
    return { conceptId: documentId, conceptType: 'document' };
  }
  
  return null;
}

/**
 * 创建概念描述符卡片用例（自动探路）
 */
export class CreateConceptDescriptorAutoUseCase {
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
   * @param command 创建命令
   * @returns 创建结果
   */
  async execute(command: CreateConceptDescriptorAutoCommand): Promise<Result<ConceptDescriptorAutoResult>> {
    try {
      if (!command.descriptorBlockIds || command.descriptorBlockIds.length === 0) {
        return err(new Error('未提供描述符块 ID'));
      }
      
      // 1. 使用第一个描述符块向上探路查找概念块
      const firstDescriptorId = command.descriptorBlockIds[0];
      const conceptResult = await findConceptByUpwardSearch(firstDescriptorId);
      
      if (!conceptResult) {
        return err(new Error('未找到概念块（标题块或文档块）'));
      }
      
      const { conceptId, conceptType } = conceptResult;
      console.log('[CreateConceptDescriptorAutoUseCase] Found concept:', conceptId, conceptType);
      
      // 2. 获取概念名称
      const conceptQuery = await sql(`
        SELECT content FROM blocks
        WHERE id = '${conceptId}'
        LIMIT 1
      `);
      
      if (!conceptQuery || conceptQuery.length === 0) {
        return err(new Error('概念块不存在'));
      }
      
      const conceptName = conceptQuery[0].content;
      console.log('[CreateConceptDescriptorAutoUseCase] Concept name:', conceptName);
      
      // 3. 检查概念块是否已有概念卡，如果没有则创建
      let conceptCardId: string;
      const conceptAttrs = await getBlockAttrs(conceptId);
      
      if (!conceptAttrs || (!conceptAttrs['custom-xiuyuan-id'] && !conceptAttrs['custom-fsrs-xiuyuan-id'])) {
        console.log('[CreateConceptDescriptorAutoUseCase] Concept block has no card, creating...');
        
        // 创建概念卡
        const { CreateXiuyuanFromBlocksUseCase } = await import('./CreateXiuyuanFromBlocksUseCase');
        const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
          this.xiuyuanRepository,
          this.templateRegistry
        );
        
        const conceptResult = await createXiuyuanUseCase.execute({
          blockIds: [conceptId],
          templateId: 'builtin-concept-simple',
          fieldMapping: {
            concept: conceptId
          },
          deckId: command.deckId || BUILTIN_DECK_ID,
          cardType: 'concept'
        });
        
        if (conceptResult.ok) {
          conceptCardId = conceptResult.value.xiuyuan.id;
          console.log('[CreateConceptDescriptorAutoUseCase] Created concept card:', conceptCardId);
        } else {
          return err(new Error(`创建概念卡失败：${conceptResult.error.message}`));
        }
      } else {
        conceptCardId = conceptAttrs['custom-xiuyuan-id'] || conceptAttrs['custom-fsrs-xiuyuan-id'];
        console.log('[CreateConceptDescriptorAutoUseCase] Concept block already has card:', conceptCardId);
      }
      
      // 4. 为每个描述符块创建概念-描述符卡
      const descriptorCards: Array<{
        xiuyuanId: string;
        descriptorBlockId: string;
        cards: Array<{ id: string; faceIndex: number }>;
      }> = [];
      const skipped: string[] = [];
      
      const { CreateXiuyuanFromBlocksUseCase } = await import('./CreateXiuyuanFromBlocksUseCase');
      const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
        this.xiuyuanRepository,
        this.templateRegistry
      );
      
      for (const descriptorBlockId of command.descriptorBlockIds) {
        // 检查是否已有卡片
        const descriptorAttrs = await getBlockAttrs(descriptorBlockId);
        if (descriptorAttrs && (descriptorAttrs['custom-xiuyuan-id'] || descriptorAttrs['custom-fsrs-xiuyuan-id'])) {
          console.log('[CreateConceptDescriptorAutoUseCase] Descriptor block already has card, skipping:', descriptorBlockId);
          skipped.push(descriptorBlockId);
          continue;
        }
        
        // 创建概念-描述符卡
        const result = await createXiuyuanUseCase.execute({
          blockIds: [conceptId, descriptorBlockId],
          templateId: 'builtin-concept-descriptor',
          fieldMapping: {
            concept: conceptId,
            descriptor: descriptorBlockId
          },
          deckId: command.deckId || BUILTIN_DECK_ID,
          cardType: 'descriptor'
        });
        
        if (result.ok) {
          descriptorCards.push({
            xiuyuanId: result.value.xiuyuan.id,
            descriptorBlockId,
            cards: result.value.cards
          });
          console.log('[CreateConceptDescriptorAutoUseCase] Created descriptor card:', result.value.xiuyuan.id);
        } else {
          console.error('[CreateConceptDescriptorAutoUseCase] Failed to create descriptor card:', result.error);
          skipped.push(descriptorBlockId);
        }
      }
      
      // 5. 返回结果
      return ok({
        conceptCardId,
        conceptType,
        descriptorCards,
        skipped
      });
    } catch (error) {
      console.error('[CreateConceptDescriptorAutoUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
