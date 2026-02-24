/**
 * CreateConceptDescriptorCardsUseCase - 创建概念描述符卡片用例
 * 
 * @description
 * 批量创建概念描述符卡片的业务流程。
 * 
 * **业务规则**：
 * 1. 识别顶层列表项中引用的概念文档块 ((概念文档))
 * 2. 如果概念文档块没有被制作为概念卡，则制作
 * 3. 识别概念文档块子级里的描述符块（包含 ;; 符号）
 * 4. 为每个描述符块生成【概念-描述符】卡
 * 
 * **使用场景**：
 * ```
 * - ((概念文档))
 *   - 属性1 ;; 描述1
 *   - 属性2 ;; 描述2
 *   - 属性3 ;; 描述3
 * ```
 * 
 * 结果：
 * - 1 个概念卡（如果不存在）
 * - 3 张概念-描述符卡
 */

import { Result, ok, err } from '@/types/result';
import { sql, getBlockAttrs } from '@/core/siyuan/api';
import { BUILTIN_DECK_ID } from '@/core/siyuan/riff';

export interface CreateConceptDescriptorCardsCommand {
  /** 顶层列表项块 ID（包含概念引用） */
  parentBlockId: string;
  /** 牌组 ID */
  deckId?: string;
  /** 优先级 */
  priority?: number;
}

