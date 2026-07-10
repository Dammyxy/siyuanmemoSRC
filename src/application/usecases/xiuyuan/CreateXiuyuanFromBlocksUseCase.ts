/**
 * CreateXiuyuanFromBlocksUseCase - 浠庡潡鍒涘缓 Xiuyuan 鐢ㄤ緥
 * 
 * @description
 * 缂栨帓浠庢€濇簮绗旇鍧楀垱寤?Xiuyuan 鐨勪笟鍔℃祦绋嬨€?
 * 
 * **璁捐鍘熷垯**锛?
 * - 鐢ㄤ緥妯″紡锛氬皝瑁呭崟涓€涓氬姟鐢ㄤ緥
 * - 缂栨帓锛氬崗璋冨涓鍩熷璞″拰鏈嶅姟
 * - 浜嬪姟杈圭晫锛氬畾涔変簨鍔＄殑寮€濮嬪拰缁撴潫
 * - 浣跨敤 Result 绫诲瀷锛氱粺涓€閿欒澶勭悊
 * 
 * **鑱岃矗**锛?
 * - 楠岃瘉杈撳叆鍛戒护
 * - 浠庡潡 ID 鍒涘缓 Xiuyuan 鑱氬悎鏍?
 * - 閫氳繃 Repository 鎸佷箙鍖?
 * - 杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗?
 * 
 * **涓氬姟娴佺▼**锛?
 * 1. 楠岃瘉妯℃澘鏄惁瀛樺湪
 * 2. 鏋勫缓 CardFace锛堜粠 fieldMapping锛?
 * 3. 鍒涘缓 Xiuyuan 鑱氬悎鏍?
 * 4. 閫氳繃 Repository 鎸佷箙鍖?
 * 5. 杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗?
 */

import { Result, err, isErr, ok } from '@/types/result';
import { CreateXiuyuanFromBlocksCommand } from '../../commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { ClozeCardGenerator } from '@/core/xiuyuan/domain/services/ClozeCardGenerator';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';
import { isDefinitionTemplate, isDescriptorTemplate } from './shared/DescriptorTemplateStrategy';
import {
  finalizeXiuyuanCreationBatch,
  finalizeXiuyuanCreation,
  toXiuyuanCreationPayload,
  type XiuyuanCreationPayload,
} from './shared/FinalizeXiuyuanCreation';

export interface XiuyuanBatchCreationResult {
  payloads: XiuyuanCreationPayload[];
  createdCount: number;
  skippedCount: number;
  failedCount: number;
}

const logger = createLogger('CreateXiuyuanFromBlocksUseCase');

function isTemplateRule(value: unknown): value is ICardTemplate['cardRules'][number] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rule = value as Record<string, unknown>;
  return typeof rule.typeMarker === 'string'
    && Array.isArray(rule.frontFields)
    && rule.frontFields.every((field) => typeof field === 'string')
    && Array.isArray(rule.backFields)
    && rule.backFields.every((field) => typeof field === 'string');
}

function isCardTemplate(value: unknown): value is ICardTemplate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const template = value as Record<string, unknown>;
  return typeof template.id === 'string'
    && typeof template.name === 'string'
    && Array.isArray(template.fields)
    && Array.isArray(template.cardRules)
    && template.cardRules.every((rule) => isTemplateRule(rule));
}

function traceAutoCardCreation(event: string, payload: Record<string, unknown>): void {
  logger.debug('[AutoCardTrace]', { event, ...payload });
}

function summarizeTraceAttrs(attrs: Record<string, string> | null | undefined): Record<string, unknown> {
  const normalized = attrs ?? {};
  const xiuyuanId = String(normalized['custom-xiuyuan-id'] || '').trim();
  const legacyXiuyuanId = String(normalized['custom-fsrs-xiuyuan-id'] || '').trim();
  const cardType = String(normalized['custom-fsrs-card-type'] || '').trim();
  return {
    hasXiuyuanBinding: xiuyuanId.length > 0 || legacyXiuyuanId.length > 0,
    xiuyuanId: xiuyuanId || null,
    legacyXiuyuanId: legacyXiuyuanId || null,
    cardType: cardType || null,
    attrKeys: Object.keys(normalized).sort(),
  };
}

