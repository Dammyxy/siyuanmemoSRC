/**
 * RebindDescriptorConceptUseCase - 重新绑定描述符卡片的概念
 * 
 * @description
 * 为描述符卡片重新绑定概念，使用向上探路逻辑自动查找新的概念块。
 * 
 * **业务规则**：
 * 1. 从描述符块向上探路查找概念块（标题块或文档块）
 * 2. 如果找到的概念块没有概念卡，则创建
 * 3. 更新描述符卡片的概念引用
 * 4. 保持描述符块的 xiuyuan-id 不变
 * 
 * **使用场景**：
 * - 描述符块被移动到新的概念下
 * - 需要手动调整描述符与概念的关系
 */

import { Result, ok, err } from '@/types/result';
import { sql, getBlockAttrs } from '@/core/siyuan/api';
import { BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';

export interface RebindDescriptorConceptCommand {
  /** 描述符块 ID */
  descriptorBlockId: string;
}

export interface RebindDescriptorConceptResult {
  /** 新概念块 ID */
  newConceptId: string;
  /** 新概念名称 */
  newConceptName: string;
  /** 新概念卡 ID */
  newConceptCardId: string;
  /** 概念块类型 */
  conceptType: 'block-ref' | 'heading' | 'document';
  /** 是否创建了新的概念卡 */
  createdConceptCard: boolean;
}

/**
 * 检查块是否有列表项父级
 */
async function hasListItemParent(blockId: string): Promise<boolean> {
  let currentId = blockId;
  const maxDepth = 10;
  
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
      SELECT type 
      FROM blocks 
      WHERE id = '${parentId}' 
      LIMIT 1
    `;
    const parentResult = await sql(parentQuery);
    
    if (parentResult && parentResult.length > 0) {
      const parentType = parentResult[0].type;
      
      // 如果是列表项块，返回 true
      if (parentType === 'i') {
        console.log(`[RebindDescriptorConceptUseCase] Found list item parent at depth ${depth}:`, parentId);
        return true;
      }
      
      // 如果到达文档块，停止查找
      if (parentType === 'd') {
        console.log(`[RebindDescriptorConceptUseCase] Reached document block without finding list parent`);
        break;
      }
    }
    
    currentId = parentId;
  }
  
  return false;
}

/**
 * 在列表项父级情况下查找概念卡（检查块引用）
 * 
 * 复用 AutoCardHandler 的逻辑：
 * 1. 使用 getBlockKramdown 获取父块内容
 * 2. 查找块引用并检查是否指向文档块
 * 3. 如果不是概念卡，自动创建
 */
async function findConceptInListParent(blockId: string): Promise<{
  conceptId: string;
  conceptType: 'block-ref';
} | null> {
  const { getBlockKramdown } = await import('@/core/siyuan/api');
  
  let currentId = blockId;
  const maxDepth = 4;
  
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
    console.log(`[RebindDescriptorConceptUseCase] Checking parent at depth ${depth}:`, parentId);
    
    // 使用 getBlockKramdown 获取父块内容
    const { kramdown: parentContent } = await getBlockKramdown(parentId);
    
    if (parentContent) {
      console.log(`[RebindDescriptorConceptUseCase] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
      
      // 查找块引用（包括带别名的格式）
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const matches = [...parentContent.matchAll(refPattern)];
      
      console.log(`[RebindDescriptorConceptUseCase] Found ${matches.length} block references at depth ${depth}`);
      
      if (matches.length > 0) {
        // 检查每个块引用
        for (const match of matches) {
          const refId = match[1];
          
          console.log(`[RebindDescriptorConceptUseCase] Checking block reference:`, refId);
          
          // 1. 检查块引用是否指向文档块
          const refTypeQuery = `
            SELECT type 
            FROM blocks 
            WHERE id = '${refId}' 
            LIMIT 1
          `;
          const refTypeResult = await sql(refTypeQuery);
          
          if (!refTypeResult || refTypeResult.length === 0) {
            console.log(`[RebindDescriptorConceptUseCase] Block reference target not found:`, refId);
            continue;
          }
          
          const refType = refTypeResult[0].type;
          console.log(`[RebindDescriptorConceptUseCase] Block reference type:`, refType);
          
          if (refType !== 'd') {
            console.log(`[RebindDescriptorConceptUseCase] Block reference is not a document block, skipping:`, refId);
            continue;
          }
          
          console.log(`[RebindDescriptorConceptUseCase] Found document block reference at depth ${depth}:`, refId);
          
          // 2. 返回文档块 ID（调用方会检查是否是概念卡，如果不是会自动创建）
          return { conceptId: refId, conceptType: 'block-ref' };
        }
      }
    }
    
    currentId = parentId;
  }
  
  return null;
}

