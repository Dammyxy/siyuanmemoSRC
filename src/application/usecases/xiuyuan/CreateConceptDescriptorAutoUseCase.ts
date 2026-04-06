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
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { findConceptByUpwardSearch } from './shared/ConceptLocator';
import { resolveConceptCard } from './shared/ConceptCardResolver';
import {
  detectDescriptorDirection,
  templateIdFromDescriptorDirection,
} from './shared/DescriptorTemplateStrategy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CreateConceptDescriptorAutoUseCase');

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

export class CreateConceptDescriptorAutoUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;

  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   * @param templateRegistry - 模板注册表
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports?: { siyuanApi?: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new XiuyuanSiyuanAdapter();
    this.eventBus = ports?.eventBus ?? new EventBus(false);
  }

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
      const conceptResult = await findConceptByUpwardSearch(firstDescriptorId, this.siyuanApi);
      
      if (!conceptResult) {
        return err(new Error('未找到概念块（标题块或文档块）'));
      }
      
      const { conceptId, conceptType } = conceptResult;
      logger.info('Found concept:', conceptId, conceptType);
      
      // 2. 获取概念名称并确保概念卡存在
      const { conceptName, conceptCardId } = await resolveConceptCard({
        conceptId,
        deckId: command.deckId,
        xiuyuanRepository: this.xiuyuanRepository,
        templateRegistry: this.templateRegistry,
        siyuanApi: this.siyuanApi,
        eventBus: this.eventBus,
      });
      logger.debug('Concept name:', conceptName);
      
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
          this.templateRegistry,
          { siyuanApi: this.siyuanApi, eventBus: this.eventBus }
        );
      
      for (const descriptorBlockId of command.descriptorBlockIds) {
        // 检查是否已有卡片
        const descriptorAttrs = await this.siyuanApi.getBlockAttrs(descriptorBlockId);
        if (descriptorAttrs && (descriptorAttrs['custom-xiuyuan-id'] || descriptorAttrs['custom-fsrs-xiuyuan-id'])) {
          logger.debug('Descriptor block already has card, skipping:', descriptorBlockId);
          skipped.push(descriptorBlockId);
          continue;
        }
        
        // 🆕 检测方向（如果命令中没有指定）
        let direction = command.direction;
        if (!direction) {
          // 从块内容中检测
          const blockQuery = await this.siyuanApi.sql(`SELECT content FROM blocks WHERE id = '${descriptorBlockId}' LIMIT 1`);
          if (blockQuery && blockQuery.length > 0) {
            direction = detectDescriptorDirection(String(blockQuery[0].content || ''));
            logger.debug('Detected direction from content:', direction);
          } else {
            direction = 'forward';  // 默认正向
          }
        }
        
        // 🆕 根据方向选择预定义模板
        const templateId = templateIdFromDescriptorDirection(direction);
        
        // 创建概念-描述符卡
        const result = await createXiuyuanUseCase.execute({
          blockIds: [conceptId, descriptorBlockId],
          templateId: templateId,  // 使用选择的模板
          fieldMapping: {
            concept: conceptId,
            descriptor: descriptorBlockId
          },
          deckId: command.deckId || this.siyuanApi.BUILTIN_DECK_ID,
          cardType: 'descriptor'
        });
        
        if (result.ok) {
          descriptorCards.push({
            xiuyuanId: result.value.xiuyuan.id,
            descriptorBlockId,
            cards: result.value.cards
          });
          logger.info('Created descriptor card:', result.value.xiuyuan.id);
        } else {
          const errorMsg = 'error' in result ? result.error?.message : 'Unknown error';
          logger.error('Failed to create descriptor card:', errorMsg);
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
      logger.error('Failed:', error);
      return err(error as Error);
    }
  }
}

