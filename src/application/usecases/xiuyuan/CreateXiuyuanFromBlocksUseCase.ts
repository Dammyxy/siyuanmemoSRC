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
 * 4. 娣诲姞鍒?Riff锛堝彲閫夛級
 * 5. 閫氳繃 Repository 鎸佷箙鍖?
 * 6. 杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗?
 */

import { Result, err } from '@/types/result';
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
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';
import { isDefinitionTemplate, isDescriptorTemplate } from './shared/DescriptorTemplateStrategy';
import { finalizeXiuyuanCreation } from './shared/FinalizeXiuyuanCreation';

const logger = createLogger('CreateXiuyuanFromBlocksUseCase');

/**
 * 浠庡潡鍒涘缓 Xiuyuan 鐢ㄤ緥
 * 
 * @class CreateXiuyuanFromBlocksUseCase
 */
export class CreateXiuyuanFromBlocksUseCase {
  /**
   * 鏋勯€犲嚱鏁?
   * 
   * @param xiuyuanRepository - Xiuyuan 浠撳偍
   * @param templateRegistry - 妯℃澘娉ㄥ唽琛紙鐢ㄤ簬鑾峰彇妯℃澘锛?
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>
  ) {}

  /**
   * 鎵ц鐢ㄤ緥
   * 
   * @param command - 鍒涘缓鍛戒护
   * @returns Result<any> - 鎴愬姛杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗囷紝澶辫触杩斿洖閿欒
   */
  async execute(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
    try {
      // 1. 妫€鏌ユ槸鍚﹀凡缁忓垱寤鸿繃 Xiuyuan 鍗＄墖
      const { getBlockAttrs } = await import('@/core/siyuan/api');
      
      // 馃啎 瀵逛簬 concept-descriptor 妯℃澘锛屾鏌ョ浜屼釜鍧楋紙鎻忚堪绗﹀潡锛?
      // 鍥犱负姒傚康鍗℃湰韬彲浠ユ湁鑷繁鐨?Xiuyuan锛屾弿杩扮鍗℃槸鍏宠仈鍒版蹇靛崱鐨?
      // 
      // 馃啎 瀵逛簬 concept-definition 妯℃澘锛屾鏌ョ涓€涓潡锛堝畾涔夊潡锛?
      // 鍥犱负姒傚康鍧楀彲浠ユ湁鑷繁鐨?Xiuyuan锛屽畾涔夊潡涓烘蹇垫彁渚涘畾涔?
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
      
      const attrs = await getBlockAttrs(blockToCheck);
      
      if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        logger.info(`Block ${blockToCheck} already has Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('姝ゅ潡宸茬粡鍒涘缓杩囦慨缂樺崱鐗囷紝璇峰嬁閲嶅鍒涘缓'));
      }
      
      // 2. 楠岃瘉妯℃澘锛堜紭鍏堜娇鐢ㄨ嚜瀹氫箟妯＄増锛?
      let template = command.template || this.templateRegistry.get(command.templateId);
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

      // 3. 鍒涘缓鍊煎璞?
      // 馃敡 缁熶竴 ID 鏍煎紡锛氫娇鐢ㄤ唬琛ㄥ潡 ID锛堢涓€涓潡锛?
      // 馃啎 瀵逛簬鎻忚堪绗︽ā鏉匡紝浣跨敤鎻忚堪绗﹀潡锛堢浜屼釜鍧楋級浣滀负浠ｈ〃鍧?
      // 馃啎 瀵逛簬瀹氫箟妯℃澘锛屼娇鐢ㄥ畾涔夊潡锛堢涓€涓潡锛変綔涓轰唬琛ㄥ潡
      let representativeBlockId = command.blockIds[0];
      if (descriptorTemplate && command.blockIds.length >= 2) {
        representativeBlockId = command.blockIds[1];
        logger.debug(`Using descriptor block as representative: ${representativeBlockId}`);
      } else if (definitionTemplate && command.blockIds.length >= 1) {
        representativeBlockId = command.blockIds[0];
        logger.debug(`Using definition block as representative: ${representativeBlockId}`);
      }
      
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
        
        if (!facesResult.ok) {
          return facesResult as Result<any>;
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
        
        // 鍙嶅悜鍗＄墖锛氬彧鐢熸垚涓€涓?face锛屼笉鎸栫┖
        if (direction === 'backward' || direction === 'both') {
          const faceResult = CardFace.create({
            question: back,   // 鍘熷鑳岄潰锛堝畬鏁存樉绀猴級
            answer: front,    // 鍘熷姝ｉ潰
            questionBlockId: blockId,
            answerBlockId: blockId,
            metadata: {
              clozeIndex: -1,  // -1 琛ㄧず涓嶆寲绌?
              direction: 'reverse'
            }
          });
          
          if (!faceResult.ok) {
            return faceResult as Result<any>;
          }
          
          faces.push(faceResult.value);
        }
      }
      // 馃啎 澶勭悊鍙屽悜鍗＄墖锛氫袱涓?face 浣跨敤鐩稿悓鐨勫潡鍐呭
      else if (command.isBidirectional && command.templateId === 'builtin-quick-card') {
        logger.debug('Creating bidirectional faces');
        
        const blockId = command.blockIds[0];
        const blockText = await getBlockText(blockId);
        
        // 姝ｅ悜 face
        const forwardFaceResult = CardFace.create({
          question: blockText || `Block ${blockId}`,
          answer: blockText || `Block ${blockId}`,
          questionBlockId: blockId,
          answerBlockId: blockId
        });
        
        if (!forwardFaceResult.ok) {
          return forwardFaceResult as Result<any>;
        }
        
        // 鍙嶅悜 face
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
          cardType: command.cardType  // 馃啎 浼犻€掑崱鐗囩被鍨?
        }
      });

      if (!xiuyuanResult.ok) {
        return xiuyuanResult as Result<any>;
      }

      const xiuyuan = xiuyuanResult.value;

      let blockIdToAddToRiff = representativeBlockId;
      if (descriptorTemplate && command.blockIds.length >= 2) {
        blockIdToAddToRiff = command.blockIds[1];
        logger.debug('Concept-descriptor template, adding descriptor block to Riff:', blockIdToAddToRiff);
      }

      return finalizeXiuyuanCreation({
        xiuyuan,
        xiuyuanRepository: this.xiuyuanRepository,
        logger,
        riff: {
          deckId: command.deckId,
          blockIds: [blockIdToAddToRiff],
          source: 'template-creation',
          context: {
            blockId: blockIdToAddToRiff,
          },
        },
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(error as Error);
    }
  }
}