/**
 * 在非列表项情况下查找概念卡（标题块或文档块）
 */
async function findConceptWithoutListParent(blockId: string): Promise<{
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
      const parentContent = parentResult[0].content;
      
      // 记录第一个标题块
      if (parentType === 'h' && !firstHeadingId) {
        firstHeadingId = parentId;
        console.log(`[RebindDescriptorConceptUseCase] Found first heading block:`, parentId, parentContent);
      }
      
      // 记录文档块
      if (parentType === 'd') {
        documentId = parentId;
        console.log(`[RebindDescriptorConceptUseCase] Found document block:`, parentId);
        break;
      }
    }
    
    currentId = parentId;
  }
  
  // 优先使用标题块，其次使用文档块
  if (firstHeadingId) {
    console.log(`[RebindDescriptorConceptUseCase] Using heading block as concept:`, firstHeadingId);
    return { conceptId: firstHeadingId, conceptType: 'heading' };
  } else if (documentId) {
    console.log(`[RebindDescriptorConceptUseCase] Using document block as concept:`, documentId);
    return { conceptId: documentId, conceptType: 'document' };
  }
  
  return null;
}

/**
 * 向上探路查找概念块
 * 
 * 逻辑：
 * 1. 在列表项块内：向上探路，检查父块内容是否包含概念卡的块引用
 * 2. 在非列表项块内：向上探路找最近的标题块作为概念卡
 * 3. 如果没有标题块：使用文档块作为概念卡
 * 
 * @param blockId 起始块 ID
 * @returns { conceptId: 概念块 ID, conceptType: 'block-ref' | 'heading' | 'document' }
 */
async function findConceptByUpwardSearch(blockId: string): Promise<{
  conceptId: string;
  conceptType: 'block-ref' | 'heading' | 'document';
} | null> {
  // 1. 检查是否有列表项父级
  const hasListParent = await hasListItemParent(blockId);
  console.log(`[RebindDescriptorConceptUseCase] Has list item parent:`, hasListParent);
  
  if (hasListParent) {
    // 情况 A：有列表项父级，优先查找块引用
    console.log(`[RebindDescriptorConceptUseCase] Case A: Has list parent, searching block reference...`);
    const result = await findConceptInListParent(blockId);
    if (result) {
      return result;
    }
    // 如果没找到块引用，继续尝试查找标题块/文档块
    console.log(`[RebindDescriptorConceptUseCase] No block reference found, fallback to heading/document...`);
  }
  
  // 情况 B：无列表项父级，或有列表项但没找到块引用，查找标题块或文档块
  console.log(`[RebindDescriptorConceptUseCase] Case B: Searching heading/document...`);
  const result = await findConceptWithoutListParent(blockId);
  if (result) {
    return result;
  }
  
  console.warn('[RebindDescriptorConceptUseCase] No concept found');
  return null;
}

/**
 * 重新绑定描述符卡片的概念
 */
