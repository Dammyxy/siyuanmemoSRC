/**
 * CreateListTemplateCardsUseCase - 鍒涘缓鍒楄〃妯℃澘鍗＄墖鐢ㄤ緥
 * 
 * @description
 * 缂栨帓鍒楄〃妯℃澘鍗＄墖鍒涘缓鐨勪笟鍔℃祦绋嬨€?
 * 
 * **璁捐鍘熷垯**锛?
 * - 鐢ㄤ緥妯″紡锛氬皝瑁呭崟涓€涓氬姟鐢ㄤ緥
 * - 缂栨帓锛氬崗璋冨涓鍩熷璞″拰鏈嶅姟
 * - 浜嬪姟杈圭晫锛氬畾涔変簨鍔＄殑寮€濮嬪拰缁撴潫
 * - 浣跨敤 Result 绫诲瀷锛氱粺涓€閿欒澶勭悊
 * 
 * **鑱岃矗**锛?
 * - 楠岃瘉杈撳叆鍛戒护
 * - 鍒涘缓鍒楄〃妯℃澘鐨?Xiuyuan 鍜屽崱鐗?
 * - 閫氳繃 Repository 鎸佷箙鍖?
 * - 杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗?
 * 
 * **鍒楄〃妯℃澘鐗圭偣**锛?
 * - 1 涓?Xiuyuan 鈫?N 寮?FSRSCard锛圢 = 瀛愬垪琛ㄩ」鏁伴噺锛?
 * - 姣忓紶鍗＄墖鐨勯棶棰樼浉鍚岋紙鐖跺垪琛ㄩ」锛夛紝绛旀涓嶅悓锛堝悇涓瓙鍒楄〃椤癸級
 * - 鏀寔鎻愮ず鍔熻兘锛氫娇鐢?`鈫抈 鍒嗛殧鎻愮ず鍜岀瓟妗?
 * - 娓愯繘寮忔樉绀猴細澶嶄範鏃舵樉绀哄凡瀛﹁繃鐨勭瓟妗?+ 褰撳墠鎻愮ず
 * 
 * **涓氬姟娴佺▼**锛?
 * 1. 楠岃瘉 CreateListTemplateCardsCommand
 * 2. 鑾峰彇鐖跺潡鍜屽瓙鍧楃殑鍐呭
 * 3. 鍒涘缓 Xiuyuan 鑱氬悎鏍?
 * 4. 涓烘瘡涓瓙鍧楀垱寤哄崱鐗?
 * 5. 鎸佷箙鍖?Xiuyuan
 * 6. 杩斿洖鍒涘缓鐨?Xiuyuan 鍜屽崱鐗?
 */

import { Result, err } from '@/types/result';
import { CreateListTemplateCardsCommand } from '../../commands/xiuyuan/CreateListTemplateCardsCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { createLogger } from '@/utils/logger';
import {
  finalizeXiuyuanCreation,
  type XiuyuanCreationPayload,
} from './shared/FinalizeXiuyuanCreation';

const logger = createLogger('CreateListTemplateCardsUseCase');

/**
 * 瑙ｆ瀽瀛愬垪琛ㄩ」鏂囨湰锛屾彁鍙栨彁绀哄拰绛旀
 * 
 * 鏍煎紡锛歚鎻愮ず 鈫?绛旀`
 * 
 * @param text 瀛愬垪琛ㄩ」鏂囨湰
 * @returns { cue: 鎻愮ず鏂囨湰, answer: 绛旀鏂囨湰 }
 */
function parseCueAndAnswer(text: string): { cue: string; answer: string } {
  const unicodeArrow = '\u2192';
  const delimiter = text.includes(unicodeArrow) ? unicodeArrow : '->';
  const parts = text.split(delimiter);

  if (parts.length >= 2) {
    const cue = parts[0].trim();
    const answer = parts.slice(1).join(delimiter).trim();
    return { cue, answer };
  }

  return { cue: '', answer: text.trim() };
}

type ChildContentRow = {
  id: string;
  content: string;
};

/**
 * 鍒涘缓鍒楄〃妯℃澘鍗＄墖鐢ㄤ緥
 * 
 * @class CreateListTemplateCardsUseCase
 */