type PreparedXiuyuanCreation = {
  kind: 'new';
  xiuyuan: Xiuyuan;
  source?: string;
} | {
  kind: 'existing';
  payload: XiuyuanCreationPayload;
};

/**
 * 浠庡潡鍒涘缓 Xiuyuan 鐢ㄤ緥
 * 
 * @class CreateXiuyuanFromBlocksUseCase
 */
export class CreateXiuyuanFromBlocksUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;

  /**
   * 鏋勯€犲嚱鏁?
   * 
   * @param xiuyuanRepository - Xiuyuan 浠撳偍
   * @param templateRegistry - 妯℃澘娉ㄥ唽琛紙鐢ㄤ簬鑾峰彇妯℃澘锛?
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports: { siyuanApi: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.eventBus = ports.eventBus ?? new EventBus(false);
  }

  /**
   * 鎵ц鐢ㄤ緥
   * 
   * @param command - 鍒涘缓鍛戒护
   * @returns Result<XiuyuanCreationPayload> - 成功返回创建的 Xiuyuan 与卡片摘要，失败返回错误
   */
  async execute(command: CreateXiuyuanFromBlocksCommand): Promise<Result<XiuyuanCreationPayload>> {
    try {
      const preparedResult = await this.prepareCreation(command);
      if (isErr(preparedResult)) {
        return preparedResult as Result<XiuyuanCreationPayload>;
      }
      const prepared = preparedResult.value;
      if (prepared.kind === 'existing') {
        return ok(prepared.payload);
      }
      const { xiuyuan, source } = prepared;

      return finalizeXiuyuanCreation({
        xiuyuan,
        xiuyuanRepository: this.xiuyuanRepository,
        eventBus: this.eventBus,
        logger,
        source,
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(this.toError(error, 'CreateXiuyuanFromBlocksUseCase failed'));
    }
  }

  async executeBatch(commands: CreateXiuyuanFromBlocksCommand[]): Promise<Result<XiuyuanBatchCreationResult>> {
    try {
      const preparedItems: PreparedXiuyuanCreation[] = [];
      let skippedCount = 0;
      let failedCount = 0;
      for (const command of commands) {
        const preparedResult = await this.prepareCreation(command);
        if (isErr(preparedResult)) {
          failedCount += 1;
          logger.warn('Batch item failed during preparation:', {
            error: preparedResult.error,
            source: command.source ?? null,
            templateId: command.templateId,
            blockIds: command.blockIds,
          });
          continue;
        }
        if (preparedResult.value.kind === 'existing') {
          skippedCount += 1;
        }
        preparedItems.push(preparedResult.value);
      }

      const newItems = preparedItems.filter((item): item is Extract<PreparedXiuyuanCreation, { kind: 'new' }> => item.kind === 'new');
      const finalizedNewItems = await finalizeXiuyuanCreationBatch({
        items: newItems,
        xiuyuanRepository: this.xiuyuanRepository,
        eventBus: this.eventBus,
        logger,
      });
      if (isErr(finalizedNewItems)) {
        return finalizedNewItems;
      }

      let nextNewPayloadIndex = 0;
      const payloads = preparedItems.map((item) => {
        if (item.kind === 'existing') {
          return item.payload;
        }
        return finalizedNewItems.value[nextNewPayloadIndex++];
      });
      return ok({
        payloads,
        createdCount: newItems.length,
        skippedCount,
        failedCount,
      });
    } catch (error) {
      logger.error('Batch failed:', error);
      return err(this.toError(error, 'CreateXiuyuanFromBlocksUseCase batch failed'));
    }
  }

  private async prepareCreation(command: CreateXiuyuanFromBlocksCommand): Promise<Result<PreparedXiuyuanCreation>> {
    const duplicatePolicy = command.duplicatePolicy ?? 'error';

      // 1. 在任何副作用前先计算代表块与稳定 XiuyuanId
      let blockToCheck = command.blockIds[0];
      const descriptorTemplate = isDescriptorTemplate(command.templateId);
      const definitionTemplate = isDefinitionTemplate(command.templateId);
      
      if (descriptorTemplate && command.blockIds.length >= 2) {
        blockToCheck = command.blockIds[1];
        logger.debug(`Concept-descriptor template detected, checking descriptor block: ${blockToCheck}`);
      } else if (definitionTemplate && command.blockIds.length >= 1) {
        blockToCheck = command.blockIds[0];
        logger.debug(`Concept-definition template detected, checking definition block: ${blockToCheck}`);
      }
      logger.debug(`Checking block for existing Xiuyuan: ${blockToCheck}`);
      let representativeBlockId = command.blockIds[0];
      if (descriptorTemplate && command.blockIds.length >= 2) {
        representativeBlockId = command.blockIds[1];
        logger.debug(`Using descriptor block as representative: ${representativeBlockId}`);
      } else if (definitionTemplate && command.blockIds.length >= 1) {
        representativeBlockId = command.blockIds[0];
        logger.debug(`Using definition block as representative: ${representativeBlockId}`);
      }
      
      const xiuyuanIdResult = XiuyuanId.create(`xy_${representativeBlockId}`);
      if (isErr(xiuyuanIdResult)) {
        return err(this.toError(xiuyuanIdResult.error, 'Invalid Xiuyuan ID'));
      }
      traceAutoCardCreation('CreateXiuyuanFromBlocksUseCase.identity', {
        templateId: command.templateId,
        blockToCheck,
        representativeBlockId,
        computedXiuyuanId: xiuyuanIdResult.value.getValue(),
        blockIds: command.blockIds,
        isBidirectional: Boolean(command.isBidirectional),
        source: command.source ?? null,
        duplicatePolicy,
      });

      const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
      if (isErr(existingXiuyuanResult)) {
        return err(this.toError(existingXiuyuanResult.error, 'Failed to load existing Xiuyuan'));
      }

      const attrs = await this.siyuanApi.getBlockAttrs(blockToCheck);
      const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'] || '';
      traceAutoCardCreation('CreateXiuyuanFromBlocksUseCase.dedupCheck', {
        templateId: command.templateId,
        blockIds: command.blockIds,
        blockToCheck,
        representativeBlockId,
        computedXiuyuanId: xiuyuanIdResult.value.getValue(),
        isBidirectional: Boolean(command.isBidirectional),
        source: command.source ?? null,
        duplicatePolicy,
        attrs: summarizeTraceAttrs(attrs),
        existingXiuyuanId: existingXiuyuanId || null,
        existingByComputedId: Boolean(existingXiuyuanResult.value),
      });

      if (existingXiuyuanResult.value) {
        if (duplicatePolicy === 'reuse-existing') {
          traceAutoCardCreation('CreateXiuyuanFromBlocksUseCase.reuseExisting', {
            templateId: command.templateId,
            blockIds: command.blockIds,
            blockToCheck,
            representativeBlockId,
            computedXiuyuanId: xiuyuanIdResult.value.getValue(),
            source: command.source ?? null,
          });
          return ok({
            kind: 'existing',
            payload: toXiuyuanCreationPayload(existingXiuyuanResult.value),
          });
        }

        logger.info(`Xiuyuan already exists for representative block ${representativeBlockId}: ${xiuyuanIdResult.value.getValue()}`);
        return err(new Error('\u6b64\u5757\u5df2\u7ecf\u521b\u5efa\u8fc7\u95ea\u5361\uff0c\u8bf7\u5148\u53d6\u6d88\u73b0\u6709\u95ea\u5361\u518d\u91cd\u65b0\u521b\u5efa'));
      }

      if (existingXiuyuanId && duplicatePolicy === 'error') {
        logger.info(`Block ${blockToCheck} already has Xiuyuan attrs binding: ${existingXiuyuanId}`);
        return err(new Error('\u6b64\u5757\u5df2\u7ecf\u521b\u5efa\u8fc7\u95ea\u5361\uff0c\u8bf7\u5148\u53d6\u6d88\u73b0\u6709\u95ea\u5361\u518d\u91cd\u65b0\u521b\u5efa'));
      }

      // 2. 楠岃瘉妯℃澘锛堜紭鍏堜娇鐢ㄨ嚜瀹氫箟妯＄増锛?
      let template = isCardTemplate(command.template)
        ? command.template
        : this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }

      // 馃啎 澶勭悊鍙屽悜鍗＄墖锛氬姩鎬佺敓鎴?cardRules
      if (command.isBidirectional && command.templateId === 'builtin-quick-card') {
        logger.debug('Creating bidirectional card, adding reverse rule');
        template = {
          ...template,
          cardRules: [
            {
              typeMarker: 'forward',
              frontFields: ['content'],
              backFields: ['content'],
            },
            {
              typeMarker: 'reverse',
              frontFields: ['content'],
              backFields: ['content'],
            },
          ],
        };
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }

      const blockIds: BlockId[] = [];
      for (const blockId of command.blockIds) {
        const blockIdResult = BlockId.create(blockId);
        if (isErr(blockIdResult)) {
          return err(this.toError(blockIdResult.error, 'Invalid block ID'));
        }
        blockIds.push(blockIdResult.value);
      }

      const templateIdResult = TemplateId.create(command.templateId);
      if (isErr(templateIdResult)) {
        return err(this.toError(templateIdResult.error, 'Invalid template ID'));
      }

      const priorityResult = Priority.create(command.priority || 50);
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 4. 鏋勫缓 CardFace锛堜粠 fieldMapping 鍜屾ā鏉匡級
      const faces: CardFace[] = [];
      const fieldMapping = command.fieldMapping || {};

      // 馃啎 澶勭悊澶氬～绌哄崱鐗囷紙浣跨敤棰嗗煙鏈嶅姟锛?
      if (command.clozeInfo && command.clozeInfo.clozes.length > 0) {
        const facesResult = ClozeCardGenerator.generateFaces(
          command.clozeInfo.originalContent,
          command.clozeInfo.clozes,
          command.blockIds[0]
        );
        
        if (isErr(facesResult)) {
          return err(this.toError(facesResult.error, 'Failed to generate cloze faces'));
        }
        
        faces.push(...facesResult.value);
      }
      // 馃啎 澶勭悊鑳岄潰鎸栫┖鍗＄墖
      else if (command.backClozeInfo && command.backClozeInfo.clozes.length > 0) {
        const { front, back, clozes, direction } = command.backClozeInfo;
        const blockId = command.blockIds[0];
        
        logger.debug('Creating back cloze faces:', {
          direction,
          clozeCount: clozes.length
        });
        
        // 姝ｅ悜鍗＄墖锛氫负姣忎釜鎸栫┖鐢熸垚涓€涓?face
        if (direction === 'forward' || direction === 'both') {
          for (let i = 0; i < clozes.length; i++) {
            const faceResult = CardFace.create({
              question: front,
              answer: back,
              questionBlockId: blockId,
              answerBlockId: blockId,
            });
            
            if (isErr(faceResult)) {
              return err(this.toError(faceResult.error, 'Failed to create forward cloze face'));
            }
            
            faces.push(faceResult.value);
          }
        }
        
        // 鍙嶅悜鍗＄墖锛氬彧鐢熸垚涓€涓?face锛屼笉鎸栫┖
        if (direction === 'backward' || direction === 'both') {
          const faceResult = CardFace.create({
            question: back,   // 鍘熷鑳岄潰锛堝畬鏁存樉绀猴級
            answer: front,    // 鍘熷姝ｉ潰
            questionBlockId: blockId,
            answerBlockId: blockId,
          });
          
          if (isErr(faceResult)) {
            return err(this.toError(faceResult.error, 'Failed to create reverse cloze face'));
          }
          
          faces.push(faceResult.value);
        }
      }
      // 馃啎 澶勭悊鍙屽悜鍗＄墖锛氫袱涓?face 浣跨敤鐩稿悓鐨勫潡鍐呭
      else if (command.isBidirectional && command.templateId === 'builtin-quick-card') {
        logger.debug('Creating bidirectional faces');
        
        const blockId = command.blockIds[0];
        const blockText = await this.siyuanApi.getBlockText(blockId);
        
        // 姝ｅ悜 face
        const forwardFaceResult = CardFace.create({
          question: blockText || `Block ${blockId}`,
          answer: blockText || `Block ${blockId}`,
          questionBlockId: blockId,
          answerBlockId: blockId
        });
        
        if (isErr(forwardFaceResult)) {
          return err(this.toError(forwardFaceResult.error, 'Failed to create bidirectional forward face'));
        }
        
        // 鍙嶅悜 face
        const reverseFaceResult = CardFace.create({
          question: blockText || `Block ${blockId}`,
          answer: blockText || `Block ${blockId}`,
          questionBlockId: blockId,
          answerBlockId: blockId
        });
        
        if (isErr(reverseFaceResult)) {
          return err(this.toError(reverseFaceResult.error, 'Failed to create bidirectional reverse face'));
        }
        
        faces.push(forwardFaceResult.value, reverseFaceResult.value);
      } 
      else {
        // 鏅€氬崱鐗囷細浣跨敤鍘熸湁閫昏緫
        for (const rule of template.cardRules) {
          // 鑾峰彇闂鍜岀瓟妗堢殑鍧?ID
          const questionBlockId = rule.frontFields.length > 0 
            ? fieldMapping[rule.frontFields[0]] || command.blockIds[0]
            : command.blockIds[0];
          
          const answerBlockId = rule.backFields.length > 0
            ? fieldMapping[rule.backFields[0]] || command.blockIds[command.blockIds.length - 1]
            : command.blockIds[command.blockIds.length - 1];

          // 鑾峰彇鍧楀唴瀹?
          const questionText = await this.siyuanApi.getBlockText(questionBlockId);
          const answerText = await this.siyuanApi.getBlockText(answerBlockId);

          const faceResult = CardFace.create({
            question: questionText || `Block ${questionBlockId}`,
            answer: answerText || `Block ${answerBlockId}`,
            questionBlockId,
            answerBlockId
          });

          if (isErr(faceResult)) {
            return err(this.toError(faceResult.error, 'Failed to create face from template rule'));
          }

          faces.push(faceResult.value);
        }
      }

      // 5. 鍒涘缓 Xiuyuan 鑱氬悎鏍?
      const xiuyuanResult = Xiuyuan.create({
        id: xiuyuanIdResult.value,
        blockIDs: blockIds,
        templateID: templateIdResult.value,
        faces,
        priority,
        meta: {
          schedulerType: 'fsrs-v6',
          fieldMapping,
          cardType: command.cardType,  // 馃啎 浼犻€掑崱鐗囩被鍨?
          ...(command.clozeRenderMode ? { clozeRenderMode: command.clozeRenderMode } : {}),
          ...(command.source ? { source: command.source } : {}),
          ...(command.renderProfile ? { renderProfile: command.renderProfile } : {}),
          ...(command.creationRuleId ? { creationRuleId: command.creationRuleId } : {}),
          ...(command.creationMode ? { creationMode: command.creationMode } : {}),
        }
      });

      if (isErr(xiuyuanResult)) {
        return err(this.toError(xiuyuanResult.error, 'Failed to create Xiuyuan aggregate'));
      }

      const xiuyuan = xiuyuanResult.value;

      return ok({
        kind: 'new',
        xiuyuan,
        source: command.source,
      });
  }

  private toError(error: unknown, defaultMessage: string): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string' && error.length > 0) {
      return new Error(error);
    }
    return new Error(defaultMessage);
  }
}