export interface ConceptDescriptorCardsResult {
  /** 概念卡 ID（如果创建了） */
  conceptCardId?: string;
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
 * 创建概念描述符卡片用例
 */
export class CreateConceptDescriptorCardsUseCase {
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
  async execute(command: CreateConceptDescriptorCardsCommand): Promise<Result<ConceptDescriptorCardsResult>> {
    try {
      // 1. 获取顶层列表项的段落块 markdown 内容（包含块引用语法）
      const paragraphQuery = await sql(`
        SELECT id, markdown FROM blocks
        WHERE parent_id = '${command.parentBlockId}'
          AND type = 'p'
        LIMIT 1
      `);
      
      if (!paragraphQuery || paragraphQuery.length === 0) {
        return err(new Error('未找到列表项的段落块'));
      }
      
      const markdown = paragraphQuery[0].markdown || paragraphQuery[0].content || '';
      console.log('[CreateConceptDescriptorCardsUseCase] Paragraph markdown:', markdown);
      
      // 2. 解析概念引用：((block-id)) 或 ((block-id '名称'))
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/;
      const refMatch = markdown.match(refPattern);
      
      if (!refMatch) {
        console.log('[CreateConceptDescriptorCardsUseCase] No reference found in:', markdown);
        return err(new Error('未找到概念引用，请确保顶层列表项包含 ((概念文档)) 引用'));
      }
      
      const conceptBlockId = refMatch[1];
      console.log('[CreateConceptDescriptorCardsUseCase] Found concept block ID:', conceptBlockId);
      
      // 3. 验证概念块是文档块
      const conceptBlock = await sql(`
        SELECT type, content FROM blocks
        WHERE id = '${conceptBlockId}'
        LIMIT 1
      `);
      
      if (!conceptBlock || conceptBlock.length === 0) {
        return err(new Error('概念引用的块不存在'));
      }
      
      if (conceptBlock[0].type !== 'd') {
        return err(new Error('概念引用必须指向文档块'));
      }
      
      const conceptName = conceptBlock[0].content;
      console.log('[CreateConceptDescriptorCardsUseCase] Found concept:', conceptName, conceptBlockId);
      
      // 4. 检查概念块是否已有概念卡，如果没有则创建
      let conceptCardId: string | undefined;
      const conceptAttrs = await getBlockAttrs(conceptBlockId);
      
      if (!conceptAttrs || (!conceptAttrs['custom-xiuyuan-id'] && !conceptAttrs['custom-fsrs-xiuyuan-id'])) {
        console.log('[CreateConceptDescriptorCardsUseCase] Concept block has no card, creating...');
        
        // 创建概念卡 - 使用 CreateXiuyuanFromBlocksUseCase
        const { CreateXiuyuanFromBlocksUseCase } = await import('./CreateXiuyuanFromBlocksUseCase');
        const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
          this.xiuyuanRepository,
          this.templateRegistry
        );
        
        const conceptResult = await createXiuyuanUseCase.execute({
          blockIds: [conceptBlockId],
          templateId: 'builtin-concept-simple',
          fieldMapping: {
            concept: conceptBlockId
          },
          deckId: command.deckId || BUILTIN_DECK_ID,
          cardType: 'concept'
        });
        
        if (conceptResult.ok) {
          conceptCardId = conceptResult.value.xiuyuan.id;
          console.log('[CreateConceptDescriptorCardsUseCase] Created concept card:', conceptCardId);
        } else {
          console.warn('[CreateConceptDescriptorCardsUseCase] Failed to create concept card:', conceptResult.error);
        }
      } else {
        console.log('[CreateConceptDescriptorCardsUseCase] Concept block already has card');
      }
      
      // 5. 查找描述符块和定义块
      // 支持三种结构：
      // 1. 顶层块本身：- [[概念]]::定义
      // 2. 子列表项（推荐）：- [[概念]] \n  - 描述1;; \n  - 描述2;;
      // 3. 同级列表项：- [[概念]] \n - 描述1;; \n - 描述2;;
      
      let descriptorBlocks: any[] = [];
      
      // 🆕 5.0 首先检查顶层块本身是否包含定义符号
      const { getBlockKramdown } = await import('@/core/siyuan/api');
      const { kramdown: parentKramdown } = await getBlockKramdown(command.parentBlockId);
      
      if (parentKramdown && /::|：：|:>|：》|:<|：《/.test(parentKramdown)) {
        console.log('[CreateConceptDescriptorCardsUseCase] Parent block contains definition symbol');
        // 获取顶层块的段落块
        const parentParagraphQuery = await sql(`
          SELECT id, content, markdown FROM blocks
          WHERE parent_id = '${command.parentBlockId}'
            AND type = 'p'
          LIMIT 1
        `);
        
        if (parentParagraphQuery && parentParagraphQuery.length > 0) {
          descriptorBlocks.push(parentParagraphQuery[0]);
          console.log('[CreateConceptDescriptorCardsUseCase] Added parent block as definition block');
        }
      }
      
      // 5.1 尝试查找子级列表项（推荐结构）
      const listContainerQuery = await sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${command.parentBlockId}'
          AND type = 'l'
        LIMIT 1
      `);
      
      console.log('[CreateConceptDescriptorCardsUseCase] List container query result:', listContainerQuery);
      
      if (listContainerQuery && listContainerQuery.length > 0) {
        const listContainerId = listContainerQuery[0].id;
        console.log('[CreateConceptDescriptorCardsUseCase] Found list container:', listContainerId);
        
        // 查找列表容器的子级列表项中包含 ;; 的描述符块
        // 注意：需要查找列表项(i)的段落块(p)的内容
        const childListItems = await sql(`
          SELECT id FROM blocks
          WHERE parent_id = '${listContainerId}'
            AND type = 'i'
          ORDER BY id ASC
        `);
        
        console.log('[CreateConceptDescriptorCardsUseCase] Child list items:', childListItems?.length || 0);
        
        if (childListItems && childListItems.length > 0) {
          // 对每个列表项，查找其段落块
          for (const item of childListItems) {
            const paragraphQuery = await sql(`
              SELECT id, content, markdown FROM blocks
              WHERE parent_id = '${item.id}'
                AND type = 'p'
                AND (
                  content LIKE '%;;%' OR content LIKE '%；；%' 
                  OR content LIKE '%;<' OR content LIKE '%；《' 
                  OR content LIKE '%;<>%' OR content LIKE '%；《》%'
                  OR content LIKE '%::%' OR content LIKE '%：：%'
                  OR content LIKE '%:>%' OR content LIKE '%：》%'
                  OR content LIKE '%:<%' OR content LIKE '%：《%'
                )
              LIMIT 1
            `);
            
            if (paragraphQuery && paragraphQuery.length > 0) {
              descriptorBlocks.push(paragraphQuery[0]);
            }
          }
        }
        
        console.log('[CreateConceptDescriptorCardsUseCase] Found child descriptor blocks:', descriptorBlocks?.length || 0);
      }
      
      // 5.2 如果没有子级，尝试查找同级的后续列表项
      if (!descriptorBlocks || descriptorBlocks.length === 0) {
        console.log('[CreateConceptDescriptorCardsUseCase] No child descriptors, trying sibling blocks...');
        
        // 获取父列表项的父容器
        const parentContainerQuery = await sql(`
          SELECT parent_id FROM blocks
          WHERE id = '${command.parentBlockId}'
          LIMIT 1
        `);
        
        if (parentContainerQuery && parentContainerQuery.length > 0) {
          const parentContainerId = parentContainerQuery[0].parent_id;
          console.log('[CreateConceptDescriptorCardsUseCase] Parent container:', parentContainerId);
          
          // 查找同级的后续列表项（ID 大于当前块）
          const siblingListItems = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${parentContainerId}'
              AND type = 'i'
              AND id > '${command.parentBlockId}'
            ORDER BY id ASC
          `);
          
