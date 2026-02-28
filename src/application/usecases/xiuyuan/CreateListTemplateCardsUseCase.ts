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

import { Result, err, ok } from '@/types/result';
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

type ListTemplateChildData = {
  id: string;
  cue: string;
  answer: string;
  content: string;
  index: number;
};

export interface ListTemplateCardsCreationPayload {
  mode: 'split-v2';
  parentBlockId: string;
  parentParagraphId: string;
  totalChildren: number;
  created: Array<{
    childBlockId: string;
    xiuyuanId: string;
    cardIds: string[];
  }>;
  skippedChildBlockIds: string[];
}

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
   * @returns Result<ListTemplateCardsCreationPayload> - 成功返回批量创建结果，失败返回错误
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
  async execute(command: CreateListTemplateCardsCommand): Promise<Result<ListTemplateCardsCreationPayload>> {
    try {
      // 1. Protect old model (single Xiuyuan on parent) from mixed mode creation.
      const parentAttrs = await this.siyuanApi.getBlockAttrs(command.parentBlockId);
      if (parentAttrs && (parentAttrs['custom-xiuyuan-id'] || parentAttrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = parentAttrs['custom-xiuyuan-id'] || parentAttrs['custom-fsrs-xiuyuan-id'];
        logger.info(`Parent block ${command.parentBlockId} already has legacy Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('Legacy list-template card already exists on parent block; split-v2 creation aborted'));
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
      
      const childrenRows = childrenContentResult as ChildContentRow[];
      const childRowMap = new Map(childrenRows.map((row) => [row.id, row]));
      const childrenData: ListTemplateChildData[] = [];
      for (let index = 0; index < command.childBlockIds.length; index++) {
        const childBlockId = command.childBlockIds[index];
        const row = childRowMap.get(childBlockId);
        if (!row) {
          return err(new Error(`Failed to fetch child content for block: ${childBlockId}`));
        }
        const parsed = parseCueAndAnswer(row.content);
        childrenData.push({
          id: row.id,
          cue: parsed.cue,
          answer: parsed.answer,
          content: row.content,
          index,
        });
      }

      const templateIdResult = TemplateId.create(command.templateId);
      if (!templateIdResult.ok) {
        return err(this.toError(templateIdResult.error, 'Invalid template ID'));
      }

      const priorityResult = Priority.create(command.priority || 50);
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();
      const groupId = `lt_${command.parentBlockId}`;
      const created: ListTemplateCardsCreationPayload['created'] = [];
      const skippedChildBlockIds: string[] = [];

      // 6. Create one independent Xiuyuan for each child block.
      for (const childData of childrenData) {
        const childAttrs = await this.siyuanApi.getBlockAttrs(childData.id);
        const existingChildXiuyuanId = childAttrs['custom-xiuyuan-id'] || childAttrs['custom-fsrs-xiuyuan-id'];
        if (existingChildXiuyuanId) {
          skippedChildBlockIds.push(childData.id);
          continue;
        }

        const xiuyuanIdResult = XiuyuanId.create(`xy_${childData.id}`);
        if (!xiuyuanIdResult.ok) {
          return err(this.toError(xiuyuanIdResult.error, 'Invalid Xiuyuan ID'));
        }

        const blockIdResults = [childData.id, parentParagraphId].map((id) => BlockId.create(id));
        const failedBlockId = blockIdResults.find((result) => !result.ok);
        if (failedBlockId && !failedBlockId.ok) {
          return err(this.toError(failedBlockId.error, 'Invalid block ID'));
        }
        const blockIds = blockIdResults.map((result) => result.value);

        const faceResult = CardFace.create({
          question: parentParagraphId,
          answer: childData.content,
          questionBlockId: parentParagraphId,
          answerBlockId: childData.id,
        });
        if (!faceResult.ok) {
          return err(this.toError(faceResult.error, 'Failed to create list-template face'));
        }

        const xiuyuanResult = Xiuyuan.create({
          id: xiuyuanIdResult.value,
          blockIDs: blockIds,
          templateID: templateIdResult.value,
          faces: [faceResult.value],
          priority,
          meta: {
            schedulerType: 'fsrs-v6',
            listTemplate: {
              mode: 'split-v2',
              groupId,
              parentBlockId: command.parentBlockId,
              parentParagraphId,
              currentIndex: childData.index,
              childrenData: childrenData.map((child) => ({
                id: child.id,
                cue: child.cue,
                answer: child.answer,
                index: child.index,
              })),
            },
          },
        });
        if (!xiuyuanResult.ok) {
          return err(this.toError(xiuyuanResult.error, 'Failed to create Xiuyuan aggregate'));
        }

        const xiuyuan = xiuyuanResult.value;
        const creationResult = await finalizeXiuyuanCreation({
          xiuyuan,
          xiuyuanRepository: this.xiuyuanRepository,
          logger,
          siyuanApi: this.siyuanApi,
          riff: {
            deckId: command.deckId,
            blockIds: [childData.id],
            source: 'list-template-creation',
            context: {
              blockId: childData.id,
              representativeBlockId: childData.id,
              parentBlockId: command.parentBlockId,
              parentParagraphId,
              currentIndex: childData.index,
            },
          },
        });

        if (!creationResult.ok) {
          return err(this.toError(creationResult.error, 'Failed to finalize split list-template Xiuyuan'));
        }

        created.push({
          childBlockId: childData.id,
          xiuyuanId: creationResult.value.xiuyuan.id,
          cardIds: creationResult.value.cards.map((card) => card.id),
        });
      }

      return ok({
        mode: 'split-v2',
        parentBlockId: command.parentBlockId,
        parentParagraphId,
        totalChildren: childrenData.length,
        created,
        skippedChildBlockIds,
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(this.toError(error, 'CreateListTemplateCardsUseCase failed'));
    }
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