export class CreateListTemplateCardsUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;

  /**
   * 鏋勯€犲嚱鏁?
   * 
   * @param xiuyuanRepository - Xiuyuan 浠撳偍
   * @param templateRegistry - 妯℃澘娉ㄥ唽琛?
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports?: { siyuanApi?: XiuyuanSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new XiuyuanSiyuanAdapter();
  }

  /**
   * 鎵ц鐢ㄤ緥
   * 
   * @param command - 鍒涘缓鍛戒护
   * @returns Result<XiuyuanCreationPayload> - 成功返回创建的 Xiuyuan 与卡片摘要，失败返回错误
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
  async execute(command: CreateListTemplateCardsCommand): Promise<Result<XiuyuanCreationPayload>> {
    try {
      // 1. 妫€鏌ユ槸鍚﹀凡缁忓垱寤鸿繃鍒楄〃妯＄増鍗?
      const attrs = await this.siyuanApi.getBlockAttrs(command.parentBlockId);
      
      if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        logger.info(`Block ${command.parentBlockId} already has Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('List template card already exists for this parent block'));
      }
      
      // 2. 楠岃瘉妯℃澘
      const template = this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }

      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }
      
      // 3. 楠岃瘉瀛愬垪琛ㄩ」鏁伴噺锛堣嚦灏戦渶瑕?涓級
      if (!command.childBlockIds || command.childBlockIds.length < 2) {
        return err(
          new Error(`At least 2 ordered child list items are required (current: ${command.childBlockIds?.length || 0})`)
        );
      }

      // 4. 鑾峰彇鐖跺垪琛ㄩ」鐨勬钀藉潡 ID锛堢敤浜庨棶棰樻樉绀猴級
      // 鎬濇簮缁撴瀯锛氬垪琛ㄩ」(i) 鈫?娈佃惤(p) + 鍒楄〃瀹瑰櫒(l)
      const paragraphResult = await this.siyuanApi.sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${command.parentBlockId}'
        AND type = 'p'
        LIMIT 1
      `);
      
      if (!paragraphResult || paragraphResult.length === 0) {
        return err(new Error('Parent list item has no paragraph block'));
      }
      
      const parentParagraphId = paragraphResult[0].id;

      // 5. 鑾峰彇鎵€鏈夊瓙鍒楄〃椤圭殑鏂囨湰鍐呭
      const childrenContentResult = await this.siyuanApi.sql(`
        SELECT id, content FROM blocks
        WHERE id IN (${command.childBlockIds.map(id => `'${id}'`).join(',')})
        ORDER BY id ASC
      `);
      
      if (!childrenContentResult || childrenContentResult.length === 0) {
        return err(new Error('Failed to fetch children content'));
      }
      
      // 瑙ｆ瀽姣忎釜瀛愬垪琛ㄩ」鐨勬彁绀哄拰绛旀
      const childrenData = (childrenContentResult as ChildContentRow[]).map((row) => ({
        id: row.id,
        cue: parseCueAndAnswer(row.content).cue,
        answer: parseCueAndAnswer(row.content).answer,
        content: row.content
      }));

      // 6. 鍒涘缓鍊煎璞?
      // 馃敡 缁熶竴 ID 鏍煎紡锛氫娇鐢ㄤ唬琛ㄥ潡 ID锛堢埗鍒楄〃椤癸級
      const representativeBlockId = command.parentBlockId;
      const xiuyuanIdResult = XiuyuanId.create(`xy_${representativeBlockId}`);
      if (!xiuyuanIdResult.ok) {
        return err(this.toError(xiuyuanIdResult.error, 'Invalid Xiuyuan ID'));
      }

      const allBlockIds = [parentParagraphId, ...command.childBlockIds];
      const blockIdResults = allBlockIds.map(id => BlockId.create(id));
      const failedBlockId = blockIdResults.find(r => !r.ok);
      if (failedBlockId && !failedBlockId.ok) {
        return err(this.toError(failedBlockId.error, 'Invalid block ID'));
      }
      const blockIds = blockIdResults.map((r) => r.value);

      const templateIdResult = TemplateId.create(command.templateId);
      if (!templateIdResult.ok) {
        return err(this.toError(templateIdResult.error, 'Invalid template ID'));
      }

      const priorityResult = Priority.create(command.priority || 50);
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 7. 涓烘瘡涓瓙鍒楄〃椤瑰垱寤?CardFace
      const faces: CardFace[] = [];
      
      for (const childData of childrenData) {
        const faceResult = CardFace.create({
          question: parentParagraphId, // 闂鏄埗娈佃惤
          answer: childData.content,   // 绛旀鏄瓙鍒楄〃椤瑰唴瀹?
          questionBlockId: parentParagraphId,
          answerBlockId: childData.id
        });

        if (!faceResult.ok) {
          return err(this.toError(faceResult.error, 'Failed to create list-template face'));
        }

        faces.push(faceResult.value);
      }

      // 8. 鍒涘缓 Xiuyuan 鑱氬悎鏍癸紙鍖呭惈鍒楄〃妯℃澘鐨勫厓鏁版嵁锛?
      const xiuyuanResult = Xiuyuan.create({
        id: xiuyuanIdResult.value,
        blockIDs: blockIds,
        templateID: templateIdResult.value,
        faces,
        priority,
        meta: {
          schedulerType: 'fsrs-v6',
          // 鍒楄〃妯℃澘鐗规湁鐨勫厓鏁版嵁
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
        return err(this.toError(xiuyuanResult.error, 'Failed to create Xiuyuan aggregate'));
      }

      const xiuyuan = xiuyuanResult.value;

      return finalizeXiuyuanCreation({
        xiuyuan,
        xiuyuanRepository: this.xiuyuanRepository,
        logger,
        siyuanApi: this.siyuanApi,
        riff: {
          deckId: command.deckId,
          blockIds: [parentParagraphId],
          source: 'list-template-creation',
          context: {
            blockId: parentParagraphId,
            representativeBlockId,
          },
        },
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(this.toError(error, 'CreateListTemplateCardsUseCase failed'));
    }
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string' && error.length > 0) {
      return new Error(error);
    }
    return new Error(fallbackMessage);
  }
}