          console.log('[CreateConceptDescriptorCardsUseCase] Sibling list items:', siblingListItems?.length || 0);
          
          if (siblingListItems && siblingListItems.length > 0) {
            // 对每个列表项，查找其段落块
            for (const item of siblingListItems) {
              const paragraphQuery = await sql(`
                SELECT id, content, markdown FROM blocks
                WHERE parent_id = '${item.id}'
                  AND type = 'p'
                  AND (
                    content LIKE '%;;%' OR content LIKE '%；；%' 
                    OR content LIKE '%;<' OR content LIKE '%；《' 
                    OR content LIKE '%;<>%' OR content LIKE '%；《》%'
                    OR content LIKE '%::%' OR content LIKE '%：：%'
                    OR content LIKE '%:>%' OR content LIKE '%：》%'
                    OR content LIKE '%:<%' OR content LIKE '%：《%'
                  )
                LIMIT 1
              `);
              
              if (paragraphQuery && paragraphQuery.length > 0) {
                descriptorBlocks.push(paragraphQuery[0]);
              }
            }
          }
          
          console.log('[CreateConceptDescriptorCardsUseCase] Found sibling descriptor blocks:', descriptorBlocks?.length || 0);
        }
      }
      
      if (!descriptorBlocks || descriptorBlocks.length === 0) {
        return err(new Error('未找到描述符块或定义块（包含 ;;、；；、::、：： 等符号的子列表项或同级列表项）'));
      }
      
      console.log('[CreateConceptDescriptorCardsUseCase] Found descriptor blocks:', descriptorBlocks.length);
      
      // 6. 为每个描述符块创建概念-描述符卡
      const descriptorCards: Array<{
        xiuyuanId: string;
        descriptorBlockId: string;
        cards: Array<{ id: string; faceIndex: number }>;
      }> = [];
      const skipped: string[] = [];
      
      // 创建 UseCase 实例
      const { CreateXiuyuanFromBlocksUseCase } = await import('./CreateXiuyuanFromBlocksUseCase');
      const createXiuyuanUseCase = new CreateXiuyuanFromBlocksUseCase(
        this.xiuyuanRepository,
        this.templateRegistry
      );
      
      for (const descriptorBlock of descriptorBlocks) {
        const descriptorBlockId = descriptorBlock.id;
        
        // 检查是否已有卡片
        const descriptorAttrs = await getBlockAttrs(descriptorBlockId);
        if (descriptorAttrs && (descriptorAttrs['custom-xiuyuan-id'] || descriptorAttrs['custom-fsrs-xiuyuan-id'])) {
          console.log('[CreateConceptDescriptorCardsUseCase] Descriptor block already has card, skipping:', descriptorBlockId);
          skipped.push(descriptorBlockId);
          continue;
        }
        
        // 🆕 检测符号类型和方向，选择对应的模板
        const content = descriptorBlock.content || '';
        const markdown = descriptorBlock.markdown || content; // 使用 markdown 字段检测块引用
        let templateId = 'builtin-concept-descriptor'; // 默认：描述符正向
        let isDefinition = false; // 是否是概念定义卡
        
        console.log('[CreateConceptDescriptorCardsUseCase] Analyzing block:', descriptorBlockId, 'content:', content.substring(0, 100));
        
        // 优先检测概念定义符号（::, :>, :<）
        // 注意：概念定义卡必须包含块引用 (( 或 [[
        const hasBlockRef = /\(\(|\[\[/.test(markdown);
        console.log('[CreateConceptDescriptorCardsUseCase] Has block reference:', hasBlockRef, 'markdown:', markdown.substring(0, 100));
        
        if (hasBlockRef && /::|：：/.test(markdown)) {
          templateId = 'builtin-concept-definition'; // 概念定义双向
          isDefinition = true;
          console.log('[CreateConceptDescriptorCardsUseCase] Detected concept definition (both directions)');
        } else if (hasBlockRef && /:>|：》/.test(markdown)) {
          templateId = 'builtin-concept-definition-forward'; // 概念定义仅正向
          isDefinition = true;
          console.log('[CreateConceptDescriptorCardsUseCase] Detected concept definition (forward only)');
        } else if (hasBlockRef && (/:<|：《/.test(markdown))) {
          templateId = 'builtin-concept-definition-reverse'; // 概念定义仅反向
          isDefinition = true;
          console.log('[CreateConceptDescriptorCardsUseCase] Detected concept definition (reverse only)');
        }
        // 然后检测描述符符号（;;, ;<, ;<>）
        else if (/;<>|；《》/.test(markdown)) {
          templateId = 'builtin-concept-descriptor-both'; // 描述符双向
          console.log('[CreateConceptDescriptorCardsUseCase] Detected descriptor (both directions)');
        } else if (/;<|；《/.test(markdown)) {
          templateId = 'builtin-concept-descriptor-reverse'; // 描述符仅反向
          console.log('[CreateConceptDescriptorCardsUseCase] Detected descriptor (reverse only)');
        } else {
          console.log('[CreateConceptDescriptorCardsUseCase] Using default descriptor (forward only)');
        }
        
        // 创建卡片（概念定义卡或描述符卡）
        // 注意：概念定义卡使用 [定义块, 概念块] 作为 blockIds，与块菜单逻辑保持一致
        const result = await createXiuyuanUseCase.execute({
          blockIds: isDefinition ? [descriptorBlockId, conceptBlockId] : [conceptBlockId, descriptorBlockId],
          templateId,
          fieldMapping: isDefinition ? {
            concept: conceptBlockId,
            definition: descriptorBlockId
          } : {
            concept: conceptBlockId,
            descriptor: descriptorBlockId
          },
          deckId: command.deckId || BUILTIN_DECK_ID,
          cardType: 'descriptor'  // 统一使用 descriptor，与块菜单逻辑保持一致
        });
        
        if (result.ok) {
          descriptorCards.push({
            xiuyuanId: result.value.xiuyuan.id,
            descriptorBlockId,
            cards: result.value.cards
          });
          console.log('[CreateConceptDescriptorCardsUseCase] Created descriptor card:', result.value.xiuyuan.id);
        } else {
          console.error('[CreateConceptDescriptorCardsUseCase] Failed to create descriptor card:', result.error);
          skipped.push(descriptorBlockId);
        }
      }
      
      // 7. 返回结果
      return ok({
        conceptCardId,
        descriptorCards,
        skipped
      });
    } catch (error) {
      console.error('[CreateConceptDescriptorCardsUseCase] Failed:', error);
      return err(error as Error);
    }
  }
}
