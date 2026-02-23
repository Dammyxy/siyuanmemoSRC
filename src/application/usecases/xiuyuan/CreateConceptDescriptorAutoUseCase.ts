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
import { sql, getBlockAttrs } from '@/core/siyuan/api';
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
  /** 卡片方向（可选，如果不提供则从块内容中检测） */
  direction?: 'forward' | 'reverse' | 'both';
}

export interface ConceptDescriptorAutoResult {
  /** 概念卡 ID */
  conceptCardId: string;
  /** 概念块类型 */
  conceptType: 'block-ref' | 'heading' | 'document';
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
 * 检测描述符块的方向
 * 
 * @param content 块内容
 * @returns 'forward' | 'reverse' | 'both'
 */
function detectDescriptorDirection(content: string): 'forward' | 'reverse' | 'both' {
  // 移除 IAL 属性块
  const cleanContent = content.replace(/\{:[^}]*\}/g, '').trim();
  
  // 检测符号（优先级：特殊符号 > 默认符号）
  if (/;<>|；《》/.test(cleanContent)) {
    return 'both';
  } else if (/;<|；《/.test(cleanContent)) {
    return 'reverse';
  } else {
    return 'forward';  // 默认正向
  }
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
        console.log(`[CreateConceptDescriptorAutoUseCase] Found list item parent at depth ${depth}:`, parentId);
        return true;
      }
      
      // 如果到达文档块，停止查找
      if (parentType === 'd') {
        console.log(`[CreateConceptDescriptorAutoUseCase] Reached document block without finding list parent`);
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
    console.log(`[CreateConceptDescriptorAutoUseCase] Checking parent at depth ${depth}:`, parentId);
    
    // 使用 getBlockKramdown 获取父块内容
    const { kramdown: parentContent } = await getBlockKramdown(parentId);
    
    if (parentContent) {
      console.log(`[CreateConceptDescriptorAutoUseCase] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
      
      // 查找块引用（包括带别名的格式）
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const matches = [...parentContent.matchAll(refPattern)];
      
      console.log(`[CreateConceptDescriptorAutoUseCase] Found ${matches.length} block references at depth ${depth}`);
      
      if (matches.length > 0) {
        // 检查每个块引用
        for (const match of matches) {
          const refId = match[1];
          
          console.log(`[CreateConceptDescriptorAutoUseCase] Checking block reference:`, refId);
          
          // 1. 检查块引用是否指向文档块
          const refTypeQuery = `
            SELECT type 
            FROM blocks 
            WHERE id = '${refId}' 
            LIMIT 1
          `;
          const refTypeResult = await sql(refTypeQuery);
          
          if (!refTypeResult || refTypeResult.length === 0) {
            console.log(`[CreateConceptDescriptorAutoUseCase] Block reference target not found:`, refId);
            continue;
          }
          
          const refType = refTypeResult[0].type;
          console.log(`[CreateConceptDescriptorAutoUseCase] Block reference type:`, refType);
          
          if (refType !== 'd') {
            console.log(`[CreateConceptDescriptorAutoUseCase] Block reference is not a document block, skipping:`, refId);
            continue;
          }
          
          console.log(`[CreateConceptDescriptorAutoUseCase] Found document block reference at depth ${depth}:`, refId);
          
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
        console.log(`[CreateConceptDescriptorAutoUseCase] Found first heading block:`, parentId, parentContent);
      }
      
      // 记录文档块
      if (parentType === 'd') {
        documentId = parentId;
        console.log(`[CreateConceptDescriptorAutoUseCase] Found document block:`, parentId);
        break;
      }
    }
    
    currentId = parentId;
  }
  
  // 优先使用标题块，其次使用文档块
  if (firstHeadingId) {
    console.log(`[CreateConceptDescriptorAutoUseCase] Using heading block as concept:`, firstHeadingId);
    return { conceptId: firstHeadingId, conceptType: 'heading' };
  } else if (documentId) {
    console.log(`[CreateConceptDescriptorAutoUseCase] Using document block as concept:`, documentId);
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
  console.log(`[CreateConceptDescriptorAutoUseCase] Has list item parent:`, hasListParent);
  
  if (hasListParent) {
    // 情况 A：有列表项父级，优先查找块引用
    console.log(`[CreateConceptDescriptorAutoUseCase] Case A: Has list parent, searching block reference...`);
    const result = await findConceptInListParent(blockId);
    if (result) {
      return result;
    }
    // 如果没找到块引用，继续尝试查找标题块/文档块
    console.log(`[CreateConceptDescriptorAutoUseCase] No block reference found, fallback to heading/document...`);
  }
  
  // 情况 B：无列表项父级，或有列表项但没找到块引用，查找标题块或文档块
  console.log(`[CreateConceptDescriptorAutoUseCase] Case B: Searching heading/document...`);
  const result = await findConceptWithoutListParent(blockId);
  if (result) {
    return result;
  }
  
  console.warn('[CreateConceptDescriptorAutoUseCase] No concept found');
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
          const errorMsg = 'error' in conceptResult ? conceptResult.error?.message : 'Unknown error';
          return err(new Error(`创建概念卡失败：${errorMsg || 'Unknown error'}`));
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
        
        // 🆕 检测方向（如果命令中没有指定）
        let direction = command.direction;
        if (!direction) {
          // 从块内容中检测
          const blockQuery = await sql(`SELECT content FROM blocks WHERE id = '${descriptorBlockId}' LIMIT 1`);
          if (blockQuery && blockQuery.length > 0) {
            direction = detectDescriptorDirection(blockQuery[0].content);
            console.log('[CreateConceptDescriptorAutoUseCase] Detected direction from content:', direction);
          } else {
            direction = 'forward';  // 默认正向
          }
        }
        
        // 🆕 根据方向选择预定义模板
        let templateId: string;
        if (direction === 'forward') {
          templateId = 'builtin-concept-descriptor';
        } else if (direction === 'reverse') {
          templateId = 'builtin-concept-descriptor-reverse';
        } else {
          templateId = 'builtin-concept-descriptor-both';
        }
        
        // 创建概念-描述符卡
        const result = await createXiuyuanUseCase.execute({
          blockIds: [conceptId, descriptorBlockId],
          templateId: templateId,  // 使用选择的模板
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
          const errorMsg = 'error' in result ? result.error?.message : 'Unknown error';
          console.error('[CreateConceptDescriptorAutoUseCase] Failed to create descriptor card:', errorMsg);
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