export class RebindDescriptorConceptUseCase {
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>
  ) {}

  async execute(command: RebindDescriptorConceptCommand): Promise<Result<RebindDescriptorConceptResult>> {
    try {
      const { descriptorBlockId } = command;
      
      // 1. 检查描述符块是否存在卡片
      const descriptorAttrs = await getBlockAttrs(descriptorBlockId);
      const xiuyuanId = descriptorAttrs?.['custom-xiuyuan-id'] || descriptorAttrs?.['custom-fsrs-xiuyuan-id'];
      
      if (!xiuyuanId) {
        return err(new Error('描述符块没有关联的卡片'));
      }
      
      console.log('[RebindDescriptorConceptUseCase] Found descriptor xiuyuan:', xiuyuanId);
      
      // 2. 向上探路查找新的概念块
      const conceptResult = await findConceptByUpwardSearch(descriptorBlockId);
      
      if (!conceptResult) {
        return err(new Error('未找到概念块（标题块或文档块）'));
      }
      
      const { conceptId, conceptType } = conceptResult;
      console.log('[RebindDescriptorConceptUseCase] Found new concept:', conceptId, conceptType);
      
      // 3. 获取概念名称
      const conceptQuery = await sql(`
        SELECT content FROM blocks
        WHERE id = '${conceptId}'
        LIMIT 1
      `);
      
      if (!conceptQuery || conceptQuery.length === 0) {
        return err(new Error('概念块不存在'));
      }
      
      const conceptName = conceptQuery[0].content;
      console.log('[RebindDescriptorConceptUseCase] New concept name:', conceptName);
      
      // 4. 检查概念块是否已有概念卡，如果没有则创建
      let conceptCardId: string;
      let createdConceptCard = false;
      const conceptAttrs = await getBlockAttrs(conceptId);
      
      if (!conceptAttrs || (!conceptAttrs['custom-xiuyuan-id'] && !conceptAttrs['custom-fsrs-xiuyuan-id'])) {
        console.log('[RebindDescriptorConceptUseCase] Concept block has no card, creating...');
        
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
          deckId: BUILTIN_DECK_ID,
          cardType: 'concept'
        });
        
        if (conceptResult.ok) {
          conceptCardId = conceptResult.value.xiuyuan.id;
          createdConceptCard = true;
          console.log('[RebindDescriptorConceptUseCase] Created concept card:', conceptCardId);
        } else {
          const errorMsg = 'error' in conceptResult ? conceptResult.error?.message : 'Unknown error';
          return err(new Error(`创建概念卡失败：${errorMsg || 'Unknown error'}`));
        }
      } else {
        conceptCardId = conceptAttrs['custom-xiuyuan-id'] || conceptAttrs['custom-fsrs-xiuyuan-id'];
        console.log('[RebindDescriptorConceptUseCase] Concept block already has card:', conceptCardId);
      }
      
      // 5. 获取现有的 Xiuyuan 实体
      const xiuyuanIdResult = XiuyuanId.create(xiuyuanId);
      if (!xiuyuanIdResult.ok) {
        return err(new Error('无效的 Xiuyuan ID'));
      }
      
      const xiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
      
      if (!xiuyuanResult.ok) {
        return err(new Error('未找到描述符卡片的 Xiuyuan 实体'));
      }
      
      const xiuyuan = xiuyuanResult.value;
      
      // 6. 获取当前的 meta 和 fieldMapping
      const currentMeta = xiuyuan.getMeta();
      const currentFieldMapping = (currentMeta.fieldMapping as Record<string, string>) || {};
      
      // 7. 更新 fieldMapping 中的概念引用
      const updatedFieldMapping = {
        ...currentFieldMapping,
        concept: conceptId
      };
      
      // 8. 更新 meta
      const updatedMeta = {
        ...currentMeta,
        fieldMapping: updatedFieldMapping
      };
      
      const updateResult = xiuyuan.updateMeta(updatedMeta);
      if (!updateResult.ok) {
        return err(new Error('更新 Xiuyuan meta 失败'));
      }
      
      // 9. 保存 Xiuyuan 实体
      await this.xiuyuanRepository.save(xiuyuan);
      
      console.log('[RebindDescriptorConceptUseCase] Updated descriptor xiuyuan field mapping');
      
      // 8. 返回结果
      return ok({
        newConceptId: conceptId,
        newConceptName: conceptName,
        newConceptCardId: conceptCardId,
        conceptType,
        createdConceptCard
      });
    } catch (error) {
      console.error('[RebindDescriptorConceptUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
