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
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { findConceptByUpwardSearch } from './shared/ConceptLocator';
import { resolveConceptCard } from './shared/ConceptCardResolver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RebindDescriptorConceptUseCase');

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

export class RebindDescriptorConceptUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;

  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports?: { siyuanApi?: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new XiuyuanSiyuanAdapter();
    this.eventBus = ports?.eventBus ?? new EventBus(false);
  }

  async execute(command: RebindDescriptorConceptCommand): Promise<Result<RebindDescriptorConceptResult>> {
    try {
      const { descriptorBlockId } = command;
      
      // 1. 检查描述符块是否存在卡片
      const descriptorAttrs = await this.siyuanApi.getBlockAttrs(descriptorBlockId);
      const xiuyuanId = descriptorAttrs?.['custom-xiuyuan-id'] || descriptorAttrs?.['custom-fsrs-xiuyuan-id'];
      
      if (!xiuyuanId) {
        return err(new Error('描述符块没有关联的卡片'));
      }
      
      logger.debug('Found descriptor xiuyuan:', xiuyuanId);
      
      // 2. 向上探路查找新的概念块
      const conceptResult = await findConceptByUpwardSearch(descriptorBlockId, this.siyuanApi);
      
      if (!conceptResult) {
        return err(new Error('未找到概念块（标题块或文档块）'));
      }
      
      const { conceptId, conceptType } = conceptResult;
      logger.info('Found new concept:', conceptId, conceptType);
      
      // 3. 获取概念名称并确保概念卡存在
      const { conceptName, conceptCardId, createdConceptCard } = await resolveConceptCard({
        conceptId,
        xiuyuanRepository: this.xiuyuanRepository,
        templateRegistry: this.templateRegistry,
        siyuanApi: this.siyuanApi,
        eventBus: this.eventBus,
      });
      logger.debug('New concept name:', conceptName);
      
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
      
      logger.info('Updated descriptor xiuyuan field mapping');
      
      // 8. 返回结果
      return ok({
        newConceptId: conceptId,
        newConceptName: conceptName,
        newConceptCardId: conceptCardId,
        conceptType,
        createdConceptCard
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(error as Error);
    }
  }
}

